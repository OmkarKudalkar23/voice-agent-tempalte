import express from 'express';

const router = express.Router();

// ── GET /api/health ──────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'browser-voice',
    timestamp: new Date().toISOString(),
    keys: {
      deepgram:   !!process.env.DEEPGRAM_API_KEY,
      llm:        !!process.env.OPENROUTER_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    },
  });
});

export default router;
