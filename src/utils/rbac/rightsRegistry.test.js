const { listRights } = require('./rightsRegistry');

describe('utils/rbac/rightsRegistry', () => {
  test('listRights returns a sorted list of unique rights', () => {
    const rights = listRights();
    
    expect(Array.isArray(rights)).toBe(true);
    expect(rights.length).toBeGreaterThan(0);
    
    // Check for some default rights
    expect(rights).toContain('*');
    expect(rights).toContain('rbac:roles:read');
    expect(rights).toContain('file_manager:access');
    
    // Verify sorting
    const sortedRights = [...rights].sort();
    expect(rights).toEqual(sortedRights);
    
    // Verify uniqueness
    const uniqueRights = Array.from(new Set(rights));
    expect(rights.length).toBe(uniqueRights.length);
  });
});
