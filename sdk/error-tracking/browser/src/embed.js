import { createErrorTrackingClient } from './core.js';

function attachToSuperbackendGlobal() {
  const root = (typeof window !== 'undefined' ? window : undefined);
  if (!root) return;

  if (root.saasbackendErrorTrackingEmbed && !root.superbackendErrorTrackingEmbed) {
    root.superbackendErrorTrackingEmbed = root.saasbackendErrorTrackingEmbed;
  }

  root.superbackend = root.superbackend || {};

  if (!root.superbackend.errorTracking) {
    root.superbackend.errorTracking = createErrorTrackingClient();
  }

  if (root.superbackend.errorTracking && typeof root.superbackend.errorTracking.init === 'function') {
    root.superbackend.errorTracking.init();
  }
}

function attachToSaasbackendGlobal() {
  const root = (typeof window !== 'undefined' ? window : undefined);
  if (!root) return;

  // Show deprecation warning in console
  if (console.warn) {
    console.warn('DEPRECATION: Global "window.saasbackend" is deprecated. Use "window.superbackend" instead.');
  }

  root.saasbackend = root.saasbackend || {};

  if (root.superbackendErrorTrackingEmbed && !root.saasbackendErrorTrackingEmbed) {
    root.saasbackendErrorTrackingEmbed = root.superbackendErrorTrackingEmbed;
  }

  if (!root.saasbackend.errorTracking) {
    root.saasbackend.errorTracking = createErrorTrackingClient();
  }

  if (root.saasbackend.errorTracking && typeof root.saasbackend.errorTracking.init === 'function') {
    root.saasbackend.errorTracking.init();
  }
}

attachToSuperbackendGlobal();
attachToSaasbackendGlobal();
