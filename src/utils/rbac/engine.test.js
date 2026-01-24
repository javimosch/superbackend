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
