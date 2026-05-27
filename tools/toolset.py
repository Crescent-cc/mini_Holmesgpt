"""
Toolset 抽象。

HolmesGPT 把 Prometheus、Kubernetes、Grafana 等数据源组织成 toolsets。
当前项目先用同样的边界承载 MySQL 诊断工具，后续可以按需增加
PostgreSQL、Redis、云厂商监控等 toolset，而不用改 agent 主循环。
"""

from __future__ import annotations

from dataclasses import dataclass, field

from tools.base import BaseTool


@dataclass
class Toolset:
    """一组来自同一数据源或同一诊断域的工具。"""

    name: str
    description: str
    tools: list[BaseTool] = field(default_factory=list)
    enabled: bool = True

    def list_tools(self) -> list[BaseTool]:
        """返回当前启用 toolset 的工具列表。"""
        if not self.enabled:
            return []
        return self.tools

    def describe(self) -> dict:
        """给 prompt 和调试界面使用的简短描述。"""
        return {
            "name": self.name,
            "description": self.description,
            "enabled": self.enabled,
            "tools": [tool.name for tool in self.list_tools()],
        }
