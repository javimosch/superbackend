(function () {
  // Only initialize if Vue has indicated it's ready (prevents premature execution in Vue contexts)
  if (typeof window !== 'undefined' && window.__llmProviderModelPickerReady === true) {
    initializeLlmProviderModelPicker();
  } else if (typeof window !== 'undefined') {
    // Queue initialization for when Vue indicates readiness
    window.__llmProviderModelPickerQueue = window.__llmProviderModelPickerQueue || [];
    window.__llmProviderModelPickerQueue.push(initializeLlmProviderModelPicker);
  }

  function initializeLlmProviderModelPicker() {
    if (!window.__llmProviderModelPicker) {
      window.__llmProviderModelPicker = { instances: {} };
    }

    function safeJsonParse(raw, fallback) {
      try {
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    }

    async function fetchJson(url) {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Request failed');
      }
      return data;
    }

    function setDatalistOptions(datalistEl, items) {
      datalistEl.innerHTML = '';
      const uniq = Array.from(new Set((items || []).filter(Boolean)));
      for (const item of uniq) {
        const opt = document.createElement('option');
        opt.value = String(item);
        datalistEl.appendChild(opt);
      }
    }

    function trim(v) {
      return String(v || '').trim();
    }

    function isOpenRouterProvider({ providerKey, providerConfig }) {
      const pk = String(providerKey || '').trim().toLowerCase();
      if (pk === 'openrouter') return true;

      const baseUrl = providerConfig && typeof providerConfig === 'object'
        ? String(providerConfig.baseUrl || providerConfig.baseURL || '').trim().toLowerCase()
        : '';

      return Boolean(baseUrl && baseUrl.includes('openrouter'));
    }

    function getInstanceKey({ providerInputId, modelInputId }) {
      return `${String(providerInputId || '').trim()}::${String(modelInputId || '').trim()}`;
    }

    function getOrCreateInstance(opts) {
      const key = getInstanceKey(opts);
      const existing = window.__llmProviderModelPicker.instances[key];
      if (existing) {
        console.log('[LLM Picker Debug] Using existing instance:', key, 'apiBase:', existing.apiBase);
        return existing;
      }

      const apiBase = opts.apiBase !== undefined ? opts.apiBase : (window.__llmProviderModelPicker.defaultApiBase || null);
      console.log('[LLM Picker Debug] Creating new instance:', key, 'opts.apiBase:', opts.apiBase, 'defaultApiBase:', window.__llmProviderModelPicker.defaultApiBase, 'final apiBase:', apiBase);
      
      const inst = {
        apiBase: apiBase,
        providerInputId: opts.providerInputId,
        modelInputId: opts.modelInputId,
        providers: {},
        providerModels: {},
      };

      window.__llmProviderModelPicker.instances[key] = inst;
      return inst;
    }

    async function loadConfig(inst) {
      const url = `${inst.apiBase}/api/admin/llm/config`;
      console.log('[LLM Picker Debug] loadConfig called with apiBase:', inst.apiBase, 'full URL:', url);
      const data = await fetchJson(url);
      inst.providers = data.providers || {};
      inst.providerModels = data.providerModels || {};
      return data;
    }

    function renderProviderOptions(inst) {
      const providerInput = document.getElementById(inst.providerInputId);
      const providerList = document.getElementById(`${inst.providerInputId}__datalist`);
      if (!providerInput || !providerList) return;

      const providerKeys = Object.keys(inst.providers || {}).sort();
      setDatalistOptions(providerList, providerKeys);
    }

    function renderModelOptions(inst) {
      const providerInput = document.getElementById(inst.providerInputId);
      const modelList = document.getElementById(`${inst.modelInputId}__datalist`);
      if (!providerInput || !modelList) return;

      const providerKey = trim(providerInput.value);
      const models = providerKey && inst.providerModels && typeof inst.providerModels === 'object'
        ? inst.providerModels[providerKey]
        : null;

      setDatalistOptions(modelList, Array.isArray(models) ? models : []);
    }

    async function maybeAutoFetchOpenRouterModels(inst) {
      try {
        const providerInput = document.getElementById(inst.providerInputId);
        if (!providerInput) return;

        const providerKey = trim(providerInput.value);
        const providerConfig = inst.providers && typeof inst.providers === 'object' ? inst.providers[providerKey] : null;
        if (!isOpenRouterProvider({ providerKey, providerConfig })) return;

        const existing = inst.providerModels && typeof inst.providerModels === 'object' ? inst.providerModels.openrouter : null;
        if (Array.isArray(existing) && existing.length > 0) return;

        await fetchOpenRouterModels({
          apiBase: inst.apiBase,
          providerInputId: inst.providerInputId,
          modelInputId: inst.modelInputId,
        });
      } catch {
        // ignore
      }
    }

    async function fetchOpenRouterModels(opts) {
      console.log('[LLM Picker Debug] fetchOpenRouterModels called with opts:', opts);
      const inst = getOrCreateInstance(opts || {});
      console.log('[LLM Picker Debug] fetchOpenRouterModels - inst.apiBase before update:', inst.apiBase);
      inst.apiBase = (opts && opts.apiBase !== undefined) ? opts.apiBase : (inst.apiBase !== undefined ? inst.apiBase : (window.__llmProviderModelPicker.defaultApiBase || null));
      console.log('[LLM Picker Debug] fetchOpenRouterModels - inst.apiBase after update:', inst.apiBase);
      if (inst.apiBase == null) {
        console.error('[LLM Picker] No apiBase available for fetchOpenRouterModels');
        return;
      }

      const data = await fetchJson(`${inst.apiBase}/api/admin/llm/openrouter/models`);
      const models = Array.isArray(data?.models) ? data.models : [];

      inst.providerModels = inst.providerModels && typeof inst.providerModels === 'object' ? inst.providerModels : {};
      inst.providerModels.openrouter = models;
      renderModelOptions(inst);
    }

    async function init(opts) {
      console.log('[LLM Picker Debug] init called with opts:', opts);
      const inst = getOrCreateInstance(opts || {});

      if (opts && opts.apiBase) {
        console.log('[LLM Picker Debug] Setting apiBase to:', opts.apiBase);
        window.__llmProviderModelPicker.defaultApiBase = opts.apiBase;
        // Update apiBase for this instance and all existing instances
        inst.apiBase = opts.apiBase;
        // Update all existing instances to have the correct apiBase
        Object.values(window.__llmProviderModelPicker.instances).forEach(existingInst => {
          console.log('[LLM Picker Debug] Updating existing instance apiBase from', existingInst.apiBase, 'to', opts.apiBase);
          existingInst.apiBase = opts.apiBase;
        });
      }

      console.log('[LLM Picker Debug] About to call loadConfig, inst.apiBase:', inst.apiBase);
      await loadConfig(inst);
      renderProviderOptions(inst);
      renderModelOptions(inst);
      await maybeAutoFetchOpenRouterModels(inst);

      const providerInput = document.getElementById(inst.providerInputId);
      if (providerInput) {
        providerInput.addEventListener('change', async () => {
          renderModelOptions(inst);
          await maybeAutoFetchOpenRouterModels(inst);
        });
        providerInput.addEventListener('input', () => renderModelOptions(inst));
      }
    }

    window.__llmProviderModelPicker.init = init;
    window.__llmProviderModelPicker.fetchOpenRouterModels = fetchOpenRouterModels;
    window.__llmProviderModelPicker._util = { safeJsonParse };
  }
})();
