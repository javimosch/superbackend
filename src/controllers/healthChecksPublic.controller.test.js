const controller = require('./healthChecksPublic.controller');

jest.mock('../services/globalSettings.service', () => ({
  getSettingValue: jest.fn(),
}));

jest.mock('../models/HealthCheck', () => ({
  find: jest.fn(),
}));

jest.mock('../models/HealthIncident', () => ({
  find: jest.fn(),
}));

const globalSettingsService = require('../services/globalSettings.service');
const HealthCheck = require('../models/HealthCheck');
const HealthIncident = require('../models/HealthIncident');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
}

describe('healthChecksPublic.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatus (HTML)', () => {
    test('returns 404 when public status is disabled', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue('false');

      const req = { query: {}, headers: {} };
      const res = makeRes();

      await controller.getStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    test('returns HTML even if JSON is requested via Accept header (new behavior)', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue('true');

      HealthCheck.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: 'a', name: 'A', enabled: true, lastStatus: 'healthy', lastRunAt: null, lastLatencyMs: null },
        ]),
      });

      HealthIncident.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      const req = { query: {}, headers: { accept: 'application/json' } };
      const res = makeRes();

      await controller.getStatus(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(res.send).toHaveBeenCalled();
      const html = res.send.mock.calls[0][0];
      expect(String(html)).toContain('Health Checks');
    });

    test('returns HTML by default', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue('true');

      HealthCheck.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      HealthIncident.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      const req = { query: {}, headers: {} };
      const res = makeRes();

      await controller.getStatus(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('getStatusJson', () => {
    test('returns 404 when public status is disabled', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue('false');

      const req = { query: {}, headers: {} };
      const res = makeRes();

      await controller.getStatusJson(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    test('returns JSON when enabled', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue('true');

      HealthCheck.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { _id: 'a', name: 'A', enabled: true, lastStatus: 'healthy', lastRunAt: null, lastLatencyMs: null },
        ]),
      });

      HealthIncident.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      const req = { query: {}, headers: {} };
      const res = makeRes();

      await controller.getStatusJson(req, res);

      expect(res.json).toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.ok).toBe(true);
      expect(payload.totalChecks).toBe(1);
    });
  });
});
