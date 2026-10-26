import React, { useState } from 'react';
import {
  Github, X, Loader2, Unplug, Lock, Globe,
  ExternalLink, FolderPlus, CheckCircle2, ShieldAlert,
} from 'lucide-react';

/**
 * Per-call GitHub auth panel. The token lives in React state only
 * (never localStorage), is sent to the backend for the live call,
 * and is wiped the moment the session ends.
 */
export default function GitHubPanel({
  token, user, defaultPrivate, isLive, apiBase,
  onConnect, onDisconnect, onPrivateChange, onClose, pushFeed,
}) {
  const [draft, setDraft] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [repoName, setRepoName] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);

  const connected = !!token && !!user;

  async function handleConnect(e) {
    e?.preventDefault();
    setError('');
    const t = draft.trim();
    if (!t) { setError('Paste a token first.'); return; }
    setVerifying(true);
    try {
      const res = await fetch(`${apiBase}/api/github/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Verification failed.');
      onConnect(t, data.user);
      setDraft('');
    } catch (err) {
      setError(err.message || 'Could not verify that token.');
    } finally {
      setVerifying(false);
    }
  }

  function handleDisconnect() {
    onDisconnect();
    setCreated(null);
    setError('');
    setDraft('');
    setRepoName('');
  }

  async function handleCreate(e) {
    e?.preventDefault();
    setError('');
    const name = repoName.trim();
    if (!name) { setError('Type a repository name first.'); return; }
    setCreating(true);
    try {
      const res = await fetch(`${apiBase}/api/github/create-repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, private: defaultPrivate }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Repo creation failed.');
      setCreated(data.repo);
      setRepoName('');
      pushFeed?.({ status: 'success', repoName: data.repo.name, repoUrl: data.repo.htmlUrl, private: data.repo.private });
    } catch (err) {
      setError(err.message || 'Repo creation failed.');
      pushFeed?.({ status: 'error', repoName: name, error: err.message });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="console-panel w-[min(380px,calc(100vw-2rem))] rounded-2xl p-5" role="dialog" aria-label="GitHub connection">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Github className="h-4 w-4 text-slate-200" />
          <h2 className="text-[13px] font-bold tracking-wide text-white">GITHUB FOR THIS CALL</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border hairline bg-white/[0.03] p-1.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="Close GitHub panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!connected ? (
        <form onSubmit={handleConnect} className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-slate-400">
            Paste a token so the agent can create repos on your voice command. Memory-only — wiped on hangup.
          </p>
          <a
            href="https://github.com/settings/tokens/new?description=voice-agent-call&scopes=repo"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 font-mono text-[11px] text-cyan-300 hover:text-cyan-200"
          >
            Get a token: github.com → Settings → Developer settings <ExternalLink className="h-3 w-3" />
          </a>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ghp_… or github_pat_…"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border hairline bg-black/40 px-3.5 py-2.5 font-mono text-[12.5px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
          />
          {error && <p className="flex items-start gap-1.5 text-[12px] leading-snug text-rose-300"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
          <button
            type="submit"
            disabled={verifying}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[13px] font-bold text-slate-950 transition hover:bg-white disabled:opacity-60"
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
            {verifying ? 'VERIFYING…' : 'CONNECT GITHUB'}
          </button>
          <p className="font-mono text-[10px] leading-relaxed text-slate-600">
            NEEDS REPO SCOPE · FINE-GRAINED PAT WITH REPOSITORY READ/WRITE WORKS · REVOKE AFTER YOUR DEMO
          </p>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] px-3.5 py-3">
            {user.avatarUrl
              ? <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full border border-white/20" />
              : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/20 font-mono text-[13px] font-bold text-emerald-200">{(user.login || '?')[0].toUpperCase()}</span>}
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-bold text-white">@{user.login}</p>
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

          {/* default visibility */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] tracking-wide text-slate-500">NEW REPOS DEFAULT</span>
            <div className="flex overflow-hidden rounded-lg border hairline">
              <button
                onClick={() => onPrivateChange(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold transition ${!defaultPrivate ? 'bg-slate-100 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                aria-pressed={!defaultPrivate}
              >
                <Globe className="h-3.5 w-3.5" /> Public
              </button>
              <button
                onClick={() => onPrivateChange(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold transition ${defaultPrivate ? 'bg-slate-100 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                aria-pressed={defaultPrivate}
              >
                <Lock className="h-3.5 w-3.5" /> Private
              </button>
            </div>
          </div>

          {/* manual create (no voice needed) */}
          <form onSubmit={handleCreate} className="space-y-2.5 border-t hairline pt-4">
            <p className="font-mono text-[11px] tracking-wide text-slate-500">OR CREATE ONE RIGHT NOW</p>
            <div className="flex gap-2">
              <input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="my-cool-app"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-xl border hairline bg-black/40 px-3.5 py-2.5 font-mono text-[12.5px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={creating}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2.5 text-[12.5px] font-bold text-slate-950 transition hover:bg-white disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                {creating ? '…' : 'CREATE'}
              </button>
            </div>
            {error && <p className="flex items-start gap-1.5 text-[12px] leading-snug text-rose-300"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
            {created && (
              <p className="flex items-start gap-1.5 text-[12px] leading-snug text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Live: <a href={created.htmlUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-emerald-200">{created.fullName}</a></span>
              </p>
            )}
          </form>

          <p className="font-mono text-[10px] leading-relaxed text-slate-600">
            SAY “CREATE A REPO CALLED …” ANY TIME — THE AGENT BUILDS IT AND READS BACK THE RESULT
          </p>
        </div>
      )}
    </div>
  );
}
