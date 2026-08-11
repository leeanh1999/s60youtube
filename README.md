# YouTube cho Nokia Symbian (S60v3 / S60v5 / Anna / Belle)

Máy tính chạy một máy chủ nhỏ trong mạng LAN. Điện thoại Nokia chỉ mở một trang
HTML thuần (không JavaScript, không CSS3) rồi bấm phát. Mọi việc nặng — tìm
kiếm, lấy luồng, chuyển mã — đều do máy tính làm.

Vì sao phải làm vòng như vậy:

- YouTube ngày nay dùng HTTPS đời mới, trình duyệt Symbian không bắt tay TLS được nữa.
  Máy chủ này phục vụ qua **HTTP thường** trong mạng nội bộ nên máy cũ vào được.
- Symbian chỉ phát ổn định **MP4 chứa H.264 Baseline + AAC-LC**. YouTube giờ chủ yếu
  trả về luồng hình và tiếng tách rời, nên cần ffmpeg ghép/hạ cỡ lại.

## Yêu cầu

| Thành phần | Ghi chú |
| --- | --- |
| Node.js 18 trở lên | đã kiểm tra trên Node 24 |
| Python 3 + yt-dlp | `python -m pip install --upgrade yt-dlp` |
| ffmpeg | tự có sẵn qua gói `ffmpeg-static` khi `npm install` |
| Máy tính và điện thoại chung một WiFi | |

## Cài đặt

```bash
npm install
python -m pip install --upgrade yt-dlp
```

## Chạy bằng Docker trên NAS Synology

Đây là chỗ chạy hợp nhất: NAS bật 24/7, nằm sẵn trong mạng LAN, và giữ được HTTP
thường mà máy Symbian cần. Ảnh dựng sẵn cho cả `amd64` (Synology chạy Intel) lẫn
`arm64`, nên NAS chỉ việc tải về, không phải tự build.

1. Trong DSM mở **Container Manager** → **Dự án (Project)** → **Tạo**.
2. Đặt tên `s60youtube`, chọn một thư mục trên NAS, chọn "Tạo docker-compose.yml".
3. Dán nội dung file [`docker-compose.yml`](docker-compose.yml) của repo này vào.
4. Bấm tiếp và chạy. Lần đầu NAS tải ảnh về mất vài phút.

Sau đó vào `http://<ip-cua-nas>:9080/` từ máy Nokia.

Thích dòng lệnh thì SSH vào NAS rồi:

```bash
mkdir -p /volume1/docker/s60youtube && cd /volume1/docker/s60youtube
curl -O https://raw.githubusercontent.com/leeanh1999/s60youtube/main/docker-compose.yml
sudo docker compose up -d
```

Vài điểm cần biết:

- Cookie đăng nhập và file đã chuyển mã nằm trong `./data` cạnh file compose, nên
  cập nhật hay dựng lại container đều không mất.
- Cổng mở ra ngoài là **9080**. Muốn đổi thì sửa số bên trái trong `ports`, số
  bên phải (`8080`) là cổng bên trong container, cứ để nguyên.
- `YTDLP_AUTO_UPDATE=1` cho container tự cập nhật yt-dlp mỗi lần khởi động.
  YouTube đổi API liên tục, yt-dlp cũ là hỏng ngay, nên cứ để bật.
- **Đừng mở cổng này ra Internet.** Trong `data/cookies.txt` là phiên đăng nhập
  Google của bạn, ai vào được trang cũng dùng được tài khoản đó.

### NAS chip ARM (Realtek)

Trước hết kiểm tra hai thứ, vì không phải NAS ARM nào cũng chạy được:

1. **Có Container Manager không.** Vào Package Center tìm "Container Manager".
   Dòng `j` giá rẻ (DS220j, DS420j, DS223j…) Synology không cho cài Docker. Nếu
   không tìm thấy gói thì NAS đó không chạy được cách này.
2. **Kiến trúc CPU.** SSH vào NAS rồi gõ `uname -m`:
   - `aarch64` — đúng ảnh `arm64` đã dựng sẵn, tải về chạy luôn.
   - `armv7l` — ảnh hiện tại chưa có bản 32-bit, cần build thêm.

Mọi chip Realtek mà Synology dùng (RTD1293, RTD1296, RTD1619B) đều là ARMv8
64-bit nên gần như chắc chắn ra `aarch64`.

