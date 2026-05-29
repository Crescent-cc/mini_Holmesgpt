export const RiskLevel = {
  Safe: "safe",
  Approval: "approval",
  Dangerous: "dangerous",
} as const;

export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export type JsonSchema = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
};

export type OpenAIToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
};

export class BaseTool<TArgs = Record<string, unknown>, TResult = unknown> {
  name = "";
  description = "";
  parameters: JsonSchema = {
    type: "object",
    properties: {},
    required: [],
  };
  riskLevel: RiskLevel = RiskLevel.Safe;

  async run(_args: TArgs): Promise<TResult> {
    throw new Error("Tool.run() must be implemented by subclasses");
  }

  toOpenAIFunction(): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

export class ToolCall<TArgs = Record<string, unknown>> {
  id: string;
  name: string;
  arguments: TArgs;

  constructor(id: string, name: string, args: TArgs) {
    this.id = id;
    this.name = name;
    this.arguments = args;
  }
}

export class ToolResult<TResult = unknown> {
  toolCallId: string;
  name: string;
  success: boolean;
  data?: TResult;
  error?: string | null;

  constructor(
    toolCallId: string,
    name: string,
    success: boolean,
    data?: TResult,
    error?: string | null,
  ) {
    this.toolCallId = toolCallId;
    this.name = name;
    this.success = success;
    this.data = data;
    this.error = error ?? null;
  }
}
