const axios = require('axios');
const cfg = require('./llmConfig.service');

jest.mock('axios');
jest.mock('./llmConfig.service', () => ({
  loadConfig: jest.fn(),
  normalizeProviderConfig: jest.fn(),
  normalizePrompts: jest.fn(),
  interpolateTemplate: jest.fn(),
  computeCompletionURL: jest.fn(),
  normalizeUsage: jest.fn(),
  computeCostFromPricing: jest.fn(),
  logAuditEntry: jest.fn(),
  clearCache: jest.fn(),
  logger: { log: jest.fn() },
}));

const { call, testPrompt, getModelContextLength } = require('./llmCall.service');

function makeProvider(overrides = {}) {
  return {
    key: 'test-provider',
    baseUrl: 'https://api.test.com/v1',
    apiKey: 'sk-test-key',
    enabled: true,
    defaultModel: 'gpt-4',
    timeoutMs: 30000,
    ...overrides,
  };
}

function makePrompt(overrides = {}) {
  return {
    key: 'test-prompt',
    providerKey: 'test-provider',
    enabled: true,
    template: 'Hello {{name}}',
    defaultOptions: {},
    ...overrides,
  };
}

function makeUsage(overrides = {}) {
  return {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
    ...overrides,
  };
}

describe('llmCall.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('call', () => {
    test('throws when prompt key is not found', async () => {
      cfg.loadConfig.mockResolvedValue({ providers: {}, prompts: {} });
      cfg.normalizeProviderConfig.mockReturnValue({});
      cfg.normalizePrompts.mockReturnValue({});

      await expect(call('nonexistent')).rejects.toThrow('Prompt not found or disabled');
    });

    test('throws when prompt is disabled', async () => {
      const prompt = makePrompt({ enabled: false });
      cfg.loadConfig.mockResolvedValue({ providers: {}, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({});
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });

      await expect(call('test-prompt')).rejects.toThrow('Prompt not found or disabled');
    });

    test('throws when provider is not found', async () => {
      const prompt = makePrompt({ providerKey: 'missing-provider' });
      cfg.loadConfig.mockResolvedValue({ providers: {}, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({});
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });

      await expect(call('test-prompt')).rejects.toThrow('Provider not found, disabled, or missing apiKey');
    });

    test('throws when provider is disabled', async () => {
      const prompt = makePrompt();
      const provider = makeProvider({ enabled: false });
      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });

      await expect(call('test-prompt')).rejects.toThrow('Provider not found, disabled, or missing apiKey');
    });

    test('throws when provider has no apiKey', async () => {
      const prompt = makePrompt();
      const provider = makeProvider({ apiKey: '' });
      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });

      await expect(call('test-prompt')).rejects.toThrow('Provider not found, disabled, or missing apiKey');
    });

    test('throws when model is not configured', async () => {
      const prompt = makePrompt({ model: '' });
      const provider = makeProvider({ defaultModel: '' });
      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });
      cfg.interpolateTemplate.mockReturnValue('Hello World');
      cfg.computeCompletionURL.mockReturnValue('https://api.test.com/v1/chat/completions');

      await expect(call('test-prompt')).rejects.toThrow('Model is not configured');
    });

    test('makes a successful call and logs audit entry', async () => {
      const prompt = makePrompt();
      const provider = makeProvider();
      const usage = makeUsage();

      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });
      cfg.interpolateTemplate.mockReturnValue('Hello World');
      cfg.computeCompletionURL.mockReturnValue('https://api.test.com/v1/chat/completions');
      cfg.normalizeUsage.mockReturnValue(usage);

      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: 'Hello back!' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      });

      const result = await call('test-prompt', { name: 'World' });

      expect(result.content).toBe('Hello back!');
      expect(result.model).toBe('gpt-4');
      expect(result.providerKey).toBe('test-provider');
      expect(result.usage).toEqual(usage);

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.test.com/v1/chat/completions',
        expect.objectContaining({ model: 'gpt-4' }),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer sk-test-key' }),
        }),
      );

      expect(cfg.logAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'success', promptKey: 'test-prompt' }),
      );
    });

    test('computes cost from pricing when not provided by API', async () => {
      const prompt = makePrompt();
      const provider = makeProvider({
        modelPricing: { 'gpt-4': { input: 0.01, output: 0.03 } },
      });
      const usage = makeUsage({ cost: undefined });

      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });
      cfg.interpolateTemplate.mockReturnValue('Hello World');
      cfg.computeCompletionURL.mockReturnValue('https://api.test.com/v1/chat/completions');
      cfg.normalizeUsage.mockReturnValue(usage);
      cfg.computeCostFromPricing.mockReturnValue(0.0007);

      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: 'Hello' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      });

      const result = await call('test-prompt');

      expect(result.usage.cost).toBe(0.0007);
      expect(result.usage.cost_source).toBe('computed');
      expect(cfg.computeCostFromPricing).toHaveBeenCalledWith(
        usage,
        { input: 0.01, output: 0.03 },
      );
    });

    test('sets cost_source to provider when cost is provided by API', async () => {
      const prompt = makePrompt();
      const provider = makeProvider();
      const usage = makeUsage({ cost: 0.002, cost_source: undefined });

      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });
      cfg.interpolateTemplate.mockReturnValue('Hello');
      cfg.computeCompletionURL.mockReturnValue('https://api.test.com/v1/chat/completions');
      cfg.normalizeUsage.mockReturnValue(usage);

      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: 'Hi' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.002 },
        },
      });

      const result = await call('test-prompt');

      expect(result.usage.cost_source).toBe('provider');
    });

    test('handles missing choices in response', async () => {
      const prompt = makePrompt();
      const provider = makeProvider();
      const usage = makeUsage();

      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });
      cfg.interpolateTemplate.mockReturnValue('Hello');
      cfg.computeCompletionURL.mockReturnValue('https://api.test.com/v1/chat/completions');
      cfg.normalizeUsage.mockReturnValue(usage);

      axios.post.mockResolvedValue({
        data: { choices: [], usage: null },
      });

      const result = await call('test-prompt');

      expect(result.content).toBe('');
    });

    test('logs audit entry on failure and rethrows', async () => {
      const prompt = makePrompt();
      const provider = makeProvider();

      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });
      cfg.interpolateTemplate.mockReturnValue('Hello');
      cfg.computeCompletionURL.mockReturnValue('https://api.test.com/v1/chat/completions');

      axios.post.mockRejectedValue(new Error('Network error'));

      await expect(call('test-prompt')).rejects.toThrow('Network error');

      expect(cfg.logAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failure', errorMessage: 'Network error' }),
      );
    });

    test('extracts error message from API response', async () => {
      const prompt = makePrompt();
      const provider = makeProvider();

      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });
      cfg.interpolateTemplate.mockReturnValue('Hello');
      cfg.computeCompletionURL.mockReturnValue('https://api.test.com/v1/chat/completions');

      const apiError = new Error('Request failed');
      apiError.response = {
        data: { error: { message: 'Insufficient quota' } },
      };
      axios.post.mockRejectedValue(apiError);

      await expect(call('test-prompt')).rejects.toThrow('Insufficient quota');
    });

    test('passes runtime options to the request body', async () => {
      const prompt = makePrompt();
      const provider = makeProvider();
      const usage = makeUsage();

      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });
      cfg.interpolateTemplate.mockReturnValue('Hello');
      cfg.computeCompletionURL.mockReturnValue('https://api.test.com/v1/chat/completions');
      cfg.normalizeUsage.mockReturnValue(usage);

      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: 'Hi' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      });

      await call('test-prompt', {}, { temperature: 0.7, max_tokens: 100 });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ temperature: 0.7, max_tokens: 100 }),
        expect.any(Object),
      );
    });

    test('uses model from runtimeOptions when provided', async () => {
      const prompt = makePrompt({ model: 'gpt-3.5-turbo' });
      const provider = makeProvider();
      const usage = makeUsage();

      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });
      cfg.interpolateTemplate.mockReturnValue('Hello');
      cfg.computeCompletionURL.mockReturnValue('https://api.test.com/v1/chat/completions');
      cfg.normalizeUsage.mockReturnValue(usage);

      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: 'Hi' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      });

      await call('test-prompt', {}, { model: 'gpt-4-turbo' });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'gpt-4-turbo' }),
        expect.any(Object),
      );
    });
  });

  describe('testPrompt', () => {
    test('clears cache and delegates to call', async () => {
      const prompt = makePrompt();
      const provider = makeProvider();
      const usage = makeUsage();

      cfg.loadConfig.mockResolvedValue({ providers: { 'test-provider': provider }, prompts: { 'test-prompt': prompt } });
      cfg.normalizeProviderConfig.mockReturnValue({ 'test-provider': provider });
      cfg.normalizePrompts.mockReturnValue({ 'test-prompt': prompt });
      cfg.interpolateTemplate.mockReturnValue('Hello');
      cfg.computeCompletionURL.mockReturnValue('https://api.test.com/v1/chat/completions');
      cfg.normalizeUsage.mockReturnValue(usage);

      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: 'Hi' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      });

      await testPrompt(prompt, { name: 'Test' }, { temperature: 0.5 });

      expect(cfg.clearCache).toHaveBeenCalled();
    });
  });

  describe('getModelContextLength', () => {
    test('returns default for non-openrouter providers', async () => {
      const result = await getModelContextLength('gpt-4', 'openai');
      expect(result).toBe(200000);
    });

    test('fetches context length from openrouter API successfully', async () => {
      cfg.loadConfig.mockResolvedValue({ providers: { openrouter: { apiKey: 'sk-or-test' } } });
      axios.get.mockResolvedValue({
        data: { data: { context_length: 128000 } },
      });

      const result = await getModelContextLength('gpt-4', 'openrouter');
      expect(result).toBe(128000);
    });

    test('caches the result and avoids duplicate API calls', async () => {
      cfg.loadConfig.mockResolvedValue({ providers: { openrouter: { apiKey: 'sk-or-test' } } });
      axios.get.mockResolvedValue({
        data: { data: { context_length: 64000 } },
      });

      const uniqueModel = 'gpt-cache-test-' + Date.now();
      const first = await getModelContextLength(uniqueModel, 'openrouter');
      expect(first).toBe(64000);
      expect(axios.get).toHaveBeenCalledTimes(1);

      const second = await getModelContextLength(uniqueModel, 'openrouter');
      expect(second).toBe(64000);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    test('falls back to default on API error', async () => {
      cfg.loadConfig.mockResolvedValue({ providers: { openrouter: { apiKey: 'sk-or-test' } } });
      axios.get.mockRejectedValue(new Error('API error'));

      const result = await getModelContextLength('unknown-model', 'openrouter');
      expect(result).toBe(200000);
    });

    test('falls back to default when openrouter provider has no apiKey', async () => {
      cfg.loadConfig.mockResolvedValue({ providers: { openrouter: {} } });
      axios.get.mockReset();

      const result = await getModelContextLength('no-key-model-test', 'openrouter');
      expect(result).toBe(200000);
      expect(axios.get).not.toHaveBeenCalled();
    });
  });
});
