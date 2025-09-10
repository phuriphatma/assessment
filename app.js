// Growth Chart Plotter App
// Uses PDF.js to render local PDF charts and overlays points via calibrated coordinate transforms.

const PDF_FILES = {
  boys: {
    headCircumference: 'Head-circumference_Boys.pdf',
    weightForAge_under2: 'Weight-and-length_Boys_0-2-years.pdf',
    statureForAge_under2: 'Weight-and-length_Boys_0-2-years.pdf',
    weightForAge_2to19: 'Weight-and-height_Boys_2-19-years.pdf',
    statureForAge_2to19: 'Weight-and-height_Boys_2-19-years.pdf',
    weightForStature: 'Weight-for-height_Boys.pdf'
  },
  girls: {
    headCircumference: 'Head-circumference_Girls.pdf',
    weightForAge_under2: 'Weight-and-length_Girls_0-2-years.pdf',
    statureForAge_under2: 'Weight-and-length_Girls_0-2-years.pdf',
    weightForAge_2to19: 'Weight-and-height_Girls_2-19-years.pdf',
    statureForAge_2to19: 'Weight-and-height_Girls_2-19-years.pdf',
    weightForStature: 'Weight-for-height_Girls.pdf'
  }
};

// Calibration storage key
const CAL_KEY = 'growthChartCalibrations_v1';
let calibrations = JSON.parse(localStorage.getItem(CAL_KEY) || '{}');

// Each calibration: { pdfFile, metric, sex, axis: { xmin,xmax,ymin,ymax }, points: { origin:{x,y}, xMax:{x,y}, yMax:{x,y} } }
// We produce linear mapping.

function saveCals(){
  localStorage.setItem(CAL_KEY, JSON.stringify(calibrations));
}

function getCalibration(metric, sex, pdfFile){
  return calibrations[`${sex}_${metric}_${pdfFile}`];
}

function setCalibration(metric, sex, pdfFile, data){
  calibrations[`${sex}_${metric}_${pdfFile}`] = data;
  saveCals();
}

