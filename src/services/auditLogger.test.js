const AuditEvent = require('../models/AuditEvent');
const auditLogger = require('./auditLogger');

jest.mock('../models/AuditEvent');

describe('auditLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUDIT_TRACKING_ENABLED = 'true';
  });

  describe('scrubObject', () => {
    test('redacts sensitive keys', () => {
      const obj = {
        username: 'user1',
        password: 'secret123',
        nested: {
          token: 'abc-123',
          public: 'visible'
        }
      };
      const scrubbed = auditLogger.scrubObject(obj);
      expect(scrubbed.password).toBe('[REDACTED]');
      expect(scrubbed.nested.token).toBe('[REDACTED]');
      expect(scrubbed.nested.public).toBe('visible');
    });

    test('handles arrays and depth limits', () => {
      const obj = { arr: [{ password: '123' }] };
      const scrubbed = auditLogger.scrubObject(obj);
      expect(scrubbed.arr[0].password).toBe('[REDACTED]');
    });
  });

  describe('extractActor', () => {
    test('extracts user from req', () => {
      const req = { user: { _id: 'user123' } };
      expect(auditLogger.extractActor(req)).toEqual({
        actorType: 'user',
        actorId: 'user123'
      });
    });

    test('extracts admin from basic auth', () => {
      const req = {
        headers: {
          authorization: 'Basic ' + Buffer.from('admin:pass').toString('base64')
        }
      };
      expect(auditLogger.extractActor(req)).toEqual({
        actorType: 'admin',
        actorId: 'admin'
      });
    });

    test('defaults to system for no req', () => {
      expect(auditLogger.extractActor(null)).toEqual({
        actorType: 'system',
        actorId: null
      });
    });
  });

  describe('logAudit', () => {
    test('creates AuditEvent record', async () => {
      const event = {
        action: 'user.login',
        entityType: 'User',
        entityId: 'u1',
        outcome: 'success',
        req: { ip: '1.2.3.4', method: 'POST', path: '/login' }
      };
      
      AuditEvent.create.mockResolvedValue({ _id: 'audit1' });

      const result = await auditLogger.logAudit(event);

      expect(result).toBeDefined();
      expect(AuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
        action: 'user.login',
        outcome: 'success'
      }));
    });

    test('returns null if disabled', async () => {
      process.env.AUDIT_TRACKING_ENABLED = 'false';
      const result = await auditLogger.logAudit({ action: 'test' });
      expect(result).toBeNull();
      expect(AuditEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('auditMiddleware', () => {
    test('intercepts res.end and logs audit', (done) => {
      const req = { method: 'POST', path: '/test', params: { id: '123' } };
      const res = { 
        statusCode: 200, 
        end: jest.fn(),
        locals: {}
      };
      const next = jest.fn();

      const middleware = auditLogger.auditMiddleware('test.action', { entityType: 'Test' });
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      
      // Call res.end to trigger logging
      res.end();

      // logAuditSync uses setImmediate
      setImmediate(() => {
        expect(AuditEvent.create).toHaveBeenCalled();
        done();
      });
    });
  });
});
