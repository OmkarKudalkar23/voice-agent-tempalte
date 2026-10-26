import { SYSTEM_PROMPT } from '../agent/prompt.js';

/**
 * LLM layer over OpenRouter's OpenAI-compatible API (fetch only, no SDK).
 * Model is overridable via OPENROUTER_MODEL (default: openai/gpt-4o-mini).
 */

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

function model() {
  return process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
}

function headers() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is missing in environment variables.');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.PUBLIC_BASE_URL || 'http://localhost:5000',
    'X-Title': 'AI Voice Agent',
  };
}

function toMessages(history = [], userText) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.text,
    })),
    { role: 'user', content: userText },
  ];
}

// ── Tool declarations (OpenAI function format) ───────────────

const REPO_TOOL = {
  name: 'create_github_repo',
  description:
    'Create a new GitHub repository on the user\u2019s account. Call this when the user asks to create, make, spin up, or open a new repo / repository / project on GitHub. Extract the repository name from their words.',
  parameters: {
    type: 'object',
    properties: {
      repoName: { type: 'string', description: 'Repository name the user said, e.g. "my cool app" or "voice-agent-demo". Required.' },
      description: { type: 'string', description: 'Short one-line description of the repo, if the user gave one. Otherwise empty.' },
      visibility: { type: 'string', description: 'public or private if the user stated it, otherwise "unspecified".', enum: ['public', 'private', 'unspecified'] },
    },
    required: ['repoName'],
  },
};

const EMAIL_TOOL = {
  name: 'send_email',
  description:
    'Draft an email the user wants sent. Always call this when the user asks to send, write, mail, or fire off an email — never reply asking for pieces instead. Infer the subject from topic words (e.g. "about the demo" means subject "Demo") and draft a brief 2-3 sentence body from what they said. If the recipient is a name without an address, still call with the name as `to`.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address. If the user only said a name, put the name here so the agent can ask for the address.' },
      subject: { type: 'string', description: 'Email subject line, if the user gave one. Otherwise empty.' },
      body: { type: 'string', description: 'Email body in plain words, if the user dictated one. Otherwise empty.' },
    },
    required: ['to', 'subject', 'body'],
  },
};

// ── Intent pre-filters (skip the extra detection call usually) ─

export function maybeRepoIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return /\b(repo|sitory|repositories|github|git hub)\b|\bcreate\b.*\b(project|code|website|app)\b/i.test(text);
}

export function maybeEmailIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return /\b(e-?mail|mail|send|write).{0,40}\b(to|for)\b|\bsend\b.{0,30}\b(it|that|this|email)\b/i.test(text);
}

/** "yes / send it / go ahead" → true, "no / cancel / never mind" → false, else null. */
export function readEmailConfirmation(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim().toLowerCase();
  if (/^(no|nope|nah|cancel|never mind|don'?t( send| do)|stop|abort)\b/.test(t)) return false;
  if (/^(yes|yeah|yep|yup|sure|ok|okay|correct|right|exactly)\b/.test(t)) return true;
  if (/\b(send it|go ahead|confirm|do it|fire it off|looks good|sounds good)\b/.test(t)) return true;
  return null;
}

// ── Non-streaming tool detection ─────────────────────────────

async function detectToolCall({ declaration, history = [], userText, systemOverride = null }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: model(),
      messages: [
        { role: 'system', content: systemOverride || SYSTEM_PROMPT },
        ...history.map((item) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: item.text,
        })),
        { role: 'user', content: userText },
      ],
      temperature: 0.1,
      max_tokens: 250,
      tools: [{ type: 'function', function: declaration }],
      tool_choice: 'auto',
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const calls = json?.choices?.[0]?.message?.tool_calls || [];
  const hit = calls.find((c) => c?.function?.name === declaration.name);
  if (!hit) return null;
  try {
    return JSON.parse(hit.function.arguments || '{}');
  } catch {
    return null;
  }
}

export async function detectRepoToolCall({ history = [], userText }) {
  return detectToolCall({ declaration: REPO_TOOL, history, userText });
}

export async function detectEmailToolCall({ history = [], userText }) {
  // Strict router instruction: the chat persona makes small models ask for
  // pieces instead of calling. The voice turn already guards the result
  // (address must contain @, confirmation spoken before sending).
  const router = [
    'You are a function router. The user wants to send an email.',
    'You must call send_email and output nothing else — never reply with text.',
    'to: the address exactly as given, converting spoken forms like "X at Y dot com" to X@Y.com. If only a name was said, use the name as-is.',
    'subject: the topic ("about the demo" becomes "Demo", "subject launch update" becomes "Launch update"). If no topic at all, use "Hello".',
    'body: what they dictated, expanded to 2-3 short sentences. If nothing was dictated, write one sentence around the subject.',
  ].join(' ');
  return detectToolCall({ declaration: EMAIL_TOOL, history, userText, systemOverride: router });
}

// ── Streaming chat (voice replies) ───────────────────────────

/**
 * Streams a chat reply token by token.
 * @param {Array} history Array of { role: 'user' | 'assistant', text }
 * @param {string} userText User's new utterance
 * @param {Function} onChunk Callback for each text delta
 * @param {AbortSignal} signal Optional abort signal (barge-in)
 */
export async function generateChatResponseStream({ history = [], userText, onChunk, signal }) {
  const useModel = model();
  console.log(`[OpenRouter] Streaming ${useModel}... Prompt: "${userText}"`);

  const res = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: headers(),
    body: JSON.stringify({
      model: useModel,
      messages: toMessages(history, userText),
      temperature: 0.7,
      max_tokens: 250,
      stream: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let fullText = '';

  while (true) {
    if (signal?.aborted) {
      console.log('[OpenRouter] Stream aborted by caller (barge-in).');
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const events = buf.split('\n\n');
    buf = events.pop() || '';
    for (const evt of events) {
      const line = evt.split('\n').map((l) => l.trim()).find((l) => l.startsWith('data:'));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          if (onChunk) onChunk(delta);
        }
      } catch { /* partial SSE frame — wait for more */ }
    }
  }

  return fullText.trim();
}
