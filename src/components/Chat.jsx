import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { Send, MessageCircle, Receipt, Wallet, ArrowLeftRight } from 'lucide-react'
import { supabase } from '../supabase'

const getApiBaseUrl = () => {
  if (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) {
    return window.APP_CONFIG.API_BASE_URL
  }
  return ''
}

const INPUT_MODES = [
  { id: 'chat', label: 'Chat', icon: MessageCircle, placeholder: 'Ask about your finances...', hint: 'e.g., "how much did I spend on food?"', emoji: '💬', desc: 'Ask questions about your finances' },
  { id: 'expense', label: 'Expense', icon: Receipt, placeholder: 'e.g., lunch 250, coffee 80', hint: 'e.g., "lunch 250" or "coffee 80"', emoji: '🧾', desc: 'Add your expenses quickly' },
  { id: 'income', label: 'Income', icon: Wallet, placeholder: 'e.g., salary 50000', hint: 'e.g., "salary 50000" or "freelance 15000"', emoji: '💰', desc: 'Log your income sources' },
  { id: 'loan', label: 'Loan', icon: ArrowLeftRight, placeholder: 'e.g., lent 1000 to Ram', hint: 'e.g., "lent 1000 to Ram" or "borrowed 500 from Sita"', emoji: '🤝', desc: 'Track loans and borrowings' },
]

const MODE_STYLES = {
  chat: {
    active: 'bg-black dark:bg-white text-white dark:text-black shadow-lg shadow-black/10',
    border: 'border-black/10 dark:border-white/10',
    sendBg: 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200',
    focusRing: 'focus-within:ring-2 focus-within:ring-black/5 dark:focus-within:ring-white/10',
  },
  expense: {
    active: 'bg-red-500 text-white shadow-lg shadow-red-500/20',
    border: 'border-red-200 dark:border-red-500/20',
    sendBg: 'bg-red-500 text-white hover:bg-red-600',
    focusRing: 'focus-within:ring-2 focus-within:ring-red-500/15',
  },
  income: {
    active: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20',
    border: 'border-emerald-200 dark:border-emerald-500/20',
    sendBg: 'bg-emerald-500 text-white hover:bg-emerald-600',
    focusRing: 'focus-within:ring-2 focus-within:ring-emerald-500/15',
  },
  loan: {
    active: 'bg-amber-500 text-white shadow-lg shadow-amber-500/20',
    border: 'border-amber-200 dark:border-amber-500/20',
    sendBg: 'bg-amber-500 text-white hover:bg-amber-600',
    focusRing: 'focus-within:ring-2 focus-within:ring-amber-500/15',
  },
}

