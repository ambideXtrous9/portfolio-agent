#!/usr/bin/env python3
"""
LiveKit Voice Agent with LangGraph Tool-Calling Agent Node.
Integrated in ambideXtrous AI Portfolio.

Architecture:
  User Voice -> LiveKit Room (WebRTC)
    -> LiveKit Agent (STT: AssemblyAI / Deepgram fallback)
      -> LangGraph Tool-Calling Agent Node (Groq)
        ├── Tool Call: get_weather (OpenWeather 2.5 API)
        └── Tool Call: get_news (DuckDuckGoSearchRun)
      -> Spoken Response Chunks
    -> LiveKit Agent (TTS: Cartesia / Inworld fallback)
  -> User Spoken Audio Output
"""

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import find_dotenv, load_dotenv
from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AgentStateChangedEvent,
    JobContext,
    MetricsCollectedEvent,
    inference,
    metrics,
    room_io,
    stt,
    tts,
)
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.langchain import LLMAdapter

from backend.app.voice_agent.graph import VoiceGraphWrapper, build_langgraph_workflow
from backend.app.voice_agent.telemetry import flush_langfuse, setup_langfuse

load_dotenv(find_dotenv())

logger = logging.getLogger("livekit.langgraph_agent")


def setup_session_telemetry(session: AgentSession, ctx: JobContext) -> None:
    """Register usage collection and Time to First Audio (TTFA) telemetry handlers."""
    usage_collector = metrics.UsageCollector()
    last_eou_metrics: metrics.EOUMetrics | None = None

    @session.on("metrics_collected")
    def _on_metrics_collected(ev: MetricsCollectedEvent):
        nonlocal last_eou_metrics
        try:
            if ev.metrics.type == "eou_metrics":
                last_eou_metrics = ev.metrics
            metrics.log_metrics(ev.metrics)
            usage_collector.collect(ev.metrics)
        except Exception as e:
            logger.warning("Error processing collected metric: %s", e)

    async def log_usage_summary():
        try:
            logger.info("Session usage summary: %s", usage_collector.get_summary())
        except Exception as e:
            logger.warning("Failed to retrieve usage summary: %s", e)

    ctx.add_shutdown_callback(log_usage_summary)

    @session.on("agent_state_changed")
    def _on_agent_state_changed(ev: AgentStateChangedEvent):
        try:
            logger.info("Agent state transitioned to: %s", ev.new_state)
            if ev.new_state == "speaking" and last_eou_metrics:
                ttfa = time.time() - last_eou_metrics.timestamp
                logger.info("Time to first audio (TTFA): %.3fs", ttfa)
        except Exception as e:
            logger.warning("Error processing agent state change: %s", e)


class VoiceAgent(Agent):
    """VoiceAgent configured for conversational speech interaction."""
    def __init__(self):
        super().__init__(
            instructions=(
                "You are a very helpful AI assistant. Please respond in a clear and concise manner. "
                "Keep replies under 3 sentences and voice-friendly."
            ),
        )


server = AgentServer()


