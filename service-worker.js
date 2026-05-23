// MyPantry Service Worker v3
const CACHE_NAME = "mypantry-v3";
const ASSETS_TO_CACHE = [
  "/mypantry/",
  "/mypantry/index.html",
  "/mypantry/MyPantry.js",
  "/mypantry/manifest.json",
  "/mypantry/icons/icon-192.png",
  "/mypantry/icons/icon-512.png"
];

// Install: cache all core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll can fail if any file is missing — use individual adds with catch
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url).catch(e => console.warn("Cache miss:", url, e)))
      );
    })
  );
  self.skipWaiting();
});

// Activate: clean up ALL old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network first for HTML/JS (so updates show immediately), cache first for assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isAppShell = url.pathname.endsWith(".html") || url.pathname.endsWith(".js");

  if (isAppShell) {
    // Network first — always get fresh app code
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache first for icons, fonts, etc.
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});

// ── Local notification scheduling ────────────────────────────
// Called from the app via postMessage to schedule expiry alerts
self.addEventListener("message", (event) => {
  if (event.data?.type === "SCHEDULE_ALERTS") {
    const { expiring, lowStock } = event.data;

    // Show notification for expiring items
    if (expiring && expiring.length > 0) {
      const names = expiring.slice(0, 3).map(i => i.name).join(", ");
      const more = expiring.length > 3 ? ` +${expiring.length - 3} more` : "";
      self.registration.showNotification("⏰ MyPantry — Expiring Soon", {
        body: `${names}${more} expiring within 3 days`,
        icon: "/mypantry/icons/icon-192.png",
        badge: "/mypantry/icons/icon-192.png",
        vibrate: [200, 100, 200],
        tag: "expiry-alert",
        data: { url: "/mypantry/" }
      });
    }

    // Show notification for low/empty stock
    if (lowStock && lowStock.length > 0) {
      const names = lowStock.slice(0, 3).map(i => i.name).join(", ");
      const more = lowStock.length > 3 ? ` +${lowStock.length - 3} more` : "";
      self.registration.showNotification("🪫 MyPantry — Low Stock", {
        body: `${names}${more} running low or empty`,
        icon: "/mypantry/icons/icon-192.png",
        badge: "/mypantry/icons/icon-192.png",
        vibrate: [100, 50, 100],
        tag: "lowstock-alert",
        data: { url: "/mypantry/" }
      });
    }
  }
});

// Push Notifications (from server — future use)
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "MyPantry Alert", {
      body: data.body || "You have items that need attention!",
      icon: "/mypantry/icons/icon-192.png",
      badge: "/mypantry/icons/icon-192.png",
      vibrate: [200, 100, 200],
      data: { url: data.url || "/mypantry/" }
    })
  );
});

// Notification click — open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes("/mypantry/") && "focus" in client) return client.focus();
      }
      return clients.openWindow(event.notification.data?.url || "/mypantry/");
    })
  );
});
