import { BaseTool } from "./base.ts";
import type { OpenAIToolSchema } from "./base.ts";
import { Toolset } from "./toolset.ts";

export class ToolRegistry {
  private tools = new Map<string, BaseTool>();
  private registeredToolsets = new Map<string, Toolset>();

  register(tool: BaseTool): void {
    if (!tool.name) {
      throw new Error(`Tool object ${String(tool)} has no name`);
    }
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: BaseTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  registerToolset(toolset: Toolset): void {
    if (!toolset.name) {
      throw new Error("Toolset name cannot be empty");
    }
    this.registeredToolsets.set(toolset.name, toolset);
    this.registerMany(toolset.listTools());
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  list(): BaseTool[] {
    return [...this.tools.values()];
  }

  toOpenAISchema(): OpenAIToolSchema[] {
    return this.list().map((tool) => tool.toOpenAIFunction());
  }

  get toolNames(): string[] {
    return [...this.tools.keys()];
  }

  get toolsets(): Toolset[] {
    return [...this.registeredToolsets.values()];
  }

  get toolsetDescriptions(): Record<string, unknown>[] {
    return this.toolsets.map((toolset) => toolset.describe());
  }

  get size(): number {
    return this.tools.size;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}
