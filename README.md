# Custom-Channel — Cekat Web Chat + Widget (Vercel)

A web chat with a glassmorphism UI and an **embeddable widget** for any website, connected to a
**Cekat Custom API inbox**. Agent and AI replies come back through the **Webhook Settings** endpoint.

```
Website ─ widget.js ─▶ iframe chat UI
   │ POST /api/send ───────────▶ Cekat Custom API ──▶ AI agent / CS
   │ POST /api/upload ─▶ Vercel Blob (media_url)              │
   │                                                          │ message.sent
   └ GET /api/messages ◀── Upstash Redis ◀── POST /api/webhook?token=… ┘
```

## Features
- **Glassmorphism UI**: dark and light themes, animated gradient background, smooth animations
- **Embed widget** with one line of code: floating button, unread badge, message preview, full screen on mobile
- **Pre-chat form** (name, WhatsApp, email), with optional required fields
- **Quick reply chips** and a welcome message, configurable through env vars
- **File upload** (images/PDF/Word/Excel, max 3 MB, images compressed automatically), by button, **drag & drop**, or **paste**
- **Media rendering** from agents (image + lightbox, video, audio, document card)
- **WhatsApp-style formatting**: `*bold*` `_italic_` `~strike~` `` `code` ``
- **Notifications**: sound, browser notification, `(n)` counter in the tab title
- **Adaptive polling**: 1.5 s right after a conversation, 4 s normally, 12 s while the tab is in the background, plus a reconnect indicator
- **Rate limiting** per visitor and per IP, dedupe of webhook retries, token-protected webhook
- **Branding without code changes**: name, tagline, color, logo, welcome message, chips

## Structure
| Path | Purpose |
|---|---|
| `public/index.html, style.css, app.js` | Chat UI (`/?embed=1` for widget mode) |
| `public/widget.js` | Embed script for other websites |
| `public/demo.html` | Widget demo page (`/demo.html`) |
| `api/send.js` | Visitor → Cekat (the API key stays on the server) |
| `api/webhook.js` | **The URL for Cekat → Webhook Settings** |
| `api/messages.js` | The browser polls this for new messages |
| `api/upload.js` | Upload to Vercel Blob → public URL for `media_url` |
| `api/config.js` | Branding & feature flags from env |

## Setup on Vercel
1. Import this repo into Vercel (Framework: **Other**).
2. **Storage → Upstash for Redis** (Free) → Connect to the project.
3. *(Optional, for upload)* **Storage → Blob** → Create with **Public** access → Connect. `BLOB_READ_WRITE_TOKEN` is filled in automatically.
4. Env vars: `CEKAT_API_KEY`, `CEKAT_INBOX_ID`, `WEBHOOK_SECRET`, plus branding if you want it (see `.env.example`).
5. **Redeploy.**
6. Cekat → Custom API inbox → **Webhook Settings**:
   `https://<domain>/api/webhook?token=<WEBHOOK_SECRET>`
   Use the production domain (`<project>.vercel.app`), not a deployment URL that sits behind Vercel Authentication.

## Embed on a website
```html
<script src="https://<domain>/widget.js"
        data-color="#7c5cff"
        data-position="right"
        data-label="Chat dengan kami"
        data-auto-open="0"
        async></script>
```
JS API: `CekatChat.open()`, `CekatChat.close()`, `CekatChat.toggle()`.

## Branding env vars (optional)
| Env | Default |
|---|---|
| `BRAND_NAME` | Customer Support |
| `BRAND_TAGLINE` | Biasanya membalas dalam hitungan menit |
| `BRAND_COLOR` | `#7c5cff` |
| `BRAND_LOGO_URL` | — (initials shown if empty) |
| `WELCOME_MESSAGE` | Halo! 👋 Selamat datang… |
| `QUICK_REPLIES` | `Info produk\|Cek harga\|Jadwal & lokasi\|Bicara dengan CS` |
| `REQUIRE_PHONE` / `REQUIRE_EMAIL` | `false` |
| `RATE_LIMIT_PER_MIN` | `20` |

## Notes
- Cekat doesn't document a webhook signature, so security relies on the `?token=`. Keep it secret.
- `sender_id` = `web_<uuid>` per browser (localStorage). ↻ starts a new conversation.
- Chat history is stored in Redis for 7 days.
