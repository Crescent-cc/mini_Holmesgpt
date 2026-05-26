"""
工具执行器 —— 接收 LLM 的工具调用请求，执行对应工具并返回结果。

安全机制（按 RiskLevel）：
  Safe      → 直接执行
  Approval  → 先执行（MVP 阶段），后续 HITL 模块会在此处插入审批流程
  Dangerous → 直接拒绝，返回 mock 拒绝消息

用法：
    executor = ToolExecutor(registry)
    results = await executor.execute_many(tool_calls)
"""

from __future__ import annotations

import logging

from tools.base import BaseTool, RiskLevel, ToolCall, ToolResult
from tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class ToolExecutor:
    """工具执行器 —— 负责将 LLM 的工具调用请求派发到正确的工具并执行。

    不负责：
      - 工具的定义和注册（由 ToolRegistry 负责）
      - 工具结果的压缩（由 ObservationCompressor 负责）
      - 工具调用的决策（由 LLM 负责）
    """

    def __init__(self, registry: ToolRegistry):
        self.registry = registry

    async def execute_one(self, tool_call: ToolCall) -> ToolResult:
        """执行单个工具调用。

        安全流程：
          1. 查找工具 → 不存在则返回错误
          2. 检查 risk_level：
             - DANGEROUS → 直接拒绝
             - APPROVAL  → MVP 阶段暂放行（预留 HITL 拦截点）
             - SAFE      → 直接执行
          3. 执行并捕获异常
        """
        tool = self.registry.get(tool_call.name)

        # --- 工具不存在 ---
        if tool is None:
            return ToolResult(
                tool_call_id=tool_call.id,
                name=tool_call.name,
                success=False,
                error=(
                    f"未知工具: '{tool_call.name}'。"
                    f"可用工具: {self.registry.tool_names}"
                ),
            )

        # --- 风险分级处理 ---
        if tool.risk_level == RiskLevel.DANGEROUS:
            return ToolResult(
                tool_call_id=tool_call.id,
                name=tool_call.name,
                success=False,
                error=(
                    f"工具 '{tool_call.name}' 属于 DANGEROUS 级别，"
                    f"已拒绝自动执行。如需执行请联系 DBA 人工处理。"
                ),
            )

        # APPROVAL 级别在 MVP 阶段暂不阻断
        # 后续 HITL 模块的审批流程会在此处插入
        if tool.risk_level == RiskLevel.APPROVAL:
            logger.info(
                "Tool '%s' requires approval (risk=%s), executing in MVP mode",
                tool_call.name, tool.risk_level.value,
            )

        # --- 实际执行 ---
        try:
            data = await tool.run(**tool_call.arguments)
            return ToolResult(
                tool_call_id=tool_call.id,
                name=tool_call.name,
                success=True,
                data=data,
            )
        except Exception as exc:
            logger.error(
                "Tool '%s' execution failed: %s", tool_call.name, exc,
            )
            return ToolResult(
                tool_call_id=tool_call.id,
                name=tool_call.name,
                success=False,
                error=f"{type(exc).__name__}: {exc}",
            )

    async def execute_many(self, tool_calls: list[ToolCall]) -> list[ToolResult]:
        """批量执行工具调用。

        当前实现为顺序执行。后续如果工具之间无依赖关系，可改为 asyncio.gather
        并发执行以降低端到端延迟。
        """
        results = []
        for tc in tool_calls:
            result = await self.execute_one(tc)
            results.append(result)
        return results
