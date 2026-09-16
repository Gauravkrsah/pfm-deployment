/**
 * src/utils/algorithms.js
 * 
 * Custom algorithms for Personal Finance Manager analysis.
 * Implements Predictive Analytics, Budget Optimization, and 
 * String-distance Categorization.
 */

/**
 * 1. Moving Average Data (Smoothing daily variance)
 * Calculates a simple moving average strictly over the provided historical data.
 */
export function calculateMovingAverage(data, windowSize = 7) {
  if (!data || data.length === 0) return [];
  
  // Group raw transactions by date
  const dailyTotals = {};
  data.forEach(item => {
    if (item.amount > 0 && item.category !== 'income' && item.category !== 'loan') {
      const date = new Date(item.date).toISOString().split('T')[0];
      dailyTotals[date] = (dailyTotals[date] || 0) + item.amount;
    }
  });

  const sortedDates = Object.keys(dailyTotals).sort();
  if (sortedDates.length === 0) return [];

  const timeSeries = sortedDates.map(date => ({
    date,
    amount: dailyTotals[date]
  }));

  return timeSeries.map((point, i) => {
    const windowStart = Math.max(0, i - windowSize + 1);
    const windowData = timeSeries.slice(windowStart, i + 1);
    const sum = windowData.reduce((acc, curr) => acc + curr.amount, 0);
    const avg = sum / windowData.length;
    
    return {
      date: point.date,
      amount: point.amount,
      movingAverage: Math.round(avg)
    };
  });
}

/**
 * 2. Budget Optimization
 *
 * A practical plan needs two things the old greedy algorithm did not have:
 * realistic limits and the user's consent about which categories are safe to
 * change. Each category has a deliberately conservative maximum reduction.
 * When `selectedCategories` is null, only flexible categories are selected as
 * a starting point. Once the user changes a checkbox, the supplied selection
 * is respected exactly (including an empty selection).
 */
const CATEGORY_ALIASES = {
  fooding: 'food',
  foods: 'food',
  meal: 'food',
  meals: 'food',
  gift: 'gift',
  gifts: 'gift',
  transportation: 'transport',
  transports: 'transport',
  travels: 'travel',
  electronic: 'electronics',
  entertainments: 'entertainment',
}

export function normalizeExpenseCategory(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')

  return CATEGORY_ALIASES[normalized] || normalized || 'other'
}

export function aggregateExpenseCategories(rows = []) {
  return (rows || []).reduce((totals, row) => {
    const amount = Number(row?.amount) || 0
    if (amount <= 0) return totals

    const category = normalizeExpenseCategory(row?.category)
    if (category === 'income' || category === 'loan') return totals
    totals[category] = (totals[category] || 0) + amount
    return totals
  }, {})
}

const BUDGET_CATEGORY_RULES = {
  food: { maxCutRate: 0.15, flexibility: 'flexible', defaultSelected: true, guidance: 'Plan meals and reduce takeout or delivery.' },
  shopping: { maxCutRate: 0.20, flexibility: 'flexible', defaultSelected: true, guidance: 'Pause non-essential purchases and use a 24-hour wait.' },
  entertainment: { maxCutRate: 0.20, flexibility: 'flexible', defaultSelected: true, guidance: 'Pause subscriptions or choose lower-cost activities.' },
  gift: { maxCutRate: 0.10, flexibility: 'flexible', defaultSelected: true, guidance: 'Set a gift limit and avoid unplanned gifts this period.' },
  gifts: { maxCutRate: 0.10, flexibility: 'flexible', defaultSelected: true, guidance: 'Set a gift limit and avoid unplanned gifts this period.' },
  travel: { maxCutRate: 0.15, flexibility: 'flexible', defaultSelected: true, guidance: 'Delay optional trips or choose a lower-cost option.' },
  accommodation: { maxCutRate: 0.10, flexibility: 'flexible', defaultSelected: true, guidance: 'Compare alternatives before making another booking.' },
  electronics: { maxCutRate: 0.15, flexibility: 'flexible', defaultSelected: true, guidance: 'Delay upgrades and repair before replacing.' },
  transport: { maxCutRate: 0.12, flexibility: 'flexible', defaultSelected: true, guidance: 'Combine trips, use public transport, or share rides.' },
  'personal care': { maxCutRate: 0.10, flexibility: 'flexible', defaultSelected: true, guidance: 'Use what you have and skip optional treatments.' },
  fitness: { maxCutRate: 0.10, flexibility: 'flexible', defaultSelected: true, guidance: 'Pause unused memberships or switch to a cheaper plan.' },
  kitchenware: { maxCutRate: 0.10, flexibility: 'flexible', defaultSelected: true, guidance: 'Buy only replacements and delay non-essential upgrades.' },
  groceries: { maxCutRate: 0.08, flexibility: 'essential', defaultSelected: false, guidance: 'Plan a list and switch brands before cutting essentials.' },
  utilities: { maxCutRate: 0.06, flexibility: 'essential', defaultSelected: false, guidance: 'Reduce avoidable usage; keep required services active.' },
  'household cleaning': { maxCutRate: 0.08, flexibility: 'essential', defaultSelected: false, guidance: 'Use existing supplies and compare refill prices.' },
  maintenance: { maxCutRate: 0.08, flexibility: 'essential', defaultSelected: false, guidance: 'Separate urgent repairs from work that can wait.' },
  'pet supplies': { maxCutRate: 0.06, flexibility: 'essential', defaultSelected: false, guidance: 'Compare brands without reducing required pet care.' },
  'software services': { maxCutRate: 0.10, flexibility: 'flexible', defaultSelected: true, guidance: 'Cancel unused services and move to a lower tier.' },
  education: { maxCutRate: 0.05, flexibility: 'essential', defaultSelected: false, guidance: 'Keep required learning costs; defer optional purchases.' },
  medical: { maxCutRate: 0.03, flexibility: 'essential', defaultSelected: false, guidance: 'Do not skip care; review only non-urgent optional costs.' },
  rent: { maxCutRate: 0.02, flexibility: 'essential', defaultSelected: false, guidance: 'Treat rent as fixed unless your housing changes.' },
  finance: { maxCutRate: 0.03, flexibility: 'essential', defaultSelected: false, guidance: 'Keep required payments current; review avoidable fees only.' },
  furniture: { maxCutRate: 0.08, flexibility: 'flexible', defaultSelected: true, guidance: 'Delay upgrades and buy only what solves a current need.' },
  other: { maxCutRate: 0.05, flexibility: 'review', defaultSelected: false, guidance: 'Review these transactions before deciding what can change.' },
}

