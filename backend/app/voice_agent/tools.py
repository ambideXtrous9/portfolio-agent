"""Agent Tools (@tool definitions) for Weather and News querying in LiveKit Voice Agent.
Features multi-tier fallback architecture:
- Weather: OpenWeather 2.5 -> wttr.in (instant, zero-key, global) -> Web search
- News: Tavily AI Search -> Google News Live RSS (zero-key, live) -> DuckDuckGo Search
"""

import logging
import os
import urllib.parse
import xml.etree.ElementTree as ET
import httpx
try:
    from langfuse import observe
except ImportError:
    def observe(*args, **kwargs):
        def decorator(fn):
            return fn
        if args and callable(args[0]):
            return args[0]
        return decorator

try:
    from langchain_community.tools import DuckDuckGoSearchRun
    from langchain_community.utilities import DuckDuckGoSearchAPIWrapper
    ddg_news_tool = DuckDuckGoSearchRun(api_wrapper=DuckDuckGoSearchAPIWrapper(max_results=3, source="news"))
    ddg_text_tool = DuckDuckGoSearchRun(api_wrapper=DuckDuckGoSearchAPIWrapper(max_results=3, source="text"))
except ImportError:
    ddg_news_tool = None
    ddg_text_tool = None

from dotenv import find_dotenv, load_dotenv
from langchain_core.tools import tool

load_dotenv(find_dotenv())

logger = logging.getLogger("livekit.agent_tools")

# Retrieve weather & search API keys from settings or environment
try:
    from backend.app.config import settings
    OPENWEATHER_API_KEY = (
        getattr(settings, "WEATHER_API_KEY", None)
        or os.getenv("OPENWEATHER_API_KEY")
        or os.getenv("WEATHER_API_KEY")
    )
    TAVILY_API_KEY = getattr(settings, "TAVILY_API_KEY", None) or os.getenv("TAVILY_API_KEY")
except Exception:
    OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY") or os.getenv("WEATHER_API_KEY")
    TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

