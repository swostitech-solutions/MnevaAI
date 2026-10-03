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

// The paid tiers, lowest to highest — single source of truth for the
// Subscription screen's plan cards AND anywhere else (e.g. Settings'
// Account tab "Upgrade" banner) that needs to know what the next tier up
// from a user's current plan actually is/costs, so the two can't drift
// apart the way the plan *name* mapping already had.
export const PLANS = [
  {
    id: 'basic', name: 'Basic', price: '$8.99', period: '/ month',
    seats: 'Individual',
    icon: 'user',
    features: [
      'Daily Brief & Priorities',
      'Ask Mneva',
      'Mail & calendar intelligence',
      'L1 Observe + L2 Suggest',
    ],
  },
  {
    id: 'pro', name: 'Pro', price: '$18.99', period: '/ month',
    seats: 'Individual',
    icon: 'zap',
    popular: true,
    popularLabel: 'Most likely for you',
    features: [
      'Everything in Basic',
      'L3 Draft & Prep',
      'Full Twin Diary signed ledger',
      'Health & Fit integration',
    ],
  },
  {
    id: 'family', name: 'Family', price: '$49.99', period: '/ month',
    seats: 'Up to 4 members',
    icon: 'users',
    features: [
      'Pro features for every member',
      'Shared family calendar & tasks',
      'Shared follow-ups and reminders',
      '+$19/mo for 2 extra members',
    ],
  },
];

// The plan one tier above `plan`'s current one — null once already on the
// top tier (Family), since there's nothing left to upgrade to.
export function getNextPlan(plan) {
  const order = ['free', 'basic', 'pro', 'family'];
  const idx = order.indexOf(getPlanKey(plan));
  return PLANS.find(p => p.id === order[idx + 1]) || null;
}