Chip ARM mã hoá video chậm hơn hẳn máy tính. Vì vậy file compose đặt sẵn
`FFMPEG_PRESET=ultrafast`, và trên máy ARM nên ưu tiên theo thứ tự:

| Ưu tiên | Lựa chọn | Vì sao |
| --- | --- | --- |
| 1 | **Phát ngay** | Chỉ chuyển tiếp luồng, NAS không phải mã hoá gì |
| 2 | **Chỉ tiếng (.m4a)** | Mã hoá âm thanh rất nhẹ, xong trong vài giây |
| 3 | **176x144 / 320x240** | Chậm — video 4 phút có thể mất vài phút |
| 4 | 640x360 | Rất chậm trên ARM, chỉ nên dùng nếu NAS chạy Intel |

Cập nhật lên bản mới:

```bash
sudo docker compose pull && sudo docker compose up -d
```

## Chạy thẳng trên máy tính

```bash
npm start
```

Cửa sổ lệnh sẽ in ra địa chỉ, ví dụ `http://192.168.1.5:8080/`. Gõ đúng địa chỉ
đó vào trình duyệt của điện thoại (nhớ cả `http://` và số cổng).

Đổi cổng nếu cần: `set PORT=9000 && npm start`.

## Đăng nhập (bắt buộc để phát được)

Khi máy chủ gọi YouTube từ IP lạ — VPN, VPS, hay mạng công ty — YouTube trả về
*"Sign in to confirm you're not a bot"* và không cho lấy luồng. Cách xử lý chính
thức của yt-dlp là cho nó dùng cookie của **chính tài khoản bạn**.

### Cách 1 — nhập mã / quét QR (giống đăng nhập YouTube trên tivi)

1. Trên máy Nokia vào mục **Đăng nhập**. Máy hiện mã kiểu `ABC-123`, địa chỉ
   `http://<ip>:8080/link`, và một mã QR.
2. Trên máy tính (hoặc điện thoại đời mới) mở địa chỉ đó, hoặc quét QR đang hiện
   trên màn hình Nokia.
3. Trang đó hướng dẫn xuất `cookies.txt`, cho chọn file hoặc dán nội dung, rồi
   nhập mã đang hiện trên Nokia và bấm lưu.
4. Màn hình Nokia tự làm mới và chuyển sang **Đã đăng nhập**.

Mã sống 10 phút và chỉ dùng được một lần, nên máy khác trong mạng không ghi đè
cookie của bạn được. Nút **Kiểm tra còn dùng được không** gọi thử YouTube để biết
cookie đã hết hạn hay chưa; **Xoá đăng nhập** thì xoá file đi.

### Cách 2 — tự đặt file

Xuất `cookies.txt` rồi chép thẳng vào thư mục dự án. Muốn để chỗ khác thì
`set YT_COOKIES_FILE=D:\duong\dan\cookies.txt`.

### Cách 3 — đọc thẳng từ trình duyệt

```bash
set YT_COOKIES_BROWSER=chrome
npm start
```

Trên Windows phải **đóng hẳn Chrome** trước, không thì yt-dlp không đọc được
database cookie đang bị khoá. Edge bản mới mã hoá app-bound nên thường thất bại —
dùng Cách 1 cho chắc.

### Vì sao không phải OAuth thật như tivi

Tivi dùng OAuth 2.0 Device Authorization Grant: hiện mã, bạn duyệt ở máy khác,
tivi nhận token. Cơ chế đó có thật, nhưng token OAuth của Google **không mở khoá
được luồng video** — YouTube Data API cố ý không trả link phát. Nó chỉ cho đọc
những thứ như danh sách kênh đã đăng ký hay playlist.

Thứ duy nhất mở được luồng là phiên đăng nhập trình duyệt, tức cookie. Nên phần
đăng nhập ở đây mượn đúng *trải nghiệm* của tivi — mã ngắn, QR, máy kia duyệt hộ,
máy này tự cập nhật — còn thứ trao đổi là cookie của chính bạn.

(Từng có plugin OAuth cho yt-dlp dùng client ID của ứng dụng YouTube trên tivi.
YouTube đã chặn và cảnh báo nguy cơ khoá tài khoản, nên dự án này không làm vậy.)

## Dùng trên điện thoại

