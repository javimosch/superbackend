jest.mock('../services/experimentsAggregation.service', () => ({
  runAggregationAndWinner: jest.fn()
}));
jest.mock('../services/experimentsRetention.service', () => ({
  runRetentionCleanup: jest.fn()
}));

const { runAggregation, runRetention } = require('./internalExperiments.controller');
const experimentsAggregation = require('../services/experimentsAggregation.service');
const experimentsRetention = require('../services/experimentsRetention.service');

describe('internalExperiments.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { body: {} };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('runAggregation', () => {
    test('returns aggregation data on success', async () => {
      experimentsAggregation.runAggregationAndWinner.mockResolvedValue({ winner: 'A', data: [] });
      mockReq.body = { bucketMs: 3600000, start: '2024-01-01', end: '2024-01-31' };

      await runAggregation(mockReq, mockRes);

      expect(experimentsAggregation.runAggregationAndWinner).toHaveBeenCalledWith({
        bucketMs: 3600000, start: '2024-01-01', end: '2024-01-31'
      });
      expect(mockRes.json).toHaveBeenCalledWith({ winner: 'A', data: [] });
    });

    test('handles missing body gracefully', async () => {
      experimentsAggregation.runAggregationAndWinner.mockResolvedValue({ winner: null, data: [] });
      mockReq.body = undefined;

      await runAggregation(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ winner: null, data: [] });
    });

    test('returns error on failure', async () => {
      experimentsAggregation.runAggregationAndWinner.mockRejectedValue(new Error('DB error'));

      await runAggregation(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'DB error' });
    });
  });

  describe('runRetention', () => {
    test('returns retention cleanup data on success', async () => {
      experimentsRetention.runRetentionCleanup.mockResolvedValue({ deletedCount: 5 });

      await runRetention(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ deletedCount: 5 });
    });

    test('returns error on failure', async () => {
      experimentsRetention.runRetentionCleanup.mockRejectedValue(new Error('Cleanup failed'));

      await runRetention(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Cleanup failed' });
    });
  });
});
