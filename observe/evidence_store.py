"""
证据存储 —— 保存每次工具调用的完整原始结果。

与 ObservationCompressor 的关系：
  - Compressor 产出压缩摘要 → 进入 LLM 上下文
  - EvidenceStore 保存完整结果 → 供最终报告引用，不进入 LLM 上下文

当前为占位模块，MVP 阶段原始结果在压缩后被丢弃。
后续将实现内存版（dict）和持久化版（SQLite）。
"""
