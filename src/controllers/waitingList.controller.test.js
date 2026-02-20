const { subscribe, getStats } = require('./waitingList.controller');
const waitingListService = require('../services/waitingListJson.service');
const { validateEmail, sanitizeString } = require('../utils/validation');

// Mock dependencies
jest.mock('../services/waitingListJson.service');
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
        id: 'entry123',
        email: 'test@example.com',
        type: 'buyer',
        referralSource: 'google',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      waitingListService.addWaitingListEntry.mockResolvedValue(mockWaitingListEntry);

      await subscribe(mockReq, mockRes);

      expect(waitingListService.addWaitingListEntry).toHaveBeenCalledWith({
        email: 'test@example.com',
        type: 'buyer',
        referralSource: 'google'
      });
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Successfully joined the waiting list!',
        data: {
          id: 'entry123',
          type: 'buyer',
          referralSource: 'google',
          status: 'active',
          createdAt: mockWaitingListEntry.createdAt,
          updatedAt: mockWaitingListEntry.updatedAt
        }
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

    test('should return 409 when email already exists', async () => {
      mockReq.body = {
        email: 'existing@example.com',
        type: 'buyer'
      };

      const duplicateError = new Error('This email is already on our waiting list');
      duplicateError.code = 'DUPLICATE';
      
      waitingListService.addWaitingListEntry.mockRejectedValue(duplicateError);

      await subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'This email is already on our waiting list',
        field: 'email'
      });
    });

    test('should handle service validation errors', async () => {
      mockReq.body = {
        email: 'test@example.com',
        type: 'buyer'
      };

      const validationError = new Error('Invalid entry data');
      validationError.code = 'VALIDATION';
      
      waitingListService.addWaitingListEntry.mockRejectedValue(validationError);

      await subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid entry data',
        field: 'general'
      });
    });

    test('should handle general server errors', async () => {
      mockReq.body = {
        email: 'test@example.com',
        type: 'buyer'
      };

      const serverError = new Error('Service unavailable');
      waitingListService.addWaitingListEntry.mockRejectedValue(serverError);

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

      const mockEntry = { id: 'test', type: 'seller' };
      waitingListService.addWaitingListEntry.mockResolvedValue(mockEntry);
      
      sanitizeString.mockImplementation((str) => str || '');

      await subscribe(mockReq, mockRes);

      expect(waitingListService.addWaitingListEntry).toHaveBeenCalledWith({
        email: 'test@example.com',
        type: 'seller',
        referralSource: 'website'
      });
    });

    test('should handle initialization failures gracefully', async () => {
      mockReq.body = {
        email: 'test@example.com',
        type: 'buyer'
      };

      const initError = new Error('Failed to initialize waiting list data structure');
      initError.code = 'INITIALIZATION_FAILED';
      
      waitingListService.addWaitingListEntry.mockRejectedValue(initError);

      await subscribe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Service temporarily unavailable - please try again',
        field: 'general'
      });
    });

    test('should not return email in response for privacy', async () => {
      mockReq.body = {
        email: 'private@example.com',
        type: 'buyer'
      };

      const mockEntry = {
        id: 'entry123',
        email: 'private@example.com',
        type: 'buyer'
      };
      waitingListService.addWaitingListEntry.mockResolvedValue(mockEntry);

      await subscribe(mockReq, mockRes);

      const responseData = mockRes.json.mock.calls[0][0].data;
      expect(responseData).not.toHaveProperty('email');
      expect(responseData).toHaveProperty('id');
      expect(responseData).toHaveProperty('type');
    });
  });

  describe('getStats', () => {
    test('should return waiting list statistics from service', async () => {
      const mockStats = {
        totalSubscribers: 1000,
        buyerCount: 600,
        sellerCount: 500,
        typeCounts: {
          buyer: 600,
          seller: 500,
          both: 100,
        },
        growthThisWeek: 50,
        lastUpdated: '2023-01-01T00:00:00.000Z'
      };

      waitingListService.getWaitingListStats.mockResolvedValue(mockStats);

      await getStats(mockReq, mockRes);

      expect(waitingListService.getWaitingListStats).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(mockStats);
    });

    test('should handle service errors in getStats', async () => {
      const serviceError = new Error('Service unavailable');
      waitingListService.getWaitingListStats.mockRejectedValue(serviceError);

      await getStats(mockReq, mockRes);

      expect(mockConsoleError).toHaveBeenCalledWith('Waiting list stats error:', serviceError);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unable to load statistics',
        field: 'general'
      });
    });
  });
});