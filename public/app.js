(() => {
  'use strict';

  // ================= Setup =================
  const params = new URLSearchParams(location.search);
  const EMBED = params.get('embed') === '1';
  if (EMBED) document.documentElement.classList.add('embed');

  const POLL = { fast: 1500, normal: 4000, hidden: 12000, maxBackoff: 15000 };
  const FAST_WINDOW_MS = 90000;
  const TYPING_TIMEOUT_MS = 45000;
  const MAX_UPLOAD = 3 * 1024 * 1024;
  const EMOJIS = '😀 😂 😊 😍 🥰 😎 🤔 😅 🙏 👍 👌 👏 🙌 💪 🔥 ✨ 🎉 ❤️ 💯 ✅ ❌ 📍 📞 📷 🕒 💬 😢 😮 🤝 👋 🛒 💳'.split(' ');

  // Storage with in-memory fallback (third-party iframes / private mode)
  const mem = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
    del(k) { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
  };
  const K = {
    id: 'cekat_sender_id', name: 'cekat_sender_name', phone: 'cekat_sender_phone', email: 'cekat_sender_email',
    theme: 'cekat_theme', sound: 'cekat_sound',
  };

  const uuid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });

  const $ = (id) => document.getElementById(id);
  const els = {
    chat: $('chat'), avatar: $('avatar'), brandName: $('brandName'), status: $('status'), statusText: $('statusText'),
    soundBtn: $('soundBtn'), themeBtn: $('themeBtn'), resetBtn: $('resetBtn'), closeBtn: $('closeBtn'),
    onboarding: $('onboarding'), heroTitle: $('heroTitle'), heroText: $('heroText'),
    startForm: $('startForm'), formError: $('formError'), phoneHint: $('phoneHint'), emailHint: $('emailHint'),
    messages: $('messages'), newPill: $('newPill'), quick: $('quick'),
    composer: $('composer'), input: $('input'), sendBtn: $('sendBtn'),
    emojiBtn: $('emojiBtn'), emojiPop: $('emojiPop'), attachBtn: $('attachBtn'), file: $('file'),
    dropzone: $('dropzone'), lightbox: $('lightbox'), toast: $('toast'),
  };

  const state = {
    cfg: null,
    senderId: store.get(K.id),
    senderName: store.get(K.name),
    cursor: 0,
    seen: new Set(),
    pending: new Map(),
    pollTimer: null,
    failures: 0,
    fastUntil: 0,
    historyLoaded: false,
    hasUserMessage: false,
    lastDay: null,
    lastFrom: null,
    typingEl: null,
    typingTimer: null,
    unread: 0,
    widgetOpen: !EMBED,
    sound: store.get(K.sound) !== 'off',
    baseTitle: document.title,
  };

  // ================= Helpers =================
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkify = (html) =>
    html.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  // WhatsApp-style formatting: *bold* _italic_ ~strike~ `code`
  const format = (text) =>
    linkify(esc(text))
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<strong>$2</strong>')
      .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])~([^~\n]+)~(?=[\s).,!?]|$)/g, '$1<s>$2</s>');
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  const timeStr = (iso) => new Date(iso || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const dayLabel = (iso) => {
    const d = new Date(iso || Date.now());
    const today = new Date();
    const yest = new Date(Date.now() - 864e5);
    if (d.toDateString() === today.toDateString()) return 'Hari ini';
    if (d.toDateString() === yest.toDateString()) return 'Kemarin';
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const nearBottom = () => els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 140;
  const scrollDown = (smooth = true) => {
    els.messages.style.scrollBehavior = smooth ? 'smooth' : 'auto';
    els.messages.scrollTop = els.messages.scrollHeight;
    els.newPill.hidden = true;
  };
  const isAway = () => document.hidden || !state.widgetOpen;
  const postParent = (msg) => { if (EMBED && window.parent !== window) window.parent.postMessage(msg, '*'); };

  let toastTimer;
  function toast(text, ms = 2600) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (els.toast.hidden = true), ms);
  }

  async function api(path, opts) {
    const r = await fetch(path, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) {
      const err = new Error(j.error || `HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return j;
  }

  // ================= Theme / brand / sound =================
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]').content = t === 'dark' ? '#0b0b1a' : '#eef0ff';
  }
  applyTheme(store.get(K.theme) || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  els.themeBtn.onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(t);
    store.set(K.theme, t);
  };

  function applySound() { els.soundBtn.setAttribute('aria-pressed', String(state.sound)); }
  applySound();
  els.soundBtn.onclick = () => {
    state.sound = !state.sound;
    store.set(K.sound, state.sound ? 'on' : 'off');
    applySound();
    if (state.sound) ding();
  };

  let actx;
  function ding() {
    if (!state.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + 0.4);
    } catch { /* audio unavailable */ }
  }

  function applyConfig(cfg) {
    state.cfg = cfg;
    const b = cfg.brand;
    document.documentElement.style.setProperty('--brand', b.color);
    els.brandName.textContent = b.name;
    document.title = state.baseTitle = b.name;
    els.avatar.innerHTML = b.logo
      ? `<img src="${esc(b.logo)}" alt="">`
      : esc((b.name.match(/\b\w/g) || ['C']).slice(0, 2).join('').toUpperCase());
    els.statusText.textContent = b.tagline;
    if (cfg.form.requirePhone) { els.phoneHint.textContent = '*'; els.phoneHint.className = 'req'; }
    if (cfg.form.requireEmail) { els.emailHint.textContent = '*'; els.emailHint.className = 'req'; }
    els.attachBtn.hidden = !cfg.features.uploads;
    els.closeBtn.hidden = !EMBED;
  }

  function setOnline(on) {
    els.status.classList.toggle('offline', !on);
    els.statusText.textContent = on ? state.cfg?.brand.tagline || 'Online' : 'Menghubungkan ulang…';
  }

  // ================= Rendering =================
  function daySeparator(iso) {
    const d = dayLabel(iso);
    if (d === state.lastDay) return;
    state.lastDay = d;
    state.lastFrom = null;
    const sep = document.createElement('div');
    sep.className = 'day-sep';
    sep.textContent = d;
    insertBeforeTyping(sep);
  }

  function insertBeforeTyping(node) {
    if (state.typingEl && state.typingEl.parentNode === els.messages) els.messages.insertBefore(node, state.typingEl);
    else els.messages.appendChild(node);
  }

  function fileIcon(name = '') {
    const ext = name.split('.').pop().toLowerCase();
    return { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', txt: '📄' }[ext] || '📎';
  }

  function mediaHtml(m) {
    const url = safeUrl(m.media_url) || (m.preview_url || null);
    if (!url) return '';
    const u = esc(url);
    switch (m.media_type) {
      case 'image': return `<div class="media"><img src="${u}" alt="Gambar" loading="lazy" data-zoom></div>`;
      case 'video': return `<div class="media"><video src="${u}" controls preload="metadata" playsinline></video></div>`;
      case 'audio': return `<div class="media"><audio src="${u}" controls preload="metadata"></audio></div>`;
      default: {
        const name = m.file_name || decodeURIComponent(url.split('?')[0].split('/').pop() || 'Dokumen');
        return `<div class="media"><a class="file-card" href="${u}" target="_blank" rel="noopener">
          <span class="ic">${fileIcon(name)}</span>
          <span><div class="nm">${esc(name)}</div><div class="sub">${m.file_size ? fmtSize(m.file_size) + ' · ' : ''}Buka dokumen</div></span></a></div>`;
      }
    }
  }

  function statusLabel(s) {
    return { pending: '🕓', uploading: 'Mengunggah…', failed: '⚠️ Gagal · ketuk untuk ulangi', sent: '✓' }[s] || '✓';
  }

  function renderMessage(m, { status } = {}) {
    const stick = nearBottom();
    daySeparator(m.at);
    const out = m.from === 'user';
    const el = document.createElement('div');
    el.className = `msg ${out ? 'out' : 'in'}`;
    const showName = !out && m.agent_name && state.lastFrom !== `agent:${m.agent_name}`;
    el.innerHTML =
      (showName ? `<div class="who">${esc(m.agent_name)}</div>` : '') +
      mediaHtml(m) +
      (m.text ? `<div class="text">${format(m.text)}</div>` : '') +
      `<div class="meta"><span>${timeStr(m.at)}</span>${out ? `<span class="st">${statusLabel(status || 'sent')}</span>` : ''}</div>`;
    insertBeforeTyping(el);
    state.lastFrom = out ? 'user' : `agent:${m.agent_name}`;
    if (out) state.hasUserMessage = true;

    if (stick || out || !state.historyLoaded) scrollDown(state.historyLoaded);
    else els.newPill.hidden = false;
    return el;
  }

  function setStatus(el, s) {
    el.classList.toggle('failed', s === 'failed');
    el.classList.toggle('uploading', s === 'uploading');
    const st = el.querySelector('.st');
    if (st) st.textContent = statusLabel(s);
  }

  function showTyping(on) {
    clearTimeout(state.typingTimer);
    if (on) {
      if (!state.typingEl) {
        state.typingEl = document.createElement('div');
        state.typingEl.className = 'typing';
        state.typingEl.innerHTML = '<span></span><span></span><span></span>';
      }
      els.messages.appendChild(state.typingEl);
      if (nearBottom()) scrollDown();
      state.typingTimer = setTimeout(() => showTyping(false), TYPING_TIMEOUT_MS);
    } else if (state.typingEl) {
      state.typingEl.remove();
    }
  }

  function renderWelcome() {
    if (!state.cfg?.welcome) return;
    renderMessage({ from: 'agent', agent_name: state.cfg.brand.name, text: state.cfg.welcome, at: new Date().toISOString() });
  }

  function renderQuickReplies() {
    const items = state.cfg?.quickReplies || [];
    els.quick.innerHTML = '';
    items.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = t;
      b.onclick = () => sendText(t);
      els.quick.appendChild(b);
    });
    updateQuickVisibility();
  }
  const updateQuickVisibility = () => { els.quick.hidden = state.hasUserMessage || !els.quick.children.length; };

  // ================= Unread / notifications =================
  function bumpUnread(m) {
    if (!isAway()) return;
    state.unread += 1;
    document.title = `(${state.unread}) ${state.baseTitle}`;
    postParent({ type: 'cekat:unread', count: state.unread, preview: previewText(m) });
    if (!EMBED && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try {
        const n = new Notification(m.agent_name || state.cfg?.brand.name || 'Pesan baru', {
          body: previewText(m), tag: 'cekat-chat', icon: state.cfg?.brand.logo || undefined,
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch { /* ignore */ }
    }
  }
  function previewText(m) {
    const t = (m.text || '📎 Lampiran').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
    return t.length > 90 ? t.slice(0, 88) + '…' : t;
  }
  function clearUnread() {
    if (!state.unread) return;
    state.unread = 0;
    document.title = state.baseTitle;
    postParent({ type: 'cekat:unread', count: 0 });
  }
  function maybeAskNotification() {
    if (EMBED || !('Notification' in window) || Notification.permission !== 'default') return;
    try { Notification.requestPermission(); } catch { /* ignore */ }
  }

  // ================= Polling =================
  async function poll() {
    clearTimeout(state.pollTimer);
    try {
      const j = await api(`/api/messages?sender_id=${encodeURIComponent(state.senderId)}&from=${state.cursor}`);
      if (state.failures) setOnline(true);
      state.failures = 0;
      if (!state.historyLoaded && state.cursor === 0 && j.messages.length === 0) renderWelcome();
      for (const m of j.messages) handleIncoming(m);
      state.cursor = j.next;
      if (!state.historyLoaded) {
        state.historyLoaded = true;
        updateQuickVisibility();
        scrollDown(false);
      }
    } catch (e) {
      state.failures += 1;
      if (state.failures >= 2) setOnline(false);
      console.warn('poll failed', e.message);
    } finally {
      schedulePoll();
    }
  }

  function handleIncoming(m) {
    if (m.local_id && state.pending.has(m.local_id)) {
      setStatus(state.pending.get(m.local_id), 'sent');
      state.pending.delete(m.local_id);
    }
    if ((m.id && state.seen.has(m.id)) || (m.local_id && state.seen.has(m.local_id))) return;
    if (m.id) state.seen.add(m.id);
    if (m.local_id) state.seen.add(m.local_id);
    renderMessage(m);
    if (m.from === 'agent') {
      showTyping(false);
      if (state.historyLoaded) {
        state.fastUntil = Date.now() + FAST_WINDOW_MS;
        ding();
        bumpUnread(m);
      }
    }
  }

  function schedulePoll() {
    clearTimeout(state.pollTimer);
    let delay = document.hidden ? POLL.hidden : Date.now() < state.fastUntil ? POLL.fast : POLL.normal;
    if (state.failures) delay = Math.min(POLL.maxBackoff, delay * 2 ** Math.min(state.failures, 3));
    state.pollTimer = setTimeout(poll, delay);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.widgetOpen) clearUnread();
    if (!document.hidden && isChatting()) poll();
  });
  const isChatting = () => Boolean(state.senderId && state.senderName && !els.messages.hidden);

  // ================= Sending =================
  function identityFields() {
    return {
      sender_id: state.senderId,
      sender_name: state.senderName,
      sender_phone: store.get(K.phone) || undefined,
      sender_email: store.get(K.email) || undefined,
      additional_data: {
        source: EMBED ? 'web-widget' : 'web-chat',
        page: EMBED ? document.referrer || '' : location.href,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };
  }

  async function deliver(body, el, local_id) {
    state.pending.set(local_id, el);
    state.seen.add(local_id);
    setStatus(el, 'pending');
    el.onclick = null;
    try {
      const j = await api('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...identityFields(), ...body, local_id }),
      });
      if (j.data?.message_id) state.seen.add(j.data.message_id);
      setStatus(el, 'sent');
      state.pending.delete(local_id);
      state.fastUntil = Date.now() + FAST_WINDOW_MS;
      showTyping(true);
      schedulePoll();
      return true;
    } catch (e) {
      console.error('send failed', e);
      state.pending.delete(local_id);
      setStatus(el, 'failed');
      if (e.status === 429) toast(e.message);
      el.onclick = () => deliver(body, el, local_id);
      return false;
    }
  }

  function sendText(text) {
    text = String(text || '').trim();
    if (!text) return;
    const local_id = uuid();
    const el = renderMessage({ from: 'user', text, at: new Date().toISOString() }, { status: 'pending' });
    updateQuickVisibility();
    maybeAskNotification();
    deliver({ message: text }, el, local_id);
  }

  // ---- Files ----
  async function compressImage(file, max = 1600, quality = 0.82) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { return file; }
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.2 * 1024 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  }

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

  async function sendFile(original) {
    if (!state.cfg?.features.uploads) return toast('Upload file belum diaktifkan');
    if (!original) return;
    const caption = els.input.value.trim();
    els.input.value = '';
    autoGrow();

    const file = await compressImage(original);
    if (file.size > MAX_UPLOAD) return toast(`File terlalu besar (${fmtSize(file.size)}). Maksimal 3 MB.`);
    const isImage = file.type.startsWith('image/');
    const preview_url = isImage ? URL.createObjectURL(file) : null;

    const local_id = uuid();
    const el = renderMessage({
      from: 'user', text: caption, at: new Date().toISOString(),
      media_type: isImage ? 'image' : 'document', preview_url, file_name: file.name, file_size: file.size,
    }, { status: 'uploading' });
    updateQuickVisibility();

    const run = async () => {
      setStatus(el, 'uploading');
      el.onclick = null;
      try {
        const up = await api('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender_id: state.senderId, filename: file.name, content_type: file.type, data: await toBase64(file),
          }),
        });
        const ok = await deliver({
          message: caption || undefined, media_type: up.media_type, media_url: up.url, file_name: up.file_name,
        }, el, local_id);
        if (ok && preview_url) setTimeout(() => URL.revokeObjectURL(preview_url), 60000);
      } catch (e) {
        console.error('upload failed', e);
        setStatus(el, 'failed');
        toast(e.message || 'Upload gagal');
        el.onclick = run;
      }
    };
    run();
  }

  els.attachBtn.onclick = () => els.file.click();
  els.file.onchange = () => { sendFile(els.file.files[0]); els.file.value = ''; };

  // Paste images
  els.input.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])][0];
    if (f && state.cfg?.features.uploads) { e.preventDefault(); sendFile(f); }
  });

  // Drag & drop
  let dragDepth = 0;
  els.chat.addEventListener('dragenter', (e) => {
    if (!isChatting() || !state.cfg?.features.uploads || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault(); dragDepth++; els.dropzone.hidden = false;
  });
  els.chat.addEventListener('dragover', (e) => { if (!els.dropzone.hidden) e.preventDefault(); });
  els.chat.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; els.dropzone.hidden = true; } });
  els.chat.addEventListener('drop', (e) => {
    if (els.dropzone.hidden) return;
    e.preventDefault(); dragDepth = 0; els.dropzone.hidden = true;
    sendFile(e.dataTransfer.files[0]);
  });

  // ================= Composer =================
  els.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text) return;
    els.input.value = '';
    autoGrow();
    sendText(text);
    els.input.focus();
  });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      els.composer.requestSubmit();
    }
  });
  function autoGrow() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 130) + 'px';
    els.sendBtn.disabled = !els.input.value.trim();
  }
  els.input.addEventListener('input', autoGrow);
  autoGrow();

  // Emoji
  els.emojiPop.innerHTML = EMOJIS.map((e) => `<button type="button">${e}</button>`).join('');
  els.emojiBtn.onclick = (e) => { e.stopPropagation(); els.emojiPop.hidden = !els.emojiPop.hidden; };
  els.emojiPop.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const { selectionStart: s = els.input.value.length, selectionEnd: en = s } = els.input;
    els.input.value = els.input.value.slice(0, s) + b.textContent + els.input.value.slice(en);
    els.input.selectionStart = els.input.selectionEnd = s + b.textContent.length;
    els.input.focus();
    autoGrow();
  };
  document.addEventListener('click', (e) => {
    if (!els.emojiPop.hidden && !els.emojiPop.contains(e.target)) els.emojiPop.hidden = true;
  });

  // Lightbox
  els.messages.addEventListener('click', (e) => {
    const img = e.target.closest('img[data-zoom]');
    if (!img || img.closest('.msg.failed')) return;
    els.lightbox.querySelector('img').src = img.src;
    els.lightbox.hidden = false;
  });
  els.lightbox.onclick = () => (els.lightbox.hidden = true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { els.lightbox.hidden = true; els.emojiPop.hidden = true; }
  });

  // "New messages" pill
  els.newPill.onclick = () => scrollDown();
  els.messages.addEventListener('scroll', () => { if (nearBottom()) els.newPill.hidden = true; });

  // ================= Onboarding / lifecycle =================
  els.startForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(els.startForm);
    const name = String(f.get('name') || '').trim();
    const phone = String(f.get('phone') || '').trim();
    const email = String(f.get('email') || '').trim();
    const err = (msg) => { els.formError.textContent = msg; els.formError.hidden = false; };

    if (!name) return err('Nama wajib diisi.');
    if (state.cfg?.form.requirePhone && !phone) return err('No. WhatsApp wajib diisi.');
    if (phone && !/^\+?[0-9\s-]{8,20}$/.test(phone)) return err('Format No. WhatsApp tidak valid.');
    if (state.cfg?.form.requireEmail && !email) return err('Email wajib diisi.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Format email tidak valid.');
    els.formError.hidden = true;

    state.senderName = name;
    state.senderId = state.senderId || `web_${uuid()}`;
    store.set(K.id, state.senderId);
    store.set(K.name, name);
    phone ? store.set(K.phone, phone.replace(/[\s-]/g, '')) : store.del(K.phone);
    email ? store.set(K.email, email) : store.del(K.email);
    startChat();
  });

  function startChat() {
    els.onboarding.hidden = true;
    els.messages.hidden = false;
    els.composer.hidden = false;
    els.resetBtn.hidden = false;
    renderQuickReplies();
    if (!EMBED) els.input.focus();
    poll();
  }

  // Reset: two-step confirm (avoids blocking dialogs)
  let armedAt = 0;
  els.resetBtn.onclick = () => {
    if (Date.now() - armedAt < 3000) {
      [K.id, K.name, K.phone, K.email].forEach((k) => store.del(k));
      location.reload();
      return;
    }
    armedAt = Date.now();
    els.resetBtn.classList.add('armed');
    toast('Klik sekali lagi untuk memulai percakapan baru');
    setTimeout(() => els.resetBtn.classList.remove('armed'), 3000);
  };

  // ================= Embed bridge =================
  els.closeBtn.onclick = () => postParent({ type: 'cekat:close' });
  window.addEventListener('message', (e) => {
    if (!EMBED || e.source !== window.parent || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'cekat:open') {
      state.widgetOpen = true;
      clearUnread();
      if (isChatting()) { poll(); setTimeout(() => els.input.focus(), 250); }
    } else if (e.data.type === 'cekat:closed') {
      state.widgetOpen = false;
    }
  });

  // ================= Boot =================
  const DEFAULT_CFG = {
    brand: { name: 'Customer Support', tagline: 'Online', color: '#7c5cff', logo: null },
    welcome: 'Halo! 👋 Ada yang bisa kami bantu?',
    quickReplies: [],
    form: { requirePhone: false, requireEmail: false },
    features: { uploads: false },
  };

  (async () => {
    let cfg = DEFAULT_CFG;
    try { cfg = { ...DEFAULT_CFG, ...(await api('/api/config')) }; } catch { /* use defaults */ }
    applyConfig(cfg);
    postParent({ type: 'cekat:ready' });
    if (state.senderId && state.senderName) startChat();
    else if (!EMBED) els.startForm.querySelector('input').focus();
  })();
})();
