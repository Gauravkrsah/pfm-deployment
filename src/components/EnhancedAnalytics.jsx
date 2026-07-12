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

const SAVINGS_GOAL_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80]

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
       const current = stats.categories[cat];
       const cut = cutsMap[cat] || 0;
       return {
          category: cat,
          amount: current,
          "Target Spending": current - cut,
          "Projected Savings": cut
       };
    }).sort((a,b) => b.amount - a.amount);
  }, [algorithms.optimization, stats.categories]);

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

  const fallbackOptimizerExplainer = useMemo(() => {
    if (!algorithms.optimization || stats.expense === 0) return "Categorize your expenses so we can spot places where you can save.";
    const { achievedCuts, suggestions, targetSavings } = algorithms.optimization;
    
    if (suggestions.length === 0) return `There is no realistic way to save ${savingsGoal}% from these category totals without very large reductions.`;
    
    const topCat = suggestions[0]?.category;
    const topCut = suggestions[0]?.cutAmount || 0;
    const isTargetMet = achievedCuts >= targetSavings;
    
    if (isTargetMet) {
      return `You can save Rs.${achievedCuts.toLocaleString()} and reach the Rs.${targetSavings.toLocaleString()} goal, mainly from ${topCat} (Rs.${topCut.toLocaleString()}).`;
    } else {
      return `You can realistically save Rs.${achievedCuts.toLocaleString()} of the Rs.${targetSavings.toLocaleString()} goal, mainly from ${topCat} (Rs.${topCut.toLocaleString()}).`;
    }
  }, [algorithms.optimization, stats.expense, savingsGoal]);
  const optimizerExplainer = fallbackOptimizerExplainer

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
      <div className="bg-white dark:bg-paper-100 border border-paper-200/60 dark:border-paper-300/50 rounded-2xl p-6 shadow-sm overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-8">
          
          <div className="lg:w-1/3 flex flex-col gap-4">
            <h4 className="font-bold text-xl text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
              <span className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400">🎯</span>
              Budget Optimizer
            </h4>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
               <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Savings Goal</label>
               <div className="relative w-full sm:w-44" ref={goalMenuRef}>
                 <button
                   type="button"
                   onClick={() => setIsGoalMenuOpen(open => !open)}
                   className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all ${isGoalMenuOpen
                     ? 'border-emerald-400 bg-emerald-50 text-emerald-900 shadow-lg shadow-emerald-500/10 ring-4 ring-emerald-500/10 dark:bg-emerald-900/20 dark:text-emerald-100'
                     : 'border-emerald-200 bg-white text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50/70 dark:border-emerald-800 dark:bg-paper-300 dark:text-emerald-100 dark:hover:bg-paper-400'
                   }`}
                   aria-haspopup="listbox"
                   aria-expanded={isGoalMenuOpen}
                 >
                   <span>Save {savingsGoal}%</span>
                   <svg className={`w-4 h-4 transition-transform ${isGoalMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                           <span>Save {v}%</span>
                           {savingsGoal === v && (
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                             </svg>
                           )}
                         </button>
                       ))}
                     </div>
                   </div>
                 )}
               </div>
            </div>
            
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm text-gray-700 dark:border-emerald-900/50 dark:bg-emerald-900/10 dark:text-gray-200">
              <p className="leading-relaxed">
                {optimizerExplainer}
              </p>
            </div>

            {algorithms.optimization && stats.expense > 0 ? (() => {
              const { targetSavings, achievedCuts, suggestions } = algorithms.optimization;
              return (
                 <div className="mt-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-5 border border-emerald-100 dark:border-emerald-800/30">
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2 uppercase tracking-wide">Savings Plan</div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-gray-600 dark:text-gray-400">Target Savings:</span>
                         <span className="font-bold text-gray-900 dark:text-gray-100">Rs.{targetSavings.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-gray-600 dark:text-gray-400">Possible Savings:</span>
                         <span className="font-bold text-emerald-600 dark:text-emerald-400">Rs.{achievedCuts.toLocaleString()}</span>
                      </div>
                    </div>
                    {suggestions.length > 0 ? (
                       <div className="mt-4 pt-4 border-t border-emerald-200/50 dark:border-emerald-800/50">
                          <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-2">Recommended Savings:</div>
                          <ul className="space-y-2 text-sm max-h-[140px] overflow-y-auto scrollbar-thin pr-2">
                             {suggestions.map((sug, i) => (
                                <li key={i} className="flex justify-between items-center py-0.5">
                                   <span className="capitalize">{sug.category}</span>
                                   <span className="text-emerald-600 font-semibold">Save Rs.{sug.cutAmount.toLocaleString()}</span>
                                </li>
                             ))}
                          </ul>
                       </div>
                    ) : (
                       <div className="mt-4 text-sm text-emerald-600">No extra savings needed at this level.</div>
                    )}
                 </div>
              )
            })() : (
               <div className="text-sm text-gray-500 italic mt-6 bg-gray-50 dark:bg-paper-200/50 p-4 rounded-xl">Add expenses to get optimization suggestions.</div>
            )}
          </div>

          <div className="lg:w-2/3 min-h-[300px] border border-gray-100 dark:border-paper-300 rounded-xl p-4 bg-gray-50/50 dark:bg-paper-200/20">
            <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 text-center">Current vs Recommended Spending</h5>
            {optimizerData.length > 0 ? (
               <ResponsiveContainer width="100%" height="90%">
                 <BarChart data={optimizerData} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                   <XAxis dataKey="category" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                   <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} tickFormatter={v => `Rs.${v/1000}k`} />
                   <RechartsTooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                   <Legend wrapperStyle={{fontSize: 12}} />
                   <Bar dataKey="Target Spending" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                   <Bar dataKey="Projected Savings" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                 </BarChart>
               </ResponsiveContainer>
            ) : (
               <div className="h-full flex items-center justify-center text-gray-400 text-sm">No category data available.</div>
            )}
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
