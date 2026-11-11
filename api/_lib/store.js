// Minimal Upstash Redis REST client (no dependencies).
// Works with Vercel Marketplace "Upstash for Redis" (KV_REST_API_*) or plain Upstash (UPSTASH_REDIS_REST_*).

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL_SECONDS = 60 * 60 * 24 * 7; // keep chat history 7 days

async function redis(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Redis is not configured (set KV_REST_API_URL and KV_REST_API_TOKEN)');
  }
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Redis HTTP ${r.status}`);
  return j.result;
}

const convKey = (senderId) => `cekat:conv:${senderId}`;
const seenKey = (messageId) => `cekat:seen:${messageId}`;

export async function pushMessage(senderId, msg) {
  const k = convKey(senderId);
  await redis('RPUSH', k, JSON.stringify(msg));
  await redis('EXPIRE', k, TTL_SECONDS);
}

export async function getMessages(senderId, from = 0) {
  const list = await redis('LRANGE', convKey(senderId), from, -1);
  return (list || [])
    .map((s) => {
      try { return JSON.parse(s); } catch { return null; }
    })
    .filter(Boolean);
}

// Returns true the first time a message_id is seen (dedupes webhook retries/echoes).
export async function markSeen(messageId) {
  if (!messageId) return true;
  const res = await redis('SET', seenKey(messageId), '1', 'NX', 'EX', TTL_SECONDS);
  return res === 'OK';
}

export function clean(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

export const SENDER_ID_RE = /^[A-Za-z0-9_\-:.]{6,128}$/;
