(() => {
  const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick, watch } = Vue;

  function withToast(fn, showToast) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        showToast(e.message, 'error');
        return null;
      }
    };
  }

  createApp({
    setup() {
      const cfg = window.__adminUiComponentsConfig || {};
      const baseUrl = String(cfg.baseUrl || '');
      const adminPath = String(cfg.adminPath || '/admin');
      const API_BASE = window.location.origin + baseUrl;

      const STORAGE_KEYS = {
        providerKey: 'uiComponents.ai.providerKey',
        model: 'uiComponents.ai.model',
        helpOpen: 'uiComponents.help.open',
      };

      const toast = ref({ show: false, message: '', type: 'success' });
      let toastTimer = null;
      const showToast = (message, type) => {
        toast.value = { show: true, message: String(message || ''), type: type || 'success' };
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          toast.value.show = false;
        }, 2500);
      };

      const api = async (path, options) => {
        const res = await fetch(baseUrl + path, {
          method: (options && options.method) || 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: options && options.body ? JSON.stringify(options.body) : undefined,
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        if (!res.ok) throw new Error((data && data.error) || ('Request failed: ' + res.status));
        return data;
      };

      const helpOpen = ref(false);
      const projects = ref([]);
      const components = ref([]);
      const selectedProject = ref(null);
      const assignments = ref([]);
      const lastGeneratedKey = ref('');
      const newProject = ref({ name: '', projectId: '', isPublic: true });
      const componentEditor = ref({ code: '', name: '', html: '', js: '', css: '', usageMarkdown: '' });

      const ai = ref({
        providerKey: localStorage.getItem(STORAGE_KEYS.providerKey) || '',
        model: localStorage.getItem(STORAGE_KEYS.model) || '',
        prompt: '',
        mode: 'minimal',
        targets: { html: true, css: true, js: true, usageMarkdown: true },
      });
      const aiLoading = ref(false);
      const aiProposal = ref(null);
      const aiWarnings = ref([]);

      const previewMode = ref('iframe');
      const previewCssIsolation = ref('scoped');
      const previewPropsJson = ref('{"message":"Hello from preview"}');
      const previewStatus = ref('idle');
      const previewLogs = ref([]);
      const previewCommand = ref('const i = await uiCmp.create({ message: "Hello" });\nlog("instance", i);');
      const previewFullscreen = ref(false);
      const previewContainerRef = ref(null);
      const previewTopMountRef = ref(null);
      const previewIframeRef = ref(null);
      const previewLogsText = computed(() => previewLogs.value.join('\n'));

      const previewManager = window.AdminUiComponentsPreview.createManager({
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
      });

      const loadHelpState = () => {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.helpOpen);
          if (raw === '1') helpOpen.value = true;
          if (raw === '0') helpOpen.value = false;
        } catch {}
      };

      const toggleHelp = () => {
        helpOpen.value = !helpOpen.value;
        try { localStorage.setItem(STORAGE_KEYS.helpOpen, helpOpen.value ? '1' : '0'); } catch {}
      };

      const persistAiSettings = () => {
        try {
          localStorage.setItem(STORAGE_KEYS.providerKey, String(ai.value.providerKey || ''));
          localStorage.setItem(STORAGE_KEYS.model, String(ai.value.model || ''));
        } catch {}
      };

      const syncAiPickerToVue = () => {
        const providerEl = document.getElementById('uiComponentsAiProviderKey');
        const modelEl = document.getElementById('uiComponentsAiModel');
        if (providerEl) providerEl.value = String(ai.value.providerKey || '');
        if (modelEl) modelEl.value = String(ai.value.model || '');
      };

      const wireAiPickerListeners = () => {
        const providerEl = document.getElementById('uiComponentsAiProviderKey');
        const modelEl = document.getElementById('uiComponentsAiModel');
        if (!providerEl || !modelEl || providerEl.dataset.wired === '1') return;
        providerEl.dataset.wired = '1';
        modelEl.dataset.wired = '1';
        const onProvider = () => { ai.value.providerKey = String(providerEl.value || ''); persistAiSettings(); };
        const onModel = () => { ai.value.model = String(modelEl.value || ''); persistAiSettings(); };
        providerEl.addEventListener('input', onProvider);
        providerEl.addEventListener('change', onProvider);
        modelEl.addEventListener('input', onModel);
        modelEl.addEventListener('change', onModel);
      };

      const initAiPicker = async () => {
        if (!window.__llmProviderModelPicker || !window.__llmProviderModelPicker.init) return;
        await window.__llmProviderModelPicker.init({
          apiBase: baseUrl,
          providerInputId: 'uiComponentsAiProviderKey',
          modelInputId: 'uiComponentsAiModel',
        });
        syncAiPickerToVue();
        wireAiPickerListeners();
      };

      const loadLlmConfig = withToast(async () => {
        await initAiPicker();
        showToast('LLM config reloaded', 'success');
      }, showToast);

      const refreshProjects = async () => {
        const data = await api('/api/admin/ui-components/projects');
        projects.value = data && data.items ? data.items : [];
      };
      const refreshComponents = async () => {
        const data = await api('/api/admin/ui-components/components');
        components.value = data && data.items ? data.items : [];
      };
      const refreshAssignments = async (projectId) => {
        const data = await api('/api/admin/ui-components/projects/' + encodeURIComponent(projectId) + '/components');
        assignments.value = data && data.items ? data.items : [];
      };

      const refreshAllCore = async () => {
        await Promise.all([refreshProjects(), refreshComponents()]);
        if (selectedProject.value) await refreshAssignments(selectedProject.value.projectId);
      };

      const refreshAll = withToast(async () => {
        await refreshAllCore();
        showToast('Refreshed', 'success');
      }, showToast);

      const createProject = withToast(async () => {
        lastGeneratedKey.value = '';
        const data = await api('/api/admin/ui-components/projects', {
          method: 'POST',
          body: {
            name: newProject.value.name,
            projectId: newProject.value.projectId || undefined,
            isPublic: Boolean(newProject.value.isPublic),
          },
        });
        if (data && data.apiKey) lastGeneratedKey.value = data.apiKey;
        newProject.value = { name: '', projectId: '', isPublic: true };
        await refreshProjects();
        showToast('Project created', 'success');
      }, showToast);

      const selectProject = withToast(async (p) => {
        lastGeneratedKey.value = '';
        selectedProject.value = { ...p };
        await refreshAssignments(p.projectId);
      }, showToast);

      const isAssigned = (code) => assignments.value.some((a) => a.componentCode === code && a.enabled);

      const toggleAssignment = withToast(async (code, enabled) => {
        if (!selectedProject.value) return;
        const url = '/api/admin/ui-components/projects/' + encodeURIComponent(selectedProject.value.projectId) + '/components/' + encodeURIComponent(code);
        if (enabled) await api(url, { method: 'POST', body: { enabled: true } });
        else await api(url, { method: 'DELETE' });
        await refreshAssignments(selectedProject.value.projectId);
        showToast('Updated assignment', 'success');
      }, showToast);

      const toggleProjectPublic = withToast(async () => {
        lastGeneratedKey.value = '';
        const data = await api('/api/admin/ui-components/projects/' + encodeURIComponent(selectedProject.value.projectId), {
          method: 'PUT',
          body: { isPublic: Boolean(selectedProject.value.isPublic) },
        });
        if (data && data.apiKey) lastGeneratedKey.value = data.apiKey;
        await refreshAllCore();
        showToast('Project updated', 'success');
      }, showToast);

      const rotateKey = withToast(async () => {
        lastGeneratedKey.value = '';
        const data = await api('/api/admin/ui-components/projects/' + encodeURIComponent(selectedProject.value.projectId) + '/rotate-key', { method: 'POST' });
        if (data && data.apiKey) lastGeneratedKey.value = data.apiKey;
        showToast('Key rotated', 'success');
      }, showToast);

      const clearComponentEditor = () => {
        componentEditor.value = { code: '', name: '', html: '', js: '', css: '', usageMarkdown: '' };
      };

      const loadComponentIntoEditor = withToast(async (code) => {
        const data = await api('/api/admin/ui-components/components/' + encodeURIComponent(code));
        const c = data && data.item ? data.item : null;
        if (!c) return;
        aiProposal.value = null;
        aiWarnings.value = [];
        componentEditor.value = {
          code: c.code || '',
          name: c.name || '',
          html: c.html || '',
          js: c.js || '',
          css: c.css || '',
          usageMarkdown: c.usageMarkdown || '',
        };
        await previewManager.run();
      }, showToast);

      const saveComponent = withToast(async () => {
        const code = String(componentEditor.value.code || '').trim().toLowerCase();
        if (!code) throw new Error('code is required');
        const payload = {
          code,
          name: componentEditor.value.name,
          html: componentEditor.value.html,
          js: componentEditor.value.js,
          css: componentEditor.value.css,
          usageMarkdown: componentEditor.value.usageMarkdown,
        };
        if (components.value.find((c) => c.code === code)) {
          await api('/api/admin/ui-components/components/' + encodeURIComponent(code), { method: 'PUT', body: payload });
        } else {
          await api('/api/admin/ui-components/components', { method: 'POST', body: payload });
        }
        await refreshAllCore();
        showToast('Component saved', 'success');
      }, showToast);

      const aiPropose = withToast(async () => {
        const code = String(componentEditor.value.code || '').trim().toLowerCase();
        const prompt = String(ai.value.prompt || '').trim();
        if (!code) throw new Error('Select or enter a component code first');
        if (!prompt) throw new Error('Prompt is required');
        persistAiSettings();
        aiLoading.value = true;
        aiProposal.value = null;
        aiWarnings.value = [];
        const data = await api('/api/admin/ui-components/ai/components/' + encodeURIComponent(code) + '/propose', {
          method: 'POST',
          body: {
            prompt,
            providerKey: ai.value.providerKey || undefined,
            model: ai.value.model || undefined,
            targets: ai.value.targets,
            mode: ai.value.mode,
          },
        });
        aiProposal.value = data && data.proposal ? data.proposal : null;
        aiWarnings.value = aiProposal.value && Array.isArray(aiProposal.value.warnings) ? aiProposal.value.warnings : [];
        showToast('AI proposal ready', 'success');
        aiLoading.value = false;
      }, showToast);

      const aiApply = () => {
        if (!aiProposal.value || !aiProposal.value.fields) return;
        const f = aiProposal.value.fields;
        if (f.html !== undefined) componentEditor.value.html = f.html;
        if (f.css !== undefined) componentEditor.value.css = f.css;
        if (f.js !== undefined) componentEditor.value.js = f.js;
        if (f.usageMarkdown !== undefined) componentEditor.value.usageMarkdown = f.usageMarkdown;
        showToast('Applied proposal into editor (click Save to persist)', 'success');
      };

      const runPreview = withToast(() => previewManager.run(), showToast);
      const resetPreview = () => previewManager.reset();
      const clearPreviewLogs = () => previewManager.clearLogs();
      const runPreviewCommand = withToast(() => previewManager.runCommand(previewCommand.value), showToast);
      const togglePreviewFullscreen = withToast(() => previewManager.toggleFullscreen(), showToast);

      const setPreviewCommandExample = (kind) => {
        const code = String(componentEditor.value.code || '').trim().toLowerCase();
        const component = components.value.find((c) => c.code === code);

        console.log('setPreviewCommandExample',{
          component,
          kind
        })

        if (kind === 'create') {
          if (component?.previewExample) {
            previewCommand.value = component.previewExample;
          } else {
            previewCommand.value = 'const instance = await uiCmp.create({ message: "Hello from command" });\nlog("created", Object.keys(instance || {}));';
          }
        } else if (kind === 'call') {
          if (component?.code === 'sui_alert') {
            previewCommand.value = 'const i = uiCmp.getInstance();\nif (!i || !i.exported) { log("No instance"); return; }\nif (typeof i.exported.show === "function") i.exported.show("Title", "Message");\nlog("called show() if present");';
          } else if (component?.code === 'sui_toast') {
            previewCommand.value = 'const i = uiCmp.getInstance();\nif (!i || !i.exported) { log("No instance"); return; }\nif (typeof i.exported.info === "function") i.exported.info("Info", "Message");\nlog("called info() if present");';
          } else {
            previewCommand.value = 'const i = uiCmp.getInstance();\nif (!i || !i.exported) { log("No instance"); return; }\nif (typeof i.exported.show === "function") i.exported.show();\nlog("called show() if present");';
          }
        } else {
          previewCommand.value = 'uiCmp.destroy();\nlog("destroyed")';
        }
      };

      const onFullscreenChange = () => {
        previewFullscreen.value = Boolean(document.fullscreenElement && document.fullscreenElement === previewContainerRef.value);
      };

      watch(previewMode, async () => {
        resetPreview();
      });

      onMounted(async () => {
        await refreshAllCore();
        await initAiPicker();
        // Indicate that Vue is ready and process any queued LLM picker initializations
        window.__llmProviderModelPickerReady = true;
        if (window.__llmProviderModelPickerQueue && Array.isArray(window.__llmProviderModelPickerQueue)) {
          window.__llmProviderModelPickerQueue.forEach(fn => {
            try { fn(); } catch (_) {}
          });
          window.__llmProviderModelPickerQueue = [];
        }
      });

      return {
        baseUrl,
        adminPath,
        toast,
        helpOpen,
        projects,
        components,
        selectedProject,
        assignments,
        lastGeneratedKey,
        newProject,
        componentEditor,
        toggleHelp,
        ai,
        aiLoading,
        aiProposal,
        aiWarnings,
        refreshAll,
        createProject,
        selectProject,
        isAssigned,
        toggleAssignment,
        toggleProjectPublic,
        rotateKey,
        clearComponentEditor,
        loadComponentIntoEditor,
        saveComponent,
        aiPropose,
        aiApply,
        loadLlmConfig,
        previewMode,
        previewCssIsolation,
        previewPropsJson,
        previewStatus,
        previewCommand,
        previewLogsText,
        previewFullscreen,
        previewContainerRef,
        previewTopMountRef,
        previewIframeRef,
        runPreview,
        resetPreview,
        runPreviewCommand,
        clearPreviewLogs,
        setPreviewCommandExample,
        togglePreviewFullscreen,
      };
    },
  }).mount('#app');
})();
