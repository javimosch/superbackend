jest.mock('mongoose');
jest.mock('../models/Experiment');
jest.mock('../models/ExperimentAssignment');
jest.mock('../models/ExperimentEvent');
jest.mock('./cacheLayer.service');
jest.mock('./jsonConfigs.service');

const experimentsService = require('./experiments.service');

describe('experiments.service', () => {
  describe('computeSubjectKey', () => {
    test('returns correct key with orgId', () => {
      const key = experimentsService.computeSubjectKey({
        orgId: '507f1f77bcf86cd799439011',
        subjectId: 'user123'
      });
      expect(key).toBe('org:507f1f77bcf86cd799439011:subject:user123');
    });

    test('returns correct key without orgId (global)', () => {
      const key = experimentsService.computeSubjectKey({
        subjectId: 'user123'
      });
      expect(key).toBe('org:global:subject:user123');
    });

    test('returns correct key with null orgId', () => {
      const key = experimentsService.computeSubjectKey({
        orgId: null,
        subjectId: 'user123'
      });
      expect(key).toBe('org:global:subject:user123');
    });

    test('returns correct key with undefined orgId', () => {
      const key = experimentsService.computeSubjectKey({
        orgId: undefined,
        subjectId: 'user123'
      });
      expect(key).toBe('org:global:subject:user123');
    });

    test('trims subjectId', () => {
      const key = experimentsService.computeSubjectKey({
        orgId: 'org1',
        subjectId: '  user123  '
      });
      expect(key).toBe('org:org1:subject:user123');
    });
  });
});
