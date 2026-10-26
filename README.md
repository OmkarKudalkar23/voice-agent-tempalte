# AI Voice Call Lab 🎙️📞

A production-structured, real-time voice AI assistant pipeline that initiates actual phone calls via **Twilio Programmable Voice**, streams audio over bidirectional WebSockets to **Deepgram Nova-3** for Speech-to-Text, generates conversational responses using **Google Gemini 2.5 Flash**, synthesizes speech with **ElevenLabs streaming TTS**, and streams μ-law 8kHz audio back into the active telephone call in real-time with full **barge-in / interruption** support and a live visual dashboard.

---

## 🏗️ Architecture Diagram

```
+------------------+         +--------------------+         +-------------------+
|  Caller Phone    |         |   Twilio Voice     |         |   Node.js Server  |
|  (+918433550728) | <=====> |  Programmable      | <=====> |   Express + ws    |
|                  |         |  Media Stream      |   WS    |   (Port 5000)     |
+------------------+         +--------------------+         +---------+---------+
                                                                      |
                   +--------------------------------------------------+
                   |
                   v (Raw μ-law 8kHz Base64 Streams)
      +------------+------------+------------------+------------------+
      |                         |                     |
      v                         v                     v
+------------------+   +------------------+   +------------------+
|     DEEPGRAM     |   |  GEMINI 2.5      |   |   ELEVENLABS     |
|   Nova-3 STT     |   |      FLASH       |   |  Streaming TTS   |
|   (Streaming)    |   |     (LLM)        |   | (eleven_flash)   |
+--------+---------+   +--------+---------+   +--------+---------+
         |                      |                      |
         +===> Transcript =====>+===> Response Text ==>+===> μ-law Audio
                                                             (Sent to Twilio)
```

---

## ⚡ Primary Flow

1. User clicks **"Call Me"** on the AI Voice Call Lab dashboard.
2. Frontend triggers `POST /api/call`.
3. Backend calls Twilio REST API to place an outbound call to `TWILIO_VERIFIED_TO_NUMBER`.
4. User's mobile phone rings; user answers.
5. Twilio connects the live call to the backend WebSocket media stream endpoint (`/media-stream`).
6. Raw caller audio (μ-law 8kHz) is decoded and piped directly to **Deepgram Nova-3**.
7. Finalized user transcript is passed to **Gemini 2.5 Flash** with call history.
8. Response text is streamed to **ElevenLabs** (`eleven_flash_v2_5`) for real-time TTS.
9. Generated audio is converted to headerless μ-law 8000Hz base64 and sent back over Twilio Media Stream WebSocket.
10. Caller hears the AI response directly on their mobile phone.
11. If caller speaks mid-sentence, **barge-in** triggers a Twilio `clear` event, flushes playback queue, and listens for the new utterance.

---

## 🛠️ Prerequisites & Setup

### 1. Requirements
- Node.js v18 or higher
- npm or yarn
- ngrok (`npm install -g ngrok` or download binary)
- Twilio Trial or Paid Account
- Deepgram API Key
- Google Gemini API Key
- ElevenLabs API Key & Voice ID

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
# Twilio Credentials
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+17372508034
TWILIO_VERIFIED_TO_NUMBER=+918433550728

# Speech-to-Text (Deepgram Nova-3)
DEEPGRAM_API_KEY=your_deepgram_api_key

# LLM (Google Gemini 2.5 Flash)
GEMINI_API_KEY=your_gemini_api_key

# Text-to-Speech (ElevenLabs)
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# Server Config
PORT=5000
PUBLIC_BASE_URL=https://xxxx-xx-xxx-xxx-xxx.ngrok-free.app

# Set to true to test UI with simulated calls without provider credits
MOCK_AI=false
```

---

## 🚀 Running the Application

### 1. Install Dependencies

```bash
# Install Server Dependencies
cd server
npm install

# Install Client Dependencies
cd ../client
npm install
```

### 2. Start Backend Server

```bash
cd server
npm run dev
# Server runs on http://localhost:5000
```

### 3. Expose Server via ngrok

In a separate terminal:

```bash
ngrok http 5000
```

Copy the generated HTTPS URL (e.g. `https://a1b2c3d4.ngrok-free.app`) and set `PUBLIC_BASE_URL` in your `.env` file:

```env
PUBLIC_BASE_URL=https://a1b2c3d4.ngrok-free.app
```

Restart the backend server after updating `.env`.

### 4. Start Frontend Client

```bash
cd client
npm run dev
# Open browser at http://localhost:3000
```

---

## 📞 Making Your First Call

1. Open `http://localhost:3000` in your web browser.
2. Verify that `PUBLIC_BASE_URL` is configured with your active ngrok URL.
3. Click **"Call Me"**.
4. Your verified mobile phone (`+918433550728`) will ring.
5. Answer the call and start speaking naturally!
6. Watch the live dashboard display transcripts, pipeline latency metrics, and real-time state changes.

---

## 🔊 Audio Format Explanation

Twilio Media Streams require exact uncompressed audio formats:
- **Encoding**: G.711 μ-law (PCMU)
- **Sample Rate**: 8000 Hz
- **Channels**: 1 (Mono)
- **Payload**: Base64 encoded without WAV or MP3 headers.

Deepgram Nova-3 directly consumes raw μ-law 8kHz audio streams. ElevenLabs generated audio is output as `ulaw_8000` or processed via `audio.service.js` to eliminate header overhead and deliver ultra-low latency playback to Twilio.

---

## ⚡ Mock Development Mode

To test UI components, transitions, and conversation feeds without spending Twilio/API credits, set in `.env`:

```env
MOCK_AI=true
```

---

## ❓ Troubleshooting

- **Twilio error 21210 (Unverified number)**: For trial accounts, ensure destination number (+918433550728) is verified in Twilio Console.
- **WebSocket connection failure**: Ensure `PUBLIC_BASE_URL` uses `https://` (the backend converts this to `wss://` for Twilio Media Streams).
- **Audio delay or latency**: Verify `eleven_flash_v2_5` is used for ElevenLabs and `nova-3` for Deepgram.
