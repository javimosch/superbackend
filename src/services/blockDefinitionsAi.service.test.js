const BlockDefinition = require('../models/BlockDefinition');
const llmService = require('./llm.service');
const { resolveLlmProviderModel } = require('./llmDefaults.service');
const { createAuditEvent } = require('./audit.service');
const blockDefinitionsAi = require('./blockDefinitionsAi.service');

jest.mock('../models/BlockDefinition');
jest.mock('./llm.service');
jest.mock('./llmDefaults.service');
jest.mock('./audit.service');

describe('blockDefinitionsAi.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateBlockDefinition', () => {
    test('generates definition from prompt', async () => {
      const mockLlmResponse = {
        content: JSON.stringify({
          code: 'test_block',
          label: 'Test Block',
          description: 'A test block',
          fields: {
            title: { type: 'string', label: 'Title' }
          }
        })
      };

      resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openai', model: 'gpt-4' });
      llmService.callAdhoc.mockResolvedValue(mockLlmResponse);
      createAuditEvent.mockResolvedValue();

      const result = await blockDefinitionsAi.generateBlockDefinition({
        prompt: 'Create a test block',
        actor: { actorType: 'admin', actorId: 'admin1' }
      });

      expect(result.proposal.code).toBe('test_block');
      expect(llmService.callAdhoc).toHaveBeenCalled();
      expect(createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
        action: 'pageBuilder.blocks.ai.generate'
      }));
    });

    test('throws error for empty prompt', async () => {
      await expect(blockDefinitionsAi.generateBlockDefinition({ prompt: '' }))
        .rejects.toThrow('prompt is required');
    });

    test('handles fenced JSON in AI output', async () => {
      const mockLlmResponse = {
        content: 'Here is the JSON:\n```json\n{"code":"fenced","label":"Fenced"}\n```'
      };

      resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openai', model: 'gpt-4' });
      llmService.callAdhoc.mockResolvedValue(mockLlmResponse);

      const result = await blockDefinitionsAi.generateBlockDefinition({ prompt: 'test' });
      expect(result.proposal.code).toBe('fenced');
    });
  });

  describe('proposeBlockDefinitionEdit', () => {
    test('proposes edit for existing block', async () => {
      const mockBlock = {
        code: 'hero',
        label: 'Hero',
        description: 'Hero block',
        fields: {},
        toObject: () => ({ code: 'hero', label: 'Hero', description: 'Hero block', fields: {}, version: 1 })
      };

      BlockDefinition.findOne.mockResolvedValue(mockBlock);
      resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openai', model: 'gpt-4' });
      
      const mockLlmResponse = {
        content: JSON.stringify({
          code: 'hero',
          label: 'Updated Hero',
          description: 'Updated description'
        })
      };
      llmService.callAdhoc.mockResolvedValue(mockLlmResponse);

      const result = await blockDefinitionsAi.proposeBlockDefinitionEdit({
        code: 'hero',
        prompt: 'Update the hero block'
      });

      expect(result.proposal.label).toBe('Updated Hero');
      expect(BlockDefinition.findOne).toHaveBeenCalledWith({ code: 'hero' });
    });

    test('throws error if AI changes the block code', async () => {
      const mockBlock = {
        code: 'hero',
        toObject: () => ({ code: 'hero', version: 1 })
      };
      BlockDefinition.findOne.mockResolvedValue(mockBlock);
      resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openai', model: 'gpt-4' });
      
      const mockLlmResponse = {
        content: JSON.stringify({ code: 'different', label: 'Different' })
      };
      llmService.callAdhoc.mockResolvedValue(mockLlmResponse);

      await expect(blockDefinitionsAi.proposeBlockDefinitionEdit({ code: 'hero', prompt: 'test' }))
        .rejects.toThrow('AI proposal code must match the requested block code');
    });
  });
});
