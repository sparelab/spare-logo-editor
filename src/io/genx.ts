import { writeFileSync } from 'node:fs';
import { log } from '../utils/log.js';

const BASE = 'https://query.genx.sh/api/v1';
const POLL_MIN_MS = 3000;
const POLL_MAX_MS = 15000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Prepended to every user prompt. The image will be aggressively downsampled
 * to ~80×40 character cells (≈80×80 image pixels) and rendered in a terminal
 * with the half-block trick. Photorealism, gradients, fine detail, and
 * busy backgrounds all collapse into mush at that resolution, so we
 * insist hard on a flat, bold, icon-style result.
 */
/**
 * Chroma-key colors. We default to vivid lime green and ask the model to
 * avoid green in the subject. If the user prompt actually wants green
 * (e.g. "grass logo"), we switch to vivid purple/magenta so the chroma
 * doesn't get stripped from the subject itself.
 */
const CHROMA_GREEN = {
  r: 0, g: 255, b: 119,
  hex: '#00FF77',
  rgbText: 'RGB 0, 255, 119',
  avoidWords: 'green or any green-ish hues',
} as const;
const CHROMA_PURPLE = {
  r: 255, g: 119, b: 255,
  hex: '#FF77FF',
  rgbText: 'RGB 255, 119, 255',
  avoidWords: 'purple, magenta, pink, or any violet-ish hues',
} as const;

export type ChromaKey = { r: number; g: number; b: number };

/** Pick chroma based on whether the user prompt clearly wants a green subject. */
export function pickChromaKey(userPrompt: string): typeof CHROMA_GREEN | typeof CHROMA_PURPLE {
  // Hit on a vocabulary likely to produce a green subject so the chroma
  // wouldn't conflict.
  if (/\b(green|forest|grass|leaf|leaves|emerald|lime|olive|moss|jade|mint|kale|jungle|frog|cactus|eco)\b/i.test(userPrompt)) {
    return CHROMA_PURPLE;
  }
  return CHROMA_GREEN;
}

function buildSystemPrompt(chroma: typeof CHROMA_GREEN | typeof CHROMA_PURPLE): string {
  return (
    'CRITICAL: this image will be displayed in a TERMINAL (CLI). The subject ' +
    'must be CENTERED and fill the canvas. ' +
    'COLORS: use ONLY colors from the xterm 256-color palette — no out-of-' +
    'palette tones, no smooth gradients (banded fills are fine). AVOID using ' +
    `${chroma.avoidWords} anywhere in the subject. ` +
    'STROKES: avoid thin or hairline outlines; use thick, chunky strokes that ' +
    'survive being shrunk to a tiny grid. Drop shadows and simple shading are ' +
    'allowed. ' +
    'BACKGROUND: fill the entire background with the EXACT solid color ' +
    `${chroma.hex} (${chroma.rgbText}). Do NOT use any other color, gradient, ` +
    'scene, or texture for the background — it is a chroma-key fill that will ' +
    'be removed in post-processing. ' +
    'Subject: '
  );
}

export class GenxError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

type SubmitResponse = { job_id?: string; jobId?: string };

type JobResponse = {
  status?: string;
  state?: string;
  result_url?: string;
  resultUrl?: string;
  result?: { url?: string };
  output?: { url?: string };
  error?: string | { message?: string };
};

/**
 * Submit a prompt to GenX and poll until the image is ready.
 * Downloads the result to a temp file and returns its path along with the
 * chroma-key colour the system prompt asked the model to use, so the caller
 * can strip it during decode.
 */
