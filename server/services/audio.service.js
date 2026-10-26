/**
 * Audio Conversion Service for Twilio Media Streams.
 * Converts PCM / MP3 / WAV audio to Twilio μ-law 8000Hz mono base64 payload.
 */

// G.711 mu-law conversion table / algorithm
const BIAS = 0x84;
const CLIP = 32635;

const muLawCompressTable = [
  0,0,1,1,2,2,2,2,3,3,3,3,3,3,3,3,
  4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,
  5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,
  5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,
  6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
  6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
  6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
  6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
  7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7
];

/**
 * Encode a single 16-bit linear PCM sample into 8-bit mu-law sample.
 */
export function linear16ToMulawSample(sample) {
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample = sample + BIAS;
  let exponent = muLawCompressTable[(sample >> 7) & 0xFF];
  let mantissa = (sample >> (exponent + 3)) & 0x0F;
  let mulawbyte = ~(sign | (exponent << 4) | mantissa);
  return mulawbyte & 0xFF;
}

/**
 * Resample 16-bit LE PCM from `inSampleRate` (e.g., 16000 or 24000) to 8000 Hz, and encode as mu-law.
 */
export function pcm16ToMulaw8k(pcmBuffer, inSampleRate = 16000) {
  const bytesPerSample = 2; // 16-bit LE
  const totalInSamples = Math.floor(pcmBuffer.length / bytesPerSample);
  if (totalInSamples === 0) return Buffer.alloc(0);

  const ratio = inSampleRate / 8000;
  const totalOutSamples = Math.floor(totalInSamples / ratio);
  const mulawBuffer = Buffer.alloc(totalOutSamples);

  for (let i = 0; i < totalOutSamples; i++) {
    const inIndex = Math.floor(i * ratio);
    if (inIndex * 2 + 1 < pcmBuffer.length) {
      const sample = pcmBuffer.readInt16LE(inIndex * 2);
      mulawBuffer[i] = linear16ToMulawSample(sample);
    }
  }

  return mulawBuffer;
}

/**
 * Strip WAV header if present (standard WAV header is 44 bytes starting with 'RIFF').
 */
export function stripHeader(buffer) {
  if (buffer.length > 44 && buffer.toString('ascii', 0, 4) === 'RIFF') {
    return buffer.subarray(44);
  }
  return buffer;
}
