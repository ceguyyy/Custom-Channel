// POST /api/upload — stores a file in Vercel Blob and returns a public URL
// that can be passed to Cekat as media_url.
// Body: { sender_id, filename, content_type, data (base64) }   (max 3 MB after decoding)
import { put } from '@vercel/blob';
import { rateLimit, clientIp, clean, parseBody, SENDER_ID_RE } from './_lib/store.js';

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'text/plain': 'document',
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(501).json({ ok: false, error: 'Upload not enabled (connect Vercel Blob)' });
  }

  const b = parseBody(req);
  const sender_id = clean(b.sender_id, 128);
  const contentType = clean(b.content_type, 120).toLowerCase();
  const mediaType = ALLOWED[contentType];
  const data = typeof b.data === 'string' ? b.data : '';

  if (!SENDER_ID_RE.test(sender_id)) return res.status(400).json({ ok: false, error: 'Invalid sender_id' });
  if (!mediaType) return res.status(415).json({ ok: false, error: 'Tipe file tidak didukung' });
  if (!data) return res.status(400).json({ ok: false, error: 'File kosong' });

  const buf = Buffer.from(data, 'base64');
  if (!buf.length) return res.status(400).json({ ok: false, error: 'File kosong' });
  if (buf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'Maksimal 3 MB' });

  try {
    const ok = (await rateLimit(`upload:ip:${clientIp(req)}`, 20)) && (await rateLimit(`upload:sid:${sender_id}`, 10));
    if (!ok) return res.status(429).json({ ok: false, error: 'Terlalu banyak upload. Coba lagi sebentar lagi.' });

    const safeName = (clean(b.filename, 120) || 'file')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'file';

    const blob = await put(`chat/${sender_id}/${safeName}`, buf, {
      access: 'public',
      contentType,
      addRandomSuffix: true,
    });

    return res.status(200).json({ ok: true, url: blob.url, media_type: mediaType, file_name: safeName, size: buf.length });
  } catch (err) {
    console.error('upload error', err);
    return res.status(500).json({ ok: false, error: err.message || 'Upload gagal' });
  }
}
