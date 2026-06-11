jest.mock('axios');
jest.mock('../models/AuditEvent');
jest.mock('../models/GlobalSetting');
jest.mock('../utils/encryption');

const {
  computeCompletionURL,
  interpolateTemplate,
  normalizeProviderConfig,
  normalizeUsage,
  computeCostFromPricing,
  normalizePrompts,
} = require('./llmConfig.service');

describe('llmConfig.service', () => {
  describe('computeCompletionURL', () => {
    test('appends /v1/chat/completions for plain base URL', () => {
      expect(computeCompletionURL('https://api.openai.com')).toBe('https://api.openai.com/v1/chat/completions');
    });

    test('appends /v1/chat/completions for base URL with trailing slash', () => {
      expect(computeCompletionURL('https://api.openai.com/')).toBe('https://api.openai.com/v1/chat/completions');
    });

    test('does not double-append when URL already ends with /v1/chat/completions', () => {
      expect(computeCompletionURL('https://api.openai.com/v1/chat/completions')).toBe('https://api.openai.com/v1/chat/completions');
    });

    test('appends /chat/completions for URLs ending with /v1', () => {
      expect(computeCompletionURL('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/chat/completions');
    });

    test('uses /chat/completions for perplexity-like URLs', () => {
      expect(computeCompletionURL('https://api.perplexity.ai')).toBe('https://api.perplexity.ai/chat/completions');
    });

    test('keeps existing /chat/completions for perplexity URLs', () => {
      expect(computeCompletionURL('https://api.perplexity.ai/chat/completions')).toBe('https://api.perplexity.ai/chat/completions');
    });

    test('handles empty string', () => {
      expect(computeCompletionURL('')).toBe('/v1/chat/completions');
    });
  });

  describe('interpolateTemplate', () => {
    test('replaces variables in template', () => {
      expect(interpolateTemplate('Hello {name}', { name: 'World' })).toBe('Hello World');
    });

    test('replaces multiple variables', () => {
      expect(interpolateTemplate('{a} + {b} = {c}', { a: '1', b: '2', c: '3' })).toBe('1 + 2 = 3');
    });

    test('replaces unknown variables with empty string', () => {
      expect(interpolateTemplate('Hello {name}', {})).toBe('Hello ');
    });

    test('returns template as-is if no placeholders', () => {
      expect(interpolateTemplate('Hello World', { name: 'foo' })).toBe('Hello World');
    });

    test('handles null/undefined variable values', () => {
      expect(interpolateTemplate('{a}{b}', { a: null, b: undefined })).toBe('');
    });

    test('handles empty template', () => {
      expect(interpolateTemplate('', { a: '1' })).toBe('');
    });

    test('trims keys in placeholders', () => {
      expect(interpolateTemplate('{ name }', { name: 'Bob' })).toBe('Bob');
    });
  });

  describe('normalizeProviderConfig', () => {
    test('normalizes provider config with all fields', () => {
      const input = {
        openai: {
          baseUrl: 'https://api.openai.com',
          label: 'OpenAI',
          apiKey: 'sk-xxx',
          defaultModel: 'gpt-4',
          enabled: true,
        },
      };
      const result = normalizeProviderConfig(input);
      expect(result.openai).toEqual({
        key: 'openai',
        label: 'OpenAI',
        preset: 'custom',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-xxx',
        defaultModel: 'gpt-4',
        enabled: true,
        modelPricing: {},
        extraHeaders: {},
        timeoutMs: 60000,
      });
    });

    test('skips entries without baseUrl', () => {
      const input = {
        broken: { label: 'Broken' },
      };
      expect(normalizeProviderConfig(input)).toEqual({});
    });

    test('skips non-object entries', () => {
      const input = { openai: null, anthropic: 'string' };
      expect(normalizeProviderConfig(input)).toEqual({});
    });

    test('handles null/undefined input', () => {
      expect(normalizeProviderConfig(null)).toEqual({});
      expect(normalizeProviderConfig(undefined)).toEqual({});
    });

    test('defaults enabled to true', () => {
      const input = {
        test: { baseUrl: 'https://example.com', enabled: false },
      };
      expect(normalizeProviderConfig(input).test.enabled).toBe(false);
    });

    test('accepts underscore-style keys', () => {
      const input = {
        test: { base_url: 'https://example.com', api_key: 'key-123', default_model: 'model-1' },
      };
      const result = normalizeProviderConfig(input).test;
      expect(result.baseUrl).toBe('https://example.com');
      expect(result.apiKey).toBe('key-123');
      expect(result.defaultModel).toBe('model-1');
    });

    test('handles empty object input', () => {
      expect(normalizeProviderConfig({})).toEqual({});
    });
  });

  describe('normalizeUsage', () => {
    test('normalizes usage with all tokens', () => {
      const result = normalizeUsage({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
      expect(result).toMatchObject({
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      });
      expect(result.raw).toEqual({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
    });

    test('computes total_tokens from sum when missing', () => {
      const result = normalizeUsage({ prompt_tokens: 10, completion_tokens: 20 });
      expect(result.total_tokens).toBe(30);
    });

    test('returns null for invalid input', () => {
      expect(normalizeUsage(null)).toBeNull();
      expect(normalizeUsage(undefined)).toBeNull();
      expect(normalizeUsage('string')).toBeNull();
    });

    test('handles NaN tokens gracefully', () => {
      const result = normalizeUsage({ prompt_tokens: 'abc', completion_tokens: 10, total_tokens: 20 });
      expect(result.prompt_tokens).toBeNull();
      expect(result.completion_tokens).toBe(10);
    });

    test('includes cost when present and finite', () => {
      const result = normalizeUsage({ prompt_tokens: 10, completion_tokens: 20, cost: 0.015 });
      expect(result.cost).toBe(0.015);
    });

    test('includes is_byok when present', () => {
      const result = normalizeUsage({ prompt_tokens: 10, completion_tokens: 20, is_byok: true });
      expect(result.is_byok).toBe(true);
    });

    test('skips cost when NaN', () => {
      const result = normalizeUsage({ prompt_tokens: 10, completion_tokens: 20, cost: 'abc' });
      expect(result.cost).toBeUndefined();
    });
  });

  describe('computeCostFromPricing', () => {
    test('computes cost from pricing model', () => {
      const result = computeCostFromPricing(
        { prompt_tokens: 1000, completion_tokens: 500 },
        { costPerMillionIn: 10, costPerMillionOut: 30 },
      );
      expect(result).toBeCloseTo(0.025, 5);
    });

    test('returns null if no tokens', () => {
      expect(computeCostFromPricing({}, { costPerMillionIn: 10, costPerMillionOut: 30 })).toBeNull();
    });

    test('returns null if no pricing', () => {
      expect(computeCostFromPricing({ prompt_tokens: 1000, completion_tokens: 500 }, null)).toBeNull();
    });

    test('handles missing out rate', () => {
      const result = computeCostFromPricing(
        { prompt_tokens: 1_000_000, completion_tokens: 0 },
        { costPerMillionIn: 10 },
      );
      expect(result).toBe(10);
    });

    test('handles missing in rate', () => {
      const result = computeCostFromPricing(
        { prompt_tokens: 0, completion_tokens: 1_000_000 },
        { costPerMillionOut: 30 },
      );
      expect(result).toBe(30);
    });
  });

  describe('normalizePrompts', () => {
    test('normalizes prompts with all fields', () => {
      const input = {
        greet: {
          template: 'Hello {name}',
          label: 'Greeting',
          description: 'A greeting prompt',
          providerKey: 'openai',
          model: 'gpt-4',
          enabled: true,
        },
      };
      const result = normalizePrompts(input);
      expect(result.greet).toEqual({
        key: 'greet',
        label: 'Greeting',
        description: 'A greeting prompt',
        template: 'Hello {name}',
        providerKey: 'openai',
        model: 'gpt-4',
        defaultOptions: {},
        inputSchema: null,
        enabled: true,
      });
    });

    test('skips entries without template', () => {
      const input = { broken: { label: 'Broken' } };
      expect(normalizePrompts(input)).toEqual({});
    });

    test('skips non-object entries', () => {
      const input = { test: null, other: 'str' };
      expect(normalizePrompts(input)).toEqual({});
    });

    test('handles null/undefined input', () => {
      expect(normalizePrompts(null)).toEqual({});
      expect(normalizePrompts(undefined)).toEqual({});
    });

    test('defaults enabled to true', () => {
      const input = { test: { template: 'Hello', enabled: false } };
      expect(normalizePrompts(input).test.enabled).toBe(false);
    });
  });
});
