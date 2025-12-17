const adminSeoConfigController = require('./adminSeoConfig.controller');

jest.mock('../services/seoConfig.service', () => ({
  getSeoJsonConfig: jest.fn(),
  updateSeoJsonConfig: jest.fn(),
  getOgSvgSettingRaw: jest.fn(),
  setOgSvgSettingRaw: jest.fn(),
  generateOgPng: jest.fn(),
  getSeoconfigOpenRouterApiKey: jest.fn(),
  getSeoconfigOpenRouterModel: jest.fn(),
  DEFAULT_OG_PNG_OUTPUT_PATH: 'public/og/og-default.png',
}));

const seoConfigService = require('../services/seoConfig.service');

describe('Admin SEO Config Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { body: {}, params: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('returns config and og svg', async () => {
      seoConfigService.getSeoJsonConfig.mockResolvedValue({
        _id: '1',
        slug: 'seo-config',
        title: 'SEO Config',
        publicEnabled: false,
        cacheTtlSeconds: 0,
        jsonRaw: '{"a":1}',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
      seoConfigService.getOgSvgSettingRaw.mockResolvedValue('<svg></svg>');

      await adminSeoConfigController.get(req, res);

      expect(res.json).toHaveBeenCalledWith({
        config: {
          id: '1',
          slug: 'seo-config',
          title: 'SEO Config',
          publicEnabled: false,
          cacheTtlSeconds: 0,
          jsonRaw: '{"a":1}',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        og: {
          svgRaw: '<svg></svg>',
          defaultPngOutputPath: 'public/og/og-default.png',
        },
      });
    });
  });

  describe('update', () => {
    it('updates config', async () => {
      req.body = { jsonRaw: '{"ok":true}', publicEnabled: true, cacheTtlSeconds: 10 };
      seoConfigService.updateSeoJsonConfig.mockResolvedValue({
        _id: '1',
        slug: 'seo-config',
        title: 'SEO Config',
        publicEnabled: true,
        cacheTtlSeconds: 10,
        jsonRaw: '{"ok":true}',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });

      await adminSeoConfigController.update(req, res);

      expect(seoConfigService.updateSeoJsonConfig).toHaveBeenCalledWith(req.body);
      expect(res.json).toHaveBeenCalledWith({
        config: {
          id: '1',
          slug: 'seo-config',
          title: 'SEO Config',
          publicEnabled: true,
          cacheTtlSeconds: 10,
          jsonRaw: '{"ok":true}',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      });
    });
  });

  describe('updateOgSvg', () => {
    it('requires svgRaw', async () => {
      req.body = {};
      await adminSeoConfigController.updateOgSvg(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'svgRaw is required' });
    });

    it('saves svgRaw', async () => {
      req.body = { svgRaw: '<svg></svg>' };
      seoConfigService.setOgSvgSettingRaw.mockResolvedValue({ created: false });
      await adminSeoConfigController.updateOgSvg(req, res);
      expect(seoConfigService.setOgSvgSettingRaw).toHaveBeenCalledWith('<svg></svg>');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('generateOgPng', () => {
    it('requires svgRaw', async () => {
      req.body = { outputPath: 'public/og/og-default.png' };
      await adminSeoConfigController.generateOgPng(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'svgRaw is required' });
    });

    it('generates png', async () => {
      req.body = { svgRaw: '<svg></svg>', outputPath: 'public/og/og-default.png' };
      seoConfigService.generateOgPng.mockResolvedValue({
        outputPath: 'public/og/og-default.png',
        publicUrlPath: '/og/og-default.png',
        tool: 'rsvg-convert',
        width: 1200,
        height: 630,
      });

      await adminSeoConfigController.generateOgPng(req, res);

      expect(seoConfigService.generateOgPng).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        result: {
          outputPath: 'public/og/og-default.png',
          publicUrlPath: '/og/og-default.png',
          tool: 'rsvg-convert',
          width: 1200,
          height: 630,
        },
      });
    });
  });
});
