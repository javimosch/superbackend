function normalizeRight(input) {
  return String(input || '').trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern) {
  const parts = normalizeRight(pattern).split('*').map(escapeRegex);
  return new RegExp('^' + parts.join('.*') + '$');
}

function matches(requiredRight, grantedPattern) {
  const required = normalizeRight(requiredRight);
  const pattern = normalizeRight(grantedPattern);
  if (!required || !pattern) return false;
  if (pattern === required) return true;
  if (!pattern.includes('*')) return false;
  return patternToRegex(pattern).test(required);
}

function evaluateEffects(entries, requiredRight) {
  const required = normalizeRight(requiredRight);
  if (!required) {
    return { allowed: false, reason: 'invalid_required_right' };
  }

  const denies = [];
  const allows = [];

  for (const e of entries || []) {
    if (!e) continue;
    const right = normalizeRight(e.right);
    const effect = normalizeRight(e.effect || 'allow');
    if (!right) continue;
    if (!matches(required, right)) continue;

    if (effect === 'deny') {
      denies.push(e);
    } else {
      allows.push(e);
    }
  }

  if (denies.length) {
    return { allowed: false, reason: 'denied', matched: denies };
  }

  if (allows.length) {
    return { allowed: true, reason: 'allowed', matched: allows };
  }

  return { allowed: false, reason: 'no_match' };
}

module.exports = {
  matches,
  evaluateEffects,
};
