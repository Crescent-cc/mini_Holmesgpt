# mini_Holmesgpt Agent Framework Notes

mini_Holmesgpt 的 Agent 框架以 TypeScript 为主实现，位于 `src/`。它不是通用聊天机器人，而是面向 RAG 故障排查的调查式 runtime：先取证，再推断，最终输出带证据链的诊断结果。

## 核心流程

```text
DiagnosisRequest
    |
    v
MiniHolmesInvestigator
    |
    +-- PromptBuilder 组装系统提示词
    +-- ContextManager 初始化本次调查上下文
    |
    v
ReActLoop
    |
    +-- LLMClient 请求模型
    +-- ToolExecutor 执行工具调用
    +-- ObservationCompressor 压缩工具结果
    +-- EvidenceStore 保存完整证据
    |
    v
DiagnosisResult
```

## 模块职责

`src/agent/`

- `investigator.ts`：一次调查的高层入口。
- `react-loop.ts`：ReAct 主循环，处理 LLM response、tool call、tool result 和终止条件。
- `llm-client.ts`：OpenAI-compatible 模型调用封装。
- `context.ts`：OpenAI messages 管理和上下文裁剪。
- `models.ts` / `trace.ts`：结构化请求、结果和工具轨迹。
- `prompts.ts`：系统提示词和动态 prompt builder。

`src/tools/`

- `base.ts`：`BaseTool`、`ToolCall`、`ToolResult`、`RiskLevel`。
- `registry.ts`：工具注册和 OpenAI tool schema 导出。
- `executor.ts`：工具执行、异常包装和审批接入。
- `toolset.ts`：按数据源或诊断域组织工具。

`src/observe/`

- `evidence-store.ts`：保存完整工具结果，返回 `ev_xxx` 证据 ID。
- `compressor.ts`：把大结果压缩为 LLM 可读摘要。

`src/safety/`

- `approval.ts`：工具执行前审批策略。默认 `safe` / `approval` 允许，`dangerous` 拒绝。

## 数据模型

`DiagnosisRequest` 表示一次调查输入：

```ts
new DiagnosisRequest({
  question: "RAG 接口返回 404，帮我排查原因。",
  source: "cli",
  metadata: {
    service: "rag-api",
    env: "staging",
    timeWindow: "last_30m",
  },
  workflow: "http_404",
});
```

`DiagnosisResult` 表示结构化输出：

```ts
{
  answer: "最终诊断结论和修复建议",
  evidenceIds: ["ev_xxx"],
  toolCalls: [
    {
      toolCallId: "call_xxx",
      toolName: "query_logs",
      success: true,
      evidenceId: "ev_xxx",
    },
  ],
  iterations: 4,
  metadata: {
    forced_conclusion: false,
    failed: false,
  },
}
```

## 如何新增工具

新增工具时优先放进对应 toolset。工具需要声明名称、描述、参数 schema、风险等级和执行逻辑。

```ts
import { BaseTool, RiskLevel } from "./src/tools/index.ts";

class SearchRepoTool extends BaseTool<{ pattern: string }, { matches: string[] }> {
  name = "search_repo";
  description = "在代码仓库中搜索关键字或路径";
  riskLevel = RiskLevel.Safe;
  parameters = {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "要搜索的关键字或正则",
      },
    },
    required: ["pattern"],
  };

  async run(args: { pattern: string }) {
    return {
      matches: [],
    };
  }
}
```

注册工具：

```ts
import { ToolRegistry } from "./src/tools/index.ts";

const registry = new ToolRegistry();
registry.register(new SearchRepoTool());
```

## 设计约定

- 工具默认只读；会修改环境或生成高风险操作的工具必须标记为 `approval` 或 `dangerous`。
- 不把完整日志、trace、chunk、prompt 塞进上下文；完整数据进 evidence，摘要进 context。
- 工具返回值尽量结构化，方便压缩、测试和最终报告引用。
- 新增行为先补测试，再实现。
- 大功能优先拆成 toolset 或 workflow，不把复杂逻辑塞进 `ReActLoop`。

## 推荐扩展顺序

1. `repo` toolset：搜索文件、读取片段、定位行号。
2. `logs` toolset：按服务、时间窗、trace id 查询日志。
3. `traces` toolset：读取失败 span 和上下游调用。
4. `rag` toolset：读取检索 query、topK chunk、prompt、模型响应。
5. `workflow`：沉淀 HTTP 404、检索为空、回答幻觉等固定排查路径。
