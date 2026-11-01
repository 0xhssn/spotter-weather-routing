import type { Checkpoint } from './types'
export function thinCheckpoints(checkpoints:Checkpoint[],project:(point:Checkpoint)=>{x:number;y:number},minimum=28) {
  let last:{x:number;y:number}|null=null
  return checkpoints.filter((point,index)=>{
    const pixel=project(point)
    const show=point.risk.score>=1||index===0||index===checkpoints.length-1||!last||Math.hypot(pixel.x-last.x,pixel.y-last.y)>minimum
    if(show)last=pixel
    return show
  })
}