- Lần đầu vào **Đăng nhập** để nối tài khoản (xem mục trên).
- Trang chính có ô tìm kiếm và 9 chủ đề gợi ý.
- Dán thẳng link YouTube vào ô tìm kiếm cũng mở đúng video đó.
- Phím tắt: `0` về trang chính, `1`–`9` chọn mục, `*` vào ô tìm, `#` sang trang sau.

Ở trang video có các lựa chọn:

| Lựa chọn | Dành cho |
| --- | --- |
| Phát ngay | Máy Belle, khi YouTube còn sẵn bản MP4 gộp — không phải chờ |
| 176x144 | S60v3 đời cũ (N70, N73, E71) |
| 320x240 | S60v5 (5800, N97, X6) |
| 640x360 | Symbian Belle (N8, 808, E7, 701) |
| Chỉ tiếng (.m4a) | Nghe nhạc, tốn rất ít dung lượng |

Ba mức đầu và bản âm thanh cần chuyển mã: trang sẽ tự làm mới và hiện phần trăm,
xong thì bấm phát. Video dài thì chờ lâu, cứ để trang đó tự chạy.

File đã chuyển mã nằm trong thư mục `cache/`, tự xoá sau 6 tiếng không đụng tới.

## Cài đặt riêng

Mục **Cài đặt** cho tắt ảnh thu nhỏ (mạng 2G/EDGE nên tắt) và đổi số kết quả mỗi
trang. Lưu bằng cookie trên máy điện thoại.

Biến môi trường:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `8080` | Cổng máy chủ |
| `DATA_DIR` | thư mục dự án | Nơi chứa `cookies.txt` và `cache/` (Docker đặt `/data`) |
| `YT_HL` / `YT_GL` | `vi` / `VN` | Ngôn ngữ và vùng kết quả |
| `PAGE_SIZE` | `12` | Số kết quả mỗi trang |
| `MAX_JOBS` | `1` | Số video chuyển mã cùng lúc |
| `FFMPEG_PRESET` | `veryfast` | Tốc độ mã hoá x264; máy ARM yếu nên đặt `ultrafast` |
| `YT_COOKIES_FILE` | `<DATA_DIR>/cookies.txt` | Đường dẫn cookie |
| `YT_COOKIES_BROWSER` | trống | Đọc cookie thẳng từ trình duyệt |
| `FFMPEG_PATH` | tự dò | Chỉ thẳng tới ffmpeg (Docker đặt `/usr/bin/ffmpeg`) |
| `YTDLP_AUTO_UPDATE` | trống | Đặt `1` để container tự cập nhật yt-dlp lúc khởi động |

## Khi gặp trục trặc

**Điện thoại không mở được trang.** Tường lửa Windows thường chặn kết nối vào.
Mở cổng một lần bằng PowerShell quyền quản trị:

```powershell
New-NetFirewallRule -DisplayName "YouTube S60" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

**"YouTube đang đòi đăng nhập từ máy chủ này."** Chưa có cookie, hoặc cookie đã
hết hạn — xuất lại `cookies.txt`.

**"Không kết nối được tới YouTube."** Máy chủ không ra được mạng. Nếu mạng công ty
chặn YouTube thì phải bật VPN trên máy tính (điện thoại thì không cần).

**Chuyển mã quá chậm.** Chọn mức thấp hơn, hoặc nghe bản "Chỉ tiếng". Trên NAS
ARM thì đặt `FFMPEG_PRESET=ultrafast`. Ngược lại nếu máy khoẻ có thể tăng
`MAX_JOBS` và hạ xuống `FFMPEG_PRESET=fast` cho file gọn hơn.

**Tải về không phát được.** Vài đời máy chỉ mở file sau khi lưu vào thẻ nhớ. Chọn
"Lưu" rồi mở bằng trình phát sẵn có của máy.

## Kiểm thử nhanh

```bash
node tools/smoke.js
node tools/test-login.js
```

`smoke.js` gọi các trang bằng User-Agent của Nokia N8 và cảnh báo nếu trang lỡ
chứa JavaScript, CSS3 hay quá nặng. `test-login.js` chạy trọn luồng đăng nhập
bằng cookie giả rồi tự đăng xuất, nên không đụng tới cookie thật của bạn.

## Ghi chú

Dự án dành cho việc tự dùng với máy và tài khoản của chính bạn trong mạng nhà.
Đừng mở cổng này ra Internet.
