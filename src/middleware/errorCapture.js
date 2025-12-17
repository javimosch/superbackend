const crypto = require('crypto');

const { logErrorSync, logError } = require('../services/errorLogger');
const { logAuditSync } = require('../services/auditLogger');

let originalConsoleError = null;
let isHooked = false;

function hookConsoleError() {
  if (isHooked) return;
  isHooked = true;
  originalConsoleError = console.error;

  console.error = function (...args) {
    originalConsoleError.apply(console, args);

    try {
      let errorObj = null;
      let message = '';

      for (const arg of args) {
        if (arg instanceof Error) {
          errorObj = arg;
          break;
        }
      }

      if (errorObj) {
        message = errorObj.message;
      } else {
        message = args
          .map((a) => {
            if (typeof a === 'string') return a;
            try {
              return JSON.stringify(a);
            } catch (e) {
              return String(a);
            }
          })
          .join(' ');
      }

      logErrorSync({
        source: 'backend',
        severity: 'error',
        errorName: errorObj?.name || 'ConsoleError',
        message,
        stack: errorObj?.stack,
        extra: { consoleArgs: args.length },
      });
    } catch (e) {
      // avoid loops
    }
  };
}

function unhookConsoleError() {
  if (!isHooked || !originalConsoleError) return;
  console.error = originalConsoleError;
  isHooked = false;
}

function setupProcessHandlers() {
  process.on('unhandledRejection', (reason) => {
    try {
      originalConsoleError
        ? originalConsoleError('[unhandledRejection]', reason)
        : console.error('[unhandledRejection]', reason);
    } catch (e) {
      // ignore
    }
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logErrorSync({
      source: 'backend',
      severity: 'fatal',
      errorName: 'UnhandledRejection',
      message: error.message,
      stack: error.stack,
      extra: { type: 'unhandledRejection' },
    });
  });

  process.on('uncaughtException', (error, origin) => {
    try {
      originalConsoleError
        ? originalConsoleError('[uncaughtException]', error)
        : console.error('[uncaughtException]', error);
    } catch (e) {
      // ignore
    }

    logError({
      source: 'backend',
      severity: 'fatal',
      errorName: 'UncaughtException',
      message: error.message,
      stack: error.stack,
      extra: { origin },
    }).finally(() => {
      if (process.env.EXIT_ON_UNCAUGHT_EXCEPTION === 'true') {
        process.exit(1);
      }
    });
  });
}

function expressErrorMiddleware(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;

  logErrorSync({
    source: 'backend',
    severity: statusCode >= 500 ? 'error' : 'warn',
    errorName: err.name || 'Error',
    errorCode: err.code,
    message: err.message,
    stack: err.stack,
    actor: {
      userId: req.user?._id || req.user?.id,
      role: req.user?.role,
      ip: req.ip || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim(),
      userAgent: req.headers?.['user-agent'],
    },
    request: {
      method: req.method,
      path: req.path,
      statusCode,
      requestId: req.headers?.['x-request-id'] || req.requestId,
    },
  });

  if (statusCode >= 400) {
    logAuditSync({
      req,
      action: 'request.error',
      outcome: 'failure',
      entityType: 'request',
      entityId: req.path,
      details: {
        errorName: err.name,
        statusCode,
        path: req.path,
      },
    });
  }

  if (res.headersSent) {
    return next(err);
  }

  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
}

function requestIdMiddleware(req, res, next) {
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = crypto.randomUUID();
  }
  req.requestId = req.headers['x-request-id'];
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = {
  hookConsoleError,
  unhookConsoleError,
  setupProcessHandlers,
  expressErrorMiddleware,
  requestIdMiddleware,
};
