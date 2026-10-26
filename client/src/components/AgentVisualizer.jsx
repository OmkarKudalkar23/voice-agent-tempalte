import React from 'react';
import { motion } from 'framer-motion';
import { Mic, Activity, PhoneCall, Volume2, Sparkles, CheckCircle2 } from 'lucide-react';

export default function AgentVisualizer({ state = 'ready' }) {
  const currentState = (state || 'ready').toLowerCase();

  const stateConfig = {
    ready: {
      label: 'READY',
      color: 'from-slate-600 via-slate-500 to-slate-700',
      glow: 'shadow-slate-500/20',
      border: 'border-slate-700',
      icon: CheckCircle2,
      textColor: 'text-slate-400'
    },
    calling: {
      label: 'CALLING...',
      color: 'from-amber-500 via-orange-500 to-yellow-500',
      glow: 'shadow-orange-500/40',
      border: 'border-orange-500/50',
      icon: PhoneCall,
      textColor: 'text-orange-400'
    },
    ringing: {
      label: 'RINGING',
      color: 'from-blue-500 via-indigo-500 to-cyan-500',
      glow: 'shadow-indigo-500/40',
      border: 'border-indigo-500/50',
      icon: PhoneCall,
      textColor: 'text-indigo-400'
    },
    connected: {
      label: 'CONNECTED',
      color: 'from-emerald-500 via-teal-500 to-green-500',
      glow: 'shadow-emerald-500/40',
      border: 'border-emerald-500/50',
      icon: Activity,
      textColor: 'text-emerald-400'
    },
    listening: {
      label: 'LISTENING',
      color: 'from-cyan-500 via-blue-500 to-indigo-500',
      glow: 'shadow-cyan-500/50',
      border: 'border-cyan-400/60',
      icon: Mic,
      textColor: 'text-cyan-300'
    },
    thinking: {
      label: 'THINKING',
      color: 'from-purple-600 via-fuchsia-500 to-pink-500',
      glow: 'shadow-purple-500/60',
      border: 'border-purple-400/70',
      icon: Sparkles,
      textColor: 'text-purple-300'
    },
    speaking: {
      label: 'SPEAKING',
      color: 'from-pink-500 via-purple-500 to-indigo-500',
      glow: 'shadow-pink-500/60',
      border: 'border-pink-400/70',
      icon: Volume2,
      textColor: 'text-pink-300'
    }
  };

  const currentConfig = stateConfig[currentState] || stateConfig.ready;
  const StateIcon = currentConfig.icon;

  return (
    <div className="relative flex flex-col items-center justify-center p-8">
      {/* Outer Pulse Rings */}
      <div className="relative flex items-center justify-center w-64 h-64 md:w-72 md:h-72">
        {/* Background Ambient Glow */}
        <motion.div
          animate={{
            scale: currentState === 'speaking' || currentState === 'listening' ? [1, 1.25, 1] : [1, 1.1, 1],
            opacity: currentState === 'ready' ? 0.2 : 0.6
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className={`absolute inset-0 rounded-full bg-gradient-to-tr ${currentConfig.color} blur-3xl opacity-50`}
        />

        {/* Rotating Outer Ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: currentState === 'thinking' ? 4 : 16, repeat: Infinity, ease: 'linear' }}
          className={`absolute inset-0 rounded-full border border-dashed ${currentConfig.border} opacity-40`}
        />

        {/* Secondary Pulsing Ring */}
        <motion.div
          animate={{ scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className={`absolute inset-4 rounded-full border ${currentConfig.border} opacity-30`}
        />

        {/* Central Orb Container */}
        <motion.div
          animate={{
            scale: currentState === 'speaking' ? [1, 1.08, 0.98, 1.05, 1] :
                   currentState === 'listening' ? [1, 1.05, 1] : [1, 1.02, 1]
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className={`relative z-10 w-40 h-40 md:w-44 md:h-44 rounded-full bg-gradient-to-br ${currentConfig.color} p-1 shadow-2xl ${currentConfig.glow}`}
        >
          <div className="w-full h-full rounded-full bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center relative overflow-hidden">
            {/* Orb Inner Glow */}
            <div className={`absolute inset-0 rounded-full bg-gradient-to-b ${currentConfig.color} opacity-20 blur-md`} />

            {/* Icon */}
            <motion.div
              animate={{
                scale: currentState === 'thinking' ? [1, 1.2, 1] : 1,
                rotate: currentState === 'thinking' ? [0, 15, -15, 0] : 0
              }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="z-20 mb-2"
            >
              <StateIcon className={`w-10 h-10 ${currentConfig.textColor}`} />
            </motion.div>

            {/* Waveform Bars when active */}
            {(currentState === 'speaking' || currentState === 'listening') && (
              <div className="flex items-center space-x-1 z-20 h-6">
                {[0.4, 0.8, 1.2, 0.6, 0.9, 0.5].map((delay, idx) => (
                  <motion.div
                    key={idx}
                    animate={{ height: ['4px', '22px', '6px', '18px', '4px'] }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: delay * 0.2,
                      ease: 'easeInOut'
                    }}
                    className={`w-1 rounded-full ${
                      currentState === 'speaking' ? 'bg-pink-400' : 'bg-cyan-400'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* State Badge */}
      <motion.div
        key={currentState}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 flex flex-col items-center"
      >
        <span className={`text-xs font-mono tracking-widest uppercase font-semibold px-4 py-1.5 rounded-full border ${currentConfig.border} bg-slate-900/80 backdrop-blur-md ${currentConfig.textColor} shadow-lg`}>
          {currentConfig.label}
        </span>
      </motion.div>
    </div>
  );
}
