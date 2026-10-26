import WebSocket from 'ws';

/**
 * ElevenLabs Scribe v2 Realtime — streaming STT over direct WebSocket.
 *
 * Same interface as the Deepgram browser stream so the voice turn is
 * untouched: createBrowserScribeStream({ onTranscript, onUtteranceEnd, onError })
 * returns { getReadyState, send, finish, close }.
 *
 * - Auth: same ELEVENLABS_API_KEY as TTS (xi-api-key header, key stays server-side).
 * - Audio: linear16 16kHz mono, sent as input_audio_chunk JSON (base64).
 * - VAD commit strategy: silence auto-commits a segment (~1s), which maps to
 *   our isFinal/speechFinal + utterance-end turn handling.
 * - Language locked to `eng` by default (STT_LANGUAGE overrides, empty = auto).
 */

const SCRIBE_WS = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

export function createBrowserScribeStream({ onTranscript, onUtteranceEnd, onError }) {
  return _createStream({
    audioFormat: 'pcm_16000',
    sampleRate: 16000,
    onTranscript,
    onUtteranceEnd,
    onError,
    label: 'pcm/16kHz',
  });
}

function _createStream({ audioFormat, sampleRate, onTranscript, onUtteranceEnd, onError, label }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is missing');

  const language = (process.env.STT_LANGUAGE || 'eng').trim();
  const params = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    audio_format: audioFormat,
    commit_strategy: 'vad',
    vad_silence_threshold_secs: process.env.STT_VAD_SILENCE || '1.0',
    vad_threshold: '0.4',
    min_speech_duration_ms: '100',
    min_silence_duration_ms: '100',
  });
  if (language) params.set('language_code', language);

  const url = `${SCRIBE_WS}?${params.toString()}`;
  console.log(`[Scribe] Connecting (v2-realtime / ${label})...`);

  const ws = new WebSocket(url, { headers: { 'xi-api-key': apiKey } });
  let closed = false;

  const pingTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) { try { ws.ping(); } catch { /* ignore */ } }
  }, 20_000);

  function shutdown() {
    if (closed) return;
    closed = true;
    clearInterval(pingTimer);
    try { ws.close(); } catch { /* ignore */ }
  }

  ws.on('open', () => console.log('[Scribe] Connected (v2-realtime)'));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    try {
      const kind = String(msg.message_type || msg.type || '');
      const text = String(msg.text || msg.transcript || '').trim();

      if (kind === 'session_started') {
        console.log('[Scribe] Session started');
        return;
      }
      if (kind === 'partial_transcript') {
        if (text) onTranscript({ transcript: text, isFinal: false, speechFinal: false, confidence: 0 });
        return;
      }
      if (kind === 'committed_transcript' || kind === 'committed_transcript_with_timestamps') {
        if (!text) return;
        onTranscript({ transcript: text, isFinal: true, speechFinal: true, confidence: 1 });
        if (onUtteranceEnd) onUtteranceEnd();
        return;
      }
      if (/error/i.test(kind) || msg.error) {
        console.error('[Scribe] Server event:', msg.error || msg.message || kind);
        return;
      }
    } catch (err) {
      console.error('[Scribe] Transcript processing error:', err);
    }
  });

  ws.on('error', (err) => {
    console.error('[Scribe] Stream error:', err?.message || err);
    if (onError) onError(err);
  });

  ws.on('close', (code, reason) => {
    clearInterval(pingTimer);
    console.log(`[Scribe] Stream closed: code=${code} reason=${reason?.toString() || 'none'}`);
  });

  return {
    getReadyState: () => ws.readyState,
    send: (audio) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const b64 = Buffer.isBuffer(audio) ? audio.toString('base64') : String(audio);
      if (!b64) return;
      try {
        ws.send(JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: b64,
          commit: false,
          sample_rate: sampleRate,
        }));
      } catch { /* ignore */ }
    },
    commit: () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try { ws.send(JSON.stringify({ message_type: 'commit' })); } catch { /* ignore */ }
    },
    finish: shutdown,
    close: shutdown,
  };
}
