const CATEGORY_MEMORY_PREFIX = 'pfm_category_memory_v1'
const MAX_MEMORY_ITEMS = 300
const NON_EXPENSE_CATEGORIES = new Set(['', 'other', 'miscellaneous', 'income', 'loan'])

export const normalizeCategoryMemoryItem = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\s'-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const storageKey = (userId) => `${CATEGORY_MEMORY_PREFIX}:${userId || 'anonymous'}`

const isLearnableCategory = (category) => {
  const normalized = String(category || '').trim().toLowerCase()
  return !NON_EXPENSE_CATEGORIES.has(normalized)
}

const readMemory = (userId) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export const rememberCategoryChoice = (userId, item, category) => {
  const itemKey = normalizeCategoryMemoryItem(item)
  const cleanCategory = String(category || '').trim()
  if (!itemKey || !isLearnableCategory(cleanCategory)) return false

  const memory = readMemory(userId)
  memory[itemKey] = {
    category: cleanCategory,
    updatedAt: Date.now(),
  }

  const compactMemory = Object.fromEntries(
    Object.entries(memory)
      .sort(([, left], [, right]) => Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0))
      .slice(0, MAX_MEMORY_ITEMS)
  )
  localStorage.setItem(storageKey(userId), JSON.stringify(compactMemory))
  return true
}

export const findRememberedCategory = (userId, item, transactionHistory = []) => {
  const itemKey = normalizeCategoryMemoryItem(item)
  if (!itemKey) return null

  const localCategory = readMemory(userId)[itemKey]?.category
  if (isLearnableCategory(localCategory)) return localCategory

  // The chat loads history newest-first, so the latest saved correction wins.
  const priorTransaction = transactionHistory.find(transaction => (
    normalizeCategoryMemoryItem(transaction?.item) === itemKey
    && isLearnableCategory(transaction?.category)
  ))
  return priorTransaction?.category || null
}

export const applyRememberedCategories = (transactions, { userId, transactionHistory = [] } = {}) => {
  const applied = []
  const updatedTransactions = (transactions || []).map(transaction => {
    const currentCategory = String(transaction?.category || '').trim().toLowerCase()
    const needsCategory = Boolean(transaction?.needs_confirmation)
      || currentCategory === 'other'
      || currentCategory === 'miscellaneous'
    if (!needsCategory) return transaction

    const rememberedCategory = findRememberedCategory(userId, transaction?.item, transactionHistory)
    if (!rememberedCategory) return transaction

    applied.push({ item: transaction.item, category: rememberedCategory })
    return {
      ...transaction,
      category: rememberedCategory,
      needs_confirmation: false,
      category_source: 'memory',
    }
  })

  return { transactions: updatedTransactions, applied }
}
