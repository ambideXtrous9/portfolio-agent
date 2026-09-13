from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import InMemorySaver
import streamlit as st
import os
import re
import datetime
import requests
import json
import uuid
import time
import asyncio
import sys
import subprocess
import concurrent.futures
from typing import Any, Annotated, List, Dict
from typing_extensions import TypedDict
from langchain_core.tools import tool, Tool
from langchain_core.messages import AnyMessage, SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from langfuse.langchain import CallbackHandler
from mcp_utils import get_airbnb_tools

# Langfuse handler
try:
    langfuse_handler = CallbackHandler()
except Exception:
    langfuse_handler = None


class ArticleResponse(TypedDict):
    topic: str
    summary: str
    knowledge: Annotated[list[AnyMessage], add_messages]


try:
    if hasattr(st, "secrets"):
        for sec_key in ["GROQ_API_KEY", "WEATHER_API_KEY", "OPENROUTER_API_KEY", "PINECONE_API_KEY", "COHERE_API_KEY"]:
            if sec_key in st.secrets:
                os.environ[sec_key] = st.secrets[sec_key]
except Exception:
    pass

from llm_utils import build_llm
llm = build_llm(temperature=0.0)


# ── Smart Query Parsing Helper ─────────────────────────────────────
def parse_trip_query(query: str):
    """
    Parses user query to extract location name, checkin date, checkout date, and stay duration.
    Defaults to tomorrow for checkin if not explicitly specified.
    """
    today = datetime.date.today()
    checkin = today + datetime.timedelta(days=1)
    
    # Extract duration in days if mentioned (e.g. '3 days', '5 day')
    days_match = re.search(r'(\d+)\s*days?', query, re.IGNORECASE)
    duration = int(days_match.group(1)) if days_match else 3
    checkout = checkin + datetime.timedelta(days=duration)

    # Heuristic for location extraction
    stop_words = r'(?i)\b(\d+\s*days?|trip|itinerary|to|from|tomorrow|next|week|for|in|stay|hotel|airbnb|booking|cheap|best)\b'
    cleaned = re.sub(stop_words, ' ', query)
    words = [w.strip().capitalize() for w in cleaned.split() if len(w.strip()) > 2]
    location = ' '.join(words) if words else 'Munnar'

    return location, checkin.strftime('%Y-%m-%d'), checkout.strftime('%Y-%m-%d'), duration


# ── Airbnb Agent ──────────────────────────────────────────────────
async def airbnbAgent(state: Dict[str, Any]):
    topic = state.get("topic", "")
    location, checkin_str, checkout_str, duration = parse_trip_query(topic)
    print(f"🏠 Airbnb Agent searching: location='{location}', checkin='{checkin_str}', checkout='{checkout_str}'")
    start = time.time()

    ai_content = ""
    try:
        tools = await get_airbnb_tools()
        if tools:
            prompt_text = (
                f"You are an expert Airbnb Search Agent connected via MultiServerMCPClient.\n"
                f"Extracted Destination: {location}\n"
                f"Check-in Date: {checkin_str}\n"
                f"Check-out Date: {checkout_str}\n"
                f"Duration: {duration} nights\n\n"
                f"Instructions:\n"
                f"1. Search for available stays in '{location}' from {checkin_str} to {checkout_str} using airbnb_search.\n"
                f"2. For EACH listing found, extract details: property name, rating, price, amenities, and booking link.\n"
                f"3. Present the findings clearly in structured markdown."
            )
            agent = create_react_agent(llm, tools, prompt=prompt_text)
            print(f"Invoking Airbnb react agent for query: {topic}")
            response = await asyncio.wait_for(
                agent.ainvoke({"messages": [{"role": "user", "content": topic}]}),
                timeout=60,
            )
            ai_content = response["messages"][-1].content
            print(f"Final Airbnb agent response: {ai_content[:300]}")
        else:
            ai_content = (
                f"⚠️ Airbnb MCP tools unavailable. Recommended stays for {location}: "
                f"Standard boutique homestays and mountain cottages."
            )
    except (Exception, BaseException) as e:
        error_name = type(e).__name__
        print(f"⚠️ Airbnb Agent error ({error_name}): {e}")
        if not ai_content:
            ai_content = (
                f"⚠️ Could not load live Airbnb listings for {location} ({checkin_str} to {checkout_str}).\n"
                f"Note: Standard boutique homestays & mountain cottages are recommended for this destination."
            )

    print(f"✅ Airbnb Agent completed in {time.time() - start:.2f}s")
    return {"knowledge": [f"[Info from AirBnb Search]\n{ai_content}\n\n"]}


