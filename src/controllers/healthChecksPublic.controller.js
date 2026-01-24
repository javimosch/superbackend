const HealthCheck = require('../models/HealthCheck');
const HealthIncident = require('../models/HealthIncident');
const globalSettingsService = require('../services/globalSettings.service');

const PUBLIC_STATUS_SETTING_KEY = 'healthChecks.publicStatusEnabled';

function escapeHtml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml(payload) {
  const status = payload.status || 'unknown';
  const badgeClass = status === 'ok' ? 'badge-success' : status === 'degraded' ? 'badge-warning' : 'badge-error';

  const checks = Array.isArray(payload.checks) ? payload.checks : [];

  const bodyRows = checks.length > 0
    ? checks
        .map((c) => {
          const cStatus = String(c.status || 'unknown');
          const cBadgeClass = cStatus === 'healthy' ? 'badge-success' : cStatus === 'unhealthy' ? 'badge-error' : 'badge-ghost';

          const incident = c.incident;
          const incidentLabel = incident ? `${incident.status} (${incident.severity})` : '-';

          return `
        <tr>
          <td class="font-medium">${escapeHtml(c.name)}</td>
          <td><span class="badge ${cBadgeClass}">${escapeHtml(cStatus)}</span></td>
          <td class="text-slate-500">${c.lastRunAt ? new Date(c.lastRunAt).toLocaleString() : '-'}</td>
          <td class="text-slate-500">${c.lastLatencyMs != null ? escapeHtml(String(c.lastLatencyMs)) + ' ms' : '-'}</td>

          <td class="text-xs">${escapeHtml(incidentLabel)}</td>
        </tr>`;
        })
        .join('')
    : '<tr><td colspan="5" class="text-slate-500 text-center">No checks found</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Health Checks Status</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.10/dist/full.min.css" rel="stylesheet" type="text/css" />
  </head>
  <body class="bg-slate-50">
    <div class="max-w-5xl mx-auto px-6 py-8">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900">Health Checks</h1>
          <div class="text-sm text-slate-500">Public status summary</div>
        </div>
        <div class="text-right">
          <div class="text-sm text-slate-500">Overall</div>
          <div class="badge ${badgeClass} badge-lg">${escapeHtml(status)}</div>
          <div class="text-xs text-slate-500 mt-1">Updated: ${escapeHtml(payload.updatedAt || '')}</div>
        </div>
      </div>

      <div class="mt-6 grid grid-cols-2 gap-3">
        <div class="card bg-white border border-slate-200">
          <div class="card-body py-4">
            <div class="text-sm text-slate-500">Total checks</div>
            <div class="text-xl font-semibold">${payload.totalChecks || 0}</div>
          </div>
        </div>
        <div class="card bg-white border border-slate-200">
          <div class="card-body py-4">
            <div class="text-sm text-slate-500">Unhealthy</div>
            <div class="text-xl font-semibold">${payload.unhealthyCount || 0}</div>
          </div>
        </div>
      </div>

      <div class="mt-6 card bg-white border border-slate-200">
        <div class="card-body p-0">
          <div class="overflow-x-auto">
            <table class="table table-zebra w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Last run</th>
                  <th>Latency</th>
                  <th>Incident</th>
                </tr>
              </thead>
              <tbody>
                ${bodyRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="mt-4 text-xs text-slate-500">
        Tip: add <code class="px-1 py-0.5 bg-slate-100 rounded">/json</code> to the URL for JSON format.
      </div>
    </div>
  </body>
</html>`;
}

async function computeStatusPayload() {
  const checks = await HealthCheck.find({ enabled: true }).sort({ name: 1 }).lean();
  const checkIds = checks.map((c) => String(c._id));

  const incidents = await HealthIncident.find({
    healthCheckId: { $in: checkIds },
    status: { $in: ['open', 'acknowledged'] },
  }).lean();


  const incidentMap = {};
  for (const incident of incidents) {
    if (!incidentMap[incident.healthCheckId]) {
      incidentMap[incident.healthCheckId] = incident;
    }
  }

  const summaries = checks.map((check) => {
    const incident = incidentMap[String(check._id)];
    return {
      id: String(check._id),
      name: check.name,
      status: incident ? incident.status : (check.lastStatus || 'unknown'),
      lastRunAt: check.lastRunAt || null,
      lastLatencyMs: check.lastLatencyMs || null,
      incident: incident
        ? {
            id: String(incident._id),
            status: incident.status,
            severity: incident.severity,
            openedAt: incident.openedAt,
            lastSeenAt: incident.lastSeenAt,
          }
        : null,
    };
  });

  const unhealthyCount = summaries.filter((s) => s.status === 'unhealthy' || s.incident).length;
  const overallStatus = unhealthyCount > 0 ? 'degraded' : 'ok';

  return {
    ok: overallStatus === 'ok',
    status: overallStatus,
    updatedAt: new Date().toISOString(),
    totalChecks: summaries.length,
    unhealthyCount,
    checks: summaries,
  };
}

exports.getStatus = async (req, res) => {
  try {
    const raw = await globalSettingsService.getSettingValue(PUBLIC_STATUS_SETTING_KEY, 'false');
    const enabled = String(raw) === 'true';

    if (!enabled) {
      return res.status(404).json({ error: 'Not found' });
    }

    const payload = await computeStatusPayload();
    const html = renderHtml(payload);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (error) {
    console.error('Failed to compute health checks status:', error);
    return res.status(500).json({ error: 'Failed to compute status' });
  }
};

exports.getStatusJson = async (req, res) => {
  try {
    const raw = await globalSettingsService.getSettingValue(PUBLIC_STATUS_SETTING_KEY, 'false');
    const enabled = String(raw) === 'true';

    if (!enabled) {
      return res.status(404).json({ error: 'Not found' });
    }

    const payload = await computeStatusPayload();
    return res.json(payload);
  } catch (error) {
    console.error('Failed to compute health checks status json:', error);
    return res.status(500).json({ error: 'Failed to compute status' });
  }
};