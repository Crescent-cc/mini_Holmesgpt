import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

import { ContextManager } from "../agent/context.ts";
import { LLMClient } from "../agent/llm-client.ts";

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_SYSTEM_PROMPT =
  "你是 mini_Holmesgpt 的命令行调试助手。请用中文回答，保持简洁，遇到不确定的信息要明确说明。";

function buildArgs() {
  return parseArgs({
    options: {
      model: {
        type: "string",
        default: DEFAULT_MODEL,
      },
      "base-url": {
        type: "string",
        default: "https://api.deepseek.com",
      },
      temperature: {
        type: "string",
        default: "0",
      },
      system: {
        type: "string",
        default: DEFAULT_SYSTEM_PROMPT,
      },
      once: {
        type: "string",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: false,
  }).values;
}

function printHelp(): void {
  console.log(`mini_Holmesgpt 命令行聊天入口

Usage:
  npm run cli -- [options]

Options:
  --model <name>          模型名称，默认 ${DEFAULT_MODEL}
  --base-url <url>        OpenAI-compatible API 地址，默认 DeepSeek
  --temperature <number>  采样温度，默认 0
  --system <prompt>       系统提示词
  --once <message>        只发送一条消息并退出
  -h, --help              显示帮助`);
}

async function askOnce(client: LLMClient, context: ContextManager, question: string): Promise<string> {
  context.addUserMessage(question);
  const response = await client.chat(context.getMessages(), null);
  const answer = response.content ?? "(模型未返回内容)";
  context.addAssistantMessage(answer);
  return answer;
}

export async function main(): Promise<number> {
  const args = buildArgs();
  if (args.help) {
    printHelp();
    return 0;
  }

  let client: LLMClient;
  try {
    client = new LLMClient({
      model: args.model,
      baseUrl: args["base-url"],
      temperature: Number(args.temperature),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`配置错误：${message}`);
    return 2;
  }

  const systemPrompt =
    `${args.system}\n` +
    `当前运行时模型配置为 \`${args.model}\`，API 地址为 \`${args["base-url"]}\`。` +
    "如果用户询问模型身份，只能基于该运行时配置回答，不要猜测为 OpenAI GPT。";
  const context = new ContextManager(systemPrompt);

  if (args.once) {
    try {
      console.log(await askOnce(client, context, args.once));
      return 0;
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error(`调用失败：${message}`);
      return 1;
    }
  }

  console.log("mini_Holmesgpt CLI");
  console.log("输入问题开始聊天；命令：/reset 清空上下文，/exit 退出。");
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const question = (await rl.question("\n你> ")).trim();
      if (!question) {
        continue;
      }
      if (["/exit", "/quit", "exit", "quit"].includes(question)) {
        return 0;
      }
      if (question === "/reset") {
        context.reset();
        console.log("已清空上下文。");
        continue;
      }
      try {
        const answer = await askOnce(client, context, question);
        console.log(`\nAI> ${answer}`);
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error(`调用失败：${message}`);
        return 1;
      }
    }
  } finally {
    rl.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}
