(function MRIModalitySimulator() {
  const SOCKET_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/simulation`;
  const CASES_URL = "/api/cases?limit=5&slices_per_case=5";

  const worklistList = document.getElementById("worklistList");
  const caseCount = document.getElementById("caseCount");
  const selectedCaseLabel = document.getElementById("selectedCaseLabel");
  const refreshCasesBtn = document.getElementById("refreshCasesBtn");
  const shuffleCasesBtn = document.getElementById("shuffleCasesBtn");
  const saveCasesBtn = document.getElementById("saveCasesBtn");
  const presenceChip = document.getElementById("presenceChip");
  const presenceText = document.getElementById("presenceText");
  const socketStateText = document.getElementById("socketStateText");
  const scanBadge = document.getElementById("scanBadge");
  const scannerStage = document.getElementById("scannerStage");
  const slicePreview = document.getElementById("slicePreview");
  const stageTitle = document.getElementById("stageTitle");
  const stageSubtitle = document.getElementById("stageSubtitle");
  const progressLabel = document.getElementById("progressLabel");
  const timerLabel = document.getElementById("timerLabel");
  const scanProgressBar = document.getElementById("scanProgressBar");
  const patientIdValue = document.getElementById("patientIdValue");
  const protocolValue = document.getElementById("protocolValue");
  const matrixValue = document.getElementById("matrixValue");
  const intervalValue = document.getElementById("intervalValue");
  const startScanBtn = document.getElementById("startScanBtn");
  const stopScanBtn = document.getElementById("stopScanBtn");
  const protocolPreset = document.getElementById("protocolPreset");
  const sliceIntervalInput = document.getElementById("sliceIntervalInput");
  const trInput = document.getElementById("trInput");
  const teInput = document.getElementById("teInput");
  const thicknessInput = document.getElementById("thicknessInput");
  const coilInput = document.getElementById("coilInput");
  const windowCenterInput = document.getElementById("windowCenterInput");
  const windowWidthInput = document.getElementById("windowWidthInput");
  const audioToggle = document.getElementById("audioToggle");
  const eventLog = document.getElementById("eventLog");
  const generateFilmBtn = document.getElementById("generateFilmBtn");

  // Image Picker modal elements
  const imgPickerOverlay = document.getElementById("imgPickerOverlay");
  const imgPickerCaseTitle = document.getElementById("imgPickerTitle");
  const imgPickerDropzone = document.getElementById("imgPickerDropzone");
  const imgPickerInput = document.getElementById("imgPickerInput");
  const imgPickerStats = document.getElementById("imgPickerStats");
  const imgPickerCountLabel = document.getElementById("imgPickerCountLabel");
  const imgPickerClearBtn = document.getElementById("imgPickerClearBtn");
  const imgPickerThumbnails = document.getElementById("imgPickerThumbnails");
  const imgPickerCloseBtn = document.getElementById("imgPickerCloseBtn");
  const imgPickerCancelBtn = document.getElementById("imgPickerCancelBtn");
  const imgPickerConfirmBtn = document.getElementById("imgPickerConfirmBtn");
  const imgPickerConfirmCount = document.getElementById("imgPickerConfirmCount");

  // Batch Picker modal elements
  const batchPickerOverlay = document.getElementById("batchPickerOverlay");
  const batchPickBtn = document.getElementById("batchPickBtn");
  const batchPickerCloseBtn = document.getElementById("batchPickerCloseBtn");
  const batchPickerCancelBtn = document.getElementById("batchPickerCancelBtn");
  const batchPickerConfirmBtn = document.getElementById("batchPickerConfirmBtn");
  const batchPickerStatus = document.getElementById("batchPickerStatus");
  const batchSlotsGrid = document.getElementById("batchSlotsGrid");
  const batchAllInput = document.getElementById("batchAllInput");

  // Notice Modal elements
  const noticeOverlay = document.getElementById("noticeOverlay");
  const noticeTitle = document.getElementById("noticeTitle");
  const noticeMessage = document.getElementById("noticeMessage");
  const noticeIcon = document.getElementById("noticeIcon");
  const noticeCloseBtn = document.getElementById("noticeCloseBtn");

  let worklist = [];
  let selectedCase = null;
  let socket = null;
  let stopRequested = false;
  let isScanning = false;
  let scanStartAt = 0;
  let audioContext = null;

  // Image Picker state
  let pickerTargetCase = null;
  let pickerFiles = [];
  let pickerObjectUrls = [];

  // Batch Picker state — { [caseId]: { file, objectUrl } }
  let batchSlotImages = {};


  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function addLog(title, detail, tone = "info") {
    const entry = document.createElement("div");
    entry.className = `log-entry${tone !== "info" ? ` ${tone}` : ""}`;
    entry.innerHTML = `<strong>${title}</strong><span>${new Date().toLocaleTimeString("vi-VN")} • ${detail}</span>`;
    eventLog.prepend(entry);
  }

  function updatePresence(text, isOnline) {
    if (presenceText) presenceText.textContent = text;
    if (presenceChip) presenceChip.classList.toggle("online", Boolean(isOnline));
  }


  // Thông báo thu nhận khi đã mô phỏng <-----------------------------------------
  
  function showNotice(title, message, type = "success") {
    noticeTitle.textContent = title;
    noticeMessage.textContent = message;
    
    // Set icon based on type
    noticeIcon.className = "notice-icon " + type;
    if (type === "success") noticeIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    else if (type === "error") noticeIcon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    else noticeIcon.innerHTML = '<i class="fa-solid fa-circle-info"></i>';

    noticeOverlay.classList.add("open");
  }

  function closeNotice() {
    noticeOverlay.classList.remove("open");
  }

  function collectAcquisitionSettings() {
    const intervalMs = clamp(Number(sliceIntervalInput.value) || 500, 200, 1500);
    return {
      protocol: protocolPreset.value || "T2-FLAIR",
      interval_ms: intervalMs,
      repetition_time_ms: Number(trInput.value) || 4800,
      echo_time_ms: Number(teInput.value) || 124,
      slice_thickness_mm: Number(thicknessInput.value) || 4.5,
      coil: coilInput.value || "Head/Neck 20ch",
      matrix: "256 x 256",
      window_center: Number(windowCenterInput.value) || 180,
      window_width: Number(windowWidthInput.value) || 760,
    };
  }

  function applyCaseSelection(nextCase) {
    selectedCase = nextCase;
    selectedCaseLabel.textContent = nextCase ? nextCase.case_id : "Chưa chọn";

    document.querySelectorAll(".worklist-item").forEach((node) => {
      node.classList.toggle("active", node.dataset.caseId === nextCase?.case_id);
    });

    if (!nextCase) {
      stageTitle.textContent = "Chưa có ca đang thu nhận";
      stageSubtitle.textContent = "Chọn ca bệnh để bắt đầu mô phỏng lát cắt.";
      patientIdValue.textContent = "--";
      protocolValue.textContent = "--";
      return;
    }

    protocolPreset.value = nextCase.protocol || protocolPreset.value;
    slicePreview.src = nextCase.preview_image_url;
    stageTitle.textContent = `${nextCase.patient_name} • ${nextCase.room}`;
    stageSubtitle.textContent = `${nextCase.series_description} | ${nextCase.slice_count} lát | ${nextCase.scanner}`;
    patientIdValue.textContent = nextCase.patient_id;
    protocolValue.textContent = nextCase.protocol;

    if (nextCase.isScanned) {
      generateFilmBtn.style.display = "inline-flex";
      generateFilmBtn.disabled = false;
    } else {
      generateFilmBtn.style.display = "inline-flex"; // Still show it, but disabled to show it's a feature
      generateFilmBtn.disabled = true;
      generateFilmBtn.title = "Cần hoàn tất chụp để xuất phim";
    }
    // Log removed as requested: addLog("Đã chọn ca", `${nextCase.case_id} • ${nextCase.patient_name} • ${nextCase.slice_count} lát`);
  }

  function renderWorklist() {
    worklistList.innerHTML = "";
    caseCount.textContent = String(worklist.length);

    if (!worklist.length) {
      worklistList.innerHTML = `<div class="worklist-empty">Không có ảnh MRI để tạo danh sách. Kiểm tra lại thư mục <code>/data/images</code>.</div>`;
      applyCaseSelection(null);
      return;
    }

    worklist.forEach((item, index) => {
      // Wrapper to allow sibling pick-button alongside the main item button
      const wrapper = document.createElement("div");
      wrapper.className = "worklist-item-row";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "worklist-item";
      button.dataset.caseId = item.case_id;

      const ai = item.ai_preview || {};
      const riskBadge = ai.tumor_detected
        ? `<span class="wl-tag wl-tag--risk-high" title="AI detected potential tumor with ${Math.round(ai.confidence * 100)}% confidence">⚠️ NGUY CƠ CAO (${Math.round(ai.confidence * 100)}%)</span>`
        : "";

      // Abbreviate scanner: "Siemens Magnetom Vida 3T" → "Siemens · 3T"
      const scannerShort = item.scanner.replace(/(Siemens|GE|Philips)\s+\S+\s+(\S+)\s+(\w+)/, "$1 · $3");

      button.innerHTML = `
        <div class="wl-top-row">
          <span class="wl-name">${item.patient_name}</span>
          <span class="wl-time">${item.scheduled_time}</span>
        </div>
        <div class="wl-id-row">
          <span class="wl-id">${item.patient_id}</span>
          <span class="wl-sep">·</span>
          <span class="wl-acc">${item.accession_number}</span>
        </div>
        <div class="wl-tags-row">
          <span class="wl-tag wl-tag--protocol">${item.protocol}</span>
          ${riskBadge}
          <span class="wl-scanner">${scannerShort}</span>
        </div>
      `;
      button.addEventListener("click", () => applyCaseSelection(item));



      wrapper.appendChild(button);
      worklistList.appendChild(wrapper);

      if (index === 0 && !selectedCase) {
        applyCaseSelection(item);
      }
    });
  }

  // ─── Image Picker ───────────────────────────────────────────────────────────

  function openImagePicker(caseItem) {
    pickerTargetCase = caseItem;
    imgPickerCaseTitle.textContent = `${caseItem.patient_name} • ${caseItem.case_id}`;

    // Reset state (keep previous selection if same case)
    pickerFiles = [];
    pickerObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    pickerObjectUrls = [];
    imgPickerInput.value = "";

    renderPickerThumbnails();
    imgPickerOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeImagePicker() {
    imgPickerOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  function renderPickerThumbnails() {
    imgPickerThumbnails.innerHTML = "";
    const count = pickerFiles.length;

    imgPickerCountLabel.textContent = count
      ? `${count} ảnh đã chọn`
      : "Chưa chọn ảnh nào";
    imgPickerConfirmCount.textContent = count ? `(${count} ảnh)` : "";
    imgPickerConfirmBtn.disabled = count === 0;
    imgPickerStats.style.display = count > 0 ? "flex" : "none";

    pickerFiles.forEach((file, i) => {
      const url = pickerObjectUrls[i];
      const thumb = document.createElement("div");
      thumb.className = "picker-thumb";

      const orderLabel = `${i + 1}`;
      thumb.innerHTML = `
        <div class="thumb-order">${orderLabel}</div>
        <img src="${url}" alt="${file.name}" loading="lazy" />
        <div class="thumb-info">
          <span class="thumb-name" title="${file.name}">${file.name}</span>
          <span class="thumb-size">${formatFileSize(file.size)}</span>
        </div>
        <button type="button" class="thumb-remove" title="Xóa ảnh này">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;
      thumb.querySelector(".thumb-remove").addEventListener("click", () => {
        URL.revokeObjectURL(pickerObjectUrls[i]);
        pickerFiles.splice(i, 1);
        pickerObjectUrls.splice(i, 1);
        renderPickerThumbnails();
      });
      imgPickerThumbnails.appendChild(thumb);
    });
  }

  function addFilesToPicker(fileList) {
    let added = 0;
    Array.from(fileList).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      pickerFiles.push(file);
      pickerObjectUrls.push(URL.createObjectURL(file));
      added += 1;
    });
    if (added > 0) renderPickerThumbnails();
  }

  async function confirmImagePicker() {
    if (!pickerTargetCase || !pickerFiles.length) return;

    imgPickerConfirmBtn.disabled = true;
    imgPickerConfirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải...';

    try {
      const serverUrls = [];
      const filenames = [];

      // Upload each file to the server
      for (const file of pickerFiles) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/simulator/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        const data = await res.json();
        serverUrls.push(data.url);
        filenames.push(data.filename);
      }

      // Update the case in-memory with server URLs
      pickerTargetCase.slice_image_urls = [...serverUrls];
      pickerTargetCase.image_filenames = [...filenames];
      pickerTargetCase.slice_count = serverUrls.length;
      pickerTargetCase.preview_image_url = serverUrls[0];
      pickerTargetCase.representative_image_url = serverUrls[Math.floor(serverUrls.length / 2)];
      pickerTargetCase._customImageCount = serverUrls.length;

      // Update slice count label in the worklist item
      const sliceLabel = worklistList.querySelector(
        `.slice-count-label[data-case-id="${pickerTargetCase.case_id}"]`
      );
      if (sliceLabel) sliceLabel.textContent = `${serverUrls.length} lát`;

      // If this is the currently selected case, refresh preview
      if (selectedCase && selectedCase.case_id === pickerTargetCase.case_id) {
        applyCaseSelection(pickerTargetCase);
      }

      addLog(
        "Ảnh tùy chỉnh đã lưu",
        `${pickerTargetCase.case_id} • ${serverUrls.length} ảnh đã được lưu lên máy chủ`
      );
      closeImagePicker();
    } catch (error) {
      console.error("Upload error:", error);
      alert("Lỗi khi tải ảnh lên máy chủ: " + error.message);
    } finally {
      imgPickerConfirmBtn.disabled = false;
      imgPickerConfirmBtn.innerHTML = `<i class="fa-solid fa-check-circle"></i> Áp dụng <span id="imgPickerConfirmCount">(${pickerFiles.length} ảnh)</span>`;
    }
  }

  function clearPickerImages() {
    pickerObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    pickerFiles = [];
    pickerObjectUrls = [];
    imgPickerInput.value = "";
    renderPickerThumbnails();
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }


  async function loadCases(shuffle = false) {
    refreshCasesBtn.disabled = true;
    if (shuffleCasesBtn) shuffleCasesBtn.disabled = true;
    try {
      // Add t parameter to prevent browser caching
      const cacheBuster = `t=${Date.now()}`;
      const url = shuffle ? `${CASES_URL}&shuffle=true&${cacheBuster}` : `${CASES_URL}&${cacheBuster}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      worklist = payload.cases || [];

      // Force reset selection on shuffle to show new images immediately
      renderWorklist();
      if (worklist.length > 0) {
        applyCaseSelection(worklist[0]);
      }

      // --- BROADCAST WORKLIST TO DASHBOARD (NEW) ---
      sendSocket("scan.worklist", {
        count: worklist.length,
        cases: worklist.map(c => ({
          case_id: c.case_id,
          patient_name: c.patient_name,
          patient_id: c.patient_id,
          ai_preview: c.ai_preview,
          protocol: c.protocol,
          scheduled_time: c.scheduled_time
        }))
      });

      // Log removed as requested: addLog(shuffle ? "Danh sách đã xáo trộn" : "Danh sách đã đồng bộ", `${worklist.length} ca bệnh mới đã sẵn sàng`);

      if (payload.is_saved) {
        addLog("Đã tải danh sách lưu", `Sử dụng ${worklist.length} bệnh nhân từ cơ sở dữ liệu`);
      }
    } catch (error) {
      worklist = [];
      renderWorklist();
      addLog("Lỗi danh sách", error.message || "Không tải được danh sách bệnh nhân", "error");
    } finally {
      refreshCasesBtn.disabled = false;
      if (shuffleCasesBtn) shuffleCasesBtn.disabled = false;
    }
  }

  async function saveCurrentWorklist() {
    if (!worklist.length) {
      addLog("Lỗi lưu", "Danh sách rỗng, không thể lưu", "warn");
      return;
    }

    saveCasesBtn.disabled = true;
    saveCasesBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
      console.log("Saving worklist:", worklist);
      const response = await fetch("/api/cases/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cases: worklist }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const res = await response.json();
      addLog("Đã lưu danh sách", "5 bệnh nhân đã được lưu vào cơ sở dữ liệu làm mặc định");

      // Hiển thị thông báo nổi bật cho người dùng
      showNotice("Thành công", "Đã lưu danh sách 5 bệnh nhân thành công! Từ giờ khi tải lại trang, hệ thống sẽ mặc định hiển thị 5 bệnh nhân này.");

    } catch (error) {
      console.error("Save error:", error);
      addLog("Lỗi lưu danh sách", error.message || "Không thể kết nối máy chủ", "error");
      showNotice("Lỗi", "Không thể lưu danh sách: " + error.message, "error");
    } finally {
      saveCasesBtn.disabled = false;
      saveCasesBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
    }
  }

  function connectSocket() {
    socket = new WebSocket(SOCKET_URL);
    socketStateText.textContent = "WS đang kết nối";
    updatePresence("Đang kết nối bảng điều khiển...", false);

    socket.addEventListener("open", () => {
      socketStateText.textContent = "WS trực tuyến";
      updatePresence("Kênh thời gian thực sẵn sàng", true);
      socket.send(JSON.stringify({
        type: "register",
        payload: {
          role: "simulator",
          label: "Bảng điều khiển thiết bị MRI",
        },
      }));
      addLog("Kết nối WebSocket", "Kênh thời gian thực tới bảng điều khiển đã mở");
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        const type = message.type || "";
        const payload = message.payload || {};

        if (type === "system.presence") {
          const dashboardCount = (payload.clients || []).filter((client) => client.role === "dashboard").length;
          const simulatorCount = (payload.clients || []).filter((client) => client.role === "simulator").length;
          updatePresence(`${dashboardCount} bảng điều khiển • ${simulatorCount} thiết bị trực tuyến`, true);
          return;
        }

        if (type === "system.error") {
          addLog("Lỗi socket", payload.message || "Tin nhắn socket không được hỗ trợ", "error");
          return;
        }

        if (type === "system.ready") {
          addLog("Socket sẵn sàng", `${payload.image_count || 0} ảnh có sẵn cho mô phỏng`);
        }
      } catch (error) {
        addLog("Lỗi phân tích socket", error.message || "Không thể phân tích tin nhắn", "warn");
      }
    });

    socket.addEventListener("close", () => {
      socketStateText.textContent = "WS ngoại tuyến";
      updatePresence("Mất kết nối thời gian thực, đang thử lại...", false);
      addLog("Đã ngắt kết nối", "Đang thử kết nối lại sau 2 giây", "warn");
      window.setTimeout(connectSocket, 2000);
    });
  }

  function sendSocket(type, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      addLog("Socket ngoại tuyến", `Không gửi được ${type}`, "warn");
      return;
    }
    socket.send(JSON.stringify({ type, payload }));
  }

  function updateProgress(currentSlice, totalSlices, elapsedMs) {
    const safeTotal = Math.max(totalSlices, 1);
    const progressPct = (currentSlice / safeTotal) * 100;
    scanProgressBar.style.width = `${progressPct}%`;
    progressLabel.textContent = `${currentSlice} / ${totalSlices} lát cắt`;
    timerLabel.textContent = new Date(elapsedMs).toISOString().slice(14, 19);
  }

  function updateScanUI(state, subtitle) {
    scanBadge.textContent = state;
    stageSubtitle.textContent = subtitle;
    scannerStage.classList.toggle("scanning", state === "Đang quét");
  }

  function ensureAudioContext() {
    if (!audioToggle.checked) {
      return null;
    }
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  function playBeep() {
    const ctx = ensureAudioContext();
    if (!ctx) {
      return;
    }
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 740;
    gain.gain.value = 0.015;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.09);
  }

  async function startScan() {
    if (!selectedCase || isScanning) {
      return;
    }

    const settings = collectAcquisitionSettings();
    const slices = selectedCase.slice_image_urls || [];
    if (!slices.length) {
      addLog("Quét bị chặn", "Ca được chọn không có lát cắt", "error");
      return;
    }

    stopRequested = false;
    isScanning = true;
    scanStartAt = Date.now();
    startScanBtn.disabled = true;
    stopScanBtn.disabled = false;
    generateFilmBtn.style.display = "none";

    patientIdValue.textContent = selectedCase.patient_id;
    protocolValue.textContent = settings.protocol;
    matrixValue.textContent = settings.matrix;
    intervalValue.textContent = `${settings.interval_ms} ms`;
    stageTitle.textContent = `Đang thu nhận ${selectedCase.patient_name}`;
    updateScanUI("Đang quét", `${selectedCase.series_description} | ${selectedCase.scanner}`);
    updateProgress(0, slices.length, 0);
    // Log removed as requested: addLog("Bắt đầu quét", `${selectedCase.case_id} • ${settings.protocol} • ${slices.length} lát cắt`);

    const scanId = `${selectedCase.case_id}-${Date.now()}`;
    sendSocket("scan.start", {
      scan_id: scanId,
      ...selectedCase,
      protocol: settings.protocol,
      acquisition: settings,
      total_slices: slices.length,
      estimated_duration_ms: slices.length * settings.interval_ms,
    });

    for (let index = 0; index < slices.length; index += 1) {
      if (stopRequested) {
        break;
      }

      const imageUrl = slices[index];
      const elapsedMs = Date.now() - scanStartAt;
      const currentSlice = index + 1;
      const progressPct = Number(((currentSlice / slices.length) * 100).toFixed(1));

      slicePreview.src = imageUrl;
      updateProgress(currentSlice, slices.length, elapsedMs);
      stageTitle.textContent = `${selectedCase.patient_name} • Lát cắt ${currentSlice}/${slices.length}`;
      playBeep();

      sendSocket("scan.slice", {
        scan_id: scanId,
        case_id: selectedCase.case_id,
        patient_id: selectedCase.patient_id,
        patient_name: selectedCase.patient_name,
        protocol: settings.protocol,
        slice_index: currentSlice,
        total_slices: slices.length,
        image_url: imageUrl,
        image_filename: selectedCase.image_filenames?.[index] || `slice_${currentSlice}.png`,
        progress_pct: progressPct,
        acquisition: settings,
      });

      await sleep(settings.interval_ms);
    }

    const totalElapsedMs = Date.now() - scanStartAt;

    if (stopRequested) {
      sendSocket("scan.stop", {
        scan_id: scanId,
        case_id: selectedCase.case_id,
        patient_id: selectedCase.patient_id,
        patient_name: selectedCase.patient_name,
        total_slices: slices.length,
        scanned_slices: Math.min(Math.round(totalElapsedMs / settings.interval_ms), slices.length),
      });
      updateScanUI("Đã dừng", "Phiên quét đã dừng bởi người vận hành.");
      // Log removed as requested: addLog("Đã dừng quét", `${selectedCase.case_id} bị dừng giữa phiên`, "warn");
    } else {
      updateScanUI("Đang xử lý", "Đã gửi đủ dữ liệu, bảng điều khiển đang chuẩn bị phân tích.");
      sendSocket("scan.processing", {
        scan_id: scanId,
        case_id: selectedCase.case_id,
        patient_id: selectedCase.patient_id,
        patient_name: selectedCase.patient_name,
        representative_image_url: selectedCase.representative_image_url,
        total_slices: slices.length,
      });

      await sleep(450);

      sendSocket("scan.complete", {
        scan_id: scanId,
        ...selectedCase,
        protocol: settings.protocol,
        acquisition: settings,
        total_slices: slices.length,
        elapsed_ms: totalElapsedMs,
        final_image_url: slices[slices.length - 1],
        representative_image_url: selectedCase.representative_image_url,
      });
      updateScanUI("Hoàn tất", "Đã gửi xong lát cắt. Trạm lâm sàng sẽ tiếp tục xử lý AI.");
      // Log removed as requested: addLog("Quét hoàn tất", `${selectedCase.case_id} hoàn tất sau ${Math.round(totalElapsedMs / 1000)}s`);
    }

    isScanning = false;
    startScanBtn.disabled = false;
    stopScanBtn.disabled = true;

    if (!stopRequested) {
      selectedCase.isScanned = true;
      generateFilmBtn.style.display = "inline-flex";
      generateFilmBtn.disabled = false;
      generateFilmBtn.title = "Xuất phim MRI";
      
      // Thông báo thành công và đồng bộ dữ liệu
      showNotice("Thu nhận hoàn tất", "Dữ liệu đã được đồng bộ hóa tới trạm lâm sàng và sẵn sàng để xuất phim.", "success");
    }
  }

  function stopScan() {
    if (!isScanning) {
      return;
    }
    stopRequested = true;
  }

  refreshCasesBtn.addEventListener("click", () => loadCases(false));
  if (shuffleCasesBtn) {
    shuffleCasesBtn.addEventListener("click", () => loadCases(true));
  }
  if (saveCasesBtn) {
    saveCasesBtn.addEventListener("click", saveCurrentWorklist);
  }
  startScanBtn.addEventListener("click", startScan);
  stopScanBtn.addEventListener("click", stopScan);
  sliceIntervalInput.addEventListener("input", () => {
    intervalValue.textContent = `${clamp(Number(sliceIntervalInput.value) || 500, 200, 1500)} ms`;
  });

  async function exportFilm() {
    if (!selectedCase || isScanning) return;

    generateFilmBtn.disabled = true;
    const originalHtml = generateFilmBtn.innerHTML;
    generateFilmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...';

    try {
      const response = await fetch("/api/simulator/generate_film", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: selectedCase.case_id,
          patient_name: selectedCase.patient_name,
          patient_id: selectedCase.patient_id,
          protocol: selectedCase.protocol,
          study_date: selectedCase.study_date,
          slice_urls: selectedCase.slice_image_urls,
          ai_preview: selectedCase.ai_preview || {}
        }),
      });

      if (!response.ok) {
        let errorMsg = `Lỗi ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.detail || errorMsg;
        } catch (e) {
          const text = await response.text().catch(() => "");
          if (text) errorMsg += `: ${text.slice(0, 100)}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      addLog("Đã tạo phim MRI", `File: ${data.filename}`, "info");

      // Mở phim trong tab mới
      window.open(data.url, "_blank");

    } catch (error) {
      console.error("Export film error:", error);
      showNotice("Lỗi xuất phim", error.message, "error");
    } finally {
      generateFilmBtn.disabled = false;
      generateFilmBtn.innerHTML = originalHtml;
    }
  }

  generateFilmBtn.addEventListener("click", exportFilm);
  noticeCloseBtn.addEventListener("click", closeNotice);

  // Close notice on clicking overlay
  noticeOverlay.addEventListener("click", (e) => {
    if (e.target === noticeOverlay) closeNotice();
  });

  // Image Picker events
  imgPickerCloseBtn.addEventListener("click", closeImagePicker);
  imgPickerCancelBtn.addEventListener("click", closeImagePicker);
  imgPickerConfirmBtn.addEventListener("click", confirmImagePicker);
  imgPickerClearBtn.addEventListener("click", clearPickerImages);

  imgPickerInput.addEventListener("change", () => {
    addFilesToPicker(imgPickerInput.files);
    imgPickerInput.value = "";
  });

  // Drag & Drop on dropzone
  imgPickerDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    imgPickerDropzone.classList.add("dragover");
  });
  imgPickerDropzone.addEventListener("dragleave", (e) => {
    if (!imgPickerDropzone.contains(e.relatedTarget)) {
      imgPickerDropzone.classList.remove("dragover");
    }
  });
  imgPickerDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    imgPickerDropzone.classList.remove("dragover");
    addFilesToPicker(e.dataTransfer.files);
  });

  // Close modal when clicking backdrop
  imgPickerOverlay.addEventListener("click", (e) => {
    if (e.target === imgPickerOverlay) closeImagePicker();
  });

  // Close modal on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && imgPickerOverlay.classList.contains("open")) {
      closeImagePicker();
    }
    if (e.key === "Escape" && batchPickerOverlay.classList.contains("open")) {
      cancelBatchPicker();
    }
  });

  // ─── Batch Picker functions ────────────────────────────────────────

  function openBatchPicker() {
    batchSlotImages = {};
    renderBatchSlots();
    batchPickerOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function cancelBatchPicker() {
    Object.values(batchSlotImages).forEach((d) => URL.revokeObjectURL(d.objectUrl));
    batchSlotImages = {};
    batchPickerOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  function updateBatchStatus() {
    const count = Object.keys(batchSlotImages).length;
    const total = worklist.length;
    batchPickerStatus.textContent = count > 0
      ? `${count} / ${total} ca đã được gán ảnh`
      : "Chưa có ảnh nào được gán";
    batchPickerConfirmBtn.disabled = count === 0;
  }

  function renderBatchSlots() {
    batchSlotsGrid.innerHTML = "";
    if (!worklist.length) {
      batchSlotsGrid.innerHTML = `<p style="padding:24px;color:var(--text-soft)">Chưa có ca bệnh nào trong danh sách.</p>`;
      return;
    }
    worklist.forEach((item, i) => {
      const slot = document.createElement("div");
      slot.className = "batch-slot";
      slot.dataset.caseId = item.case_id;
      const imgData = batchSlotImages[item.case_id];
      const hasImage = Boolean(imgData);
      const inputId = `bslot_${item.case_id.replace(/[^a-z0-9]/gi, "_")}`;
      slot.innerHTML = `
        <div class="batch-slot-header">
          <span class="batch-slot-num">${String(i + 1).padStart(2, "0")}</span>
          <div class="batch-slot-info">
            <strong>${item.patient_name}</strong>
            <span>${item.patient_id}</span>
          </div>
          ${hasImage ? `<button type="button" class="batch-slot-clear" data-case-id="${item.case_id}" title="Bỏ ảnh"><i class="fa-solid fa-xmark"></i></button>` : ""}
        </div>
        <label class="batch-slot-zone${hasImage ? " has-image" : ""}" for="${inputId}">
          ${hasImage
          ? `<img src="${imgData.objectUrl}" alt="${imgData.file.name}" /><span class="batch-slot-filename">${imgData.file.name}</span>`
          : `<i class="fa-solid fa-image"></i><span>Nhấn để chọn ảnh</span>`}
        </label>
        <input type="file" id="${inputId}" accept="image/png,image/jpeg,image/jpg"
               class="batch-slot-input" data-case-id="${item.case_id}" />
      `;
      batchSlotsGrid.appendChild(slot);
    });

    // File input per slot -------------------------------------------------------------

    batchSlotsGrid.querySelectorAll(".batch-slot-input").forEach((inp) => {
      inp.addEventListener("change", () => {
        if (inp.files[0]) {
          const cid = inp.dataset.caseId;
          if (batchSlotImages[cid]) URL.revokeObjectURL(batchSlotImages[cid].objectUrl);
          batchSlotImages[cid] = { file: inp.files[0], objectUrl: URL.createObjectURL(inp.files[0]) };
          inp.value = "";
          renderBatchSlots();
          updateBatchStatus();
        }
      });
    });

    // Clear button per slot  -------------------------------------------------------------
    batchSlotsGrid.querySelectorAll(".batch-slot-clear").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const cid = btn.dataset.caseId;
        if (batchSlotImages[cid]) URL.revokeObjectURL(batchSlotImages[cid].objectUrl);
        delete batchSlotImages[cid];
        renderBatchSlots();
        updateBatchStatus();
      });
    });

    // Drag & drop per slot zone  -------------------------------------------------------------
    batchSlotsGrid.querySelectorAll(".batch-slot-zone").forEach((zone) => {
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("dragover");
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
          const cid = zone.closest(".batch-slot").dataset.caseId;
          if (batchSlotImages[cid]) URL.revokeObjectURL(batchSlotImages[cid].objectUrl);
          batchSlotImages[cid] = { file, objectUrl: URL.createObjectURL(file) };
          renderBatchSlots();
          updateBatchStatus();
        }
      });
    });

    updateBatchStatus();
  }

  async function confirmBatchPicker() {
    const entries = Object.entries(batchSlotImages);
    if (!entries.length) return;

    batchPickerConfirmBtn.disabled = true;
    batchPickerConfirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải...';

    try {
      let updated = 0;
      for (const [caseId, imgData] of entries) {
        const caseItem = worklist.find((c) => c.case_id === caseId);
        if (!caseItem) continue;

        // Upload to server
        const formData = new FormData();
        formData.append("file", imgData.file);

        const res = await fetch("/api/simulator/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error(`Upload failed for case ${caseId}`);
        const data = await res.json();

        // Update case with server URL
        caseItem.preview_image_url = data.url;
        caseItem.representative_image_url = data.url;
        caseItem.slice_image_urls = [data.url];
        caseItem.image_filenames = [data.filename];
        caseItem.slice_count = 1;
        caseItem._customImageCount = 1;

        updated += 1;
      }

      if (selectedCase && batchSlotImages[selectedCase.case_id]) {
        applyCaseSelection(selectedCase);
      }

      addLog("Đã thay thế ảnh hàng loạt", `${updated} ca bệnh đã được lưu ảnh lên máy chủ`);

      batchSlotImages = {};
      batchPickerOverlay.classList.remove("open");
      document.body.style.overflow = "";
    } catch (error) {
      console.error("Batch upload error:", error);
      alert("Lỗi khi tải ảnh hàng loạt lên máy chủ: " + error.message);
    } finally {
      batchPickerConfirmBtn.disabled = false;
      batchPickerConfirmBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Áp dụng tất cả';
    }
  }

  // Batch Picker event listeners
  batchPickBtn.addEventListener("click", openBatchPicker);
  batchPickerCloseBtn.addEventListener("click", cancelBatchPicker);
  batchPickerCancelBtn.addEventListener("click", cancelBatchPicker);
  batchPickerConfirmBtn.addEventListener("click", confirmBatchPicker);
  batchPickerOverlay.addEventListener("click", (e) => {
    if (e.target === batchPickerOverlay) cancelBatchPicker();
  });

  // "Chọn tất cả cùng lúc" — distribute files to slots in order
  batchAllInput.addEventListener("change", () => {
    const files = Array.from(batchAllInput.files);
    const caseIds = worklist.map((c) => c.case_id);
    files.forEach((file, idx) => {
      if (idx >= caseIds.length) return;
      const cid = caseIds[idx];
      if (batchSlotImages[cid]) URL.revokeObjectURL(batchSlotImages[cid].objectUrl);
      batchSlotImages[cid] = { file, objectUrl: URL.createObjectURL(file) };
    });
    batchAllInput.value = "";
    renderBatchSlots();
  });

  connectSocket();
  loadCases();
})();
