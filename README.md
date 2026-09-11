# Trình tải truyện WordPress

Biến một trang mục lục truyện trên WordPress thành file **EPUB** hoặc **PDF**.
Toàn bộ xử lý chạy trong trình duyệt (Vue 3 + TypeScript + Tailwind).

## Chạy tại máy

```bash
npm install
npm run dev
```

Mở http://localhost:5173.

## Cách dùng

1. **Tìm chương** — dán URL trang mục lục. App quét mọi liên kết bài viết trong
   trang (lọc bỏ liên kết vỏ ngoài: chuyên mục, tác giả, chia sẻ…), không bắt
   buộc liên kết phải chứa từ khoá, nên trang chỉ đánh số `1, 2, 3…` vẫn quét
   đủ.
2. **Tải chương** — chọn chương rồi bấm tải. Chương lỗi tải lại được riêng.
   Nếu truyện có chương bị khoá mật khẩu, điền mật khẩu vào ô _Mật khẩu chương
   bị khoá_ ở bước 1 để app mở khoá và tải nội dung bình thường. Mỗi chương có
   thể dùng một mật khẩu khác nhau: nhập nhiều mật khẩu cách nhau bằng dấu `|`
   (ví dụ `abc | def | ghi`) thì mỗi chương bị khoá sẽ được thử lần lượt từng
   mật khẩu cho tới khi mở được. Bỏ trống thì chương bị khoá sẽ xuất ra liên
   kết tới trang gốc thay vì nội dung.
3. **Xuất** — tải xuống bản EPUB hoặc PDF.

## Vì sao cần proxy?

WordPress không gửi header CORS nên trình duyệt không gọi thẳng được. Endpoint
`GET /api/fetch?url=…` chuyển tiếp yêu cầu: chạy trên server Vite khi phát triển
local và là serverless function khi deploy. Nó chỉ nhận scheme `http(s)` và chặn
các host nội bộ/loopback. Để mở khoá chương bị bảo vệ, proxy nhận thêm `POST`
tới `wp-login.php?action=postpass` (chỉ riêng form mật khẩu của WordPress) và trả
về cookie phiên qua header `x-set-cookie`. Mật khẩu và cookie chỉ đi qua proxy
của bạn, không lưu trữ lâu dài.

## Triển khai lên Vercel

Import repo vào Vercel (hoặc `npx vercel`), không cần biến môi trường. Lưu ý:

- Proxy trở thành **công khai** — bật _Deployment Protection_ nếu cần.
- Mỗi chương là một lần gọi function (tính hạn mức plan Hobby).
- Response serverless giới hạn 4,5 MB; ảnh quá lớn bị bỏ qua, không làm hỏng file.

## Xuất file

Cả hai bản mở đầu bằng nội dung trang mục lục làm giới thiệu.

- **EPUB 3** — bìa tự tạo, mục lục, ảnh tải về nhúng sẵn để đọc offline
  (bỏ ảnh bằng tuỳ chọn _Bỏ hình ảnh_).
- **PDF** — trang tiêu đề, mục lục bấm được kèm số trang, khổ A4/A5/Letter, font
  Noto Sans nhúng sẵn (tiếng Việt hiển thị đúng, chữ chọn được). Không vẽ ảnh —
  truyện có tranh nên dùng bản EPUB.

## Cấu trúc thư mục

| Đường dẫn               | Vai trò                                              |
| ----------------------- | ---------------------------------------------------- |
| `api/fetch.ts`          | Endpoint chuyển tiếp CORS (Vercel + local)           |
| `server/proxy.ts`       | Gắn endpoint vào server Vite dev/preview             |
| `src/composables/`      | Trạng thái ứng dụng (scraper, theme)                 |
| `src/lib/parser.ts`     | Trích xuất nội dung, nhận diện chương, làm sạch HTML |
| `src/lib/fetcher.ts`    | Gọi proxy, thử lại với backoff                       |
| `src/lib/epub/`, `pdf/` | Đóng gói EPUB 3 / dựng PDF                           |
| `src/lib/types.ts`      | Kiểu dùng chung giữa các module                      |
| `src/components/`       | Giao diện (danh sách chương, log, theme…)            |

## Code style

Format bằng Prettier: `npm run format` để tự sửa, `npm run format:check` để kiểm tra.