@server.rtc_session()
async def EntryPoint(ctx: JobContext):
    """RTC Session entrypoint: mounts LangGraph agent, STT/TTS fallbacks, and BVC audio."""
    logger.info("Initializing LiveKit RTC Session for room: %s", ctx.room.name)

    # Initialize Langfuse OpenTelemetry tracing
    trace_provider = setup_langfuse(
        metadata={
            "langfuse.session.id": ctx.room.name,
        }
    )
    if trace_provider:
        async def flush_langfuse_traces():
            flush_langfuse(trace_provider)

        ctx.add_shutdown_callback(flush_langfuse_traces)

    # Compile the LangGraph tool-calling agent workflow wrapped for voice
    compiled_graph = build_langgraph_workflow()
    langgraph_workflow = VoiceGraphWrapper(compiled_graph)

    # Wrap the LangGraph workflow as the LiveKit LLM adapter
    langgraph_llm_adapter = LLMAdapter(graph=langgraph_workflow)

    # Configure session with STT/TTS fallbacks and Silero VAD
    session = AgentSession(
        llm=langgraph_llm_adapter,
        stt=stt.FallbackAdapter(
            [
                inference.STT.from_model_string("assemblyai/universal-streaming:en"),
                inference.STT.from_model_string("deepgram/nova-3"),
            ]
        ),
        tts=tts.FallbackAdapter(
            [
                inference.TTS.from_model_string("cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"),
                inference.TTS.from_model_string("inworld/inworld-tts-1"),
            ]
        ),
        vad=silero.VAD.load(),
        turn_detection=inference.TurnDetector(),
        preemptive_generation=False,
    )

    # Set up session telemetry & TTFA logging
    setup_session_telemetry(session, ctx)

    # Connect to room with Background Voice Cancellation (BVC)
    await session.start(
        agent=VoiceAgent(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
        ),
    )
    logger.info("VoiceAgent started successfully in room: %s", ctx.room.name)

    # Handle prompt commands sent from frontend suggestion chips or text input
    @ctx.room.on("data_received")
    def _on_data_received(data_packet: rtc.DataPacket):
        try:
            raw_text = data_packet.data.decode("utf-8")
            logger.info("LiveKit data received in room %s: %s", ctx.room.name, raw_text)
            prompt_text = raw_text
            try:
                payload = json.loads(raw_text)
                if isinstance(payload, dict):
                    prompt_text = payload.get("prompt") or payload.get("message") or payload.get("text") or raw_text
            except Exception:
                pass

            prompt_text = (prompt_text or "").strip()
            if prompt_text:
                logger.info("Triggering generate_reply for user prompt: '%s'", prompt_text)
                session.generate_reply(
                    user_input=prompt_text,
                    instructions=(
                        f"The user selected or sent this prompt: '{prompt_text}'. "
                        "Directly answer their query, calling get_weather or get_news if appropriate. "
                        "Speak your response naturally and concisely in 1-3 sentences without markdown."
                    ),
                )
        except Exception as e:
            logger.warning("Error processing received data packet: %s", e)

    # Broadcast conversation transcript back to frontend UI
    @session.on("conversation_item_added")
    def _on_conversation_item_added(ev):
        try:
            item = getattr(ev, "item", None)
            if item and ctx.room.local_participant:
                role = getattr(item, "role", "assistant")
                content = getattr(item, "content", "")
                if isinstance(content, list):
                    content = " ".join(str(c) for c in content if c)
                content = (content or "").strip()
                if content:
                    sender = "Agent" if role == "assistant" else "You"
                    payload = json.dumps({"type": "transcript", "sender": sender, "text": content}).encode("utf-8")
                    asyncio.create_task(
                        ctx.room.local_participant.publish_data(payload, reliable=True, topic="transcript")
                    )
        except Exception as e:
            logger.debug("Failed to broadcast conversation transcript: %s", e)

    # Broadcast tool execution status to frontend visual indicator
    @session.on("tool_execution_updated")
    def _on_tool_execution_updated(ev):
        try:
            update = getattr(ev, "update", None)
            if update and ctx.room.local_participant:
                tool_name = (
                    getattr(update, "name", None)
                    or getattr(getattr(update, "tool", None), "name", None)
                )
                if not tool_name and hasattr(update, "tool_call"):
                    tool_name = getattr(update.tool_call, "name", None)
                if tool_name:
                    payload = json.dumps({"type": "tool_call", "name": tool_name}).encode("utf-8")
                    asyncio.create_task(
                        ctx.room.local_participant.publish_data(payload, reliable=True, topic="tool_activity")
                    )
        except Exception as e:
            logger.debug("Failed to broadcast tool activity: %s", e)

    # Greet the user when they join the session
    await session.generate_reply(
        instructions="Greet the caller warmly in one or two sentences and let them know you can help with weather, news, or any general question."
    )


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger.info("Starting LiveKit Voice Agent Server with LangGraph Tool-Calling Agent...")
    agents.cli.run_app(server)
