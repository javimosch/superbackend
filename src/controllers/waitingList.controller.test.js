const { subscribe, getStats } = require('./waitingList.controller');
const WaitingList = require('../models/WaitingList');
const { validateEmail, sanitizeString } = require('../utils/validation');

// Mock dependencies
jest.mock('../models/WaitingList');
jest.mock('../utils/validation');

// Mock console methods
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('WaitingList Controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      body: {}
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Setup default mock implementations
    sanitizeString.mockImplementation((str) => str || '');
    validateEmail.mockReturnValue(true);
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
  });

  describe('subscribe', () => {
    test('should subscribe to waiting list successfully', async () => {
      mockReq.body = {
        email: 'test@example.com',
        type: 'buyer',
        referralSource: 'google'
      };

      const mockWaitingListEntry = {
        email: 'test@example.com',
        type: 'buyer',
        referralSource: 'google',
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({
          _id: 'entry123',
          type: 'buyer',
          referralSource: 'google',
          email: 'test@example.com'
        })
      };

      WaitingList.findOne.mockResolvedValue(null); // No existing entry
      WaitingList.mockImplementation(() => mockWaitingListEntry);
      sanitizeString.mockReturnValueOnce('test@example.com').mockReturnValueOnce('google');

      await subscribe(mockReq, mockRes);

      expect(validateEmail).toHaveBeenCalledWith('test@example.com');
      expect(WaitingList.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockWaitingListEntry.save).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Successfully joined the waiting list!',
        data: expect.objectContaining({
          _id: 'entry123',
          type: 'buyer',
          referralSource: 'google'
        })
      });
    });

    test('should return 400 when email is missing', async () => {
      mockReq.body = { type: 'buyer' };

      await subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Email address is required',
        field: 'email'
      });
    });

    test('should return 400 when email is invalid', async () => {
      mockReq.body = {
        email: 'invalid-email',
        type: 'buyer'
      };

      sanitizeString.mockReturnValue('invalid-email');
      validateEmail.mockReturnValue(false);

      await subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Please enter a valid email address',
        field: 'email'
      });
    });

    test('should return 400 when type is missing', async () => {
      mockReq.body = { email: 'test@example.com' };

      await subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Please select your interest type',
        field: 'type'
      });
    });

    test('should accept any non-empty type string', async () => {
      const validTypes = ['buyer', 'seller', 'both', 'partner', 'agency'];
      
      for (const type of validTypes) {
        mockReq.body = {
          email: 'test@example.com',
          type: type
        };

        const mockEntry = {
          save: jest.fn().mockResolvedValue(),
          toJSON: jest.fn().mockReturnValue({ _id: 'test', type })
        };

        WaitingList.findOne.mockResolvedValue(null);
        WaitingList.mockImplementation(() => mockEntry);

        await subscribe(mockReq, mockRes);

        expect(WaitingList).toHaveBeenCalledWith(expect.objectContaining({
          type: type
        }));
      }
    });

    test('should return 409 when email already exists', async () => {
      mockReq.body = {
        email: 'existing@example.com',
        type: 'buyer'
      };

      WaitingList.findOne.mockResolvedValue({ email: 'existing@example.com' });

      await subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'This email is already on our waiting list',
        field: 'email'
      });
    });

    test('should handle duplicate key error (MongoDB)', async () => {
      mockReq.body = {
        email: 'test@example.com',
        type: 'buyer'
      };

      const duplicateError = new Error('Duplicate key error');
      duplicateError.code = 11000;

      WaitingList.findOne.mockResolvedValue(null);
      WaitingList.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(duplicateError)
      }));

      await subscribe(mockReq, mockRes);

      expect(mockConsoleError).toHaveBeenCalledWith('Waiting list subscription error:', duplicateError);
      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'This email is already on our waiting list',
        field: 'email'
      });
    });

    test('should handle validation error', async () => {
      mockReq.body = {
        email: 'test@example.com',
        type: 'buyer'
      };

      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';
      validationError.errors = {
        email: { message: 'Email format is invalid' }
      };

      WaitingList.findOne.mockResolvedValue(null);
      WaitingList.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(validationError)
      }));

      await subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Email format is invalid',
        field: 'email'
      });
    });

    test('should handle general server errors', async () => {
      mockReq.body = {
        email: 'test@example.com',
        type: 'buyer'
      };

      const serverError = new Error('Database connection lost');

      WaitingList.findOne.mockResolvedValue(null);
      WaitingList.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(serverError)
      }));

      await subscribe(mockReq, mockRes);

      expect(mockConsoleError).toHaveBeenCalledWith('Waiting list subscription error:', serverError);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Something went wrong. Please try again later.',
        field: 'general'
      });
    });

    test('should use default referralSource when not provided', async () => {
      mockReq.body = {
        email: 'test@example.com',
        type: 'seller'
      };

      const mockEntry = {
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({ _id: 'test' })
      };

      WaitingList.findOne.mockResolvedValue(null);
      WaitingList.mockImplementation(() => mockEntry);
      
      // Reset mock and set up specific calls
      sanitizeString.mockClear();
      sanitizeString.mockImplementation((str) => {
        if (str === 'test@example.com') return 'test@example.com';
        if (str === 'seller') return 'seller';
        if (str === undefined) return 'website';
        return str || '';
      });

      await subscribe(mockReq, mockRes);

      expect(WaitingList).toHaveBeenCalledWith({
        email: 'test@example.com',
        type: 'seller',
        referralSource: 'website'
      });
    });

    test('should sanitize and lowercase email', async () => {
      mockReq.body = {
        email: 'TEST@EXAMPLE.COM',
        type: 'both'
      };

      const mockEntry = {
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({ _id: 'test' })
      };

      WaitingList.findOne.mockResolvedValue(null);
      WaitingList.mockImplementation(() => mockEntry);
      
      // Reset mock and set up specific calls
      sanitizeString.mockClear();
      sanitizeString.mockImplementation((str) => {
        if (str === 'TEST@EXAMPLE.COM') return 'test@example.com';
        if (str === 'both') return 'both';
        return str || '';
      });

      await subscribe(mockReq, mockRes);

      expect(WaitingList.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(WaitingList).toHaveBeenCalledWith(expect.objectContaining({
        email: 'test@example.com'
      }));
    });

    test('should not return email in response for privacy', async () => {
      mockReq.body = {
        email: 'private@example.com',
        type: 'buyer'
      };

      const mockEntry = {
        save: jest.fn().mockResolvedValue(),
        toJSON: jest.fn().mockReturnValue({
          _id: 'entry123',
          email: 'private@example.com',
          type: 'buyer'
        })
      };

      WaitingList.findOne.mockResolvedValue(null);
      WaitingList.mockImplementation(() => mockEntry);

      await subscribe(mockReq, mockRes);

      const responseData = mockRes.json.mock.calls[0][0].data;
      expect(responseData).not.toHaveProperty('email');
      expect(responseData).toHaveProperty('_id');
      expect(responseData).toHaveProperty('type');
    });
  });

  describe('getStats', () => {
    test('should return waiting list statistics', async () => {
      WaitingList.countDocuments
        .mockResolvedValueOnce(1000); // total

      WaitingList.aggregate.mockResolvedValue([
        { _id: 'buyer', count: 600 },
        { _id: 'seller', count: 500 },
        { _id: 'partner', count: 10 },
      ]);

      await getStats(mockReq, mockRes);

      expect(WaitingList.countDocuments).toHaveBeenCalledWith({ status: 'active' });
      expect(WaitingList.aggregate).toHaveBeenCalledWith([
        { $match: { status: 'active' } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]);

      expect(mockRes.json).toHaveBeenCalledWith({
        totalSubscribers: 1000,
        buyerCount: 600,
        sellerCount: 500,
        typeCounts: {
          buyer: 600,
          seller: 500,
          partner: 10,
        },
        growthThisWeek: 50, // 5% of 1000
        lastUpdated: expect.any(String)
      });
    });

    test('should handle zero subscribers', async () => {
      WaitingList.countDocuments.mockResolvedValue(0);
      WaitingList.aggregate.mockResolvedValue([]);

      await getStats(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        totalSubscribers: 0,
        buyerCount: 0,
        sellerCount: 0,
        typeCounts: {},
        growthThisWeek: 0
      }));
    });

    test('should handle database errors in getStats', async () => {
      const dbError = new Error('Database connection failed');
      WaitingList.countDocuments.mockRejectedValue(dbError);

      await getStats(mockReq, mockRes);

      expect(mockConsoleError).toHaveBeenCalledWith('Waiting list stats error:', dbError);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unable to load statistics',
        field: 'general'
      });
    });

    test('should include lastUpdated timestamp', async () => {
      WaitingList.countDocuments.mockResolvedValue(100);
      WaitingList.aggregate.mockResolvedValue([]);

      const before = new Date().toISOString();
      await getStats(mockReq, mockRes);
      const after = new Date().toISOString();

      const response = mockRes.json.mock.calls[0][0];
      expect(response.lastUpdated).toBeDefined();
      expect(response.lastUpdated >= before).toBe(true);
      expect(response.lastUpdated <= after).toBe(true);
    });

    test('should calculate growth percentage correctly', async () => {
      const testCases = [
        { total: 100, expectedGrowth: 5 },
        { total: 200, expectedGrowth: 10 },
        { total: 50, expectedGrowth: 2 }
      ];

      for (const testCase of testCases) {
        WaitingList.countDocuments.mockResolvedValue(testCase.total);
        WaitingList.aggregate.mockResolvedValue([]);

        await getStats(mockReq, mockRes);

        const response = mockRes.json.mock.calls[mockRes.json.mock.calls.length - 1][0];
        expect(response.growthThisWeek).toBe(testCase.expectedGrowth);
      }
    });
  });
});