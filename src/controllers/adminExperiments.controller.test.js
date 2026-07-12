const mongoose = require('mongoose');
const controller = require('./adminExperiments.controller');

// Mongoose Query mock: findById() / find() return queries with .lean(), .sort(), etc.
function mockResolve(val) {
  return { lean: jest.fn().mockResolvedValue(val) };
}
function mockReject(err) {
  return { lean: jest.fn().mockImplementation(() => Promise.reject(err)) };
}

function mockSortResolve(val) {
  return { sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(val) }) };
}
function mockSortReject(err) {
  return { sort: jest.fn().mockReturnValue({ lean: jest.fn().mockImplementation(() => Promise.reject(err)) }) };
}

// Shared mock document factory for update/remove tests
const createMockDoc = (overrides = {}) => {
  const doc = {
    _id: 'exp123',
    organizationId: 'org123',
    code: 'test-exp',
    name: 'Test Experiment',
    description: 'A test experiment',
    status: 'draft',
    variants: [],
    primaryMetric: { key: 'click', kind: 'count', objective: 'maximize' },
    secondaryMetrics: [],
    winnerPolicy: { mode: 'manual' },
    ...overrides,
  };
  doc.save = jest.fn().mockResolvedValue(doc);
  doc.toObject = jest.fn().mockReturnValue({ _id: doc._id, code: doc.code, name: doc.name, status: doc.status });
  return doc;
};

// Mock models
jest.mock('../models/Experiment', () => ({ find: jest.fn(), findById: jest.fn(), create: jest.fn() }));
jest.mock('../models/ExperimentMetricBucket', () => ({ find: jest.fn() }));
jest.mock('../services/experiments.service', () => ({ clearExperimentCaches: jest.fn().mockResolvedValue() }));

const Experiment = require('../models/Experiment');
const ExperimentMetricBucket = require('../models/ExperimentMetricBucket');
const experimentsService = require('../services/experiments.service');

describe('adminExperiments.controller helpers', () => {
  describe('toSafeJsonError', () => {
    test('VALIDATION → 400', () => {
      expect(controller._testHelpers.toSafeJsonError({ message: 'x', code: 'VALIDATION' }).status).toBe(400);
    });
    test('NOT_FOUND → 404', () => {
      expect(controller._testHelpers.toSafeJsonError({ message: 'x', code: 'NOT_FOUND' }).status).toBe(404);
    });
    test('CONFLICT → 409', () => {
      expect(controller._testHelpers.toSafeJsonError({ message: 'x', code: 'CONFLICT' }).status).toBe(409);
    });
    test('other → 500', () => {
      expect(controller._testHelpers.toSafeJsonError({ message: 'x', code: 'OTHER' }).status).toBe(500);
    });
    test('fallback message when none provided', () => {
      const r = controller._testHelpers.toSafeJsonError({});
      expect(r.body.error).toBe('Operation failed');
    });
    test('handles null', () => {
      expect(controller._testHelpers.toSafeJsonError(null).status).toBe(500);
    });
  });

  describe('isValidObjectId', () => {
    test('valid ObjectId', () => { expect(controller._testHelpers.isValidObjectId('507f1f77bcf86cd799439011')).toBe(true); });
    test('invalid string', () => { expect(controller._testHelpers.isValidObjectId('bad')).toBe(false); });
    test('empty string', () => { expect(controller._testHelpers.isValidObjectId('')).toBe(false); });
    test('null/undefined', () => {
      expect(controller._testHelpers.isValidObjectId(null)).toBe(false);
      expect(controller._testHelpers.isValidObjectId(undefined)).toBe(false);
    });
    test('number', () => { expect(controller._testHelpers.isValidObjectId(123)).toBe(false); });
  });

  describe('normalizeVariant', () => {
    test('returns normalized variant', () => {
      expect(controller._testHelpers.normalizeVariant({ key: 'c', weight: 50, configSlug: 's' }))
        .toEqual({ key: 'c', weight: 50, configSlug: 's' });
    });
    test('trims whitespace', () => {
      expect(controller._testHelpers.normalizeVariant({ key: '  v  ' }).key).toBe('v');
    });
    test('defaults weight to 0', () => {
      expect(controller._testHelpers.normalizeVariant({ key: 'v' }).weight).toBe(0);
    });
    test('NaN weight becomes 0', () => {
      expect(controller._testHelpers.normalizeVariant({ key: 'v', weight: NaN }).weight).toBe(0);
    });
    test('empty key returns null', () => {
      expect(controller._testHelpers.normalizeVariant({ key: '' })).toBeNull();
    });
    test('whitespace key returns null', () => {
      expect(controller._testHelpers.normalizeVariant({ key: '   ' })).toBeNull();
    });
    test('null/undefined returns null', () => {
      expect(controller._testHelpers.normalizeVariant(null)).toBeNull();
      expect(controller._testHelpers.normalizeVariant(undefined)).toBeNull();
    });
  });

  describe('normalizeMetric', () => {
    test('defaults', () => {
      expect(controller._testHelpers.normalizeMetric({ key: 'c' })).toEqual({
        key: 'c', kind: 'count', numeratorEventKey: '', denominatorEventKey: '', objective: 'maximize',
      });
    });
    test('preserves kind', () => {
      expect(controller._testHelpers.normalizeMetric({ key: 'r', kind: 'ratio' }).kind).toBe('ratio');
    });
    test('preserves numerator/denominator', () => {
      const r = controller._testHelpers.normalizeMetric({ key: 'c', kind: 'ratio', numeratorEventKey: 'n', denominatorEventKey: 'd' });
      expect(r.numeratorEventKey).toBe('n');
      expect(r.denominatorEventKey).toBe('d');
    });
    test('minimize objective', () => {
      expect(controller._testHelpers.normalizeMetric({ key: 'e', objective: 'minimize' }).objective).toBe('minimize');
    });
    test('default maximize', () => {
      expect(controller._testHelpers.normalizeMetric({ key: 'x', objective: 'other' }).objective).toBe('maximize');
    });
    test('empty key returns null', () => { expect(controller._testHelpers.normalizeMetric({ key: '' })).toBeNull(); });
    test('null/undefined returns null', () => {
      expect(controller._testHelpers.normalizeMetric(null)).toBeNull();
      expect(controller._testHelpers.normalizeMetric(undefined)).toBeNull();
    });
  });
});

