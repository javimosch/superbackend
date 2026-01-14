import { createErrorTrackingClient } from './core.js';

function attachToSaasbackendGlobal() {
  const root = (typeof window !== 'undefined' ? window : undefined);
  if (!root) return;

  // Show deprecation warning in console
  if (console.warn) {
    console.warn('DEPRECATION: @saasbackend/error-tracking-browser-sdk is deprecated. Use @intranefr/superbackend-error-tracking-browser-sdk instead.');
  }

  root.saasbackend = root.saasbackend || {};

  if (!root.saasbackend.errorTracking) {
    root.saasbackend.errorTracking = createErrorTrackingClient();
  }

  if (root.saasbackend.errorTracking && typeof root.saasbackend.errorTracking.init === 'function') {
    root.saasbackend.errorTracking.init();
  }
}

attachToSaasbackendGlobal();
