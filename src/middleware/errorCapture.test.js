const errorCapture = require('./errorCapture');
const errorLogger = require('../services/errorLogger');
const auditLogger = require('../services/auditLogger');

jest.mock('../services/errorLogger', () => ({
  logError: jest.fn(() => Promise.resolve()),
  logErrorSync: jest.fn(),
}));
jest.mock('../services/auditLogger');

describe('errorCapture', () => {
  let originalConsoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    originalConsoleError = console.error;
  });

  afterEach(() => {
    console.error = originalConsoleError;
    errorCapture.unhookConsoleError();
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('uncaughtException');
  });

  describe('hookConsoleError / unhookConsoleError', () => {
    test('hookConsoleError replaces console.error', () => {
      errorCapture.hookConsoleError();
      expect(console.error).not.toBe(originalConsoleError);
    });

    test('unhookConsoleError restores original console.error', () => {
      errorCapture.hookConsoleError();
      errorCapture.unhookConsoleError();
      expect(console.error).toBe(originalConsoleError);
    });

    test('hooked console.error calls logErrorSync with error object', () => {
      errorCapture.hookConsoleError();
      const err = new Error('test error');
      console.error('something', err);
      expect(errorLogger.logErrorSync).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'backend',
          severity: 'error',
          errorName: 'Error',
          message: 'test error',
        })
      );
    });

    test('hooked console.error calls logErrorSync with string', () => {
      errorCapture.hookConsoleError();
      console.error('just a string message');
      expect(errorLogger.logErrorSync).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'just a string message',
        })
      );
    });

    test('hookConsoleError is idempotent', () => {
      errorCapture.hookConsoleError();
      const hookedOnce = console.error;
      errorCapture.hookConsoleError();
      expect(console.error).toBe(hookedOnce);
    });

    test('unhookConsoleError is idempotent when not hooked', () => {
      expect(() => errorCapture.unhookConsoleError()).not.toThrow();
    });
  });

  describe('requestIdMiddleware', () => {
    test('adds requestId to req and X-Request-Id header', () => {
      const req = { headers: {} };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      errorCapture.requestIdMiddleware(req, res, next);

      expect(req.requestId).toBeDefined();
      expect(typeof req.requestId).toBe('string');
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
      expect(next).toHaveBeenCalled();
    });

    test('preserves existing x-request-id header', () => {
      const req = { headers: { 'x-request-id': 'existing-id' } };
      const res = { setHeader: jest.fn() };
      const next = jest.fn();

      errorCapture.requestIdMiddleware(req, res, next);

      expect(req.requestId).toBe('existing-id');
      expect(req.headers['x-request-id']).toBe('existing-id');
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'existing-id');
    });
  });

  describe('expressErrorMiddleware', () => {
    test('responds with error status and message', () => {
      const err = new Error('test error');
      const req = { method: 'GET', path: '/test', user: null, headers: {}, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      errorCapture.expressErrorMiddleware(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    test('uses err.status when present', () => {
      const err = new Error('not found');
      err.status = 404;
      const req = { method: 'GET', path: '/test', user: null, headers: {}, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      errorCapture.expressErrorMiddleware(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('falls back to err.statusCode', () => {
      const err = new Error('teapot');
      err.statusCode = 418;
      const req = { method: 'GET', path: '/test', user: null, headers: {}, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      errorCapture.expressErrorMiddleware(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(418);
    });

    test('redacts error message in production', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const err = new Error('sensitive details');
      const req = { method: 'GET', path: '/test', user: null, headers: {}, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      errorCapture.expressErrorMiddleware(err, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal server error' })
      );
      process.env.NODE_ENV = origEnv;
    });

    test('logs the error via logErrorSync', () => {
      const err = new Error('logged error');
      err.status = 500;
      const req = { method: 'POST', path: '/api/test', user: null, headers: {}, ip: '10.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      errorCapture.expressErrorMiddleware(err, req, res, next);

      expect(errorLogger.logErrorSync).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          errorName: 'Error',
          message: 'logged error',
        })
      );
    });

    test('calls next(err) if headers already sent', () => {
      const err = new Error('too late');
      const req = { method: 'GET', path: '/test', user: null, headers: {}, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), headersSent: true };
      const next = jest.fn();

      errorCapture.expressErrorMiddleware(err, req, res, next);

      expect(next).toHaveBeenCalledWith(err);
      expect(res.status).not.toHaveBeenCalled();
    });

    test('logs audit for 4xx errors', () => {
      const err = new Error('bad request');
      err.status = 400;
      const req = { method: 'GET', path: '/test', user: null, headers: {}, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      errorCapture.expressErrorMiddleware(err, req, res, next);

      expect(auditLogger.logAuditSync).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'request.error',
          outcome: 'failure',
        })
      );
    });
  });

  describe('setupProcessHandlers', () => {
    beforeEach(() => {
      process.removeAllListeners('unhandledRejection');
      process.removeAllListeners('uncaughtException');
      errorCapture.hookConsoleError();
    });

    test('registers unhandledRejection and uncaughtException listeners', () => {
      errorCapture.setupProcessHandlers();

      const rejectionListeners = process.listeners('unhandledRejection');
      const exceptionListeners = process.listeners('uncaughtException');

      expect(rejectionListeners.length).toBeGreaterThan(0);
      expect(exceptionListeners.length).toBeGreaterThan(0);
    });

    test('unhandledRejection handler calls logErrorSync', (done) => {
      errorCapture.setupProcessHandlers();

      process.on('unhandledRejection', (reason) => {
        try {
          expect(errorLogger.logErrorSync).toHaveBeenCalledWith(
            expect.objectContaining({
              source: 'backend',
              severity: 'fatal',
              errorName: 'UnhandledRejection',
            })
          );
          done();
        } catch (e) {
          done(e);
        }
      });

      process.emit('unhandledRejection', new Error('async fail'));
    });

    test('uncaughtException handler calls logError', (done) => {
      errorCapture.setupProcessHandlers();

      process.on('uncaughtException', (error) => {
        try {
          expect(errorLogger.logError).toHaveBeenCalledWith(
            expect.objectContaining({
              source: 'backend',
              severity: 'fatal',
              errorName: 'UncaughtException',
            })
          );
          done();
        } catch (e) {
          done(e);
        }
      });

      process.emit('uncaughtException', new Error('crash'));
    });
  });
});
