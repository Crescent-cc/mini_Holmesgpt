import { ContextManager } from "./context.ts";
import { DiagnosisRequest, DiagnosisResult } from "./models.ts";
import { PromptBuilder, SYSTEM_PROMPT } from "./prompts.ts";
import type { LLMClientLike } from "./llm-client.ts";
import { ReActLoop } from "./react-loop.ts";
import { ObservationCompressor } from "../observe/compressor.ts";
import { InMemoryEvidenceStore } from "../observe/evidence-store.ts";
import type { EvidenceStore } from "../observe/evidence-store.ts";
import { ToolExecutor } from "../tools/executor.ts";

export class MiniHolmesInvestigator {
  llmClient: LLMClientLike;
  toolExecutor: ToolExecutor;
  compressor: ObservationCompressor;
  evidenceStore: EvidenceStore;
  promptBuilder: PromptBuilder;
  maxIterations?: number | null;

  constructor(options: {
    llmClient: LLMClientLike;
    toolExecutor: ToolExecutor;
    compressor?: ObservationCompressor;
    evidenceStore?: EvidenceStore;
    promptBuilder?: PromptBuilder;
    maxIterations?: number | null;
  }) {
    this.llmClient = options.llmClient;
    this.toolExecutor = options.toolExecutor;
    this.compressor = options.compressor ?? new ObservationCompressor();
    this.evidenceStore = options.evidenceStore ?? new InMemoryEvidenceStore();
    this.promptBuilder = options.promptBuilder ?? new PromptBuilder(SYSTEM_PROMPT);
    this.maxIterations = options.maxIterations ?? null;
  }

  async investigate(requestInput: DiagnosisRequest | string): Promise<DiagnosisResult> {
    const request = typeof requestInput === "string"
      ? new DiagnosisRequest(requestInput)
      : requestInput;
    const systemPrompt = this.promptBuilder.build({
      request,
      toolsets: this.toolExecutor.registry.toolsetDescriptions,
    });
    const loop = new ReActLoop({
      llmClient: this.llmClient,
      toolExecutor: this.toolExecutor,
      contextManager: new ContextManager(systemPrompt),
      compressor: this.compressor,
      evidenceStore: this.evidenceStore,
      maxIterations: this.maxIterations ?? undefined,
    });
    return loop.runResult(request);
  }
}

export const DatabaseHolmesInvestigator = MiniHolmesInvestigator;
