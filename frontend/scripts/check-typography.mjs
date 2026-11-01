import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const tokens=new Map()
postcss.parse(fs.readFileSync('src/tokens.css','utf8')).walkDecls(/^--text-/,decl=>{
  if(/^\d*\.?\d+rem$/.test(decl.value))tokens.set(decl.prop,parseFloat(decl.value)*16)
})
const exceptions=new Set(['.eyebrow','.product-label','.data-tag','.route-number','.route-map .leaflet-control-attribution'])
const base=new Map(),responsive=[]
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)])}
let count=0
for(const file of files('src').filter(file=>file.endsWith('.css')&&!file.endsWith('tokens.css'))){
  postcss.parse(fs.readFileSync(file,'utf8'),{from:file}).walkDecls(decl=>{
    if(decl.prop==='font')assert.equal(decl.value,'inherit',`${file}: use type tokens instead of a font shorthand`)
    if(decl.prop!=='font-size')return
    count++
    const token=/^var\((--text-[\w-]+)\)$/.exec(decl.value)?.[1]
    assert(token&&tokens.has(token),`${file}:${decl.source.start.line}: font-size must use a shared rem token`)
    assert(!decl.important,`${file}: font-size must not use !important`)
    const size=tokens.get(token),selectors=decl.parent.selector.split(',').map(selector=>selector.trim())
    let isResponsive=false
    for(let parent=decl.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&['media','container'].includes(parent.name))isResponsive=true
    for(const selector of selectors){
      assert(size>=12||(size===11&&exceptions.has(selector)),`${selector}: supporting text must be at least 12px at the default root size`)
      if(isResponsive)responsive.push({selector,size})
      else base.set(selector,Math.max(base.get(selector)||0,size))
    }
  })
}
for(const {selector,size} of responsive)assert(size>=(base.get(selector)||0),`${selector}: responsive rules must not shrink text below its base size`)
console.log(`Typography check passed: ${count} token-based sizes; no shrinking responsive text.`)
