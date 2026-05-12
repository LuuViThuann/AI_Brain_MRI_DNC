# Cơ chế Lựa chọn Ảnh đại diện (Representative Image Logic)

Tài liệu này giải thích cách hệ thống NeuroScan AI tự động chọn ra một lát cắt duy nhất làm "Ảnh chìa khóa" từ một bộ dữ liệu MRI gồm nhiều lát cắt.

## 1. Định nghĩa Ảnh đại diện
Trong một ca chụp MRI não, hệ thống thu nhận hàng chục lát cắt (slices). Tuy nhiên, trên giao diện quản lý (Dashboard) và báo cáo sơ bộ, chúng ta cần một **Ảnh đại diện duy nhất** để:
- Làm ảnh thu nhỏ (Thumbnail) trong danh sách hồ sơ.
- Làm lát cắt mặc định hiển thị khi vừa mở kết quả chẩn đoán.
- Là ảnh chính được gửi vào thuật toán AI để xác định nhanh các thông số ban đầu.

## 2. Thuật toán Lựa chọn: "Lát cắt Trung tâm" (Middle Slice)

Hệ thống hiện đang sử dụng thuật toán **Trung vị vị trí** để chọn ảnh.

### Công thức:
Nếu gọi $N$ là tổng số lát cắt trong một ca bệnh, vị trí của ảnh đại diện ($I_{rep}$) được tính bằng:

$$I_{rep} = \lfloor \frac{N}{2} \rfloor$$

*(Trong đó $\lfloor \rfloor$ là phép chia lấy phần nguyên)*

### Ví dụ thực tế:
- **Trường hợp 12 lát cắt**: Ảnh đại diện sẽ là ảnh thứ **6**.
- **Trường hợp 30 lát cắt**: Ảnh đại diện sẽ là ảnh thứ **15**.
- **Trường hợp 1 lát cắt**: Ảnh đó chính là ảnh đại diện.

## 3. Tại sao chọn Lát cắt ở giữa?

Việc chọn ảnh ở giữa không phải là ngẫu nhiên, mà dựa trên đặc điểm giải phẫu học và kỹ thuật chụp MRI:
1.  **Vùng chứa não lớn nhất**: Các lát cắt đầu tiên (đỉnh đầu) và cuối cùng (vòm sọ dưới/cổ) thường chứa nhiều xương sọ và ít mô não. Các lát cắt ở giữa thường đi qua các vùng đồi thị, não thất - nơi khối u có khả năng lộ diện rõ ràng nhất.
2.  **Độ tin cậy của AI**: Thuật toán AI thường có độ chính xác cao nhất ở các lát cắt trung tâm vì cấu trúc não ở đây đầy đủ và ít bị nhiễu do hiệu ứng rìa (edge effects).
3.  **Thói quen lâm sàng**: Các bác sĩ chẩn đoán hình ảnh thường bắt đầu quan sát từ các lát cắt trung tâm để có cái nhìn tổng thể về tổn thương trước khi xem chi tiết các lát cắt rìa.

## 4. Cách thay đổi Ảnh đại diện theo ý muốn

Hệ thống cho phép người vận hành (Operator) chủ động quyết định ảnh nào sẽ là ảnh đại diện thông qua tính năng **Custom Image Picker**:

### Quy trình điều khiển:
1.  Mở bảng chọn ảnh tùy chỉnh (nút 📸).
2.  **Thứ tự tải lên chính là thứ tự lát cắt**: Ảnh bạn chọn đầu tiên sẽ là ảnh 1, ảnh cuối là ảnh N.
3.  **Mẹo**: Để một ảnh cụ thể làm ảnh đại diện, hãy đảm bảo ảnh đó nằm ở **vị trí giữa** trong danh sách các ảnh bạn chọn/kéo thả vào.

## 5. Tương lai: Chọn ảnh dựa trên Trọng số AI (AI-Driven Selection)
Trong các phiên bản nâng cấp tiếp theo, thuật toán sẽ không chỉ lấy ảnh ở giữa, mà sẽ:
- AI quét qua tất cả $N$ ảnh.
- Tìm ảnh nào có "Vùng nghi ngờ khối u" lớn nhất.
- Tự động đẩy ảnh đó lên làm Ảnh đại diện, bất kể nó nằm ở vị trí nào trong chuỗi.

---

