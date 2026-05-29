import { RiskLevel, ToolCall } from "../tools/base.ts";

export const ApprovalDecision = {
  Approved: "approved",
  Denied: "denied",
  NeedsReview: "needs_review",
} as const;

export type ApprovalDecision =
  (typeof ApprovalDecision)[keyof typeof ApprovalDecision];

export class ApprovalResult {
  decision: ApprovalDecision;
  reason: string;

  constructor(decision: ApprovalDecision, reason = "") {
    this.decision = decision;
    this.reason = reason;
  }

  get approved(): boolean {
    return this.decision === ApprovalDecision.Approved;
  }
}

export class ApprovalPolicy {
  async evaluate(_toolCall: ToolCall, riskLevel: RiskLevel): Promise<ApprovalResult> {
    if (riskLevel === RiskLevel.Dangerous) {
      return new ApprovalResult(
        ApprovalDecision.Denied,
        "DANGEROUS 级别工具默认拒绝自动执行",
      );
    }
    return new ApprovalResult(
      ApprovalDecision.Approved,
      `${riskLevel} 级别工具允许执行`,
    );
  }
}
