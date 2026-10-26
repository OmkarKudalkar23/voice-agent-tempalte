import React, { useState } from 'react';
import {
  Mail, X, Loader2, Unplug, Send,
  ExternalLink, CheckCircle2, ShieldAlert,
} from 'lucide-react';

/**
 * Build a Resend `from` header from a display name + address.
 * - Verified address → `Name <you@yourdomain.com>` (or bare address).
 * - No address yet → `Name <onboarding@resend.dev>` test-mode sender.
 * - Neither → '' (server falls back to its default).
 */
export function buildFromHeader(name, addr) {
  const n = String(name || '').trim().slice(0, 60);
  const a = String(addr || '').trim();
  if (a) return n ? `${n} <${a}>` : a;
  if (n) return `${n} <onboarding@resend.dev>`;
  return '';
}

/**
 * Per-call email auth + manual compose panel. The API key lives in React
 * state only (never localStorage), is sent to the backend for the live
 * call, and is wiped the moment the session ends.
 */
export default function EmailPanel({
  emailKey, emailFromName, emailFromAddr, isLive, apiBase,
  onConnect, onDisconnect, onFromNameChange, onFromAddrChange, onClose, pushFeed,
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  const connected = !!emailKey;

  function handleConnect(e) {
    e?.preventDefault();
    setError('');
    const k = draft.trim();
    if (!k) { setError('Paste a Resend API key first.'); return; }
    if (!/^re_[A-Za-z0-9_-]{8,}$/.test(k)) {
      setError('That doesn\u2019t look like a Resend key — they start with re_. It\u2019s stored anyway only if you proceed; double-check the paste.');
      return;
    }
    onConnect(k);
    setDraft('');
  }

  function handleDisconnect() {
    onDisconnect();
    setSent(null);
    setError('');
    setDraft('');
    setTo(''); setSubject(''); setBody('');
  }

  async function handleSend(e) {
    e?.preventDefault();
    setError('');
    if (!to.trim() || !subject.trim() || !body.trim()) { setError('To, subject, and message are all required.'); return; }
    setSending(true);
    try {
      const res = await fetch(`${apiBase}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: emailKey, to: to.trim(), subject: subject.trim(), body: body.trim(), from: buildFromHeader(emailFromName, emailFromAddr) || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Email send failed.');
      setSent(data.email);
      setTo(''); setSubject(''); setBody('');
      pushFeed?.({ tool: 'send_email', status: 'success', to: data.email.to, subject: data.email.subject });
    } catch (err) {
      setError(err.message || 'Email send failed.');
      pushFeed?.({ tool: 'send_email', status: 'error', to: to.trim(), error: err.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="console-panel w-[min(380px,calc(100vw-2rem))] rounded-2xl p-5" role="dialog" aria-label="Email connection">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-slate-200" />
          <h2 className="text-[13px] font-bold tracking-wide text-white">EMAIL FOR THIS CALL</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border hairline bg-white/[0.03] p-1.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="Close email panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!connected ? (
        <form onSubmit={handleConnect} className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-slate-400">
            Paste a Resend key so the agent can send emails on your voice command. Memory-only — wiped on hangup.
          </p>
          <a
            href="https://resend.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 font-mono text-[11px] text-cyan-300 hover:text-cyan-200"
          >
            Get a key at resend.com/api-keys <ExternalLink className="h-3 w-3" />
          </a>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="re_…"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border hairline bg-black/40 px-3.5 py-2.5 font-mono text-[12.5px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
          />
          {error && <p className="flex items-start gap-1.5 text-[12px] leading-snug text-rose-300"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[13px] font-bold text-slate-950 transition hover:bg-white"
          >
            <Mail className="h-4 w-4" /> CONNECT EMAIL
          </button>
          <p className="font-mono text-[10px] leading-relaxed text-slate-600">
            TEST MODE SENDS FROM onboarding@resend.dev · VERIFY A DOMAIN ON RESEND TO USE YOUR OWN ADDRESS
          </p>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] px-3.5 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/20">
              <Mail className="h-4 w-4 text-emerald-200" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate font-mono text-[13px] font-bold text-white">re_••••{emailKey.slice(-4)}</p>
              <p className="font-mono text-[10.5px] text-emerald-300/90">
                {isLive ? 'LINKED TO LIVE CALL' : 'READY — LINKS ON NEXT CALL'}
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 rounded-lg border hairline bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-bold text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
            >
              <Unplug className="h-3.5 w-3.5" /> UNPLUG
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-wide text-slate-500">SENDER IDENTITY</span>
              <a
                href="https://resend.com/domains"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-mono text-[10.5px] text-cyan-300 hover:text-cyan-200"
              >
                Verify a domain <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <label className="block space-y-1.5">
              <span className="font-mono text-[11px] tracking-wide text-slate-500">DISPLAY NAME</span>
              <input
                value={emailFromName}
                onChange={(e) => onFromNameChange(e.target.value)}
                placeholder="AI Voice Agent"
                autoComplete="off"
                className="w-full rounded-xl border hairline bg-black/40 px-3.5 py-2.5 text-[12.5px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-mono text-[11px] tracking-wide text-slate-500">FROM ADDRESS (YOUR VERIFIED DOMAIN)</span>
              <input
                value={emailFromAddr}
                onChange={(e) => onFromAddrChange(e.target.value)}
                placeholder="you@yourdomain.com"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border hairline bg-black/40 px-3.5 py-2.5 font-mono text-[12.5px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
              />
            </label>
            <p className="font-mono text-[10px] leading-relaxed text-slate-600">
              {emailFromAddr
                ? `SENDS AS: ${buildFromHeader(emailFromName, emailFromAddr)}`
                : 'EMPTY = TEST MODE (onboarding@resend.dev, TO YOUR OWN ACCOUNT EMAIL ONLY)'}
            </p>
          </div>

          {/* manual compose (no voice needed) */}
          <form onSubmit={handleSend} className="space-y-2.5 border-t hairline pt-4">
            <p className="font-mono text-[11px] tracking-wide text-slate-500">OR WRITE ONE RIGHT NOW</p>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="priya@example.com"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border hairline bg-black/40 px-3.5 py-2.5 font-mono text-[12.5px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              autoComplete="off"
              className="w-full rounded-xl border hairline bg-black/40 px-3.5 py-2.5 text-[12.5px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message…"
              rows={3}
              className="w-full resize-none rounded-xl border hairline bg-black/40 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
            />
            {error && <p className="flex items-start gap-1.5 text-[12px] leading-snug text-rose-300"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
            {sent && (
              <p className="flex items-start gap-1.5 text-[12px] leading-snug text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Sent to {sent.to}.
              </p>
            )}
            <button
              type="submit"
              disabled={sending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[13px] font-bold text-slate-950 transition hover:bg-white disabled:opacity-60"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'SENDING…' : 'SEND NOW'}
            </button>
          </form>

          <p className="font-mono text-[10px] leading-relaxed text-slate-600">
            ON A CALL, DICTATE RECIPIENT + SUBJECT + MESSAGE — THE AGENT READS IT BACK AND SENDS ON YOUR YES
          </p>
        </div>
      )}
    </div>
  );
}
