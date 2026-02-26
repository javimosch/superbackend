const express = require('express');
const request = require('supertest');

const mockController = {
  listPublishedDemos: jest.fn((req, res) => res.json({ ok: true, route: 'published', projectId: req.params.projectId })),
  getPublishedDemoDefinition: jest.fn((req, res) => res.json({ ok: true, route: 'definition', demoId: req.params.demoId })),
};

jest.mock('../controllers/superDemosPublic.controller', () => mockController);

describe('superDemos public routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use('/api/superdemos', require('./superDemos.routes'));
  });

  test('GET /projects/:projectId/demos/published routes to controller', async () => {
    const res = await request(app).get('/api/superdemos/projects/sdp_test/demos/published');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, route: 'published', projectId: 'sdp_test' }));
    expect(mockController.listPublishedDemos).toHaveBeenCalledTimes(1);
  });

  test('GET /demos/:demoId/definition routes to controller', async () => {
    const res = await request(app).get('/api/superdemos/demos/demo_test/definition');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, route: 'definition', demoId: 'demo_test' }));
    expect(mockController.getPublishedDemoDefinition).toHaveBeenCalledTimes(1);
  });
});
