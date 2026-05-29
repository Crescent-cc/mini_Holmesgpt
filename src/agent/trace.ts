export class ToolCallTrace {
  toolCallId: string;
  toolName: string;
  success: boolean;
  evidenceId?: string | null;
  error?: string | null;

  constructor(options: {
    toolCallId: string;
    toolName: string;
    success: boolean;
    evidenceId?: string | null;
    error?: string | null;
  }) {
    this.toolCallId = options.toolCallId;
    this.toolName = options.toolName;
    this.success = options.success;
    this.evidenceId = options.evidenceId ?? null;
    this.error = options.error ?? null;
  }
}
