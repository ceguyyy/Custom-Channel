// POST /api/send  — browser -> (this function) -> Cekat Custom API
// Keeps CEKAT_API_KEY on the server; never exposed to the browser.
import {
  pushMessage, markSeen, rateLimit, clientIp, clean, parseBody, SENDER_ID_RE, MEDIA_TYPES,
} from './_lib/store.js';

const CEKAT_URL = 'https://server.cekat.ai/business_workflows/custom-api/messages';
const LIMIT_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN, 10) || 20;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { CEKAT_API_KEY, CEKAT_INBOX_ID } = process.env;
  if (!CEKAT_API_KEY || !CEKAT_INBOX_ID) {
    return res.status(500).json({ ok: false, error: 'Server missing CEKAT_API_KEY / CEKAT_INBOX_ID' });
  }

  const b = parseBody(req);
  const sender_id = clean(b.sender_id, 128);
  const sender_name = clean(b.sender_name, 100) || 'Guest';
  const message = clean(b.message, 4000);
  const local_id = clean(b.local_id, 64);
  const media_url = clean(b.media_url, 1000);
  const media_type = MEDIA_TYPES.includes(b.media_type) ? b.media_type : media_url ? 'file' : 'text';

  if (!SENDER_ID_RE.test(sender_id)) return res.status(400).json({ ok: false, error: 'Invalid sender_id' });
  if (!message && !media_url) return res.status(400).json({ ok: false, error: 'message or media_url is required' });
  if (media_url && !/^https:\/\//i.test(media_url)) return res.status(400).json({ ok: false, error: 'media_url must be https' });

  try {
    const okIp = await rateLimit(`send:ip:${clientIp(req)}`, LIMIT_PER_MIN * 3);
    const okSender = await rateLimit(`send:sid:${sender_id}`, LIMIT_PER_MIN);
    if (!okIp || !okSender) {
      return res.status(429).json({ ok: false, error: 'Terlalu banyak pesan. Coba lagi sebentar lagi.' });
    }

    const payload = { inbox_id: CEKAT_INBOX_ID, sender_id, sender_name };
    if (message) payload.message = message;
    if (media_url) {
      payload.media_type = media_type;
      payload.media_url = media_url;
    }
    const email = clean(b.sender_email, 200);
    const phone = clean(b.sender_phone, 30);
    if (email) payload.sender_email = email;
    if (phone) payload.sender_phone = phone;
    const replyTo = clean(b.reply_to_message_id, 100);
    if (replyTo) payload.reply_to_message_id = replyTo;

    // Cekat stores additional_data as JSONB and expects an OBJECT (a JSON string causes
    // "cannot delete from scalar"). Only send a small flat object of strings.
    const extra = toFlatObject(b.additional_data);
    if (extra) payload.additional_data = extra;

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
      media_type: media_url ? media_type : 'text',
      media_url: media_url || null,
      file_name: clean(b.file_name, 200) || null,
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
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const [k, val] of Object.entries(v).slice(0, 20)) {
    if (val === undefined || val === null) continue;
    out[String(k).slice(0, 50)] = String(val).slice(0, 500);
  }
  return Object.keys(out).length ? out : null;
}
