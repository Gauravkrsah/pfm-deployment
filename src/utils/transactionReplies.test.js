import { buildRememberedExpenseReply } from './transactionReplies'

describe('saved transaction replies', () => {
  test('lists every saved expense when one item used category memory', () => {
    const reply = buildRememberedExpenseReply([
      { item: 'haldi', amount: 40, category: 'Groceries' },
      { item: 'spices', amount: 90, category: 'Groceries' },
      { item: 'water bottle', amount: 50, category: 'Food' },
    ], [
      { item: 'haldi', category: 'Groceries' },
    ])

    expect(reply).toBe(
      'Saved 3 expenses:\n' +
      '- Haldi: Rs.40, Groceries\n' +
      '- Spices: Rs.90, Groceries\n' +
      '- Water bottle: Rs.50, Food\n\n' +
      'I used your remembered category choice for Haldi.'
    )
  })

  test('keeps the concise format for one saved expense', () => {
    expect(buildRememberedExpenseReply([
      { item: 'haldi', amount: 40, category: 'Groceries' },
    ], [
      { item: 'haldi', category: 'Groceries' },
    ])).toBe(
      'Saved Haldi: Rs.40, Groceries.\n\n' +
      'I used your remembered category choice for Haldi.'
    )
  })

  test('lets the backend reply remain unchanged when memory was not used', () => {
    expect(buildRememberedExpenseReply([
      { item: 'tea', amount: 50, category: 'Food' },
    ], [])).toBeNull()
  })
})
