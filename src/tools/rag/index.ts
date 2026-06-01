import { BaseTool } from "../base.ts";
import { Toolset } from "../toolset.ts";
import type {
  CodeReference,
  DiagnosticToolResponse,
  GatewayRoute,
  LogEntry,
  RagDiagnosticFixture,
  RagTrace,
  SpringRoute,
  VectorSearchRecord,
} from "./fixtures.ts";

type SearchLogsArgs = {
  query?: string;
  service?: string;
  level?: string;
  limit?: number;
};

type PathArgs = {
  path?: string;
};

type SearchCodeArgs = {
  query?: string;
  path?: string;
  limit?: number;
};

type InspectRagTraceArgs = {
  requestId?: string;
  traceId?: string;
  sessionId?: string | number;
};

type SearchVectorHitsArgs = {
  query?: string;
  knowledgeBaseIds?: number[];
  minScore?: number;
};

function textIncludes(value: string | undefined, query: string | undefined): boolean {
  if (!query?.trim()) {
    return true;
  }
  return (value ?? "").toLowerCase().includes(query.trim().toLowerCase());
}

function routeMatches(routePath: string, requestedPath: string | undefined): boolean {
  if (!requestedPath?.trim()) {
    return true;
  }
  const normalizedRoute = routePath.replace(/\*\*$/, "").replace(/\{[^}]+\}/g, "");
  const normalizedRequest = requestedPath.trim();
  return normalizedRequest.startsWith(normalizedRoute) || normalizedRoute.startsWith(normalizedRequest);
}

function limited<T>(items: T[], limit: number | undefined): T[] {
  const normalizedLimit = typeof limit === "number" && limit > 0 ? limit : items.length;
  return items.slice(0, normalizedLimit);
}

function response<T>(
  fixture: RagDiagnosticFixture,
  items: T[],
  summary: string,
): DiagnosticToolResponse<T> {
  return {
    fixtureId: fixture.id,
    summary,
    count: items.length,
    items,
  };
}

class SearchLogsTool extends BaseTool<SearchLogsArgs, DiagnosticToolResponse<LogEntry>> {
  private readonly fixture: RagDiagnosticFixture;
  name = "search_logs";
  description = "Search application or gateway logs by text, service, and level.";
  parameters = {
    type: "object",
    properties: {
      query: { type: "string", description: "Text to search in log messages." },
      service: { type: "string", description: "Optional service name filter." },
      level: { type: "string", description: "Optional log level filter." },
      limit: { type: "number", description: "Maximum number of log entries to return." },
    },
    required: [],
  };

  constructor(fixture: RagDiagnosticFixture) {
    super();
    this.fixture = fixture;
  }

  async run(args: SearchLogsArgs) {
    const logs = limited(
      (this.fixture.logs ?? []).filter((log) =>
        textIncludes(log.message, args.query)
        && textIncludes(log.service, args.service)
        && textIncludes(log.level, args.level)
      ),
      args.limit,
    );
    const summary = logs.length > 0
      ? `Found ${logs.length} matching log entries.`
      : "No log entries matched the filters.";
    return response(this.fixture, logs, summary);
  }
}

class ListGatewayRoutesTool extends BaseTool<PathArgs, DiagnosticToolResponse<GatewayRoute>> {
  private readonly fixture: RagDiagnosticFixture;
  name = "list_gateway_routes";
  description = "List gateway or ingress routes, optionally filtered by request path.";
  parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "Request path to match against gateway routes." },
    },
    required: [],
  };

  constructor(fixture: RagDiagnosticFixture) {
    super();
    this.fixture = fixture;
  }

  async run(args: PathArgs) {
    const routes = (this.fixture.gatewayRoutes ?? []).filter((route) => routeMatches(route.path, args.path));
    const summary = routes.length > 0
      ? `Found ${routes.length} gateway routes matching the request path.`
      : `no gateway route matched ${args.path ?? "the requested path"}`;
    return response(this.fixture, routes, summary);
  }
}

class ListSpringRoutesTool extends BaseTool<PathArgs, DiagnosticToolResponse<SpringRoute>> {
  private readonly fixture: RagDiagnosticFixture;
  name = "list_spring_routes";
  description = "List Spring MVC mappings, optionally filtered by path.";
  parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "Path prefix or exact route to inspect." },
    },
    required: [],
  };

  constructor(fixture: RagDiagnosticFixture) {
    super();
    this.fixture = fixture;
  }

  async run(args: PathArgs) {
    const routes = (this.fixture.springRoutes ?? []).filter((route) => routeMatches(route.path, args.path));
    const summary = routes.length > 0
      ? `Found ${routes.length} Spring routes matching the request path.`
      : `No Spring routes matched ${args.path ?? "the requested path"}.`;
    return response(this.fixture, routes, summary);
  }
}

