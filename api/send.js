// POST /api/send  — browser -> (this function) -> Cekat Custom API
// Keeps CEKAT_API_KEY on the server; never exposed to the browser.
import { pushMessage, markSeen, clean, SENDER_ID_RE } from './_lib/store.js';

const CEKAT_URL = 'https://server.cekat.ai/business_workflows/custom-api/messages';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { CEKAT_API_KEY, CEKAT_INBOX_ID } = process.env;
  if (!CEKAT_API_KEY || !CEKAT_INBOX_ID) {
    return res.status(500).json({ ok: false, error: 'Server missing CEKAT_API_KEY / CEKAT_INBOX_ID' });
  }

  const b = (typeof req.body === 'string' ? safeJson(req.body) : req.body) || {};
  const sender_id = clean(b.sender_id, 128);
  const sender_name = clean(b.sender_name, 100) || 'Guest';
  const message = clean(b.message, 4000);
  const local_id = clean(b.local_id, 64);

  if (!SENDER_ID_RE.test(sender_id)) return res.status(400).json({ ok: false, error: 'Invalid sender_id' });
  if (!message) return res.status(400).json({ ok: false, error: 'message is required' });

  const payload = { inbox_id: CEKAT_INBOX_ID, sender_id, sender_name, message };
  const email = clean(b.sender_email, 200);
  const phone = clean(b.sender_phone, 30);
  if (email) payload.sender_email = email;
  if (phone) payload.sender_phone = phone;
  if (b.additional_data) payload.additional_data = JSON.stringify(b.additional_data).slice(0, 4000);

  try {
    const r = await fetch(CEKAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', api_key: CEKAT_API_KEY },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) {
      return res.status(502).json({ ok: false, error: j.message || j.error || `Cekat HTTP ${r.status}` });
    }

    const data = j.data || {};
    // Mark Cekat's id as seen so an echo via webhook isn't shown twice.
    if (data.message_id) await markSeen(data.message_id);

    const msg = {
      id: data.message_id || local_id,
      local_id,
      from: 'user',
      text: message,
      media_type: 'text',
      at: new Date().toISOString(),
    };
    await pushMessage(sender_id, msg);

    return res.status(200).json({ ok: true, data, message: msg });
  } catch (err) {
    console.error('send error', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}
