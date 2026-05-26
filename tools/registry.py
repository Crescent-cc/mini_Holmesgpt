"""
工具注册中心 —— 管理所有可用工具的注册、查找和导出。

职责：
  1. 注册 / 注销工具
  2. 按名称查找工具（O(1)）
  3. 生成 OpenAI function calling 格式的工具列表

用法：
    registry = ToolRegistry()
    registry.register(ExplainQuery())
    tools_schema = registry.to_openai_schema()  # → list[dict] 可直接传给 LLM
"""

from __future__ import annotations

from tools.base import BaseTool


class ToolRegistry:
    """工具注册中心。

    所有工具必须在 ReAct Loop 启动前注册完成。
    运行时只读访问（get / list / to_openai_schema），不需要加锁。
    """

    def __init__(self):
        self._tools: dict[str, BaseTool] = {}

    # ---- 注册 ----

    def register(self, tool: BaseTool) -> None:
        """注册一个工具。同名工具会覆盖旧工具（不报错）。"""
        if not tool.name:
            raise ValueError(f"Tool object {tool!r} has no name")
        self._tools[tool.name] = tool

    def register_many(self, tools: list[BaseTool]) -> None:
        """批量注册工具。"""
        for tool in tools:
            self.register(tool)

    # ---- 查询 ----

    def get(self, name: str) -> BaseTool | None:
        """按名称查找工具，不存在返回 None。"""
        return self._tools.get(name)

    def list(self) -> list[BaseTool]:
        """列出所有已注册的工具（按注册顺序）。"""
        return list(self._tools.values())

    # ---- 导出 ----

    def to_openai_schema(self) -> list[dict]:
        """导出为 OpenAI function calling 格式的工具列表。

        这个返回值可以直接作为 Chat Completions API 的 tools 参数。
        """
        return [tool.to_openai_function() for tool in self._tools.values()]

    # ---- 辅助 ----

    @property
    def tool_names(self) -> list[str]:
        """返回所有已注册工具的名称列表（方便日志和调试）。"""
        return list(self._tools.keys())

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        return name in self._tools
