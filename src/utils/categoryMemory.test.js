import {
  applyRememberedCategories,
  findRememberedCategory,
  rememberCategoryChoice,
} from './categoryMemory'

describe('category correction memory', () => {
  beforeEach(() => localStorage.clear())

  test('reuses a category after the user teaches an unknown item', () => {
    rememberCategoryChoice('user-1', 'Dahi', 'Food')

    const result = applyRememberedCategories([
      { item: 'dahi', amount: 100, category: 'Other', needs_confirmation: true },
    ], { userId: 'user-1' })

    expect(result.transactions[0]).toMatchObject({
      category: 'Food',
      needs_confirmation: false,
      category_source: 'memory',
    })
    expect(result.applied).toEqual([{ item: 'dahi', category: 'Food' }])
  })

  test('keeps learned meanings isolated by user', () => {
    rememberCategoryChoice('user-1', 'Dahi', 'Food')

    expect(findRememberedCategory('user-2', 'Dahi')).toBeNull()
  })

  test('recovers a learned category from saved transaction history', () => {
    const category = findRememberedCategory('user-1', 'dahi', [
      { item: 'Dahi', category: 'Food' },
    ])

    expect(category).toBe('Food')
  })

  test('does not overwrite a confident current category', () => {
    rememberCategoryChoice('user-1', 'Tea', 'Groceries')
    const result = applyRememberedCategories([
      { item: 'Tea', amount: 50, category: 'Food', needs_confirmation: false },
    ], { userId: 'user-1' })

    expect(result.transactions[0].category).toBe('Food')
    expect(result.applied).toHaveLength(0)
  })
})
