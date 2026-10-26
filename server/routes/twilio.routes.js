import express from 'express';
import { generateVoiceTwiml } from '../services/twilio.service.js';
import { broadcastEvent } from '../websocket/mediaStream.js';

const router = express.Router();

// ── POST /twilio/voice ───────────────────────────────────────
// Twilio calls this as soon as the call is answered.
// We return TwiML that connects the call to our WebSocket media stream.
router.post('/voice', (req, res) => {
  try {
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    console.log(`[Twilio Webhook] /voice called — PUBLIC_BASE_URL: ${publicBaseUrl}`);

    const twiml = generateVoiceTwiml(publicBaseUrl);
    console.log(`[Twilio Webhook] Sending TwiML:\n${twiml}`);

    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('[Twilio Voice Error]', err);
    // Even on error we must return valid XML
    res.set('Content-Type', 'text/xml');
    res.status(500).send('<Response><Say>Internal error. Please try again.</Say></Response>');
  }
});

// ── POST /twilio/status ──────────────────────────────────────
// Twilio status callbacks (initiated, ringing, in-progress, completed…)
router.post('/status', (req, res) => {
  const { CallSid, CallStatus } = req.body ?? {};
  console.log(`[Twilio Status] CallSid=${CallSid} Status=${CallStatus}`);

  if (CallSid && CallStatus) {
    broadcastEvent({ type: 'call_status', status: CallStatus.toLowerCase(), callSid: CallSid });
  }

  res.sendStatus(200);
});

export default router;