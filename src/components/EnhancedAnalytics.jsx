import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabase'
import DateRangePicker, { getDateRange } from './ui/DateRangePicker'
import { predictFutureExpenses, optimizeBudget } from '../utils/algorithms'
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, 
  BarChart, Bar, Legend
} from 'recharts'

export default function EnhancedAnalytics({ currentGroup, user }) {
  const [stats, setStats] = useState({
    expense: 0, income: 0, balance: 0, loanOut: 0, loanIn: 0,
    categories: {}, dailyData: []
  })
  const [algorithms, setAlgorithms] = useState({
    prediction: null,
    optimization: null
  })
  const [range, setRange] = useState({ type: 'all', start: null, end: null })
  const [loading, setLoading] = useState(true)
  const [savingsGoal, setSavingsGoal] = useState(20)

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
      const prediction = predictFutureExpenses(data);
      const optimization = optimizeBudget(categories, expenseTotal, savingsGoal / 100);

      setAlgorithms({
        prediction,
        optimization
      });
    } else {
      setStats({ expense: 0, income: 0, balance: 0, loanOut: 0, loanIn: 0, categories: {}, dailyData: [] })
      setAlgorithms({ prediction: null, optimization: null })
    }
    setLoading(false)
  }, [user, currentGroup, range, savingsGoal])

  useEffect(() => { fetch() }, [fetch])

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
          "Proposed Cut": cut
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

  const forecastExplainer = useMemo(() => {
    if (!algorithms.prediction) return "Log a few more daily expenses to unlock your 30-day forecast.";
    const { predictedNextMonth, trend, changePercent } = algorithms.prediction;
    const deficit = predictedNextMonth - stats.income;
    const sign = changePercent > 0 ? '+' : '';
    
    if (stats.income === 0) return `You're on track to spend about Rs.${predictedNextMonth.toLocaleString()} next month. Since you haven't logged any income yet, this will come straight out of your savings.`;
    
    if (deficit > 0) return `Your spending is trending ${trend} (${sign}${changePercent}%), which means you'll likely hit Rs.${predictedNextMonth.toLocaleString()} next month. That's Rs.${deficit.toLocaleString()} more than you earn. You might want to slow down.`;
    
    return `Your spending is trending ${trend}. Based on recent habits, expect to spend around Rs.${predictedNextMonth.toLocaleString()} next month, which safely leaves you with Rs.${Math.abs(deficit).toLocaleString()} left over.`;
  }, [algorithms.prediction, stats.income]);

  const optimizerExplainer = useMemo(() => {
    if (!algorithms.optimization || stats.expense === 0) return "Categorize your expenses so we can spot places where you can save.";
    const { achievedCuts, suggestions, targetSavings } = algorithms.optimization;
    
    if (suggestions.length === 0) return `You don't have much room to cut. A ${savingsGoal}% reduction is too steep for your current spending habits.`;
    
    const topCat = suggestions[0]?.category;
    const isTargetMet = achievedCuts >= targetSavings;
    
    if (isTargetMet) {
      return `You can actually hit that ${savingsGoal}% goal. If you cut back Rs.${achievedCuts.toLocaleString()} mostly from '${topCat}' and a few other non-essentials, you'll reach your target.`;
    } else {
      return `We found Rs.${achievedCuts.toLocaleString()} you could save, mostly by spending less on '${topCat}'. It's not quite the ${savingsGoal}% you asked for, but it's a realistic start based on your habits.`;
    }
  }, [algorithms.optimization, stats.expense, savingsGoal]);

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
    <div className={`space-y-6 transition-all duration-300 ${loading ? 'opacity-70 pointer-events-none' : ''}`}>
      {/* Header */}
      <div className="bg-white dark:bg-paper-100 rounded-2xl shadow-card dark:shadow-none border border-paper-200/60 dark:border-paper-300/50 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-xl tracking-tight text-ink-900">Financial Analytics</h2>
          <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">View your financial trends and insights</p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <DateRangePicker value={range} onChange={setRange} className="w-40 sm:w-48" />
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Expenses Card */}
        <div className="bg-red-50 dark:bg-red-900/10 p-5 rounded-2xl border border-red-100 dark:border-red-900/20 relative overflow-hidden transition-colors">
          <div className="relative z-10 flex flex-col">
            <div className="text-xs font-bold text-red-800 dark:text-red-300 uppercase tracking-wider mb-2">Total Expenses</div>
            <div className="text-3xl font-bold text-red-900 dark:text-red-100 mb-1">Rs.{stats.expense.toLocaleString()}</div>
            <div className="text-xs text-red-600 dark:text-red-400 font-medium">Money leaving your wallet</div>
          </div>
          <div className="absolute right-0 bottom-0 opacity-5 dark:opacity-10 transform translate-x-1/4 translate-y-1/4 text-red-900 dark:text-red-500">
            <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>

        {/* Income Card */}
        <div className="bg-green-50 dark:bg-green-900/10 p-5 rounded-2xl border border-green-100 dark:border-green-900/20 relative overflow-hidden transition-colors">
          <div className="relative z-10 flex flex-col">
            <div className="text-xs font-bold text-green-800 dark:text-green-300 uppercase tracking-wider mb-2">Total Income</div>
            <div className="text-3xl font-bold text-green-900 dark:text-green-100 mb-1">Rs.{stats.income.toLocaleString()}</div>
            <div className="text-xs text-green-600 dark:text-green-400 font-medium">Money earned this period</div>
          </div>
          <div className="absolute right-0 bottom-0 opacity-5 dark:opacity-10 transform translate-x-1/4 translate-y-1/4 text-green-900 dark:text-green-500">
            <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>

        {/* Balance Card */}
        <div className={`p-5 rounded-2xl border relative overflow-hidden transition-colors ${stats.balance >= 0
          ? 'bg-gradient-to-br from-green-50 to-emerald-100/50 border-green-200 dark:from-green-900/10 dark:to-emerald-900/20 dark:border-green-800/30'
          : 'bg-gradient-to-br from-red-50 to-orange-100/50 border-red-200 dark:from-red-900/10 dark:to-orange-900/20 dark:border-red-800/30'
          }`}>
          <div className="relative z-10 flex flex-col">
            <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${stats.balance >= 0 ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>Net Balance</div>
            <div className={`text-3xl font-bold mb-1 ${stats.balance >= 0 ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
              Rs.{Math.abs(stats.balance).toLocaleString()}
            </div>
             <div className={`text-xs font-medium ${stats.balance >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {stats.balance >= 0 ? '✨ You are in the green!' : '⚠️ Deficit detected'}
            </div>
          </div>
          <div className={`absolute right-0 bottom-0 opacity-5 dark:opacity-10 transform translate-x-1/4 translate-y-1/4 ${stats.balance >= 0 ? 'text-green-900 dark:text-green-500' : 'text-red-900 dark:text-red-500'}`}>
            <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>
      </div>

      {/* Advanced Analytics - Spending Forecast Row */}
      <div className="bg-white dark:bg-paper-100 border border-paper-200/60 dark:border-paper-300/50 rounded-2xl p-6 shadow-sm overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-8">
          
          <div className="lg:w-1/3 flex flex-col gap-4">
            <h4 className="font-bold text-xl text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
              <span className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">📈</span>
              Spending Forecast
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {forecastExplainer}
            </p>

            {algorithms.prediction ? (() => {
               const { predictedNextMonth, avgDailySpend, trend, changePercent, confidence, daysOfData } = algorithms.prediction;
               const willExceedIncome = stats.income > 0 && predictedNextMonth > stats.income;
               return (
                 <div className="mt-2 flex flex-col gap-4">
                   <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-xl p-5 border border-indigo-100 dark:border-indigo-800/30">
                     <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2 uppercase tracking-wide">Predicted 30-Day Spend</div>
                     <div className="text-4xl font-extrabold text-indigo-700 dark:text-indigo-300 mb-2">
                       Rs.{predictedNextMonth.toLocaleString()}
                     </div>
                     <div className="text-sm text-indigo-800/80 dark:text-indigo-200/80">Average Rs.{avgDailySpend.toLocaleString()} per day</div>
                   </div>

                   <div className={`rounded-xl p-4 border text-sm ${willExceedIncome ? 'bg-red-50 dark:bg-red-900/10 border-red-200 text-red-800 dark:text-red-200' : 'bg-green-50 dark:bg-green-900/10 border-green-200 text-green-800 dark:text-green-200'}`}>
                     <div className="font-bold mb-2">What this means:</div>
                     <ul className="space-y-1.5 list-disc list-inside opacity-90 text-xs">
                        {willExceedIncome ? (
                          <>
                           <li>Your predicted spend of Rs.{predictedNextMonth.toLocaleString()} exceeds your current income.</li>
                           <li>Action is needed to reduce your daily expenses.</li>
                          </>
                        ) : (
                          <>
                           <li>Your spending is within a safe margin compared to your income.</li>
                           <li>Spending trend is {trend} {changePercent !== 0 ? `(${changePercent > 0 ? '+' : ''}${changePercent}%)` : ''}.</li>
                          </>
                        )}
                     </ul>
                   </div>
                 </div>
               )
            })() : (
               <div className="text-sm text-gray-500 italic mt-6 bg-gray-50 dark:bg-paper-200/50 p-4 rounded-xl">Not enough daily data to predict trends.</div>
            )}
          </div>

          <div className="lg:w-2/3 min-h-[300px] border border-gray-100 dark:border-paper-300 rounded-xl p-4 bg-gray-50/50 dark:bg-paper-200/20">
            <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 text-center">Historical Daily Spending</h5>
            {stats.dailyData.length > 0 ? (
               <ResponsiveContainer width="100%" height="90%">
                 <AreaChart data={stats.dailyData}>
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
                   <Area type="monotone" dataKey="amount" name="Spend" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                 </AreaChart>
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
            <div className="flex items-center gap-3">
               <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Target Reduction:</label>
               <select
                 value={savingsGoal}
                 onChange={e => setSavingsGoal(Number(e.target.value))}
                 className="text-sm font-bold bg-gray-50 dark:bg-paper-300 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 rounded-lg px-3 py-1.5 cursor-pointer outline-none focus:ring-2 focus:ring-emerald-400"
               >
                 {[5,10,15,20,25,30,35,40,45,50,60,70,80].map(v => (
                   <option key={v} value={v}>{v}% Cut</option>
                 ))}
               </select>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
              {optimizerExplainer}
            </p>

            {algorithms.optimization && stats.expense > 0 ? (() => {
              const { targetSavings, achievedCuts, suggestions } = algorithms.optimization;
              return (
                 <div className="mt-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-5 border border-emerald-100 dark:border-emerald-800/30">
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2 uppercase tracking-wide">Optimization Results</div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-gray-600 dark:text-gray-400">Target Savings:</span>
                         <span className="font-bold text-gray-900 dark:text-gray-100">Rs.{targetSavings.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                         <span className="text-gray-600 dark:text-gray-400">Achievable Cuts:</span>
                         <span className="font-bold text-emerald-600 dark:text-emerald-400">Rs.{achievedCuts.toLocaleString()}</span>
                      </div>
                    </div>
                    {suggestions.length > 0 ? (
                       <div className="mt-4 pt-4 border-t border-emerald-200/50 dark:border-emerald-800/50">
                          <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-2">Recommended Category Cuts:</div>
                          <ul className="space-y-2 text-sm max-h-[140px] overflow-y-auto scrollbar-thin pr-2">
                             {suggestions.map((sug, i) => (
                                <li key={i} className="flex justify-between items-center py-0.5">
                                   <span className="capitalize">{sug.category}</span>
                                   <span className="text-emerald-600 font-semibold">-Rs.{sug.cutAmount.toLocaleString()}</span>
                                </li>
                             ))}
                          </ul>
                       </div>
                    ) : (
                       <div className="mt-4 text-sm text-emerald-600">No cuts needed at this level!</div>
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
                   <Bar dataKey="Proposed Cut" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
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