// PDF rendering
let pdfjsLoadPromise = null;
function ensurePdfjsLoaded(){
  if(typeof pdfjsLib !== 'undefined') return Promise.resolve();
  if(pdfjsLoadPromise) return pdfjsLoadPromise;
  const localModulePath = './pdfjs/pdf.mjs';
  const localWorkerPath = './pdfjs/pdf.worker.mjs';
  const localUmdPath = './pdfjs/pdf.js';
  const localUmdWorker = './pdfjs/pdf.worker.js';
  const cdnVersion = '4.2.67';

  const cdnCore = [
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${cdnVersion}/pdf.min.js`,
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${cdnVersion}/build/pdf.min.js`,
    `https://unpkg.com/pdfjs-dist@${cdnVersion}/build/pdf.min.js`
  ];
  const cdnWorkers = [
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${cdnVersion}/pdf.worker.min.js`,
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${cdnVersion}/build/pdf.worker.min.js`,
    `https://unpkg.com/pdfjs-dist@${cdnVersion}/build/pdf.worker.min.js`
  ];
  pdfjsLoadPromise = (async ()=>{
    // Try local UMD (pdf.js)
    try {
      await new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.src = localUmdPath;
        s.onload = ()=> window.pdfjsLib ? resolve() : reject(new Error('Local UMD loaded without pdfjsLib'));
        s.onerror = ()=> reject(new Error('Local UMD not found'));
        document.head.appendChild(s);
      });
      if(window.pdfjsLib){
        try { pdfjsLib.GlobalWorkerOptions.workerSrc = localUmdWorker; } catch(_) {}
        return;
      }
    } catch(_) { /* ignore */ }
    // Try local ESM next
    try {
      const mod = await import(localModulePath);
      if(mod && (mod.getDocument || mod.GlobalWorkerOptions)){
        window.pdfjsLib = mod;
        if(!pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions = { workerSrc: localWorkerPath }; else pdfjsLib.GlobalWorkerOptions.workerSrc = localWorkerPath;
        return;
      }
    } catch(_) { /* ignore */ }
    // Fallback to CDN sequential loading
    for(let i=0;i<cdnCore.length;i++){
      try {
        await new Promise((resolve,reject)=>{
          const s = document.createElement('script');
            s.src = cdnCore[i];
            s.onload = ()=>{ if(window.pdfjsLib){ try{ pdfjsLib.GlobalWorkerOptions.workerSrc = cdnWorkers[i]; }catch(_){} resolve(); } else reject(new Error('No global pdfjsLib after load')); };
            s.onerror = ()=> reject(new Error('Failed '+cdnCore[i]));
            document.head.appendChild(s);
        });
        if(typeof pdfjsLib !== 'undefined') return;
      } catch(e){ /* try next */ }
    }
    // Diagnostics: probe local paths
    const diag = [];
    async function probe(path){
      try { const r = await fetch(path, {method:'HEAD'}); diag.push(`${path}: ${r.status}`); }
      catch(e){ diag.push(`${path}: fetch error`); }
    }
    await probe('./pdfjs/pdf.js');
    await probe('./pdfjs/pdf.worker.js');
    await probe('./pdfjs/pdf.mjs');
    await probe('./pdfjs/pdf.worker.mjs');
    const detail = diag.join(' | ');
    throw new Error('pdf.js failed to load from local or CDN. Probes => '+detail);
  })();
  return pdfjsLoadPromise;
}
const pdfViewportContainer = document.getElementById('pdfViewportContainer');
const chartTabsEl = document.getElementById('chartTabs');
let currentPdf = null; // { pdfFile, pages:[ { canvas, overlay, page } ] }
let activeMetricTabs = [];
let calibrateState = null; // { step, metric, sex, pdfFile, temp: {axisValues, pointsCollected} }
let highlightCV = false;
function cvLogWrite(obj){
  const box = document.getElementById('cvLog');
  if(!box) return;
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ${typeof obj==='string'? obj : JSON.stringify(obj)}\n`;
  box.textContent += line;
  box.scrollTop = box.scrollHeight;
}
// Suggested default axis ranges
const DEFAULT_AXIS = {
  headCircumference: { xmin:0, xmax:36, ymin:30, ymax:55 },
  weightForAge_under2: { xmin:0, xmax:24, ymin:2, ymax:16 },
  weightForAge_2to19: { xmin:24, xmax:240, ymin:10, ymax:100 },
  statureForAge_under2: { xmin:0, xmax:24, ymin:45, ymax:100 },
  statureForAge_2to19: { xmin:24, xmax:240, ymin:75, ymax:190 },
  weightForStature: { xmin:65, xmax:120, ymin:5, ymax:30 }
};

function ageToMonths(years, months, days){
  return years*12 + months + days/30.4375; // average length of month
}

function pickPdfForMetric(metric, sex, ageMonths){
  if(metric === 'headCircumference') return PDF_FILES[sex].headCircumference;
  if(metric === 'weightForStature') return PDF_FILES[sex].weightForStature;
  const under2 = ageMonths < 24;
  if(metric === 'weightForAge') return under2? PDF_FILES[sex].weightForAge_under2 : PDF_FILES[sex].weightForAge_2to19;
  if(metric === 'statureForAge') return under2? PDF_FILES[sex].statureForAge_under2 : PDF_FILES[sex].statureForAge_2to19;
  return null;
}

async function loadPdfIfNeeded(pdfFile){
  if(currentPdf && currentPdf.pdfFile === pdfFile) return currentPdf;
  pdfViewportContainer.innerHTML = '';
  const loadingDiv = document.createElement('div');
  loadingDiv.style.padding = '0.5rem';
  loadingDiv.textContent = `Loading ${pdfFile} ...`;
  pdfViewportContainer.appendChild(loadingDiv);
  try {
    await ensurePdfjsLoaded();
    const loadingTask = pdfjsLib.getDocument(pdfFile);
    const pdf = await loadingTask.promise;
    const pages = [];
    pdfViewportContainer.innerHTML = '';
    for(let pageNum=1; pageNum<=pdf.numPages; pageNum++){
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.2 });
      const wrap = document.createElement('div');
      wrap.className = 'pdf-canvas-wrap';
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const overlay = document.createElement('div');
      overlay.className = 'overlay-layer';
      overlay.style.width = viewport.width+'px';
      overlay.style.height = viewport.height+'px';
      wrap.appendChild(canvas);
      wrap.appendChild(overlay);
      pdfViewportContainer.appendChild(wrap);
      pages.push({ canvas, overlay, page, viewport });
    }
    currentPdf = { pdfFile, pages };
  // Enable hover preview if requested
  enableCvHoverPreview(highlightCV);
    return currentPdf;
  } catch(err){
    console.error('PDF load error', err);
    pdfViewportContainer.innerHTML = `<div class=\"notice\" style=\"color:#ffa657\">Failed to load PDF: ${pdfFile}<br>${err.message}</div>`;
    return null;
  }
}

