"""
Database Holmes 调查入口。

HolmesGPT 的核心入口是“创建 investigator → 组装 issue/context →
执行 agentic loop → 返回带证据的 investigation result”。本模块按这个
思想提供一个轻量版，避免让调用方直接拼 ContextManager / ReActLoop。
"""

from __future__ import annotations

from agent.context import ContextManager
from agent.llm_client import LLMClient
from agent.models import DiagnosisRequest, DiagnosisResult
from agent.prompts import PromptBuilder, SYSTEM_PROMPT
from agent.react_loop import ReActLoop
from observe.compressor import ObservationCompressor
from observe.evidence_store import EvidenceStore, InMemoryEvidenceStore
from tools.executor import ToolExecutor


class DatabaseHolmesInvestigator:
    """面向数据库故障的一次性调查编排器。"""

    def __init__(
        self,
        llm_client: LLMClient,
        tool_executor: ToolExecutor,
        compressor: ObservationCompressor | None = None,
        evidence_store: EvidenceStore | None = None,
        prompt_builder: PromptBuilder | None = None,
        max_iterations: int | None = None,
    ):
        self.llm = llm_client
        self.executor = tool_executor
        self.compressor = compressor or ObservationCompressor()
        self.evidence_store = evidence_store or InMemoryEvidenceStore()
        self.prompt_builder = prompt_builder or PromptBuilder(base_prompt=SYSTEM_PROMPT)
        self.max_iterations = max_iterations

    async def investigate(self, request: DiagnosisRequest | str) -> DiagnosisResult:
        """执行一次完整诊断。"""
        if isinstance(request, str):
            request = DiagnosisRequest(question=request)

        system_prompt = self.prompt_builder.build(
            request=request,
            toolsets=self.executor.registry.toolset_descriptions,
        )
        context = ContextManager(system_prompt=system_prompt)
        loop = ReActLoop(
            llm_client=self.llm,
            tool_executor=self.executor,
            context_manager=context,
            compressor=self.compressor,
            evidence_store=self.evidence_store,
        )
        if self.max_iterations is not None:
            loop.max_iterations = self.max_iterations

        return await loop.run_result(request)
