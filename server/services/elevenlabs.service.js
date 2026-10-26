import WebSocket from 'ws';
import { pcm16ToMulaw8k, stripHeader } from './audio.service.js';

// ═══════════════════════════════════════════════════════════════
// 1. streamElevenLabsTTS — Twilio / mulaw 8kHz output
// ═══════════════════════════════════════════════════════════════

export function streamElevenLabsTTS({ text, voiceId, onAudioChunk, onStart, onComplete, onError, signal }) {
  const apiKey        = process.env.ELEVENLABS_API_KEY;
  const targetVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  if (!apiKey) { if (onError) onError(new Error('ELEVENLABS_API_KEY missing')); return; }

  _streamViaWebSocket({
    text,
    voiceId: targetVoiceId,
    apiKey,
    outputFormat: 'ulaw_8000',
    signal,
    processChunk: (rawBuf) => {
      const stripped = stripHeader(rawBuf);
      return stripped.toString('base64');
    },
    onAudioChunk,
    onStart,
    onComplete,
    onError,
    fallback: () => streamElevenLabsHttpFallback({
      text, voiceId: targetVoiceId, apiKey,
      outputFormat: 'ulaw_8000',
      processChunk: (buf) => stripHeader(buf).toString('base64'),
      onAudioChunk, onStart, onComplete, onError, signal,
    }),
  });
}

// ═══════════════════════════════════════════════════════════════
// 2. streamElevenLabsTTSForBrowser — PCM 24kHz output for browser
// ═══════════════════════════════════════════════════════════════

export function streamElevenLabsTTSForBrowser({ text, voiceId, onAudioChunk, onStart, onComplete, onError, signal }) {
  const apiKey        = process.env.ELEVENLABS_API_KEY;
  const targetVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  if (!apiKey) { if (onError) onError(new Error('ELEVENLABS_API_KEY missing')); return; }

  _streamViaWebSocket({
    text,
    voiceId: targetVoiceId,
    apiKey,
    outputFormat: 'pcm_24000',
    signal,
    processChunk: (rawBuf) => {
      // Raw PCM 16-bit signed LE at 24kHz — send as-is base64
      return rawBuf.toString('base64');
    },
    onAudioChunk,
    onStart,
    onComplete,
    onError,
    fallback: () => streamElevenLabsHttpFallback({
      text, voiceId: targetVoiceId, apiKey,
      outputFormat: 'pcm_24000',
      processChunk: (buf) => buf.toString('base64'),
      onAudioChunk, onStart, onComplete, onError, signal,
    }),
  });
}

// ═══════════════════════════════════════════════════════════════
// Shared WebSocket streamer
// ═══════════════════════════════════════════════════════════════

function _streamViaWebSocket({ text, voiceId, apiKey, outputFormat, signal, processChunk, onAudioChunk, onStart, onComplete, onError, fallback }) {
  const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=eleven_flash_v2_5&output_format=${outputFormat}`;
  console.log(`[ElevenLabs WS] Connecting (${outputFormat})...`);

  let hasStarted = false;
  let wsFailed   = false;

  try {
    const ws = new WebSocket(wsUrl, { headers: { 'xi-api-key': apiKey } });

    ws.on('open', () => {
      console.log('[ElevenLabs WS] Connected');
      ws.send(JSON.stringify({ text: ' ', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }));
      ws.send(JSON.stringify({ text: text + ' ', try_trigger_generation: true }));
      ws.send(JSON.stringify({ text: '' }));
    });

    ws.on('message', (data) => {
      if (signal?.aborted) { ws.close(); return; }
      try {
        const resp = JSON.parse(data.toString());
        if (resp.audio) {
          if (!hasStarted) { hasStarted = true; if (onStart) onStart(); }
          const rawBuf = Buffer.from(resp.audio, 'base64');
          const chunk  = processChunk(rawBuf);
          if (chunk && chunk.length > 0) onAudioChunk(chunk);
        }
        if (resp.isFinal) {
          console.log('[ElevenLabs WS] Stream finished');
          if (onComplete) onComplete();
          ws.close();
        }
      } catch (err) {
        console.error('[ElevenLabs WS] Message error:', err);
      }
    });

    ws.on('error', (err) => {
      console.error('[ElevenLabs WS Error]', err?.message || err);
      wsFailed = true;
      ws.close();
      if (fallback) fallback();
    });

    ws.on('close', () => {
      if (!hasStarted && !wsFailed && fallback) {
        console.log('[ElevenLabs WS] Closed early, using HTTP fallback');
        fallback();
      }
    });

    return ws;
  } catch (err) {
    console.error('[ElevenLabs WS Exception]', err);
    if (fallback) fallback();
  }
}

// ═══════════════════════════════════════════════════════════════
// HTTP fallback streamer
// ═══════════════════════════════════════════════════════════════

async function streamElevenLabsHttpFallback({ text, voiceId, apiKey, outputFormat, processChunk, onAudioChunk, onStart, onComplete, onError, signal }) {
  try {
    console.log(`[ElevenLabs HTTP] Streaming (${outputFormat})...`);
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs HTTP ${response.status}: ${errText}`);
    }

    if (onStart) onStart();

    const reader    = response.body.getReader();
    const chunkSize = 960; // 20ms at 24kHz stereo 16-bit (or 40ms at 24kHz mono)

    let remainder = Buffer.alloc(0);
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      const buf = Buffer.concat([remainder, Buffer.from(value)]);
      let offset = 0;
      while (offset + chunkSize <= buf.length) {
        const slice = buf.subarray(offset, offset + chunkSize);
        const chunk = processChunk(slice);
        if (chunk) onAudioChunk(chunk);
        offset += chunkSize;
      }
      remainder = buf.subarray(offset);
    }

    if (remainder.length > 0 && !signal?.aborted) {
      const chunk = processChunk(remainder);
      if (chunk) onAudioChunk(chunk);
    }

    console.log('[ElevenLabs HTTP] Stream complete');
    if (onComplete) onComplete();
  } catch (err) {
    console.error('[ElevenLabs HTTP Error]', err);
    if (onError) onError(err);
  }
}
