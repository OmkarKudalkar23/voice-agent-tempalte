import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import VoiceOrb3D from '../components/VoiceOrb3D';
import Conversation from '../components/Conversation';
import GitHubPanel from '../components/GitHubPanel';
import EmailPanel, { buildFromHeader } from '../components/EmailPanel';
import {
  Mic, MicOff, PhoneOff, PanelRightOpen, Radio, Cpu,
  Sparkles, Volume2, AudioWaveform, CircleDot, Timer, Hash,
  Github, Mail, Loader2, CheckCircle2, TriangleAlert, X, ExternalLink,
} from 'lucide-react';

const CONTRACT = `THESIS: The agent is a living instrument, not a lab grid; one stage, one light-object, zero card clutter. OWN-WORLD: abyssal black #05070E, hairline console panels, mono data, iridescent WebGL fluid in cyan/violet/magenta by state. STORY: visitor grasps state in 1s, starts voice in 1 click, reads latency honestly. FIRST VIEWPORT: top console bar, centered 3D orb with state headline, docked Talk controls, thin pipeline + latency strip pinned bottom. FORM: grounded direction 4 of 7, seed 677a6e73, brief-pinned over roll. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md`;

const STATE_COPY = {
  ready: { title: 'Ready to talk', sub: 'Start a session and speak naturally. Barge in any time — the agent yields instantly.' },
  connected: { title: 'Connected', sub: 'Secure voice channel open. Say hello to begin.' },
  listening: { title: 'Listening', sub: 'Streaming your voice to Scribe Realtime in real time.' },
  thinking: { title: 'Thinking', sub: 'The OpenRouter model is reasoning over your turn.' },
  speaking: { title: 'Speaking', sub: 'ElevenLabs streaming voice. Talk over it to interrupt.' },
  calling: { title: 'Calling', sub: 'Opening the voice channel…' },
  ringing: { title: 'Ringing', sub: 'Waiting for the session to answer…' },
};

const PIPELINE = [
  { id: 'mic', label: 'BROWSER MIC', icon: Mic, on: (s) => ['connected', 'listening', 'thinking', 'speaking'].includes(s) },
  { id: 'stt', label: 'SCRIBE', sub: 'Realtime v2', icon: AudioWaveform, on: (s) => s === 'listening' },
  { id: 'llm', label: 'OPENROUTER', sub: 'GPT-4o mini', icon: Sparkles, on: (s) => s === 'thinking' },
  { id: 'tts', label: 'ELEVENLABS', sub: 'Flash v2.5', icon: Volume2, on: (s) => s === 'speaking' },
  { id: 'out', label: 'SPEAKERS', sub: '24kHz PCM', icon: Radio, on: (s) => s === 'speaking' },
];

