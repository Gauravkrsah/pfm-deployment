import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../supabase'
import DateRangePicker, { getDateRange } from './ui/DateRangePicker'
import { aggregateExpenseCategories, calculateMovingAverage, optimizeBudget } from '../utils/algorithms'
import { 
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, 
  BarChart, Bar, LabelList
} from 'recharts'
import { AlertCircle, CheckCircle2, Info, Target, TrendingDown } from 'lucide-react'

const SAVINGS_GOAL_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80]

const formatRs = (value) => `Rs.${Math.round(Number(value) || 0).toLocaleString()}`

const formatCategory = (value) => String(value || 'Other')
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase())

const ANALYTICS_SECTION_CLASS = 'flex flex-col overflow-hidden rounded-2xl border border-paper-200/60 bg-white p-5 shadow-sm dark:border-paper-300/50 dark:bg-paper-100 sm:p-6'
const ANALYTICS_PANEL_CLASS = 'rounded-xl border border-gray-100 bg-gray-50/50 dark:border-paper-300 dark:bg-paper-200/20'
const SECTION_TONE_CLASS = {
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
}

function SectionHeading({ icon, title, description, tone = 'indigo', trailing = null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-base ${SECTION_TONE_CLASS[tone] || SECTION_TONE_CLASS.indigo}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-bold leading-tight text-gray-900 dark:text-gray-100">{title}</h3>
          {description && <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
      </div>
      {trailing}
    </div>
  )
}

export default function EnhancedAnalytics({ currentGroup, user }) {
  const [stats, setStats] = useState({
    expense: 0, income: 0, balance: 0, loanOut: 0, loanIn: 0,
    categories: {}, dailyData: []
  })
  const [algorithms, setAlgorithms] = useState({
    trends: null,
    optimization: null
  })
  const [range, setRange] = useState({ type: 'all', start: null, end: null })
  const [loading, setLoading] = useState(true)
  const [savingsGoal, setSavingsGoal] = useState(20)
  // null means "use the optimizer's practical defaults". Once the user edits
  // the selection, an array (including []) represents their exact choices.
  const [selectedBudgetCategories, setSelectedBudgetCategories] = useState(null)
  const [showAllBudgetCategories, setShowAllBudgetCategories] = useState(false)
  const [isGoalMenuOpen, setIsGoalMenuOpen] = useState(false)
  const goalMenuRef = useRef(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    if (!user?.id) { setLoading(false); return }

    let query = supabase.from('expenses').select('*')

    if (range.type !== 'all') {
      const { start, end } = range.type === 'custom'
        ? { start: new Date(range.start), end: new Date(range.end) }
        : getDateRange(range.type)

      // Ensure we have valid dates
      if (start && end) {
        query = query.gte('date', start.toISOString().split('T')[0]).lte('date', end.toISOString().split('T')[0])
      }
    }

    query = currentGroup ? query.eq('group_id', currentGroup.id) : query.eq('user_id', user.id).is('group_id', null)

    const { data } = await query.order('date', { ascending: false })

    if (data?.length) {
      const expenses = data.filter(r => r.amount > 0 && r.category?.toLowerCase() !== 'income' && r.category?.toLowerCase() !== 'loan')
      const income = data.filter(r => r.category?.toLowerCase() === 'income')
      const loanOut = data.filter(r => r.amount > 0 && r.category?.toLowerCase() === 'loan')
      const loanIn = data.filter(r => r.amount < 0 && r.category?.toLowerCase() === 'loan')

      const expenseTotal = expenses.reduce((s, r) => s + r.amount, 0)
      const incomeTotal = income.reduce((s, r) => s + Math.abs(r.amount), 0)
      const loanOutTotal = loanOut.reduce((s, r) => s + r.amount, 0)
      const loanInTotal = loanIn.reduce((s, r) => s + Math.abs(r.amount), 0)

      const categories = aggregateExpenseCategories(expenses)

      const dailyTotals = {};
      expenses.forEach(r => {
        const d = new Date(r.date).toISOString().split('T')[0];
        dailyTotals[d] = (dailyTotals[d] || 0) + r.amount;
      });
      const dailyData = Object.keys(dailyTotals).sort().map(d => ({ date: d, amount: dailyTotals[d] }));

      setStats({
        expense: expenseTotal,
        income: incomeTotal,
        balance: incomeTotal - expenseTotal,
        loanOut: loanOutTotal,
        loanIn: loanInTotal,
        categories,
        dailyData
      })

      // Run advanced algorithms
      const movingAverageData = calculateMovingAverage(data, 7);
      const avgDailySpend = dailyData.length > 0 ? expenseTotal / dailyData.length : 0;
      const highestDay = dailyData.length > 0 ? Math.max(...dailyData.map(d => d.amount)) : 0;
      
      const trends = { movingAverageData, avgDailySpend, highestDay };
      setAlgorithms({
        trends,
        optimization: null
      });
    } else {
      setStats({ expense: 0, income: 0, balance: 0, loanOut: 0, loanIn: 0, categories: {}, dailyData: [] })
      setAlgorithms({ trends: null, optimization: null })
    }
    setLoading(false)
  }, [user, currentGroup, range])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    function handleClickOutside(event) {
      if (goalMenuRef.current && !goalMenuRef.current.contains(event.target)) {
        setIsGoalMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    // A personal and group view can have very different spending categories;
    // start each scope with the safe defaults rather than carrying choices
    // across to another user's data set.
    setSelectedBudgetCategories(null)
    setShowAllBudgetCategories(false)
  }, [user?.id, currentGroup?.id])

  const savingsRate = stats.income > 0 ? Math.round((stats.balance / stats.income) * 100) : 0
  const savingsGoalAmount = stats.income > 0 ? stats.income * (savingsGoal / 100) : 0
  const currentSavings = stats.income - stats.expense
  const additionalSavingsNeeded = Math.max(0, savingsGoalAmount - currentSavings)

  const optimizerResult = useMemo(() => {
    if (!stats.income || !stats.expense || !Object.keys(stats.categories).length) return null
    const targetReductionRatio = additionalSavingsNeeded / stats.expense
    return optimizeBudget(stats.categories, stats.expense, targetReductionRatio, selectedBudgetCategories)
  }, [stats.categories, stats.expense, stats.income, additionalSavingsNeeded, selectedBudgetCategories])

  const optimizerData = useMemo(() => {
    if (!optimizerResult) return []
    return optimizerResult.categoryPlans
        .map(plan => ({
          category: plan.category,
          current: plan.amount,
          afterPlan: Math.max(0, plan.amount - plan.cutAmount),
          cutAmount: plan.cutAmount,
          flexibility: plan.flexibility,
        }))
      .sort((a, b) => b.current - a.current)
  }, [optimizerResult])

  const optimizerSavingsData = useMemo(() => (
    optimizerData
      .filter(item => item.cutAmount > 0)
      .sort((a, b) => b.cutAmount - a.cutAmount)
  ), [optimizerData])

  const optimizerChartHeight = Math.max(250, Math.min(480, optimizerSavingsData.length * 38 + 76))

  const optimizerPlan = useMemo(() => {
    if (!optimizerResult) return null

    const target = Math.round(savingsGoalAmount)
    const current = Math.round(currentSavings)
    const achieved = Number(optimizerResult.achievedCuts) || 0
    const savedAfterPlan = current + achieved
    const requiredImprovement = Math.max(0, target - current)
    const remaining = Math.max(0, requiredImprovement - achieved)
    const progress = requiredImprovement > 0
      ? current < 0
        ? Math.min(100, Math.round((achieved / requiredImprovement) * 100))
        : Math.min(100, Math.round((Math.max(0, savedAfterPlan) / target) * 100))
      : 100
    const afterPlan = Math.max(0, stats.expense - achieved)
    const afterPlanBalance = stats.income - afterPlan

    return {
      target,
      achieved,
      currentSavings: current,
      isDeficit: current < 0,
      deficit: Math.max(0, -current),
      requiredImprovement,
      currentSavingsLabel: current >= 0
        ? `${formatRs(current)} currently saved`
        : `${formatRs(Math.abs(current))} current deficit`,
      currentSavingsSentence: current >= 0
        ? `save ${formatRs(current)}`
        : `have a ${formatRs(Math.abs(current))} deficit`,
      remaining,
      progress,
      progressLabel: current < 0 ? `${progress}% of recovery + savings plan covered` : `${progress}% of goal covered`,
      afterPlan,
      afterPlanBalance,
      afterPlanBalanceLabel: afterPlanBalance >= 0
        ? `${formatRs(afterPlanBalance)} left after expenses`
        : `${formatRs(Math.abs(afterPlanBalance))} deficit remains`,
      availableSavings: Number(optimizerResult.availableSavings) || 0,
      selectedCategories: optimizerResult.selectedCategories || [],
      suggestions: optimizerResult.suggestions || [],
      targetMet: remaining === 0,
    }
  }, [currentSavings, optimizerResult, savingsGoalAmount, stats.expense, stats.income])

  const optimizerSpendData = optimizerPlan
    ? [
      { stage: 'Current spending', amount: stats.expense, fill: '#94a3b8' },
      { stage: optimizerPlan.isDeficit ? 'After spending cut' : 'After saving plan', amount: optimizerPlan.afterPlan, fill: '#10b981' },
    ]
    : []

  const toggleBudgetCategory = (category) => {
    const defaultSelection = optimizerResult?.selectedCategories || []
    setSelectedBudgetCategories(currentSelection => {
      const nextSelection = currentSelection === null ? defaultSelection : currentSelection
      const normalizedCategory = String(category).trim().toLowerCase()
      const hasCategory = nextSelection.some(item => String(item).trim().toLowerCase() === normalizedCategory)
      return hasCategory
        ? nextSelection.filter(item => String(item).trim().toLowerCase() !== normalizedCategory)
        : [...nextSelection, category]
    })
  }

  const visibleBudgetCategories = useMemo(() => {
    if (!optimizerResult) return []
    if (showAllBudgetCategories) return optimizerResult.categoryPlans
    return optimizerResult.categoryPlans.filter(plan => plan.selected)
  }, [optimizerResult, showAllBudgetCategories])

  const hiddenBudgetCategoryCount = optimizerResult
    ? Math.max(0, optimizerResult.categoryPlans.length - visibleBudgetCategories.length)
    : 0

  const pieColors = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6'];
  const pieData = Object.keys(stats.categories).map(cat => ({
    name: cat,
    value: stats.categories[cat]
  })).sort((a,b) => b.value - a.value);
  const largestCategory = pieData[0] || null

  const summaryData = [
    { name: 'Income', value: stats.income, fill: '#22c55e' },
    { name: 'Expenses', value: stats.expense, fill: '#ef4444' },
    { name: 'Balance', value: stats.balance > 0 ? stats.balance : 0, fill: '#10b981' },
  ];

  const trendsExplainer = useMemo(() => {
    if (!algorithms.trends || algorithms.trends.movingAverageData.length === 0) return "Add more daily expenses to see your spending trends and moving averages.";
    const { avgDailySpend, highestDay } = algorithms.trends;
    const dayCount = algorithms.trends.movingAverageData.length;
    
    if (dayCount === 1) {
      return `Only one spending day is in this range, so the daily average and highest day are both Rs.${Math.round(avgDailySpend).toLocaleString()}. Add more days to see a real trend.`;
    }
    
    if (highestDay > avgDailySpend * 3 && avgDailySpend > 0) {
      return `Your average daily spend is Rs.${Math.round(avgDailySpend).toLocaleString()}, but you have significant outliers (like a peak of Rs.${Math.round(highestDay).toLocaleString()}). The moving average line on the graph will help you see your underlying trend despite these spikes.`;
    }
    return `Your average daily spend is Rs.${Math.round(avgDailySpend).toLocaleString()}. The moving average line on the graph smooths out daily variations to show your true spending trajectory.`;
  }, [algorithms.trends]);

  const breakdownExplainer = useMemo(() => {
    if (!stats.expense) return "Categorize your transactions to see your expense breakdown.";
    const sorted = Object.entries(stats.categories).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return "Give your transactions a category to see where your money goes.";
    const topCategory = sorted[0][0];
    const topAmount = sorted[0][1];
    const percentage = Math.round((topAmount / stats.expense) * 100);
    
    if (percentage >= 50) {
      return `Half your money goes to one place. You spent Rs.${topAmount.toLocaleString()} on '${topCategory}' alone, which is ${percentage}% of everything you spent. Keeping that single category in check will make the biggest difference.`;
    }
    
    return `You've spent Rs.${stats.expense.toLocaleString()} across ${sorted.length} categories. '${topCategory}' is costing you the most right now at Rs.${topAmount.toLocaleString()}, taking up ${percentage}% of your total budget.`;
  }, [stats.expense, stats.categories]);

  const summaryExplainer = useMemo(() => {
    if (stats.income === 0 && stats.expense === 0) return "Add your income and expenses to see your overall account health.";
    const rate = stats.income > 0 ? Math.round((stats.balance / stats.income) * 100) : 0;
    const loanPos = stats.loanOut - stats.loanIn;
    
    let text = `You brought in Rs.${stats.income.toLocaleString()} and spent Rs.${stats.expense.toLocaleString()}, leaving you with Rs.${stats.balance.toLocaleString()}. `;
    
    if (rate >= 20) text += `You managed to save ${rate}% of your income, which is a great habit. `;
    else if (rate > 0) text += `Your savings rate is ${rate}%, meaning you saved a little but spent most of what you earned. `;
    else if (rate < 0) text += `You spent more than you earned, leaving you with a ${rate}% deficit. `;
    
    if (loanPos > 0) text += `On top of that, people owe you Rs.${loanPos.toLocaleString()}.`;
    else if (loanPos < 0) text += `Just keep in mind you still owe Rs.${Math.abs(loanPos).toLocaleString()} in loans.`;
    
    return text;
  }, [stats.expense, stats.income, stats.balance, stats.loanOut, stats.loanIn]);

  const CustomTooltip = ({ active, payload, label, explanation }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-paper-300 border border-gray-200 dark:border-paper-400 p-3 rounded-lg shadow-lg">
          <p className="font-bold text-gray-800 dark:text-gray-100 mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {formatRs(entry.value)}
            </p>
          ))}
          {explanation && <p className="mt-2 max-w-[220px] border-t border-gray-100 pt-2 text-xs leading-relaxed text-gray-500 dark:border-paper-400 dark:text-gray-300">{explanation}</p>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`card p-6 border-0 shadow-none bg-transparent sm:bg-white dark:sm:bg-paper-100 sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:border sm:border-paper-200/60 dark:sm:border-paper-300/50 space-y-6 transition-all duration-300 ${loading ? 'opacity-70 pointer-events-none' : ''}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-xl tracking-tight text-ink-900">Financial Analytics</h2>
          <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 sm:block hidden">View your financial trends and insights</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <DateRangePicker value={range} onChange={setRange} className="flex-1 sm:w-48" />
          <button
            onClick={fetch}
            disabled={loading}
            className="px-3 py-2 text-xs bg-gray-100 dark:bg-paper-200 hover:bg-gray-200 dark:hover:bg-paper-300 rounded-lg transition-colors text-gray-700 dark:text-gray-200 disabled:opacity-50"
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="flex md:grid md:grid-cols-3 gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        {/* Expenses Card */}
        <div className="bg-red-50 dark:bg-red-900/10 p-3 md:p-4 rounded-xl border border-red-100 dark:border-red-900/20 shadow-sm relative overflow-hidden min-w-[170px] md:min-w-0 flex-shrink-0 md:flex-shrink transition-colors">
          <div className="relative z-10 flex flex-col">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-800 dark:text-red-300">Total Expenses</div>
            <div className="text-lg md:text-2xl font-bold text-red-900 dark:text-red-100">Rs.{stats.expense.toLocaleString()}</div>
            <div className="mt-1 text-xs text-red-600 dark:text-red-400">Money leaving your wallet</div>
          </div>
          <div className="absolute right-0 bottom-0 opacity-5 dark:opacity-10 transform translate-x-1/4 translate-y-1/4 text-red-900 dark:text-red-500">
            <svg width="70" height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>

        {/* Income Card */}
        <div className="bg-green-50 dark:bg-green-900/10 p-3 md:p-4 rounded-xl border border-green-100 dark:border-green-900/20 shadow-sm relative overflow-hidden min-w-[170px] md:min-w-0 flex-shrink-0 md:flex-shrink transition-colors">
          <div className="relative z-10 flex flex-col">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-800 dark:text-green-300">Total Income</div>
            <div className="text-lg md:text-2xl font-bold text-green-900 dark:text-green-100">Rs.{stats.income.toLocaleString()}</div>
            <div className="mt-1 text-xs text-green-600 dark:text-green-400">Money earned this period</div>
          </div>
          <div className="absolute right-0 bottom-0 opacity-5 dark:opacity-10 transform translate-x-1/4 translate-y-1/4 text-green-900 dark:text-green-500">
            <svg width="70" height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>

        {/* Balance Card */}
        <div className={`p-3 md:p-4 rounded-xl border shadow-sm relative overflow-hidden min-w-[170px] md:min-w-0 flex-shrink-0 md:flex-shrink transition-colors ${stats.balance >= 0
          ? 'bg-gradient-to-br from-green-50 to-emerald-100/50 border-green-200 dark:from-green-900/10 dark:to-emerald-900/20 dark:border-green-800/30'
          : 'bg-gradient-to-br from-red-50 to-orange-100/50 border-red-200 dark:from-red-900/10 dark:to-orange-900/20 dark:border-red-800/30'
          }`}>
          <div className="relative z-10 flex flex-col">
            <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${stats.balance >= 0 ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>Net Balance</div>
            <div className={`text-lg md:text-2xl font-bold ${stats.balance >= 0 ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
              Rs.{Math.abs(stats.balance).toLocaleString()}
            </div>
             <div className={`mt-1 text-xs ${stats.balance >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {stats.balance >= 0 ? '✨ You are in the green!' : '⚠️ Deficit detected'}
            </div>
          </div>
          <div className={`absolute right-0 bottom-0 opacity-5 dark:opacity-10 transform translate-x-1/4 translate-y-1/4 ${stats.balance >= 0 ? 'text-green-900 dark:text-green-500' : 'text-red-900 dark:text-red-500'}`}>
            <svg width="70" height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>
      </div>

      {/* Advanced Analytics - Daily Spending Trends Row */}
      <div className={ANALYTICS_SECTION_CLASS}>
        <div className="flex flex-col lg:flex-row gap-8">
          
          <div className="flex flex-col gap-4 lg:w-1/3">
            <SectionHeading icon="📈" title="Daily Spending Trends" description={trendsExplainer} tone="indigo" />

            {algorithms.trends && algorithms.trends.movingAverageData.length > 0 ? (
                 <div className="mt-2 flex flex-col gap-4">
                   <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-800/30 dark:bg-indigo-900/10">
                     <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2 uppercase tracking-wide">Average Daily Spend</div>
                     <div className="flex items-baseline gap-1 break-words">
                       <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Rs.</span>
                       <span className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-300">
                         {Math.round(algorithms.trends.avgDailySpend).toLocaleString()}
                       </span>
                     </div>
                   </div>

                   <div className="rounded-xl p-4 border text-sm bg-orange-50 dark:bg-orange-900/10 border-orange-200 text-orange-800 dark:text-orange-200">
                     <div className="mb-1 border-b border-orange-200/50 pb-2 font-bold">Highest Spend Day</div>
                     <div className="text-2xl font-bold mt-2 break-words">
                       Rs.{Math.round(algorithms.trends.highestDay).toLocaleString()}
                     </div>
                   </div>
                 </div>
            ) : (
               <div className="text-sm text-gray-500 italic mt-6 bg-gray-50 dark:bg-paper-200/50 p-4 rounded-xl">Not enough daily data to calculate trends.</div>
            )}
          </div>

          <div className={`${ANALYTICS_PANEL_CLASS} min-h-[300px] p-4 lg:w-2/3`}>
            <h4 className="mb-4 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Historical Daily Spend & Moving Avg (7D)</h4>
            {algorithms.trends && algorithms.trends.movingAverageData.length > 0 ? (
               <ResponsiveContainer width="100%" height="90%">
                 <ComposedChart data={algorithms.trends.movingAverageData}>
                   <defs>
                     <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                       <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                   <XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false} minTickGap={30} />
                   <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} tickFormatter={v => `Rs.${v}`} />
                   <RechartsTooltip content={<CustomTooltip explanation="The area shows what you spent each day. The dashed line is the 7-day average, which smooths out one-off spikes." />} />
                   <Area type="monotone" dataKey="amount" name="Daily Spend" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                   <Line type="monotone" dataKey="movingAverage" name="7-Day Avg" stroke="#f59e0b" strokeWidth={4} dot={false} strokeDasharray="5 5" />
                 </ComposedChart>
               </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-gray-400 text-sm">No timeline data available.</div>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Analytics - Budget Optimizer Row */}
      <div className={ANALYTICS_SECTION_CLASS}>
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] xl:gap-8">
          <div className="flex min-w-0 flex-col gap-4">
            <SectionHeading
              icon={<Target size={18} strokeWidth={2.2} />}
              title={currentSavings < 0 ? 'Expenses exceed income' : 'Savings Planner'}
              description={currentSavings < 0
                ? `Expenses exceed income by ${formatRs(Math.abs(currentSavings))}. Saving is not possible until expenses are below income.`
                : `Choose a savings target based on your income; this shows which spending you could trim to reach it.`}
              tone="emerald"
              trailing={<span className={`hidden flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide sm:inline-flex ${currentSavings < 0
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-gray-100 text-gray-500 dark:bg-paper-300 dark:text-gray-400'}`}>{currentSavings < 0 ? 'Action needed' : 'Guide'}</span>}
            />

            {currentSavings < 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/15">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <h5 className="text-sm font-bold text-amber-900 dark:text-amber-200">Saving is not possible right now</h5>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                      Your expenses are {formatRs(Math.abs(currentSavings))} higher than your income. Reduce expenses below income first; then you can set a savings goal.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-white/70 p-2.5 dark:bg-paper-200/40">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Income</div>
                    <div className="mt-1 text-sm font-bold text-amber-950 dark:text-amber-100">{formatRs(stats.income)}</div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-2.5 dark:bg-paper-200/40">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Expenses</div>
                    <div className="mt-1 text-sm font-bold text-amber-950 dark:text-amber-100">{formatRs(stats.expense)}</div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-2.5 dark:bg-paper-200/40">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Over income</div>
                    <div className="mt-1 text-sm font-bold text-amber-950 dark:text-amber-100">{formatRs(Math.abs(currentSavings))}</div>
                  </div>
                </div>
              </div>
            ) : (
              <>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3.5 py-3 dark:border-emerald-900/50 dark:bg-emerald-900/10">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Savings target</label>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {stats.income > 0
                    ? currentSavings < 0
                      ? `Income ${formatRs(stats.income)} · current deficit ${formatRs(Math.abs(currentSavings))}`
                      : `Save ${formatRs(savingsGoalAmount)} from ${formatRs(stats.income)} income`
                    : 'Add income to calculate your target'}
                </p>
              </div>
              <div className="relative w-44 flex-shrink-0" ref={goalMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsGoalMenuOpen(open => !open)}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-all ${isGoalMenuOpen
                    ? 'border-emerald-400 bg-white text-emerald-900 shadow-lg ring-4 ring-emerald-500/10 dark:bg-paper-300 dark:text-emerald-100'
                    : 'border-emerald-200 bg-white text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-paper-300 dark:text-emerald-100 dark:hover:bg-paper-400'
                  }`}
                  aria-haspopup="listbox"
                  aria-expanded={isGoalMenuOpen}
                >
                  <span>Save {savingsGoal}% of income</span>
                  <svg className={`h-4 w-4 transition-transform ${isGoalMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isGoalMenuOpen && (
                  <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-2xl shadow-emerald-950/10 dark:border-emerald-900 dark:bg-paper-200">
                    <div className="max-h-64 overflow-y-auto p-1.5 scrollbar-thin" role="listbox">
                      {SAVINGS_GOAL_OPTIONS.map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            setSavingsGoal(v)
                            setIsGoalMenuOpen(false)
                          }}
                          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${savingsGoal === v
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-gray-200 dark:hover:bg-paper-300 dark:hover:text-emerald-100'
                          }`}
                          role="option"
                          aria-selected={savingsGoal === v}
                        >
                          <span>Save {v}% of income</span>
                          {savingsGoal === v && <CheckCircle2 size={15} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {optimizerPlan ? (
              <>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 dark:border-emerald-900/50 dark:bg-emerald-900/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h5 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                        {optimizerPlan.targetMet
                          ? 'Your savings goal is already reached'
                          : optimizerPlan.isDeficit
                            ? 'Cover the deficit and reach your savings goal'
                            : 'Which spending can you reduce?'}
                      </h5>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {optimizerPlan.targetMet
                          ? 'You can still select categories below if you want to save more, but no cut is needed for this goal.'
                          : optimizerPlan.isDeficit
                            ? `Expenses are higher than income by ${formatRs(optimizerPlan.deficit)}. Reduce spending until the deficit is covered, then continue toward the savings goal.`
                          : 'Choose areas you can realistically change. Flexible categories are selected first; essentials stay off unless you choose them.'}
                      </p>
                    </div>
                    {selectedBudgetCategories !== null && (
                      <button
                        type="button"
                        onClick={() => setSelectedBudgetCategories(null)}
                        className="flex-shrink-0 text-xs font-bold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {visibleBudgetCategories.map(plan => {
                      const selected = optimizerPlan.selectedCategories.some(category => String(category).toLowerCase() === String(plan.category).toLowerCase())
                      return (
                        <button
                          key={plan.category}
                          type="button"
                          onClick={() => toggleBudgetCategory(plan.category)}
                          aria-pressed={selected}
                          className={`flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${selected
                            ? 'border-emerald-300 bg-white text-emerald-900 shadow-sm dark:border-emerald-700 dark:bg-paper-200 dark:text-emerald-100'
                            : 'border-transparent bg-white/60 text-gray-500 hover:border-gray-200 hover:bg-white dark:bg-paper-200/40 dark:text-gray-400 dark:hover:border-paper-300 dark:hover:bg-paper-200'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${selected
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-gray-300 bg-white dark:border-paper-400 dark:bg-paper-300'
                            }`}>
                              {selected && <CheckCircle2 size={12} />}
                            </span>
                            <span className="truncate text-sm font-semibold">{formatCategory(plan.category)}</span>
                          </span>
                          <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">{optimizerPlan.isDeficit ? 'cut' : 'save'} up to {Math.round(plan.maxCutRate * 100)}%</span>
                        </button>
                      )
                    })}
                  </div>
                  {hiddenBudgetCategoryCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllBudgetCategories(true)}
                      className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
                    >
                      Show {hiddenBudgetCategoryCount} more categor{hiddenBudgetCategoryCount === 1 ? 'y' : 'ies'}
                    </button>
                  )}
                  {showAllBudgetCategories && (
                    <button
                      type="button"
                      onClick={() => setShowAllBudgetCategories(false)}
                      className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      Show selected only
                    </button>
                  )}
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {optimizerPlan.selectedCategories.length > 0
                      ? `${optimizerPlan.selectedCategories.length} selected · these categories can ${optimizerPlan.isDeficit ? 'cut' : 'save'} up to ${formatRs(optimizerPlan.availableSavings)}`
                      : 'Select at least one category to build a plan.'}
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-paper-300 dark:bg-paper-200/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {optimizerPlan.isDeficit ? 'Deficit recovery + savings progress' : 'Savings goal progress'}
                      </div>
                      <div className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                        <span className={`text-xl font-extrabold ${optimizerPlan.isDeficit ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{optimizerPlan.currentSavingsLabel}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {optimizerPlan.isDeficit
                            ? ` · need ${formatRs(optimizerPlan.requiredImprovement)} to recover and reach goal`
                            : ` of ${formatRs(optimizerPlan.target)} goal`}
                        </span>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${optimizerPlan.targetMet
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>
                      {optimizerPlan.targetMet ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {optimizerPlan.targetMet ? 'On target' : 'Partly covered'}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-paper-400">
                    <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${optimizerPlan.progress}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{optimizerPlan.progressLabel}</span>
                    {optimizerPlan.remaining > 0
                      ? <span>{formatRs(optimizerPlan.remaining)} more {optimizerPlan.isDeficit ? 'needed' : 'to save'}</span>
                      : <span>Goal reached</span>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-gray-100 bg-white p-2.5 dark:border-paper-300 dark:bg-paper-200">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Current expenses</div>
                    <div className="mt-1 text-base font-bold text-gray-800 dark:text-gray-100">{formatRs(stats.expense)}</div>
                    <div className="mt-0.5 text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                      {optimizerPlan.isDeficit ? `${formatRs(optimizerPlan.deficit)} above income` : `${formatRs(optimizerPlan.currentSavings)} left after expenses`}
                    </div>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5 dark:border-emerald-900/50 dark:bg-emerald-900/10">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{optimizerPlan.isDeficit ? 'Planned spending cut' : 'Extra saving plan'}</div>
                    <div className="mt-1 text-base font-bold text-emerald-700 dark:text-emerald-300">{formatRs(optimizerPlan.achieved)}</div>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-2.5 dark:border-blue-900/50 dark:bg-blue-900/10">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">After plan</div>
                    <div className="mt-1 text-base font-bold text-blue-700 dark:text-blue-300">{formatRs(optimizerPlan.afterPlan)}</div>
                    <div className="mt-0.5 text-[10px] leading-tight text-blue-600 dark:text-blue-400">{optimizerPlan.afterPlanBalanceLabel}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-500 dark:bg-paper-200/50 dark:text-gray-400">
                  <Info size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                  <span>
                    {optimizerPlan.isDeficit
                      ? `You have a ${formatRs(optimizerPlan.deficit)} deficit. This plan cuts ${formatRs(optimizerPlan.achieved)} and leaves a ${formatRs(Math.max(0, -optimizerPlan.afterPlanBalance))} deficit. You need ${formatRs(optimizerPlan.requiredImprovement)} in total improvement to recover and reach the ${formatRs(optimizerPlan.target)} savings goal.`
                      : optimizerPlan.currentSavings >= optimizerPlan.target
                      ? `You already save ${formatRs(optimizerPlan.currentSavings)} from your income, so the ${formatRs(optimizerPlan.target)} goal is already reached. No spending cut is required.`
                      : `You ${optimizerPlan.currentSavingsSentence}. This plan adds ${formatRs(optimizerPlan.achieved)}; ${optimizerPlan.remaining > 0 ? `you would still need ${formatRs(optimizerPlan.remaining)} more.` : `that reaches your ${formatRs(optimizerPlan.target)} goal.`}`}
                    {' '}This is a suggestion only and does not change your transactions.
                  </span>
                </div>

                <div className={`${ANALYTICS_PANEL_CLASS} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Current spending vs after plan</h4>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {optimizerPlan.isDeficit
                          ? `The plan reduces spending, but ${optimizerPlan.afterPlanBalanceLabel}.`
                          : 'The second bar shows what you would spend after following the suggested cuts.'}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">What-if</span>
                  </div>
                  <div className="mt-3 h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={optimizerSpendData} margin={{ top: 4, right: 58, left: 0, bottom: 0 }}>
                        <XAxis type="number" hide domain={[0, 'dataMax']} />
                        <YAxis type="category" dataKey="stage" width={108} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <RechartsTooltip content={<CustomTooltip explanation={optimizerPlan.isDeficit
                          ? 'The difference between the two bars is the spending cut. It reduces the deficit; it is not savings until expenses fall below income.'
                          : 'The difference between the two bars is the amount this plan could help you save.'} />} />
                        <Bar dataKey="amount" name="Spending" radius={[0, 5, 5, 0]} barSize={22}>
                          {optimizerSpendData.map(entry => <Cell key={entry.stage} fill={entry.fill} />)}
                          <LabelList dataKey="amount" position="insideRight" offset={8} fill="#ffffff" fontSize={11} fontWeight={700} formatter={value => formatRs(value)} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-500 dark:border-paper-300 dark:text-gray-400">
                    <span>{optimizerPlan.isDeficit ? 'Planned spending cut' : 'Planned saving toward goal'}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatRs(optimizerPlan.achieved)}</span>
                  </div>
                </div>

              </>
            ) : (
              <div className="rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-500 dark:bg-paper-200/50 dark:text-gray-400">
                {stats.income > 0
                  ? 'Add expenses to get a category-by-category savings plan.'
                  : 'Add income first to set a savings target. This planner saves a percentage of your recorded income.'}
              </div>
            )}
              </>
            )}
          </div>

          <div className={`${ANALYTICS_PANEL_CLASS} min-w-0 self-start p-4 sm:p-5`}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h5 className="text-sm font-bold text-gray-800 dark:text-gray-100">{optimizerPlan?.isDeficit ? 'Where to cut first' : 'Where to focus first'}</h5>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {optimizerPlan?.isDeficit
                    ? 'Each bar shows how much spending that category could cut to help cover the deficit.'
                    : 'Each bar shows how much that category could contribute toward your savings goal.'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 dark:text-gray-500"><TrendingDown size={13} /> Bigger bar = bigger {optimizerPlan?.isDeficit ? 'cut' : 'saving'}</span>
            </div>
            {optimizerSavingsData.length > 0 ? (
              <div className="mt-3" style={{ height: `${optimizerChartHeight}px` }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={optimizerSavingsData} margin={{ top: 8, right: 52, left: 4, bottom: 4 }} barCategoryGap="24%">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={value => `Rs.${Math.round(value / 1000)}k`} />
                    <YAxis type="category" dataKey="category" width={112} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatCategory} />
                    <RechartsTooltip content={<CustomTooltip explanation={optimizerPlan?.isDeficit ? 'Longer bars represent larger spending cuts. These cuts help close the deficit before savings are possible.' : 'Longer bars contribute more toward the savings goal. Green is flexible spending; amber is essential spending.'} />} cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="cutAmount" name={optimizerPlan?.isDeficit ? 'Planned cut' : 'Planned saving'} fill="#10b981" radius={[0, 5, 5, 0]} barSize={18}>
                      {optimizerSavingsData.map((entry, index) => (
                        <Cell key={`optimizer-save-${entry.category}-${index}`} fill={entry.flexibility === 'essential' ? '#f59e0b' : '#10b981'} />
                      ))}
                      <LabelList dataKey="cutAmount" position="right" fill="#6b7280" fontSize={10} formatter={value => formatRs(value)} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
                <Target size={22} className="text-gray-300 dark:text-gray-600" />
                <span>
                  {optimizerPlan?.targetMet
                    ? 'Your savings goal is already reached, so no category cut is required.'
                    : optimizerPlan
                      ? 'Select a category you can reduce to see its savings impact.'
                    : stats.income > 0
                      ? 'Add expenses to see where your savings goal can come from.'
                      : 'Add income to set a savings goal.'}
                </span>
              </div>
            )}
            {optimizerPlan && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-gray-100 bg-white/70 px-3 py-2 text-xs leading-relaxed text-gray-500 dark:border-paper-300 dark:bg-paper-200/60 dark:text-gray-400">
                <Info size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                <span>Green bars are flexible categories. Amber bars are essential categories you chose to trim carefully. Hover a bar to see its contribution.</span>
              </div>
            )}

            {optimizerPlan && (
              <div className="mt-6 border-t border-paper-200/70 pt-5 dark:border-paper-300/70">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h5 className="text-base font-bold text-ink-950 dark:text-paper-900">{optimizerPlan.isDeficit ? 'Your next cuts' : 'Your next moves'}</h5>
                    <p className="mt-0.5 text-xs text-ink-500 dark:text-paper-600">{optimizerPlan.isDeficit ? 'Start at the top to bring expenses below income.' : 'Start at the top; these actions prioritize flexible spending.'}</p>
                  </div>
                  <span className="rounded-full border border-paper-200/70 bg-paper-50 px-2.5 py-1 text-xs font-bold text-ink-600 dark:border-paper-300 dark:bg-paper-300/50 dark:text-paper-600">{optimizerPlan.suggestions.length} actions</span>
                </div>

                {optimizerPlan.suggestions.length > 0 ? (
                  <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {optimizerPlan.suggestions.map((suggestion, index) => {
                      const current = Number(stats.categories[suggestion.category]) || 0
                      const cut = Number(suggestion.cutAmount) || 0
                      const after = Math.max(0, current - cut)
                      const cutPercent = current > 0 ? Math.round((cut / current) * 100) : 0
                      const isEssential = suggestion.flexibility === 'essential'
                      return (
                        <li key={`${suggestion.category}-${index}`} className="rounded-xl border border-paper-200/70 bg-paper-50/50 p-3.5 dark:border-paper-300 dark:bg-paper-200/40">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-paper-200 bg-paper-100 text-xs font-bold text-paper-700 dark:border-paper-400 dark:bg-paper-300 dark:text-paper-800">{index + 1}</span>
                              <span className="truncate text-sm font-semibold text-ink-900 dark:text-paper-900">{formatCategory(suggestion.category)}</span>
                            </div>
                            <span className="flex-shrink-0 text-sm font-bold text-money-600 dark:text-money-400">{optimizerPlan.isDeficit ? 'Cut' : 'Save'} {formatRs(cut)}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-500 dark:text-paper-600">
                            <span>{formatRs(current)} → {formatRs(after)}</span>
                            <span>{optimizerPlan.isDeficit ? 'Cut' : 'Save'} {cutPercent}%</span>
                          </div>
                          <div
                            className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-200/70 dark:bg-paper-400/70"
                            role="progressbar"
                            aria-label={`${formatCategory(suggestion.category)} potential ${optimizerPlan.isDeficit ? 'cut' : 'saving'}`}
                            aria-valuemin="0"
                            aria-valuemax="100"
                            aria-valuenow={Math.min(100, cutPercent)}
                          >
                            <div className="h-full rounded-full bg-money-500 transition-all duration-500" style={{ width: `${Math.min(100, cutPercent)}%` }} />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-ink-400 dark:text-paper-500">
                            <span>{Math.max(0, 100 - cutPercent)}% remains</span>
                            <span className="font-medium text-money-600 dark:text-money-400">{cutPercent}% {optimizerPlan.isDeficit ? 'cut' : 'saved'}</span>
                          </div>
                          <div className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-ink-500 dark:text-paper-600">
                            {isEssential ? <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" /> : <TrendingDown size={14} className="mt-0.5 flex-shrink-0 text-ink-400 dark:text-paper-500" />}
                            <span>{suggestion.guidance || (isEssential ? 'Essential - trim carefully' : 'Flexible spending - start here')}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 p-3.5 text-sm leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-200">
                    {optimizerPlan.selectedCategories.length === 0
                      ? 'Select the spending categories you are willing to change to see a realistic plan.'
                      : `These choices can ${optimizerPlan.isDeficit ? 'cut' : 'save'} up to ${formatRs(optimizerPlan.availableSavings)}. ${optimizerPlan.isDeficit ? 'Select another category if you need more deficit recovery.' : 'Try a smaller income goal or select another category if you need more.'}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expense Breakdown Row */}
      <div className={ANALYTICS_SECTION_CLASS}>
        <div className="mb-6">
          <SectionHeading icon="📊" title="Expense Breakdown" description={breakdownExplainer} tone="orange" />
        </div>
        
        <div className={`${ANALYTICS_PANEL_CLASS} flex flex-1 flex-col items-start gap-8 bg-gray-50/30 p-4 dark:bg-paper-200/10 lg:flex-row`}>
           <div className="w-full lg:w-2/5 flex-shrink-0">
             <div className="relative h-[300px]">
             {pieData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie 
                     data={pieData} 
                     dataKey="value" 
                     nameKey="name" 
                     cx="50%" 
                     cy="50%" 
                     innerRadius={80} 
                     outerRadius={110} 
                     paddingAngle={6}
                   >
                     {pieData.map((entry, index) => (
                       <Cell 
                         key={`cell-${index}`} 
                         fill={pieColors[index % pieColors.length]} 
                         className="hover:opacity-80 transition-opacity duration-300 cursor-pointer" 
                       />
                     ))}
                   </Pie>
                   <RechartsTooltip content={<CustomTooltip explanation="Each slice is one category's share of your total spending. Larger slices are where more money goes." />} />
                 </PieChart>
               </ResponsiveContainer>
             ) : (
               <div className="h-full flex items-center justify-center text-gray-400 text-sm">No expenses found.</div>
             )}
             {pieData.length > 0 && (
               <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
                 <div>
                   <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Total spent</div>
                   <div className="mt-1 text-xl font-extrabold text-gray-900 dark:text-gray-100">{formatRs(stats.expense)}</div>
                 </div>
               </div>
             )}
             </div>
             {largestCategory && (
               <div className="mt-4 grid grid-cols-2 gap-3">
                 <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-3 dark:border-orange-900/40 dark:bg-orange-900/10">
                   <div className="text-xs font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">Largest area</div>
                   <div className="mt-1 truncate text-sm font-bold text-gray-800 dark:text-gray-100">{formatCategory(largestCategory.name)}</div>
                   <div className="mt-0.5 text-xs text-orange-700 dark:text-orange-300">{formatRs(largestCategory.value)} · {Math.round((largestCategory.value / stats.expense) * 100)}%</div>
                 </div>
                 <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-paper-300 dark:bg-paper-200">
                   <div className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Categories</div>
                   <div className="mt-1 text-lg font-extrabold text-gray-800 dark:text-gray-100">{pieData.length}</div>
                   <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">tracked this period</div>
                 </div>
               </div>
             )}
           </div>
           
           <div className="w-full min-w-0 lg:w-3/5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
             {pieData.map((item, i) => {
               const percentage = Math.round((item.value / stats.expense) * 100);
               return (
                 <div key={item.name} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm transition-shadow group cursor-default hover:shadow-md dark:border-paper-300 dark:bg-paper-200">
                   <div className="flex min-w-0 items-center gap-2.5">
                     <div className="h-3.5 w-3.5 flex-shrink-0 rounded-full shadow-sm" style={{backgroundColor: pieColors[i % pieColors.length]}}></div>
                     <span className="truncate text-sm font-semibold capitalize text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-200 dark:group-hover:text-white">{item.name}</span>
                   </div>
                   <div className="flex flex-col items-end">
                     <span className="text-sm font-bold text-gray-900 dark:text-white">{formatRs(item.value)}</span>
                     <span className="mt-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-paper-300">{percentage}%</span>
                   </div>
                 </div>
               );
             })}
             {pieData.length === 0 && <div className="text-center text-gray-400 text-sm col-span-2 py-8">No data to display.</div>}
           </div>
        </div>
      </div>

      {/* Financial Summary Row */}
      <div className={ANALYTICS_SECTION_CLASS}>
        <div className="mb-6">
          <SectionHeading icon="📋" title="Financial Summary" description={summaryExplainer} tone="blue" />
        </div>

        <div className="flex-1 flex flex-col lg:flex-row items-stretch gap-8">
           <div className={`${ANALYTICS_PANEL_CLASS} h-[300px] w-full p-4 lg:w-2/3`}>
             <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Income, expenses & balance</h4>
             <ResponsiveContainer width="100%" height="88%">
               <BarChart data={summaryData} margin={{top: 20, right: 20, left: 10, bottom: 0}}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                 <XAxis dataKey="name" tick={{fontSize: 13, fontWeight: 500}} tickLine={false} axisLine={false} />
                 <YAxis tick={{fontSize: 11}} tickLine={false} axisLine={false} tickFormatter={v => `Rs.${v/1000}k`} />
                 <RechartsTooltip content={<CustomTooltip explanation="Income is money in, Expenses is money out, and Balance is what remains after expenses." />} cursor={{fill: '#f3f4f6', opacity: 0.4}} />
                 <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={60}>
                    {summaryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 transition-opacity duration-300 cursor-pointer" />
                    ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
           </div>

           <div className="w-full lg:w-1/3 flex flex-col justify-between space-y-4">
              <div className="flex flex-1 flex-col justify-center rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-800/30 dark:bg-indigo-900/10">
                <div className="flex justify-between items-end mb-2">
                   <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">Savings Rate</span>
                   <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">{savingsRate}%</span>
                </div>
                <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70 mb-4">
                  {savingsRate > 20 ? 'Great job! You are saving a healthy amount of your income.' : 'Try to optimize your budget to increase your savings rate.'}
                </p>
                <div className="w-full bg-indigo-200/50 dark:bg-indigo-900/40 rounded-full h-2">
                   <div className="bg-indigo-500 h-2 rounded-full transition-all duration-1000" style={{width: `${Math.max(0, Math.min(100, savingsRate))}%`}}></div>
                </div>
              </div>
              
              <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-paper-300 dark:bg-paper-200/50">
                <div className="flex justify-between items-center bg-white dark:bg-paper-300 p-3 rounded-lg shadow-sm">
                   <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Net Loan Position</span>
                   <span className={`text-sm font-bold ${stats.loanOut >= stats.loanIn ? 'text-teal-600 dark:text-teal-400' : 'text-orange-600 dark:text-orange-400'}`}>
                      {stats.loanOut >= stats.loanIn ? '+' : '-'}Rs.{Math.abs(stats.loanOut - stats.loanIn).toLocaleString()}
                   </span>
                </div>
                <div className="flex justify-between items-center bg-white dark:bg-paper-300 p-3 rounded-lg shadow-sm">
                   <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Total Volume</span>
                   <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                      Rs.{(stats.income + stats.expense + stats.loanIn + stats.loanOut).toLocaleString()}
                   </span>
                </div>
              </div>
           </div>
        </div>
      </div>

      {stats.expense === 0 && stats.income === 0 && (
        <div className="text-center py-12 bg-gray-50 dark:bg-paper-100/50 border border-gray-100 dark:border-paper-300/50 rounded-2xl">
          <div className="text-4xl mb-3">📭</div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No Data Available</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Start adding expenses and income to see meaningful charts.</p>
        </div>
      )}
    </div>
  )
}
