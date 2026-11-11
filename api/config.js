// GET /api/config — public branding & feature flags for the chat UI (all optional env vars)
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export default function handler(req, res) {
  const e = process.env;
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  const quickReplies = (e.QUICK_REPLIES || 'Info produk|Cek harga|Jadwal & lokasi|Bicara dengan CS')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);

  res.status(200).json({
    ok: true,
    brand: {
      name: e.BRAND_NAME || 'Customer Support',
      tagline: e.BRAND_TAGLINE || 'Biasanya membalas dalam hitungan menit',
      color: HEX.test(e.BRAND_COLOR || '') ? e.BRAND_COLOR : '#7c5cff',
      logo: /^https:\/\//.test(e.BRAND_LOGO_URL || '') ? e.BRAND_LOGO_URL : null,
    },
    welcome: e.WELCOME_MESSAGE || 'Halo! 👋 Selamat datang. Ada yang bisa kami bantu hari ini?',
    quickReplies,
    form: {
      requirePhone: e.REQUIRE_PHONE === 'true',
      requireEmail: e.REQUIRE_EMAIL === 'true',
    },
    features: {
      uploads: Boolean(e.BLOB_READ_WRITE_TOKEN),
    },
  });
}