describe('adminExperiments.controller methods', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    Experiment.find.mockReset();
    Experiment.findById.mockReset();
    Experiment.create.mockReset();
    ExperimentMetricBucket.find.mockReset();
    experimentsService.clearExperimentCaches.mockClear();

    mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockReq = { params: {}, query: {}, body: {}, user: { _id: 'user123' } };
  });

  describe('list', () => {
    test('returns all experiments', async () => {
      Experiment.find.mockReturnValue(mockSortResolve([{ _id: '1', code: 'a' }, { _id: '2', code: 'b' }]));
      await controller.list(mockReq, mockRes);
      expect(Experiment.find).toHaveBeenCalledWith({});
      expect(mockRes.json.mock.calls[0][0].items).toHaveLength(2);
    });

    test('filters by orgId', async () => {
      mockReq.query.orgId = 'org123';
      Experiment.find.mockReturnValue(mockSortResolve([]));
      await controller.list(mockReq, mockRes);
      expect(Experiment.find).toHaveBeenCalledWith({ organizationId: 'org123' });
    });

    test('handles errors', async () => {
      Experiment.find.mockReturnValue(mockSortReject(new Error('DB error')));
      await controller.list(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('get', () => {
    test('returns experiment by id', async () => {
      mockReq.params.id = 'exp123';
      Experiment.findById.mockReturnValue(mockResolve({ _id: 'exp123', code: 'test' }));
      await controller.get(mockReq, mockRes);
      expect(Experiment.findById).toHaveBeenCalledWith('exp123');
      expect(mockRes.json).toHaveBeenCalledWith({ item: { _id: 'exp123', code: 'test' } });
    });

    test('returns 404 when not found', async () => {
      mockReq.params.id = 'bad';
      Experiment.findById.mockReturnValue(mockResolve(null));
      await controller.get(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test('handles errors', async () => {
      mockReq.params.id = 'exp123';
      Experiment.findById.mockReturnValue(mockReject(new Error('DB error')));
      await controller.get(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('create', () => {
    const validBody = {
      code: 'test-exp', name: 'Test',
      variants: [{ key: 'c', weight: 50 }],
      primaryMetric: { key: 'click', kind: 'count' },
    };

    test('creates experiment successfully', async () => {
      mockReq.body = { ...validBody };
      Experiment.create.mockResolvedValue({ _id: 'new-exp', toObject: () => ({ _id: 'new-exp', code: 'test-exp' }) });
      await controller.create(mockReq, mockRes);
      expect(Experiment.create).toHaveBeenCalled();
      expect(experimentsService.clearExperimentCaches).toHaveBeenCalledWith('new-exp');
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 400 when code is empty', async () => {
      mockReq.body = { ...validBody, code: '' };
      await controller.create(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'code is required' });
    });

    test('returns 400 when primaryMetric key is empty', async () => {
      mockReq.body = { ...validBody, primaryMetric: { key: '' } };
      await controller.create(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 for invalid organizationId', async () => {
      mockReq.body = { ...validBody, organizationId: 'bad' };
      await controller.create(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid organizationId' });
    });

    test('accepts null organizationId', async () => {
      mockReq.body = { ...validBody, organizationId: null };
      Experiment.create.mockResolvedValue({ _id: 'e', toObject: () => ({ _id: 'e' }) });
      await controller.create(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('handles service errors', async () => {
      mockReq.body = { ...validBody };
      Experiment.create.mockRejectedValue({ message: 'Validation failed', code: 'VALIDATION' });
      await controller.create(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('update', () => {
    test('updates experiment fields', async () => {
      mockReq.params.id = 'exp123';
      mockReq.body = { name: 'Updated', status: 'running' };
      const doc = createMockDoc();
      Experiment.findById.mockResolvedValue(doc);
      await controller.update(mockReq, mockRes);
      expect(doc.name).toBe('Updated');
      expect(doc.status).toBe('running');
      expect(doc.save).toHaveBeenCalled();
      expect(experimentsService.clearExperimentCaches).toHaveBeenCalledWith('exp123');
    });

    test('returns 404 when not found', async () => {
      mockReq.params.id = 'bad';
      Experiment.findById.mockResolvedValue(null);
      await controller.update(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test('validates primaryMetric on update', async () => {
      mockReq.params.id = 'exp123';
      mockReq.body = { primaryMetric: { key: '' } };
      Experiment.findById.mockResolvedValue(createMockDoc());
      await controller.update(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('handles errors', async () => {
      mockReq.params.id = 'exp123';
      Experiment.findById.mockRejectedValue(new Error('DB error'));
      await controller.update(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('remove', () => {
    test('deletes experiment', async () => {
      mockReq.params.id = 'exp123';
      const doc = { _id: 'exp123', deleteOne: jest.fn().mockResolvedValue() };
      Experiment.findById.mockResolvedValue(doc);
      await controller.remove(mockReq, mockRes);
      expect(doc.deleteOne).toHaveBeenCalled();
      expect(experimentsService.clearExperimentCaches).toHaveBeenCalledWith('exp123');
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    test('returns 404 when not found', async () => {
      mockReq.params.id = 'bad';
      Experiment.findById.mockResolvedValue(null);
      await controller.remove(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test('handles errors', async () => {
      mockReq.params.id = 'exp123';
      Experiment.findById.mockRejectedValue(new Error('DB error'));
      await controller.remove(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getMetrics', () => {
    test('returns buckets', async () => {
      mockReq.params.id = 'exp123';
      const buckets = [{ bucketStart: new Date(), count: 5 }];
      ExperimentMetricBucket.find.mockReturnValue(mockSortResolve(buckets));
      await controller.getMetrics(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ buckets });
    });

    test('filters by date range', async () => {
      mockReq.params.id = 'exp123';
      mockReq.query.start = '2026-01-01T00:00:00Z';
      mockReq.query.end = '2026-06-01T00:00:00Z';
      ExperimentMetricBucket.find.mockReturnValue(mockSortResolve([]));
      await controller.getMetrics(mockReq, mockRes);
      const arg = ExperimentMetricBucket.find.mock.calls[0][0];
      expect(arg.experimentId).toBe('exp123');
      expect(arg.bucketStart.$gte).toBeInstanceOf(Date);
      expect(arg.bucketStart.$lte).toBeInstanceOf(Date);
    });

    test('handles errors', async () => {
      mockReq.params.id = 'exp123';
      ExperimentMetricBucket.find.mockReturnValue(mockSortReject(new Error('DB error')));
      await controller.getMetrics(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