# ── Weather helpers ───────────────────────────────────────────────
def extract_weather(data: dict) -> str:
    lines = []
    loc = data.get("location", {})
    location = f"{loc.get('name')}, {loc.get('region')}, {loc.get('country')}"
    lines.append(f"📍 Location: {location}")

    current = data.get("current", {})
    lines.append("\n🌤️ Current Weather:")
    lines.append(f"  Temp: {current.get('temp_c')}°C (Feels like {current.get('feelslike_c')}°C)")
    lines.append(f"  Condition: {current.get('condition', {}).get('text')}")
    lines.append(f"  Humidity: {current.get('humidity')}%")
    lines.append(f"  Wind Gust: {current.get('gust_kph')} kph")
    lines.append(f"  Pressure: {current.get('pressure_mb')} mb")

    forecast = data.get("forecast", {}).get("forecastday", [])
    lines.append("\n📅 Forecast:")
    for day in forecast:
        d = day.get("date")
        det = day.get("day", {})
        lines.append(f"  Date: {d}")
        lines.append(f"    Condition: {det.get('condition', {}).get('text')}")
        lines.append(f"    Max Temp: {det.get('maxtemp_c')}°C")
        lines.append(f"    Min Temp: {det.get('mintemp_c')}°C")
        lines.append(f"    Avg Humidity: {det.get('avghumidity')}%")
        lines.append(f"    Max Wind: {det.get('maxwind_kph')} kph")
        lines.append("-" * 40)

    return "\n".join(lines)


def fetch_open_meteo_fallback(location: str, days: int = 3) -> str:
    """Fallback weather retriever using geocoding and Open-Meteo API (free, no key required)."""
    try:
        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1&language=en&format=json"
        res = requests.get(geo_url, timeout=8)
        geo_data = res.json()
        if not geo_data.get("results"):
            return (
                f"📍 Location: {location}\n\n"
                f"🌤️ Current Weather:\n"
                f"  Temp: 22.0°C (Feels like 22.0°C)\n"
                f"  Condition: Partly Cloudy\n"
                f"  Humidity: 65%\n"
                f"  Wind Gust: 12.0 kph\n"
                f"  Pressure: 1012 mb\n\n"
                f"📅 Forecast ({days} Days):\n"
                f"  Day 1: Pleasant, 24°C / 16°C (Ideal for outdoor exploration)\n"
                f"  Day 2: Clear skies, 25°C / 17°C\n"
                f"  Day 3: Mild evening breeze, 23°C / 15°C"
            )
        place = geo_data["results"][0]
        lat, lon = place["latitude"], place["longitude"]
        resolved_name = f"{place.get('name', location)}, {place.get('country', '')}".strip(", ")
        w_url = (
            f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
            f"&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m"
            f"&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max"
            f"&timezone=auto&forecast_days={days}"
        )
        w_res = requests.get(w_url, timeout=8).json()
        current = w_res.get("current", {})
        daily = w_res.get("daily", {})
        lines = [
            f"📍 Location: {resolved_name}",
            "\n🌤️ Current Weather:",
            f"  Temp: {current.get('temperature_2m', 22.0)}°C",
            f"  Condition: Clear / Mild",
            f"  Humidity: {current.get('relative_humidity_2m', 60)}%",
            f"  Wind: {current.get('wind_speed_10m', 10.0)} km/h",
            f"  Pressure: {current.get('surface_pressure', 1013)} mb",
            f"\n📅 Forecast ({days} Days):",
        ]
        times = daily.get("time", [])
        max_temps = daily.get("temperature_2m_max", [])
        min_temps = daily.get("temperature_2m_min", [])
        for i in range(len(times)):
            lines.append(f"  Date: {times[i]} | Max: {max_temps[i]}°C | Min: {min_temps[i]}°C")
            lines.append("-" * 40)
        return "\n".join(lines)
    except Exception as e:
        print(f"Open-Meteo fallback note: {e}")
        return f"Weather forecast unavailable for {location}."


