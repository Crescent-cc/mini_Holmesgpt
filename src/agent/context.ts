export type Role = "system" | "user" | "assistant" | "tool";

export type OpenAIMessage = {
  role: Role;
  content?: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
};

export class Message {
  role: Role;
  content?: string | null;
  toolCalls?: unknown[] | null;
  toolCallId?: string | null;
  name?: string | null;

  constructor(options: {
    role: Role;
    content?: string | null;
    toolCalls?: unknown[] | null;
    toolCallId?: string | null;
    name?: string | null;
  }) {
    this.role = options.role;
    this.content = options.content;
    this.toolCalls = options.toolCalls;
    this.toolCallId = options.toolCallId;
    this.name = options.name;
  }

  toOpenAIDict(): OpenAIMessage {
    const message: OpenAIMessage = { role: this.role };
    if (this.content !== undefined && this.content !== null) {
      message.content = this.content;
    }
    if (this.toolCalls !== undefined && this.toolCalls !== null) {
      message.tool_calls = this.toolCalls;
    }
    if (this.toolCallId) {
      message.tool_call_id = this.toolCallId;
    }
    if (this.name) {
      message.name = this.name;
    }
    return message;
  }
}

export class ContextManager {
  static charsPerToken = 2.5;

  systemMessage: Message;
  messages: Message[] = [];
  maxTokens: number;
  maxRounds: number;

  constructor(
    systemPrompt: string,
    options: { maxTokens?: number; maxRounds?: number } = {},
  ) {
    this.systemMessage = new Message({ role: "system", content: systemPrompt });
    this.maxTokens = options.maxTokens ?? 12000;
    this.maxRounds = options.maxRounds ?? 10;
  }

  addUserMessage(content: string): void {
    this.messages.push(new Message({ role: "user", content }));
  }

  addAssistantMessage(content: string | null = null, toolCalls: unknown[] | null = null): void {
    this.messages.push(new Message({ role: "assistant", content, toolCalls }));
  }

  addToolResult(toolCallId: string, toolName: string, content: string): void {
    this.messages.push(new Message({
      role: "tool",
      toolCallId,
      name: toolName,
      content,
    }));
  }

  getMessages(): OpenAIMessage[] {
    this.prune();
    return [
      this.systemMessage.toOpenAIDict(),
      ...this.messages.map((message) => message.toOpenAIDict()),
    ];
  }

  reset(): void {
    this.messages = [];
  }

  private prune(): void {
    let rounds = this.groupIntoRounds();
    if (rounds.length > this.maxRounds) {
      rounds = rounds.slice(-this.maxRounds);
    }
    while (this.estimateTokens(rounds) > this.maxTokens && rounds.length > 1) {
      rounds = rounds.slice(1);
    }
    this.messages = rounds.flat();
  }

  private groupIntoRounds(): Message[][] {
    const rounds: Message[][] = [];
    let current: Message[] = [];
    for (const message of this.messages) {
      if (message.role === "user" && current.length > 0) {
        rounds.push(current);
        current = [];
      }
      current.push(message);
    }
    if (current.length > 0) {
      rounds.push(current);
    }
    return rounds;
  }

  private estimateTokens(rounds: Message[][]): number {
    let totalChars = this.systemMessage.content?.length ?? 0;
    for (const round of rounds) {
      for (const message of round) {
        totalChars += message.content?.length ?? 0;
        totalChars += JSON.stringify(message.toolCalls ?? "").length;
      }
    }
    return Math.floor(totalChars / ContextManager.charsPerToken);
  }
}
