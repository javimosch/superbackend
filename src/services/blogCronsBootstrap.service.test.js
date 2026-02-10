const blogCronsBootstrap = require('./blogCronsBootstrap.service');
const GlobalSetting = require('../models/GlobalSetting');
const CronJob = require('../models/CronJob');
const uploadNamespacesService = require('./uploadNamespaces.service');
const globalSettingsService = require('./globalSettings.service');
const blogAutomationService = require('./blogAutomation.service');

jest.mock('../models/GlobalSetting');
jest.mock('../models/CronJob');
jest.mock('./uploadNamespaces.service');
jest.mock('./globalSettings.service');
jest.mock('./blogAutomation.service');

describe('blogCronsBootstrap.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPERBACKEND_BASE_URL = 'http://test.com';
  });

  describe('bootstrap', () => {
    test('should bootstrap blog crons successfully', async () => {
      blogAutomationService.getBlogAutomationConfigs.mockResolvedValue({
        items: [
          {
            id: 'cfg1',
            name: 'Config 1',
            enabled: true,
            schedule: { managedBy: 'cronScheduler', cronExpression: '0 9 * * *' }
          }
        ]
      });
      blogAutomationService.getBlogAutomationStyleGuide.mockResolvedValue('style');
      
      GlobalSetting.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ key: 'blog.internalCronToken', value: 'token123' })
      });
      globalSettingsService.getSettingValue.mockResolvedValue('token123');
      
      CronJob.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });
      
      // 1. automation cron check: CronJob.findOne({ name: cronName, taskType: 'http' }) -> should return null
      // 2. publisher cron check: CronJob.findOne({ name: CRON_NAME_PUBLISH_SCHEDULED, ... }).lean() -> should return null
      CronJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });
      // For the first call (automation cron), the service doesn't use .lean(), 
      // but it checks if 'existing' is truthy. Returning an object with lean() makes it truthy.
      // We need to return null for the first call and the object for the second, 
      // or return an object that behaves like null when accessed for properties.
      // Let's use mockImplementation to be precise.
      CronJob.findOne.mockImplementation((query) => {
        if (query.name === 'Blog: Publish scheduled posts') {
          return { lean: jest.fn().mockResolvedValue(null) };
        }
        return null; // Return null for automation cron check to trigger create
      });
      
      CronJob.deleteOne.mockReturnValue({ catch: jest.fn().mockResolvedValue({}) });

      await blogCronsBootstrap.bootstrap();

      expect(uploadNamespacesService.upsertNamespace).toHaveBeenCalledWith('blog-images', expect.any(Object));
      expect(CronJob.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Blog: Automation (cfg1)',
        httpAuth: { type: 'basic', username: 'admin', password: 'admin' }
      }));
      expect(CronJob.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Blog: Publish scheduled posts'
      }));
    });

    test('should remove orphaned automation crons', async () => {
      blogAutomationService.getBlogAutomationConfigs.mockResolvedValue({
        items: [] // No configs
      });
      
      CronJob.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'old-cron-id', name: 'Blog: Automation (orphaned-id)' }
        ])
      });
      CronJob.deleteOne.mockReturnValue({ catch: jest.fn().mockResolvedValue({}) });

      // Mock other dependencies to avoid failure
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ value: 't' }) });
      globalSettingsService.getSettingValue.mockResolvedValue('t');
      CronJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ name: 'Blog: Publish scheduled posts' })
      });
      CronJob.deleteOne.mockReturnValue({ catch: jest.fn().mockResolvedValue({}) });

      await blogCronsBootstrap.bootstrap();

      expect(CronJob.deleteOne).toHaveBeenCalledWith({ _id: 'old-cron-id' });
    });

    test('should update existing crons instead of creating new ones', async () => {
      blogAutomationService.getBlogAutomationConfigs.mockResolvedValue({
        items: [
          {
            id: 'cfg1',
            name: 'Config 1',
            enabled: false,
            schedule: { managedBy: 'cronScheduler', cronExpression: '0 10 * * *' }
          }
        ]
      });

      const mockExistingCron = {
        name: 'Blog: Automation (cfg1)',
        save: jest.fn().mockResolvedValue(true)
      };

      CronJob.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      CronJob.deleteOne.mockReturnValue({ catch: jest.fn().mockResolvedValue({}) });
      CronJob.findOne.mockImplementation((query) => {
        if (query.name === 'Blog: Automation (cfg1)') return mockExistingCron;
        return { 
          name: 'Blog: Publish scheduled posts', 
          lean: jest.fn().mockReturnThis(),
          _id: 'pub-id'
        };
      });
      
      // Setup for token
      GlobalSetting.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ value: 't' }) });
      globalSettingsService.getSettingValue.mockResolvedValue('t');

      await blogCronsBootstrap.bootstrap();

      expect(mockExistingCron.enabled).toBe(false);
      expect(mockExistingCron.cronExpression).toBe('0 10 * * *');
      expect(mockExistingCron.save).toHaveBeenCalled();
      expect(CronJob.create).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'Blog: Automation (cfg1)' }));
    });
  });

  describe('getAutomationCronNameForConfigId', () => {
    test('returns correctly formatted name', () => {
      expect(blogCronsBootstrap.getAutomationCronNameForConfigId('123')).toBe('Blog: Automation (123)');
    });
  });
});
