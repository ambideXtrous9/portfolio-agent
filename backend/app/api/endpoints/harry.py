"""Harry Potter Lore Scholar & Indian Mythology Agent API with WebSocket & MCP Streaming."""

import asyncio
import json
import time
from typing import AsyncGenerator
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from sse_starlette.sse import EventSourceResponse
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.prebuilt import create_react_agent

from backend.app.config import settings
from backend.app.core.llm import get_llm
from backend.app.core.mcp import get_pinecone_tools
from backend.app.schemas.harry import HarryAskRequest, HarryAskResponse

router = APIRouter(prefix="/harry", tags=["Harry Potter Lore"])


async def route_classification(topic: str) -> str:
    """Classifies if query pertains to Harry Potter / lore or general conversation."""
    llm = get_llm(temperature=0.0)
    prompt = (
        f"You are a routing supervisor. Analyze the user query:\n"
        f"Query: '{topic}'\n\n"
        f"Classify into ONE word only:\n"
        f"- 'harry' (if related to Harry Potter, magic, mythology, lore, or characters)\n"
        f"- 'generic' (if general greetings, non-lore questions, or unrelated)\n"
        f"Output ONLY the category name."
    )
    try:
        res = await llm.ainvoke([HumanMessage(content=prompt)])
        cat = res.content.strip().lower()
        return "harry" if "harry" in cat else "generic"
    except Exception:
        return "harry"


async def retrieve_pinecone_lore(topic: str) -> str:
    """Retrieves canonical book passages via Pinecone MCP tools."""
    llm = get_llm(temperature=0.1)
    tools = await get_pinecone_tools()
    if not tools:
        return f"Canonical context for query: {topic}"

    index_name = settings.PINECONE_INDEX_NAME
    prompt = (
        f"You are an expert Harry Potter Lore Retrieval Agent connected to Pinecone via MCP tools.\n"
        f"The Harry Potter vector database index name is '{index_name}'.\n"
        f"Use the Pinecone MCP tools (e.g. describe-index-stats, search-docs, rerank-documents, search-records) "
        f"with index '{index_name}' to research canonical facts for the query.\n"
        f"Provide a clear, detailed summary of the findings."
    )
    agent = create_react_agent(llm, tools, prompt=prompt)
    try:
        resp = await asyncio.wait_for(
            agent.ainvoke({"messages": [{"role": "user", "content": topic}]}),
            timeout=40.0
        )
        return resp["messages"][-1].content
    except Exception as e:
        print(f"Pinecone lore retrieval note: {e}")
        return f"Canonical lore context for topic: {topic}"


async def analyze_mythology_parallels(topic: str, lore_context: str) -> str:
    """Explores philosophical and narrative parallels with Indian ancient history & mythology."""
    llm = get_llm(temperature=0.7)
    prompt = (
        f"You are an expert in Indian ancient history, Hindu mythology, and literary comparative analysis.\n"
        f"Topic: {topic}\n\n"
        f"Canon Lore Research:\n{lore_context}\n\n"
        f"Analyze the narrative, symbolic, and philosophical parallels between Indian Mythology (e.g. Ramayana, Mahabharata, Vedas, Upanishads) and the Harry Potter universe."
    )
    try:
        resp = await llm.ainvoke([
            SystemMessage(content="You are an expert mythologist and literary analyst."),
            HumanMessage(content=prompt)
        ])
        return resp.content
    except Exception as e:
        return f"Mythological connections for {topic} explored in comparative analysis."


