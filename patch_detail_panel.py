import re, sys

with open(r'd:\Dự án - python\Brain_MRI\frontend\brain3d_new.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '  function _showDetailInfoPanel() {'
end_marker = '  function _hideDetailInfoPanel() {'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print('ERROR: markers not found', start_idx, end_idx)
    sys.exit(1)

print(f'Found start at {start_idx}, end at {end_idx}')

new_fn = '''  function _showDetailInfoPanel() {
    _hideDetailInfoPanel();

    const data = window.lastDiagnosisData;
    if (!data) return;

    const pred    = data.prediction || {};
    const dm      = data.depth_metrics || {};
    const metrics = data.detailed_metrics || {};
    const depth   = dm.tumor_depth_mm;
    const cat     = dm.depth_category || {};
    const conf    = Math.round((pred.confidence || 0) * 100);
    const area    = pred.tumor_area_percent;
    const distCortex = metrics.distance_to_cortex_mm ?? dm.tumor_depth_mm ?? 0;

    const CAT_COLOR = {
      OUTSIDE:'#ef4444', SUPERFICIAL:'#ef4444', SHALLOW:'#f97316',
      INTERMEDIATE:'#eab308', DEEP:'#22c55e', VERY_DEEP:'#3b82f6'
    };
    const clr = CAT_COLOR[cat.category] || '#eab308';

    const depthPct = Math.min(100, ((depth || 0) / 55) * 100).toFixed(1);

    const riskMap = {
      OUTSIDE:{ label:'CRITICAL', icon:'●', stars:5 },
      SUPERFICIAL:{ label:'CRITICAL', icon:'●', stars:5 },
      SHALLOW:{ label:'HIGH RISK', icon:'●', stars:4 },
      INTERMEDIATE:{ label:'MODERATE', icon:'●', stars:3 },
      DEEP:{ label:'LOW RISK', icon:'●', stars:2 },
      VERY_DEEP:{ label:'MINIMAL', icon:'●', stars:1 }
    };
    const risk = riskMap[cat.category] || { label:'UNKNOWN', icon:'●', stars:3 };

    const lobeMap = {
      frontal:  { fn:'Motor control, executive function', color:'#a78bfa' },
      temporal: { fn:'Memory, language processing', color:'#60a5fa' },
      parietal: { fn:'Sensory integration, spatial', color:'#f472b6' },
      occipital:{ fn:'Visual cortex processing', color:'#34d399' },
      central:  { fn:'Motor/sensory border zone', color:'#fbbf24' }
    };
    const locStr = (pred.location_hint || '').toLowerCase();
    const lobeKey = Object.keys(lobeMap).find(k => locStr.includes(k)) || '';
    const lobe = lobeMap[lobeKey] || { fn:'Cerebral cortex region', color:'#94a3b8' };

    const marginSafe = distCortex > 10 ? 'SAFE' : distCortex > 5 ? 'CAUTION' : 'DANGER';
    const marginClr  = distCortex > 10 ? '#22c55e' : distCortex > 5 ? '#f97316' : '#ef4444';

    const bboxText = window._bboxLabelText || '—';

    const panel = document.createElement('div');
    panel.id = 'brain3dDetailPanel';
    panel.style.cssText = `
      position: absolute;
      top: 10px; left: 10px;
      width: 256px;
      background: rgba(9, 12, 23, 0.97);
      border: 1px solid rgba(255,255,255,0.08);
      border-top: 2px solid ${clr};
      border-radius: 10px;
      font-family: 'Inter', 'Segoe UI', ui-sans-serif, sans-serif;
      z-index: 20;
      box-shadow: 0 12px 40px rgba(0,0,0,0.7);
      overflow: hidden;
      pointer-events: auto;
      max-height: calc(100% - 20px);
      overflow-y: auto;
    `;

    panel.innerHTML = `
      <style>
        #brain3dDetailPanel { font-size: 11px; color: #cbd5e1; }
        #brain3dDetailPanel::-webkit-scrollbar { width: 3px; }
        #brain3dDetailPanel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .dp-sec { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .dp-sec:last-child { border-bottom: none; }
        .dp-lbl { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
        .dp-val { font-weight: 700; font-family: ui-monospace, monospace; }
        .dp-row { display: flex; justify-content: space-between; align-items: center; }
        .dp-bar { height: 4px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; margin: 5px 0; }
        .dp-badge { display: inline-flex; gap: 3px; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; }
        .dp-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
        .dp-g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; }
        .dp-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; padding: 6px 8px; text-align: center; }
        .dp-box-val { font-size: 13px; font-weight: 700; font-family: ui-monospace, monospace; margin-top: 2px; }
        .dp-box-unit { font-size: 7px; color: #334155; margin-top: 1px; }
        .dp-close-btn { background: rgba(255,255,255,0.05); border: none; border-radius: 5px; color: #64748b; width: 22px; height: 22px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; line-height: 1; }
        .dp-close-btn:hover { background: rgba(255,255,255,0.1); color: #94a3b8; }
      </style>

      <!-- HEADER -->
      <div class="dp-sec" style="padding:9px 12px;background:rgba(0,0,0,0.2);">
        <div class="dp-row">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:5px;height:5px;border-radius:50%;background:${clr};box-shadow:0 0 5px ${clr};"></div>
            <span style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">Detail Analysis</span>
          </div>
          <button class="dp-close-btn" onclick="window._closeDetailPanel()" title="Close">✕</button>
        </div>
      </div>

      <!-- STATUS -->
      <div class="dp-sec">
        <div class="dp-row">
          <div>
            <div class="dp-lbl">Detection Status</div>
            <div style="color:#ef4444;font-weight:700;font-size:12px;margin-top:3px;">Tumor Detected</div>
          </div>
          <div style="text-align:right;">
            <div class="dp-lbl" style="margin-bottom:3px;">Risk Level</div>
            <div class="dp-badge" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:${clr};">
              <span style="font-size:8px;">●</span> ${risk.label}
            </div>
          </div>
        </div>
      </div>

      <!-- CONFIDENCE + DEPTH -->
      <div class="dp-sec">
        <div class="dp-row" style="align-items:flex-start;">

          <!-- Confidence -->
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="position:relative;width:40px;height:40px;flex-shrink:0;">
              <svg width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="15" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="4"/>
                <circle cx="20" cy="20" r="15" fill="none" stroke="#22c55e" stroke-width="4"
                  stroke-dasharray="${round(conf/100*94.2, 1)} 94.2"
                  stroke-linecap="round" transform="rotate(-90 20 20)"/>
              </svg>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:9px;font-weight:700;color:#22c55e;font-family:ui-monospace,monospace;">${conf}%</div>
            </div>
            <div>
              <div class="dp-lbl">Confidence</div>
              <div style="font-size:9px;color:#374151;margin-top:1px;">CNN Model</div>
            </div>
          </div>

          <!-- Depth -->
          <div style="text-align:right;">
            <div class="dp-lbl">Depth from Cortex</div>
            <div style="margin-top:3px;">
              <span style="font-size:22px;font-weight:700;color:${clr};font-family:ui-monospace,monospace;">${depth != null ? depth.toFixed(1) : '—'}</span>
              <span style="font-size:9px;color:#475569;"> mm</span>
            </div>
            <div style="font-size:8px;color:${clr};opacity:0.65;margin-top:1px;">${cat.label || ''}</div>
          </div>
        </div>

        <!-- Depth bar -->
        <div class="dp-bar" style="margin-top:10px;">
          <div style="height:100%;width:${depthPct}%;background:linear-gradient(90deg,#ef4444,#f97316,#eab308,${clr});border-radius:2px;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:7px;color:#1e3a52;">
          <span>Superficial</span><span>15mm</span><span>30mm</span><span>45mm</span><span>Deep</span>
        </div>
      </div>

      <!-- SURGICAL MARGIN -->
      <div class="dp-sec">
        <div class="dp-row" style="margin-bottom:6px;">
          <span class="dp-lbl">Surgical Safety</span>
          <span class="dp-badge" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:${marginClr};">${marginSafe}</span>
        </div>
        <div class="dp-g2">
          <div class="dp-box">
            <div class="dp-lbl">To Cortex</div>
            <div class="dp-box-val" style="color:${marginClr};">${distCortex.toFixed(1)}<span style="font-size:8px;color:#475569;"> mm</span></div>
          </div>
          <div class="dp-box">
            <div class="dp-lbl">Tumor Size</div>
            <div class="dp-box-val" style="color:#94a3b8;font-size:10px;">${bboxText}</div>
          </div>
        </div>
      </div>

      <!-- ANATOMICAL -->
      <div class="dp-sec">
        <div class="dp-lbl" style="margin-bottom:5px;">Anatomical Region</div>
        <div style="font-size:11px;font-weight:600;color:#e2e8f0;">${pred.location_hint || '—'}</div>
        <div style="font-size:8px;color:${lobe.color};margin-top:3px;line-height:1.5;">${lobe.fn}</div>
      </div>

      <!-- MEASUREMENTS -->
      <div class="dp-sec">
        <div class="dp-lbl" style="margin-bottom:6px;">Measurements</div>
        <div class="dp-g3">
          <div class="dp-box">
            <div class="dp-lbl">Volume</div>
            <div class="dp-box-val" style="color:#60a5fa;">${metrics.volume_cm3 != null ? metrics.volume_cm3.toFixed(2) : '—'}</div>
            <div class="dp-box-unit">cm³</div>
          </div>
          <div class="dp-box">
            <div class="dp-lbl">Area</div>
            <div class="dp-box-val" style="color:#fb923c;">${metrics.area_mm2 != null ? metrics.area_mm2.toFixed(0) : (area != null ? (area/100*256*256*0.25).toFixed(0) : '—')}</div>
            <div class="dp-box-unit">mm²</div>
          </div>
          <div class="dp-box">
            <div class="dp-lbl">Slice %</div>
            <div class="dp-box-val" style="color:#f87171;">${area != null ? area.toFixed(1) : '—'}</div>
            <div class="dp-box-unit">%</div>
          </div>
        </div>
      </div>

      <!-- CENTROID -->
      <div class="dp-sec">
        <div class="dp-lbl" style="margin-bottom:6px;">Tumor Centroid (mm)</div>
        <div class="dp-g3">
          <div class="dp-box" style="border-color:rgba(239,68,68,0.2);">
            <div class="dp-lbl">X</div>
            <div class="dp-box-val" style="color:#f87171;">${(dm.centroid_3d?.[0] ?? metrics.centroid_mm?.[0] ?? 0).toFixed(1)}</div>
          </div>
          <div class="dp-box" style="border-color:rgba(96,165,250,0.2);">
            <div class="dp-lbl">Y</div>
            <div class="dp-box-val" style="color:#60a5fa;">${(dm.centroid_3d?.[1] ?? metrics.centroid_mm?.[1] ?? 0).toFixed(1)}</div>
          </div>
          <div class="dp-box" style="border-color:rgba(52,211,153,0.2);">
            <div class="dp-lbl">Z</div>
            <div class="dp-box-val" style="color:#34d399;">${(dm.centroid_3d?.[2] ?? metrics.centroid_mm?.[2] ?? 0).toFixed(1)}</div>
          </div>
        </div>
      </div>

      <!-- CLINICAL NOTE -->
      <div class="dp-sec" style="background:rgba(255,255,255,0.015);">
        <div style="font-size:8.5px;color:#64748b;line-height:1.65;">${_getClinicalNote(cat.category, depth)}</div>
      </div>

      <!-- FOOTER -->
      <div style="padding:6px 12px;background:rgba(0,0,0,0.3);display:flex;justify-content:space-between;">
        <span style="font-size:7px;color:#1e293b;letter-spacing:0.5px;">NEUROSCAN AI</span>
        <span style="font-size:7px;color:#1e293b;">U-Net v1.0</span>
      </div>
    `;

    window._closeDetailPanel = function() {
      const p = document.getElementById('brain3dDetailPanel');
      if (p) p.remove();
      if (typeof isDetailView !== 'undefined') isDetailView = false;
      const indicator = document.getElementById('sliceIndicator');
      if (indicator) indicator.style.display = 'none';
      const btn = document.getElementById('btnSlice');
      if (btn) btn.classList.remove('active');
    };

    const viewer = document.getElementById('viewer3d');
    if (viewer) {
      if (getComputedStyle(viewer).position === 'static') viewer.style.position = 'relative';
      viewer.appendChild(panel);
    }
  }

'''

# Replace the section
new_content = content[:start_idx] + new_fn + content[end_idx:]

with open(r'd:\Dự án - python\Brain_MRI\frontend\brain3d_new.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done. New file size:', len(new_content))
