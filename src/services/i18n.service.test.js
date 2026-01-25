jest.mock('fs');
jest.mock('path');
jest.mock('crypto');
jest.mock('../models/I18nLocale', () => ({
  findOne: jest.fn()
}));
jest.mock('../models/I18nEntry', () => ({
  find: jest.fn(() => ({ lean: jest.fn() })),
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
});