const DEFAULT_BUDGET_RULE = {
  maxCutRate: 0.05,
  flexibility: 'review',
  defaultSelected: false,
  guidance: 'Review these transactions before deciding what can change.',
}

const getBudgetCategoryRule = (category) => (
  BUDGET_CATEGORY_RULES[normalizeExpenseCategory(category)] || DEFAULT_BUDGET_RULE
)

export function optimizeBudget(categories = {}, currentTotal = 0, targetReductionRatio = 0.2, selectedCategories = null) {
  const safeTotal = Math.max(0, Number(currentTotal) || 0)
  const targetSavings = safeTotal * Math.max(0, Number(targetReductionRatio) || 0)
  const selectedSet = selectedCategories === null
    ? null
    : new Set((selectedCategories || []).map(category => normalizeExpenseCategory(category)))
  const normalizedCategories = Object.entries(categories || {}).reduce((totals, [name, rawAmount]) => {
    const category = normalizeExpenseCategory(name)
    totals[category] = (totals[category] || 0) + (Number(rawAmount) || 0)
    return totals
  }, {})

  const plans = Object.entries(normalizedCategories)
    .map(([name, rawAmount]) => {
      const amount = Math.max(0, Number(rawAmount) || 0)
      const rule = getBudgetCategoryRule(name)
      const normalizedName = normalizeExpenseCategory(name)
      const selected = selectedSet === null ? rule.defaultSelected : selectedSet.has(normalizedName)
      return {
        category: name,
        amount,
        selected,
        maxCutRate: rule.maxCutRate,
        maxCutAmount: amount * rule.maxCutRate,
        flexibility: rule.flexibility,
        guidance: rule.guidance,
        reason: rule.flexibility === 'flexible' ? 'Flexible category' : 'Essential category',
      }
    })
    .filter(plan => plan.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  const selectedPlans = plans.filter(plan => plan.selected && plan.maxCutAmount > 0)
  const availableSavings = selectedPlans.reduce((sum, plan) => sum + plan.maxCutAmount, 0)
  const allocationRatio = availableSavings > 0 ? Math.min(1, targetSavings / availableSavings) : 0

  const categoryPlans = plans.map(plan => ({
    ...plan,
    cutAmount: plan.selected ? plan.maxCutAmount * allocationRatio : 0,
  }))
  const suggestions = categoryPlans
    .filter(plan => plan.cutAmount > 0)
    .sort((a, b) => b.cutAmount - a.cutAmount)
    .map(plan => ({ ...plan, cutAmount: Math.round(plan.cutAmount) }))
  const achievedCuts = Math.min(Math.round(targetSavings), suggestions.reduce((sum, plan) => sum + plan.cutAmount, 0))

  return {
    targetSavings: Math.round(targetSavings),
    achievedCuts,
    availableSavings: Math.round(availableSavings),
    targetFeasible: achievedCuts >= Math.round(targetSavings),
    selectedCategories: plans.filter(plan => plan.selected).map(plan => plan.category),
    categoryPlans: categoryPlans.map(plan => ({
      ...plan,
      cutAmount: Math.round(plan.cutAmount),
      maxCutAmount: Math.round(plan.maxCutAmount),
    })),
    suggestions,
  }
}

/**
 * 3. K-Means Style Categorization Fallback (String Distance / Levenshtein)
 * Useful for when NLP fails. Matches an unknown string to the closest predefined category.
 */
function levenshteinDistance(s, t) {
    if (!s.length) return t.length;
    if (!t.length) return s.length;
    const arr = [];
    for (let i = 0; i <= t.length; i++) {
        arr[i] = [i];
        for (let j = 1; j <= s.length; j++) {
            arr[i][j] =
                i === 0 ? j
                : Math.min(
                    arr[i - 1][j] + 1,
                    arr[i][j - 1] + 1,
                    arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
                );
        }
    }
    return arr[t.length][s.length];
}

export function fallbackCategorization(uncategorizedItem, predefinedCategories) {
    let bestMatch = 'other';
    let minDistance = Infinity;
    
    // Simple heuristic: compare the item to each category using Levenshtein
    for (const cat of predefinedCategories) {
        const dist = levenshteinDistance(uncategorizedItem.toLowerCase(), cat.toLowerCase());
        if (dist < minDistance) {
            minDistance = dist;
            bestMatch = cat;
        }
    }
    
    // Only return if it's reasonably close (e.g., distance < 4)
    if (minDistance < 4) {
        return { matchedCategory: bestMatch, distance: minDistance, confidence: 'high' };
    }
    return { matchedCategory: 'other', distance: minDistance, confidence: 'low' };
}
