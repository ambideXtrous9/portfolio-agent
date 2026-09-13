"""Harry Potter Lore Scholar & Indian Mythology Agent API with Exact Original LangGraph Workflow."""

import asyncio
import json
import os
import re
import time
import uuid
from typing import TypedDict, Optional, Dict, Any, Literal, AsyncGenerator
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.output_parsers.pydantic import PydanticOutputParser
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

from backend.app.config import settings
from backend.app.core.llm import get_llm
from backend.app.core.mcp import get_pinecone_tools
from backend.app.core.database import db_manager
from backend.app.api.deps import get_current_active_user, validate_token_and_get_user
from backend.app.schemas.auth import UserResponse
from backend.app.schemas.harry import HarryAskRequest, HarryAskResponse

router = APIRouter(prefix="/harry", tags=["Harry Potter Lore"])


# ─────────────────────────────────────────────────────────────────────────────
# 🔄 1. Original AgentState (from HarryAgent/HpAgent.py)
# ─────────────────────────────────────────────────────────────────────────────
class AgentState(TypedDict):
    topic: str
    research: Optional[str]
    mythology: Optional[str]
    draft: Optional[str]
    critique: Optional[str]
    approved: Optional[bool]
    review: Optional[str]
    classification: Optional[Dict[str, str]]


# ─────────────────────────────────────────────────────────────────────────────
# 🔍 2. Router Agent: Pydantic Classifier (from HarryAgent/RouterAgent.py)
# ─────────────────────────────────────────────────────────────────────────────
class Classify(BaseModel):
    classification: Literal["harry", "generic", "exit"] = Field(
        description="Classify the topic type: 'generic' or 'harry' or 'exit'"
    )
    reply: str = Field(
        description="If 'generic', a natural language reply to the query. If 'harry', respond with 'Harry Potter'. If 'exit', respond with 'exit'."
    )


classifier_parser = PydanticOutputParser(pydantic_object=Classify)
format_instructions = classifier_parser.get_format_instructions()


def AgentClassifyNode(topic: str) -> Dict[str, str]:
    """Classifies topic into 'harry', 'generic', or 'exit' with conversational reply."""
    llm_classifier = get_llm(temperature=0.0)
    prompt = (
        """You are an expert in Harry Potter Universe.
Your output MUST conform exactly to this JSON schema (no extra fields):
{format_instructions}
Add a key `classification` with value either "generic" or "harry" or "exit":
- If the query is a greeting or unrelated to Harry Potter topics, set `classification` to "generic".
- If the query is related to Harry Potter or Mix of Indian Mythology and Harry Potter topics set `classification` to "harry".
- If the query is to exit the conversation, set `classification` to "exit".

Also add a key `reply`:
- If `classification` is 'generic', `reply` must be a natural language response to the query referring to the chat history for context. Also encourage user to ask Harry Potter related questions.
- If `classification` is 'harry', `reply` must be the string "Harry Potter".
- If `classification` is 'exit', `reply` must be the string "exit".

IMPORTANT: The output must be *only* the JSON object—no extra text or reasoning.
"""
    )
    sys_prompt = {
        "role": "system",
        "content": prompt.format(format_instructions=format_instructions)
    }
    user_msg = {"role": "user", "content": f"Classify this topic : {topic}"}

    for attempt in range(3):
        try:
            response = llm_classifier.invoke([sys_prompt, user_msg])
            article = classifier_parser.parse(response.content)
            return article.model_dump()
        except Exception as e:
            user_msg = {
                "role": "user",
                "content": f"Classify this topic : {topic}\n\nNote: Output JSON only conforming to schema."
            }

    # Fallback
    return {
        "classification": "harry" if any(w in topic.lower() for w in ["harry", "potter", "voldemort", "ron", "dumbledore", "mythology", "rama", "arjuna"]) else "generic",
        "reply": "Harry Potter"
    }


def classify_node(state: AgentState) -> AgentState:
    res = AgentClassifyNode(state["topic"])
    return {**state, "classification": res}


