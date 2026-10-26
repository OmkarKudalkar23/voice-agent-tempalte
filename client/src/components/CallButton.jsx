import React from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

export default function CallButton({ state, onStart, onStop, isLoading, isMuted, onToggleMute }) {
  const currentState = (state || 'ready').toLowerCase();
  const isActive = ['connected', 'listening', 'thinking', 'speaking'].includes(currentState);

  return (
    <div className="flex flex-col items-center justify-center w-full my-4 gap-3">
      {!isActive ? (
        <button
          onClick={onStart}
          disabled={isLoading}
          className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 text-base font-bold text-white transition-all duration-300 ease-out bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-2xl shadow-xl shadow-purple-600/30 hover:shadow-purple-600/50 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none overflow-hidden"
        >
          {/* Sheen highlight */}
          <div className="absolute inset-0 w-1/2 h-full bg-white/20 skew-x-12 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000 ease-in-out" />

          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-purple-200" />
          ) : (
            <Mic className="w-5 h-5 fill-current text-white group-hover:scale-110 transition-transform duration-300" />
          )}

          <span className="tracking-wide font-extrabold uppercase">
            {isLoading ? 'Connecting...' : 'TALK TO AI'}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-3">
          {/* Mute Mic Toggle */}
          <button
            onClick={onToggleMute}
            className={`group relative inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white transition-all duration-300 ease-out rounded-2xl shadow-lg border ${
              isMuted
                ? 'bg-amber-600/80 hover:bg-amber-600 border-amber-400/50 shadow-amber-600/30'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 shadow-slate-900/50'
            } hover:scale-105 active:scale-95`}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone (Allows listening without interrupting)"}
          >
            {isMuted ? (
              <>
                <MicOff className="w-4 h-4 text-amber-200" />
                <span className="tracking-wide font-bold">MUTED (LISTEN ONLY)</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-emerald-400" />
                <span className="tracking-wide font-bold">MUTE MIC</span>
              </>
            )}
          </button>

          {/* End Call Button */}
          <button
            onClick={onStop}
            disabled={isLoading}
            className="group relative inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-white transition-all duration-300 ease-out bg-gradient-to-r from-rose-600 to-red-600 rounded-2xl shadow-xl shadow-rose-600/30 hover:shadow-rose-600/50 hover:scale-105 active:scale-95 disabled:opacity-50 border border-rose-500/40"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-rose-200" />
            ) : (
              <MicOff className="w-4 h-4 text-white group-hover:scale-110 transition-transform duration-300" />
            )}
            <span className="tracking-wide font-extrabold uppercase">END CALL</span>
          </button>
        </div>
      )}

      <p className="mt-1 text-xs text-slate-500 font-mono">
        {isActive ? (isMuted ? "Microphone muted — AI voice playback enabled" : "Microphone active — click MUTE MIC to listen without echo") : "Uses your browser microphone & speakers"}
      </p>
    </div>
  );
}
