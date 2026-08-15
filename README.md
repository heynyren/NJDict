# NJDict

Từ điển tra từ tiếng Nhật – Việt (âm Hán Việt, sổ tay, ôn tập SRS, đồng bộ Google Drive).
Repo này gộp **cả hai dự án** để quản lý và nâng cấp qua từng phiên bản.

## Cấu trúc

| Thư mục | Dự án | Phiên bản |
|---------|-------|-----------|
| [`extension/`](extension/) | Extension Chrome (máy tính) — tra từ khi bôi đen trên web/PDF | v4.2 |
| [`android/`](android/) | App Android (Capacitor) — tra từ, sổ tay, học SRS, tiến độ, thông báo | v2.1.0 |

Hai phần dùng chung dữ liệu kanji (`kanji-data.js`), hệ thiết kế (`ui.css`), bộ icon
(`icons.js`), phần theo dõi tiến độ (`tien-do.js`), và cùng cơ chế tra cứu API Mazii +
đồng bộ Google Apps Script.

## Có gì mới (v4.3 / v2.2.0)

- **Theo dõi quá trình học & phần thưởng** — mục tiêu mỗi ngày, chuỗi ngày liên tiếp,
  lịch nhiệt 17 tuần và **24 huy hiệu**, cùng cơ chế với app Denken 3 Shuu. Xem
  `tien-do.js`. Tiến độ đồng bộ giữa máy tính và điện thoại qua Google Drive.
- **Sửa bản dịch & ghi chú** — mỗi mục trong sổ tay đều sửa lại được nghĩa cho đúng
  chuyên ngành, kèm một ô ghi chú riêng. Bản máy dịch ban đầu được giữ lại để khôi
  phục, và tra lại cùng một từ **không** làm mất công hiệu đính.
- **Giao diện làm lại toàn bộ** — hệ thiết kế riêng (`ui.css`), sáng/tối tự động theo
  máy, icon [Phosphor](https://phosphoricons.com) thay cho emoji.
- **Thao tác Android** — vuốt ngang đổi tab, nút Quay lại lùi từng bước, kéo xuống để
  làm mới. Xem `android/www/cham-vuot.js`.
- **Bôi đen là ra cả ba** — popup tại chỗ chạy đồng thời tra từ, đọc Hán tự và dịch cả
  câu, xếp vào ba tab; app không còn tự đoán bạn muốn tra từ hay dịch câu.
- **Hán tự ngang hàng từ vựng** — mỗi chữ lưu được vào sổ tay, vào sóng học tập, sửa
  nghĩa và ghi chú được; có chip lọc riêng để học chữ thành buổi riêng. Xem
  `extension/han-tu.js`.
- **Sửa nghĩa ngay trong popup** — thấy máy dịch sai ngữ cảnh thì chữa tại chỗ, không
  phải mở Sổ tay tìm lại. Sửa được cả nghĩa Mazii trả về, nghĩa Hán tự lẫn bản dịch
  câu; sửa là lưu luôn, và ô ghi chú nằm ngay cạnh. Bản Android mở thẳng bảng sửa
  quen thuộc từ thẻ kết quả.
- **Xoá rồi vẫn giữ bản dịch của bạn** — xoá một mục vì đã thuộc thì nó biến khỏi sổ
  tay và khỏi sóng ôn tập thật, nhưng nghĩa bạn đã hiệu đính và ghi chú thì ở lại.
  Vài tháng sau quên mà tra lại, popup hiện đúng bản bạn từng chốt chứ không gọi máy
  dịch lại từ đầu. Xem `extension/muc.js`.
- **Lời thoại YouTube** — đang xem video thì bảng lời thoại nằm ngay cột phải: tự sáng
  dòng đang nói, bấm dòng nào tua tới đó, bôi đen chữ nào ra đúng popup ba tab quen
  thuộc, có chế độ song ngữ và ô tìm trong lời thoại. Phụ đề tự sinh cắt vụn theo hơi
  thở được **ghép lại thành câu** trước khi dịch hay lưu. Mục lưu về sổ tay mang theo
  cả video lẫn **mốc giây**, nên "Nghe lại" là nhảy đúng chỗ người ta đang nói câu đó —
  chắc hơn hẳn cách dò lại một đoạn trên trang web. Xem `extension/phu-de.js`.
  Có **ba đường lấy phụ đề** vì YouTube đang siết dần đường `timedtext` (từ chối
  bằng cách trả 200 kèm thân rỗng): hỏi trình phát trong trang, fetch cùng nguồn,
  và cuối cùng là đọc lại bảng bản chép lời của chính YouTube.
  Đang phát thì **mẩu đang được nói tự sáng lên** ngay trong câu — phụ đề tự sinh
  có mốc theo từng từ nên tô được tới từng chữ. Bản dịch sáng theo **câu**, không
  tô tới từng từ: máy dịch cả câu nên không có căn cứ nào nói từ Việt nào ứng với
  từ Nhật nào, tô theo tỉ lệ thời gian chỉ là bịa ra sự tương ứng.

## Quy trình phát triển / nâng cấp

1. Sửa code trong `extension/` hoặc `android/`.
2. `git add -A && git commit -m "mô tả thay đổi" && git push`.
3. Khi phát hành bản mới:
   - Cập nhật `version` trong `extension/manifest.json` hoặc `android/package.json`.
   - Gắn tag: `git tag extension/vX.Y` hoặc `git tag android/vX.Y.Z` rồi `git push --tags`.
4. Dùng branch để thử tính năng mới, merge vào `main` khi ổn định.

## Lưu ý

- Repo để **private** vì dùng API Mazii.
- Thư mục extension đang chạy trực tiếp trong Chrome nằm ở máy (`F:\setupfiles\njdict`); đây là **bản quản lý phiên bản** — khi cần cập nhật bản đang chạy thì copy file từ `extension/` sang.
- Không commit: `node_modules/`, thư mục build Android, keystore/secrets (đã cấu hình trong `.gitignore`).

## Bộ icon

Giao diện dùng [Phosphor Icons](https://phosphoricons.com) v2.1.1 (giấy phép MIT,
© 2023 Phosphor Icons). Các đường vẽ SVG cần dùng được trích sẵn vào `icons.js`
của từng phần — extension Chrome không nạp được tài nguyên từ mạng, còn app
Android thì phải chạy được khi mất mạng.
