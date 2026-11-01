import { COLORS } from './types'

export type ProjectedRisk = { x:number; y:number; score:number }
const rgb = COLORS.map(color => [1,3,5].map(i => parseInt(color.slice(i,i+2),16)))

/** Categorical risk field: overlapping samples keep the higher risk, never an
 * order-dependent blend that can make severe weather look moderate. */
export function riskRaster(points:ProjectedRisk[], width:number, height:number, radius:number, cellSize=6) {
  const columns=Math.ceil(width/cellSize), rows=Math.ceil(height/cellSize)
  const scores=new Int8Array(columns*rows).fill(-1)
  const strength=new Float32Array(columns*rows)
  for(const point of points){
    const minX=Math.max(0,Math.floor((point.x-radius)/cellSize))
    const maxX=Math.min(columns-1,Math.ceil((point.x+radius)/cellSize))
    const minY=Math.max(0,Math.floor((point.y-radius)/cellSize))
    const maxY=Math.min(rows-1,Math.ceil((point.y+radius)/cellSize))
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const distance=Math.hypot((x+.5)*cellSize-point.x,(y+.5)*cellSize-point.y)/radius
      if(distance>=1)continue
      const index=y*columns+x, alpha=Math.pow(1-distance,1.3)*.5
      if(point.score>scores[index]){scores[index]=point.score;strength[index]=alpha}
      else if(point.score===scores[index])strength[index]=Math.max(strength[index],alpha)
    }
  }
  const pixels=new Uint8ClampedArray(columns*rows*4)
  for(let i=0;i<scores.length;i++)if(scores[i]>=0){
    pixels.set(rgb[scores[i]],i*4)
    pixels[i*4+3]=Math.round(strength[i]*255)
  }
  return {pixels,columns,rows}
}
