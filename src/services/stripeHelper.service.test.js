const StripeCatalogItem = require('../models/StripeCatalogItem');
const globalSettingsService = require('./globalSettings.service');
const stripeHelper = require('./stripeHelper.service');

jest.mock('../models/StripeCatalogItem');
jest.mock('./globalSettings.service');
jest.mock('stripe', () => {
  return jest.fn().mockReturnValue({
    prices: {
      list: jest.fn(),
      create: jest.fn(),
      retrieve: jest.fn()
    },
    products: {
      create: jest.fn(),
      update: jest.fn()
    }
  });
});

describe('stripeHelper.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stripeHelper.resetStripeClient();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID_CREATOR;
    delete process.env.STRIPE_PRICE_ID_PRO;
  });

  describe('getStripeSecretKey', () => {
    test('returns key from environment variable', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_env';
      const key = await stripeHelper.getStripeSecretKey();
      expect(key).toBe('sk_test_env');
    });

    test('returns key from global settings if env not set', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue('sk_test_setting');
      const key = await stripeHelper.getStripeSecretKey();
      expect(key).toBe('sk_test_setting');
    });
  });

  describe('isStripeConfigured', () => {
    test('returns true for valid secret key', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      expect(await stripeHelper.isStripeConfigured()).toBe(true);
    });

    test('returns false for invalid secret key', async () => {
      process.env.STRIPE_SECRET_KEY = 'invalid';
      expect(await stripeHelper.isStripeConfigured()).toBe(false);
    });
  });

  describe('getStripeClient', () => {
    test('returns null if key not starting with sk_', async () => {
      process.env.STRIPE_SECRET_KEY = 'pk_test';
      const client = await stripeHelper.getStripeClient();
      expect(client).toBeNull();
    });

    test('returns cached client if key hasn\'t changed', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_1';
      const client1 = await stripeHelper.getStripeClient();
      const client2 = await stripeHelper.getStripeClient();
      expect(client1).toBe(client2);
    });
  });

  describe('resolvePlanKeyFromPriceId', () => {
    test('returns free for null priceId', async () => {
      expect(await stripeHelper.resolvePlanKeyFromPriceId(null)).toBe('free');
    });

    test('returns planKey from catalog item', async () => {
      StripeCatalogItem.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ planKey: 'enterprise' })
      });
      const plan = await stripeHelper.resolvePlanKeyFromPriceId('price_123');
      expect(plan).toBe('enterprise');
    });

    test('falls back to environment variables', async () => {
      StripeCatalogItem.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
      const plan = await stripeHelper.resolvePlanKeyFromPriceId('price_pro');
      expect(plan).toBe('pro');
    });

    test('defaults to creator for unknown price', async () => {
      StripeCatalogItem.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      const plan = await stripeHelper.resolvePlanKeyFromPriceId('unknown');
      expect(plan).toBe('creator');
    });
  });

  describe('findExistingPrice', () => {
    test('returns matching one-time price', async () => {
      const stripe = {
        prices: {
          list: jest.fn().mockResolvedValue({
            data: [{ id: 'p1', unit_amount: 1000, type: 'one_time' }]
          })
        }
      };
      const result = await stripeHelper.findExistingPrice(stripe, 'prod1', 'usd', 1000, null);
      expect(result.id).toBe('p1');
    });

    test('returns matching recurring price', async () => {
      const stripe = {
        prices: {
          list: jest.fn().mockResolvedValue({
            data: [{ 
              id: 'p2', 
              unit_amount: 2000, 
              type: 'recurring',
              recurring: { interval: 'month', interval_count: 1 }
            }]
          })
        }
      };
      const result = await stripeHelper.findExistingPrice(stripe, 'prod1', 'usd', 2000, { interval: 'month' });
      expect(result.id).toBe('p2');
    });
  });
});
