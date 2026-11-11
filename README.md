# Custom-Channel — Cekat Web Chat + Webhook (Vercel)

Web chat in HTML/CSS/JS connected to a **Cekat Custom API inbox**, plus the webhook endpoint for
**Webhook Settings** (agent replies).

```
Browser ──POST /api/send──▶ Vercel ──POST custom-api/messages──▶ Cekat
                                                                   │ agent / AI replies
Browser ◀─GET /api/messages── Redis ◀──POST /api/webhook?token=…───┘ (message.sent)
```

| Path | Purpose |
|---|---|
| `public/` | Chat UI (index.html, style.css, app.js) |
| `api/send.js` | Proxies visitor messages to Cekat (the API key stays on the server) |
| `api/webhook.js` | **The URL for Cekat → Webhook Settings.** Receives `message.sent` |
| `api/messages.js` | The browser polls this for new messages (every 2.5 s) |
| `api/_lib/store.js` | Stores chat history in Upstash Redis (7-day TTL) |

Vercel functions are stateless, so agent replies coming from the webhook are stored in Redis first and then fetched by the browser.

## Deploy

1. **Push to GitHub** → Vercel → *Add New Project* → import the repo (Framework: **Other**, no build command).
   Or use the CLI: `npm i -g vercel && vercel`
2. **Add Redis**: Vercel project → *Storage* → *Create / Marketplace* → **Upstash for Redis** → connect it to the project.
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` are filled in automatically.
3. **Environment Variables** (Settings → Environment Variables):
   - `CEKAT_API_KEY` = API key from Cekat
   - `CEKAT_INBOX_ID` = `deb013c0-07ff-44a8-bdff-95f603e4c2d2`
   - `WEBHOOK_SECRET` = a long random string (e.g. `openssl rand -hex 24`)
4. **Redeploy** so the env vars take effect.
5. In **Cekat → Custom API inbox → Webhook Settings → Edit**, enter:
   ```
   https://<project-name>.vercel.app/api/webhook?token=<WEBHOOK_SECRET>
   ```
6. Open `https://<project-name>.vercel.app`, fill in your name, and send a message. The AI/agent reply shows up in the chat.

## Test the webhook manually

```bash
curl -X POST "https://<project>.vercel.app/api/webhook?token=<WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"event":"message.sent","data":{"message_id":"test-1","conversation_id":"c1",
       "contact":{"id":"x","platform_id":"<sender_id from localStorage cekat_sender_id>"},
       "message":"Test balasan agent","media_type":"text","media_url":null,
       "sent_by":{"id":"a","name":"Support Agent","type":"agent"},"sent_at":"2026-11-11T10:00:00Z"}}'
```
`GET /api/webhook` returns `{"ok":true}`, which is handy for checking that the URL is live.

## Notes
- `sender_id` is generated randomly per browser (`web_<uuid>`) and stored in localStorage, so a returning visitor lands in the same conversation. The ↻ button in the header starts a new conversation.
- Cekat doesn't document a webhook signature, so security relies on the `?token=` in the URL. Keep it secret.
- `/api/send` is a public endpoint. For production, add rate limiting (e.g. `@upstash/ratelimit`) or a captcha.
- To change the title or colors, edit `CONFIG` in `public/app.js` and `--brand` in `public/style.css`.
