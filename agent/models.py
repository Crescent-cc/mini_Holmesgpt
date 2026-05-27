"""
Agent 层的标准数据结构。

这些模型把一次数据库调查从“裸字符串问答”提升为可追踪的
Investigation：有输入、有证据、有工具调用轨迹、有最终报告。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DiagnosisRequest:
    """一次数据库诊断请求。"""

    question: str
    source: str = "cli"
    metadata: dict[str, Any] = field(default_factory=dict)
    workflow: str | None = None


@dataclass
class ToolCallTrace:
    """工具调用轨迹，用于报告、审计和调试。"""

    tool_call_id: str
    tool_name: str
    success: bool
    evidence_id: str | None = None
    error: str | None = None


@dataclass
class DiagnosisResult:
    """一次诊断的最终结果。"""

    answer: str
    request: DiagnosisRequest
    tool_calls: list[ToolCallTrace] = field(default_factory=list)
    evidence_ids: list[str] = field(default_factory=list)
    iterations: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)
