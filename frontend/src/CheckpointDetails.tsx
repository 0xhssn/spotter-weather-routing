import type { Checkpoint, Route } from './types'
import { dateTime } from './time'
export function CheckpointDetails({checkpoint,route,zone}:{checkpoint:Checkpoint;route:Route;zone:string}) {
  const weather=checkpoint.weather
  return <article className="checkpoint-card"><span className="eyebrow">{route.name} · MILE {checkpoint.mile.toFixed(1)}</span><h3 className="risk-text" data-risk-score={checkpoint.risk.score}>{checkpoint.risk.level}</h3><p>Arrival {dateTime(checkpoint.eta,zone)}</p><dl className="weather-values"><div><dt>Wind</dt><dd>{weather.wind_mph.toFixed(1)} mph</dd></div><div><dt>Gust</dt><dd>{weather.gust_mph.toFixed(1)} mph</dd></div><div><dt>Rain</dt><dd>{weather.rain_in.toFixed(2)} in/hr</dd></div><div><dt>Snow</dt><dd>{weather.snow_in.toFixed(2)} in/hr</dd></div></dl><p className="checkpoint-why"><strong>Why</strong> {checkpoint.risk.reasons.join(' · ')||'Below all risk thresholds'}</p></article>
}