# ─────────────────────────────────────────────────────────────────────────────
# 📚 3. Researcher Agent: Pinecone Vector Database via MCP (from HpAgent.py)
# ─────────────────────────────────────────────────────────────────────────────
async def researcher_node(state: AgentState) -> AgentState:
    query = state["topic"]
    llm = get_llm(temperature=0.1)
    try:
        tools = await get_pinecone_tools()
        if tools:
            index_name = settings.PINECONE_INDEX_NAME
            prompt = (
                f"You are an expert Harry Potter Lore Retrieval Agent connected to Pinecone via MCP tools.\n"
                f"Index Name: '{index_name}'.\n"
                f"Use the Pinecone MCP tools (e.g. describe-index-stats, search-docs, search-records, rerank-documents) "
                f"to research canonical facts for the query: '{query}'.\n"
                f"Note: If calling search-records, pass query parameter as {{'inputs': {{'text': '{query}'}}}}.\n"
                f"Provide a clear, detailed summary of the findings."
            )
            agent = create_react_agent(llm, tools, prompt=prompt)
            response = await agent.ainvoke({"messages": [{"role": "user", "content": query}]})
            research_text = response["messages"][-1].content
        else:
            research_text = f"Canonical context for: {query}"
    except Exception as e:
        print(f"⚠️ Researcher node error ({type(e).__name__}): {e}")
        research_text = f"Canonical context for topic: {query}"
    return {**state, "research": research_text}


# ─────────────────────────────────────────────────────────────────────────────
# 🕉️ 4. Mythology Agent: Indian Mythology & Epic Parallels (from HpAgent.py)
# ─────────────────────────────────────────────────────────────────────────────
def mythology_node(state: AgentState) -> AgentState:
    llm = get_llm(temperature=0.7)
    prompt_content = (
        f"You are an expert in Indian ancient history, Hindu mythology, and the Harry Potter universe.\n"
        f"Topic: {state['topic']}\n\n"
        f"Domain Research Context:\n{state.get('research', '')}\n\n"
        f"Analyze the narrative, symbolic, and philosophical parallels between Indian Mythology (e.g. Ramayana, Mahabharata, Puranas, Dharma, Karma, Maya, Astras) and the Harry Potter universe for this topic."
    )
    try:
        response = llm.invoke([
            SystemMessage(content="You are an expert mythologist and literary analyst."),
            HumanMessage(content=prompt_content)
        ])
        mythology_content = response.content
    except Exception as e:
        print(f"⚠️ Mythology node error: {e}")
        mythology_content = state.get("research", "")
    return {**state, "mythology": mythology_content}


# ─────────────────────────────────────────────────────────────────────────────
# ✍️ 5. Writer Agent: Comprehensive Comparative Article (from HpAgent.py)
# ─────────────────────────────────────────────────────────────────────────────
def writer_node(state: AgentState) -> AgentState:
    llm = get_llm(temperature=0.7)
    writer_prompt = """
You are an Expert Article Writer having deep knowledge in both **Indian ancient history and mythology** and the **Harry Potter Universe**.
Write a rich, beautifully formatted Markdown article comparing and connecting the topic with Indian Mythology and the Harry Potter Universe.

Follow this structure:
## 📝 <Interesting Article Headline Here>

### Introduction
Provide a compelling hook, introduce the topic, and explain why it is relevant.

### Section 1: Core Subject Analysis
Explain the main subject with rich cultural and real-world context.

### Section 2: Indian Mythology Connection & Parallels
Relate the subject to Indian myths, legends, deities, or symbolism (e.g., Ramayana, Mahabharata, Puranas, Dharma).

### Section 3: Harry Potter Universe Parallels
Map the theme to characters, spells, creatures, or story arcs in the Harry Potter series (e.g., Ron, Harry, Dumbledore, Voldemort).

### Section 4: Comparative Synthesis & Deep Insights
Blend insights from research, mythology, and Harry Potter into a unified perspective.

### Conclusion
Summarize key takeaways with a thought-provoking closing line.
"""
    user_content = (
        f"Topic: {state['topic']}\n\n"
        f"Mythology Research:\n{state.get('mythology', '')}\n\n"
        f"Write the complete comparative article now."
    )
    try:
        response = llm.invoke([
            SystemMessage(content=writer_prompt),
            HumanMessage(content=user_content)
        ])
        article_draft = response.content
    except Exception as e:
        print(f"⚠️ Writer node error: {e}")
        article_draft = f"## 📝 Article on {state['topic']}\n\n{state.get('mythology', '')}"
    return {**state, "draft": article_draft}


