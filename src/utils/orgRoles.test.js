const globalSettingsService = require('../services/globalSettings.service');
const orgRoles = require('./orgRoles');

jest.mock('../services/globalSettings.service');

describe('orgRoles.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    orgRoles.clearOrgRolesCache();
    delete process.env.ORG_ROLES_JSON;
  });

  describe('getOrgRoleHierarchy', () => {
    test('returns default hierarchy when no config found', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue(null);
      const hierarchy = await orgRoles.getOrgRoleHierarchy();
      expect(hierarchy).toEqual({
        owner: 4,
        admin: 3,
        member: 2,
        viewer: 1,
      });
    });

    test('returns custom hierarchy from environment variable', async () => {
      process.env.ORG_ROLES_JSON = JSON.stringify({ superadmin: 10, user: 1 });
      const hierarchy = await orgRoles.getOrgRoleHierarchy();
      expect(hierarchy).toEqual({ superadmin: 10, user: 1 });
    });

    test('returns custom hierarchy from global settings', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue(JSON.stringify({ custom: 5 }));
      const hierarchy = await orgRoles.getOrgRoleHierarchy();
      expect(hierarchy).toEqual({ custom: 5 });
    });

    test('handles array format in config', async () => {
      const arrayConfig = [
        { key: 'boss', level: 100 },
        { key: 'minion', level: 1 }
      ];
      process.env.ORG_ROLES_JSON = JSON.stringify(arrayConfig);
      const hierarchy = await orgRoles.getOrgRoleHierarchy();
      expect(hierarchy).toEqual({ boss: 100, minion: 1 });
    });
  });

  describe('getAllowedOrgRoles', () => {
    test('returns list of role keys', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue(null);
      const roles = await orgRoles.getAllowedOrgRoles();
      expect(roles).toEqual(expect.arrayContaining(['owner', 'admin', 'member', 'viewer']));
    });
  });

  describe('getDefaultOrgRole', () => {
    test('returns the lowest level role as default', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue(null);
      process.env.ORG_ROLES_JSON = JSON.stringify({ high: 10, low: 5 });
      const defaultRole = await orgRoles.getDefaultOrgRole();
      expect(defaultRole).toBe('low');
    });
  });

  describe('isValidOrgRole', () => {
    test('validates existing roles', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue(null);
      expect(await orgRoles.isValidOrgRole('admin')).toBe(true);
      expect(await orgRoles.isValidOrgRole('nonexistent')).toBe(false);
    });
  });

  describe('getOrgRoleLevel', () => {
    test('returns correct numeric level', async () => {
      globalSettingsService.getSettingValue.mockResolvedValue(null);
      expect(await orgRoles.getOrgRoleLevel('owner')).toBe(4);
      expect(await orgRoles.getOrgRoleLevel('viewer')).toBe(1);
      expect(await orgRoles.getOrgRoleLevel('missing')).toBe(0);
    });
  });
});
