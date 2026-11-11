/*!
 * Cekat Custom Channel — embeddable chat widget
 * Usage (paste before </body> on any website):
 *   <script src="https://<your-app>.vercel.app/widget.js"
 *           data-color="#7c5cff" data-position="right" data-label="Chat dengan kami" async></script>
 */
(function () {
  'use strict';
  if (window.__cekatWidgetLoaded) return;
  window.__cekatWidgetLoaded = true;

  var script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  var ORIGIN = new URL(script.src).origin;
  var color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(script.getAttribute('data-color') || '') ? script.getAttribute('data-color') : '#7c5cff';
  var side = script.getAttribute('data-position') === 'left' ? 'left' : 'right';
  var label = script.getAttribute('data-label') || '';
  var autoOpenSec = parseInt(script.getAttribute('data-auto-open') || '0', 10);
  var KEY_OPENED = 'cekat_widget_opened';

  var css =
    '.cw-root{position:fixed;' + side + ':20px;bottom:20px;z-index:2147483000;font-family:"Plus Jakarta Sans",system-ui,sans-serif}' +
    '.cw-btn{position:relative;display:flex;align-items:center;gap:10px;height:60px;min-width:60px;padding:0 18px;border:1px solid rgba(255,255,255,.35);border-radius:30px;cursor:pointer;color:#fff;' +
    'background:linear-gradient(135deg,' + color + ',color-mix(in srgb,' + color + ' 50%,#22d3ee));' +
    'box-shadow:0 14px 40px color-mix(in srgb,' + color + ' 45%,transparent),inset 0 1px 0 rgba(255,255,255,.4);transition:transform .2s,box-shadow .2s;font-family:inherit;font-weight:600;font-size:15px;line-height:1}' +
    '.cw-btn:hover{transform:translateY(-2px) scale(1.03)}' +
    '.cw-btn.icon-only{padding:0;justify-content:center;width:60px}' +
    '.cw-btn svg{width:26px;height:26px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .3s,opacity .2s}' +
    '.cw-btn .cw-x{position:absolute;opacity:0;transform:rotate(-90deg)}' +
    '.cw-root.open .cw-btn .cw-chat{opacity:0;transform:rotate(90deg)}' +
    '.cw-root.open .cw-btn .cw-x{opacity:1;transform:none}' +
    '.cw-root.open .cw-btn .cw-label{display:none}' +
    '.cw-root.open .cw-btn{padding:0;width:60px;justify-content:center}' +
    '.cw-badge{position:absolute;top:-4px;' + (side === 'right' ? 'right' : 'left') + ':-4px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#ef4444;color:#fff;font:700 12px/22px system-ui;text-align:center;box-shadow:0 0 0 3px #fff;display:none}' +
    '.cw-badge.show{display:block;animation:cwPop .3s}' +
    '.cw-preview{position:absolute;bottom:74px;' + side + ':0;max-width:260px;padding:12px 14px;border-radius:16px;font-family:inherit;font-weight:500;font-size:13.5px;line-height:1.4;color:#171a2e;cursor:pointer;' +
    'background:rgba(255,255,255,.75);-webkit-backdrop-filter:blur(18px) saturate(170%);backdrop-filter:blur(18px) saturate(170%);border:1px solid rgba(255,255,255,.8);box-shadow:0 14px 40px rgba(40,30,120,.18);display:none}' +
    '.cw-preview.show{display:block;animation:cwPop .3s}' +
    '.cw-frame{position:absolute;bottom:76px;' + side + ':0;width:400px;height:640px;max-height:calc(100vh - 110px);border-radius:26px;overflow:hidden;' +
    'border:1px solid rgba(255,255,255,.3);box-shadow:0 30px 80px rgba(10,10,40,.35);opacity:0;transform:translateY(16px) scale(.96);transform-origin:bottom ' + side + ';pointer-events:none;transition:opacity .25s,transform .3s cubic-bezier(.2,.8,.2,1)}' +
    '.cw-root.open .cw-frame{opacity:1;transform:none;pointer-events:auto}' +
    '.cw-frame iframe{width:100%;height:100%;border:0;display:block;background:transparent}' +
    '@keyframes cwPop{from{transform:scale(.6);opacity:0}}' +
    '@media(max-width:480px){.cw-root.open .cw-frame{position:fixed;inset:0;width:100%;height:100%;max-height:none;border-radius:0}.cw-root.open .cw-btn{display:none}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.className = 'cw-root';
  root.innerHTML =
    '<div class="cw-preview" role="status"></div>' +
    '<div class="cw-frame"><iframe title="Live chat" allow="clipboard-write" loading="lazy"></iframe></div>' +
    '<button class="cw-btn' + (label ? '' : ' icon-only') + '" type="button" aria-label="Buka live chat" aria-expanded="false">' +
    '<svg class="cw-chat" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/></svg>' +
    '<svg class="cw-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
    (label ? '<span class="cw-label"></span>' : '') +
    '<span class="cw-badge"></span></button>';
  document.body.appendChild(root);

  var btn = root.querySelector('.cw-btn');
  var badge = root.querySelector('.cw-badge');
  var preview = root.querySelector('.cw-preview');
  var iframe = root.querySelector('iframe');
  if (label) root.querySelector('.cw-label').textContent = label;
  iframe.src = ORIGIN + '/?embed=1';

  var open = false;
  function send(type) {
    try { iframe.contentWindow.postMessage({ type: type }, ORIGIN); } catch (e) { /* not ready */ }
  }
  function setOpen(v) {
    open = v;
    root.classList.toggle('open', v);
    btn.setAttribute('aria-expanded', String(v));
    btn.setAttribute('aria-label', v ? 'Tutup live chat' : 'Buka live chat');
    send(v ? 'cekat:open' : 'cekat:closed');
    if (v) {
      badge.classList.remove('show');
      preview.classList.remove('show');
      try { localStorage.setItem(KEY_OPENED, '1'); } catch (e) { /* ignore */ }
    }
  }
  btn.addEventListener('click', function () { setOpen(!open); });
  preview.addEventListener('click', function () { setOpen(true); });

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'cekat:ready') send(open ? 'cekat:open' : 'cekat:closed');
    if (e.data.type === 'cekat:close') setOpen(false);
    if (e.data.type === 'cekat:unread' && !open) {
      var n = e.data.count || 0;
      badge.textContent = n > 9 ? '9+' : String(n);
      badge.classList.toggle('show', n > 0);
      if (n > 0 && e.data.preview) {
        preview.textContent = e.data.preview;
        preview.classList.add('show');
      }
    }
  });

  window.CekatChat = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    toggle: function () { setOpen(!open); },
  };

  if (autoOpenSec > 0) {
    var opened = false;
    try { opened = localStorage.getItem(KEY_OPENED) === '1'; } catch (e) { /* ignore */ }
    if (!opened) setTimeout(function () { if (!open) setOpen(true); }, autoOpenSec * 1000);
  }
})();
