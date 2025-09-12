// cvModule.js - restore classifyPointVisual if missing (after previous refactors)
(function(){
  if(typeof classifyPointVisual !== 'undefined') return; // already defined
  function getCalibration(metric, sex, file){
    try{return JSON.parse(localStorage.getItem('calib_'+metric+'_'+sex+'_'+file));}catch(_){return null;}
  }
  function canvasYToValueY(metric, sex, file, canvasY){
    const cal = getCalibration(metric, sex, file); if(!cal) return null;
    const { axis, points } = cal; const { origin, yMax } = points;
    const ySpan = axis.ymax - axis.ymin || 1;
    const yDir = (yMax.y >= origin.y)? 1 : -1; // usually -1
    const pxPerY = Math.abs(yMax.y - origin.y) / ySpan;
    return axis.ymin + (canvasY - origin.y) / (pxPerY * yDir);
  }
  function detectLinesAtX(canvas, x){
    const w=canvas.width,h=canvas.height; const ctx=canvas.getContext('2d');
    const half=6; const sx=Math.max(0, Math.min(w-1, Math.round(x)))-half; const sw=Math.min(w - Math.max(0,sx), half*2+1);
    const img=ctx.getImageData(Math.max(0,sx),0,sw,h).data; const lum=new Float32Array(h);
    for(let y=0;y<h;y++){ let acc=0; for(let dx=0;dx<sw;dx++){ const idx=(y*sw+dx)*4; const r=img[idx],g=img[idx+1],b=img[idx+2]; acc+=0.299*r+0.587*g+0.114*b;} lum[y]=acc/sw; }
    // simple gradient
    const grad=new Float32Array(h); for(let y=1;y<h-1;y++){ grad[y]=Math.abs(lum[y+1]-lum[y-1]); }
    const sorted=Array.from(grad).sort((a,b)=>a-b); const thr=sorted[Math.floor(sorted.length*0.9)]||0; const peaks=[];
    for(let y=2;y<h-2;y++){ const g=grad[y]; if(g<thr) continue; if(g>=grad[y-1] && g>=grad[y+1]) peaks.push({y, g}); }
    peaks.sort((a,b)=>b.g-a.g); const chosen=[]; for(const p of peaks){ if(chosen.every(c=>Math.abs(c.y-p.y)>6)) chosen.push(p); if(chosen.length>12) break; }
    chosen.sort((a,b)=>a.y-b.y); return chosen.map(p=>p.y);
  }
  function getPercentileLabelsForCount(n){
    const maps={9:[3,5,10,25,50,75,90,95,97],7:[5,10,25,50,75,90,95],5:[10,25,50,75,90],3:[5,50,95]};
    return maps[n]||null;
  }
  function expectedPercentilesFor(metric){
    if(metric==='weightForStature') return [5,10,25,50,75,90,95];
    return [3,5,10,25,50,75,90,95,97];
  }
  window.classifyPointVisual = async function(pt){
    if(!window.currentPdf || !currentPdf.pages || !currentPdf.pages.length) return null;
    const page = currentPdf.pages[0];
    if(typeof mapValueToCanvas !== 'function') return null;
    const mapped = mapValueToCanvas(pt.metric, pt.sex, pt.pdfFile, pt.xValue, pt.yValue);
    if(!mapped) return null; const x=mapped.x,y=mapped.y;
    const ys = detectLinesAtX(page.canvas,x) || [];
    if(!ys.length) return { type:'unknown' };
    const lineVals = ys.map(yy=>canvasYToValueY(pt.metric, pt.sex, pt.pdfFile, yy)).filter(v=>v!=null);
    let labels = getPercentileLabelsForCount(lineVals.length);
    if(!labels){ const exp=expectedPercentilesFor(pt.metric); labels = exp.slice(0, Math.min(exp.length,lineVals.length)); }
    // nearest line
    let minDist=Infinity, idx=-1; for(let i=0;i<ys.length;i++){ const d=Math.abs(ys[i]-y); if(d<minDist){minDist=d; idx=i;} }
    if(minDist<=6){
      let pct = labels && labels[idx];
      try{ if(pt.metric!=='weightForStature' && window.GrowthLMS){ const {percentile:lp}=GrowthLMS.computeZ(pt.metric, pt.sex, pt.ageMonths, pt.yValue)||{}; if(lp!=null){ const cands=expectedPercentilesFor(pt.metric); pct=cands.reduce((a,b)=>Math.abs(b-lp)<Math.abs(a-lp)?b:a,cands[0]); } } }catch(_){ }
      return { type:'at', percentile:pct };
    }
    const val=pt.yValue;
    for(let i=0;i<lineVals.length-1;i++){ const a=lineVals[i], b=lineVals[i+1]; const lo=Math.min(a,b), hi=Math.max(a,b); if(val>=lo && val<=hi){ return { type:'between', lower: labels && labels[i], upper: labels && labels[i+1] }; }}
    return { type:'unknown' };
  };
  console.log('[cvModule] classifyPointVisual shim installed');
})();
