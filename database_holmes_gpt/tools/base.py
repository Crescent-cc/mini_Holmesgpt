"""
工具基类 —— BaseTool 抽象类和公共数据结构。

ToolCall 和 ToolResult 是两个纯数据结构，在 registry 和 executor 之间传递。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# 风险等级
# ---------------------------------------------------------------------------

class RiskLevel(Enum):
    """工具执行的风险分级。

    Safe      — 只读查询，可直接执行（如 EXPLAIN、SHOW CREATE TABLE）
    Approval  — 需人工确认的操作（如生成索引 DDL、KILL 会话）
    Dangerous — 默认拒绝的操作（如 DROP INDEX、ALTER TABLE）
    """
    SAFE = "safe"
    APPROVAL = "approval"
    DANGEROUS = "dangerous"


# ---------------------------------------------------------------------------
# 工具基类
# ---------------------------------------------------------------------------

class BaseTool(ABC):
    """工具基类 —— 所有 MySQL 诊断工具均继承此类。

    子类需要：
      1. 设置 name / description / parameters（JSON Schema 格式）
      2. 实现 run(**kwargs) -> Any 异步方法
      3. 可选设置 risk_level（默认 SAFE）

    parameters 格式遵循 JSON Schema（draft-07），兼容 OpenAI function calling：
      {
        "type": "object",
        "properties": {
          "arg_name": {
            "type": "string",
            "description": "参数说明"
          }
        },
        "required": ["arg_name"]
      }
    """

    name: str = ""
    description: str = ""
    parameters: dict = field(default_factory=lambda: {
        "type": "object", "properties": {}, "required": []
    })
    risk_level: RiskLevel = RiskLevel.SAFE

    @abstractmethod
    async def run(self, **kwargs) -> Any:
        """执行工具逻辑，返回结果。

        返回值可以是任意可 JSON 序列化的 Python 对象（dict / list / str 等），
        框架会自动处理序列化和错误包装。
        """
        ...

    def to_openai_function(self) -> dict:
        """生成单个工具的 OpenAI function calling 描述。"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            }
        }


# ---------------------------------------------------------------------------
# 工具调用 / 结果的数据结构
# ---------------------------------------------------------------------------

@dataclass
class ToolCall:
    """LLM 返回的单个工具调用请求。

    id        — OpenAI 生成的 tool_call_id，用于关联 ToolResult
    name      — 工具名称
    arguments — 解析后的参数字典（已从 JSON 字符串 parse 为 Python dict）
    """
    id: str
    name: str
    arguments: dict


@dataclass
class ToolResult:
    """工具执行结果。

    tool_call_id — 对应 ToolCall.id，用于匹配 Assistant 消息中的 tool_calls
    name         — 工具名称（追溯用）
    success      — 是否执行成功
    data         — 成功时的返回数据
    error        — 失败时的错误信息
    """
    tool_call_id: str
    name: str
    success: bool
    data: Any = None
    error: str | None = None
