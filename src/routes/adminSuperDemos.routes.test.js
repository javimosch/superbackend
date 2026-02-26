const express = require('express');
const request = require('supertest');

const mockAuth = {
  adminSessionAuth: jest.fn((req, res, next) => next()),
};

const mockController = {
  listProjects: jest.fn((req, res) => res.json({ ok: true, op: 'listProjects' })),
  createProject: jest.fn((req, res) => res.status(201).json({ ok: true, op: 'createProject' })),
  updateProject: jest.fn((req, res) => res.json({ ok: true, op: 'updateProject', projectId: req.params.projectId })),
  rotateProjectKey: jest.fn((req, res) => res.json({ ok: true, op: 'rotateProjectKey', projectId: req.params.projectId })),
  listProjectDemos: jest.fn((req, res) => res.json({ ok: true, op: 'listProjectDemos', projectId: req.params.projectId })),
  createDemo: jest.fn((req, res) => res.status(201).json({ ok: true, op: 'createDemo', projectId: req.params.projectId })),
  getDemo: jest.fn((req, res) => res.json({ ok: true, op: 'getDemo', demoId: req.params.demoId })),
  updateDemo: jest.fn((req, res) => res.json({ ok: true, op: 'updateDemo', demoId: req.params.demoId })),
  publishDemo: jest.fn((req, res) => res.json({ ok: true, op: 'publishDemo', demoId: req.params.demoId })),
  listSteps: jest.fn((req, res) => res.json({ ok: true, op: 'listSteps', demoId: req.params.demoId })),
  replaceSteps: jest.fn((req, res) => res.json({ ok: true, op: 'replaceSteps', demoId: req.params.demoId })),
  createAuthoringSession: jest.fn((req, res) => res.status(201).json({ ok: true, op: 'createAuthoringSession' })),
  deleteAuthoringSession: jest.fn((req, res) => res.json({ ok: true, op: 'deleteAuthoringSession', sessionId: req.params.sessionId })),
};

jest.mock('../middleware/auth', () => mockAuth);
jest.mock('../controllers/adminSuperDemos.controller', () => mockController);

describe('adminSuperDemos routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/admin/superdemos', require('./adminSuperDemos.routes'));
  });

  test('applies adminSessionAuth middleware', async () => {
    await request(app).get('/api/admin/superdemos/projects');
    expect(mockAuth.adminSessionAuth).toHaveBeenCalled();
  });

  test('routes project CRUD endpoints', async () => {
    const listRes = await request(app).get('/api/admin/superdemos/projects');
    expect(listRes.status).toBe(200);
    expect(mockController.listProjects).toHaveBeenCalled();

    const createRes = await request(app).post('/api/admin/superdemos/projects').send({ name: 'P' });
    expect(createRes.status).toBe(201);
    expect(mockController.createProject).toHaveBeenCalled();

    const updateRes = await request(app).put('/api/admin/superdemos/projects/sdp_1').send({ name: 'X' });
    expect(updateRes.status).toBe(200);
    expect(mockController.updateProject).toHaveBeenCalled();

    const rotateRes = await request(app).post('/api/admin/superdemos/projects/sdp_1/rotate-key');
    expect(rotateRes.status).toBe(200);
    expect(mockController.rotateProjectKey).toHaveBeenCalled();
  });

  test('routes demo, steps and authoring session endpoints', async () => {
    await request(app).get('/api/admin/superdemos/projects/sdp_1/demos');
    await request(app).post('/api/admin/superdemos/projects/sdp_1/demos').send({ name: 'D' });
    await request(app).get('/api/admin/superdemos/demos/demo_1');
    await request(app).put('/api/admin/superdemos/demos/demo_1').send({ name: 'DX' });
    await request(app).post('/api/admin/superdemos/demos/demo_1/publish');
    await request(app).get('/api/admin/superdemos/demos/demo_1/steps');
    await request(app).put('/api/admin/superdemos/demos/demo_1/steps').send({ steps: [] });
    await request(app).post('/api/admin/superdemos/authoring-sessions').send({ demoId: 'demo_1', targetUrl: 'https://x.test' });
    await request(app).delete('/api/admin/superdemos/authoring-sessions/sess_1');

    expect(mockController.listProjectDemos).toHaveBeenCalledTimes(1);
    expect(mockController.createDemo).toHaveBeenCalledTimes(1);
    expect(mockController.getDemo).toHaveBeenCalledTimes(1);
    expect(mockController.updateDemo).toHaveBeenCalledTimes(1);
    expect(mockController.publishDemo).toHaveBeenCalledTimes(1);
    expect(mockController.listSteps).toHaveBeenCalledTimes(1);
    expect(mockController.replaceSteps).toHaveBeenCalledTimes(1);
    expect(mockController.createAuthoringSession).toHaveBeenCalledTimes(1);
    expect(mockController.deleteAuthoringSession).toHaveBeenCalledTimes(1);
  });
});