export default function Chat({ onExpenseAdded, onTableRefresh, user, currentGroup, isVisible = true, compact = false, onClearChat, activeTab, showMessagesArea = true }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pfm_messages') || '[]')
    } catch { return [] }
  })
  const [expensesData, setExpensesData] = useState([])
  const [pendingTransactions, setPendingTransactions] = useState(null)
  const messagesEndRef = useRef(null)

  // Derive inputMode from activeTab
  const getDefaultMode = (tab) => {
    if (tab === 'expenses') return 'expense'
    if (tab === 'income') return 'income'
    if (tab === 'loans') return 'loan'
    return 'chat'
  }

  const [inputMode, setInputMode] = useState(() => getDefaultMode(activeTab))

  // Sync inputMode when activeTab changes
  useEffect(() => {
    setInputMode(getDefaultMode(activeTab))
  }, [activeTab])

  const currentModeConfig = INPUT_MODES.find(m => m.id === inputMode) || INPUT_MODES[0]
  const currentStyle = MODE_STYLES[inputMode] || MODE_STYLES.chat

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  useEffect(() => {
    localStorage.setItem('pfm_messages', JSON.stringify(messages))
  }, [messages])

  const fetchExpensesData = useCallback(async () => {
    try {
      let query = supabase.from('expenses').select('*')
      if (currentGroup) {
        query = query.eq('group_id', currentGroup.id)
      } else {
        query = query.eq('user_id', user.id).is('group_id', null)
      }
      const { data, error } = await query.order('created_at', { ascending: false }).limit(1000)
      if (!error) setExpensesData(data || [])
    } catch (err) { }
  }, [user, currentGroup])

  useEffect(() => {
    if (user) fetchExpensesData()
  }, [user, currentGroup, fetchExpensesData])

  // Check if a word looks like a real word (has vowels, not random consonants)
  const isRealWord = (word) => {
    const clean = word.replace(/[^a-zA-Z]/g, '')
    if (clean.length < 2) return false
    // Must contain at least one vowel
    if (!/[aeiouAEIOU]/.test(clean)) return false
    // No more than 4 consecutive consonants
    if (/[^aeiouAEIOU\s]{5,}/i.test(clean)) return false
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    // Validate: expense/income/loan modes need an amount + a real description
    if (inputMode !== 'chat') {
      const hasNumber = /\d/.test(input)
      const words = input.replace(/[\d.,;:!?]/g, '').trim().split(/\s+/).filter(w => w.length >= 2)
      const hasRealWord = words.some(w => isRealWord(w))

      if (!hasNumber || !hasRealWord) {
        const hint = !hasNumber
          ? `Include an amount — ${currentModeConfig.hint}`
          : `Use a real description — ${currentModeConfig.hint}`
        setMessages(prev => [...prev,
        { type: 'user', text: input, mode: inputMode },
        { type: 'bot', text: hint }
        ])
        setInput('')
        return
      }
    }

    const userMsg = input
    setMessages(prev => [...prev, { type: 'user', text: userMsg, mode: inputMode }])
    setInput('')
    setLoading(true)

    try {
      if (inputMode === 'chat') {
        // Chat mode — AI financial Q&A
        const { data: { user: freshUser } } = await supabase.auth.getUser()
        const currentUser = freshUser || user
        const userName = currentUser?.user_metadata?.name || currentUser?.email?.split('@')[0] || 'User'

        const payload = {
          text: userMsg,
          user_id: currentUser?.id,
          user_email: currentUser?.email,
          user_name: userName
        }

        if (currentGroup) {
          payload.group_name = currentGroup.name
          payload.group_expenses_data = expensesData
        } else {
          payload.expenses_data = expensesData
        }

        const response = await axios.post(`${getApiBaseUrl()}/api/expenses/chat`, payload)
        setMessages(prev => [...prev, { type: 'bot', text: response.data.reply }])

      } else if (inputMode === 'expense') {
        // Expense mode — parse and save as expense
        const response = await axios.post(`${getApiBaseUrl()}/api/expenses/parse`, { text: userMsg })
        const { expenses, reply } = response.data
        setMessages(prev => [...prev, { type: 'bot', text: reply }])

        if (expenses && expenses.length > 0) {
          const hasAmbiguous = expenses.some(exp => exp.category === 'Other')

          if (hasAmbiguous) {
            setPendingTransactions({ expenses, forceMode: 'expense' })
            setMessages(prev => [...prev, {
              type: 'confirmation',
              text: `Choose a category for this expense:`,
              expenses: expenses,
              confirmMode: 'expense'
            }])
          } else {
            await onExpenseAdded(expenses)
            setMessages(prev => [...prev, { type: 'bot', text: '✓ Saved' }])
          }
        }

      } else if (inputMode === 'income') {
        // Income mode — parse and save as income (negative amount)
        const response = await axios.post(`${getApiBaseUrl()}/api/expenses/parse`, { text: userMsg })
        const { expenses, reply } = response.data
        setMessages(prev => [...prev, { type: 'bot', text: reply }])

        if (expenses && expenses.length > 0) {
          const incomeExpenses = expenses.map(exp => ({
            ...exp,
            category: 'Income',
            amount: -Math.abs(exp.amount),
            remarks: exp.remarks || `Income: ${exp.item}`
          }))
          await onExpenseAdded(incomeExpenses)
          setMessages(prev => [...prev, { type: 'bot', text: '✓ Saved as Income' }])
        }

      } else if (inputMode === 'loan') {
        // Loan mode — parse and enter loan confirmation flow
        const response = await axios.post(`${getApiBaseUrl()}/api/expenses/parse`, { text: userMsg })
        const { expenses, reply } = response.data
        setMessages(prev => [...prev, { type: 'bot', text: reply }])

        if (expenses && expenses.length > 0) {
          // Try to extract person name
          const exp = expenses[0]
          const stopWords = ['i', 'me', 'my', 'to', 'from', 'for', 'on', 'in', 'at', 'the', 'a', 'an', 'send', 'sent', 'gave', 'given', 'lent', 'borrowed', 'took', 'paid', 'loan', 'transaction', 'transfer', 'money', 'cash', 'online', 'upi']
          let person = exp.paid_by || null

          if (!person) {
            const words = (exp.remarks || exp.item || '').split(' ')
            for (const word of words) {
              const cleanWord = word.replace(/[^a-zA-Z]/g, '')
              if (cleanWord.length > 2 && !stopWords.includes(cleanWord.toLowerCase())) {
                person = cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1).toLowerCase()
                break
              }
            }
          }

          const updatedExpenses = expenses.map(e => ({ ...e, paid_by: person, category: 'Loan' }))
          setPendingTransactions({ expenses: updatedExpenses, forceMode: 'loan' })

          setMessages(prev => [...prev, {
            type: 'confirmation',
            text: person ? `Transaction with ${person}. What type?` : `What type of loan transaction?`,
            expenses: updatedExpenses,
            confirmMode: 'loan'
          }])
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { type: 'bot', text: 'Error: Unable to process request' }])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([])
    localStorage.removeItem('pfm_messages')
  }

  // Handle confirmation - save to chosen category (for expense mode)
  const handleConfirmSave = async (category) => {
    if (!pendingTransactions) return

    try {
      const updatedExpenses = pendingTransactions.expenses.map(exp => ({
        ...exp,
        category: category
      }))

      await onExpenseAdded(updatedExpenses)
      setMessages(prev => [...prev, { type: 'bot', text: `✓ Saved to ${category}` }])
      setPendingTransactions(null)
    } catch (error) {
      setMessages(prev => [...prev, { type: 'bot', text: 'Error saving transaction' }])
    }
  }

  // Handle confirmation with specific type (for loan transactions)
  const handleConfirmSaveWithType = async (category, itemType, amount) => {
    if (!pendingTransactions) return

    try {
      const exp = pendingTransactions.expenses[0]

      let typeLabel, remarks
      if (itemType === 'received from') {
        typeLabel = 'RECEIVED'
        remarks = `Received from ${exp.paid_by}`
      } else if (itemType === 'lent to') {
        typeLabel = 'LENT'
        remarks = `Lent to ${exp.paid_by}`
      } else if (itemType === 'borrowed from') {
        typeLabel = 'BORROWED'
        remarks = `Borrowed from ${exp.paid_by}`
      } else if (itemType === 'paid to') {
        typeLabel = 'PAID'
        remarks = `Paid to ${exp.paid_by}`
      } else {
        typeLabel = itemType.toUpperCase()
        remarks = `${itemType} ${exp.paid_by}`
      }

      const updatedExpense = {
        ...exp,
        category: category,
        item: itemType,
        amount: amount,
        remarks: remarks
      }

      await onExpenseAdded([updatedExpense])
      setMessages(prev => [...prev, { type: 'bot', text: `✓ Saved as ${typeLabel}${exp.paid_by ? ` (${exp.paid_by})` : ''}` }])
      setPendingTransactions(null)
    } catch (error) {
      setMessages(prev => [...prev, { type: 'bot', text: 'Error saving transaction' }])
    }
  }

  const handleCancelPending = () => {
    setPendingTransactions(null)
    setMessages(prev => [...prev, { type: 'bot', text: '✗ Cancelled' }])
  }

  // Render confirmation buttons based on mode
  const renderConfirmation = (msg) => {
    if (msg.confirmMode === 'loan' && msg.expenses?.[0]) {
      const exp = msg.expenses[0]
      const person = exp.paid_by
      const item = (exp.item || '').toLowerCase()
      const remarks = (exp.remarks || '').toLowerCase()

      const isGaveOrTo = item.includes('i gave') || item.includes('to person') || remarks.includes('i gave')
      const isFrom = item.includes('from') || remarks.includes(' from ')

      let buttons = []

      if (isGaveOrTo && !isFrom) {
        buttons = [
          { label: `I lent to ${person || '?'}`, tag: 'LENT', onClick: () => handleConfirmSaveWithType('Loan', 'lent to', Math.abs(exp.amount)), bg: 'bg-green-100 text-green-700 hover:bg-green-200' },
          { label: `I paid back ${person || '?'}`, tag: 'PAID', onClick: () => handleConfirmSaveWithType('Loan', 'paid to', Math.abs(exp.amount)), bg: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
        ]
      } else if (isFrom) {
        buttons = [
          { label: `${person || '?'} paid back`, tag: 'RECEIVED', onClick: () => handleConfirmSaveWithType('Loan', 'received from', -Math.abs(exp.amount)), bg: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
          { label: `I borrowed from ${person || '?'}`, tag: 'BORROWED', onClick: () => handleConfirmSaveWithType('Loan', 'borrowed from', -Math.abs(exp.amount)), bg: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
        ]
      } else {
        buttons = [
          { label: `${person || '?'} paid back`, tag: 'RECEIVED', onClick: () => handleConfirmSaveWithType('Loan', 'received from', -Math.abs(exp.amount)), bg: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
          { label: `I gave to ${person || '?'}`, tag: 'LENT', onClick: () => handleConfirmSaveWithType('Loan', 'lent to', Math.abs(exp.amount)), bg: 'bg-green-100 text-green-700 hover:bg-green-200' },
          { label: `I took from ${person || '?'}`, tag: 'BORROWED', onClick: () => handleConfirmSaveWithType('Loan', 'borrowed from', -Math.abs(exp.amount)), bg: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
          { label: `I paid back ${person || '?'}`, tag: 'PAID', onClick: () => handleConfirmSaveWithType('Loan', 'paid to', Math.abs(exp.amount)), bg: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
        ]
      }

      return (
        <div className="flex flex-col gap-2 mt-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">What type of transaction?</p>
          <div className="flex flex-wrap gap-2">
            {buttons.map((btn, i) => (
              <button key={i} onClick={btn.onClick} className={`px-3 py-2 text-xs font-medium rounded-xl transition-colors ${btn.bg}`}>
                {btn.label} → <span className="font-bold">{btn.tag}</span>
              </button>
            ))}
          </div>
          <button onClick={handleCancelPending} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-paper-300 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-paper-400 transition-colors self-start">
            Cancel
          </button>
        </div>
      )
    }

    // Expense mode confirmation — pick a category
    return (
      <div className="flex flex-col gap-2 mt-3">
        <div className="flex flex-wrap gap-2">
          {['Food', 'Transport', 'Utilities', 'Entertainment', 'Health', 'Education', 'Shopping', 'Groceries', 'Investment', 'Other'].map(cat => (
            <button key={cat} onClick={() => handleConfirmSave(cat)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-paper-300 text-gray-700 dark:text-gray-200 rounded-full hover:bg-gray-200 dark:hover:bg-paper-400 transition-colors">
              {cat}
            </button>
          ))}
        </div>
        <button onClick={handleCancelPending} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-paper-300 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-paper-400 transition-colors self-start">
          Cancel
        </button>
      </div>
    )
  }

  // Mode badge for user messages
  const getModeBadge = (mode) => {
    const modeConf = INPUT_MODES.find(m => m.id === mode)
    if (!modeConf) return null
    const Icon = modeConf.icon
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider opacity-60 mb-1">
        <Icon size={10} />
        {modeConf.label}
      </span>
    )
  }

  return (
    <div className="flex flex-col h-full relative" style={{ display: isVisible ? 'flex' : 'none' }}>

      {/* Messages Area */}
      {showMessagesArea && (
        <>
          {messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center px-4 lg:px-8">
              <div className="text-center">
                <div className="text-5xl mb-4 transition-all duration-300">{currentModeConfig.emoji}</div>
                <p className="text-base font-medium text-gray-700 dark:text-gray-200 mb-1">{currentModeConfig.desc}</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">{currentModeConfig.hint}</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-hide px-4 lg:px-8 py-4 pb-72 lg:pb-72">
              <div className="max-w-7xl mx-auto space-y-3 pt-6">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.type === 'confirmation' ? (
                      <div className="max-w-[90%] lg:max-w-[80%] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-4 py-3 rounded-2xl">
                        <p className="text-sm text-amber-800 dark:text-amber-200 mb-1">{msg.text}</p>
                        {msg.expenses && msg.expenses.map((exp, j) => (
                          <p key={j} className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                            Rs.{Math.abs(exp.amount).toLocaleString()} → {exp.remarks || exp.item}
                          </p>
                        ))}
                        {renderConfirmation(msg)}
                      </div>
                    ) : (
                      <div className={`max-w-[80%] lg:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${msg.type === 'user' ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-paper-200 text-gray-900 dark:text-gray-100'}`}>
                        {msg.type === 'user' && msg.mode && getModeBadge(msg.mode)}
                        <div>{msg.text}</div>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 dark:bg-paper-200 px-4 py-3 rounded-2xl">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Premium Input Area ─── */}
      <div className="fixed bottom-14 lg:bottom-0 left-0 right-0 lg:left-64 z-30">
        <div className="absolute inset-x-0 bottom-full h-28 bg-gradient-to-t from-paper-50 via-paper-50/80 dark:from-paper-50 dark:via-paper-50/80 to-transparent pointer-events-none" />
        <div className="bg-paper-50/90 dark:bg-paper-50/90 backdrop-blur-2xl px-3 sm:px-6 lg:px-8 pb-3 lg:pb-6 pt-1">
          <div className="max-w-2xl mx-auto space-y-2">

            {/* ── Mode Switcher ── */}
            <div className="flex bg-white/80 dark:bg-paper-100/80 backdrop-blur-lg rounded-2xl p-1 shadow-sm border border-gray-200/60 dark:border-paper-200/40 gap-0.5">
              {INPUT_MODES.map(mode => {
                const Icon = mode.icon
                const isActive = inputMode === mode.id
                const style = MODE_STYLES[mode.id]
                return (
                  <button
                    key={mode.id}
                    onClick={() => setInputMode(mode.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isActive
                      ? `${style.active} scale-[1.02]`
                      : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-paper-200/50 active:scale-95'
                      }`}
                  >
                    <Icon size={14} strokeWidth={isActive ? 2.5 : 1.8} />
                    {mode.label}
                  </button>
                )
              })}
            </div>

            {/* ── Input Card ── */}
            <div className={`relative bg-white dark:bg-paper-100 rounded-2xl border ${currentStyle.border} shadow-[0_2px_12px_rgba(0,0,0,0.04),0_8px_32px_-8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3),0_8px_32px_-8px_rgba(0,0,0,0.4)] transition-all duration-300 ${currentStyle.focusRing} overflow-hidden`}>
              <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-3.5">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={currentModeConfig.placeholder}
                  className="flex-1 bg-transparent text-[15px] leading-relaxed text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none min-w-0"
                  disabled={loading}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${input.trim()
                    ? `${currentStyle.sendBg} scale-100 shadow-lg active:scale-90`
                    : 'bg-gray-100 dark:bg-paper-200 text-gray-400 dark:text-gray-500'
                    }`}
                >
                  {loading ? (
                    <div className="flex items-center gap-0.5">
                      <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <Send size={16} strokeWidth={2} />
                  )}
                </button>
              </form>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
