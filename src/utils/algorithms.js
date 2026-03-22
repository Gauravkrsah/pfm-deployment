/**
 * src/utils/algorithms.js
 * 
 * Custom algorithms for Personal Finance Manager analysis.
 * Implements Predictive Analytics, Budget Optimization, and 
 * String-distance Categorization.
 */

/**
 * 1. Future Expense Prediction (Linear Regression with outlier removal)
 * Predicts next month's total spending from historical daily data.
 * Outlier days (e.g. a one-off Rs.500k purchase) are excluded before
 * fitting the regression line so they don't skew the forecast.
 */
export function predictFutureExpenses(data) {
  if (!data || data.length < 2) return null;

  // Group raw transactions into daily totals (expenses only)
  const dailyTotals = {};
  data.forEach(item => {
    if (item.amount > 0 && item.category !== 'income' && item.category !== 'loan') {
      const date = new Date(item.date).toISOString().split('T')[0];
      dailyTotals[date] = (dailyTotals[date] || 0) + item.amount;
    }
  });

  const sortedDates = Object.keys(dailyTotals).sort();
  if (sortedDates.length < 2) return null;

  const baseDate = new Date(sortedDates[0]).getTime();
  const allDays = sortedDates.map(date => {
    const d = (new Date(date).getTime() - baseDate) / (1000 * 3600 * 24);
    return { x: d, y: dailyTotals[date] };
  });

  // --- Outlier removal ---
  // A single large one-off expense (e.g. Rs.501k transport bill) on one day
  // can make the regression slope huge and inflate the 30-day prediction wildly.
  // We remove days where daily spend > 3× the median before fitting the line.
  const sortedYValues = allDays.map(d => d.y).sort((a, b) => a - b);
  const mid = Math.floor(sortedYValues.length / 2);
  const median = sortedYValues.length % 2 !== 0
    ? sortedYValues[mid]
    : (sortedYValues[mid - 1] + sortedYValues[mid]) / 2;

  const cleanDays = allDays.filter(d => d.y <= median * 3);
  // If too many points were stripped, fall back to all data
  const regressionDays = cleanDays.length >= 2 ? cleanDays : allDays;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const n = regressionDays.length;
  regressionDays.forEach(p => {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  });

  const avgDailyClean = sumY / n;
  const totalDays = allDays.length;
  const confidence = totalDays >= 30 ? 'high' : totalDays >= 10 ? 'medium' : 'low';

  const denominator = (n * sumX2 - sumX * sumX);
  if (denominator === 0) {
    const simple = Math.round(avgDailyClean * 30);
    return {
      trend: 'stable', predictedNextMonth: simple,
      avgDailySpend: Math.round(avgDailyClean),
      daysOfData: totalDays, confidence, changePercent: 0
    };
  }

  const m = (n * sumXY - sumX * sumY) / denominator;
  const b = (sumY - m * sumX) / n;

  // Sum up the regression prediction for the next 30 days
  const lastX = regressionDays[regressionDays.length - 1].x;
  let predictedSum = 0;
  for (let i = 1; i <= 30; i++) {
    predictedSum += Math.max(0, m * (lastX + i) + b);
  }

  // Safety cap: never predict more than 1.5× the simple 30-day average.
  // Even a legitimate upward trend should stay grounded in actual spending.
  const simpleProjection = avgDailyClean * 30;
  const cappedPrediction = Math.min(predictedSum, simpleProjection * 1.5);

  const changePercent = avgDailyClean > 0
    ? Math.round(((cappedPrediction / 30 - avgDailyClean) / avgDailyClean) * 100)
    : 0;

  return {
    m, b,
    trend: m > 0 ? 'increasing' : 'decreasing',
    predictedNextMonth: Math.round(cappedPrediction),
    avgDailySpend: Math.round(avgDailyClean),
    daysOfData: totalDays,
    confidence,
    changePercent
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