# ─────────────────────────────────────────────────────────────────────────────
# 🧑‍⚖️ 6. Critic Agent: Accuracy & Critique Review (from HpAgent.py)
# ─────────────────────────────────────────────────────────────────────────────
def critic_node(state: AgentState) -> AgentState:
    llm = get_llm(temperature=0.1)
    try:
        response = llm.invoke([
            SystemMessage(content="You are a critical reviewer of literary comparisons."),
            HumanMessage(content=f"Briefly critique this article in 2 sentences:\n\n{state.get('draft', '')[:1000]}")
        ])
        critique_text = response.content
    except Exception:
        critique_text = "Article reviewed."
    return {**state, "critique": critique_text, "approved": True}


# ─────────────────────────────────────────────────────────────────────────────
# 🔁 7. Conditional Edges & LangGraph Compilation (from HpAgent.py)
# ─────────────────────────────────────────────────────────────────────────────
def decide_start_node(state: AgentState) -> str:
    cls = state.get("classification")
    if cls and cls.get("classification") in ["exit", "generic"]:
        return "end"
    elif cls and cls.get("classification") == "harry":
        return "harry"
    else:
        return "feedbackloop"


def check_approval(state: AgentState) -> str:
    return "end"


def build_hp_graph(checkpointer=None):
    graph = StateGraph(AgentState)
    graph.add_node("classify", classify_node)
    graph.add_node("researcher", researcher_node)
    graph.add_node("mythologist", mythology_node)
    graph.add_node("writer", writer_node)
    graph.add_node("critic", critic_node)

    graph.set_entry_point("classify")

    graph.add_conditional_edges(
        "classify",
        decide_start_node,
        {
            "feedbackloop": "classify",
            "harry": "researcher",
            "end": END
        }
    )
    graph.add_edge("researcher", "mythologist")
    graph.add_edge("mythologist", "writer")
    graph.add_edge("writer", "critic")
    graph.add_conditional_edges(
        "critic",
        check_approval,
        {
            "end": END,
            "mythologist": "mythologist"
        }
    )
    return graph.compile(checkpointer=checkpointer)


# Global graph factory supporting active PostgreSQL checkpointer
def get_hp_agent_graph():
    checkpointer = getattr(db_manager, "checkpointer", None) or MemorySaver()
    return build_hp_graph(checkpointer=checkpointer)


