const formatName = (value, fallback = 'Item') => {
  const text = String(value || '').trim()
  if (!text) return fallback
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const formatAmount = (value) => Math.abs(Number(value) || 0).toLocaleString()

const formatRememberedItems = (items) => {
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

// Build a complete save message when category memory was used. A multi-item
// submission must list every saved transaction, not only the remembered one.
export const buildRememberedExpenseReply = (transactions, rememberedCategories) => {
  const savedTransactions = Array.isArray(transactions) ? transactions : []
  const remembered = Array.isArray(rememberedCategories) ? rememberedCategories : []
  if (savedTransactions.length === 0 || remembered.length === 0) return null

  const details = savedTransactions.map(transaction => (
    `${formatName(transaction.item)}: Rs.${formatAmount(transaction.amount)}, ${transaction.category || 'Other'}`
  ))
  const savedSummary = savedTransactions.length === 1
    ? `Saved ${details[0]}.`
    : `Saved ${savedTransactions.length} expenses:\n${details.map(detail => `- ${detail}`).join('\n')}`

  const rememberedItems = [...new Set(remembered
    .map(entry => formatName(entry.item, ''))
    .filter(Boolean))]
  const memorySummary = rememberedItems.length > 0
    ? `I used your remembered category ${rememberedItems.length === 1 ? 'choice' : 'choices'} for ${formatRememberedItems(rememberedItems)}.`
    : `I used ${remembered.length} remembered category ${remembered.length === 1 ? 'choice' : 'choices'}.`

  return `${savedSummary}\n\n${memorySummary}`
}
