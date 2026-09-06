/* =========================================================
   TECHNICAL TEAM PWA SERVICE WORKER
   ========================================================= */

const CACHE_NAME = "technical-team-pwa-v1";

const APP_SHELL = [
    "/",
    "/dashboard",
    "/static/manifest.json"
];


/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener(
    "install",
    event => {

        event.waitUntil(

            caches
                .open(CACHE_NAME)
                .then(cache => {

                    return cache.addAll(
                        APP_SHELL
                    );

                })

        );

        self.skipWaiting();
    }
);


/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener(
    "activate",
    event => {

        event.waitUntil(

            caches
                .keys()
                .then(keys => {

                    return Promise.all(

                        keys
                            .filter(
                                key =>
                                    key !== CACHE_NAME
                            )
                            .map(
                                key =>
                                    caches.delete(key)
                            )

                    );

                })

        );

        self.clients.claim();
    }
);


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener(
    "fetch",
    event => {

        if (
            event.request.method !== "GET"
        ) {
            return;
        }

        const url =
            new URL(
                event.request.url
            );

        if (
            url.origin !==
            self.location.origin
        ) {
            return;
        }

        event.respondWith(

            fetch(event.request)
                .catch(
                    () =>
                        caches.match(
                            event.request
                        )
                )

        );

    }
);


/* =========================================================
   PUSH
   ========================================================= */

self.addEventListener(
    "push",
    event => {

        let data = {};

        try {

            data =
                event.data
                    ? event.data.json()
                    : {};

        } catch (error) {

            data = {
                title:
                    "Technical Team",
                body:
                    event.data
                        ? event.data.text()
                        : "New notification"
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
                "/static/icons/icon-192.png",

            badge:
                "/static/icons/icon-192.png",

            tag:
                data.task_id
                    ? `task-${data.task_id}`
                    : "technical-team",

            renotify: true,

            requireInteraction: true,

            data: {

                task_id:
                    data.task_id ||
                    null,

                url:
                    data.url ||
                    "/dashboard"

            }

        };


        event.waitUntil(

            self.registration.showNotification(
                title,
                options
            )

        );

    }
);


/* =========================================================
   NOTIFICATION CLICK
   ========================================================= */

self.addEventListener(
    "notificationclick",
    event => {

        event.notification.close();


        const data =
            event.notification.data ||
            {};


        let targetUrl =
            data.url ||
            "/dashboard";


        event.waitUntil(

            clients
                .matchAll({
                    type: "window",
                    includeUncontrolled: true
                })
                .then(
                    clientList => {

                        for (
                            const client
                            of clientList
                        ) {

                            if (
                                "focus"
                                in client
                            ) {

                                client.navigate(
                                    targetUrl
                                );

                                return client.focus();

                            }

                        }


                        if (
                            clients.openWindow
                        ) {

                            return clients.openWindow(
                                targetUrl
                            );

                        }

                    }
                )

        );

    }
);
