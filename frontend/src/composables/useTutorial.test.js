import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTutorial } from './useTutorial'
import { authApi } from '../api/client'

vi.mock('../api/client', () => ({
  authApi: {
    completeTutorial: vi.fn().mockResolvedValue({ success: true }),
  },
}))

const store = {}
const mockLocalStorage = {
  getItem: vi.fn((key) => store[key] || null),
  setItem: vi.fn((key, val) => { store[key] = String(val) }),
  removeItem: vi.fn((key) => { delete store[key] }),
  clear: vi.fn(() => { for (const k in store) delete store[k] }),
}
globalThis.localStorage = mockLocalStorage

describe('useTutorial Composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage.clear()
  })

  it('provides 6 steps for standard student/member users', () => {
    const { openTutorial, steps, currentStep } = useTutorial()
    openTutorial({ role: 'student', mandatory: true })

    expect(steps.value.length).toBe(6)
    expect(steps.value[0].id).toBe('home')
    expect(steps.value[1].id).toBe('schedule')
    expect(steps.value[2].id).toBe('arxiv')
    expect(steps.value[3].id).toBe('resources')
    expect(steps.value[4].id).toBe('mailbox')
    expect(steps.value[5].id).toBe('assistant')
    expect(currentStep.value.id).toBe('home')
  })

  it('provides 11 steps for administrators including admin features', () => {
    const { openTutorial, steps } = useTutorial()
    openTutorial({ role: 'admin', mandatory: false })

    expect(steps.value.length).toBe(11)
    const adminStepIds = steps.value.slice(6).map(s => s.id)
    expect(adminStepIds).toEqual([
      'admin_branding',
      'admin_members',
      'admin_invites',
      'admin_notices',
      'admin_moderation',
    ])
    expect(steps.value.slice(6).every(s => s.isAdmin === true)).toBe(true)
  })

  it('navigates through steps correctly with nextStep and prevStep', () => {
    const { openTutorial, currentStepIndex, isFirstStep, isLastStep, nextStep, prevStep } = useTutorial()
    openTutorial({ role: 'student' })

    expect(currentStepIndex.value).toBe(0)
    expect(isFirstStep.value).toBe(true)
    expect(isLastStep.value).toBe(false)

    nextStep()
    expect(currentStepIndex.value).toBe(1)
    expect(isFirstStep.value).toBe(false)

    prevStep()
    expect(currentStepIndex.value).toBe(0)
    expect(isFirstStep.value).toBe(true)
  })

  it('calculates progress percentage accurately', () => {
    const { openTutorial, currentStepIndex, progressPercent, nextStep } = useTutorial()
    openTutorial({ role: 'student' }) // 6 steps

    expect(progressPercent.value).toBe(17) // round(1/6 * 100) = 17
    nextStep()
    expect(progressPercent.value).toBe(33) // round(2/6 * 100) = 33
  })

  it('completes tutorial, calls API and updates localStorage cache', async () => {
    localStorage.setItem('labhub_user', JSON.stringify({ id: 1, tutorial_completed: false }))

    const { openTutorial, finishTutorial, showTutorial } = useTutorial()
    openTutorial({ role: 'student' })
    expect(showTutorial.value).toBe(true)

    await finishTutorial()

    expect(authApi.completeTutorial).toHaveBeenCalledTimes(1)
    expect(showTutorial.value).toBe(false)

    const updated = JSON.parse(localStorage.getItem('labhub_user'))
    expect(updated.tutorial_completed).toBe(true)
  })

  it('provides sub-steps with sidebar pinning as the initial action', () => {
    const { openTutorial, currentSubStep, currentStep } = useTutorial()
    openTutorial({ role: 'student' })

    expect(currentStep.value.id).toBe('home')
    expect(currentSubStep.value.id).toBe('home_pin_sidebar')
    expect(currentSubStep.value.targetId).toBe('tour-pin-sidebar')
    expect(currentSubStep.value.requiresClick).toBe(true)
  })

  it('traverses through sub-steps across module boundaries using nextSubStep and prevSubStep', () => {
    const { openTutorial, currentStepIndex, currentSubStepIndex, currentSubStep, nextSubStep, prevSubStep } = useTutorial()
    openTutorial({ role: 'student' })

    expect(currentStepIndex.value).toBe(0)
    expect(currentSubStepIndex.value).toBe(0)

    // Step 0 has 5 subSteps (0 to 4)
    nextSubStep()
    expect(currentSubStepIndex.value).toBe(1)
    expect(currentSubStep.value.id).toBe('home_actions')

    // Advance to end of step 0
    nextSubStep() // 2: marquee
    nextSubStep() // 3: week
    nextSubStep() // 4: next meeting
    expect(currentSubStepIndex.value).toBe(4)

    // Crossing boundary to step 1 (schedule)
    nextSubStep()
    expect(currentStepIndex.value).toBe(1)
    expect(currentSubStepIndex.value).toBe(0)
    expect(currentSubStep.value.id).toBe('schedule_nav')

    // Go back across boundary
    prevSubStep()
    expect(currentStepIndex.value).toBe(0)
    expect(currentSubStepIndex.value).toBe(4)
  })

  it('allows skipping the tutorial anytime via skipTutorial', async () => {
    const { openTutorial, skipTutorial, showTutorial } = useTutorial()
    openTutorial({ role: 'student' })
    expect(showTutorial.value).toBe(true)

    await skipTutorial()
    expect(showTutorial.value).toBe(false)
    expect(authApi.completeTutorial).toHaveBeenCalledTimes(1)
  })
})

