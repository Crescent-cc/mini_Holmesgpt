import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { CodeReference, RagDiagnosticFixture, SpringRoute } from "../tools/rag/fixtures.ts";

export type BuildJavaRepoFixtureOptions = {
  repoRoot: string;
  id: string;
  name: string;
};

type FrontendApiCall = {
  method: string;
  path: string;
  source: string;
  line: number;
  snippet: string;
};

const SPRING_MAPPING_METHODS: Record<string, string> = {
  GetMapping: "GET",
  PostMapping: "POST",
  PutMapping: "PUT",
  DeleteMapping: "DELETE",
  PatchMapping: "PATCH",
};

export async function buildJavaRepoFixture(
  options: BuildJavaRepoFixtureOptions,
): Promise<RagDiagnosticFixture> {
  const files = await listFiles(options.repoRoot);
  const springRoutes = await extractSpringRoutes(options.repoRoot, files);
  const frontendCalls = await extractFrontendApiCalls(options.repoRoot, files);
  const codeReferences: CodeReference[] = [
    ...frontendCalls.map(frontendCallToCodeReference),
    ...buildRouteContractReferences(frontendCalls, springRoutes),
    ...await extractRagPromptReferences(options.repoRoot, files),
    ...await extractRagConfigReferences(options.repoRoot, files),
  ];

  return {
    id: options.id,
    name: options.name,
    springRoutes,
    codeReferences,
  };
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      if ([".git", "node_modules", "build", "dist", ".gradle"].includes(entry.name)) {
        continue;
      }
      files.push(...await listFiles(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
}

async function extractSpringRoutes(root: string, files: string[]): Promise<SpringRoute[]> {
  const routes: SpringRoute[] = [];
  const javaFiles = files.filter((file) => file.endsWith(".java"));

  for (const file of javaFiles) {
    const content = await readFile(file, "utf8");
    const lines = content.split(/\r?\n/);
    const className = findClassName(lines) ?? stripExtension(file.split(sep).at(-1) ?? "Unknown");
    const classPrefix = findClassRequestPrefix(lines);

    for (let index = 0; index < lines.length; index += 1) {
      const annotation = parseSpringMapping(lines[index] ?? "");
      if (!annotation || annotation.isClassLevel) {
        continue;
      }

      const methodName = findNextJavaMethodName(lines, index + 1);
      if (!methodName) {
        continue;
      }

      routes.push({
        method: annotation.method,
        path: joinRoutePaths(classPrefix, annotation.path),
        handler: `${className}.${methodName}`,
        source: `${toRelative(root, file)}:${index + 1}`,
      });
    }
  }

  return routes;
}

function findClassName(lines: string[]): string | null {
  for (const line of lines) {
    const match = line.match(/\bclass\s+([A-Za-z0-9_]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function findClassRequestPrefix(lines: string[]): string {
  for (let index = 0; index < lines.length; index += 1) {
    const annotation = parseSpringMapping(lines[index] ?? "");
    if (annotation?.isClassLevel) {
      return annotation.path;
    }
    if (/\bclass\s+/.test(lines[index] ?? "")) {
      return "";
    }
  }
  return "";
}

function parseSpringMapping(line: string): { method: string; path: string; isClassLevel: boolean } | null {
  const requestMapping = line.match(/@RequestMapping\s*\((.*)\)/);
  if (requestMapping) {
    return {
      method: "ANY",
      path: extractAnnotationPath(requestMapping[1] ?? ""),
      isClassLevel: true,
    };
  }

  for (const [annotationName, httpMethod] of Object.entries(SPRING_MAPPING_METHODS)) {
    const match = line.match(new RegExp(`@${annotationName}\\s*(?:\\((.*)\\))?`));
    if (match) {
      return {
        method: httpMethod,
        path: extractAnnotationPath(match[1] ?? ""),
        isClassLevel: false,
      };
    }
  }

  return null;
}

function extractAnnotationPath(args: string): string {
  const valueMatch = args.match(/\b(?:value|path)\s*=\s*"([^"]+)"/);
  if (valueMatch?.[1]) {
    return valueMatch[1];
  }
  const directMatch = args.match(/"([^"]+)"/);
  return directMatch?.[1] ?? "";
}

function findNextJavaMethodName(lines: string[], startIndex: number): string | null {
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 8); index += 1) {
    const line = (lines[index] ?? "").trim();
    if (!/^(?:public|private|protected)\s+/.test(line) || /\brecord\s+/.test(line)) {
      continue;
    }
    const match = line.match(/^(?:public|private|protected)\s+(?:[\w.<>\[\], ?]+\s+)+([A-Za-z0-9_]+)\s*\(/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

async function extractFrontendApiCalls(root: string, files: string[]): Promise<FrontendApiCall[]> {
  const calls: FrontendApiCall[] = [];
  const apiFiles = files.filter((file) =>
    file.endsWith(".ts")
    && normalizePath(relative(root, file)).includes("frontend/src/api/")
  );

  for (const file of apiFiles) {
    const content = await readFile(file, "utf8");
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const requestCall = parseRequestCall(line);
      if (requestCall) {
        calls.push({
          ...requestCall,
          source: toRelative(root, file),
          line: index + 1,
          snippet: line.trim(),
        });
        continue;
      }

      const fetchCall = parseFetchCall(lines, index);
      if (fetchCall) {
        calls.push({
          ...fetchCall,
          source: toRelative(root, file),
          line: index + 1,
          snippet: line.trim(),
        });
      }
    }
  }

  return calls;
}

function parseRequestCall(line: string): Pick<FrontendApiCall, "method" | "path"> | null {
  const match = line.match(/\brequest\.(get|post|put|patch|delete|upload)\s*<[^>]*>?\s*\(([`'"])(.*?)\2/)
    ?? line.match(/\brequest\.(get|post|put|patch|delete|upload)\s*\(([`'"])(.*?)\2/);
  if (!match?.[1] || !match[3]) {
    return null;
  }
  const method = match[1] === "upload" ? "POST" : match[1].toUpperCase();
  return { method, path: normalizeFrontendPath(match[3]) };
}

function parseFetchCall(lines: string[], index: number): Pick<FrontendApiCall, "method" | "path"> | null {
  const line = lines[index] ?? "";
  const match = line.match(/\b(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(([`'"])(.*?)\1/);
  if (!match?.[2]) {
    return null;
  }
  const axiosMethod = line.match(/\baxios\.(get|post|put|patch|delete)\s*\(/)?.[1]?.toUpperCase();
  return {
    method: axiosMethod ?? findFetchMethod(lines, index),
    path: normalizeFrontendPath(match[2]),
  };
}

function findFetchMethod(lines: string[], startIndex: number): string {
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 8); index += 1) {
    const match = (lines[index] ?? "").match(/\bmethod\s*:\s*["']([A-Za-z]+)["']/);
    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }
  return "GET";
}

function normalizeFrontendPath(rawPath: string): string {
  const withoutBase = rawPath.replace(/^\$\{[^}]+\}/, "").replace(/^https?:\/\/[^/]+/, "");
  const queryTemplateIndex = withoutBase.match(/\$\{[^}]*\?/)?.index;
  if (queryTemplateIndex !== undefined) {
    return withoutBase.slice(0, queryTemplateIndex);
  }
  const withoutQuery = withoutBase.split("?")[0] ?? withoutBase;
  return withoutQuery.replace(/\$\{([^}]+)\}/g, "{$1}");
}

function frontendCallToCodeReference(call: FrontendApiCall): CodeReference {
  return {
    path: call.source,
    line: call.line,
    symbol: `${call.method} ${call.path}`,
    snippet: `Frontend API call: ${call.method} ${call.path} | ${call.snippet}`,
  };
}

function buildRouteContractReferences(
  frontendCalls: FrontendApiCall[],
  springRoutes: SpringRoute[],
): CodeReference[] {
  return frontendCalls
    .filter((call) => !springRoutes.some((route) => routesEquivalent(call.method, call.path, route)))
    .map((call) => {
      const closest = findClosestRoute(call, springRoutes);
      const closestText = closest ? `; closest Spring route: ${closest.method} ${closest.path}` : "";
      return {
        path: call.source,
        line: call.line,
        symbol: `route_contract:${call.method} ${call.path}`,
        snippet: `No matching Spring route for ${call.method} ${call.path}${closestText}`,
      };
    });
}

function routesEquivalent(method: string, path: string, route: SpringRoute): boolean {
  return method === route.method && normalizeRouteForCompare(path) === normalizeRouteForCompare(route.path);
}

function findClosestRoute(call: FrontendApiCall, routes: SpringRoute[]): SpringRoute | null {
  const sameMethod = routes.filter((route) => route.method === call.method);
  const candidates = sameMethod.length > 0 ? sameMethod : routes;
  let best: SpringRoute | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const route of candidates) {
    const score = levenshtein(normalizeRouteForCompare(call.path), normalizeRouteForCompare(route.path));
    if (score < bestScore) {
      best = route;
      bestScore = score;
    }
  }

  return best;
}

async function extractRagPromptReferences(root: string, files: string[]): Promise<CodeReference[]> {
  const promptFiles = files.filter((file) =>
    normalizePath(relative(root, file)).includes("app/src/main/resources/prompts/")
    && file.endsWith(".st")
    && file.includes("knowledgebase-query")
  );
  const refs: CodeReference[] = [];

  for (const file of promptFiles) {
    const content = await readFile(file, "utf8");
    refs.push({
      path: toRelative(root, file),
      line: 1,
      symbol: "rag_prompt",
      snippet: `RAG prompt ${toRelative(root, file)}: ${content.trim().slice(0, 500)}`,
    });
  }

  return refs;
}

async function extractRagConfigReferences(root: string, files: string[]): Promise<CodeReference[]> {
  const appConfig = files.find((file) => normalizePath(relative(root, file)) === "app/src/main/resources/application.yml");
  if (!appConfig) {
    return [];
  }

  const content = await readFile(appConfig, "utf8");
  const keys = [
    "rewrite.enabled",
    "search.topk-short",
    "search.topk-medium",
    "search.topk-long",
    "search.min-score-short",
    "search.min-score-default",
  ];

  const refs: CodeReference[] = [];
  for (const key of keys) {
    const value = extractYamlValue(content, ["app", "ai", "rag", ...key.split(".")]);
    if (value === null) {
      continue;
    }
    refs.push({
      path: toRelative(root, appConfig),
      line: findLineNumber(content, key.split(".").at(-1) ?? key),
      symbol: `app.ai.rag.${key}`,
      snippet: `app.ai.rag.${key}=${value}`,
    });
  }

  return refs;
}

function extractYamlValue(content: string, path: string[]): string | null {
  const stack: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) {
      continue;
    }
    const match = rawLine.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match?.[2]) {
      continue;
    }
    const level = Math.floor((match[1] ?? "").length / 2);
    stack.splice(level);
    stack[level] = match[2];
    const value = match[3]?.trim() ?? "";
    if (stack.slice(0, level + 1).join(".") === path.join(".") && value) {
      return stripYamlValue(value);
    }
  }
  return null;
}

function stripYamlValue(value: string): string {
  return value.split("#")[0]?.trim().replace(/^["']|["']$/g, "") ?? value;
}

function findLineNumber(content: string, key: string): number {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trim().startsWith(`${key}:`)) {
      return index + 1;
    }
  }
  return 1;
}

function joinRoutePaths(prefix: string, path: string): string {
  const joined = `${prefix.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const normalized = joined === "/" ? "/" : joined.replace(/\/+/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

function normalizeRouteForCompare(path: string): string {
  return path.replace(/\$\{([^}]+)\}/g, "{$1}").replace(/\{[^}]+\}/g, "{}").replace(/\/+$/, "");
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function toRelative(root: string, file: string): string {
  return normalizePath(relative(root, file));
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}
