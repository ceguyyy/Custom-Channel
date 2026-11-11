// GET /api/messages?sender_id=...&from=0  — browser polls for new messages
import { getMessages, SENDER_ID_RE } from './_lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const senderId = String(req.query.sender_id || '');
  const from = Math.max(0, parseInt(req.query.from, 10) || 0);
  if (!SENDER_ID_RE.test(senderId)) return res.status(400).json({ ok: false, error: 'Invalid sender_id' });

  try {
    const messages = await getMessages(senderId, from);
    return res.status(200).json({ ok: true, messages, next: from + messages.length });
  } catch (err) {
    console.error('messages error', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
}
