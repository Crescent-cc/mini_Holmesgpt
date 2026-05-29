import { ContextManager } from "./context.ts";
import { DiagnosisRequest, DiagnosisResult } from "./models.ts";
import { ToolCallTrace } from "./trace.ts";
import { LLMResponse } from "./llm-client.ts";
import type { LLMClientLike } from "./llm-client.ts";
import { ObservationCompressor } from "../observe/compressor.ts";
import type { EvidenceStore } from "../observe/evidence-store.ts";
import { ToolCall } from "../tools/base.ts";
import { ToolExecutor } from "../tools/executor.ts";

export class ReActLoop {
  static maxIterations = 15;

  llmClient: LLMClientLike;
  toolExecutor: ToolExecutor;
  contextManager: ContextManager;
  compressor: ObservationCompressor;
  evidenceStore?: EvidenceStore;
  iteration = 0;
  maxIterations = ReActLoop.maxIterations;
  private done = false;
  private toolTraces: ToolCallTrace[] = [];

  constructor(options: {
    llmClient: LLMClientLike;
    toolExecutor: ToolExecutor;
    contextManager: ContextManager;
    compressor: ObservationCompressor;
    evidenceStore?: EvidenceStore;
    maxIterations?: number;
  }) {
    this.llmClient = options.llmClient;
    this.toolExecutor = options.toolExecutor;
    this.contextManager = options.contextManager;
    this.compressor = options.compressor;
    this.evidenceStore = options.evidenceStore;
    this.maxIterations = options.maxIterations ?? ReActLoop.maxIterations;
  }

  async run(userInput: string): Promise<string> {
    const result = await this.runResult(userInput);
    return result.answer;
  }

  async runResult(requestInput: DiagnosisRequest | string): Promise<DiagnosisResult> {
    const request = typeof requestInput === "string"
      ? new DiagnosisRequest(requestInput)
      : requestInput;

    this.iteration = 0;
    this.done = false;
    this.toolTraces = [];
    this.contextManager.addUserMessage(request.question);

    while (!this.done) {
      this.iteration += 1;
      if (this.iteration > this.maxIterations) {
        const answer = await this.forceConclusion();
        return this.buildResult(request, answer, true);
      }

      const messages = this.contextManager.getMessages();
      const toolsSchema = this.toolExecutor.registry.toOpenAISchema();
      const response = await this.llmClient.chat(messages, toolsSchema);
      if (response.hasToolCalls) {
        await this.handleToolCalls(response);
      } else {
        this.done = true;
        return this.buildResult(request, response.content ?? "(Agent 未返回内容)");
      }
    }

    return this.buildResult(request, "[Agent] 异常退出。", false, true);
  }

  private async handleToolCalls(response: LLMResponse): Promise<void> {
    const toolCalls = (response.toolCalls ?? []).map((toolCall) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        args = {};
      }
      return new ToolCall(toolCall.id, toolCall.function.name, args);
    });

    this.contextManager.addAssistantMessage(response.content, response.toolCalls);
    const results = await this.toolExecutor.executeMany(toolCalls);

    for (const result of results) {
      let evidenceId: string | null = null;
      if (this.evidenceStore) {
        const evidence = this.evidenceStore.saveToolResult(result, {
          iteration: this.iteration,
        });
        evidenceId = evidence.id;
      }

      const compressedText = this.compressor.compress(result.name, result);
      const toolContent = result.success
        ? compressedText
        : `[工具执行失败] ${result.error}\n\n${compressedText}`;
      this.contextManager.addToolResult(result.toolCallId, result.name, toolContent);
      this.toolTraces.push(new ToolCallTrace({
        toolCallId: result.toolCallId,
        toolName: result.name,
        success: result.success,
        evidenceId,
        error: result.error,
      }));
    }
  }

  private async forceConclusion(): Promise<string> {
    this.contextManager.addUserMessage(
      "你已达到最大的工具调用轮数限制。请基于目前已收集的全部证据，给出当前的最佳诊断结论。如果证据不足以确定根因，请明确指出还需要哪些信息，并给出最可能的推测方向。",
    );
    const response = await this.llmClient.chat(this.contextManager.getMessages(), null);
    return response.content ?? "(Agent 无法在迭代限制内完成诊断)";
  }

  private buildResult(
    request: DiagnosisRequest,
    answer: string,
    forced = false,
    failed = false,
  ): DiagnosisResult {
    return new DiagnosisResult({
      answer,
      request,
      toolCalls: [...this.toolTraces],
      evidenceIds: this.toolTraces
        .map((trace) => trace.evidenceId)
        .filter((id): id is string => Boolean(id)),
      iterations: this.iteration,
      metadata: {
        forced_conclusion: forced,
        failed,
      },
    });
  }
}
