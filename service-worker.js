/* PWA Service Worker — অ্যাপ + নোটিফিকেশন একসাথে
   আপডেট দিলে নিচের VERSION নম্বর বাড়িয়ে দিন */
const VERSION = 'v2';
const CACHE = 'madrasa-' + VERSION;
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const MAX_REMOTE_IMAGES = 150;   // Cloudinary/Unsplash ছবি ক্যাশে সর্বোচ্চ এত টা রাখা হবে

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

/* ক্যাশে ছবি বেশি জমলে পুরোনোগুলো মুছে ফেলা */
async function trimImages() {
  try {
    const c = await caches.open(CACHE);
    const keys = await c.keys();
    const imgs = keys.filter(r => /res\.cloudinary\.com|images\.unsplash\.com/.test(r.url));
    for (let i = 0; i < imgs.length - MAX_REMOTE_IMAGES; i++) await c.delete(imgs[i]);
  } catch (err) {}
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const host = url.hostname;

  // Firebase লাইব্রেরি ফাইল (ভার্সন দেওয়া, বদলায় না) এবং Cloudinary ছবি ক্যাশ হবে
  const isFirebaseLib = host === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0;
  const isCloudImg = host === 'res.cloudinary.com' && url.pathname.indexOf('/image/upload/') !== -1;

  // Firebase ডেটা / Google API / Cloudinary PDF-অডিও — সবসময় লাইভ, ক্যাশ নয়
  if (!isFirebaseLib && !isCloudImg
      && /googleapis\.com$|firebaseio\.com$|firebaseapp\.com$|cloudinary\.com$|gstatic\.com$/.test(host)
      && !/fonts\.(googleapis|gstatic)\.com$/.test(host)) return;

  // পেজ: ক্যাশ থেকে সঙ্গে সঙ্গে খোলা, পেছনে নতুন ভার্সন এনে রাখা
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(hit => {
        const net = fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('./index.html', copy));
            if (hit) {
              const a = hit.headers.get('etag') || hit.headers.get('last-modified');
              const b = res.headers.get('etag') || res.headers.get('last-modified');
              if (a && b && a !== b) {
                self.clients.matchAll({ type: 'window' }).then(list => list.forEach(c => c.postMessage({ type: 'NEW_VERSION' })));
              }
            }
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Firebase লাইব্রেরি ও ছবি: ক্যাশ আগে, না থাকলে নেটওয়ার্ক (বদলায় না, তাই আপডেট চেক নেই)
  if (isFirebaseLib || isCloudImg) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).then(() => { if (isCloudImg) trimImages(); });
        }
        return res;
      }))
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
