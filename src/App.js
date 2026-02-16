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

      for (const expense of newExpenses) {
        const expenseData = {
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
          expenseData.group_id = currentGroup.id
        }

        const { error } = await supabase.from('expenses').insert(expenseData)

        if (error) {
          throw error
        }
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
      >
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full relative">
            <div className="flex-shrink-0 p-4 lg:p-8 lg:pt-8 max-w-7xl mx-auto w-full">
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
                isVisible={true}
                activeTab={activeTab}
                showMessagesArea={true}
              />
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="flex flex-col h-full relative">
            <div className="flex-shrink-0 p-4 lg:p-8 lg:pt-8 max-w-7xl mx-auto w-full">
              <GroupManager user={user} currentGroup={currentGroup} onGroupChange={setCurrentGroup} />
            </div>
            <div className="flex-1 overflow-auto px-4 lg:px-8 pb-32 lg:pb-8 max-w-7xl mx-auto w-full">
              <Table ref={tableRef} expenses={expenses} currentGroup={currentGroup} user={user} />
            </div>
            <button
              onClick={() => setShowAddExpense(true)}
              className="fixed bottom-24 lg:bottom-8 right-6 lg:right-12 w-14 h-14 lg:w-14 lg:h-14 bg-black text-white rounded-2xl shadow-xl shadow-black/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center z-40"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}

        {activeTab === 'income' && (
          <div className="flex flex-col h-full relative">
            <div className="flex-shrink-0 p-4 lg:p-8 lg:pt-8 max-w-7xl mx-auto w-full">
              <GroupManager user={user} currentGroup={currentGroup} onGroupChange={setCurrentGroup} />
            </div>
            <div className="flex-1 overflow-auto px-4 lg:px-8 pb-32 lg:pb-8 max-w-7xl mx-auto w-full">
              <Income ref={incomeRef} currentGroup={currentGroup} user={user} />
            </div>
            <button
              onClick={() => setShowAddExpense(true)}
              className="fixed bottom-24 lg:bottom-8 right-6 lg:right-12 w-14 h-14 lg:w-14 lg:h-14 bg-black text-white rounded-2xl shadow-xl shadow-black/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center z-40"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}

        {activeTab === 'loans' && (
          <div className="flex flex-col h-full relative">
            <div className="flex-shrink-0 p-4 lg:p-8 lg:pt-8 max-w-7xl mx-auto w-full">
              <GroupManager user={user} currentGroup={currentGroup} onGroupChange={setCurrentGroup} />
            </div>
            <div className="flex-1 overflow-auto px-4 lg:px-8 pb-32 lg:pb-8 max-w-7xl mx-auto w-full">
              <Loans ref={loansRef} currentGroup={currentGroup} user={user} />
            </div>
            <button
              onClick={() => setShowAddExpense(true)}
              className="fixed bottom-24 lg:bottom-8 right-6 lg:right-12 w-14 h-14 lg:w-14 lg:h-14 bg-black text-white rounded-2xl shadow-xl shadow-black/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center z-40"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="flex flex-col h-full relative">
            <div className="flex-shrink-0 p-4 lg:p-8 lg:pt-8 max-w-7xl mx-auto w-full">
              <GroupManager user={user} currentGroup={currentGroup} onGroupChange={setCurrentGroup} />
            </div>
            <div className="flex-1 overflow-auto px-4 lg:px-8 pb-32 lg:pb-8 max-w-7xl mx-auto w-full">
              <EnhancedAnalytics currentGroup={currentGroup} user={user} />
            </div>
            <button
              onClick={() => setShowAddExpense(true)}
              className="fixed bottom-24 lg:bottom-8 right-6 lg:right-12 w-14 h-14 lg:w-14 lg:h-14 bg-black text-white rounded-2xl shadow-xl shadow-black/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center z-40"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}

        {/* Add Modal */}
        {showAddExpense && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center" onClick={() => setShowAddExpense(false)}>
            <div className="bg-white dark:bg-paper-100 w-full h-[90vh] lg:h-[600px] lg:w-[600px] lg:rounded-3xl shadow-2xl flex flex-col animate-slide-up lg:animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <div className="flex-shrink-0 flex items-center justify-between px-8 py-6 border-b border-gray-100 dark:border-paper-200">
                <h3 className="font-display font-bold text-xl dark:text-white">Add Expense</h3>
                <button onClick={() => setShowAddExpense(false)} className="bg-gray-100 dark:bg-paper-200 text-gray-600 dark:text-gray-300 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-paper-300 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-3">
                  {/* Chat messages will go here */}
                </div>
              </div>
              <div className="flex-shrink-0 border-t border-gray-200 dark:border-paper-200 px-6 py-4">
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  const formData = new FormData(e.target)
                  const text = formData.get('expense')
                  if (!text.trim()) return

                  try {
                    const response = await axios.post(`${window.APP_CONFIG?.API_BASE_URL || ''}/api/expenses/parse`, { text })
                    const { expenses } = response.data
                    if (expenses && expenses.length > 0) {
                      await handleExpenseAdded(expenses)
                      setShowAddExpense(false)
                    }
                  } catch (error) {
                    console.error(error)
                  }
                }} className="flex gap-2">
                  <input
                    name="expense"
                    placeholder="e.g., 500 on lunch, 200 on coffee"
                    className="flex-1 px-4 py-3 text-sm border border-gray-300 dark:border-paper-300 bg-white dark:bg-paper-200 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 rounded-full focus:border-black dark:focus:border-white focus:outline-none transition-colors"
                    autoFocus
                  />
                  <button type="submit" className="w-10 h-10 bg-black dark:bg-white text-white dark:text-paper-100 rounded-full hover:bg-gray-800 dark:hover:bg-gray-200 transition-all flex items-center justify-center text-lg flex-shrink-0">
                    ↑
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
        <Router>
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