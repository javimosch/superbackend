const {
  getConfig,
  updateConfig,
  listHealthChecks,
  getHealthCheck,
  createHealthCheck,
  updateHealthCheck,
  deleteHealthCheck,
  triggerHealthCheck,
  getRunHistory,
  getIncidents,
  acknowledgeIncident,
  resolveIncident
} = require('./adminHealthChecks.controller');
const HealthCheck = require('../models/HealthCheck');
const HealthCheckRun = require('../models/HealthCheckRun');
const HealthIncident = require('../models/HealthIncident');
const GlobalSetting = require('../models/GlobalSetting');
const healthChecksService = require('../services/healthChecks.service');
const healthChecksScheduler = require('../services/healthChecksScheduler.service');
const globalSettingsService = require('../services/globalSettings.service');

jest.mock('../models/HealthCheck');
jest.mock('../models/HealthCheckRun');
jest.mock('../models/HealthIncident');
jest.mock('../models/GlobalSetting');
jest.mock('../services/healthChecks.service');
jest.mock('../services/healthChecksScheduler.service');
jest.mock('../services/globalSettings.service');
jest.mock('../utils/encryption', () => ({
  encryptString: jest.fn((v) => ({ ciphertext: v, iv: 'iv', tag: 'tag', alg: 'aes-256-gcm', keyId: 'v1' }))
}));

describe('Admin Health Checks Controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      query: {},
      user: { username: 'admin' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('getConfig', () => {
    test('returns public status config', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue('true');
      GlobalSetting.findOne.mockResolvedValue({ key: 'x' });

      await getConfig(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        publicStatusEnabled: true
      }));
    });
  });

  describe('updateConfig', () => {
    test('updates public status setting', async () => {
      mockReq.body = { publicStatusEnabled: true };
      const mockDoc = { value: 'false', save: jest.fn().mockResolvedValue(true) };
      GlobalSetting.findOne.mockResolvedValue(mockDoc);

      await updateConfig(mockReq, mockRes);

      expect(mockDoc.value).toBe('true');
      expect(mockDoc.save).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ publicStatusEnabled: true });
    });
  });

  describe('listHealthChecks', () => {
    test('returns all checks and status enabled flag', async () => {
      HealthCheck.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: 'c1', name: 'Check 1' }])
      });
      globalSettingsService.getSettingValue.mockResolvedValue('false');
      GlobalSetting.findOne.mockResolvedValue({ key: 'x' });

      await listHealthChecks(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        items: expect.any(Array),
        publicStatusEnabled: false
      }));
    });
  });

  describe('createHealthCheck', () => {
    test('creates a new HTTP health check', async () => {
      mockReq.body = {
        name: 'New Check',
        checkType: 'http',
        httpUrl: 'https://test.com',
        cronExpression: '*/5 * * * *',
        enabled: true
      };

      const mockDoc = {
        ...mockReq.body,
        _id: 'new-id',
        httpAuth: {},
        save: jest.fn().mockResolvedValue(true),
        toObject: function() { return this; }
      };

      HealthCheck.create.mockResolvedValue(mockDoc);
      healthChecksService.calculateNextRun.mockReturnValue(new Date());

      await createHealthCheck(mockReq, mockRes);

      expect(HealthCheck.create).toHaveBeenCalled();
      expect(mockDoc.save).toHaveBeenCalled();
      expect(healthChecksScheduler.scheduleCheck).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 400 for invalid checkType', async () => {
      mockReq.body = { checkType: 'invalid' };
      await createHealthCheck(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('triggerHealthCheck', () => {
    test('triggers check execution via scheduler', async () => {
      mockReq.params.id = 'c1';
      HealthCheck.findById.mockResolvedValue({ _id: 'c1' });
      healthChecksScheduler.trigger.mockResolvedValue({ success: true });

      await triggerHealthCheck(mockReq, mockRes);

      expect(healthChecksScheduler.trigger).toHaveBeenCalledWith('c1');
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('incident management', () => {
    test('acknowledgeIncident updates status', async () => {
      mockReq.params = { id: 'c1', incidentId: 'i1' };
      const mockIncident = {
        _id: 'i1',
        status: 'open',
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ status: 'acknowledged' })
      };
      HealthIncident.findOne.mockResolvedValue(mockIncident);

      await acknowledgeIncident(mockReq, mockRes);

      expect(mockIncident.status).toBe('acknowledged');
      expect(mockIncident.save).toHaveBeenCalled();
    });

    test('resolveIncident updates status and clears check counter', async () => {
      mockReq.params = { id: 'c1', incidentId: 'i1' };
      const mockIncident = {
        _id: 'i1',
        status: 'open',
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ status: 'resolved' })
      };
      HealthIncident.findOne.mockResolvedValue(mockIncident);

      await resolveIncident(mockReq, mockRes);

      expect(mockIncident.status).toBe('resolved');
      expect(HealthCheck.updateOne).toHaveBeenCalledWith(
        { _id: 'c1', currentIncidentId: 'i1' },
        { $set: { currentIncidentId: null, consecutiveFailureCount: 0, consecutiveSuccessCount: 0 } }
      );
    });
  });
});
