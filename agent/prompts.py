"""
提示词模板 —— Agent 系统提示词和诊断相关的 prompt 片段。

PromptBuilder 负责把一次 Investigation 的上下文、工具集摘要和任务偏好
组装成 system prompt。这样 agent 主循环只关心消息流，不直接拼 prompt。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from agent.models import DiagnosisRequest

# ---------------------------------------------------------------------------
# 主系统提示词
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """你是一个 MySQL 性能诊断专家（Database Holmes）。

## 你的能力
- 诊断 MySQL 性能问题：慢查询、索引缺失、锁等待、连接数异常、大表治理
- 使用工具获取数据库的运行状态信息
- 基于证据进行根因分析，给出优化建议

## 工作原则
1. **先调查，再推断**：先通过工具收集证据（EXPLAIN、表结构、慢查询日志等），再给出结论
2. **证据驱动**：每个结论都要有工具返回的数据支撑，不要凭空猜测
3. **分步骤排查**：一次只调 1-2 个工具，根据返回结果再决定下一步
4. **压缩感知**：返回给你的工具结果可能经过压缩，如有疑问请用更精确的条件重新查询

## 输出规范
- 最终输出用中文
- 包含"根因分析"和"优化建议"两部分
- 如果证据不足，明确指出还需要什么信息
- SQL 建议用代码块包裹

## 安全红线
- DANGEROUS 级别的工具你无法调用（会被拒绝），不要尝试
- 优化建议以 CREATE INDEX、调整配置参数为主，不要建议 DROP/ALTER 等破坏性操作
"""


@dataclass
class PromptBuilder:
    """按调查请求动态组装系统提示词。"""

    base_prompt: str = SYSTEM_PROMPT

    def build(
        self,
        request: DiagnosisRequest,
        toolsets: list[dict[str, Any]] | None = None,
    ) -> str:
        parts = [self.base_prompt.strip()]

        if request.workflow:
            parts.append(f"\n## 当前诊断流程\n优先按照 `{request.workflow}` 场景组织调查步骤。")

        if toolsets:
            parts.append("\n## 可用工具集")
            for toolset in toolsets:
                if not toolset.get("enabled", True):
                    continue
                tools = ", ".join(toolset.get("tools") or []) or "暂无工具"
                parts.append(
                    f"- {toolset.get('name')}: {toolset.get('description')}。"
                    f"工具：{tools}"
                )

        if request.metadata:
            metadata_lines = [
                f"- {key}: {value}"
                for key, value in request.metadata.items()
            ]
            parts.append("\n## 请求元信息\n" + "\n".join(metadata_lines))

        return "\n".join(parts)

# ---------------------------------------------------------------------------
# 场景类提示词片段（后续按 Workflow 组装）
# ---------------------------------------------------------------------------

SLOW_QUERY_TASK = "请诊断当前数据库的慢查询问题，找出最慢的几条 SQL 并分析原因。"

LOCK_TASK = "请分析当前的锁等待情况，找出阻塞源头并给出处理建议。"

TABLE_GROWTH_TASK = "请评估目标表的增长趋势，判断是否需要分表或归档，给出分层建议。"
