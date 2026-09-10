// Pure validation for citizen inquiries. No I/O, so it is unit-tested without Workers.
export const kinds = ['error', 'question', 'request'] as const;
export type Kind = (typeof kinds)[number];
export const limits = { page: 500, version: 400, target: 500, body: 2000 } as const;
export interface Inquiry {
  kind: Kind;
  page: string;
  version: string;
  target: string;
  body: string;
}
export type Rejection = 'honeypot' | 'kind' | 'page' | 'body';
export type Validation = { ok: true; inquiry: Inquiry } | { ok: false; error: Rejection };

const isKind = (value: string): value is Kind => (kinds as readonly string[]).includes(value);
// Keep newlines and tabs; drop other control characters that break terminals and CSV exports.
const printable = (char: string) => {
  const code = char.charCodeAt(0);
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
};
// Form posts send CRLF; normalise first so the limit counts characters the way maxlength does.
const clean = (value: string, max: number) =>
  [...value.replace(/\r\n?/g, '\n')].filter(printable).join('').trim().slice(0, max);

/** Accepts a site path or an absolute URL on one of the site origins; returns path+query, or null. */
export function normalizePage(raw: string, origins: readonly string[]): string | null {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('//')) return null;
  try {
    const url = new URL(value, origins[0]);
    if (!origins.includes(url.origin) || url.username || url.password) return null;
    return (url.pathname + url.search).slice(0, limits.page);
  } catch {
    return null;
  }
}

export function validate(form: Record<string, string>, origins: readonly string[]): Validation {
  if ((form.website ?? '').trim() !== '') return { ok: false, error: 'honeypot' };
  const kind = (form.kind ?? 'error').trim();
  if (!isKind(kind)) return { ok: false, error: 'kind' };
  const page = normalizePage(form.page ?? '', origins);
  if (page === null) return { ok: false, error: 'page' };
  const body = clean(form.body ?? '', limits.body);
  if (!body) return { ok: false, error: 'body' };
  return {
    ok: true,
    inquiry: {
      kind,
      page,
      version: clean(form.version ?? '', limits.version),
      target: clean(form.target ?? '', limits.target),
      body,
    },
  };
}