@observe(name="get_weather")
async def get_weather(city: str) -> str:
    """Get the current weather and temperature for a given city or location."""
    sanitized_city = (city or "").strip().strip("'\"")
    if not sanitized_city:
        logger.warning("get_weather received empty or whitespace city name.")
        return "Please specify a city name to check the weather."

    logger.info("Executing get_weather tool for: '%s'", sanitized_city)

    # --------------------------------------------------------------------------
    # Tier 1: OpenWeather API (if configured)
    # --------------------------------------------------------------------------
    if OPENWEATHER_API_KEY:
        try:
            url = "https://api.openweathermap.org/data/2.5/weather"
            async with httpx.AsyncClient(timeout=4.5) as client:
                resp = await client.get(
                    url,
                    params={"q": sanitized_city, "appid": OPENWEATHER_API_KEY, "units": "metric"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    name = data.get("name", sanitized_city)
                    country = data.get("sys", {}).get("country", "")
                    loc_label = f"{name}, {country}" if country else name
                    desc = data["weather"][0]["description"]
                    temp = round(data["main"]["temp"])
                    humidity = data["main"]["humidity"]
                    logger.info("OpenWeather API success for %s: %s, %s°C", loc_label, desc, temp)
                    return f"Current weather in {loc_label}: {desc}, {temp}°C, humidity {humidity}%."
        except Exception as e:
            logger.warning("OpenWeather request failed (%s), proceeding to wttr.in fallback", e)

    # --------------------------------------------------------------------------
    # Tier 2: wttr.in fallback (Instant, zero-key, global weather service)
    # --------------------------------------------------------------------------
    try:
        encoded_city = urllib.parse.quote_plus(sanitized_city)
        wttr_url = f"https://wttr.in/{encoded_city}?format=j1"
        async with httpx.AsyncClient(timeout=4.5) as client:
            resp = await client.get(wttr_url, headers={"User-Agent": "curl/7.68.0"})
            if resp.status_code == 200:
                data = resp.json()
                condition = data.get("current_condition", [{}])[0]
                desc = condition.get("weatherDesc", [{}])[0].get("value", "Clear").strip()
                temp = condition.get("temp_C", "--")
                feels_like = condition.get("FeelsLikeC", temp)
                humidity = condition.get("humidity", "--")
                wind = condition.get("windspeedKmph", "0")
                logger.info("wttr.in fallback success for %s: %s, %s°C", sanitized_city, desc, temp)
                return (
                    f"Current weather in {sanitized_city.title()}: {desc}, {temp}°C "
                    f"(feels like {feels_like}°C), humidity {humidity}%, wind {wind} km/h."
                )
    except Exception as e:
        logger.warning("wttr.in weather fallback failed for '%s': %s", sanitized_city, e)

    # --------------------------------------------------------------------------
    # Tier 3: Search fallback for weather
    # --------------------------------------------------------------------------
    try:
        weather_search_query = f"current weather in {sanitized_city}"
        if TAVILY_API_KEY:
            async with httpx.AsyncClient(timeout=4.5) as client:
                tav_resp = await client.post(
                    "https://api.tavily.com/search",
                    json={"api_key": TAVILY_API_KEY, "query": weather_search_query, "max_results": 1},
                )
                if tav_resp.status_code == 200:
                    results = tav_resp.json().get("results", [])
                    if results:
                        snippet = results[0].get("content", "").strip()[:180]
                        return f"Weather report for {sanitized_city.title()}: {snippet}"
    except Exception as e:
        logger.warning("Search fallback for weather failed: %s", e)

    return f"I could not retrieve weather data for '{sanitized_city}' at this moment. Please check the city name."


@tool
@observe(name="get_news")
async def get_news(query: str) -> str:
    """Get the latest real-time news headlines and summaries on a specific topic or keyword."""
    sanitized_query = (query or "").strip().strip("'\"")
    if not sanitized_query:
        logger.warning("get_news received empty or whitespace query.")
        return "Please specify a topic or keyword to search for news."

    logger.info("Executing get_news tool for query: '%s'", sanitized_query)

    # --------------------------------------------------------------------------
    # Tier 1: Tavily AI Search (dedicated for LLMs, high-speed, zero IP block)
    # --------------------------------------------------------------------------
    if TAVILY_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=4.5) as client:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": TAVILY_API_KEY,
                        "query": sanitized_query,
                        "max_results": 3,
                        "search_depth": "basic",
                    },
                )
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    if results:
                        summaries = [
                            f"{item.get('title', 'News')}: {item.get('content', '')[:140]}"
                            for item in results[:3]
                        ]
                        logger.info("get_news success via Tavily AI Search for: '%s'", sanitized_query)
                        return "Recent news: " + " | ".join(summaries)
        except Exception as e:
            logger.warning("Tavily AI Search failed for '%s': %s", sanitized_query, e)

    # --------------------------------------------------------------------------
    # Tier 2: Google News RSS (Live, real-time breaking news, zero rate limits)
    # --------------------------------------------------------------------------
    try:
        encoded_q = urllib.parse.quote_plus(sanitized_query)
        rss_url = f"https://news.google.com/rss/search?q={encoded_q}&hl=en-US&gl=US&ceid=US:en"
        async with httpx.AsyncClient(timeout=4.5) as client:
            resp = await client.get(rss_url)
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                items = root.findall(".//item")[:3]
                if items:
                    headlines = [
                        item.find("title").text
                        for item in items
                        if item.find("title") is not None and item.find("title").text
                    ]
                    if headlines:
                        logger.info("get_news success via Google News RSS for: '%s'", sanitized_query)
                        return "Top breaking headlines: " + " | ".join(headlines)
    except Exception as e:
        logger.warning("Google News RSS fallback failed for '%s': %s", sanitized_query, e)

    # --------------------------------------------------------------------------
    # Tier 3: DuckDuckGo Search fallback
    # --------------------------------------------------------------------------
    try:
        import ddgs
        with ddgs.DDGS() as d:
            res = list(d.news(sanitized_query, max_results=3))
            if res:
                summaries = [
                    f"{item.get('title', '')}: {item.get('body', '')[:130]}"
                    for item in res
                ]
                logger.info("get_news success via direct DDGS news for: '%s'", sanitized_query)
                return "Latest headlines: " + " | ".join(summaries)
    except Exception as e:
        logger.warning("Direct ddgs news search failed: %s", e)

    if ddg_news_tool:
        try:
            results = await ddg_news_tool.ainvoke(sanitized_query)
            if results and "No good DuckDuckGo search result" not in results and "403 Forbidden" not in results:
                logger.info("get_news success via ddg_news_tool for: '%s'", sanitized_query)
                return results
        except Exception as e:
            logger.warning("DuckDuckGo news wrapper failed for '%s': %s", sanitized_query, e)

    if ddg_text_tool:
        try:
            fallback_query = f"{sanitized_query} news"
            results = await ddg_text_tool.ainvoke(fallback_query)
            if results and "No good DuckDuckGo search result" not in results:
                logger.info("get_news success via ddg_text_tool for: '%s'", fallback_query)
                return results
        except Exception as e:
            logger.error("All news search fallbacks exhausted for '%s': %s", sanitized_query, e)


    return f"I couldn't retrieve recent news for '{sanitized_query}' at this time."


agent_tools = [get_weather, get_news]
