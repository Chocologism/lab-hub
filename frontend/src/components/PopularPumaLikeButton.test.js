import { describe, it, expect } from 'vitest'
import PopularPumaLikeButton from './PopularPumaLikeButton.vue'

describe('PopularPumaLikeButton component', () => {
  it('defines props correctly including size and compact', () => {
    expect(PopularPumaLikeButton).toBeDefined()
    expect(PopularPumaLikeButton.props).toBeDefined()
    expect(PopularPumaLikeButton.props.liked).toBeDefined()
    expect(PopularPumaLikeButton.props.count).toBeDefined()
    expect(PopularPumaLikeButton.props.disabled).toBeDefined()
    expect(PopularPumaLikeButton.props.label).toBeDefined()
    expect(PopularPumaLikeButton.props.size).toBeDefined()
    expect(PopularPumaLikeButton.props.compact).toBeDefined()
    expect(PopularPumaLikeButton.props.title).toBeDefined()
  })

  it('has default props matching expected values', () => {
    expect(PopularPumaLikeButton.props.label.default).toBe('赞')
    expect(PopularPumaLikeButton.props.size.default).toBe('medium')
    expect(PopularPumaLikeButton.props.compact.default).toBe(false)
    expect(PopularPumaLikeButton.props.count.default).toBe(0)
    expect(PopularPumaLikeButton.props.liked.default).toBe(false)
  })
})
