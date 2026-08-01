# NJDict — bản Android (Capacitor)

App Android dùng chung dữ liệu và đồng bộ Google Drive với extension "NJDict" trên máy tính. Gồm: tra từ (API Mazii), tab Hán tự offline (10.383 chữ, âm Hán Việt theo bảng 2136), sổ tay + sổ con, chế độ học SRS, phát âm tiếng Nhật, và **nhắc học hằng ngày** ("Hôm nay có N từ đến hạn").

## Build APK (một lần cài môi trường, sau đó mỗi lần build ~1 phút)

**Cần cài trên máy tính (Windows):**
1. [Node.js LTS](https://nodejs.org) — cài mặc định.
2. [Android Studio](https://developer.android.com/studio) — cài mặc định (đã kèm SDK + JDK).

**Các bước (chạy trong thư mục này bằng Command Prompt / PowerShell):**
```bash
npm install
npx cap add android
npx cap sync android
npx cap open android
```
Android Studio mở ra → đợi Gradle sync xong (lần đầu hơi lâu) → menu **Build → Build App Bundle(s)/APK(s) → Build APK(s)** → bấm **locate** để lấy file `app-debug.apk`.

**Cài vào điện thoại:** chép file APK sang máy (hoặc gửi qua Zalo/Drive) → mở file → cho phép "Cài đặt từ nguồn không xác định" → Cài. 
Cách nhanh hơn nếu cắm cáp USB (bật Gỡ lỗi USB): `npx cap run android`.

## Dịch câu

Nhập/dán đoạn dài hơn 30 ký tự vào ô tra (hoặc bấm tab **Dịch**) → app dịch bằng Google Dịch qua Apps Script của bạn, có nút ＋ Lưu vào sổ tay. Cần đã cấu hình đồng bộ, và Apps Script phải là **bản mới có action `translate`**.

## Lưu kèm nguồn: Chia sẻ qua NJDict

Khi đọc báo/web trên điện thoại, muốn lưu một từ kèm **link trang gốc** (để sau này mở lại đúng chỗ như trên máy tính):

1. Bôi đen từ/câu trong trình duyệt.
2. Bấm **Chia sẻ (Share)** → chọn **Lưu vào NJDict**.
3. App tự mở ra, tra từ đó; bấm **＋ Lưu** là lưu kèm luôn địa chỉ trang.
4. Trong Sổ tay, mục đó có nút **🔗 Nguồn** — bấm để mở lại trang và nhảy tới đúng đoạn.

> Vì sao không dùng menu "Tra bằng NJDict" (bôi đen)? Cơ chế đó của Android **chỉ gửi chữ, không gửi link**, nên không lưu được nguồn. Bảng **Chia sẻ** mới kèm cả link. Vài app đọc báo riêng có thể chỉ gửi chữ trần — khi đó vẫn lưu bình thường nhưng không có nút Nguồn.

## Cập nhật bản có tính năng Chia sẻ (v1.8)

Bản này sửa cả phần **native** nên **không chỉ copy `www/`**. Chạy đủ:
```bash
npx cap sync android
node patch-android.js
cd android
gradlew assembleDebug
```
Rồi cài đè APK mới lên bản cũ — vì `appId` không đổi (`com.nhien.tramazii`) nên **không mất sổ tay/dữ liệu**. Không cần chạy lại `npx @capacitor/assets generate` (icon không đổi).

## Thiết lập lần đầu trên điện thoại
1. Mở app → tab **Sổ tay** → mục **☁ Đồng bộ Google Drive** → dán **URL Apps Script** + **token** (đúng bộ đang dùng trên máy tính) → **Lưu cấu hình** → **⇅ Đồng bộ ngay**. Toàn bộ sổ tay + sổ con + tiến độ học sẽ đổ về.
2. Mục **🔔 Nhắc học hằng ngày** → chọn giờ → **Bật nhắc nhở** (Android sẽ hỏi quyền thông báo — cho phép).

## Cập nhật app sau này
- Sửa file trong `www/` → chạy `npx cap sync android` → Build APK → cài đè lên bản cũ. **Dữ liệu sổ tay giữ nguyên** (miễn không gỡ app), và kể cả có mất thì Đồng bộ ngay là về đủ.
- Mỗi lần build bản mới, tăng `versionCode` trong `android/app/build.gradle` để Android nhận là bản cập nhật.
- Lưu ý: APK debug phải cùng máy build (cùng chữ ký) mới cài đè được; nếu build ở máy khác thì gỡ bản cũ trước (nhớ Đồng bộ trước khi gỡ).

## Ghi chú
- Thông báo được lên lịch trước cho 7 ngày với đúng số từ đến hạn từng ngày; app tự làm mới lịch mỗi lần bạn mở app, lưu từ, học xong hoặc đồng bộ.
- Nếu nút 🔊 im lặng: vào Cài đặt Android → Ngôn ngữ → Chuyển văn bản thành giọng nói → tải giọng tiếng Nhật.
- Dữ liệu và cơ chế đồng bộ tương thích 100% với extension (mới hơn thắng, xoá lan hai chiều).


## Nâng cấp từ bản "Tra Mazii" cũ (đổi tên + icon + menu bôi đen)

Vì lần này có thay đổi phần native, làm theo đúng thứ tự (trong thư mục dự án):
```bash
npx cap sync android
node patch-android.js
npx @capacitor/assets generate --android
cd android
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
gradlew assembleDebug
```
- `patch-android.js` tự làm 3 việc: cài MainActivity mới (nhận chữ từ menu bôi đen), thêm mục **"Tra bằng NJDict"** vào menu bôi đen của Android, đổi tên hiển thị thành NJDict.
- `@capacitor/assets` đổi icon launcher từ ảnh trong thư mục `assets/`.
- appId giữ nguyên `com.nhien.tramazii` nên APK mới **cài đè lên bản cũ, dữ liệu giữ nguyên** (build cùng máy).

## Tra từ menu bôi đen (mọi app)

Sau khi cài bản mới: bôi đen chữ Nhật trong bất kỳ app nào (Chrome, Kindle, Zalo…) → menu hiện Copy/Chia sẻ… bấm **⋮ / Thêm** nếu cần → chọn **"Tra bằng NJDict"** → app mở và tra ngay từ đó. App đang chạy sẵn thì kết quả hiện tức thì.
