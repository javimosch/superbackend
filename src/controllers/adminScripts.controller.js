const ScriptDefinition = require('../models/ScriptDefinition');
const ScriptRun = require('../models/ScriptRun');
const { basicAuth } = require('../middleware/auth');
const { startRun, getRunBus } = require('../services/scriptsRunner.service');

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'CONFLICT') return { status: 409, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

function normalizeEnv(env) {
  const items = Array.isArray(env) ? env : [];
  const out = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const key = String(it.key || '').trim();
    if (!key) continue;
    out.push({ key, value: String(it.value || '') });
  }
  return out;
}

// Helper functions for base64 handling
function isBase64(str) {
  try {
    return Buffer.from(str, 'base64').toString('base64') === str;
  } catch (err) {
    return false;
  }
}

function isValidBase64(str) {
  try {
    Buffer.from(str, 'base64');
    return true;
  } catch (err) {
    return false;
  }
}

function decodeScriptContent(script, format) {
  if (format === 'base64') {
    try {
      return Buffer.from(script, 'base64').toString('utf8');
    } catch (err) {
      throw new Error('Failed to decode base64 script content');
    }
  }
  return script;
}

exports.listScripts = async (req, res) => {
  try {
    const items = await ScriptDefinition.find().sort({ updatedAt: -1 }).lean();
    res.json({ items });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getScript = async (req, res) => {
  try {
    const doc = await ScriptDefinition.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ item: doc });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.createScript = async (req, res) => {
  let created = null;
  try {
    console.log('[createScript] Starting script creation...');
    console.log('[createScript] Request body keys:', Object.keys(req.body || {}));
    
    const payload = req.body || {};
    console.log('[createScript] Payload name:', payload.name);
    console.log('[createScript] Payload type:', payload.type);
    console.log('[createScript] Payload runner:', payload.runner);
    console.log('[createScript] Script length:', (payload.script || '').length);
    console.log('[createScript] Script format:', payload.scriptFormat);

    // Handle script content encoding
    let scriptContent = String(payload.script || '');
    let scriptFormat = payload.scriptFormat || 'string';

    // Auto-detect base64 if not specified and content looks like base64
    if (scriptFormat === 'string' && isBase64(scriptContent)) {
      scriptFormat = 'base64';
      console.log('[createScript] Auto-detected base64 format');
    }

    // Validate base64 content if format is base64
    if (scriptFormat === 'base64' && !isValidBase64(scriptContent)) {
      console.log('[createScript] Invalid base64 content detected');
      throw new Error('Invalid base64 script content');
    }

    console.log('[createScript] About to create ScriptDefinition...');
    const doc = await ScriptDefinition.create({
      name: String(payload.name || '').trim(),
      codeIdentifier: String(payload.codeIdentifier || '').trim(),
      description: String(payload.description || ''),
      type: String(payload.type || '').trim(),
      runner: String(payload.runner || '').trim(),
      script: scriptContent,
      scriptFormat: scriptFormat,
      defaultWorkingDirectory: String(payload.defaultWorkingDirectory || ''),
      env: normalizeEnv(payload.env),
      timeoutMs: payload.timeoutMs === undefined ? undefined : Number(payload.timeoutMs),
      enabled: payload.enabled === undefined ? true : Boolean(payload.enabled),
    });
    
    console.log('[createScript] ScriptDefinition created successfully');

    created = doc.toObject();
    console.log('[createScript] About to create audit entry...');
    console.log('[createScript] Script created successfully:', { name: created.name, id: created._id });
    
    console.log('[createScript] About to send response...');
    res.status(201).json({ item: doc.toObject() });
    console.log('[createScript] Response sent successfully');
  } catch (err) {
    console.log('[createScript] ERROR occurred:', err);
    console.log('[createScript] ERROR stack:', err.stack);
    console.log('[createScript] ERROR message:', err.message);
    console.log('[createScript] ERROR code:', err.code);
    
    console.log('[createScript] Script creation failed:', { error: err?.message || 'Operation failed' });
    const safe = toSafeJsonError(err);
    console.log('[createScript] Safe error:', safe);
    res.status(safe.status).json(safe.body);
  }
};

exports.updateScript = async (req, res) => {
  let before = null;
  let after = null;
  try {
    const payload = req.body || {};

    const doc = await ScriptDefinition.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    before = doc.toObject();

    // Handle script content encoding
    if (payload.script !== undefined) {
      let scriptContent = String(payload.script || '');
      let scriptFormat = payload.scriptFormat || doc.scriptFormat || 'string';

      // Auto-detect base64 if not specified and content looks like base64
      if (scriptFormat === 'string' && isBase64(scriptContent)) {
        scriptFormat = 'base64';
      }

      // Validate base64 content if format is base64
      if (scriptFormat === 'base64' && !isValidBase64(scriptContent)) {
        throw new Error('Invalid base64 script content');
      }

      doc.script = scriptContent;
      doc.scriptFormat = scriptFormat;
    }

    if (payload.name !== undefined) doc.name = String(payload.name || '').trim();
    if (payload.codeIdentifier !== undefined) doc.codeIdentifier = String(payload.codeIdentifier || '').trim();
    if (payload.description !== undefined) doc.description = String(payload.description || '');
    if (payload.type !== undefined) doc.type = String(payload.type || '').trim();
    if (payload.runner !== undefined) doc.runner = String(payload.runner || '').trim();
    if (payload.defaultWorkingDirectory !== undefined) {
      doc.defaultWorkingDirectory = String(payload.defaultWorkingDirectory || '');
    }
    if (payload.env !== undefined) doc.env = normalizeEnv(payload.env);
    if (payload.timeoutMs !== undefined) doc.timeoutMs = Number(payload.timeoutMs || 0);
    if (payload.enabled !== undefined) doc.enabled = Boolean(payload.enabled);

    await doc.save();
    after = doc.toObject();
    console.log('[updateScript] Script updated successfully:', { name: after.name, id: after._id });
    res.json({ item: doc.toObject() });
  } catch (err) {
    console.log('[updateScript] ERROR occurred:', err);
    console.log('[updateScript] ERROR message:', err.message);
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.deleteScript = async (req, res) => {
  let before = null;
  try {
    const doc = await ScriptDefinition.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    before = doc.toObject();
    await doc.deleteOne();

    console.log('[deleteScript] Script deleted successfully:', { name: before.name, id: before._id });
    res.json({ ok: true });
  } catch (err) {
    console.log('[deleteScript] ERROR occurred:', err);
    console.log('[deleteScript] ERROR message:', err.message);
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.runScript = async (req, res) => {
  let script = null;
  try {
    const doc = await ScriptDefinition.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (!doc.enabled) return res.status(400).json({ error: 'Script is disabled' });

    script = doc.toObject();

    const runDoc = await startRun(doc, { trigger: 'manual', meta: { actorType: 'basicAuth' } });

    console.log('[runScript] Script executed successfully:', { name: script.name, runId: runDoc._id });

    res.json({ runId: String(runDoc._id) });
  } catch (err) {
    console.log('[runScript] ERROR occurred:', err);
    console.log('[runScript] ERROR message:', err.message);
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getRun = async (req, res) => {
  try {
    const run = await ScriptRun.findById(req.params.runId).lean();
    if (!run) return res.status(404).json({ error: 'Not found' });
    res.json({ item: run });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.listRuns = async (req, res) => {
  try {
    const filter = {};
    if (req.query.scriptId) filter.scriptId = req.query.scriptId;

    const items = await ScriptRun.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ items });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.streamRun = async (req, res) => {
  try {
    const runId = String(req.params.runId);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const bus = getRunBus(runId);

    const since = Number(req.query.since || 0);
    if (bus) {
      const existing = bus.snapshot(since);
      for (const e of existing) {
        res.write(`event: ${e.type}\n`);
        res.write(`data: ${JSON.stringify(e)}\n\n`);
      }

      const onEvent = (e) => {
        res.write(`event: ${e.type}\n`);
        res.write(`data: ${JSON.stringify(e)}\n\n`);
      };
      const cleanup = () => {
        clearInterval(heartbeat);
        bus.emitter.off('event', onEvent);
        bus.emitter.off('close', onClose);
      };

      const onClose = () => {
        cleanup();
        res.end();
      };

      const heartbeat = setInterval(() => {
        res.write(`: ping\n\n`);
      }, 15000);
      heartbeat.unref();

      bus.emitter.on('event', onEvent);
      bus.emitter.once('close', onClose);

      req.on('close', () => {
        cleanup();
      });

      return;
    }

    const run = await ScriptRun.findById(runId).lean();
    if (!run) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: 'Not found' })}\n\n`);
      return res.end();
    }

    if (run.outputTail) {
      res.write(`event: log\n`);
      res.write(
        `data: ${JSON.stringify({ seq: 1, type: 'log', ts: new Date().toISOString(), stream: 'stdout', line: run.outputTail })}\n\n`,
      );
    }
    res.write(`event: status\n`);
    res.write(
      `data: ${JSON.stringify({ seq: 2, type: 'status', ts: new Date().toISOString(), status: run.status, exitCode: run.exitCode })}\n\n`,
    );
    res.write(`event: done\n`);
    res.write(
      `data: ${JSON.stringify({ seq: 3, type: 'done', ts: new Date().toISOString(), status: run.status, exitCode: run.exitCode })}\n\n`,
    );
    return res.end();
  } catch (err) {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: err?.message || 'Stream error' })}\n\n`);
    return res.end();
  }
};
