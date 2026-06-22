jest.mock('../models/BlogAutomationLock', () => ({}));
jest.mock('../models/GlobalSetting', () => ({}));
jest.mock('./globalSettings.service', () => ({}));

const {
  defaultBlogAutomationConfig,
  defaultBlogAutomationConfigs,
  defaultBlogAutomationStyleGuide,
  normalizeAutomationConfigForSave,
  normalizeAutomationConfigItemForSave,
  buildPostPrompt,
  buildImagePrompt,
} = require('./blogAutomationConfig.service');

describe('blogAutomationConfig.service', () => {
  describe('defaultBlogAutomationConfig', () => {
    test('returns a frozen-like default config with expected shape', () => {
      const cfg = defaultBlogAutomationConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.runsPerDayLimit).toBe(1);
      expect(cfg.maxPostsPerRun).toBe(1);
      expect(cfg.dedupeWindowDays).toBe(30);
      expect(cfg.citations).toEqual({ enabled: true, format: 'bullets' });
      expect(cfg.topics).toHaveLength(3);
      expect(cfg.topics[0]).toMatchObject({ key: 'operations', label: 'Operations', weight: 4 });
      expect(cfg.research).toMatchObject({ providerKey: 'Perplexity', model: 'sonar' });
      expect(cfg.generation).toMatchObject({ providerKey: 'OpenRouter' });
      expect(cfg.textGeneration).toMatchObject({ providerKey: 'OpenRouter' });
      expect(cfg.imageGeneration).toMatchObject({ providerKey: 'OpenRouter' });
      expect(cfg.images).toMatchObject({ enabled: false, maxImagesTotal: 2 });
      expect(cfg.dryRun).toBe(false);
    });

    test('returns a new object each call (no shared mutation)', () => {
      const a = defaultBlogAutomationConfig();
      const b = defaultBlogAutomationConfig();
      a.enabled = true;
      expect(b.enabled).toBe(false);
    });
  });

  describe('defaultBlogAutomationConfigs', () => {
    test('returns object with version and items array', () => {
      const result = defaultBlogAutomationConfigs();
      expect(result).toHaveProperty('version', 1);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items).toHaveLength(1);
    });

    test('default item has id, name, schedule and all config fields', () => {
      const { items } = defaultBlogAutomationConfigs();
      const item = items[0];
      expect(item).toHaveProperty('id');
      expect(typeof item.id).toBe('string');
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.name).toBe('Default');
      expect(item.schedule).toEqual({
        managedBy: 'cronScheduler',
        cronExpression: '0 9 * * 2,4',
        timezone: 'UTC',
      });
      expect(item.styleGuideOverride).toBe('');
      expect(item.enabled).toBe(false);
    });
  });

  describe('defaultBlogAutomationStyleGuide', () => {
    test('returns a non-empty string', () => {
      const guide = defaultBlogAutomationStyleGuide();
      expect(typeof guide).toBe('string');
      expect(guide.length).toBeGreaterThan(50);
    });

    test('contains expected keywords', () => {
      const guide = defaultBlogAutomationStyleGuide();
      expect(guide).toContain('superbackend');
      expect(guide).toContain('practical');
      expect(guide).toContain('Sources');
    });
  });

  describe('normalizeAutomationConfigForSave', () => {
    test('fills missing fields from defaults', () => {
      const result = normalizeAutomationConfigForSave({});
      expect(result.enabled).toBe(false);
      expect(result.runsPerDayLimit).toBe(1);
      expect(result.maxPostsPerRun).toBe(1);
      expect(result.dedupeWindowDays).toBe(30);
    });

    test('coerces enabled to boolean, runs numeric fields', () => {
      const result = normalizeAutomationConfigForSave({
        enabled: 'true',
        runsPerDayLimit: -5,
        maxPostsPerRun: 0,
      });
      expect(result.enabled).toBe(true);
      expect(result.runsPerDayLimit).toBe(0);
      expect(result.maxPostsPerRun).toBe(1);
    });

    test('falls back to base topics if provided topics is not an array', () => {
      const result = normalizeAutomationConfigForSave({ topics: 'not-an-array' });
      expect(Array.isArray(result.topics)).toBe(true);
      expect(result.topics).toHaveLength(3);
    });

    test('preserved provided topic overrides', () => {
      const result = normalizeAutomationConfigForSave({
        topics: [{ key: 'custom', label: 'Custom', weight: 5, keywords: [] }],
      });
      expect(result.topics).toHaveLength(1);
      expect(result.topics[0].key).toBe('custom');
    });

    test('handles null/undefined input', () => {
      expect(normalizeAutomationConfigForSave(null).enabled).toBe(false);
      expect(normalizeAutomationConfigForSave(undefined).enabled).toBe(false);
    });

    test('preserves both generation and textGeneration independently', () => {
      const result = normalizeAutomationConfigForSave({
        generation: { providerKey: 'CustomGen' },
        textGeneration: { providerKey: 'CustomText' },
      });
      expect(result.generation.providerKey).toBe('CustomGen');
      expect(result.textGeneration.providerKey).toBe('CustomText');
    });

    test('falls back generation from textGeneration when generation is null', () => {
      const result = normalizeAutomationConfigForSave({
        generation: null,
        textGeneration: { providerKey: 'CustomText' },
      });
      expect(result.generation.providerKey).toBe('CustomText');
    });
  });

  describe('normalizeAutomationConfigItemForSave', () => {
    test('generates id when missing', () => {
      const result = normalizeAutomationConfigItemForSave({});
      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
    });

    test('preserves provided id', () => {
      const result = normalizeAutomationConfigItemForSave({ id: 'my-id' });
      expect(result.id).toBe('my-id');
    });

    test('generates name from default when empty', () => {
      const result = normalizeAutomationConfigItemForSave({});
      expect(result.name).toBe('Untitled');
    });

    test('normalizes schedule with valid defaults', () => {
      const result = normalizeAutomationConfigItemForSave({});
      expect(result.schedule).toEqual({
        managedBy: 'cronScheduler',
        cronExpression: '0 9 * * 2,4',
        timezone: 'UTC',
      });
    });

    test('accepts manualOnly schedule', () => {
      const result = normalizeAutomationConfigItemForSave({
        schedule: { managedBy: 'manualOnly' },
      });
      expect(result.schedule.managedBy).toBe('manualOnly');
    });

    test('accepts custom cron expression and timezone', () => {
      const result = normalizeAutomationConfigItemForSave({
        schedule: { cronExpression: '0 0 * * *', timezone: 'America/New_York' },
      });
      expect(result.schedule.cronExpression).toBe('0 0 * * *');
      expect(result.schedule.timezone).toBe('America/New_York');
    });

    test('applies normalizeAutomationConfigForSave under the hood', () => {
      const result = normalizeAutomationConfigItemForSave({
        enabled: 'true',
        runsPerDayLimit: 10,
      });
      expect(result.enabled).toBe(true);
      expect(result.runsPerDayLimit).toBe(10);
    });
  });

  describe('buildPostPrompt', () => {
    test('includes style guide and context', () => {
      const result = buildPostPrompt({
        styleGuide: 'Keep it short.',
        ctx: { topic: 'testing' },
        citationsEnabled: false,
      });
      expect(result).toContain('Keep it short.');
      expect(result).toContain('"topic"');
      expect(result).toContain('testing');
      expect(result).toContain('Return JSON');
    });

    test('includes sources section when citationsEnabled is true', () => {
      const result = buildPostPrompt({
        styleGuide: '',
        ctx: {},
        citationsEnabled: true,
      });
      expect(result).toContain("Sources");
    });

    test('omits sources section when citationsEnabled is false', () => {
      const result = buildPostPrompt({
        styleGuide: '',
        ctx: {},
        citationsEnabled: false,
      });
      expect(result).not.toContain("Sources");
    });

    test('handles missing optional fields gracefully', () => {
      const result = buildPostPrompt({});
      expect(result).toContain('Return JSON');
    });
  });

  describe('buildImagePrompt', () => {
    test('returns cover image prompt', () => {
      const result = buildImagePrompt({ kind: 'cover', title: 'My Post' });
      expect(result).toContain('cover image');
      expect(result).toContain('My Post');
      expect(result).not.toContain('inline');
    });

    test('returns inline image prompt', () => {
      const result = buildImagePrompt({ kind: 'inline', title: 'My Post' });
      expect(result).toContain('inline illustrative');
      expect(result).toContain('My Post');
    });

    test('appends extra instructions when provided', () => {
      const result = buildImagePrompt({
        kind: 'cover',
        title: 'Test',
        extraInstruction: 'Use blue tones',
      });
      expect(result).toContain('Extra instructions');
      expect(result).toContain('Use blue tones');
    });

    test('handles missing extraInstruction', () => {
      const result = buildImagePrompt({ kind: 'cover', title: 'Test' });
      expect(result).not.toContain('Extra instructions');
    });
  });
});
