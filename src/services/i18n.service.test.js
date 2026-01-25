jest.mock('fs');
jest.mock('path');
jest.mock('crypto');
jest.mock('../models/I18nLocale', () => ({
  findOne: jest.fn(),
  find: jest.fn()
}));
jest.mock('../models/I18nEntry', () => ({
  find: jest.fn(() => ({ 
    select: jest.fn().mockReturnThis(),
    lean: jest.fn() 
  })),
  findOne: jest.fn(() => ({
    lean: jest.fn()
  })),
  create: jest.fn(),
  updateOne: jest.fn(),
  deleteMany: jest.fn()
}));
jest.mock('./globalSettings.service', () => ({
  getSettingValue: jest.fn()
}));
jest.mock('./audit.service', () => ({
  createAuditEvent: jest.fn()
}));

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const I18nLocale = require('../models/I18nLocale');
const I18nEntry = require('../models/I18nEntry');
const { getSettingValue } = require('./globalSettings.service');
const { createAuditEvent } = require('./audit.service');
const i18nService = require('./i18n.service');

// These utility functions are not exported, so we'll test them indirectly
// through the public methods that use them

describe('i18n.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear cache
    i18nService.clearCache?.();
  });

  describe('resolveLocaleFromRequest', () => {
    test('extracts from cookie', () => {
      const req = {
        headers: {
          cookie: 'lang=fr; other=value'
        }
      };

      const locale = i18nService.resolveLocaleFromRequest(req);
      
      expect(locale).toBe('fr');
    });

    test('handles URL encoded cookie', () => {
      const req = {
        headers: {
          cookie: 'lang=fr%20FR'
        }
      };

      const locale = i18nService.resolveLocaleFromRequest(req);
      
      expect(locale).toBe('fr FR');
    });

    test('extracts from query parameter', () => {
      const req = {
        headers: {},
        query: {
          lang: 'es'
        }
      };

      const locale = i18nService.resolveLocaleFromRequest(req);
      
      expect(locale).toBe('es');
    });

    test('extracts from Accept-Language header', () => {
      const req = {
        headers: {
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8'
        }
      };

      const locale = i18nService.resolveLocaleFromRequest(req);
      
      expect(locale).toBe('fr-FR');
    });

    test('returns null when no locale found', () => {
      const req = {
        headers: {},
        query: {}
      };

      const locale = i18nService.resolveLocaleFromRequest(req);
      
      expect(locale).toBeNull();
    });

    test('prioritizes cookie over query and header', () => {
      const req = {
        headers: {
          cookie: 'lang=fr',
          'accept-language': 'en-US'
        },
        query: {
          lang: 'es'
        }
      };

      const locale = i18nService.resolveLocaleFromRequest(req);
      
      expect(locale).toBe('fr');
    });
  });

  describe('getDefaultLocaleCode', () => {
    test('returns from environment first', async () => {
      process.env.I18N_DEFAULT_LOCALE = 'fr';
      
      const locale = await i18nService.getDefaultLocaleCode();
      
      expect(locale).toBe('fr');
    });

    test('returns from settings second', async () => {
      delete process.env.I18N_DEFAULT_LOCALE;
      getSettingValue.mockResolvedValue('es');
      
      const locale = await i18nService.getDefaultLocaleCode();
      
      expect(locale).toBe('es');
      expect(getSettingValue).toHaveBeenCalledWith('i18n.defaultLocale', null);
    });

    test('returns default locale from database', async () => {
      delete process.env.I18N_DEFAULT_LOCALE;
      getSettingValue.mockResolvedValue(null);
      I18nLocale.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ code: 'de' }) });

      const locale = await i18nService.getDefaultLocaleCode();
      
      expect(locale).toBe('de');
      expect(I18nLocale.findOne).toHaveBeenCalledWith({ isDefault: true });
    });

    test('returns first enabled locale', async () => {
      delete process.env.I18N_DEFAULT_LOCALE;
      getSettingValue.mockResolvedValue(null);
      I18nLocale.findOne
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce({ 
          sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ code: 'it' }) })
        });

      const locale = await i18nService.getDefaultLocaleCode();
      
      expect(locale).toBe('it');
      expect(I18nLocale.findOne).toHaveBeenCalledWith({ enabled: true });
    });

    test('falls back to en', async () => {
      delete process.env.I18N_DEFAULT_LOCALE;
      getSettingValue.mockResolvedValue(null);
      I18nLocale.findOne
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce({ 
          sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) })
        });

      const locale = await i18nService.getDefaultLocaleCode();
      
      expect(locale).toBe('en');
    });
  });

  describe('getBundle', () => {
    test('returns bundle with entries and defaults', async () => {
      const mockEntries = [
        { key: 'hello', value: 'Bonjour' },
        { key: 'bye', value: 'Au revoir' }
      ];
      I18nEntry.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockEntries)
      });
      process.env.I18N_DEFAULT_LOCALE = 'en';

      const bundle = await i18nService.getBundle('fr');

      expect(bundle.locale).toBe('fr');
      expect(bundle.entries.hello).toBe('Bonjour');
      expect(bundle.entries.bye).toBe('Au revoir');
    });
  });

  describe('t', () => {
    test('translates key with interpolation', async () => {
      const mockEntry = { key: 'greet', value: 'Hello {name}!', valueFormat: 'text' };
      I18nEntry.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(mockEntry) });
      process.env.I18N_DEFAULT_LOCALE = 'en';

      const result = await i18nService.t({ key: 'greet', locale: 'en', vars: { name: 'World' } });

      expect(result.text).toBe('Hello World!');
      expect(result.html).toBe(false);
    });

    test('falls back to default locale if key missing in requested locale', async () => {
      I18nEntry.findOne
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) }) // fr lookup
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ value: 'Fallback' }) }); // en lookup
      
      process.env.I18N_DEFAULT_LOCALE = 'en';

      const result = await i18nService.t({ key: 'missing', locale: 'fr' });

      expect(result.text).toBe('Fallback');
    });
  });

  describe('seedFromJsonFiles', () => {
    test('seeds entries from directory', async () => {
      const locales = ['en'];
      const baseDir = '/i18n';
      const mockJson = JSON.stringify({ welcome: 'Welcome', nested: { key: 'Val' } });
      
      fs.readFileSync.mockReturnValue(mockJson);
      path.join.mockImplementation((...args) => args.join('/'));
      I18nLocale.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ code: 'en' }]) });
      I18nLocale.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ code: 'en', isDefault: true }) });
      I18nEntry.findOne.mockResolvedValue(null);
      I18nEntry.create.mockResolvedValue({});
      
      crypto.createHash.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('hash')
      });

      const summary = await i18nService.seedFromJsonFiles({ baseDir, locales });

      expect(summary.inserted).toBe(2);
      expect(I18nEntry.create).toHaveBeenCalledTimes(2);
      expect(createAuditEvent).toHaveBeenCalled();
    });
  });
});
