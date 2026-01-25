jest.mock('../models/AuditEvent', () => ({
  create: jest.fn()
}));
jest.mock('./webhook.service', () => ({
  emit: jest.fn()
}));

const AuditEvent = require('../models/AuditEvent');
const webhookService = require('./webhook.service');
const { createAuditEvent, getBasicAuthActor } = require('./audit.service');

describe('audit.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAuditEvent', () => {
    test('creates audit event and triggers webhook', async () => {
      AuditEvent.create.mockResolvedValue({});
      webhookService.emit.mockResolvedValue();

      await createAuditEvent({
        actorType: 'user',
        actorId: 'user123',
        action: 'CREATE',
        entityType: 'Document',
        entityId: 'doc123',
        meta: { organizationId: 'org123' }
      });

      expect(AuditEvent.create).toHaveBeenCalledWith({
        actorType: 'user',
        actorId: 'user123',
        action: 'CREATE',
        entityType: 'Document',
        entityId: 'doc123',
        meta: { organizationId: 'org123' }
      });

      expect(webhookService.emit).toHaveBeenCalledWith(
        'audit.event',
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'Document',
          entityId: 'doc123',
          actorType: 'user',
          actorId: 'user123'
        }),
        'org123'
      );
    });

    test('handles missing organizationId in meta', async () => {
      AuditEvent.create.mockResolvedValue({});

      await createAuditEvent({
        actorType: 'user',
        actorId: 'user123',
        action: 'UPDATE',
        entityType: 'Document',
        entityId: 'doc123',
        meta: { orgId: 'org456' }
      });

      expect(webhookService.emit).toHaveBeenCalledWith(
        'audit.event',
        expect.any(Object),
        'org456'
      );
    });

    test('skips webhook when no organizationId', async () => {
      AuditEvent.create.mockResolvedValue({});

      await createAuditEvent({
        actorType: 'system',
        actorId: 'system',
        action: 'CLEANUP',
        entityType: 'TempFile',
        entityId: 'temp123'
      });

      expect(webhookService.emit).not.toHaveBeenCalled();
    });

    test('handles errors gracefully', async () => {
      AuditEvent.create.mockRejectedValue(new Error('DB error'));

      await expect(createAuditEvent({
        actorType: 'user',
        actorId: 'user123',
        action: 'CREATE',
        entityType: 'Document',
        entityId: 'doc123'
      })).resolves.toBeUndefined();
    });
  });

  describe('getBasicAuthActor', () => {
    test('extracts username from Basic auth header', () => {
      const req = {
        headers: {
          authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=' // username:password
        }
      };

      const actor = getBasicAuthActor(req);

      expect(actor).toEqual({
        actorType: 'admin',
        actorId: 'username'
      });
    });

    test('handles empty username', () => {
      const req = {
        headers: {
          authorization: 'Basic OnBhc3N3b3Jk' // :password
        }
      };

      const actor = getBasicAuthActor(req);

      expect(actor).toEqual({
        actorType: 'admin',
        actorId: null
      });
    });

    test('returns null actorId for missing auth header', () => {
      const req = { headers: {} };

      const actor = getBasicAuthActor(req);

      expect(actor).toEqual({
        actorType: 'admin',
        actorId: null
      });
    });

    test('returns null actorId for invalid auth header', () => {
      const req = {
        headers: {
          authorization: 'Bearer token123'
        }
      };

      const actor = getBasicAuthActor(req);

      expect(actor).toEqual({
        actorType: 'admin',
        actorId: null
      });
    });

    test('handles malformed base64', () => {
      const req = {
        headers: {
          authorization: 'Basic invalid-base64!'
        }
      };

      const actor = getBasicAuthActor(req);

      expect(actor).toEqual({
        actorType: 'admin',
        actorId: expect.any(String) // Buffer.from returns a string for invalid base64
      });
    });
  });
});
