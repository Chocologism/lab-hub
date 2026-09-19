import { describe, it, expect } from 'vitest'
import { parseAuthors, formatAuthors, isPotentialMultiLine } from './authors'

describe('authors utility', () => {
  it('parses arrays of authors correctly', () => {
    expect(parseAuthors(['Massimo Meneghetti', ' C.S. Kochanek '])).toEqual([
      'Massimo Meneghetti',
      'C.S. Kochanek'
    ])
    expect(parseAuthors([])).toEqual([])
    expect(parseAuthors(null)).toEqual([])
    expect(parseAuthors(undefined)).toEqual([])
  })

  it('parses JSON string encoded authors', () => {
    const jsonStr = JSON.stringify(['Author A', 'Author B', 'Author C'])
    expect(parseAuthors(jsonStr)).toEqual(['Author A', 'Author B', 'Author C'])
  })

  it('parses comma/semicolon delimited strings', () => {
    expect(parseAuthors('Alice Smith, Bob Jones; Charlie Brown')).toEqual([
      'Alice Smith',
      'Bob Jones',
      'Charlie Brown'
    ])
    expect(parseAuthors('作者一；作者二，作者三')).toEqual([
      '作者一',
      '作者二',
      '作者三'
    ])
  })

  it('formats authors properly', () => {
    expect(formatAuthors(['A', 'B'])).toBe('A, B')
    expect(formatAuthors('["X", "Y"]')).toBe('X, Y')
    expect(formatAuthors([])).toBe('')
    expect(formatAuthors(null)).toBe('')
  })

  it('detects potential multi-line authors by count or length', () => {
    expect(isPotentialMultiLine(['Massimo Meneghetti'])).toBe(false)
    expect(isPotentialMultiLine(['A', 'B'])).toBe(false)
    expect(isPotentialMultiLine(['A', 'B', 'C', 'D'])).toBe(true) // > 3 authors
    expect(
      isPotentialMultiLine([
        'Very Long Name Person One With Extraordinary Length',
        'Very Long Name Person Two With Also Great Length'
      ])
    ).toBe(true) // > 55 chars
  })
})