export async function generateImage(opts: {
  apiKey: string;
  prompt: string;
  model?: string;
  onStatus?: (msg: string) => void;
  signal?: AbortSignal;
}): Promise<{ file: string; chromaKey: ChromaKey }> {
  const { apiKey, prompt, model = 'gpt-image-2', onStatus, signal } = opts;

  const chroma = pickChromaKey(prompt);
  const fullPrompt = buildSystemPrompt(chroma) + prompt;
  log('genx submit', { model, chroma: chroma.hex, fullPrompt });
  onStatus?.('submitting…');
  const submit = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      params: {
        prompt: fullPrompt,
        // gpt-image-2 supports low/medium/high. We downsample to a tiny
        // canvas anyway, so "low" is fastest and cheapest.
        outputQuality: 'low',
        // "auto" lets the model pick a resolution that fits the prompt
        // rather than forcing a fixed WxH.
        size: 'auto',
      },
    }),
    signal,
  });
  if (!submit.ok) {
    const txt = await safeText(submit);
    log('genx submit failed', submit.status, txt);
    throw new GenxError(
      `submit failed (${submit.status}): ${txt || submit.statusText}`,
      submit.status,
    );
  }
  const submitBody = (await submit.json()) as SubmitResponse;
  const jobId = submitBody.job_id ?? submitBody.jobId;
  if (!jobId) {
    log('genx submit response missing job id', submitBody);
    throw new GenxError('no job id in response');
  }
  log('genx job submitted', jobId);

  // Poll job status with backoff. The router rate-limits aggressively, so
  // we start at POLL_MIN_MS and grow toward POLL_MAX_MS, honoring a server-
  // sent `Retry-After` header on 429s without surfacing them as fatal errors.
  const started = Date.now();
  let interval = POLL_MIN_MS;
  while (true) {
    if (signal?.aborted) throw new GenxError('aborted');
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      throw new GenxError('timed out waiting for result');
    }
    await sleep(interval, signal);
    onStatus?.(`polling… ${Math.round((Date.now() - started) / 1000)}s`);
    const job = await fetch(`${BASE}/jobs/${jobId}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (job.status === 429) {
      // Back off and try again — don't fail the whole request on a transient
      // rate limit. Prefer the server's Retry-After hint when present.
      const ra = Number(job.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0
        ? Math.min(POLL_MAX_MS * 2, ra * 1000)
        : Math.min(POLL_MAX_MS, interval * 2);
      log('genx 429', { retryAfter: ra, wait });
      onStatus?.(`rate-limited, retrying in ${Math.round(wait / 1000)}s`);
      interval = Math.min(POLL_MAX_MS, Math.max(interval, wait));
      continue;
    }
    if (!job.ok) {
      const txt = await safeText(job);
      log('genx poll failed', job.status, txt);
      throw new GenxError(
        `poll failed (${job.status}): ${txt || job.statusText}`,
        job.status,
      );
    }
    // Success — gently grow the interval so a long job doesn't spam the API.
    interval = Math.min(POLL_MAX_MS, Math.round(interval * 1.3));
    const body = (await job.json()) as JobResponse;
    const status = (body.status ?? body.state ?? '').toLowerCase();
    if (body.error) {
      const msg =
        typeof body.error === 'string' ? body.error : body.error.message ?? 'unknown';
      throw new GenxError(`job failed: ${msg}`);
    }
    if (status === 'failed' || status === 'error') {
      throw new GenxError(`job ${status}`);
    }
    log('genx poll', { jobId, status, hasResult: !!(body.result_url ?? body.resultUrl) });
    const url =
      body.result_url ??
      body.resultUrl ??
      body.result?.url ??
      body.output?.url;
    if (url) {
      log('genx ready', url);
      onStatus?.('downloading…');
      // Some result URLs are presigned (no auth needed) and some live behind
      // the GenX API gateway and require the bearer token. Pass the key so
      // the latter case works; presigned URLs typically ignore extra headers.
      const file = await downloadToTemp(url, signal, apiKey);
      return { file, chromaKey: { r: chroma.r, g: chroma.g, b: chroma.b } };
    }
    // Still pending — loop.
  }
}

async function downloadToTemp(
  url: string,
  signal?: AbortSignal,
  apiKey?: string,
): Promise<string> {
  // First try without auth — presigned URLs (S3/R2/etc.) reject extra
  // Authorization headers. Then retry with auth if the server says no.
  let res = await fetch(url, { signal });
  log('genx download', { host: hostOf(url), status: res.status });
  if ((res.status === 401 || res.status === 403) && apiKey) {
    log('genx download retrying with auth');
    res = await fetch(url, {
      signal,
      headers: { authorization: `Bearer ${apiKey}` },
    });
    log('genx download (auth)', { status: res.status });
  }
  if (!res.ok) {
    throw new GenxError(`download failed (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = pickExtension(url, res.headers.get('content-type'));
  // Write to /tmp (not os.tmpdir(), which macOS resolves to /var/folders/...)
  // so the user can easily diff the original PNG against the editor's
  // downsampled view.
  const out = `/tmp/genx-${Date.now()}${ext}`;
  writeFileSync(out, buf);
  log('genx saved', { path: out, bytes: buf.length });
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '?';
  }
}

function pickExtension(url: string, contentType: string | null): string {
  const fromUrl = url.match(/\.(png|jpe?g|gif|webp|bmp)(?:\?|$)/i)?.[1];
  if (fromUrl) return `.${fromUrl.toLowerCase()}`;
  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg'))
    return '.jpg';
  if (contentType?.includes('webp')) return '.webp';
  if (contentType?.includes('gif')) return '.gif';
  return '.png';
}

async function safeText(r: Response): Promise<string> {
  try {
    return (await r.text()).slice(0, 200);
  } catch {
    return '';
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new GenxError('aborted'));
      },
      { once: true },
    );
  });
}