function buildTabs(metrics, pdfFile){
  chartTabsEl.innerHTML='';
  metrics.forEach(m=>{
    const btn = document.createElement('button');
    btn.textContent = m;
    btn.dataset.metric=m;
    btn.className = 'tab-btn'+(m===metrics[0]?' active':'');
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.chart-tabs button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      redrawPoints();
    });
    chartTabsEl.appendChild(btn);
  });
}

function getActiveTabMetric(){
  const btn = chartTabsEl.querySelector('button.active');
  return btn? btn.dataset.metric : null;
}

function mapValueToCanvas(metric, sex, pdfFile, xValue, yValue){
  const cal = getCalibration(metric, sex, pdfFile);
  if(!cal) return null;
  const { axis, points } = cal;
  const { origin, xMax, yMax } = points;
  // Determine scale factors with orientation handling
  const xSpan = axis.xmax - axis.xmin || 1;
  const ySpan = axis.ymax - axis.ymin || 1;
  const xDir = (xMax.x >= origin.x)? 1 : -1;
  const yDir = (yMax.y >= origin.y)? 1 : -1; // charts usually have y decreasing upward => yMax likely above origin giving yDir = -1
  const pxPerX = Math.abs(xMax.x - origin.x) / xSpan;
  const pxPerY = Math.abs(yMax.y - origin.y) / ySpan;
  const cx = origin.x + (xValue - axis.xmin)*pxPerX*xDir;
  const cy = origin.y + (yValue - axis.ymin)*pxPerY*yDir;
  return { x: cx, y: cy };
}

const storedPoints = []; // { metric, sex, pdfFile, xValue, yValue, ageMonths, meta, _id }
let _pointSeq = 1;

function highlightLatestVisiblePoint(){
  if(!highlightCV || !currentPdf) return;
  const candidate = findVisiblePointCandidate();
  if(candidate) classifyPointVisual(candidate).catch(()=>{});
}

function findVisiblePointCandidate(){
  // 1) Prefer the last visible point-dot in the overlay
  try{
    const ov = currentPdf && currentPdf.pages && currentPdf.pages[0] && currentPdf.pages[0].overlay;
    if(ov){
      const dots = ov.querySelectorAll('.point-dot');
      if(dots.length){
        const last = dots[dots.length-1];
        const id = last.id && last.id.startsWith('point-dot-') ? parseInt(last.id.replace('point-dot-',''),10) : null;
        if(id){
          const byId = storedPoints.find(p=>p._id === id);
          if(byId) return byId;
        }
      }
    }
  }catch(_){}
  // 2) Fallback: latest stored point on this PDF and active metric
  const activeMetric = getActiveTabMetric();
  let candidate = storedPoints.slice().reverse().find(p=>p.pdfFile===currentPdf.pdfFile && (!activeMetric || p.metric===activeMetric));
  if(candidate) return candidate;
  // 3) Last resort: any point on this PDF
  candidate = storedPoints.slice().reverse().find(p=>p.pdfFile===currentPdf.pdfFile);
  return candidate || null;
}

// Hover-based preview: scans at pointer X for the currently active metric/page
function enableCvHoverPreview(enable){
  const page = currentPdf && currentPdf.pages && currentPdf.pages[0];
  if(!page) return;
  const ov = page.overlay;
  ov.classList.toggle('cv-hover', !!enable && !!highlightCV);
  ov.onmousemove = null;
  if(enable && highlightCV){
    ov.onmousemove = (e)=>{
      const rect = ov.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // Use the latest visible point as context
      const last = findVisiblePointCandidate();
      if(!last) return;
      // Map the pointer x back to a logical x using calibration
      const cal = getCalibration(last.metric, last.sex, last.pdfFile);
      if(!cal) return;
      const { axis, points } = cal;
      const { origin, xMax } = points;
      const xSpan = axis.xmax - axis.xmin || 1;
      const xDir = (xMax.x >= origin.x)? 1 : -1;
      const pxPerX = Math.abs(xMax.x - origin.x) / xSpan;
      const logicalX = axis.xmin + (x - origin.x) / (pxPerX * xDir);
      // Use last.yValue just for context; detection uses only x/visuals
      classifyPointVisual({ ...last, xValue: logicalX }).catch(()=>{});
    };
  }
}

function addPoint(point){
  if(!point._id) point._id = _pointSeq++;
  storedPoints.push(point);
  // Try visual classification (async but quick)
  classifyPointVisual(point).then(res=>{
    point.meta = point.meta || {};
    point.meta.visualBand = res;
    redrawPoints();
    updateResultsTable();
  }).catch(()=>{ redrawPoints(); updateResultsTable(); });
}

function clearPoints(){
  storedPoints.length = 0;
  redrawPoints();
  updateResultsTable();
}

