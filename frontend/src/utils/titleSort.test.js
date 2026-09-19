import { describe, it, expect } from 'vitest'
import { cleanTitleForSort, compareTitle } from './titleSort'

describe('titleSort utility', () => {
  it('cleans leading punctuation, quotes, brackets, and math symbols', () => {
    expect(cleanTitleForSort('《高等数学》')).toBe('高等数学》')
    expect(cleanTitleForSort('“天体物理学”')).toBe('天体物理学”')
    expect(cleanTitleForSort('  $E=mc^2$ 导论')).toBe('E=mc^2$ 导论')
    expect(cleanTitleForSort(null)).toBe('')
    expect(cleanTitleForSort(undefined)).toBe('')
  })

  it('sorts Chinese titles by Pinyin first letter', () => {
    const list = ['清华大学', '北京天文台', '阿坝观测站', '高等数学']
    list.sort(compareTitle)
    expect(list).toEqual(['阿坝观测站', '北京天文台', '高等数学', '清华大学'])
  })

  it('sorts English titles alphabetically and case-insensitively', () => {
    const list = ['Cosmology', 'astrophysics', 'Galaxy', 'Black Hole']
    list.sort(compareTitle)
    expect(list).toEqual(['astrophysics', 'Black Hole', 'Cosmology', 'Galaxy'])
  })

  it('sorts numbers naturally', () => {
    const list = ['第10讲', '第2讲', '第1讲']
    list.sort(compareTitle)
    expect(list).toEqual(['第1讲', '第2讲', '第10讲'])
  })

  it('handles brackets properly without letting brackets affect sort order', () => {
    const list = ['《高等数学》', '北京天文台', '《阿凡达》']
    list.sort(compareTitle)
    expect(list).toEqual(['《阿凡达》', '北京天文台', '《高等数学》'])
  })

  it('places empty or null titles at the end', () => {
    const list = ['宇宙学', null, '', '天文学', undefined]
    list.sort(compareTitle)
    expect(list.slice(0, 2)).toEqual(['天文学', '宇宙学'])
  })
})
