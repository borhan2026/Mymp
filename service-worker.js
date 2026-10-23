/* PWA Service Worker — অ্যাপ + নোটিফিকেশন একসাথে
   আপডেট দিলে নিচের VERSION নম্বর বাড়িয়ে দিন */
const VERSION = 'v1';
const CACHE = 'madrasa-' + VERSION;
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('madrasa-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase / Google API / Cloudinary — সবসময় লাইভ, ক্যাশ নয়
  if (/googleapis\.com$|firebaseio\.com$|firebaseapp\.com$|cloudinary\.com$|gstatic\.com$/.test(url.hostname)
      && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;

  // পেজ: আগে নেটওয়ার্ক, না পেলে ক্যাশ (অফলাইনেও খুলবে)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // ফন্ট, আইকন, CDN, নিজের ফাইল: ক্যাশ আগে, পেছনে আপডেট
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// নোটিফিকেশনে ট্যাপ করলে অ্যাপ খুলবে
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
