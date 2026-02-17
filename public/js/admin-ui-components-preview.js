(() => {
  function createManager(opts) {
    const {
      nextTick,
      previewMode,
      previewCssIsolation,
      previewPropsJson,
      previewStatus,
      previewLogs,
      previewContainerRef,
      previewTopMountRef,
      previewIframeRef,
      componentEditor,
      showToast,
    } = opts;

    let runtime = null;
    let topHost = null;

    function pushLog(...parts) {
      const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p, null, 2))).join(' ');
      previewLogs.value = [...previewLogs.value, line].slice(-200);
    }

    function clearLogs() {
      previewLogs.value = [];
    }

    function parseProps() {
      const raw = String(previewPropsJson.value || '').trim();
      if (!raw) return {};
      return JSON.parse(raw);
    }

    function getEditorComponent() {
      const code = String(componentEditor.value.code || '').trim().toLowerCase() || 'preview_component';
      return {
        code,
        html: String(componentEditor.value.html || ''),
        css: String(componentEditor.value.css || ''),
        js: String(componentEditor.value.js || ''),
      };
    }

    function buildRuntime(targetWindow, mountEl, cssIsolation, code, html, css, js) {
      let instance = null;
      let styleEl = null;
      let localStyles = [];

      const created = {
        async create(props, options) {
          created.destroy();
          const doc = targetWindow.document;
          const root = (options && options.mountEl) || mountEl;
          const tpl = doc.createElement('template');
          tpl.innerHTML = String(html || '');

          const host = doc.createElement('div');
          host.dataset.previewCode = code;
          host.appendChild(tpl.content.cloneNode(true));

          // Check if we're already inside a shadow DOM (top-frame mode)
          const existingShadowRoot = mountEl.getRootNode?.();
          const isInShadow = existingShadowRoot instanceof targetWindow.ShadowRoot;
          
          if (css && ((options && options.cssIsolation) === 'shadow' || cssIsolation === 'shadow')) {
            if (isInShadow) {
              // We're already in a shadow DOM (top-frame mode), inject CSS there
              const style = doc.createElement('style');
              style.textContent = String(css || '');
              existingShadowRoot.appendChild(style);
              localStyles.push(style);
              root.appendChild(host);
              instance = { rootEl: host, templateRootEl: host };
            } else {
              // Create new shadow DOM (iframe mode)
              const shadowHost = doc.createElement('div');
              const shadow = shadowHost.attachShadow({ mode: 'open' });
              const style = doc.createElement('style');
              style.textContent = String(css || '');
              shadow.appendChild(style);
              shadow.appendChild(host);
              root.appendChild(shadowHost);
              instance = { rootEl: shadowHost, templateRootEl: shadow };
            }
          } else {
            if (css) {
              if (isInShadow) {
                // Inject CSS into existing shadow DOM for top-frame non-shadow mode
                const style = doc.createElement('style');
                style.textContent = String(css || '');
                existingShadowRoot.appendChild(style);
                localStyles.push(style);
              } else {
                // Inject into document head for iframe mode
                styleEl = doc.createElement('style');
                styleEl.textContent = String(css || '');
                doc.head.appendChild(styleEl);
              }
            }
            root.appendChild(host);
            instance = { rootEl: host, templateRootEl: host };
          }

          const api = {
            unmount: created.destroy,
            mountEl: root,
            hostEl: instance.rootEl,
            shadowRoot: instance.templateRootEl instanceof targetWindow.ShadowRoot ? instance.templateRootEl : null,
          };

          const fn = new targetWindow.Function('api', 'templateRootEl', 'props', String(js || ''));
          const exported = fn(api, instance.templateRootEl, props || {}) || {};
          instance.api = api;
          instance.exported = exported;
          return Object.assign({ api }, exported);
        },
        destroy() {
          if (instance && instance.rootEl && instance.rootEl.remove) instance.rootEl.remove();
          if (styleEl && styleEl.remove) styleEl.remove();
          localStyles.forEach((s) => {
            if (s && s.remove) s.remove();
          });
          localStyles = [];
          instance = null;
          styleEl = null;
        },
        get instance() {
          return instance;
        },
      };

      return created;
    }

    function cleanup() {
      if (runtime) runtime.destroy();
      runtime = null;
      if (previewTopMountRef.value) previewTopMountRef.value.innerHTML = '';
      if (previewIframeRef.value && previewMode.value === 'iframe') {
        const doc = previewIframeRef.value.contentDocument;
        if (doc && doc.body) doc.body.innerHTML = '';
      }
      topHost = null;
    }

    async function buildTopRuntime() {
      await nextTick();
      if (!previewTopMountRef.value) throw new Error('Top preview mount not ready');

      previewTopMountRef.value.innerHTML = '';
      topHost = document.createElement('div');
      topHost.className = 'h-full w-full';
      const shadow = topHost.attachShadow({ mode: 'open' });
      const wrapper = document.createElement('div');
      wrapper.style.height = '100%';
      wrapper.style.padding = '12px';
      wrapper.style.overflow = 'auto';
      const mount = document.createElement('div');
      wrapper.appendChild(mount);
      shadow.appendChild(wrapper);
      previewTopMountRef.value.appendChild(topHost);

      const c = getEditorComponent();
      runtime = buildRuntime(window, mount, previewCssIsolation.value, c.code, c.html, c.css, c.js);
    }

    async function buildTopNoIsolationRuntime() {
      await nextTick();
      if (!previewTopMountRef.value) throw new Error('Top preview mount not ready');

      previewTopMountRef.value.innerHTML = '';
      const mount = document.createElement('div');
      mount.className = 'h-full w-full p-3 overflow-auto';
      previewTopMountRef.value.appendChild(mount);

      const c = getEditorComponent();
      runtime = buildRuntime(window, mount, previewCssIsolation.value, c.code, c.html, c.css, c.js);
    }

    async function buildIframeRuntime() {
      await nextTick();
      const iframe = previewIframeRef.value;
      if (!iframe) throw new Error('Iframe preview not ready');

      iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:12px;background:#f9fafb;"><div id="preview-root"></div></body></html>';
      await new Promise((resolve) => { iframe.onload = () => resolve(); });

      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      const mount = doc.getElementById('preview-root');
      const c = getEditorComponent();
      runtime = buildRuntime(win, mount, previewCssIsolation.value, c.code, c.html, c.css, c.js);
    }

    async function run() {
      try {
        previewStatus.value = 'running';
        cleanup();

        if (!String(componentEditor.value.html || '').trim() && !String(componentEditor.value.js || '').trim()) {
          previewStatus.value = 'idle';
          pushLog('[preview] editor empty');
          return;
        }

        if (previewMode.value === 'top') {
          await buildTopRuntime();
        } else if (previewMode.value === 'top-no-isolation') {
          await buildTopNoIsolationRuntime();
        } else {
          await buildIframeRuntime();
        }

        const instance = await runtime.create(parseProps(), { cssIsolation: previewCssIsolation.value });
        pushLog('[preview] mounted', { mode: previewMode.value, code: getEditorComponent().code, methods: Object.keys(instance || {}) });
        previewStatus.value = 'ready';
      } catch (e) {
        previewStatus.value = 'error';
        pushLog('[preview:error]', e.message);
        showToast(e.message, 'error');
      }
    }

    function reset() {
      cleanup();
      previewStatus.value = 'idle';
      pushLog('[preview] reset');
    }

    function apiFacade() {
      return {
        create: async (props, options) => {
          if (!runtime) throw new Error('Preview runtime not initialized. Click Run Preview first.');
          return runtime.create(props || {}, options || { cssIsolation: previewCssIsolation.value });
        },
        destroy: () => {
          if (runtime) runtime.destroy();
          return true;
        },
        getInstance: () => (runtime ? runtime.instance : null),
        mode: previewMode.value,
      };
    }

    async function runCommand(commandText) {
      if (!runtime) await run();
      const cmd = String(commandText || '').trim();
      if (!cmd) return undefined;
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const runner = new AsyncFunction('uiCmp', 'log', 'state', cmd);
      const result = await runner(apiFacade(), (...args) => pushLog('[cmd]', ...args), {
        mode: previewMode.value,
        cssIsolation: previewCssIsolation.value,
      });
      if (result !== undefined) pushLog('[result]', result);
      return result;
    }

    async function toggleFullscreen() {
      const el = previewContainerRef.value;
      if (!el) return;
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    }

    return {
      run,
      reset,
      cleanup,
      clearLogs,
      pushLog,
      runCommand,
      toggleFullscreen,
    };
  }

  window.AdminUiComponentsPreview = {
    createManager,
  };
})();
