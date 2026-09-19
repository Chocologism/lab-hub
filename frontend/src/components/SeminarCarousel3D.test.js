import { describe, it, expect } from 'vitest'
import SeminarCarousel3D from './SeminarCarousel3D.vue'
import ScheduleOverview from './ScheduleOverview.vue'

describe('SeminarCarousel3D and ScheduleOverview target navigation props', () => {
  it('SeminarCarousel3D defines targetIndex and disableAutoReset props', () => {
    expect(SeminarCarousel3D.props).toBeDefined()
    expect(SeminarCarousel3D.props.targetIndex).toBeDefined()
    expect(SeminarCarousel3D.props.targetIndex.default).toBe(-1)
    expect(SeminarCarousel3D.props.disableAutoReset).toBeDefined()
    expect(SeminarCarousel3D.props.disableAutoReset.default).toBe(false)
  })

  it('ScheduleOverview defines targetSeminarId and disableAutoReset props', () => {
    expect(ScheduleOverview.props).toBeDefined()
    expect(ScheduleOverview.props.targetSeminarId).toBeDefined()
    expect(ScheduleOverview.props.targetSeminarId.default).toBe(null)
    expect(ScheduleOverview.props.disableAutoReset).toBeDefined()
    expect(ScheduleOverview.props.disableAutoReset.default).toBe(false)
  })
})
