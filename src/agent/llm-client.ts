import { readFileSync, existsSync } from "node:fs";
import type { OpenAIMessage } from "./context.ts";
import type { OpenAIToolSchema } from "../tools/base.ts";

export type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export class LLMResponse {
  content: string | null;
  toolCalls: OpenAIToolCall[] | null;

  constructor(content: string | null = null, toolCalls: OpenAIToolCall[] | null = null) {
    this.content = content;
    this.toolCalls = toolCalls;
  }

  get hasToolCalls(): boolean {
    return Boolean(this.toolCalls?.length);
  }

  get isFinal(): boolean {
    return !this.hasToolCalls;
  }
}

export interface LLMClientLike {
  chat(messages: OpenAIMessage[], tools?: OpenAIToolSchema[] | null): Promise<LLMResponse>;
}

type OpenAIConstructor = new (options: { apiKey: string; baseURL?: string }) => {
  chat: {
    completions: {
      create(options: Record<string, unknown>): Promise<{
        choices: Array<{
          message: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }> | null;
          };
        }>;
      }>;
    };
  };
};

export class LLMClient implements LLMClientLike {
  model: string;
  temperature: number;
  maxRetries: number;
  baseUrl: string;
  private clientPromise?: Promise<InstanceType<OpenAIConstructor>>;
  private apiKey: string;

  constructor(options: {
    model?: string;
    apiKey?: string | null;
    baseUrl?: string;
    temperature?: number;
    maxRetries?: number;
  } = {}) {
    this.model = options.model ?? "deepseek-v4-flash";
    this.temperature = options.temperature ?? 0;
    this.maxRetries = options.maxRetries ?? 2;
    this.baseUrl = options.baseUrl ?? "https://api.deepseek.com";
    this.apiKey = options.apiKey ?? LLMClient.resolveApiKey(this.baseUrl);
  }

  static resolveApiKey(baseUrl: string): string {
    LLMClient.loadLocalEnv();
    const envNames = ["LLM_API_KEY"];
    if (baseUrl.includes("deepseek")) {
      envNames.unshift("DEEPSEEK_API_KEY");
    }
    if (baseUrl.includes("openai")) {
      envNames.unshift("OPENAI_API_KEY");
    }

    for (const name of envNames) {
      const value = process.env[name];
      if (value) {
        return value;
      }
    }
    throw new Error(
      "LLM API key is required. Pass apiKey explicitly or set one of: " +
      envNames.join(", "),
    );
  }

  static loadLocalEnv(envPath = ".env"): void {
    if (!existsSync(envPath)) {
      return;
    }
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) {
        continue;
      }
      const [rawKey, ...rest] = line.split("=");
      const key = rawKey.trim();
      const value = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  async chat(messages: OpenAIMessage[], tools: OpenAIToolSchema[] | null = null): Promise<LLMResponse> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.callApi(messages, tools);
      } catch (error) {
        if (attempt >= this.maxRetries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
    throw new Error("unreachable");
  }

  private async getClient(): Promise<InstanceType<OpenAIConstructor>> {
    this.clientPromise ??= (async () => {
      const mod = await import("openai");
      const OpenAI = mod.default as unknown as OpenAIConstructor;
      return new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
      });
    })();
    return this.clientPromise;
  }

  private async callApi(
    messages: OpenAIMessage[],
    tools: OpenAIToolSchema[] | null,
  ): Promise<LLMResponse> {
    const client = await this.getClient();
    const request: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: this.temperature,
    };
    if (tools?.length) {
      request.tools = tools;
    }
    const completion = await client.chat.completions.create(request);
    const message = completion.choices[0]?.message;
    if (!message) {
      return new LLMResponse("(模型未返回内容)");
    }
    if (message.tool_calls?.length) {
      return new LLMResponse(
        message.content ?? null,
        message.tool_calls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        })),
      );
    }
    return new LLMResponse(message.content ?? null);
  }
}
