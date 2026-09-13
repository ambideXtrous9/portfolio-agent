"""Unified MultiServerMCPClient manager for Airbnb and Pinecone."""

import os
import shutil
from typing import List, Optional
from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient
from backend.app.config import settings

_client: Optional[MultiServerMCPClient] = None


def get_mcp_client() -> Optional[MultiServerMCPClient]:
    """Returns singleton MultiServerMCPClient instance for Airbnb and Pinecone."""
    global _client
    if _client is None:
        npx_bin = shutil.which("npx") or "npx"
        pinecone_key = settings.PINECONE_API_KEY

        servers = {
            "airbnb": {
                "transport": "stdio",
                "command": npx_bin,
                "args": ["-y", "@openbnb/mcp-server-airbnb", "--ignore-robots-txt"],
                "env": {**os.environ, "AIRBNB_BASE_URL": "https://www.airbnb.co.in"},
            }
        }
        if pinecone_key:
            servers["pinecone"] = {
                "transport": "stdio",
                "command": npx_bin,
                "args": ["-y", "@pinecone-database/mcp"],
                "env": {**os.environ, "PINECONE_API_KEY": pinecone_key},
            }

        try:
            _client = MultiServerMCPClient(servers)
        except Exception as e:
            print(f"⚠️ MultiServerMCPClient initialization error: {e}")
            return None
    return _client


async def get_airbnb_tools() -> List[BaseTool]:
    """Returns Airbnb tools from MultiServerMCPClient."""
    client = get_mcp_client()
    if not client:
        return []
    try:
        return await client.get_tools(server_name="airbnb")
    except Exception as e:
        print(f"⚠️ Failed to load Airbnb MCP tools: {e}")
        return []


async def get_pinecone_tools() -> List[BaseTool]:
    """Returns Pinecone tools from MultiServerMCPClient."""
    client = get_mcp_client()
    if not client or "pinecone" not in client.connections:
        return []
    try:
        return await client.get_tools(server_name="pinecone")
    except Exception as e:
        print(f"⚠️ Failed to load Pinecone MCP tools: {e}")
        return []
