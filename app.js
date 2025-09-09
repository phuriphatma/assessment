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
    // Try local ESM first
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
    throw new Error('pdf.js failed to load from local or CDN');
  })();
  return pdfjsLoadPromise;
}
const pdfViewportContainer = document.getElementById('pdfViewportContainer');
const chartTabsEl = document.getElementById('chartTabs');
let currentPdf = null; // { pdfFile, pages:[ { canvas, overlay, page } ] }
let activeMetricTabs = [];
let calibrateState = null; // { step, metric, sex, pdfFile, temp: {axisValues, pointsCollected} }

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
  // Determine scale factors
  const pxPerX = (xMax.x - origin.x) / (axis.xmax - axis.xmin);
  const pxPerY = (yMax.y - origin.y) / (axis.ymax - axis.ymin); // positive downward
  const cx = origin.x + (xValue - axis.xmin)*pxPerX;
  const cy = origin.y + (yValue - axis.ymin)*pxPerY;
  return { x: cx, y: cy };
}

const storedPoints = []; // { metric, sex, pdfFile, xValue, yValue, ageMonths, meta }

function addPoint(point){
  storedPoints.push(point);
  redrawPoints();
  updateResultsTable();
}

function clearPoints(){
  storedPoints.length = 0;
  redrawPoints();
  updateResultsTable();
}

function redrawPoints(){
  if(!currentPdf) return;
  currentPdf.pages.forEach(p=>{
    p.overlay.innerHTML='';
  });
  const activeMetric = getActiveTabMetric();
  storedPoints.forEach(pt=>{
    if(pt.pdfFile !== currentPdf.pdfFile) return;
    if(activeMetric && pt.metric !== activeMetric) return;
    const mapped = mapValueToCanvas(pt.metric, pt.sex, pt.pdfFile, pt.xValue, pt.yValue);
    if(!mapped) return;
    const dot = document.createElement('div');
    dot.className = `point-dot point-${pt.metric}`;
    dot.style.left = mapped.x+'px';
    dot.style.top = mapped.y+'px';
    dot.title = `${pt.metric} (${pt.yValue}) at ${pt.xValue}`;
    currentPdf.pages[0].overlay.appendChild(dot); // For simplicity assume all on first page
  });
}

function updateResultsTable(){
  const tbody = document.querySelector('#resultsTable tbody');
  tbody.innerHTML='';
  storedPoints.slice().reverse().forEach(pt=>{
    const tr = document.createElement('tr');
    const { z, percentile } = (pt.metric!=='weightForStature'? GrowthLMS.computeZ(pt.metric, pt.sex, pt.ageMonths, pt.yValue) : { z: null, percentile: null });
    const pctStr = percentile!=null? percentile.toFixed(1)+'%':'—';
    const zStr = z!=null? z.toFixed(2):'—';
    tr.innerHTML = `<td>${pt.metric}</td><td>${pt.yValue}</td><td>${pt.ageMonths.toFixed(2)}</td><td>${pctStr}</td><td>${zStr}</td><td>${pt.pdfFile}</td>`;
    tbody.appendChild(tr);
  });
}

// Calibration UI
const calibrationPanel = document.getElementById('calibrationPanel');
const enterCalibrateBtn = document.getElementById('enterCalibrateMode');

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
  calibrateState = { step: 0, metric, sex, pdfFile, temp: { axisValues: null, pointsCollected: {} } };
  loadPdfIfNeeded(pdfFile).then(()=>{
    buildTabs([metric], pdfFile);
    redrawPoints();
    showCalibrationPanel();
  });
}

function showCalibrationPanel(){
  calibrationPanel.classList.remove('hidden');
  const cal = calibrateState;
  const axisForm = `<div class='calibration-axis-form'>
    <div style='display:flex;gap:0.5rem;flex-wrap:wrap'>
      <label style='flex:1'>X Min<input id='cal_xmin' type='number' step='0.01' /></label>
      <label style='flex:1'>X Max<input id='cal_xmax' type='number' step='0.01' /></label>
      <label style='flex:1'>Y Min<input id='cal_ymin' type='number' step='0.01' /></label>
      <label style='flex:1'>Y Max<input id='cal_ymax' type='number' step='0.01' /></label>
    </div>
    <button type='button' id='calSetAxis'>Set Axis Values</button>
  </div>`;
  calibrationPanel.innerHTML = `<strong>Calibration: ${cal.metric} (${cal.sex}) on ${cal.pdfFile}</strong><div class='notice'>1. Enter axis numeric ranges. 2. Click origin (Xmin,Ymin). 3. Click Xmax. 4. Click Ymax.</div>${axisForm}<div id='calibrationSteps'></div>`;
  document.getElementById('calSetAxis').onclick = ()=>{
    const xmin = parseFloat(document.getElementById('cal_xmin').value);
    const xmax = parseFloat(document.getElementById('cal_xmax').value);
    const ymin = parseFloat(document.getElementById('cal_ymin').value);
    const ymax = parseFloat(document.getElementById('cal_ymax').value);
    if([xmin,xmax,ymin,ymax].some(v=>isNaN(v))){ alert('Provide all axis values'); return; }
    calibrateState.temp.axisValues = { xmin,xmax,ymin,ymax };
    setCalibrationOverlayMode(true);
    renderCalibrationSteps();
  };
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
    calibrateState.step = 1;
  } else if(calibrateState.step === 1){
    calibrateState.temp.pointsCollected.xMax = { x, y };
    calibrateState.step = 2;
  } else if(calibrateState.step === 2){
    calibrateState.temp.pointsCollected.yMax = { x, y };
    // Save calibration
    setCalibration(calibrateState.metric, calibrateState.sex, calibrateState.pdfFile, {
      pdfFile: calibrateState.pdfFile,
      metric: calibrateState.metric,
      sex: calibrateState.sex,
      axis: calibrateState.temp.axisValues,
      points: calibrateState.temp.pointsCollected
    });
    setCalibrationOverlayMode(false);
    calibrationPanel.innerHTML += `<div class='notice'>Calibration saved.</div>`;
    calibrateState = null;
  }
  renderCalibrationSteps();
}

function renderCalibrationSteps(){
  const stepsDiv = document.getElementById('calibrationSteps');
  if(!stepsDiv) return;
  if(!calibrateState){ stepsDiv.innerHTML=''; return; }
  const labels = ['Click origin (Xmin,Ymin)','Click Xmax','Click Ymax'];
  stepsDiv.innerHTML = `<div class='calibration-step'>Step ${calibrateState.step+1} of 3: ${labels[calibrateState.step]}</div>`;
  const pts = calibrateState.temp.pointsCollected;
  stepsDiv.innerHTML += '<div>Collected: '+Object.keys(pts).join(', ')+'</div>';
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
})();
