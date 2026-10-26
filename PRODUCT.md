# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: developer / product evaluator demoing a real-time voice AI in the browser. Situation: desktop or mobile browser with mic + speakers, testing latency and conversation quality. Job: start a voice session, talk, hear the AI respond, watch live transcript and pipeline status.

## Product Purpose

Browser-native real-time voice agent. Mic audio streams via WebSocket to a Node backend running ElevenLabs Scribe v2 Realtime (STT) → GPT-4o mini via OpenRouter (LLM) → ElevenLabs Flash v2.5 (streaming TTS). Success = sub-second-feel turn-taking, clear speaking/listening/thinking states, readable live transcript, no phone number required.

## Positioning

Unlike phone-based IVR labs (Twilio PSTN), this is pure browser WebRTC-adjacent: AudioWorklet mic capture → `/voice-stream` WebSocket → PCM 24kHz playback scheduling, with barge-in, mute-for-listen, and per-stage latency metrics. A neighboring demo could not truthfully copy the browser-only gapless playback + event-bus latency readout.

## Operating Context

Single-session voice console used in quiet demo settings. Workflow: Connect → listen → think → speak loop, interruptible (barge-in), mutable mute. Environment: Chrome/Edge with mic permission. Companion surfaces: pipeline strip, latency metrics, transcript feed. Session state machine: ready → connected → listening → thinking → speaking.

## Capabilities and Constraints

Confirmed functionality: start/stop voice session, mute mic (listen-only), gapless PCM playback, barge-in stop, live transcript (user/assistant), STT/LLM/TTS/total latency, duration timer, error surfacing.
Technical constraints: requires mic permission, AudioContext + AudioWorklet (`/audio-worklet-processor.js`), backend at `localhost:5000` in dev (`/voice-stream`, `/api/events`). No persistence; transcripts are session-local.
Explicitly undecided: product name beyond "AI Voice Agent" (user chose to keep generic), auth/multi-user, history.

## Brand Commitments

Name: "AI Voice Agent" (generic, kept per user). Voice: technical, precise, production-grade. Visual commitments from brief: professional dark like Vapi / ElevenLabs / Retell consoles; full-screen stage layout (huge centered orb, minimal chrome, transcript as overlay drawer); iridescent fluid 3D orb that morphs with talking state. Dark scene picked from use scene: long demo sessions in dim rooms, orb as light source.

## Evidence on Hand

Real implementation: `client/src/pages/Dashboard.jsx`, `client/src/components/AgentVisualizer.jsx`, `CallButton.jsx`, `CallStatus.jsx`, `Conversation.jsx`, `Architecture.jsx`. Real pipeline labels: Scribe Realtime, OpenRouter GPT-4o mini, ElevenLabs Flash v2.5. STT provider flippable via STT_PROVIDER (elevenlabs default, deepgram fallback). Agentic tools: create_github_repo, send_email (both OpenAI-format function calls via OpenRouter). No invented testimonials, pricing, or customers — none exist and must not be fabricated.

## Product Principles

1. State is truth: every pixel answers "what is the agent doing now."
2. Voice leads, chrome recedes: controls and metrics support the conversation, never compete with it.
3. Latency is a feature: show the pipeline honestly, in ms, every turn.
4. Interruptible by default: user can always barge in, mute, or end.
5. Demo-grade reliability: errors name the problem and the recovery (mic, socket, server).

## Accessibility & Inclusion

Voice + visual redundancy: all audio states have text badges and transcript. Keyboard-operable start/mute/end. No product-specific WCAG certification; target WCAG 2.2 AA contrast and focus visibility.
