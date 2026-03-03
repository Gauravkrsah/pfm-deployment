import { useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'
import DateRangePicker, { getDateRange } from './ui/DateRangePicker'
import DeleteConfirmationModal from './ui/DeleteConfirmationModal'

const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Business',
  'Investment',
  'Gift',
  'Loan',
  'Refund',
  'Other'
]

const Income = forwardRef(({ currentGroup, user }, ref) => {
  const [data, setData] = useState([])
  const [filteredData, setFilteredData] = useState([])
  const [editForm, setEditForm] = useState({})
  const [itemToDelete, setItemToDelete] = useState(null)
  const [itemToEdit, setItemToEdit] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateRange, setDateRange] = useState({ type: 'all', start: null, end: null })
  const [userProfiles, setUserProfiles] = useState({})

  const fetchUserProfiles = async (incomes) => {
    try {
      const userIds = [...new Set(incomes.map(inc => inc.user_id).filter(Boolean))]

      if (userIds.length === 0) {
        return
      }

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (error) {
        return
      }

      const profilesMap = {}
      profiles?.forEach(profile => {
        profilesMap[profile.id] = profile
      })

      setUserProfiles(profilesMap)
    } catch (error) {
      // Error handled silently
    }
  }

  const fetchIncomes = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      let query = supabase.from('expenses').select('*')

      if (currentGroup) {
        query = query.eq('group_id', currentGroup.id)
      } else {
        query = query.eq('user_id', user?.id).is('group_id', null)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) {
        setData([])
      } else {
        // Filter income transactions (negative amounts OR Income category)
        const incomeData = (data || []).filter(transaction =>
          (transaction.amount < 0 && transaction.category?.toLowerCase() === 'income') ||
          (transaction.category?.toLowerCase() === 'income')
        )
        setData(incomeData)
        await fetchUserProfiles(incomeData)
      }
    } catch (error) {
      setData([])
    }
    if (showLoading) setLoading(false)
  }, [currentGroup, user])

  useImperativeHandle(ref, () => ({
    refresh: fetchIncomes
  }))

  useEffect(() => {
    fetchIncomes()
  }, [currentGroup, user, fetchIncomes])

  useEffect(() => {
    let filtered = data

    if (searchTerm) {
      filtered = filtered.filter(inc =>
        inc.item?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.remarks?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.added_by?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Date Filter
    if (dateRange.type !== 'all') {
      const { start, end } = dateRange.type === 'custom'
        ? { start: new Date(dateRange.start), end: new Date(dateRange.end) }
        : getDateRange(dateRange.type)

      if (start && end) {
        if (dateRange.type !== 'custom') {
          end.setHours(23, 59, 59, 999)
        }

        filtered = filtered.filter(inc => {
          const incDate = new Date(inc.date)
          return incDate >= start && incDate <= end
        })
      }
    }

    setFilteredData(filtered)
  }, [data, searchTerm, dateRange])

  const handleSave = async (isMobile = true) => {
    try {
      const { error } = await supabase.from('expenses').update(itemToEdit).eq('id', itemToEdit.id)
      if (error) throw error
      setItemToEdit(null)
      fetchIncomes(false)
    } catch (error) {
      // Error handled silently
    }
  }

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
      setItemToDelete(null)
      fetchIncomes(false)
    } catch (error) {
      // Error handled silently
    }
  }

  return (
    <div className="card p-6 border-0 shadow-none bg-transparent sm:bg-white dark:sm:bg-paper-100 sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:border sm:border-paper-200/60 dark:sm:border-paper-300/50">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="font-semibold text-xl tracking-tight text-emerald-900 dark:text-emerald-500">Income</h2>
          <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 sm:block hidden">Track your earnings and inflows</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <DateRangePicker value={dateRange} onChange={setDateRange} className="flex-1 sm:w-48" />
          <button onClick={fetchIncomes} disabled={loading} className="px-3 py-2 text-xs bg-gray-100 dark:bg-paper-200 hover:bg-gray-200 dark:hover:bg-paper-300 rounded-lg transition-colors text-gray-700 dark:text-gray-200">
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary Cards - Horizontal scroll on mobile */}
      <div className="flex md:grid md:grid-cols-3 gap-3 mb-6 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        <div className="bg-green-50 dark:bg-green-900/20 p-3 md:p-4 rounded-xl border border-green-100 dark:border-green-900/30 shadow-sm relative overflow-hidden min-w-[170px] md:min-w-0 flex-shrink-0 md:flex-shrink">
          <div className="relative z-10">
            <div className="text-[10px] md:text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wide mb-1">Total Income</div>
            <div className="text-lg md:text-2xl font-bold text-green-900 dark:text-green-200">Rs.{filteredData.reduce((sum, inc) => sum + Math.abs(inc.amount || 0), 0).toLocaleString()}</div>
            <div className="text-[10px] md:text-xs text-green-700 dark:text-green-400 mt-1">{filteredData.length} transactions</div>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-1/4 translate-y-1/4 text-green-900 dark:text-green-500">
            <svg width="70" height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 md:p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm relative overflow-hidden min-w-[170px] md:min-w-0 flex-shrink-0 md:flex-shrink">
          <div className="relative z-10">
            <div className="text-[10px] md:text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide mb-1">This Month</div>
            <div className="text-lg md:text-2xl font-bold text-emerald-900 dark:text-emerald-200">
              Rs.{filteredData.filter(inc => {
                const incDate = new Date(inc.date);
                const now = new Date();
                return incDate.getMonth() === now.getMonth() && incDate.getFullYear() === now.getFullYear();
              }).reduce((sum, inc) => sum + Math.abs(inc.amount || 0), 0).toLocaleString()}
            </div>
            <div className="text-[10px] md:text-xs text-emerald-700 dark:text-emerald-400 mt-1">Current month</div>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-1/4 translate-y-1/4 text-emerald-900 dark:text-emerald-500">
            <svg width="70" height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>

        <div className="bg-teal-50 dark:bg-teal-900/20 p-3 md:p-4 rounded-xl border border-teal-100 dark:border-teal-900/30 shadow-sm relative overflow-hidden min-w-[170px] md:min-w-0 flex-shrink-0 md:flex-shrink">
          <div className="relative z-10">
            <div className="text-[10px] md:text-xs font-semibold text-teal-800 dark:text-teal-300 uppercase tracking-wide mb-1">Avg/Transaction</div>
            <div className="text-lg md:text-2xl font-bold text-teal-900 dark:text-teal-200">
              Rs.{filteredData.length > 0 ? Math.round(filteredData.reduce((sum, inc) => sum + Math.abs(inc.amount || 0), 0) / filteredData.length).toLocaleString() : 0}
            </div>
            <div className="text-[10px] md:text-xs text-teal-700 dark:text-teal-400 mt-1">Average amount</div>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-1/4 translate-y-1/4 text-teal-900 dark:text-teal-500">
            <svg width="70" height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05 1.18 1.91 2.53 1.91 1.29 0 2.13-.73 2.13-1.65 0-1.22-1.28-1.57-3.04-1.93-2.26-.47-4.14-1.29-4.14-3.56 0-1.84 1.37-2.92 3.82-3.32V4h2.67v1.89c1.4.31 2.54 1.25 2.76 3.01h-2c-.17-.9-1.07-1.54-1.99-1.54-1.12 0-1.77.67-1.77 1.48 0 1.13 1.27 1.47 2.89 1.83 2.45.54 4.29 1.35 4.29 3.65 0 1.96-1.56 3.12-3.57 3.48z" /></svg>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search income..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-paper-200 border border-gray-300 dark:border-paper-300 rounded-lg focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500 text-ink-900"
          />
          <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="relative sm:w-48">
          <select
            defaultValue="all"
            className="w-full pl-4 pr-10 py-2 text-sm bg-white dark:bg-paper-200 border border-gray-300 dark:border-paper-300 rounded-lg focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 outline-none font-medium text-gray-700 dark:text-gray-200 appearance-none cursor-pointer hover:border-gray-400 dark:hover:border-gray-400 transition-colors"
          >
            <option value="all">All Sources</option>
            {INCOME_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-paper-100 dark:border-paper-300/50">
        <table className="w-full text-sm text-left min-w-[800px]">
          <thead>
            <tr className="bg-emerald-50/30 dark:bg-emerald-900/10 border-b border-paper-100 dark:border-paper-300/50">
              <th className="p-4 font-semibold text-emerald-900 dark:text-emerald-100 text-xs uppercase tracking-wider">Date</th>
              <th className="p-4 font-semibold text-emerald-900 dark:text-emerald-100 text-xs uppercase tracking-wider">Source</th>
              <th className="p-4 font-semibold text-emerald-900 dark:text-emerald-100 text-xs uppercase tracking-wider">Category</th>
              <th className="p-4 font-semibold text-emerald-900 dark:text-emerald-100 text-xs uppercase tracking-wider">Amount</th>
              <th className="p-4 font-semibold text-emerald-900 dark:text-emerald-100 text-xs uppercase tracking-wider">Remarks</th>
              <th className="p-4 font-semibold text-emerald-900 dark:text-emerald-100 text-xs uppercase tracking-wider">Added by</th>
              <th className="p-4 font-semibold text-emerald-900 dark:text-emerald-100 text-xs uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-100 dark:divide-paper-300/30">
            {loading ? (
              <tr>
                <td colSpan="7" className="p-8 text-center text-gray-500">Loading income...</td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-8 text-center text-gray-500">No income records found.</td>
              </tr>
            ) : (
              filteredData.map((income) => (
                <tr key={income.id} className="hover:bg-paper-50/50 dark:hover:bg-paper-300/20 transition-colors group">
                  <td className="p-4 text-gray-600 dark:text-gray-300 text-sm whitespace-nowrap">{new Date(income.date).toLocaleDateString()}</td>
                  <td className="p-4 font-medium text-gray-900 dark:text-gray-100 text-sm">{income.item}</td>
                  <td className="p-4">
                    <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-medium border border-emerald-100 dark:border-emerald-800/30">
                      {income.category}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                    +Rs.{income.amount.toLocaleString()}
                  </td>
                  <td className="p-4 text-gray-700 dark:text-gray-300 text-sm max-w-[200px] truncate" title={income.remarks || ''}>
                    {income.remarks || '-'}
                  </td>
                  <td className="p-4 text-gray-500 text-xs">
                    {(() => {
                      const userId = income.user_id
                      if (userId && userProfiles[userId]) {
                        const profile = userProfiles[userId]
                        return profile.full_name || profile.email?.split('@')[0] || 'Unknown'
                      }
                      return income.added_by || income.user_name || 'Unknown'
                    })()}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setItemToEdit(income)} className="text-blue-600 hover:text-blue-800 font-medium text-sm">Edit</button>
                      <button onClick={() => setItemToDelete(income)} className="text-red-600 hover:text-red-800 font-medium text-sm">Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-paper-50 dark:bg-paper-200/50 border-t border-paper-100 dark:border-paper-300/50 font-medium">
              <td className="p-4 text-gray-900 dark:text-gray-100" colSpan="3">Total Income</td>
              <td className="p-4 text-emerald-700 dark:text-emerald-400 font-bold">Rs.{filteredData.reduce((sum, inc) => sum + Math.abs(inc.amount || 0), 0).toLocaleString()}</td>
              <td className="p-4" colSpan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading income...</div>
        ) : filteredData.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No income records found.</div>
        ) : (
          filteredData.map((income) => (
            <div key={income.id} className="bg-white dark:bg-paper-200 p-4 rounded-2xl border border-paper-100 dark:border-paper-300/50 shadow-sm relative overflow-hidden group">
              {/* View Mode Mobile */}
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-base">{income.item}</h3>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{new Date(income.date).toLocaleDateString()}</div>
                  </div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">
                    +Rs.{Math.abs(income.amount).toLocaleString()}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-[10px] font-semibold tracking-wide uppercase border border-emerald-100 dark:border-emerald-800/30">
                    {income.category}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    {(() => {
                      const userId = income.user_id
                      if (userId && userProfiles[userId]) {
                        const profile = userProfiles[userId]
                        return profile.full_name || profile.email?.split('@')[0] || 'Unknown'
                      }
                      return income.added_by || income.user_name || 'Unknown'
                    })()}
                  </span>
                </div>

                {income.remarks && (
                  <div className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-paper-300/30 p-2.5 rounded-xl border border-gray-100 dark:border-paper-300 mb-3 truncate">
                    {income.remarks}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-paper-100 dark:border-paper-300/50">
                  <button onClick={() => setItemToEdit(income)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    Edit
                  </button>
                  <button onClick={() => setItemToDelete(income)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={!!itemToDelete}
        title="Delete income record?"
        itemName={itemToDelete?.item}
        description={`Are you sure you want to delete this income of Rs. ${Math.abs(itemToDelete?.amount || 0)}?`}
        onConfirm={() => handleDelete(itemToDelete.id)}
        onCancel={() => setItemToDelete(null)}
      />

      {/* Edit Modal (Mobile & Desktop) */}
      {itemToEdit && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-end sm:justify-center p-0 lg:p-4 animate-fade-in">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={() => setItemToEdit(null)} />

          {/* Modal Content */}
          <div className="relative w-full lg:max-w-md bg-white dark:bg-[#1a1a1a] rounded-t-3xl lg:rounded-3xl shadow-2xl overflow-hidden animate-slide-up lg:animate-scale-in flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-white dark:bg-[#1a1a1a] sticky top-0 z-10">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Income</h3>
              <button onClick={() => setItemToEdit(null)} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Date</label>
                <input type="date" value={itemToEdit.date} onChange={(e) => setItemToEdit({ ...itemToEdit, date: e.target.value })} className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 dark:text-white" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium">Rs.</span>
                  <input type="number" value={Math.abs(itemToEdit.amount || 0)} onChange={(e) => setItemToEdit({ ...itemToEdit, amount: itemToEdit.amount < 0 ? -Math.abs(e.target.value) : Math.abs(e.target.value) })} className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-medium text-gray-900 dark:text-white" placeholder="0" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Source Name</label>
                <input type="text" value={itemToEdit.item} onChange={(e) => setItemToEdit({ ...itemToEdit, item: e.target.value })} className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 dark:text-white" placeholder="Where did it come from?" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Category</label>
                <select value={itemToEdit.category} onChange={(e) => setItemToEdit({ ...itemToEdit, category: e.target.value })} className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 dark:text-white appearance-none">
                  {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Remarks <span className="text-gray-400 dark:text-gray-600 font-normal lowercase">(Optional)</span></label>
                <textarea value={itemToEdit.remarks || ''} onChange={(e) => setItemToEdit({ ...itemToEdit, remarks: e.target.value })} className="w-full px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 dark:text-white resize-none" placeholder="Add any notes..." rows={3} />
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-white dark:bg-[#1a1a1a] sticky bottom-0 z-10 flex gap-3">
              <button onClick={() => setItemToEdit(null)} className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-gray-700 dark:text-white bg-gray-100 dark:bg-[#333333] hover:bg-gray-200 dark:hover:bg-[#444444] transition-all active:scale-95">
                Cancel
              </button>
              <button onClick={() => handleSave(true)} className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-500/20 active:scale-95">
                Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
})

export default Income