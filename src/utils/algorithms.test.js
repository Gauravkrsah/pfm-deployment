import { optimizeBudget } from './algorithms'

describe('optimizeBudget', () => {
  test('does not claim an unrealistic goal is achievable', () => {
    const result = optimizeBudget({ shopping: 10000, rent: 20000 }, 30000, 0.2)

    expect(result.targetSavings).toBe(6000)
    expect(result.availableSavings).toBe(2000)
    expect(result.achievedCuts).toBe(2000)
    expect(result.targetFeasible).toBe(false)
    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'shopping', cutAmount: 2000 }),
    ]))
    expect(result.suggestions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'rent' }),
    ]))
  })

  test('uses only categories the user selects', () => {
    const result = optimizeBudget({ shopping: 10000, food: 10000 }, 20000, 0.1, ['food'])

    expect(result.selectedCategories).toEqual(['food'])
    expect(result.availableSavings).toBe(1500)
    expect(result.achievedCuts).toBe(1500)
    expect(result.suggestions).toEqual([
      expect.objectContaining({ category: 'food', cutAmount: 1500 }),
    ])
  })

  test('distributes a smaller target across selected categories', () => {
    const result = optimizeBudget({ shopping: 10000, entertainment: 10000 }, 20000, 0.1, ['shopping', 'entertainment'])

    expect(result.targetSavings).toBe(2000)
    expect(result.achievedCuts).toBe(2000)
    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'shopping', cutAmount: 1000 }),
      expect.objectContaining({ category: 'entertainment', cutAmount: 1000 }),
    ]))
  })
})
