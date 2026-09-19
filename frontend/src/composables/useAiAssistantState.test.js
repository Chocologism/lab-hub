import { describe, it, expect, beforeEach } from 'vitest'
import { isAiGeneratingGlobally } from './useAiAssistantState'

describe('useAiAssistantState', () => {
  beforeEach(() => {
    isAiGeneratingGlobally.value = false
  })

  it('initializes with false', () => {
    expect(isAiGeneratingGlobally.value).toBe(false)
  })

  it('updates state reactively', () => {
    isAiGeneratingGlobally.value = true
    expect(isAiGeneratingGlobally.value).toBe(true)
    isAiGeneratingGlobally.value = false
    expect(isAiGeneratingGlobally.value).toBe(false)
  })
})
