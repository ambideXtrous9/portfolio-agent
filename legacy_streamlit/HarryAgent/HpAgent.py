from langchain_core.tools import Tool
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import create_react_agent
from typing import TypedDict, Optional, Dict
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
import time
import streamlit as st
from dotenv import load_dotenv
import os
from HarryAgent.RouterAgent import classify_node


load_dotenv()

ddg_search = DuckDuckGoSearchRun()


try:
    if "GROQ_API_KEY" in st.secrets:
        os.environ["GROQ_API_KEY"] = st.secrets["GROQ_API_KEY"]
except Exception:
    pass

temperature = 0.7

from llm_utils import build_llm
llm = build_llm(temperature=temperature)


ddg_search_tool = Tool(
    name="DuckDuckGoSearch",
    func=ddg_search.invoke,  # Updated from .run() to .invoke() for v1.x compatibility
    description=(
        "Use this tool to perform a DuckDuckGo web search and return JSON-formatted results. "
        "Input: a search query string; Output: a JSON array of search results."
    )
)


# ---------------------------
# 🔄 State
# ---------------------------
class AgentState(TypedDict):
    topic: str
    research: Optional[str]
    mythology : Optional[str]
    draft: Optional[str]
    critique: Optional[str]
    approved: Optional[bool]
    review: Optional[str]
    classification: Dict[str, str]



from mcp_utils import get_pinecone_tools

async def researcher_node(state: AgentState) -> AgentState:
    query = state["topic"]
    try:
        tools = await get_pinecone_tools()
        if tools:
            prompt = (
                "You are an expert Harry Potter Lore Retrieval Agent connected to Pinecone via MCP tools.\n"
                "Use the Pinecone MCP tools (e.g. describe-index-stats, search-docs, rerank-documents) "
                "to research canonical facts for the query.\n"
                "Provide a clear, detailed summary of the findings."
            )
            agent = create_react_agent(llm, tools, prompt=prompt)
            response = await agent.ainvoke({"messages": [{"role": "user", "content": query}]})
            research_text = response["messages"][-1].content
        else:
            research_text = f"Canonical context for: {query}"
    except Exception as e:
        print(f"⚠️ Researcher node note: {e}")
        research_text = f"Context for topic: {query}"
    return {**state, "research": research_text}


# ---------------------------
# 🕉️ Mythology Agent
# ---------------------------
def mythology_node(state: AgentState) -> AgentState:
    prompt_content = (
        f"You are an expert in Indian ancient history, Hindu mythology, and the Harry Potter universe.\n"
        f"Topic: {state['topic']}\n\n"
        f"Domain Research Context:\n{state.get('research', '')}\n\n"
        f"Analyze the narrative, symbolic, and philosophical parallels between Indian Mythology and the Harry Potter universe for this topic."
    )
    try:
        response = llm.invoke([
            SystemMessage(content="You are an expert mythologist and literary analyst."),
            HumanMessage(content=prompt_content)
        ])
        mythology_content = response.content
    except Exception as e:
        print(f"⚠️ Mythology node LLM note: {e}")
        mythology_content = state.get("research", "")
    return {**state, "mythology": mythology_content}


# ---------------------------
# ✍️ Writer Agent
# ---------------------------
def writer_node(state: AgentState) -> AgentState:
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
        print(f"⚠️ Writer node LLM note: {e}")
        article_draft = f"## 📝 Article on {state['topic']}\n\n{state.get('mythology', '')}"
    return {**state, "draft": article_draft}


# ---------------------------
# 🧑‍⚖️ Critic Agent
# ---------------------------
def critic_node(state: AgentState) -> AgentState:
    try:
        response = llm.invoke([
            SystemMessage(content="You are a critical reviewer of literary comparisons."),
            HumanMessage(content=f"Briefly critique this article in 2 sentences:\n\n{state.get('draft', '')[:1000]}")
        ])
        critique_text = response.content
    except Exception as e:
        critique_text = "Article reviewed."
    
    return {**state, "critique": critique_text, "approved": True}


# ---------------------------
# 🔁 Conditional Flow
# ---------------------------
def check_approval(state: AgentState) -> str:
    return "end"


# ---------------------------
# 🌐 LangGraph Definition
# ---------------------------

def decide_start_node(state):
    if state.get('classification') and state.get('classification')['classification'] == "exit":
        return "end"
    elif state.get('classification') and state.get('classification')['classification'] == "generic":
        return "end"
    elif state.get('classification') and state.get('classification')['classification'] == "harry":
        return "harry"
    else:
        return "feedbackloop"


def GraphBuild(checkpointer):
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
    graph.add_conditional_edges("critic", check_approval, {
        "end": END,
        "mythologist": "mythologist"
    })

    return graph.compile(checkpointer=checkpointer)

