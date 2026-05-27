# Agent 核心模块：Investigator、LLM Client、ReAct Loop、Context 管理
from agent.models import DiagnosisRequest, DiagnosisResult, ToolCallTrace


def __getattr__(name: str):
    """懒加载需要 LLM SDK 依赖的入口类。"""
    if name == "DatabaseHolmesInvestigator":
        from agent.investigator import DatabaseHolmesInvestigator

        return DatabaseHolmesInvestigator
    raise AttributeError(f"module 'agent' has no attribute {name!r}")


__all__ = [
    "DatabaseHolmesInvestigator",
    "DiagnosisRequest",
    "DiagnosisResult",
    "ToolCallTrace",
]
