import { useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import { supabase } from '../supabase'
import { rememberCategoryChoice } from '../utils/categoryMemory'

const ResponsiveTable = forwardRef(({ expenses, onExpenseUpdate, currentGroup, user }, ref) => {
  const [data, setData] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [groupMembers, setGroupMembers] = useState([])
  const [userProfiles, setUserProfiles] = useState({})
  const [expandedRemarks, setExpandedRemarks] = useState(new Set())

  const fetchUserProfiles = async (expenses) => {
    try {
      const userIds = [...new Set(expenses.map(exp => exp.user_id).filter(Boolean))]

      if (userIds.length === 0) return

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (error) {
        console.error('Error fetching user profiles:', error)
        return
      }

      const profilesMap = {}
      profiles?.forEach(profile => {
        profilesMap[profile.id] = profile
      })

      setUserProfiles(profilesMap)
    } catch (error) {
      console.error('Error fetching user profiles:', error)
    }
  }

  const fetchGroupMembers = async () => {
    if (!currentGroup) {
      setGroupMembers([])
      return
    }

    try {
      const { data: membersData, error: membersError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', currentGroup.id)

      if (membersError) {
        console.error('Error fetching group members:', membersError)
        setGroupMembers([])
        return
      }

      if (!membersData || membersData.length === 0) {
        setGroupMembers([])
        return
      }

      const userIds = membersData.map(m => m.user_id)

      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (usersError) {
        console.error('Error fetching users:', usersError)
        setGroupMembers([])
        return
      }

      const combined = membersData.map(member => {
        const userInfo = usersData.find(u => u.id === member.user_id)
        return {
          user_id: member.user_id,
          users: userInfo || null
        }
      })

      setGroupMembers(combined)
    } catch (error) {
      console.error('Error fetching group members:', error)
      setGroupMembers([])
    }
  }

  const fetchExpenses = async () => {
    setLoading(true)
    try {
      let query = supabase.from('expenses').select('*')

      if (currentGroup) {
        query = query.eq('group_id', currentGroup.id)
      } else {
        query = query.eq('user_id', user?.id).is('group_id', null)
      }

      const { data, error } = await query.order('date', { ascending: false })

      if (error) {
        console.error('Error fetching expenses:', error)
        setData([])
      } else {
        setData(data || [])
        await fetchUserProfiles(data || [])
      }
    } catch (error) {
      console.error('Error fetching expenses:', error)
      setData([])
    }
    setLoading(false)
  }

  useImperativeHandle(ref, () => ({
    refresh: fetchExpenses
  }))

  useEffect(() => {
    fetchExpenses()
    fetchGroupMembers()
  }, [currentGroup, user])

  const handleEdit = (expense) => {
    setEditingId(expense.id)
    setEditForm(expense)
  }

  const handleSave = async () => {
    try {
      const { error } = await supabase.from('expenses').update(editForm).eq('id', editingId)
      if (error) throw error
      rememberCategoryChoice(user?.id, editForm.item, editForm.category)
      setEditingId(null)
      fetchExpenses()
    } catch (error) {
      console.error('Error updating expense:', error)
    }
  }

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
      fetchExpenses()
    } catch (error) {
      console.error('Error deleting expense:', error)
    }
  }

  const getUserName = (expense) => {
    const userId = expense.user_id
    if (userId && userProfiles[userId]) {
      const profile = userProfiles[userId]
      return profile.full_name || profile.email?.split('@')[0] || 'Unknown User'
    }
    return expense.added_by || expense.user_name || 'Unknown User'
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <h2 className="text-base sm:text-lg font-medium">
          {currentGroup ? `${currentGroup.name} Group` : 'Personal'} Finance Sheet
        </h2>
        <button
          onClick={fetchExpenses}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-100 text-blue-600 rounded hover:bg-blue-200 disabled:opacity-50 self-start sm:self-auto"
        >
          {loading ? '...' : '🔄 Refresh'}
        </button>
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm shadow-sm rounded-lg overflow-hidden">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
              <th className="text-left p-3 font-semibold text-gray-700">Date & Time</th>
              <th className="text-left p-3 font-semibold text-gray-700">Item</th>
              <th className="text-left p-3 font-semibold text-gray-700">Category</th>
              <th className="text-left p-3 font-semibold text-gray-700">Amount</th>
              <th className="text-left p-3 font-semibold text-gray-700">Remarks</th>
              <th className="text-left p-3 font-semibold text-gray-700">Added by</th>
              <th className="text-left p-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="7" className="p-8 text-center text-gray-500">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span>Loading expenses...</span>
                  </div>
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan="7" className="p-8 text-center text-gray-500">
                  <div className="text-3xl mb-2"></div>
                  <div className="text-lg font-medium mb-1">No expenses found</div>
                  <div className="text-sm text-gray-400">Add some using the chat input!</div>
                </td>
              </tr>
            )}
            {!loading && data.map((expense, index) => (
              <tr key={expense.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                }`}>
                {editingId === expense.id ? (
                  <>
                    <td className="p-3">
                      <input
                        type="date"
                        value={editForm.date}
                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        value={editForm.item || ''}
                        onChange={(e) => setEditForm({ ...editForm, item: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="Item name"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        value={editForm.amount}
                        onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        value={editForm.remarks}
                        onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="Add remarks"
                      />
                    </td>
                    <td className="p-3 text-gray-500">-</td>
                    <td className="p-3">
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSave}
                          className="px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
                        >
                          ✓ Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                        >
                          ✗ Cancel
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">{new Date(expense.date).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(expense.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{expense.item || '-'}</div>
                    </td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                        {expense.category}
                      </span>
                    </td>
                    <td className="p-3">
                      {expense.amount === 0 ? (
                        <span className="inline-block px-2 py-1 bg-red-100 text-red-700 text-sm rounded-lg font-medium">
                          Amount needed
                        </span>
                      ) : (
                        <span className={`text-sm font-bold ${expense.amount < 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                          Rs.{Math.abs(expense.amount)}
                          {expense.amount < 0 && (
                            <span className="ml-1 text-xs bg-green-100 text-green-700 px-1 py-0.5 rounded">Income</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="text-sm text-gray-600 max-w-[150px]">
                        {expense.remarks ? (
                          <div className="relative group">
                            <span
                              className="block cursor-pointer"
                              onClick={() => {
                                const newExpanded = new Set(expandedRemarks)
                                if (newExpanded.has(expense.id)) {
                                  newExpanded.delete(expense.id)
                                } else {
                                  newExpanded.add(expense.id)
                                }
                                setExpandedRemarks(newExpanded)
                              }}
                            >
                              {expense.remarks.length > 20 && !expandedRemarks.has(expense.id) ? (
                                <>
                                  {expense.remarks.substring(0, 20)}
                                  <span className="text-blue-600 font-bold cursor-pointer hover:text-blue-800" title="Click to expand">
                                    ... 📖
                                  </span>
                                </>
                              ) : (
                                <>
                                  {expense.remarks}
                                  {expense.remarks.length > 20 && expandedRemarks.has(expense.id) && (
                                    <span className="text-gray-500 cursor-pointer ml-1" title="Click to collapse">
                                      ▲
                                    </span>
                                  )}
                                </>
                              )}
                            </span>
                            {/* Hover tooltip for desktop */}
                            {expense.remarks.length > 20 && !expandedRemarks.has(expense.id) && (
                              <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-black text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-10 shadow-lg max-w-[250px] break-words">
                                {expense.remarks}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="text-sm text-gray-700 font-medium">{getUserName(expense)}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(expense)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(expense.id)}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Table View */}
      <div className="lg:hidden overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left p-2 font-medium">Date</th>
              <th className="text-left p-2 font-medium">Item</th>
              <th className="text-left p-2 font-medium">Category</th>
              <th className="text-left p-2 font-medium">Amount</th>
              <th className="text-left p-2 font-medium">Remarks</th>
              <th className="text-left p-2 font-medium">Added by</th>
              <th className="text-left p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="7" className="p-4 text-center text-gray-500">
                  Loading expenses...
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan="7" className="p-4 text-center text-gray-500">
                  <div className="text-lg mb-1"></div>
                  <div className="text-sm">No expenses found.</div>
                  <div className="text-xs text-gray-400">Add some using the chat input!</div>
                </td>
              </tr>
            )}
            {!loading && data.map((expense) => (
              <tr key={expense.id} className="border-b border-gray-100 hover:bg-gray-50">
                {editingId === expense.id ? (
                  <>
                    <td className="p-2">
                      <input
                        type="date"
                        value={editForm.date}
                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                        className="w-full px-1 py-1 border rounded text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={editForm.item || ''}
                        onChange={(e) => setEditForm({ ...editForm, item: e.target.value })}
                        className="w-full px-1 py-1 border rounded text-xs"
                        placeholder="Item"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="w-full px-1 py-1 border rounded text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={editForm.amount}
                        onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                        className="w-full px-1 py-1 border rounded text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={editForm.remarks}
                        onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                        className="w-full px-1 py-1 border rounded text-xs"
                        placeholder="Remarks"
                      />
                    </td>
                    <td className="p-2 text-xs text-gray-500">-</td>
                    <td className="p-2">
                      <div className="flex space-x-1">
                        <button onClick={handleSave} className="text-green-600 text-sm">✓</button>
                        <button onClick={() => setEditingId(null)} className="text-red-600 text-sm">✗</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-2">
                      <div className="text-xs">
                        <div className="font-medium">{new Date(expense.date).toLocaleDateString()}</div>
                        <div className="text-gray-500">
                          {new Date(expense.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="text-xs font-medium">{expense.item || '-'}</div>
                    </td>
                    <td className="p-2">
                      <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs rounded whitespace-nowrap">
                        {expense.category}
                      </span>
                    </td>
                    <td className="p-2">
                      <span className={`text-xs font-bold ${expense.amount === 0 ? 'text-red-500' :
                        expense.amount < 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                        {expense.amount === 0 ? 'Need amount' : `Rs.${Math.abs(expense.amount)}`}
                      </span>
                      {expense.amount < 0 && (
                        <div className="text-xs text-green-600">Income</div>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="text-xs text-gray-600 max-w-[100px]">
                        {expense.remarks ? (
                          <div className="relative group">
                            <span
                              className="block cursor-pointer"
                              onClick={() => {
                                const newExpanded = new Set(expandedRemarks)
                                if (newExpanded.has(expense.id)) {
                                  newExpanded.delete(expense.id)
                                } else {
                                  newExpanded.add(expense.id)
                                }
                                setExpandedRemarks(newExpanded)
                              }}
                            >
                              {expense.remarks.length > 15 && !expandedRemarks.has(expense.id) ? (
                                <>
                                  {expense.remarks.substring(0, 15)}
                                  <span className="text-blue-600 font-bold cursor-pointer hover:text-blue-800" title="Click to expand">
                                    ... 📖
                                  </span>
                                </>
                              ) : (
                                <>
                                  {expense.remarks}
                                  {expense.remarks.length > 15 && expandedRemarks.has(expense.id) && (
                                    <span className="text-gray-500 cursor-pointer ml-1" title="Click to collapse">
                                      ▲
                                    </span>
                                  )}
                                </>
                              )}
                            </span>
                            {/* Hover tooltip for desktop */}
                            {expense.remarks.length > 15 && !expandedRemarks.has(expense.id) && (
                              <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-black text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 shadow-lg max-w-[200px] break-words">
                                {expense.remarks}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-xs text-gray-600">
                      {getUserName(expense).split(' ')[0]}
                    </td>
                    <td className="p-2">
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleEdit(expense)}
                          className="text-blue-600 hover:bg-blue-100 p-1 rounded"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(expense.id)}
                          className="text-red-600 hover:bg-red-100 p-1 rounded"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})

export default ResponsiveTable
