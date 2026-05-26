"""
诊断 Workflow 基类。

Workflow 与 Agent 模式的区别：
  - Agent：LLM 自主决定工具调用顺序（灵活但不可控）
  - Workflow：按固定的步骤流程排查（可控但不够灵活）
  - Hybrid：Workflow 控制主流程，LLM 负责局部分析（后续实现）

当前为占位模块，MVP 阶段优先实现 Agent 模式。
"""
