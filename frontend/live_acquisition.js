(function LiveAcquisitionModule() {
  if (window.LiveAcquisition) {
    return;
  }

  const SOCKET_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/simulation`;
  const MAX_FEED_ITEMS = 4;

  const state = {
    socket: null,
    reconnectTimer: null,
    lastHandledCompleteScanId: null,
    currentScan: null,
  };

  function getEls() {
    return {
      card: document.getElementById('liveAcquisitionCard'),
      title: document.getElementById('liveAcquisitionTitle'),
      status: document.getElementById('liveAcquisitionStatus'),
      patient: document.getElementById('liveAcquisitionPatient'),
      sub: document.getElementById('liveAcquisitionSub'),
      progressBar: document.getElementById('liveAcquisitionProgressBar'),
      progressText: document.getElementById('liveAcquisitionProgressText'),
      eta: document.getElementById('liveAcquisitionEta'),
      preview: document.getElementById('liveAcquisitionPreview'),
      placeholderIcon: document.querySelector('.live-acquisition-placeholder-icon'),
      feed: document.getElementById('liveAcquisitionFeed'),
      worklistSummary: document.getElementById('liveWorklistSummary'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
    };
    if (els.feed) els.feed.style.display = 'none';
    if (els.worklistSummary) els.worklistSummary.style.display = 'none';
    return els;
  }

  function safeText(value, fallback = '--') {
    return value ? String(value) : fallback;
  }

  function feed(message, tone = 'info') {
    // Omitted as requested to declutter simulation display on main page
    return;
  }

  function setHeaderStatus(text, mode = 'online') {
    const els = getEls();
    if (els.statusText) {
      els.statusText.textContent = text;
    }
    if (els.statusDot) {
      els.statusDot.className = `status-dot ${mode}`;
    }
  }

  function setCardState(mode, patch = {}) {
    const els = getEls();
    if (!els.card) return;

    els.card.dataset.state = mode;
    if (patch.title !== undefined && els.title) els.title.textContent = patch.title;
    if (patch.status !== undefined && els.status) els.status.textContent = patch.status;
    if (patch.patient !== undefined && els.patient) els.patient.textContent = patch.patient;
    if (patch.sub !== undefined && els.sub) els.sub.textContent = patch.sub;
    if (patch.progressText !== undefined && els.progressText) els.progressText.textContent = patch.progressText;
    if (patch.eta !== undefined && els.eta) els.eta.textContent = patch.eta;
    if (patch.progressPct !== undefined && els.progressBar) els.progressBar.style.width = `${patch.progressPct}%`;
    if (patch.preview !== undefined && els.preview) {
      if (patch.preview) {
        els.preview.src = patch.preview;
        els.preview.style.visibility = 'visible';
        if (els.placeholderIcon) els.placeholderIcon.style.display = 'none';
      } else {
        els.preview.removeAttribute('src');
        els.preview.style.visibility = 'hidden';
        if (els.placeholderIcon) els.placeholderIcon.style.display = 'block';
      }
    }
  }

  function describeScan(payload) {
    return `${safeText(payload.patient_name)} • ${safeText(payload.protocol)}`;
  }

  function connect() {
    if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    state.socket = new WebSocket(SOCKET_URL);

    state.socket.addEventListener('open', () => {
      state.socket.send(JSON.stringify({
        type: 'register',
        payload: {
          role: 'dashboard',
          label: 'Clinical Workstation',
        },
      }));
      setHeaderStatus('Truc Tiep', 'online');
    });

    state.socket.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data);
        const type = message.type || '';
        const payload = message.payload || {};

        switch (type) {
          case 'system.ready':
            break;
          case 'system.presence':
            break;
          case 'system.state':
            if (payload.latest_scan_event?.type && payload.latest_scan_event?.payload) {
              await handleScanEvent(payload.latest_scan_event.type, payload.latest_scan_event.payload, true);
            }
            break;
          case 'scan.worklist':
            renderWorklistSummary(payload);
            break;
          case 'scan.start':
          case 'scan.slice':
          case 'scan.processing':
          case 'scan.complete':
          case 'scan.stop':
          case 'scan.error':
            await handleScanEvent(type, payload, false);
            break;
          default:
            break;
        }
      } catch (error) {
        feed(`Loi parse realtime payload: ${error.message}`, 'error');
      }
    });

    state.socket.addEventListener('close', () => {
      setHeaderStatus('Ngoai Tuyen', 'error');
      if (state.reconnectTimer) {
        window.clearTimeout(state.reconnectTimer);
      }
      state.reconnectTimer = window.setTimeout(connect, 2000);
    });
  }

  async function handleScanEvent(type, payload, isSnapshot) {
    switch (type) {
      case 'scan.start': {
        state.currentScan = payload;
        setCardState('receiving', {
          title: describeScan(payload),
          status: 'Đang nhận',
          patient: `${safeText(payload.patient_id)} • ${safeText(payload.room)}`,
          sub: `${safeText(payload.series_description)} • ${safeText(payload.total_slices)} lát cắt`,
          progressText: `0 / ${payload.total_slices || 0} lát cắt`,
          eta: 'Đang thu nhận',
          progressPct: 0,
          preview: payload.preview_image_url || null,
        });
        if (!isSnapshot) {
          feed(`Bắt đầu nhận quét ${safeText(payload.case_id)} từ thiết bị.`);
        }
        break;
      }
      case 'scan.slice': {
        state.currentScan = { ...(state.currentScan || {}), ...payload };
        const current = Number(payload.slice_index || 0);
        const total = Number(payload.total_slices || 0);
        setCardState('receiving', {
          title: describeScan(payload),
          status: 'Đang nhận',
          patient: safeText(payload.patient_id),
          sub: `Lát cắt ${current}/${total} đang đổ về từ thiết bị MRI.`,
          progressText: `${current} / ${total} lát cắt`,
          eta: `${payload.progress_pct || 0}% hoàn tất`,
          progressPct: Number(payload.progress_pct || 0),
          preview: payload.image_url || null,
        });
        setHeaderStatus(`Trực tiếp ${current}/${total}`, 'online');
        break;
      }
      case 'scan.processing': {
        setCardState('processing', {
          title: describeScan(payload),
          status: 'Đang xử lý',
          patient: safeText(payload.patient_id),
          sub: 'Đã nhận đủ lát cắt. Hệ thống đang nạp ảnh đại diện và chuẩn bị AI.',
          eta: 'Hàng chờ AI',
          progressPct: 100,
        });
        if (!isSnapshot) {
          feed(`Đã nhận đủ dữ liệu quét ${safeText(payload.case_id)}. Bắt đầu xử lý AI.`);
        }
        break;
      }
      case 'scan.complete': {
        setCardState('processing', {
          title: describeScan(payload),
          status: 'AI Tự động',
          patient: `${safeText(payload.patient_id)} • ${safeText(payload.case_id)}`,
          sub: 'Đang tự động nạp ảnh đại diện vào bảng điều khiển.',
          progressText: `${payload.total_slices || 0} / ${payload.total_slices || 0} lát cắt`,
          eta: 'Đang chạy chẩn đoán',
          progressPct: 100,
          preview: payload.representative_image_url || payload.final_image_url || null,
        });

        if (isSnapshot) {
          state.lastHandledCompleteScanId = payload.scan_id || state.lastHandledCompleteScanId;
          break;
        }

        if (state.lastHandledCompleteScanId === payload.scan_id) {
          break;
        }
        state.lastHandledCompleteScanId = payload.scan_id;

        feed(`Quét ${safeText(payload.case_id)} hoàn tất. Đang khởi chạy AI.`);

        try {
          await window.App.loadRemoteImage(
            payload.representative_image_url || payload.final_image_url,
            payload.image_filenames?.[0] || `${payload.case_id || 'scan'}_representative.png`,
            {
              switchToMainTab: true,
              scanContext: payload,
            }
          );

          const started = await window.App.runDiagnosis({ source: 'simulator' });
          if (!started) {
            setCardState('complete', {
              title: describeScan(payload),
              status: 'Sẵn sàng',
              patient: `${safeText(payload.patient_id)} • Đã nạp ảnh đại diện`,
              sub: 'Ảnh đã được nạp, nhưng bảng điều khiển đang bận. Bạn có thể bấm Chạy Chẩn Đoán thủ công.',
              eta: 'Chờ xử lý tay',
              progressPct: 100,
            });
            feed('Bảng điều khiển đang bận. Ảnh mô phỏng đã được nạp sẵn để chạy tay.', 'warn');
          }
        } catch (error) {
          setCardState('error', {
            title: describeScan(payload),
            status: 'Lỗi',
            patient: safeText(payload.patient_id),
            sub: error.message || 'Không thể nạp ảnh mô phỏng vào bảng điều khiển.',
            eta: 'Kiểm tra kết nối',
          });
          feed(`Không thể tiếp tục AI từ ca quét: ${error.message}`, 'error');
        }
        break;
      }
      case 'scan.stop': {
        setCardState('idle', {
          title: 'Đã dừng quét',
          status: 'Đã dừng',
          patient: `${safeText(payload.patient_id)} • ${safeText(payload.case_id)}`,
          sub: 'Phiên thu nhận đã dừng trước khi hoàn tất.',
          eta: 'Đang chờ',
          progressPct: 0,
        });
        feed(`Ca quét ${safeText(payload.case_id)} đã bị dừng.`, 'warn');
        setHeaderStatus('Trực tiếp', 'online');
        break;
      }
      case 'scan.error': {
        setCardState('error', {
          title: 'Lỗi thiết bị',
          status: 'Lỗi',
          patient: safeText(payload.patient_id),
          sub: payload.message || 'Thiết bị mô phỏng MRI đã báo lỗi.',
          eta: 'Kiểm tra thiết bị',
        });
        feed(`Lỗi thiết bị: ${payload.message || 'Lỗi không xác định'}`, 'error');
        setHeaderStatus('Trực tiếp', 'online');
        break;
      }
      default:
        break;
    }
  }

  function renderWorklistSummary(payload) {
    // Omitted as requested to declutter simulation display on main page
    return;
  }

  window.LiveAcquisition = {
    onDiagnosisStateChange(status, details = {}) {
      if (details.source !== 'simulator') {
        return;
      }

      const scanContext = details.scanContext || state.currentScan || {};

      if (status === 'loading') {
        setCardState('processing', {
          title: describeScan(scanContext),
          status: 'AI đang chạy',
          patient: safeText(scanContext.patient_id),
          sub: 'Mô hình AI đang phân tích ảnh đại diện từ ca quét.',
          eta: 'Đang chạy mô hình',
          progressPct: 100,
        });
        feed(`AI đang phân tích ca quét ${safeText(scanContext.case_id)}.`);
        return;
      }

      if (status === 'ready') {
        const confidence = details.diagnosis?.prediction?.confidence;
        const confidenceLabel = typeof confidence === 'number' ? `Độ tin cậy ${Math.round(confidence * 100)}%` : 'Báo cáo AI sẵn sàng';
        setCardState('complete', {
          title: describeScan(scanContext),
          status: 'Báo cáo sẵn sàng',
          patient: `${safeText(scanContext.patient_id)} • ${confidenceLabel}`,
          sub: 'Trạm làm việc lâm sàng đã hoàn tất chẩn đoán từ luồng thu nhận.',
          eta: 'Đã đồng bộ',
          progressPct: 100,
        });
        setHeaderStatus('Trực tiếp', 'online');
        feed(`Báo cáo AI đã sẵn sàng cho ca quét ${safeText(scanContext.case_id)}.`);
        return;
      }

      if (status === 'error') {
        setCardState('error', {
          title: describeScan(scanContext),
          status: 'Lỗi AI',
          patient: safeText(scanContext.patient_id),
          sub: details.message || 'Bảng điều khiển không thể hoàn tất chẩn đoán từ thiết bị mô phỏng.',
          eta: 'Cần thử lại',
          progressPct: 100,
        });
        feed(`Lỗi AI sau thu nhận: ${details.message || 'Lỗi không xác định'}`, 'error');
        setHeaderStatus('Trực tiếp', 'online');
      }
    },
  };

  connect();
})();
