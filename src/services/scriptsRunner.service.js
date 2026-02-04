const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const { NodeVM } = require('vm2');
const mongoose = require('mongoose');

const ScriptRun = require('../models/ScriptRun');
const { mongooseHelper } = require('../helpers/mongooseHelper');

const MAX_TAIL_BYTES = 64 * 1024;

 function isTruthyEnv(v) {
   const s = String(v || '').trim().toLowerCase();
   return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on';
 }

 function shouldAutoWrapAsyncScripts() {
   if (process.env.SCRIPT_AUTO_ASYNC_WRAP === undefined) return true;
   return isTruthyEnv(process.env.SCRIPT_AUTO_ASYNC_WRAP);
 }

 function detectTopLevelAwait(code) {
   const s = String(code || '');
   if (!/\bawait\b/.test(s)) return false;
   if (/^\s*\(\s*async\s*\(/.test(s)) return false;
   if (/^\s*async\s+function\b/.test(s)) return false;
   if (/\bmodule\.exports\b/.test(s) || /\bexports\./.test(s)) return false;
   return true;
 }

 function wrapInAsyncIife(code) {
   const body = String(code || '');
   return [
     '(async () => {',
     body,
     '})().catch((err) => {',
     '  try { console.error(err && err.stack ? err.stack : err); } catch {}',
     '});',
     '',
   ].join('\n');
 }

 function prepareVmCodeForExecution(code) {
   const raw = String(code || '');
   if (!shouldAutoWrapAsyncScripts()) return { code: raw, wrapped: false };
   if (!detectTopLevelAwait(raw)) return { code: raw, wrapped: false };
   return { code: wrapInAsyncIife(raw), wrapped: true };
 }

 function buildAwaitSyntaxHelpMessage() {
   return [
     'Your script uses `await` at top-level.',
     'Wrap it in an async IIFE, or rely on auto-wrapping:',
     '',
     '(async () => {',
     '  const count = await countCollectionDocuments("users");',
     '  console.log("count:", count);',
     '})();',
     '',
   ].join('\n');
 }

// Helper function to decode script content
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
          args: ['-lc', decodeScriptContent(scriptDef.script, scriptDef.scriptFormat)],
          env,
          cwd,
          timeoutMs,
        });
      } else if (scriptDef.type === 'node') {
        if (scriptDef.runner === 'vm2') {
          exitCode = await runVm2({ runId: runDoc._id, bus, code: decodeScriptContent(scriptDef.script, scriptDef.scriptFormat), timeoutMs });
        } else if (scriptDef.runner === 'host') {
          exitCode = await runHostWithDatabase({ runId: runDoc._id, bus, code: decodeScriptContent(scriptDef.script, scriptDef.scriptFormat), env, cwd, timeoutMs });
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

  return runDoc;
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

async function runHostWithDatabase({ runId, bus, code, env, cwd, timeoutMs }) {
  let tail = '';

  function pushLog(stream, line) {
    const s = String(line || '');
    tail = appendTail(tail, s);
    bus.push({ type: 'log', ts: nowIso(), stream, line: s });
    return ScriptRun.updateOne({ _id: runId }, { $set: { outputTail: tail } });
  }

  try {
    // Use existing app connection if available, otherwise create new one
    if (mongoose.connection.readyState !== 1) {
      await pushLog('stdout', 'No existing connection found, establishing new connection...\n');
      await mongooseHelper.connect();
      
      // Wait for connection to be fully ready
      await mongooseHelper.waitForConnection(5000);
    } else {
      await pushLog('stdout', 'Using existing app database connection\n');
    }
    
    // Validate connection is ready
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection is not ready');
    }
    
    const prepared = prepareVmCodeForExecution(code);
    if (prepared.wrapped) {
      await pushLog('stdout', 'Auto-wrapping script in async function (detected top-level await)\n');
    }

    // Create a VM with database context
    const vm = new NodeVM({
      console: 'inherit',
      sandbox: {
        // Expose pre-connected mongoose instance
        mongoose: mongoose,
        db: mongoose.connection.db,
        
        // Expose helper functions
        countCollectionDocuments: async (collectionName, query = {}) => {
          try {
            // Ensure connection is still valid
            if (mongoose.connection.readyState !== 1) {
              throw new Error('Database connection lost during operation');
            }
            
            const db = mongoose.connection.db;
            if (!db) {
              throw new Error('Database instance not available');
            }
            
            const collection = db.collection(collectionName);
            const count = await collection.countDocuments(query);
            return count;
          } catch (error) {
            throw new Error(`Failed to count documents in ${collectionName}: ${error.message}`);
          }
        },
        
        // Expose connection status helper
        getConnectionStatus: () => {
          const readyStateMap = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
          };
          
          return {
            readyState: mongoose.connection.readyState,
            readyStateText: readyStateMap[mongoose.connection.readyState] || 'unknown',
            host: mongoose.connection.host,
            name: mongoose.connection.name,
            hasActiveConnection: mongoose.connection.readyState === 1
          };
        },
        
        // Expose models if available
        models: mongoose.models || {},
        
        // Global objects
        JSON,
        Date,
        Math,
        parseInt,
        parseFloat,
        String,
        Number,
        Object,
        Array,
        
        // Process environment
        process: {
          env: { ...process.env, ...env }
        }
      },
      require: {
        external: false,
        builtin: ['util', 'path', 'os'], // Allow some basic built-ins
      },
      timeout: timeoutMs,
      eval: false,
      wasm: false,
    });

    // Set up console redirection
    vm.on('console.log', (...args) => {
      pushLog('stdout', args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n');
    });
    vm.on('console.error', (...args) => {
      pushLog('stderr', args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n');
    });

    // Run the script code with better error handling
    try {
      vm.run(prepared.code, 'script.host.js');
    } catch (vmError) {
      const baseMsg = vmError?.message || 'Unknown VM error';
      const help = baseMsg.includes('await is only valid in async functions') ? `\n\n${buildAwaitSyntaxHelpMessage()}` : '';
      const errorMsg = `VM execution error: ${baseMsg}${help}`;
      await pushLog('stderr', errorMsg + '\n');
      return 1;
    }
    
    return 0;
    
  } catch (err) {
    const msg = err?.message || 'Host script error';
    await pushLog('stderr', msg + '\n');
    return 1;
  } finally {
    // Don't disconnect here - let mongooseHelper manage connection pooling
    // The connection will be cleaned up when the helper decides
  }
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
    const prepared = prepareVmCodeForExecution(code);
    if (prepared.wrapped) {
      await pushLog('stdout', 'Auto-wrapping script in async function (detected top-level await)\n');
    }
    vm.run(prepared.code, 'script.vm2.js');
    return 0;
  } catch (err) {
    const baseMsg = err?.message || 'vm2 error';
    const help = baseMsg.includes('await is only valid in async functions') ? `\n\n${buildAwaitSyntaxHelpMessage()}` : '';
    await pushLog('stderr', baseMsg + help + '\n');
    return 1;
  }
}

module.exports = {
  startRun,
  getRunBus,
  safeJsonParse,
};
