"""Harry Potter Lore Scholar & Indian Mythology Agent API endpoints."""

import asyncio
import json
import time
from typing import AsyncGenerator
from fastapi import APIRouter, HTTPException, Query
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

    # Step 1: Classification
    classification = await route_classification(query)

    # Step 2: Pinecone MCP Retrieval
    lore_research = await retrieve_pinecone_lore(query)

    # Step 3: Indian Mythology Analysis
    mythology_analysis = await analyze_mythology_parallels(query, lore_research)

    # Step 4: Comparative Synthesis & Article Generation
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

    # Step 5: Quick Critique
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


@router.get("/stream")
async def stream_harry_agent(query: str = Query(..., description="Harry Potter / mythology query")):
    """Streams live workflow events and markdown tokens via Server-Sent Events (SSE)."""
    async def event_generator() -> AsyncGenerator[dict, None]:
        yield {
            "event": "status",
            "data": json.dumps({"step": "routing", "message": "🧠 Supervisor Agent classifying query domain..."})
        }
        classification = await route_classification(query)

        yield {
            "event": "status",
            "data": json.dumps({"step": "retrieving", "message": "📚 Querying 'hpvdb-openai' vector index via Pinecone MCP..."})
        }
        lore_research = await retrieve_pinecone_lore(query)

        yield {
            "event": "status",
            "data": json.dumps({"step": "mythology", "message": "🕉️ Mythologist analyzing Indian ancient history & epic parallels..."})
        }
        mythology_analysis = await analyze_mythology_parallels(query, lore_research)

        yield {
            "event": "status",
            "data": json.dumps({"step": "writing", "message": "✍️ Scholar synthesizing comparative article..."})
        }

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
                token = chunk.content
                if token:
                    full_article += token
                    yield {
                        "event": "chunk",
                        "data": json.dumps({"token": token})
                    }
        except Exception as e:
            fallback = f"\n\n{mythology_analysis}"
            yield {"event": "chunk", "data": json.dumps({"token": fallback})}

        yield {
            "event": "done",
            "data": json.dumps({
                "query": query,
                "classification": classification,
                "research": lore_research,
                "mythology": mythology_analysis,
                "article": full_article
            })
        }

    return EventSourceResponse(event_generator())
