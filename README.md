# Trình tải truyện

Biến một truyện trên **WordPress** hoặc **Wattpad** thành file **EPUB** hoặc
**PDF**. Toàn bộ xử lý chạy trong trình duyệt (Vue 3 + TypeScript + Tailwind).

## Chạy tại máy

```bash
npm install
npm run dev
```

Mở http://localhost:5173.

## Cách dùng

Mỗi nguồn là một tab riêng, giữ trạng thái độc lập, nên đổi tab không làm mất
truyện đang tải dở ở tab kia.

1. **Chọn nguồn và dán liên kết**
   - _WordPress_: liên kết trang mục lục. Mọi liên kết bài viết trong trang đều
     được quét (đã lọc bỏ chuyên mục, tác giả, chia sẻ…), nên mục lục chỉ đánh
     số `1, 2, 3…` vẫn nhận đủ chương.
   - _Wattpad_: liên kết truyện (`wattpad.com/story/…`) hoặc liên kết một
     chương bất kỳ. Danh sách chương lấy trực tiếp từ API, đúng thứ tự tác giả
     đăng.
2. **Tải chương**: chọn chương rồi bấm tải. Chương nào lỗi thì tải lại riêng
   được.
3. **Đổi thứ tự** (nếu cần): bấm tay cầm `⋮⋮` của một chương để **nhấc** nó
   lên, cuộn hoặc lọc thoải mái, rồi bấm vào chương bạn muốn chèn nó lên trước,
   hoặc bấm _Chèn xuống cuối danh sách_. Bấm `Esc` để bỏ nhấc. Nếu dùng bàn
   phím: Tab tới tay cầm, `Enter` để nhấc, `↑` `↓` để nhích từng bậc.
4. **Xuất**: tải xuống bản EPUB hoặc PDF.

### Chương bị khoá

- _WordPress_: điền mật khẩu vào ô _Mật khẩu chương bị khoá_ ở bước 1. Có
  nhiều mật khẩu thì cách nhau bằng dấu `|` (ví dụ `abc | def | ghi`), mỗi
  chương bị khoá sẽ được thử lần lượt cho tới khi mở được.
- _Wattpad_: chương thuộc bản trả phí không trả về nội dung.

Chương không mở được sẽ xuất ra liên kết tới trang gốc thay cho nội dung.

## Ảnh bìa EPUB

Chọn theo thứ tự ưu tiên:

1. ảnh bìa do nguồn công bố (Wattpad có sẵn; bản 512px),
2. **ảnh đầu tiên tải được** trong truyện, tức đường mặc định của WordPress,
3. bìa tự vẽ từ tên truyện và tác giả.

Ảnh được dùng làm bìa vẫn chỉ lưu một lần trong sách. Bật _Không tải hình ảnh_
thì không ảnh nào được tải về, kể cả ảnh bìa, và sách sẽ dùng bìa tự vẽ.

## Vì sao cần proxy?

WordPress không gửi header CORS nên trình duyệt không gọi thẳng được. Endpoint
`GET /api/fetch?url=…` chuyển tiếp yêu cầu: chạy trên server Vite khi phát triển
local và là serverless function khi deploy. Nó chỉ nhận scheme `http(s)` và chặn
các host nội bộ/loopback. Để mở khoá chương bị bảo vệ, proxy nhận thêm `POST`
tới `wp-login.php?action=postpass` (chỉ riêng form mật khẩu của WordPress) và trả
về cookie phiên qua header `x-set-cookie`. Mật khẩu và cookie chỉ đi qua proxy
của bạn, không lưu trữ lâu dài.

API của Wattpad trả `Access-Control-Allow-Origin: *` nên được gọi trực tiếp,
không qua proxy. Riêng ảnh (mọi nguồn) vẫn đi qua proxy cho nhất quán.

Mọi lời gọi trực tiếp đều đặt `referrerPolicy: "no-referrer"` trong
`src/lib/http.ts`. Wattpad trả 400 `PermissionDenied` ("go to
developer.wattpad.com to get an API key") cho mọi request `/api/v3` mang
`Referer` của domain khác, mà đó đúng là header browser tự gửi kèm. Bỏ dòng
đó là tab Wattpad hỏng ngay, dù `curl` vẫn chạy tốt.

> API Wattpad dùng ở đây là API nội bộ của chính web client Wattpad, không có
> cam kết ổn định. Wattpad đổi endpoint thì phần `src/lib/sources/wattpad/`
> phải cập nhật theo.

## Triển khai lên Vercel

Import repo vào Vercel (hoặc `npx vercel`), không cần biến môi trường. Lưu ý:

- Proxy trở thành **công khai**, nên bật _Deployment Protection_ nếu cần.
- Mỗi chương WordPress là một lần gọi function (tính hạn mức plan Hobby).
- Response serverless giới hạn 4,5 MB; ảnh quá lớn bị bỏ qua, không làm hỏng file.

## Xuất file

Cả hai bản mở đầu bằng phần giới thiệu truyện.

- **EPUB 3**: có bìa, mục lục, ảnh nhúng sẵn để đọc offline.
- **PDF**: có trang tiêu đề, mục lục bấm được kèm số trang, khổ A4/A5/Letter,
  font Noto Sans nhúng sẵn (tiếng Việt hiển thị đúng, chữ chọn được).

## Cấu trúc thư mục

| Đường dẫn                   | Vai trò                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `api/fetch.ts`              | Endpoint chuyển tiếp CORS (Vercel + local)                  |
| `server/proxy.ts`           | Gắn endpoint vào server Vite dev/preview                    |
| `src/composables/`          | Trạng thái ứng dụng (scraper, log, theme)                   |
| `src/lib/sources/`          | Adapter từng nguồn, thêm nguồn mới chỉ cần thêm một thư mục |
| `src/lib/sources/types.ts`  | Hợp đồng `StorySource` / `StorySession` mà nguồn phải theo  |
| `src/lib/html.ts`, `url.ts` | Phân tích và làm sạch HTML, xử lý URL dùng chung            |
| `src/lib/http.ts`           | Gọi mạng: qua proxy hoặc trực tiếp, kèm thử lại backoff     |
| `src/lib/epub/`, `pdf/`     | Đóng gói EPUB 3 / dựng PDF                                  |
| `src/lib/export.ts`         | Chọn bộ dựng theo định dạng và đặt tên tệp                  |
| `src/components/`           | Giao diện (tab nguồn, danh sách chương, log, theme…)        |

### Thêm một nguồn mới

Tạo `src/lib/sources/<ten>/index.ts` xuất một `StorySource`: khai báo tên, mẫu
liên kết, mức độ gọi mạng cho phép (`fetchPolicy`), ô bí mật nếu cần
(`credentialField`), và một `createSession()` trả về `loadIndex` + `loadChapter`.
Đăng ký nguồn trong `src/lib/sources/index.ts`, phần giao diện sẽ tự có thêm
tab, không phải sửa gì.

## Code style

Format bằng Prettier: `npm run format` để tự sửa, `npm run format:check` để kiểm tra.
