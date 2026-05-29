import { ApprovalPolicy } from "../safety/approval.ts";
import { RiskLevel, ToolCall, ToolResult } from "./base.ts";
import { ToolRegistry } from "./registry.ts";

export class ToolExecutor {
  registry: ToolRegistry;
  approvalPolicy: ApprovalPolicy;

  constructor(registry: ToolRegistry, approvalPolicy = new ApprovalPolicy()) {
    this.registry = registry;
    this.approvalPolicy = approvalPolicy;
  }

  async executeOne(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.registry.get(toolCall.name);
    if (!tool) {
      return new ToolResult(
        toolCall.id,
        toolCall.name,
        false,
        undefined,
        `未知工具: '${toolCall.name}'。可用工具: ${this.registry.toolNames.join(", ")}`,
      );
    }

    const approval = await this.approvalPolicy.evaluate(toolCall, tool.riskLevel);
    if (!approval.approved) {
      return new ToolResult(
        toolCall.id,
        toolCall.name,
        false,
        undefined,
        `工具 '${toolCall.name}' 未获准执行：${approval.reason}`,
      );
    }

    if (tool.riskLevel === RiskLevel.Approval) {
      console.info(
        `Tool '${toolCall.name}' passed approval policy (risk=${tool.riskLevel}): ${approval.reason}`,
      );
    }

    try {
      const data = await tool.run(toolCall.arguments);
      return new ToolResult(toolCall.id, toolCall.name, true, data);
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      return new ToolResult(toolCall.id, toolCall.name, false, undefined, message);
    }
  }

  async executeMany(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const toolCall of toolCalls) {
      results.push(await this.executeOne(toolCall));
    }
    return results;
  }
}
