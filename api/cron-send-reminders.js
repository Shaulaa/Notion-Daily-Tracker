import { runNotificationCron } from './_notifCron.js';

function isAuthorized(req) {
  if (req.headers['x-vercel-cron']) return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return bearer === secret;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized cron request' });
  }

  try {
    const summary = await runNotificationCron();
    return res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    console.error('[NotifCron] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
