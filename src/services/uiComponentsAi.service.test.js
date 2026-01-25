const UiComponent = require('../models/UiComponent');
const llmService = require('./llm.service');
const { resolveLlmProviderModel } = require('./llmDefaults.service');
const { createAuditEvent } = require('./audit.service');
const uiComponentsAi = require('./uiComponentsAi.service');

jest.mock('../models/UiComponent');
jest.mock('./llm.service');
jest.mock('./llmDefaults.service');
jest.mock('./audit.service');

describe('uiComponentsAi.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('proposeComponentEdit', () => {
    test('proposes edits via LLM and applies patches', async () => {
      const mockComponent = {
        code: 'btn',
        name: 'Button',
        version: 1,
        html: '<button>Click me</button>',
        css: '.btn {}',
        js: 'return {}',
        usageMarkdown: '',
        toObject: () => ({ code: 'btn', name: 'Button', version: 1, html: '<button>Click me</button>', css: '.btn {}', js: 'return {}', usageMarkdown: '' })
      };

      UiComponent.findOne.mockResolvedValue(mockComponent);
      resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openai', model: 'gpt-4' });
      
      const mockLlmResponse = {
        content: `FIELD: html
<<<<<<< SEARCH
<button>Click me</button>
=======
<button class="primary">Click here</button>
>>>>>>> REPLACE`
      };
      llmService.callAdhoc.mockResolvedValue(mockLlmResponse);
      createAuditEvent.mockResolvedValue();

      const result = await uiComponentsAi.proposeComponentEdit({
        code: 'btn',
        prompt: 'Add primary class',
        targets: { html: true }
      });

      expect(result.proposal.appliedFields).toContain('html');
      expect(result.proposal.fields.html).toBe('<button class="primary">Click here</button>');
      expect(UiComponent.findOne).toHaveBeenCalledWith({ code: 'btn' });
    });

    test('handles __FULL__ replacement', async () => {
      const mockComponent = {
        code: 'card',
        html: 'old',
        toObject: () => ({ code: 'card', html: 'old' })
      };
      UiComponent.findOne.mockResolvedValue(mockComponent);
      resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openai', model: 'gpt-4' });
      
      const mockLlmResponse = {
        content: `FIELD: html
<<<<<<< SEARCH
__FULL__
=======
<div class="card">New Card</div>
>>>>>>> REPLACE`
      };
      llmService.callAdhoc.mockResolvedValue(mockLlmResponse);

      const result = await uiComponentsAi.proposeComponentEdit({
        code: 'card',
        prompt: 'Rewrite card',
        targets: { html: true }
      });

      expect(result.proposal.fields.html).toBe('<div class="card">New Card</div>');
    });

    test('computes warnings for unsafe JS', async () => {
      const mockComponent = {
        code: 'unsafe',
        js: '',
        toObject: () => ({ code: 'unsafe', js: '' })
      };
      UiComponent.findOne.mockResolvedValue(mockComponent);
      resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openai', model: 'gpt-4' });
      
      const mockLlmResponse = {
        content: `FIELD: js
<<<<<<< SEARCH
__FULL__
=======
eval("alert(1)"); return {};
>>>>>>> REPLACE`
      };
      llmService.callAdhoc.mockResolvedValue(mockLlmResponse);

      const result = await uiComponentsAi.proposeComponentEdit({
        code: 'unsafe',
        prompt: 'Add eval',
        targets: { js: true }
      });

      expect(result.proposal.warnings).toContain('JS contains eval( which is unsafe.');
    });

    test('throws error if no patches match', async () => {
      const mockComponent = { code: 'test', html: 'a', toObject: () => ({ code: 'test', html: 'a' }) };
      UiComponent.findOne.mockResolvedValue(mockComponent);
      resolveLlmProviderModel.mockResolvedValue({ providerKey: 'openai', model: 'gpt-4' });
      llmService.callAdhoc.mockResolvedValue({ content: 'invalid response format' });

      await expect(uiComponentsAi.proposeComponentEdit({ code: 'test', prompt: 'test', targets: { html: true } }))
        .rejects.toThrow('No applicable field patches returned');
    });
  });
});
