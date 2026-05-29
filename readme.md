# mini_Holmesgpt

面向 RAG 应用故障调查的轻量 TypeScript Agent Runtime。

目标能力：接收故障描述，调用日志、trace、代码、RAG、数据库等工具取证，沉淀证据链，定位根因，并输出工程师可执行的修复建议。

典型问题：

```text
RAG 接口返回 404，帮我排查原因。
```

期望输出：

```text
根因：前端调用 /api/rag/chat，但后端实际暴露 /api/knowledge-base/chat，网关未配置 rewrite。
证据：日志、trace、Spring route、前端 API 调用路径互相印证。
建议：修改前端请求路径，或在后端增加兼容 mapping。
```

## 架构

```text
User / CLI / API
    |
    v
MiniHolmesInvestigator
    |
    +-- PromptBuilder
    +-- ContextManager
    |
    v
ReActLoop
    |
    +-- LLMClient
    +-- ToolExecutor -> ApprovalPolicy -> ToolRegistry -> Toolset -> BaseTool
    +-- ObservationCompressor
    +-- EvidenceStore
    |
    v
DiagnosisResult(answer + evidenceIds + toolCalls + metadata)
```

核心原则：

- 工具原始结果进入 `EvidenceStore`，压缩摘要进入 LLM 上下文。
- 工具通过 `RiskLevel` 分级，`dangerous` 默认拒绝自动执行。
- `ContextManager` 按整轮裁剪，避免拆散 assistant tool call 和 tool result。
- `DiagnosisResult` 返回结构化结果，便于报告、审计和测试。

## 项目结构

```text
src/
  agent/      Agent 核心：LLM client、ReAct loop、上下文、模型、提示词
  tools/      工具抽象、注册中心、执行器、toolset 边界
  observe/    证据存储和观测压缩
  safety/     审批策略
  runtime/    CLI 入口
tests/        Node test runner 测试
```

## 快速开始

环境要求：

- Node.js 22+
- 可访问 OpenAI-compatible API，例如 DeepSeek、OpenAI、本地 vLLM/Ollama

安装依赖：

```bash
npm install
```

配置模型 Key：

```bash
printf 'DEEPSEEK_API_KEY=你的_key\n' > .env
```

运行 CLI：

```bash
npm run cli
```

单次调用：

```bash
npm run cli -- --once "RAG 接口返回 404，帮我排查原因。"
```

常用参数：

```bash
npm run cli -- --model deepseek-v4-flash --base-url https://api.deepseek.com
```

## 开发验证

```bash
npm run typecheck
npm test
```

当前测试覆盖：

- tool registry / executor / risk approval
- context message 导出和整轮裁剪
- observation compression
- evidence store
- ReActLoop 工具调用、证据保存和最终回答

## 使用入口

```ts
import { MiniHolmesInvestigator, LLMClient } from "./src/agent/index.ts";
import { ToolExecutor, ToolRegistry } from "./src/tools/index.ts";

const registry = new ToolRegistry();
const executor = new ToolExecutor(registry);

const investigator = new MiniHolmesInvestigator({
  llmClient: new LLMClient(),
  toolExecutor: executor,
});

const result = await investigator.investigate("RAG 接口返回 404，帮我排查原因。");

console.log(result.answer);
console.log(result.evidenceIds);
```

## 下一步

- 增加 `logs`、`traces`、`repo`、`rag`、`db` 等真实 toolset。
- 把固定场景沉淀为 workflow，例如 HTTP 404、检索为空、回答幻觉。
- 引入调查状态 memory，保留已确认事实、假设、排除项和下一步计划。
- 为 CLI/API 增加流式 agent event 输出。
