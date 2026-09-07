function allowed(url: URL) {
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.city.yokohama.lg.jp' ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error('Unapproved source origin');
}
export async function fetchOriginal(initial: string) {
  let url = new URL(initial);
  for (let redirects = 0; redirects <= 3; redirects++) {
    allowed(url);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without location');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`Source HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2_000_000) throw new Error('Source exceeds 2 MB limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many redirects');
}
