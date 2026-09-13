"""LiveKit + LangGraph Tool-Calling Voice Agent package integrated in ambideXtrous AI Portfolio."""

from backend.app.voice_agent.graph import (
    AgentState,
    VoiceGraphWrapper,
    agent_node,
    build_langgraph_workflow,
)
from backend.app.voice_agent.telemetry import (
    flush_langfuse,
    is_langfuse_configured,
    setup_langfuse,
)
from backend.app.voice_agent.tools import agent_tools, get_news, get_weather


def __getattr__(name: str):
    if name in ("server", "EntryPoint", "VoiceAgent"):
        from backend.app.voice_agent import agent
        return getattr(agent, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "server",
    "EntryPoint",
    "VoiceAgent",
    "AgentState",
    "agent_node",
    "build_langgraph_workflow",
    "VoiceGraphWrapper",
    "get_weather",
    "get_news",
    "agent_tools",
    "setup_langfuse",
    "flush_langfuse",
    "is_langfuse_configured",
]
