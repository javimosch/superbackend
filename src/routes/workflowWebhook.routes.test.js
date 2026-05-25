const express = require('express');
const request = require('supertest');

jest.mock('../models/Workflow');
jest.mock('../services/workflow.service');

const Workflow = require('../models/Workflow');
const workflowService = require('../services/workflow.service');

describe('workflowWebhook.routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    const router = require('./workflowWebhook.routes');
    app.use('/w', router);
  });

  test('returns 404 when workflow not found', async () => {
    Workflow.findOne.mockResolvedValue(null);

    const res = await request(app).post('/w/nonexistent').send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Workflow not found');
  });

  test('returns 405 when method not allowed', async () => {
    Workflow.findOne.mockResolvedValue({
      _id: 'wf1',
      status: 'active',
      entrypoint: { allowedMethods: ['GET'] }
    });

    const res = await request(app).post('/w/wf1').send({});

    expect(res.status).toBe(405);
    expect(res.body.error).toMatch(/method/i);
  });

  test('returns 401 when header auth fails', async () => {
    Workflow.findOne.mockResolvedValue({
      _id: 'wf1',
      status: 'active',
      entrypoint: {
        auth: { type: 'header', headerName: 'x-secret', headerValue: 'secret123' }
      }
    });

    const res = await request(app).get('/w/wf1').set('x-secret', 'wrong');

    expect(res.status).toBe(401);
  });

  test('returns 401 when bearer auth fails', async () => {
    Workflow.findOne.mockResolvedValue({
      _id: 'wf1',
      status: 'active',
      entrypoint: {
        auth: { type: 'bearer', headerValue: 'valid-token' }
      }
    });

    const res = await request(app).get('/w/wf1').set('authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });

  test('returns 403 when workflow is inactive', async () => {
    Workflow.findOne.mockResolvedValue({
      _id: 'wf1',
      status: 'inactive',
      entrypoint: {}
    });

    const res = await request(app).get('/w/wf1');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Workflow is inactive');
  });

  test('executes workflow and awaits response', async () => {
    Workflow.findOne.mockResolvedValue({
      _id: 'wf1',
      status: 'active',
      entrypoint: { awaitResponse: true }
    });
    workflowService.execute.mockResolvedValue({
      context: { lastNode: { result: 'done' } }
    });

    const res = await request(app).post('/w/wf1').send({ key: 'value' });

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('done');
    expect(workflowService.execute).toHaveBeenCalledWith('wf1', expect.objectContaining({
      body: { key: 'value' },
      method: 'POST'
    }));
  });

  test('does not pass sensitive headers to workflow context', async () => {
    Workflow.findOne.mockResolvedValue({
      _id: 'wf1',
      status: 'active',
      entrypoint: { awaitResponse: true }
    });
    workflowService.execute.mockResolvedValue({ context: {} });

    await request(app)
      .post('/w/wf1')
      .set('authorization', 'Bearer secret-token')
      .set('cookie', 'session=abc')
      .set('x-api-key', 'mykey')
      .set('x-custom', 'safe-header')
      .send({});

    const contextArg = workflowService.execute.mock.calls[0][1];
    expect(contextArg.headers.authorization).toBeUndefined();
    expect(contextArg.headers.cookie).toBeUndefined();
    expect(contextArg.headers['x-api-key']).toBeUndefined();
    expect(contextArg.headers['x-custom']).toBe('safe-header');
  });

  test('triggers async execution and returns 201', async () => {
    Workflow.findOne.mockResolvedValue({
      _id: 'wf1',
      status: 'active',
      entrypoint: {}
    });
    workflowService.execute.mockResolvedValue({});

    const res = await request(app).post('/w/wf1').send({});

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Triggered');
    expect(workflowService.execute).toHaveBeenCalled();
  });

  test('handles execution error in await mode', async () => {
    Workflow.findOne.mockResolvedValue({
      _id: 'wf1',
      status: 'active',
      entrypoint: { awaitResponse: true }
    });
    workflowService.execute.mockRejectedValue(new Error('Execution failed'));

    const res = await request(app).post('/w/wf1').send({});

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Execution failed/i);
  });
});
