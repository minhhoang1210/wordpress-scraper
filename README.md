# WordPress Story Scraper

Biến trang mục lục truyện trên WordPress thành file **EPUB** hoặc **PDF** tải được.

Vue 3 + TypeScript + Tailwind. Toàn bộ xử lý chạy trong trình duyệt.

## Chạy tại máy

```bash
npm install
npm run dev
```

Mở http://localhost:5173.

## Cách hoạt động

1. **Dán URL trang mục lục** — ví dụ một truyện WordPress bất kỳ.
2. **Tìm chương** — app quét trang, lấy mọi liên kết chứa từ khoá
   `chuong`, `chap`, `chapter`, `phien-ngoai`, `ngoai-truyen`, `vi-thanh`
   (không phân biệt dấu tiếng Việt, nên _Chương 12_ và `chuong-12` đều khớp).
3. **Tải từng chương** — giới hạn số yêu cầu song song; trích xuất và làm sạch
   phần `<article>` (bỏ bình luận, widget chia sẻ, script, điều hướng…).
   Chương lỗi có thể tải lại riêng mà không cần làm lại cả truyện.
4. **Tải xuống** — đóng gói thành EPUB 3 hoặc PDF ngay trên máy.

## Vì sao cần proxy?

WordPress không gửi header CORS nên trình duyệt không gọi thẳng được.
Một endpoint chuyển tiếp `GET /api/fetch?url=…` được gắn vào server Vite
(lúc chạy local) và triển khai dưới dạng serverless function trên Vercel.
Nó chỉ nhận scheme `http(s)` và chặn các host nội bộ/loopback.

## Triển khai lên Vercel

- Import repo vào Vercel (hoặc `npx vercel`). Preset Vite tự nhận diện;
  `vercel.json` lo phần còn lại. Không cần biến môi trường.
- Lưu ý:
  - Proxy trở thành **công khai** — ai biết URL đều dùng được. Bật
    _Deployment Protection_ nếu cần.
  - Mỗi chương là một lần gọi function (tính vào hạn mức plan Hobby).
  - Response serverless giới hạn 4,5 MB; ảnh quá lớn sẽ bị bỏ qua, không làm hỏng file.

## Định dạng xuất

Cả hai bản đều mở đầu bằng nội dung trang mục lục, sau đó tới từng chương.

- **EPUB 3** — bìa tự tạo, mục lục, mỗi chương một file XHTML, ảnh được tải về
  nhúng sẵn để đọc offline. Tích _Bỏ hình ảnh_ để lược bỏ ảnh.
- **PDF** — trang tiêu đề, mục lục bấm được kèm số trang, khổ A4/A5/Letter.
  Nhúng font Noto Sans nên tiếng Việt hiển thị đúng và chữ chọn được. Không vẽ ảnh
  vào PDF; truyện có tranh nên dùng bản EPUB.

## Cấu trúc thư mục

| Đường dẫn                       | Vai trò                                                 |
| ------------------------------- | ------------------------------------------------------- |
| `api/fetch.ts`                  | Endpoint chuyển tiếp CORS (Vercel + local)              |
| `server/proxy.ts`               | Gắn endpoint trên server Vite dev/preview               |
| `src/composables/useScraper.ts` | Điều phối luồng tải, tiến độ, trạng thái xuất           |
| `src/lib/fetcher.ts`            | Gọi proxy, thử lại với backoff                          |
| `src/lib/parser.ts`             | Trích xuất `<article>`, nhận diện chương, làm sạch HTML |
| `src/lib/blocks.ts`             | HTML → khối văn bản cho PDF                             |
| `src/lib/xhtml.ts`              | HTML → XHTML chuẩn                                      |
| `src/lib/epub/`                 | Đóng gói EPUB 3: builder, OPF/NCX, ảnh                  |
| `src/lib/pdf/`                  | Dựng PDF: font, ảnh, dàn trang                          |
| `src/lib/types.ts`              | Kiểu dữ liệu dùng chung, hợp đồng giữa các module       |
| `src/lib/text.ts`               | Chuẩn hoá không dấu, slug, định dạng chuỗi              |
| `src/lib/async.ts`              | `runPool` — chạy tác vụ giới hạn song song              |
| `src/lib/download.ts`           | Kích hoạt hộp thoại lưu file                            |

## Code style

Format bằng Prettier (`.prettierrc.json`): chạy `npm run format` để tự sửa, hoặc
`npm run format:check` để kiểm tra.
