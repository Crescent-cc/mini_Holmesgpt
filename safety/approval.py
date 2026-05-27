"""
人工审批流程 —— HITL (Human-In-The-Loop) 审批机制。

当前实现先提供可插拔策略接口。默认策略保持 MVP 体验：
SAFE / APPROVAL 自动通过，DANGEROUS 拒绝。后续 CLI、API 或企业审批
系统只需要替换 ApprovalPolicy。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from tools.base import RiskLevel, ToolCall


class ApprovalDecision(str, Enum):
    APPROVED = "approved"
    DENIED = "denied"
    NEEDS_REVIEW = "needs_review"


@dataclass
class ApprovalResult:
    decision: ApprovalDecision
    reason: str = ""

    @property
    def approved(self) -> bool:
        return self.decision == ApprovalDecision.APPROVED


class ApprovalPolicy:
    """工具执行前的审批策略。"""

    async def evaluate(self, tool_call: ToolCall, risk_level: RiskLevel) -> ApprovalResult:
        if risk_level == RiskLevel.DANGEROUS:
            return ApprovalResult(
                decision=ApprovalDecision.DENIED,
                reason="DANGEROUS 级别工具默认拒绝自动执行",
            )
        return ApprovalResult(
            decision=ApprovalDecision.APPROVED,
            reason=f"{risk_level.value} 级别工具允许执行",
        )
