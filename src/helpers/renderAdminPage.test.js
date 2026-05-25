const path = require('path');
const fs = require('fs');

jest.mock('fs');
jest.mock('ejs', () => ({
  render: jest.fn((template, locals, opts) => '<html>rendered</html>')
}));

const ejs = require('ejs');
const { renderAdminPage, adminPageHandler } = require('./renderAdminPage');

describe('renderAdminPage', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      baseUrl: '/saas',
      adminPath: '/saas/admin',
      isIframe: false
    };
    mockRes = {
      send: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  test('renders an EJS template successfully', () => {
    fs.readFile.mockImplementation((_path, _encoding, cb) => {
      cb(null, '<%= baseUrl %>');
    });

    renderAdminPage(mockReq, mockRes, 'admin-test.ejs', { extraKey: 'val' });

    expect(fs.readFile).toHaveBeenCalled();
    expect(ejs.render).toHaveBeenCalledWith(
      '<%= baseUrl %>',
      expect.objectContaining({
        baseUrl: '/saas',
        adminPath: '/saas/admin',
        isIframe: false,
        extraKey: 'val'
      }),
      expect.any(Object)
    );
    expect(mockRes.send).toHaveBeenCalledWith('<html>rendered</html>');
  });

  test('handles file read error', () => {
    fs.readFile.mockImplementation((_path, _encoding, cb) => {
      cb(new Error('ENOENT'));
    });

    renderAdminPage(mockReq, mockRes, 'nonexistent.ejs');

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.send).toHaveBeenCalledWith('Error loading page');
  });

  test('handles render error', () => {
    fs.readFile.mockImplementation((_path, _encoding, cb) => {
      cb(null, '<%= bad %>');
    });
    ejs.render.mockImplementation(() => { throw new Error('Render failed'); });

    renderAdminPage(mockReq, mockRes, 'bad.ejs');

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.send).toHaveBeenCalledWith('Error rendering page');
  });

  test('without extraLocals', () => {
    fs.readFile.mockImplementation((_path, _encoding, cb) => {
      cb(null, 'content');
    });

    renderAdminPage(mockReq, mockRes, 'simple.ejs');

    expect(ejs.render).toHaveBeenCalledWith(
      'content',
      { baseUrl: '/saas', adminPath: '/saas/admin', isIframe: false },
      expect.any(Object)
    );
  });
});

describe('adminPageHandler', () => {
  test('returns a middleware function', () => {
    const handler = adminPageHandler('test.ejs');
    expect(typeof handler).toBe('function');
  });

  test('handler calls renderAdminPage with extraLocals from function', () => {
    fs.readFile.mockImplementation((_path, _encoding, cb) => cb(null, 'ok'));
    const handler = adminPageHandler('test.ejs', (req) => ({ dynamic: req.query.key }));
    const req = { baseUrl: '/', adminPath: '/admin', isIframe: false, query: { key: 'val' } };
    const res = { send: jest.fn(), status: jest.fn().mockReturnThis() };

    handler(req, res);

    expect(ejs.render).toHaveBeenCalledWith(
      'ok',
      expect.objectContaining({ dynamic: 'val' }),
      expect.any(Object)
    );
  });
});
