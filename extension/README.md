# NJDict

Tiện ích Chrome / Edge giúp **bôi đen một từ tiếng Nhật trên trang web hoặc file PDF rồi tra nghĩa ngay** — hiện nghĩa trong popup, không phải rời trang.

> A small Chrome/Edge extension for Vietnamese learners of Japanese: select a word on any web page or PDF and instantly look it up in the Mazii dictionary.

> **Nguồn dữ liệu:** phần nghĩa từ vựng lấy từ [Mazii](https://mazii.net); phần Hán tự dùng dữ liệu offline (xem mục nguồn ở cuối). NJDict là dự án cộng đồng, **không liên kết chính thức với Mazii**.

---

## Tính năng

- **Trên web:** bôi đen từ → popup hiện **ngay tại con trỏ**, tự tra và hiện nghĩa + âm Hán Việt; bấm chuột ra ngoài là tắt. Bật/tắt trong Sổ tay → ⚙ Cài đặt tra nhanh (có tuỳ chọn chỉ hiện khi giữ Ctrl).
- **Trên PDF:** bôi đen → `Ctrl + C` → phím tắt → popup tự dán và hiện nghĩa.
- **Phím tắt** mở popup (mặc định `Ctrl + Shift + Z`).
- **Chuột phải** → *Tra "…" trên Mazii (popup)* — bật cửa sổ popup nhỏ hiện nghĩa, không nhảy tab (dùng được cả trong trình xem PDF).
- Đổi hướng **Nhật → Việt / Việt → Nhật** ngay trong popup.
- Mọi lượt tra dùng chung một tab/popup, không mở lung tung.
- **Sổ tay riêng:** bấm **＋ Lưu** để cất từ vào sổ tay trong máy; mở **📒 Sổ tay** để xem lại, lọc, và **xuất ra Anki (TSV) / CSV** để ôn tập.
- **Sổ con phân loại:** tạo/đổi tên/xoá sổ con (theo bài), chuyển từ giữa các sổ; xuất Anki/CSV theo từng sổ; sổ con cũng đồng bộ Google Drive.
- **Chế độ học (sóng học tập / SRS):** nút 🎓 Học ôn các từ đến hạn theo chu kỳ giãn dần 1→3→7→14→30→60→120 ngày; Nhớ thì lên mức, Quên thì học lại từ đầu. Có phím tắt Space (hiện nghĩa), 1 (Quên), 2 (Nhớ). Nút 🔊 phát âm tiếng Nhật ở popup, sổ tay và thẻ học.
- **Xoá nhanh khi học:** trong thẻ học có nút 🗑 xoá ngay từ đã thuộc hẳn (phím `0` hoặc `Delete`), kèm ↩ Hoàn tác nếu bấm nhầm.
- **Truy nguồn + tô sáng:** mỗi từ/câu lưu từ một trang web sẽ nhớ luôn địa chỉ trang đó. Trong Sổ tay bấm **🔗 Nguồn** để mở lại đúng trang và **tự cuộn tới, tô sáng** ngay vị trí bạn đã lưu (nhấp nháy vài giây rồi tự bỏ). Từ tra tay hoặc từ PDF không có nút này.
- **Bộ nhớ đệm:** từ đã tra được lưu lại (1.000 từ, 30 ngày) — tra lại tức thì, không gọi lại máy chủ Mazii, dùng được cả khi mất mạng.
- **Dịch câu:** bôi đen đoạn dài (hoặc dán vào ô tra) → popup tự chuyển sang **Dịch**, dùng Google Dịch qua chính Apps Script của bạn; bấm ＋ Lưu để cất bản dịch vào sổ tay. Miễn phí, không cần API key.

## Cài đặt (từ mã nguồn)

1. Tải mã nguồn: nút **Code → Download ZIP**, rồi giải nén (hoặc `git clone`).
2. Mở `chrome://extensions` (Chrome) hoặc `edge://extensions` (Edge).
3. Bật **Developer mode**.
4. Bấm **Load unpacked** và chọn thư mục chứa `manifest.json`.
5. (Tùy chọn) Vào `chrome://extensions/shortcuts` để đặt/đổi phím tắt.

Với PDF mở từ máy (`file:///…`): mở **Details** của tiện ích và bật **Allow access to file URLs**.

## Cách dùng

| Tình huống | Thao tác |
|---|---|
| Trang web | Bôi đen từ → bấm nút ⚡, hoặc bấm phím tắt |
| File PDF | Bôi đen → `Ctrl + C` → bấm phím tắt |
| Mọi lúc | Bôi đen → chuột phải → *Tra "…" trên Mazii (popup)* |

## Ghi chú kỹ thuật

- Trình xem PDF của trình duyệt chạy tách biệt nên tiện ích **không đọc trực tiếp** được vùng bôi đen trong PDF; đó là lý do PDF cần `Ctrl + C` trước.
- Popup lấy dữ liệu qua **API nội bộ (không chính thức) của Mazii**. Nếu Mazii đổi cấu trúc, phần hiện nghĩa có thể cần cập nhật; luôn có nút **Mở đầy đủ trên Mazii** làm phương án dự phòng.

## Miễn trừ

Đây là dự án cộng đồng, **không liên kết chính thức với Mazii**. "Mazii" là thương hiệu của đơn vị phát triển Mazii. Dữ liệu từ điển thuộc về Mazii; tiện ích này chỉ hỗ trợ tra cứu nhanh. Vui lòng tôn trọng điều khoản sử dụng của Mazii.

## Giấy phép

Mã nguồn phát hành theo giấy phép [MIT](LICENSE).


## Nguồn dữ liệu Hán tự (tab Hán tự)

Âm Hán Việt và nghĩa của 2136 Kanji thường dụng (Jōyō) ưu tiên theo bảng "2136 Kanji thông dụng" phổ biến trong cộng đồng học tiếng Nhật Việt Nam. Các chữ ngoài bảng này dùng dữ liệu tổng hợp từ **KanjiDictVN** (https://github.com/trungnt2910/KanjiDictVN), vốn dựa trên từ điển **KANJIDIC** (EDRDG, giấy phép CC BY-SA) và dữ liệu **Từ điển Hán Nôm** (https://hvdic.thivien.net). Âm On/Kun (Nhật) và mức JLPT lấy từ KANJIDIC. Xin tôn trọng giấy phép của các nguồn này khi phân phối lại.


## Đồng bộ Google Drive (không mất khi nâng cấp / đổi máy)

Sổ tay lưu trong `chrome.storage` nên **nâng cấp bằng cách giải nén đè lên cùng thư mục rồi reload thì không mất dữ liệu**. Để chắc chắn hơn và dùng được trên nhiều máy/trình duyệt:

1. Mở `sync-google-apps-script.gs`, làm theo hướng dẫn trong file: tạo project trên https://script.google.com, đặt một `TOKEN` bí mật, Deploy dạng **Web app** (Execute as: Me, Who has access: Anyone), lấy **Web app URL** (…/exec).
2. Mở trang **Sổ tay** của extension → mục **☁ Đồng bộ Google Drive** → dán URL + TOKEN → **Lưu cấu hình** → **⇅ Đồng bộ ngay**.
3. Ở máy/trình duyệt khác: cài extension, dán lại cùng URL + TOKEN, bấm Đồng bộ ngay là kéo được danh sách về.

Extension **không bao giờ thấy mật khẩu Google của bạn** — chỉ giữ URL Web App và token do bạn tự đặt. Đồng bộ là hai chiều (mục mới hơn thắng); xoá một từ ở máy này cũng lan sang máy khác. Ngoài ra trang Sổ tay có **Sao lưu (.json)** / **Nạp (.json)** để cầm tay phòng hờ.
