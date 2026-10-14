import { type Inquiry, limits, validate } from './validate';

// Static assets are still served without invoking this Worker; only /api/* runs here.
interface Env {
  ASSETS: Fetcher;
  INQUIRIES: D1Database;
  INQUIRY_RATE?: RateLimit;
}

const schema = `CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  page TEXT NOT NULL,
  version TEXT NOT NULL,
  target TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  note TEXT NOT NULL DEFAULT ''
)`;
const insert =
  'INSERT INTO inquiries (created_at, kind, page, version, target, body) VALUES (?, ?, ?, ?, ?, ?)';
// Coarse ceiling on the raw request; url-encoded Japanese is up to 9 bytes per character, so a
// full 2,000-character body is about 18 KB. Field truncation itself happens in validate().
const maxBytes = 64 * 1024;
const localHost = /^(127\.0\.0\.1|localhost|\[::1\])$/;
const trimField = (value: string | undefined, max: number) => (value ?? '').slice(0, max);
const publicOrigin = 'https://open.yokohama';
const formPath = '/corrections/report/';
const donePath = '/corrections/report/done/';

async function store(env: Env, inquiry: Inquiry): Promise<number> {
  const [, inserted] = await env.INQUIRIES.batch([
    env.INQUIRIES.prepare(schema),
    env.INQUIRIES.prepare(insert).bind(
      new Date().toISOString(),
      inquiry.kind,
      inquiry.page,
      inquiry.version,
      inquiry.target,
      inquiry.body,
    ),
  ]);
  const id = inserted.meta.last_row_id;
  if (typeof id !== 'number' || id <= 0) throw new Error('D1 insert returned no row id');
  return id;
}

function reply(
  request: Request,
  url: URL,
  status: number,
  payload: { id?: number | null; error?: string },
  fields: Record<string, string> = {},
): Response {
  const headers = { 'Cache-Control': 'no-store' };
  if ((request.headers.get('Accept') ?? '').includes('application/json'))
    return Response.json(payload, { status, headers });
  const location = new URL(payload.error ? formPath : donePath, url.origin);
  if (payload.error) location.searchParams.set('error', payload.error);
  else if (payload.id) location.searchParams.set('id', String(payload.id));
  for (const [key, value] of Object.entries(fields))
    if (value) location.searchParams.set(key, value);
  return new Response(null, { status: 303, headers: { ...headers, Location: location.href } });
}

async function receive(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'POST')
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return reply(request, url, 403, { error: 'origin' });
  // Browsers always send Content-Length for form posts; chunked uploads are refused before parsing.
  const declared = request.headers.get('Content-Length');
  if (declared === null) return reply(request, url, 411, { error: 'size' });
  const declaredBytes = Number(declared);
  if (!Number.isFinite(declaredBytes)) return reply(request, url, 400, { error: 'form' });
  if (declaredBytes > maxBytes) return reply(request, url, 413, { error: 'size' });
  let form: Record<string, string> = {};
  try {
    const data = await request.formData();
    form = Object.fromEntries(
      [...data.entries()].filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  } catch {
    return reply(request, url, 400, { error: 'form' });
  }
  const echo = {
    page: trimField(form.page, limits.page),
    version: trimField(form.version, limits.version),
    target: trimField(form.target, limits.target),
  };
  const checked = validate(form, [url.origin, publicOrigin]);
  // Bots that fill the hidden field get a success response and nothing is stored.
  if (!checked.ok && checked.error === 'honeypot') return reply(request, url, 200, { id: null });
  if (!checked.ok) return reply(request, url, 400, { error: checked.error }, echo);
  // Only stored inquiries count against the per-address limit. A missing binding is tolerated only
  // for local previews; on any public host it fails closed instead of accepting unlimited writes.
  const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!env.INQUIRY_RATE && !localHost.test(url.hostname))
    return reply(request, url, 503, { error: 'rate' }, echo);
  const gate = env.INQUIRY_RATE ? await env.INQUIRY_RATE.limit({ key }) : { success: true };
  if (!gate.success) return reply(request, url, 429, { error: 'rate' }, echo);
  const id = await store(env, checked.inquiry);
  return reply(request, url, 200, { id });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/inquiries') return receive(request, env, url);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
