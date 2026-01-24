const parser = require('cron-parser');

const HealthCheck = require('../models/HealthCheck');
const HealthCheckRun = require('../models/HealthCheckRun');
const HealthIncident = require('../models/HealthIncident');
const HealthAutoHealAttempt = require('../models/HealthAutoHealAttempt');

const globalSettingsService = require('./globalSettings.service');
const notificationService = require('./notification.service');
const { startRun } = require('./scriptsRunner.service');

function nowIso() {
  return new Date().toISOString();
}

function normalizeHeaders(headers) {
  const items = Array.isArray(headers) ? headers : [];
  const out = {};
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const key = String(it.key || '').trim();
    if (!key) continue;
    out[key] = String(it.value || '');
  }
  return out;
}

function buildBasicAuthHeader(username, password) {
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${encoded}`;
}

async function buildAuthHeaderFromRefs(httpAuth) {
  const auth = httpAuth || { type: 'none' };

  if (auth.type === 'bearer') {
    const settingKey = String(auth.tokenSettingKey || '').trim();
    const token = settingKey ? await globalSettingsService.getSettingValue(settingKey, '') : '';
    if (!token) return null;
    return `Bearer ${token}`;
  }

  if (auth.type === 'basic') {
    const username = String(auth.username || '').trim();
    const passwordKey = String(auth.passwordSettingKey || '').trim();
    const password = passwordKey ? await globalSettingsService.getSettingValue(passwordKey, '') : '';
    if (!username || !password) return null;
    return buildBasicAuthHeader(username, password);
  }

  return null;
}

function shouldTreatAsUnhealthy(status) {
  return status === 'unhealthy' || status === 'timed_out' || status === 'error';
}

function safeCompileRegex(pattern) {
  if (!pattern) return null;
  try {
    return new RegExp(String(pattern));
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function executeHttpOnce(check) {
  const startedAt = Date.now();

  const headers = normalizeHeaders(check.httpHeaders);

  const authHeader = await buildAuthHeaderFromRefs(check.httpAuth);
  if (authHeader) headers.Authorization = authHeader;

  let body = undefined;
  if (String(check.httpMethod || 'GET') !== 'GET' && String(check.httpBody || '')) {
    const bt = String(check.httpBodyType || 'raw');
    if (bt === 'json') {
      headers['Content-Type'] = 'application/json';
      body = String(check.httpBody || '');
    } else if (bt === 'form') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = String(check.httpBody || '');
    } else {
      headers['Content-Type'] = 'text/plain';
      body = String(check.httpBody || '');
    }
  }

  const timeoutMs = Number(check.timeoutMs || 0) || 30000;

  let response;
  let responseText = '';
  let httpStatusCode = null;
  let httpResponseHeaders = null;

  try {
    response = await fetchWithTimeout(
      String(check.httpUrl),
      {
        method: String(check.httpMethod || 'GET'),
        headers,
        body,
      },
      timeoutMs,
    );

    httpStatusCode = response.status;
    httpResponseHeaders = Object.fromEntries(response.headers.entries());

    // We only store a snippet to keep the DB small.
    responseText = await response.text();
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const isAbort = err && (err.name === 'AbortError' || String(err.message || '').includes('aborted'));

    return {
      status: isAbort ? 'timed_out' : 'error',
      latencyMs,
      httpStatusCode,
      httpResponseHeaders,
      responseBodySnippet: '',
      reason: isAbort ? 'Request timed out' : 'Request failed',
      errorMessage: err?.message || 'Request failed',
    };
  }

  const latencyMs = Date.now() - startedAt;
  const snippet = String(responseText || '').slice(0, 4000);

  const expectedCodes = Array.isArray(check.expectedStatusCodes) && check.expectedStatusCodes.length
    ? check.expectedStatusCodes.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [200];

  if (!expectedCodes.includes(Number(httpStatusCode))) {
    return {
      status: 'unhealthy',
      latencyMs,
      httpStatusCode,
      httpResponseHeaders,
      responseBodySnippet: snippet,
      reason: `Unexpected status code: ${httpStatusCode}`,
      errorMessage: '',
    };
  }

  const maxLatencyMs = Number(check.maxLatencyMs || 0) || null;
  if (maxLatencyMs && latencyMs > maxLatencyMs) {
    return {
      status: 'unhealthy',
      latencyMs,
      httpStatusCode,
      httpResponseHeaders,
      responseBodySnippet: snippet,
      reason: `Latency ${latencyMs}ms exceeded maxLatencyMs ${maxLatencyMs}ms`,
      errorMessage: '',
    };
  }

  const mustMatch = safeCompileRegex(check.bodyMustMatch);
  if (mustMatch && !mustMatch.test(responseText)) {
    return {
      status: 'unhealthy',
      latencyMs,
      httpStatusCode,
      httpResponseHeaders,
      responseBodySnippet: snippet,
      reason: 'Response body did not match bodyMustMatch',
      errorMessage: '',
    };
  }

  const mustNotMatch = safeCompileRegex(check.bodyMustNotMatch);
  if (mustNotMatch && mustNotMatch.test(responseText)) {
    return {
      status: 'unhealthy',
      latencyMs,
      httpStatusCode,
      httpResponseHeaders,
      responseBodySnippet: snippet,
      reason: 'Response body matched bodyMustNotMatch',
      errorMessage: '',
    };
  }

  return {
    status: 'healthy',
    latencyMs,
    httpStatusCode,
    httpResponseHeaders,
    responseBodySnippet: snippet,
    reason: 'OK',
    errorMessage: '',
  };
}

async function waitForScriptCompletion(runId, timeoutMs) {
  const ScriptRun = require('../models/ScriptRun');

  const timeout = Number(timeoutMs || 0) || 5 * 60 * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const run = await ScriptRun.findById(runId).lean();
    if (!run) throw new Error('Script run not found');

    if (run.status === 'queued' || run.status === 'running') {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    if (run.status === 'succeeded') {
      return { ok: true, outputTail: run.outputTail || '' };
    }

    return { ok: false, outputTail: run.outputTail || '', error: run.error || 'Script failed' };
  }

  return { ok: false, outputTail: '', error: 'Script execution timeout' };
}

async function executeScriptOnce(check) {
  const ScriptDefinition = require('../models/ScriptDefinition');

  const doc = await ScriptDefinition.findById(check.scriptId);
  if (!doc) {
    return { status: 'error', latencyMs: 0, reason: 'Script not found', errorMessage: 'Script not found' };
  }
  if (!doc.enabled) {
    return { status: 'error', latencyMs: 0, reason: 'Script is disabled', errorMessage: 'Script is disabled' };
  }

  // Merge env
  const env = Array.isArray(doc.env) ? [...doc.env.map((e) => ({ key: e.key, value: e.value }))] : [];
  const overrides = Array.isArray(check.scriptEnv) ? check.scriptEnv : [];
  for (const kv of overrides) {
    const key = String(kv?.key || '').trim();
    if (!key) continue;
    const idx = env.findIndex((e) => e.key === key);
    const next = { key, value: String(kv?.value || '') };
    if (idx >= 0) env[idx] = next;
    else env.push(next);
  }

  const modified = {
    ...doc.toObject(),
    env,
    timeoutMs: Number(check.timeoutMs || 0) || Number(doc.timeoutMs || 0) || 5 * 60 * 1000,
  };

  const startedAt = Date.now();
  const runDoc = await startRun(modified, {
    trigger: 'schedule',
    meta: { source: 'healthCheck', healthCheckId: String(check._id) },
  });

  const out = await waitForScriptCompletion(runDoc._id, modified.timeoutMs);
  const latencyMs = Date.now() - startedAt;

  if (!out.ok) {
    return {
      status: 'unhealthy',
      latencyMs,
      httpStatusCode: null,
      httpResponseHeaders: null,
      responseBodySnippet: String(out.outputTail || '').slice(0, 4000),
      reason: out.error || 'Script failed',
      errorMessage: out.error || 'Script failed',
    };
  }

  return {
    status: 'healthy',
    latencyMs,
    httpStatusCode: null,
    httpResponseHeaders: null,
    responseBodySnippet: String(out.outputTail || '').slice(0, 4000),
    reason: 'OK',
    errorMessage: '',
  };
}

async function notifyIfConfigured(check, incident, event) {
  // event: 'open' | 'resolve' | 'escalate'
  if (!check) return;

  if (event === 'open' && !check.notifyOnOpen) return;
  if (event === 'resolve' && !check.notifyOnResolve) return;
  if (event === 'escalate' && !check.notifyOnEscalation) return;

  if (incident && incident.status === 'acknowledged' && check.suppressNotificationsWhenAcknowledged && event !== 'resolve') {
    return;
  }

  const userIds = Array.isArray(check.notifyUserIds) ? check.notifyUserIds : [];
  if (!userIds.length) return;

  const channel = String(check.notificationChannel || 'in_app');

  const titlePrefix = event === 'resolve' ? 'Resolved' : event === 'escalate' ? 'Escalation' : 'Incident';
  const title = `${titlePrefix}: ${check.name}`;

  const message =
    event === 'resolve'
      ? `Health check recovered: ${check.name}`
      : `Health check unhealthy: ${check.name}${incident?.lastError ? ` (${incident.lastError})` : ''}`;

  await notificationService.sendToUsers({
    userIds: userIds.map((id) => String(id)),
    type: event === 'resolve' ? 'success' : 'error',
    title,
    message,
    channel,
    metadata: {
      source: 'healthChecks',
      healthCheckId: String(check._id),
      incidentId: incident?._id ? String(incident._id) : null,
      event,
      ts: nowIso(),
    },
    sentByAdminId: null,
  });
}

async function updateIncidentState(check, runOutcome) {
  const failureThreshold = Math.max(1, Number(check.consecutiveFailuresToOpen || 3));
  const successThreshold = Math.max(1, Number(check.consecutiveSuccessesToResolve || 2));

  const isUnhealthy = shouldTreatAsUnhealthy(runOutcome.status);

  if (isUnhealthy) {
    check.consecutiveFailureCount = Number(check.consecutiveFailureCount || 0) + 1;
    check.consecutiveSuccessCount = 0;
  } else {
    check.consecutiveSuccessCount = Number(check.consecutiveSuccessCount || 0) + 1;
    check.consecutiveFailureCount = 0;
  }

  let incident = null;
  if (check.currentIncidentId) {
    incident = await HealthIncident.findById(check.currentIncidentId);
  }

  // If pointer is stale, try to find active incident.
  if (!incident || (incident.status !== 'open' && incident.status !== 'acknowledged')) {
    incident = await HealthIncident.findOne({
      healthCheckId: check._id,
      status: { $in: ['open', 'acknowledged'] },
    }).sort({ openedAt: -1 });
  }

  if (!incident) {
    if (isUnhealthy && check.consecutiveFailureCount >= failureThreshold) {
      incident = await HealthIncident.create({
        healthCheckId: check._id,
        status: 'open',
        severity: check.consecutiveFailureCount >= failureThreshold * 2 ? 'critical' : 'warning',
        openedAt: new Date(),
        lastSeenAt: new Date(),
        consecutiveFailureCount: check.consecutiveFailureCount,
        consecutiveSuccessCount: 0,
        summary: runOutcome.reason || 'Unhealthy',
        lastError: runOutcome.errorMessage || runOutcome.reason || '',
      });

      check.currentIncidentId = incident._id;
      await notifyIfConfigured(check, incident, 'open');
    }

    return { incident, event: null };
  }

  // Update existing incident
  incident.lastSeenAt = new Date();
  incident.consecutiveFailureCount = Number(check.consecutiveFailureCount || 0);
  incident.consecutiveSuccessCount = Number(check.consecutiveSuccessCount || 0);
  incident.lastError = runOutcome.errorMessage || runOutcome.reason || '';
  incident.summary = runOutcome.reason || incident.summary;

  let event = null;

  // Escalation rule: warning -> critical when >= 2x failure threshold
  if (isUnhealthy && incident.severity !== 'critical' && check.consecutiveFailureCount >= failureThreshold * 2) {
    incident.severity = 'critical';
    event = 'escalate';
  }

  if (!isUnhealthy && check.consecutiveSuccessCount >= successThreshold) {
    incident.status = 'resolved';
    incident.resolvedAt = new Date();
    event = 'resolve';

    check.currentIncidentId = undefined;
  }

  await incident.save();

  if (event === 'resolve') {
    await notifyIfConfigured(check, incident, 'resolve');
  } else if (event === 'escalate') {
    await notifyIfConfigured(check, incident, 'escalate');
  }

  return { incident, event };
}

async function maybeAutoHeal(check, incident, triggerEvent) {
  if (!check?.autoHealEnabled) return;
  if (!incident) return;
  if (triggerEvent !== 'open' && triggerEvent !== 'escalate') return;

  if (incident.status === 'acknowledged' && check.suppressNotificationsWhenAcknowledged) {
    // If the incident is acknowledged, we still allow auto-heal; user only requested notification suppression.
  }

  const maxAttempts = Math.max(1, Number(check.autoHealMaxAttemptsPerIncident || 3));
  if (Number(incident.autoHealAttemptCount || 0) >= maxAttempts) return;

  const cooldownMs = Math.max(0, Number(check.autoHealCooldownMs || 0));
  const lastAt = incident.lastAutoHealAttemptAt ? new Date(incident.lastAutoHealAttemptAt).getTime() : 0;
  if (lastAt && cooldownMs && Date.now() - lastAt < cooldownMs) return;

  const waitMs = Math.max(0, Number(check.autoHealWaitMs || 0));
  if (waitMs) {
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const attemptNumber = Number(incident.autoHealAttemptCount || 0) + 1;

  const attempt = await HealthAutoHealAttempt.create({
    healthCheckId: check._id,
    incidentId: incident._id,
    attemptNumber,
    status: 'running',
    startedAt: new Date(),
  });

  incident.autoHealAttemptCount = attemptNumber;
  incident.lastAutoHealAttemptAt = new Date();
  await incident.save();

  const actionResults = [];

  try {
    const actions = Array.isArray(check.autoHealActions) ? check.autoHealActions : [];

    for (const action of actions) {
      if (!action || typeof action !== 'object') continue;

      if (action.type === 'notify_only') {
        actionResults.push({ actionType: 'notify_only', status: 'succeeded', output: 'noop', error: '' });
        continue;
      }

      if (action.type === 'http') {
        const timeoutMs = Number(action.timeoutMs || 0) || 30000;
        const headers = normalizeHeaders(action.httpHeaders);
        const authHeader = await buildAuthHeaderFromRefs(action.httpAuth);
        if (authHeader) headers.Authorization = authHeader;

        let body = undefined;
        const method = String(action.httpMethod || 'POST');
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          const bt = String(action.httpBodyType || 'raw');
          if (bt === 'json') {
            headers['Content-Type'] = 'application/json';
            body = String(action.httpBody || '');
          } else if (bt === 'form') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            body = String(action.httpBody || '');
          } else {
            headers['Content-Type'] = 'text/plain';
            body = String(action.httpBody || '');
          }
        }

        const res = await fetchWithTimeout(
          String(action.httpUrl || ''),
          { method, headers, body },
          timeoutMs,
        );

        const out = await res.text();
        if (!res.ok) {
          actionResults.push({
            actionType: 'http',
            status: 'failed',
            output: String(out || '').slice(0, 2000),
            error: `HTTP ${res.status} ${res.statusText}`,
          });
          throw new Error(`Auto-heal HTTP action failed: ${res.status}`);
        }

        actionResults.push({
          actionType: 'http',
          status: 'succeeded',
          output: String(out || '').slice(0, 2000),
          error: '',
        });
        continue;
      }

      if (action.type === 'script') {
        // Reuse script execution semantics from executeScriptOnce.
        const tmpCheck = { ...check.toObject(), scriptId: action.scriptId, scriptEnv: action.scriptEnv };
        const res = await executeScriptOnce(tmpCheck);
        if (res.status !== 'healthy') {
          actionResults.push({
            actionType: 'script',
            status: 'failed',
            output: String(res.responseBodySnippet || '').slice(0, 2000),
            error: res.errorMessage || res.reason || 'script failed',
          });
          throw new Error('Auto-heal script action failed');
        }

        actionResults.push({
          actionType: 'script',
          status: 'succeeded',
          output: String(res.responseBodySnippet || '').slice(0, 2000),
          error: '',
        });
        continue;
      }
    }

    attempt.status = 'succeeded';
    attempt.finishedAt = new Date();
    attempt.actionResults = actionResults;
    await attempt.save();

    return attempt;
  } catch (err) {
    attempt.status = 'failed';
    attempt.finishedAt = new Date();
    attempt.actionResults = actionResults;
    await attempt.save();
    return attempt;
  }
}

async function runHealthCheckOnce(healthCheckId, { trigger = 'schedule' } = {}) {
  const check = await HealthCheck.findById(healthCheckId);
  if (!check) {
    throw new Error('HealthCheck not found');
  }

  if (!check.enabled && trigger === 'schedule') {
    return null;
  }

  const runDoc = await HealthCheckRun.create({
    healthCheckId: check._id,
    status: 'running',
    startedAt: new Date(),
  });

  let finalOutcome = null;

  const retries = Math.max(0, Number(check.retries || 0));
  const retryDelayMs = Math.max(0, Number(check.retryDelayMs || 0));

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (attempt > 0 && retryDelayMs) await new Promise((r) => setTimeout(r, retryDelayMs));

    // eslint-disable-next-line no-await-in-loop
    const outcome =
      check.checkType === 'script'
        ? await executeScriptOnce(check)
        : await executeHttpOnce(check);

    finalOutcome = { ...outcome, attempt };

    if (!shouldTreatAsUnhealthy(outcome.status)) {
      break;
    }
  }

  await HealthCheckRun.updateOne(
    { _id: runDoc._id },
    {
      $set: {
        status: finalOutcome.status,
        finishedAt: new Date(),
        latencyMs: finalOutcome.latencyMs,
        httpStatusCode: finalOutcome.httpStatusCode,
        httpResponseHeaders: finalOutcome.httpResponseHeaders,
        responseBodySnippet: finalOutcome.responseBodySnippet,
        reason: finalOutcome.reason,
        errorMessage: finalOutcome.errorMessage,
        attempt: finalOutcome.attempt,
      },
    },
  );

  check.lastRunAt = new Date();
  check.lastLatencyMs = finalOutcome.latencyMs;
  check.lastStatus = finalOutcome.status === 'healthy' ? 'healthy' : 'unhealthy';

  const { incident, event } = await updateIncidentState(check, finalOutcome);

  if (incident) {
    await HealthCheckRun.updateOne({ _id: runDoc._id }, { $set: { incidentId: incident._id } });
  }

  await check.save();

  if (event === 'open' || event === 'escalate') {
    await maybeAutoHeal(check, incident, event);
  }

  return {
    runId: String(runDoc._id),
    status: finalOutcome.status,
    incidentId: incident?._id ? String(incident._id) : null,
    event,
  };
}

function calculateNextRun(cronExpression, timezone = 'UTC') {
  const interval = parser.parseExpression(String(cronExpression || '').trim(), { tz: String(timezone || 'UTC') });
  return interval.next().toDate();
}

async function cleanupRunsOlderThanDays(days) {
  const d = Math.max(0, Number(days || 0));
  const cutoff = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
  const res = await HealthCheckRun.deleteMany({ startedAt: { $lt: cutoff } });
  return { deletedCount: res.deletedCount || 0, cutoff };
}

module.exports = {
  calculateNextRun,
  runHealthCheckOnce,
  cleanupRunsOlderThanDays,
};
