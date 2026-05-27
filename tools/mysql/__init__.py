"""
MySQL 工具集。

当前仓库还没有具体 MySQL 工具实现，这里先提供标准 toolset 工厂。
后续新增 explain / processlist / locks 等工具时，只需要加入
build_mysql_toolset 的 tools 列表。
"""

from __future__ import annotations

from tools.base import BaseTool
from tools.toolset import Toolset


def build_mysql_toolset(extra_tools: list[BaseTool] | None = None) -> Toolset:
    """构建 MySQL 诊断工具集。"""
    return Toolset(
        name="mysql",
        description="MySQL 只读诊断工具集，用于慢查询、执行计划、锁等待和表结构调查",
        tools=extra_tools or [],
    )
