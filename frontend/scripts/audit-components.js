/* Read-only browser console audit from the UI brief, with no dependencies.
   Run at 390, 768 and 1280 px in example, live, loading, error and car states.
   Expected: [] (all main-column copy belongs to a visible component). */
(() => {
  const page=new Set([document.body,document.documentElement,document.getElementById('root'),
    document.querySelector('.app-shell'),document.querySelector('.workspace'),document.querySelector('main')].filter(Boolean))
  const isSurface=element=>{
    const style=getComputedStyle(element)
    const background=!/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor)
    const border=['Top','Right','Bottom','Left'].filter(side=>parseFloat(style[`border${side}Width`])>0).length>=3
    return background||border||style.boxShadow!=='none'
  }
  const loose=[],seen=new Set()
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.textContent.trim()?1:2})
  while(walker.nextNode()){
    const element=walker.currentNode.parentElement
    if(!element||seen.has(element)||!element.getClientRects().length)continue
    if(element.closest('.leaflet-container,.sr-only,header,aside'))continue
    seen.add(element)
    let surface=element
    while(surface&&!page.has(surface)&&!isSurface(surface))surface=surface.parentElement
    if(!surface||page.has(surface))loose.push(element.textContent.trim().replace(/\s+/g,' ').slice(0,60))
  }
  return loose
})()