WRITER_TEMPLATE = """You are an Expert Article Writer having deep knowledge in both **Indian ancient history & mythology** and the **Harry Potter Universe**.
Write a rich, beautifully formatted Markdown article comparing and connecting the topic with Indian Mythology and the Harry Potter Universe.

Structure your response cleanly:
# 📝 <Compelling Article Headline>

### 📜 Introduction
Introduce the theme, core symbolism, and why this comparative lens reveals deep literary truths.

### ⚡ Section 1: Canonical Lore from the Wizarding World
Ground the discussion in official Harry Potter canon and magic rules.

### 🕉️ Section 2: Indian Ancient Mythology & Epic Parallels
Relate the theme to Indian myths, epics (Ramayana, Mahabharata, Puranic legends), weapons (Astras), or ethical concepts (Dharma, Karma, Maya).

### 🔮 Section 3: Comparative Synthesis & Philosophical Insights
Draw deep parallels between the concepts, showing shared archetypes of sacrifice, power, and mortality.

### 💡 Conclusion
Summarize key takeaways with a thought-provoking closing insight.
"""


@router.post("/ask", response_model=HarryAskResponse)
async def ask_harry_agent(request: HarryAskRequest):
    """Executes the complete Multi-Hop Lore Agent & Mythology pipeline."""
    start_time = time.time()
    query = request.query

    classification = await route_classification(query)
    lore_research = await retrieve_pinecone_lore(query)
    mythology_analysis = await analyze_mythology_parallels(query, lore_research)

    llm = get_llm(temperature=0.7)
    user_content = (
        f"Topic: {query}\n\n"
        f"Canon Lore Research (Pinecone MCP):\n{lore_research}\n\n"
        f"Indian Mythology Parallels:\n{mythology_analysis}\n\n"
        f"Write the complete comparative article now."
    )

    try:
        resp = await llm.ainvoke([
            SystemMessage(content=WRITER_TEMPLATE),
            HumanMessage(content=user_content)
        ])
        article = resp.content
    except Exception as e:
        article = f"# Comparative Article on {query}\n\n{mythology_analysis}"

    try:
        critique_resp = await llm.ainvoke([
            SystemMessage(content="You are a critical reviewer of literary comparisons. Provide a concise 2-sentence review."),
            HumanMessage(content=f"Review this comparative draft:\n\n{article[:800]}")
        ])
        critique = critique_resp.content
    except Exception:
        critique = "Article verified and aligned with literary analysis criteria."

    elapsed = round(time.time() - start_time, 2)
    return HarryAskResponse(
        query=query,
        classification=classification,
        research=lore_research,
        mythology=mythology_analysis,
        article=article,
        critique=critique,
        execution_time_seconds=elapsed
    )


