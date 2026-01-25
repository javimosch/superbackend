const healthChecksBootstrap = require('./healthChecksBootstrap.service');
const GlobalSetting = require('../models/GlobalSetting');
const ScriptDefinition = require('../models/ScriptDefinition');
const CronJob = require('../models/CronJob');
const globalSettingsService = require('./globalSettings.service');

jest.mock('../models/GlobalSetting');
jest.mock('../models/ScriptDefinition');
jest.mock('../models/CronJob');
jest.mock('./globalSettings.service');

describe('healthChecksBootstrap.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('bootstrap', () => {
    test('should bootstrap health check settings, script, and cron successfully', async () => {
      // Mock GlobalSetting.findOne to return null (not existing)
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      GlobalSetting.create.mockResolvedValue({ toObject: () => ({}) });

      // Mock ScriptDefinition.findOne to return null (not existing)
      ScriptDefinition.findOne.mockResolvedValue(null);
      ScriptDefinition.create.mockResolvedValue({ _id: 'script-123' });

      // Mock CronJob.findOne to return null (not existing)
      CronJob.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      CronJob.create.mockResolvedValue({ toObject: () => ({}) });

      await healthChecksBootstrap.bootstrap();

      expect(GlobalSetting.create).toHaveBeenCalledWith(expect.objectContaining({
        key: healthChecksBootstrap.PUBLIC_STATUS_SETTING_KEY
      }));
      expect(ScriptDefinition.create).toHaveBeenCalledWith(expect.objectContaining({
        codeIdentifier: 'health-checks-cleanup-history'
      }));
      expect(CronJob.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Health Checks: Cleanup run history',
        taskType: 'script',
        scriptId: 'script-123'
      }));
      expect(globalSettingsService.clearSettingsCache).toHaveBeenCalled();
    });

    test('should skip creation if everything already exists', async () => {
      // Mock GlobalSetting.findOne to return existing
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ key: 'exists' }) });

      // Mock ScriptDefinition.findOne to return existing
      ScriptDefinition.findOne.mockResolvedValue({ _id: 'existing-script' });

      // Mock CronJob.findOne to return existing
      CronJob.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ name: 'exists' }) });

      await healthChecksBootstrap.bootstrap();

      expect(GlobalSetting.create).not.toHaveBeenCalled();
      expect(ScriptDefinition.create).not.toHaveBeenCalled();
      expect(CronJob.create).not.toHaveBeenCalled();
    });
  });
});
