export function createErrorTrackingClient(options) {
  const state = {
    initialized: false,
    config: {
      endpoint: '/api/log/error',
      headers: {},
      getAuthHeader: null,
      maxErrorsPerSession: 50,
      debounceMs: 1000,
      sampleRatePercent: 100,
      ...(options || {}),
    },
    errorCount: 0,
    lastErrorTime: 0,
    lastErrorFingerprint: '',
    originalFetch: null,
  };

  function randomInt0_99() {
    return Math.floor(Math.random() * 100);
  }

  function shouldSample() {
    const pct = Number(state.config.sampleRatePercent);
    if (!Number.isFinite(pct)) return true;
    if (pct >= 100) return true;
    if (pct <= 0) return false;
    return randomInt0_99() < pct;
  }

  function computeFingerprint(errorName, message, url) {
    return `${errorName || ''}|${String(message || '').slice(0, 120)}|${url || ''}`;
  }

  function shouldReport(fingerprint) {
    if (!shouldSample()) return false;

    const now = Date.now();

    if (state.errorCount >= state.config.maxErrorsPerSession) {
      return false;
    }

    if (fingerprint === state.lastErrorFingerprint && (now - state.lastErrorTime) < state.config.debounceMs) {
      return false;
    }

    state.lastErrorFingerprint = fingerprint;
    state.lastErrorTime = now;
    state.errorCount += 1;

    return true;
  }

  function getRuntime() {
    let appVersion = '';
    try {
      const meta = document.querySelector('meta[name="app-version"]');
      appVersion = meta && meta.content ? meta.content : '';
    } catch (e) {
      appVersion = '';
    }

    return {
      url: window.location.href,
      referrer: document.referrer || '',
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      locale: navigator.language || '',
      appVersion,
    };
  }

  function buildHeaders() {
    const headers = { ...(state.config.headers || {}) };

    const getter = state.config.getAuthHeader;
    if (typeof getter === 'function') {
      try {
        const auth = getter();
        if (auth) headers.authorization = auth;
      } catch (e) {}
    }

    return headers;
  }

  function sendError(payload) {
    try {
      const endpoint = state.config.endpoint || '/api/log/error';
      const headers = buildHeaders();

      if (navigator.sendBeacon) {
        try {
          const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
          const ok = navigator.sendBeacon(endpoint, blob);
          if (ok) return;
        } catch (e) {}
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      Object.keys(headers || {}).forEach((k) => {
        if (headers[k] != null) xhr.setRequestHeader(k, String(headers[k]));
      });
      xhr.send(JSON.stringify(payload));
    } catch (e) {}
  }

  function normalizeErrorReason(reason) {
    if (reason instanceof Error) {
      return {
        errorName: reason.name || 'UnhandledRejection',
        message: reason.message,
        stack: reason.stack || '',
      };
    }

    if (typeof reason === 'string') {
      return { errorName: 'UnhandledRejection', message: reason, stack: '' };
    }

    try {
      return { errorName: 'UnhandledRejection', message: JSON.stringify(reason), stack: '' };
    } catch (e) {
      return { errorName: 'UnhandledRejection', message: String(reason), stack: '' };
    }
  }

  function handleWindowError(message, source, lineno, colno, error) {
    const errorName = (error && error.name) || 'Error';
    const errorMessage = (error && error.message) || message || 'Unknown error';
    const stack = (error && error.stack) || '';

    const fingerprint = computeFingerprint(errorName, errorMessage, source || window.location.href);
    if (!shouldReport(fingerprint)) return;

    sendError({
      severity: 'error',
      errorName,
      message: errorMessage,
      stack,
      url: source || window.location.href,
      runtime: getRuntime(),
      extra: { lineno, colno },
    });
  }

  function handleUnhandledRejection(event) {
    const norm = normalizeErrorReason(event && event.reason);

    const fingerprint = computeFingerprint(norm.errorName, norm.message, window.location.href);
    if (!shouldReport(fingerprint)) return;

    sendError({
      severity: 'error',
      errorName: norm.errorName,
      message: norm.message,
      stack: norm.stack,
      url: window.location.href,
      runtime: getRuntime(),
    });
  }

  function wrapFetch() {
    if (state.originalFetch || typeof window.fetch !== 'function') return;

    state.originalFetch = window.fetch;
    window.fetch = function (input, init) {
      return state.originalFetch.apply(this, arguments).then((response) => {
        try {
          if (response && response.status >= 500) {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            const method = (init && init.method) || 'GET';
            const fingerprint = computeFingerprint('FetchError', `${response.status} ${url}`, url);
            if (shouldReport(fingerprint)) {
              sendError({
                severity: 'warn',
                errorName: 'FetchError',
                message: `HTTP ${response.status} on ${method} ${url}`,
                request: { method, path: url, statusCode: response.status },
                runtime: getRuntime(),
              });
            }
          }
        } catch (e) {}
        return response;
      }).catch((err) => {
        try {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          const method = (init && init.method) || 'GET';
          const message = (err && err.message) || String(err);
          const stack = (err && err.stack) || '';
          const fingerprint = computeFingerprint('FetchError', message, url);
          if (shouldReport(fingerprint)) {
            sendError({
              severity: 'error',
              errorName: 'FetchError',
              message,
              stack,
              request: { method, path: url },
              runtime: getRuntime(),
            });
          }
        } catch (e) {}
        throw err;
      });
    };
  }

  function init(initOptions) {
    if (state.initialized) return;
    if (initOptions) config(initOptions);

    window.addEventListener('error', (event) => {
      handleWindowError(event && event.message, event && event.filename, event && event.lineno, event && event.colno, event && event.error);
    });

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    wrapFetch();

    state.initialized = true;
  }

  function config(next) {
    if (!next || typeof next !== 'object') return;

    state.config = {
      ...state.config,
      ...next,
      headers: {
        ...(state.config.headers || {}),
        ...(next.headers || {}),
      },
    };
  }

  function report(error, extra) {
    const errorName = (error && error.name) || 'CustomError';
    const errorMessage = (error && error.message) || String(error);
    const stack = (error && error.stack) || '';

    const fingerprint = computeFingerprint(errorName, errorMessage, window.location.href);
    if (!shouldReport(fingerprint)) return;

    sendError({
      severity: 'error',
      errorName,
      message: errorMessage,
      stack,
      url: window.location.href,
      runtime: getRuntime(),
      extra,
    });
  }

  function teardown() {
    if (!state.initialized) return;

    try {
      window.fetch = state.originalFetch || window.fetch;
      state.originalFetch = null;
    } catch (e) {}

    state.initialized = false;
  }

  return { init, config, report, teardown };
}
