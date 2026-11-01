import { useEffect, useId, useRef, useState } from 'react'
import { MapPin, Search, LoaderCircle } from 'lucide-react'
import { api } from './api'
import type { Place } from './types'

export function PlaceSearch({label,value,onChange}:{label:string;value:Place|null;onChange:(p:Place|null)=>void}) {
  const [text,setText] = useState(value?.label ?? '')
  const [results,setResults] = useState<Place[]>([])
  const [open,setOpen] = useState(false)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [active,setActive] = useState(-1)
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const editing = useRef(false)
  useEffect(()=>{
    if(value || !editing.current) setText(value?.label ?? '')
    editing.current=false
    setError('');setActive(-1);setOpen(false)
  },[value])
  useEffect(()=>{
    const close=(event:MouseEvent)=>{if (!ref.current?.contains(event.target as Node)) setOpen(false)}
    document.addEventListener('mousedown',close)
    return ()=>document.removeEventListener('mousedown',close)
  },[])
  useEffect(()=>{
    if (text.length<2 || value?.label===text) {setResults([]);setLoading(false);setError('');return}
    const controller = new AbortController()
    const timer = setTimeout(()=>{
      setLoading(true);setError('')
      api<{results:Place[]}>(`/api/places?q=${encodeURIComponent(text)}`,{signal:controller.signal})
        .then(data=>{if(!controller.signal.aborted){setResults(data.results);setActive(-1);setOpen(true)}})
        .catch(error=>{if(!controller.signal.aborted && error.name!=='AbortError') setError('City search is unavailable. Try again shortly.')})
        .finally(()=>{if(!controller.signal.aborted) setLoading(false)})
    },350)
    return ()=>{clearTimeout(timer);controller.abort()}
  },[text,value])
  const select=(place:Place)=>{editing.current=false;onChange(place);setText(place.label);setOpen(false);setActive(-1);setError('')}
  return <div className="place-field" ref={ref}>
    <label htmlFor={id}>{label}</label>
    <div className="input-icon"><MapPin size={16}/><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && results.length>0} aria-controls={open && results.length?`${id}-results`:undefined} aria-activedescendant={open && results[active]?`${id}-${active}`:undefined} value={text} placeholder="Search a city or postal code" autoComplete="off"
      onFocus={()=>{if(results.length) setOpen(true)}}
      onChange={e=>{editing.current=true;setText(e.target.value);setResults([]);setActive(-1);setError('');onChange(null);setOpen(true)}}
      onKeyDown={e=>{
        if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,results.length-1))}
        if(e.key==='ArrowUp' && results.length){e.preventDefault();setActive(i=>Math.max(0,i-1))}
        if(e.key==='Escape')setOpen(false)
        if(e.key==='Enter' && open){e.preventDefault();if(results[active])select(results[active])}
      }}/>{loading?<LoaderCircle size={15} className="spin"/>:<Search size={14}/>}</div>
    {open && results.length>0 && <ul className="place-results" id={`${id}-results`} role="listbox">{results.map((p,i)=><li key={`${p.lat}-${p.lon}`} id={`${id}-${i}`} role="option" aria-selected={i===active}><button type="button" className={i===active?'active':''} onClick={()=>select(p)}><MapPin size={14}/>{p.label}</button></li>)}</ul>}
    {error && <small className="field-error">{error}</small>}
    {open && !loading && !error && text.length>1 && !value && results.length===0 && <small className="field-hint">Choose a city from the search results.</small>}
  </div>
}
