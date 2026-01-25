const controller = require('./adminStats.controller');
const User = require('../models/User');
const Organization = require('../models/Organization');
const AuditEvent = require('../models/AuditEvent');
const ErrorAggregate = require('../models/ErrorAggregate');
const Asset = require('../models/Asset');
const EmailLog = require('../models/EmailLog');
const VirtualEjsFile = require('../models/VirtualEjsFile');
const JsonConfig = require('../models/JsonConfig');
const StripeCatalogItem = require('../models/StripeCatalogItem');
const Workflow = require('../models/Workflow');
const FormSubmission = require('../models/FormSubmission');
const WaitingList = require('../models/WaitingList');

jest.mock('../models/User');
jest.mock('../models/Organization');
jest.mock('../models/AuditEvent');
jest.mock('../models/ErrorAggregate');
jest.mock('../models/Asset');
jest.mock('../models/FormSubmission');
jest.mock('../models/WaitingList');
jest.mock('../models/EmailLog');
jest.mock('../models/VirtualEjsFile');
jest.mock('../models/JsonConfig');
jest.mock('../models/StripeCatalogItem');
jest.mock('../models/Workflow');
jest.mock('../models/Invite', () => ({
  countDocuments: jest.fn().mockResolvedValue(0)
}), { virtual: true });

describe('adminStats.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('getOverviewStats', () => {
    test('returns aggregate statistics successfully', async () => {
      // Mock all the countDocuments calls
      User.countDocuments.mockResolvedValue(100);
      Organization.countDocuments.mockResolvedValue(10);
      ErrorAggregate.countDocuments.mockResolvedValue(5);
      AuditEvent.countDocuments.mockResolvedValue(50);
      EmailLog.countDocuments.mockResolvedValue(200);
      Asset.countDocuments.mockResolvedValue(300);
      VirtualEjsFile.countDocuments.mockResolvedValue(15);
      JsonConfig.countDocuments.mockResolvedValue(8);
      FormSubmission.countDocuments.mockResolvedValue(25);
      WaitingList.countDocuments.mockResolvedValue(12);
      StripeCatalogItem.countDocuments.mockResolvedValue(3);
      Workflow.countDocuments.mockResolvedValue(4);

      // Mock recent activity
      const mockActivity = [{ action: 'test' }];
      AuditEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockActivity)
      });

      await controller.getOverviewStats(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        categories: expect.any(Object),
        recentActivity: mockActivity,
        timeSeries: expect.any(Array)
      }));
    });

    test('handles errors during stats aggregation', async () => {
      User.countDocuments.mockRejectedValue(new Error('DB Error'));

      await controller.getOverviewStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch overview stats' });
    });
  });
});