function redrawPoints(){
  if(!currentPdf) return;
  currentPdf.pages.forEach(p=>{
    // Remove only point elements, preserve temporary CV highlights and calibration markers
    const overlay = p.overlay;
    Array.from(overlay.querySelectorAll('.point-dot,.point-label')).forEach(el=>el.remove());
  });
  const activeMetric = getActiveTabMetric();
  storedPoints.forEach(pt=>{
    if(pt.pdfFile !== currentPdf.pdfFile) return;
    if(activeMetric && pt.metric !== activeMetric) return;
    const mapped = mapValueToCanvas(pt.metric, pt.sex, pt.pdfFile, pt.xValue, pt.yValue);
    if(!mapped) return;
  // Ensure stable ID for async updates
  if(!pt._id){ pt._id = _pointSeq++; }
    const dot = document.createElement('div');
    dot.className = `point-dot point-${pt.metric}`;
    dot.style.left = mapped.x+'px';
    dot.style.top = mapped.y+'px';
  dot.id = `point-dot-${pt._id}`;
    // LMS fallback percentile (rounded) so user sees something immediately
    let lmsBand = '';
    try {
      if(pt.metric !== 'weightForStature'){
        const { percentile: lp } = GrowthLMS.computeZ(pt.metric, pt.sex, pt.ageMonths, pt.yValue) || {};
        if(lp!=null && !isNaN(lp)) lmsBand = `P${Math.round(lp)}`;
      }
    } catch(_){}
    let band = '';
      const vb = pt.meta && pt.meta.visualBand;
    if(vb === undefined){
      band = lmsBand || '…'; // pending, show LMS if available
    } else if(!vb || vb.type==='unknown'){
      band = lmsBand || '—';
      } else if(vb.type==='at'){
        band = vb.percentile? `P${vb.percentile}` : 'line';
      } else if(vb.type==='between'){
        band = (vb.lower!=null && vb.upper!=null)? `P${vb.lower}-P${vb.upper}` : 'between';
      }
      dot.title = `${pt.metric} (${pt.yValue}) at ${pt.xValue}${band && band!=='—' && band!=='…' ? ' @ '+band:''}`;
    currentPdf.pages[0].overlay.appendChild(dot); // For simplicity assume all on first page
  // Persistent label
  const label = document.createElement('div');
  label.className = 'point-label';
  label.style.left = mapped.x+'px';
  label.style.top = mapped.y+'px';
  label.id = `point-label-${pt._id}`;
      label.textContent = band;
  currentPdf.pages[0].overlay.appendChild(label);

    // If still pending, classify now and update label without full redraw
    if(vb === undefined){
      classifyPointVisual(pt).then(res=>{
        pt.meta = pt.meta || {};
        pt.meta.visualBand = res;
        const el = document.getElementById(`point-label-${pt._id}`);
        const dotEl = document.getElementById(`point-dot-${pt._id}`);
        if(el){
          let txt = el.textContent || '—';
          if(res){
            if(res.type==='at') txt = res.percentile? `P${res.percentile}` : 'line';
            else if(res.type==='between') txt = (res.lower!=null&&res.upper!=null)? `P${res.lower}-P${res.upper}` : 'between';
            else txt = txt === '…' ? '—' : txt;
          }
          el.textContent = txt;
        }
        if(dotEl){
          let suffix = '';
          if(res){
            if(res.type==='at') suffix = res.percentile? ` @ P${res.percentile}` : ' @ line';
            else if(res.type==='between') suffix = (res.lower!=null&&res.upper!=null)? ` @ P${res.lower}-P${res.upper}` : ' @ between';
          }
          dotEl.title = `${pt.metric} (${pt.yValue}) at ${pt.xValue}${suffix}`;
        }
        updateResultsTable();
      }).catch(()=>{
        const el = document.getElementById(`point-label-${pt._id}`);
        if(el && (el.textContent === '…' || !el.textContent)) el.textContent = '—';
      });
    }
  });
  // Ensure a visible highlight is rendered if enabled
  highlightLatestVisiblePoint();
}

