import deepgramSdk from '@deepgram/sdk';

const { createClient, LiveEvents } = deepgramSdk;

const EVENT_OPEN          = LiveEvents?.Open          || 'open';
const EVENT_TRANSCRIPT    = LiveEvents?.Transcript    || 'Results';
const EVENT_UTTERANCE_END = LiveEvents?.UtteranceEnd  || 'UtteranceEnd';
const EVENT_ERROR         = LiveEvents?.Error         || 'error';
const EVENT_CLOSE         = LiveEvents?.Close         || 'close';

/**
 * Creates a Deepgram Nova-3 stream configured for Twilio media (mulaw 8kHz).
 */
export function createDeepgramStream({ onTranscript, onUtteranceEnd, onError }) {
  return _createStream({
    encoding: 'mulaw',
    sample_rate: 8000,
    onTranscript,
    onUtteranceEnd,
    onError,
    label: 'mulaw/8kHz',
  });
}

/**
 * Creates a Deepgram Nova-3 stream configured for browser microphone audio (linear16 16kHz).
 */
export function createBrowserDeepgramStream({ onTranscript, onUtteranceEnd, onError }) {
  return _createStream({
    encoding: 'linear16',
    sample_rate: 16000,
    onTranscript,
    onUtteranceEnd,
    onError,
    label: 'linear16/16kHz',
  });
}

// ── Shared stream factory ────────────────────────────────────
function _createStream({ encoding, sample_rate, onTranscript, onUtteranceEnd, onError, label }) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is missing');

  const deepgram = createClient(apiKey);

  const dgConnection = deepgram.listen.live({
    model: 'nova-3',
    encoding,
    sample_rate,
    channels: 1,
    smart_format: true,
    interim_results: true,
    endpointing: 300,
    utterance_end_ms: 1000,
    vad_events: true,
  });

  dgConnection.on(EVENT_OPEN, () => {
    console.log(`[Deepgram] Connected (nova-3 / ${label})`);
  });

  dgConnection.on(EVENT_TRANSCRIPT, (data) => {
    try {
      const alt        = data?.channel?.alternatives?.[0];
      const transcript = alt?.transcript || '';
      const isFinal    = data?.is_final || false;
      const speechFinal = data?.speech_final || false;

      if (transcript.trim().length > 0) {
        onTranscript({ transcript: transcript.trim(), isFinal, speechFinal, confidence: alt?.confidence || 0 });
      }
    } catch (err) {
      console.error('[Deepgram] Transcript processing error:', err);
    }
  });

  if (onUtteranceEnd) {
    dgConnection.on(EVENT_UTTERANCE_END, () => onUtteranceEnd());
  }

  dgConnection.on(EVENT_ERROR, (err) => {
    console.error('[Deepgram] Stream error:', err);
    if (onError) onError(err);
  });

  dgConnection.on(EVENT_CLOSE, () => {
    console.log('[Deepgram] Stream closed');
  });

  return dgConnection;
}
