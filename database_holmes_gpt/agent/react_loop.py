"""
ReAct 推理循环 —— Agent 的核心大脑。

ReAct = Reasoning + Acting，即"思考 → 行动 → 观察 → 再思考"的循环过程。

流程：
  1. 用户输入 → 添加到上下文
  2. LLM 思考 → 返回文本回复 或 工具调用请求
  3. 如果有工具调用请求：
     a. 执行工具 → 获取原始结果
     b. 压缩结果 → 防止撑爆上下文
     c. 添加到上下文 → 回到步骤 2
  4. 如果没有工具调用 → 返回最终答案

终止条件：
  - LLM 返回纯文本（finish_reason = "stop"）
  - 达到最大迭代次数（MAX_ITERATIONS），此时强制 LLM 基于已有信息给出结论

使用示例：
    loop = ReActLoop(llm_client, tool_executor, context_manager, compressor)
    answer = await loop.run("orders 表为什么突然变慢了？")
    print(answer)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from agent.llm_client import LLMClient, LLMResponse
from agent.context import ContextManager
from tools import ToolExecutor, ToolCall
from observe.compressor import ObservationCompressor

logger = logging.getLogger(__name__)


class ReActLoop:
    """ReAct Agent 主循环 —— 驱动 LLM 与工具之间的多轮交互。

    职责：
      1. 管理 Think → Act → Observe 循环
      2. 将 LLM 的工具调用派发给 ToolExecutor
      3. 用 ObservationCompressor 压缩结果后传回 LLM
      4. 检测终止条件并返回最终答案

    不负责：
      - 对话历史管理（由 ContextManager 负责）
      - 工具定义和注册（由 ToolRegistry 负责）
      - LLM 调用细节（由 LLMClient 负责）
    """

    # 最大工具调用迭代次数，防止模型陷入"调工具→不满意→再调"的死循环
    MAX_ITERATIONS = 15

    def __init__(
        self,
        llm_client: LLMClient,
        tool_executor: ToolExecutor,
        context_manager: ContextManager,
        compressor: ObservationCompressor,
    ):
        self.llm = llm_client
        self.executor = tool_executor
        self.context = context_manager
        self.compressor = compressor

        # 运行时状态
        self.iteration: int = 0
        self._done: bool = False

    async def run(self, user_input: str) -> str:
        """执行 ReAct 循环，返回最终诊断结论。

        Args:
            user_input: 用户输入的诊断问题，如 "orders 表为什么变慢了？"

        Returns:
            str: Agent 的最终回复
        """
        self.iteration = 0
        self._done = False

        logger.info("ReAct loop started, user input: %s", user_input[:100])

        # Step 1: 放入用户消息
        self.context.add_user_message(user_input)

        # Step 2: 主循环
        while not self._done:
            self.iteration += 1
            logger.info("--- Iteration %d ---", self.iteration)

            # 达到最大迭代次数 → 强制终止
            if self.iteration > self.MAX_ITERATIONS:
                logger.warning("ReAct loop hit max iterations (%d)", self.MAX_ITERATIONS)
                return await self._force_conclusion()

            # 调用 LLM
            messages = self.context.get_messages()
            tools_schema = self.executor.registry.to_openai_schema()
            response = await self.llm.chat(messages, tools_schema)

            # 分支：工具调用 vs 最终回复
            if response.has_tool_calls:
                await self._handle_tool_calls(response)
            else:
                self._done = True
                return self._finalize(response)

        return "[Agent] 异常退出。"

    # ------------------------------------------------------------------
    # 工具调用处理
    # ------------------------------------------------------------------

    async def _handle_tool_calls(self, response: LLMResponse) -> None:
        """处理 LLM 的一批工具调用请求。

        流程：
          1. 解析 LLM 返回的 tool_calls → ToolCall 列表
          2. 将 assistant 消息（含 tool_calls）加入上下文
          3. 逐个执行工具
          4. 压缩结果并加入上下文
        """
        # 解析 tool_calls
        tool_calls = []
        for tc in response.tool_calls:
            try:
                arguments = json.loads(tc["function"]["arguments"])
            except json.JSONDecodeError:
                arguments = {}  # LLM 偶尔产出非法 JSON，用空参数兜底
            tool_calls.append(ToolCall(
                id=tc["id"],
                name=tc["function"]["name"],
                arguments=arguments,
            ))

        logger.info(
            "Executing %d tool(s): %s",
            len(tool_calls),
            [tc.name for tc in tool_calls],
        )

        # 把 assistant 消息加入上下文（包含 tool_calls 元数据）
        self.context.add_assistant_message(
            content=response.content,
            tool_calls=response.tool_calls,
        )

        # 执行工具
        results = await self.executor.execute_many(tool_calls)

        # 压缩并加入上下文
        for result in results:
            compressed_text = self.compressor.compress(result.name, result)

            # 构造 tool 消息的内容 —— 失败时保留错误信息方便 LLM 调整策略
            if result.success:
                tool_content = compressed_text
            else:
                tool_content = f"[工具执行失败] {result.error}\n\n{compressed_text}"

            self.context.add_tool_result(
                tool_call_id=result.tool_call_id,
                tool_name=result.name,
                content=tool_content,
            )

    # ------------------------------------------------------------------
    # 终止处理
    # ------------------------------------------------------------------

    def _finalize(self, response: LLMResponse) -> str:
        """正常终止：LLM 返回了纯文本最终答案。"""
        logger.info("ReAct loop finished successfully after %d iterations", self.iteration)
        return response.content or "(Agent 未返回内容)"

    async def _force_conclusion(self) -> str:
        """强制终止：达到最大迭代次数，要求 LLM 基于现有证据给出结论。"""
        self.context.add_user_message(
            "你已达到最大的工具调用轮数限制。"
            "请基于目前已收集的全部证据，给出当前的最佳诊断结论。"
            "如果证据不足以确定根因，请明确指出还需要哪些信息，"
            "并给出最可能的推测方向。"
        )
        messages = self.context.get_messages()
        # 不传 tools → 强制 LLM 只输出文本，不再尝试调用工具
        response = await self.llm.chat(messages, tools=None)
        return response.content or "(Agent 无法在迭代限制内完成诊断)"
