import type { ToolResult } from "../tools/base.ts";

type CompressionInput = Record<string, unknown> | unknown[];
type CompressionStrategy = (data: CompressionInput) => string;

function matchesPattern(value: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${escaped}$`).test(value);
}

export class ObservationCompressor {
  static defaultMaxChars = 800;

  maxChars: number;
  private strategies = new Map<string, CompressionStrategy>();

  constructor(options: { maxChars?: number } = {}) {
    this.maxChars = options.maxChars ?? ObservationCompressor.defaultMaxChars;
    this.registerBuiltinStrategies();
  }

  register(pattern: string, strategy: CompressionStrategy): void {
    this.strategies.set(pattern, strategy);
  }

  compress(toolName: string, rawResult: unknown): string {
    let data: CompressionInput;
    if (this.isToolResult(rawResult)) {
      if (rawResult.error) {
        return `[TOOL ERROR] ${rawResult.error}`;
      }
      data = this.normalize(rawResult.data);
    } else {
      data = this.normalize(rawResult);
    }
    return this.matchStrategy(toolName)(data);
  }

  private isToolResult(value: unknown): value is ToolResult {
    return Boolean(
      value &&
      typeof value === "object" &&
      "data" in value &&
      "error" in value,
    );
  }

  private normalize(value: unknown): CompressionInput {
    if (Array.isArray(value)) {
      return { results: value };
    }
    if (value && typeof value === "object") {
      return value as Record<string, unknown>;
    }
    return { result: value };
  }

  private matchStrategy(toolName: string): CompressionStrategy {
    for (const [pattern, strategy] of this.strategies.entries()) {
      if (matchesPattern(toolName, pattern)) {
        return strategy;
      }
    }
    return this.compressDefault.bind(this);
  }

  private registerBuiltinStrategies(): void {
    this.register("explain_*", this.compressExplain.bind(this));
    this.register("*slow_query*", this.compressList.bind(this));
    this.register("*processlist*", this.compressList.bind(this));
    this.register("*list_*", this.compressList.bind(this));
    this.register("*get_*", this.compressList.bind(this));
    this.register("*show_*", this.compressList.bind(this));
    this.register("*rank_*", this.compressList.bind(this));
    this.register("*", this.compressDefault.bind(this));
  }

  private stringify(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  private compressDefault(data: unknown): string {
    const text = this.stringify(data);
    if (text.length <= this.maxChars) {
      return text;
    }
    const half = Math.floor(this.maxChars / 2);
    const head = text.slice(0, this.maxChars - half - 50);
    const tail = text.slice(-half);
    return `${head}\n\n... [省略中间部分，原始共 ${text.length} 字符，已截断] ...\n\n${tail}`;
  }

  private compressExplain(data: CompressionInput): string {
    const keyFields = [
      "table",
      "type",
      "possible_keys",
      "key",
      "key_len",
      "rows",
      "filtered",
      "Extra",
    ];

    const filterRow = (row: unknown) => {
      if (!row || typeof row !== "object") {
        return row;
      }
      const source = row as Record<string, unknown>;
      return Object.fromEntries(
        keyFields
          .filter((key) => key in source)
          .map((key) => [key, source[key]]),
      );
    };

    const output = Array.isArray(data) ? data.map(filterRow) : filterRow(data);
    const text = this.stringify(output);
    return text.length > this.maxChars ? this.compressDefault(data) : text;
  }

  private compressList(data: CompressionInput, topN = 5): string {
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data.results)
        ? data.results
        : [data];
    const summary = {
      total_count: items.length,
      shown_count: Math.min(items.length, topN),
      top_results: items.slice(0, topN),
    };
    let text = this.stringify(summary);
    if (text.length > this.maxChars) {
      summary.top_results = items.slice(0, 3);
      text = this.stringify(summary);
    }
    return text.length > this.maxChars ? this.compressDefault(summary) : text;
  }
}
