const controller = require('./superDemosPublic.controller');

jest.mock('../models/SuperDemoProject', () => ({
  findOne: jest.fn(),
}));

jest.mock('../models/SuperDemo', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../models/SuperDemoStep', () => ({
  find: jest.fn(),
}));

jest.mock('../services/uiComponentsCrypto.service', () => ({
  verifyKey: jest.fn(),
}));

const SuperDemoProject = require('../models/SuperDemoProject');
const SuperDemo = require('../models/SuperDemo');
const SuperDemoStep = require('../models/SuperDemoStep');
const { verifyKey } = require('../services/uiComponentsCrypto.service');

function mockRes() {
  return {
    status: jest.fn(function status() { return this; }),
    json: jest.fn(function json() { return this; }),
  };
}

describe('superDemosPublic.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('listPublishedDemos returns demos for public project without key', async () => {
    SuperDemoProject.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        projectId: 'sdp_1',
        name: 'Public project',
        isPublic: true,
        isActive: true,
        allowedOrigins: [],
      }),
    });

    SuperDemo.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            demoId: 'demo_1',
            projectId: 'sdp_1',
            name: 'Demo',
            status: 'published',
            isActive: true,
            publishedVersion: 1,
            publishedAt: new Date('2026-01-01T00:00:00.000Z'),
            startUrlPattern: null,
          },
        ]),
      }),
    });

    const req = { params: { projectId: 'sdp_1' }, query: {}, headers: {} };
    const res = mockRes();
    await controller.listPublishedDemos(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      project: expect.objectContaining({ projectId: 'sdp_1', isPublic: true }),
      demos: expect.arrayContaining([expect.objectContaining({ demoId: 'demo_1' })]),
    }));
  });

  test('listPublishedDemos denies private project when key is invalid', async () => {
    SuperDemoProject.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        projectId: 'sdp_2',
        name: 'Private',
        isPublic: false,
        isActive: true,
        apiKeyHash: 'hash',
        allowedOrigins: [],
      }),
    });
    verifyKey.mockReturnValue(false);

    const req = {
      params: { projectId: 'sdp_2' },
      query: {},
      headers: { 'x-project-key': 'bad-key' },
    };
    const res = mockRes();
    await controller.listPublishedDemos(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid project key' });
  });

  test('getPublishedDemoDefinition returns steps for published demo', async () => {
    SuperDemo.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        demoId: 'demo_3',
        projectId: 'sdp_3',
        name: 'Published Demo',
        status: 'published',
        isActive: true,
        publishedVersion: 2,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        startUrlPattern: '/home',
      }),
    });

    SuperDemoProject.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        projectId: 'sdp_3',
        name: 'Public',
        isPublic: true,
        isActive: true,
      }),
    });

    SuperDemoStep.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { order: 0, selector: '#a', message: 'A', placement: 'auto', advance: { type: 'manualNext' } },
        ]),
      }),
    });

    const req = { params: { demoId: 'demo_3' }, headers: {} };
    const res = mockRes();
    await controller.getPublishedDemoDefinition(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      demo: expect.objectContaining({ demoId: 'demo_3' }),
      steps: expect.arrayContaining([expect.objectContaining({ selector: '#a' })]),
    }));
  });
});
