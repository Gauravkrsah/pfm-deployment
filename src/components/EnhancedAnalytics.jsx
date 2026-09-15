import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../supabase'
import DateRangePicker, { getDateRange } from './ui/DateRangePicker'
import { calculateMovingAverage, optimizeBudget } from '../utils/algorithms'
import { 
  ComposedChart, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, 
  BarChart, Bar, Legend
} from 'recharts'
import { AlertCircle, CheckCircle2, Info, Target, TrendingDown } from 'lucide-react'

const SAVINGS_GOAL_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80]

const formatRs = (value) => `Rs.${Math.round(Number(value) || 0).toLocaleString()}`

const formatCategory = (value) => String(value || 'Other')
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase())

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

      const categories = {}
      expenses.forEach(r => {
        const cat = (r.category || 'other').toLowerCase()
        categories[cat] = (categories[cat] || 0) + r.amount
      })

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
      const optimization = optimizeBudget(categories, expenseTotal, savingsGoal / 100);

      setAlgorithms({
        trends,
        optimization
      });
    } else {
      setStats({ expense: 0, income: 0, balance: 0, loanOut: 0, loanIn: 0, categories: {}, dailyData: [] })
      setAlgorithms({ trends: null, optimization: null })
    }
    setLoading(false)
  }, [user, currentGroup, range, savingsGoal])

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

  const savingsRate = stats.income > 0 ? Math.round((stats.balance / stats.income) * 100) : 0

  const optimizerData = useMemo(() => {
    if (!algorithms.optimization || !stats.categories) return [];
    const cutsMap = {};
    algorithms.optimization.suggestions.forEach(c => cutsMap[c.category] = c.cutAmount);
    
    return Object.keys(stats.categories).map(cat => {
       const current = Number(stats.categories[cat]) || 0;
       const cut = Number(cutsMap[cat]) || 0;
       return {
          category: cat,
          current,
          afterPlan: Math.max(0, current - cut),
          cutAmount: cut,
       };
    }).sort((a,b) => b.current - a.current);
  }, [algorithms.optimization, stats.categories]);

  const optimizerPlan = useMemo(() => {
    if (!algorithms.optimization || stats.expense <= 0) return null

    const target = Number(algorithms.optimization.targetSavings) || 0
    const achieved = Number(algorithms.optimization.achievedCuts) || 0
    const remaining = Math.max(0, target - achieved)
    const progress = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0

    return {
      target,
      achieved,
      remaining,
      progress,
      afterPlan: Math.max(0, stats.expense - achieved),
      suggestions: algorithms.optimization.suggestions || [],
      targetMet: remaining === 0,
    }
  }, [algorithms.optimization, stats.expense])

  const pieColors = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6'];
  const pieData = Object.keys(stats.categories).map(cat => ({
    name: cat,
    value: stats.categories[cat]
  })).sort((a,b) => b.value - a.value);

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

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-paper-300 border border-gray-200 dark:border-paper-400 p-3 rounded-lg shadow-lg">
          <p className="font-bold text-gray-800 dark:text-gray-100 mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: Rs.{entry.value.toLocaleString()}
            </p>
          ))}
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
            <div className="text-[10px] md:text-xs font-semibold text-red-800 dark:text-red-300 uppercase tracking-wide mb-1">Total Expenses</div>
            <div className="text-lg md:text-2xl font-bold text-red-900 dark:text-red-100">Rs.{stats.expense.toLocaleString()}</div>
            <div className="text-[10px] md:text-xs text-red-600 dark:text-red-400 mt-1">Money leaving your wallet</div>
          </div>
          <div className="absolute right-0 bottom-0 opacity-5 dark:opacity-10 transform translate-x-1/4 translate-y-1/4 text-red-900 dark:text-red-500">
            <svg width="70" height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>

        {/* Income Card */}
        <div className="bg-green-50 dark:bg-green-900/10 p-3 md:p-4 rounded-xl border border-green-100 dark:border-green-900/20 shadow-sm relative overflow-hidden min-w-[170px] md:min-w-0 flex-shrink-0 md:flex-shrink transition-colors">
          <div className="relative z-10 flex flex-col">
            <div className="text-[10px] md:text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wide mb-1">Total Income</div>
            <div className="text-lg md:text-2xl font-bold text-green-900 dark:text-green-100">Rs.{stats.income.toLocaleString()}</div>
            <div className="text-[10px] md:text-xs text-green-600 dark:text-green-400 mt-1">Money earned this period</div>
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
            <div className={`text-[10px] md:text-xs font-semibold uppercase tracking-wide mb-1 ${stats.balance >= 0 ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>Net Balance</div>
            <div className={`text-lg md:text-2xl font-bold ${stats.balance >= 0 ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
              Rs.{Math.abs(stats.balance).toLocaleString()}
            </div>
             <div className={`text-[10px] md:text-xs mt-1 ${stats.balance >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {stats.balance >= 0 ? '✨ You are in the green!' : '⚠️ Deficit detected'}
            </div>
          </div>
          <div className={`absolute right-0 bottom-0 opacity-5 dark:opacity-10 transform translate-x-1/4 translate-y-1/4 ${stats.balance >= 0 ? 'text-green-900 dark:text-green-500' : 'text-red-900 dark:text-red-500'}`}>
            <svg width="70" height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>
      </div>

      {/* Advanced Analytics - Daily Spending Trends Row */}
      <div className="bg-white dark:bg-paper-100 border border-paper-200/60 dark:border-paper-300/50 rounded-2xl p-6 shadow-sm overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-8">
          
          <div className="lg:w-1/3 flex flex-col gap-4">
            <h4 className="font-bold text-xl text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
              <span className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">📈</span>
              Daily Spending Trends
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {trendsExplainer}
            </p>

            {algorithms.trends && algorithms.trends.movingAverageData.length > 0 ? (
                 <div className="mt-2 flex flex-col gap-4">
                   <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-xl p-5 border border-indigo-100 dark:border-indigo-800/30">
                     <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2 uppercase tracking-wide">Average Daily Spend</div>
                     <div className="flex items-baseline gap-1 break-words">
                       <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Rs.</span>
                       <span className="text-3xl font-extrabold text-indigo-700 dark:text-indigo-300">
                         {Math.round(algorithms.trends.avgDailySpend).toLocaleString()}
                       </span>
                     </div>
                   </div>

                   <div className="rounded-xl p-4 border text-sm bg-orange-50 dark:bg-orange-900/10 border-orange-200 text-orange-800 dark:text-orange-200">
                     <div className="font-bold mb-1 border-b border-orange-200/50 pb-2">Highest Spend Day</div>
                     <div className="text-2xl font-bold mt-2 break-words">
                       Rs.{Math.round(algorithms.trends.highestDay).toLocaleString()}
                     </div>
                   </div>
                 </div>
            ) : (
               <div className="text-sm text-gray-500 italic mt-6 bg-gray-50 dark:bg-paper-200/50 p-4 rounded-xl">Not enough daily data to calculate trends.</div>
            )}
          </div>

          <div className="lg:w-2/3 min-h-[300px] border border-gray-100 dark:border-paper-300 rounded-xl p-4 bg-gray-50/50 dark:bg-paper-200/20">
            <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 text-center">Historical Daily Spend & Moving Avg (7D)</h5>
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
                   <RechartsTooltip content={<CustomTooltip />} />
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
      <div className="bg-white dark:bg-paper-100 border border-paper-200/60 dark:border-paper-300/50 rounded-2xl p-5 sm:p-6 shadow-sm overflow-hidden">
        <div className="flex flex-col xl:flex-row gap-6 xl:gap-8">
          <div className="xl:w-[38%] flex flex-col gap-4 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Target size={20} strokeWidth={2.2} />
                </span>
                <div>
                  <h4 className="font-bold text-xl leading-tight text-emerald-950 dark:text-emerald-100">Budget Optimizer</h4>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">A what-if plan to lower spending from the categories you can change first.</p>
                </div>
              </div>
              <span className="hidden sm:inline-flex flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:bg-paper-300 dark:text-gray-400">Guide</span>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3.5 py-3 dark:border-emerald-900/50 dark:bg-emerald-900/10">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Target reduction</label>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Choose how much less to spend</p>
              </div>
              <div className="relative w-32 flex-shrink-0" ref={goalMenuRef}>
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
                  <span>Reduce {savingsGoal}%</span>
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
                          <span>Reduce {v}%</span>
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
                <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-paper-300 dark:bg-paper-200/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Goal progress</div>
                      <div className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                        <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{formatRs(optimizerPlan.achieved)}</span>
                        <span className="text-gray-500 dark:text-gray-400"> of {formatRs(optimizerPlan.target)}</span>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${optimizerPlan.targetMet
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
                  <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    <span>{optimizerPlan.progress}% covered</span>
                    {optimizerPlan.remaining > 0 ? <span>{formatRs(optimizerPlan.remaining)} still needed</span> : <span>Target reached</span>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-gray-100 bg-white p-2.5 dark:border-paper-300 dark:bg-paper-200">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Now</div>
                    <div className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">{formatRs(stats.expense)}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5 dark:border-emerald-900/50 dark:bg-emerald-900/10">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Cut</div>
                    <div className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatRs(optimizerPlan.achieved)}</div>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-2.5 dark:border-blue-900/50 dark:bg-blue-900/10">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">After plan</div>
                    <div className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-300">{formatRs(optimizerPlan.afterPlan)}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-[11px] leading-relaxed text-gray-500 dark:bg-paper-200/50 dark:text-gray-400">
                  <Info size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                  <span>This is a suggested spending cap, not an automatic change to your transactions.</span>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <h5 className="text-sm font-bold text-gray-800 dark:text-gray-100">Your next moves</h5>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Start at the top; suggestions prioritize flexible spending.</p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500 dark:bg-paper-300 dark:text-gray-400">{optimizerPlan.suggestions.length} categories</span>
                  </div>

                  {optimizerPlan.suggestions.length > 0 ? (
                    <ul className="max-h-[300px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                      {optimizerPlan.suggestions.map((suggestion, index) => {
                        const current = Number(stats.categories[suggestion.category]) || 0
                        const cut = Number(suggestion.cutAmount) || 0
                        const after = Math.max(0, current - cut)
                        const cutPercent = current > 0 ? Math.round((cut / current) * 100) : 0
                        const isEssential = suggestion.reason === 'Essential category optimization'
                        return (
                          <li key={`${suggestion.category}-${index}`} className="rounded-xl border border-gray-100 bg-white p-3 dark:border-paper-300 dark:bg-paper-200">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{index + 1}</span>
                                <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{formatCategory(suggestion.category)}</span>
                              </div>
                              <span className="flex-shrink-0 text-xs font-bold text-emerald-600 dark:text-emerald-400">Save {formatRs(cut)}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                              <span>{formatRs(current)} → {formatRs(after)}</span>
                              <span>{cutPercent}% lower</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-paper-400">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, cutPercent)}%` }} />
                            </div>
                            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                              {isEssential ? <AlertCircle size={12} className="text-amber-500" /> : <TrendingDown size={12} className="text-emerald-500" />}
                              {isEssential ? 'Essential - trim carefully' : 'Flexible spending - start here'}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-200">
                      No category can safely cover this goal. Try a smaller reduction or review uncategorized spending.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-500 dark:bg-paper-200/50 dark:text-gray-400">Add expenses to get a category-by-category savings plan.</div>
            )}
          </div>

          <div className="xl:w-[62%] min-h-[420px] rounded-2xl border border-gray-200 bg-gray-50/50 p-4 sm:p-5 dark:border-paper-300 dark:bg-paper-200/20">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h5 className="text-sm font-bold text-gray-800 dark:text-gray-100">Where the plan changes spending</h5>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Compare what you spend now with the suggested cap after the cuts.</p>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500"><TrendingDown size={13} /> Lower is better</span>
            </div>
            {optimizerData.length > 0 ? (
              <div className="mt-3 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={optimizerData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }} barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={value => `Rs.${Math.round(value / 1000)}k`} />
                    <YAxis type="category" dataKey="category" width={112} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatCategory} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="current" name="Current spend" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={10} />
                    <Bar dataKey="afterPlan" name="After plan" fill="#10b981" radius={[0, 4, 4, 0]} barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[400px] items-center justify-center text-sm text-gray-400">Add categorized expenses to compare spending.</div>
            )}
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-gray-100 bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:border-paper-300 dark:bg-paper-200/60 dark:text-gray-400">
              <Info size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span>Gray is your current category total. Green is the amount left after following the suggested cut.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Expense Breakdown Row */}
      <div className="bg-white dark:bg-paper-100 border border-paper-200/60 dark:border-paper-300/50 rounded-2xl p-6 shadow-sm flex flex-col">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
          <div>
            <h4 className="font-bold text-xl text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-1">
              <span className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-xl text-orange-600 dark:text-orange-400">📊</span>
              Expense Breakdown
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-2xl">{breakdownExplainer}</p>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col lg:flex-row items-center gap-8 bg-gray-50/30 dark:bg-paper-200/10 rounded-xl p-4 border border-gray-100/50 dark:border-paper-300/30">
           <div className="w-full lg:w-2/5 h-[320px]">
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
                   <RechartsTooltip content={<CustomTooltip />} />
                 </PieChart>
               </ResponsiveContainer>
             ) : (
               <div className="h-full flex items-center justify-center text-gray-400 text-sm">No expenses found.</div>
             )}
           </div>
           
           <div className="w-full lg:w-3/5 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[320px] overflow-y-auto scrollbar-thin pr-2">
             {pieData.map((item, i) => {
               const percentage = Math.round((item.value / stats.expense) * 100);
               return (
                 <div key={item.name} className="flex items-center justify-between p-4 bg-white dark:bg-paper-200 rounded-xl border border-gray-100 dark:border-paper-300 shadow-sm hover:shadow-md transition-shadow group cursor-default">
                   <div className="flex items-center gap-3">
                     <div className="w-4 h-4 rounded-full shadow-sm" style={{backgroundColor: pieColors[i % pieColors.length]}}></div>
                     <span className="text-base font-semibold capitalize text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{item.name}</span>
                   </div>
                   <div className="flex flex-col items-end">
                     <span className="text-base font-bold text-gray-900 dark:text-white">Rs.{item.value.toLocaleString()}</span>
                     <span className="text-xs font-medium text-gray-500 bg-gray-100 dark:bg-paper-300 px-2 py-0.5 rounded-full mt-1">{percentage}%</span>
                   </div>
                 </div>
               );
             })}
             {pieData.length === 0 && <div className="text-center text-gray-400 text-sm col-span-2 py-8">No data to display.</div>}
           </div>
        </div>
      </div>

      {/* Financial Summary Row */}
      <div className="bg-white dark:bg-paper-100 border border-paper-200/60 dark:border-paper-300/50 rounded-2xl p-6 shadow-sm flex flex-col">
        <div className="mb-6">
          <h4 className="font-bold text-xl text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-1">
             <span className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">📋</span>
             Financial Summary
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-2xl">{summaryExplainer}</p>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row items-stretch gap-8">
           <div className="w-full lg:w-2/3 h-[300px] bg-gray-50/50 dark:bg-paper-200/20 rounded-xl border border-gray-100 dark:border-paper-300 p-4">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={summaryData} margin={{top: 20, right: 20, left: 10, bottom: 0}}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                 <XAxis dataKey="name" tick={{fontSize: 13, fontWeight: 500}} tickLine={false} axisLine={false} />
                 <YAxis tick={{fontSize: 11}} tickLine={false} axisLine={false} tickFormatter={v => `Rs.${v/1000}k`} />
                 <RechartsTooltip content={<CustomTooltip />} cursor={{fill: '#f3f4f6', opacity: 0.4}} />
                 <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={60}>
                    {summaryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 transition-opacity duration-300 cursor-pointer" />
                    ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
           </div>

           <div className="w-full lg:w-1/3 flex flex-col justify-between space-y-4">
              <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-5 rounded-xl border border-indigo-100 dark:border-indigo-800/30 flex-1 flex flex-col justify-center">
                <div className="flex justify-between items-end mb-2">
                   <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">Savings Rate</span>
                   <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">{savingsRate}%</span>
                </div>
                <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70 mb-4">
                  {savingsRate > 20 ? 'Great job! You are saving a healthy amount of your income.' : 'Try to optimize your budget to increase your savings rate.'}
                </p>
                <div className="w-full bg-indigo-200/50 dark:bg-indigo-900/40 rounded-full h-2">
                   <div className="bg-indigo-500 h-2 rounded-full transition-all duration-1000" style={{width: `${Math.max(0, Math.min(100, savingsRate))}%`}}></div>
                </div>
              </div>
              
              <div className="bg-gray-50/80 dark:bg-paper-200/50 p-5 rounded-xl border border-gray-100 dark:border-paper-300 space-y-4">
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
