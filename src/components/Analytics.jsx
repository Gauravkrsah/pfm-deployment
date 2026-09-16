import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import { supabase } from '../supabase'
import { aggregateExpenseCategories } from '../utils/algorithms'

const COLORS = ['#374151', '#6b7280', '#9ca3af', '#d1d5db']

export default function Analytics() {
  const [categoryData, setCategoryData] = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [totalSpend, setTotalSpend] = useState(0)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    const { data } = await supabase.from('expenses').select('*')

    if (data) {
      // Category breakdown
      const categoryTotals = aggregateExpenseCategories(data)

      setCategoryData(Object.entries(categoryTotals).map(([name, value]) => ({ name, value })))

      // Monthly trends
      const monthlyTotals = data.reduce((acc, expense) => {
        const month = new Date(expense.date).toLocaleDateString('en-US', { month: 'short' })
        acc[month] = (acc[month] || 0) + expense.amount
        return acc
      }, {})

      setMonthlyData(Object.entries(monthlyTotals).map(([month, amount]) => ({ month, amount })))

      // Total spend
      setTotalSpend(data.reduce((sum, expense) => sum + expense.amount, 0))
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="text-lg font-medium mb-4">📈 Analytics</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-medium mb-2">Category Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h3 className="font-medium mb-2">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyData}>
              <XAxis dataKey="month" />
              <YAxis />
              <Line type="monotone" dataKey="amount" stroke="#374151" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 relative overflow-hidden">
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Total Spend</div>
            <div className="text-3xl font-bold text-white">Rs.{totalSpend.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-2">All time expenses</div>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-1/4 translate-y-1/4 text-white">
            <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>
      </div>
    </div>
  )
}
