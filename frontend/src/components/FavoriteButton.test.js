import { describe, it, expect } from 'vitest'
import FavoriteButton from './FavoriteButton.vue'

describe('FavoriteButton component', () => {
  it('defines props correctly including kind, target, count and variant', () => {
    expect(FavoriteButton).toBeDefined()
    expect(FavoriteButton.props).toBeDefined()
    expect(FavoriteButton.props.kind).toBeDefined()
    expect(FavoriteButton.props.target).toBeDefined()
    expect(FavoriteButton.props.count).toBeDefined()
    expect(FavoriteButton.props.variant).toBeDefined()
  })

  it('has default props matching expected values', () => {
    expect(FavoriteButton.props.variant.default).toBe('button')
    expect(FavoriteButton.props.count.default).toBeUndefined()
  })
})
