# NJDict

Từ điển tra từ tiếng Nhật – Việt (âm Hán Việt, sổ tay, ôn tập SRS, đồng bộ Google Drive).
Repo này gộp **cả hai dự án** để quản lý và nâng cấp qua từng phiên bản.

## Cấu trúc

| Thư mục | Dự án | Phiên bản |
|---------|-------|-----------|
| [`extension/`](extension/) | Extension Chrome (máy tính) — tra từ khi bôi đen trên web/PDF | v4.1 |
| [`android/`](android/) | App Android (Capacitor) — tra từ, sổ tay, học SRS, tiến độ, thông báo | v2.0.1 |

Hai phần dùng chung dữ liệu kanji (`kanji-data.js`), hệ thiết kế (`ui.css`), bộ icon
(`icons.js`), phần theo dõi tiến độ (`tien-do.js`), và cùng cơ chế tra cứu API Mazii +
đồng bộ Google Apps Script.

## Có gì mới (v4.0 / v2.0.0)

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