function updateResultsTable(){
  const tbody = document.querySelector('#resultsTable tbody');
  tbody.innerHTML='';
  storedPoints.slice().reverse().forEach(pt=>{
    const tr = document.createElement('tr');
    const { z, percentile } = (pt.metric!=='weightForStature'? GrowthLMS.computeZ(pt.metric, pt.sex, pt.ageMonths, pt.yValue) : { z: null, percentile: null });
  cvLogWrite({ event:'scan-start', metric: pt.metric, sex: pt.sex, pdf: pt.pdfFile, x, y, xValue: pt.xValue, yValue: pt.yValue });
    const pctStr = percentile!=null? percentile.toFixed(1)+'%':'—';
    const zStr = z!=null? z.toFixed(2):'—';
    let bandStr = '—';
    const vb = pt.meta && pt.meta.visualBand;
    if(vb){
      if(vb.type==='at') bandStr = vb.percentile? `P${vb.percentile}` : 'line';
      else if(vb.type==='between') bandStr = (vb.lower!=null&&vb.upper!=null)? `P${vb.lower}-P${vb.upper}` : 'between';
    }
    tr.innerHTML = `<td>${pt.metric}</td><td>${pt.yValue}</td><td>${pt.ageMonths.toFixed(2)}</td><td>${pctStr}</td><td>${zStr}</td><td>${bandStr}</td><td>${pt.pdfFile}</td>`;
    tbody.appendChild(tr);
  });
}

// Calibration UI
const calibrationPanel = document.getElementById('calibrationPanel');
const enterCalibrateBtn = document.getElementById('enterCalibrateMode');
const toggleHighlightCV = document.getElementById('toggleHighlightCV');
if(toggleHighlightCV){
  toggleHighlightCV.addEventListener('change', (e)=>{
    highlightCV = !!e.target.checked;
    if(!highlightCV && currentPdf && currentPdf.pages && currentPdf.pages[0]){
      const ov = currentPdf.pages[0].overlay;
  cvLogWrite({ event:'scan-lines', count: ys.length, ys: ys.map(n=>+n.toFixed(1)), lineVals: lineVals.map(n=>+n.toFixed(2)), labels });
      Array.from(ov.querySelectorAll('.cv-scan-band,.cv-line-tick')).forEach(el=>el.remove());
    }
    if(highlightCV){
      // Render a highlight for the latest visible point immediately
      highlightLatestVisiblePoint();
    }
  });
}

enterCalibrateBtn.addEventListener('click', ()=>{
  const sex = document.getElementById('sex').value;
  const ageMonths = ageToMonths(+ageYears.value, +ageMonthsInput.value, +ageDaysInput.value);
  const metrics = getSelectedMetrics();
  if(!metrics.length){ alert('Select at least one metric'); return; }
  // We'll calibrate currently active metric only (first selected)
  const metric = metrics[0];
  const pdfFile = pickPdfForMetric(metric, sex, ageMonths);
  if(!pdfFile){ alert('Cannot determine PDF for metric'); return; }
  startCalibration(metric, sex, pdfFile);
});

function startCalibration(metric, sex, pdfFile){
  calibrateState = { step: 0, metric, sex, pdfFile, temp: { axisValues: null, pointsCollected: {}, method: 'autoDefaults' } };
  loadPdfIfNeeded(pdfFile).then(()=>{
    buildTabs([metric], pdfFile);
    redrawPoints();
    showCalibrationPanel();
  });
}