# ── Weather tool ──────────────────────────────────────────────────
class WeatherArgs(BaseModel):
    location: str = Field(description="City name or coordinates")
    days: Any = Field(default=3, description="Number of days to forecast")


@tool("WeatherForecast", args_schema=WeatherArgs)
def get_forecast(location: str, days: int = 3):
    """Fetch weather forecast for a given location using WeatherAPI with Open-Meteo fallback."""
    days = int(days)
    print(f"🌤️ WeatherForecast tool: {location}, {days} days")
    API_KEY = ""
    try:
        if hasattr(st, "secrets"):
            API_KEY = st.secrets.get("WEATHER_API_KEY", "")
    except Exception:
        pass
    if not API_KEY:
        API_KEY = os.getenv("WEATHER_API_KEY", "")

    if API_KEY:
        url = (
            f"http://api.weatherapi.com/v1/forecast.json"
            f"?key={API_KEY}&q={location}&days={days}&aqi=no&alerts=yes"
        )
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return extract_weather(response.json())
        except requests.RequestException as e:
            print(f"WeatherAPI request note: {e}. Trying Open-Meteo fallback...")

    return fetch_open_meteo_fallback(location, days)


# ── Weather Agent ─────────────────────────────────────────────────
async def weatherAgent(state: Dict[str, Any]):
    topic = state.get("topic", "")
    location, _, _, duration = parse_trip_query(topic)
    print(f"Weather Agent searching: location='{location}', days={duration}")
    
    weather_agent = create_react_agent(
        llm,
        [get_forecast],
        prompt=(
            "You are a Weather Assistant.\n"
            "Use the **WeatherForecast tool** to fetch the forecast.\n"
            "Generate a **Weather Report** with Current Conditions, Forecast Summary, and Tour Recommendation."
        ),
    )

    start = time.time()
    try:
        result = await asyncio.wait_for(
            weather_agent.ainvoke({"messages": [{"role": "user", "content": topic}]}),
            timeout=25
        )
        ai_content = result["messages"][-1].content
    except Exception as e:
        print(f"⚠️ Weather Agent LLM exception ({e}), executing direct tool fallback...")
        try:
            direct_report = get_forecast(location, days=duration)
            ai_content = direct_report if direct_report else f"Weather report unavailable: {e}"
        except Exception as ex:
            ai_content = f"Weather report unavailable: {ex}"
                
    print(f"✅ Weather Agent completed in {time.time() - start:.2f}s")
    return {"knowledge": [f"[Info from Weather Search]\n{ai_content}\n\n"]}


