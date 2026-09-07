// Local-process budgets only. This is not a distributed/cloud rate limiter.
export const maxResponseBytes = 1024 * 1024;
export function localAccess(request: Request, enabled: boolean) {
  const url = new URL(request.url);
  if (!enabled || url.hostname !== '127.0.0.1') return false;
  const connecting = request.headers.get('CF-Connecting-IP');
  if (
    (connecting && !['127.0.0.1', '::1'].includes(connecting)) ||
    request.headers.has('X-Forwarded-For')
  )
    return false;
  const host = request.headers.get('Host');
  if (host && host !== url.host) return false;
  const origin = request.headers.get('Origin');
  return !origin || origin === url.origin;
}
export function budget(clock: () => number = Date.now) {
  let start = clock(),
    count = 0,
    active = 0;
  return {
    enter() {
      const now = clock();
      if (now - start >= 60000) {
        start = now;
        count = 0;
      }
      if (count >= 60 || active >= 4) return false;
      count++;
      active++;
      return true;
    },
    leave() {
      active = Math.max(0, active - 1);
    },
  };
}
