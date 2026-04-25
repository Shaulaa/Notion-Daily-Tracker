// fcm.js
// Helper untuk Firebase Cloud Messaging — request permission & dapatkan FCM token
// Import file ini di notifications.js atau firebase.js

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAsRDFhH4V0PHOumpwYXs4U6Z-uZS5g1C4",
  authDomain: "trackify-app-420ea.firebaseapp.com",
  projectId: "trackify-app-420ea",
  storageBucket: "trackify-app-420ea.firebasestorage.app",
  messagingSenderId: "815026874634",
  appId: "1:815026874634:web:2185ab91685070677632f3"
};

const VAPID_KEY = "BBve0Smny5R9bNqgLt4N9na9uGFLsFfxpR5DRyNUQDvDUxFShoWWbHougyHjr0tFz3E38fX8e0bnTUpya-P0mXW";

// Init app (hindari double init kalau firebase.js sudah init duluan)
const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
const messaging = getMessaging(app);

/**
 * Minta permission notifikasi dan dapatkan FCM token.
 * Simpan token ke Firestore agar bisa di-trigger dari server.
 * @returns {Promise<string|null>} FCM token atau null kalau ditolak
 */
export async function requestFCMPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Permission ditolak user');
      return null;
    }

    // Daftarkan service worker dulu
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('[FCM] Service Worker terdaftar:', registration.scope);

    // Ambil FCM token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      console.log('[FCM] Token didapat:', token);
      // Simpan token ke localStorage untuk referensi
      localStorage.setItem('fcm_token', token);
      return token;
    } else {
      console.warn('[FCM] Tidak dapat token — cek VAPID key & service worker');
      return null;
    }
  } catch (err) {
    console.error('[FCM] Error:', err);
    return null;
  }
}

/**
 * Handle notif saat app sedang terbuka (foreground)
 * @param {Function} callback - dipanggil dengan payload notif
 */
export function onForegroundMessage(callback) {
  onMessage(messaging, (payload) => {
    console.log('[FCM] Foreground message:', payload);
    callback(payload);
  });
}

/**
 * Tampilkan notif in-app saat foreground (karena browser tidak otomatis tampil)
 * Panggil ini di notifications.js setelah initNotifications()
 */
export function initForegroundNotifications() {
  onForegroundMessage((payload) => {
    const { title, body } = payload.notification || {};

    // Pakai Browser Notification API untuk foreground
    if (Notification.permission === 'granted') {
      new Notification(title || 'Trackify', {
        body: body || 'Ada pengingat untukmu!',
        icon: '/favicon.ico',
        tag: 'trackify-fg-notif'
      });
    }
  });
}
