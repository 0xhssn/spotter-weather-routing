// Read-only browser-console audit. Check screenshots too: image-backed and translucent content need visual review.
(() => { const rgba = s => { const v = (s.match(/[\d.]+/g) || []).map(v => +v); return [v[0] || 0, v[1] || 0, v[2] || 0, v[3] ?? 1]; }; const blend = (a, b) => a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3])); const lum = c => { const v = c.map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; }; const small = [], faint = [], clipped = []; let count = 0; for (const el of document.querySelectorAll('body *')) {
    if (el.closest('script,style,.sr-only,.leaflet-tile-pane,svg') || !el.getClientRects().length)
        continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || +cs.opacity === 0)
        continue;
    const isInput = el.matches('input:not([type=checkbox]):not([type=range])');
    if (!isInput && ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
        continue;
    const text = (isInput ? el.value : el.textContent).trim().slice(0, 65);
    if (!text)
        continue;
    count++;
    const size = +cs.fontSize.replace("px", "");
    const exception = !!el.closest('.eyebrow,.product-label,.data-tag,.route-number,.leaflet-control-attribution');
    if (size < 12 && !(exception && size >= 11))
        small.push({ selector: el.className || el.tagName, text, size });
    const parents = [];
    for (let p = el; p; p = p.parentElement)
        parents.unshift(p);
    let bg = [255, 255, 255], opacity = 1;
    for (const p of parents) {
        const s = getComputedStyle(p);
        bg = blend(rgba(s.backgroundColor), bg);
        opacity *= +s.opacity;
    }
    const fg = rgba(cs.color);
    fg[3] *= opacity;
    const a = lum(blend(fg, bg)), b = lum(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    if (ratio < 4.5)
        faint.push({ selector: el.className || el.tagName, text, ratio: +ratio.toFixed(2) });
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && !el.closest('.checkpoint-table') && !el.matches('.via,input'))
        clipped.push({ selector: el.className || el.tagName, text, extra: el.scrollWidth - el.clientWidth });
} return { width: document.documentElement.clientWidth, root: getComputedStyle(document.documentElement).fontSize, fontStatus: document.fonts?.status, count, small, faint, clipped, bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, columns: getComputedStyle(document.querySelector('.route-cards')).gridTemplateColumns, badge: document.querySelector('.recommended-tag') ? getComputedStyle(document.querySelector('.recommended-tag')).fontSize : null, inputs: [...document.querySelectorAll('.input-icon input,input[type=datetime-local],.weight-input input')].map(e => getComputedStyle(e).fontSize) }; })();
