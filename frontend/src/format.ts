export function riskMiles(value:number) {
  if(value>0 && value<.1)return '<0.1'
  return value.toLocaleString(undefined,{maximumFractionDigits:1})
}

export function travelTime(seconds:number) {
  const minutes=Math.round(seconds/60)
  return `${Math.floor(minutes/60)}h ${minutes%60}m`
}
