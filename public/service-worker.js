const SHARE_CACHE = 'share-target-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));

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
});

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
