import { expect,it } from 'vitest'
import type { Checkpoint } from './types'
import { thinCheckpoints } from './markers'
it('thins overlapping low checkpoints while keeping every higher risk and the destination',()=>{
  const points=[0,0,1,2,3,4,0,0].map((score,i)=>({id:String(i),risk:{score},lon:i,lat:0}) as Checkpoint)
  const visible=thinCheckpoints(points,p=>({x:p.lon,y:0}))
  expect(visible.map(p=>p.id)).toEqual(['0','2','3','4','5','7'])
})
it('reveals more low checkpoints when zoom spreads them apart',()=>{
  const points=[0,1,2,3].map(i=>({id:String(i),risk:{score:0},lon:i,lat:0}) as Checkpoint)
  expect(thinCheckpoints(points,p=>({x:p.lon*40,y:0}))).toHaveLength(4)
})
