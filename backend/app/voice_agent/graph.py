"""LangGraph ReAct agent state machine and VoiceGraphWrapper streaming bridge for LiveKit Voice Agent."""

import logging
import os
from typing import Annotated, TypedDict

from dotenv import find_dotenv, load_dotenv
from langchain_core.messages import BaseMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import START, StateGraph
from langgraph.graph.message import add_messages
try:
    from langfuse import observe
except ImportError:
    def observe(*args, **kwargs):
        def decorator(fn):
            return fn
        if args and callable(args[0]):
            return args[0]
        return decorator

from langgraph.prebuilt import ToolNode, tools_condition
from backend.app.voice_agent.tools import agent_tools

load_dotenv(find_dotenv())

logger = logging.getLogger("livekit.agent_graph")

try:
    from backend.app.config import settings
    GROQ_API_KEY = os.getenv("GROQ_API_KEY") or getattr(settings, "GROQ_API_KEY", "")
    GROQ_MODEL = os.getenv("GROQ_MODEL") or getattr(settings, "DEFAULT_MODEL", "openai/gpt-oss-20b")
except Exception:
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")


class AgentState(TypedDict):
    """Typed state dictionary representing the conversational message history."""
    messages: Annotated[list[BaseMessage], add_messages]


SYSTEM_PROMPT = """You are a helpful, voice-first AI assistant powered by Groq and LiveKit.
Rules for your voice responses:
1. Speak naturally, warmly, and concisely (1 to 3 sentences maximum).
2. Never use markdown formatting (no asterisks, bolding, bullet points, headers, or tables).
3. If the user asks about the weather, ALWAYS call the `get_weather` tool.
4. If the user asks for news, current events, or recent headlines, ALWAYS call the `get_news` tool.
5. Once tool results are available, synthesize a natural, spoken summary.
6. For general conversation or greetings, reply directly without invoking tools."""


def get_groq_llm():
    """Instantiate and return the Groq chat model configured for low-latency tool calling."""
    return ChatGroq(
        model=GROQ_MODEL,
        groq_api_key=GROQ_API_KEY,
        temperature=0.4,
        reasoning_effort="low",
        max_tokens=250,
    )


@observe(name="langgraph_agent_node")
async def agent_node(state: AgentState) -> dict:
    """Core reasoning node: evaluates context and determines tool calls or direct replies."""
    raw_messages = state["messages"]

    # Context window: keep the last 6 messages to avoid latency and token bloat
    trimmed_history = raw_messages[-6:] if len(raw_messages) > 6 else raw_messages

    system_msg = SystemMessage(content=SYSTEM_PROMPT)
    eval_messages = [system_msg] + [m for m in trimmed_history if not isinstance(m, SystemMessage)]

    logger.info("Agent node evaluating %d messages in context", len(eval_messages))

    llm = get_groq_llm()
    llm_with_tools = llm.bind_tools(agent_tools)

    response = await llm_with_tools.ainvoke(eval_messages)

    if hasattr(response, "tool_calls") and response.tool_calls:
        logger.info(
            "Agent decided to call %d tool(s): %s",
            len(response.tool_calls),
            [tc["name"] for tc in response.tool_calls],
        )
    else:
        logger.info("Agent generating direct spoken reply")

    return {"messages": [response]}


def build_langgraph_workflow():
    """Build, wire, and compile the LangGraph ReAct agent workflow."""
    workflow = StateGraph(AgentState)

    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(agent_tools))

    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges("agent", tools_condition)
    workflow.add_edge("tools", "agent")

    return workflow.compile()


class VoiceGraphWrapper:
    """
    Streaming bridge wrapper around compiled LangGraph workflow.
    
    Filters out internal ToolMessages and 'tools' node outputs during streaming
    so that only conversational assistant response tokens reach the TTS pipeline.
    """
    def __init__(self, graph):
        self._graph = graph

    def __getattr__(self, name):
        return getattr(self._graph, name)

    async def astream(self, *args, **kwargs):
        async for item in self._graph.astream(*args, **kwargs):
            if isinstance(item, tuple) and len(item) == 2:
                token, meta = item
                if meta.get("langgraph_node") == "tools" or type(token).__name__ == "ToolMessage":
                    continue
            yield item
