import { sessionManager } from '../agent/conversation.js';
import { createDeepgramStream } from '../services/deepgram.service.js';
import { generateChatResponseStream } from '../services/openrouter.service.js';
import { streamElevenLabsTTS } from '../services/elevenlabs.service.js';

// ── Frontend event broadcast ─────────────────────────────────
const eventClients = new Set();

export function registerEventClient(ws) {
  console.log('[Events WS] Frontend connected');
  eventClients.add(ws);
  ws.on('close', () => {
    eventClients.delete(ws);
    console.log('[Events WS] Frontend disconnected');
  });
}

export function broadcastEvent(event) {
  const payload = JSON.stringify(event);
  for (const ws of eventClients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

// ── Twilio Media Stream handler ──────────────────────────────
export function handleMediaStreamWebSocket(ws) {
  console.log('[Media Stream] WebSocket connected');

  let callSid         = null;
  let streamSid       = null;
  let session         = null;
  let pendingText     = '';
  let utteranceTimer  = null;

  // ── keep-alive ping every 20s ──────────────────────────────
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
  }, 20_000);

  ws.on('pong', () => { /* alive */ });

  // ── Message handling ────────────────────────────────────────
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.event) {

        // ── connected ─────────────────────────────────────────
        case 'connected':
          console.log('[Media Stream] Connected event received from Twilio');
          break;

        // ── start ─────────────────────────────────────────────
        case 'start': {
          streamSid = msg.start?.streamSid;
          callSid   = msg.start?.callSid ?? streamSid;

          console.log('[Media Stream] Start received');
          console.log(`[Media Stream] Stream SID: ${streamSid}`);
          console.log(`[Media Stream] Call SID  : ${callSid}`);

          session = sessionManager.createSession(callSid, streamSid);

          broadcastEvent({ type: 'call_status', status: 'connected', callSid });
          broadcastEvent({ type: 'agent_state', state: 'listening', callSid });

          if (process.env.MOCK_AI === 'true') {
            runMockLoop();
            break;
          }

          // Initialise Deepgram
          try {
            session.deepgramConnection = createDeepgramStream({
              onTranscript:  (d) => onTranscript(d),
              onUtteranceEnd:()  => onUtteranceEnd(),
              onError:       (e) => console.error('[Deepgram Error]', e),
            });
          } catch (e) {
            console.error('[Media Stream ERROR] Deepgram init failed:', e?.message);
          }

          // Initial greeting — give Twilio 500ms to stabilise the stream
          setTimeout(() => sendGreeting(), 500);
          break;
        }

        // ── media ─────────────────────────────────────────────
        case 'media': {
          if (!session?.deepgramConnection) break;
          const dg = session.deepgramConnection;
          if (dg.getReadyState() === 1) {
            dg.send(Buffer.from(msg.media.payload, 'base64'));
          }
          break;
        }

        // ── mark ──────────────────────────────────────────────
        case 'mark':
          console.log(`[Media Stream] Mark: ${msg.mark?.name}`);
          if (session) {
            session.isAISpeaking = false;
            session.state        = 'listening';
            broadcastEvent({ type: 'agent_state', state: 'listening', callSid });
          }
          break;

        // ── stop ──────────────────────────────────────────────
        case 'stop':
          console.log(`[Media Stream] Stop received — StreamSID: ${streamSid}`);
          cleanup();
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('[Media Stream ERROR] message parse error:', err?.message);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[Media Stream CLOSE] code=${code} reason=${reason?.toString() || 'none'}`);
    cleanup();
  });

  ws.on('error', (err) => {
    console.error('[Media Stream ERROR]', err?.message || err);
  });

  // ── Internal helpers ────────────────────────────────────────

  function cleanup() {
    clearInterval(pingInterval);
    if (callSid) {
      broadcastEvent({ type: 'call_status', status: 'completed', callSid });
      broadcastEvent({ type: 'agent_state', state: 'ready',     callSid });
      sessionManager.endSession(callSid);
    }
    callSid = streamSid = session = null;
  }

  function sendToTwilio(payload) {
    if (ws.readyState !== 1 || !streamSid) return;
    ws.send(JSON.stringify({
      event:    'media',
      streamSid,
      media:    { payload },
    }));
  }

  function sendMarkToTwilio(name) {
    if (ws.readyState !== 1 || !streamSid) return;
    ws.send(JSON.stringify({ event: 'mark', streamSid, mark: { name } }));
  }

  function sendClearToTwilio() {
    if (ws.readyState !== 1 || !streamSid) return;
    ws.send(JSON.stringify({ event: 'clear', streamSid }));
  }

  // ── Greeting ─────────────────────────────────────────────────
  function sendGreeting() {
    if (ws.readyState !== 1) return;
    const text = "Hi! I'm your AI assistant. How can I help you today?";
    console.log(`[Initial Greeting] "${text}"`);
    session.conversationHistory.push({ role: 'assistant', text });
    broadcastEvent({ type: 'transcript', role: 'assistant', text, callSid });
    session.state        = 'speaking';
    session.isAISpeaking = true;
    broadcastEvent({ type: 'agent_state', state: 'speaking', callSid });

    streamElevenLabsTTS({
      text,
      onAudioChunk: (b64) => sendToTwilio(b64),
      onComplete:   ()    => {
        console.log('[Initial Greeting] Complete');
        sendMarkToTwilio('greeting-done');
        session.isAISpeaking = false;
        session.state        = 'listening';
        broadcastEvent({ type: 'agent_state', state: 'listening', callSid });
      },
      onError: (e) => {
        console.error('[Greeting TTS Error]', e?.message || e);
        session.isAISpeaking = false;
        session.state        = 'listening';
        broadcastEvent({ type: 'agent_state', state: 'listening', callSid });
      },
    });
  }

  // ── Deepgram transcript handler ──────────────────────────────
  function onTranscript({ transcript, isFinal, speechFinal }) {
    if (!transcript?.trim()) return;

    // Barge-in: user spoke while AI is speaking
    if (session?.isAISpeaking && transcript.trim().length > 2) {
      console.log(`[Barge-In] "${transcript.trim()}" — stopping AI audio`);
      sendClearToTwilio();
      session.activeAbortController?.abort();
      session.isAISpeaking    = false;
      session.currentTurnId++;
      session.state           = 'listening';
      broadcastEvent({ type: 'agent_state', state: 'listening', callSid });
    }

    pendingText = transcript.trim();
    if (!session.lastUserSpeechTime) session.lastUserSpeechTime = Date.now();

    if (isFinal || speechFinal) {
      clearTimeout(utteranceTimer);
      utteranceTimer = setTimeout(() => {
        const text  = pendingText;
        pendingText = '';
        if (text) handleUserTurn(text);
      }, 250);
    }
  }

  function onUtteranceEnd() {
    if (!pendingText.trim()) return;
    clearTimeout(utteranceTimer);
    const text  = pendingText.trim();
    pendingText = '';
    handleUserTurn(text);
  }

  // ── Full LLM → TTS turn ──────────────────────────────────────
  async function handleUserTurn(userText) {
    if (!session) return;

    const turnId     = ++session.currentTurnId;
    const sttLatency = session.lastUserSpeechTime
      ? Date.now() - session.lastUserSpeechTime
      : 0;
    session.lastUserSpeechTime = null;

    console.log(`[STT] User: "${userText}"  (${sttLatency}ms)`);
    broadcastEvent({ type: 'transcript', role: 'user', text: userText, callSid });
    session.state = 'thinking';
    broadcastEvent({ type: 'agent_state', state: 'thinking', callSid });

    const abort = new AbortController();
    session.activeAbortController = abort;
    const { signal } = abort;

    const llmStart = Date.now();

    try {
      let aiText = '';

      if (process.env.MOCK_AI === 'true') {
        aiText = 'This is a mock AI response. How can I help you further?';
      } else {
        aiText = await generateChatResponseStream({
          history: session.conversationHistory,
          userText,
          signal,
        });
      }

      if (signal.aborted || turnId !== session.currentTurnId) return;

      const llmLatency = Date.now() - llmStart;
      console.log(`[LLM] "${aiText}"  (${llmLatency}ms)`);

      session.conversationHistory.push({ role: 'user', text: userText });
      session.conversationHistory.push({ role: 'assistant', text: aiText });

      broadcastEvent({ type: 'transcript', role: 'assistant', text: aiText, callSid });
      session.state        = 'speaking';
      session.isAISpeaking = true;
      broadcastEvent({ type: 'agent_state', state: 'speaking', callSid });

      const ttsStart = Date.now();

      streamElevenLabsTTS({
        text: aiText,
        signal,
        onStart: () => {
          const ttsLatency   = Date.now() - ttsStart;
          const totalLatency = sttLatency + llmLatency + ttsLatency;
          broadcastEvent({ type: 'latency', stt: sttLatency, llm: llmLatency, tts: ttsLatency, total: totalLatency, callSid });
        },
        onAudioChunk: (b64) => {
          if (signal.aborted || turnId !== session.currentTurnId) return;
          sendToTwilio(b64);
        },
        onComplete: () => {
          if (signal.aborted || turnId !== session.currentTurnId) return;
          sendMarkToTwilio(`turn-${turnId}`);
        },
        onError: (e) => {
          console.error('[TTS Error]', e?.message || e);
          session.isAISpeaking = false;
          session.state        = 'listening';
          broadcastEvent({ type: 'agent_state', state: 'listening', callSid });
        },
      });

    } catch (err) {
      if (!signal.aborted) console.error(`[Turn ${turnId} Error]`, err?.message || err);
      session.isAISpeaking = false;
      session.state        = 'listening';
      broadcastEvent({ type: 'agent_state', state: 'listening', callSid });
    }
  }

  // ── Mock conversation loop ───────────────────────────────────
  function runMockLoop() {
    setTimeout(() => handleUserTurn('Hello, who are you?'), 2000);
  }
}
