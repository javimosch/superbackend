const controller = require('./blogAiAdmin.controller');
const llmService = require('../services/llm.service');

jest.mock('../services/llm.service');

describe('blogAiAdmin.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      body: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('generateField', () => {
    test('generates a field value successfully', async () => {
      mockReq.body = {
        field: 'title',
        providerKey: 'openai',
        model: 'gpt-4',
        context: { content: 'test content' }
      };

      llmService.callAdhoc.mockResolvedValue({
        content: 'Generated Title',
        usage: { total_tokens: 10 }
      });

      await controller.generateField(mockReq, mockRes);

      expect(llmService.callAdhoc).toHaveBeenCalledWith(
        expect.objectContaining({
          providerKey: 'openai',
          model: 'gpt-4',
          promptKeyForAudit: 'blog.ai.generate.title'
        }),
        expect.any(Object)
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        value: 'Generated Title',
        usage: { total_tokens: 10 }
      });
    });

    test('returns 400 if field is missing', async () => {
      mockReq.body = { providerKey: 'openai' };
      await controller.generateField(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'field is required' });
    });

    test('returns 400 if providerKey is missing', async () => {
      mockReq.body = { field: 'title' };
      await controller.generateField(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'providerKey is required' });
    });
  });

  describe('generateAll', () => {
    test('generates all metadata fields successfully', async () => {
      mockReq.body = {
        providerKey: 'openai',
        model: 'gpt-4',
        context: { content: 'test content' }
      };

      const mockResponse = {
        title: 'Title',
        excerpt: 'Excerpt',
        category: 'Tech',
        tags: ['tag1', 'tag2'],
        seoTitle: 'SEO Title',
        seoDescription: 'SEO Desc'
      };

      llmService.callAdhoc.mockResolvedValue({
        content: JSON.stringify(mockResponse),
        usage: { total_tokens: 50 }
      });

      await controller.generateAll(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        values: mockResponse,
        usage: { total_tokens: 50 }
      });
    });

    test('handles tags as comma-separated string from AI', async () => {
      mockReq.body = { providerKey: 'openai' };
      llmService.callAdhoc.mockResolvedValue({
        content: JSON.stringify({ tags: 'tag1, tag2, tag3' }),
      });

      await controller.generateAll(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        values: expect.objectContaining({
          tags: ['tag1', 'tag2', 'tag3']
        })
      }));
    });
  });

  describe('formatMarkdown', () => {
    test('formats text to markdown', async () => {
      mockReq.body = {
        text: 'raw text',
        providerKey: 'openai'
      };

      llmService.callAdhoc.mockResolvedValue({
        content: '# Formatted Markdown'
      });

      await controller.formatMarkdown(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        markdown: '# Formatted Markdown'
      }));
    });
  });

  describe('refineMarkdown', () => {
    test('refines full markdown successfully', async () => {
      mockReq.body = {
        markdown: 'original',
        instruction: 'improve',
        providerKey: 'openai'
      };

      llmService.callAdhoc.mockResolvedValue({
        content: 'refined'
      });

      await controller.refineMarkdown(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        markdown: 'refined',
        replaced: false
      }));
    });

    test('refines selected markdown only', async () => {
      mockReq.body = {
        markdown: 'prefix original suffix',
        instruction: 'improve',
        selectionStart: 7,
        selectionEnd: 15,
        providerKey: 'openai'
      };

      llmService.callAdhoc.mockResolvedValue({
        content: 'REFINED'
      });

      await controller.refineMarkdown(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        markdown: 'prefix REFINED suffix',
        replaced: true,
        selectionStart: 7,
        selectionEnd: 14 // 7 + 'REFINED'.length
      }));
    });
  });
});
