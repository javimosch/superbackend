jest.setTimeout(15000);

jest.mock('../services/globalSettings.service', () => ({
  getSettingValue: jest.fn(),
}));

jest.mock('../services/blogCronsBootstrap.service', () => ({
  INTERNAL_CRON_TOKEN_SETTING_KEY: 'blog.internalCronToken',
}));

const globalSettingsService = require('../services/globalSettings.service');
const { requireInternalCronToken } = require('./internalCronAuth');

describe('internalCronAuth', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  test('returns 401 if no bearer token', async () => {
    await requireInternalCronToken(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('returns 403 if token mismatch', async () => {
    mockReq.headers.authorization = 'Bearer wrong';
    globalSettingsService.getSettingValue.mockResolvedValue('expected');

    await requireInternalCronToken(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('calls next if token matches', async () => {
    mockReq.headers.authorization = 'Bearer expected';
    globalSettingsService.getSettingValue.mockResolvedValue('expected');

    await requireInternalCronToken(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  test('returns 500 on errors', async () => {
    mockReq.headers.authorization = 'Bearer expected';
    globalSettingsService.getSettingValue.mockRejectedValue(new Error('boom'));

    await requireInternalCronToken(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal auth failed' });
  });
});
