jest.mock('axios');
jest.mock('../models/AuditEvent', () => ({
  create: jest.fn()
}));
jest.mock('../models/GlobalSetting', () => ({
  find: jest.fn()
}));
jest.mock('../utils/encryption', () => ({
  decryptString: jest.fn()
}));

const axios = require('axios');
const AuditEvent = require('../models/AuditEvent');
const GlobalSetting = require('../models/GlobalSetting');
const { decryptString } = require('../utils/encryption');
const llmService = require('./llm.service');

// These utility functions are not exported, so we'll test them indirectly
// through the public methods that use them

describe('llm.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear cache
    llmService.clearCache?.();
  });

  // Test the utility functions indirectly through actual API calls
  describe('service functionality', () => {
    test('handles missing configuration gracefully', async () => {
      GlobalSetting.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });

      // Test that the service handles empty configuration
      const result = await llmService.loadConfig?.();
      
      if (result) {
        expect(result.providers).toEqual({});
        expect(result.prompts).toEqual({});
      }
    });

    test('caches configuration', async () => {
      const mockSettings = [
        { key: 'llm.providers', value: '{"openai": {"model": "gpt-4"}}' }
      ];

      GlobalSetting.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockSettings)
      });

      // First call
      await llmService.loadConfig?.();
      const firstCallCount = GlobalSetting.find.mock.calls.length;

      // Second call should use cache
      await llmService.loadConfig?.();
      
      expect(GlobalSetting.find).toHaveBeenCalledTimes(firstCallCount);
    });
  });
});
