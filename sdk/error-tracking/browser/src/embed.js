import { createErrorTrackingClient } from './core.js';

function attachToSaasbackendGlobal() {
  const root = (typeof window !== 'undefined' ? window : undefined);
  if (!root) return;

  root.saasbackend = root.saasbackend || {};

  if (!root.saasbackend.errorTracking) {
    root.saasbackend.errorTracking = createErrorTrackingClient();
  }

  if (root.saasbackend.errorTracking && typeof root.saasbackend.errorTracking.init === 'function') {
    root.saasbackend.errorTracking.init();
  }
}

attachToSaasbackendGlobal();
