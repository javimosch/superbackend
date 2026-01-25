jest.setTimeout(15000);

const { matches, evaluateEffects } = require('./engine');

describe('rbac engine', () => {
  test('matches supports exact match', () => {
    expect(matches('a:b:c', 'a:b:c')).toBe(true);
    expect(matches('a:b:c', 'a:b:d')).toBe(false);
  });

  test('matches supports wildcard', () => {
    expect(matches('backoffice:dashboard:access', 'backoffice:*')).toBe(true);
    expect(matches('backoffice:dashboard:access', '*')).toBe(true);
    expect(matches('users:manage', 'backoffice:*')).toBe(false);
  });

  describe('evaluateEffects', () => {
    test('returns no_match if no entries', () => {
      expect(evaluateEffects([], 'read')).toEqual({ allowed: false, reason: 'no_match' });
    });

    test('returns invalid_required_right for empty right', () => {
      expect(evaluateEffects([{ right: '*' }], '')).toEqual({ allowed: false, reason: 'invalid_required_right' });
    });

    test('skips null or invalid entries', () => {
      const entries = [null, { right: '' }, { right: 'other' }];
      expect(evaluateEffects(entries, 'test')).toEqual({ allowed: false, reason: 'no_match' });
    });

    test('prefers deny over allow', () => {
      const entries = [
        { right: '*', effect: 'allow' },
        { right: 'secret', effect: 'deny' }
      ];
      expect(evaluateEffects(entries, 'secret')).toMatchObject({ allowed: false, reason: 'denied' });
      expect(evaluateEffects(entries, 'public')).toMatchObject({ allowed: true, reason: 'allowed' });
    });
  });

  test('deny overrides allow', () => {
    const entries = [
      { right: 'backoffice:*', effect: 'allow' },
      { right: 'backoffice:dashboard:access', effect: 'deny' },
    ];

    const out = evaluateEffects(entries, 'backoffice:dashboard:access');
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe('denied');
  });

  test('allow when any allow matches and no deny matches', () => {
    const entries = [
      { right: 'backoffice:*', effect: 'allow' },
    ];

    const out = evaluateEffects(entries, 'backoffice:dashboard:access');
    expect(out.allowed).toBe(true);
    expect(out.reason).toBe('allowed');
  });
});
