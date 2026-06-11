const BlogAutomationRun = require('../models/BlogAutomationRun');
const GlobalSetting = require('../models/GlobalSetting');
const blogAutomationService = require('./blogAutomation.service');
const globalSettingsService = require('./globalSettings.service');

jest.mock('../models/BlogPost');
jest.mock('../models/BlogAutomationRun');
jest.mock('../models/BlogAutomationLock');
jest.mock('../models/GlobalSetting');
jest.mock('./globalSettings.service');
jest.mock('./llm.service');
jest.mock('./objectStorage.service');
jest.mock('./uploadNamespaces.service');
jest.mock('../models/Asset');

describe('blogAutomation.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBlogAutomationConfig', () => {
    test('returns default config when no setting exists', async () => {
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      globalSettingsService.getSettingValue.mockResolvedValue(null);

      const config = await blogAutomationService.getBlogAutomationConfig();

      expect(config.enabled).toBe(false);
      expect(config.topics).toHaveLength(3);
      expect(GlobalSetting.create).toHaveBeenCalled();
    });

    test('returns merged config from global settings', async () => {
      const customConfig = { enabled: true, runsPerDayLimit: 5 };
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ key: 'blog.automation.config' }) });
      globalSettingsService.getSettingValue.mockResolvedValue(JSON.stringify(customConfig));

      const config = await blogAutomationService.getBlogAutomationConfig();

      expect(config.enabled).toBe(true);
      expect(config.runsPerDayLimit).toBe(5);
      expect(config.topics).toHaveLength(3); // from defaults
    });
  });

  describe('listRuns', () => {
    test('returns recent runs', async () => {
      const mockRuns = [{ _id: 'run1' }, { _id: 'run2' }];
      BlogAutomationRun.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockRuns)
      });

      const result = await blogAutomationService.listRuns({ limit: 10 });

      expect(result).toHaveLength(2);
      expect(BlogAutomationRun.find).toHaveBeenCalled();
    });
  });

  describe('runBlogAutomation edge cases', () => {
    test('returns skipped if disabled', async () => {
      const configsPayload = {
        version: 1,
        items: [
          {
            id: 'cfg1',
            name: 'Default',
            enabled: false,
            schedule: { managedBy: 'manualOnly', cronExpression: '0 9 * * 2,4', timezone: 'UTC' },
          },
        ],
      };

      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ key: 'x' }) });

      globalSettingsService.getSettingValue.mockImplementation(async (key) => {
        if (key === 'blog.automation.configs') return JSON.stringify(configsPayload);
        if (key === 'blog.automation.config') return JSON.stringify({ enabled: false });
        if (key === 'blog.automation.styleGuide') return 'style';
        return null;
      });
      const mockRun = { status: 'skipped', error: 'Blog automation is disabled', toObject: () => ({ status: 'skipped', error: 'Blog automation is disabled' }) };
      BlogAutomationRun.create.mockResolvedValue(mockRun);
      
      const result = await blogAutomationService.runBlogAutomation({ trigger: 'manual', configId: 'cfg1' });
      
      expect(result.status).toBe('skipped');
      expect(result.error).toBe('Blog automation is disabled');
    });

    test('returns skipped if rate limited (scheduled)', async () => {
      const configsPayload = {
        version: 1,
        items: [
          {
            id: 'cfg1',
            name: 'Default',
            enabled: true,
            schedule: { managedBy: 'cron', cronExpression: '0 * * * *', minIntervalHours: 24 },
          },
        ],
      };

      globalSettingsService.getSettingValue.mockImplementation(async (key) => {
        if (key === 'blog.automation.configs') return JSON.stringify(configsPayload);
        if (key === 'blog.automation.styleGuide') return 'style';
        return null;
      });

      // Mock a recent successful run within the 24h interval
      BlogAutomationRun.findOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          createdAt: new Date(Date.now() - 3600000), // 1 hour ago
          status: 'success'
        })
      });

      const mockRun = { status: 'skipped', error: 'Rate limited', toObject: () => ({ status: 'skipped', error: 'Rate limited' }) };
      BlogAutomationRun.create.mockResolvedValue(mockRun);

      const result = await blogAutomationService.runBlogAutomation({ trigger: 'scheduled', configId: 'cfg1' });

      expect(result.status).toBe('skipped');
      expect(result.error).toContain('Rate limited');
    });
  });
});
