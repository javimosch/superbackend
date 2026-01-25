const JsonConfig = require('../models/JsonConfig');
const GlobalSetting = require('../models/GlobalSetting');
const globalSettingsService = require('./globalSettings.service');
const seoConfigService = require('./seoConfig.service');
const fs = require('fs');

jest.mock('../models/JsonConfig');
jest.mock('../models/GlobalSetting');
jest.mock('./globalSettings.service');
jest.mock('fs');

describe('seoConfig.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ensureSeoJsonConfigExists', () => {
    test('returns existing config if found', async () => {
      const mockDoc = { slug: 'seo-config', jsonRaw: '{}' };
      JsonConfig.findOne.mockResolvedValue(mockDoc);

      const result = await seoConfigService.ensureSeoJsonConfigExists();
      expect(result).toBe(mockDoc);
      expect(JsonConfig.findOne).toHaveBeenCalledWith({ slug: 'seo-config' });
    });

    test('creates default config if not found', async () => {
      JsonConfig.findOne.mockResolvedValue(null);
      JsonConfig.create.mockResolvedValue({ slug: 'seo-config', title: 'SEO Config' });

      const result = await seoConfigService.ensureSeoJsonConfigExists();
      expect(JsonConfig.create).toHaveBeenCalledWith(expect.objectContaining({
        slug: 'seo-config',
        title: 'SEO Config'
      }));
      expect(result.slug).toBe('seo-config');
    });
  });

  describe('applySeoPageEntry', () => {
    test('updates seo config with new page entry', async () => {
      const mockConfig = {
        jsonRaw: JSON.stringify({ pages: {} }),
        save: jest.fn().mockResolvedValue(true)
      };
      JsonConfig.findOne.mockResolvedValue(mockConfig);

      const result = await seoConfigService.applySeoPageEntry({
        routePath: '/test',
        entry: { title: 'Test Page', description: 'Test Desc' }
      });

      expect(result.routePath).toBe('/test');
      expect(mockConfig.save).toHaveBeenCalled();
      const parsed = JSON.parse(mockConfig.jsonRaw);
      expect(parsed.pages['/test']).toEqual({ title: 'Test Page', description: 'Test Desc' });
    });

    test('throws validation error for invalid routePath', async () => {
      await expect(seoConfigService.applySeoPageEntry({
        routePath: 'invalid',
        entry: { title: 'T', description: 'D' }
      })).rejects.toThrow('routePath must start with /');
    });
  });

  describe('setOgSvgSettingRaw', () => {
    test('creates new setting if not exists', async () => {
      GlobalSetting.findOne.mockResolvedValue(null);
      GlobalSetting.create.mockResolvedValue({ key: 'seoconfig.og.svg' });

      const result = await seoConfigService.setOgSvgSettingRaw('<svg></svg>');
      expect(result.created).toBe(true);
      expect(GlobalSetting.create).toHaveBeenCalledWith(expect.objectContaining({
        key: 'seoconfig.og.svg',
        value: '<svg></svg>'
      }));
    });
  });
});
