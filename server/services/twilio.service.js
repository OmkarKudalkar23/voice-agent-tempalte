import twilio from 'twilio';
import { RestClient as SignalWireClient } from '@signalwire/compatibility-api';

function getClient() {
  const swSid   = process.env.SIGNALWIRE_PROJECT_ID;
  const swToken = process.env.SIGNALWIRE_API_TOKEN;
  const swSpace = process.env.SIGNALWIRE_SPACE_URL;

  // Use SignalWire if credentials exist
  if (swSid && swToken && swSpace) {
    return SignalWireClient(swSid, swToken, { signalwireSpaceUrl: swSpace });
  }

  // Fallback to Twilio
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('No Twilio or SignalWire credentials found in .env');
  return twilio(sid, token);
}

// ── initiateCall ─────────────────────────────────────────────
export async function initiateCall(to, from, publicBaseUrl) {
  const client = getClient();
  const toNum   = to   || process.env.TWILIO_VERIFIED_TO_NUMBER; // Works for both
  const fromNum = from || process.env.SIGNALWIRE_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER;

  if (!toNum)   throw new Error('TWILIO_VERIFIED_TO_NUMBER not set (Destination)');
  if (!fromNum) throw new Error('SIGNALWIRE_PHONE_NUMBER or TWILIO_PHONE_NUMBER not set');

  const voiceUrl    = `${publicBaseUrl}/twilio/voice`;
  const statusUrl   = `${publicBaseUrl}/twilio/status`;

  console.log(`[Twilio] Creating call: ${fromNum} → ${toNum}`);
  console.log(`[Twilio] Voice URL  : ${voiceUrl}`);
  console.log(`[Twilio] Status URL : ${statusUrl}`);

  const call = await client.calls.create({
    to:                  toNum,
    from:                fromNum,
    url:                 voiceUrl,
    statusCallback:      statusUrl,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  });

  console.log(`[Twilio] Call SID: ${call.sid} | Status: ${call.status}`);
  return { callSid: call.sid, status: call.status, to: call.to, from: call.from };
}

// ── endCall ──────────────────────────────────────────────────
export async function endCall(callSid) {
  const client = getClient();
  console.log(`[Twilio] Ending call ${callSid}`);
  const call = await client.calls(callSid).update({ status: 'completed' });
  return { callSid: call.sid, status: call.status };
}

// ── generateVoiceTwiml ───────────────────────────────────────
// Returns TwiML that connects Twilio to our bidirectional WebSocket
// media stream. We do NOT use <Say> here — the AI handles greetings.
export function generateVoiceTwiml(publicBaseUrl) {
  if (!publicBaseUrl) throw new Error('PUBLIC_BASE_URL is not set');

  const TwiML = twilio.twiml.VoiceResponse;
  const response = new TwiML();

  const wsUrl = publicBaseUrl
    .replace(/^https?/, 'wss')     // always wss
    .replace(/\/+$/, '')           // strip trailing slash
    .concat('/media-stream');

  console.log(`[Twilio] Media Stream WSS URL: ${wsUrl}`);

  const connect = response.connect();
  connect.stream({ url: wsUrl });

  return response.toString();
}