function showCalibrationPanel(){
  calibrationPanel.classList.remove('hidden');
  const cal = calibrateState;
    cvLogWrite({ event:'scan-result', type:'at', pxDist:+minDist.toFixed(2), percentile:pct });
  let defaults = null;
  if(cal.metric === 'headCircumference') defaults = DEFAULT_AXIS.headCircumference;
  else if(cal.metric === 'weightForAge') defaults = /0-2/.test(cal.pdfFile)? DEFAULT_AXIS.weightForAge_under2 : DEFAULT_AXIS.weightForAge_2to19;
  else if(cal.metric === 'statureForAge') defaults = /0-2/.test(cal.pdfFile)? DEFAULT_AXIS.statureForAge_under2 : DEFAULT_AXIS.statureForAge_2to19;
  else if(cal.metric === 'weightForStature') defaults = DEFAULT_AXIS.weightForStature;
  // Prefill point coordinate logical values (age in months for x; measurement for y)
  // If metric weightForAge on 2-19 chart: allow (age 2y=24m, w=5kg) -> (age19y=228m,w=5kg) -> (age19y=228m, w=90kg)
  const pointValues = (()=>{
    if(cal.metric==='weightForAge' && /2-19/.test(cal.pdfFile)){
      return { origin:{x:24,y:5}, xMax:{x:228,y:5}, yMax:{x:228,y:90} };
      cvLogWrite({ event:'scan-result', type:'between', lower:lowerPct, upper:upperPct });
    }
    // fallback derive from defaults if present
    if(defaults){
  cvLogWrite({ event:'scan-result', type:'unknown' });
      return { origin:{x:defaults.xmin,y:defaults.ymin}, xMax:{x:defaults.xmax,y:defaults.ymin}, yMax:{x:defaults.xmax,y:defaults.ymax} };
    }
    return { origin:{x:0,y:0}, xMax:{x:1,y:0}, yMax:{x:1,y:1} };
  })();
  calibrateState.temp.pointValues = pointValues;
  // Axis will be derived from current pointValues (origin & extremes)
  function recomputeAxis(){
    calibrateState.temp.axisValues = {
      xmin: calibrateState.temp.pointValues.origin.x,
      xmax: calibrateState.temp.pointValues.xMax.x,
      ymin: calibrateState.temp.pointValues.origin.y,
      ymax: calibrateState.temp.pointValues.yMax.y
    };
  }
  recomputeAxis();
  calibrationPanel.innerHTML = `<strong>Calibration: ${cal.metric} (${cal.sex})</strong>
    <div class='notice'>Enter logical values for the three reference points you will click (or keep defaults), then click: 1) Origin (bottom-left), 2) Bottom-right, 3) Top.</div>
    <div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:4px;font-size:0.55rem;margin:.25rem 0;'>
      <label>Origin Age (mo)<input id='pv_origin_x' type='number' step='0.1' value='${pointValues.origin.x}'/></label>
      <label>Origin Value<input id='pv_origin_y' type='number' step='0.1' value='${pointValues.origin.y}'/></label>
      <label>Xmax Age (mo)<input id='pv_xmax_x' type='number' step='0.1' value='${pointValues.xMax.x}'/></label>
      <label>Xmax Value<input id='pv_xmax_y' type='number' step='0.1' value='${pointValues.xMax.y}'/></label>
      <label>Ymax Age (mo)<input id='pv_ymax_x' type='number' step='0.1' value='${pointValues.yMax.x}'/></label>
      <label>Ymax Value<input id='pv_ymax_y' type='number' step='0.1' value='${pointValues.yMax.y}'/></label>
    </div>
    <div id='calibrationSteps'></div>
    <div style='margin-top:.5rem'><button type='button' id='calCancel'>Cancel</button></div>`;
  const ids = ['pv_origin_x','pv_origin_y','pv_xmax_x','pv_xmax_y','pv_ymax_x','pv_ymax_y'];
  ids.forEach(id=>{
    const el = document.getElementById(id);
    el.addEventListener('input', ()=>{
      calibrateState.temp.pointValues.origin.x = parseFloat(document.getElementById('pv_origin_x').value)||0;
      calibrateState.temp.pointValues.origin.y = parseFloat(document.getElementById('pv_origin_y').value)||0;
      calibrateState.temp.pointValues.xMax.x = parseFloat(document.getElementById('pv_xmax_x').value)||0;
      calibrateState.temp.pointValues.xMax.y = parseFloat(document.getElementById('pv_xmax_y').value)||0;
      calibrateState.temp.pointValues.yMax.x = parseFloat(document.getElementById('pv_ymax_x').value)||0;
      calibrateState.temp.pointValues.yMax.y = parseFloat(document.getElementById('pv_ymax_y').value)||0;
      recomputeAxis();
      renderCalibrationSteps();
    });
  });
  document.getElementById('calCancel').onclick = ()=>{
    setCalibrationOverlayMode(false);
    calibrationPanel.classList.add('hidden');
    calibrateState = null;
  };
  setCalibrationOverlayMode(true);
  renderCalibrationSteps();
}

function setCalibrationOverlayMode(on){
  if(!currentPdf) return;
  currentPdf.pages[0].overlay.classList.toggle('calibrating', on);
  if(on){
    currentPdf.pages[0].overlay.addEventListener('click', calibrationClickHandler);
  } else {
    currentPdf.pages[0].overlay.removeEventListener('click', calibrationClickHandler);
  }
}

