const { spawn } = require('child_process');
const { NodeVM } = require('vm2');
const mongoose = require('mongoose');
const ScriptRun = require('../models/ScriptRun');
const { mongooseHelper } = require('../helpers/mongooseHelper');

const {
  appendTail,
  nowIso,
  isMeaningfulConsoleLog,
  isInfrastructureLog,
  prepareVmCodeForExecution,
  buildAwaitSyntaxHelpMessage,
  formatOutput,
  determineProgrammaticOutput,
} = require('./scriptsRunnerUtils.service');

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
      } catch (e) {
        console.error('[ScriptsRunnerHost] Failed to kill child process:', e?.message || e);
      }
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
  let scriptResult = null;
  let lastConsoleLog = null;

  function pushLog(stream, line) {
    const s = String(line || '');
    tail = appendTail(tail, s);
    bus.push({ type: 'log', ts: nowIso(), stream, line: s });

    if (stream === 'stdout' && isMeaningfulConsoleLog(s)) {
      lastConsoleLog = s.trim();
    }

    return ScriptRun.findById(runId).then((run) => {
      if (run) {
        run.outputTail = tail;
        run.fullOutput = (run.fullOutput || '') + s;
        run.lastConsoleLog = lastConsoleLog;
        run.lastOutputUpdate = new Date();
        run.outputSize = (run.outputSize || 0) + s.length;
        run.lineCount = (run.lineCount || 0) + (s.split('\n').length - 1);
        return run.save();
      }
    });
  }

  try {
    if (mongoose.connection.readyState !== 1) {
      await pushLog('stdout', 'No existing connection found, establishing new connection...\n');
      await mongooseHelper.connect();
      await mongooseHelper.waitForConnection(5000);
    } else {
      await pushLog('stdout', 'Using existing app database connection\n');
    }

    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection is not ready');
    }

    const prepared = prepareVmCodeForExecution(code);
    if (prepared.wrapped) {
      await pushLog('stdout', 'Auto-wrapping script to capture return value\n');
    }

    const vm = new NodeVM({
      console: 'inherit',
      sandbox: {
        mongoose,
        db: mongoose.connection.db,

        countCollectionDocuments: async (collectionName, query = {}) => {
          try {
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

        getConnectionStatus: () => {
          const readyStateMap = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting',
          };
          return {
            readyState: mongoose.connection.readyState,
            readyStateText: readyStateMap[mongoose.connection.readyState] || 'unknown',
            host: mongoose.connection.host,
            name: mongoose.connection.name,
            hasActiveConnection: mongoose.connection.readyState === 1,
          };
        },

        models: mongoose.models || {},
        JSON,
        Date,
        Math,
        parseInt,
        parseFloat,
        String,
        Number,
        Object,
        Array,

        process: {
          env: { ...process.env, ...env },
        },

        debugModels: () => {
          console.log('Available models:', Object.keys(mongoose.models || {}));
          return mongoose.models || {};
        },

        global: {},
        __scriptResult: undefined,
      },
      require: {
        external: false,
        builtin: ['util', 'path', 'os', 'mongoose'],
      },
      timeout: timeoutMs,
      eval: false,
      wasm: false,
    });

    vm.on('console.log', (...args) => {
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
      pushLog('stdout', message);
      console.log('[Script]', message.trim());
    });
    vm.on('console.error', (...args) => {
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
      pushLog('stderr', message);
      console.error('[Script]', message.trim());
    });

    vm.on('unhandledRejection', (reason) => {
      let errorMsg = 'Unhandled Promise Rejection: ';
      if (reason instanceof Error) {
        errorMsg += reason.message;
        if (reason.stack) errorMsg += '\n' + reason.stack;
      } else {
        errorMsg += JSON.stringify(reason);
      }
      pushLog('stderr', errorMsg + '\n');
      console.error('[Script]', errorMsg);
    });

    vm.on('error', (error) => {
      let errorMsg = 'VM Error: ';
      if (error instanceof Error) {
        errorMsg += error.message;
        if (error.stack) errorMsg += '\n' + error.stack;
      } else {
        errorMsg += JSON.stringify(error);
      }
      pushLog('stderr', errorMsg + '\n');
      console.error('[Script]', errorMsg);
    });

    try {
      await pushLog('stdout', '=== SCRIPT START ===\n');
      await pushLog('stdout', `Executing script (${prepared.code.length} chars)...\n`);

      const scriptPreview = prepared.code.split('\n').slice(0, 5).join('\n');
      await pushLog('stdout', `Script preview:\n${scriptPreview}\n...\n`);

      vm.run(prepared.code, 'script.host.js');

      if (prepared.wrapped) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        scriptResult = vm.sandbox.__scriptResult;
      } else {
        scriptResult = vm.sandbox.__scriptResult;
        if (!scriptResult && lastConsoleLog) {
          scriptResult = lastConsoleLog;
        }
      }

      await pushLog('stdout', '=== SCRIPT END ===\n');

      const programmaticOutput = determineProgrammaticOutput(scriptResult, lastConsoleLog);
      await ScriptRun.updateOne(
        { _id: runId },
        {
          $set: {
            programmaticOutput: programmaticOutput.programmaticOutput,
            returnResult: scriptResult !== undefined && scriptResult !== null ? formatOutput(scriptResult) : '',
            outputType: programmaticOutput.outputType,
          },
        },
      );
    } catch (vmError) {
      let errorMsg = 'VM execution error: ';
      if (vmError instanceof Error) {
        errorMsg += vmError.message;
        if (vmError.stack) errorMsg += '\n' + vmError.stack;
      } else {
        errorMsg += JSON.stringify(vmError);
      }
      const help = vmError?.message?.includes('await is only valid in async functions')
        ? `\n\n${buildAwaitSyntaxHelpMessage()}`
        : '';
      await pushLog('stderr', errorMsg + help + '\n');
      return 1;
    }

    return 0;
  } catch (err) {
    let errorMsg = 'Host script error: ';
    if (err instanceof Error) {
      errorMsg += err.message;
      if (err.stack) errorMsg += '\n' + err.stack;
    } else {
      errorMsg += JSON.stringify(err);
    }
    await pushLog('stderr', errorMsg + '\n');
    return 1;
  }
}

module.exports = {
  runSpawned,
  runHostWithDatabase,
};
