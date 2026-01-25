const asyncHandler = require('./asyncHandler');

describe('utils/asyncHandler', () => {
  test('wraps an async function and handles success', async () => {
    const mockReq = {};
    const mockRes = {};
    const next = jest.fn();
    const fn = async (req, res, nxt) => {
      res.data = 'success';
    };

    const wrapped = asyncHandler(fn);
    await wrapped(mockReq, mockRes, next);

    expect(mockRes.data).toBe('success');
    expect(next).not.toHaveBeenCalled();
  });

  test('wraps an async function and handles error', async () => {
    const mockReq = {};
    const mockRes = {};
    const next = jest.fn();
    const error = new Error('boom');
    const fn = async (req, res, nxt) => {
      throw error;
    };

    const wrapped = asyncHandler(fn);
    await wrapped(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
