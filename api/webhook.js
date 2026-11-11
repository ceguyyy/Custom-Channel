// POST /api/webhook?token=WEBHOOK_SECRET
// Paste this URL into Cekat -> Custom API inbox -> Webhook Settings.
// Cekat POSTs { event: "message.sent", data: {...} } whenever an agent (AI or human) replies.
import { pushMessage, markSeen } from './_lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Simple health check (handy when testing the URL in a browser)
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'cekat-webhook' });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.query.token !== secret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || body.event !== 'message.sent') {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const d = body.data || {};
  const senderId = d.contact?.platform_id; // = sender_id we sent to Cekat
  if (!senderId) return res.status(200).json({ ok: true, ignored: 'no platform_id' });

  try {
    // Dedupe retries and echoes of our own outbound messages
    const firstTime = await markSeen(d.message_id);
    if (!firstTime) return res.status(200).json({ ok: true, duplicate: true });

    await pushMessage(senderId, {
      id: d.message_id || `wh_${Date.now()}`,
      from: 'agent',
      text: d.message ?? '',
      media_type: d.media_type || 'text',
      media_url: d.media_url || null,
      agent_name: d.sent_by?.name || 'Agent',
      agent_type: d.sent_by?.type || null,
      at: d.sent_at || new Date().toISOString(),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('webhook error', err);
    // 500 lets Cekat retry if it supports retries
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
}
