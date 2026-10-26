import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT } from '../agent/prompt.js';

let aiClient = null;

function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing in environment variables.');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export const GITHUB_TOOL_DECLARATION = {
  name: 'create_github_repo',
  description:
    'Create a new GitHub repository on the user\u2019s account. Call this when the user asks to create, make, spin up, or open a new repo / repository / project on GitHub. Extract the repository name from their words.',
  parameters: {
    type: 'OBJECT',
    properties: {
      repoName: {
        type: 'STRING',
        description: 'Repository name the user said, e.g. "my cool app" or "voice-agent-demo". Required.',
      },
      description: {
        type: 'STRING',
        description: 'Short one-line description of the repo, if the user gave one. Otherwise empty.',
      },
      visibility: {
        type: 'STRING',
        description: 'public or private if the user stated it, otherwise "unspecified".',
        enum: ['public', 'private', 'unspecified'],
      },
    },
    required: ['repoName'],
  },
};

/** Cheap pre-filter so most turns skip the extra tool-detection call. */
export function maybeRepoIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return /\b(repo|sitory|repositories|github|git hub)\b|\bcreate\b.*\b(project|code|website|app)\b/i.test(text);
}

function extractFunctionCall(response, toolName) {
  if (!response) return null;
  if (Array.isArray(response.functionCalls)) {
    const hit = response.functionCalls.find((c) => c?.name === toolName);
    if (hit) return hit.args || {};
  }
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const fc = p?.functionCall;
    if (fc?.name === toolName) return fc.args || {};
  }
  return null;
}

/**
 * Ask Gemini (non-streaming, low temp) whether this turn wants a repo created.
 * Returns args { repoName, description, visibility } or null.
 */
export async function detectRepoToolCall({ history = [], userText }) {
  const ai = getGeminiClient();
  const formattedHistory = history.map((item) => ({
    role: item.role === 'assistant' ? 'model' : item.role,
    parts: [{ text: item.text }],
  }));
  const contents = [...formattedHistory, { role: 'user', parts: [{ text: userText }] }];
  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      maxOutputTokens: 200,
      tools: [{ functionDeclarations: [GITHUB_TOOL_DECLARATION] }],
    },
    contents,
  });
  return extractFunctionCall(response, 'create_github_repo');
}

export const EMAIL_TOOL_DECLARATION = {
  name: 'send_email',
  description:
    'Draft an email the user wants sent. Call this when the user asks to send, write, mail, or fire off an email. Extract recipient, subject, and body from their words.',
  parameters: {
    type: 'OBJECT',
    properties: {
      to: {
        type: 'STRING',
        description: 'Recipient email address. If the user only said a name, put the name here so the agent can ask for the address.',
      },
      subject: {
        type: 'STRING',
        description: 'Email subject line, if the user gave one. Otherwise empty.',
      },
      body: {
        type: 'STRING',
        description: 'Email body in plain words, if the user dictated one. Otherwise empty.',
      },
    },
    required: ['to', 'subject', 'body'],
  },
};

/** Cheap pre-filter so most turns skip the extra tool-detection call. */
export function maybeEmailIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return /\b(e-?mail|mail|send|write).{0,40}\b(to|for)\b|\bsend\b.{0,30}\b(it|that|this|email)\b/i.test(text);
}

/**
 * Ask Gemini (non-streaming, low temp) whether this turn wants an email drafted.
 * Returns args { to, subject, body } or null.
 */
export async function detectEmailToolCall({ history = [], userText }) {
  const ai = getGeminiClient();
  const formattedHistory = history.map((item) => ({
    role: item.role === 'assistant' ? 'model' : item.role,
    parts: [{ text: item.text }],
  }));
  const contents = [...formattedHistory, { role: 'user', parts: [{ text: userText }] }];
  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      maxOutputTokens: 250,
      tools: [{ functionDeclarations: [EMAIL_TOOL_DECLARATION] }],
    },
    contents,
  });
  return extractFunctionCall(response, 'send_email');
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

/**
 * Sends prompt and history to the model and streams the response text.
 * @param {Array} history Array of { role: 'user' | 'model', parts: [{ text: string }] }
 * @param {string} userText User's new utterance
 * @param {Function} onChunk Callback for each stream chunk text
 * @param {AbortSignal} signal Optional abort signal
 */
export async function generateGeminiResponseStream({ history = [], userText, onChunk, signal }) {
  const ai = getGeminiClient();

  const formattedHistory = history.map(item => ({
    role: item.role === 'assistant' ? 'model' : item.role,
    parts: [{ text: item.text }]
  }));

  const contents = [
    ...formattedHistory,
    { role: 'user', parts: [{ text: userText }] }
  ];

  console.log(`[Gemini] Requesting response from gemini-3.6-flash... Prompt: "${userText}"`);

  const responseStream = await ai.models.generateContentStream({
    model: 'gemini-3.6-flash',
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
      maxOutputTokens: 250
    },
    contents
  });

  let fullText = '';

  for await (const chunk of responseStream) {
    if (signal?.aborted) {
      console.log('[Gemini] Stream aborted by caller (barge-in).');
      break;
    }
    const chunkText = chunk.text;
    if (chunkText) {
      fullText += chunkText;
      if (onChunk) onChunk(chunkText);
    }
  }

  return fullText.trim();
}
