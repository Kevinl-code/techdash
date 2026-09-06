const CACHE_NAME = "technical-team-dashboard-v1";

const APP_SHELL = [
    "/",
    "/static/app.css",
    "/static/dashboard.js"
];

self.addEventListener("install", event => {
    console.log("[SW] Installing...");

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .catch(error => {
                console.error("[SW] Cache failed:", error);
            })
    );

    self.skipWaiting();
});


self.addEventListener("activate", event => {
    console.log("[SW] Activated");

    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );

    self.clients.claim();
});


/*
=========================================================
PUSH NOTIFICATION
=========================================================
*/

self.addEventListener("push", event => {

    console.log("[SW] Push received");

    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (error) {
        console.error("[SW] Push JSON error:", error);

        data = {
            title: "Technical Team",
            body: "You have a new notification."
        };
    }


    const title =
        data.title ||
        "Technical Team";


    const options = {

        body:
            data.body ||
            "You have a new notification.",

        icon:
            data.icon ||
            "/static/team-logo.png",

        badge:
            data.badge ||
            "/static/team-logo.png",

        tag:
            data.tag ||
            "technical-team-notification",

        renotify: true,

        requireInteraction:
            false,

        data: {
            url:
                data.url ||
                "/dashboard",

            task_id:
                data.task_id ||
                null,

            notification_type:
                data.notification_type ||
                "general"
        }
    };


    event.waitUntil(
        self.registration.showNotification(
            title,
            options
        )
    );
});


/*
=========================================================
NOTIFICATION CLICK
=========================================================
*/

self.addEventListener(
    "notificationclick",
    event => {

        console.log(
            "[SW] Notification clicked"
        );

        event.notification.close();


        const targetUrl =
            event.notification.data?.url ||
            "/dashboard";


        event.waitUntil(

            clients.matchAll({
                type: "window",
                includeUncontrolled: true
            })
            .then(clientList => {

                for (const client of clientList) {

                    if ("focus" in client) {

                        client.navigate(
                            targetUrl
                        );

                        return client.focus();
                    }
                }


                if (clients.openWindow) {

                    return clients.openWindow(
                        targetUrl
                    );
                }
            })
        );
    }
);


/*
=========================================================
FETCH
=========================================================
*/

self.addEventListener("fetch", (event) => {
  // Optional: Skip non-GET requests or specific API calls
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Return cached version if found
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Fall back to network fetch
      return fetch(event.request)
        .then((networkResponse) => {
          return networkResponse;
        })
        .catch((error) => {
          console.error("[SW] Fetch failed; returning offline fallback:", error);

          // 3. Always return a valid Response on network failure
          return (
            caches.match("/offline.html") ||
            new Response("Network error occurred. Please check your connection.", {
              status: 503,
              headers: { "Content-Type": "text/plain" }
            })
          );
        });
    })
  );
});
