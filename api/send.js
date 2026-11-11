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
  // Cekat stores additional_data as JSONB and expects an OBJECT (a JSON string causes
  // "cannot delete from scalar"). Only send a small flat object of strings.
  const extra = toFlatObject(b.additional_data);
  if (extra) payload.additional_data = extra;

  try {
    let { r, j } = await postCekat(payload, CEKAT_API_KEY);
    // Fallback: if Cekat still rejects additional_data, retry once without it.
    if ((!r.ok || j.success === false) && payload.additional_data) {
      console.warn('Cekat rejected payload, retrying without additional_data:', j.message || j.error || r.status);
      delete payload.additional_data;
      ({ r, j } = await postCekat(payload, CEKAT_API_KEY));
    }
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

async function postCekat(payload, apiKey) {
  const r = await fetch(CEKAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', api_key: apiKey },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  return { r, j };
}

function toFlatObject(v) {
  if (typeof v === 'string') v = safeJson(v);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const [k, val] of Object.entries(v).slice(0, 20)) {
    if (val === undefined || val === null) continue;
    out[String(k).slice(0, 50)] = String(val).slice(0, 500);
  }
  return Object.keys(out).length ? out : null;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}
