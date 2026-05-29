import type { ToolCallTrace } from "./trace.ts";

export type Metadata = Record<string, unknown>;

export class DiagnosisRequest {
  question: string;
  source: string;
  metadata: Metadata;
  workflow?: string | null;

  constructor(options: string | {
    question: string;
    source?: string;
    metadata?: Metadata;
    workflow?: string | null;
  }) {
    if (typeof options === "string") {
      this.question = options;
      this.source = "cli";
      this.metadata = {};
      this.workflow = null;
      return;
    }
    this.question = options.question;
    this.source = options.source ?? "cli";
    this.metadata = options.metadata ?? {};
    this.workflow = options.workflow ?? null;
  }
}

export class DiagnosisResult {
  answer: string;
  request: DiagnosisRequest;
  toolCalls: ToolCallTrace[];
  evidenceIds: string[];
  iterations: number;
  metadata: Metadata;

  constructor(options: {
    answer: string;
    request: DiagnosisRequest;
    toolCalls?: ToolCallTrace[];
    evidenceIds?: string[];
    iterations?: number;
    metadata?: Metadata;
  }) {
    this.answer = options.answer;
    this.request = options.request;
    this.toolCalls = options.toolCalls ?? [];
    this.evidenceIds = options.evidenceIds ?? [];
    this.iterations = options.iterations ?? 0;
    this.metadata = options.metadata ?? {};
  }
}
