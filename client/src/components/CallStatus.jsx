import React, { useEffect, useState } from 'react';
import { Gauge, Clock, Hash, Zap } from 'lucide-react';

export default function CallStatus({ state, callSid, latency = {} }) {
  const [duration, setDuration] = useState(0);

  const isActive = ['calling', 'ringing', 'connected', 'listening', 'thinking', 'speaking'].includes(
    (state || '').toLowerCase()
  );

  useEffect(() => {
    let timer;
    if (isActive) {
      timer = setInterval(() => setDuration((prev) => prev + 1), 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(timer);
  }, [isActive]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const { stt = 0, llm = 0, tts = 0, total = 0 } = latency;

  return (
    <div className="w-full glass-panel rounded-2xl p-5 border border-slate-800/80 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Gauge className="w-4 h-4 text-purple-400" /> Live Metrics & Status
        </h3>
        <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
          {(state || 'READY').toUpperCase()}
        </span>
      </div>

      {/* Meta Bar */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-xs font-mono">
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <div className="text-slate-500 text-[10px] uppercase">Duration</div>
            <div className="font-semibold text-slate-200">{formatDuration(duration)}</div>
          </div>
        </div>

        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex items-center gap-2.5 overflow-hidden">
          <Hash className="w-4 h-4 text-purple-400 shrink-0" />
          <div className="truncate">
            <div className="text-slate-500 text-[10px] uppercase">Call SID</div>
            <div className="font-semibold text-slate-200 truncate">{callSid || 'N/A'}</div>
          </div>
        </div>
      </div>

      {/* Latency Grid */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
          <Zap className="w-3.5 h-3.5 text-yellow-400" /> Pipeline Latencies
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-cyan-400 font-semibold mb-1">STT (Deepgram)</div>
            <div className="text-slate-200 font-bold">{stt ? `${stt}ms` : '--'}</div>
          </div>

          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-purple-400 font-semibold mb-1">LLM (Gemini)</div>
            <div className="text-slate-200 font-bold">{llm ? `${llm}ms` : '--'}</div>
          </div>

          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
            <div className="text-[10px] text-pink-400 font-semibold mb-1">TTS (11Labs)</div>
            <div className="text-slate-200 font-bold">{tts ? `${tts}ms` : '--'}</div>
          </div>

          <div className="bg-purple-950/40 p-2.5 rounded-lg border border-purple-500/30">
            <div className="text-[10px] text-emerald-400 font-semibold mb-1">Total Turn</div>
            <div className="text-emerald-300 font-bold">{total ? `${total}ms` : '--'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
