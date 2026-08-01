# NJDict

Từ điển tra từ tiếng Nhật – Việt (âm Hán Việt, sổ tay, ôn tập SRS, đồng bộ Google Drive).
Repo này gộp **cả hai dự án** để quản lý và nâng cấp qua từng phiên bản.

## Cấu trúc

| Thư mục | Dự án | Phiên bản |
|---------|-------|-----------|
| [`extension/`](extension/) | Extension Chrome (máy tính) — tra từ khi bôi đen trên web/PDF | v2.9 |
| [`android/`](android/) | App Android (Capacitor) — tra từ, sổ tay, học SRS, thông báo | v1.0.0 |

Hai phần dùng chung dữ liệu kanji (`kanji-data.js`) và cùng cơ chế tra cứu API Mazii + đồng bộ Google Apps Script.

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
