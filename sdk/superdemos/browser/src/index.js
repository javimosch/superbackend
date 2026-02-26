(function () {
  function toStr(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function normalizeApiUrl(apiUrl) {
    const u = toStr(apiUrl).trim();
    if (!u) return '';
    return u.replace(/\/$/, '');
  }

  function buildHeaders(apiKey) {
    const headers = {};
    const key = toStr(apiKey).trim();
    if (key) headers['x-project-key'] = key;
    return headers;
  }

  async function fetchJson(url, headers) {
    const res = await fetch(url, { headers: headers || {} });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = data && data.error ? data.error : 'Request failed';
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function getQuery() {
    try {
      return new URL(window.location.href).searchParams;
    } catch {
      return new URLSearchParams();
    }
  }

  function wsUrlFromHttp(apiUrl) {
    const u = new URL(apiUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString().replace(/\/$/, '');
  }

  function randomId(prefix) {
    const buf = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(buf);
    } else {
      for (let i = 0; i < buf.length; i += 1) buf[i] = Math.floor(Math.random() * 256);
    }
    let out = '';
    for (const b of buf) out += b.toString(16).padStart(2, '0');
    return prefix + '_' + out;
  }

  function getAnonId() {
    const key = 'superdemos.anonId';
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const v = randomId('anon');
      localStorage.setItem(key, v);
      return v;
    } catch {
      return randomId('anon');
    }
  }


  function parseForceFlag(value) {
    const v = String(value || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'force';
  }
  function ensureStyles() {
    if (document.getElementById('superdemos-styles')) return;
    const style = document.createElement('style');
    style.id = 'superdemos-styles';
    style.textContent = `
      .sd-highlight { position: absolute; z-index: 2147483000; pointer-events: none; border: 2px solid rgba(168,85,247,0.9); background: rgba(168,85,247,0.08); border-radius: 6px; }
      .sd-bubble { position: absolute; z-index: 2147483001; max-width: 320px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 13px; line-height: 1.35; color: #111827; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.18); padding: 10px 12px; }
      .sd-bubble .sd-actions { margin-top: 8px; display: flex; gap: 8px; justify-content: flex-end; }
      .sd-bubble button { cursor: pointer; border: 0; border-radius: 8px; padding: 7px 10px; font-size: 12px; }
      .sd-bubble .sd-next { background: #7c3aed; color: white; }
      .sd-bubble .sd-close { background: #f3f4f6; color: #111827; }
      .sd-inspector-tip { position: fixed; z-index: 2147483002; bottom: 12px; right: 12px; background: rgba(17,24,39,0.92); color: #fff; padding: 8px 10px; border-radius: 8px; font-size: 12px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    `;
    document.head.appendChild(style);
  }

  function presetCss(preset) {
    const p = String(preset || 'default').trim().toLowerCase();
    if (p === 'glass-dark') {
      return `
        .sd-bubble { background: rgba(17,24,39,0.92) !important; color: #f9fafb !important; border-color: rgba(255,255,255,0.22) !important; backdrop-filter: blur(8px); }
        .sd-bubble .sd-close { background: rgba(255,255,255,0.16) !important; color: #fff !important; }
        .sd-bubble .sd-next { background: #22c55e !important; color: #06260f !important; }
        .sd-highlight { border-color: rgba(34,197,94,0.95) !important; background: rgba(34,197,94,0.14) !important; }
      `;
    }
    if (p === 'high-contrast') {
      return `
        .sd-bubble { background: #000 !important; color: #fff !important; border-color: #fff !important; box-shadow: 0 0 0 2px #fff !important; }
        .sd-bubble .sd-close { background: #fff !important; color: #000 !important; }
        .sd-bubble .sd-next { background: #ffeb00 !important; color: #000 !important; }
        .sd-highlight { border-color: #ffeb00 !important; background: rgba(255,235,0,0.2) !important; }
      `;
    }
    if (p === 'soft-purple') {
      return `
        .sd-bubble { background: #faf5ff !important; color: #3b0764 !important; border-color: #d8b4fe !important; }
        .sd-bubble .sd-close { background: #f3e8ff !important; color: #581c87 !important; }
        .sd-bubble .sd-next { background: #a855f7 !important; color: #fff !important; }
        .sd-highlight { border-color: #a855f7 !important; background: rgba(168,85,247,0.14) !important; }
      `;
    }
    return '';
  }

  function applyProjectStyles(project) {
    ensureStyles();
    const existing = document.getElementById('superdemos-styles-override');
    if (existing) existing.remove();
    const css = `${presetCss(project && project.stylePreset)}\n${toStr(project && project.styleOverrides)}`;
    if (!css.trim()) return;
    const style = document.createElement('style');
    style.id = 'superdemos-styles-override';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function rectFor(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
  }

  function isProbablyUniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return '';

    // Prefer stable attrs
    const stableAttrs = ['data-testid', 'data-test', 'data-cy', 'aria-label', 'name'];
    for (const attr of stableAttrs) {
      const v = el.getAttribute(attr);
      if (v) {
        const candidate = `[${attr}="${CSS.escape(v)}"]`;
        if (isProbablyUniqueSelector(candidate)) return candidate;
      }
    }

    // Prefer id
    const id = el.getAttribute('id');
    if (id) {
      const candidate = `#${CSS.escape(id)}`;
      if (isProbablyUniqueSelector(candidate)) return candidate;
    }

    // Build path
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 6) {
      const tag = cur.tagName.toLowerCase();
      let part = tag;

      const cls = toStr(cur.getAttribute('class')).trim();
      if (cls) {
        const classList = cls
          .split(/\s+/)
          .map((c) => c.trim())
          .filter(Boolean)
          .slice(0, 2)
          .map((c) => `.${CSS.escape(c)}`)
          .join('');
        if (classList) part += classList;
      }

      // nth-child fallback
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          const idx = Array.from(parent.children).indexOf(cur) + 1;
          part += `:nth-child(${idx})`;
        }
      }

      parts.unshift(part);
      const candidate = parts.join(' > ');
      if (isProbablyUniqueSelector(candidate)) return candidate;

      cur = cur.parentElement;
      depth += 1;
    }

    return parts.join(' > ');
  }

  function truncateText(s, max) {
    const str = toStr(s).trim().replace(/\s+/g, ' ');
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
  }

  function hintsFor(el) {
    const out = {
      tag: el.tagName.toLowerCase(),
    };
    const text = truncateText(el.textContent, 80);
    if (text) out.text = text;

    const attrs = {};
    ['data-testid', 'data-test', 'data-cy', 'aria-label', 'name', 'type', 'role', 'placeholder'].forEach((k) => {
      const v = el.getAttribute(k);
      if (v) attrs[k] = v;
    });
    if (Object.keys(attrs).length) out.attrs = attrs;
    return out;
  }

  function createHighlight() {
    const el = document.createElement('div');
    el.className = 'sd-highlight';
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  function positionBox(boxEl, rect) {
    boxEl.style.left = rect.x + 'px';
    boxEl.style.top = rect.y + 'px';
    boxEl.style.width = Math.max(0, rect.w) + 'px';
    boxEl.style.height = Math.max(0, rect.h) + 'px';
  }

  function createBubble() {
    const el = document.createElement('div');
    el.className = 'sd-bubble';
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  function positionBubble(bubbleEl, targetRect, placement) {
    const pad = 10;
    const w = bubbleEl.offsetWidth;
    const h = bubbleEl.offsetHeight;

    let x = targetRect.x;
    let y = targetRect.y;

    const p = toStr(placement).toLowerCase();
    if (p === 'top') {
      x = targetRect.x;
      y = targetRect.y - h - pad;
    } else if (p === 'bottom') {
      x = targetRect.x;
      y = targetRect.y + targetRect.h + pad;
    } else if (p === 'left') {
      x = targetRect.x - w - pad;
      y = targetRect.y;
    } else if (p === 'right') {
      x = targetRect.x + targetRect.w + pad;
      y = targetRect.y;
    } else {
      // auto
      y = targetRect.y + targetRect.h + pad;
    }

    // keep in viewport
    const maxX = window.scrollX + window.innerWidth - w - pad;
    const maxY = window.scrollY + window.innerHeight - h - pad;
    x = Math.max(window.scrollX + pad, Math.min(x, maxX));
    y = Math.max(window.scrollY + pad, Math.min(y, maxY));

    bubbleEl.style.left = x + 'px';
    bubbleEl.style.top = y + 'px';
  }

  async function waitForSelector(selector, timeoutMs) {
    const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 8000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }

  function safeScrollIntoView(el) {
    try {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    } catch {
      try {
        el.scrollIntoView(true);
      } catch {}
    }
  }

  function setSeen(projectId, demoId, version, anonId) {
    const key = `superdemos.seen.${projectId}.${demoId}.v${version}.${anonId}`;
    try {
      localStorage.setItem(key, '1');
    } catch {}
  }

  function hasSeen(projectId, demoId, version, anonId) {
    const key = `superdemos.seen.${projectId}.${demoId}.v${version}.${anonId}`;
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  async function playSteps(def) {
    ensureStyles();

    const highlight = createHighlight();
    const bubble = createBubble();

    let cleanupTargetListener = null;

    function cleanup() {
      try {
        highlight.remove();
      } catch {}
      try {
        bubble.remove();
      } catch {}
      try {
        if (cleanupTargetListener) cleanupTargetListener();
      } catch {}
      cleanupTargetListener = null;
    }

    function showBubbleOn(el, step, onNext) {
      const rect = rectFor(el);
      highlight.style.display = 'block';
      positionBox(highlight, rect);

      bubble.innerHTML = '';

      const msg = document.createElement('div');
      msg.textContent = toStr(step.message);
      bubble.appendChild(msg);

      const actions = document.createElement('div');
      actions.className = 'sd-actions';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'sd-close';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => cleanup());
      actions.appendChild(closeBtn);

      const nextBtn = document.createElement('button');
      nextBtn.className = 'sd-next';
      nextBtn.textContent = 'Next';
      nextBtn.addEventListener('click', () => onNext());

      const advType = toStr(step.advance && step.advance.type).trim() || 'manualNext';
      if (advType === 'manualNext') {
        actions.appendChild(nextBtn);
      }

      bubble.appendChild(actions);
      bubble.style.display = 'block';

      // ensure dimensions computed
      const placement = toStr(step.placement || 'auto');
      positionBubble(bubble, rect, placement);

      if (advType === 'clickTarget') {
        const handler = () => {
          onNext();
        };
        el.addEventListener('click', handler, { once: true, capture: true });
        cleanupTargetListener = () => {
          try {
            el.removeEventListener('click', handler, { capture: true });
          } catch {}
        };
      }

      if (advType === 'delayMs') {
        const ms = Number(step.advance && step.advance.ms) > 0 ? Number(step.advance.ms) : 1200;
        setTimeout(() => onNext(), ms);
      }
    }

    const steps = Array.isArray(def.steps) ? def.steps : [];

    let idx = 0;
    return new Promise((resolve) => {
      async function runNext() {
      if (idx >= steps.length) {
        cleanup();
        resolve({ completed: true });
        return;
      }

      const step = steps[idx];
      idx += 1;

      const selector = toStr(step.selector).trim();
      if (!selector) {
        runNext();
        return;
      }

      const timeoutMs = Number(step.waitFor && step.waitFor.timeoutMs) || 8000;
      const el = await waitForSelector(selector, timeoutMs);
      if (!el) {
        // Skip if element not found.
        runNext();
        return;
      }

      safeScrollIntoView(el);
      showBubbleOn(el, step, runNext);
    }

      runNext();
    });
  }

  function createInspectorOverlay({ onHover, onSelect, onExit }) {
    ensureStyles();

    const highlight = createHighlight();
    const tip = document.createElement('div');
    tip.className = 'sd-inspector-tip';
    tip.textContent = 'SuperDemos authoring: hover to preview, click to select. Press Esc to exit.';
    document.body.appendChild(tip);

    let lastHoverEl = null;

    function updateHighlight(el) {
      if (!el) {
        highlight.style.display = 'none';
        return;
      }
      const r = rectFor(el);
      highlight.style.display = 'block';
      positionBox(highlight, r);
    }

    function isOverlayEl(el) {
      if (!el) return false;
      if (el.classList && (el.classList.contains('sd-highlight') || el.classList.contains('sd-bubble') || el.classList.contains('sd-inspector-tip')))
        return true;
      return false;
    }

    function onMouseMove(e) {
      const el = e.target;
      if (!el || isOverlayEl(el)) return;
      if (el === lastHoverEl) return;
      lastHoverEl = el;
      updateHighlight(el);
      if (onHover) onHover(el);
    }

    function onClick(e) {
      const el = e.target;
      if (!el || isOverlayEl(el)) return;

      e.preventDefault();
      e.stopPropagation();

      updateHighlight(el);
      if (onSelect) onSelect(el);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        cleanup();
        if (onExit) onExit();
      }
    }

    function cleanup() {
      try {
        window.removeEventListener('mousemove', onMouseMove, true);
      } catch {}
      try {
        window.removeEventListener('click', onClick, true);
      } catch {}
      try {
        window.removeEventListener('keydown', onKeyDown, true);
      } catch {}
      try {
        highlight.remove();
      } catch {}
      try {
        tip.remove();
      } catch {}
    }

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown, true);

    return { cleanup };
  }

  async function startAuthorMode({ apiUrl, sessionId, token }) {
    if (!apiUrl) throw new Error('apiUrl is required for author mode');
    if (!sessionId || !token) throw new Error('Missing sd_session/sd_token');

    ensureStyles();

    const wsBase = wsUrlFromHttp(apiUrl);
    const wsUrl = `${wsBase}/api/superdemos/ws?sessionId=${encodeURIComponent(sessionId)}&role=sdk&token=${encodeURIComponent(
      token,
    )}`;

    const bubble = createBubble();
    let inspector = null;

    function clearPreview() {
      bubble.style.display = 'none';
      bubble.innerHTML = '';
    }

    function showPreview(selector, message, placement) {
      clearPreview();
      let target;
      try {
        target = document.querySelector(selector);
      } catch {
        target = null;
      }
      if (!target) return;

      const rect = rectFor(target);
      bubble.textContent = toStr(message);
      bubble.style.display = 'block';
      positionBubble(bubble, rect, placement || 'auto');
    }

    const ws = new WebSocket(wsUrl);

    ws.addEventListener('open', () => {
      // eslint-disable-next-line no-console
      console.log('[SuperDemos] author WS connected');
      try {
        ws.send(
          JSON.stringify({
            type: 'location',
            location: {
              url: window.location.href,
              title: document.title || '',
            },
          }),
        );
      } catch {}
    });

    ws.addEventListener('message', (evt) => {
      let msg;
      try {
        msg = JSON.parse(String(evt.data || ''));
      } catch {
        return;
      }

      if (msg.type === 'preview_bubble') {
        showPreview(toStr(msg.selector), toStr(msg.message), toStr(msg.placement || 'auto'));
      }

      if (msg.type === 'clear_preview') {
        clearPreview();
      }
    });

    ws.addEventListener('close', () => {
      // eslint-disable-next-line no-console
      console.log('[SuperDemos] author WS disconnected');
      try {
        if (inspector) inspector.cleanup();
      } catch {}
      try {
        bubble.remove();
      } catch {}
    });

    inspector = createInspectorOverlay({
      onHover(el) {
        const selector = buildSelector(el);
        if (!selector) return;
        ws.send(
          JSON.stringify({
            type: 'hover',
            element: {
              selector,
              rect: rectFor(el),
              hints: hintsFor(el),
            },
          }),
        );
      },
      onSelect(el) {
        const selector = buildSelector(el);
        if (!selector) return;
        ws.send(
          JSON.stringify({
            type: 'select',
            element: {
              selector,
              rect: rectFor(el),
              hints: hintsFor(el),
            },
          }),
        );
      },
      onExit() {
        try {
          ws.close();
        } catch {}
      },
    });

    return { ws, inspector };
  }

  const state = {
    initialized: false,
    projectId: null,
    apiKey: null,
    apiUrl: '',
    mode: 'live',
  };

  async function init(options) {
    const opts = options || {};
    const projectId = toStr(opts.projectId).trim();
    if (!projectId) throw new Error('projectId is required');

    const apiUrl = normalizeApiUrl(opts.apiUrl);
    if (!apiUrl) throw new Error('apiUrl is required');

    state.projectId = projectId;
    state.apiKey = opts.apiKey;
    state.apiUrl = apiUrl;
    state.mode = toStr(opts.mode || 'live').trim().toLowerCase() === 'author' ? 'author' : 'live';

    const q = getQuery();
    const sessionId = toStr(q.get('sd_session')).trim();
    const token = toStr(q.get('sd_token')).trim();
    const authorFlag = toStr(q.get('sd_author')).trim();
    const forceFlag = parseForceFlag(opts.force) || parseForceFlag(q.get('sd_force'));

    if ((authorFlag === '1' || authorFlag === 'true' || (sessionId && token)) && sessionId && token) {
      state.mode = 'author';
      await startAuthorMode({ apiUrl, sessionId, token });
      state.initialized = true;
      return { mode: 'author', sessionId };
    }

    // Live mode
    const anonId = getAnonId();

    const listUrl =
      apiUrl +
      '/api/superdemos/projects/' +
      encodeURIComponent(projectId) +
      '/demos/published?url=' +
      encodeURIComponent(window.location.href);

    const list = await fetchJson(listUrl, buildHeaders(opts.apiKey));
    applyProjectStyles(list && list.project ? list.project : null);
    const demos = list && Array.isArray(list.demos) ? list.demos : [];
    const first = demos[0] || null;
    if (!first) {
      state.initialized = true;
      return { mode: 'live', played: false, reason: 'no_demos' };
    }

    if (!forceFlag && hasSeen(projectId, first.demoId, first.publishedVersion || 0, anonId)) {
      state.initialized = true;
      return { mode: 'live', played: false, reason: 'already_seen', demoId: first.demoId };
    }

    const defUrl = apiUrl + '/api/superdemos/demos/' + encodeURIComponent(first.demoId) + '/definition';
    const def = await fetchJson(defUrl, buildHeaders(opts.apiKey));

    await playSteps(def);
    if (!forceFlag) {
      setSeen(projectId, first.demoId, first.publishedVersion || 0, anonId);
    }

    state.initialized = true;
    return { mode: 'live', played: true, demoId: first.demoId };
  }

  const SuperDemos = {
    init,
    _state: state,
  };

  window.SuperDemos = SuperDemos;
  window.superDemos = SuperDemos;
})();
