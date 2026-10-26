/**
 * GitHub service — repo creation via REST API.
 *
 * Auth is per-call only: the caller passes a short-lived token
 * (fine-grained PAT or OAuth token) that is used for exactly one
 * API call and never persisted. Nothing here writes tokens to disk.
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Validate / normalize a repo name the way GitHub expects.
 * Returns a clean name or throws.
 */
export function sanitizeRepoName(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Please tell me a name for the repository.');
  let name = raw.trim();
  // Voice transcripts often add filler: "called X", "named X", quotes, trailing period.
  name = name
    .replace(/^(called|named|titled)\s+/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’.,!?;:]+$/g, '')
    .trim();
  // Spaces → hyphens (voice loves spaces), keep GitHub-legal chars.
  name = name.replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-');
  name = name.replace(/^[.-]+|[.-]+$/g, '');
  if (name.length < 1) throw new Error('That name came out empty after cleanup. Please spell the repository name.');
  if (name.length > 100) throw new Error('That name is too long. GitHub allows up to 100 characters.');
  if (name === '.' || name === '..') throw new Error('That name is not allowed on GitHub.');
  return name;
}

async function githubFetch(path, token, options = {}) {
  if (!token) {
    const err = new Error('GitHub is not connected for this call.');
    err.code = 'NO_TOKEN';
    throw err;
  }
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { res, body };
}

export async function getGithubUser({ token }) {
  const { res, body } = await githubFetch('/user', token, { method: 'GET' });
  if (res.status === 401) {
    const err = new Error('That GitHub token was rejected. Check it is a valid token with repo access.');
    err.code = 'BAD_TOKEN'; err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(body?.message || `GitHub rejected the token check (${res.status}).`);
    err.code = 'VERIFY_FAILED'; err.status = res.status;
    throw err;
  }
  return { login: body.login, name: body.name, avatarUrl: body.avatar_url, htmlUrl: body.html_url };
}

export async function createGithubRepo({ token, name, description = '', privateRepo = false, autoInit = true }) {
  const cleanName = sanitizeRepoName(name);
  const cleanDesc = typeof description === 'string' ? description.trim().slice(0, 350) : '';

  const { res, body } = await githubFetch('/user/repos', token, {
    method: 'POST',
    body: JSON.stringify({
      name: cleanName,
      description: cleanDesc || `Created from the AI voice agent call`,
      private: !!privateRepo,
      auto_init: !!autoInit,
    }),
  });

  if (res.status === 401) {
    const err = new Error('GitHub rejected the token. Reconnect GitHub and try again.');
    err.code = 'BAD_TOKEN'; err.status = 401;
    throw err;
  }
  if (res.status === 422) {
    const errors = (body?.errors || []).map((e) => e.message).filter(Boolean).join(' ');
    const alreadyExists = /already exists|name already/i.test(JSON.stringify(body) + ' ' + errors);
    const err = new Error(
      alreadyExists
        ? `You already have a repository named ${cleanName}. Pick a different name.`
        : `GitHub refused that name. ${errors || 'Try a simpler name with letters, numbers, or hyphens.'}`
    );
    err.code = alreadyExists ? 'ALREADY_EXISTS' : 'INVALID_NAME';
    err.status = 422;
    throw err;
  }
  if (res.status === 403) {
    const err = new Error('GitHub refused: rate limit or the token lacks repo permission. Give the token repository access.');
    err.code = 'FORBIDDEN'; err.status = 403;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(body?.message || `GitHub repo creation failed (${res.status}).`);
    err.code = 'CREATE_FAILED'; err.status = res.status;
    throw err;
  }

  return {
    name: body.name,
    fullName: body.full_name,
    htmlUrl: body.html_url,
    private: body.private,
    defaultBranch: body.default_branch || 'main',
  };
}
