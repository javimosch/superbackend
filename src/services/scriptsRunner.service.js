const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const { NodeVM } = require('vm2');

const ScriptRun = require('../models/ScriptRun');

const MAX_TAIL_BYTES = 64 * 1024;

function nowIso() {
  return new Date().toISOString();
}

function appendTail(prev, chunk) {
  const next = String(prev || '') + String(chunk || '');
  const buf = Buffer.from(next, 'utf8');
  if (buf.length <= MAX_TAIL_BYTES) return next;
  return buf.slice(buf.length - MAX_TAIL_BYTES).toString('utf8');
}

function safeJsonParse(str) {
  try {
    return JSON.parse(String(str || ''));
  } catch {
    return null;
  }
}

function buildEnvPairs(env) {
  const pairs = Array.isArray(env) ? env : [];
  const out = {};
  for (const item of pairs) {
    if (!item || typeof item !== 'object') continue;
    const key = String(item.key || '').trim();
    if (!key) continue;
    const value = String(item.value || '');
    out[key] = value;
  }
  return out;
}

class RunBus {
  constructor(runId) {
    this.runId = String(runId);
    this.emitter = new EventEmitter();
    this.seq = 0;
    this.buffer = [];
    this.closed = false;
  }

  push(event) {
    if (this.closed) return;
    this.seq += 1;
    const payload = { seq: this.seq, ...event };
    this.buffer.push(payload);
    if (this.buffer.length > 2000) this.buffer.shift();
    this.emitter.emit('event', payload);
  }

  close() {
    this.closed = true;
    this.emitter.emit('close');
  }

  snapshot(sinceSeq) {
    const since = Number(sinceSeq || 0);
    return this.buffer.filter((e) => Number(e.seq) > since);
  }
}

const runs = new Map();

function getRunBus(runId) {
  return runs.get(String(runId)) || null;
}

async function startRun(scriptDef, options) {
  const trigger = options?.trigger || 'manual';
  const meta = options?.meta || null;

  const runDoc = await ScriptRun.create({
    scriptId: scriptDef._id,
    status: 'queued',
    trigger,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    outputTail: '',
    meta,
  });

  const bus = new RunBus(runDoc._id);
  runs.set(String(runDoc._id), bus);

  setImmediate(async () => {
    try {
      await ScriptRun.updateOne(
        { _id: runDoc._id },
        { $set: { status: 'running', startedAt: new Date() } },
      );

      bus.push({ type: 'status', ts: nowIso(), status: 'running' });

      const timeoutMs = Number(scriptDef.timeoutMs || 0) || 5 * 60 * 1000;
      const env = { ...process.env, ...buildEnvPairs(scriptDef.env) };
      const cwd = String(scriptDef.defaultWorkingDirectory || '').trim() || undefined;

      let exitCode = 0;

      if (scriptDef.type === 'bash') {
        if (scriptDef.runner !== 'host') {
          throw Object.assign(new Error('bash scripts only support host runner'), { code: 'VALIDATION' });
        }
        exitCode = await runSpawned({
          runId: runDoc._id,
          bus,
          command: 'bash',
          args: ['-lc', scriptDef.script],
          env,
          cwd,
          timeoutMs,
        });
      } else if (scriptDef.type === 'node') {
        if (scriptDef.runner === 'vm2') {
          exitCode = await runVm2({ runId: runDoc._id, bus, code: scriptDef.script, timeoutMs });
        } else if (scriptDef.runner === 'host') {
          exitCode = await runSpawned({
            runId: runDoc._id,
            bus,
            command: 'node',
            args: ['-e', scriptDef.script],
            env,
            cwd,
            timeoutMs,
          });
        } else {
          throw Object.assign(new Error('Invalid runner for node script'), { code: 'VALIDATION' });
        }
      } else if (scriptDef.type === 'browser') {
        throw Object.assign(new Error('browser scripts run in the UI only'), { code: 'VALIDATION' });
      } else {
        throw Object.assign(new Error('Unsupported script type'), { code: 'VALIDATION' });
      }

      const finalStatus = exitCode === 0 ? 'succeeded' : 'failed';
      await ScriptRun.updateOne(
        { _id: runDoc._id },
        { $set: { status: finalStatus, finishedAt: new Date(), exitCode } },
      );

      bus.push({ type: 'status', ts: nowIso(), status: finalStatus, exitCode });
      bus.push({ type: 'done', ts: nowIso(), status: finalStatus, exitCode });
      bus.close();

      setTimeout(() => {
        runs.delete(String(runDoc._id));
      }, 5 * 60 * 1000).unref();
    } catch (err) {
      const msg = err?.message || 'Run failed';
      await ScriptRun.updateOne(
        { _id: runDoc._id },
        { $set: { status: 'failed', finishedAt: new Date(), exitCode: 1 }, $setOnInsert: {} },
      );
      bus.push({ type: 'log', ts: nowIso(), stream: 'stderr', line: msg + '\n' });
      bus.push({ type: 'status', ts: nowIso(), status: 'failed', exitCode: 1 });
      bus.push({ type: 'done', ts: nowIso(), status: 'failed', exitCode: 1 });
      bus.close();

      setTimeout(() => {
        runs.delete(String(runDoc._id));
      }, 5 * 60 * 1000).unref();
    }
  });

  return { runId: String(runDoc._id) };
}

async function runSpawned({ runId, bus, command, args, env, cwd, timeoutMs }) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let tail = '';

    const killTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
    }, timeoutMs);
    killTimer.unref();

    const onData = async (stream, chunk) => {
      const s = chunk.toString('utf8');
      tail = appendTail(tail, s);
      bus.push({ type: 'log', ts: nowIso(), stream, line: s });
      await ScriptRun.updateOne({ _id: runId }, { $set: { outputTail: tail } });
    };

    child.stdout.on('data', (c) => onData('stdout', c));
    child.stderr.on('data', (c) => onData('stderr', c));

    child.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve(Number(code || 0));
    });
  });
}

async function runVm2({ runId, bus, code, timeoutMs }) {
  let tail = '';

  function pushLog(stream, line) {
    const s = String(line || '');
    tail = appendTail(tail, s);
    bus.push({ type: 'log', ts: nowIso(), stream, line: s });
    return ScriptRun.updateOne({ _id: runId }, { $set: { outputTail: tail } });
  }

  const vm = new NodeVM({
    console: 'redirect',
    sandbox: {},
    require: {
      external: false,
      builtin: [],
    },
    timeout: timeoutMs,
    eval: false,
    wasm: false,
  });

  vm.on('console.log', (...args) => {
    pushLog('stdout', args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n');
  });
  vm.on('console.error', (...args) => {
    pushLog('stderr', args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n');
  });

  try {
    vm.run(code, 'script.vm2.js');
    return 0;
  } catch (err) {
    const msg = err?.message || 'vm2 error';
    await pushLog('stderr', msg + '\n');
    return 1;
  }
}

module.exports = {
  startRun,
  getRunBus,
  safeJsonParse,
};
