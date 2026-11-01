import { expect, it } from 'vitest'
import { riskRaster } from './heatmap'

it('keeps No Travel color regardless of the order of overlapping lower risk samples', () => {
  const low={x:30,y:30,score:0}, blocked={...low,score:4}
  const first=riskRaster([blocked,low],60,60,30)
  const second=riskRaster([low,blocked],60,60,30)
  expect(first.pixels).toEqual(second.pixels)
  const index=(5*first.columns+5)*4
  expect(Array.from(first.pixels.slice(index,index+3))).toEqual([0x91,0x38,0x54])
})

it('leaves areas outside the trip corridor transparent', () => {
  const {pixels}=riskRaster([{x:5,y:5,score:4}],100,100,10)
  expect(pixels.slice(-4)).toEqual(new Uint8ClampedArray(4))
})

it('makes low risk nearly transparent and dangerous areas stronger and larger',()=>{
  const low=riskRaster([{x:33,y:33,score:0}],100,100,30)
  const blocked=riskRaster([{x:33,y:33,score:4}],100,100,30)
  const center=(5*blocked.columns+5)*4+3
  expect(low.pixels[center]).toBeLessThanOrEqual(12)
  expect(blocked.pixels[center]).toBeGreaterThanOrEqual(200)
  const count=(pixels:Uint8ClampedArray)=>Array.from(pixels).filter((n,i)=>i%4===3&&n>0).length
  expect(count(blocked.pixels)).toBeGreaterThan(count(low.pixels))
})
