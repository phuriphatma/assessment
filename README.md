# Growth Chart Plotter

Static web tool to overlay a child's anthropometric measurements on supplied PDF growth charts using client‑side PDF.js rendering plus a calibration workflow. Minimal LMS (Lambda-Mu-Sigma) sample data is included only for demonstration; not for clinical use.

## Features
- Input: sex (boy/girl), age (years / months / days), weight (kg), height/length (cm), head circumference (cm).
- Metrics selectable: weight-for-age, stature/length-for-age, weight-for-stature, head circumference.
- Automatic selection of appropriate PDF based on age (<24 months vs 2–19 years) and sex.
- Manual axis calibration per (metric, sex, PDF) stored locally (localStorage) so PDF coordinates map to data values.
- Overlay plotting of points (color-coded) on a transparent layer above the rendered PDF page.
- Percentile & z-score calculation (demo) for: weight-for-age, stature-for-age, head circumference (simple linear LMS interpolation between sparse sample points). Weight-for-stature percentiles not included in demo (add LMS rows to enable).

## Quick Start
1. Place the provided PDF files in the same directory as `index.html` (already present).
2. Option A (Local): Open `index.html` directly OR (preferred) run a local server.

Option B (GitHub Pages): Push this repo to GitHub with a default branch named `main`. GitHub Action in `.github/workflows/pages.yml` publishes all files to Pages automatically.
3. First, calibrate each chart you plan to use:
   - Select at least one metric and sex, click "Calibrate Axes".
   - Enter axis numeric ranges (e.g. for head circumference 0–36 months X, 30–54 cm Y; adapt to your chart scale).
   - Click on the PDF (a) the origin (Xmin,Ymin), (b) a point on the X axis representing Xmax, (c) a point on the Y axis representing Ymax.
   - A notice will confirm calibration saved.
4. Enter child data and press "Plot Points". Points appear; table shows z-scores/percentiles (demo subset).

### View from your phone/iPad on the same network
1. Start the server:
   - macOS/Linux: `node server.js 8080`
2. Note the LAN URL printed (e.g. `http://192.168.1.23:8080`).
3. On your iPad/iPhone, connect to the same Wi‑Fi and open that URL in Safari/Chrome.
   - If it doesn’t load, try the mDNS address also printed (e.g. `http://your-mac.local:8080`).
   - Keep your computer awake and on the same network.

## Extending LMS Data
Edit `lmsData.js`:
- Add full arrays for each metric/sex with entries `{ x: <ageMonths or stature cm>, L, M, S }` in ascending x.
- For weight-for-stature, set `x` to stature (cm) grid values.
- The interpolation is linear between surrounding points; you can replace with spline if higher fidelity required.

## Adding Percentiles for Weight-for-Stature
1. Populate `lmsData.weightForStature.boys` / `girls` with LMS rows for the full stature range.
2. In `updateResultsTable()` remove the conditional that skips `weightForStature` so it calls `GrowthLMS.computeZ` for that metric.

## Notes & Disclaimers
- Calibration is linear (no rotation or perspective correction). Ensure you click precise axis reference points—zoom the browser if needed.
- Multi-page PDFs: current implementation overlays points only on the first page (adjust in `redrawPoints()` if needed).
- This is not validated for clinical decision-making. Supply authoritative full LMS datasets (CDC/WHO) before any clinical use.
- All data stays local (no network calls besides CDN for pdf.js).

## Potential Improvements
- Persist and manage multiple patients (localStorage records).
- Export annotated chart as PNG.
- Multi-page support & dynamic page choice.
- Axis auto-suggestions per metric based on typical ranges.
- Improved percentile interpolation (LMS spline / WHO approach).
- Offline bundling of `pdf.js` (copy from `node_modules/pdfjs-dist/build` into the repo to avoid CDN dependency for Pages).

## Deploying to GitHub Pages
1. Ensure your default branch is `main` (or update the workflow trigger branch).
2. Commit and push all files, including the PDF charts.
3. In the repository Settings → Pages, set Source to GitHub Actions (should auto-detect after first run).
4. After Action completes, visit the provided Pages URL. The app loads PDFs via relative paths (same folder) and `pdf.js` from either `node_modules` (if present) or public CDNs.

If corporate network blocks the CDNs, copy the following into the repo and adjust `index.html` to reference them directly:
```
node_modules/pdfjs-dist/build/pdf.min.js
node_modules/pdfjs-dist/build/pdf.worker.min.js
```
Then commit those two files (license permitting) or host your own copy.

## License
No explicit license included; add one as appropriate for your project context and ensure the PDFs' licensing allows local rendering.
