/**
 * LiveKit Voice Agent Client Controller
 * Integrates WebRTC real-time voice streaming with LiveKit, Groq LangGraph agent,
 * Web Audio reactive waveform analysis, and 60fps organic visualizer canvas.
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
  let audioContext = null;
  let micAnalyser = null;
  let agentAnalyser = null;
  let micStream = null;
  let currentAgentState = 'idle'; // 'idle', 'connecting', 'listening', 'thinking', 'speaking'
  let pendingPrompt = null;
  let phase = 0;

  // 60fps Organic Harmonic Aura Visualizer
  function renderOrb() {
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);
    phase += 0.035;

    let audioVolume = 0;
    if (currentAgentState === 'speaking' && agentAnalyser) {
      const data = new Uint8Array(agentAnalyser.frequencyBinCount);
      agentAnalyser.getByteFrequencyData(data);
      audioVolume = data.reduce((a, b) => a + b, 0) / (data.length * 255);
    } else if (currentAgentState === 'listening' && micAnalyser) {
      const data = new Uint8Array(micAnalyser.frequencyBinCount);
      micAnalyser.getByteFrequencyData(data);
      audioVolume = data.reduce((a, b) => a + b, 0) / (data.length * 255);
    }

    const baseRadius = 105 + audioVolume * 65;
    const layerCount = 4;

    for (let l = 0; l < layerCount; l++) {
      ctx.beginPath();
      const layerPhase = phase + l * 0.9;

      let grad = ctx.createRadialGradient(centerX, centerY, 30, centerX, centerY, baseRadius + 28);
      if (currentAgentState === 'speaking') {
        grad.addColorStop(0, 'rgba(200, 104, 77, 0.65)');
        grad.addColorStop(0.5, 'rgba(178, 84, 59, 0.35)');
        grad.addColorStop(1, 'rgba(250, 248, 245, 0)');
      } else if (currentAgentState === 'listening') {
        grad.addColorStop(0, 'rgba(79, 117, 96, 0.6)');
        grad.addColorStop(0.5, 'rgba(61, 94, 76, 0.32)');
        grad.addColorStop(1, 'rgba(250, 248, 245, 0)');
      } else if (currentAgentState === 'thinking') {
        grad.addColorStop(0, 'rgba(214, 129, 107, 0.55)');
        grad.addColorStop(0.6, 'rgba(188, 178, 161, 0.3)');
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

  // Helper: Append transcript message
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
      if (orbSub) orbSub.textContent = 'Setting up WebRTC channel';
      if (btnCall) {
        btnCall.disabled = true;
        btnCall.className = 'st-voice-btn-call connecting';
      }
    } else if (state === 'connected' || state === 'idle' || state === 'listening' || state === 'speaking') {
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
        if (orbSub) orbSub.textContent = 'Speak naturally';
      } else if (state === 'speaking') {
        if (orbStatus) orbStatus.textContent = 'Agent Speaking';
        if (orbSub) orbSub.textContent = 'Cartesia Sonic-3 / LiveKit';
      } else if (state === 'thinking') {
        if (orbStatus) orbStatus.textContent = 'Thinking...';
        if (orbSub) orbSub.textContent = 'Evaluating context';
      } else {
        if (orbStatus) orbStatus.textContent = 'Agent Ready';
        if (orbSub) orbSub.textContent = 'Say a question or command';
      }
    } else {
      // Disconnected
      if (statusDot) statusDot.className = 'st-voice-status-dot';
      if (statusLabel) statusLabel.textContent = 'Disconnected';
      if (orbStatus) orbStatus.textContent = 'Tap Call to Start';
      if (orbSub) orbSub.textContent = 'Real-time WebRTC Voice AI';
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

  // Connect to LiveKit Room
  async function connectCall() {
    try {
      updateUIState('connecting');
      addTranscript('System', 'Connecting to LiveKit WebRTC Voice Room...');

      // 1. Fetch token from backend
      const data = await fetchAPI('/voice/token');
      const { token, url, room: roomName } = data;

      if (roomNameBadge) {
        roomNameBadge.textContent = roomName;
      }

      // 2. Check LiveKit Client library
      if (typeof window.LivekitClient === 'undefined') {
        throw new Error('LivekitClient library is not loaded in window. Please verify script tag.');
      }

      // 3. Web Audio Context
      audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // 4. Initialize LiveKit Room
      room = new window.LivekitClient.Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room.on(window.LivekitClient.RoomEvent.Connected, () => {
        isConnected = true;
        updateUIState('connected');
        addTranscript('System', `Connected to room "${roomName}". Listening for your speech...`);

        // If user clicked a suggestion chip before connecting, send it now
        if (pendingPrompt) {
          const promptToSend = pendingPrompt;
          pendingPrompt = null;
          setTimeout(() => {
            dispatchUserPrompt(promptToSend);
          }, 1500);
        }
      });

      room.on(window.LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === window.LivekitClient.Track.Kind.Audio) {
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
        } else {
          updateUIState('idle');
        }
      });

      room.on(window.LivekitClient.RoomEvent.DataReceived, (payload, participant) => {
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

      room.on(window.LivekitClient.RoomEvent.Disconnected, () => {
        disconnectCall();
      });

      // Connect to SFU and enable microphone
      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);

      // Local microphone analyser
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const micSource = audioContext.createMediaStreamSource(micStream);
        micAnalyser = audioContext.createAnalyser();
        micAnalyser.fftSize = 64;
        micSource.connect(micAnalyser);
      } catch (e) {
        console.warn('Microphone analyser setup error:', e);
      }

    } catch (err) {
      console.error('Call connection error:', err);
      addTranscript('System', `Connection error: ${err.message}. Make sure your agent worker is running!`);
      disconnectCall();
    }
  }

  function disconnectCall() {
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
    updateUIState('disconnected');
    addTranscript('System', 'Call disconnected.');
  }

  // Toggle Mute
  async function toggleMute() {
    if (!room || !isConnected) return;
    isMuted = !isMuted;
    await room.localParticipant.setMicrophoneEnabled(!isMuted);

    if (isMuted) {
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
    } else {
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
  }

  function toggleTranscript() {
    if (!transcriptDrawer) return;
    const isHidden = transcriptDrawer.style.display === 'none' || transcriptDrawer.style.display === '';
    transcriptDrawer.style.display = isHidden ? 'flex' : 'none';
    if (btnTranscript) btnTranscript.classList.toggle('active', isHidden);
  }

  // Event Listeners
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

  async function dispatchUserPrompt(promptText) {
    if (!promptText) return;

    // Ensure live transcript drawer is open and visible
    if (transcriptDrawer && (transcriptDrawer.style.display === 'none' || !transcriptDrawer.style.display)) {
      toggleTranscript();
    }

    addTranscript('You', promptText);
    updateUIState('thinking');
    if (orbStatus) orbStatus.textContent = 'Thinking...';
    if (orbSub) orbSub.textContent = `Query: "${promptText.substring(0, 32)}..."`;

    if (!isConnected || !room || !room.localParticipant) {
      pendingPrompt = promptText;
      console.log('Voice session not connected yet. Saved pending prompt and connecting...', promptText);
      await connectCall();
      return;
    }

    try {
      const encoder = new TextEncoder();
      const payload = JSON.stringify({
        type: 'user_prompt',
        prompt: promptText,
        message: promptText,
      });
      const data = encoder.encode(payload);
      await room.localParticipant.publishData(data, { reliable: true, topic: 'user_prompt' });
      console.log('Successfully published prompt data to LiveKit room:', promptText);
    } catch (err) {
      console.error('Failed to publish data to LiveKit room:', err);
      addTranscript('System', `Could not send prompt to agent: ${err.message}`);
    }
  }

  // Suggestion chips
  document.querySelectorAll('.st-voice-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const prompt = chip.getAttribute('data-prompt');
      if (!prompt) return;

      chip.classList.add('chip-active');
      setTimeout(() => chip.classList.remove('chip-active'), 500);

      await dispatchUserPrompt(prompt);
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

  // Set initial UI state
  updateUIState('disconnected');
}
