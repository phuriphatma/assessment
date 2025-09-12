// pngChart.js - adds PNG chart loading and auto calibration for specified chart
(function(){
  const PNG_ALIAS = {
    'Weight-and-height_Boys_2-19-years.pdf': 'Weight-and-height_Boys_2-19-years.png'
  };

  // Copy any existing calibrations from PDF key to PNG key (one-time per session)
  try {
    const migratedFlag = 'png_migration_done';
    if(!localStorage.getItem(migratedFlag)){
      Object.keys(PNG_ALIAS).forEach(oldFile=>{
        const newFile = PNG_ALIAS[oldFile];
        ['weightForAge','statureForAge'].forEach(metric=>{
          ['boys','girls'].forEach(sex=>{
            const oldKey = 'calib_'+metric+'_'+sex+'_'+oldFile;
            const newKey = 'calib_'+metric+'_'+sex+'_'+newFile;
            const val = localStorage.getItem(oldKey);
            if(val && !localStorage.getItem(newKey)){
              localStorage.setItem(newKey, val);
              console.log('[PNG Migration] copied calibration', oldKey,'->',newKey);
            }
          });
        });
      });
      localStorage.setItem(migratedFlag,'1');
    }
  } catch(_){}

  function calibKey(metric, sex, file){
    return 'calib_'+metric+'_'+sex+'_'+file;
  }
  function getCalibration(metric, sex, file){
    try{ return JSON.parse(localStorage.getItem(calibKey(metric,sex,file))); }catch(_){ return null; }
  }
  function setCalibration(metric, sex, file, cal){
    try{ localStorage.setItem(calibKey(metric,sex,file), JSON.stringify(cal)); }catch(_){ }
  }

  async function loadPngChart(pngFile){
    return new Promise((resolve,reject)=>{
      const img = new Image();
      img.onload = ()=>{
        const container = document.getElementById('pdfViewportContainer');
        // Clear container if switching to this chart explicitly
        // (Keep simple: only one page shown for PNG chart)
        // Don't clear existing if other charts may be open; we mimic existing multi-tab structure.
        const wrapper = document.createElement('div');
        wrapper.className = 'pdfPageWrapper';
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0);
        const overlay = document.createElement('div');
        overlay.className = 'overlay-layer';
        overlay.style.width = canvas.width+'px';
        overlay.style.height = canvas.height+'px';
        wrapper.appendChild(canvas);
        wrapper.appendChild(overlay);
        // Remove any existing wrapper for this file
        Array.from(container.querySelectorAll('[data-file="'+pngFile+'"]')).forEach(el=>el.remove());
        wrapper.dataset.file = pngFile;
        container.appendChild(wrapper);
        const pdfObj = { pdfFile: pngFile, pages: [{ canvas, overlay }] };
        window.currentPdf = pdfObj;

        // Auto-calibration for provided PNG if missing and metric context is weightForAge boys
        // Mapping: (age 2y,5kg) -> (236,3307); (age19y,90kg)->(2244.5,1453.5)
        // Derive xMax (age19,5kg) at (2244.5,3307); yMax (age2,90kg) at (236,1453.5)
        const metric = 'weightForAge';
        const sex = 'boys';
        if(!getCalibration(metric, sex, pngFile)){
          const cal = {
            axis: { xmin:24, xmax:228, ymin:5, ymax:90 },
            points: {
              origin:{ x:236, y:3307 },
              xMax:{ x:2244.5, y:3307 },
              yMax:{ x:236, y:1453.5 }
            },
            method:'auto-png',
            source:'pngChart.js'
          };
            setCalibration(metric, sex, pngFile, cal);
            console.log('[PNG Calibration] Stored auto calibration for', pngFile, cal);
            // Verification mapping test
            const testAge = 228; // 19y
            const testWeight = 90;
            const dxSpan = cal.points.xMax.x - cal.points.origin.x;
            const dySpan = cal.points.origin.y - cal.points.yMax.y; // inverted
            const pxPerMonth = dxSpan / (cal.axis.xmax - cal.axis.xmin);
            const pxPerKg = dySpan / (cal.axis.ymax - cal.axis.ymin);
            const pxX = cal.points.origin.x + (testAge - cal.axis.xmin) * pxPerMonth;
            const pxY = cal.points.origin.y - (testWeight - cal.axis.ymin) * pxPerKg;
            const errX = pxX - 2244.5; const errY = pxY - 1453.5;
            console.log('[PNG Calibration] Verification (age19,90kg) pixel predicted=', {pxX, pxY, errX, errY});
        }
        resolve(pdfObj);
      };
      img.onerror = ()=>reject(new Error('Failed to load image '+pngFile));
      img.src = pngFile;
    });
  }

  // Override loader to support PNG alias
  const origLoader = window.loadPdfIfNeeded;
  window.loadPdfIfNeeded = async function(file){
    const mapped = PNG_ALIAS[file] || file;
    if(mapped.toLowerCase().endsWith('.png')){
      return await loadPngChart(mapped);
    }
    if(origLoader) return await origLoader(file);
    throw new Error('No loader available for '+file);
  };
})();
