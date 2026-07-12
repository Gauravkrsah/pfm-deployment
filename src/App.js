import { useState, useRef, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Auth from './components/Auth'
import ResetPassword from './components/ResetPassword'
import GroupManager from './components/GroupManager'
import Chat from './components/Chat'
import Table from './components/Table'
import Income from './components/Income'
import Loans from './components/Loans'
import EnhancedAnalytics from './components/EnhancedAnalytics'
import { ToastProvider } from './components/Toast'
import MainLayout from './components/layout/MainLayout'
import { ThemeProvider } from './context/ThemeContext'
import { supabase } from './supabase'
import { initializeMobile, getMobileStyles } from './mobile'
import axios from 'axios'

function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('pfm_active_tab') || 'chat')
  const [expenses] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentGroup, setCurrentGroup] = useState(() => {
    try {
      const saved = localStorage.getItem('pfm_current_group')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [addExpenseInput, setAddExpenseInput] = useState('')
  const [addExpenseLoading, setAddExpenseLoading] = useState(false)
  const [addExpenseMessage, setAddExpenseMessage] = useState('')
  const [pendingAddExpenses, setPendingAddExpenses] = useState(null)
  const [chatKey, setChatKey] = useState(0)
  const tableRef = useRef()
  const incomeRef = useRef()
  const loansRef = useRef()

  const mobileStyles = getMobileStyles()

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes slide-up {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
      .animate-slide-up { animation: slide-up 0.3s ease-out; }
    `
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    initializeMobile()
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    localStorage.setItem('pfm_active_tab', activeTab)
  }, [activeTab])

  useEffect(() => {
    if (currentGroup) {
      localStorage.setItem('pfm_current_group', JSON.stringify(currentGroup))
    } else {
      localStorage.removeItem('pfm_current_group')
    }
  }, [currentGroup])

  const handleExpenseAdded = async (newExpenses) => {
    try {
      // Get user's display name
      const getUserDisplayName = () => {
        if (user?.user_metadata?.name && user.user_metadata.name.trim()) {
          return user.user_metadata.name.trim()
        }
        if (user?.email) {
          const emailName = user.email.split('@')[0]
          const cleanName = emailName.replace(/[^a-zA-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
          return cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'Unknown'
        }
        return 'Unknown'
      }

      const displayName = getUserDisplayName()

      const expenseData = newExpenses.map(expense => {
        const row = {
          amount: expense.amount || 0,
          item: expense.item || 'item',
          category: expense.category || 'other',
          remarks: expense.remarks || '',
          paid_by: expense.paid_by || null,
          date: new Date().toISOString().split('T')[0],
          user_id: user?.id,
          added_by: displayName
        }

        if (currentGroup) {
          row.group_id = currentGroup.id
        }
        return row
      })

      // One bulk request is faster and keeps a multi-entry save together.
      const { error } = await supabase.from('expenses').insert(expenseData)

      if (error) {
        throw error
      }

      // Refresh all tables immediately
      if (tableRef.current) {
        tableRef.current.refresh()
      }
      if (incomeRef.current) {
        incomeRef.current.refresh()
      }
      if (loansRef.current) {
        loansRef.current.refresh()
      }
    } catch (error) {
      throw error
    }
  }

  const handleTableRefresh = () => {
    if (tableRef.current) {
      tableRef.current.refresh()
    }
    if (incomeRef.current) {
      incomeRef.current.refresh()
    }
    if (loansRef.current) {
      loansRef.current.refresh()
    }
  }

  const closeAddExpenseModal = () => {
    setShowAddExpense(false)
    setAddExpenseInput('')
    setAddExpenseLoading(false)
    setAddExpenseMessage('')
    setPendingAddExpenses(null)
  }

  const handleQuickExpenseSubmit = async (e) => {
    e.preventDefault()
    const text = addExpenseInput.trim()
    if (!text || addExpenseLoading) return

    setAddExpenseLoading(true)
    setAddExpenseMessage('')

    try {
      const response = await axios.post(`${window.APP_CONFIG?.API_BASE_URL || ''}/api/expenses/parse`, { text, mode: 'expense' })
      const { expenses, reply } = response.data

      if (!expenses || expenses.length === 0) {
        setAddExpenseMessage(reply || 'I could not understand that expense. Include an item and amount.')
        return
      }

      const needsCategory = expenses.some(exp => {
        const category = String(exp.category || '').toLowerCase()
        return exp.needs_confirmation || category === 'other' || category === 'miscellaneous'
      })

      if (needsCategory) {
        setPendingAddExpenses(expenses)
        setAddExpenseMessage(reply || 'Choose a category for this expense.')
        return
      }

      await handleExpenseAdded(expenses)
      closeAddExpenseModal()
    } catch (error) {
      setAddExpenseMessage('Unable to save right now. Please try again.')
    } finally {
      setAddExpenseLoading(false)
    }
  }

  const handleQuickExpenseCategory = async (category) => {
    if (!pendingAddExpenses || addExpenseLoading) return

    setAddExpenseLoading(true)
    setAddExpenseMessage('')

    try {
      await handleExpenseAdded(pendingAddExpenses.map(exp => ({
        ...exp,
        category,
        needs_confirmation: false,
      })))
      closeAddExpenseModal()
    } catch (error) {
      setAddExpenseMessage('Unable to save right now. Please try again.')
    } finally {
      setAddExpenseLoading(false)
    }
  }

  const MainApp = () => {
    if (loading) {
      return (
        <div className="min-h-screen bg-paper-100 flex items-center justify-center">
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 bg-black text-white flex items-center justify-center text-xl font-bold rounded-2xl shadow-xl shadow-black/20 mx-auto mb-4">PFM</div>
            <div className="text-sm text-gray-400 font-medium">Loading your finances...</div>
          </div>
        </div>
      )
    }

    if (!user) {
      return <Auth onAuth={setUser} />
    }

    return (
      <MainLayout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={() => setUser(null)}
        currentGroup={currentGroup}
        onGroupChange={setCurrentGroup}
        onClearChat={() => {
          localStorage.removeItem('pfm_messages')
          setChatKey(k => k + 1)
        }}
      >
        <div className={`${activeTab === 'chat' ? 'flex' : 'hidden'} flex-col h-full relative`}>
            <div className="hidden lg:block flex-shrink-0 p-4 lg:p-8 lg:pt-8 max-w-7xl mx-auto w-full">
              <GroupManager
                user={user}
                currentGroup={currentGroup}
                onGroupChange={setCurrentGroup}
                onClearChat={() => {
                  localStorage.removeItem('pfm_messages')
                  setChatKey(k => k + 1)
                }}
              />
            </div>
            <div className="flex-1 overflow-hidden w-full">
              <Chat
                key={chatKey}
                onExpenseAdded={handleExpenseAdded}
                onTableRefresh={handleTableRefresh}
                user={user}
                currentGroup={currentGroup}
                isVisible={activeTab === 'chat'}
                showMessagesArea={true}
                onClearChat={() => {
                  localStorage.removeItem('pfm_messages')
                  setChatKey(k => k + 1)
                }}
              />
            </div>
        </div>

        {activeTab === 'expenses' && (
          <div className="flex flex-col h-full relative">
            <div className="hidden lg:block flex-shrink-0 p-4 lg:p-8 lg:pt-8 max-w-[1600px] mx-auto w-full">
              <GroupManager user={user} currentGroup={currentGroup} onGroupChange={setCurrentGroup} />
            </div>
            <div className="flex-1 overflow-auto px-4 lg:px-8 pb-32 lg:pb-8 max-w-[1600px] mx-auto w-full">
              <Table ref={tableRef} expenses={expenses} currentGroup={currentGroup} user={user} />
            </div>
          </div>
        )}

        {activeTab === 'income' && (
          <div className="flex flex-col h-full relative">
            <div className="hidden lg:block flex-shrink-0 p-4 lg:p-8 lg:pt-8 max-w-[1600px] mx-auto w-full">
              <GroupManager user={user} currentGroup={currentGroup} onGroupChange={setCurrentGroup} />
            </div>
            <div className="flex-1 overflow-auto px-4 lg:px-8 pb-32 lg:pb-8 max-w-[1600px] mx-auto w-full">
              <Income ref={incomeRef} currentGroup={currentGroup} user={user} />
            </div>
          </div>
        )}

        {activeTab === 'loans' && (
          <div className="flex flex-col h-full relative">
            <div className="hidden lg:block flex-shrink-0 p-4 lg:p-8 lg:pt-8 max-w-[1600px] mx-auto w-full">
              <GroupManager user={user} currentGroup={currentGroup} onGroupChange={setCurrentGroup} />
            </div>
            <div className="flex-1 overflow-auto px-4 lg:px-8 pb-32 lg:pb-8 max-w-[1600px] mx-auto w-full">
              <Loans ref={loansRef} currentGroup={currentGroup} user={user} />
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="flex flex-col h-full relative">
            <div className="hidden lg:block flex-shrink-0 p-4 lg:p-8 lg:pt-8 max-w-[1600px] mx-auto w-full">
              <GroupManager user={user} currentGroup={currentGroup} onGroupChange={setCurrentGroup} />
            </div>
            <div className="flex-1 overflow-auto px-4 lg:px-8 pb-32 lg:pb-8 max-w-[1600px] mx-auto w-full">
              <EnhancedAnalytics currentGroup={currentGroup} user={user} />
            </div>
          </div>
        )}

        {activeTab !== 'chat' && (
          <button
            type="button"
            onClick={() => setShowAddExpense(true)}
            aria-label="Add expense"
            className="fixed bottom-8 right-12 z-40 hidden h-14 w-14 items-center justify-center rounded-2xl bg-black text-white shadow-xl shadow-black/20 transition-all hover:scale-105 active:scale-95 lg:flex"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}

        {/* Add Modal */}
        {showAddExpense && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center" onClick={closeAddExpenseModal}>
            <div className="bg-white dark:bg-paper-100 w-full h-[90vh] lg:h-[600px] lg:w-[600px] lg:rounded-3xl shadow-2xl flex flex-col animate-slide-up lg:animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <div className="flex-shrink-0 flex items-center justify-between px-8 py-6 border-b border-gray-100 dark:border-paper-200">
                <h3 className="font-display font-bold text-xl dark:text-white">Add Expense</h3>
                <button onClick={closeAddExpenseModal} className="bg-gray-100 dark:bg-paper-200 text-gray-600 dark:text-gray-300 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-paper-300 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-3 text-sm">
                  {pendingAddExpenses && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-100">
                      <p className="font-medium">{addExpenseMessage || 'Choose a category for this expense.'}</p>
                      {pendingAddExpenses.map((expense, index) => (
                        <p key={index} className="mt-2 text-gray-700 dark:text-gray-200">
                          Rs.{Math.abs(expense.amount || 0).toLocaleString()} - {expense.item || expense.remarks || 'Expense'}
                        </p>
                      ))}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {['Food', 'Transport', 'Utilities', 'Entertainment', 'Medical', 'Education', 'Shopping', 'Groceries', 'Personal Care', 'Other'].map(category => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => handleQuickExpenseCategory(category)}
                            disabled={addExpenseLoading}
                            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm border border-gray-200 hover:bg-gray-100 disabled:opacity-60 dark:bg-paper-200 dark:text-gray-100 dark:border-paper-300 dark:hover:bg-paper-300"
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!pendingAddExpenses && addExpenseMessage && (
                    <div className="rounded-2xl bg-red-50 px-4 py-3 text-red-700 dark:bg-red-900/20 dark:text-red-200">
                      {addExpenseMessage}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 border-t border-gray-200 dark:border-paper-200 px-6 py-4">
                <form onSubmit={handleQuickExpenseSubmit} className="flex gap-2">
                  <input
                    name="expense"
                    value={addExpenseInput}
                    onChange={(e) => {
                      setAddExpenseInput(e.target.value)
                      setPendingAddExpenses(null)
                      setAddExpenseMessage('')
                    }}
                    placeholder="e.g., 500 on lunch, 200 on coffee"
                    className="flex-1 px-4 py-3 text-sm border border-gray-300 dark:border-paper-300 bg-white dark:bg-paper-200 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-full focus:border-black dark:focus:border-white focus:outline-none transition-colors"
                    disabled={addExpenseLoading}
                    autoFocus
                  />
                  <button type="submit" disabled={addExpenseLoading || !addExpenseInput.trim()} className="w-10 h-10 bg-black dark:bg-white text-white dark:text-paper-100 rounded-full hover:bg-gray-800 dark:hover:bg-gray-200 transition-all flex items-center justify-center text-lg flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                    {addExpenseLoading ? '...' : '↑'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    )
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<MainApp />} />
          </Routes>
        </Router>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
