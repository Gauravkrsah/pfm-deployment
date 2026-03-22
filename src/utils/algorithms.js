/**
 * src/utils/algorithms.js
 * 
 * Custom algorithms for Personal Finance Manager analysis.
 * Implements Predictive Analytics, Budget Optimization, and 
 * String-distance Categorization.
 */

/**
 * 1. Future Expense Prediction (Simple Linear Regression)
 * Predicts next month's total spending based on the previous months/days.
 * Formula: y = mx + b
 */
export function predictFutureExpenses(data) {
  if (!data || data.length < 2) return null;
  // group data by day
  const dailyTotals = {};
  data.forEach(item => {
    if (item.amount > 0 && item.category !== 'income' && item.category !== 'loan') {
      const date = new Date(item.date).toISOString().split('T')[0];
      dailyTotals[date] = (dailyTotals[date] || 0) + item.amount;
    }
  });

  const sortedDates = Object.keys(dailyTotals).sort();
  if (sortedDates.length < 2) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const n = sortedDates.length;
  
  const baseDate = new Date(sortedDates[0]).getTime();
  const days = sortedDates.map(date => {
      const d = (new Date(date).getTime() - baseDate) / (1000 * 3600 * 24);
      return { x: d, y: dailyTotals[date] };
  });

  days.forEach(point => {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumX2 += point.x * point.x;
  });

  const denominator = (n * sumX2 - sumX * sumX);
  if (denominator === 0) return { trend: 'stable', predictedNextMonth: sumY / n * 30 };

  const m = (n * sumXY - sumX * sumY) / denominator;
  const b = (sumY - m * sumX) / n;

  // predict for next 30 days
  const lastX = days[days.length - 1].x;
  let predictedSum = 0;
  for (let i = 1; i <= 30; i++) {
    const projectedDayY = m * (lastX + i) + b;
    predictedSum += Math.max(0, projectedDayY); // no negative spending
  }

  return {
    m, b,
    trend: m > 0 ? 'increasing' : 'decreasing',
    predictedNextMonth: Math.round(predictedSum)
  };
}

/**
 * 2. Budget Optimization (Greedy Algorithm for suggesting cuts)
 * Takes user's spending per category, target reduction, and suggests cuts 
 * from non-essential categories first (greedily reducing highest discretionary).
 */
export function optimizeBudget(categories, currentTotal, targetReductionRatio = 0.2) {
  const targetSavings = currentTotal * targetReductionRatio;
  const essentialCategories = ['rent', 'medical', 'utilities', 'groceries', 'food'];
  
  // Sort categories by amount (highest first)
  const sortedCategories = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount, essential: essentialCategories.includes(name.toLowerCase()) }));

  let remainingToCut = targetSavings;
  const cuts = [];

  // Greedy Phase 1: Try cutting from non-essentials first (up to 50% cut per category)
  for (const cat of sortedCategories) {
    if (!cat.essential && remainingToCut > 0) {
      const maxCut = cat.amount * 0.5; // suggest cutting up to 50%
      const actualCut = Math.min(remainingToCut, maxCut);
      if (actualCut > 0) {
        cuts.push({ category: cat.name, cutAmount: actualCut, reason: 'Discretionary spending' });
        remainingToCut -= actualCut;
      }
    }
  }

  // Greedy Phase 2: If we still need to cut, reduce essentials by smaller margin (10%)
  if (remainingToCut > 0) {
    for (const cat of sortedCategories) {
      if (cat.essential && remainingToCut > 0) {
        const maxCut = cat.amount * 0.1; // only 10%
        const actualCut = Math.min(remainingToCut, maxCut);
        if (actualCut > 0) {
          cuts.push({ category: cat.name, cutAmount: actualCut, reason: 'Essential category optimization' });
          remainingToCut -= actualCut;
        }
      }
    }
  }

  return {
    targetSavings: Math.round(targetSavings),
    achievedCuts: Math.round(targetSavings - remainingToCut),
    suggestions: cuts.map(c => ({ ...c, cutAmount: Math.round(c.cutAmount) }))
  };
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
