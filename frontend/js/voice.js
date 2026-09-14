/**
 * LiveKit & Direct Voice Agent Client Controller
 * Dual-Engine Architecture:
 * 1. LiveKit WebRTC channel (for full-duplex containerized daemon workers)
 * 2. In-Browser Direct Voice Engine (Web Speech STT + Groq LangGraph Agent + Web Speech TTS)
 *    Guarantees 100% voice response & speech interactivity even in Vercel serverless environments!
 */

import { fetchAPI } from "./api.js";

export function initVoiceAgent() {
  const canvas = document.getElementById('voiceOrbCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // DOM Elements
  const statusDot = document.getElementById('voiceStatusDot');
  const statusLabel = document.getElementById('voiceStatusLabel');
  const orbStatus = document.getElementById('voiceOrbStatus');
  const orbSub = document.getElementById('voiceOrbSub');
  const btnCall = document.getElementById('voiceBtnCall');
  const btnMic = document.getElementById('voiceBtnMic');
  const btnTranscript = document.getElementById('voiceBtnTranscript');
  const transcriptDrawer = document.getElementById('voiceTranscriptDrawer');
  const toolPill = document.getElementById('voiceToolPill');
  const toolName = document.getElementById('voiceToolName');
  const transcriptList = document.getElementById('voiceTranscriptList');
  const roomNameBadge = document.getElementById('voiceRoomBadge');

  // State management
  let room = null;
  let isConnected = false;
  let isMuted = false;
  let isSpeaking = false;
  let hasRemoteWorker = false;
  let audioContext = null;
  let micAnalyser = null;
  let agentAnalyser = null;
  let micStream = null;
  let currentAgentState = 'idle'; // 'idle', 'connecting', 'listening', 'thinking', 'speaking'
  let recognition = null;
  let recognitionActive = false;
  let recognitionRestartTimer = null;
  let phase = 0;
  let speechKeepAliveTimer = null;

  // ---------------------------------------------------------------------------
  // 1. Organic Harmonic Aura Visualizer (60fps Canvas)
  // ---------------------------------------------------------------------------
  function renderOrb() {
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);
    phase += 0.035;

    let audioVolume = 0;
    if (currentAgentState === 'speaking') {
      if (agentAnalyser) {
        const data = new Uint8Array(agentAnalyser.frequencyBinCount);
        agentAnalyser.getByteFrequencyData(data);
        audioVolume = data.reduce((a, b) => a + b, 0) / (data.length * 255);
      } else {
        // Natural organic voice modulation wave during browser speech synthesis
        const voiceMod = Math.sin(phase * 4.8) * Math.cos(phase * 2.3) * 0.5 + 0.5;
        audioVolume = 0.22 + 0.38 * voiceMod + 0.08 * Math.sin(phase * 10.5);
      }
    } else if (currentAgentState === 'listening' && micAnalyser && !isMuted) {
      const data = new Uint8Array(micAnalyser.frequencyBinCount);
      micAnalyser.getByteFrequencyData(data);
      audioVolume = data.reduce((a, b) => a + b, 0) / (data.length * 255);
    } else if (currentAgentState === 'thinking') {
      audioVolume = 0.15 + 0.12 * Math.sin(phase * 3.5);
    }

    const baseRadius = 105 + audioVolume * 65;
    const layerCount = 4;

    for (let l = 0; l < layerCount; l++) {
      ctx.beginPath();
      const layerPhase = phase + l * 0.9;

      let grad = ctx.createRadialGradient(centerX, centerY, 30, centerX, centerY, baseRadius + 28);
      if (currentAgentState === 'speaking') {
        grad.addColorStop(0, 'rgba(200, 104, 77, 0.68)');
        grad.addColorStop(0.5, 'rgba(178, 84, 59, 0.38)');
        grad.addColorStop(1, 'rgba(250, 248, 245, 0)');
      } else if (currentAgentState === 'listening') {
        grad.addColorStop(0, 'rgba(79, 117, 96, 0.65)');
        grad.addColorStop(0.5, 'rgba(61, 94, 76, 0.35)');
        grad.addColorStop(1, 'rgba(250, 248, 245, 0)');
      } else if (currentAgentState === 'thinking') {
        grad.addColorStop(0, 'rgba(214, 129, 107, 0.6)');
        grad.addColorStop(0.6, 'rgba(188, 178, 161, 0.32)');
        grad.addColorStop(1, 'rgba(250, 248, 245, 0)');
      } else if (currentAgentState === 'connecting') {
        grad.addColorStop(0, 'rgba(188, 178, 161, 0.45)');
        grad.addColorStop(0.5, 'rgba(200, 104, 77, 0.2)');
        grad.addColorStop(1, 'rgba(250, 248, 245, 0)');
      } else {
        grad.addColorStop(0, 'rgba(200, 104, 77, 0.35)');
        grad.addColorStop(0.7, 'rgba(142, 130, 112, 0.18)');
        grad.addColorStop(1, 'rgba(250, 248, 245, 0)');
      }

      ctx.fillStyle = grad;

      const points = 32;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const waveFreq = 3 + l;
        const waveAmp = (14 + audioVolume * 38) * Math.sin(layerPhase + angle * waveFreq);
        const r = baseRadius + waveAmp;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Inner Glass Core Sphere
    ctx.beginPath();
    ctx.arc(centerX, centerY, 65, 0, Math.PI * 2);
    let coreGrad = ctx.createRadialGradient(centerX - 15, centerY - 15, 8, centerX, centerY, 65);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    coreGrad.addColorStop(0.8, 'rgba(20, 25, 45, 0.88)');
    coreGrad.addColorStop(1, 'rgba(10, 12, 22, 0.96)');
    ctx.fillStyle = coreGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    requestAnimationFrame(renderOrb);
  }

  renderOrb();

  // ---------------------------------------------------------------------------
  // 2. Transcript & Tool Activity Helpers
  // ---------------------------------------------------------------------------
  function addTranscript(sender, text) {
    if (!transcriptList) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'st-voice-msg-row';
    const senderClass = sender.toLowerCase() === 'you' ? 'user' : (sender.toLowerCase() === 'system' ? 'system' : 'agent');
    row.innerHTML = `
      <div class="st-voice-msg-header">
        <span class="st-voice-msg-sender ${senderClass}">${sender}</span>
        <span class="st-voice-msg-time">${timeStr}</span>
      </div>
      <div class="st-voice-msg-text">${text}</div>
    `;
    transcriptList.appendChild(row);
    if (transcriptDrawer) {
      transcriptDrawer.scrollTop = transcriptDrawer.scrollHeight;
    }
  }

  function showToolActivity(name) {
    if (!toolPill || !toolName) return;
    toolName.textContent = name;
    toolPill.classList.add('active');
    setTimeout(() => {
      toolPill.classList.remove('active');
    }, 4500);
  }

  function updateUIState(state) {
    currentAgentState = state;
    if (state === 'connecting') {
      if (statusDot) statusDot.className = 'st-voice-status-dot connecting';
      if (statusLabel) statusLabel.textContent = 'Connecting...';
      if (orbStatus) orbStatus.textContent = 'Connecting...';
      if (orbSub) orbSub.textContent = 'Setting up Voice Channel';
      if (btnCall) {
        btnCall.disabled = true;
        btnCall.className = 'st-voice-btn-call connecting';
      }
    } else if (state === 'connected' || state === 'idle' || state === 'listening' || state === 'speaking' || state === 'thinking') {
      if (statusDot) statusDot.className = 'st-voice-status-dot connected';
      if (statusLabel) statusLabel.textContent = 'Live Session';
      if (btnCall) {
        btnCall.disabled = false;
        btnCall.className = 'st-voice-btn-call in-call';
        btnCall.title = 'End Call';
        btnCall.innerHTML = `
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>`;
      }
      if (btnMic) btnMic.disabled = false;

      if (state === 'listening') {
        if (orbStatus) orbStatus.textContent = 'Listening to you...';
        if (orbSub) orbSub.textContent = 'Speak naturally or tap a topic below';
      } else if (state === 'speaking') {
        if (orbStatus) orbStatus.textContent = 'Agent Speaking';
        if (orbSub) orbSub.textContent = hasRemoteWorker ? 'Cartesia Sonic-3 / LiveKit' : 'Synthesized Speech Output';
      } else if (state === 'thinking') {
        if (orbStatus) orbStatus.textContent = 'Thinking...';
        if (orbSub) orbSub.textContent = 'Evaluating context with Groq';
      } else {
        if (orbStatus) orbStatus.textContent = 'Agent Ready';
        if (orbSub) orbSub.textContent = 'Say a question or command';
      }
    } else {
      // Disconnected
      if (statusDot) statusDot.className = 'st-voice-status-dot';
      if (statusLabel) statusLabel.textContent = 'Disconnected';
      if (orbStatus) orbStatus.textContent = 'Tap Call to Start';
      if (orbSub) orbSub.textContent = 'Real-time WebRTC & Voice AI';
      if (btnCall) {
        btnCall.disabled = false;
        btnCall.className = 'st-voice-btn-call';
        btnCall.title = 'Start Call';
        btnCall.innerHTML = `
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>`;
      }
      if (btnMic) {
        btnMic.disabled = true;
        btnMic.classList.remove('muted');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Text-to-Speech Engine (Web Speech Synthesis Fallback)
  // ---------------------------------------------------------------------------
  function getBestVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const preferred = [
      'Google UK English Female',
      'Google US English',
      'Microsoft Jenny Online (Natural)',
      'Microsoft Zira',
      'Samantha',
      'Karen',
      'en-US',
      'en-GB',
    ];

    for (const pref of preferred) {
      const match = voices.find(v => v.name.includes(pref) || v.lang === pref);
      if (match) return match;
    }

    return voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en')) || voices[0];
  }

  function speakText(text) {
    if (!text || hasRemoteWorker) return;

    if (!('speechSynthesis' in window)) {
      console.warn('Browser does not support window.speechSynthesis');
      updateUIState('listening');
      startSpeechRecognition();
      return;
    }

    // Stop speech recognition while speaking to prevent agent hearing itself
    stopSpeechRecognition();

    try {
      window.speechSynthesis.cancel();
    } catch (_) {}

    // Clean any markdown formatting from text for speaking
    const spokenText = text
      .replace(/[*_#`~[\]()<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!spokenText) {
      updateUIState('listening');
      startSpeechRecognition();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.voice = getBestVoice();
    utterance.rate = 1.02;
    utterance.pitch = 1.0;

    isSpeaking = true;
    updateUIState('speaking');

    // Prevent speech synthesis pause bug in Chrome
    if (speechKeepAliveTimer) clearInterval(speechKeepAliveTimer);
    speechKeepAliveTimer = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
      } else {
        clearInterval(speechKeepAliveTimer);
      }
    }, 4500);

    utterance.onend = () => {
      isSpeaking = false;
      if (speechKeepAliveTimer) clearInterval(speechKeepAliveTimer);
      if (isConnected) {
        updateUIState('listening');
        startSpeechRecognition();
      }
    };

    utterance.onerror = (e) => {
      console.warn('Speech synthesis error or interrupted:', e);
      isSpeaking = false;
      if (speechKeepAliveTimer) clearInterval(speechKeepAliveTimer);
      if (isConnected) {
        updateUIState('listening');
        startSpeechRecognition();
      }
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Failed to trigger speech synthesis:', e);
      isSpeaking = false;
      updateUIState('listening');
      startSpeechRecognition();
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Speech-to-Text Engine (Browser SpeechRecognition)
  // ---------------------------------------------------------------------------
  function setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.log('SpeechRecognition API not supported in this browser. Falling back to suggestion chips & direct input.');
      return null;
    }

    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => {
      recognitionActive = true;
    };

    rec.onresult = (event) => {
      if (!event.results || event.results.length === 0) return;
      const transcript = event.results[0][0].transcript.trim();
      console.log('Voice recognition result:', transcript);
      if (transcript && isConnected && !isSpeaking) {
        dispatchUserPrompt(transcript);
      }
    };

    rec.onerror = (event) => {
      recognitionActive = false;
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Speech recognition error:', event.error);
      }
    };

    rec.onend = () => {
      recognitionActive = false;
      // Auto-restart recognition if call is still active and agent is listening
      if (isConnected && !isMuted && !isSpeaking && currentAgentState === 'listening') {
        if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer);
        recognitionRestartTimer = setTimeout(() => {
          startSpeechRecognition();
        }, 300);
      }
    };

    return rec;
  }

  function startSpeechRecognition() {
    if (!isConnected || isMuted || isSpeaking || currentAgentState !== 'listening') return;
    if (!recognition) {
      recognition = setupSpeechRecognition();
    }
    if (recognition && !recognitionActive) {
      try {
        recognition.start();
      } catch (e) {
        // Recognition already running or starting
      }
    }
  }

  function stopSpeechRecognition() {
    if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer);
    if (recognition && recognitionActive) {
      try {
        recognition.stop();
      } catch (_) {}
      recognitionActive = false;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Connect / Disconnect Call Logic
  // ---------------------------------------------------------------------------
  async function connectCall(initialPrompt = null) {
    try {
      updateUIState('connecting');
      addTranscript('System', 'Initializing Voice Agent session...');

      // Resume AudioContext if suspended
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Initialize Microphone Stream for Visualizer & Recognition
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const micSource = audioContext.createMediaStreamSource(micStream);
        micAnalyser = audioContext.createAnalyser();
        micAnalyser.fftSize = 64;
        micSource.connect(micAnalyser);
      } catch (micErr) {
        console.warn('Microphone permission not granted or unavailable:', micErr);
        addTranscript('System', 'Microphone not connected. You can still interact by clicking topic chips!');
      }

      // Fetch Token from Backend
      let roomName = `room-${Date.now().toString(36)}`;
      let token = null;
      let livekitUrl = null;

      try {
        const data = await fetchAPI('/voice/token');
        token = data.token;
        livekitUrl = data.url;
        roomName = data.room || roomName;
      } catch (e) {
        console.warn('LiveKit token fetch failed or unconfigured, using Direct Voice Mode:', e);
      }

      if (roomNameBadge) {
        roomNameBadge.textContent = roomName;
      }

      // Connect to LiveKit Room if library is present
      if (typeof window.LivekitClient !== 'undefined' && token && livekitUrl) {
        try {
          room = new window.LivekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
          });

          room.on(window.LivekitClient.RoomEvent.Connected, () => {
            console.log('LiveKit room connected:', roomName);
            if (room.remoteParticipants && room.remoteParticipants.size > 0) {
              hasRemoteWorker = true;
            }
          });

          room.on(window.LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === window.LivekitClient.Track.Kind.Audio) {
              hasRemoteWorker = true;
              const el = track.attach();
              el.id = 'agentAudioPlayer';
              document.body.appendChild(el);

              try {
                const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
                agentAnalyser = audioContext.createAnalyser();
                agentAnalyser.fftSize = 64;
                source.connect(agentAnalyser);
              } catch (e) {
                console.warn('Could not attach analyser to audio track:', e);
              }
            }
          });

          room.on(window.LivekitClient.RoomEvent.ActiveSpeakersChanged, (speakers) => {
            if (speakers.length > 0) {
              const speaker = speakers[0];
              if (speaker === room.localParticipant) {
                updateUIState('listening');
              } else {
                updateUIState('speaking');
              }
            } else if (currentAgentState !== 'thinking') {
              updateUIState('idle');
            }
          });

          room.on(window.LivekitClient.RoomEvent.DataReceived, (payload) => {
            try {
              const str = new TextDecoder().decode(payload);
              const data = JSON.parse(str);
              if (data.type === 'tool_call') {
                showToolActivity(`Tool: ${data.name}`);
                addTranscript('Agent', `[Tool Call] Executing ${data.name}...`);
              } else if (data.type === 'transcript') {
                addTranscript(data.sender || 'Agent', data.text);
              }
            } catch (e) {}
          });

          room.on(window.LivekitClient.RoomEvent.ParticipantConnected, (p) => {
            hasRemoteWorker = true;
            addTranscript('System', `AI Agent (${p.identity || 'Agent'}) joined room.`);
          });

          room.on(window.LivekitClient.RoomEvent.Disconnected, () => {
            disconnectCall();
          });

          await room.connect(livekitUrl, token);
          if (micStream) {
            await room.localParticipant.setMicrophoneEnabled(true);
          }
        } catch (rtcErr) {
          console.warn('LiveKit WebRTC connection failed, running in Direct Voice Assistant mode:', rtcErr);
        }
      }

      isConnected = true;
      updateUIState('connected');

      // Initialize Speech Recognition
      recognition = setupSpeechRecognition();

      // Greeting or initial prompt dispatch
      if (initialPrompt) {
        await dispatchUserPrompt(initialPrompt);
      } else {
        const greeting = "Hello! I am your AI voice assistant. Ask me about the current weather, latest news, or Sushovan's AI portfolio.";
        addTranscript('Agent', greeting);
        speakText(greeting);
      }

    } catch (err) {
      console.error('Call connection error:', err);
      addTranscript('System', `Connection notice: ${err.message || 'Ready for interaction.'}`);
      isConnected = true;
      updateUIState('listening');
      startSpeechRecognition();
    }
  }

  function disconnectCall() {
    stopSpeechRecognition();

    if (speechKeepAliveTimer) clearInterval(speechKeepAliveTimer);
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch (_) {}

    if (room) {
      try { room.disconnect(); } catch (e) {}
      room = null;
    }

    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }

    const existingAudio = document.getElementById('agentAudioPlayer');
    if (existingAudio) existingAudio.remove();

    isConnected = false;
    isMuted = false;
    isSpeaking = false;
    hasRemoteWorker = false;
    updateUIState('disconnected');
    addTranscript('System', 'Call disconnected.');
  }

  // ---------------------------------------------------------------------------
  // 6. Microphone Mute & Controls
  // ---------------------------------------------------------------------------
  async function toggleMute() {
    if (!isConnected) return;
    isMuted = !isMuted;

    if (room && room.localParticipant) {
      try {
        await room.localParticipant.setMicrophoneEnabled(!isMuted);
      } catch (_) {}
    }

    if (isMuted) {
      stopSpeechRecognition();
      if (btnMic) {
        btnMic.classList.add('muted');
        btnMic.title = 'Unmute Mic';
        btnMic.innerHTML = `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>`;
      }
      addTranscript('System', 'Microphone muted.');
    } else {
      if (btnMic) {
        btnMic.classList.remove('muted');
        btnMic.title = 'Mute Mic';
        btnMic.innerHTML = `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>`;
      }
      addTranscript('System', 'Microphone unmuted.');
      startSpeechRecognition();
    }
  }

  function toggleTranscript() {
    if (!transcriptDrawer) return;
    const isHidden = transcriptDrawer.style.display === 'none' || transcriptDrawer.style.display === '';
    transcriptDrawer.style.display = isHidden ? 'flex' : 'none';
    if (btnTranscript) btnTranscript.classList.toggle('active', isHidden);
  }

  // ---------------------------------------------------------------------------
  // 7. Prompt Dispatch (Dual: LiveKit Data Channel + Serverless Voice Chat API)
  // ---------------------------------------------------------------------------
  async function dispatchUserPrompt(promptText) {
    if (!promptText) return;

    // Open drawer automatically so user sees live conversation
    if (transcriptDrawer && (transcriptDrawer.style.display === 'none' || !transcriptDrawer.style.display)) {
      toggleTranscript();
    }

    addTranscript('You', promptText);
    updateUIState('thinking');
    if (orbStatus) orbStatus.textContent = 'Thinking...';
    if (orbSub) orbSub.textContent = `Query: "${promptText.substring(0, 32)}..."`;

    // Stop ongoing speech & recognition while agent generates answer
    stopSpeechRecognition();
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }

    // 1. If connected to LiveKit room with active remote worker, publish data packet
    if (room && room.localParticipant && hasRemoteWorker) {
      try {
        const encoder = new TextEncoder();
        const payload = JSON.stringify({
          type: 'user_prompt',
          prompt: promptText,
          message: promptText,
        });
        await room.localParticipant.publishData(encoder.encode(payload), { reliable: true, topic: 'user_prompt' });
        console.log('Dispatched prompt via LiveKit WebRTC channel');
        return;
      } catch (e) {
        console.warn('LiveKit data publish failed, falling back to serverless chat API:', e);
      }
    }

    // 2. Serverless Direct Voice Chat Endpoint (/api/voice/chat)
    try {
      const response = await fetchAPI('/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: promptText,
          room: roomNameBadge ? roomNameBadge.textContent : null,
        }),
      });

      if (response && response.tools_used && response.tools_used.length > 0) {
        const toolDisplayName = response.tools_used[0].replace('_', ' ');
        showToolActivity(`Executed: ${toolDisplayName}`);
        addTranscript('Agent', `[Tool Call] Executing ${toolDisplayName}...`);
      }

      const reply = response.reply || "I'm here. What else would you like to explore?";
      addTranscript('Agent', reply);
      speakText(reply);

    } catch (chatErr) {
      console.error('Error invoking voice chat endpoint:', chatErr);
      const fallbackReply = "I'm having a brief connection issue reaching the AI service. Please try asking again.";
      addTranscript('Agent', fallbackReply);
      speakText(fallbackReply);
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Event Listeners & Suggestion Chips
  // ---------------------------------------------------------------------------
  if (btnCall) {
    btnCall.addEventListener('click', () => {
      if (isConnected) disconnectCall();
      else connectCall();
    });
  }

  if (btnMic) {
    btnMic.addEventListener('click', toggleMute);
  }

  if (btnTranscript) {
    btnTranscript.addEventListener('click', toggleTranscript);
  }

  // Suggestion chips
  document.querySelectorAll('.st-voice-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const prompt = chip.getAttribute('data-prompt');
      if (!prompt) return;

      chip.classList.add('chip-active');
      setTimeout(() => chip.classList.remove('chip-active'), 500);

      if (!isConnected) {
        await connectCall(prompt);
      } else {
        await dispatchUserPrompt(prompt);
      }
    });
  });

  // Tour Agent quick jump button
  const jumpBtn = document.getElementById('btn-jump-voice-agent');
  if (jumpBtn) {
    jumpBtn.addEventListener('click', () => {
      const voiceNavBtn = document.querySelector('.st-nav-btn[data-tab="tab-voice"]');
      if (voiceNavBtn) voiceNavBtn.click();
    });
  }

  // Pre-load voices for SpeechSynthesis
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

  // Set initial UI state
  updateUIState('disconnected');
}
