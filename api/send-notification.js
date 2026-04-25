// api/send-notification.js
// Vercel Serverless Function — kirim FCM push notification
// Dipanggil via: POST https://trackify-daily-tracker.vercel.app/api/send-notification

export default async function handler(req, res) {
  // Hanya terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, title, body, data } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'FCM token diperlukan' });
  }

  try {
    // Ambil OAuth2 access token dari Google
    const accessToken = await getAccessToken();

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const message = {
      message: {
        token,
        notification: {
          title: title || '🌟 Trackify Reminder',
          body: body || 'Jangan lupa update tracker harian kamu!'
        },
        webpush: {
          fcm_options: {
            link: 'https://trackify-daily-tracker.vercel.app/'
          },
          notification: {
            icon: 'https://trackify-daily-tracker.vercel.app/favicon.ico',
            badge: 'https://trackify-daily-tracker.vercel.app/favicon.ico',
            tag: 'trackify-reminder',
            renotify: true,
            actions: [
              { action: 'open', title: '📋 Buka Trackify' },
              { action: 'dismiss', title: 'Tutup' }
            ]
          }
        },
        data: data || {}
      }
    };

    const response = await fetch(fcmUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[FCM] Send error:', result);
      return res.status(500).json({ error: 'Gagal kirim notif', detail: result });
    }

    return res.status(200).json({ success: true, messageId: result.name });

  } catch (err) {
    console.error('[FCM] Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ----------------------------------------------------------------
// Helper: dapatkan Google OAuth2 access token dari service account
// ----------------------------------------------------------------
async function getAccessToken() {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!privateKey || !clientEmail) {
    throw new Error('FIREBASE_PRIVATE_KEY atau FIREBASE_CLIENT_EMAIL belum diset di env');
  }

  // Buat JWT untuk Google OAuth2
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const jwt = await createJWT(payload, privateKey);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    throw new Error('Gagal dapat access token: ' + JSON.stringify(tokenData));
  }

  return tokenData.access_token;
}

// Buat JWT menggunakan Web Crypto API (bawaan Node.js 18+)
async function createJWT(payload, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };

  const encode = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Import private key
  const keyData = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${sigB64}`;
}
