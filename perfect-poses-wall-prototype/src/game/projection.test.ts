import { describe, expect, it } from 'vitest'
import { linearApproachScale } from './projection'

describe('linearApproachScale', () => {
  it('starts at 34% and reaches 100%', () => {
    expect(linearApproachScale(0)).toBeCloseTo(0.34)
    expect(linearApproachScale(1)).toBeCloseTo(1)
  })

  it('grows by the same amount over equal time intervals', () => {
    const first = linearApproachScale(0.25) - linearApproachScale(0)
    const second = linearApproachScale(0.5) - linearApproachScale(0.25)
    const third = linearApproachScale(0.75) - linearApproachScale(0.5)
    expect(first).toBeCloseTo(second)
    expect(second).toBeCloseTo(third)
  })
})
