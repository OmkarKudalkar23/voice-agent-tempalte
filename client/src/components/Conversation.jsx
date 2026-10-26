import React, { useRef, useEffect } from 'react';
import { User, Bot, X, MessagesSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Conversation({ transcripts = [], onClose }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcripts]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b hairline px-5 py-4">
        <div className="flex items-center gap-2.5">
          <MessagesSquare className="h-4 w-4 text-cyan-300" />
          <h2 className="text-[13px] font-bold tracking-wide text-white">LIVE TRANSCRIPT</h2>
          <span className="rounded-full border hairline bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-slate-400">
            {transcripts.length} {transcripts.length === 1 ? 'turn' : 'turns'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border hairline bg-white/[0.03] p-1.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="Close transcript"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {transcripts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border hairline bg-white/[0.03]">
              <Bot className="h-5 w-5 text-slate-600" />
            </div>
            <p className="max-w-[26ch] text-[13px] leading-relaxed text-slate-500">
              No speech yet. Start a session and your conversation will stream here turn by turn.
            </p>
            <p className="font-mono text-[10px] tracking-[0.18em] text-slate-600">USER · ASSISTANT · TIMESTAMPS</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {transcripts.map((item, index) => {
              const isUser = item.role === 'user';
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${isUser ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300' : 'border-violet-400/30 bg-violet-400/10 text-violet-300'}`}>
                    {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  </div>
                  <div className={`flex max-w-[82%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <span className="mb-1 px-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-slate-500">
                      {isUser ? 'YOU' : 'AGENT'}
                    </span>
                    <div className={`rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${isUser ? 'rounded-tr-md border border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-50' : 'rounded-tl-md border hairline bg-white/[0.03] text-slate-200'}`}>
                      {item.text}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <div className="border-t hairline px-5 py-3">
        <p className="font-mono text-[10px] leading-relaxed tracking-wide text-slate-600">
          TRANSCRIPTS ARE SESSION-LOCAL · CLEARED ON DISCONNECT
        </p>
      </div>
    </div>
  );
}
