// Service worker du carnet : il ne sert qu'aux notifications (pas de cache hors ligne).
//
// Un push reçu affiche toujours une notification : iOS retire l'abonnement des apps qui reçoivent des
// push sans rien montrer. Charge utile attendue (JSON) : { title, body, url?, tag? }.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Carnet de Cendres", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      lang: "fr",
      data: { url: data.url || "/" },
    }),
  );
});

// Un tap sur la notification ouvre le carnet (ou ramène au premier plan la fenêtre déjà ouverte).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if (open.url !== url) await open.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
