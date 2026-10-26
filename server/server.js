import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app    = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Import routes & WS handlers (after dotenv) ──────────────
const { default: callRoutes } = await import('./routes/call.routes.js');
const { default: githubRoutes } = await import('./routes/github.routes.js');
const { default: emailRoutes } = await import('./routes/email.routes.js');
const { handleBrowserVoiceStream, registerEventClient } = await import('./websocket/browserStream.js');

// ── HTTP Routes ──────────────────────────────────────────────
app.use('/api', callRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/email', emailRoutes);

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ error: `${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[Express Error]', err);
  res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
});

// ── WebSocket Servers ────────────────────────────────────────
const voiceWSS  = new WebSocketServer({ noServer: true });  // Browser audio
const eventsWSS = new WebSocketServer({ noServer: true });  // Frontend events

voiceWSS.on('connection', (ws) => {
  handleBrowserVoiceStream(ws);
});

eventsWSS.on('connection', (ws) => {
  registerEventClient(ws);
});

// ── HTTP → WebSocket Upgrade ─────────────────────────────────
server.on('upgrade', (request, socket, head) => {
  try {
    const rawUrl   = request.url ?? '/';
    const pathname = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

    console.log(`[HTTP Upgrade] ${pathname}`);

    if (pathname === '/voice-stream') {
      voiceWSS.handleUpgrade(request, socket, head, (ws) => {
        voiceWSS.emit('connection', ws, request);
      });
      return;
    }

    if (pathname === '/api/events') {
      eventsWSS.handleUpgrade(request, socket, head, (ws) => {
        eventsWSS.emit('connection', ws, request);
      });
      return;
    }

    console.log(`[HTTP Upgrade] Rejected: ${pathname}`);
    socket.destroy();
  } catch (err) {
    console.error('[HTTP Upgrade Error]', err);
    socket.destroy();
  }
});

// ── Start ────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000', 10);

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log(' AI Voice Agent — Browser Mode');
  console.log(`  Port          : ${PORT}`);
  console.log(`  Health        : http://localhost:${PORT}/api/health`);
  console.log(`  Voice Stream  : ws://localhost:${PORT}/voice-stream`);
  console.log(`  Events        : ws://localhost:${PORT}/api/events`);
  console.log('==============================================');
});