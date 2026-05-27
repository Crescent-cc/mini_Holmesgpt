"""
证据存储 —— 保存每次工具调用的完整原始结果。

与 ObservationCompressor 的关系：
  - Compressor 产出压缩摘要 → 进入 LLM 上下文
  - EvidenceStore 保存完整结果 → 供最终报告引用，不进入 LLM 上下文

这对应 HolmesGPT 里“调查过程留痕”的思想：LLM 只看摘要，系统保留
完整 evidence，最终报告和审计可以回看原始数据。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import uuid4


@dataclass
class EvidenceRecord:
    """一次工具调用留下的完整证据。"""

    id: str
    tool_name: str
    tool_call_id: str
    data: Any = None
    error: str | None = None
    success: bool = True
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = field(default_factory=dict)


class EvidenceStore(Protocol):
    """证据存储协议，便于后续替换为 SQLite / 对象存储。"""

    def save_tool_result(self, result: Any, metadata: dict[str, Any] | None = None) -> EvidenceRecord:
        ...

    def get(self, evidence_id: str) -> EvidenceRecord | None:
        ...

    def list(self) -> list[EvidenceRecord]:
        ...


class InMemoryEvidenceStore:
    """内存版证据存储，适合 CLI / 测试 / MVP。"""

    def __init__(self):
        self._records: dict[str, EvidenceRecord] = {}

    def save_tool_result(self, result: Any, metadata: dict[str, Any] | None = None) -> EvidenceRecord:
        record = EvidenceRecord(
            id=f"ev_{uuid4().hex[:12]}",
            tool_name=getattr(result, "name", "unknown_tool"),
            tool_call_id=getattr(result, "tool_call_id", ""),
            data=getattr(result, "data", None),
            error=getattr(result, "error", None),
            success=bool(getattr(result, "success", False)),
            metadata=metadata or {},
        )
        self._records[record.id] = record
        return record

    def get(self, evidence_id: str) -> EvidenceRecord | None:
        return self._records.get(evidence_id)

    def list(self) -> list[EvidenceRecord]:
        return list(self._records.values())

    def reset(self) -> None:
        self._records.clear()