function calibrationClickHandler(e){
  if(!calibrateState || !calibrateState.temp.axisValues) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left; const y = e.clientY - rect.top;
  if(calibrateState.step === 0){
    calibrateState.temp.pointsCollected.origin = { x, y };
    addCalibrationMarker(x,y,'O');
    calibrateState.step = 1;
  } else if(calibrateState.step === 1){
    calibrateState.temp.pointsCollected.xMax = { x, y };
    addCalibrationMarker(x,y,'X');
    calibrateState.step = 2;
  } else if(calibrateState.step === 2){
    calibrateState.temp.pointsCollected.yMax = { x, y };
    addCalibrationMarker(x,y,'Y');
    const pts = calibrateState.temp.pointsCollected;
    if(pts.xMax.x === pts.origin.x){
      alert('Xmax must differ in X from origin. Restarting step.');
      delete pts.xMax; delete pts.yMax; calibrateState.step = 1; redrawCalMarkers(); renderCalibrationSteps(); return;
    }
    if(pts.yMax.y === pts.origin.y){
      alert('Ymax must differ in Y from origin. Restarting step.');
      delete pts.yMax; calibrateState.step = 2; redrawCalMarkers(); renderCalibrationSteps(); return;
    }
    // Save calibration
    const pv = calibrateState.temp.pointValues || null;
    setCalibration(calibrateState.metric, calibrateState.sex, calibrateState.pdfFile, {
      pdfFile: calibrateState.pdfFile,
      metric: calibrateState.metric,
      sex: calibrateState.sex,
      axis: calibrateState.temp.axisValues,
  points: calibrateState.temp.pointsCollected,
  method: calibrateState.temp.method || 'axis',
      threePointCoords: calibrateState.temp.threePointCoords || null,
      pointValues: pv
    });
    setCalibrationOverlayMode(false);
    calibrationPanel.innerHTML += `<div class='notice'>Calibration saved.</div>`;
    calibrateState = null;
  }
  renderCalibrationSteps();
}

function addCalibrationMarker(x,y,label){
  if(!currentPdf) return;
  const mark = document.createElement('div');
  mark.className = 'cal-marker';
  mark.style.position='absolute';
  mark.style.transform='translate(-50%,-50%)';
  mark.style.background='#1f6feb';
  mark.style.color='#fff';
  mark.style.fontSize='10px';
  mark.style.padding='2px 3px';
  mark.style.borderRadius='3px';
  mark.style.left = x+'px';
  mark.style.top = y+'px';
  mark.textContent = label;
  currentPdf.pages[0].overlay.appendChild(mark);
}

function redrawCalMarkers(){
  if(!currentPdf) return;
  const overlay = currentPdf.pages[0].overlay;
  Array.from(overlay.querySelectorAll('.cal-marker')).forEach(el=>el.remove());
  if(!calibrateState) return;
  const pts = calibrateState.temp.pointsCollected;
  if(pts.origin) addCalibrationMarker(pts.origin.x, pts.origin.y,'O');
  if(pts.xMax) addCalibrationMarker(pts.xMax.x, pts.xMax.y,'X');
  if(pts.yMax) addCalibrationMarker(pts.yMax.x, pts.yMax.y,'Y');
}

function renderCalibrationSteps(){
  const stepsDiv = document.getElementById('calibrationSteps');
  if(!stepsDiv) return;
  if(!calibrateState){ stepsDiv.innerHTML=''; return; }
  const axis = calibrateState.temp.axisValues;
  const baseLabels = ['Click origin (Xmin,Ymin)','Click Xmax (same Y)','Click Ymax (same X)'];
  const stepMsg = baseLabels[calibrateState.step] || 'Done';
  const axisDisplay = `<div style='font-size:0.55rem;margin-top:0.25rem;'>Axis: x[${axis.xmin}..${axis.xmax}] y[${axis.ymin}..${axis.ymax}]</div>`;
  const pts = calibrateState.temp.pointsCollected;
  stepsDiv.innerHTML = `<div class='calibration-step'>Step ${Math.min(calibrateState.step+1,3)} of 3: ${stepMsg}</div>${axisDisplay}<div style='font-size:0.55rem;'>Collected: ${Object.keys(pts).join(', ')||'—'}</div>`;
}

function getSelectedMetrics(){
  return Array.from(document.querySelectorAll('input[name="metric"]:checked')).map(i=>i.value);
}

