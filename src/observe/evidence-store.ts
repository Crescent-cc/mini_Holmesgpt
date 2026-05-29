import { randomUUID } from "node:crypto";
import type { ToolResult } from "../tools/base.ts";

export class EvidenceRecord {
  id: string;
  toolName: string;
  toolCallId: string;
  data: unknown;
  error: string | null;
  success: boolean;
  createdAt: Date;
  metadata: Record<string, unknown>;

  constructor(options: {
    id: string;
    toolName: string;
    toolCallId: string;
    data?: unknown;
    error?: string | null;
    success?: boolean;
    createdAt?: Date;
    metadata?: Record<string, unknown>;
  }) {
    this.id = options.id;
    this.toolName = options.toolName;
    this.toolCallId = options.toolCallId;
    this.data = options.data;
    this.error = options.error ?? null;
    this.success = options.success ?? true;
    this.createdAt = options.createdAt ?? new Date();
    this.metadata = options.metadata ?? {};
  }
}

export interface EvidenceStore {
  saveToolResult(result: ToolResult, metadata?: Record<string, unknown>): EvidenceRecord;
  get(evidenceId: string): EvidenceRecord | undefined;
  list(): EvidenceRecord[];
}

export class InMemoryEvidenceStore implements EvidenceStore {
  private records = new Map<string, EvidenceRecord>();

  saveToolResult(result: ToolResult, metadata: Record<string, unknown> = {}): EvidenceRecord {
    const record = new EvidenceRecord({
      id: `ev_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      toolName: result.name,
      toolCallId: result.toolCallId,
      data: result.data,
      error: result.error,
      success: result.success,
      metadata,
    });
    this.records.set(record.id, record);
    return record;
  }

  get(evidenceId: string): EvidenceRecord | undefined {
    return this.records.get(evidenceId);
  }

  list(): EvidenceRecord[] {
    return [...this.records.values()];
  }

  reset(): void {
    this.records.clear();
  }
}
