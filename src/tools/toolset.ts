import { BaseTool } from "./base.ts";

export class Toolset {
  name: string;
  description: string;
  tools: BaseTool[];
  enabled: boolean;

  constructor(options: {
    name: string;
    description: string;
    tools?: BaseTool[];
    enabled?: boolean;
  }) {
    this.name = options.name;
    this.description = options.description;
    this.tools = options.tools ?? [];
    this.enabled = options.enabled ?? true;
  }

  listTools(): BaseTool[] {
    return this.enabled ? this.tools : [];
  }

  describe(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      enabled: this.enabled,
      tools: this.listTools().map((tool) => tool.name),
    };
  }
}
