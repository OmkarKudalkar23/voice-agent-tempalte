import React from 'react';
import { motion } from 'framer-motion';
import { Phone, Radio, Cpu, Sparkles, Volume2, ArrowRight } from 'lucide-react';

export default function Architecture({ state = 'ready' }) {
  const currentState = (state || 'ready').toLowerCase();

  const stages = [
    {
      id: 'phone',
      label: 'PHONE',
      sub: 'User Device',
      icon: Phone,
      active: ['calling', 'ringing', 'connected', 'listening', 'thinking', 'speaking'].includes(currentState),
      color: 'border-emerald-500 text-emerald-400 bg-emerald-500/10 shadow-emerald-500/20'
    },
    {
      id: 'twilio',
      label: 'TWILIO',
      sub: 'Media Stream',
      icon: Radio,
      active: ['connected', 'listening', 'thinking', 'speaking'].includes(currentState),
      color: 'border-blue-500 text-blue-400 bg-blue-500/10 shadow-blue-500/20'
    },
    {
      id: 'deepgram',
      label: 'DEEPGRAM',
      sub: 'Nova-3 STT',
      icon: Cpu,
      active: currentState === 'listening',
      color: 'border-cyan-400 text-cyan-300 bg-cyan-400/20 shadow-cyan-400/40'
    },
    {
      id: 'gemini',
      label: 'GEMINI 2.5',
      sub: 'Flash LLM',
      icon: Sparkles,
      active: currentState === 'thinking',
      color: 'border-purple-400 text-purple-300 bg-purple-500/20 shadow-purple-500/40'
    },
    {
      id: 'elevenlabs',
      label: 'ELEVENLABS',
      sub: 'Streaming TTS',
      icon: Volume2,
      active: currentState === 'speaking',
      color: 'border-pink-400 text-pink-300 bg-pink-500/20 shadow-pink-500/40'
    },
    {
      id: 'twilio-out',
      label: 'TWILIO',
      sub: 'μ-law 8kHz',
      icon: Radio,
      active: currentState === 'speaking',
      color: 'border-blue-500 text-blue-400 bg-blue-500/10 shadow-blue-500/20'
    },
    {
      id: 'phone-out',
      label: 'PHONE',
      sub: 'Audio Output',
      icon: Phone,
      active: currentState === 'speaking',
      color: 'border-emerald-500 text-emerald-400 bg-emerald-500/10 shadow-emerald-500/20'
    }
  ];

  return (
    <div className="w-full glass-panel rounded-2xl p-6 border border-slate-800 shadow-xl my-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          Real-Time Pipeline Architecture
        </h3>
        <span className="text-[10px] font-mono text-slate-500">Bidirectional 8kHz μ-law Media Stream</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 overflow-x-auto py-2">
        {stages.map((stage, idx) => {
          const StageIcon = stage.icon;
          return (
            <React.Fragment key={stage.id}>
              <motion.div
                animate={{
                  scale: stage.active ? 1.08 : 1,
                  y: stage.active ? -2 : 0
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-300 min-w-[95px] flex-1 ${
                  stage.active
                    ? `${stage.color} shadow-lg ring-1 ring-white/20`
                    : 'border-slate-800 text-slate-500 bg-slate-900/40'
                }`}
              >
                <StageIcon className={`w-5 h-5 mb-1 ${stage.active ? 'animate-bounce' : 'text-slate-600'}`} />
                <span className="text-[11px] font-bold tracking-tight">{stage.label}</span>
                <span className="text-[9px] font-mono opacity-70 mt-0.5">{stage.sub}</span>
              </motion.div>

              {idx < stages.length - 1 && (
                <ArrowRight
                  className={`w-4 h-4 shrink-0 transition-colors duration-300 ${
                    stage.active ? 'text-purple-400' : 'text-slate-700'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