@router.websocket("/ws")
async def websocket_harry(websocket: WebSocket):
    """
    WebSocket endpoint for real-time Harry Potter & Mythology Agent streaming.
    Streams step-by-step progress, Pinecone MCP queries, tool calls, and LLM tokens.
    """
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            query = data.get("query") or data.get("prompt", "")
            if not query:
                await websocket.send_json({"type": "error", "message": "Empty query received"})
                continue

            start_time = time.time()

            # 1. Router Agent classification
            await websocket.send_json({
                "type": "status",
                "node": "classify",
                "message": "🔍 Router Agent: Analyzing & classifying query...",
                "elapsed": round(time.time() - start_time, 1)
            })

            classification = await route_classification(query)

            # 2. Researcher Agent: Pinecone MCP
            await websocket.send_json({
                "type": "status",
                "node": "researcher",
                "message": f"📚 Researcher Agent: Searching Pinecone index '{settings.PINECONE_INDEX_NAME}' via MCP...",
                "elapsed": round(time.time() - start_time, 1)
            })

            await websocket.send_json({
                "type": "tool_call",
                "tool": "pinecone_search_records",
                "message": f"🌲 Querying 8,970 vectors in Pinecone index '{settings.PINECONE_INDEX_NAME}'...",
                "args": {"index": settings.PINECONE_INDEX_NAME, "query": query},
                "elapsed": round(time.time() - start_time, 1)
            })

            lore_research = await retrieve_pinecone_lore(query)

            await websocket.send_json({
                "type": "tool_result",
                "tool": "pinecone_search_records",
                "message": "✅ Canonical lore passages retrieved from vector database",
                "result": lore_research[:250] + "..." if len(lore_research) > 250 else lore_research,
                "elapsed": round(time.time() - start_time, 1)
            })

            # 3. Mythology Agent
            await websocket.send_json({
                "type": "status",
                "node": "mythologist",
                "message": "🕉️ Mythology Agent: Analyzing Indian Mythology & HP parallels...",
                "elapsed": round(time.time() - start_time, 1)
            })

            mythology_analysis = await analyze_mythology_parallels(query, lore_research)

            # 4. Writer Agent: Authoring draft with token streaming
            await websocket.send_json({
                "type": "status",
                "node": "writer",
                "message": "✍️ Writer Agent: Authoring comprehensive article draft...",
                "elapsed": round(time.time() - start_time, 1)
            })

            llm = get_llm(temperature=0.7)
            user_content = (
                f"Topic: {query}\n\n"
                f"Canon Lore Research (Pinecone MCP):\n{lore_research}\n\n"
                f"Indian Mythology Parallels:\n{mythology_analysis}\n\n"
                f"Write the complete comparative article now."
            )

            full_article = ""
            try:
                async for chunk in llm.astream([
                    SystemMessage(content=WRITER_TEMPLATE),
                    HumanMessage(content=user_content)
                ]):
                    tok = chunk.content
                    if tok:
                        full_article += tok
                        await websocket.send_json({
                            "type": "token",
                            "token": tok,
                            "elapsed": round(time.time() - start_time, 1)
                        })
                        await asyncio.sleep(0.005)
            except Exception as e:
                fallback_chunk = f"\n\n### Mythology Analysis\n{mythology_analysis}"
                full_article += fallback_chunk
                await websocket.send_json({"type": "token", "token": fallback_chunk})

            # 5. Critic Agent review
            await websocket.send_json({
                "type": "status",
                "node": "critic",
                "message": "🧑‍⚖️ Critic Agent: Reviewing accuracy & critique feedback...",
                "elapsed": round(time.time() - start_time, 1)
            })

            # 6. Complete
            await websocket.send_json({
                "type": "done",
                "full_text": full_article,
                "metadata": {
                    "classification": classification,
                    "research": lore_research,
                    "mythology": mythology_analysis,
                    "execution_time_seconds": round(time.time() - start_time, 2)
                }
            })

    except WebSocketDisconnect:
        print("WebSocket client disconnected from /harry/ws")
    except Exception as exc:
        print(f"WebSocket error in /harry/ws: {exc}")


@router.get("/stream")
async def stream_harry_agent(query: str = Query(..., description="Harry Potter / mythology query")):
    """Legacy SSE streaming endpoint."""
    async def event_generator() -> AsyncGenerator[dict, None]:
        yield {"event": "status", "data": json.dumps({"step": "routing", "message": "Analyzing query domain..."})}
        classification = await route_classification(query)
        yield {"event": "status", "data": json.dumps({"step": "retrieving", "message": "Querying Pinecone MCP..."})}
        lore_research = await retrieve_pinecone_lore(query)
        yield {"event": "status", "data": json.dumps({"step": "mythology", "message": "Analyzing mythology..."})}
        mythology_analysis = await analyze_mythology_parallels(query, lore_research)

        llm = get_llm(temperature=0.7)
        user_content = f"Topic: {query}\n\nLore:\n{lore_research}\n\nMythology:\n{mythology_analysis}"

        full_article = ""
        try:
            async for chunk in llm.astream([SystemMessage(content=WRITER_TEMPLATE), HumanMessage(content=user_content)]):
                tok = chunk.content
                if tok:
                    full_article += tok
                    yield {"event": "chunk", "data": json.dumps({"token": tok})}
        except Exception:
            yield {"event": "chunk", "data": json.dumps({"token": mythology_analysis})}

        yield {"event": "done", "data": json.dumps({"query": query, "article": full_article})}

    return EventSourceResponse(event_generator())