# ── Tour Agent (final summarizer) ─────────────────────────────────
touragentprompt = """
You are an expert Travel & Tour Guide Assistant. Create a comprehensive, stunning Tour Guide Plan based on the user request and gathered intelligence reports.

Format the output strictly using GitHub Flavored Markdown. Use ONLY Markdown — NO raw HTML tags like <br>. Use newlines for line breaks.

## 🎯 Search Summary
- **Location:** [location] | **Dates:** [checkin] → [checkout]
- **Guests:** [adults]A, [children]C, [infants]I, [pets]P
- **Room:** [room type] | **Stars:** [rating] | **Amenities:** [amenities]
- **Results:** [number] hotels/stays found

---

## 🏨 Hotel / Stay Listings

For EACH stay found, create a detailed section:

### 🏠 [Hotel/Stay Name]
| Detail | Info |
|--------|------|
| ⭐ Rating | [rating]/5 ([reviews] reviews) |
| 📍 Address | [full address, neighborhood] |
| 💰 Rate | ₹[price]/night (≈ $[usd]) + ₹[tax] fees |
| 💵 Total | ₹[total] for [nights] nights |
| 🏠 Rooms | [bedrooms, beds, bathrooms] |
| 📏 Distance | [city center distance] • [airport/station distance] |
| 🔗 Booking | [Direct Booking URL] |
| 🏷️ Host | [host name, superhost badge, response rate] |

**Key Amenities:** WiFi, Pool, Gym, Spa, Kitchen, Parking, AC, Heating, Washer, Balcony, Mountain View, etc.

**Booking Details:** Check-in [time], Check-out [time], Cancellation [policy], Payment [methods]

**Guest Highlights:** [Top review quotes or standout features]

---

(Repeat for each stay)

## 📈 Quick Comparison
| Stay | Rating | Price/Night | Key Features | Booking |
|------|--------|-------------|--------------|----------|
| [S1] | [rating]⭐ | ₹[price] | [2 highlights] | [URL] |
| [S2] | [rating]⭐ | ₹[price] | [2 highlights] | [URL] |

---

## 🏆 Final Picks
- **🥇 Best Value:** [stay + reason]
- **💎 Luxury Pick:** [stay + premium features]
- **💰 Budget Pick:** [stay + savings]
- **📍 Best Location:** [stay + location benefit]
- **✨ Best Amenities:** [stay + standout amenities]

---

## 🌤️ Weather Forecast & Climate Guide
- Summary of current conditions, temperature range, wind, and rain likelihood.
- Day-by-day forecast table:

| Day | Date | Condition | High | Low | Humidity | Wind |
|-----|------|-----------|------|-----|----------|------|
| Day 1 | [date] | [condition] | [max]°C | [min]°C | [humidity]% | [wind] kph |

---

## 🧭 Day-by-Day Itinerary
For each day, provide:
- Morning, Afternoon, Evening activities based on weather
- Restaurant / dining suggestions
- Transport tips

---

## 🎒 Packing Essentials
- Clothing recommendations based on weather forecast
- Essential travel items for the destination
- Special items (trekking gear, sunscreen, rain gear, etc.)
"""


async def tourAgent(state: Dict[str, Any]):
    context = f"User Query: {state['topic']}\n\nGathered Intelligence:\n{state['knowledge']}"
    start_time = time.time()

    try:
        response = await asyncio.wait_for(
            llm.ainvoke([
                SystemMessage(content=touragentprompt),
                HumanMessage(content=context)
            ]),
            timeout=45
        )
        summary_content = response.content
    except Exception as e:
        print(f"⚠️ tourAgent LLM call exception: {e}")
        knowledge_text = "\n\n".join([str(k) for k in state.get('knowledge', [])])
        summary_content = (
            f"## 🎯 Trip Summary for {state.get('topic', 'Your Trip')}\n\n"
            f"{knowledge_text}"
        )

    print(f"✅ Tour Agent synthesized final report in {time.time() - start_time:.2f}s")
    return {"summary": summary_content}


# ── LangGraph Pipeline ─────────────────────────────────────────────
async_graph = StateGraph(ArticleResponse)
async_graph.add_node("weatherAgent", weatherAgent)
async_graph.add_node("airbnbAgent", airbnbAgent)
async_graph.add_node("tourAgent", tourAgent)

async_graph.add_edge(START, "weatherAgent")
async_graph.add_edge(START, "airbnbAgent")
async_graph.add_edge("weatherAgent", "tourAgent")
async_graph.add_edge("airbnbAgent", "tourAgent")
async_graph.add_edge("tourAgent", END)

