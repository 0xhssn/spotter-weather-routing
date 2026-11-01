import { Temporal } from '@js-temporal/polyfill'

export const originZone=(zone?:string)=>zone || 'America/Los_Angeles'
export function localInput(instant:Date|string, zone:string) {
  return Temporal.Instant.from(instant instanceof Date?instant.toISOString():instant).toZonedDateTimeISO(zone).toPlainDateTime().toString({smallestUnit:'minute'})
}
export function departureISO(value:string, zone:string) {
  try {
    return Temporal.PlainDateTime.from(value).toZonedDateTime(zone,{disambiguation:'reject'}).toInstant().toString()
  } catch {
    throw new Error('Choose a valid, unambiguous departure time at the origin. This time may be skipped or repeated by daylight saving; choose another time.')
  }
}
export function zoneLabel(instant:string|Date, zone:string) {
  const date=instant instanceof Date?instant:new Date(instant)
  return new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'short'}).formatToParts(date).find(p=>p.type==='timeZoneName')?.value || zone
}
export function tripTime(value:string, zone:string) {
  const rounded=new Date(Math.round(new Date(value).getTime()/60000)*60000)
  return rounded.toLocaleTimeString('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit',timeZoneName:'short'})
}
export function tripDate(value:string|Date, zone:string) {
  return new Date(Math.round(new Date(value).getTime()/60000)*60000).toLocaleDateString('en-US',{timeZone:zone,month:'short',day:'numeric'})
}
// Keep all result timestamps in the origin's time zone, including next-day arrivals.
export function dateTime(value:string, zone:string) {
  return `${tripDate(value,zone)}, ${tripTime(value,zone)}`
}
export function displayedArrival(departure:string, seconds:number) {
  return new Date(Math.round(new Date(departure).getTime()/60000)*60000+Math.round(seconds/60)*60000).toISOString()
}
