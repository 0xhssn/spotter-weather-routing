import { expect, it } from 'vitest'
import { riskMiles } from './format'

it('never displays positive risk mileage as zero', () => {
  expect(riskMiles(.01)).toBe('<0.1')
  expect(riskMiles(.4)).toBe('0.4')
  expect(riskMiles(0)).toBe('0')
})