class SearchCodeTool extends BaseTool<SearchCodeArgs, DiagnosticToolResponse<CodeReference>> {
  private readonly fixture: RagDiagnosticFixture;
  name = "search_code";
  description = "Search code references captured in the current diagnostic fixture.";
  parameters = {
    type: "object",
    properties: {
      query: { type: "string", description: "Text to search in snippets, symbols, and paths." },
      path: { type: "string", description: "Optional file path filter." },
      limit: { type: "number", description: "Maximum number of code references to return." },
    },
    required: [],
  };

  constructor(fixture: RagDiagnosticFixture) {
    super();
    this.fixture = fixture;
  }

  async run(args: SearchCodeArgs) {
    const refs = limited(
      (this.fixture.codeReferences ?? []).filter((ref) =>
        textIncludes(`${ref.path}\n${ref.symbol ?? ""}\n${ref.snippet}`, args.query)
        && textIncludes(ref.path, args.path)
      ),
      args.limit,
    );
    const summary = refs.length > 0
      ? `Found ${refs.length} matching code references.`
      : "No code references matched the filters.";
    return response(this.fixture, refs, summary);
  }
}

class InspectRagTraceTool extends BaseTool<InspectRagTraceArgs, DiagnosticToolResponse<RagTrace>> {
  private readonly fixture: RagDiagnosticFixture;
  name = "inspect_rag_trace";
  description = "Inspect a RAG request trace including rewrite, search params, hits, prompt context, and answer.";
  parameters = {
    type: "object",
    properties: {
      requestId: { type: "string", description: "Request id to inspect." },
      traceId: { type: "string", description: "Trace id to inspect." },
      sessionId: { type: "string", description: "RAG session id to inspect." },
    },
    required: [],
  };

  constructor(fixture: RagDiagnosticFixture) {
    super();
    this.fixture = fixture;
  }

  async run(args: InspectRagTraceArgs) {
    const traces = (this.fixture.ragTraces ?? []).filter((trace) =>
      textIncludes(trace.requestId ?? trace.id, args.requestId ?? args.traceId)
      && textIncludes(String(trace.sessionId ?? ""), args.sessionId === undefined ? undefined : String(args.sessionId))
    );
    const summary = traces.length > 0
      ? `Found ${traces.length} RAG traces.`
      : "No RAG traces matched the filters.";
    return response(this.fixture, traces, summary);
  }
}

class SearchVectorHitsTool extends BaseTool<SearchVectorHitsArgs, DiagnosticToolResponse<VectorSearchRecord>> {
  private readonly fixture: RagDiagnosticFixture;
  name = "search_vector_hits";
  description = "Inspect vector search attempts and hits for a query and optional knowledge base ids.";
  parameters = {
    type: "object",
    properties: {
      query: { type: "string", description: "Candidate retrieval query." },
      knowledgeBaseIds: {
        type: "array",
        items: { type: "number" },
        description: "Optional knowledge base ids used for retrieval.",
      },
      minScore: { type: "number", description: "Optional score threshold to compare with fixture searches." },
    },
    required: [],
  };

  constructor(fixture: RagDiagnosticFixture) {
    super();
    this.fixture = fixture;
  }

  async run(args: SearchVectorHitsArgs) {
    const searches = (this.fixture.vectorSearches ?? []).filter((search) =>
      textIncludes(search.query, args.query)
      && knowledgeBasesOverlap(search.knowledgeBaseIds, args.knowledgeBaseIds)
      && (args.minScore === undefined || search.minScore === undefined || search.minScore >= args.minScore)
    );
    const hitCount = searches.reduce((sum, search) => sum + search.hits.length, 0);
    const summary = searches.length > 0
      ? `Found ${hitCount} vector hits across ${searches.length} search attempts.`
      : "No vector search attempts matched the filters.";
    return response(this.fixture, searches, summary);
  }
}

function knowledgeBasesOverlap(left: number[] | undefined, right: number[] | undefined): boolean {
  if (!right?.length) {
    return true;
  }
  if (!left?.length) {
    return false;
  }
  return right.some((id) => left.includes(id));
}

export function createRagDiagnosticToolset(fixture: RagDiagnosticFixture): Toolset {
  return new Toolset({
    name: "rag-diagnostics",
    description: "Read-only tools for investigating RAG API, retrieval, and grounding failures.",
    tools: [
      new SearchLogsTool(fixture),
      new ListGatewayRoutesTool(fixture),
      new ListSpringRoutesTool(fixture),
      new SearchCodeTool(fixture),
      new InspectRagTraceTool(fixture),
      new SearchVectorHitsTool(fixture),
    ],
  });
}

export type {
  CodeReference,
  GatewayRoute,
  LogEntry,
  RagDiagnosticFixture,
  RagTrace,
  SpringRoute,
  VectorSearchRecord,
};
