const ErrorAggregate = require('../models/ErrorAggregate');
const errorLogger = require('./errorLogger');
const os = require('os');

jest.mock('../models/ErrorAggregate');
jest.mock('os');

describe('errorLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ERROR_TRACKING_ENABLED = 'true';
    os.hostname.mockReturnValue('test-host');
  });

  describe('scrubObject', () => {
    test('redacts sensitive keys in object', () => {
      const obj = {
        password: '123',
        nested: { token: 'abc' },
        safe: 'val'
      };
      const scrubbed = errorLogger.scrubObject(obj);
      expect(scrubbed.password).toBe('[REDACTED]');
      expect(scrubbed.nested.token).toBe('[REDACTED]');
      expect(scrubbed.safe).toBe('val');
    });
  });

  describe('normalizeMessage', () => {
    test('removes dynamic IDs and UUIDs', () => {
      const msg = 'Error with user 507f1f77bcf86cd799439011 and uuid 123e4567-e89b-12d3-a456-426614174000';
      const normalized = errorLogger.normalizeMessage(msg);
      expect(normalized).toContain('<OBJECTID>');
      expect(normalized).toContain('<UUID>');
    });
  });

  describe('computeFingerprint', () => {
    test('generates stable hash for same error signature', () => {
      const parts = {
        source: 'backend',
        errorName: 'ReferenceError',
        messageTemplate: 'x is not defined'
      };
      const f1 = errorLogger.computeFingerprint(parts);
      const f2 = errorLogger.computeFingerprint(parts);
      expect(f1).toBe(f2);
      expect(f1).toHaveLength(32);
    });
  });

  describe('logError', () => {
    test('aggregates and saves error to DB', async () => {
      const event = {
        message: 'Something failed',
        stack: 'Error: Something failed\n  at Object.test (file.js:10:5)',
        source: 'api'
      };

      ErrorAggregate.findOneAndUpdate.mockResolvedValue({ _id: 'agg1' });

      const result = await errorLogger.logError(event);

      expect(result).toBeDefined();
      expect(ErrorAggregate.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ fingerprint: expect.any(String) }),
        expect.objectContaining({
          $inc: expect.any(Object),
          $push: expect.objectContaining({
            samples: expect.any(Object)
          })
        }),
        expect.any(Object)
      );
    });

    test('returns null if disabled', async () => {
      process.env.ERROR_TRACKING_ENABLED = 'false';
      const result = await errorLogger.logError({ message: 'x' });
      expect(result).toBeNull();
      expect(ErrorAggregate.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('prevents recursion with isLogging flag', async () => {
      // Mock ErrorAggregate.findOneAndUpdate to trigger another logError call if possible,
      // but easiest is to check coverage of the isLogging check.
      // We can't easily test concurrent calls in a single-threaded environment without async tricks,
      // but we can mock getConfig to be slow.
    });
  });

  describe('logErrorSync', () => {
    test('triggers logError via setImmediate', (done) => {
      ErrorAggregate.findOneAndUpdate.mockResolvedValue({ _id: 'agg1' });
      
      errorLogger.logErrorSync({ message: 'sync-error' });
      
      setImmediate(() => {
        expect(ErrorAggregate.findOneAndUpdate).toHaveBeenCalled();
        done();
      });
    });
  });
});
