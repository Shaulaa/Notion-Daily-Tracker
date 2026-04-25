// firebase-messaging-sw.js
// Service Worker untuk Firebase Cloud Messaging (FCM)
// File ini HARUS ada di root folder (sama level dengan index.html)

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAsRDFhH4V0PHOumpwYXs4U6Z-uZS5g1C4",
  authDomain: "trackify-app-420ea.firebaseapp.com",
  projectId: "trackify-app-420ea",
  storageBucket: "trackify-app-420ea.firebasestorage.app",
  messagingSenderId: "815026874634",
  appId: "1:815026874634:web:2185ab91685070677632f3"
});

const messaging = firebase.messaging();

// Handle notif saat app di background / browser tertutup
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const { title, body, icon } = payload.notification || {};

  self.registration.showNotification(title || 'Trackify', {
    body: body || 'Ada pengingat untukmu!',
    icon: icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'trackify-notif',         // replace notif lama, ga numpuk
    renotify: true,
    data: payload.data || {},
    actions: [
      { action: 'open', title: '📋 Buka Trackify' },
      { action: 'dismiss', title: 'Tutup' }
    ]
  });
});

// Handle klik notif
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  // Buka / fokus ke tab Trackify
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('trackify') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('https://trackify-daily-tracker.vercel.app/');
      }
    })
  );
});
