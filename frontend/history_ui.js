/**
 * history_ui.js — Diagnostic History Panel
 * ==========================================
 * Handles:
 *  • Fetching paginated history from GET /api/history
 *  • Rendering history cards in #historyPanel
 *  • Detail modal — restores full diagnostic state into the main UI
 *  • Delete single / clear all
 *  • Patient name & notes editing
 */

(function () {
  "use strict";

  const API_BASE = "";
  const PER_PAGE = 8;

  // ── State ──────────────────────────────────────────────────────────────────
  let currentPage = 1;
  let totalPages = 1;
  let cachedItems = [];
  let activeDetail = null;      // currently open detail record

  // ── DOM refs (assigned after DOMContentLoaded) ────────────────────────────
  let panel, listEl, pagerEl, emptyEl, loadingEl, detailModal;

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API  (called by app.js tab switcher)
  // ══════════════════════════════════════════════════════════════════════════
  window.HistoryUI = {
    /** Called when user clicks the "Lịch Sử" tab */
    open() {
      if (!panel) return;
      panel.style.display = "flex";
      // Force reflow
      panel.offsetHeight;
      panel.classList.add("active");

      // Load only if empty or explicitly needed
      if (cachedItems.length === 0) {
        loadPage(1);
      }
    },
    /** Called when user leaves the tab */
    close() {
      if (!panel) return;
      panel.classList.remove("active");
      // Delay display:none to allow transition to finish
      setTimeout(() => {
        if (!panel.classList.contains("active")) {
          panel.style.display = "none";
        }
      }, 400);
    },
    /** Called by diagnosis.js after a successful diagnosis to refresh count */
    onNewDiagnosis() {
      // If history tab is visible, reload page 1
      if (panel && panel.classList.contains("active")) {
        loadPage(1);
      } else {
        // Just clear cache to force reload next time opened
        cachedItems = [];
      }
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener("DOMContentLoaded", () => {
    buildPanelDOM();
    buildDetailModalDOM();
    attachNavListener();
  });

  function attachNavListener() {
    // Piggyback on the existing pill nav — wait until app.js has set up tabs
    document.querySelectorAll(".pill[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.tab === "history") {
          window.HistoryUI.open();
        } else {
          window.HistoryUI.close();
        }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DOM CONSTRUCTION
  // ══════════════════════════════════════════════════════════════════════════
  function buildPanelDOM() {
    panel = document.getElementById("historyPanel");
    if (!panel) return;

    panel.style.display = "none";

    panel.innerHTML = `
      <!-- Toolbar -->
      <div id="historyToolbar" style="
        width: 100%; background: var(--bg-panel); border-bottom: 1px solid var(--border);
        flex-shrink: 0;">
        <div style="max-width: 1400px; margin: 0 auto; padding: 0 24px; height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 18px; font-weight: 600; color: var(--cyan); letter-spacing: -0.5px;">
              <i class="fa-solid fa-clock-rotate-left" style="margin-right: 8px;"></i> Lịch Sử Chẩn Đoán
            </span>
            <span id="historyCount" style="
              font-size: 11px; font-weight: 700;
              padding: 3px 10px; border-radius: 12px;
              background: rgba(0, 151, 180, 0.12); color: var(--cyan);
              border: 1px solid rgba(0, 151, 180, 0.3);">
              0 ca
            </span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div style="position: relative;">
              <input id="historySearch" type="text" placeholder="Tìm kiếm..." style="
                height: 32px; padding: 0 12px 0 32px; border-radius: 8px;
                border: 1px solid var(--border); background: var(--bg-card);
                color: var(--text-primary); font-size: 12px; outline: none;
                width: 180px; transition: all 0.2s;">
              <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
                font-size: 12px; color: var(--text-dim);"><i class="fa-solid fa-magnifying-glass"></i></span>
            </div>
            <button id="btnClearHistory" style="
              height: 32px; padding: 0 14px; border-radius: 8px;
              border: 1px solid rgba(255, 82, 82, 0.35); background: rgba(255, 82, 82, 0.08);
              color: #ff7070; font-size: 12px; font-weight: 600; cursor: pointer;
              transition: all 0.2s;">
              <i class="fa-solid fa-trash-can" style="margin-right: 5px;"></i> Xóa Tất Cả
            </button>
          </div>
        </div>
      </div>

      <div style="flex: 1; overflow-y: auto; width: 100%;">
        <div style="max-width: 1400px; margin: 0 auto; width: 100%; min-height: 100%; display: flex; flex-direction: column;">
          
          <!-- Empty state -->
          <div id="historyEmpty" style="
            display: none; flex: 1; flex-direction: column;
            align-items: center; justify-content: center; gap: 16px;
            color: var(--text-dim); padding: 60px 0;">
            <div style="font-size: 60px; opacity: 0.25;"><i class="fa-solid fa-microscope"></i></div>
            <p style="font-size: 15px; font-weight: 600;">Chưa có lịch sử chẩn đoán</p>
            <p style="font-size: 12px; opacity: 0.7;">Chạy chẩn đoán MRI để bắt đầu lưu lịch sử.</p>
          </div>

          <!-- Loading -->
          <div id="historyLoading" style="
            display: none; flex: 1; align-items: center; justify-content: center;
            flex-direction: column; gap: 14px; color: var(--text-dim); padding: 60px 0;">
            <div style="
              width: 36px; height: 36px; border-radius: 50%;
              border: 3px solid var(--border); border-top-color: var(--cyan);
              animation: spin 0.8s linear infinite;"></div>
            <span style="font-size: 13px;">Đang tải lịch sử...</span>
          </div>

          <div id="historyList" style="
            padding: 20px 24px 60px 24px;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 16px; align-content: start;">
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div id="historyPager" style="
        display: none; width: 100%; background: var(--bg-panel); border-top: 1px solid var(--border);
        flex-shrink: 0;">
        <div style="max-width: 1400px; margin: 0 auto; padding: 12px 24px; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <!-- Content will be injected -->
        </div>
      </div>
    `;

    listEl = panel.querySelector("#historyList");
    pagerEl = panel.querySelector("#historyPager");
    emptyEl = panel.querySelector("#historyEmpty");
    loadingEl = panel.querySelector("#historyLoading");

    // Events
    panel.querySelector("#btnClearHistory").addEventListener("click", confirmClearAll);
    panel.querySelector("#historySearch").addEventListener("input", debounce(onSearch, 350));
  }

  function buildDetailModalDOM() {
    detailModal = document.createElement("div");
    detailModal.id = "historyDetailModal";
    detailModal.style.cssText = `
      display:none; position:fixed; inset:0; z-index:200;
      align-items:center; justify-content:center;
      background:rgba(0,0,0,0.7); backdrop-filter:blur(6px);`;
    detailModal.innerHTML = `
      <div style="
        background:var(--bg-panel); border:1px solid var(--border);
        border-radius:14px; width:780px; max-width:95vw; max-height:88vh;
        overflow-y:auto; box-shadow:0 24px 64px rgba(0,0,0,0.4);
        position:relative;">
        <!-- Modal header -->
        <div style="
          display:flex;align-items:center;justify-content:space-between;
          padding:18px 24px 14px; border-bottom:1px solid var(--border);
          position:sticky;top:0;background:var(--bg-panel);z-index:5;">
          <div>
            <div id="modalTitle" style="font-size:17px;font-weight:800;color:var(--text-primary);">Chi Tiết Chẩn Đoán</div>
            <div id="modalSubtitle" style="font-size:11px;color:var(--text-dim);margin-top:2px;font-family:var(--font-mono);"></div>
          </div>
          <div style="display:flex;gap:8px;">
            <button id="btnRestoreCase" style="
              padding:8px 16px;border-radius:8px;border:1px solid var(--cyan);
              background:var(--cyan-glow);color:var(--cyan);font-size:12px;font-weight:700;
              cursor:pointer;transition:all 0.2s;">
              <i class="fa-solid fa-arrow-rotate-left" style="margin-right:6px;"></i> Khôi Phục xem lại ca Này
            </button>
            <button id="btnCloseDetail" style="
              width:32px;height:32px;border-radius:8px;border:1px solid var(--border);
              background:var(--bg-card);color:var(--text-sec);font-size:18px;
              cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <!-- Modal body -->
        <div id="modalBody" style="padding:24px;"></div>
      </div>`;
    document.body.appendChild(detailModal);

    detailModal.querySelector("#btnCloseDetail").addEventListener("click", closeDetail);
    detailModal.addEventListener("click", (e) => { if (e.target === detailModal) closeDetail(); });
    detailModal.querySelector("#btnRestoreCase").addEventListener("click", restoreCase);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ══════════════════════════════════════════════════════════════════════════
  async function loadPage(page, search = "") {
    if (!panel) return;
    currentPage = page;

    setLoading(true);

    try {
      const params = new URLSearchParams({ page, per_page: PER_PAGE });
      if (search) params.append("search", search);

      const res = await fetch(`${API_BASE}/api/history?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      cachedItems = data.items || [];
      totalPages = data.pages || 1;

      panel.querySelector("#historyCount").textContent = `${data.total} ca`;
      renderList(cachedItems);
      renderPager(data.total);
    } catch (err) {
      console.error("History fetch error:", err);
      showError("Không thể tải lịch sử. Kiểm tra kết nối server.");
    } finally {
      setLoading(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  function renderList(items) {
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!items || items.length === 0) {
      emptyEl.style.display = "flex";
      listEl.style.display = "none";
      pagerEl.style.display = "none";
      return;
    }

    emptyEl.style.display = "none";
    listEl.style.display = "grid";
    // Smoothly show items
    listEl.style.opacity = "0";
    listEl.offsetHeight; // force reflow
    listEl.style.transition = "opacity 0.3s ease";
    listEl.style.opacity = "1";

    items.forEach((item, idx) => {
      const card = buildCard(item, idx);
      listEl.appendChild(card);
    });
  }

  function buildCard(item, idx) {
    const card = document.createElement("div");
    card.className = "history-card";
    card.style.cssText = `
      display:flex; flex-direction:column; min-height:380px;
      background:var(--bg-panel); border:1px solid var(--border);
      border-radius:12px; cursor:pointer;
      transition:all 0.22s; box-shadow:0 2px 8px rgba(0,0,0,0.07);
      animation: historyCardIn 0.3s ease both;
      animation-delay: ${idx * 30}ms;`;

    const detected = item.tumor_detected;
    const conf = Math.round((item.confidence || 0) * 100);
    const area = (item.tumor_area_pct || 0).toFixed(2);
    const severity = item.severity || "—";
    const ts = item.timestamp ? new Date(item.timestamp).toLocaleString("vi-VN") : "—";
    const fname = item.image_filename || "unknown.png";
    const patName = item.patient_name || "";
    const loc_vn = translateLocation(item.location_hint || "—");

    const severityColor = {
      high: "#ff5252",
      medium: "#ff9800",
      low: "#00c853",
    }[severity?.toLowerCase()] || "var(--text-dim)";

    const thumbHTML = item.image_base64
      ? `<img src="${item.image_base64}" style="width:100%;height:100%;object-fit:contain;background:#000;" alt="MRI">`
      : `<div style="display:flex;align-items:center;justify-content:center;height:100%;
           font-size:32px;color:var(--text-dim);opacity:0.3;"><i class="fa-solid fa-brain"></i></div>`;

    card.innerHTML = `
      <!-- Thumbnail -->
      <div style="height:180px;background:#000;position:relative;overflow:hidden;border-bottom:1px solid var(--border);">
        ${thumbHTML}
        <!-- Detected badge -->
        <div style="
          position:absolute;top:8px;left:8px;
          padding:3px 9px;border-radius:10px;font-size:10px;font-weight:700;
          background:${detected ? "rgba(255,0,64,0.85)" : "rgba(0,200,83,0.85)"};
          color:#fff;backdrop-filter:blur(4px);">
          ${detected ? '<i class="fa-solid fa-circle-exclamation" style="margin-right:4px;"></i> Phát hiện u' : '<i class="fa-solid fa-circle-check" style="margin-right:4px;"></i> Không có u'}
        </div>
        <!-- Confidence pill -->
        <div style="
          position:absolute;top:8px;right:8px;
          padding:3px 9px;border-radius:10px;font-size:10px;font-weight:700;
          background:rgba(0,0,0,0.6);color:var(--cyan);
          backdrop-filter:blur(4px);border:1px solid rgba(0,151,180,0.4);">
          ${conf}%
        </div>
      </div>

      <!-- Card body -->
      <div style="padding:16px 16px 20px 16px; display:flex; flex-direction:column; flex:1;">
        <div style="display:flex;align-items:start;justify-content:space-between;margin-bottom:10px;">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;"
              title="${fname}">${fname}</div>
            ${patName ? `<div style="font-size:11px;color:var(--cyan);margin-top:2px;"><i class="fa-solid fa-user-doctor" style="margin-right:4px;"></i> ${patName}</div>` : ""}
          </div>
          <div style="
            font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
            padding:2px 8px;border-radius:8px;
            color:${severityColor};
            background:${severityColor}22;
            border:1px solid ${severityColor}44;">
            ${severity}
          </div>
        </div>

        <!-- Mini stats row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          <div style="background:var(--bg-card);border-radius:6px;padding:8px;border:1px solid var(--border);">
            <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.7px;">Diện Tích</div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${area}%</div>
          </div>
          <div style="background:var(--bg-card);border-radius:6px;padding:8px;border:1px solid var(--border);">
            <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.7px;">Vị Trí</div>
            <div style="font-size:12px;font-weight:600;color:var(--text-primary);
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              title="${loc_vn}">${loc_vn}</div>
          </div>
        </div>

        <!-- Timestamp + actions -->
        <div style="display:flex;align-items:center;justify-content:space-between; margin-top:auto; padding-top:10px; border-top:1px solid rgba(255,255,255,0.03);">
          <div style="font-size:10px;color:var(--text-dim);font-family:var(--font-mono);"><i class="fa-solid fa-clock" style="margin-right:4px;"></i> ${ts}</div>
          <div style="display:flex;gap:6px;">
            <button class="card-btn-detail" data-id="${item.id}" style="
              height:28px;padding:0 12px;border-radius:6px;font-size:12px;font-weight:600;
              border:1px solid var(--cyan);background:var(--cyan-glow);color:var(--cyan);
              cursor:pointer;transition:all 0.15s;">Chi Tiết</button>
            <button class="card-btn-delete" data-id="${item.id}" style="
              height:28px;width:28px;border-radius:6px;font-size:14px;
              border:1px solid rgba(255,82,82,0.35);background:rgba(255,82,82,0.08);
              color:#ff7070;cursor:pointer;transition:all 0.15s;"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </div>`;

    // Hover effect
    card.addEventListener("mouseenter", () => {
      card.style.borderColor = "var(--cyan-dim)";
      card.style.boxShadow = "0 4px 20px rgba(0,151,180,0.15)";
      card.style.transform = "translateY(-2px)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.borderColor = "var(--border)";
      card.style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)";
      card.style.transform = "";
    });

    card.querySelector(".card-btn-detail").addEventListener("click", (e) => {
      e.stopPropagation();
      openDetail(item.id);
    });
    card.querySelector(".card-btn-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteRecord(item.id, card);
    });
    card.addEventListener("click", () => openDetail(item.id));

    return card;
  }

  function renderPager() {
    if (!pagerEl) return;
    if (totalPages < 1) {
      pagerEl.style.display = "none";
      return;
    }

    pagerEl.style.display = "block";
    // We target the inner container with max-width 1400px
    const innerContainer = pagerEl.querySelector("div");
    if (!innerContainer) return;
    innerContainer.innerHTML = "";

    const makeBtn = (label, page, disabled = false, active = false) => {
      const isNum = !isNaN(label);
      const btn = document.createElement("button");
      btn.innerHTML = label;
      btn.disabled = disabled;
      
      btn.style.cssText = `
        min-width: 36px; height: 36px; padding: ${isNum ? '0' : '0 12px'}; 
        background: ${active ? 'var(--cyan)' : 'var(--bg-card)'}; 
        border: 1px solid ${active ? 'var(--cyan)' : 'var(--border)'}; 
        border-radius: 8px; cursor: ${disabled || active ? 'default' : 'pointer'};
        color: ${active ? '#ffffff' : (disabled ? 'var(--text-dim)' : 'var(--text-sec)')}; 
        font-weight: 700; font-size: 13px; transition: all 0.2s;
        display: flex; align-items: center; justify-content: center;
        box-shadow: ${active ? '0 4px 12px rgba(0, 151, 180, 0.2)' : 'none'};
      `;

      if (!disabled && !active) {
        btn.onmouseover = () => { 
          btn.style.borderColor = 'var(--cyan)'; 
          btn.style.color = 'var(--cyan)'; 
          btn.style.background = 'var(--cyan-glow)'; 
        };
        btn.onmouseout = () => { 
          btn.style.borderColor = 'var(--border)'; 
          btn.style.color = 'var(--text-sec)'; 
          btn.style.background = 'var(--bg-card)'; 
        };
        btn.onclick = () => {
          loadPage(page, searchTerm);
          // Scroll list to top
          const scrollContainer = panel.querySelector("div[style*='overflow-y: auto']");
          if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        };
      }
      return btn;
    };

    // Previous
    innerContainer.appendChild(makeBtn('<i class="fa-solid fa-chevron-left"></i>', currentPage - 1, currentPage === 1));

    // Page logic - Show all buttons if totalPages is small
    if (totalPages <= 8) {
      for (let i = 1; i <= totalPages; i++) {
        innerContainer.appendChild(makeBtn(i.toString(), i, false, currentPage === i));
      }
    } else {
      const delta = 2;
      const range = [];
      for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
        range.push(i);
      }

      if (currentPage - delta > 2) {
        innerContainer.appendChild(makeBtn('1', 1, false, currentPage === 1));
        const dots = document.createElement("span");
        dots.textContent = "...";
        dots.style.cssText = "color: var(--text-dim); padding: 0 4px; font-weight: 600;";
        innerContainer.appendChild(dots);
      } else {
        const limit = range.length > 0 ? range[0] : totalPages + 1;
        for (let i = 1; i < limit; i++) {
          innerContainer.appendChild(makeBtn(i.toString(), i, false, currentPage === i));
        }
      }

      range.forEach(i => {
        innerContainer.appendChild(makeBtn(i.toString(), i, false, currentPage === i));
      });

      if (currentPage + delta < totalPages - 1) {
        const dots = document.createElement("span");
        dots.textContent = "...";
        dots.style.cssText = "color: var(--text-dim); padding: 0 4px; font-weight: 600;";
        innerContainer.appendChild(dots);
        innerContainer.appendChild(makeBtn(totalPages.toString(), totalPages, false, currentPage === totalPages));
      } else {
        const start = range.length > 0 ? range[range.length - 1] + 1 : (currentPage > 1 ? currentPage + 1 : 2);
        for (let i = start; i <= totalPages; i++) {
          innerContainer.appendChild(makeBtn(i.toString(), i, false, currentPage === i));
        }
      }
    }

    // Next
    innerContainer.appendChild(makeBtn('<i class="fa-solid fa-chevron-right"></i>', currentPage + 1, currentPage === totalPages));
  }


  // ══════════════════════════════════════════════════════════════════════════
  // DETAIL MODAL
  // ══════════════════════════════════════════════════════════════════════════
  async function openDetail(id) {
    detailModal.style.display = "flex";
    detailModal.querySelector("#modalBody").innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;padding:40px;
        flex-direction:column;gap:14px;color:var(--text-dim);">
        <div style="width:32px;height:32px;border-radius:50%;
          border:3px solid var(--border);border-top-color:var(--cyan);
          animation:spin 0.8s linear infinite;"></div>
        <span>Đang tải chi tiết...</span>
      </div>`;

    try {
      const res = await fetch(`${API_BASE}/api/history/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      activeDetail = await res.json();
      renderDetailBody(activeDetail);
    } catch (err) {
      detailModal.querySelector("#modalBody").innerHTML =
        `<p style="color:#ff7070;padding:24px;">Lỗi tải chi tiết: ${err.message}</p>`;
    }
  }

  function renderDetailBody(rec) {
    const modal = detailModal;
    const ts = rec.timestamp ? new Date(rec.timestamp).toLocaleString("vi-VN") : "—";
    const report = rec.report_data || {};
    const pred = rec.prediction_data || {};
    const xai = rec.xai_data || {};
    const rules = xai.rule_based || {};

    modal.querySelector("#modalTitle").textContent = rec.image_filename || "Chi Tiết";
    modal.querySelector("#modalSubtitle").textContent = `ID: ${rec.id} • ${ts}`;

    const findings = Array.isArray(report.findings) ? report.findings : [report.findings].filter(Boolean);
    const recs = Array.isArray(report.recommendations) ? report.recommendations : [];

    modal.querySelector("#modalBody").innerHTML = `
      <div style="display:grid;grid-template-columns:200px 1fr;gap:20px;">

        <!-- Left: Thumbnail + quick stats -->
        <div>
          <div style="border-radius:10px;overflow:hidden;background:#000;
            border:1px solid var(--border);margin-bottom:12px;">
            ${rec.image_base64
        ? `<img src="${rec.image_base64}" style="width:100%;display:block;" alt="MRI">`
        : `<div style="height:160px;display:flex;align-items:center;justify-content:center;
                  font-size:40px;opacity:0.2;"><i class="fa-solid fa-brain"></i></div>`}
          </div>

          <!-- Confidence bar -->
          <div style="background:var(--bg-card);border-radius:8px;padding:12px;
            border:1px solid var(--border);margin-bottom:10px;">
            <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;
              letter-spacing:0.8px;margin-bottom:6px;">Độ Tin Cậy</div>
            <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${Math.round((rec.confidence || 0) * 100)}%;
                background:linear-gradient(90deg,var(--cyan),var(--green));
                border-radius:3px;"></div>
            </div>
            <div style="text-align:right;font-size:14px;font-weight:800;color:var(--cyan);
              margin-top:4px;font-family:var(--font-mono);">
              ${Math.round((rec.confidence || 0) * 100)}%
            </div>
          </div>

          <!-- Stats list -->
          ${statItem("Trạng Thái", rec.tumor_detected ? '<i class="fa-solid fa-circle-exclamation" style="margin-right:4px;color:#ff5252;"></i> Phát hiện u' : '<i class="fa-solid fa-circle-check" style="margin-right:4px;color:#00c853;"></i> Không có u',
          rec.tumor_detected ? "#ff5252" : "#00c853")}
          ${statItem("Diện Tích", `${(rec.tumor_area_pct || 0).toFixed(2)}%`)}
          ${statItem("Vị Trí", translateLocation(rec.location_hint || "—"))}
          ${statItem("Mức Độ", (rec.severity || "—").toUpperCase().replace("HIGH", "CAO").replace("MEDIUM", "TRUNG BÌNH").replace("LOW", "THẤP"))}
          ${statItem("Xử Lý", `${(rec.processing_time || 0).toFixed(2)}s`)}
          ${rules.risk_level ? statItem("Mức độ rủi ro", rules.risk_level.replace("High", "Cao").replace("Medium", "Trung bình").replace("Low", "Thấp"), rules.risk_level === "High" ? "#ff5252" : rules.risk_level === "Low" ? "#00c853" : "#ff9800") : ""}

          <!-- Notes editor -->
          <div style="margin-top:12px;">
            <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;
              letter-spacing:0.8px;margin-bottom:6px;">Ghi Chú Lâm Sàng</div>
            <textarea id="modalNotes" rows="3" style="
              width:100%;padding:8px;border-radius:6px;
              border:1px solid var(--border);background:var(--bg-card);
              color:var(--text-primary);font-size:11px;resize:vertical;outline:none;
              font-family:var(--font-main);">${rec.notes || ""}</textarea>
            <input id="modalPatientName" type="text" placeholder="Tên bệnh nhân (tuỳ chọn)"
              value="${rec.patient_name || ""}" style="
              width:100%;margin-top:6px;padding:6px 10px;border-radius:6px;
              border:1px solid var(--border);background:var(--bg-card);
              color:var(--text-primary);font-size:11px;outline:none;">
            <button id="btnSaveNotes" data-id="${rec.id}" style="
              margin-top:8px;width:100%;height:30px;border-radius:6px;
              border:1px solid var(--cyan);background:var(--cyan-glow);
              color:var(--cyan);font-size:11px;font-weight:700;cursor:pointer;">
              <i class="fa-solid fa-floppy-disk" style="margin-right:6px;"></i> Lưu Ghi Chú
            </button>
          </div>
        </div>

        <!-- Right: Report -->
        <div style="display:flex;flex-direction:column;gap:14px;">

          <!-- AI Summary -->
          <div style="background:var(--bg-card);border-radius:10px;padding:14px;
            border:1px solid var(--border);">
            <div style="font-size:11px;color:var(--cyan);text-transform:uppercase;
              letter-spacing:1px;font-weight:600;margin-bottom:8px;
              padding-bottom:6px;border-bottom:1px solid var(--border);">Tóm Tắt AI</div>
            <p style="font-size:13px;color:var(--text-sec);line-height:1.7;">
              ${report.summary || "—"}
            </p>
          </div>

          <!-- Findings -->
          ${findings.length ? `
          <div style="background:var(--bg-card);border-radius:10px;padding:14px;
            border:1px solid var(--border);">
            <div style="font-size:11px;color:var(--cyan);text-transform:uppercase;
              letter-spacing:1px;font-weight:600;margin-bottom:8px;
              padding-bottom:6px;border-bottom:1px solid var(--border);">Phát Hiện</div>
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;">
              ${findings.map(f => {
            const cleanF = f.replace(/^[•\-\*\d\.\s]+/, '').trim();
            return `
                  <li style="padding:4px 0 4px 22px;position:relative;font-size:12.5px;
                    color:var(--text-sec);line-height:1.6;">
                    <span style="position:absolute;left:4px;top:6px;color:var(--cyan);font-weight:700;"><i class="fa-solid fa-chevron-right" style="font-size:10px;"></i></span>
                    ${cleanF}
                  </li>`;
          }).join("")}
            </ul>
          </div>` : ""}

          <!-- Recommendations -->
          ${recs.length ? `
          <div style="background:var(--bg-card);border-radius:10px;padding:14px;
            border:1px solid var(--border);">
            <div style="font-size:11px;color:var(--cyan);text-transform:uppercase;
              letter-spacing:1px;font-weight:600;margin-bottom:8px;
              padding-bottom:6px;border-bottom:1px solid var(--border);">Khuyến Nghị</div>
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;">
              ${recs.map(r => {
            const cleanR = r.replace(/^[•\-\*\d\.\s\>→]+/, '').trim();
            return `
                  <li style="padding:4px 0 4px 22px;position:relative;font-size:12.5px;
                    color:var(--text-sec);line-height:1.6;">
                    <span style="position:absolute;left:4px;top:6px;color:var(--green);font-weight:700;"><i class="fa-solid fa-check"></i></span>
                    ${cleanR}
                  </li>`;
          }).join("")}
            </ul>
          </div>` : ""}

          <!-- XAI Summary -->
          ${xai.combined_insights && xai.combined_insights.length ? `
          <div style="background:var(--bg-card);border-radius:10px;padding:14px;
            border:1px solid var(--border);">
            <div style="font-size:11px;color:var(--cyan);text-transform:uppercase;
              letter-spacing:1px;font-weight:600;margin-bottom:8px;
              padding-bottom:6px;border-bottom:1px solid var(--border);">Thông tin chi tiết XAI</div>
            ${xai.combined_insights.map(ins => `
              <div style="font-size:12px;color:var(--text-sec);padding:4px 0;">${translateInsight(ins)}</div>
            `).join("")}
          </div>` : ""}

          <!-- Delete button -->
          <button id="btnDeleteFromDetail" data-id="${rec.id}" style="
            height:36px;border-radius:8px;border:1px solid rgba(255,82,82,0.35);
            background:rgba(255,82,82,0.08);color:#ff7070;font-size:12px;font-weight:600;
            cursor:pointer;transition:all 0.2s;margin-top:auto;">
            <i class="fa-solid fa-trash" style="margin-right:6px;"></i> Xóa Ca Này Khỏi Lịch Sử
          </button>
        </div>
      </div>`;

    // Events on modal body
    modal.querySelector("#btnSaveNotes").addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      const notes = modal.querySelector("#modalNotes").value;
      const name = modal.querySelector("#modalPatientName").value;
      await saveNotes(id, name, notes);
    });

    modal.querySelector("#btnDeleteFromDetail").addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      if (!confirm("Xóa ca chẩn đoán này khỏi lịch sử?")) return;
      await deleteRecord(id, null, true);
      closeDetail();
      loadPage(currentPage);
    });
  }

  function statItem(label, value, color = "var(--text-primary)") {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <span style="color:var(--text-dim);">${label}</span>
        <span style="font-weight:600;color:${color};">${value}</span>
      </div>`;
  }

  function closeDetail() {
    detailModal.style.display = "none";
    activeDetail = null;
  }

  /**
   * Translates English insights (from older records) to Vietnamese for display
   */
  function translateInsight(text) {
    if (!text) return "";

    const mapping = {
      "Confidence: CNN shows high confidence in identified tumor region": "Độ tin cậy: CNN cho thấy độ tin cậy cao đối với vùng u được xác định",
      "Warning: CNN attention is diffuse - prediction may be uncertain": "Cảnh báo: Sự tập trung của CNN bị phân tán - dự đoán có thể không chắc chắn",
      "Location: Frontal lobe location may affect motor functions": "Vị trí: Vị trí thùy trán có thể ảnh hưởng đến chức năng vận động",
      "Location: Temporal lobe location may affect memory/language": "Vị trí: Vị trí thùy thái dương có thể ảnh hưởng đến trí nhớ/ngôn ngữ",
      "Most important feature:": "Đặc trưng quan trọng nhất:",
      "tumor_area": "diện tích khối u",
      "circularity": "độ tròn",
      "solidity": "độ đặc",
      "perimeter": "chu vi",
      "mean_intensity": "cường độ trung bình",
      "importance:": "độ quan trọng:",
      "Risk: High risk classification:": "Rủi ro: Phân loại rủi ro CAO:",
      "tumor detected": "khối u được phát hiện",
      "Info: Low risk classification: Small tumor": "Thông tin: Phân loại rủi ro THẤP: Khối u nhỏ",
      "Very large tumor detected": "<i class=\"fa-solid fa-triangle-exclamation\" style=\"color:#f59e0b; margin-right:4px;\"></i> Phát hiện khối u rất lớn",
      "Extensive brain involvement": "<i class=\"fa-solid fa-triangle-exclamation\" style=\"color:#f59e0b; margin-right:4px;\"></i> Sự xâm lấn não diện rộng",
      "Frontal lobe involvement": "<i class=\"fa-solid fa-triangle-exclamation\" style=\"color:#f59e0b; margin-right:4px;\"></i> Liên quan thùy trán",
      "Temporal lobe involvement": "<i class=\"fa-solid fa-triangle-exclamation\" style=\"color:#f59e0b; margin-right:4px;\"></i> Liên quan thùy thái dương",
      "Highly irregular shape detected": "<i class=\"fa-solid fa-triangle-exclamation\" style=\"color:#f59e0b; margin-right:4px;\"></i> Phát hiện hình dạng rất không đều",
      "Irregular boundaries suggest infiltrative growth": "<i class=\"fa-solid fa-triangle-exclamation\" style=\"color:#f59e0b; margin-right:4px;\"></i> Ranh giới không đều gợi ý sự phát triển xâm lấn"
    };

    let translated = text;
    for (const [en, vi] of Object.entries(mapping)) {
      if (translated.includes(en)) {
        translated = translated.replace(en, vi);
      }
    }

    // Cleanup if legacy "Feature:" prefix exists
    if (translated.startsWith("Feature: ")) {
      translated = translated.replace("Feature: ", "Đặc trưng: ");
    }
    if (translated.startsWith("Risk: ")) {
      translated = translated.replace("Risk: ", "Rủi ro: ");
    }
    if (translated.startsWith("Info: ")) {
      translated = translated.replace("Info: ", "Thông tin: ");
    }
    if (translated.startsWith("Location: ")) {
      translated = translated.replace("Location: ", "Vị trí: ");
    }

    return translated;
  }

  /**
   * Translates English brain regions to Vietnamese
   */
  function translateLocation(loc) {
    if (!loc || loc === "—" || loc === "unknown") return loc;

    return loc.toLowerCase()
      .replace("middle", "giữa")
      .replace("left", "trái")
      .replace("right", "phải")
      .replace("frontal lobe", "thùy trán")
      .replace("temporal lobe", "thùy thái dương")
      .replace("parietal lobe", "thùy đỉnh")
      .replace("occipital lobe", "thùy chẩm")
      .replace("superior", "phía trên")
      .replace("inferior", "phía dưới")
      .replace("central", "trung tâm")
      .replace("posterior", "phía sau")
      .replace("anterior", "phía trước");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESTORE CASE INTO MAIN UI
  // ══════════════════════════════════════════════════════════════════════════ 
  function restoreCase() {
    if (!activeDetail) return;

    const rec = activeDetail;
    console.log('[History] Restoring case:', rec.id);

    // 1. Normalize data structure to match what app.js expects from /diagnose API
    const normalizedRec = {
      prediction: rec.prediction_data,
      report: rec.report_data,
      mask: rec.mask_data,
      multiclass_mask: rec.prediction_data?.multiclass_mask,
      multiclass_stats: rec.prediction_data?.multiclass_stats,
      xai: rec.xai_data,
      detailed_metrics: rec.xai_data?.rule_based?.detailed_metrics,
      depth_metrics: rec.xai_data?.rule_based?.depth_metrics,
      image_base64: rec.image_base64,
      history_id: rec.id
    };

    // 2. Update Global and Local States in App
    if (window.App && window.App.syncRestoredData) {
      window.App.syncRestoredData(normalizedRec);
    } else {
      window.lastDiagnosisData = normalizedRec;
      if (normalizedRec.xai) {
        window.lastXAIData = normalizedRec.xai;
      }
    }

    // 3. Switch to brain3d tab
    document.querySelector('.pill[data-tab="brain3d"]')?.click();
    closeDetail();
    window.HistoryUI.close();

    // 4. Give tab switch time to render, then populate
    setTimeout(() => {
      // Use main App functions to restore full state 
      if (window.App && window.App.displayReport) {
        console.log('[History] Calling displayReport');
        window.App.displayReport(normalizedRec);
      }

      if (window.App && window.App.update3DBrain) {
        console.log('[History] Calling update3DBrain');
        window.App.update3DBrain(normalizedRec);
      }

      // Draw mask overlay on preview canvas
      if (normalizedRec.mask && window.drawMaskOnCanvas) {
        window.drawMaskOnCanvas(normalizedRec.mask);
      }

      // Restore image to preview canvas if available
      if (rec.image_base64) {
        const canvas = document.getElementById('previewCanvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const img = new Image();
          img.onload = () => {
            canvas.width = 256;
            canvas.height = 256;
            ctx.clearRect(0, 0, 256, 256);
            ctx.drawImage(img, 0, 0, 256, 256);

            // Show preview elements
            const previewWrap = document.getElementById('previewWrap');
            const reportPlaceholder = document.getElementById('reportPlaceholder');
            const reportContent = document.getElementById('reportContent');

            if (previewWrap) previewWrap.style.display = 'block';
            if (reportPlaceholder) reportPlaceholder.style.display = 'none';
            if (reportContent) reportContent.style.display = 'block';

            // IMPORTANT: Redraw mask after image is loaded to ensure it's on top
            if (normalizedRec.mask && window.drawMaskOnCanvas) {
              window.drawMaskOnCanvas(normalizedRec.mask);
            }
          };
          img.src = rec.image_base64;
        }
      }

      // 5. Force refresh other tab contents if they exist (Data already synced via globals)
      if (window.XAISimilarUI && window.XAISimilarUI.renderXAIDashboard && normalizedRec.xai) {
        console.log('[History] Pre-rendering XAI Dashboard in background');
        window.XAISimilarUI.renderXAIDashboard(normalizedRec.xai);
        // Hide panel immediately to stay on Brain 3D
        const xaiPanel = document.getElementById('xaiPanel');
        if (xaiPanel) xaiPanel.style.display = 'none';
      }

      if (window.Atlas4PanelViewer && window.Atlas4PanelViewer.loadDiagnosis) {
        window.Atlas4PanelViewer.loadDiagnosis(normalizedRec);
      }

      // 6. Unlock Detail Analysis button in 3D viewer  
      if (window.Brain3DUIControls && window.Brain3DUIControls.onDiagnosisReady) {
        window.Brain3DUIControls.onDiagnosisReady();
      }

      // 7. NEW: Sync "Chạy Chẩn Đoán" button state and fetch Similar Cases for full sync
      if (rec.image_base64) {
        fetch(rec.image_base64)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], "restored_mri.png", { type: "image/png" });
            window._lastUploadedBlob = file; // Sync with app.js

            // Re-fetch similar cases to populate the "Compare" button and badge
            if (window.XAISimilarUI && window.XAISimilarUI.fetchSimilarCases) {
              console.log('[History] Re-fetching similar cases for full synchronization...');
              window.XAISimilarUI.fetchSimilarCases(file).then(similarData => {
                window.lastSimilarData = similarData;
                // Update the compare button badge via App internal helper if exposed or manually
                const btnCompare = document.getElementById('btnCompare');
                const badge = document.getElementById('compareBadge');
                if (btnCompare && similarData.similar_cases) {
                  const count = similarData.similar_cases.length;
                  btnCompare.style.display = 'flex';
                  if (badge) {
                    badge.textContent = count;
                    badge.style.display = 'block';
                  }
                  // Sync global for 3D viewer
                  window._similarCasesData = similarData.similar_cases;


                  const similarPanel = document.getElementById('similarPanel');
                  if (similarPanel) similarPanel.style.display = 'none';
                }
              }).catch(err => console.warn('[History] Similar cases fetch failed:', err));
            }
          });
      }

      console.log('[History] Case restoration complete (Full Sync)');
    }, 300);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CRUD ACTIONS
  // ══════════════════════════════════════════════════════════════════════════
  async function deleteRecord(id, cardEl, skipConfirm = false) {
    if (!skipConfirm && !confirm("Xóa ca chẩn đoán này?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/history/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (cardEl) {
        cardEl.style.opacity = "0";
        cardEl.style.transform = "scale(0.9)";
        cardEl.style.transition = "all 0.25s";
        setTimeout(() => { cardEl.remove(); checkEmpty(); }, 260);
      } else {
        loadPage(currentPage);
      }
      showToast("<i class=\"fa-solid fa-trash-can\"></i> Đã xóa ca chẩn đoán.");
    } catch (err) {
      showToast("<i class=\"fa-solid fa-circle-xmark\"></i> Lỗi xóa: " + err.message, true);
    }
  }

  async function confirmClearAll() {
    const total = parseInt(panel.querySelector("#historyCount").textContent) || 0;
    if (total === 0) return;
    if (!confirm(`Xóa tất cả ${total} ca chẩn đoán? Không thể hoàn tác!`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/history`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("<i class=\"fa-solid fa-trash-can\"></i> Đã xóa tất cả lịch sử.");
      loadPage(1);
    } catch (err) {
      showToast("<i class=\"fa-solid fa-circle-xmark\"></i> Lỗi: " + err.message, true);
    }
  }

  async function saveNotes(id, patientName, notes) {
    try {
      const res = await fetch(`${API_BASE}/api/history/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_name: patientName, notes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("<i class=\"fa-solid fa-floppy-disk\"></i> Đã lưu ghi chú.");
    } catch (err) {
      showToast("<i class=\"fa-solid fa-circle-xmark\"></i> Lỗi lưu: " + err.message, true);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEARCH
  // ══════════════════════════════════════════════════════════════════════════
  let searchTerm = "";
  function onSearch(e) {
    searchTerm = e.target.value.trim();
    loadPage(1, searchTerm);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UI STATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  function setLoading(on) {
    if (!loadingEl || !listEl) return;
    loadingEl.style.display = on ? "flex" : "none";
    // Don't hide listEl immediately to avoid blinking if data is cached
    if (on && listEl.children.length === 0) {
      listEl.style.display = "none";
    }
  }

  function checkEmpty() {
    if (listEl && listEl.children.length === 0) {
      emptyEl.style.display = "flex";
      listEl.style.display = "none";
    }
  }

  function showError(msg) {
    if (!listEl) return;
    listEl.style.display = "flex";
    listEl.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:#ff7070;font-size:13px;">
        ⚠ ${msg}
      </div>`;
  }

  let toastTimer;
  function showToast(msg, isError = false) {
    let toast = document.getElementById("historyToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "historyToast";
      toast.style.cssText = `
        position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;
        z-index:9999;opacity:0;transition:opacity 0.25s;pointer-events:none;
        box-shadow:0 4px 16px rgba(0,0,0,0.3);`;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = isError ? "rgba(255,82,82,0.92)" : "rgba(10,14,26,0.92)";
    toast.style.color = isError ? "#fff" : "var(--cyan)";
    toast.style.border = `1px solid ${isError ? "#ff5252" : "var(--cyan-dim)"}`;
    toast.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = "0"; }, 2800);
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INJECT KEYFRAME ANIMATIONS
  // ══════════════════════════════════════════════════════════════════════════
  const style = document.createElement("style");
  style.textContent = `
    @keyframes historyCardIn {
      from { opacity:0; transform:translateY(12px); }
      to   { opacity:1; transform:translateY(0); }
    }
    #historySearch:focus {
      border-color:var(--cyan); box-shadow:0 0 0 2px rgba(0,151,180,0.15);
    }
    .card-btn-detail:hover { background:var(--cyan)!important; color:#fff!important; }
    .card-btn-delete:hover { background:rgba(255,82,82,0.25)!important; }
  `;
  document.head.appendChild(style);
})();