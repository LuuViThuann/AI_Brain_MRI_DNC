# Hướng Dẫn Chi Tiết & Kịch Bản Kiểm Tra: Thông Số Kỹ Thuật MRI

Tài liệu này giải thích sâu về từng thông số kỹ thuật trong trình mô phỏng MRI và cách chúng tác động trực tiếp đến kết quả hiển thị tại Website chính (Clinical Workstation).

---

## 1. Giải Thích Chi Tiết Từng Thông Số

### 1.1. Giao thức (Protocol)
*   **Chi tiết:** Đây là "chế độ chụp". Mỗi chế độ sẽ làm nổi bật một loại mô khác nhau.
*   **Ví dụ kết quả:**
    *   **T2-FLAIR:** Dịch não tủy sẽ có màu đen, nhưng vùng **phù nề (edema)** quanh khối u sẽ sáng trắng lên.
    *   **T1-POST:** Dùng sau khi tiêm thuốc tương phản. Khối u thường sẽ **ngấm thuốc** và hiện rõ ranh giới hơn so với nhu mô não thường.
    *   **DWI-ADC:** Dùng để đánh giá độ hạn chế khuếch tán của nước, giúp phân biệt u lành tính và u ác tính (u ác tính thường hạn chế khuếch tán mạnh).

### 1.2. Thời gian lặp TR & Thời gian dội TE (ms)
*   **Chi tiết:** Là các hằng số vật lý của từ trường.
*   **Ý nghĩa kiểm tra:**
    *   Nếu bạn chọn Protocol là **T2**, TR phải lớn (thường > 2000ms).
    *   Nếu bạn chọn Protocol là **T1**, TR phải ngắn (thường < 800ms).
*   **Ví dụ kết quả:** Trên Dashboard chính, các chỉ số này xuất hiện ở góc ảnh hoặc bảng thông số ca bệnh. Bác sĩ dựa vào đây để xác nhận ảnh có được chụp đúng chuẩn kỹ thuật hay không.

### 1.3. Độ dày lát cắt (Slice Thickness - mm)
*   **Chi tiết:** Khoảng cách giữa các "lớp" não được chụp.
*   **Ví dụ kết quả:**
    *   **Độ dày 1mm:** Mô hình 3D trên Dashboard sẽ rất mịn, các đường cong của não mượt mà. AI tính toán thể tích khối u sẽ có độ sai số cực thấp (ví dụ: 12.45 cm³).
    *   **Độ dày 5mm:** Mô hình 3D trông sẽ "bậc thang" hơn (răng cưa). AI tính toán thể tích sẽ có sai số lớn hơn (ví dụ: 13.1 cm³).

### 1.4. Tâm cửa sổ (Window Center) & Độ rộng cửa sổ (Window Width)
*   **Chi tiết:** Điều chỉnh cách chuyển đổi dữ liệu thô sang hình ảnh trắng đen.
*   **Ví dụ kết quả:**
    *   **Center 180 / Width 760 (Chuẩn):** Ảnh hài hòa, nhìn rõ cả xương sọ và nhu mô não.
    *   **Center 400 (Tăng độ sáng):** Ảnh sẽ bị cháy trắng, chỉ nhìn rõ các vùng rất tối.
    *   **Width 100 (Hẹp):** Ảnh sẽ có độ tương phản cực cao (chỉ có đen và trắng rõ rệt), giúp nhìn rõ các cấu trúc mạch máu hoặc vôi hóa.

---

## 2. Kịch Bản Kiểm Tra Thực Tế (Use Case Examples)

Dưới đây là 2 kịch bản bạn nên thử nghiệm để thấy sự khác biệt rõ rệt:

### Kịch bản A: Chụp tầm soát phù nề (Edema Detection)
1.  **Trang mô phỏng:** 
    *   Chọn Protocol: `T2-FLAIR`.
    *   TR: `4800`, TE: `120`.
    *   Slice Thickness: `4.5`.
2.  **Nhấn "Bắt đầu quét".**
3.  **Kết quả trên Website chính:**
    *   Tab thông tin hiện: "Giao thức: T2-FLAIR".
    *   Hình ảnh lát cắt hiện ra với vùng xung quanh khối u có màu sáng trắng rõ rệt.
    *   AI tự động kích hoạt chế độ "Vùng phù nề" (nếu có tính năng này).

### Kịch bản B: Chụp độ phân giải cao để dựng 3D (High-Res 3D)
1.  **Trang mô phỏng:**
    *   Chọn Protocol: `T1-POST`.
    *   Slice Thickness: `1.0` (Thấp nhất có thể).
    *   Slice Interval: `300` (Gửi ảnh nhanh).
2.  **Nhấn "Bắt đầu quét".**
3.  **Kết quả trên Website chính:**
    *   Ảnh đổ về liên tục với tốc độ cao.
    *   Khi quét xong 100%, mô hình 3D hiện ra với độ chi tiết rất cao, không bị hiện tượng "lớp tầng" (bậc thang).
    *   Vị trí tọa độ khối u (X, Y, Z) được xác định cực kỳ chính xác trên bản đồ giải phẫu.

---

## 3. Bảng Đối Chiếu Kết Quả (Checklist)

| Bạn làm gì trên Simulator? | Bạn phải thấy gì trên Website chính? | Trạng thái |
| :--- | :--- | :--- |
| Đổi Giao thức sang `SWI-HEMO` | Chữ `SWI-HEMO` xuất hiện ngay lập tức trên Header Dashboard. | [ ] |
| Chỉnh `TR` lên `6000` | Bảng thông số kỹ thuật (Technical Info) cập nhật `TR: 6000 ms`. | [ ] |
| Bật "Phát âm thanh beep" | Loa máy tính phát tiếng bíp mỗi khi 1 ảnh mới hiện lên Dashboard. | [ ] |
| Chỉnh `Window Width` cực thấp | Ảnh trên Dashboard chuyển sang dạng tương phản cao (đen/trắng gắt). | [ ] |
| Nhấn nút "Dừng lại" giữa chừng | Dashboard hiện thông báo: "Cảnh báo: Phân tích bị ngắt quãng do thiết bị dừng". | [ ] |

---
