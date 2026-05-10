/* global THREE, window, document, console, requestAnimationFrame, Event */
(function Brain3DClinicalEnhancerModule() {
  'use strict';

  const MAIN = {
    ctx: null,
    ui: null,
    diagnosisData: null,
    overlayRoot: null,
    tooltipLayer: null,
    tooltipNodes: new Map(),
    tooltipSpecs: [],
    tooltipStateKey: '',
    tooltipSelections: {},
    tooltipPanelOpen: false,
    diagnosisContextKey: '',
    clipPlanes: null,
    slicePlaneMeshes: {},
    functionalGroup: null,
    safetyMarginGroup: null,
    attentionCloudGroup: null,
    similarWireframeGroup: null,
    tumorComponentGroup: null,
    trajectoryGroup: null,
    lastMesh: null,
    tumorCenter: null,
    tumorRadius: 0.11,
    riskSummary: [],
    attentionCloudSamples: null,
    attentionCloudCacheKey: '',
    attentionCloudLoadId: 0,
    similarData: null,
    lastRotationKey: '',
    pendingReset: true,
    lastExpandedHeight: 0,
    preferredViewerMinHeight: 420,
    dockCollapsed: false,
  };

  const COMPARE = {
    modal: null,
    toolbar: null,
    leftSlices: null,
    referenceSummary: null,
    scenes: new Map(),
    state: null,
    diagnosisData: null,
    activeRefLocKey: '',
    similarity: 0,
  };

  const REGION_RADIUS_MM = 55;
  const MAIN_SCENE_RADIUS = 1.08; // Bán kính chính của mô hình não 
  const COMPARE_SCENE_RADIUS = 1.40;
  const COMPARE_TUMOR_VISUAL_SCALE = 1.24; // Tỷ lệ phóng đại hình ảnh khối u trong chế độ so sánh, giúp bác sĩ dễ dàng nhận diện sự khác biệt về hình thái giữa ca hiện tại và ca tham chiếu.
  const TOOLTIP_SELECTION_STORAGE_KEY = 'brain3d.tooltip.selection.v2';
  const CLINICAL_STATE_STORAGE_KEY = 'brain3d.clinical.state.v4';
  const TRAJECTORY_ACCENTS = ['#22c55e', '#14b8a6', '#38bdf8', '#84cc16', '#06b6d4', '#a855f7'];
  const TRAJECTORY_LABEL_RATIOS = [0.14, 0.18, 0.22, 0.26, 0.16, 0.24];
  const SIMILAR_TUMOR_LOCATION_MAP = {
    left_frontal: [-0.50, 0.60, 0.35],
    right_frontal: [0.50, 0.60, 0.35],
    left_temporal: [-0.75, 0.00, 0.45],
    right_temporal: [0.75, 0.00, 0.45],
    left_parietal: [-0.45, 0.55, -0.50],
    right_parietal: [0.45, 0.55, -0.50],
    left_occipital: [-0.30, 0.20, -0.80],
    right_occipital: [0.30, 0.20, -0.80],
    left_central: [-0.18, 0.36, 0.00],
    right_central: [0.18, 0.36, 0.00],
  };

  const FUNCTIONAL_ZONE_BLUEPRINTS = [
    {
      id: 'motor',
      label: 'Vỏ vận động',
      risk: 'Yếu/liệt đối bên',
      color: '#ef4444',
      colorSoft: 'rgba(239,68,68,0.16)',
      anchor: [-0.58, 0.22, 0.18],
      radius: 0.12,
      mirror: true,
    },
    {
      id: 'sensory',
      label: 'Vỏ cảm giác',
      risk: 'Giảm cảm giác',
      color: '#14b8a6',
      colorSoft: 'rgba(20,184,166,0.16)',
      anchor: [-0.50, 0.14, 0.02],
      radius: 0.11,
      mirror: true,
    },
    {
      id: 'broca',
      label: 'Vùng Broca',
      risk: 'Khó nói / mất ngôn ngữ diễn đạt',
      color: '#f59e0b',
      colorSoft: 'rgba(245,158,11,0.16)',
      anchor: [-0.66, 0.03, 0.26],
      radius: 0.10,
      mirror: false,
    },
    {
      id: 'wernicke',
      label: 'Vùng Wernicke',
      risk: 'Khó hiểu ngôn ngữ',
      color: '#8b5cf6',
      colorSoft: 'rgba(139,92,246,0.16)',
      anchor: [-0.58, -0.03, -0.10],
      radius: 0.10,
      mirror: false,
    },
    {
      id: 'visual',
      label: 'Vỏ thị giác',
      risk: 'Rối loạn trường nhìn',
      color: '#3b82f6',
      colorSoft: 'rgba(59,130,246,0.16)',
      anchor: [-0.10, 0.04, -0.72],
      radius: 0.12,
      mirror: true,
    },
  ];

  function defaultMainState() {
    return {
      clip: { axial: 1.0, coronal: 1.0, sagittal: 1.0 },
      manualClipAdjusted: false,
      showFunctional: true,
      showRiskShell: true,
      showAttentionCloud: true,
      showSimilarWireframe: true,
      showPath: true,
      showTooltips: true,
      cortexOpacity: 1.0,
      deepOpacity: 0.21,
      safetyMarginMm: 8,
      showCore: true,
      showEdema: true,
      showEnhancing: true,
      activeView: 'axial',
      customEntries: [],
      customEntry: null,
    };
  }

  function defaultCompareState() {
    return {
      clip: { axial: 0.99, coronal: 1.0, sagittal: 1.0 },
      showFunctional: true,
      showPath: true,
      cortexOpacity: 1.0,
      deepOpacity: 0.15,
      showCore: true,
      showEdema: true,
      showEnhancing: true,
      activeView: 'axial',
    };
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function formatCompareLocKey(value) {
    return String(value || '').replace(/_/g, ' ').trim();
  }

  function normalizeClinicalState(state) {
    const defaults = defaultMainState();
    const parsed = Object.assign({}, defaults, state || {});
    const clip = parsed.clip || defaults.clip;
    parsed.clip = {
      axial: clamp01(clip.axial ?? defaults.clip.axial),
      coronal: clamp01(clip.coronal ?? defaults.clip.coronal),
      sagittal: clamp01(clip.sagittal ?? defaults.clip.sagittal),
    };
    parsed.cortexOpacity = Math.max(0.1, Math.min(1.0, clamp01(parsed.cortexOpacity)));
    parsed.deepOpacity = Math.max(0.1, Math.min(1.0, clamp01(parsed.deepOpacity)));
    parsed.activeView = ['axial', 'coronal', 'sagittal'].includes(parsed.activeView) ? parsed.activeView : defaults.activeView;
    parsed.manualClipAdjusted = !!parsed.manualClipAdjusted;
    parsed.showFunctional = parsed.showFunctional !== false;
    parsed.showRiskShell = parsed.showRiskShell !== false;
    parsed.showAttentionCloud = parsed.showAttentionCloud !== false;
    parsed.showSimilarWireframe = parsed.showSimilarWireframe !== false;
    parsed.showPath = parsed.showPath !== false;
    parsed.showTooltips = parsed.showTooltips !== false;
    parsed.showCore = parsed.showCore !== false;
    parsed.showEdema = parsed.showEdema !== false;
    parsed.showEnhancing = parsed.showEnhancing !== false;
    parsed.safetyMarginMm = clamp(parsed.safetyMarginMm ?? defaults.safetyMarginMm, 0, 20);
    syncLegacyCustomEntryState(parsed);
    return parsed;
  }


  // Màn hình 3D chính < ---------------
  function getPreferredMainViewerMinHeight() {
    return Math.round(Math.max(400, Math.min(460, window.innerHeight * 0.70)));
  }


  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function mmToScene(mm, sceneRadius) {
    return (mm / REGION_RADIUS_MM) * sceneRadius;
  }



  function sceneToMm(sceneUnits, sceneRadius) {
    return (sceneUnits / sceneRadius) * REGION_RADIUS_MM;
  }

  function axisValueToScene(value, sceneRadius) {
    return lerp(-sceneRadius, sceneRadius, clamp01(value));
  }

  function inferAxialFromDepth(depthMetrics) {
    const depthMm = depthMetrics?.tumor_depth_mm;
    if (typeof depthMm !== 'number' || Number.isNaN(depthMm)) return 0.58;
    return clamp01(1 - depthMm / 55);
  }

  function buildClipFromDiagnosis(diagnosisData) {
    const crosshair = diagnosisData?.slices?.crosshair || {};
    const pred = diagnosisData?.prediction || {};
    const sagittal = clamp01(
      typeof crosshair.cx === 'number'
        ? crosshair.cx
        : (pred.centroid_normalized?.[0] != null ? pred.centroid_normalized[0] * 0.5 + 0.5 : 0.5)
    );
    const coronal = clamp01(
      typeof crosshair.cy === 'number'
        ? crosshair.cy
        : (pred.centroid_normalized?.[1] != null ? 0.5 - pred.centroid_normalized[1] * 0.5 : 0.5)
    );
    const axial = inferAxialFromDepth(diagnosisData?.depth_metrics);
    return { axial, coronal, sagittal };
  }

  function getRotationEuler(ctx) {
    const rotation = ctx?.getRotation ? ctx.getRotation() : { x: 0, y: 0 };
    return new THREE.Euler(rotation.x || 0, rotation.y || 0, 0, 'XYZ');
  }

  function applyVectorRotation(point, euler) {
    return point.clone().applyEuler(euler);
  }
  function averageTumorPoints(tumorPoints, sceneRadius) {
    if (!Array.isArray(tumorPoints) || tumorPoints.length === 0) return null;
    const sum = tumorPoints.reduce((acc, point) => {
      acc.x += Number(point[0]) || 0;
      acc.y += Number(point[1]) || 0;
      acc.z += Number(point[2]) || 0;
      return acc;
    }, { x: 0, y: 0, z: 0 });
    return new THREE.Vector3(
      mmToScene(sum.x / tumorPoints.length, sceneRadius),
      mmToScene(sum.y / tumorPoints.length, sceneRadius),
      mmToScene(sum.z / tumorPoints.length, sceneRadius)
    );

  }

  function computeTumorRadiusFromPoints(tumorPoints, center, sceneRadius) {
    if (!center || !Array.isArray(tumorPoints) || !tumorPoints.length) return 0.12;
    let maxDist = 0;
    for (const point of tumorPoints) {
      const local = new THREE.Vector3(
        mmToScene(point[0] || 0, sceneRadius),
        mmToScene(point[1] || 0, sceneRadius),
        mmToScene(point[2] || 0, sceneRadius)
      );

      maxDist = Math.max(maxDist, local.distanceTo(center));
    }
    return Math.max(0.07, Math.min(sceneRadius * 0.22, maxDist * 1.15));
  }

  function deriveTumorCenter(diagnosisData, tumorPoints, sceneRadius) {
    const averaged = averageTumorPoints(tumorPoints, sceneRadius);
    if (averaged) return averaged;
    const centroid3d = diagnosisData?.depth_metrics?.centroid_3d;
    if (Array.isArray(centroid3d) && centroid3d.length === 3) {
      return new THREE.Vector3(
        mmToScene(centroid3d[0], sceneRadius),
        mmToScene(centroid3d[1], sceneRadius),
        mmToScene(centroid3d[2], sceneRadius)
      );
    }

    const pred = diagnosisData?.prediction || {};
    const x = (pred.centroid_normalized?.[0] || 0) * sceneRadius * 0.52;
    const y = -(pred.centroid_normalized?.[1] || 0) * sceneRadius * 0.34;
    const z = axisValueToScene(inferAxialFromDepth(diagnosisData?.depth_metrics), sceneRadius);
    return new THREE.Vector3(x, y, z);
  }

  function deriveMainTumorCenter(diagnosisData, tumorPoints) {
    return deriveTumorCenter(diagnosisData, tumorPoints, MAIN_SCENE_RADIUS);
  }

  // Xác định thông tin điểm vào não <----------------------
  function deriveDefaultEntryPoint(center, depthMetrics, sceneRadius) {
    if (depthMetrics?.nearest_cortex_point && Array.isArray(depthMetrics.nearest_cortex_point)) {
      return new THREE.Vector3(
        mmToScene(depthMetrics.nearest_cortex_point[0], sceneRadius),
        mmToScene(depthMetrics.nearest_cortex_point[1], sceneRadius),
        mmToScene(depthMetrics.nearest_cortex_point[2], sceneRadius)
      );

    }
    const fallback = center.clone();
    if (fallback.lengthSq() < 0.0001) {
      fallback.set(0.01, sceneRadius * 0.88, 0.01);
    } else {
      fallback.normalize().multiplyScalar(sceneRadius * 1.02);
    }
    return fallback;
  }
  function parseLocationInfo(locationHint) {
    const hint = String(locationHint || '').toLowerCase();
    return {
      isLeft: hint.includes('left'),
      isRight: hint.includes('right'),
      frontal: hint.includes('frontal'),
      temporal: hint.includes('temporal'),
      parietal: hint.includes('parietal'),
      occipital: hint.includes('occipital'),
      central: hint.includes('central'),
      label: locationHint || 'Chưa rõ vị trí',
    };
  }

  function locationHintToKey(locationHint) {
    const info = parseLocationInfo(locationHint);
    const side = info.isRight ? 'right' : 'left';
    const lobe = info.frontal
      ? 'frontal'
      : info.temporal
        ? 'temporal'
        : info.parietal
          ? 'parietal'
          : info.occipital
            ? 'occipital'
            : info.central
              ? 'central'
              : 'frontal';
    return `${side}_${lobe}`;
  }

  function inferSimilarCaseLocation(caseItem) {
    const pid = String(caseItem?.patient_id || '');
    const filename = String(caseItem?.filename || '');
    const caseId = Number(caseItem?.case_id) || 0;
    const numMatch = (pid + filename).match(/\d+/);
    const seed = numMatch ? parseInt(numMatch[0], 10) : caseId;
    const lobes = ['frontal', 'temporal', 'parietal', 'occipital', 'central'];
    const sides = ['left', 'right'];
    const lobe = lobes[Math.abs(seed) % lobes.length];
    const side = sides[Math.floor(Math.abs(seed) / lobes.length) % sides.length];
    return `${side}_${lobe}`;
  }

  function getSceneAnchorFromLocationKey(locationKey, sceneRadius) {
    const anchor = SIMILAR_TUMOR_LOCATION_MAP[locationKey] || SIMILAR_TUMOR_LOCATION_MAP.left_frontal;
    return new THREE.Vector3(
      anchor[0] * sceneRadius * 0.72,
      anchor[1] * sceneRadius * 0.62,
      anchor[2] * sceneRadius * 0.76
    );
  }

  function getActiveSimilarCases() {
    return MAIN.similarData?.similar_cases
      || window.lastSimilarData?.similar_cases
      || window._similarCasesData
      || [];
  }

  function pseudoRandom(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function colorFromAttention(intensity) {
    const low = new THREE.Color('#38bdf8');
    const mid = new THREE.Color('#facc15');
    const high = new THREE.Color('#ef4444');
    if (intensity < 0.45) {
      return low.clone().lerp(mid, intensity / 0.45);
    }
    return mid.clone().lerp(high, (intensity - 0.45) / 0.55);
  }

  function buildFunctionalZones(sceneRadius) {
    const zones = [];
    for (const blueprint of FUNCTIONAL_ZONE_BLUEPRINTS) {
      const variants = blueprint.mirror
        ? [{ side: 'left', sign: -1 }, { side: 'right', sign: 1 }]
        : [{ side: 'left', sign: -1 }];

      for (const variant of variants) {
        zones.push({
          id: `${blueprint.id}-${variant.side}`,
          label: blueprint.label + (blueprint.mirror ? ` ${variant.side === 'left' ? '(Trái)' : '(Phải)'}` : ''),
          risk: blueprint.risk,
          color: blueprint.color,
          colorSoft: blueprint.colorSoft,
          position: new THREE.Vector3(
            blueprint.anchor[0] * sceneRadius * Math.abs(variant.sign),
            blueprint.anchor[1] * sceneRadius,
            blueprint.anchor[2] * sceneRadius
          ),
          radius: blueprint.radius * sceneRadius,
          side: variant.side,
        });
      }
    }

    for (const zone of zones) {
      if (zone.side === 'right') {
        zone.position.x *= -1;
      }
    }

    return zones;
  }

  function computeFunctionalRiskSummary(center, sceneRadius, locationHint, tumorRadius = 0.11, safetyMarginMm = 0) {
    if (!center) return [];
    const zones = buildFunctionalZones(sceneRadius);
    const mmScale = REGION_RADIUS_MM / sceneRadius;
    const tumorRadiusMm = sceneToMm(tumorRadius, sceneRadius);
    const locationInfo = parseLocationInfo(locationHint);
    return zones
      .map(zone => {
        const centerDistanceMm = center.distanceTo(zone.position) * mmScale;
        const zoneRadiusMm = sceneToMm(zone.radius, sceneRadius);
        const distanceMm = Math.max(0, centerDistanceMm - tumorRadiusMm - zoneRadiusMm);
        const marginDeltaMm = distanceMm - safetyMarginMm;
        const risk = distanceMm < 10 ? 'Rất gần' : distanceMm < 18 ? 'Lân cận' : distanceMm < 28 ? 'Cần theo dõi' : 'Xa';
        const relevanceBoost =
          ((locationInfo.isLeft && zone.side === 'left') || (locationInfo.isRight && zone.side === 'right') || (!locationInfo.isLeft && !locationInfo.isRight))
            ? 0
            : 8;
        return {
          ...zone,
          centerDistanceMm,
          distanceMm,
          zoneRadiusMm,
          tumorRadiusMm,
          safetyMarginMm,
          marginDeltaMm,
          impacted: marginDeltaMm <= 0,
          collisionState: marginDeltaMm <= 0 ? 'collision' : marginDeltaMm <= 4 ? 'warning' : 'clear',
          risk,
          score: distanceMm + relevanceBoost,
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 4);
  }

  function formatMm(value) {
    return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} mm` : '—';
  }

  function pickReferenceSimilarCase() {
    const cases = getActiveSimilarCases();
    if (!Array.isArray(cases) || !cases.length) return null;
    const currentKey = locationHintToKey(MAIN.diagnosisData?.prediction?.location_hint);
    const currentInfo = parseLocationInfo(currentKey);

    const pool = cases.filter(item => item && (item.has_tumor === true || item.has_tumor === 1 || item.has_tumor === 'true'));
    const source = pool.length ? pool : cases;

    return source
      .map((caseItem, index) => {
        const similarity = clamp(Number(caseItem?.similarity_score) || 0, 0, 1);
        const refKey = inferSimilarCaseLocation(caseItem);
        const refInfo = parseLocationInfo(refKey);
        const sameSide = (currentInfo.isLeft && refInfo.isLeft) || (currentInfo.isRight && refInfo.isRight);
        const sameLobe =
          (currentInfo.frontal && refInfo.frontal)
          || (currentInfo.temporal && refInfo.temporal)
          || (currentInfo.parietal && refInfo.parietal)
          || (currentInfo.occipital && refInfo.occipital)
          || (currentInfo.central && refInfo.central);
        const score = similarity + (sameSide ? 0.05 : 0) + (sameLobe ? 0.08 : 0) - index * 0.0025;
        return {
          caseItem,
          refKey,
          similarity,
          sameSide,
          sameLobe,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)[0] || null;
  }

  function computeSafetyMarginSummary() {
    const nearest = MAIN.riskSummary?.[0] || null;
    const impacted = (MAIN.riskSummary || []).filter(item => item.impacted);
    // Warning if margin is within 6mm of a zone boundary
    const warning = !impacted.length && nearest && nearest.marginDeltaMm <= 6;

    const tone = impacted.length ? '#ef5070ff' : warning ? '#ff9100' : '#10b981';

    const label = impacted.length
      ? `NGUY HIỂM: ${impacted.length} vùng bị xâm phạm`
      : warning
        ? 'CẢNH BÁO: Sát ranh giới chức năng'
        : 'AN TOÀN: Ngoài vùng rủi ro';

    return {
      nearest,
      impacted,
      warning,
      tone,
      label,
    };
  }

  function normalizeEntryPoint(value) {
    if (!value) return null;
    if (value instanceof THREE.Vector3) return value.clone();
    if (Array.isArray(value) && value.length >= 3) {
      return new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    }
    if (typeof value === 'object') {
      const x = Number(value.x);
      const y = Number(value.y);
      const z = Number(value.z);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        return new THREE.Vector3(x, y, z);
      }
    }
    return null;
  }

  function normalizeEntryList(values) {
    if (!Array.isArray(values)) return [];
    return values
      .map(value => normalizeEntryPoint(value))
      .filter(Boolean);
  }

  function syncLegacyCustomEntryState(state) {
    if (!state || typeof state !== 'object') return state;
    const customEntries = normalizeEntryList(state.customEntries);
    const legacyEntry = normalizeEntryPoint(state.customEntry);
    state.customEntries = customEntries.length
      ? customEntries
      : (legacyEntry ? [legacyEntry] : []);
    state.customEntry = state.customEntries.length
      ? state.customEntries[state.customEntries.length - 1].clone()
      : null;
    return state;
  }

  function getCustomEntryPoints(state = MAIN.state) {
    if (!state) return [];
    syncLegacyCustomEntryState(state);
    return state.customEntries.map(entry => entry.clone());
  }

  function setCustomEntryPoints(entries, state = MAIN.state) {
    if (!state) return [];
    state.customEntries = normalizeEntryList(entries);
    state.customEntry = state.customEntries.length
      ? state.customEntries[state.customEntries.length - 1].clone()
      : null;
    return getCustomEntryPoints(state);
  }

  function clearCustomEntryPoints(state = MAIN.state) {
    return setCustomEntryPoints([], state);
  }

  function addCustomEntryPoint(entryPoint, state = MAIN.state) {
    const nextEntries = getCustomEntryPoints(state);
    const nextEntry = normalizeEntryPoint(entryPoint);
    if (!nextEntry) return nextEntries;
    nextEntries.push(nextEntry);
    return setCustomEntryPoints(nextEntries, state);
  }

  function getTrajectoryAccent(index, isManual) {
    return isManual ? TRAJECTORY_ACCENTS[index % TRAJECTORY_ACCENTS.length] : TRAJECTORY_ACCENTS[0];
  }

  function computePathLengthMm(entryPoint, tumorCenter, sceneRadius) {
    if (!entryPoint || !tumorCenter || !sceneRadius) return null;
    return entryPoint.distanceTo(tumorCenter) * (REGION_RADIUS_MM / sceneRadius);
  }

  function getTrajectoryEntries(tumorCenter, depthMetrics, sceneRadius, state = MAIN.state) {
    if (!tumorCenter) return [];
    const customEntries = getCustomEntryPoints(state);
    const manual = customEntries.length > 0;
    const entryPoints = manual
      ? customEntries
      : [deriveDefaultEntryPoint(tumorCenter, depthMetrics, sceneRadius)];

    return entryPoints.map((entryPoint, index) => ({
      key: manual ? `custom-path-${index}` : 'default-path',
      index,
      manual,
      entryPoint: entryPoint.clone(),
      lengthMm: computePathLengthMm(entryPoint, tumorCenter, sceneRadius),
      label: manual ? `Điểm vào ${index + 1}` : 'Điểm vào tự động',
      shortLabel: manual ? `#${index + 1}` : 'AUTO',
    }));
  }

  function disposeObject3D(root) {
    if (!root?.traverse) return;
    root.traverse(node => {
      if (node.geometry?.dispose) {
        node.geometry.dispose();
      }
      const materials = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
      materials.forEach(material => {
        if (material?.map?.dispose) material.map.dispose();
        if (material?.dispose) material.dispose();
      });
    });
  }

  function computeTrajectoryLabelPosition(entryPoint, tumorCenter, index) {
    const ratio = TRAJECTORY_LABEL_RATIOS[index % TRAJECTORY_LABEL_RATIOS.length];
    return entryPoint.clone().lerp(tumorCenter, ratio);
  }

  function createTrajectoryMetricSprite(lengthMm, accentHex) {
    if (typeof THREE === 'undefined' || typeof document === 'undefined') return null;
    const label = formatMm(lengthMm);
    const fontSize = 11;
    const padX = 12;
    const probe = document.createElement('canvas');
    const probeCtx = probe.getContext('2d');
    if (!probeCtx) return null;
    probeCtx.font = `700 ${fontSize}px "Segoe UI", Arial`;
    const textWidth = Math.ceil(probeCtx.measureText(label).width);
    const width = Math.max(88, textWidth + padX * 2);
    const height = 36;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = 'rgba(8, 14, 26, 0.86)';
    ctx.beginPath();
    ctx.roundRect?.(1.5, 1.5, width - 3, height - 3, 12) || ctx.rect(1.5, 1.5, width - 3, height - 3);
    ctx.fill();

    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect?.(1.5, 1.5, width - 3, height - 3, 12) || ctx.rect(1.5, 1.5, width - 3, height - 3);
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.00)');
    grad.addColorStop(0.5, accentHex);
    grad.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = grad;
    ctx.fillRect(8, 0, width - 16, 2);

    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 ${fontSize}px "Segoe UI", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, width / 2, height / 2 + 1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    const scaleFactor = width / height;
    const heightUnits = 0.078;
    sprite.scale.set(heightUnits * scaleFactor, heightUnits, 1);
    sprite.renderOrder = 14;
    return sprite;
  }

  // Thông tin từ heatmap <-------------------------
  function decodeHeatmapSamples(dataUrl) {
    return new Promise(resolve => {
      if (!dataUrl || typeof Image === 'undefined') {
        resolve([]);
        return;
      }
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 64;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve([]);
            return;
          }
          ctx.drawImage(image, 0, 0, 64, 64);
          const pixels = ctx.getImageData(0, 0, 64, 64).data;
          const samples = [];
          for (let y = 0; y < 64; y += 2) {
            for (let x = 0; x < 64; x += 2) {
              const idx = (y * 64 + x) * 4;
              const intensity = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / (255 * 3);
              if (intensity < 0.12) continue;
              samples.push({
                u: x / 63,
                v: y / 63,
                intensity,
              });
            }
          }
          resolve(samples);
        } catch (error) {
          resolve([]);
        }
      };
      image.onerror = () => resolve([]);
      image.src = dataUrl;
    });
  }

  function queueAttentionCloudSampleRefresh() {
    const gradcam = MAIN.diagnosisData?.xai?.gradcam || MAIN.diagnosisData?.xai_data?.gradcam || null;
    const heatmap = gradcam?.heatmap_base64 || '';
    const cacheKey = `${MAIN.diagnosisContextKey}|${heatmap.slice(0, 48)}|${heatmap.length}`;
    if (!heatmap) {
      MAIN.attentionCloudSamples = [];
      MAIN.attentionCloudCacheKey = '';
      return Promise.resolve([]);
    }
    if (MAIN.attentionCloudCacheKey === cacheKey && Array.isArray(MAIN.attentionCloudSamples)) {
      return Promise.resolve(MAIN.attentionCloudSamples);
    }
    MAIN.attentionCloudCacheKey = cacheKey;
    const loadId = ++MAIN.attentionCloudLoadId;
    return decodeHeatmapSamples(heatmap).then(samples => {
      if (loadId !== MAIN.attentionCloudLoadId) return MAIN.attentionCloudSamples || [];
      MAIN.attentionCloudSamples = samples;
      applyMainAttentionCloud();
      syncMainUI();
      return samples;
    });
  }

  function buildOrganicWireframeGeometry(radius, seed) {
    const geometry = new THREE.IcosahedronGeometry(radius, 2);
    const pos = geometry.attributes.position;
    const point = new THREE.Vector3();
    const stretchX = 0.92 + pseudoRandom(seed + 1.3) * 0.22;
    const stretchY = 0.88 + pseudoRandom(seed + 2.7) * 0.18;
    const stretchZ = 0.94 + pseudoRandom(seed + 4.1) * 0.20;

    for (let idx = 0; idx < pos.count; idx += 1) {
      point.fromBufferAttribute(pos, idx);
      const wobble = 0.88 + pseudoRandom(seed + idx * 0.73) * 0.28;
      point.x *= stretchX * wobble;
      point.y *= stretchY * (0.95 + pseudoRandom(seed + idx * 0.29) * 0.10);
      point.z *= stretchZ * (0.92 + pseudoRandom(seed + idx * 0.51) * 0.14);
      pos.setXYZ(idx, point.x, point.y, point.z);
    }

    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  function loadStoredTooltipSelections() {
    try {
      const raw = window.localStorage.getItem(TOOLTIP_SELECTION_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function persistTooltipSelections() {
    try {
      window.localStorage.setItem(TOOLTIP_SELECTION_STORAGE_KEY, JSON.stringify(MAIN.tooltipSelections || {}));
    } catch (error) {
      // Ignore storage issues in restricted browsers.
    }
  }

  function loadStoredClinicalState() {
    try {
      const raw = window.localStorage.getItem(CLINICAL_STATE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);

      // Restore diagnosis context key if present
      if (parsed.diagnosisContextKey) {
        MAIN.diagnosisContextKey = parsed.diagnosisContextKey;
      }

      if (parsed.state) {
        return normalizeClinicalState(parsed.state);
      } else {
        return normalizeClinicalState(parsed);
      }
    } catch (error) {
      console.warn('[ClinicalTools] Load state error:', error);
      return null;
    }
  }

  function persistClinicalState() {
    try {
      const customEntries = getCustomEntryPoints(MAIN.state).map(entry => ({
        x: entry.x,
        y: entry.y,
        z: entry.z,
      }));
      const dataToSave = {
        state: {
          ...MAIN.state,
          customEntries,
          customEntry: customEntries.length ? customEntries[customEntries.length - 1] : null,
        },
        diagnosisContextKey: MAIN.diagnosisContextKey
      };
      window.localStorage.setItem(CLINICAL_STATE_STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      // Ignore storage issues
    }
  }

  function isMainTooltipSelected(key) {
    return MAIN.tooltipSelections?.[key] !== false;
  }

  function setMainTooltipSelected(key, isSelected) {
    if (!key) return;
    if (!MAIN.tooltipSelections) MAIN.tooltipSelections = {};
    MAIN.tooltipSelections[key] = !!isSelected;
    persistTooltipSelections();
  }

  function getDepthTone(depthMetrics) {
    const category = String(depthMetrics?.depth_category?.category || '').toUpperCase();
    if (category === 'SUPERFICIAL' || category === 'OUTSIDE') {
      return { accent: '#ef4444', label: 'Nông / sát vỏ não' };
    }
    if (category === 'SHALLOW') {
      return { accent: '#f97316', label: 'Nông vừa' };
    }
    if (category === 'DEEP') {
      return { accent: '#22c55e', label: 'Sâu' };
    }
    if (category === 'VERY_DEEP') {
      return { accent: '#0ea5e9', label: 'Rất sâu' };
    }
    return { accent: '#facc15', label: 'Trung gian' };
  }

  function injectStyles() {
    if (document.getElementById('brain3dClinicalStyles')) return;
    const style = document.createElement('style');
    style.id = 'brain3dClinicalStyles';
    style.textContent = `
      .brain-clinical-dock {
        background: #ffffff;
        border: 1px solid #dbe4ee;
        border-radius: 10px;
        margin-top: 10px;
        padding: 0;
        display: flex;
        flex-direction: column;
        height: auto;
        min-height: 0;
        max-height: none;
        overflow: visible;
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04);
      }
      .brain-clinical-dock.brain-clinical-side {
        margin-top: 0;
      }
      .brain-clinical-resizer {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        padding: 10px 12px;
        border-bottom: 1px solid #e2e8f0;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        cursor: default;
        user-select: none;
        position: relative;
      }
      .brain-clinical-dock.brain-clinical-side .brain-clinical-resizer {
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .brain-clinical-resizer-grip {
        display: none;
      }
      .brain-clinical-resizer-label {
        font-size: 11px;
        color: #64748b;
        font-weight: 700;
        letter-spacing: 0.3px;
        text-transform: uppercase;
      }
      .brain-clinical-body {
        flex: 0 0 auto;
        min-height: auto;
        overflow: visible;
        padding: 14px;
        display: grid;
        gap: 12px;
      }
      .brain-clinical-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: flex-start;
        gap: 12px 16px;
      }
      .brain-clinical-title-wrap {
        flex: 1;
        min-width: 0;
        display: grid;
        gap: 4px;
      }
      .brain-clinical-title {
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 0.2px;
      }
      .brain-clinical-subtitle {
        font-size: 11px;
        color: #64748b;
        line-height: 1.45;
      }
      .brain-clinical-chip-row {
        display: flex;
        gap: 8px;
        row-gap: 10px;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: flex-end;
        flex-shrink: 0;
        max-width: 320px;
      }
      .brain-chip {
        display: inline-flex;
        align-items: center;
        padding: 5px 12px;
        border-radius: 999px;
        border: 1px solid #dbe4ee;
        font-size: 10px;
        font-weight: 700;
        color: #475569;
        background: #f8fafc;
        white-space: nowrap;
        line-height: 1;
      }
      .brain-chip.active {
        color: #0369a1;
        background: rgba(2, 132, 199, 0.08);
        border-color: rgba(2, 132, 199, 0.24);
      }
      .brain-chip.warn {
        color: #9a3412;
        background: rgba(245, 158, 11, 0.10);
        border-color: rgba(245, 158, 11, 0.25);
      }
      .brain-clinical-grid {
        display: grid;
        grid-template-columns: minmax(280px, 1.1fr) minmax(340px, 1.4fr);
        gap: 14px;
        align-items: stretch;
        min-height: 0;
      }
      .brain-clinical-dock.brain-clinical-side .brain-clinical-grid {
        grid-template-columns: 1fr;
      }
      .brain-clinical-controls,
      .brain-clinical-slices {
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #f8fafc;
        padding: 12px;
      }
      .brain-clinical-controls {
        display: grid;
        gap: 12px;
      }
      .brain-control-section {
        display: grid;
        gap: 8px;
      }
      .brain-control-title {
        font-size: 10px;
        color: #64748b;
        text-transform: uppercase;
     
        font-weight: 700;
      }
      .brain-slider-grid {
        display: grid;
        gap: 8px; 
      }
      .brain-slider-row {
        display: grid;
        grid-template-columns: 86px 1fr 52px;
        gap: 8px;
        align-items: center;
      }
      .brain-slider-grid-221 {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 14px 24px;
        padding: 16px 20px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
       
        box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.03);
      }
      .brain-clinical-dock.brain-clinical-side .brain-slider-grid-221 {
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .brain-clinical-dock.brain-clinical-side .brain-slider-col:last-child:nth-child(odd) {
        grid-column: span 1;
      }
      .brain-slider-col {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .brain-slider-col:last-child:nth-child(odd) {
        grid-column: span 2;
      }
      .brain-slider-col-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .brain-slider-col-label {
        font-size: 10px;
        font-weight: 800;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }
      .brain-slider-col-value {
        font-size: 11px;
        font-weight: 800;
        color: #0369a1;
      }
      @media (max-width: 600px) {
        .brain-slider-grid-221 {
          grid-template-columns: 1fr;
        }
        .brain-slider-col:last-child:nth-child(odd) {
          grid-column: span 1;
        }
      }
      .brain-slider-label {
        font-size: 11px;
        color: #1e293b;
        font-weight: 600;
      }
      .brain-slider-value {
        font-size: 11px;
        color: #0369a1;
        font-weight: 700;
        text-align: right;
      }
      .brain-range {
        width: 100%;
        accent-color: #0ea5e9;
      }
      .brain-toggle-row,
      .brain-segment-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .brain-toggle-btn,
      .brain-segment-btn,
      .brain-mini-btn {
        appearance: none;
        border: 1px solid #cfd9e3;
        background: #ffffff;
        color: #334155;
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
      }
      .brain-toggle-btn.is-on,
      .brain-segment-btn.is-on,
      .brain-mini-btn.is-on {
        color: #075985;
        background: rgba(14, 165, 233, 0.10);
        border-color: rgba(14, 165, 233, 0.32);
      }
      .brain-toggle-btn.warn.is-on {
        color: #9a3412;
        background: rgba(245, 158, 11, 0.12);
        border-color: rgba(245, 158, 11, 0.28);
      }
      .brain-toggle-btn.info.is-on {
        color: #075985;
        background: rgba(14, 165, 233, 0.12);
        border-color: rgba(14, 165, 233, 0.28);
      }
      .brain-toggle-btn:disabled,
      .brain-segment-btn:disabled,
      .brain-mini-btn:disabled {
        cursor: not-allowed;
        opacity: 0.56;
        color: #94a3b8;
        background: #f8fafc;
        border-color: #e2e8f0;
      }
      .brain-mini-btn {
        padding: 5px 9px;
        font-size: 10px;
      }
      .brain-tooltip-panel {
        display: none;
        gap: 10px;
        padding: 10px;
        border: 1px solid #dbe4ee;
        border-radius: 10px;
        background: #ffffff;
      }
      .brain-tooltip-panel.is-open {
        display: grid;
      }
      .brain-tooltip-panel-note {
        font-size: 10px;
        line-height: 1.5;
        color: #64748b;
      }
      .brain-tooltip-list {
        display: grid;
        gap: 8px;
      }
      .brain-tooltip-item {
        display: grid;
        grid-template-columns: auto auto minmax(0, 1fr);
        gap: 8px;
        align-items: start;
        padding: 8px 10px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #f8fafc;
        cursor: pointer;
      }
      .brain-tooltip-item input {
        margin-top: 2px;
        accent-color: #0ea5e9;
      }
      .brain-tooltip-swatch {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        margin-top: 4px;
        box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.08);
      }
      .brain-tooltip-copy {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .brain-tooltip-name {
        font-size: 11px;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.35;
      }
      .brain-tooltip-meta {
        font-size: 10px;
        color: #64748b;
        line-height: 1.45;
      }
      .brain-tooltip-empty {
        padding: 16px 12px;
        text-align: center;
        font-size: 10px;
        color: #94a3b8;
        border: 1px dashed #d7e1ea;
        border-radius: 8px;
        background: #ffffff;
      }
      .brain-functional-list,
      .brain-trajectory-card {
        display: grid;
        gap: 6px;
      }
      .brain-functional-item {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 8px;
        align-items: center;
        background: #ffffff;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        padding: 8px 10px;
      }
      .brain-functional-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.08);
      }
      .brain-functional-name {
        font-size: 11px;
        color: #0f172a;
        font-weight: 700;
      }
      .brain-functional-risk {
        font-size: 10px;
        color: #64748b;
      }
      .brain-functional-distance {
        font-size: 10px;
        font-weight: 700;
        color: #0369a1;
        white-space: nowrap;
      }
      .brain-trajectory-card {
        background: #ffffff;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        padding: 10px;
      }
      .brain-trajectory-title {
        font-size: 11px;
        font-weight: 700;
        color: #0f172a;
      }
      .brain-trajectory-meta,
      .brain-trajectory-list {
        font-size: 11px;
        color: #475569;
        line-height: 1.55;
      }
      .brain-trajectory-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .brain-trajectory-pill {
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        color: #92400e;
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.20);
      }
      .brain-trajectory-metrics {
        display: grid;
        gap: 6px;
      }
      .brain-trajectory-metric {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 7px 9px;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
      }
      .brain-trajectory-metric span {
        font-size: 10px;
        font-weight: 600;
        color: #475569;
      }
      .brain-trajectory-metric strong {
        font-size: 10px;
        font-weight: 800;
        color: #0369a1;
        white-space: nowrap;
      }
      .brain-risk-card,
      .brain-reference-card {
        display: grid;
        gap: 10px;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        background: #ffffff;
      }
      .brain-risk-empty {
        font-size: 10px;
        line-height: 1.6;
        color: #64748b;
      }
      .brain-risk-head,
      .brain-reference-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      @keyframes pulse-fast {
        0% { transform: scale(1); box-shadow: 0 0 0 0px rgba(255, 23, 68, 0.4); }
        50% { transform: scale(1.4); box-shadow: 0 0 0 8px rgba(255, 23, 68, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0px rgba(255, 23, 68, 0); }
      }
      .pulse-fast {
        animation: pulse-fast 0.8s infinite cubic-bezier(0.4, 0, 0.6, 1);
      }
      .brain-risk-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.10);
        transition: background 0.3s ease;
      }
      .brain-risk-title {
        font-size: 11px;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.35;
      }
      .brain-risk-subtitle {
        font-size: 10px;
        color: #64748b;
        line-height: 1.45;
      }
      .brain-risk-bar {
        position: relative;
        height: 8px;
        border-radius: 999px;
        overflow: hidden;
        background: #eff6ff;
      }
      .brain-risk-fill {
        height: 100%;
        border-radius: inherit;
      }
      .brain-risk-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .brain-risk-metric {
        display: grid;
        gap: 2px;
        padding: 7px 8px;
        border-radius: 8px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
      }
      .brain-risk-metric span {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: #64748b;
      }
      .brain-risk-metric strong {
        font-size: 11px;
        color: #0f172a;
        line-height: 1.4;
      }
      .brain-risk-list {
        display: grid;
        gap: 6px;
      }
      .brain-risk-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 10px;
        color: #475569;
      }
      .brain-risk-row-label {
        font-weight: 600;
      }
      .brain-risk-row-value {
        font-weight: 700;
        white-space: nowrap;
      }
      .brain-reference-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 54px;
        padding: 5px 10px;
        border-radius: 999px;
        color: #ffffff;
        font-size: 10px;
        font-weight: 800;
      }
      .brain-reference-copy {
        font-size: 10px;
        line-height: 1.6;
        color: #475569;
      }
      .brain-clinical-slices {
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 10px;
        min-height: 0;
      }
      .brain-slice-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        align-content: start;
      }
      .brain-clinical-dock.brain-clinical-side .brain-slice-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .brain-slice-card {
        border-radius: 10px;
        border: 1px solid #d7e1ea;
        background: #020617;
        overflow: hidden;
        cursor: pointer;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
      }
      .brain-slice-card:hover {
        transform: translateY(-1px);
        border-color: rgba(14, 165, 233, 0.35);
        box-shadow: 0 10px 22px rgba(2, 132, 199, 0.12);
      }
      .brain-slice-card.is-active {
        border-color: rgba(14, 165, 233, 0.42);
        box-shadow: 0 0 0 1px rgba(14, 165, 233, 0.18);
      }
      .brain-slice-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 8px 9px;
        background: rgba(15, 23, 42, 0.92);
        border-bottom: 1px solid rgba(148, 163, 184, 0.14);
      }
      .brain-slice-name {
        font-size: 10px;
        color: #f8fafc;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.7px;
      }
      .brain-slice-axis {
        font-size: 10px;
        color: #38bdf8;
        font-weight: 700;
      }
      .brain-slice-media {
        position: relative;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        background: radial-gradient(circle at center, rgba(30, 41, 59, 0.7), rgba(2, 6, 23, 1));
      }
      .brain-slice-media img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .brain-slice-overlay {
        opacity: 0.95;
      }
      .brain-crosshair-h,
      .brain-crosshair-v {
        position: absolute;
        background: rgba(14, 165, 233, 0.92);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 0 12px rgba(14,165,233,0.38);
        pointer-events: none;
      }
      .brain-crosshair-h {
        left: 0;
        right: 0;
        height: 1px;
      }
      .brain-crosshair-v {
        top: 0;
        bottom: 0;
        width: 1px;
      }
      .brain-slice-foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 7px 9px;
        background: #ffffff;
      }
      .brain-slice-foot span {
        font-size: 10px;
        color: #475569;
        font-weight: 600;
      }
      .brain-slice-foot strong {
        color: #0369a1;
      }
      .brain-slice-empty {
        grid-column: 1 / -1;
        padding: 40px 20px;
        text-align: center;
        font-size: 11px;
        line-height: 1.6;
        color: #94a3b8;
        border-radius: 12px;
        border: 2px dashed #e2e8f0;
        background: #f8fafc;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 140px;
      }
      .brain-slice-note {
        flex: 1;
        min-width: 0;
        text-align: right;
        font-size: 10px;
        color: #64748b;
        line-height: 1.45;
      }
      .brain-clinical-topline {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .brain-clinical-dock.brain-clinical-side .brain-clinical-topline {
        flex-direction: column;
      }
      .brain-clinical-dock.brain-clinical-side .brain-slice-note {
        text-align: left;
      }
      .compare-clinical-toolbar {
        display: grid;
        grid-template-columns: 1.2fr 1fr 0.95fr;
        gap: 10px;
        align-items: start;
        padding: 12px 18px;
        border-bottom: 1px solid #e2e8f0;
        background: linear-gradient(180deg, #f8fbff 0%, #f8fafc 100%);
      }
      .compare-clinical-panel {
        border: 1px solid #dbe4ee;
        border-radius: 10px;
        background: #ffffff;
        padding: 10px;
        display: grid;
        gap: 8px;
      }
      .compare-clinical-label {
        font-size: 11px;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.9px;
        font-weight: 800;
        margin-bottom: 4px;
      }
      .compare-range-grid {
        display: grid;
        gap: 7px;
      }
      .compare-range-row {
        display: grid;
        grid-template-columns: 70px 1fr 42px;
        align-items: center;
        gap: 8px;
      }
      .compare-range-row span {
        font-size: 11px;
        font-weight: 600;
        color: #334155;
      }
      .compare-range-row strong {
        font-size: 10px;
        color: #0369a1;
        text-align: right;
      }
      .compare-toggle-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .compare-slices-context {
        display: grid;
        gap: 10px;
        margin-bottom: 12px;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid #dbeafe;
        background: linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%);
      }
      .compare-slices-context-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .compare-slices-context-head span {
        font-size: 11px;
        font-weight: 800;
        color: #0f172a;
      }
      .compare-slices-context-head strong {
        font-size: 10px;
        font-weight: 700;
        color: #0369a1;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .compare-slices-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        width: 100%;
        align-items: stretch;
      }
      .compare-slice-card {
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #e2e8f0;
        background: #020617;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .compare-slice-card:hover {
        transform: translateY(-2px);
        border-color: rgba(14, 165, 233, 0.4);
        box-shadow: 0 6px 15px rgba(0, 0, 0, 0.08);
      }
      .compare-slice-card[data-view="axial"],
      .compare-slice-card[data-view="coronal"],
      .compare-slice-card[data-view="sagittal"] {
        cursor: pointer;
      }
      .compare-slice-card.is-active {
        border-color: rgba(14, 165, 233, 0.45);
        box-shadow: 0 0 0 1px rgba(14, 165, 233, 0.20);
      }
      .compare-slice-card.is-gradcam {
        border-color: rgba(14, 165, 233, 0.18);
      }
      .compare-slice-card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px 7px;
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.96) 0%, rgba(15, 23, 42, 0.88) 100%);
      }
      .compare-slice-card-head span,
      .compare-slice-card-head strong {
        font-size: 10px;
        color: #e2e8f0;
        font-weight: 700;
      }
      .compare-slice-card-head strong {
        color: #38bdf8;
      }
      .compare-slice-card-body {
        position: relative;
        aspect-ratio: 0.94 / 1;
        overflow: hidden;
        isolation: isolate;
        background:
          radial-gradient(circle at center, rgba(255,255,255,0.08) 0%, rgba(2,6,23,0) 38%),
          linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(2,6,23,0.98) 100%);
      }
      .compare-slice-card-body img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        transition: filter 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
      }
      .compare-slice-base {
        opacity: 0.98;
        filter: contrast(1.08) brightness(0.96) saturate(0.90);
      }
      .compare-slice-mask {
        opacity: 0.72;
        mix-blend-mode: screen;
        filter: saturate(0.86) brightness(0.94);
      }
      .compare-slice-card.is-gradcam .compare-slice-card-body img {
        filter: contrast(1.04) brightness(0.92) saturate(0.88);
      }
      .compare-slice-card-foot {
        min-height: 38px;
        display: flex;
        align-items: center;
        padding: 6px 9px;
        background: #ffffff;
        font-size: 10px;
        color: #475569;
        font-weight: 600;
      }
      .compare-note-card {
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        background: #ffffff;
        padding: 16px;
        display: grid;
        gap: 12px;
        margin-bottom: 12px;
      }
      .compare-note-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .compare-note-pill {
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #475569;
      }
      .compare-note-text {
        font-size: 11px;
        color: #475569;
        line-height: 1.55;
      }
      /* ── Clinical Legend / Notes Panel ─────────────────────────── */
      .brain-legend-btn {
        appearance: none;
        border: 1px solid #c7d8ec;
        background: linear-gradient(135deg, #e8f4fd 0%, #f0f9ff 100%);
        color: #0369a1;
        border-radius: 8px;
        padding: 5px 11px;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        letter-spacing: 0.2px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
        white-space: nowrap;
        margin-left: auto;
      }
      .brain-legend-btn:hover {
        background: linear-gradient(135deg, #dbeafe 0%, #e0f2fe 100%);
        border-color: #7dd3fc;
        box-shadow: 0 2px 8px rgba(14,165,233,0.15);
      }
      .brain-legend-btn.is-open {
        background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
        color: #ffffff;
        border-color: #0284c7;
      }
      .brain-legend-panel {
        display: none;
        border: 1px solid #bfdbfe;
        border-radius: 10px;
        background: linear-gradient(160deg, #f0f9ff 0%, #ffffff 55%, #fefce8 100%);
        padding: 14px 16px 16px;
        margin: 10px 14px 14px;
        gap: 14px;
        flex-direction: column;
        box-shadow: 0 4px 16px rgba(14,165,233,0.08), 0 1px 4px rgba(0,0,0,0.04);
        animation: legendFadeIn 0.22s ease;
      }
      .brain-legend-panel.is-open {
        display: flex;
      }
      @keyframes legendFadeIn {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .brain-legend-heading {
        font-size: 11px;
        font-weight: 800;
        color: #0c4a6e;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        padding-bottom: 8px;
        border-bottom: 1px solid #bae6fd;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .brain-legend-section {
        display: grid;
        gap: 7px;
      }
      .brain-legend-section-title {
        font-size: 10px;
        font-weight: 800;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.7px;
        margin-bottom: 2px;
      }
      .brain-legend-row {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        padding: 7px 10px;
        border-radius: 8px;
        background: rgba(255,255,255,0.72);
        border: 1px solid rgba(203,213,225,0.5);
      }
      .brain-legend-icon {
        flex-shrink: 0;
        width: 26px;
        height: 26px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
      }
      .brain-legend-text {
        flex: 1;
        min-width: 0;
      }
      .brain-legend-label {
        font-size: 11px;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.3;
      }
      .brain-legend-desc {
        font-size: 10.5px;
        color: #475569;
        line-height: 1.5;
        margin-top: 2px;
      }
      .brain-legend-badge {
        flex-shrink: 0;
        align-self: center;
        padding: 3px 7px;
        border-radius: 999px;
        font-size: 9.5px;
        font-weight: 700;
        white-space: nowrap;
      }
      .badge-danger  { background: rgba(239,68,68,0.12);  color: #b91c1c; border: 1px solid rgba(239,68,68,0.22); }
      .badge-warn    { background: rgba(245,158,11,0.12); color: #92400e; border: 1px solid rgba(245,158,11,0.22); }
      .badge-safe    { background: rgba(34,197,94,0.12);  color: #166534; border: 1px solid rgba(34,197,94,0.22); }
      .badge-info    { background: rgba(14,165,233,0.12); color: #075985; border: 1px solid rgba(14,165,233,0.22); }
      .badge-purple  { background: rgba(139,92,246,0.12); color: #5b21b6; border: 1px solid rgba(139,92,246,0.22); }
      .brain-legend-divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, #bae6fd 30%, #bae6fd 70%, transparent);
      }
      .brain-legend-tip {
        background: linear-gradient(135deg, #fef9c3 0%, #fefce8 100%);
        border: 1px solid #fde68a;
        border-radius: 8px;
        padding: 9px 12px;
        font-size: 10.5px;
        color: #78350f;
        line-height: 1.55;
        display: flex;
        gap: 7px;
        align-items: flex-start;
      }
      .brain-3d-tooltip-layer {
        position: absolute;
        inset: 0;
        z-index: 8;
        pointer-events: none;
        overflow: hidden;
      }
      .brain-3d-tip {
        position: absolute;
        inset: 0;
        --brain-tip-accent: #0ea5e9;
      }
      .brain-3d-tip-line {
        position: absolute;
        height: 1.5px;
        background: linear-gradient(90deg, rgba(255,255,255,0.16), var(--brain-tip-accent));
        transform-origin: 0 50%;
        opacity: 0.92;
        box-shadow: 0 0 10px color-mix(in srgb, var(--brain-tip-accent) 45%, transparent);
      }
      .brain-3d-tip-anchor {
        position: absolute;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--brain-tip-accent);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--brain-tip-accent) 22%, transparent), 0 0 14px color-mix(in srgb, var(--brain-tip-accent) 55%, transparent);
      }
      .brain-3d-tip-card {
        position: absolute;
        min-width: 176px;
        max-width: 236px;
        border-radius: 12px;
        padding: 10px 12px 11px;
        background: rgba(8, 14, 26, 0.90);
        border: 1px solid color-mix(in srgb, var(--brain-tip-accent) 44%, #cbd5e1);
        box-shadow: 0 14px 28px rgba(2, 6, 23, 0.22), 0 0 0 1px rgba(255,255,255,0.03) inset;
        backdrop-filter: blur(10px);
        color: #e2e8f0;
        pointer-events: auto;
      }
      .brain-3d-tip-topline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 5px;
      }
      .brain-3d-tip-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .brain-3d-tip-kicker {
        font-size: 9px;
        letter-spacing: 0.9px;
        font-weight: 800;
        text-transform: uppercase;
        color: var(--brain-tip-accent);
      }
      .brain-3d-tip-badge {
        padding: 2px 7px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 700;
        white-space: nowrap;
        color: #f8fafc;
        background: color-mix(in srgb, var(--brain-tip-accent) 26%, transparent);
        border: 1px solid color-mix(in srgb, var(--brain-tip-accent) 48%, transparent);
      }
      .brain-3d-tip-title {
        font-size: 11px;
        font-weight: 800;
        line-height: 1.35;
        color: #f8fafc;
      }
      .brain-3d-tip-desc {
        margin-top: 4px;
        font-size: 10px;
        line-height: 1.48;
        color: #cbd5e1;
      }
      .brain-3d-tip-meta {
        margin-top: 6px;
        font-size: 9.5px;
        line-height: 1.4;
        color: #93c5fd;
      }
      .brain-3d-tip-close {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        color: #e2e8f0;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
      }
      .brain-3d-tip-close:hover {
        background: rgba(255,255,255,0.12);
        border-color: rgba(255,255,255,0.24);
        color: #ffffff;
      }
      .brain-3d-tip.is-metric .brain-3d-tip-line,
      .brain-3d-tip.is-metric .brain-3d-tip-anchor,
      .brain-3d-tip.is-metric .brain-3d-tip-actions {
        display: none !important;
      }
      .brain-3d-tip.is-metric .brain-3d-tip-card {
        min-width: 0;
        max-width: none;
        padding: 8px 10px 7px;
        border-radius: 999px;
        background: rgba(8, 14, 26, 0.94);
        box-shadow: 0 10px 24px rgba(2, 6, 23, 0.20);
      }
      .brain-3d-tip.is-metric .brain-3d-tip-topline {
        margin-bottom: 0;
      }
      .brain-3d-tip.is-metric .brain-3d-tip-kicker {
        font-size: 8px;
        letter-spacing: 0.7px;
      }
      .brain-3d-tip.is-metric .brain-3d-tip-title {
        font-size: 12px;
        line-height: 1.15;
      }
      .brain-3d-tip.is-metric .brain-3d-tip-desc {
        display: none;
      }
      .brain-3d-tip.is-metric .brain-3d-tip-meta {
        margin-top: 2px;
        font-size: 8.5px;
        line-height: 1.2;
        color: #bfdbfe;
      }
      .brain-3d-tip.is-screen .brain-3d-tip-line,
      .brain-3d-tip.is-screen .brain-3d-tip-anchor {
        display: none;
      }
      @media (max-width: 1180px) {
        .brain-clinical-resizer {
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .brain-clinical-header {
          grid-template-columns: 1fr;
        }
        .brain-clinical-chip-row {
          max-width: none;
          justify-content: flex-start;
        }
        .brain-clinical-grid {
          grid-template-columns: 1fr;
        }
        .compare-clinical-toolbar {
          grid-template-columns: 1fr;
        }
        .compare-slices-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 780px) {
        .compare-slices-context-head {
          align-items: flex-start;
          flex-direction: column;
        }
        .compare-slices-grid {
          grid-template-columns: 1fr;
        }
      }

      /* ── Fixed Entry Point Selector Panel ───────────────────────── */
      .brain-entry-note {
        font-size: 10px;
        color: #64748b;
        line-height: 1.5;
        padding: 6px 8px;
        background: rgba(14,165,233,0.05);
        border: 1px solid rgba(14,165,233,0.14);
        border-radius: 7px;
      }
      .brain-entry-panel {
        display: grid;
        gap: 5px;
      }
      .brain-entry-empty {
        padding: 14px 10px;
        text-align: center;
        font-size: 10px;
        color: #94a3b8;
        border: 1px dashed #d7e1ea;
        border-radius: 8px;
        background: #ffffff;
      }
      .brain-entry-zone-btn {
        appearance: none;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        align-items: center;
        gap: 9px;
        padding: 8px 10px;
        border-radius: 9px;
        border: 1px solid #e2e8f0;
        background: #ffffff;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
        position: relative;
        overflow: hidden;
      }
      .brain-entry-zone-btn::before {
        content: '';
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 3px;
        border-radius: 3px 0 0 3px;
        background: transparent;
        transition: background 0.18s ease;
      }
      .brain-entry-zone-btn:hover {
        border-color: rgba(14,165,233,0.35);
        background: rgba(14,165,233,0.04);
        box-shadow: 0 2px 8px rgba(14,165,233,0.08);
      }
      .brain-entry-zone-btn.is-selected {
        border-color: rgba(34,197,94,0.45);
        background: rgba(34,197,94,0.06);
        box-shadow: 0 0 0 1px rgba(34,197,94,0.18);
      }
      .brain-entry-zone-btn.is-selected::before {
        background: #22c55e;
      }
      .brain-entry-zone-btn.entry-risk-high { }
      .brain-entry-zone-btn.entry-risk-high:not(.is-selected) {
        border-left-color: rgba(239,68,68,0.25);
      }
      .brain-entry-zone-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;
        box-shadow: 0 0 0 3px rgba(148,163,184,0.10);
      }
      .brain-entry-zone-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      .brain-entry-zone-label {
        font-size: 11px;
        font-weight: 700;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .brain-entry-zone-dist {
        font-size: 10px;
        color: #64748b;
        font-weight: 600;
      }
      .brain-entry-zone-risk {
        font-size: 9px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 999px;
        background: rgba(148,163,184,0.10);
        color: #475569;
        border: 1px solid #e2e8f0;
        white-space: nowrap;
      }
      .brain-entry-zone-btn.entry-risk-high .brain-entry-zone-risk {
        color: #b91c1c;
        background: rgba(239,68,68,0.08);
        border-color: rgba(239,68,68,0.22);
      }
      .brain-entry-zone-btn.entry-risk-med .brain-entry-zone-risk {
        color: #92400e;
        background: rgba(245,158,11,0.08);
        border-color: rgba(245,158,11,0.22);
      }
      .brain-entry-zone-btn.entry-risk-low .brain-entry-zone-risk {
        color: #166534;
        background: rgba(34,197,94,0.06);
        border-color: rgba(34,197,94,0.18);
      }
      .brain-entry-zone-check {
        color: #22c55e;
        font-size: 11px;
      }
      .brain-entry-all-btn {
        appearance: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 9px;
        border: 1px dashed rgba(14,165,233,0.40);
        background: rgba(14,165,233,0.04);
        color: #0369a1;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        width: 100%;
        justify-content: center;
        transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
      }
      .brain-entry-all-btn:hover:not(:disabled) {
        background: rgba(14,165,233,0.10);
        border-color: rgba(14,165,233,0.55);
      }
      .brain-entry-all-btn.is-on {
        background: rgba(34,197,94,0.08);
        border-color: rgba(34,197,94,0.42);
        color: #166534;
      }
      .brain-entry-all-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      /* ── Unified Accordion Styles ───────────────────────── */
      .brain-sliders-accordion, .brain-entry-accordion, .brain-tooltip-accordion, .brain-clipping-accordion, .brain-layers-accordion, .brain-tumor-accordion, .brain-analysis-accordion {
        margin: 0 0 0 0;
      }
      .brain-sliders-accordion-toggle, 
      .brain-entry-accordion-toggle, 
      .brain-tooltip-accordion-toggle,
      .brain-clipping-accordion-toggle,
      .brain-layers-accordion-toggle,
      .brain-tumor-accordion-toggle,
      .brain-analysis-accordion-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        appearance: none;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 9px 14px;
        cursor: pointer;
        gap: 10px;
        transition: all 0.2s ease;
      }
      .brain-sliders-accordion-toggle:hover,
      .brain-entry-accordion-toggle:hover,
      .brain-tooltip-accordion-toggle:hover,
      .brain-clipping-accordion-toggle:hover,
      .brain-layers-accordion-toggle:hover,
      .brain-tumor-accordion-toggle:hover,
      .brain-analysis-accordion-toggle:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      }
      .brain-sliders-accordion-toggle.is-open,
      .brain-entry-accordion-toggle.is-open,
      .brain-tooltip-accordion-toggle.is-open,
      .brain-clipping-accordion-toggle.is-open,
      .brain-layers-accordion-toggle.is-open,
      .brain-tumor-accordion-toggle.is-open,
      .brain-analysis-accordion-toggle.is-open {
        background: #ffffff;
        border-color: #cbd5e1;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        border-bottom-color: transparent;
        box-shadow: 0 4px 12px rgba(0,0,0,0.03);
      }
      .brain-sliders-accordion-left,
      .brain-entry-accordion-left,
      .brain-tooltip-accordion-left,
      .brain-clipping-accordion-left,
      .brain-layers-accordion-left,
      .brain-tumor-accordion-left,
      .brain-analysis-accordion-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .brain-sliders-accordion-label,
      .brain-entry-accordion-label,
      .brain-tooltip-accordion-label,
      .brain-clipping-accordion-label,
      .brain-layers-accordion-label,
      .brain-tumor-accordion-label,
      .brain-analysis-accordion-label {
        font-size: 11px;
        font-weight: 700;
        color: #1e293b;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .brain-sliders-accordion-pill,
      .brain-entry-accordion-badge,
      .brain-tooltip-accordion-badge,
      .brain-clipping-accordion-badge,
      .brain-layers-accordion-badge,
      .brain-tumor-accordion-badge,
      .brain-analysis-accordion-badge {
        font-size: 9px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 999px;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        white-space: nowrap;
        line-height: 1.4;
      }
      /* Status Variations */
      .brain-badge-muted {
        background: #f8fafc !important;
        color: #94a3b8 !important;
        border-color: #e2e8f0 !important;
        box-shadow: none !important;
      }
      .brain-badge-active-blue {
        background: #0ea5e9 !important;
        color: #ffffff !important;
        border-color: #3e84a7ff !important;
        box-shadow: 0 2px 6px rgba(14, 165, 233, 0.24) !important;
      }
      .brain-badge-active-violet {
        background: #14905eff !important;
        color: #ffffff !important;
        border-color: #309e6eff !important;
        box-shadow: 0 2px 6px rgba(139, 92, 246, 0.24) !important;
      }

      .brain-sliders-accordion-chevron,
      .brain-entry-accordion-chevron,
      .brain-tooltip-accordion-chevron {
        font-size: 10px;
        color: #64748b;
        transition: transform 0.22s ease;
        flex-shrink: 0;
      }
      .is-open .brain-sliders-accordion-chevron,
      .is-open .brain-entry-accordion-chevron,
      .is-open .brain-tooltip-accordion-chevron,
      .is-open .brain-clipping-accordion-chevron,
      .is-open .brain-layers-accordion-chevron,
      .is-open .brain-tumor-accordion-chevron,
      .is-open .brain-analysis-accordion-chevron {
        transform: rotate(180deg);
      }
      .brain-sliders-accordion-body,
      .brain-entry-accordion-body,
      .brain-tooltip-accordion-body,
      .brain-clipping-accordion-body,
      .brain-layers-accordion-body,
      .brain-tumor-accordion-body,
      .brain-analysis-accordion-body {
        display: none;
        flex-direction: column;
        border: 1px solid #e2e8f0;
        border-top: none;
        border-bottom-left-radius: 10px;
        border-bottom-right-radius: 10px;
        background: #ffffff;
        overflow: hidden;
        animation: accordionIn 0.20s ease;
      }
      .brain-sliders-accordion-body.is-open,
      .brain-entry-accordion-body.is-open,
      .brain-tooltip-accordion-body.is-open,
      .brain-clipping-accordion-body.is-open,
      .brain-layers-accordion-body.is-open,
      .brain-tumor-accordion-body.is-open,
      .brain-analysis-accordion-body.is-open {
        display: flex;
      }
      @keyframes accordionIn {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      /* Slider grid inside accordion gets its own padding/bg */
      .brain-sliders-accordion-body .brain-slider-grid-221 {
        border: none;
        border-radius: 0;
        box-shadow: none;
        margin-bottom: 0;
      }
      /* Entry Point Body Styling */
      .brain-entry-accordion-body {
        padding: 12px 14px 14px;
        gap: 10px;
      }
      .brain-entry-accordion-toprow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .brain-entry-accordion-title {
        font-size: 10px;
        font-weight: 700;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.7px;
      }

      /* Tooltip Body Styling */
      .brain-tooltip-accordion-body {
        gap: 0;
      }
      /* Tooltip panel inside accordion — remove its own border/bg */
      .brain-tooltip-accordion-body .brain-tooltip-panel {
        display: grid;
        border: none;
        border-radius: 0;
        background: transparent;
        padding: 12px 14px 14px;
      }
      
      .brain-analysis-sub {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .brain-analysis-sub-title {
        font-size: 10px;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
      }

      /* ══════════════════════════════════════════════════════════════
         DARK THEME OVERRIDES — Clinical Panel (ĐIỀU HƯỚNG LÂM SÀNG)
         Applied when html[data-theme="dark"] is set
         ══════════════════════════════════════════════════════════════ */

      html[data-theme="dark"] .brain-clinical-dock {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3) !important;
      }

      /* Header bar */
      html[data-theme="dark"] .brain-clinical-resizer {
        background: linear-gradient(180deg, #0b1220 0%, #0d1629 100%) !important;
        border-bottom-color: rgba(148, 163, 184, 0.14) !important;
      }
      html[data-theme="dark"] .brain-clinical-resizer-label {
        color: rgba(193, 207, 232, 0.65) !important;
      }
      html[data-theme="dark"] .brain-clinical-title {
        color: #e5eefc !important;
      }
      html[data-theme="dark"] .brain-clinical-subtitle {
        color: rgba(193, 207, 232, 0.60) !important;
      }

      /* Body & controls */
      html[data-theme="dark"] .brain-clinical-controls,
      html[data-theme="dark"] .brain-clinical-slices {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
      }
      html[data-theme="dark"] .brain-control-title,
      html[data-theme="dark"] .brain-slider-col-label,
      html[data-theme="dark"] .brain-entry-accordion-title {
        color: rgba(193, 207, 232, 0.60) !important;
      }
      html[data-theme="dark"] .brain-slider-label {
        color: #c1cfe8 !important;
      }
      html[data-theme="dark"] .brain-slider-value,
      html[data-theme="dark"] .brain-slider-col-value {
        color: #38bdf8 !important;
      }

      /* Slider grid background */
      html[data-theme="dark"] .brain-slider-grid-221 {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.14) !important;
        box-shadow: none !important;
      }

      /* Toggle / segment buttons */
      html[data-theme="dark"] .brain-toggle-btn,
      html[data-theme="dark"] .brain-segment-btn,
      html[data-theme="dark"] .brain-mini-btn {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
        color: rgba(193, 207, 232, 0.80) !important;
      }
      html[data-theme="dark"] .brain-toggle-btn:hover,
      html[data-theme="dark"] .brain-segment-btn:hover,
      html[data-theme="dark"] .brain-mini-btn:hover {
        border-color: rgba(14, 165, 233, 0.45) !important;
        color: #38bdf8 !important;
        background: rgba(14, 165, 233, 0.08) !important;
      }
      html[data-theme="dark"] .brain-toggle-btn.is-on,
      html[data-theme="dark"] .brain-segment-btn.is-on,
      html[data-theme="dark"] .brain-mini-btn.is-on {
        color: #38bdf8 !important;
        background: rgba(14, 165, 233, 0.14) !important;
        border-color: rgba(14, 165, 233, 0.38) !important;
      }
      html[data-theme="dark"] .brain-toggle-btn:disabled,
      html[data-theme="dark"] .brain-segment-btn:disabled,
      html[data-theme="dark"] .brain-mini-btn:disabled {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.14) !important;
        color: rgba(148, 163, 184, 0.35) !important;
      }

      /* Chips */
      html[data-theme="dark"] .brain-chip {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.20) !important;
        color: rgba(193, 207, 232, 0.65) !important;
      }
      html[data-theme="dark"] .brain-chip.active {
        color: #38bdf8 !important;
        background: rgba(14, 165, 233, 0.10) !important;
        border-color: rgba(14, 165, 233, 0.30) !important;
      }

      /* Accordion toggles */
      html[data-theme="dark"] .brain-sliders-accordion-toggle,
      html[data-theme="dark"] .brain-entry-accordion-toggle,
      html[data-theme="dark"] .brain-tooltip-accordion-toggle,
      html[data-theme="dark"] .brain-clipping-accordion-toggle,
      html[data-theme="dark"] .brain-layers-accordion-toggle,
      html[data-theme="dark"] .brain-tumor-accordion-toggle,
      html[data-theme="dark"] .brain-analysis-accordion-toggle {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.20) !important;
        color: #e5eefc !important;
      }
      html[data-theme="dark"] .brain-sliders-accordion-toggle:hover,
      html[data-theme="dark"] .brain-entry-accordion-toggle:hover,
      html[data-theme="dark"] .brain-tooltip-accordion-toggle:hover,
      html[data-theme="dark"] .brain-clipping-accordion-toggle:hover,
      html[data-theme="dark"] .brain-layers-accordion-toggle:hover,
      html[data-theme="dark"] .brain-tumor-accordion-toggle:hover,
      html[data-theme="dark"] .brain-analysis-accordion-toggle:hover {
        background: rgba(14, 165, 233, 0.06) !important;
        border-color: rgba(14, 165, 233, 0.28) !important;
      }
      html[data-theme="dark"] .brain-sliders-accordion-toggle.is-open,
      html[data-theme="dark"] .brain-entry-accordion-toggle.is-open,
      html[data-theme="dark"] .brain-tooltip-accordion-toggle.is-open,
      html[data-theme="dark"] .brain-clipping-accordion-toggle.is-open,
      html[data-theme="dark"] .brain-layers-accordion-toggle.is-open,
      html[data-theme="dark"] .brain-tumor-accordion-toggle.is-open,
      html[data-theme="dark"] .brain-analysis-accordion-toggle.is-open {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.22) !important;
      }
      html[data-theme="dark"] .brain-sliders-accordion-label,
      html[data-theme="dark"] .brain-entry-accordion-label,
      html[data-theme="dark"] .brain-tooltip-accordion-label,
      html[data-theme="dark"] .brain-clipping-accordion-label,
      html[data-theme="dark"] .brain-layers-accordion-label,
      html[data-theme="dark"] .brain-tumor-accordion-label,
      html[data-theme="dark"] .brain-analysis-accordion-label {
        color: #e5eefc !important;
      }
      html[data-theme="dark"] .brain-sliders-accordion-chevron,
      html[data-theme="dark"] .brain-entry-accordion-chevron,
      html[data-theme="dark"] .brain-tooltip-accordion-chevron,
      html[data-theme="dark"] .brain-clipping-accordion-chevron,
      html[data-theme="dark"] .brain-layers-accordion-chevron,
      html[data-theme="dark"] .brain-tumor-accordion-chevron,
      html[data-theme="dark"] .brain-analysis-accordion-chevron {
        color: rgba(148, 163, 184, 0.65) !important;
      }
      html[data-theme="dark"] .brain-sliders-accordion-body,
      html[data-theme="dark"] .brain-entry-accordion-body,
      html[data-theme="dark"] .brain-tooltip-accordion-body,
      html[data-theme="dark"] .brain-clipping-accordion-body,
      html[data-theme="dark"] .brain-layers-accordion-body,
      html[data-theme="dark"] .brain-tumor-accordion-body,
      html[data-theme="dark"] .brain-analysis-accordion-body {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
      }

      /* Functional zone list */
      html[data-theme="dark"] .brain-functional-item {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.16) !important;
      }
      html[data-theme="dark"] .brain-functional-name {
        color: #e5eefc !important;
      }
      html[data-theme="dark"] .brain-functional-risk {
        color: rgba(193, 207, 232, 0.60) !important;
      }
      html[data-theme="dark"] .brain-functional-distance {
        color: #38bdf8 !important;
      }

      /* Trajectory card */
      html[data-theme="dark"] .brain-trajectory-card {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.16) !important;
      }
      html[data-theme="dark"] .brain-trajectory-title {
        color: #e5eefc !important;
      }
      html[data-theme="dark"] .brain-trajectory-meta,
      html[data-theme="dark"] .brain-trajectory-list {
        color: rgba(193, 207, 232, 0.65) !important;
      }
      html[data-theme="dark"] .brain-trajectory-metric {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.16) !important;
      }
      html[data-theme="dark"] .brain-trajectory-metric span {
        color: rgba(193, 207, 232, 0.65) !important;
      }
      html[data-theme="dark"] .brain-trajectory-metric strong {
        color: #38bdf8 !important;
      }
      html[data-theme="dark"] .brain-risk-card,
      html[data-theme="dark"] .brain-reference-card {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.16) !important;
      }
      html[data-theme="dark"] .brain-risk-empty,
      html[data-theme="dark"] .brain-reference-copy,
      html[data-theme="dark"] .brain-risk-row {
        color: rgba(193, 207, 232, 0.68) !important;
      }
      html[data-theme="dark"] .brain-risk-title,
      html[data-theme="dark"] .brain-risk-metric strong {
        color: #e5eefc !important;
      }
      html[data-theme="dark"] .brain-risk-subtitle,
      html[data-theme="dark"] .brain-risk-metric span {
        color: rgba(193, 207, 232, 0.62) !important;
      }
      html[data-theme="dark"] .brain-risk-bar {
        background: rgba(56, 189, 248, 0.12) !important;
      }
      html[data-theme="dark"] .brain-risk-metric {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.16) !important;
      }

      /* Tooltip panel */
      html[data-theme="dark"] .brain-tooltip-panel {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
      }
      html[data-theme="dark"] .brain-tooltip-item {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.16) !important;
      }
      html[data-theme="dark"] .brain-tooltip-name {
        color: #e5eefc !important;
      }
      html[data-theme="dark"] .brain-tooltip-meta,
      html[data-theme="dark"] .brain-tooltip-panel-note {
        color: rgba(193, 207, 232, 0.60) !important;
      }
      html[data-theme="dark"] .brain-tooltip-empty {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.20) !important;
        color: rgba(148, 163, 184, 0.50) !important;
      }

      /* Entry point panel */
      html[data-theme="dark"] .brain-entry-zone-btn {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.20) !important;
      }
      html[data-theme="dark"] .brain-entry-zone-btn:hover {
        background: rgba(14, 165, 233, 0.06) !important;
        border-color: rgba(14, 165, 233, 0.30) !important;
      }
      html[data-theme="dark"] .brain-entry-zone-btn.is-selected {
        background: rgba(34, 197, 94, 0.08) !important;
        border-color: rgba(34, 197, 94, 0.35) !important;
      }
      html[data-theme="dark"] .brain-entry-zone-label {
        color: #e5eefc !important;
      }
      html[data-theme="dark"] .brain-entry-zone-dist {
        color: rgba(193, 207, 232, 0.60) !important;
      }
      html[data-theme="dark"] .brain-entry-zone-risk {
        background: rgba(148, 163, 184, 0.10) !important;
        color: rgba(193, 207, 232, 0.70) !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
      }
      html[data-theme="dark"] .brain-entry-empty {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.20) !important;
        color: rgba(148, 163, 184, 0.50) !important;
      }
      html[data-theme="dark"] .brain-entry-note {
        background: rgba(14, 165, 233, 0.06) !important;
        border-color: rgba(14, 165, 233, 0.18) !important;
        color: rgba(193, 207, 232, 0.65) !important;
      }
      html[data-theme="dark"] .brain-entry-all-btn {
        background: rgba(14, 165, 233, 0.06) !important;
        border-color: rgba(14, 165, 233, 0.28) !important;
        color: #38bdf8 !important;
      }
      html[data-theme="dark"] .brain-entry-all-btn:hover:not(:disabled) {
        background: rgba(14, 165, 233, 0.12) !important;
        border-color: rgba(14, 165, 233, 0.50) !important;
      }

      /* Legend button & panel */
      html[data-theme="dark"] .brain-legend-btn {
        background: rgba(14, 165, 233, 0.08) !important;
        border-color: rgba(14, 165, 233, 0.25) !important;
        color: #38bdf8 !important;
      }
      html[data-theme="dark"] .brain-legend-btn:hover {
        background: rgba(14, 165, 233, 0.14) !important;
        border-color: rgba(14, 165, 233, 0.40) !important;
        box-shadow: 0 2px 8px rgba(14, 165, 233, 0.15) !important;
      }
      html[data-theme="dark"] .brain-legend-btn.is-open {
        background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%) !important;
        color: #ffffff !important;
        border-color: #0284c7 !important;
      }
      html[data-theme="dark"] .brain-legend-panel {
        background: linear-gradient(160deg, #0b1a2e 0%, #0f1a2d 55%, #0d1628 100%) !important;
        border-color: rgba(14, 165, 233, 0.22) !important;
        box-shadow: 0 4px 16px rgba(0, 229, 255, 0.07), 0 1px 4px rgba(0,0,0,0.3) !important;
      }
      html[data-theme="dark"] .brain-legend-heading {
        color: #7dd3fc !important;
        border-bottom-color: rgba(14, 165, 233, 0.22) !important;
      }
      html[data-theme="dark"] .brain-legend-section-title {
        color: rgba(193, 207, 232, 0.55) !important;
      }
      html[data-theme="dark"] .brain-legend-row {
        background: rgba(255,255,255,0.03) !important;
        border-color: rgba(148, 163, 184, 0.14) !important;
      }
      html[data-theme="dark"] .brain-legend-label {
        color: #e5eefc !important;
      }
      html[data-theme="dark"] .brain-legend-desc {
        color: rgba(193, 207, 232, 0.60) !important;
      }
      html[data-theme="dark"] .brain-legend-divider {
        background: linear-gradient(90deg, transparent, rgba(14, 165, 233, 0.25) 30%, rgba(14, 165, 233, 0.25) 70%, transparent) !important;
      }
      html[data-theme="dark"] .brain-legend-tip {
        background: linear-gradient(135deg, rgba(253, 230, 138, 0.06) 0%, rgba(254, 243, 199, 0.04) 100%) !important;
        border-color: rgba(253, 230, 138, 0.20) !important;
        color: rgba(253, 230, 138, 0.80) !important;
      }

      /* Slice foot area */
      html[data-theme="dark"] .brain-slice-foot {
        background: #0f1a2d !important;
      }
      html[data-theme="dark"] .brain-slice-foot span {
        color: rgba(193, 207, 232, 0.65) !important;
      }
      html[data-theme="dark"] .brain-slice-foot strong {
        color: #38bdf8 !important;
      }
      html[data-theme="dark"] .brain-slice-empty {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
        color: rgba(148, 163, 184, 0.50) !important;
      }
      html[data-theme="dark"] .brain-slice-note {
        color: rgba(193, 207, 232, 0.50) !important;
      }
      html[data-theme="dark"] .brain-slice-card {
        border-color: rgba(148, 163, 184, 0.18) !important;
      }

      /* Compare toolbar & panels */
      html[data-theme="dark"] .compare-clinical-toolbar {
        background: linear-gradient(180deg, #0b1a2e 0%, #0f1a2d 100%) !important;
        border-bottom-color: rgba(148, 163, 184, 0.16) !important;
      }
      html[data-theme="dark"] .compare-clinical-panel {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
      }
      html[data-theme="dark"] .compare-clinical-label {
        color: rgba(193, 207, 232, 0.55) !important;
      }
      html[data-theme="dark"] .compare-range-row span {
        color: #c1cfe8 !important;
      }
      html[data-theme="dark"] .compare-range-row strong {
        color: #38bdf8 !important;
      }
      html[data-theme="dark"] .compare-slices-context {
        background: linear-gradient(180deg, rgba(14,165,233,0.07) 0%, rgba(14,165,233,0.04) 100%) !important;
        border-color: rgba(14, 165, 233, 0.20) !important;
      }
      html[data-theme="dark"] .compare-slices-context-head span {
        color: #e5eefc !important;
      }
      html[data-theme="dark"] .compare-slices-context-head strong {
        color: #38bdf8 !important;
      }
      html[data-theme="dark"] .compare-slice-card-foot {
        background: #0f1a2d !important;
        color: rgba(193, 207, 232, 0.65) !important;
      }
      html[data-theme="dark"] .compare-note-card {
        background: #0f1a2d !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
      }
      html[data-theme="dark"] .compare-note-pill {
        background: #0b1220 !important;
        border-color: rgba(148, 163, 184, 0.20) !important;
        color: rgba(193, 207, 232, 0.65) !important;
      }
      html[data-theme="dark"] .compare-note-text {
        color: rgba(193, 207, 232, 0.65) !important;
      }

      /* Badge muted dark override */
      html[data-theme="dark"] .brain-badge-muted {
        background: rgba(148, 163, 184, 0.10) !important;
        color: rgba(148, 163, 184, 0.55) !important;
        border-color: rgba(148, 163, 184, 0.18) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureMainUI() {
    const viewer = document.getElementById('viewer3d');
    const sideHost = document.getElementById('clinicalPanelHost');
    const fallbackHost = viewer?.parentElement;
    const host = sideHost || fallbackHost;
    const legend = fallbackHost?.querySelector('.legend');
    if (!viewer || !host) return;
    if (MAIN.ui?.panel && document.body.contains(MAIN.ui.panel)) {
      if (sideHost && MAIN.ui.panel.parentElement !== sideHost) {
        sideHost.replaceChildren(MAIN.ui.panel);
        MAIN.ui.panel.classList.add('brain-clinical-side');
      }
      return;
    }

    const panel = document.createElement('section');
    panel.id = 'brainClinicalDock';
    panel.className = 'brain-clinical-dock';
    if (sideHost) panel.classList.add('brain-clinical-side');
    panel.innerHTML = `
      <div class="brain-clinical-resizer" id="brainClinicalResizer">
        <span class="brain-clinical-resizer-label">Điều hướng lâm sàng</span>
        <button class="brain-legend-btn" id="brainLegendToggleBtn" title="Hiện / ẩn chú thích lâm sàng"><i class="fa-solid fa-file-medical"></i> Ghi chú lâm sàng</button>
      </div>

      <!-- LEGEND / NOTES PANEL -->
      <div class="brain-legend-panel" id="brainLegendPanel">
        <div class="brain-legend-heading"><i class="fa-solid fa-microscope" style="margin-right:8px;"></i> Chú thích hiệu ứng 3D &amp; Hướng dẫn đọc kết quả</div>

        <div class="brain-legend-section">
          <div class="brain-legend-section-title"><i class="fa-solid fa-layer-group" style="color:#ef4444;margin-right:8px;"></i> Thành phần khối u (Lớp phủ 3D)</div>

          <div class="brain-legend-row">
            <div class="brain-legend-icon" style="background:rgba(244,63,94,0.15); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-circle" style="color:#f43f5e; font-size:10px;"></i></div>
            <div class="brain-legend-text">
              <div class="brain-legend-label">Nhân / Hoại tử (Necrotic Core)</div>
              <div class="brain-legend-desc">Khối cầu đặc màu đỏ hồng ở trung tâm. Vùng tế bào chết do thiếu máu — đặc trưng của u độ cao (GBM grade IV). Kích thước lớn → tiên lượng xấu hơn.</div>
            </div>
            <span class="brain-legend-badge badge-danger">GBM ≥ G3</span>
          </div>

          <div class="brain-legend-row">
            <div class="brain-legend-icon" style="background:rgba(250,204,21,0.15); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-circle" style="color:#facc15; font-size:10px;"></i></div>
            <div class="brain-legend-text">
              <div class="brain-legend-label">Vùng tăng cường tương phản (Enhancing Tumor)</div>
              <div class="brain-legend-desc">Khung lưới vàng bao quanh nhân. Mô u đang tăng sinh mạch máu — tương ứng vùng sáng thuốc cản quang trên MRI Gd+. Là vùng hoạt động sinh học nhất của khối u.</div>
            </div>
            <span class="brain-legend-badge badge-warn">Hoạt động cao</span>
          </div>

          <div class="brain-legend-row">
            <div class="brain-legend-icon" style="background:rgba(34,197,94,0.12); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-circle" style="color:#22c55e; font-size:10px;"></i></div>
            <div class="brain-legend-text">
              <div class="brain-legend-label">Vùng phù não xung quanh (Peritumoral Edema)</div>
              <div class="brain-legend-desc">Cầu lớn mờ màu xanh lá, bán kính lớn nhất. Vùng não phù nề do áp lực khối u — gây triệu chứng thần kinh. Cần theo dõi bằng T2/FLAIR trên MRI.</div>
            </div>
            <span class="brain-legend-badge badge-safe">T2/FLAIR sáng</span>
          </div>
        </div>

        <div class="brain-legend-divider"></div>

        <div class="brain-legend-section">
          <div class="brain-legend-section-title"><i class="fa-solid fa-scissors" style="color:#38bdf8;margin-right:8px;"></i> Mặt phẳng cắt MPR (Clipping Planes)</div>

          <div class="brain-legend-row">
            <div class="brain-legend-icon" style="background:rgba(56,189,248,0.15);">━</div>
            <div class="brain-legend-text">
              <div class="brain-legend-label">Mặt phẳng Sagittal — màu xanh dương nhạt</div>
              <div class="brain-legend-desc">Cắt theo chiều trái–phải (trục X). Điều chỉnh thanh trượt Sagittal để di chuyển mặt phẳng này. Dùng để xem phân bố u giữa 2 bán cầu.</div>
            </div>
            <span class="brain-legend-badge badge-info">Trục X</span>
          </div>

          <div class="brain-legend-row">
            <div class="brain-legend-icon" style="background:rgba(34,197,94,0.12);">━</div>
            <div class="brain-legend-text">
              <div class="brain-legend-label">Mặt phẳng Coronal — màu xanh lá</div>
              <div class="brain-legend-desc">Cắt theo chiều trước–sau (trục Y). Tương ứng góc nhìn từ phía trán về phía gáy. Hữu ích để đánh giá u vùng frontal hoặc occipital.</div>
            </div>
            <span class="brain-legend-badge badge-safe">Trục Y</span>
          </div>

          <div class="brain-legend-row">
            <div class="brain-legend-icon" style="background:rgba(245,158,11,0.12);">━</div>
            <div class="brain-legend-text">
              <div class="brain-legend-label">Mặt phẳng Axial — màu vàng cam</div>
              <div class="brain-legend-desc">Cắt ngang theo chiều trên–dưới (trục Z). Là góc cắt phổ biến nhất trong MRI lâm sàng. Dùng để xác định độ sâu u từ vỏ não.</div>
            </div>
            <span class="brain-legend-badge badge-warn">Trục Z</span>
          </div>
        </div>

        <div class="brain-legend-divider"></div>

        <div class="brain-legend-section">
          <div class="brain-legend-section-title"><i class="fa-solid fa-route" style="color:#8b5cf6;margin-right:8px;"></i> Đường mổ &amp; Vùng chức năng</div>

          <div class="brain-legend-row">
            <div class="brain-legend-icon" style="background:rgba(34,197,94,0.12); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-arrow-trend-up" style="color:#22c55e; font-size:10px;"></i></div>
            <div class="brain-legend-text">
              <div class="brain-legend-label">Đường mổ mô phỏng — đường thẳng xanh lá</div>
              <div class="brain-legend-desc">Đường thẳng từ điểm vào vỏ não (cầu xanh) đến tâm khối u (cầu đỏ). Hình nón bán trong suốt xanh thể hiện góc tiếp cận an toàn. Kích điểm xanh là điểm rạch da/xương sọ ước tính.</div>
            </div>
            <span class="brain-legend-badge badge-safe">Kế hoạch mổ</span>
          </div>

          <div class="brain-legend-row">
            <div class="brain-legend-icon" style="background:rgba(239,68,68,0.10); display:flex; align-items:center; justify-content:center;"><i class="fa-regular fa-circle" style="color:#ef4444; font-size:12px;"></i></div>
            <div class="brain-legend-text">
              <div class="brain-legend-label">Vùng chức năng nguy hiểm — viền màu theo chức năng</div>
              <div class="brain-legend-desc">
                Các đĩa tròn bán trong suốt trên bề mặt não, mỗi màu là một vùng chức năng:<br/>
                <i class="fa-solid fa-circle" style="color:#ef4444; font-size:9px;"></i> Đỏ = Vỏ vận động (liệt) &nbsp; <i class="fa-solid fa-circle" style="color:#3b82f6; font-size:9px;"></i> Xanh dương = Thị giác &nbsp; <i class="fa-solid fa-circle" style="color:#f59e0b; font-size:9px;"></i> Vàng = Broca (nói) &nbsp; <i class="fa-solid fa-circle" style="color:#8b5cf6; font-size:9px;"></i> Tím = Wernicke (hiểu) &nbsp; <i class="fa-solid fa-circle" style="color:#14b8a6; font-size:9px;"></i> Xanh ngọc = Cảm giác
              </div>
            </div>
            <span class="brain-legend-badge badge-danger">Vùng nguy hiểm</span>
          </div>

          <div class="brain-legend-row">
            <div class="brain-legend-icon" style="background:rgba(56,189,248,0.1); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-crosshairs" style="color:#38bdf8; font-size:11px;"></i></div>
            <div class="brain-legend-text">
              <div class="brain-legend-label">Crosshair đồng bộ 2D/3D — đường chữ thập xanh</div>
              <div class="brain-legend-desc">Giao điểm hai đường kẻ xanh trên mỗi ảnh MPR 2D đánh dấu vị trí tham chiếu tương ứng với vị trí cắt trong viewer 3D. Click lên ảnh để cập nhật vị trí crosshair.</div>
            </div>
            <span class="brain-legend-badge badge-info">Đồng bộ MPR</span>
          </div>
        </div>

        <div class="brain-legend-divider"></div>

        <div class="brain-legend-section">
          <div class="brain-legend-section-title"><i class="fa-solid fa-chart-simple" style="color:#0ea5e9;margin-right:8px;"></i> Hướng dẫn đọc khoảng cách chức năng</div>
          <div class="brain-legend-row">
            <div class="brain-legend-text">
              <div class="brain-legend-desc" style="line-height:1.7;">
                <b style="color:#b91c1c;">≤ 10 mm — Rất gần:</b> Nguy cơ rất cao gây khuyết thần kinh vĩnh viễn. Phẫu thuật cần mapping chức năng thức tỉnh hoặc neuromonitoring liên tục.<br/>
                <b style="color:#92400e;">10–18 mm — Lân cận:</b> Cần đánh giá kỹ, hội chẩn kế hoạch phẫu thuật. Có thể dùng iMRI hoặc 5-ALA hỗ trợ.<br/>
                <b style="color:#0369a1;">18–28 mm — Cần theo dõi:</b> Rủi ro thần kinh vừa phải, nên tái đánh giá sau mổ bằng fMRI.<br/>
                <b style="color:#166534;">&gt; 28 mm — Xa:</b> Vùng chức năng ít nguy cơ ảnh hưởng trực tiếp.
              </div>
            </div>
          </div>
        </div>

        <div class="brain-legend-tip"><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;margin-right:8px;"></i> <span>Các thông tin 3D và khoảng cách này chỉ mang tính tham khảo hỗ trợ lâm sàng, được tính toán từ ước lượng tự động của AI. Kết quả chính thức cần kết hợp với đọc MRI trực tiếp, hội chẩn đa chuyên khoa và dữ liệu bệnh nhân đầy đủ.</span></div>
      </div>

      <div class="brain-clinical-body">
      

        <!-- ══ SLIDERS ACCORDION ══ -->
        <div class="brain-sliders-accordion" id="brainSlidersAccordion">
          <button class="brain-sliders-accordion-toggle is-open" id="brainSlidersAccordionToggle" type="button">
            <span class="brain-sliders-accordion-left">
              <i class="fa-solid fa-sliders" style="color:#64748b;font-size:13px;"></i>
              <span class="brain-sliders-accordion-label">Cắt lớp &amp; Độ trong suốt</span>
             
            </span>
            <i class="fa-solid fa-chevron-down brain-sliders-accordion-chevron"></i>
          </button>
          <div class="brain-sliders-accordion-body is-open" id="brainSlidersAccordionBody">
            <div class="brain-slider-grid-221">
              <div class="brain-slider-col">
                <div class="brain-slider-col-head">
                  <span class="brain-slider-col-label">Axial (Trục Z)</span>
                  <span class="brain-slider-col-value" id="brainValueAxial">100%</span>
                </div>
                <input class="brain-range" type="range" min="0" max="100" value="100" data-axis="axial" />
              </div>
              <div class="brain-slider-col">
                <div class="brain-slider-col-head">
                  <span class="brain-slider-col-label">Coronal (Trục Y)</span>
                  <span class="brain-slider-col-value" id="brainValueCoronal">100%</span>
                </div>
                <input class="brain-range" type="range" min="0" max="100" value="100" data-axis="coronal" />
              </div>
              <div class="brain-slider-col">
                <div class="brain-slider-col-head">
                  <span class="brain-slider-col-label">Sagittal (Trục X)</span>
                  <span class="brain-slider-col-value" id="brainValueSagittal">100%</span>
                </div>
                <input class="brain-range" type="range" min="0" max="100" value="100" data-axis="sagittal" />
              </div>
              <div class="brain-slider-col">
                <div class="brain-slider-col-head">
                  <span class="brain-slider-col-label">Vỏ não (Cortex)</span>
                  <span class="brain-slider-col-value" id="brainValueCortex">100%</span>
                </div>
                <input class="brain-range" type="range" min="5" max="100" value="100" data-opacity="cortex" />
              </div>
              <div class="brain-slider-col">
                <div class="brain-slider-col-head">
                  <span class="brain-slider-col-label">Cấu trúc sâu</span>
                  <span class="brain-slider-col-value" id="brainValueDeep">21%</span>
                </div>
                <input class="brain-range" type="range" min="5" max="100" value="21" data-opacity="deep" />
              </div>
              <div class="brain-slider-col">
                <div class="brain-slider-col-head">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <button class="brain-mini-btn" id="brainToggleSafetyMarginBtn" style="padding: 3px 6px; font-size: 10px;" title="Bật/Tắt hiển thị biên an toàn">
                      <i class="fa-solid fa-eye"></i>
                    </button>
                    <span class="brain-slider-col-label">Biên an toàn</span>
                  </div>
                  <span class="brain-slider-col-value" id="brainValueSafetyMargin">8 mm</span>
                </div>
                <input class="brain-range" type="range" min="0" max="20" value="8" data-safety-margin="true" />
              </div>
            </div>
          </div>
        </div>

        <!-- ══ ENTRY POINT ACCORDION ══ -->
        <div class="brain-entry-accordion" id="brainEntryAccordion">
          <button class="brain-entry-accordion-toggle" id="brainEntryAccordionToggle" type="button">
            <span class="brain-entry-accordion-left">
              <i class="fa-solid fa-location-crosshairs" style="color:#64748b;font-size:13px;"></i>
              <span class="brain-entry-accordion-label">Chọn điểm vào phẫu thuật</span>
              <span class="brain-entry-accordion-badge" id="brainEntryAccordionBadge">Chưa chọn</span>
            </span>
            <i class="fa-solid fa-chevron-down brain-entry-accordion-chevron"></i>
          </button>
          <div class="brain-entry-accordion-body" id="brainEntryAccordionBody">
            <div class="brain-entry-accordion-toprow">
              <span class="brain-entry-accordion-title">Vùng chức năng lân cận</span>
              <button class="brain-mini-btn" id="brainClearEntryBtn2" disabled>Xóa tất cả</button>
            </div>
            <div class="brain-entry-note" id="brainEntryNote">Chọn 1 trong 4 vùng chức năng bên dưới hoặc "Xem tất cả" để hiển thị đồng thời các đường vào để so sánh.</div>
            <div class="brain-entry-panel" id="brainEntryPanel"></div>
            <div class="brain-toggle-row" style="margin-top:2px;">
              <button class="brain-entry-all-btn" id="brainEntryAllBtn"><i class="fa-solid fa-layer-group"></i> Xem tất cả</button>
            </div>
          </div>
        </div>

        <!-- ══ TOOLTIP ACCORDION ══ -->
        <div class="brain-sliders-accordion" id="brainTooltipAccordion">
          <button class="brain-tooltip-accordion-toggle" id="brainTooltipAccordionToggle" type="button">
            <span class="brain-tooltip-accordion-left">
              <i class="fa-solid fa-location-dot" style="color:#64748b;font-size:13px;"></i>
              <span class="brain-tooltip-accordion-label">Bảng Tooltip 3D</span>
              <span class="brain-tooltip-accordion-badge" id="brainTooltipAccordionBadge">Ẩn bảng</span>
            </span>
            <i class="fa-solid fa-chevron-down brain-tooltip-accordion-chevron"></i>
          </button>
          <div class="brain-tooltip-accordion-body" id="brainTooltipAccordionBody">
            <div class="brain-tooltip-panel" id="brainTooltipPanel">
              <div class="brain-tooltip-panel-note" id="brainTooltipPanelNote">
                Chọn các tooltip cần hiển thị trên mô hình 3D. Bỏ tích hoặc bấm dấu × trên tooltip sẽ ẩn đúng mục đó.
              </div>
              <div class="brain-tooltip-list" id="brainTooltipList"></div>
            </div>
          </div>
        </div>

        <div class="brain-analysis-accordion" id="brainAnalysisAccordion">
          <button class="brain-analysis-accordion-toggle is-open" id="brainAnalysisAccordionToggle" type="button">
            <span class="brain-analysis-accordion-left">
              <i class="fa-solid fa-microscope" style="color:#64748b;font-size:13px;"></i>
              <span class="brain-analysis-accordion-label">Phân tích & Lớp phủ 3D</span>
              <span class="brain-analysis-accordion-badge" id="brainAnalysisAccordionBadge">Hoạt động</span>
            </span>
            <i class="fa-solid fa-chevron-down brain-analysis-accordion-chevron"></i>
          </button>
          <div class="brain-analysis-accordion-body is-open" id="brainAnalysisAccordionBody" style="padding: 12px 14px; gap: 12px;">
            
            <!-- Sub-section: Layers -->
            <div class="brain-analysis-sub">
              <div class="brain-analysis-sub-title">Lớp phủ / Kế hoạch</div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div class="brain-toggle-row">
                  <button class="brain-toggle-btn is-on warn" data-action="risk"><i class="fa-solid fa-eye"></i> Biên an toàn</button>
                  <button class="brain-toggle-btn is-on" data-action="functional">Vùng chức năng</button>
                  <button class="brain-toggle-btn is-on warn" data-action="path">Đường mổ</button>
                  <button class="brain-toggle-btn is-on info" data-action="tooltips">Tooltip 3D</button>
                </div>
                <div class="brain-toggle-row">
                  <button class="brain-toggle-btn is-on" data-action="attention">Bản đồ chú ý AI</button>
                  <button class="brain-toggle-btn is-on info" data-action="similar">Mô hình đối chiếu</button>
                </div>
              </div>
            </div>

            <div class="brain-control-section" id="brainEntrySection" style="display:none; padding:0; margin:0; border:none; background:transparent;"></div>
            <div class="brain-control-section" id="brainTooltipSection" style="display:none; padding:0; margin:0; border:none; background:transparent;"></div>

            <!-- Sub-section: Tumor Components -->
            <div class="brain-analysis-sub">
              <div class="brain-analysis-sub-title">Thành phần khối u</div>
              <div class="brain-segment-row">
                <button class="brain-segment-btn is-on" data-component="core">Nhân / Hoại tử</button>
                <button class="brain-segment-btn is-on" data-component="enhancing">Tăng cường</button>
                <button class="brain-segment-btn is-on" data-component="edema">Phù nề</button>
              </div>
            </div>

          </div>
        </div>

        <div class="brain-clinical-grid">
          <div class="brain-clinical-controls">

            <div class="brain-control-section">
              <div class="brain-control-title">Ca tham chiếu 3D</div>
              <div class="brain-reference-card" id="brainReferenceCard"></div>
            </div>



            <div class="brain-control-section">
              <div class="brain-control-title">Mô phỏng đường vào</div>
              <div class="brain-trajectory-card" id="brainTrajectoryCard">
                <div class="brain-trajectory-title">Đường mổ chưa kích hoạt</div>
                <div class="brain-trajectory-meta">Bật kế hoạch và click lên bề mặt não để đặt điểm vào.</div>
              </div>
            </div>
          </div>

          <div class="brain-clinical-slices">
            <div class="brain-clinical-topline">
              <div class="brain-control-title">Đồng bộ MPR 2D / 3D</div>
              <div class="brain-slice-note" id="brainSliceNote">
                Click trên 3D hoặc trên các mặt phẳng 2D để canh dòng vị trí. Dữ liệu 2D hiện tại là ảnh tham chiếu sinh từ mặt nạ và tâm khối u.
              </div>
            </div>
            <div id="brainSliceGrid" class="brain-slice-grid"></div>
          </div>
        </div>
      </div>
    `;
    if (sideHost) {
      sideHost.replaceChildren(panel);
    } else if (legend) {
      legend.insertAdjacentElement('afterend', panel);
    } else {
      viewer.insertAdjacentElement('afterend', panel);
    }

    MAIN.preferredViewerMinHeight = getPreferredMainViewerMinHeight();
    panel.style.height = 'auto';
    panel.style.maxHeight = 'none';
    viewer.style.minHeight = MAIN.preferredViewerMinHeight + 'px';
    viewer.style.flex = `1 1 ${MAIN.preferredViewerMinHeight}px`;

    MAIN.ui = {
      panel,
      resizer: panel.querySelector('#brainClinicalResizer'),
      trajectoryCard: panel.querySelector('#brainTrajectoryCard'),
      resetClipBtn: panel.querySelector('#brainResetClipBtn'),
      sliceGrid: panel.querySelector('#brainSliceGrid'),
      sliceNote: panel.querySelector('#brainSliceNote'),

      axisRanges: {
        axial: panel.querySelector('input[data-axis="axial"]'),
        coronal: panel.querySelector('input[data-axis="coronal"]'),
        sagittal: panel.querySelector('input[data-axis="sagittal"]'),
      },
      axisValues: {
        axial: panel.querySelector('#brainValueAxial'),
        coronal: panel.querySelector('#brainValueCoronal'),
        sagittal: panel.querySelector('#brainValueSagittal'),
      },
      opacityRanges: {
        cortex: panel.querySelector('input[data-opacity="cortex"]'),
        deep: panel.querySelector('input[data-opacity="deep"]'),
      },
      opacityValues: {
        cortex: panel.querySelector('#brainValueCortex'),
        deep: panel.querySelector('#brainValueDeep'),
      },
      safetyMarginRange: panel.querySelector('input[data-safety-margin="true"]'),
      safetyMarginValue: panel.querySelector('#brainValueSafetyMargin'),
      // Sliders accordion < -----------------------------------------------------------
      slidersAccordionToggle: panel.querySelector('#brainSlidersAccordionToggle'),
      slidersAccordionBody: panel.querySelector('#brainSlidersAccordionBody'),
      sliderPills: {
        axial: panel.querySelector('#brainPillAxial'),
        coronal: panel.querySelector('#brainPillCoronal'),
        sagittal: panel.querySelector('#brainPillSagittal'),
        cortex: panel.querySelector('#brainPillCortex'),
        deep: panel.querySelector('#brainPillDeep'),
      },
      // Entry accordion < -----------------------------------------------------------
      entryPanel: panel.querySelector('#brainEntryPanel'),
      entryNote: panel.querySelector('#brainEntryNote'),
      clearEntryButton: panel.querySelector('#brainClearEntryBtn2'),
      entryAllButton: panel.querySelector('#brainEntryAllBtn'),
      entryAccordionToggle: panel.querySelector('#brainEntryAccordionToggle'),
      entryAccordionBody: panel.querySelector('#brainEntryAccordionBody'),
      entryAccordionBadge: panel.querySelector('#brainEntryAccordionBadge'),
      riskCard: document.getElementById('brainRiskCardCenter'),
      riskCardHost: document.getElementById('centerRiskHeatmapHost'),
      referenceCard: panel.querySelector('#brainReferenceCard'),
      // Tooltip accordion < -----------------------------------------------------------
      tooltipPanel: panel.querySelector('#brainTooltipPanel'),
      tooltipList: panel.querySelector('#brainTooltipList'),
      tooltipPanelNote: panel.querySelector('#brainTooltipPanelNote'),
      tooltipAccordionToggle: panel.querySelector('#brainTooltipAccordionToggle'),
      tooltipAccordionBody: panel.querySelector('#brainTooltipAccordionBody'),
      tooltipAccordionBadge: panel.querySelector('#brainTooltipAccordionBadge'),
      toggleButtons: panel.querySelectorAll('.brain-toggle-btn'),
      segmentButtons: panel.querySelectorAll('.brain-segment-btn'),
      safetyMarginToggle: panel.querySelector('#brainToggleSafetyMarginBtn'),
      headerSafetyMarginToggle: panel.querySelector('#brainHeaderToggleSafetyMarginBtn'),
      // Consolidated Analysis accordion < -----------------------------------------------------------
      analysisAccordionToggle: panel.querySelector('#brainAnalysisAccordionToggle'),
      analysisAccordionBody: panel.querySelector('#brainAnalysisAccordionBody'),
      analysisAccordionBadge: panel.querySelector('#brainAnalysisAccordionBadge'),
    };

    setupMainResizer();

    // ── Legend toggle button ────────────────────────────────────────
    const legendBtn = panel.querySelector('#brainLegendToggleBtn');
    const legendPanel = panel.querySelector('#brainLegendPanel');
    if (legendBtn && legendPanel) {
      legendBtn.addEventListener('click', () => {
        const isOpen = legendPanel.classList.toggle('is-open');
        legendBtn.classList.toggle('is-open', isOpen);
        legendBtn.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i> Đóng ghi chú' : '<i class="fa-solid fa-file-medical"></i> Ghi chú lâm sàng';
      });
    }

    // ── Sliders Accordion toggle ─────────────────────────────────
    if (MAIN.ui.slidersAccordionToggle && MAIN.ui.slidersAccordionBody) {
      MAIN.ui.slidersAccordionToggle.addEventListener('click', () => {
        const isOpen = MAIN.ui.slidersAccordionBody.classList.toggle('is-open');
        MAIN.ui.slidersAccordionToggle.classList.toggle('is-open', isOpen);
        // Show/hide pills: pills visible only when collapsed
        const pillsEl = MAIN.ui.slidersAccordionToggle.querySelector('#brainSlidersPills');
        if (pillsEl) pillsEl.style.display = isOpen ? 'none' : 'flex';
      });
    }

    // ── Entry Point Accordion toggle ──────────────────────────────────
    if (MAIN.ui.entryAccordionToggle && MAIN.ui.entryAccordionBody) {
      MAIN.ui.entryAccordionToggle.addEventListener('click', () => {
        const isOpen = MAIN.ui.entryAccordionBody.classList.toggle('is-open');
        MAIN.ui.entryAccordionToggle.classList.toggle('is-open', isOpen);
      });
    }

    // ── Tooltip Accordion toggle ────────────────────────────────
    if (MAIN.ui.tooltipAccordionToggle && MAIN.ui.tooltipAccordionBody) {
      MAIN.ui.tooltipAccordionToggle.addEventListener('click', () => {
        const isOpen = MAIN.ui.tooltipAccordionBody.classList.toggle('is-open');
        MAIN.ui.tooltipAccordionToggle.classList.toggle('is-open', isOpen);
        MAIN.tooltipPanelOpen = isOpen;
        syncMainUI();
      });
    }

    // ── Analysis Accordion toggle ────────────────────────────────
    if (MAIN.ui.analysisAccordionToggle && MAIN.ui.analysisAccordionBody) {
      MAIN.ui.analysisAccordionToggle.addEventListener('click', () => {
        const isOpen = MAIN.ui.analysisAccordionBody.classList.toggle('is-open');
        MAIN.ui.analysisAccordionToggle.classList.toggle('is-open', isOpen);
      });
    }

    // tooltipPanelBtn removed (now handled by accordion)

    if (MAIN.ui.resetClipBtn) {
      MAIN.ui.resetClipBtn.addEventListener('click', () => {
        if (MAIN.diagnosisData) {
          MAIN.state.clip = buildClipFromDiagnosis(MAIN.diagnosisData);
          clearCustomEntryPoints(MAIN.state);
          syncMainUI();
          applyMainState();
        }
      });
    }

    Object.entries(MAIN.ui.axisRanges).forEach(([axis, input]) => {
      if (!input) return;
      input.addEventListener('input', (event) => {
        MAIN.state.clip[axis] = clamp01(Number(event.target.value) / 100);
        MAIN.state.manualClipAdjusted = true; // Mark as manually adjusted
        MAIN.state.activeView = axis;
        syncMainUI();
        applyMainState();
        persistClinicalState();
      });
    });

    Object.entries(MAIN.ui.opacityRanges).forEach(([key, input]) => {
      if (!input) return;
      input.addEventListener('input', (event) => {
        MAIN.state[key + 'Opacity'] = clamp01(Number(event.target.value) / 100);
        syncMainUI();
        applyMainOpacityProfile();
        persistClinicalState();
      });
    });

    if (MAIN.ui.safetyMarginRange) {
      MAIN.ui.safetyMarginRange.addEventListener('input', event => {
        MAIN.state.safetyMarginMm = clamp(Number(event.target.value), 0, 20);
        refreshMainRiskSummary();
        syncMainUI();
        applyMainState();
        persistClinicalState();
      });
    }

    if (MAIN.ui.safetyMarginToggle) {
      MAIN.ui.safetyMarginToggle.addEventListener('click', () => {
        MAIN.state.showRiskShell = !MAIN.state.showRiskShell;
        syncMainUI();
        applyMainState();
        persistClinicalState();
      });
    }

    if (MAIN.ui.headerSafetyMarginToggle) {
      MAIN.ui.headerSafetyMarginToggle.addEventListener('click', () => {
        MAIN.state.showRiskShell = !MAIN.state.showRiskShell;
        syncMainUI();
        applyMainState();
        persistClinicalState();
      });
    }

    MAIN.ui.toggleButtons.forEach(button => {
      button.addEventListener('click', () => {
        const action = button.getAttribute('data-action');
        if (action === 'functional') MAIN.state.showFunctional = !MAIN.state.showFunctional;
        if (action === 'risk') MAIN.state.showRiskShell = !MAIN.state.showRiskShell;
        if (action === 'attention') MAIN.state.showAttentionCloud = !MAIN.state.showAttentionCloud;
        if (action === 'similar') MAIN.state.showSimilarWireframe = !MAIN.state.showSimilarWireframe;
        if (action === 'path') MAIN.state.showPath = !MAIN.state.showPath;
        if (action === 'tooltips') MAIN.state.showTooltips = !MAIN.state.showTooltips;
        syncMainUI();
        applyMainState();
        persistClinicalState();
      });
    });

    if (MAIN.ui.clearEntryButton) {
      MAIN.ui.clearEntryButton.addEventListener('click', () => {
        clearCustomEntryPoints(MAIN.state);
        syncMainUI();
        applyMainState();
        persistClinicalState();
      });
    }

    if (MAIN.ui.entryAllButton) {
      MAIN.ui.entryAllButton.addEventListener('click', () => {
        if (!MAIN.riskSummary.length) return;
        const allEntries = MAIN.riskSummary.map(zone => zone.position.clone());
        setCustomEntryPoints(allEntries, MAIN.state);
        syncMainUI();
        applyMainState();
        persistClinicalState();
      });
    }

    MAIN.ui.segmentButtons.forEach(button => {
      button.addEventListener('click', () => {
        const component = button.getAttribute('data-component');
        if (component === 'core') MAIN.state.showCore = !MAIN.state.showCore;
        if (component === 'edema') MAIN.state.showEdema = !MAIN.state.showEdema;
        if (component === 'enhancing') MAIN.state.showEnhancing = !MAIN.state.showEnhancing;
        syncMainUI();
        applyMainTumorComponents();
        persistClinicalState();
      });
    });

    renderMainSliceGrid(null);
    syncMainUI();
    syncMainLayoutSizing();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  function setupMainResizer() {
    if (!MAIN.ui?.resizer || MAIN.ui.resizer.dataset.bound === '1') return;
    MAIN.ui.resizer.dataset.bound = '1';
    window.addEventListener('resize', () => {
      syncMainLayoutSizing();
    });
  }

  function syncMainLayoutSizing() {
    if (!MAIN.ui?.panel) return;
    const viewer = MAIN.ctx?.viewerElement || document.getElementById('viewer3d');
    MAIN.preferredViewerMinHeight = getPreferredMainViewerMinHeight();
    if (viewer) {
      viewer.style.minHeight = MAIN.preferredViewerMinHeight + 'px';
      viewer.style.flex = `1 1 ${MAIN.preferredViewerMinHeight}px`;
    }
    MAIN.ui.panel.style.maxHeight = 'none';
    MAIN.ui.panel.style.height = 'auto';
  }

  function setButtonState(button, isOn) {
    if (!button) return;
    button.classList.toggle('is-on', !!isOn);
  }

  // 2. Cập Nhật Giao Diện (UI) — The Conductor < -------------
  function syncMainUI() {
    const trajectoryEntries = getTrajectoryEntries(
      MAIN.tumorCenter,
      MAIN.diagnosisData?.depth_metrics,
      MAIN_SCENE_RADIUS,
      MAIN.state
    );
    const customEntryCount = getCustomEntryPoints(MAIN.state).length;

    const tooltipCatalog = computeMainTooltipCatalog();
    const tooltipSelectedCount = tooltipCatalog.filter(spec => isMainTooltipSelected(spec.key)).length;


    Object.entries(MAIN.ui.axisRanges).forEach(([axis, input]) => {
      const value = Math.round(clamp01(MAIN.state.clip[axis]) * 100);
      input.value = String(value);
      MAIN.ui.axisValues[axis].textContent = value + '%';
    });

    Object.entries(MAIN.ui.opacityRanges).forEach(([key, input]) => {
      const value = Math.round(clamp01(MAIN.state[key + 'Opacity']) * 100);
      input.value = String(value);
      MAIN.ui.opacityValues[key].textContent = value + '%';
    });

    // Ẩn / hiện biên an toàn <------------------------------------------------------------
    if (MAIN.ui.safetyMarginRange) {
      const marginValue = Math.round(clamp(MAIN.state.safetyMarginMm, 0, 20));
      MAIN.ui.safetyMarginRange.value = String(marginValue);
      if (MAIN.ui.safetyMarginValue) {
        MAIN.ui.safetyMarginValue.textContent = `${marginValue} mm`;
      }
      if (MAIN.ui.safetyMarginToggle) {
        const on = !!MAIN.state.showRiskShell;
        MAIN.ui.safetyMarginToggle.classList.toggle('is-on', on);
        MAIN.ui.safetyMarginToggle.innerHTML = on ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
        MAIN.ui.safetyMarginToggle.title = on ? 'Ẩn biên an toàn' : 'Hiện biên an toàn';
      }
      if (MAIN.ui.headerSafetyMarginToggle) {
        const on = !!MAIN.state.showRiskShell;
        MAIN.ui.headerSafetyMarginToggle.classList.toggle('is-on', on);
        MAIN.ui.headerSafetyMarginToggle.innerHTML = on ? '<i class="fa-solid fa-eye"></i> Biên an toàn' : '<i class="fa-solid fa-eye-slash"></i> Biên an toàn';
      }
    }

    // Cập nhật các thanh trượt slider <--------------------------------------------------------
    if (MAIN.ui.sliderPills) {
      const axialVal = Math.round(clamp01(MAIN.state.clip.axial) * 100);
      const coronalVal = Math.round(clamp01(MAIN.state.clip.coronal) * 100);
      const sagVal = Math.round(clamp01(MAIN.state.clip.sagittal) * 100);
      const cortexVal = Math.round(clamp01(MAIN.state.cortexOpacity) * 100);
      const deepVal = Math.round(clamp01(MAIN.state.deepOpacity) * 100);
      if (MAIN.ui.sliderPills.axial) MAIN.ui.sliderPills.axial.textContent = `Z ${axialVal}%`;
      if (MAIN.ui.sliderPills.coronal) MAIN.ui.sliderPills.coronal.textContent = `Y ${coronalVal}%`;
      if (MAIN.ui.sliderPills.sagittal) MAIN.ui.sliderPills.sagittal.textContent = `X ${sagVal}%`;
      if (MAIN.ui.sliderPills.cortex) MAIN.ui.sliderPills.cortex.textContent = `Vỏ ${cortexVal}%`;
      if (MAIN.ui.sliderPills.deep) MAIN.ui.sliderPills.deep.textContent = `Sâu ${deepVal}%`;
      // Hide pills when accordion is open
      const pillsEl = MAIN.ui.slidersAccordionToggle?.querySelector('#brainSlidersPills');
      if (pillsEl) {
        const isOpen = MAIN.ui.slidersAccordionBody?.classList.contains('is-open');
        pillsEl.style.display = isOpen ? 'none' : 'flex';
      }
    }

    MAIN.ui.toggleButtons.forEach(button => {
      const action = button.getAttribute('data-action');
      const on =
        (action === 'functional' && MAIN.state.showFunctional) ||
        (action === 'risk' && MAIN.state.showRiskShell) ||
        (action === 'attention' && MAIN.state.showAttentionCloud) ||
        (action === 'similar' && MAIN.state.showSimilarWireframe) ||
        (action === 'path' && MAIN.state.showPath) ||
        (action === 'tooltips' && MAIN.state.showTooltips);
      setButtonState(button, on);
      if (action === 'risk') {
        button.innerHTML = on ? '<i class="fa-solid fa-eye"></i> Biên an toàn' : '<i class="fa-solid fa-eye-slash"></i> Biên an toàn';
      }
    });

    if (MAIN.ui.clearEntryButton) {
      MAIN.ui.clearEntryButton.disabled = customEntryCount === 0;
    }

    // Update "So sánh tất cả" button state
    if (MAIN.ui.entryAllButton) {
      const allSelected = MAIN.riskSummary.length > 0 && customEntryCount === MAIN.riskSummary.length;
      MAIN.ui.entryAllButton.classList.toggle('is-on', allSelected);
      MAIN.ui.entryAllButton.disabled = !MAIN.riskSummary.length;
    }

    // Update entry accordion badge (Modern Badge Style)
    if (MAIN.ui.entryAccordionBadge) {
      if (customEntryCount === 0) {
        MAIN.ui.entryAccordionBadge.textContent = 'Chưa chọn';
        MAIN.ui.entryAccordionBadge.className = 'brain-entry-accordion-badge brain-badge-muted';
      } else {
        MAIN.ui.entryAccordionBadge.textContent = `${customEntryCount} điểm vào`;
        MAIN.ui.entryAccordionBadge.className = 'brain-entry-accordion-badge brain-badge-active-blue';
      }
    }

    // Update analysis accordion badge
    if (MAIN.ui.analysisAccordionBadge) {
      const activeItems = [
        MAIN.state.showRiskShell,
        MAIN.state.showFunctional,
        MAIN.state.showPath,
        MAIN.state.showTooltips,
        MAIN.state.showAttentionCloud,
        MAIN.state.showSimilarWireframe,
        MAIN.state.showCore,
        MAIN.state.showEnhancing,
        MAIN.state.showEdema
      ].filter(Boolean).length;
      MAIN.ui.analysisAccordionBadge.textContent = `${activeItems} mục đang bật`;
      MAIN.ui.analysisAccordionBadge.className = activeItems > 0 ? 'brain-analysis-accordion-badge brain-badge-active-blue' : 'brain-analysis-accordion-badge brain-badge-muted';
    }

    renderEntryPointPanel();

    // Update tooltip accordion badge (Modern Badge Style)
    if (MAIN.ui.tooltipAccordionBadge) {
      const total = tooltipCatalog.length;
      const selected = tooltipSelectedCount;
      if (total === 0) {
        MAIN.ui.tooltipAccordionBadge.textContent = 'Ẩn bảng';
        MAIN.ui.tooltipAccordionBadge.className = 'brain-tooltip-accordion-badge brain-badge-muted';
      } else {
        MAIN.ui.tooltipAccordionBadge.textContent = `${selected}/${total} bật`;
        if (selected === 0) {
          MAIN.ui.tooltipAccordionBadge.className = 'brain-tooltip-accordion-badge brain-badge-muted';
        } else {
          MAIN.ui.tooltipAccordionBadge.className = 'brain-tooltip-accordion-badge brain-badge-active-violet';
        }
      }
    }

    MAIN.ui.segmentButtons.forEach(button => {
      const component = button.getAttribute('data-component');
      const on =
        (component === 'core' && MAIN.state.showCore) ||
        (component === 'edema' && MAIN.state.showEdema) ||
        (component === 'enhancing' && MAIN.state.showEnhancing);
      setButtonState(button, on);
    });

    renderMainSliceGrid(MAIN.diagnosisData);

    renderMainRiskCard();
    renderMainReferenceCard();
    renderMainTrajectoryCard(trajectoryEntries);
    renderMainTooltipManager();
    updateMainViewerTooltips();
  }

  function renderMainSliceGrid(diagnosisData) {
    if (!MAIN.ui?.sliceGrid) return;
    const slices = diagnosisData?.slices;
    if (!slices) {
      MAIN.ui.sliceGrid.innerHTML = `
        <div class="brain-slice-empty">
          <i class="fa-solid fa-wand-magic-sparkles" style="font-size: 24px; margin-bottom: 14px; color: #cbd5e1;"></i>
          <div style="max-width: 280px;">Cần chạy chẩn đoán để kích hoạt 3 mặt phẳng Axial / Coronal / Sagittal.</div>
        </div>
      `;
      return;
    }

    const views = [
      { key: 'axial', axis: 'Z', left: MAIN.state.clip.sagittal, top: MAIN.state.clip.coronal },
      { key: 'coronal', axis: 'Y', left: MAIN.state.clip.sagittal, top: MAIN.state.clip.axial },
      { key: 'sagittal', axis: 'X', left: MAIN.state.clip.coronal, top: MAIN.state.clip.axial },
    ];

    MAIN.ui.sliceGrid.innerHTML = views.map(view => {
      const data = slices[view.key] || {};
      return `
        <article class="brain-slice-card ${MAIN.state.activeView === view.key ? 'is-active' : ''}" data-view="${view.key}">
          <div class="brain-slice-head">
            <span class="brain-slice-name">${view.key}</span>
            <span class="brain-slice-axis">${view.axis}-axis</span>
          </div>
          <div class="brain-slice-media">
            <img src="${data.clean_b64 || data.image_b64 || ''}" alt="${view.key}" />
            ${data.segmentation_b64 ? `<img class="brain-slice-overlay" src="${data.segmentation_b64}" alt="${view.key} segmentation" />` : ''}
            <div class="brain-crosshair-h" style="top:${Math.round(view.top * 100)}%;"></div>
            <div class="brain-crosshair-v" style="left:${Math.round(view.left * 100)}%;"></div>
          </div>
          <div class="brain-slice-foot">
            <span>Đồng bộ từ 3D</span>
            <strong>${view.key === 'axial' ? 'X/Y' : view.key === 'coronal' ? 'X/Z' : 'Y/Z'}</strong>
          </div>
        </article>
      `;
    }).join('');

    MAIN.ui.sliceGrid.querySelectorAll('.brain-slice-card').forEach(card => {
      card.addEventListener('click', event => {
        const view = card.getAttribute('data-view');
        handleSliceInteraction(view, event, MAIN.state, card.querySelector('.brain-slice-media'));
        MAIN.state.manualClipAdjusted = true; // Mark as manually adjusted
        MAIN.state.activeView = view;
        syncMainUI();
        applyMainState();
        persistClinicalState();
      });
    });
  }



  function renderMainTrajectoryCard(trajectoryEntries) {
    if (!MAIN.ui?.trajectoryCard) return;
    const entries = Array.isArray(trajectoryEntries)
      ? trajectoryEntries
      : getTrajectoryEntries(MAIN.tumorCenter, MAIN.diagnosisData?.depth_metrics, MAIN_SCENE_RADIUS, MAIN.state);
    const summary = computeTrajectorySummary(
      MAIN.diagnosisData,
      MAIN.tumorCenter,
      entries,
      MAIN.riskSummary,
      MAIN.state.showPath,
      false
    );
    MAIN.ui.trajectoryCard.innerHTML = `
      <div class="brain-trajectory-title">${summary.title}</div>
      <div class="brain-trajectory-meta">${summary.meta}</div>
      <div class="brain-trajectory-list">
        ${summary.tags.map(tag => `<span class="brain-trajectory-pill">${tag}</span>`).join('')}
      </div>
      ${summary.measurements?.length ? `
        <div class="brain-trajectory-metrics">
          ${summary.measurements.map(item => `
            <div class="brain-trajectory-metric">
              <span>${item.label}</span>
              <strong>${item.value}</strong>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  function renderMainRiskCard() {
    if (!MAIN.ui?.riskCard) return;

    const isDetected = MAIN.diagnosisData?.prediction?.tumor_detected;
    const hasRisk = MAIN.riskSummary && MAIN.riskSummary.length > 0;

    // Toggle center host visibility
    if (MAIN.ui.riskCardHost) {
      const shouldShow = !!(isDetected && hasRisk);
      if (MAIN.ui.riskCardHost.style.display !== (shouldShow ? 'block' : 'none')) {
        MAIN.ui.riskCardHost.style.display = shouldShow ? 'block' : 'none';
        // Force a resize event to ensure 3D viewer and other components adapt to layout change
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      }
    }

    if (!isDetected || !hasRisk) {
      MAIN.ui.riskCard.innerHTML = '<div class="brain-risk-empty">Chạy chẩn đoán để kích hoạt bản đồ nhiệt rủi ro.</div>';
      return;
    }

    const summary = computeSafetyMarginSummary();
    const nearest = summary.nearest;
    const margin = Math.round(MAIN.state.safetyMarginMm);

    // Progress bar shows how much of the safety gap is "consumed" by the margin
    const distToZone = nearest ? Math.max(0.1, nearest.distanceMm) : 20;
    const progress = clamp((margin / distToZone) * 100, 0, 100);
    const isCritical = summary.impacted.length > 0;

    MAIN.ui.riskCard.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 24px; align-items: start;">
        <div>
          <div class="brain-risk-head">
            <span class="brain-risk-dot ${isCritical ? 'pulse-fast' : ''}" style="background:${summary.tone}; width: 14px; height: 14px;"></span>
            <div>
              <div class="brain-risk-title" style="color:${summary.tone}; font-weight:800; font-size: 16px; letter-spacing: -0.2px;">${summary.label}</div>
              <div class="brain-risk-subtitle" style="font-size: 12px; margin-top: 2px;">Biên an toàn hiện tại: <strong>${margin} mm</strong></div>
            </div>
          </div>
          
          <div class="brain-risk-bar" style="background:var(--bg-deep); height:10px; border-radius:5px; overflow:hidden; margin: 16px 0; border: 1px solid var(--border);">
            <div class="brain-risk-fill" style="width:${progress}%; background:${summary.tone}; height:100%; transition: width 0.3s ease, background 0.3s ease;"></div>
          </div>

          <div class="brain-risk-list" style="margin-top: 16px; gap: 8px;">
            ${(MAIN.riskSummary || []).slice(0, 5).map(item => `
              <div class="brain-risk-row" style="padding: 6px 10px; border-radius: 8px; ${item.impacted ? 'background:rgba(255,23,68,0.08); border-left:3px solid #ff1744;' : 'background:rgba(148, 163, 184, 0.04);'}">
                <span class="brain-risk-row-label" style="font-size: 11px;">${item.label}</span>
                <span class="brain-risk-row-value" style="color:${item.impacted ? '#ff1744' : item.collisionState === 'warning' ? '#ff9100' : 'var(--text-sec)'}; font-weight:700; font-family: 'Roboto Condensed', sans-serif;">
                  ${formatMm(item.distanceMm)}
                </span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="brain-risk-grid" style="grid-template-columns: repeat(2, 1fr); gap: 12px; align-content: start;">
          <div class="brain-risk-metric" style="padding: 12px; background: var(--bg-deep);">
            <span style="font-size: 10px; opacity: 0.7;">Vùng gần nhất</span>
            <strong style="font-size: 14px; margin-top: 4px;">${nearest?.label || 'N/A'}</strong>
          </div>
          <div class="brain-risk-metric" style="padding: 12px; background: var(--bg-deep);">
            <span style="font-size: 10px; opacity: 0.7;">Khoảng cách u</span>
            <strong style="font-size: 18px; margin-top: 4px; font-family: 'Roboto Condensed', sans-serif;">${nearest ? formatMm(nearest.distanceMm) : 'N/A'}</strong>
          </div>
          <div class="brain-risk-metric" style="padding: 12px; background: var(--bg-deep);">
            <span style="font-size: 10px; opacity: 0.7;">Dư địa biên</span>
            <strong style="color:${summary.tone}; font-size: 20px; margin-top: 4px; font-family: 'Roboto Condensed', sans-serif;">${nearest ? formatMm(nearest.marginDeltaMm) : 'N/A'}</strong>
          </div>
          <div class="brain-risk-metric" style="padding: 12px; background: var(--bg-deep); ">
            <span style="font-size: 10px; opacity: 0.7;">Vùng rủi ro</span>
            <strong style="color:${isCritical ? '#ff1744' : 'inherit'}; font-size: 20px; margin-top: 4px; font-family: 'Roboto Condensed', sans-serif;">${summary.impacted.length}</strong>
          </div>
          <div style="grid-column: span 2; padding: 12px; background: rgba(14, 165, 233, 0.04); border: 1px dashed rgba(14, 165, 233, 0.2); border-radius: 12px; font-size: 11px; color: var(--text-sec); line-height: 1.5;">
            <i class="fa-solid fa-circle-info" style="color: var(--cyan); margin-right: 6px;"></i>
            Bản đồ nhiệt rủi ro tính toán khả năng xâm lấn của biên an toàn ${margin}mm vào các cấu trúc chức năng quan trọng.
          </div>
        </div>
      </div>
    `;
  }

  function renderMainReferenceCard() {
    if (!MAIN.ui?.referenceCard) return;
    const selected = pickReferenceSimilarCase();
    if (!selected) {
      MAIN.ui.referenceCard.innerHTML = `
        <div class="brain-risk-empty">
          <i class="fa-solid fa-database" style="display:block; font-size: 24px; margin-bottom: 12px; opacity: 0.3;"></i>
          Không tìm thấy dữ liệu ca bệnh tương đồng phù hợp để đối chiếu hình thái trong cơ sở dữ liệu lâm sàng.
        </div>
      `;
      return;
    }

    const similarityPct = Math.round(selected.similarity * 100);
    const locationText = window.translateLocationToVi ? window.translateLocationToVi(selected.refKey) : selected.refKey.replace(/_/g, ' ');
    const badgeColor = selected.sameLobe ? 'var(--emerald)' : 'var(--cyan)';

    MAIN.ui.referenceCard.innerHTML = `
      <div class="brain-reference-head">
        <div>
          <div class="brain-risk-title">Ca bệnh tham chiếu #${selected.caseItem?.case_id ?? 'N/A'}</div>
          <div class="brain-risk-subtitle" style="text-transform: capitalize;">${locationText}</div>
        </div>
        <div class="brain-reference-score">
          <span class="brain-reference-badge" style="background:${badgeColor};">${similarityPct}%</span>
          <div style="font-size: 9px; color: var(--text-dim); text-align: center; margin-top: 4px; font-weight: 600;">TƯƠNG ĐỒNG</div>
        </div>
      </div>
      <div class="brain-reference-copy">
        <i class="fa-solid fa-microscope" style="color: var(--cyan); margin-right: 6px;"></i>
        ${selected.sameLobe ? 'Mô hình đối chiếu được canh chỉnh <strong>cùng thùy não</strong> để so sánh hình thái trực tiếp.' : 'Mô hình đối chiếu được đặt tại thùy não tương ứng của ca bệnh tham khảo.'}
      </div>
      <div class="brain-risk-grid" style="margin-top: 14px;">
        <div class="brain-risk-metric">
          <span>Phân thùy</span>
          <strong>${selected.sameLobe ? 'Trùng khớp' : 'Khác biệt'}</strong>
        </div>
        <div class="brain-risk-metric">
          <span>Bên não</span>
          <strong>${selected.sameSide ? 'Cùng bên' : 'Đối bên'}</strong>
        </div>
      </div>
     
    `;
  }

  function handleSliceInteraction(view, event, state, mediaEl) {
    const rect = mediaEl.getBoundingClientRect();
    const nx = clamp01((event.clientX - rect.left) / rect.width);
    const ny = clamp01((event.clientY - rect.top) / rect.height);
    if (view === 'axial') {
      state.clip.sagittal = nx;
      state.clip.coronal = ny;
    } else if (view === 'coronal') {
      state.clip.sagittal = nx;
      state.clip.axial = ny;
    } else if (view === 'sagittal') {
      state.clip.coronal = nx;
      state.clip.axial = ny;
    }
  }

  function ensureMainOverlayRoot() {
    if (!MAIN.ctx?.scene) return;
    if (!MAIN.overlayRoot) {
      MAIN.overlayRoot = new THREE.Group();
      MAIN.overlayRoot.name = 'ClinicalOverlayRoot';
      MAIN.ctx.scene.add(MAIN.overlayRoot);
    }
  }

  function ensureMainClipPlanes() {
    if (!MAIN.ctx?.renderer) return;
    if (!MAIN.clipPlanes) {
      MAIN.clipPlanes = {
        sagittal: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
        coronal: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        axial: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      };
    }
    MAIN.ctx.renderer.localClippingEnabled = true;
  }

  function isOuterMesh(name) {
    const normalized = String(name || '').toLowerCase();
    if (!normalized) return true;
    return normalized.includes('outer') ||
      normalized.includes('cortex') ||
      normalized.includes('brain') ||
      normalized.includes('cerebr') ||
      normalized.includes('hemisphere') ||
      normalized.includes('surface');
  }

  function attachClippingToMesh(mesh, clipPlanes, cortexOpacity, deepOpacity) {
    if (!mesh) return;
    mesh.traverse(node => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(material => {
        material.clippingPlanes = [clipPlanes.sagittal, clipPlanes.coronal, clipPlanes.axial];
        material.clipShadows = true;
        material.transparent = true;
        material.depthWrite = material.opacity > 0.5;
        material.opacity = isOuterMesh(node.name) ? clamp01(cortexOpacity) : clamp01(deepOpacity);
        material.needsUpdate = true;
      });
    });
  }

  function updateMainClipPlanes() {
    if (!MAIN.ctx) return;
    ensureMainClipPlanes();
    ensureMainOverlayRoot();
    const rotation = getRotationEuler(MAIN.ctx);
    const sceneRadius = MAIN_SCENE_RADIUS;
    const axisConfig = {
      sagittal: {
        normal: new THREE.Vector3(-1, 0, 0),
        point: new THREE.Vector3(axisValueToScene(MAIN.state.clip.sagittal, sceneRadius), 0, 0),
        color: 0x38bdf8,
      },
      coronal: {
        normal: new THREE.Vector3(0, -1, 0),
        point: new THREE.Vector3(0, axisValueToScene(MAIN.state.clip.coronal, sceneRadius), 0),
        color: 0x22c55e,
      },
      axial: {
        normal: new THREE.Vector3(0, 0, -1),
        point: new THREE.Vector3(0, 0, axisValueToScene(MAIN.state.clip.axial, sceneRadius)),
        color: 0xf59e0b,
      },
    };

    Object.entries(axisConfig).forEach(([axis, config]) => {
      const worldPoint = applyVectorRotation(config.point, rotation);
      const worldNormal = applyVectorRotation(config.normal, rotation).normalize();
      MAIN.clipPlanes[axis].setFromNormalAndCoplanarPoint(worldNormal, worldPoint);
      ensureMainSlicePlaneMesh(axis, config.color);
      updateSlicePlaneMesh(MAIN.slicePlaneMeshes[axis], worldPoint, worldNormal, sceneRadius * 2.4);
    });

    const mesh = MAIN.ctx.getBrainMesh ? MAIN.ctx.getBrainMesh() : MAIN.ctx.brainMesh;
    if (mesh) {
      attachClippingToMesh(mesh, MAIN.clipPlanes, MAIN.state.cortexOpacity, MAIN.state.deepOpacity);
      MAIN.lastMesh = mesh;
    }
  }

  function ensureMainSlicePlaneMesh(axis, color) {
    if (!MAIN.overlayRoot || MAIN.slicePlaneMeshes[axis]) return;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(MAIN_SCENE_RADIUS * 2.25, MAIN_SCENE_RADIUS * 2.25),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.04,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    mesh.renderOrder = 20;
    MAIN.overlayRoot.add(mesh);
    MAIN.slicePlaneMeshes[axis] = mesh;
  }

  function updateSlicePlaneMesh(mesh, worldPoint, worldNormal, size) {
    if (!mesh) return;
    mesh.visible = !!MAIN.diagnosisData;
    mesh.position.copy(worldPoint);
    mesh.scale.setScalar(size / (MAIN_SCENE_RADIUS * 2.25));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal.clone().normalize());
  }

  function buildFunctionalGroup(sceneRadius, riskSummary) {
    const group = new THREE.Group();
    group.name = 'ClinicalFunctionalGroup';
    group.userData.pulseNodes = [];

    riskSummary.forEach(item => {
      const isCritical = item.impacted;
      const isWarning = item.collisionState === 'warning';

      // Use more vibrant colors for risk states
      let colorHex = item.color;
      if (isCritical) colorHex = '#ff1744'; // Bright Red
      else if (isWarning) colorHex = '#ff9100'; // Deep Orange

      const accentColor = new THREE.Color(colorHex);

      // 1. Base Patch (Functional Zone Disk)
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(item.radius, 32),
        new THREE.MeshStandardMaterial({
          color: accentColor,
          emissive: accentColor,
          emissiveIntensity: isCritical ? 0.6 : isWarning ? 0.3 : 0.1,
          transparent: true,
          opacity: isCritical ? 0.45 : isWarning ? 0.35 : 0.2,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      patch.position.copy(item.position);
      patch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), item.position.clone().normalize());

      // 2. Outer Glow / Rim
      const rimRadius = item.radius * (isCritical ? 1.15 : 1.05);
      const rim = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 64 }, (_, idx) => {
            const angle = (idx / 63) * Math.PI * 2;
            return new THREE.Vector3(Math.cos(angle) * rimRadius, Math.sin(angle) * rimRadius, 0);
          })
        ),
        new THREE.LineBasicMaterial({
          color: accentColor,
          transparent: true,
          opacity: isCritical ? 1.0 : isWarning ? 0.8 : 0.5,
          linewidth: isCritical ? 3 : 1
        })
      );
      rim.position.copy(item.position);
      rim.quaternion.copy(patch.quaternion);

      // 3. Danger Aura for critical zones
      let aura = null;
      if (isCritical) {
        aura = new THREE.Mesh(
          new THREE.CircleGeometry(item.radius * 1.4, 32),
          new THREE.MeshBasicMaterial({
            color: accentColor,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        aura.position.copy(item.position).multiplyScalar(0.99); // Slightly below
        aura.quaternion.copy(patch.quaternion);
        group.add(aura);
      }

      // 4. Stem (Line to brain surface/interior)
      const stem = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          item.position.clone().multiplyScalar(0.92),
          item.position.clone().multiplyScalar(1.1),
        ]),
        new THREE.LineBasicMaterial({
          color: accentColor,
          transparent: true,
          opacity: isCritical ? 0.9 : isWarning ? 0.7 : 0.4
        })
      );

      group.add(patch);
      group.add(rim);
      group.add(stem);

      if (isCritical || isWarning) {
        group.userData.pulseNodes.push({
          patch,
          rim,
          stem,
          aura,
          mode: isCritical ? 'critical' : 'warning',
          baseRadius: item.radius
        });
      }
    });
    return group;
  }

  function extractComponentFractions(diagnosisData) {
    const stats = diagnosisData?.multiclass_stats;
    const total = stats?.total_tumor_pixels || 0;
    if (!total) return { ncr: 0.22, et: 0.38, ed: 0.62 };
    return {
      ncr: Math.max(0.10, Math.min(0.55, (stats.ncr_count || 0) / total)),
      et: Math.max(0.18, Math.min(0.70, (stats.et_count || 0) / total)),
      ed: Math.max(0.30, Math.min(0.92, (stats.ed_count || 0) / total)),
    };
  }

  // Vẽ khối u trực quan vào 3D khi chẩn đoán  < --------------
  function applyMainTumorComponents() {
    ensureMainOverlayRoot();
    if (MAIN.tumorComponentGroup) {
      disposeObject3D(MAIN.tumorComponentGroup);
      MAIN.overlayRoot.remove(MAIN.tumorComponentGroup);
      MAIN.tumorComponentGroup = null;
    }
    if (!MAIN.diagnosisData?.prediction?.tumor_detected || !MAIN.tumorCenter) return;

    const summary = computeSafetyMarginSummary();
    const isCritical = summary.impacted.length > 0;
    const isWarning = summary.warning && !isCritical;

    const fractions = extractComponentFractions(MAIN.diagnosisData);
    const base = MAIN.tumorRadius || 0.11;
    const group = new THREE.Group();
    group.name = 'ClinicalTumorGroup';

    // 1. Edema Layer (Greenish)
    if (MAIN.state.showEdema) {
      const edemaColor = '#a5d6a7';
      const edema = new THREE.Mesh(
        new THREE.SphereGeometry(base * (1.45 + fractions.ed * 0.35), 32, 32),
        new THREE.MeshStandardMaterial({
          color: edemaColor,
          transparent: true,
          opacity: 0.11,
          depthWrite: false,
        })
      );
      edema.position.copy(MAIN.tumorCenter);
      group.add(edema);
    }

    // 2. Enhancing Layer (Yellowish Wireframe)
    if (MAIN.state.showEnhancing) {
      const enhancingColor = '#fff59d';
      const enhancing = new THREE.Mesh(
        new THREE.SphereGeometry(base * (1.12 + fractions.et * 0.24), 28, 28),
        new THREE.MeshStandardMaterial({
          color: enhancingColor,
          transparent: true,
          opacity: 0.30,
          wireframe: true,
          depthWrite: false,
        })
      );
      enhancing.position.copy(MAIN.tumorCenter);
      group.add(enhancing);
    }

    // 3. Tumor Core (Reddish)
    if (MAIN.state.showCore) {
      const coreColor = '#ffab91';
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(base * (0.62 + fractions.ncr * 0.25), 32, 32),
        new THREE.MeshStandardMaterial({
          color: coreColor,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        })
      );
      core.position.copy(MAIN.tumorCenter);
      group.add(core);
    }

    // 4. Acoustic Wave Ripples (Cảnh báo sóng âm) - Luôn hiển thị để đánh dấu vị trí khối u
    const waveCount = 3;
    group.userData.waves = [];
    const waveColor = isCritical ? '#ff8a80' : isWarning ? '#ffcc80' : '#a5d6a7';

    for (let i = 0; i < waveCount; i++) {
      const wave = new THREE.Mesh(
        new THREE.SphereGeometry(base * 0.8, 32, 32),
        new THREE.MeshBasicMaterial({
          color: waveColor,
          transparent: true,
          opacity: 0,
          wireframe: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      wave.position.copy(MAIN.tumorCenter);
      group.add(wave);
      group.userData.waves.push({
        mesh: wave,
        phase: i / waveCount,

      });
    }

    group.userData.severity = isCritical ? 'critical' : isWarning ? 'warning' : 'safe';

    MAIN.overlayRoot.add(group);
    MAIN.tumorComponentGroup = group;
  }

  function applyMainSafetyMarginOverlay() {
    ensureMainOverlayRoot();
    if (MAIN.safetyMarginGroup) {
      disposeObject3D(MAIN.safetyMarginGroup);
      MAIN.overlayRoot.remove(MAIN.safetyMarginGroup);
      MAIN.safetyMarginGroup = null;
    }
    if (!MAIN.state.showRiskShell || !MAIN.diagnosisData?.prediction?.tumor_detected || !MAIN.tumorCenter) return;

    const summary = computeSafetyMarginSummary();
    const isCritical = summary.impacted.length > 0;
    const isWarning = summary.warning && !isCritical;

    // Safety margin color: Force bright red if impacted
    const toneHex = isCritical ? '#ff1744' : summary.tone;
    const tone = new THREE.Color(toneHex);

    const marginRadius = MAIN.tumorRadius + mmToScene(MAIN.state.safetyMarginMm, MAIN_SCENE_RADIUS);
    const group = new THREE.Group();
    group.name = 'ClinicalSafetyMarginGroup';

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(marginRadius, 32, 32),
      new THREE.MeshStandardMaterial({
        color: tone,
        emissive: tone,
        emissiveIntensity: isCritical ? 0.4 : isWarning ? 0.2 : 0.05,
        transparent: true,
        opacity: isCritical ? 0.18 : isWarning ? 0.12 : 0.07,
        depthWrite: false,
        roughness: 0.1,
        metalness: 0.2
      })
    );
    shell.position.copy(MAIN.tumorCenter);

    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(marginRadius * 1.015, 24, 24),
      new THREE.MeshBasicMaterial({
        color: tone,
        wireframe: true,
        transparent: true,
        opacity: isCritical ? 0.75 : isWarning ? 0.45 : 0.25,
        depthWrite: false,
      })
    );
    rim.position.copy(MAIN.tumorCenter);

    group.add(shell);
    group.add(rim);

    // Connecting lines to functional zones
    (MAIN.riskSummary || []).slice(0, 4).forEach((item, index) => {
      const itemIsCritical = item.impacted;
      const itemIsWarning = item.collisionState === 'warning';

      const accentHex = itemIsCritical ? '#ff1744' : itemIsWarning ? '#ff9100' : item.color;
      const accent = new THREE.Color(accentHex);

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([MAIN.tumorCenter, item.position]),
        new THREE.LineBasicMaterial({
          color: accent,
          transparent: true,
          opacity: itemIsCritical ? 0.85 : itemIsWarning ? 0.50 : 0.25,
        })
      );

      // Node on the line
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(item.radius * 0.16, 16, 16),
        new THREE.MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: itemIsCritical ? 0.95 : 0.80,
          depthWrite: false,
        })
      );
      // Position the node at the intersection with the margin shell or closer to zone
      const lerpFactor = itemIsCritical ? 0.25 : 0.12 + index * 0.04;
      node.position.copy(item.position.clone().lerp(MAIN.tumorCenter, lerpFactor));

      group.add(line);
      group.add(node);
    });

    group.userData = {
      shell,
      rim,
      severity: isCritical ? 'critical' : isWarning ? 'warning' : 'safe',
      baseShellOpacity: shell.material.opacity,
      baseRimOpacity: rim.material.opacity,
      baseEmissiveIntensity: shell.material.emissiveIntensity
    };

    MAIN.overlayRoot.add(group);
    MAIN.safetyMarginGroup = group;
  }

  function applyMainAttentionCloud() {
    ensureMainOverlayRoot();
    if (MAIN.attentionCloudGroup) {
      disposeObject3D(MAIN.attentionCloudGroup);
      MAIN.overlayRoot.remove(MAIN.attentionCloudGroup);
      MAIN.attentionCloudGroup = null;
    }
    if (!MAIN.state.showAttentionCloud || !MAIN.diagnosisData?.prediction?.tumor_detected || !MAIN.tumorCenter) return;
    const samples = Array.isArray(MAIN.attentionCloudSamples) ? MAIN.attentionCloudSamples : null;
    if (!samples || !samples.length) {
      queueAttentionCloudSampleRefresh();
      return;
    }

    const normal = MAIN.tumorCenter.clone().lengthSq() > 0.0001
      ? MAIN.tumorCenter.clone().normalize()
      : new THREE.Vector3(0, 0, 1);
    const tangentSeed = Math.abs(normal.y) > 0.84 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangentX = tangentSeed.clone().cross(normal).normalize();
    const tangentY = normal.clone().cross(tangentX).normalize();
    const group = new THREE.Group();
    group.name = 'ClinicalAttentionCloudGroup';
    const spread = MAIN.tumorRadius * 2.3;
    const bins = [
      { min: 0.00, max: 0.42, size: 0.024, opacity: 0.18, positions: [], colors: [] },
      { min: 0.42, max: 0.72, size: 0.034, opacity: 0.28, positions: [], colors: [] },
      { min: 0.72, max: 2.00, size: 0.048, opacity: 0.46, positions: [], colors: [] },
    ];

    samples.forEach((sample, sampleIndex) => {
      const intensity = clamp(sample.intensity, 0, 1);
      const density = Math.max(1, Math.round(1 + intensity * 5));
      const bin = bins.find(entry => intensity >= entry.min && intensity < entry.max) || bins[bins.length - 1];
      for (let copyIndex = 0; copyIndex < density; copyIndex += 1) {
        const seed = sampleIndex * 17.13 + copyIndex * 5.17 + intensity * 13.0;
        const localX = (sample.u - 0.5) * spread + (pseudoRandom(seed + 0.3) - 0.5) * MAIN.tumorRadius * 0.42;
        const localY = (0.5 - sample.v) * spread * 0.86 + (pseudoRandom(seed + 1.3) - 0.5) * MAIN.tumorRadius * 0.36;
        const normalOffset = MAIN.tumorRadius * (0.26 + intensity * 1.05 + pseudoRandom(seed + 2.3) * 0.32);
        const point = MAIN.tumorCenter.clone()
          .add(tangentX.clone().multiplyScalar(localX))
          .add(tangentY.clone().multiplyScalar(localY))
          .add(normal.clone().multiplyScalar(normalOffset));
        const color = colorFromAttention(intensity);
        bin.positions.push(point.x, point.y, point.z);
        bin.colors.push(color.r, color.g, color.b);
      }
    });

    bins.forEach(bin => {
      if (!bin.positions.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bin.positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(bin.colors, 3));
      const material = new THREE.PointsMaterial({
        size: bin.size,
        vertexColors: true,
        transparent: true,
        opacity: bin.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, material);
      group.add(points);
    });

    group.userData = { pulsePhase: 0 };
    MAIN.overlayRoot.add(group);
    MAIN.attentionCloudGroup = group;
  }

  function applyMainSimilarWireframeOverlay() {
    ensureMainOverlayRoot();
    if (MAIN.similarWireframeGroup) {
      disposeObject3D(MAIN.similarWireframeGroup);
      MAIN.overlayRoot.remove(MAIN.similarWireframeGroup);
      MAIN.similarWireframeGroup = null;
    }

    // Check if toggled on and data exists
    if (!MAIN.state.showSimilarWireframe || !MAIN.diagnosisData?.prediction?.tumor_detected || !MAIN.tumorCenter) {
      return;
    }

    const selected = pickReferenceSimilarCase();
    if (!selected) {
      console.log('[Clinical3D] ℹ️ Không tìm thấy ca bệnh tương đồng phù hợp để hiển thị 3D.');
      return;
    }

    console.log(`[Clinical3D] 🧬 Đang tích hợp ca tương đồng #${selected.caseItem?.case_id} vào không gian 3D...`);

    const currentKey = locationHintToKey(MAIN.diagnosisData?.prediction?.location_hint);
    const targetAnchor = getSceneAnchorFromLocationKey(selected.refKey, MAIN_SCENE_RADIUS);
    const currentAnchor = getSceneAnchorFromLocationKey(currentKey, MAIN_SCENE_RADIUS);
    const similarity = clamp(selected.similarity, 0, 1);

    // Giảm blend factor để "bao quanh" khối u hiện tại tốt hơn nhưng vẫn giữ xu hướng vị trí
    const blend = selected.sameLobe ? 0.04 : selected.sameSide ? 0.08 : 0.12;
    const wireCenter = MAIN.tumorCenter.clone().add(
      targetAnchor.clone().sub(currentAnchor).multiplyScalar(blend)
    );

    const seed = (Number(selected.caseItem?.case_id) || 0) + similarity * 100;
    const sizeVariance = (pseudoRandom(seed + 4.7) - 0.5) * 0.22;
    // Bán kính tham chiếu của ca tương tự
    const refRadius = MAIN.tumorRadius * clamp(0.95 + (1 - similarity) * 0.18 + sizeVariance, 0.80, 1.25);

    const geometry = buildOrganicWireframeGeometry(refRadius, seed);
    const group = new THREE.Group();
    group.name = 'ClinicalSimilarWireframeGroup';

    // 1. Fill mờ (Cyan/Teal)
    const fill = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.08, // Tăng nhẹ độ mờ
        depthWrite: false,
      })
    );
    fill.position.copy(wireCenter);

    // 2. Lưới Wireframe (Teal/Emerald)
    const wire = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0x2dd4bf,
        wireframe: true,
        transparent: true,
        opacity: 0.55, // Tăng độ hiển thị
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    wire.position.copy(wireCenter);

    // 3. Vòng đai xích đạo (Rim)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(refRadius * 0.95, Math.max(refRadius * 0.02, 0.005), 12, 72),
      new THREE.MeshBasicMaterial({
        color: 0xa7f3d0,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
    );
    ring.position.copy(wireCenter);
    ring.rotation.x = Math.PI / 2;

    group.add(fill);
    group.add(wire);
    group.add(ring);

    // Dây nối (Tether) nếu có khoảng cách đáng kể
    if (wireCenter.distanceTo(MAIN.tumorCenter) > MAIN.tumorRadius * 0.12) {
      const tether = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([MAIN.tumorCenter, wireCenter]),
        new THREE.LineBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.3,
        })
      );
      group.add(tether);
    }

    group.userData = {
      fill,
      wire,
      ring,
      center: wireCenter.clone(),
      meta: selected,
      pulsePhase: 0
    };

    MAIN.overlayRoot.add(group);
    MAIN.similarWireframeGroup = group;
    console.log('[Clinical3D] ✅ Đã hiển thị khung vỏ u đối chiếu.');
  }

  function computeTrajectorySummary(diagnosisData, tumorCenter, trajectoryEntries, riskSummary, showPath, selectingEntry) {
    if (!diagnosisData?.prediction?.tumor_detected || !tumorCenter) {
      return {
        title: 'Đường mổ không khả dụng',
        meta: 'Cần có dữ liệu khối u để mô phỏng đường vào.',
        tags: ['Đang chờ chẩn đoán'],
        measurements: [],
      };
    }
    const entries = Array.isArray(trajectoryEntries) ? trajectoryEntries : [];
    const manualEntries = entries.filter(item => item.manual);
    const manualCount = manualEntries.length;
    const lengthValues = entries
      .map(item => item.lengthMm)
      .filter(value => typeof value === 'number' && Number.isFinite(value));
    const minLengthMm = lengthValues.length ? Math.min(...lengthValues) : null;
    const maxLengthMm = lengthValues.length ? Math.max(...lengthValues) : null;
    const measurements = entries.map(item => ({
      label: item.label,
      value: formatMm(item.lengthMm),
    }));
    if (selectingEntry) {
      return {
        title: manualCount ? `Đang thêm điểm vào (${manualCount})` : 'Đang chờ chọn điểm vào',
        meta: manualCount
          ? `Click thêm trên bề mặt não trong viewer 3D để tạo nhiều đường vào. Hiện đã có ${manualCount} điểm với chiều dài ${manualCount > 1 ? `${formatMm(minLengthMm)} đến ${formatMm(maxLengthMm)}` : formatMm(minLengthMm)}.`
          : 'Click trên bề mặt não trong viewer 3D để đặt điểm vào phẫu thuật. Có thể click nhiều lần để thêm nhiều đường vào.',
        tags: ['Chọn nhiều điểm vào', 'Đồng bộ 2D/3D'],
        measurements,
      };
    }
    if (!showPath) {
      return {
        title: 'Chưa kích hoạt kế hoạch đường mổ',
        meta: 'Bật Kế hoạch đường mổ để hiện tia vào và đường đi ước tính tới tâm khối u.',
        tags: ['Tắt đường mổ'],
        measurements: [],
      };
    }

    const tags = ['Chất trắng'];
    if (riskSummary[0]) tags.push(riskSummary[0].label);
    if ((diagnosisData?.depth_metrics?.tumor_depth_mm || 0) > 32) tags.push('Hành lang sâu');
    if ((diagnosisData?.prediction?.location_hint || '').toLowerCase().includes('parietal')) tags.push('Cận vùng cảm giác');
    if ((diagnosisData?.prediction?.location_hint || '').toLowerCase().includes('temporal')) tags.push('Cảnh báo Ngôn ngữ / Trí nhớ');
    if (manualCount > 1) tags.unshift(`${manualCount} lối vào thủ công`);
    else if (manualCount === 1) tags.unshift('1 lối vào thủ công');

    return {
      title: manualCount
        ? `${manualCount} điểm vào tùy chỉnh đang hoạt động`
        : 'Tự động chọn điểm vào vỏ não',
      meta: manualCount
        ? `Đã chọn ${manualCount} điểm vào thủ công. Độ dài đường vào ${manualCount > 1 ? `dao động ${formatMm(minLengthMm)} đến ${formatMm(maxLengthMm)}` : formatMm(minLengthMm)} để bác sĩ so sánh trực tiếp trên mô hình 3D.`
        : `Độ dài đường vào ước tính ${formatMm(minLengthMm)}. Hướng vào được neo theo bề mặt vỏ não gần nhất để bác sĩ đối chiếu nhanh với MRI 2D.`,
      tags,
      measurements,
    };
  }


  // Vẽ đường mổ mô phòng vào não <---------------- 
  function applyMainTrajectory() {
    ensureMainOverlayRoot();
    if (MAIN.trajectoryGroup) {
      disposeObject3D(MAIN.trajectoryGroup);
      MAIN.overlayRoot.remove(MAIN.trajectoryGroup);
      MAIN.trajectoryGroup = null;
    }
    if (!MAIN.state.showPath || !MAIN.diagnosisData?.prediction?.tumor_detected || !MAIN.tumorCenter) return;

    const trajectoryEntries = getTrajectoryEntries(
      MAIN.tumorCenter,
      MAIN.diagnosisData?.depth_metrics,
      MAIN_SCENE_RADIUS,
      MAIN.state
    );
    if (!trajectoryEntries.length) return;
    const group = new THREE.Group();
    const tumorSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.94 })
    );
    tumorSphere.position.copy(MAIN.tumorCenter);
    group.add(tumorSphere);

    trajectoryEntries.forEach((item, index) => {
      const entryPoint = item.entryPoint;
      const accent = new THREE.Color(getTrajectoryAccent(index, item.manual));
      const glowAccent = accent.clone().lerp(new THREE.Color('#dcfce7'), 0.42);

      const shaft = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([entryPoint, MAIN.tumorCenter]),
        new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: item.manual ? 0.96 : 0.92 })
      );
      const glow = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([entryPoint, MAIN.tumorCenter]),
        new THREE.LineBasicMaterial({ color: glowAccent, transparent: true, opacity: 0.32 })
      );
      const entrySphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 16, 16),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.96 })
      );
      entrySphere.position.copy(entryPoint);

      group.add(shaft);
      group.add(glow);
      group.add(entrySphere);

      const metricSprite = createTrajectoryMetricSprite(item.lengthMm, `#${accent.getHexString()}`);
      if (metricSprite) {
        metricSprite.position.copy(computeTrajectoryLabelPosition(entryPoint, MAIN.tumorCenter, index));
        group.add(metricSprite);
      }
    });

    MAIN.overlayRoot.add(group);
    MAIN.trajectoryGroup = group;
  }

  function refreshMainRiskSummary() {
    MAIN.riskSummary = computeFunctionalRiskSummary(
      MAIN.tumorCenter,
      MAIN_SCENE_RADIUS,
      MAIN.diagnosisData?.prediction?.location_hint,
      MAIN.tumorRadius,
      MAIN.state?.safetyMarginMm || 0
    );
  }

  function applyMainFunctionalOverlay() {
    ensureMainOverlayRoot();
    if (MAIN.functionalGroup) {
      MAIN.overlayRoot.remove(MAIN.functionalGroup);
      MAIN.functionalGroup = null;
    }
    if (!MAIN.state.showFunctional || !MAIN.riskSummary.length) return;
    MAIN.functionalGroup = buildFunctionalGroup(MAIN_SCENE_RADIUS, MAIN.riskSummary);
    MAIN.overlayRoot.add(MAIN.functionalGroup);
  }

  function applyMainOpacityProfile() {
    if (!MAIN.ctx) return;
    const mesh = MAIN.ctx.getBrainMesh ? MAIN.ctx.getBrainMesh() : null;
    if (!mesh || !MAIN.clipPlanes) return;
    attachClippingToMesh(mesh, MAIN.clipPlanes, MAIN.state.cortexOpacity, MAIN.state.deepOpacity);
  }

  function applyMainState() {
    if (!MAIN.ctx) return;
    updateMainClipPlanes();
    applyMainOpacityProfile();
    applyMainFunctionalOverlay();
    applyMainSafetyMarginOverlay();
    applyMainTumorComponents();
    applyMainAttentionCloud();
    applyMainSimilarWireframeOverlay();
    applyMainTrajectory();
    updateMainViewerTooltips();
  }

  function ensureMainTooltipLayer() {
    const viewer = MAIN.ctx?.viewerElement || document.getElementById('viewer3d');
    if (!viewer) return null;
    if (!MAIN.tooltipLayer || !viewer.contains(MAIN.tooltipLayer)) {
      MAIN.tooltipLayer?.remove?.();
      MAIN.tooltipLayer = document.createElement('div');
      MAIN.tooltipLayer.className = 'brain-3d-tooltip-layer';
      viewer.appendChild(MAIN.tooltipLayer);
      MAIN.tooltipNodes = new Map();
      MAIN.tooltipSpecs = [];
      MAIN.tooltipStateKey = '';
    }
    return MAIN.tooltipLayer;
  }

  function createMainTooltipNode() {
    const node = document.createElement('div');
    node.className = 'brain-3d-tip';
    node.innerHTML = `
      <div class="brain-3d-tip-line"></div>
      <div class="brain-3d-tip-anchor"></div>
      <div class="brain-3d-tip-card">
        <div class="brain-3d-tip-topline">
          <span class="brain-3d-tip-kicker"></span>
          <div class="brain-3d-tip-actions">
            <span class="brain-3d-tip-badge"></span>
            <button type="button" class="brain-3d-tip-close" aria-label="Ẩn tooltip">×</button>
          </div>
        </div>
        <div class="brain-3d-tip-title"></div>
        <div class="brain-3d-tip-desc"></div>
        <div class="brain-3d-tip-meta"></div>
      </div>
    `;

    const card = node.querySelector('.brain-3d-tip-card');
    const closeBtn = node.querySelector('.brain-3d-tip-close');

    const stopPointer = event => {
      event.stopPropagation();
    };

    ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(eventName => {
      card.addEventListener(eventName, stopPointer);
    });

    closeBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const key = node.dataset.key;
      if (key) dismissMainTooltip(key);
    });

    return node;
  }

  function setMainTooltipNodeContent(node, spec) {
    node.dataset.key = spec.key || '';
    node.classList.toggle('is-screen', !!spec.screen);
    node.classList.toggle('is-metric', !!spec.compact);
    node.style.setProperty('--brain-tip-accent', spec.accent || '#0ea5e9');
    node.querySelector('.brain-3d-tip-kicker').textContent = spec.eyebrow || '';
    node.querySelector('.brain-3d-tip-title').textContent = spec.title || '';
    node.querySelector('.brain-3d-tip-desc').textContent = spec.description || '';

    const badge = node.querySelector('.brain-3d-tip-badge');
    badge.textContent = spec.badge || '';
    badge.style.display = spec.badge ? 'inline-flex' : 'none';

    const meta = node.querySelector('.brain-3d-tip-meta');
    meta.textContent = spec.meta || '';
    meta.style.display = spec.meta ? 'block' : 'none';
  }

  function dismissMainTooltip(key) {
    if (!key) return;
    setMainTooltipSelected(key, false);
    updateMainViewerTooltips();
    renderMainTooltipManager();
  }

  function computeMainTooltipCatalog() {
    if (!MAIN.diagnosisData?.prediction?.tumor_detected || !MAIN.tumorCenter) return [];

    const specs = [];
    const tumorCenter = MAIN.tumorCenter.clone();
    const tumorRadius = MAIN.tumorRadius || 0.11;
    const sceneRadius = MAIN_SCENE_RADIUS;
    const depthMetrics = MAIN.diagnosisData?.depth_metrics || {};
    const location = MAIN.diagnosisData?.prediction?.location_hint || 'Chưa rõ vị trí';
    const depthMm = depthMetrics?.tumor_depth_mm;
    const depthTone = getDepthTone(depthMetrics);
    const activePlaneText = `Axial ${Math.round(MAIN.state.clip.axial * 100)}% · Coronal ${Math.round(MAIN.state.clip.coronal * 100)}% · Sagittal ${Math.round(MAIN.state.clip.sagittal * 100)}%`;

    specs.push({
      key: 'clip-planes',
      screen: { x: 0.63, y: 0.06 },
      accent: '#38bdf8',
      eyebrow: 'MPR / CLIPPING',
      title: 'Mặt cắt 3 trục đang hiển thị',
      description: 'Xanh dương = Sagittal, xanh lá = Coronal, vàng cam = Axial. Ba mặt phẳng này được đồng bộ với ảnh MPR 2D phía dưới.',
      meta: activePlaneText,
      badge: 'MPR',
    });

    specs.push({
      key: 'tumor-center',
      anchor: tumorCenter.clone().add(new THREE.Vector3(tumorRadius * 0.55, tumorRadius * 0.28, 0)),
      accent: '#f43f5e',
      eyebrow: 'TÂM KHỐI U',
      title: 'Mốc trung tâm khối u',
      description: 'Điểm này được dùng để đo độ sâu, canh mặt cắt và đối chiếu với đường mổ mô phỏng.',
      meta: `${location}${typeof depthMm === 'number' ? ` · sâu ${depthMm.toFixed(1)} mm` : ''}`,
      badge: 'Tumor',
      offsetX: 26,
      offsetY: -18,
    });

    if (MAIN.state.showEnhancing) {
      specs.push({
        key: 'enhancing',
        anchor: tumorCenter.clone().add(new THREE.Vector3(tumorRadius * 1.05, tumorRadius * 0.72, tumorRadius * 0.10)),
        accent: '#facc15',
        eyebrow: 'TĂNG CƯỜNG',
        title: 'Viền / lưới tăng cường tương phản',
        description: 'Vùng vàng bao quanh tâm u gợi ý phần mô đang bắt thuốc cản quang rõ hơn trên MRI.',
        meta: 'Giúp phân biệt phần u hoạt động mạnh với lõi trung tâm.',
        badge: 'Enhancing',
        offsetX: 18,
        offsetY: -48,
      });
    }

    if (MAIN.state.showEdema) {
      specs.push({
        key: 'edema',
        anchor: tumorCenter.clone().add(new THREE.Vector3(-tumorRadius * 1.55, tumorRadius * 0.30, -tumorRadius * 0.10)),
        accent: '#22c55e',
        eyebrow: 'PHÙ NÃO',
        title: 'Quầng phù quanh khối u',
        description: 'Khối xanh bán trong suốt cho biết vùng phù nề lan rộng quanh tổn thương, cần đối chiếu thêm với T2/FLAIR.',
        meta: 'Thường phản ánh mức ảnh hưởng lên mô não lân cận.',
        badge: 'Edema',
        offsetX: -232,
        offsetY: 18,
      });
    }

    if (MAIN.state.showRiskShell) {
      const riskSummary = computeSafetyMarginSummary();
      specs.push({
        key: 'safety-shell',
        anchor: tumorCenter.clone().add(new THREE.Vector3(tumorRadius * 1.28, -tumorRadius * 0.74, tumorRadius * 0.20)),
        accent: riskSummary.tone,
        eyebrow: 'BIÊN AN TOÀN',
        title: 'Biên an toàn quanh khối u',
        description: 'Vỏ cầu bán trong suốt mô phỏng biên an toàn do bác sĩ muốn giữ trước khi chạm vào các vùng chức năng.',
        meta: `${Math.round(MAIN.state.safetyMarginMm)} mm · ${riskSummary.label}`,
        badge: riskSummary.impacted.length ? 'Xâm phạm' : riskSummary.warning ? 'Cảnh báo' : 'An toàn',
        offsetX: 24,
        offsetY: 28,
      });
    }

    if (MAIN.state.showAttentionCloud && MAIN.attentionCloudSamples?.length) {
      const attentionScore = MAIN.diagnosisData?.xai?.gradcam?.attention_score
        ?? MAIN.diagnosisData?.xai_data?.gradcam?.attention_score
        ?? 0;
      specs.push({
        key: 'xai-cloud',
        anchor: tumorCenter.clone().add(new THREE.Vector3(-tumorRadius * 1.30, -tumorRadius * 0.64, tumorRadius * 0.26)),
        accent: '#38bdf8',
        eyebrow: 'BẢN ĐỒ CHÚ Ý AI',
        title: 'Vùng tập trung chẩn đoán (AI)',
        description: 'Tập hợp các điểm 3D mô phỏng vùng dữ liệu mà AI tập trung phân tích để đưa ra kết quả chẩn đoán.',
        meta: `${Math.round(attentionScore * 100)}% chú ý · ${MAIN.attentionCloudSamples.length} mẫu`,
        badge: 'Grad-CAM',
        offsetX: -238,
        offsetY: 34,
      });
    }

    if (MAIN.state.showSimilarWireframe && MAIN.similarWireframeGroup?.userData?.meta) {
      const refMeta = MAIN.similarWireframeGroup.userData.meta;
      specs.push({
        key: 'similar-wireframe',
        anchor: MAIN.similarWireframeGroup.userData.center?.clone ? MAIN.similarWireframeGroup.userData.center.clone() : tumorCenter.clone().add(new THREE.Vector3(tumorRadius * 0.86, 0, -tumorRadius * 0.14)),
        accent: '#2dd4bf',
        eyebrow: 'CA THAM CHIẾU',
        title: `Ca #${refMeta.caseItem?.case_id ?? 'N/A'} — mô hình vỏ u đối chiếu`,
        description: 'Khung lưới màu xanh ngọc mô phỏng hình dạng khối u từ một ca bệnh tương tự để đối chiếu hình thái và khuynh hướng xâm lấn.',
        meta: `${Math.round(refMeta.similarity * 100)}% tương đồng · ${refMeta.refKey.replace(/_/g, ' ')}`,
        badge: refMeta.sameLobe ? 'Cùng thùy' : 'Dịch chuyển',
        offsetX: 22,
        offsetY: -52,
      });
    }

    if (typeof depthMm === 'number' && Array.isArray(depthMetrics?.nearest_cortex_point) && depthMetrics.nearest_cortex_point.length === 3) {
      const cortexPoint = new THREE.Vector3(
        mmToScene(depthMetrics.nearest_cortex_point[0], sceneRadius),
        mmToScene(depthMetrics.nearest_cortex_point[1], sceneRadius),
        mmToScene(depthMetrics.nearest_cortex_point[2], sceneRadius)
      );
      specs.push({
        key: 'depth-line',
        anchor: cortexPoint.clone().lerp(tumorCenter, 0.48),
        accent: depthTone.accent,
        eyebrow: 'ĐỘ SÂU',
        title: 'Đường đo từ vỏ não đến tâm u',
        description: 'Đường màu này cho biết khoảng cách ước tính từ bề mặt vỏ não gần nhất đến trung tâm tổn thương.',
        meta: `${formatMm(depthMm)} · ${depthTone.label}`,
        badge: 'Độ sâu',
        offsetX: 24,
        offsetY: -58,
      });
    }

    if (MAIN.state.showPath) {
      const trajectoryEntries = getTrajectoryEntries(tumorCenter, depthMetrics, sceneRadius, MAIN.state);
      const pathLengthMm = trajectoryEntries[0]?.lengthMm ?? null;
      const customEntryCount = trajectoryEntries.filter(item => item.manual).length;
      const latestEntry = trajectoryEntries.length
        ? trajectoryEntries[trajectoryEntries.length - 1].entryPoint.clone()
        : deriveDefaultEntryPoint(tumorCenter, depthMetrics, sceneRadius);
      const pathAnchor = trajectoryEntries.length > 1
        ? trajectoryEntries
          .reduce((acc, item) => acc.add(item.entryPoint.clone().lerp(tumorCenter, 0.36)), new THREE.Vector3(0, 0, 0))
          .multiplyScalar(1 / trajectoryEntries.length)
        : latestEntry.clone().lerp(tumorCenter, 0.36);
      const lengthValues = trajectoryEntries
        .map(item => item.lengthMm)
        .filter(value => typeof value === 'number' && Number.isFinite(value));
      const minPathLengthMm = lengthValues.length ? Math.min(...lengthValues) : pathLengthMm;
      const maxPathLengthMm = lengthValues.length ? Math.max(...lengthValues) : pathLengthMm;
      specs.push({
        key: 'path-line',
        anchor: pathAnchor,
        accent: '#22c55e',
        eyebrow: 'ĐƯỜNG MỔ',
        title: customEntryCount > 1 ? `${customEntryCount} đường vào phẫu thuật mô phỏng` : 'Đường vào phẫu thuật mô phỏng',
        description: customEntryCount > 1
          ? 'Các đường màu mô phỏng nhiều hướng dụng cụ đi từ các điểm vào trên vỏ não đến tâm khối u.'
          : 'Đường xanh mô phỏng hướng dụng cụ đi từ điểm vào trên vỏ não đến tâm khối u.',
        meta: customEntryCount > 1
          ? `${formatMm(minPathLengthMm)} đến ${formatMm(maxPathLengthMm)} · ${customEntryCount} điểm vào do bác sĩ chọn`
          : `${formatMm(pathLengthMm)}${customEntryCount ? ' · điểm vào do bác sĩ chọn' : ' · điểm vào tự động'}`,
        badge: 'Path',
        offsetX: 18,
        offsetY: -44,
      });
      specs.push({
        key: 'entry-point',
        anchor: latestEntry,
        accent: '#86efac',
        eyebrow: 'ENTRY POINT',
        title: customEntryCount > 1 ? `${customEntryCount} điểm vào trên bề mặt não` : 'Điểm vào trên bề mặt não',
        description: customEntryCount > 1
          ? 'Các điểm xanh là những nơi đường mổ mô phỏng bắt đầu đi vào mô não.'
          : 'Điểm xanh này là nơi đường mổ mô phỏng bắt đầu đi vào mô não.',
        meta: customEntryCount > 1
          ? `${customEntryCount} điểm vào từ vùng chức năng được chọn`
          : (customEntryCount ? 'Được chọn từ vùng chức năng' : 'Ước tính từ vỏ não gần nhất'),
        badge: 'Entry',
        offsetX: latestEntry.x < 0 ? -228 : 22,
        offsetY: 16,
      });
    }

    if (MAIN.state.showFunctional && MAIN.riskSummary.length) {
      MAIN.riskSummary.slice(0, 2).forEach((item, index) => {
        specs.push({
          key: `functional-${item.id}`,
          anchor: item.position.clone().multiplyScalar(1.02),
          accent: item.color,
          eyebrow: 'VÙNG CHỨC NĂNG',
          title: item.label,
          description: `Viền màu này đánh dấu vùng chức năng gần khối u; bác sĩ nên đối chiếu với triệu chứng và ảnh MRI gốc khi lập kế hoạch.`,
          meta: `${formatMm(item.distanceMm)} · mức gần: ${String(item.risk || '').toLowerCase()}`,
          badge: item.risk,
          offsetX: item.position.x < 0 ? -236 : 24,
          offsetY: index === 0 ? -12 : 24,
        });
      });
    }

    return specs;
  }

  function computeMainTooltipSpecs() {
    return computeMainTooltipCatalog().filter(spec => isMainTooltipSelected(spec.key));
  }

  function renderMainTooltipManager() {
    if (!MAIN.ui?.tooltipPanel || !MAIN.ui?.tooltipList) return;

    const catalog = computeMainTooltipCatalog();
    // Accordion body visibility is handled by CSS is-open class on the body, 
    // but we can sync the internal state if needed.
    MAIN.ui.tooltipPanel.classList.toggle('is-open', !!MAIN.tooltipPanelOpen);

    if (MAIN.ui.tooltipPanelNote) {
      MAIN.ui.tooltipPanelNote.textContent = MAIN.state?.showTooltips
        ? 'Chọn các tooltip cần hiển thị trên mô hình 3D. Bỏ tích hoặc bấm dấu × trên tooltip sẽ ẩn đúng mục đó.'
        : 'Tooltip 3D đang tắt toàn bộ. Các mục được tích dưới đây vẫn được giữ để khi bật lại sẽ hiện đúng lựa chọn của bạn.';
    }

    if (!catalog.length) {
      MAIN.ui.tooltipList.innerHTML = '<div class="brain-tooltip-empty">Chưa có tooltip khả dụng cho trạng thái hiển thị hiện tại.</div>';
      return;
    }

    MAIN.ui.tooltipList.innerHTML = catalog.map(spec => `
      <label class="brain-tooltip-item">
        <input type="checkbox" data-tooltip-key="${spec.key}" ${isMainTooltipSelected(spec.key) ? 'checked' : ''} />
        <span class="brain-tooltip-swatch" style="background:${spec.accent || '#0ea5e9'};"></span>
        <span class="brain-tooltip-copy">
          <span class="brain-tooltip-name">${spec.title}</span>
          <span class="brain-tooltip-meta">${spec.eyebrow || 'Tooltip'}${spec.badge ? ` · ${spec.badge}` : ''}</span>
        </span>
      </label>
    `).join('');

    MAIN.ui.tooltipList.querySelectorAll('input[data-tooltip-key]').forEach(input => {
      input.addEventListener('change', event => {
        const key = event.target.getAttribute('data-tooltip-key');
        setMainTooltipSelected(key, !!event.target.checked);
        updateMainViewerTooltips();
        renderMainTooltipManager();
        syncMainUI(); // To update the accordion badge count
      });
    });
  }

  function reconcileMainTooltipNodes(specs) {
    const layer = ensureMainTooltipLayer();
    if (!layer) return;
    const activeKeys = new Set(specs.map(spec => spec.key));

    Array.from(MAIN.tooltipNodes.keys()).forEach(key => {
      if (activeKeys.has(key)) return;
      const stale = MAIN.tooltipNodes.get(key);
      stale?.remove?.();
      MAIN.tooltipNodes.delete(key);
    });

    specs.forEach(spec => {
      let node = MAIN.tooltipNodes.get(spec.key);
      if (!node) {
        node = createMainTooltipNode();
        layer.appendChild(node);
        MAIN.tooltipNodes.set(spec.key, node);
      }
      setMainTooltipNodeContent(node, spec);
    });
  }

  function positionMainTooltipNode(node, spec, viewerRect, rotation) {
    let anchorX;
    let anchorY;

    if (spec.screen) {
      anchorX = viewerRect.width * spec.screen.x;
      anchorY = viewerRect.height * spec.screen.y;
    } else if (spec.anchor) {
      const projected = applyVectorRotation(spec.anchor, rotation).project(MAIN.ctx.camera);
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z < -1.2 || projected.z > 1.2) {
        node.style.display = 'none';
        return;
      }
      anchorX = (projected.x * 0.5 + 0.5) * viewerRect.width;
      anchorY = (-(projected.y) * 0.5 + 0.5) * viewerRect.height;
    } else {
      node.style.display = 'none';
      return;
    }

    node.style.display = 'block';

    const card = node.querySelector('.brain-3d-tip-card');
    const line = node.querySelector('.brain-3d-tip-line');
    const anchor = node.querySelector('.brain-3d-tip-anchor');
    const cardWidth = card.offsetWidth || 208;
    const cardHeight = card.offsetHeight || 88;
    const offsetX = spec.offsetX != null ? spec.offsetX : 20;
    const offsetY = spec.offsetY != null ? spec.offsetY : -18;
    const isCompact = !!spec.compact;
    const minPad = 10;
    const maxX = Math.max(minPad, viewerRect.width - cardWidth - minPad);
    const maxY = Math.max(minPad, viewerRect.height - cardHeight - minPad);
    const desiredX = isCompact ? (anchorX - cardWidth * 0.5 + offsetX) : (anchorX + offsetX);
    const desiredY = isCompact ? (anchorY - cardHeight * 0.5 + offsetY) : (anchorY + offsetY);
    const cardX = Math.max(minPad, Math.min(maxX, desiredX));
    const cardY = Math.max(minPad, Math.min(maxY, desiredY));

    card.style.left = `${cardX}px`;
    card.style.top = `${cardY}px`;

    if (spec.screen || isCompact) {
      line.style.display = 'none';
      anchor.style.display = 'none';
      return;
    }

    anchor.style.display = 'block';
    anchor.style.left = `${anchorX - 5}px`;
    anchor.style.top = `${anchorY - 5}px`;

    const targetX = cardX + (offsetX >= 0 ? 0 : cardWidth);
    const targetY = cardY + Math.min(cardHeight - 12, Math.max(12, cardHeight * 0.42));
    const dx = targetX - anchorX;
    const dy = targetY - anchorY;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length < 8) {
      line.style.display = 'none';
      return;
    }

    line.style.display = 'block';
    line.style.left = `${anchorX}px`;
    line.style.top = `${anchorY}px`;
    line.style.width = `${length}px`;
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }

  function updateMainViewerTooltips() {
    const layer = ensureMainTooltipLayer();
    if (!layer) return;

    if (!MAIN.diagnosisData?.prediction?.tumor_detected || !MAIN.ctx?.camera) {
      layer.style.display = 'none';
      return;
    }

    const specs = MAIN.state?.showTooltips ? computeMainTooltipSpecs() : [];
    if (!specs.length) {
      layer.style.display = 'none';
      return;
    }

    layer.style.display = 'block';
    const nextStateKey = specs.map(spec => [
      spec.key,
      spec.title,
      spec.description,
      spec.meta,
      spec.badge,
      spec.eyebrow,
      spec.accent,
      spec.compact ? 'compact' : '',
      spec.screen ? `${spec.screen.x}|${spec.screen.y}` : '',
      spec.offsetX,
      spec.offsetY,
    ].join('~')).join('||');

    MAIN.tooltipSpecs = specs;
    if (nextStateKey !== MAIN.tooltipStateKey) {
      MAIN.tooltipStateKey = nextStateKey;
      reconcileMainTooltipNodes(specs);
    }

    const viewerRect = MAIN.ctx.viewerElement.getBoundingClientRect();
    const rotation = getRotationEuler(MAIN.ctx);
    MAIN.tooltipSpecs.forEach(spec => {
      const node = MAIN.tooltipNodes.get(spec.key);
      if (node) positionMainTooltipNode(node, spec, viewerRect, rotation);
    });
  }

  // Entry point is now set via fixed zone buttons — free-form raycast is intentionally disabled.
  function handleMainViewerClick(event) {
    if (event.target?.closest?.('.brain-3d-tip-card')) return;
    // Free-form clicking on the mesh is disabled. Entry points are selected via
    // the fixed functional-zone buttons in the entry panel (renderEntryPointPanel).
  }

  // Select an entry point from one of the 4 fixed functional zones.
  function setEntryFromZone(zone) {
    if (!zone?.position) return;
    const entries = getCustomEntryPoints(MAIN.state);
    // Toggle: if this zone is already selected, remove it; otherwise add it.
    const existingIdx = entries.findIndex(e => e.distanceTo(zone.position) < 0.02);
    if (existingIdx >= 0) {
      entries.splice(existingIdx, 1);
      setCustomEntryPoints(entries, MAIN.state);
    } else {
      addCustomEntryPoint(zone.position.clone(), MAIN.state);
    }
    syncMainUI();
    applyMainState();
    persistClinicalState();
  }

  function renderEntryPointPanel() {
    if (!MAIN.ui?.entryPanel) return;
    const zones = MAIN.riskSummary;
    if (!zones.length) {
      MAIN.ui.entryPanel.innerHTML = '<div class="brain-entry-empty">Chưa có dữ liệu chẩn đoán để xác định điểm vào.</div>';
      return;
    }
    const currentEntries = getCustomEntryPoints(MAIN.state);
    MAIN.ui.entryPanel.innerHTML = zones.map((zone, idx) => {
      const isSelected = currentEntries.some(e => e.distanceTo(zone.position) < 0.02);
      const riskClass = zone.distanceMm < 10 ? 'entry-risk-high' : zone.distanceMm < 18 ? 'entry-risk-med' : 'entry-risk-low';
      return `
        <button class="brain-entry-zone-btn ${isSelected ? 'is-selected' : ''} ${riskClass}" data-entry-idx="${idx}"
                title="${zone.risk} — cách u ${zone.distanceMm.toFixed(1)} mm">
          <span class="brain-entry-zone-dot" style="background:${zone.color};"></span>
          <span class="brain-entry-zone-info">
            <span class="brain-entry-zone-label">${zone.label}</span>
            <span class="brain-entry-zone-dist">${zone.distanceMm.toFixed(1)} mm</span>
          </span>
          <span class="brain-entry-zone-risk">${zone.risk}</span>
          ${isSelected ? '<i class="fa-solid fa-check brain-entry-zone-check"></i>' : ''}
        </button>
      `;
    }).join('');

    MAIN.ui.entryPanel.querySelectorAll('.brain-entry-zone-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-entry-idx'));
        const zone = MAIN.riskSummary[idx];
        if (zone) setEntryFromZone(zone);
      });
    });
  }

  function updateMainFromDiagnosis(diagnosisData, payload) {
    MAIN.diagnosisData = diagnosisData || null;
    if (!MAIN.ui) ensureMainUI();
    if (!MAIN.diagnosisData) {
      renderMainSliceGrid(null);
      updateMainViewerTooltips();
      return;
    }

    const nextDiagnosisContextKey = [
      MAIN.diagnosisData?.prediction?.location_hint || '',
      MAIN.diagnosisData?.depth_metrics?.tumor_depth_mm || '',
      MAIN.diagnosisData?.multiclass_stats?.total_tumor_pixels || '',
      MAIN.diagnosisData?.prediction?.confidence || '',
    ].join('|');

    const isNewDiagnosis = nextDiagnosisContextKey !== MAIN.diagnosisContextKey;

    if (isNewDiagnosis) {
      MAIN.diagnosisContextKey = nextDiagnosisContextKey;
      // When the diagnosis changes significantly, we might want to reset the custom entry
      // but keep other settings if the user prefers. 
      // For now, let's keep the user's manual settings but update the clip planes to the new tumor.
    }

    if (MAIN.pendingReset) {
      MAIN.state = defaultMainState();
      MAIN.pendingReset = false;
    }

    // Only update clip planes from diagnosis if it's a new diagnosis 
    // OR if we don't have a stored manual clip state.
    if (isNewDiagnosis || !MAIN.state.manualClipAdjusted) {
      MAIN.state.clip = buildClipFromDiagnosis(MAIN.diagnosisData);
      // Reset manual adjustment flag only if it is truly a different diagnosis
      if (isNewDiagnosis) {
        MAIN.state.manualClipAdjusted = false;
        clearCustomEntryPoints(MAIN.state);
      }
    }
    MAIN.tumorCenter = deriveMainTumorCenter(MAIN.diagnosisData, payload?.tumorPoints || MAIN.ctx?.getTumorPoints?.());
    MAIN.tumorRadius = computeTumorRadiusFromPoints(payload?.tumorPoints || MAIN.ctx?.getTumorPoints?.(), MAIN.tumorCenter, MAIN_SCENE_RADIUS);
    refreshMainRiskSummary();
    queueAttentionCloudSampleRefresh();

    if (isNewDiagnosis) {
      // 1. Tự động chọn tất cả 4 điểm vào vùng chức năng ngay khi có chẩn đoán mới < --------------------
      if (MAIN.riskSummary.length) {
        const allZoneEntries = MAIN.riskSummary.map(zone => zone.position.clone());
        setCustomEntryPoints(allZoneEntries, MAIN.state);
      }

      // 2. Reset tooltip 3D: chỉ bật "Đường mổ" (path-line + entry-point), tắt hết còn lại < ---------------------------------------
      const tooltipKeysToDisable = [
        'clip-planes', 'tumor-center', 'enhancing', 'edema', 'depth-line',
      ];
      // Tắt tooltip vùng chức năng (functional-*)
      MAIN.riskSummary.forEach(item => tooltipKeysToDisable.push(`functional-${item.id}`));
      tooltipKeysToDisable.forEach(key => setMainTooltipSelected(key, false));
      // Chỉ bật tooltip đường mổ
      setMainTooltipSelected('path-line', true);
      setMainTooltipSelected('entry-point', true);
      setMainTooltipSelected('safety-shell', true);
      setMainTooltipSelected('xai-cloud', true);
      setMainTooltipSelected('similar-wireframe', true);
      persistTooltipSelections();
    }

    // -------------------------------------------------------------------------------

    syncMainUI();
    applyMainState();
    persistClinicalState();
  }

  function focusMainOnTumor(diagnosisData, depthMetrics) {
    if (!diagnosisData?.prediction?.tumor_detected) return;
    MAIN.state.clip = buildClipFromDiagnosis(diagnosisData);
    MAIN.state.activeView = 'axial';
    if (depthMetrics) MAIN.state.clip.axial = inferAxialFromDepth(depthMetrics);
    syncMainUI();
    applyMainState();
  }

  function tickMainOverlay() {
    if (!MAIN.ctx || !MAIN.overlayRoot) {
      updateMainViewerTooltips();
      return;
    }
    const time = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    const rotation = getRotationEuler(MAIN.ctx);
    MAIN.overlayRoot.rotation.x = rotation.x;
    MAIN.overlayRoot.rotation.y = rotation.y;
    const rotationKey = `${rotation.x.toFixed(4)}|${rotation.y.toFixed(4)}|${MAIN.state.clip.axial.toFixed(3)}|${MAIN.state.clip.coronal.toFixed(3)}|${MAIN.state.clip.sagittal.toFixed(3)}`;
    if (rotationKey !== MAIN.lastRotationKey) {
      MAIN.lastRotationKey = rotationKey;
      updateMainClipPlanes();
    }
    if (MAIN.functionalGroup?.userData?.pulseNodes?.length) {
      MAIN.functionalGroup.userData.pulseNodes.forEach((entry, index) => {
        const isCritical = entry.mode === 'critical';
        const speed = isCritical ? 2.8 : 1.4;
        const pulse = 0.5 + 0.5 * Math.sin(time * speed + index * 0.75);

        if (entry.patch?.material) {
          const baseOp = isCritical ? 0.40 : 0.25;
          entry.patch.material.opacity = baseOp + pulse * (isCritical ? 0.25 : 0.15);
          entry.patch.material.emissiveIntensity = (isCritical ? 0.6 : 0.3) + pulse * 0.4;
        }
        if (entry.rim?.material) {
          entry.rim.material.opacity = (isCritical ? 0.85 : 0.65) + pulse * 0.15;
          if (isCritical) {
            const scale = 1 + pulse * 0.08;
            entry.rim.scale.set(scale, scale, scale);
          }
        }
        if (entry.aura?.material) {
          entry.aura.material.opacity = pulse * 0.2;
          const scale = 0.9 + pulse * 0.3;
          entry.aura.scale.set(scale, scale, scale);
        }
        if (entry.stem?.material) {
          entry.stem.material.opacity = (isCritical ? 0.75 : 0.55) + pulse * 0.2;
        }
      });
    }
    if (MAIN.safetyMarginGroup?.userData?.shell && MAIN.safetyMarginGroup?.userData?.rim) {
      const severity = MAIN.safetyMarginGroup.userData.severity;
      const isCritical = severity === 'critical';
      const pulse = 0.5 + 0.5 * Math.sin(time * (isCritical ? 2.2 : 1.1));

      const shellBase = MAIN.safetyMarginGroup.userData.baseShellOpacity || 0.07;
      const rimBase = MAIN.safetyMarginGroup.userData.baseRimOpacity || 0.25;
      const emissiveBase = MAIN.safetyMarginGroup.userData.baseEmissiveIntensity || 0;

      MAIN.safetyMarginGroup.userData.shell.material.opacity = shellBase + pulse * (isCritical ? 0.12 : 0.05);
      MAIN.safetyMarginGroup.userData.shell.material.emissiveIntensity = emissiveBase + pulse * (isCritical ? 0.6 : 0.2);

      MAIN.safetyMarginGroup.userData.rim.material.opacity = rimBase + pulse * (isCritical ? 0.35 : 0.15);
      MAIN.safetyMarginGroup.userData.rim.scale.setScalar(1 + pulse * (isCritical ? 0.04 : 0.015));
    }

    // Tumor components reaction
    if (MAIN.tumorComponentGroup) {
      const severity = MAIN.tumorComponentGroup.userData.severity;
      const isCritical = severity === 'critical';

      // Animate Acoustic Waves
      if (MAIN.tumorComponentGroup.userData.waves) {
        const speed = isCritical ? 0.7 : 0.35;
        MAIN.tumorComponentGroup.userData.waves.forEach(waveObj => {
          const progress = (time * speed + waveObj.phase) % 1.0;
          const scale = 1.0 + progress * 2.2; // Expand
          waveObj.mesh.scale.set(scale, scale, scale);
          waveObj.mesh.material.opacity = (1.0 - progress) * (isCritical ? 0.15 : 0.06);
        });
      }
    }
    if (MAIN.attentionCloudGroup) {
      MAIN.attentionCloudGroup.children.forEach((points, index) => {
        if (!points.material) return;
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.1 + index * 0.7);
        points.material.opacity = (index === 2 ? 0.36 : index === 1 ? 0.24 : 0.16) + pulse * 0.10;
      });
    }
    if (MAIN.similarWireframeGroup?.userData?.ring) {
      const ring = MAIN.similarWireframeGroup.userData.ring;
      const wire = MAIN.similarWireframeGroup.userData.wire;
      const fill = MAIN.similarWireframeGroup.userData.fill;
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.8);
      ring.rotation.z += 0.006;
      ring.material.opacity = 0.25 + pulse * 0.15;
      if (wire?.material) wire.material.opacity = 0.45 + pulse * 0.15;
      if (fill?.material) fill.material.opacity = 0.06 + pulse * 0.04;
    }
    updateMainViewerTooltips();
  }

  function createCompareToolbarHTML() {
    return `
      <div class="compare-clinical-toolbar" id="compareClinicalToolbar">
        <div class="compare-clinical-panel">
          <div class="compare-clinical-label">Cắt lớp đồng bộ 2 mô hình</div>
          <div class="compare-range-grid">
            <div class="compare-range-row">
              <span>Axial</span>
              <input class="brain-range" type="range" min="0" max="100" value="99" data-compare-axis="axial" />
              <strong id="compareAxisValueAxial">99%</strong>
            </div>
            <div class="compare-range-row">
              <span>Coronal</span>
              <input class="brain-range" type="range" min="0" max="100" value="100" data-compare-axis="coronal" />
              <strong id="compareAxisValueCoronal">100%</strong>
            </div>
            <div class="compare-range-row">
              <span>Sagittal</span>
              <input class="brain-range" type="range" min="0" max="100" value="100" data-compare-axis="sagittal" />
              <strong id="compareAxisValueSagittal">100%</strong>
            </div>
          </div>
        </div>

        <div class="compare-clinical-panel">
          <div class="compare-clinical-label">Lớp phủ chẩn đoán</div>
          <div class="compare-toggle-row">
            <button class="brain-mini-btn is-on" data-compare-toggle="functional">Vùng chức năng</button>
            <button class="brain-mini-btn is-on" data-compare-toggle="path">Đường mổ</button>
            <button class="brain-mini-btn is-on" data-compare-component="core">Nhân</button>
            <button class="brain-mini-btn is-on" data-compare-component="enhancing">Tăng cường</button>
            <button class="brain-mini-btn is-on" data-compare-component="edema">Phù nề</button>
          </div>
          <div class="compare-note-text">Thanh tham chiếu bên phải không có full MPR như ca hiện tại, nên phần 2D bên trái được giữ làm mốc đối chiếu gốc.</div>
        </div>

        <div class="compare-clinical-panel">
          <div class="compare-clinical-label">Độ trong suốt</div>
          <div class="compare-range-grid">
            <div class="compare-range-row">
              <span>Vỏ não</span>
              <input class="brain-range" type="range" min="5" max="100" value="100" data-compare-opacity="cortex" />
              <strong id="compareOpacityValueCortex">100%</strong>
            </div>
            <div class="compare-range-row">
              <span>Cấu trúc sâu</span>
              <input class="brain-range" type="range" min="5" max="100" value="15" data-compare-opacity="deep" />
              <strong id="compareOpacityValueDeep">15%</strong>
            </div>
          </div>
          <div class="compare-note-row">
            <span class="compare-note-pill">Mặt cắt chia sẻ</span>
            <span class="compare-note-pill">Đồng bộ MPR trái</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderCompareLeftSlices(diagData) {
    const slices = diagData?.slices;
    const gradCam = diagData?.xai?.gradcam?.overlay_base64;
    if (!COMPARE.leftSlices) return;
    if (!slices) {
      COMPARE.leftSlices.innerHTML = '<div class="brain-slice-empty">Không có dữ liệu MPR cho ca hiện tại.</div>';
      return;
    }

    const views = [
      { key: 'axial', axis: 'Z', left: COMPARE.state.clip.sagittal, top: COMPARE.state.clip.coronal },
      { key: 'coronal', axis: 'Y', left: COMPARE.state.clip.sagittal, top: COMPARE.state.clip.axial },
      { key: 'sagittal', axis: 'X', left: COMPARE.state.clip.coronal, top: COMPARE.state.clip.axial },
    ];
    const currentLoc = formatCompareLocKey(diagData?.prediction?.location_hint);
    const referenceLoc = formatCompareLocKey(COMPARE.activeRefLocKey);
    const similarity = Math.round(COMPARE.similarity || 0);
    const depthMm = diagData?.depth_metrics?.tumor_depth_mm;
    const contextHtml = `
      <div class="compare-slices-context">
        <div class="compare-slices-context-head">
          <span>Đối chiếu khối u trực quan</span>
          <strong>3 lát cắt + Grad-CAM</strong>
        </div>
        <div class="compare-note-row">
          ${similarity ? `<span class="compare-note-pill">Tương đồng ${similarity}%</span>` : ''}
          ${currentLoc ? `<span class="compare-note-pill">Ca hiện tại: ${currentLoc}</span>` : ''}
          ${referenceLoc ? `<span class="compare-note-pill">Ca tương tự: ${referenceLoc}</span>` : ''}
          ${typeof depthMm === 'number' ? `<span class="compare-note-pill">Độ sâu ${depthMm.toFixed(1)} mm</span>` : ''}
        </div>
      </div>
    `;

    const cards = views.map(view => {
      const data = slices[view.key] || {};
      return `
        <article class="compare-slice-card ${COMPARE.state.activeView === view.key ? 'is-active' : ''}" data-view="${view.key}">
          <div class="compare-slice-card-head">
            <span>${view.key}</span>
            <strong>${view.axis}-axis</strong>
          </div>
          <div class="compare-slice-card-body">
            <img class="compare-slice-base" src="${data.clean_b64 || data.image_b64 || ''}" alt="${view.key}" />
            ${data.segmentation_b64 ? `<img class="compare-slice-mask" src="${data.segmentation_b64}" alt="${view.key} segmentation" />` : ''}
            <div class="brain-crosshair-h" style="top:${Math.round(view.top * 100)}%;"></div>
            <div class="brain-crosshair-v" style="left:${Math.round(view.left * 100)}%;"></div>
          </div>
          <div class="compare-slice-card-foot">Click để đồng bộ 2 cảnh 3D</div>
        </article>
      `;
    }).join('');

    const gradCamCard = `
      <article class="compare-slice-card is-gradcam">
        <div class="compare-slice-card-head">
          <span>Bản đồ nhiệt AI</span>
          <strong>Grad-CAM</strong>
        </div>
        <div class="compare-slice-card-body">
          ${gradCam ? `<img class="compare-slice-base" src="${gradCam}" alt="Grad-CAM" />` : `<div class="brain-slice-empty" style="position:absolute;inset:0;border:0;background:#020617;color:#94a3b8;">Không có Grad-CAM</div>`}
        </div>
        <div class="compare-slice-card-foot">Lớp chú ý AI đã làm dịu để vẫn thấy rõ mô nền</div>
      </article>
    `;

    COMPARE.leftSlices.innerHTML = `${contextHtml}<div class="compare-slices-grid">${cards}${gradCamCard}</div>`;
    COMPARE.leftSlices.querySelectorAll('.compare-slice-card[data-view]').forEach(card => {
      card.addEventListener('click', event => {
        const view = card.getAttribute('data-view');
        const mediaEl = card.querySelector('.compare-slice-card-body');
        handleSliceInteraction(view, event, COMPARE.state, mediaEl);
        COMPARE.state.activeView = view;
        syncCompareToolbar();
        applyCompareStateToScenes();
      });
    });
  }

  function renderCompareReferenceSummary(modalPayload) {
    if (!COMPARE.referenceSummary) return;
    const loc = modalPayload.refLocKey || '';
    const leftDepth = modalPayload.diagData?.depth_metrics?.tumor_depth_mm;
    const similarity = Math.round(modalPayload.similarity || 0);
    COMPARE.referenceSummary.innerHTML = `
      <div class="compare-note-card">
        <div class="compare-clinical-label">Hỗ trợ giải đoán tham chiếu</div>
        <div class="compare-note-text">
          Ca tham chiếu được canh dòng bằng cùng một bộ cắt lớp 3D và lớp phủ giải phẫu chức năng. MRI 2D của ca tham chiếu hiện chỉ có ảnh gốc / ảnh thu nhỏ, vì vậy MPR đầy đủ được giữ bên trái làm mốc đối chiếu.
        </div>
        <div class="compare-note-row">
          <span class="compare-note-pill">Tương đồng ${similarity}%</span>
          <span class="compare-note-pill">${formatCompareLocKey(loc) || 'Vị trí ước tính'}</span>
          ${typeof leftDepth === 'number' ? `<span class="compare-note-pill">Độ sâu hiện tại ${leftDepth.toFixed(1)} mm</span>` : ''}
        </div>
      </div>
    `;
  }

  function syncCompareToolbar() {
    if (!COMPARE.toolbar) return;
    ['axial', 'coronal', 'sagittal'].forEach(axis => {
      const input = COMPARE.toolbar.querySelector(`input[data-compare-axis="${axis}"]`);
      const out = COMPARE.toolbar.querySelector(`#compareAxisValue${axis.charAt(0).toUpperCase() + axis.slice(1)}`);
      const value = Math.round(clamp01(COMPARE.state.clip[axis]) * 100);
      if (input) input.value = String(value);
      if (out) out.textContent = value + '%';
    });

    ['cortex', 'deep'].forEach(key => {
      const input = COMPARE.toolbar.querySelector(`input[data-compare-opacity="${key}"]`);
      const out = COMPARE.toolbar.querySelector(`#compareOpacityValue${key.charAt(0).toUpperCase() + key.slice(1)}`);
      const value = Math.round(clamp01(COMPARE.state[key + 'Opacity']) * 100);
      if (input) input.value = String(value);
      if (out) out.textContent = value + '%';
    });

    COMPARE.toolbar.querySelectorAll('[data-compare-toggle]').forEach(button => {
      const key = button.getAttribute('data-compare-toggle');
      setButtonState(button, !!COMPARE.state['show' + key.charAt(0).toUpperCase() + key.slice(1)]);
    });
    COMPARE.toolbar.querySelectorAll('[data-compare-component]').forEach(button => {
      const component = button.getAttribute('data-compare-component');
      const on =
        (component === 'core' && COMPARE.state.showCore) ||
        (component === 'enhancing' && COMPARE.state.showEnhancing) ||
        (component === 'edema' && COMPARE.state.showEdema);
      setButtonState(button, on);
    });

    renderCompareLeftSlices(COMPARE.diagnosisData);
  }

  function setupCompareToolbar(modalPayload) {
    if (!COMPARE.modal) return;
    const topRow = COMPARE.modal.querySelector('#dual3DTopRow');
    if (!topRow) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = createCompareToolbarHTML();
    topRow.insertAdjacentElement('beforebegin', wrapper.firstElementChild);
    COMPARE.toolbar = COMPARE.modal.querySelector('#compareClinicalToolbar');

    COMPARE.toolbar.querySelectorAll('input[data-compare-axis]').forEach(input => {
      input.addEventListener('input', event => {
        const axis = event.target.getAttribute('data-compare-axis');
        COMPARE.state.clip[axis] = clamp01(Number(event.target.value) / 100);
        COMPARE.state.activeView = axis;
        syncCompareToolbar();
        applyCompareStateToScenes();
      });
    });

    COMPARE.toolbar.querySelectorAll('input[data-compare-opacity]').forEach(input => {
      input.addEventListener('input', event => {
        const key = event.target.getAttribute('data-compare-opacity');
        COMPARE.state[key + 'Opacity'] = clamp01(Number(event.target.value) / 100);
        syncCompareToolbar();
        applyCompareStateToScenes();
      });
    });

    COMPARE.toolbar.querySelectorAll('[data-compare-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-compare-toggle');
        const stateKey = 'show' + key.charAt(0).toUpperCase() + key.slice(1);
        COMPARE.state[stateKey] = !COMPARE.state[stateKey];
        syncCompareToolbar();
        applyCompareStateToScenes();
      });
    });

    COMPARE.toolbar.querySelectorAll('[data-compare-component]').forEach(button => {
      button.addEventListener('click', () => {
        const component = button.getAttribute('data-compare-component');
        if (component === 'core') COMPARE.state.showCore = !COMPARE.state.showCore;
        if (component === 'enhancing') COMPARE.state.showEnhancing = !COMPARE.state.showEnhancing;
        if (component === 'edema') COMPARE.state.showEdema = !COMPARE.state.showEdema;
        syncCompareToolbar();
        applyCompareStateToScenes();
      });
    });

    syncCompareToolbar();
    renderCompareReferenceSummary(modalPayload);
  }

  function setupCompareModal(payload) {
    COMPARE.modal = payload.modal;
    COMPARE.diagnosisData = payload.diagData || null;
    COMPARE.activeRefLocKey = payload.refLocKey || '';
    COMPARE.similarity = payload.similarity || 0;
    COMPARE.state = defaultCompareState();
    COMPARE.scenes.clear();

    const leftColumn = COMPARE.modal.querySelectorAll('.d3-col-bot')[0];
    const rightColumn = COMPARE.modal.querySelectorAll('.d3-col-bot')[1];
    if (leftColumn) {
      const originalMedia = leftColumn.children[0];
      if (originalMedia) {
        originalMedia.className = 'compare-note-card';
        originalMedia.style.background = '#ffffff';
        originalMedia.style.border = '1px solid #e2e8f0';
        originalMedia.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)';
        originalMedia.innerHTML = `
          <div class="compare-clinical-label">Đồng bộ MPR ca hiện tại</div>
          <div id="compareLeftSlices"></div>
        `;
        COMPARE.leftSlices = originalMedia.querySelector('#compareLeftSlices');
      }
    }
    if (rightColumn) {
      const referenceCard = document.createElement('div');
      referenceCard.id = 'compareReferenceSummary';
      rightColumn.insertBefore(referenceCard, rightColumn.children[1] || null);
      COMPARE.referenceSummary = referenceCard;
    }

    setupCompareToolbar(payload);
  }

  function ensureSceneClipPlanes(ctx) {
    if (!ctx.clipPlanes) {
      ctx.clipPlanes = {
        sagittal: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
        coronal: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        axial: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      };
    }
    ctx.renderer.localClippingEnabled = true;
  }

  function updateSceneClipPlanes(ctx, state, sceneRadius) {
    ensureSceneClipPlanes(ctx);
    const rotation = ctx.brainGroup.rotation;
    const euler = new THREE.Euler(rotation.x || 0, rotation.y || 0, rotation.z || 0, 'XYZ');
    const configs = {
      sagittal: { normal: new THREE.Vector3(-1, 0, 0), point: new THREE.Vector3(axisValueToScene(state.clip.sagittal, sceneRadius), 0, 0), color: 0x38bdf8 },
      coronal: { normal: new THREE.Vector3(0, -1, 0), point: new THREE.Vector3(0, axisValueToScene(state.clip.coronal, sceneRadius), 0), color: 0x22c55e },
      axial: { normal: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(0, 0, axisValueToScene(state.clip.axial, sceneRadius)), color: 0xf59e0b },
    };
    Object.entries(configs).forEach(([axis, config]) => {
      const worldPoint = config.point.clone().applyEuler(euler);
      const worldNormal = config.normal.clone().applyEuler(euler).normalize();
      ctx.clipPlanes[axis].setFromNormalAndCoplanarPoint(worldNormal, worldPoint);
      ensureCompareSlicePlane(ctx, axis, config.color, sceneRadius);
      updateSlicePlaneMesh(ctx.slicePlanes[axis], worldPoint, worldNormal, sceneRadius * 2.3);
    });

    const modelRoot = ctx.getModelRoot ? ctx.getModelRoot() : null;
    if (modelRoot) {
      attachClippingToMesh(modelRoot, ctx.clipPlanes, state.cortexOpacity, state.deepOpacity);
    }
  }

  function ensureCompareSlicePlane(ctx, axis, color, sceneRadius) {
    ctx.slicePlanes = ctx.slicePlanes || {};
    if (ctx.slicePlanes[axis]) return;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(sceneRadius * 2.2, sceneRadius * 2.2),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.10,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ctx.scene.add(mesh);
    ctx.slicePlanes[axis] = mesh;
  }

  function buildCompareFunctionalGroup(ctx, state, sceneRadius) {
    if (!state.showFunctional || !ctx.tumorCenter) return null;
    const hint = ctx.isLeft ? ctx.diagData?.prediction?.location_hint : ctx.locKey;
    const riskSummary = computeFunctionalRiskSummary(ctx.tumorCenter, sceneRadius, hint, ctx.tumorRadius || sceneRadius * 0.08, 0);
    return buildFunctionalGroup(sceneRadius, riskSummary);
  }

  function buildCompareTrajectoryGroup(ctx, state, sceneRadius) {
    if (!state.showPath || !ctx.tumorCenter) return null;
    const group = new THREE.Group();
    const entry = deriveDefaultEntryPoint(ctx.tumorCenter, ctx.isLeft ? ctx.diagData?.depth_metrics : null, sceneRadius);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([entry, ctx.tumorCenter]),
      new THREE.LineBasicMaterial({ color: ctx.isLeft ? 0x22c55e : 0xa855f7, transparent: true, opacity: 0.82 })
    );
    const start = new THREE.Mesh(
      new THREE.SphereGeometry(sceneRadius * 0.025, 12, 12),
      new THREE.MeshBasicMaterial({ color: ctx.isLeft ? 0x22c55e : 0xa855f7 })
    );
    const end = new THREE.Mesh(
      new THREE.SphereGeometry(sceneRadius * 0.022, 12, 12),
      new THREE.MeshBasicMaterial({ color: ctx.isLeft ? 0xf43f5e : 0xf0abfc })
    );
    start.position.copy(entry);
    end.position.copy(ctx.tumorCenter);
    group.add(line);
    group.add(start);
    group.add(end);
    return group;
  }

  function buildCompareTumorShell(center, shellRadius, palette) {
    const group = new THREE.Group();

    const outer = new THREE.Mesh(
      new THREE.SphereGeometry(shellRadius * 1.18, 26, 26),
      new THREE.MeshBasicMaterial({
        color: palette.shell,
        transparent: true,
        opacity: palette.outerOpacity,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    outer.position.copy(center);
    group.add(outer);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(shellRadius, 24, 24),
      new THREE.MeshBasicMaterial({
        color: palette.shell,
        transparent: true,
        opacity: palette.shellOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    shell.position.copy(center);
    group.add(shell);

    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(shellRadius * 1.03, 14, 12),
      new THREE.MeshBasicMaterial({
        color: palette.wire,
        wireframe: true,
        transparent: true,
        opacity: palette.wireOpacity,
        depthWrite: false,
      })
    );
    wire.position.copy(center);
    group.add(wire);

    const accent = new THREE.Mesh(
      new THREE.TorusGeometry(shellRadius * 0.72, Math.max(shellRadius * 0.032, 0.008), 10, 52),
      new THREE.MeshBasicMaterial({
        color: palette.accent,
        transparent: true,
        opacity: palette.accentOpacity,
        depthWrite: false,
      })
    );
    accent.position.copy(center);
    accent.rotation.x = Math.PI / 2;
    group.add(accent);

    const focus = new THREE.Mesh(
      new THREE.SphereGeometry(shellRadius * 0.16, 16, 16),
      new THREE.MeshBasicMaterial({
        color: palette.focus,
        transparent: true,
        opacity: palette.focusOpacity,
        depthWrite: false,
      })
    );
    focus.position.copy(center);
    group.add(focus);

    return group;
  }

  function buildCompareTumorComponents(ctx, state, sceneRadius) {
    const hasTumor = ctx.isLeft
      ? !!ctx.diagData?.prediction?.tumor_detected
      : !!ctx.caseItem?.has_tumor;
    if (!hasTumor || !ctx.tumorCenter) return null;

    const hasVisibleLayer = state.showCore || state.showEnhancing || state.showEdema;
    if (!hasVisibleLayer) return null;

    const base = (ctx.tumorRadius || sceneRadius * 0.08) * COMPARE_TUMOR_VISUAL_SCALE;
    const fractions = ctx.isLeft ? extractComponentFractions(ctx.diagData) : { ncr: 0.30, et: 0.42, ed: 0.55 };
    const group = new THREE.Group();
    const palette = ctx.isLeft
      ? {
        shell: 0xffb25c,
        wire: 0xfff2cf,
        accent: 0xfef08a,
        focus: 0xfffbef,
        outerOpacity: 0.06,
        shellOpacity: 0.15,
        wireOpacity: 0.24,
        accentOpacity: 0.30,
        focusOpacity: 0.92,
      }
      : {
        shell: 0xe4d8f8,
        wire: 0xf5f0ff,
        accent: 0xd8b4fe,
        focus: 0xfbebff,
        outerOpacity: 0.05,
        shellOpacity: 0.10,
        wireOpacity: 0.28,
        accentOpacity: 0.24,
        focusOpacity: 0.88,
      };
    const shellRadius = base * (ctx.isLeft ? 1.56 : 1.48);
    group.add(buildCompareTumorShell(ctx.tumorCenter, shellRadius, palette));

    const sideBias = ctx.isLeft ? -1 : 1;

    if (state.showEdema) {
      const edema = new THREE.Mesh(
        new THREE.SphereGeometry(base * (0.92 + fractions.ed * 0.22), 20, 20),
        new THREE.MeshBasicMaterial({
          color: ctx.isLeft ? 0x22c55e : 0xe9d5ff,
          transparent: true,
          opacity: ctx.isLeft ? 0.12 : 0.16,
          depthWrite: false,
        })
      );
      edema.position.copy(ctx.tumorCenter).add(new THREE.Vector3(sideBias * base * 0.28, base * 0.04, -base * 0.06));
      edema.scale.set(1.18, 0.96, 1.08);
      group.add(edema);
    }

    if (state.showEnhancing) {
      const enhancing = new THREE.Mesh(
        new THREE.SphereGeometry(base * (0.72 + fractions.et * 0.18), 18, 18),
        new THREE.MeshBasicMaterial({
          color: ctx.isLeft ? 0xfacc15 : 0xf3e8ff,
          transparent: true,
          opacity: ctx.isLeft ? 0.28 : 0.24,
          wireframe: true,
          depthWrite: false,
        })
      );
      enhancing.position.copy(ctx.tumorCenter).add(new THREE.Vector3(-sideBias * base * 0.08, -base * 0.06, base * 0.04));
      enhancing.scale.set(1.08, 0.92, 1.02);
      group.add(enhancing);
    }

    if (state.showCore) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(base * (0.56 + fractions.ncr * 0.18), 20, 20),
        new THREE.MeshBasicMaterial({
          color: ctx.isLeft ? 0xf43f5e : 0xe9d5ff,
          transparent: true,
          opacity: ctx.isLeft ? 0.58 : 0.56,
          depthWrite: false,
        })
      );
      core.position.copy(ctx.tumorCenter).add(new THREE.Vector3(-sideBias * base * 0.18, 0, 0));
      core.scale.set(0.94, 1.02, 0.88);
      group.add(core);
    }

    return group;
  }

  function applyCompareSceneDecorations(ctx) {
    if (!ctx) return;
    updateSceneClipPlanes(ctx, COMPARE.state, COMPARE_SCENE_RADIUS);

    if (ctx.functionalGroup) {
      ctx.brainGroup.remove(ctx.functionalGroup);
      ctx.functionalGroup = null;
    }
    ctx.functionalGroup = buildCompareFunctionalGroup(ctx, COMPARE.state, COMPARE_SCENE_RADIUS);
    if (ctx.functionalGroup) ctx.brainGroup.add(ctx.functionalGroup);

    if (ctx.trajectoryGroup) {
      ctx.brainGroup.remove(ctx.trajectoryGroup);
      ctx.trajectoryGroup = null;
    }
    ctx.trajectoryGroup = buildCompareTrajectoryGroup(ctx, COMPARE.state, COMPARE_SCENE_RADIUS);
    if (ctx.trajectoryGroup) ctx.brainGroup.add(ctx.trajectoryGroup);

    if (ctx.componentGroup) {
      ctx.brainGroup.remove(ctx.componentGroup);
      ctx.componentGroup = null;
    }
    ctx.componentGroup = buildCompareTumorComponents(ctx, COMPARE.state, COMPARE_SCENE_RADIUS);
    if (ctx.componentGroup) ctx.brainGroup.add(ctx.componentGroup);
  }

  function applyCompareStateToScenes() {
    COMPARE.scenes.forEach(ctx => {
      applyCompareSceneDecorations(ctx);
    });
  }

  function startCompareTicker(ctx) {
    function tick() {
      if (!COMPARE.modal || !document.body.contains(COMPARE.modal) || !ctx.canvas || !document.body.contains(ctx.canvas)) {
        return;
      }
      updateSceneClipPlanes(ctx, COMPARE.state, COMPARE_SCENE_RADIUS);
      ctx._tickId = requestAnimationFrame(tick);
    }
    tick();
  }

  function decorateDualScene(payload) {
    if (!COMPARE.modal) return;
    const tumorGroup = payload.getTumorGroup ? payload.getTumorGroup() : null;
    if (tumorGroup) tumorGroup.visible = false;
    const currentTumorPoints = payload.isLeft ? (MAIN.ctx?.getTumorPoints?.() || null) : null;
    const currentCenter = payload.isLeft
      ? deriveTumorCenter(payload.diagData, currentTumorPoints, COMPARE_SCENE_RADIUS)
      : (tumorGroup?.position?.clone ? tumorGroup.position.clone() : null);
    const currentRadius = payload.isLeft
      ? computeTumorRadiusFromPoints(currentTumorPoints, currentCenter, COMPARE_SCENE_RADIUS)
      : (COMPARE_SCENE_RADIUS * 0.08);
    const ctx = {
      ...payload,
      tumorPoints: currentTumorPoints,
      tumorCenter: currentCenter,
      tumorRadius: currentRadius,
      functionalGroup: null,
      trajectoryGroup: null,
      componentGroup: null,
      slicePlanes: {},
      clipPlanes: null,
    };
    COMPARE.scenes.set(payload.canvasId, ctx);
    applyCompareSceneDecorations(ctx);
    startCompareTicker(ctx);
  }

  window.Brain3DClinicalEnhancer = {
    onViewerReady(payload) {
      injectStyles();
      MAIN.ctx = payload;

      const storedState = loadStoredClinicalState();
      if (storedState) {
        MAIN.state = storedState;
        MAIN.pendingReset = false; // Prevents wipe in updateMainFromDiagnosis
      } else {
        MAIN.state = defaultMainState();
      }

      MAIN.similarData = window.lastSimilarData || (window._similarCasesData ? { similar_cases: window._similarCasesData } : null);
      MAIN.tooltipSelections = Object.assign({}, loadStoredTooltipSelections());
      ensureMainUI();
      if (payload.viewerElement && !payload.viewerElement.dataset.clinicalEntryBound) {
        payload.viewerElement.addEventListener('click', handleMainViewerClick, true);
        payload.viewerElement.dataset.clinicalEntryBound = '1';
      }
      syncMainUI();
      applyMainState(); // Apply restored opacities/toggles to the scene
      tickMainOverlay();
    },

    onBrainModelChanged(payload) {
      MAIN.ctx = Object.assign({}, MAIN.ctx || {}, payload || {});
      MAIN.lastMesh = null;
      applyMainState();
    },

    onTumorUpdated(payload) {
      MAIN.ctx = Object.assign({}, MAIN.ctx || {}, payload || {});
      updateMainFromDiagnosis(payload?.diagnosisData || MAIN.ctx?.getDiagnosisData?.(), payload);
    },

    onTumorFocusRequested(payload) {
      focusMainOnTumor(payload?.diagnosisData, payload?.depthMetrics);
    },

    onSimilarCasesUpdated(payload) {
      MAIN.similarData = payload?.similarData || (window._similarCasesData ? { similar_cases: window._similarCasesData } : null);
      syncMainUI();
      applyMainSimilarWireframeOverlay();
      renderMainTooltipManager();
      updateMainViewerTooltips();
    },

    onViewerReset() {
      // Smarter reset: preserve preferences, reset case data
      const defaults = defaultMainState();

      // Fields to RESET (Case specific)
      MAIN.state.clip = defaults.clip;
      MAIN.state.manualClipAdjusted = false;
      clearCustomEntryPoints(MAIN.state);
      MAIN.state.selectingEntry = false;

      // Fields to KEEP (Preferences - do nothing as they are already in MAIN.state)
      // showFunctional, showPath, showTooltips, cortexOpacity, deepOpacity, 
      // showCore, showEdema, showEnhancing, activeView

      MAIN.pendingReset = false; // We already did the manual part
      persistClinicalState();
      syncMainUI();
      applyMainState();
    },

    onPostRender(payload) {
      if (!MAIN.ctx) return;
      MAIN.ctx = Object.assign({}, MAIN.ctx, payload || {});
      tickMainOverlay();
    },

    onCompareModalOpened(payload) {
      injectStyles();
      setupCompareModal(payload);
    },

    onDualSceneReady(payload) {
      decorateDualScene(payload);
      syncCompareToolbar();
    },

    toggleSafetyMargin() {
      MAIN.state.showRiskShell = !MAIN.state.showRiskShell;
      syncMainUI();
      applyMainState();
      persistClinicalState();
      return MAIN.state.showRiskShell;
    },

    getSafetyMarginState() {
      return MAIN.state.showRiskShell;
    }
  };
})();