// Form handling
const form = document.getElementById('measureForm');
const ageYears = document.getElementById('ageYears');
const ageMonthsInput = document.getElementById('ageMonths');
const ageDaysInput = document.getElementById('ageDays');

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const sex = document.getElementById('sex').value;
  const weight = parseFloat(document.getElementById('weight').value);
  const height = parseFloat(document.getElementById('height').value);
  const hc = parseFloat(document.getElementById('hc').value);
  const ageMonths = ageToMonths(+ageYears.value, +ageMonthsInput.value, +ageDaysInput.value);
  const metrics = getSelectedMetrics();
  if(!metrics.length){ alert('Select at least one metric'); return; }
  // Determine required pdf(s)
  const pdfs = new Set();
  const pointsToAdd = [];
  for(const metric of metrics){
    const pdfFile = pickPdfForMetric(metric, sex, ageMonths);
    if(!pdfFile) continue;
    pdfs.add(pdfFile);
    if(metric==='weightForAge'){
      pointsToAdd.push({ metric, sex, pdfFile, xValue: ageMonths, yValue: weight, ageMonths });
    } else if(metric==='statureForAge'){
      pointsToAdd.push({ metric, sex, pdfFile, xValue: ageMonths, yValue: height, ageMonths });
    } else if(metric==='weightForStature'){
      pointsToAdd.push({ metric, sex, pdfFile, xValue: height, yValue: weight, ageMonths });
    } else if(metric==='headCircumference' && !isNaN(hc)){
      pointsToAdd.push({ metric, sex, pdfFile, xValue: ageMonths, yValue: hc, ageMonths });
    }
  }
  // Load first pdf and build tabs based on metrics used for that pdf
  if(pdfs.size === 0){ alert('No charts applicable'); return; }
  const pdfFile = [...pdfs][0];
  await loadPdfIfNeeded(pdfFile);
  const metricsForThisPdf = pointsToAdd.filter(p=>p.pdfFile===pdfFile).map(p=>p.metric).filter((v,i,a)=>a.indexOf(v)===i);
  buildTabs(metricsForThisPdf, pdfFile);
  pointsToAdd.forEach(pt=>{
    const cal = getCalibration(pt.metric, pt.sex, pt.pdfFile);
    if(!cal){
      // warn calibration missing
      console.warn('No calibration for', pt.metric, pt.sex, pt.pdfFile);
    }
    addPoint(pt);
  });
});

// Clear points button
const clearBtn = document.getElementById('clearPoints');
clearBtn.addEventListener('click', ()=>{
  clearPoints();
});

// Initial state
(function init(){
  // Warn if using file:// protocol which can block PDF.js XHR in some browsers
  if(location.protocol === 'file:'){
    const warn = document.createElement('div');
    warn.className = 'notice';
    warn.style.margin = '0.5rem 0';
    warn.textContent = 'You are viewing via file:// . If PDFs do not render, start a local server (e.g. python3 -m http.server) and open via http://localhost.';
    document.querySelector('header').appendChild(warn);
  }
  const t = document.getElementById('toggleHighlightCV');
  if(t){
    highlightCV = !!t.checked;
    t.addEventListener('change', (e)=>{
      highlightCV = !!e.target.checked;
      if(!highlightCV && currentPdf && currentPdf.pages && currentPdf.pages[0]){
        const ov = currentPdf.pages[0].overlay;
        Array.from(ov.querySelectorAll('.cv-scan-band,.cv-line-tick')).forEach(el=>el.remove());
      }
      if(highlightCV){ highlightLatestVisiblePoint(); }
      enableCvHoverPreview(highlightCV);
    });
  }
  const cvClear = document.getElementById('cvLogClear');
  if(cvClear){ cvClear.addEventListener('click', ()=>{ const box = document.getElementById('cvLog'); if(box) box.textContent=''; }); }
  // Enable hover preview on load if toggle is on
  enableCvHoverPreview(highlightCV);
  const scanBtn = document.getElementById('scanNow');
  if(scanBtn){
    scanBtn.addEventListener('click', async ()=>{
      cvLogWrite({ event:'scan-now-clicked' });
      const activeMetric = getActiveTabMetric();
      const ov = currentPdf && currentPdf.pages && currentPdf.pages[0] && currentPdf.pages[0].overlay;
      const dotCount = ov ? ov.querySelectorAll('.point-dot').length : 0;
      cvLogWrite({ event:'scan-now-context', pdf: currentPdf && currentPdf.pdfFile, activeMetric, stored: storedPoints.length, overlayDots: dotCount });
      if(!currentPdf){ cvLogWrite('No PDF loaded'); return; }
      let candidate = findVisiblePointCandidate();
      if(!candidate){
        // Fallback: use last stored point, even if on another PDF; auto-load it
        const fallback = storedPoints[storedPoints.length-1];
        if(!fallback){ cvLogWrite({ event:'scan-now-no-candidate', reason:'no-stored-points' }); return; }
        if(fallback.pdfFile !== (currentPdf && currentPdf.pdfFile)){
          cvLogWrite({ event:'scan-now-loading-fallback-pdf', pdf: fallback.pdfFile });
          await loadPdfIfNeeded(fallback.pdfFile);
        }
        candidate = fallback;
      }
      if(!highlightCV) cvLogWrite('Note: highlight is off; enabling for this scan');
      highlightCV = true;
      const t = document.getElementById('toggleHighlightCV'); if(t) t.checked = true;
      try{
        await classifyPointVisual(candidate);
      }catch(err){
        cvLogWrite('Scan error: '+(err?.message||String(err)));
      }
    });
  }
})();
