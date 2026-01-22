(() => {
  // sdk/ui-components/browser/src/index.js
  (function() {
    function toStr(v) {
      return v === void 0 || v === null ? "" : String(v);
    }
    function normalizeApiUrl(apiUrl) {
      const u = toStr(apiUrl).trim();
      if (!u) return "";
      return u.replace(/\/$/, "");
    }
    function buildHeaders(apiKey) {
      const headers = {};
      const key = toStr(apiKey).trim();
      if (key) headers["x-project-key"] = key;
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
        const msg = data && data.error ? data.error : "Request failed";
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      return data;
    }
    function ensureTemplate(code, html) {
      const id = "ui-cmp-" + code;
      let tpl = document.getElementById(id);
      if (!tpl) {
        tpl = document.createElement("template");
        tpl.id = id;
        document.body.appendChild(tpl);
      }
      tpl.innerHTML = toStr(html);
      return tpl;
    }
    function injectCssScoped(code, cssText) {
      const id = "ui-cmp-style-" + code;
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("style");
        el.id = id;
        document.head.appendChild(el);
      }
      el.textContent = toStr(cssText);
    }
    function createShadowRootContainer() {
      const host = document.createElement("div");
      host.style.all = "initial";
      const shadow = host.attachShadow({ mode: "open" });
      return { host, shadow };
    }
    function defaultMountTarget() {
      return document.body;
    }
    function compileComponentJs(jsCode) {
      const code = toStr(jsCode);
      if (!code.trim()) {
        return function() {
          return {};
        };
      }
      return new Function("api", "templateRootEl", "props", code);
    }
    const state = {
      initialized: false,
      projectId: null,
      apiKey: null,
      apiUrl: "",
      cssIsolation: "scoped",
      components: {}
    };
    function registerComponent(def) {
      const code = toStr(def.code).trim().toLowerCase();
      if (!code) return;
      const version = def.version;
      const html = def.html;
      const js = def.js;
      const css = def.css;
      ensureTemplate(code, html);
      const component = {
        code,
        version,
        css,
        js,
        create: function(props, options) {
          const opts = options || {};
          const mountEl = opts.mountEl || defaultMountTarget();
          const isolation = opts.cssIsolation || state.cssIsolation;
          const tpl = ensureTemplate(code, html);
          const fragment = tpl.content.cloneNode(true);
          let templateRootEl;
          let instanceRoot;
          let shadow = null;
          if (isolation === "shadow") {
            const c = createShadowRootContainer();
            instanceRoot = c.host;
            shadow = c.shadow;
            templateRootEl = shadow;
            if (css) {
              const style = document.createElement("style");
              style.textContent = toStr(css);
              shadow.appendChild(style);
            }
            shadow.appendChild(fragment);
          } else {
            instanceRoot = document.createElement("div");
            templateRootEl = instanceRoot;
            if (css) injectCssScoped(code, css);
            instanceRoot.appendChild(fragment);
          }
          mountEl.appendChild(instanceRoot);
          const api = {
            unmount: function() {
              try {
                instanceRoot.remove();
              } catch {
              }
            },
            mountEl,
            hostEl: instanceRoot,
            shadowRoot: shadow
          };
          const fn = compileComponentJs(js);
          let exported = {};
          try {
            exported = fn(api, templateRootEl, props || {}) || {};
          } catch (e) {
            exported = {
              error: e
            };
          }
          return Object.assign({ api }, exported);
        }
      };
      state.components[code] = component;
      uiCmp[code] = component;
      uiComponents[code] = component;
    }
    async function init(options) {
      const opts = options || {};
      const projectId = toStr(opts.projectId).trim();
      if (!projectId) throw new Error("projectId is required");
      const apiUrl = normalizeApiUrl(opts.apiUrl);
      const apiKey = opts.apiKey;
      state.projectId = projectId;
      state.apiKey = apiKey;
      state.apiUrl = apiUrl;
      const cssIsolation = toStr(opts.cssIsolation || "scoped").trim().toLowerCase();
      state.cssIsolation = cssIsolation === "shadow" ? "shadow" : "scoped";
      const base = state.apiUrl;
      const url = base + "/api/ui-components/projects/" + encodeURIComponent(projectId) + "/manifest";
      const data = await fetchJson(url, buildHeaders(apiKey));
      const items = data && Array.isArray(data.components) ? data.components : [];
      for (const def of items) {
        registerComponent(def);
      }
      state.initialized = true;
      return { project: data ? data.project : null, count: items.length };
    }
    async function load(code) {
      const c = toStr(code).trim().toLowerCase();
      if (!c) throw new Error("code is required");
      if (!state.projectId) throw new Error("uiCmp not initialized");
      if (state.components[c]) return state.components[c];
      const base = state.apiUrl;
      const url = base + "/api/ui-components/projects/" + encodeURIComponent(state.projectId) + "/components/" + encodeURIComponent(c);
      const data = await fetchJson(url, buildHeaders(state.apiKey));
      if (!data || !data.component) throw new Error("Component not found");
      registerComponent(data.component);
      return state.components[c];
    }
    const uiCmp = {
      init,
      load,
      _state: state
    };
    const uiComponents = uiCmp;
    window.uiCmp = uiCmp;
    window.uiComponents = uiComponents;
  })();
})();
