(() => {
  const { createApp, ref, computed, onBeforeUnmount } = Vue;

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
      const cfg = window.__adminSuperDemosConfig || {};
      const baseUrl = String(cfg.baseUrl || '');
      const API_BASE = window.location.origin + baseUrl;

      const origin = computed(() => window.location.origin);
      const qaPageUrl = computed(() => `${window.location.origin}${baseUrl}/superdemos-qa.html`);

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
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        if (!res.ok) throw new Error((data && data.error) || ('Request failed: ' + res.status));
        return data;
      };

      const projects = ref([]);
      const selectedProject = ref(null);
      const demos = ref([]);
      const selectedDemo = ref(null);
      const steps = ref([]);

      const lastGeneratedKey = ref('');

      const newProject = ref({ name: '', projectId: '', isPublic: true });
      const newDemo = ref({ name: '', startUrlPattern: '' });
      const projectStylePreset = ref('default');
      const projectStyleOverrides = ref('');

      const lastSelection = ref(null);

      const authoring = ref({
        targetUrl: '',
        sessionId: '',
        token: '',
        connectUrl: '',
        wsStatus: 'disconnected',
      });

      let ws = null;

      function closeWs() {
        try {
          if (ws) ws.close();
        } catch {}
        ws = null;
        authoring.value.wsStatus = 'disconnected';
      }

      function connectWs(sessionId, token) {
        closeWs();

        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}${baseUrl}/api/superdemos/ws?sessionId=${encodeURIComponent(
          sessionId,
        )}&role=admin&token=${encodeURIComponent(token)}`;

        ws = new WebSocket(wsUrl);
        authoring.value.wsStatus = 'connecting';

        ws.addEventListener('open', () => {
          authoring.value.wsStatus = 'connected';
        });

        ws.addEventListener('close', () => {
          authoring.value.wsStatus = 'disconnected';
        });

        ws.addEventListener('error', () => {
          authoring.value.wsStatus = 'error';
        });

        ws.addEventListener('message', (evt) => {
          let msg;
          try {
            msg = JSON.parse(String(evt.data || ''));
          } catch {
            return;
          }

          if (msg.type === 'select' && msg.element) {
            lastSelection.value = msg.element;
          }

          if (msg.type === 'hover' && msg.element && !lastSelection.value) {
            // helpful for first feedback
            lastSelection.value = msg.element;
          }
        });
      }

      const refreshProjects = async () => {
        const data = await api('/api/admin/superdemos/projects');
        const items = Array.isArray(data && data.items) ? data.items : [];
        projects.value = items
          .filter(Boolean)
          .map((p) => ({
            ...p,
            projectId: String((p && p.projectId) || ''),
            name: String((p && p.name) || ''),
            isPublic: Boolean(p && p.isPublic),
          }))
          .filter((p) => p.projectId);
      };

      const refreshDemos = async (projectId) => {
        const data = await api('/api/admin/superdemos/projects/' + encodeURIComponent(projectId) + '/demos');
        const items = Array.isArray(data && data.items) ? data.items : [];
        demos.value = items
          .filter(Boolean)
          .map((d) => ({
            ...d,
            demoId: String((d && d.demoId) || ''),
            name: String((d && d.name) || ''),
            status: String((d && d.status) || 'draft'),
            publishedVersion: Number((d && d.publishedVersion) || 0),
          }))
          .filter((d) => d.demoId);
      };

      const refreshSteps = async (demoId) => {
        const data = await api('/api/admin/superdemos/demos/' + encodeURIComponent(demoId) + '/steps');
        const items = (data && data.items) || [];
        steps.value = items.map((s) => ({
          selector: s.selector,
          selectorHints: s.selectorHints || null,
          message: s.message,
          placement: s.placement || 'auto',
          waitFor: s.waitFor || null,
          advance: s.advance || { type: 'manualNext' },
        }));
      };

      const refreshAll = withToast(async () => {
        await refreshProjects();
        if (selectedProject.value) await refreshDemos(selectedProject.value.projectId);
        if (selectedDemo.value) await refreshSteps(selectedDemo.value.demoId);
        showToast('Refreshed', 'success');
      }, showToast);

      const saveProjectStyleSettings = withToast(async () => {
        if (!selectedProject.value) return;
        const data = await api('/api/admin/superdemos/projects/' + encodeURIComponent(selectedProject.value.projectId), {
          method: 'PUT',
          body: {
            stylePreset: projectStylePreset.value || 'default',
            styleOverrides: projectStyleOverrides.value || '',
          },
        });
        selectedProject.value = { ...data.item };
        showToast('Project style settings saved', 'success');
      }, showToast);

      const copyText = async (text, label) => {
        const v = String(text || '');
        if (!v) {
          showToast('Nothing to copy', 'error');
          return;
        }
        try {
          await navigator.clipboard.writeText(v);
          showToast(`${label || 'Value'} copied`, 'success');
        } catch {
          showToast('Clipboard copy failed', 'error');
        }
      };

      const createProject = withToast(async () => {
        lastGeneratedKey.value = '';
        const data = await api('/api/admin/superdemos/projects', {
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
        selectedProject.value = { ...p };
        projectStylePreset.value = String(p.stylePreset || 'default');
        projectStyleOverrides.value = String(p.styleOverrides || '');
        selectedDemo.value = null;
        demos.value = [];
        steps.value = [];
        closeWs();
        authoring.value = { targetUrl: '', sessionId: '', token: '', connectUrl: '', wsStatus: 'disconnected' };
        lastSelection.value = null;
        await refreshDemos(p.projectId);
      }, showToast);

      const createDemo = withToast(async () => {
        if (!selectedProject.value) return;
        const data = await api(
          '/api/admin/superdemos/projects/' + encodeURIComponent(selectedProject.value.projectId) + '/demos',
          {
            method: 'POST',
            body: {
              name: newDemo.value.name,
              startUrlPattern: newDemo.value.startUrlPattern || null,
            },
          },
        );
        newDemo.value = { name: '', startUrlPattern: '' };
        await refreshDemos(selectedProject.value.projectId);
        showToast('Demo created', 'success');
        return data;
      }, showToast);

      const selectDemo = withToast(async (d) => {
        selectedDemo.value = { ...d };
        steps.value = [];
        closeWs();
        authoring.value = { targetUrl: '', sessionId: '', token: '', connectUrl: '', wsStatus: 'disconnected' };
        lastSelection.value = null;
        await refreshSteps(d.demoId);
      }, showToast);

      const publishDemo = withToast(async () => {
        if (!selectedDemo.value) return;
        const data = await api('/api/admin/superdemos/demos/' + encodeURIComponent(selectedDemo.value.demoId) + '/publish', {
          method: 'POST',
        });
        await refreshDemos(selectedProject.value.projectId);
        selectedDemo.value = data.item;
        showToast('Published', 'success');
      }, showToast);

      const saveSteps = withToast(async () => {
        if (!selectedDemo.value) return;
        await api('/api/admin/superdemos/demos/' + encodeURIComponent(selectedDemo.value.demoId) + '/steps', {
          method: 'PUT',
          body: {
            steps: steps.value.map((s) => ({
              selector: s.selector,
              selectorHints: s.selectorHints || null,
              message: s.message,
              placement: s.placement || 'auto',
              waitFor: s.waitFor || null,
              advance: s.advance || { type: 'manualNext' },
            })),
          },
        });
        showToast('Steps saved', 'success');
      }, showToast);

      const removeStep = (idx) => {
        steps.value = steps.value.filter((_, i) => i !== idx);
      };

      const moveStep = (idx, delta) => {
        const next = idx + delta;
        if (next < 0 || next >= steps.value.length) return;
        const copy = [...steps.value];
        const [item] = copy.splice(idx, 1);
        copy.splice(next, 0, item);
        steps.value = copy;
      };

      const addStepFromSelection = () => {
        if (!lastSelection.value) {
          showToast('No selection from SDK yet', 'error');
          return;
        }
        steps.value = [
          ...steps.value,
          {
            selector: String(lastSelection.value.selector || ''),
            selectorHints: lastSelection.value.hints || null,
            message: '...',
            placement: 'auto',
            waitFor: null,
            advance: { type: 'manualNext' },
          },
        ];
      };

      const startAuthoring = withToast(async () => {
        if (!selectedDemo.value) return;
        const data = await api('/api/admin/superdemos/authoring-sessions', {
          method: 'POST',
          body: {
            demoId: selectedDemo.value.demoId,
            targetUrl: authoring.value.targetUrl,
          },
        });

        authoring.value.sessionId = data.sessionId;
        authoring.value.token = data.token;
        authoring.value.connectUrl = data.connectUrl;

        connectWs(data.sessionId, data.token);
        showToast('Authoring session created', 'success');
      }, showToast);

      const setQaTargetUrl = () => {
        authoring.value.targetUrl = qaPageUrl.value;
        showToast('Target URL set to QA page', 'success');
      };

      const previewStep = (step) => {
        if (!ws || ws.readyState !== ws.OPEN) {
          showToast('WS not connected', 'error');
          return;
        }
        const s = step || {};
        ws.send(
          JSON.stringify({
            type: 'preview_bubble',
            selector: s.selector,
            message: s.message,
            placement: s.placement || 'auto',
          }),
        );
      };

      refreshAll().catch(() => {});

      onBeforeUnmount(() => {
        closeWs();
      });

      return {
        origin,
        qaPageUrl,
        toast,
        projects,
        selectedProject,
        demos,
        selectedDemo,
        steps,
        newProject,
        newDemo,
        projectStylePreset,
        projectStyleOverrides,
        createProject,
        refreshAll,
        selectProject,
        createDemo,
        selectDemo,
        publishDemo,
        saveSteps,
        removeStep,
        moveStep,
        authoring,
        startAuthoring,
        setQaTargetUrl,
        saveProjectStyleSettings,
        copyText,
        lastGeneratedKey,
        lastSelection,
        addStepFromSelection,
        previewStep,
      };
    },
  }).mount('#app');
})();
