/**
 * AudioWorklet Processor — Mic Recorder
 * 
 * Captures raw microphone audio, downsamples from the browser's native
 * sample rate (typically 48000Hz) to 16000Hz, converts Float32 → Int16 PCM,
 * and posts 20ms chunks (320 samples) to the main thread.
 */
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 320;                    // 20ms at 16kHz = 320 samples
    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
    this.sampleCounter = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];             // first input, first (mono) channel
    if (!input || input.length === 0) return true;

    const ratio = sampleRate / 16000;         // `sampleRate` is a global in AudioWorklet

    for (let i = 0; i < input.length; i++) {
      this.sampleCounter++;

      if (this.sampleCounter >= ratio) {
        this.sampleCounter -= ratio;

        // Clamp and convert Float32 [-1, 1] → Int16 [-32768, 32767]
        const s = Math.max(-1, Math.min(1, input[i]));
        this.buffer[this.bufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

        if (this.bufferIndex >= this.bufferSize) {
          // Post a copy of the buffer to the main thread
          this.port.postMessage(this.buffer.buffer.slice(0));
          this.bufferIndex = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
