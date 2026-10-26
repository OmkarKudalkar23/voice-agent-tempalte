import { sessionManager } from '../agent/conversation.js';
import { createBrowserDeepgramStream } from '../services/deepgram.service.js';
import { createBrowserScribeStream } from '../services/scribe.service.js';
import {
  detectEmailToolCall,
  detectRepoToolCall,
  generateChatResponseStream,
  maybeEmailIntent,
  maybeRepoIntent,
  readEmailConfirmation,
} from '../services/openrouter.service.js';
import { createGithubRepo } from '../services/github.service.js';
import { normalizeAddress, sendEmail } from '../services/email.service.js';
import { streamElevenLabsTTSForBrowser } from '../services/elevenlabs.service.js';

// ── Frontend event broadcast ─────────────────────────────────
const eventClients = new Set();

export function registerEventClient(ws) {
  console.log('[Events WS] Frontend event client connected');
  eventClients.add(ws);
  ws.on('close', () => {
    eventClients.delete(ws);
    console.log('[Events WS] Frontend event client disconnected');
  });
}

export function broadcastEvent(event) {
  const payload = JSON.stringify(event);
  for (const ws of eventClients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

// ── Browser Voice Stream handler ─────────────────────────────
export function handleBrowserVoiceStream(ws) {
  console.log('[Voice Stream] Browser WebSocket connected');

  let sessionId     = null;
  let session       = null;
  let pendingText   = '';
  let utteranceTimer = null;

  // Keep-alive ping
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
  }, 20_000);

  ws.on('pong', () => { /* alive */ });

  // ── Message handler ─────────────────────────────────────────
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {

        // ── start ─────────────────────────────────────────────
        case 'start': {
          sessionId = `BROWSER_${Date.now()}`;
          console.log(`[Voice Stream] Session started: ${sessionId}`);

          session = sessionManager.createSession(sessionId);
          // GitHub agent auth — memory only for this call, never persisted.
          session.githubToken = (typeof msg.githubToken === 'string' && msg.githubToken.trim())
            ? msg.githubToken.trim()
            : null;
          session.githubDefaultPrivate = !!msg.githubDefaultPrivate;
          // Email agent auth — memory only for this call, never persisted.
          session.emailKey = (typeof msg.emailKey === 'string' && msg.emailKey.trim())
            ? msg.emailKey.trim()
            : null;
          session.emailFrom = (typeof msg.emailFrom === 'string') ? msg.emailFrom.trim().slice(0, 120) : '';
          session.pendingEmail = null;

          broadcastEvent({ type: 'call_status', status: 'connected', callSid: sessionId });
          broadcastEvent({ type: 'agent_state', state: 'listening', callSid: sessionId });

          // Tell the browser we're ready
          wsSend({ type: 'ready', sessionId });

          // Initialize STT for browser audio (linear16 / 16kHz).
          // STT_PROVIDER=elevenlabs (Scribe v2 Realtime, default) or deepgram (Nova-3).
          try {
            const provider = (process.env.STT_PROVIDER || 'elevenlabs').toLowerCase();
            const factory = provider === 'deepgram' ? createBrowserDeepgramStream : createBrowserScribeStream;
            console.log(`[Voice Stream] STT provider: ${provider}`);
            session.deepgramConnection = factory({
              onTranscript:   (d) => onTranscript(d),
              onUtteranceEnd: ()  => onUtteranceEnd(),
              onError:        (e) => console.error('[STT Error]', e),
            });
          } catch (e) {
            console.error('[Voice Stream] STT init failed:', e?.message);
            wsSend({ type: 'error', message: 'Failed to initialize speech recognition' });
          }

          // Send greeting after a short delay
          setTimeout(() => sendGreeting(), 300);
          break;
        }

        // ── audio ─────────────────────────────────────────────
        case 'audio': {
          if (!session?.deepgramConnection || !msg.data) break;
          const dg = session.deepgramConnection;
          if (dg.getReadyState() === 1) {
            dg.send(Buffer.from(msg.data, 'base64'));
          }
          break;
        }

        // ── stop ──────────────────────────────────────────────
        case 'stop': {
          console.log(`[Voice Stream] Session stop requested: ${sessionId}`);
          cleanup();
          break;
        }

        // ── github_token ────────────────────────────────────────
        // Connect / update GitHub auth mid-call. Memory only.
        case 'github_token': {
          if (session) {
            session.githubToken = (typeof msg.token === 'string' && msg.token.trim())
              ? msg.token.trim()
              : null;
            if (typeof msg.defaultPrivate === 'boolean') session.githubDefaultPrivate = msg.defaultPrivate;
            console.log(`[Voice Stream] GitHub token ${session.githubToken ? 'attached' : 'cleared'} for ${sessionId}`);
            wsSend({ type: 'github_status', connected: !!session.githubToken });
          }
          break;
        }

        // ── github_disconnect ───────────────────────────────────
        case 'github_disconnect': {
          if (session) {
            session.githubToken = null;
            console.log(`[Voice Stream] GitHub disconnected for ${sessionId}`);
            wsSend({ type: 'github_status', connected: false });
          }
          break;
        }

        // ── email_key ───────────────────────────────────────────
        // Connect / update email auth mid-call. Memory only.
        case 'email_key': {
          if (session) {
            session.emailKey = (typeof msg.key === 'string' && msg.key.trim())
              ? msg.key.trim()
              : null;
            if (typeof msg.from === 'string') session.emailFrom = msg.from.trim().slice(0, 120);
            console.log(`[Voice Stream] Email key ${session.emailKey ? 'attached' : 'cleared'} for ${sessionId}`);
            wsSend({ type: 'email_status', connected: !!session.emailKey });
          }
          break;
        }

        // ── email_disconnect ────────────────────────────────────
        case 'email_disconnect': {
          if (session) {
            session.emailKey = null;
            session.pendingEmail = null;
            console.log(`[Voice Stream] Email disconnected for ${sessionId}`);
            wsSend({ type: 'email_status', connected: false });
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[Voice Stream] Message parse error:', err?.message);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[Voice Stream] WebSocket closed: code=${code} reason=${reason?.toString() || 'none'}`);
    cleanup();
  });

  ws.on('error', (err) => {
    console.error('[Voice Stream] WebSocket error:', err?.message || err);
  });

  // ── Helpers ─────────────────────────────────────────────────

  function wsSend(obj) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(obj));
    }
  }

  function cleanup() {
    clearInterval(pingInterval);
    clearTimeout(utteranceTimer);
    if (session) {
      session.githubToken = null; // wipe per-call GitHub auth
      session.emailKey = null; // wipe per-call email auth
      session.pendingEmail = null;
    }
    if (sessionId) {
      broadcastEvent({ type: 'call_status', status: 'completed', callSid: sessionId });
      broadcastEvent({ type: 'agent_state', state: 'ready', callSid: sessionId });
      sessionManager.endSession(sessionId);
    }
    sessionId = session = null;
  }

  // ── Greeting ────────────────────────────────────────────────
  function sendGreeting() {
    if (ws.readyState !== 1 || !session) return;

    const text = "Hi! I'm your AI assistant. How can I help you today?";
    console.log(`[Greeting] "${text}"`);

    session.conversationHistory.push({ role: 'assistant', text });
    broadcastEvent({ type: 'transcript', role: 'assistant', text, callSid: sessionId });

    session.state        = 'speaking';
    session.isAISpeaking = true;
    broadcastEvent({ type: 'agent_state', state: 'speaking', callSid: sessionId });
    wsSend({ type: 'state', state: 'speaking' });

    streamElevenLabsTTSForBrowser({
      text,
      onAudioChunk: (b64) => wsSend({ type: 'audio', data: b64 }),
      onComplete: () => {
        console.log('[Greeting] TTS complete');
        wsSend({ type: 'audio_end' });
        if (session) {
          session.isAISpeaking = false;
          session.state        = 'listening';
          broadcastEvent({ type: 'agent_state', state: 'listening', callSid: sessionId });
          wsSend({ type: 'state', state: 'listening' });
        }
      },
      onError: (e) => {
        console.error('[Greeting TTS Error]', e?.message || e);
        if (session) {
          session.isAISpeaking = false;
          session.state        = 'listening';
          broadcastEvent({ type: 'agent_state', state: 'listening', callSid: sessionId });
          wsSend({ type: 'state', state: 'listening' });
        }
      },
    });
  }

  // ── Deepgram handlers ──────────────────────────────────────
  function onTranscript({ transcript, isFinal, speechFinal }) {
    if (!transcript?.trim()) return;

    // Barge-in
    if (session?.isAISpeaking && transcript.trim().length > 2) {
      console.log(`[Barge-In] "${transcript.trim()}" — stopping AI audio`);
      session.activeAbortController?.abort();
      session.isAISpeaking    = false;
      session.currentTurnId++;
      session.state           = 'listening';
      broadcastEvent({ type: 'agent_state', state: 'listening', callSid: sessionId });
      wsSend({ type: 'state', state: 'listening' });
      wsSend({ type: 'barge_in' });  // Tell browser to stop playback
    }

    pendingText = transcript.trim();
    if (session && !session.lastUserSpeechTime) session.lastUserSpeechTime = Date.now();

    // Send interim transcripts to frontend for live display
    wsSend({ type: 'interim_transcript', text: pendingText });

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

  // ── Full LLM → TTS turn ────────────────────────────────────
  async function handleUserTurn(userText) {
    if (!session) return;

    const turnId     = ++session.currentTurnId;
    const sttLatency = session.lastUserSpeechTime
      ? Date.now() - session.lastUserSpeechTime
      : 0;
    session.lastUserSpeechTime = null;

    console.log(`[STT] User: "${userText}"  (${sttLatency}ms)`);
    broadcastEvent({ type: 'transcript', role: 'user', text: userText, callSid: sessionId });
    wsSend({ type: 'transcript', role: 'user', text: userText });

    session.state = 'thinking';
    broadcastEvent({ type: 'agent_state', state: 'thinking', callSid: sessionId });
    wsSend({ type: 'state', state: 'thinking' });

    const abort = new AbortController();
    session.activeAbortController = abort;
    const { signal } = abort;

    const llmStart = Date.now();

    try {
      // ── Pending email confirmation (two-turn safety) ────────
      if (session.pendingEmail) {
        const answer = readEmailConfirmation(userText);
        if (answer === true && !signal.aborted && turnId === session.currentTurnId) {
          const sent = await handleSendEmailTurn({ userText, turnId, signal, sttLatency, llmStart });
          if (sent) return;
        } else if (answer === false && !signal.aborted && turnId === session.currentTurnId) {
          const dropped = session.pendingEmail;
          session.pendingEmail = null;
          const evt = { type: 'tool', tool: 'send_email', status: 'cancelled', to: dropped.to, subject: dropped.subject };
          wsSend(evt);
          broadcastEvent({ ...evt, callSid: sessionId });
          await speakReply("Okay, I won't send it. The draft is discarded.", {
            userText, turnId, signal, sttLatency, llmLatency: Date.now() - llmStart,
          });
          return;
        }
        // Anything else: answer normally, keep the draft pending.
      }

      // ── Agentic interception: email drafting ────────────────
      if (!session.pendingEmail && maybeEmailIntent(userText)) {
        let emailArgs = null;
        try {
          emailArgs = await detectEmailToolCall({ history: session.conversationHistory, userText });
        } catch (toolErr) {
          console.warn('[Email] tool detection failed:', toolErr?.message);
        }
        const to = normalizeAddress(emailArgs?.to || '');
        const hasAll = emailArgs && to.includes('@') && String(emailArgs.subject || '').trim() && String(emailArgs.body || '').trim();
        if (hasAll && !signal.aborted && turnId === session.currentTurnId) {
          const key = session.emailKey || process.env.RESEND_API_KEY || null;
          if (!key) {
            const evt = { type: 'tool', tool: 'send_email', status: 'needs_auth', to, subject: String(emailArgs.subject).trim() };
            wsSend(evt);
            broadcastEvent({ ...evt, callSid: sessionId });
            await speakReply(
              "Email isn't connected for this call. Tap the Mail button in the console header, paste your key, and ask me again.",
              { userText, turnId, signal, sttLatency, llmLatency: Date.now() - llmStart }
            );
            return;
          }
          session.pendingEmail = { to, subject: String(emailArgs.subject).trim(), body: String(emailArgs.body).trim() };
          const evt = { type: 'tool', tool: 'send_email', status: 'needs_confirm', to, subject: session.pendingEmail.subject };
          wsSend(evt);
          broadcastEvent({ ...evt, callSid: sessionId });
          await speakReply(
            `I'll send an email to ${to} about ${session.pendingEmail.subject}. Say yes to send it, or no to discard it.`,
            { userText, turnId, signal, sttLatency, llmLatency: Date.now() - llmStart }
          );
          return;
        }
        // Partial info (no address / subject / body yet) — fall through to chat.
      }

      // ── Agentic interception: GitHub repo creation ─────────
      // Only costs an extra model call when the words suggest a repo request.
      if (maybeRepoIntent(userText)) {
        let toolArgs = null;
        try {
          toolArgs = await detectRepoToolCall({ history: session.conversationHistory, userText });
        } catch (toolErr) {
          console.warn('[GitHub] tool detection failed:', toolErr?.message);
        }
        if (toolArgs?.repoName && !signal.aborted && turnId === session.currentTurnId) {
          const handled = await handleCreateRepoTurn({ userText, toolArgs, turnId, signal, sttLatency, llmStart });
          if (handled) return;
          // Detection fired but execution bailed (e.g. barge-in) — fall through to chat.
        }
      }

      const aiText = await generateChatResponseStream({
        history: session.conversationHistory,
        userText,
        signal,
      });

      if (signal.aborted || turnId !== session.currentTurnId) return;

      const llmLatency = Date.now() - llmStart;
      console.log(`[LLM] "${aiText}"  (${llmLatency}ms)`);

      await speakReply(aiText, { userText, turnId, signal, sttLatency, llmLatency });

    } catch (err) {
      if (!signal.aborted) {
        console.error(`[Turn ${turnId} Error]`, err);
        wsSend({ type: 'error', message: err?.message || 'Error processing response' });
      }
      if (session) {
        session.isAISpeaking = false;
        session.state        = 'listening';
        broadcastEvent({ type: 'agent_state', state: 'listening', callSid: sessionId });
        wsSend({ type: 'state', state: 'listening' });
      }
    }
  }

  // ── Email tool turn: send the confirmed draft, speak outcome ──
  async function handleSendEmailTurn({ userText, turnId, signal, sttLatency, llmStart }) {
    const draft = session.pendingEmail;
    if (!draft) return false;
    const key = session.emailKey || process.env.RESEND_API_KEY || null;
    const llmLatency = Date.now() - llmStart;

    if (!key) {
      const evt = { type: 'tool', tool: 'send_email', status: 'needs_auth', to: draft.to, subject: draft.subject };
      wsSend(evt);
      broadcastEvent({ ...evt, callSid: sessionId });
      await speakReply(
        "Email isn't connected for this call. Tap the Mail button in the console header, paste your key, and say send it again.",
        { userText, turnId, signal, sttLatency, llmLatency }
      );
      return true;
    }

    const running = { type: 'tool', tool: 'send_email', status: 'running', to: draft.to, subject: draft.subject };
    wsSend(running);
    broadcastEvent({ ...running, callSid: sessionId });

    try {
      // Browser custom address wins; else verified server default; else test-mode sender.
      const from = session.emailFrom && !session.emailFrom.includes('onboarding@resend.dev')
        ? session.emailFrom
        : (process.env.EMAIL_FROM_ADDRESS || session.emailFrom);
      const result = await sendEmail({ key, to: draft.to, subject: draft.subject, body: draft.body, from });
      session.pendingEmail = null; // sent — draft is spent
      if (signal.aborted || turnId !== session.currentTurnId) return false;
      console.log(`[Email] Sent to ${result.to} (id=${result.id || 'n/a'})`);
      const done = { type: 'tool', tool: 'send_email', status: 'success', to: result.to, subject: result.subject };
      wsSend(done);
      broadcastEvent({ ...done, callSid: sessionId });
      await speakReply(`Sent. Your email to ${result.to} about ${result.subject} is on its way.`, {
        userText, turnId, signal, sttLatency, llmLatency,
      });
      return true;
    } catch (err) {
      if (signal.aborted || turnId !== session.currentTurnId) return false;
      console.error('[Email] send failed:', err?.message);
      const failed = { type: 'tool', tool: 'send_email', status: 'error', to: draft.to, subject: draft.subject, error: err.message };
      wsSend(failed);
      broadcastEvent({ ...failed, callSid: sessionId });
      // Keep the draft so "send it" retries after fixing the key or address.
      await speakReply(`I couldn't send that email. ${err.message || 'Please try again.'}`, {
        userText, turnId, signal, sttLatency, llmLatency,
      });
      return true;
    }
  }

  // ── GitHub tool turn: create repo, then speak the outcome ──
  async function handleCreateRepoTurn({ userText, toolArgs, turnId, signal, sttLatency, llmStart }) {
    const vis = String(toolArgs.visibility || 'unspecified').toLowerCase();
    const isPrivate = vis === 'private' ? true : vis === 'public' ? false : !!session.githubDefaultPrivate;
    const token = session.githubToken || process.env.GITHUB_TOKEN || null;
    const llmLatency = Date.now() - llmStart;
    const repoName = String(toolArgs.repoName || '').trim();

    if (!token) {
      const evt = { type: 'tool', tool: 'create_github_repo', status: 'needs_auth', repoName };
      wsSend(evt);
      broadcastEvent({ ...evt, callSid: sessionId });
      await speakReply(
        "GitHub isn't connected for this call. Tap Connect GitHub in the console header, paste your token, and ask me again.",
        { userText, turnId, signal, sttLatency, llmLatency }
      );
      return true;
    }

    const running = { type: 'tool', tool: 'create_github_repo', status: 'running', repoName, private: isPrivate };
    wsSend(running);
    broadcastEvent({ ...running, callSid: sessionId });

    try {
      const repo = await createGithubRepo({
        token,
        name: repoName,
        description: toolArgs.description || '',
        privateRepo: isPrivate,
      });
      if (signal.aborted || turnId !== session.currentTurnId) return false;
      console.log(`[GitHub] Repo created: ${repo.fullName} (${repo.htmlUrl})`);
      const done = {
        type: 'tool', tool: 'create_github_repo', status: 'success',
        repoName: repo.name, repoUrl: repo.htmlUrl, private: repo.private,
      };
      wsSend(done);
      broadcastEvent({ ...done, callSid: sessionId });
      await speakReply(
        `Done. ${repo.name} is now live on your GitHub as a ${repo.private ? 'private' : 'public'} repository.`,
        { userText, turnId, signal, sttLatency, llmLatency }
      );
      return true;
    } catch (err) {
      if (signal.aborted || turnId !== session.currentTurnId) return false;
      console.error('[GitHub] create failed:', err?.message);
      const failed = {
        type: 'tool', tool: 'create_github_repo', status: 'error',
        repoName, error: err.message || 'Repo creation failed.',
      };
      wsSend(failed);
      broadcastEvent({ ...failed, callSid: sessionId });
      await speakReply(`I couldn't create that repository. ${err.message || 'Please try again.'}`, {
        userText, turnId, signal, sttLatency, llmLatency,
      });
      return true;
    }
  }

  // ── Shared speak pipeline: history + transcript + TTS ──────
  async function speakReply(aiText, { userText, turnId, signal, sttLatency, llmLatency }) {
    if (!aiText || !aiText.trim()) aiText = "Sorry, I didn't catch that. Could you say it again?";
    if (signal.aborted || turnId !== session.currentTurnId) return;

    session.conversationHistory.push({ role: 'user', text: userText });
    session.conversationHistory.push({ role: 'assistant', text: aiText });

    broadcastEvent({ type: 'transcript', role: 'assistant', text: aiText, callSid: sessionId });
    wsSend({ type: 'transcript', role: 'assistant', text: aiText });

    session.state        = 'speaking';
    session.isAISpeaking = true;
    broadcastEvent({ type: 'agent_state', state: 'speaking', callSid: sessionId });
    wsSend({ type: 'state', state: 'speaking' });

    const ttsStart = Date.now();

    streamElevenLabsTTSForBrowser({
      text: aiText,
      signal,
      onStart: () => {
        const ttsLatency   = Date.now() - ttsStart;
        const totalLatency = sttLatency + llmLatency + ttsLatency;
        broadcastEvent({ type: 'latency', stt: sttLatency, llm: llmLatency, tts: ttsLatency, total: totalLatency, callSid: sessionId });
        wsSend({ type: 'latency', stt: sttLatency, llm: llmLatency, tts: ttsLatency, total: totalLatency });
      },
      onAudioChunk: (b64) => {
        if (signal.aborted || turnId !== session.currentTurnId) return;
        wsSend({ type: 'audio', data: b64 });
      },
      onComplete: () => {
        if (signal.aborted || turnId !== session.currentTurnId) return;
        wsSend({ type: 'audio_end' });
        if (session) {
          session.isAISpeaking = false;
          session.state        = 'listening';
          broadcastEvent({ type: 'agent_state', state: 'listening', callSid: sessionId });
          wsSend({ type: 'state', state: 'listening' });
        }
      },
      onError: (e) => {
        console.error('[TTS Error]', e?.message || e);
        if (session) {
          session.isAISpeaking = false;
          session.state        = 'listening';
          broadcastEvent({ type: 'agent_state', state: 'listening', callSid: sessionId });
          wsSend({ type: 'state', state: 'listening' });
        }
      },
    });
  }
}
