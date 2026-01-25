const adminSeoConfigController = require('./adminSeoConfig.controller');

jest.mock('../services/seoConfig.service', () => ({
  getSeoJsonConfig: jest.fn(),
  getSeoConfigData: jest.fn(),
  updateSeoJsonConfig: jest.fn(),
  applySeoPageEntry: jest.fn(),
  getOgSvgSettingRaw: jest.fn(),
  setOgSvgSettingRaw: jest.fn(),
  generateOgPng: jest.fn(),
  getSeoconfigOpenRouterApiKey: jest.fn(),
  getSeoconfigOpenRouterModel: jest.fn(),
  DEFAULT_OG_PNG_OUTPUT_PATH: 'public/og/og-default.png',
}));

jest.mock('../services/llm.service');
jest.mock('../services/llmDefaults.service');

const seoConfigService = require('../services/seoConfig.service');
const llmService = require('../services/llm.service');
const llmDefaults = require('../services/llmDefaults.service');

jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    stat: jest.fn(),
    readFile: jest.fn(),
  },
}));

const fs = require('fs');

describe('Admin SEO Config Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { body: {}, params: {}, query: {}, app: { get: jest.fn() } };
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

  describe('seoConfigAiListViews', () => {
    it('returns views list', async () => {
      fs.promises.readdir
        .mockResolvedValueOnce([
          { name: 'a.ejs', isDirectory: () => false, isFile: () => true },
          { name: 'partials', isDirectory: () => true, isFile: () => false },
        ])
        .mockResolvedValueOnce([
          { name: 'b.ejs', isDirectory: () => false, isFile: () => true },
        ]);

      await adminSeoConfigController.seoConfigAiListViews(req, res);

      expect(res.json).toHaveBeenCalledWith({
        views: ['a.ejs', 'partials/b.ejs'],
      });
    });
  });

  describe('seoConfigApplyEntry', () => {
    it('applies entry', async () => {
      req.body = { routePath: '/marketplace', entry: { title: 'T', description: 'D' } };
      seoConfigService.applySeoPageEntry.mockResolvedValue({ routePath: '/marketplace', entry: { title: 'T', description: 'D' }, jsonRaw: '{}' });

      await adminSeoConfigController.seoConfigApplyEntry(req, res);

      expect(seoConfigService.applySeoPageEntry).toHaveBeenCalledWith({
        routePath: '/marketplace',
        entry: { title: 'T', description: 'D' },
      });
      expect(res.json).toHaveBeenCalledWith({
        result: { routePath: '/marketplace', entry: { title: 'T', description: 'D' }, jsonRaw: '{}' },
      });
    });

    it('validates routePath', async () => {
      req.body = { routePath: 'marketplace', entry: { title: 'T', description: 'D' } };
      await adminSeoConfigController.seoConfigApplyEntry(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('AI Generation', () => {
    test('seoConfigAiGenerateEntry calls LLM and returns entry', async () => {
      req.body = { viewPath: 'home.ejs', routePath: '/' };
      fs.promises.stat.mockResolvedValue({ isFile: () => true, size: 1000 });
      fs.promises.readFile.mockResolvedValue('<p>Hello</p>');
      
      llmDefaults.resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openrouter', model: 'gpt-4' });
      seoConfigService.getSeoConfigData.mockResolvedValue({ data: { siteName: 'Test', baseUrl: 'http://test.com' } });
      
      const mockLlmResponse = { content: '{"title": "Home", "description": "Welcome"}' };
      llmService.callAdhoc.mockResolvedValue(mockLlmResponse);

      await adminSeoConfigController.seoConfigAiGenerateEntry(req, res);

      expect(llmService.callAdhoc).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        entry: { title: 'Home', description: 'Welcome' }
      }));
    });

    test('seoConfigAiImproveEntry improves existing entry', async () => {
      req.body = { routePath: '/', instruction: 'Make it better' };
      
      llmDefaults.resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openrouter', model: 'gpt-4' });
      seoConfigService.getSeoConfigData.mockResolvedValue({ 
        data: { 
          siteName: 'Test', 
          pages: { '/': { title: 'Old', description: 'Old' } } 
        } 
      });
      
      llmService.callAdhoc.mockResolvedValue({ content: '{"title": "New", "description": "New"}' });

      await adminSeoConfigController.seoConfigAiImproveEntry(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        entry: { title: 'New', description: 'New' }
      }));
    });

    test('seoConfigAiGenerateEntry returns 400 if viewPath is invalid', async () => {
      req.body = { viewPath: 'invalid.txt', routePath: '/' };
      await adminSeoConfigController.seoConfigAiGenerateEntry(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('must end with .ejs') });
    });

    test('seoConfigAiGenerateEntry returns 500 if AI returns invalid JSON', async () => {
      req.body = { viewPath: 'home.ejs', routePath: '/' };
      fs.promises.stat.mockResolvedValue({ isFile: () => true, size: 1000 });
      fs.promises.readFile.mockResolvedValue('<p>Hello</p>');
      llmDefaults.resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openrouter', model: 'gpt-4' });
      seoConfigService.getSeoConfigData.mockResolvedValue({ data: { siteName: 'Test' } });
      
      llmService.callAdhoc.mockResolvedValue({ content: 'Not JSON' });

      await adminSeoConfigController.seoConfigAiGenerateEntry(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'AI returned invalid JSON' });
    });
  });

  describe('aiEditSvg', () => {
    test('edits SVG using AI successfully', async () => {
      req.body = { 
        svgRaw: '<svg>old</svg>', 
        instruction: 'change color to red' 
      };
      
      llmDefaults.resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openrouter', model: 'gpt-4' });
      llmService.callAdhoc.mockResolvedValue({ content: '<svg>new</svg>' });

      await adminSeoConfigController.aiEditSvg(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        svgRaw: '<svg>new</svg>'
      }));
    });

    test('returns 400 if svgRaw or instruction missing', async () => {
      req.body = { svgRaw: '' };
      await adminSeoConfigController.aiEditSvg(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 500 if AI returns invalid SVG', async () => {
      req.body = { svgRaw: '<svg>old</svg>', instruction: 'change' };
      llmDefaults.resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openrouter', model: 'gpt-4' });
      llmService.callAdhoc.mockResolvedValue({ content: 'not an svg' });

      await adminSeoConfigController.aiEditSvg(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'AI returned invalid SVG' });
    });
  });
});
