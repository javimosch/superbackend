function mockFindChain(result) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  return chain;
}

jest.mock('../models/PageRedirect', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  deleteOne: jest.fn(),
  countDocuments: jest.fn(),
}));

const PageRedirect = require('../models/PageRedirect');
const redirectsService = require('./pageRedirects.service');

describe('pageRedirects.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redirectsService.clearCache();
  });

  describe('checkRedirect', () => {
    function mockRedirects(redirects) {
      return mockFindChain(redirects);
    }

    test('returns null for unknown path', async () => {
      PageRedirect.find.mockReturnValue(mockRedirects([]));

      const result = await redirectsService.checkRedirect('/unknown');

      expect(result).toBeNull();
    });

    test('returns matching redirect when found', async () => {
      PageRedirect.find.mockReturnValue(mockRedirects([
        { from: '/old-page', to: '/new-page', type: 301, enabled: true },
      ]));

      const result = await redirectsService.checkRedirect('/old-page');

      expect(result).toEqual({ to: '/new-page', type: 301 });
    });

    test('normalizes trailing slashes on request path', async () => {
      PageRedirect.find.mockReturnValue(mockRedirects([
        { from: '/old-page', to: '/new-page', type: 301, enabled: true },
      ]));

      const result = await redirectsService.checkRedirect('/old-page/');

      expect(result).toEqual({ to: '/new-page', type: 301 });
    });

    test('normalizes trailing slashes on stored redirect (legacy data)', async () => {
      PageRedirect.find.mockReturnValue(mockRedirects([
        { from: '/old-page/', to: '/new-page', type: 301, enabled: true },
      ]));

      const result = await redirectsService.checkRedirect('/old-page');

      expect(result).toEqual({ to: '/new-page', type: 301 });
    });

    test('is case-insensitive', async () => {
      PageRedirect.find.mockReturnValue(mockRedirects([
        { from: '/Old-Page', to: '/new-page', type: 301, enabled: true },
      ]));

      const result = await redirectsService.checkRedirect('/old-page');

      expect(result).toEqual({ to: '/new-page', type: 301 });
    });

    test('caches results and reuses cache within TTL', async () => {
      PageRedirect.find.mockReturnValue(mockRedirects([
        { from: '/a', to: '/b', type: 302, enabled: true },
      ]));
      await redirectsService.checkRedirect('/a');
      expect(PageRedirect.find).toHaveBeenCalledTimes(1);

      PageRedirect.find.mockReturnValue(mockRedirects([]));
      const result = await redirectsService.checkRedirect('/a');
      expect(result).toEqual({ to: '/b', type: 302 });
      expect(PageRedirect.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('createRedirect', () => {
    test('creates a redirect with valid params', async () => {
      const mockDoc = {
        _id: 'r1',
        from: '/old',
        to: '/new',
        type: 301,
        enabled: true,
        note: '',
        toObject: () => ({ _id: 'r1', from: '/old', to: '/new', type: 301, enabled: true }),
      };
      PageRedirect.create.mockResolvedValue(mockDoc);

      const result = await redirectsService.createRedirect({ from: '/old', to: '/new' });

      expect(PageRedirect.create).toHaveBeenCalledWith(
        expect.objectContaining({ from: '/old', to: '/new', type: 301, enabled: true })
      );
      expect(result.from).toBe('/old');
    });

    test('strips trailing slashes from from path', async () => {
      const mockDoc = {
        from: '/old',
        to: '/new',
        type: 301,
        enabled: true,
        note: '',
        toObject: () => ({ from: '/old', to: '/new' }),
      };
      PageRedirect.create.mockResolvedValue(mockDoc);

      await redirectsService.createRedirect({ from: '/old/', to: '/new' });

      expect(PageRedirect.create).toHaveBeenCalledWith(
        expect.objectContaining({ from: '/old' })
      );
    });

    test('rejects empty from path', async () => {
      await expect(
        redirectsService.createRedirect({ from: '', to: '/new' })
      ).rejects.toThrow('from path is required');
    });

    test('rejects empty to path', async () => {
      await expect(
        redirectsService.createRedirect({ from: '/old', to: '' })
      ).rejects.toThrow('to path is required');
    });

    test('rejects when from equals to', async () => {
      await expect(
        redirectsService.createRedirect({ from: '/same', to: '/same' })
      ).rejects.toThrow('from and to must be different');
    });

    test('accepts custom redirect type', async () => {
      const mockDoc = {
        from: '/old',
        to: '/new',
        type: 302,
        toObject: () => ({ from: '/old', to: '/new', type: 302 }),
      };
      PageRedirect.create.mockResolvedValue(mockDoc);

      const result = await redirectsService.createRedirect({ from: '/old', to: '/new', type: 302 });

      expect(PageRedirect.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 302 })
      );
    });

    test('defaults unknown type to 301', async () => {
      const mockDoc = {
        from: '/old',
        to: '/new',
        type: 301,
        toObject: () => ({ from: '/old', to: '/new', type: 301 }),
      };
      PageRedirect.create.mockResolvedValue(mockDoc);

      await redirectsService.createRedirect({ from: '/old', to: '/new', type: 999 });

      expect(PageRedirect.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 301 })
      );
    });

    test('clears cache after creation', async () => {
      PageRedirect.find.mockReturnValue(mockFindChain([]));
      PageRedirect.create.mockResolvedValue({
        from: '/a', to: '/b', type: 301, enabled: true, note: '',
        toObject: () => ({}),
      });

      await redirectsService.checkRedirect('/a');
      expect(PageRedirect.find).toHaveBeenCalledTimes(1);

      PageRedirect.find.mockClear();

      await redirectsService.createRedirect({ from: '/a', to: '/b' });

      PageRedirect.find.mockReturnValue(mockFindChain([]));
      await redirectsService.checkRedirect('/a');
      expect(PageRedirect.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateRedirect', () => {
    test('updates fields and clears cache', async () => {
      const mockDoc = {
        from: '/old',
        to: '/new',
        type: 301,
        enabled: true,
        note: '',
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ from: '/old', to: '/new', type: 301 }),
      };
      PageRedirect.findById.mockResolvedValue(mockDoc);

      const result = await redirectsService.updateRedirect('r1', { to: '/updated' });

      expect(mockDoc.to).toBe('/updated');
      expect(mockDoc.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    test('normalizes trailing slashes on from update', async () => {
      const mockDoc = {
        from: '/old',
        to: '/new',
        type: 301,
        enabled: true,
        note: '',
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ from: '/old-trailing', to: '/new' }),
      };
      PageRedirect.findById.mockResolvedValue(mockDoc);

      await redirectsService.updateRedirect('r1', { from: '/old-trailing/' });

      expect(mockDoc.from).toBe('/old-trailing');
    });

    test('throws when redirect not found', async () => {
      PageRedirect.findById.mockResolvedValue(null);

      await expect(
        redirectsService.updateRedirect('nonexistent', { to: '/new' })
      ).rejects.toThrow('Redirect not found');
    });
  });

  describe('deleteRedirect', () => {
    test('deletes redirect and clears cache', async () => {
      const mockDoc = { _id: 'r1' };
      PageRedirect.findById.mockResolvedValue(mockDoc);
      PageRedirect.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await redirectsService.deleteRedirect('r1');

      expect(PageRedirect.deleteOne).toHaveBeenCalledWith({ _id: 'r1' });
      expect(result).toEqual({ success: true });
    });

    test('throws when redirect not found', async () => {
      PageRedirect.findById.mockResolvedValue(null);

      await expect(
        redirectsService.deleteRedirect('nonexistent')
      ).rejects.toThrow('Redirect not found');
    });
  });

  describe('listRedirects', () => {
    test('returns paginated results', async () => {
      const mockItems = [{ from: '/a', to: '/b' }];
      PageRedirect.find.mockReturnValue(mockFindChain(mockItems));
      PageRedirect.countDocuments.mockResolvedValue(1);

      const result = await redirectsService.listRedirects({ limit: 10, offset: 0 });

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(1);
    });

    test('applies search filter when provided', async () => {
      PageRedirect.find.mockReturnValue(mockFindChain([]));
      PageRedirect.countDocuments.mockResolvedValue(0);

      await redirectsService.listRedirects({ search: 'test' });

      const findCall = PageRedirect.find.mock.calls[0][0];
      expect(findCall.$or).toBeDefined();
    });
  });
});
