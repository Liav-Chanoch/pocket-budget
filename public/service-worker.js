const SHARE_CACHE = 'share-target-v1';
const SHELL_CACHE = 'pb-shell-v1';

// Bootstrap entries. Hashed assets (/static/**) are added at runtime on first
// online visit, since their filenames aren't known at install time.
const SHELL_URLS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS))
      .catch(() => {})           // never block install on a failed precache
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== SHARE_CACHE && k !== SHELL_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(handleShare(event.request));
    return;
  }

  if (url.pathname === '/shared-image' && event.request.method === 'GET') {
    event.respondWith(
      caches.open(SHARE_CACHE)
        .then(cache => cache.match('/shared-image'))
        .then(r => r || new Response(null, { status: 404 }))
    );
    return;
  }

  // Only same-origin GETs are cacheable. Everything else (Firestore, Gemini,
  // Maps, currency rates) goes straight to the network untouched.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigations: network-first so a fresh deploy is always picked up, with the
  // cached shell as the offline fallback. Cache-first here would strand users
  // on a stale build.
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstShell(event.request));
    return;
  }

  // Hashed build assets are immutable — cache-first is safe and fastest.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Icons, manifest, other static root files: cache-first with revalidation.
  event.respondWith(cacheFirst(event.request));
});

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const copy = fresh.clone();
      cache.put('/index.html', fresh.clone());
      // Every deploy adds a new hashed bundle. Without this the old ones would
      // accumulate in the cache forever.
      pruneStaleAssets(cache, copy).catch(() => {});
    }
    return fresh;
  } catch {
    return (await cache.match('/index.html'))
        || (await cache.match('/'))
        || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

// Drops cached /static/ entries that the freshly fetched index.html no longer
// references — i.e. bundles from previous deploys.
async function pruneStaleAssets(cache, indexResponse) {
  const html = await indexResponse.text();
  const keys = await cache.keys();
  await Promise.all(keys.map(req => {
    const path = new URL(req.url).pathname;
    if (!path.startsWith('/static/')) return null;
    return html.includes(path) ? null : cache.delete(req);
  }));
}

async function cacheFirst(request) {
  const cache  = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return cached || new Response(null, { status: 504 });
  }
}

async function handleShare(request) {
  const formData = await request.formData();
  const image = formData.get('image');
  if (image) {
    const cache = await caches.open(SHARE_CACHE);
    await cache.put('/shared-image', new Response(image, {
      headers: { 'Content-Type': image.type || 'image/jpeg' },
    }));
  }
  return Response.redirect('/?shared=1', 303);
}
