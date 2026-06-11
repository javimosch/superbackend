jest.mock('../models/Experiment');
jest.mock('../models/ExperimentEvent');
jest.mock('../models/ExperimentMetricBucket');
jest.mock('./experiments.service');
jest.mock('./experimentsWs.service');
jest.mock('./webhook.service');

const { floorToBucket } = require('./experimentsAggregation.service');

describe('experimentsAggregation.service', () => {
  describe('floorToBucket', () => {
    test('floors date to bucket boundary', () => {
      const date = new Date('2024-06-11T10:15:30.000Z');
      const result = floorToBucket(date, 3600000);
      expect(result).toEqual(new Date('2024-06-11T10:00:00.000Z'));
    });

    test('returns same time for exact bucket boundary', () => {
      const date = new Date('2024-06-11T10:00:00.000Z');
      const result = floorToBucket(date, 3600000);
      expect(result).toEqual(new Date('2024-06-11T10:00:00.000Z'));
    });

    test('handles 15-minute buckets', () => {
      const date = new Date('2024-06-11T10:17:00.000Z');
      const result = floorToBucket(date, 900000);
      expect(result).toEqual(new Date('2024-06-11T10:15:00.000Z'));
    });

    test('handles 1-minute buckets', () => {
      const date = new Date('2024-06-11T10:15:37.000Z');
      const result = floorToBucket(date, 60000);
      expect(result).toEqual(new Date('2024-06-11T10:15:00.000Z'));
    });

    test('returns null for invalid date', () => {
      expect(floorToBucket('not-a-date', 3600000)).toBeNull();
    });

    test('returns null for zero or negative bucketMs', () => {
      const date = new Date('2024-06-11T10:15:00.000Z');
      expect(floorToBucket(date, 0)).toBeNull();
      expect(floorToBucket(date, -1)).toBeNull();
    });

    test('returns null for null/undefined/NaN bucketMs', () => {
      const date = new Date('2024-06-11T10:15:00.000Z');
      expect(floorToBucket(date, null)).toBeNull();
      expect(floorToBucket(date, undefined)).toBeNull();
      expect(floorToBucket(date, NaN)).toBeNull();
    });

    test('handles empty string date', () => {
      const result = floorToBucket('', 3600000);
      expect(result).toBeNull();
    });
  });
});
