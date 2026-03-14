const express = require('express');
const request = require('supertest');

jest.mock('../services/pages.service', () => ({
  isReservedSegment: jest.fn(() => false),
  findPageByRoutePath: jest.fn(),
  renderPage: jest.fn(),
}));

jest.mock('../middleware/auth', () => ({
  adminSessionAuth: jest.fn((req, res, next) => next()),
}));

const pagesService = require('../services/pages.service');
const { adminSessionAuth } = require('../middleware/auth');
const pagesRouter = require('./pages.routes');

describe('pages.routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.set('pagesPrefix', '/');
    app.set('adminPath', '/admin');
    app.set('views', '/tmp');
    app.use(pagesRouter);
    app.use((req, res) => res.status(404).send('not found'));
  });

  test('renders published page without draft param', async () => {
    pagesService.findPageByRoutePath.mockResolvedValue({ _id: 'p1', slug: 'home' });
    pagesService.renderPage.mockResolvedValue('<html>ok</html>');

    const res = await request(app).get('/home');

    expect(res.status).toBe(200);
    expect(res.text).toContain('ok');
    expect(adminSessionAuth).not.toHaveBeenCalled();
    expect(pagesService.findPageByRoutePath).toHaveBeenCalledWith('/home', expect.objectContaining({
      statuses: ['published'],
      tenantId: null,
      includeGlobal: true,
    }));
  });

  test('draft=1 requires adminSessionAuth and allows draft status', async () => {
    pagesService.findPageByRoutePath.mockResolvedValue({ _id: 'p1', slug: 'home' });
    pagesService.renderPage.mockResolvedValue('<html>ok</html>');

    const res = await request(app).get('/home?draft=1');

    expect(res.status).toBe(200);
    expect(adminSessionAuth).toHaveBeenCalled();
    expect(pagesService.findPageByRoutePath).toHaveBeenCalledWith('/home', expect.objectContaining({
      statuses: ['published', 'draft'],
    }));
  });

  test('draft=1 with failed adminSessionAuth ends request and does not render', async () => {
    adminSessionAuth.mockImplementationOnce((req, res) => {
      res.status(401).json({ error: 'Authentication required' });
    });

    const res = await request(app).get('/home?draft=1');

    expect(res.status).toBe(401);
    expect(pagesService.findPageByRoutePath).not.toHaveBeenCalled();
    expect(pagesService.renderPage).not.toHaveBeenCalled();
  });
});
