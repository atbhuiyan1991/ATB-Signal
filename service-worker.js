const CACHE_NAME = "smc-signal-engine-v1";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./binance.js",
  "./bybit.js",
  "./marketAdapter.js",
  "./analysis.js",
  "./scanner.js",
  "./app.js",
  "./manifest.json"
];

// ১. অ্যাপ ইনস্টলের সময় শুধু স্ট্যাটিক ফাইলগুলো ক্যাশ করা
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ২. পুরনো ভার্সনের ক্যাশ মুছে ফেলা
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ৩. লাইভ API কল সরাসরি নেটওয়ার্ক থেকে নেওয়া, বাকি ফাইল ক্যাশ থেকে চালানো
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Binance, Bybit বা অন্য কোনো বাইরের API কল হলে সরাসরি নেটওয়ার্ক ব্যবহার করবে
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes("binance") ||
    url.hostname.includes("bybit")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // অ্যাপের নিজস্ব ফাইলগুলোর জন্য Cache First কৌশল
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