export default function Dashboard() {
  const [agentState, setAgentState] = useState('ready');
  const [sessionId, setSessionId] = useState('');
  const [transcripts, setTranscripts] = useState([]);
  const [latency, setLatency] = useState({ stt: 0, llm: 0, tts: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const isMutedRef = useRef(false);

  // GitHub agent auth — memory only for this call, never stored.
  const [githubToken, setGithubToken] = useState('');
  const [githubUser, setGithubUser] = useState(null);
  const [githubPrivate, setGithubPrivate] = useState(false);
  const [githubPanelOpen, setGithubPanelOpen] = useState(false);
  const [toolFeed, setToolFeed] = useState([]);
  const githubTokenRef = useRef('');
  const githubPrivateRef = useRef(false);

  // Email agent auth — memory only for this call, never stored.
  const [emailKey, setEmailKey] = useState('');
  const [emailFromName, setEmailFromName] = useState('AI Voice Agent');
  const [emailFromAddr, setEmailFromAddr] = useState('');
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const emailKeyRef = useRef('');
  const emailFromNameRef = useRef('AI Voice Agent');
  const emailFromAddrRef = useRef('');

  const voiceWsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const workletRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const nextPlayTime = useRef(0);
  const sourceNodesRef = useRef([]);
  const micAnalyserRef = useRef(null);
  const outAnalyserRef = useRef(null);
  const outGainRef = useRef(null);
  const levelRef = useRef(0);
  const rafRef = useRef(0);
  const stateRef = useRef('ready');
  stateRef.current = agentState;

  const apiHost = window.location.hostname === 'localhost' ? 'localhost:5000' : window.location.host;
  const apiBase = `${window.location.protocol}//${apiHost}`;

  const pushToolEvent = useCallback((evt) => {
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const item = { id, at: Date.now(), ...evt };
    setToolFeed((prev) => [...prev.slice(-3), item]);
    if (evt.status === 'success' || evt.status === 'error') {
      setTimeout(() => setToolFeed((prev) => prev.filter((t) => t.id !== id)), 15000);
    }
  }, []);

  const dismissToolEvent = useCallback((id) => {
    setToolFeed((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Push GitHub auth into the live voice session (no-op when idle).
  const pushGithubToSession = useCallback((token, isPrivate) => {
    githubTokenRef.current = token;
    githubPrivateRef.current = isPrivate;
    if (voiceWsRef.current?.readyState === WebSocket.OPEN) {
      try {
        voiceWsRef.current.send(JSON.stringify({ type: 'github_token', token, defaultPrivate: isPrivate }));
      } catch { /* ignore */ }
    }
  }, []);

  const handleGithubConnect = useCallback((token, user) => {
    setGithubToken(token);
    setGithubUser(user);
    pushGithubToSession(token, githubPrivateRef.current);
  }, [pushGithubToSession]);

  const handleGithubDisconnect = useCallback(() => {
    setGithubToken('');
    setGithubUser(null);
    pushGithubToSession('', githubPrivateRef.current);
    if (voiceWsRef.current?.readyState === WebSocket.OPEN) {
      try { voiceWsRef.current.send(JSON.stringify({ type: 'github_disconnect' })); } catch { /* ignore */ }
    }
  }, [pushGithubToSession]);

  const handleGithubPrivate = useCallback((v) => {
    setGithubPrivate(v);
    pushGithubToSession(githubTokenRef.current, v);
  }, [pushGithubToSession]);

  // Push email auth into the live voice session (no-op when idle).
  const pushEmailToSession = useCallback((key, name, addr) => {
    emailKeyRef.current = key;
    emailFromNameRef.current = name;
    emailFromAddrRef.current = addr;
    if (voiceWsRef.current?.readyState === WebSocket.OPEN) {
      try {
        voiceWsRef.current.send(JSON.stringify({ type: 'email_key', key, from: buildFromHeader(name, addr) }));
      } catch { /* ignore */ }
    }
  }, []);

  const handleEmailConnect = useCallback((key) => {
    setEmailKey(key);
    pushEmailToSession(key, emailFromNameRef.current, emailFromAddrRef.current);
  }, [pushEmailToSession]);

  const handleEmailDisconnect = useCallback(() => {
    setEmailKey('');
    pushEmailToSession('', emailFromNameRef.current, emailFromAddrRef.current);
    if (voiceWsRef.current?.readyState === WebSocket.OPEN) {
      try { voiceWsRef.current.send(JSON.stringify({ type: 'email_disconnect' })); } catch { /* ignore */ }
    }
  }, [pushEmailToSession]);

  const handleEmailFromName = useCallback((v) => {
    setEmailFromName(v);
    pushEmailToSession(emailKeyRef.current, v, emailFromAddrRef.current);
  }, [pushEmailToSession]);

  const handleEmailFromAddr = useCallback((v) => {
    setEmailFromAddr(v);
    pushEmailToSession(emailKeyRef.current, emailFromNameRef.current, v);
  }, [pushEmailToSession]);

  const s = (agentState || 'ready').toLowerCase();
  const copy = STATE_COPY[s] || STATE_COPY.ready;
  const isActive = ['connected', 'listening', 'thinking', 'speaking'].includes(s);

  useEffect(() => {
    let timer;
    if (isActive) timer = setInterval(() => setDuration((d) => d + 1), 1000);
    else setDuration(0);
    return () => clearInterval(timer);
  }, [isActive]);

  // Live audio level loop — drives the 3D orb
  useEffect(() => {
    const micBuf = new Uint8Array(256);
    const outBuf = new Uint8Array(256);
    const tick = () => {
      let lvl = 0;
      const st = stateRef.current;
      try {
        if ((st === 'speaking') && outAnalyserRef.current) {
          outAnalyserRef.current.getByteTimeDomainData(outBuf);
          let sum = 0;
          for (let i = 0; i < outBuf.length; i++) { const v = (outBuf[i] - 128) / 128; sum += v * v; }
          lvl = Math.min(1, Math.sqrt(sum / outBuf.length) * 4.2);
        } else if ((st === 'listening' || st === 'connected') && micAnalyserRef.current && !isMutedRef.current) {
          micAnalyserRef.current.getByteTimeDomainData(micBuf);
          let sum = 0;
          for (let i = 0; i < micBuf.length; i++) { const v = (micBuf[i] - 128) / 128; sum += v * v; }
          lvl = Math.min(1, Math.sqrt(sum / micBuf.length) * 5.0);
        } else if (st === 'thinking') {
          lvl = 0.32 + Math.sin(performance.now() / 380) * 0.14;
        } else if (st === 'speaking') {
          lvl = 0.5 + Math.sin(performance.now() / 160) * 0.2;
        }
      } catch { /* ignore */ }
      levelRef.current += (Math.max(0, lvl) - levelRef.current) * 0.25;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Events WS (latency bus)
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' ? 'localhost:5000' : window.location.host;
    const wsUrl = `${protocol}//${host}/api/events`;
    let ws; let closed = false;
    function connect() {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => console.log('[Events WS] Connected');
        ws.onclose = () => { if (!closed) setTimeout(connect, 3000); };
        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'latency') setLatency({ stt: data.stt || 0, llm: data.llm || 0, tts: data.tts || 0, total: data.total || 0 });
          } catch { /* ignore */ }
        };
      } catch { setTimeout(connect, 3000); }
    }
    connect();
    return () => { closed = true; try { ws?.close(); } catch {} };
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => { const n = !prev; isMutedRef.current = n; return n; });
  }, []);

  const handleStart = useCallback(async () => {
    setIsLoading(true); setErrorMsg(''); setTranscripts([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      mediaStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      await audioCtx.audioWorklet.addModule('/audio-worklet-processor.js');
      const micSource = audioCtx.createMediaStreamSource(stream);

      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 512;
      micAnalyser.smoothingTimeConstant = 0.55;
      micSource.connect(micAnalyser);
      micAnalyserRef.current = micAnalyser;

      const outAnalyser = audioCtx.createAnalyser();
      outAnalyser.fftSize = 512;
      outAnalyser.smoothingTimeConstant = 0.6;
      const outGain = audioCtx.createGain();
      outGain.gain.value = 1;
      outAnalyser.connect(outGain);
      outGain.connect(audioCtx.destination);
      outAnalyserRef.current = outAnalyser;
      outGainRef.current = outGain;

      const recorder = new AudioWorkletNode(audioCtx, 'recorder-processor');
      workletRef.current = recorder;
      micSource.connect(recorder);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? 'localhost:5000' : window.location.host;
      const voiceWs = new WebSocket(`${protocol}//${host}/voice-stream`);
      voiceWsRef.current = voiceWs;

      voiceWs.onopen = () => {
        voiceWs.send(JSON.stringify({
          type: 'start',
          githubToken: githubTokenRef.current || '',
          githubDefaultPrivate: githubPrivateRef.current,
          emailKey: emailKeyRef.current || '',
          emailFrom: buildFromHeader(emailFromNameRef.current, emailFromAddrRef.current),
        }));
        setAgentState('connected');
      };
      recorder.port.onmessage = (e) => {
        if (voiceWs.readyState === WebSocket.OPEN && !isMutedRef.current) {
          const b64 = arrayBufferToBase64(e.data);
          voiceWs.send(JSON.stringify({ type: 'audio', data: b64 }));
        }
      };
      voiceWs.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          switch (msg.type) {
            case 'ready': setSessionId(msg.sessionId || ''); setAgentState('listening'); break;
            case 'state': setAgentState(msg.state); break;
            case 'transcript':
              if (msg.role && msg.text) {
                setTranscripts((prev) => [...prev, { role: msg.role, text: msg.text }]);
                setDrawerOpen(true);
              }
              break;
            case 'audio': playPcmChunk(msg.data); break;
            case 'audio_end': break;
            case 'barge_in': stopPlayback(); break;
            case 'latency': setLatency({ stt: msg.stt || 0, llm: msg.llm || 0, tts: msg.tts || 0, total: msg.total || 0 }); break;
            case 'error': setErrorMsg(msg.message || 'Server error'); break;
            case 'tool':
              pushToolEvent({
                tool: msg.tool, status: msg.status, repoName: msg.repoName, repoUrl: msg.repoUrl,
                private: msg.private, to: msg.to, subject: msg.subject, error: msg.error,
              });
              if (msg.status === 'needs_auth') {
                if (msg.tool === 'send_email') setEmailPanelOpen(true);
                else setGithubPanelOpen(true);
              }
              break;
            case 'github_status': break; // session-side ack, panel state is source of truth
            case 'email_status': break; // session-side ack, panel state is source of truth
            default: break;
          }
        } catch { /* ignore */ }
      };
      voiceWs.onclose = () => teardown();
      voiceWs.onerror = () => { setErrorMsg('Voice connection error. Check the server is running on :5000.'); teardown(); };
    } catch (err) {
      setErrorMsg(err.message || 'Failed to start. Check microphone permissions.');
      setAgentState('ready');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleStop = useCallback(() => {
    if (voiceWsRef.current?.readyState === WebSocket.OPEN) {
      try { voiceWsRef.current.send(JSON.stringify({ type: 'stop' })); } catch {}
    }
    teardown();
  }, []);

  function teardown() {
    stopPlayback();
    if (workletRef.current) { try { workletRef.current.disconnect(); } catch {} workletRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    if (voiceWsRef.current) { try { voiceWsRef.current.close(); } catch {} voiceWsRef.current = null; }
    micAnalyserRef.current = null; outAnalyserRef.current = null; outGainRef.current = null;
    levelRef.current = 0;
    // Wipe per-call GitHub auth the moment the session ends (preference toggle stays).
    githubTokenRef.current = '';
    setGithubToken(''); setGithubUser(null); setGithubPanelOpen(false);
    // Wipe per-call email auth too (sender-name preference stays).
    emailKeyRef.current = '';
    setEmailKey(''); setEmailPanelOpen(false);
    setAgentState('ready'); setSessionId(''); setIsLoading(false);
    nextPlayTime.current = 0;
  }

  function playPcmChunk(base64Data) {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'closed') return;
    const raw = base64ToArrayBuffer(base64Data);
    const int16 = new Int16Array(raw);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    if (outAnalyserRef.current) source.connect(outAnalyserRef.current);
    else source.connect(ctx.destination);
    const startTime = Math.max(ctx.currentTime + 0.01, nextPlayTime.current);
    try { source.start(startTime); } catch { return; }
    nextPlayTime.current = startTime + audioBuffer.duration;
    sourceNodesRef.current.push(source);
    source.onended = () => {
      const idx = sourceNodesRef.current.indexOf(source);
      if (idx !== -1) sourceNodesRef.current.splice(idx, 1);
    };
  }

  function stopPlayback() {
    for (const node of sourceNodesRef.current) { try { node.stop(); } catch {} }
    sourceNodesRef.current = [];
    nextPlayTime.current = 0;
    if (audioCtxRef.current) nextPlayTime.current = audioCtxRef.current.currentTime + 0.02;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const stateColor = s === 'listening' ? 'text-cyan-300' : s === 'thinking' ? 'text-violet-300' : s === 'speaking' ? 'text-pink-300' : s === 'ready' ? 'text-slate-400' : 'text-emerald-300';

  return (
    <div className="min-h-screen text-slate-200 relative flex flex-col overflow-x-hidden">
      <div dangerouslySetInnerHTML={{ __html: `<!-- ${CONTRACT} -->` }} />
      {/* backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 stage-grid" />
        <div className="absolute left-1/2 top-[30%] h-[560px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/10 blur-[130px]" />
      </div>

      {/* ── Console top bar ── */}
      <header className="relative z-20 border-b hairline bg-[#070b14]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-950">
              <AudioWaveform className="h-5 w-5" strokeWidth={2.4} />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-bold tracking-tight text-white">AI Voice Agent</p>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-widest text-emerald-300">
                  PROD
                </span>
              </div>
              <p className="font-mono text-[11px] text-slate-500">realtime console · ws / voice-stream</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 xl:flex" aria-label="Pipeline providers">
            {['Scribe Realtime', 'OpenRouter GPT-4o mini', 'ElevenLabs v2.5'].map((p) => (
              <span key={p} className="rounded-lg border hairline bg-white/[0.02] px-3 py-1.5 font-mono text-[11px] text-slate-400">{p}</span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border hairline bg-white/[0.02] px-3 py-1.5 font-mono text-[11px] text-slate-400 sm:flex">
              <Timer className="h-3.5 w-3.5 text-slate-500" /> {fmt(duration)}
            </span>
            <span className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-widest ${isActive ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300' : 'hairline bg-white/[0.02] text-slate-400'}`}>
              <CircleDot className={`h-3.5 w-3.5 ${isActive ? 'live-dot text-cyan-300' : 'text-slate-600'}`} />
              {s.toUpperCase()}
            </span>
            <div className="relative">
              <button
                onClick={() => setGithubPanelOpen((v) => !v)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-semibold transition ${githubUser ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15' : 'hairline bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white'}`}
                aria-expanded={githubPanelOpen}
                title={githubUser ? `GitHub connected as @${githubUser.login}` : 'Connect GitHub for this call'}
              >
                <Github className="h-4 w-4" />
                <span className="hidden md:inline">{githubUser ? `@${githubUser.login}` : 'GitHub'}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${githubUser ? 'bg-emerald-300' : 'bg-slate-600'}`} />
              </button>
              <AnimatePresence>
                {githubPanelOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setGithubPanelOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      className="absolute right-0 top-12 z-50"
                    >
                      <GitHubPanel
                        token={githubToken}
                        user={githubUser}
                        defaultPrivate={githubPrivate}
                        isLive={isActive}
                        apiBase={apiBase}
                        onConnect={handleGithubConnect}
                        onDisconnect={handleGithubDisconnect}
                        onPrivateChange={handleGithubPrivate}
                        onClose={() => setGithubPanelOpen(false)}
                        pushFeed={pushToolEvent}
                      />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <div className="relative">
              <button
                onClick={() => setEmailPanelOpen((v) => !v)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-semibold transition ${emailKey ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15' : 'hairline bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white'}`}
                aria-expanded={emailPanelOpen}
                title={emailKey ? 'Email connected for this call' : 'Connect email for this call'}
              >
                <Mail className="h-4 w-4" />
                <span className="hidden md:inline">Email</span>
                <span className={`h-1.5 w-1.5 rounded-full ${emailKey ? 'bg-emerald-300' : 'bg-slate-600'}`} />
              </button>
              <AnimatePresence>
                {emailPanelOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setEmailPanelOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      className="absolute right-0 top-12 z-50"
                    >
                      <EmailPanel
                        emailKey={emailKey}
                        emailFromName={emailFromName}
                        emailFromAddr={emailFromAddr}
                        isLive={isActive}
                        apiBase={apiBase}
                        onConnect={handleEmailConnect}
                        onDisconnect={handleEmailDisconnect}
                        onFromNameChange={handleEmailFromName}
                        onFromAddrChange={handleEmailFromAddr}
                        onClose={() => setEmailPanelOpen(false)}
                        pushFeed={pushToolEvent}
                      />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border hairline bg-white/[0.03] px-3 py-2 text-[13px] font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
              aria-expanded={drawerOpen}
            >
              <PanelRightOpen className="h-4 w-4" />
              <span className="hidden md:inline">Transcript</span>
              {transcripts.length > 0 && (
                <span className="rounded-full bg-violet-500/20 px-1.5 font-mono text-[11px] text-violet-200">{transcripts.length}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="relative z-20 mx-auto mt-4 w-[min(680px,calc(100%-2rem))]">
          <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/70 px-4 py-3 text-[13px] text-rose-100 backdrop-blur-xl" role="alert">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
            <div className="flex-1">{errorMsg}</div>
            <button onClick={() => setErrorMsg('')} className="font-mono text-[11px] text-rose-300 hover:text-white" aria-label="Dismiss error">DISMISS</button>
          </div>
        </div>
      )}

      {/* ── Stage ── */}
      <main className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-1 flex-col items-center px-4 pb-40 pt-6 md:px-8 md:pt-10">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-slate-500">
          <Hash className="h-3 w-3" />
          {sessionId ? `SESSION ${sessionId.slice(0, 8).toUpperCase()}` : 'NO ACTIVE SESSION'}
        </div>

        <VoiceOrb3D state={s} levelRef={levelRef} className="mt-2 h-[340px] w-[340px] sm:h-[440px] sm:w-[440px] lg:h-[520px] lg:w-[520px]" />

        <AnimatePresence mode="wait">
          <motion.div
            key={s}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="-mt-4 flex flex-col items-center text-center"
          >
            <h1 className={`text-4xl font-extrabold tracking-[-0.03em] text-white sm:text-5xl ${stateColor}`} style={{ letterSpacing: '-0.03em' }}>
              {copy.title}
            </h1>
            <p className="mt-3 max-w-[52ch] text-[14px] leading-relaxed text-slate-400">{copy.sub}</p>
            {/* live EQ when voice flows */}
            <div className="mt-4 flex h-6 items-center gap-1" aria-hidden>
              {(isActive ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : []).map((i) => (
                <span
                  key={i}
                  className={`eq-bar w-[3px] rounded-full ${s === 'speaking' ? 'bg-pink-400/90' : s === 'thinking' ? 'bg-violet-400/90' : 'bg-cyan-400/90'}`}
                  style={{ height: `${10 + ((i * 7) % 14)}px`, animationDelay: `${i * 0.09}s`, animationDuration: `${0.7 + (i % 4) * 0.12}s` }}
                />
              ))}
              {!isActive && <span className="font-mono text-[11px] tracking-[0.2em] text-slate-600">IDLE · 48kHz IN / 24kHz OUT</span>}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ── Control dock ── */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="console-panel flex items-center gap-2 rounded-2xl p-2">
            {!isActive ? (
              <button
                onClick={handleStart}
                disabled={isLoading}
                className="group flex items-center gap-3 rounded-xl bg-slate-100 px-7 py-3.5 text-[14px] font-bold tracking-wide text-slate-950 transition hover:bg-white disabled:opacity-60"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white transition group-hover:scale-105">
                  <Mic className="h-4 w-4" />
                </span>
                {isLoading ? 'CONNECTING…' : 'START TALKING'}
                <kbd className="hidden rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:block">MIC</kbd>
              </button>
            ) : (
              <>
                <button
                  onClick={handleToggleMute}
                  className={`flex items-center gap-2.5 rounded-xl border px-5 py-3 text-[13px] font-bold transition ${isMuted ? 'border-amber-400/40 bg-amber-400/15 text-amber-50 hover:bg-amber-400/25' : 'hairline bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'}`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone — keep listening'}
                >
                  {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-emerald-300" />}
                  {isMuted ? 'UNMUTE' : 'MUTE'}
                </button>
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2.5 rounded-xl bg-rose-500 px-6 py-3 text-[13px] font-bold text-white transition hover:bg-rose-400"
                >
                  <PhoneOff className="h-4 w-4" /> END SESSION
                </button>
              </>
            )}
          </div>
          <p className="font-mono text-[11px] text-slate-600">
            {isActive ? (isMuted ? 'mic muted — playback continues, barge-in disabled' : 'live — speak to interrupt · browser mic + speakers') : 'uses browser microphone and speakers · permission required'}
          </p>
        </div>
      </main>

      {/* ── Bottom pipeline + latency strip ── */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t hairline bg-[#070b14]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 overflow-x-auto px-4 py-3 md:px-8">
          <div className="flex shrink-0 items-center gap-1.5">
            {PIPELINE.map((node, i) => {
              const Icon = node.icon;
              const on = node.on(s);
              return (
                <React.Fragment key={node.id}>
                  <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all duration-300 ${on ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' : 'hairline bg-white/[0.02] text-slate-500'}`}>
                    <Icon className="h-3.5 w-3.5" />
                    <div className="leading-none">
                      <div className="text-[11px] font-bold tracking-wide">{node.label}</div>
                      {node.sub && <div className="mt-0.5 font-mono text-[9px] opacity-70">{node.sub}</div>}
                    </div>
                    {on && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />}
                  </div>
                  {i < PIPELINE.length - 1 && <span className={`h-px w-4 shrink-0 ${on ? 'bg-cyan-400/50' : 'bg-slate-800'}`} />}
                </React.Fragment>
              );
            })}
          </div>
          <div className="mx-2 hidden h-8 w-px bg-slate-800/80 md:block" />
          <div className="flex shrink-0 items-center gap-4 font-mono text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-500"><Cpu className="h-3.5 w-3.5" /> LATENCY</span>
            {[
              ['STT', latency.stt, 'text-cyan-300'],
              ['LLM', latency.llm, 'text-violet-300'],
              ['TTS', latency.tts, 'text-pink-300'],
              ['TOTAL', latency.total, 'text-emerald-300'],
            ].map(([k, v, c]) => (
              <span key={k} className="flex items-baseline gap-1.5">
                <span className="text-slate-600">{k}</span>
                <span className={`font-semibold ${c}`}>{v ? `${v}ms` : '—'}</span>
              </span>
            ))}
          </div>
          <div className="ml-auto hidden shrink-0 items-center gap-2 font-mono text-[11px] text-slate-600 lg:flex">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 16kHz UP</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> 24kHz DOWN</span>
          </div>
        </div>
      </footer>

      {/* ── GitHub tool activity ── */}
      <div className="fixed bottom-20 right-4 z-40 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {toolFeed.map((ev) => (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={`console-panel flex items-start gap-2.5 rounded-2xl p-3.5 ${ev.status === 'success' ? 'border-emerald-400/30' : ev.status === 'error' ? 'border-rose-500/30' : 'border-cyan-400/25'}`}
            >
              {ev.status === 'running' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-cyan-300" />}
              {ev.status === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />}
              {(ev.status === 'error' || ev.status === 'needs_auth' || ev.status === 'needs_confirm') && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
              {ev.status === 'cancelled' && <X className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
              {ev.tool === 'send_email' ? (
                <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
                  {ev.status === 'running' && <p className="text-slate-200">Sending email to <span className="font-mono font-semibold text-cyan-200">{ev.to}</span>…</p>}
                  {ev.status === 'success' && <p className="text-slate-200">Email to <span className="font-mono font-semibold text-emerald-200">{ev.to}</span> sent.</p>}
                  {ev.status === 'error' && <p className="text-rose-200">Couldn&apos;t send to <span className="font-mono font-semibold">{ev.to || 'recipient'}</span>: {ev.error || 'unknown error.'} Draft kept — say send it to retry.</p>}
                  {ev.status === 'needs_auth' && (
                    <div>
                      <p className="text-amber-200">Email isn&apos;t connected. Connect, then ask again.</p>
                      <button onClick={() => setEmailPanelOpen(true)} className="mt-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11.5px] font-bold text-slate-950 transition hover:bg-white">
                        CONNECT EMAIL
                      </button>
                    </div>
                  )}
                  {ev.status === 'needs_confirm' && <p className="text-amber-200">Ready to send to <span className="font-mono font-semibold">{ev.to}</span> — say <span className="font-semibold">yes</span> on the call to confirm.</p>}
                  {ev.status === 'cancelled' && <p className="text-slate-300">Email draft discarded.</p>}
                </div>
              ) : (
              <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
                {ev.status === 'running' && <p className="text-slate-200">Creating <span className="font-mono font-semibold text-cyan-200">{ev.repoName || 'repository'}</span> on GitHub…</p>}
                {ev.status === 'success' && (
                  <p className="text-slate-200">
                    <span className="font-mono font-semibold text-emerald-200">{ev.repoName}</span> is live{ev.private ? ' (private)' : ''}.
                    {ev.repoUrl && <> <a href={ev.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 underline underline-offset-2 hover:text-cyan-200">Open <ExternalLink className="h-3 w-3" /></a></>}
                  </p>
                )}
                {ev.status === 'error' && <p className="text-rose-200">Couldn&apos;t create <span className="font-mono font-semibold">{ev.repoName || 'repo'}</span>: {ev.error || 'unknown error.'}</p>}
                {ev.status === 'needs_auth' && (
                  <div>
                    <p className="text-amber-200">GitHub isn&apos;t connected. Connect, then ask again.</p>
                    <button onClick={() => setGithubPanelOpen(true)} className="mt-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11.5px] font-bold text-slate-950 transition hover:bg-white">
                      CONNECT GITHUB
                    </button>
                  </div>
                )}
              </div>
              )}
              <button onClick={() => dismissToolEvent(ev.id)} className="rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-white" aria-label="Dismiss notification">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Transcript drawer ── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[2px]"
            />
            <motion.aside
              initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }}
              transition={{ type: 'spring', damping: 30, stiffness: 260 }}
              className="fixed bottom-0 right-0 top-0 z-40 flex w-[min(420px,100vw)] flex-col border-l hairline bg-[#080c16]/97 backdrop-blur-2xl"
              role="dialog" aria-label="Live conversation transcript"
            >
              <Conversation transcripts={transcripts} onClose={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
