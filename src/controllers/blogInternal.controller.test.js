jest.setTimeout(15000);

jest.mock('../services/blogAutomation.service', () => ({
  runBlogAutomation: jest.fn(),
}));

jest.mock('../services/blogPublishing.service', () => ({
  publishScheduledDue: jest.fn(),
}));

const blogAutomationService = require('../services/blogAutomation.service');
const blogPublishingService = require('../services/blogPublishing.service');
const controller = require('./blogInternal.controller');

describe('blogInternal.controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { body: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('runAutomation', () => {
    test('defaults to manual trigger', async () => {
      mockReq.body.configId = 'cfg1';
      blogAutomationService.runBlogAutomation.mockResolvedValue({ _id: 'run1' });

      await controller.runAutomation(mockReq, mockRes);

      expect(blogAutomationService.runBlogAutomation).toHaveBeenCalledWith({ trigger: 'manual', configId: 'cfg1' });
      expect(mockRes.json).toHaveBeenCalledWith({ run: { _id: 'run1' } });
    });

    test('accepts scheduled trigger', async () => {
      mockReq.body.trigger = 'scheduled';
      mockReq.body.configId = 'cfg1';
      blogAutomationService.runBlogAutomation.mockResolvedValue({ _id: 'run1' });

      await controller.runAutomation(mockReq, mockRes);

      expect(blogAutomationService.runBlogAutomation).toHaveBeenCalledWith({ trigger: 'scheduled', configId: 'cfg1' });
    });

    test('returns 400 if configId missing', async () => {
      await controller.runAutomation(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'configId is required' });
      expect(blogAutomationService.runBlogAutomation).not.toHaveBeenCalled();
    });

    test('handles errors', async () => {
      mockReq.body.configId = 'cfg1';
      blogAutomationService.runBlogAutomation.mockRejectedValue(new Error('boom'));

      await controller.runAutomation(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to run automation' });
    });
  });

  describe('publishScheduled', () => {
    test('passes limit through', async () => {
      mockReq.body.limit = 5;
      blogPublishingService.publishScheduledDue.mockResolvedValue({ processed: 0, published: 0, errors: [] });

      await controller.publishScheduled(mockReq, mockRes);

      expect(blogPublishingService.publishScheduledDue).toHaveBeenCalledWith({ limit: 5 });
      expect(mockRes.json).toHaveBeenCalledWith({ result: { processed: 0, published: 0, errors: [] } });
    });

    test('handles errors', async () => {
      blogPublishingService.publishScheduledDue.mockRejectedValue(new Error('boom'));

      await controller.publishScheduled(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to publish scheduled posts' });
    });
  });
});
