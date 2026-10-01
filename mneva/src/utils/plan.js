// Single source of truth for turning the raw `user.plan` string (as stored
// on the backend — just "Free" by default; no checkout flow writes any
// other value yet) into a display label or a Subscription-screen plan key.
// Profile.js and Subscription.js used to each reimplement this mapping
// locally, both with a fallback of "Basic" instead of "Free" — so an
// unrecognized/free account showed as "Basic" in both places while only
// Settings' Account tab (which read the raw field untouched) showed the
// real value, "Free".
export function getPlanDisplayName(plan) {
  const value = (plan || '').toLowerCase();
  if (value.includes('family')) return 'Family';
  if (value.includes('pro')) return 'Pro';
  if (value.includes('basic')) return 'Basic';
  return 'Free';
}

export function getPlanKey(plan) {
  const value = (plan || '').toLowerCase();
  if (value.includes('family')) return 'family';
  if (value.includes('pro')) return 'pro';
  if (value.includes('basic')) return 'basic';
  return 'free';
}
