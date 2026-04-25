// api/send-notification.js
// Vercel Serverless Function — kirim FCM push notification
// Dipanggil via: POST https://trackify-daily-tracker.vercel.app/api/send-notification

import { getAdminMessaging } from './_firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, title, body, data } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'FCM token diperlukan' });
  }

  try {
    const result = await getAdminMessaging().send({
      token,
      notification: {
        title: title || 'Trackify Reminder',
        body: body || 'Jangan lupa update tracker harian kamu!'
      },
      webpush: {
        notification: {
          title: title || 'Trackify Reminder',
          body: body || 'Jangan lupa update tracker harian kamu!',
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'trackify-reminder',
          renotify: true,
          actions: [
            { action: 'open', title: 'Buka Trackify' },
            { action: 'dismiss', title: 'Tutup' }
          ]
        },
        fcmOptions: {
          link: 'https://trackify-daily-tracker.vercel.app/'
        }
      },
      data: data || {}
    });

    return res.status(200).json({ success: true, messageId: result });
  } catch (err) {
    console.error('[FCM] Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
