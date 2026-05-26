"""
观测压缩器 —— 防止工具返回的原始数据撑爆 LLM 上下文窗口。

背景：
  MySQL 工具返回的数据可能非常大（processlist 上千行、慢查询几百条、
  表结构几十列），直接塞进 LLM 上下文会导致：
    - Token 消耗过快，成本激增
    - 超出模型上下文窗口，请求失败
    - LLM 注意力被海量数据稀释，诊断质量下降

压缩策略：
  - 不同工具类型匹配不同的压缩策略（通过 tool_name 模式匹配）
  - 默认兜底策略：JSON 序列化后按最大字符数截断
  - 可注册自定义策略扩展

根据 README 设计的压缩规则：
  | 数据类型     | 压缩方式                               |
  |-------------|---------------------------------------|
  | 慢查询       | 按 fingerprint 聚合，保留 Top N        |
  | 表结构       | 只保留相关字段和索引                    |
  | EXPLAIN     | 只保留 type, key, rows, filtered, Extra|
  | Processlist | 按状态聚合，只保留长时间查询            |
"""

from __future__ import annotations

import json
import fnmatch
from typing import Any, Callable


class ObservationCompressor:
    """观测压缩器 —— 将工具原始结果压缩为 LLM 友好的摘要文本。

    工作流程：
      1. 接收原始工具结果（dict / list / ToolResult）
      2. 按 tool_name 匹配压缩策略
      3. 返回压缩后的字符串，直接作为 tool_result 的内容传入 LLM 上下文

    用法：
        compressor = ObservationCompressor(max_chars=800)
        summary = compressor.compress("explain_query", raw_result)
    """

    # 默认最大输出字符数
    DEFAULT_MAX_CHARS = 800

    def __init__(self, max_chars: int | None = None):
        """
        Args:
            max_chars: 压缩后输出的最大字符数，超出则截断。默认 800。
        """
        self.max_chars = max_chars or self.DEFAULT_MAX_CHARS
        # 策略注册表：fnmatch 模式 → 压缩函数
        # 匹配时按注册顺序检查，因此 "*" 应最后注册（作为兜底）
        self._strategies: dict[str, Callable[[dict], str]] = {}
        self._register_builtin_strategies()

    def register(self, pattern: str, strategy: Callable[[dict], str]) -> None:
        """注册自定义压缩策略。

        Args:
            pattern: 工具名匹配模式，支持 fnmatch 通配符。
                     精确匹配优先于通配符。
                     示例: "explain_*", "*slow_query*", "*"（兜底）
            strategy: 压缩函数，签名为 (data: dict) -> str。
        """
        self._strategies[pattern] = strategy

    def compress(self, tool_name: str, raw_result: Any) -> str:
        """压缩工具执行结果。

        Args:
            tool_name: 工具名称，用于匹配压缩策略
            raw_result: 工具返回的原始数据（dict、list、或 ToolResult 对象）
        Returns:
            str: 压缩后的文本，可直接作为 LLM 的 tool_result content
        """
        # 提取实际数据：如果传入的是 ToolResult，取 data 或 error
        if hasattr(raw_result, 'data') and hasattr(raw_result, 'error'):
            if raw_result.error:
                return f"[TOOL ERROR] {raw_result.error}"
            data = raw_result.data
        elif isinstance(raw_result, dict):
            data = raw_result
        elif isinstance(raw_result, list):
            data = {"results": raw_result}
        else:
            data = {"result": raw_result}

        # 匹配策略并执行压缩
        strategy = self._match_strategy(tool_name)
        compressed = strategy(data)
        return compressed

    # ------------------------------------------------------------------
    # 内部方法
    # ------------------------------------------------------------------

    def _match_strategy(self, tool_name: str) -> Callable[[dict], str]:
        """按 tool_name 匹配首个满足模式的压缩策略。"""
        for pattern, strategy in self._strategies.items():
            if fnmatch.fnmatch(tool_name, pattern):
                return strategy
        return self._compress_default  # 不应发生，但保留兜底

    def _register_builtin_strategies(self) -> None:
        """注册内置的压缩策略。注意顺序：具体模式在前，通用模式在后。"""
        # EXPLAIN / EXPLAIN ANALYZE —— 只保留关键字段
        self.register("explain_*", self._compress_explain)
        # 列表类结果（慢查询、processlist 等）—— 保留 Top N + 总数
        self.register("*slow_query*", self._compress_list)
        self.register("*processlist*", self._compress_list)
        self.register("*list_*", self._compress_list)
        self.register("*get_*", self._compress_list)
        self.register("*show_*", self._compress_list)
        self.register("*rank_*", self._compress_list)
        # 通用兜底 —— 必须最后注册
        self.register("*", self._compress_default)

    # ------------------------------------------------------------------
    # 内置压缩策略
    # ------------------------------------------------------------------

    def _compress_default(self, data: dict | list) -> str:
        """默认策略：JSON 序列化后按最大字符数截断。

        如果超出 max_chars，保留头部 + 尾部各一半的空间，
        中间插入省略提示，让 LLM 知道数据不完整。
        """
        text = json.dumps(data, ensure_ascii=False, indent=2, default=str)
        if len(text) <= self.max_chars:
            return text

        # 超出限制：头部 + 省略标记 + 尾部
        half = self.max_chars // 2
        head = text[:self.max_chars - half - 50]  # 预留省略标记的空间
        tail = text[-half:]
        return (
            f"{head}\n\n"
            f"... [省略中间部分，原始共 {len(text)} 字符，已截断] ...\n\n"
            f"{tail}"
        )

    def _compress_explain(self, data: dict | list) -> str:
        """EXPLAIN 专用：只保留 type / key / rows / filtered / Extra 五个关键字段。

        这些字段足以判断全表扫描、索引使用情况、排序方式等。
        """
        KEY_FIELDS = ["table", "type", "possible_keys", "key", "key_len",
                       "rows", "filtered", "Extra"]

        if isinstance(data, list):
            filtered = []
            for row in data:
                filtered.append({
                    k: row.get(k) for k in KEY_FIELDS if k in row
                })
            output = filtered
        elif isinstance(data, dict):
            output = {k: data.get(k) for k in KEY_FIELDS if k in data}
        else:
            output = data

        text = json.dumps(output, ensure_ascii=False, indent=2, default=str)
        if len(text) > self.max_chars:
            return self._compress_default(data)  # 仍然太大的话走默认截断
        return text

    def _compress_list(self, data: dict | list, top_n: int = 5) -> str:
        """列表类结果通用策略：保留前 top_n 条 + 总数统计。

        适用于 slow_query、processlist、table_schema 等返回列表的工具。
        """
        items = data if isinstance(data, list) else data.get("results", [data])

        if not isinstance(items, list):
            return self._compress_default(data)

        total = len(items)
        shown = items[:top_n]

        summary = {
            "total_count": total,
            "shown_count": min(total, top_n),
            "top_results": shown,
        }

        text = json.dumps(summary, ensure_ascii=False, indent=2, default=str)
        if len(text) > self.max_chars:
            # 连 Top 5 都太大，进一步缩减
            summary["top_results"] = items[:3]
            text = json.dumps(summary, ensure_ascii=False, indent=2, default=str)

        if len(text) > self.max_chars:
            return self._compress_default(summary)

        return text
