// fcm.js
// Helper untuk Firebase Cloud Messaging — request permission, dapatkan FCM token,
// dan simpan token ke Firestore agar server bisa push per akun.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js';
import { getFirestore, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAsRDFhH4V0PHOumpwYXs4U6Z-uZS5g1C4",
  authDomain: "trackify-app-420ea.firebaseapp.com",
  projectId: "trackify-app-420ea",
  storageBucket: "trackify-app-420ea.firebasestorage.app",
  messagingSenderId: "815026874634",
  appId: "1:815026874634:web:2185ab91685070677632f3"
};

const VAPID_KEY = "BBVTzXZLhWt9GfqxJfDDImp0kUqpczt5orzM3TI2o71_lHs4I9y3SaoZHP7wRgXdxwUktR5XVpzPjrKB43ykGec";

// Init app (hindari double init kalau firebase.js sudah init duluan)
const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
const messaging = getMessaging(app);
const db  = getFirestore(app);
const auth = getAuth(app);

/**
 * Simpan FCM token ke Firestore di bawah akun user yang sedang login.
 * Path: fcmTokens/{uid}/tokens/{token} — support multi-device.
 * @param {string} token
 */
async function saveFCMTokenToFirestore(token) {
  const user = auth.currentUser;
  if (!user) {
    console.warn('[FCM] Tidak ada user login, token tidak disimpan ke Firestore');
    return;
  }
  try {
    // Simpan per device (pakai token sebagai doc ID agar tidak duplikat)
    const tokenRef = doc(db, 'fcmTokens', user.uid, 'tokens', token);
    await setDoc(tokenRef, {
      token,
      uid: user.uid,
      platform: 'web',
      userAgent: navigator.userAgent.slice(0, 200),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log('[FCM] Token tersimpan ke Firestore untuk uid:', user.uid);
  } catch (err) {
    console.error('[FCM] Gagal simpan token ke Firestore:', err);
  }
}

/**
 * Minta permission notifikasi dan dapatkan FCM token.
 * Token otomatis disimpan ke Firestore (linked ke akun).
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
      console.log('[FCM] Token didapat:', token.slice(0, 20) + '...');
      // Simpan ke localStorage untuk referensi cepat (offline fallback)
      localStorage.setItem('fcm_token', token);
      // Simpan ke Firestore agar linked ke akun
      await saveFCMTokenToFirestore(token);
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

    if (Notification.permission === 'granted') {
      new Notification(title || 'Trackify', {
        body: body || 'Ada pengingat untukmu!',
        icon: '/favicon.ico',
        tag: 'trackify-fg-notif'
      });
    }
  });
}
