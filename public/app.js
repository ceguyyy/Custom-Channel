(() => {
  'use strict';

  // ===== Config — edit to brand the widget =====
  const CONFIG = {
    title: 'Customer Support',
    subtitle: 'Online',
    pollMs: 2500,         // polling when tab visible
    pollHiddenMs: 10000,  // polling when tab hidden
    typingTimeoutMs: 45000,
  };

  // ===== Storage (safe fallback if localStorage blocked) =====
  const mem = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
    del(k) { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
  };
  const K = { id: 'cekat_sender_id', name: 'cekat_sender_name', phone: 'cekat_sender_phone', email: 'cekat_sender_email' };

  const uuid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

  // ===== DOM =====
  const $ = (id) => document.getElementById(id);
  const els = {
    title: $('title'), subtitle: $('subtitle'),
    onboarding: $('onboarding'), startForm: $('startForm'),
    messages: $('messages'), typing: $('typing'),
    composer: $('composer'), input: $('input'), sendBtn: $('sendBtn'),
    resetBtn: $('resetBtn'),
  };
  els.title.textContent = CONFIG.title;
  els.subtitle.lastChild.textContent = ' ' + CONFIG.subtitle;

  // ===== State =====
  const state = {
    senderId: store.get(K.id),
    senderName: store.get(K.name),
    cursor: 0,
    seen: new Set(),        // message ids / local ids already rendered
    pending: new Map(),     // local_id -> element
    pollTimer: null,
    typingTimer: null,
    lastDay: null,
  };

  // ===== Helpers =====
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkify = (html) =>
    html.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  // Light formatting: *bold* and _italic_ (WhatsApp-style)
  const format = (text) =>
    linkify(esc(text))
      .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1<strong>$2</strong>')
      .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<em>$2</em>');
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  const timeStr = (iso) => new Date(iso || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const dayStr = (iso) => new Date(iso || Date.now()).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
  const nearBottom = () => els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 120;
  const scrollDown = () => { els.messages.scrollTop = els.messages.scrollHeight; };

  // ===== Rendering =====
  function daySeparator(iso) {
    const d = dayStr(iso);
    if (d === state.lastDay) return;
    state.lastDay = d;
    const sep = document.createElement('div');
    sep.className = 'day-sep';
    sep.textContent = d;
    els.messages.appendChild(sep);
  }

  function mediaHtml(m) {
    const url = safeUrl(m.media_url);
    if (!url) return '';
    const u = esc(url);
    switch (m.media_type) {
      case 'image': return `<div class="media"><a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="Gambar" loading="lazy"></a></div>`;
      case 'video': return `<div class="media"><video src="${u}" controls preload="metadata"></video></div>`;
      case 'audio': return `<div class="media"><audio src="${u}" controls preload="metadata"></audio></div>`;
      default: {
        const name = esc(decodeURIComponent(url.split('?')[0].split('/').pop() || 'Dokumen'));
        return `<div class="media"><a class="file" href="${u}" target="_blank" rel="noopener">📄 ${name}</a></div>`;
      }
    }
  }

  function renderMessage(m, { status } = {}) {
    const stick = nearBottom();
    daySeparator(m.at);
    const el = document.createElement('div');
    const out = m.from === 'user';
    el.className = `msg ${out ? 'out' : 'in'}`;
    el.innerHTML =
      (!out && m.agent_name ? `<div class="who">${esc(m.agent_name)}</div>` : '') +
      mediaHtml(m) +
      (m.text ? `<div class="text">${format(m.text)}</div>` : '') +
      `<div class="meta"><span class="time">${timeStr(m.at)}</span>${out ? `<span class="status">${statusIcon(status || 'sent')}</span>` : ''}</div>`;
    els.messages.appendChild(el);
    if (stick || out) scrollDown();
    return el;
  }

  function statusIcon(s) {
    if (s === 'pending') return '🕓';
    if (s === 'failed') return '⚠️ Gagal — ketuk untuk kirim ulang';
    return '✓';
  }

  function setStatus(el, s) {
    el.classList.toggle('failed', s === 'failed');
    const st = el.querySelector('.status');
    if (st) st.textContent = statusIcon(s);
  }

  function showTyping(on) {
    clearTimeout(state.typingTimer);
    els.typing.hidden = !on;
    if (on) {
      els.messages.after(els.typing);
      state.typingTimer = setTimeout(() => (els.typing.hidden = true), CONFIG.typingTimeoutMs);
    }
  }

  // ===== API =====
  async function api(path, opts) {
    const r = await fetch(path, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  async function poll() {
    try {
      const j = await api(`/api/messages?sender_id=${encodeURIComponent(state.senderId)}&from=${state.cursor}`);
      for (const m of j.messages) {
        const key = m.id || m.local_id;
        if (m.local_id && state.pending.has(m.local_id)) {
          setStatus(state.pending.get(m.local_id), 'sent');
          state.pending.delete(m.local_id);
        }
        if ((m.id && state.seen.has(m.id)) || (m.local_id && state.seen.has(m.local_id))) continue;
        if (key) state.seen.add(key);
        if (m.local_id) state.seen.add(m.local_id);
        renderMessage(m);
        if (m.from === 'agent') showTyping(false);
      }
      state.cursor = j.next;
    } catch (e) {
      console.warn('poll failed', e.message);
    } finally {
      schedulePoll();
    }
  }

  function schedulePoll() {
    clearTimeout(state.pollTimer);
    state.pollTimer = setTimeout(poll, document.hidden ? CONFIG.pollHiddenMs : CONFIG.pollMs);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.senderId && state.senderName) poll(); });

  async function sendText(text, existingEl, existingLocalId) {
    const local_id = existingLocalId || uuid();
    const el = existingEl || renderMessage({ from: 'user', text, at: new Date().toISOString() }, { status: 'pending' });
    setStatus(el, 'pending');
    el.onclick = null;
    state.pending.set(local_id, el);
    state.seen.add(local_id);

    try {
      const j = await api('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: state.senderId,
          sender_name: state.senderName,
          sender_phone: store.get(K.phone) || undefined,
          sender_email: store.get(K.email) || undefined,
          message: text,
          local_id,
          additional_data: { source: 'web-chat', page: location.href, user_agent: navigator.userAgent },
        }),
      });
      if (j.data?.message_id) state.seen.add(j.data.message_id);
      setStatus(el, 'sent');
      state.pending.delete(local_id);
      showTyping(true);
    } catch (e) {
      console.error('send failed', e);
      state.pending.delete(local_id);
      setStatus(el, 'failed');
      el.onclick = () => sendText(text, el, local_id);
    }
  }

  // ===== UI flow =====
  function startChat() {
    els.onboarding.hidden = true;
    els.messages.hidden = false;
    els.composer.hidden = false;
    els.resetBtn.hidden = false;
    els.input.focus();
    poll();
  }

  els.startForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(els.startForm);
    const name = String(f.get('name') || '').trim();
    if (!name) return;
    state.senderName = name;
    state.senderId = state.senderId || `web_${uuid()}`;
    store.set(K.id, state.senderId);
    store.set(K.name, name);
    const phone = String(f.get('phone') || '').trim();
    const email = String(f.get('email') || '').trim();
    phone ? store.set(K.phone, phone) : store.del(K.phone);
    email ? store.set(K.email, email) : store.del(K.email);
    startChat();
  });

  els.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text) return;
    els.input.value = '';
    autoGrow();
    sendText(text);
  });

  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      els.composer.requestSubmit();
    }
  });

  function autoGrow() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
    els.sendBtn.disabled = !els.input.value.trim();
  }
  els.input.addEventListener('input', autoGrow);
  autoGrow();

  els.resetBtn.addEventListener('click', () => {
    if (!confirmReset()) return;
    Object.values(K).forEach((k) => store.del(k));
    location.reload();
  });
  // Inline confirm (avoids blocking dialogs): first click arms, second click within 3s resets
  let armed = 0;
  function confirmReset() {
    if (Date.now() - armed < 3000) return true;
    armed = Date.now();
    els.resetBtn.title = 'Klik lagi untuk mulai percakapan baru';
    els.resetBtn.style.background = 'rgba(255,255,255,0.25)';
    setTimeout(() => { els.resetBtn.style.background = ''; els.resetBtn.title = 'Mulai percakapan baru'; }, 3000);
    return false;
  }

  // ===== Boot =====
  if (state.senderId && state.senderName) startChat();
})();
