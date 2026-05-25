jest.mock('../models/RbacRole');
jest.mock('../models/RbacUserRole');
jest.mock('../models/RbacGrant');
jest.mock('../services/audit.service', () => ({
  createAuditEvent: jest.fn(),
  getBasicAuthActor: jest.fn(() => ({ actorType: 'admin', actorId: 'admin1' }))
}));

const RbacGrant = require('../models/RbacGrant');
const RbacUserRole = require('../models/RbacUserRole');
const { createAuditEvent } = require('../services/audit.service');

const controller = require('./adminRbacGrants.controller');

describe('adminRbacGrants.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      query: {},
      body: {}
    };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('listGrants', () => {
    test('returns all grants', async () => {
      RbacGrant.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: 'g1', subjectType: 'user', subjectId: 'u1', scopeType: 'global', right: 'admin:read', effect: 'allow' }
        ])
      });

      await controller.listGrants(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        grants: [expect.objectContaining({ id: 'g1', right: 'admin:read' })]
      });
    });

    test('handles query filters', async () => {
      mockReq.query = { subjectType: 'user', right: 'admin:read' };
      RbacGrant.find.mockReturnValue({ sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });

      await controller.listGrants(mockReq, mockRes);

      expect(RbacGrant.find).toHaveBeenCalledWith({ subjectType: 'user', right: 'admin:read' });
    });

    test('returns 500 on error', async () => {
      RbacGrant.find.mockImplementation(() => { throw new Error('DB error'); });

      await controller.listGrants(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createGrant', () => {
    test('validates required fields', async () => {
      await controller.createGrant(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('required') }));
    });

    test('creates grant successfully', async () => {
      mockReq.body = {
        subjectType: 'user',
        subjectId: '507f1f77bcf86cd799439011',
        scopeType: 'global',
        right: 'admin:read'
      };
      const mockDoc = {
        _id: 'g1',
        subjectType: 'user',
        subjectId: '507f1f77bcf86cd799439011',
        scopeType: 'global',
        right: 'admin:read',
        effect: 'allow',
        toObject: () => ({ _id: 'g1', subjectType: 'user', right: 'admin:read' })
      };
      RbacGrant.create.mockResolvedValue(mockDoc);

      await controller.createGrant(mockReq, mockRes);

      expect(RbacGrant.create).toHaveBeenCalledWith(expect.objectContaining({ right: 'admin:read' }));
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(createAuditEvent).toHaveBeenCalled();
    });

    test('requires scopeId for org scopeType', async () => {
      mockReq.body = {
        subjectType: 'user',
        subjectId: '507f1f77bcf86cd799439011',
        scopeType: 'org',
        right: 'admin:read'
      };

      await controller.createGrant(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('deleteGrant', () => {
    test('validates grant id', async () => {
      await controller.deleteGrant(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('returns 404 for non-existent grant', async () => {
      mockReq.params.id = '507f1f77bcf86cd799439011';
      RbacGrant.findById.mockResolvedValue(null);

      await controller.deleteGrant(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test('deletes grant successfully', async () => {
      mockReq.params.id = '507f1f77bcf86cd799439011';
      const mockGrant = {
        toObject: () => ({ _id: 'g1', right: 'admin:read' }),
        deleteOne: jest.fn()
      };
      RbacGrant.findById.mockResolvedValue(mockGrant);

      await controller.deleteGrant(mockReq, mockRes);

      expect(mockGrant.deleteOne).toHaveBeenCalled();
      expect(createAuditEvent).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('listUserRoles', () => {
    test('validates userId', async () => {
      await controller.listUserRoles(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('lists user roles successfully', async () => {
      mockReq.params.userId = '507f1f77bcf86cd799439011';
      RbacUserRole.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: 'ur1', roleId: 'r1', createdAt: new Date() }
        ])
      });
      const RbacRole = require('../models/RbacRole');
      RbacRole.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: 'r1', key: 'admin', name: 'Admin', status: 'active' }
        ])
      });

      await controller.listUserRoles(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        roles: [expect.objectContaining({ key: 'admin', name: 'Admin' })]
      });
    });
  });

  describe('addUserRole', () => {
    test('validates required fields', async () => {
      await controller.addUserRole(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('creates user role successfully', async () => {
      mockReq.params.userId = '507f1f77bcf86cd799439011';
      mockReq.body = { roleId: '507f1f77bcf86cd799439012' };
      const mockLink = {
        _id: 'link1',
        toObject: () => ({ _id: 'link1', userId: 'u1', roleId: 'r1' })
      };
      RbacUserRole.create.mockResolvedValue(mockLink);

      await controller.addUserRole(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(createAuditEvent).toHaveBeenCalled();
    });
  });

  describe('removeUserRole', () => {
    test('validates ids', async () => {
      await controller.removeUserRole(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('removes user role successfully', async () => {
      mockReq.params = { userId: '507f1f77bcf86cd799439011', userRoleId: '507f1f77bcf86cd799439012' };
      const mockLink = {
        toObject: () => ({ _id: 'link1' }),
        deleteOne: jest.fn()
      };
      RbacUserRole.findOne.mockResolvedValue(mockLink);

      await controller.removeUserRole(mockReq, mockRes);

      expect(mockLink.deleteOne).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