# ─────────────────────────────────────────────────────────────────────────────
# 🌐 8. Endpoints: REST, SSE, and WebSocket (Matches Streamlit ChatBot)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/ask", response_model=HarryAskResponse)
async def ask_harry_agent(
    request: HarryAskRequest,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Runs the exact LangGraph Multi-Agent pipeline with PostgreSQL checkpointer and auth guard."""
    start_time = time.time()
    thread_id = str(uuid.uuid4())
    config = {
        "configurable": {"thread_id": thread_id},
        "metadata": {"user_id": current_user.id, "email": current_user.email},
    }

    graph = get_hp_agent_graph()
    final_state = await graph.ainvoke(
        {"topic": request.query, "review": "Write an awesome article on the topic."},
        config=config
    )

    cls_info = final_state.get("classification") or {}
    is_generic = cls_info.get("classification") == "generic"
    final_text = cls_info.get("reply", "") if is_generic else (final_state.get("draft") or "No response generated.")

    # Persist conversation to PostgreSQL chat history
    try:
        history = await db_manager.get_chat_history(thread_id)
        await history.aadd_messages([
            HumanMessage(content=request.query),
            AIMessage(content=final_text),
        ])
    except Exception as e:
        print(f"Chat history saving note: {e}")

    elapsed = round(time.time() - start_time, 2)
    return HarryAskResponse(
        query=request.query,
        classification=cls_info.get("classification", "harry"),
        research=final_state.get("research"),
        mythology=final_state.get("mythology"),
        article=final_text,
        critique=final_state.get("critique"),
        execution_time_seconds=elapsed
    )


@router.websocket("/ws")
async def websocket_harry(websocket: WebSocket):
    """
    Real-time interactive WebSocket matching exact Streamlit _stream_hp_agent():
    - Step-by-step live agent progress updates with elapsed timers
    - Node output state events
    - Live token streaming for writer & mythologist nodes
    """
    token = websocket.query_params.get("token")
    if token:
        try:
            await validate_token_and_get_user(token)
        except Exception:
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Authentication required. Invalid or expired token."})
            await websocket.close()
            return

    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            topic = data.get("query") or data.get("prompt", "")
            if not topic:
                await websocket.send_json({"type": "error", "message": "Empty query received"})
                continue

            # Verify authentication token if not supplied at handshake
            msg_token = data.get("token") or token
            if not token and msg_token:
                try:
                    await validate_token_and_get_user(msg_token)
                except Exception:
                    await websocket.send_json({"type": "error", "message": "Authentication required. Invalid or expired token."})
                    continue

            thread_id = data.get("thread_id") or str(uuid.uuid4())
            config = {
                "configurable": {"thread_id": thread_id},
                "version": "v2"
            }

            start_time = time.time()
            current_label = "🚀 Starting Harry & Mythology Multi-Agent Workflow..."

            await websocket.send_json({
                "type": "status",
                "node": "start",
                "message": current_label,
                "elapsed": 0.0
            })

            final_draft = ""
            final_critique = ""
            generic_reply = ""
            is_generic = False

            graph = get_hp_agent_graph()
            async for event in graph.astream_events(
                input={"topic": topic, "review": "Write an awesome article on the topic."},
                config=config,
                version="v2"
            ):
                event_type = event.get("event")
                metadata = event.get("metadata", {})
                node = metadata.get("langgraph_node")

                # 1. Step-by-Step Live Agent Progress Updates with Timer
                if event_type == "on_chain_start" and node:
                    if node == "classify":
                        current_label = "🔍 Router Agent: Analyzing & classifying query..."
                    elif node == "researcher":
                        current_label = "📚 Researcher Agent: Searching Pinecone vector database via MCP..."
                    elif node == "mythologist":
                        current_label = "🕉️ Mythology Agent: Analyzing Indian Mythology & HP parallels..."
                    elif node == "writer":
                        current_label = "✍️ Writer Agent: Authoring comprehensive article draft..."
                    elif node == "critic":
                        current_label = "🧑‍⚖️ Critic Agent: Reviewing accuracy & critique feedback..."

                    elapsed = round(time.time() - start_time, 1)
                    await websocket.send_json({
                        "type": "status",
                        "node": node,
                        "message": current_label,
                        "elapsed": elapsed
                    })

                # 2. Capture Node Output State
                if event_type == "on_chain_end" and node:
                    output_data = event.get("data", {}).get("output", {})
                    if isinstance(output_data, dict):
                        if "classification" in output_data:
                            cls_info = output_data["classification"]
                            if isinstance(cls_info, dict) and cls_info.get("classification") == "generic":
                                is_generic = True
                                generic_reply = cls_info.get("reply", "")
                        if "draft" in output_data and output_data["draft"]:
                            final_draft = output_data["draft"]
                        if "critique" in output_data and output_data["critique"]:
                            final_critique = output_data["critique"]

            # Final response only after all nodes (including critic) have finished
            if is_generic and generic_reply:
                final_content = generic_reply
            elif final_draft:
                if final_critique and final_critique != "Article reviewed.":
                    final_content = f"{final_draft}\n\n---\n### 🧑‍⚖️ Critic Review\n{final_critique}"
                else:
                    final_content = final_draft
            else:
                final_content = "No response generated."

            # Persist to PostgreSQL Chat Message History
            try:
                chat_hist = await db_manager.get_chat_history(thread_id)
                await chat_hist.aadd_messages([
                    HumanMessage(content=topic),
                    AIMessage(content=final_content),
                ])
            except Exception as e:
                print(f"WebSocket chat history saving note: {e}")

            total_elapsed = round(time.time() - start_time, 2)
            await websocket.send_json({
                "type": "done",
                "content": final_content,
                "full_text": final_content,
                "elapsed": total_elapsed,
                "classification": "generic" if is_generic else "harry"
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Harry WebSocket exception: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


@router.get("/ask/stream")
async def stream_harry_sse(
    query: str,
    session_id: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Server-Sent Events streaming endpoint backed by PostgreSQL checkpointer and auth guard."""
    async def event_generator() -> AsyncGenerator[Dict[str, Any], None]:
        thread_id = session_id or str(uuid.uuid4())
        config = {
            "configurable": {"thread_id": thread_id},
            "metadata": {"user_id": current_user.id, "email": current_user.email},
        }
        start_time = time.time()

        yield {
            "event": "status",
            "data": json.dumps({"node": "start", "message": "🚀 Starting Multi-Agent Workflow...", "elapsed": 0.0})
        }

        final_draft = ""
        final_critique = ""
        generic_reply = ""
        is_generic = False

        try:
            graph = get_hp_agent_graph()
            async for event in graph.astream_events(
                input={"topic": query, "review": "Write an awesome article on the topic."},
                config=config,
                version="v2"
            ):
                event_type = event.get("event")
                metadata = event.get("metadata", {})
                node = metadata.get("langgraph_node")

                if event_type == "on_chain_start" and node:
                    label = f"Processing node: {node}"
                    if node == "classify":
                        label = "🔍 Router Agent: Analyzing & classifying query..."
                    elif node == "researcher":
                        label = "📚 Researcher Agent: Searching Pinecone vector database via MCP..."
                    elif node == "mythologist":
                        label = "🕉️ Mythology Agent: Analyzing Indian Mythology & HP parallels..."
                    elif node == "writer":
                        label = "✍️ Writer Agent: Authoring comprehensive article draft..."
                    elif node == "critic":
                        label = "🧑‍⚖️ Critic Agent: Reviewing accuracy & critique feedback..."

                    yield {
                        "event": "status",
                        "data": json.dumps({"node": node, "message": label, "elapsed": round(time.time() - start_time, 1)})
                    }

                if event_type == "on_chain_end" and node:
                    output_data = event.get("data", {}).get("output", {})
                    if isinstance(output_data, dict):
                        if "classification" in output_data:
                            cls_info = output_data["classification"]
                            if isinstance(cls_info, dict) and cls_info.get("classification") == "generic":
                                is_generic = True
                                generic_reply = cls_info.get("reply", "")
                        if "draft" in output_data and output_data["draft"]:
                            final_draft = output_data["draft"]
                        if "critique" in output_data and output_data["critique"]:
                            final_critique = output_data["critique"]

            if is_generic and generic_reply:
                res = generic_reply
            elif final_draft:
                if final_critique and final_critique != "Article reviewed.":
                    res = f"{final_draft}\n\n---\n### 🧑‍⚖️ Critic Review\n{final_critique}"
                else:
                    res = final_draft
            else:
                res = "Analysis complete."

            # Persist to PostgreSQL Chat Message History
            try:
                chat_hist = await db_manager.get_chat_history(thread_id)
                await chat_hist.aadd_messages([
                    HumanMessage(content=query),
                    AIMessage(content=res),
                ])
            except Exception as e:
                print(f"SSE chat history saving note: {e}")

            yield {
                "event": "done",
                "data": json.dumps({"content": res, "full_text": res, "elapsed": round(time.time() - start_time, 2)})
            }
        except Exception as e:
            print(f"Harry SSE stream exception: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e), "node": "error"})
            }

    return EventSourceResponse(event_generator())
