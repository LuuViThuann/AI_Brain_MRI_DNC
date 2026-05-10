# Lộ trình Triển khai: Hệ thống Mô phỏng Luồng Công việc MRI & AI (PACS/RIS Workflow)

Tài liệu này hướng dẫn xây dựng hệ thống mô phỏng quy trình chẩn đoán hình ảnh thực tế tại bệnh viện, từ khâu quét tại máy MRI cho đến khâu phân tích AI tại trạm làm việc của bác sĩ.

---

## 1. Kiến trúc Hệ thống (Medical Imaging Pipeline)

Hệ thống mô phỏng cấu trúc thực tế của một khoa Chẩn đoán hình ảnh:

### A. Website 1: MRI Modality Simulator (Máy quét MRI)
*   **Chức năng:** Giả lập thiết bị phát tín hiệu.
*   **Giao diện:** Màn hình điều khiển máy quét (Modality Control).
*   **Luồng dữ liệu:** 
    *   Chọn bệnh nhân từ danh sách chờ (Worklist).
    *   Bấm "Start Scan" -> Sinh ảnh MRI theo từng lát cắt (Slicing).
    *   Đóng gói Metadata giả lập DICOM (Tên, ID, Giao thức quét).
    *   Stream dữ liệu (từng ảnh một) sang AI Server.

### B. AI Backend Server (Trung tâm xử lý)
*   **Chức năng:** Tiếp nhận luồng dữ liệu (Streaming data).
*   **Xử lý:** 
    *   Tích lũy các lát cắt vào bộ nhớ đệm (Buffer).
    *   Chạy phân đoạn AI trên từng lát cắt hoặc toàn bộ khối (Volume).
    *   Tổng hợp kết quả cuối cùng.

### C. Website 2: Clinical Workstation (Hệ thống hiện tại)
*   **Chức năng:** Trạm hiển thị cho bác sĩ.
*   **Hiển thị:** 
    *   Tiến trình nhận ảnh thời gian thực.
    *   Dựng hình 3D ngay khi dữ liệu đổ về.
    *   Báo cáo chẩn đoán cuối cùng và XAI.

---

## 2. Bước 1: Thiết lập Simulator (The Modality)

Tạo file `frontend/mri_modality.html` với giao diện bảng điều khiển y tế (Dark mode, nhiều thông số kỹ thuật).

### Hiệu ứng sinh ảnh (Slice Generation)
Sử dụng một bộ ảnh có sẵn, gửi từng ảnh sau mỗi 500ms để mô phỏng tốc độ quét thực tế.

```javascript
// simulator.js
async function executeScan(patientId, imageFiles) {
    for (let i = 0; i < imageFiles.length; i++) {
        // Mô phỏng đóng gói DICOM
        const dicomHeader = {
            patientId: patientId,
            sliceIndex: i,
            totalSlices: imageFiles.length,
            modality: "MR",
            protocol: "T2-FLAIR"
        };
        
        // Gửi lát cắt sang Server/Trang chính
        sendSlice(imageFiles[i], dicomHeader);
        
        // Cập nhật UI mô phỏng
        updateProgress(i, imageFiles.length);
        
        await sleep(500); // Đợi 0.5s giữa các lát cắt
    }
}
```

---

## 3. Bước 2: Cơ chế truyền dữ liệu Real-time (WebSockets)

Để đạt được cảm giác "Real-time", thay vì dùng HTTP POST thông thường, ta nên dùng **WebSockets**.

1.  **Simulator:** Mở kết nối WS đến Backend.
2.  **Backend:** Nhận ảnh, xử lý và "phát sóng" (Broadcast) tiến trình sang Dashboard chính.
3.  **Dashboard:** Hiển thị thanh tiến trình: "Đang nhận lát cắt 15/120..."

---

## 4. Bước 3: Tích hợp Trực quan hóa 3D

Trên Website chính, mô hình não 3D có thể thay đổi trạng thái theo dữ liệu nhận được:
*   **Giai đoạn 1 (Receiving):** Mô hình não 3D hiển thị dạng khung dây (Wireframe) mờ.
*   **Giai đoạn 2 (Processing):** Hiệu ứng ánh sáng chạy quanh vùng nghi ngờ có u.
*   **Giai đoạn 3 (Final):** Hiển thị khối u đỏ rực và báo cáo đầy đủ.

---

## 5. Danh sách các đầu việc cần làm (Checklist)

### Backend (FastAPI)
- [ ] Thêm WebSocket Manager để quản lý kết nối giữa Simulator và Dashboard.
- [ ] Endpoint `/api/cases` trả về danh sách Patient Worklist.

### Simulator UI
- [ ] Thiết kế giao diện Terminal y tế.
- [ ] Logic "Cắt lát" ảnh (Slicing logic).
- [ ] Hiệu ứng âm thanh quét (MRI Beeping sounds).

### Dashboard UI (Website hiện tại)
- [ ] Thêm Modal/Panel "Live Acquisition" hiển thị ảnh đang đổ về.
- [ ] Tích hợp thanh tiến trình nhận dữ liệu y tế.

---
**Ghi chú từ Antigravity:** Hướng đi này sẽ biến dự án của bạn từ một công cụ chẩn đoán đơn thuần thành một **Hệ sinh thái Y tế thông minh**. Nó cho thấy sự hiểu biết sâu sắc về quy trình khám chữa bệnh thực tế.
