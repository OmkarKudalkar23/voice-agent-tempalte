class SessionManager {
  constructor() {
    this.sessions = new Map(); // callSid or streamSid -> CallSession
    this.streamToCallMap = new Map(); // streamSid -> callSid
  }

  createSession(callSid, streamSid = null) {
    const session = {
      callSid,
      streamSid,
      deepgramConnection: null,
      elevenLabsWs: null,
      conversationHistory: [],
      currentTurnId: 0,
      state: 'connected',
      isAISpeaking: false,
      activeAbortController: null,
      startedAt: Date.now(),
      sttLatency: 0,
      llmLatency: 0,
      ttsLatency: 0,
      totalTurnLatency: 0,
      lastUserSpeechTime: null,
      lastLlmStartTime: null,
      lastTtsStartTime: null,
      // GitHub agent auth — memory only, per call. Never persisted.
      // Set from the browser 'start' / 'github_token' messages, wiped on cleanup.
      githubToken: null,
      githubDefaultPrivate: false,
      // Email agent auth + two-turn confirmation — memory only, per call.
      emailKey: null,
      emailFrom: '',
      pendingEmail: null, // { to, subject, body } awaiting spoken "yes"
    };

    this.sessions.set(callSid, session);
    if (streamSid) {
      this.streamToCallMap.set(streamSid, callSid);
      this.sessions.set(streamSid, session);
    }
    return session;
  }

  getSessionByCallSid(callSid) {
    return this.sessions.get(callSid);
  }

  getSessionByStreamSid(streamSid) {
    const callSid = this.streamToCallMap.get(streamSid);
    if (callSid) {
      return this.sessions.get(callSid);
    }
    return this.sessions.get(streamSid);
  }

  linkStreamSid(callSid, streamSid) {
    const session = this.sessions.get(callSid);
    if (session) {
      session.streamSid = streamSid;
      this.streamToCallMap.set(streamSid, callSid);
      this.sessions.set(streamSid, session);
    }
    return session;
  }

  endSession(identifier) {
    const session = this.sessions.get(identifier);
    if (!session) return;

    // Cleanup resources
    if (session.deepgramConnection) {
      try {
        session.deepgramConnection.finish();
      } catch (err) {
        console.error('Error closing Deepgram connection:', err?.message || err);
      }
    }

    if (session.elevenLabsWs && typeof session.elevenLabsWs.close === 'function') {
      try {
        session.elevenLabsWs.close();
      } catch (err) {
        console.error('Error closing ElevenLabs WS:', err?.message || err);
      }
    }

    if (session.activeAbortController) {
      session.activeAbortController.abort();
    }

    this.sessions.delete(session.callSid);
    if (session.streamSid) {
      this.streamToCallMap.delete(session.streamSid);
      this.sessions.delete(session.streamSid);
    }
    console.log(`[SessionManager] Session ended for callSid=${session.callSid}`);
  }
}

export const sessionManager = new SessionManager();