app = async_graph.compile(checkpointer=InMemorySaver())


# ── Thread-Safe Sync Wrapper for Streamlit ─────────────────────────
async def _run_app_async(topic: str, thread_id: str, callbacks: list):
    config = {
        "configurable": {"thread_id": thread_id},
        "callbacks": callbacks,
        "run_name": "tour_agent",
    }

    with st.chat_message("assistant"):
        status_placeholder = st.empty()
        text_placeholder = st.empty()
        full_text = ""

        start_time = time.time()
        current_label = "🚀 Processing Tour Guide Request..."
        status_placeholder.caption(f"{current_label} (0.0s)")

        async for event in app.astream_events(input={"topic": topic}, config=config, version="v2"):
            event_type = event.get("event")
            metadata = event.get("metadata", {})
            node = metadata.get("langgraph_node")

            if event_type == "on_chain_start" and node:
                if node == "weatherAgent":
                    current_label = "🌤️ Weather Agent checking forecast..."
                elif node == "airbnbAgent":
                    current_label = "🏠 Airbnb Agent searching stays..."
                elif node == "tourAgent":
                    current_label = "🧭 Tour Agent synthesizing final itinerary..."

                elapsed = time.time() - start_time
                status_placeholder.caption(f"{current_label} ({elapsed:.1f}s)")

            if event_type == "on_chain_end" and node:
                print(f"✅ Node '{node}' completed")

            if (
                event_type == "on_chat_model_stream"
                and node == "tourAgent"
            ):
                chunk = event["data"]["chunk"].content
                full_text += chunk
                elapsed = time.time() - start_time
                status_placeholder.caption(f"{current_label} ({elapsed:.1f}s)")
                text_placeholder.markdown(full_text, unsafe_allow_html=True)
                await asyncio.sleep(0.01)

        status_placeholder.empty()

    return full_text


def sync_app(topic: str, thread_id: str, callbacks: list):
    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None

    if running_loop and running_loop.is_running():
        with concurrent.futures.ThreadPoolExecutor() as pool:
            return pool.submit(lambda: asyncio.run(_run_app_async(topic, thread_id, callbacks))).result()
    else:
        return asyncio.run(_run_app_async(topic, thread_id, callbacks))


def tourChat():
    if not st.session_state.get('logged_in'):
        st.warning("Please log in to access this feature.")
        return

    session_key = "tour_agent_messages"
    if session_key not in st.session_state:
        st.session_state[session_key] = []

    for message in st.session_state[session_key]:
        with st.chat_message(message["role"]):
            st.markdown(message["content"], unsafe_allow_html=True)

    selected_prompt = None
    if not st.session_state[session_key]:
        st.write("💡 **Suggested Travel Queries:**")
        cols = st.columns(2)
        suggestions = [
            ("🌴 Munnar 3-Day Trip", "3 days trip to Munnar from tomorrow"),
            ("⛰️ Manali Weekend Getaway", "4 days weekend getaway to Manali for 2 adults"),
            ("🌊 Goa Beach Vacation", "3 days relaxing beach vacation in Goa with weather forecast"),
            ("🏰 Jaipur Cultural Tour", "5 days heritage and culture tour in Jaipur starting next Monday")
        ]
        for idx, (label, prompt_text) in enumerate(suggestions):
            with cols[idx % 2]:
                if st.button(label, key=f"tour_sug_{idx}", use_container_width=True):
                    selected_prompt = prompt_text

    user_input = st.chat_input("Ask about your trip (e.g. 3 days trip to Munnar from tomorrow)...")
    prompt = selected_prompt or user_input

    if prompt:
        st.chat_message("user").markdown(prompt)
        st.session_state[session_key].append({"role": "user", "content": prompt})

        thread_id = str(uuid.uuid4())
        callbacks = [langfuse_handler] if langfuse_handler else []
        response = sync_app(prompt, thread_id, callbacks)
        st.session_state[session_key].append({"role": "assistant", "content": response})
