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
- Mỗi máy vào trang dùng cookie YouTube của riêng nó. Muốn mở cổng ra Internet
  thì đọc mục [Mở ra Internet cho nhiều người](#mở-ra-internet-cho-nhiều-người).

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

Chip ARM mã hoá video chậm hơn hẳn máy tính, nên gần như mọi đường đi trong máy
chủ đều tránh mã hoá: xem online và nghe nhạc chỉ là chuyển tiếp luồng, còn bản
nhẹ thì ghép lại vỏ chứa chứ không mã hoá (xem mục dưới). `FFMPEG_PRESET`
trong file compose chỉ còn tác dụng ở trường hợp hiếm là video không có bản
H.264 nào — lúc đó mới phải mã hoá thật và NAS ARM sẽ rất chậm.

### Cập nhật lên bản mới

Bằng SSH (chắc ăn nhất, chạy trong thư mục chứa `docker-compose.yml`):

```bash
sudo docker compose pull && sudo docker compose up -d
```

Chỉ `pull` thôi là chưa đủ — nó tải ảnh mới về nhưng container cũ vẫn chạy.
Phải có `up -d` thì mới thay container.

Bằng giao diện DSM:

1. **Container Manager** → **Sổ đăng ký (Registry)** → tìm
   `ghcr.io/leeanh1999/s60youtube` → tải về thẻ `latest` để lấy ảnh mới nhất.
2. Sang **Dự án (Project)** → chọn `s60youtube` → **Thao tác** → **Xây dựng lại
   (Rebuild)**. Container sẽ được dựng lại từ ảnh vừa tải.

Tên menu có thể khác chút ít tuỳ phiên bản DSM.

Cookie đăng nhập và file đã chuyển mã nằm trong `./data` nên cập nhật không mất.

**Kiểm tra đã lên bản mới chưa:** vào mục **Giới thiệu** trên máy Nokia. Dòng
"Bản đang chạy" là mã commit của ảnh, "Dựng lúc" là thời điểm dựng, và có cả
phiên bản yt-dlp. Đối chiếu với
[commit mới nhất](https://github.com/leeanh1999/s60youtube/commits/main) là biết
ngay. Nếu số không đổi thì ảnh chưa được thay.

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

Cookie là cả phiên đăng nhập Google của một người, nên **mỗi máy giữ cookie
riêng**: lần đầu vào trang, máy chủ phát cho máy đó một mã thiết bị (lưu bằng
cookie trình duyệt, không dính gì tới cookie YouTube), rồi cookie nạp lên được
ghi thành một file riêng mang tên mã đó trong `<DATA_DIR>/devices`. Nhờ vậy
nhiều người dùng chung một máy chủ mà không ai xem bằng tài khoản của ai. Máy
nào 45 ngày không dùng thì cookie của nó tự xoá (`DEVICE_TTL_DAYS`).

### Cách 1 — nhập mã / quét QR (giống đăng nhập YouTube trên tivi)

1. Trên máy Nokia vào mục **Đăng nhập**. Máy hiện mã kiểu `ABC-123`, địa chỉ
   `http://<ip>:8080/link`, và một mã QR.
2. Trên máy tính (hoặc điện thoại đời mới) mở địa chỉ đó, hoặc quét QR đang hiện
   trên màn hình Nokia.
3. Trang đó hướng dẫn xuất `cookies.txt`, cho chọn file hoặc dán nội dung, rồi
   nhập mã đang hiện trên Nokia và bấm lưu.
4. Màn hình Nokia tự làm mới và chuyển sang **Đã đăng nhập**.

Mã sống 10 phút, chỉ dùng được một lần, và **gắn với đúng chiếc máy đã xin nó** —
cookie nộp từ máy tính chỉ chảy vào máy đang hiện mã, không đụng tới máy khác.
Nút **Kiểm tra còn dùng được không** gọi thử YouTube để biết cookie đã hết hạn
hay chưa; **Xoá đăng nhập khỏi máy này** thì xoá file cookie của riêng máy đó.

### Cách 2 — cookie chung cho cả nhà

Xuất `cookies.txt` rồi chép thẳng vào thư mục dự án (Docker thì `data/cookies.txt`).
Máy nào chưa tự đăng nhập sẽ mượn tạm cookie này. Đó là cách gọn nhất khi chỉ có
mình bạn dùng trong mạng nhà. Muốn để file chỗ khác thì
`set YT_COOKIES_FILE=D:\duong\dan\cookies.txt`; muốn tắt hẳn phần mượn chung thì
`YT_SHARED_COOKIES=0`.

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

## Mở ra Internet cho nhiều người

Mỗi máy đã dùng cookie riêng nên nhiều người chung một máy chủ được. Trước khi
mở cổng, làm đủ ba việc sau.

**1. Tắt cookie chung.** Đặt `YT_SHARED_COOKIES=0` (và đừng để `data/cookies.txt`
trong thư mục dữ liệu). Nếu quên, máy lạ nào vào cũng xem bằng tài khoản của
bạn.

**2. Máy Nokia vẫn phải vào bằng HTTP thường.** Trình duyệt Symbian không bắt
tay TLS đời mới được, nên cổng công khai bắt buộc là `http://`. Nghĩa là đường
truyền của máy cũ không mã hoá — chấp nhận được với việc xem video, nhưng đừng
để nó cũng là đường nộp cookie.

**3. Cho trang nộp cookie đi lối HTTPS — đây là việc quan trọng nhất.** Máy
Nokia đi bằng HTTP thì chỉ lộ *việc bạn xem gì*. Nhưng trang `/link` chuyển đi
**cả phiên đăng nhập Google**: đi qua HTTP trần giữa Internet là ai chen được
vào đường truyền cũng đọc trọn cookie, và mã hoá phía máy chủ không cứu được.
Trang `/link` mở trên máy tính đời mới nên dùng HTTPS thoải mái.

Với nginx sẵn có, xin chứng chỉ rồi thêm khối này (đúng tên miền của bạn):

```bash
sudo certbot --nginx -d s60tube.ddnsfree.com
```

```nginx
server {
    listen 443 ssl;
    server_name s60tube.ddnsfree.com;
    # ssl_certificate ... do certbot tự điền

    location / {
        proxy_pass http://127.0.0.1:9080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_buffering off;          # de xem online khong bi khung lai
    }
}
```

Giữ nguyên khối `listen 80` cho máy Nokia — **đừng** bật chuyển hướng 80 → 443,
Symbian không bắt tay TLS đời mới được nên chuyển hướng là máy cũ chết hẳn.

Rồi khai địa chỉ HTTPS để mã QR và dòng địa chỉ trên máy Nokia trỏ vào đó:

```yaml
      - PUBLIC_URL=https://s60tube.ddnsfree.com
      - TRUST_PROXY=1
      - REQUIRE_SECURE_LINK=1
```

`REQUIRE_SECURE_LINK=1` bắt máy chủ từ chối hẳn việc nhận cookie khi trang
`/link` không đi qua HTTPS — chưa đặt thì trang chỉ hiện cảnh báo đỏ. Chưa có
chứng chỉ thì tạm để trống biến này, và chỉ nạp cookie khi đang ngồi cùng mạng
nhà với máy chủ.

Vài điều nên biết khi đã mở cổng:

- Ai vào được địa chỉ cũng dùng được máy chủ (tốn băng thông và CPU của bạn).
  Muốn giới hạn thì chặn ở proxy — lọc theo IP, hoặc bắt đăng nhập ở lớp proxy
  cho riêng đường `/link`.
- Mã ghép nối gắn với đúng máy đã xin nó, sống 10 phút, dùng một lần. Mỗi lần
  nhập sai bị giữ lại nửa giây, sai quá 10 lần từ một địa chỉ IP là nghỉ 10
  phút. Người cầm mã đúng thì không bao giờ bị chặn.
- Máy chủ chạy yt-dlp riêng cho từng tài khoản nên đông người là nặng máy. Cứ
  để `MAX_JOBS=1` trên NAS.
- Cookie của mỗi máy nằm ở `data/devices/<mã>.txt`. Đó là phiên đăng nhập Google
  của người ta — sao lưu hay chia sẻ thư mục `data` là lộ hết.

### Máy chủ giữ những gì, và mất thì hỏng tới đâu

| Thứ | Ở đâu | Ai lấy được thì làm gì |
| --- | --- | --- |
| Cookie YouTube | `data/devices/<mã>.txt`, chỉ đọc từ đĩa | Toàn quyền tài khoản Google — không có đường nào trong web đọc ngược ra được |
| Mã thiết bị (`did`) | Cookie trình duyệt, `HttpOnly` + `SameSite=Lax` | Xem YouTube *nhân danh* máy đó, nhưng không đọc được nội dung cookie |
| Khoá phát (`?k=`) trong địa chỉ video | Sinh ngẫu nhiên khi nạp cookie | Chỉ xem được video bằng tài khoản đó; nạp cookie mới hoặc xoá đăng nhập là khoá cũ chết ngay |
| Mã ghép nối | Chỉ nằm trong bộ nhớ, 10 phút | Nhét cookie *của họ* vào máy bạn (không lấy được cookie của bạn) |

Không có đường nào trong máy chủ in nội dung `cookies.txt` ra trang web, và mã
thiết bị là `HttpOnly` nên kể cả có lỗi chèn mã HTML thì script cũng không đọc
được. Chỗ hở duy nhất còn lại là **đường truyền HTTP** — vì thế mục 3 ở trên là
việc bắt buộc.

## Dùng trên điện thoại

- Lần đầu vào **Đăng nhập** để nối tài khoản (xem mục trên).
- Trang chính là danh sách gợi ý (nếu đã đăng nhập) và 9 chủ đề gợi ý.
- Tìm kiếm nằm ở **kính lúp góc phải thanh trên**: bấm vào là khung tìm kiếm bật
  ra ngay tại chỗ, không phải rời trang đang xem. Đang xem kết quả mà bấm lại thì
  từ khoá cũ còn nguyên trong ô, sửa tiếp là tìm lại.
- Dán thẳng link YouTube vào khung đó cũng mở đúng video đó.
- Phím **lên / xuống** nhảy hẳn sang khối video kế tiếp, không phải lết con trỏ
  từng chút như mặc định của trình duyệt.
- Phím tắt: `0` về trang chính, `1`–`9` chọn mục, `*` mở khung tìm, `#` sang trang
  sau.

Trang video mở ra là có sẵn khung phát ngay trên trang. Bấm nút phát là xem được
luôn: máy chỉ kéo phần đang xem chứ không tải cả file, xem xong không còn gì
trong bộ nhớ máy. Trình duyệt của Belle (Nokia Browser 7.4 trở lên) đọc được thẻ
`<video>` với H.264/MP4 nên làm được như vậy; máy đời cũ hơn không hiểu thẻ này
sẽ thấy một liên kết thường ở chỗ đó.

Dưới khung phát còn hai lựa chọn:

| Lựa chọn | Dành cho | Phải chờ |
| --- | --- | --- |
| Nghe ngay — chỉ tiếng | Nghe nhạc, tốn rất ít dung lượng | Không |
| Bản nhẹ 240p | Mạng yếu, xem online hay khựng | Vài giây |

**Nghe ngay** không chờ giây nào vì YouTube đã sẵn luồng AAC trong vỏ MP4
(itag 140) — đúng thứ máy Symbian nghe được, nên máy chủ chỉ dọn thẳng nó đi.

**Bản nhẹ 240p** thì máy chủ phải ghép một file, nhưng chỉ ghép chứ không mã
hoá. Nokia ghi rõ E6 đọc được H.264 cả ba profile (base, main, high) tới 720p,
mà YouTube vốn đã có sẵn luồng hình H.264 240p và luồng tiếng AAC — nên ffmpeg
chỉ cần chép hai luồng đó vào chung một vỏ MP4 (`-c copy`). Chép dữ liệu thì
nghẽn ở mạng chứ không đụng CPU, xong trong vài giây kể cả trên NAS chip ARM.

Chỉ khi YouTube không phát hành bản H.264 nào cho video đó (hiếm, thường là
video mới chỉ có VP9/AV1) thì mới phải mã hoá thật. Lúc đó trang sẽ tự làm mới
và hiện phần trăm; video dài thì chờ lâu, cứ để trang đó tự chạy.

File đã ghép nằm trong thư mục `cache/` **trên máy chủ**, tự xoá sau 6 tiếng
không đụng tới.

## Gợi ý cho bạn

Máy đã đăng nhập thì trang chính là trang gợi ý của chính tài khoản đó, giống
YouTube thường; danh sách **Chủ đề nhanh** tụt xuống dưới. Máy chưa đăng nhập
thì trang chính vẫn như trước, không gọi mạng thêm lần nào.

Gợi ý lấy bằng `yt-dlp` với cookie của đúng máy đó (`:ytrec`, tức
`youtube.com/feed/recommended`), nên hai máy hai tài khoản thấy hai danh sách
khác nhau. Mỗi lần lấy mất khoảng hai giây nên kết quả đệm 10 phút cho từng bộ
cookie; quá 25 giây thì bỏ, trang chính vẫn ra đủ, chỉ thiếu phần gợi ý. Đặt
`HOME_FEED=0` để tắt hẳn (NAS yếu, hoặc muốn trang chính mở tức thì).

**Cookie phát được video chưa chắc lấy được gợi ý.** Bản chỉ có phần "3P"
(`__Secure-3PSID`, `__Secure-3PAPISID`) vẫn phát video bình thường, nhưng với
các trang cá nhân thì YouTube coi máy chủ là người chưa đăng nhập: `:ytrec` trả
về danh sách rỗng và `:ytsubs` báo thẳng *Login details are needed*. Muốn có gợi
ý thì bản xuất phải kèm cookie đăng nhập gốc của `youtube.com` — `LOGIN_INFO`,
`SID`, `__Secure-1PSID`. Máy chủ tự kiểm chỗ này: thiếu thì trang `/link` nói
ngay lúc bạn vừa nộp cookie (còn đang ngồi trước máy tính để xuất lại), và trang
chính ghi rõ lý do thay vì để danh sách trống không hiểu vì sao.

## Cài đặt riêng

Danh sách xếp một cột từ trên xuống, mỗi video là một **khối** riêng: ảnh xem
trước bên trái, tên video và thông tin bên phải — nhìn một màn hình là thấy ba
bốn video thay vì một. Cả khối là **một liên kết duy nhất**, nhờ vậy bấm phím
xuống một cái là sang đúng một video, và khối đang chọn thì đổi màu kèm dấu tam
giác phát trên ảnh nên không bao giờ lạc con trỏ.

Trang vừa hai khuôn màn hình, không phải đoán máy nào: nó chỉ khai báo bề ngang
thật (`width=device-width`) rồi để `s60.css` tự chọn.

| Máy | Màn hình | Trang hiện ra |
| --- | --- | --- |
| E6, E7, N97 | 640 điểm ngang | Chữ 20px, ảnh xem trước 8em (≈160 điểm) |
| N8, C7, X7, C6-01 khi xem dọc | 360 điểm ngang | Chữ 16px, ảnh 6,4em (≈102 điểm), lề mỏng hơn |

Ngưỡng đổi khuôn là 480 điểm. Điểm ảnh của N8 to hơn của E6 (210 so với 325 điểm
mỗi inch) nên chữ 16px trên N8 đọc ra vẫn lớn hơn chữ 20px trên E6, mà bề ngang
tiết kiệm được lại đủ cho ba dòng tên video. Máy nào không hiểu `@media` thì bỏ
qua cả khối đó và dùng khuôn 640 — chữ to, ảnh to, vẫn đọc được chứ không bể
trang. Xoay N8 sang ngang là nó tự nhận 640 điểm và về khuôn kia.

Màn hình E6 nằm ngang, rộng 640 điểm và cao 480 điểm, nhưng đường chéo chỉ 2,46
inch — khoảng 325 điểm mỗi inch, tức bề ngang thật chừng 5cm. Dày điểm ảnh như
vậy nên cỡ chữ mặc định của web hiện ra rất bé; mục **Cài đặt** có ba mức
**Vừa / Lớn / Rất lớn**, mặc định là "Lớn". Ảnh xem trước và biểu tượng đều đo
bằng `em` nên đổi cỡ chữ là chúng to nhỏ theo, giữ đúng tỉ lệ; tên video cũng
được cắt ngắn hơn khi chữ to, để khối không cao gấp đôi ảnh. Ở đó cũng tắt được
ảnh thu nhỏ (mạng 2G/EDGE nên tắt — lúc đó khối gom lại còn một cột chữ) và đổi
số kết quả mỗi trang. Tất cả lưu bằng cookie trên máy.

Trình duyệt Symbian^3 trở lên (Nokia Browser 7.x/8.x, nền WebKit 533–535) đọc
được HTML5, SVG đặt
thẳng trong trang, CSS3 cơ bản và JavaScript — nên biểu tượng trên trang là hình
vẽ SVG chứ không phải ký tự đặc biệt (font máy thiếu ký tự là hiện ra ô vuông,
còn SVG lỗi thì chỉ là khoảng trống).

Thanh đỏ trên đầu và thanh bốn ô ở chân trang **dán vào khung nhìn**, cuộn thế
nào cũng còn đó. Chỗ này không dám tin `position: fixed`: nhiều bản WebKit đời
Symbian nhận thuộc tính đó rồi xử lý như `absolute` — thanh dán vào trang chứ
không vào khung nhìn, cuộn xuống là nó trôi mất, tính ra còn tệ hơn không dán.
Nên `s60.js` **đo thật**: đặt một ô tí hon dán sát đỉnh, cuộn đi hai điểm rồi xem
toạ độ của nó so với khung nhìn có đổi không, đo xong trả lại chỗ cũ ngay. Đúng
thì mới đặt lớp `fixnav` vào `<body>`, chừa sẵn khoảng trống ở đỉnh và ở cuối
trang cho khỏi che chữ, và thu hai thanh gọn lại (E6 chỉ cao 480 điểm, hai thanh
ăn chừng 80 điểm là vừa). Đo sai thì bỏ qua, hai thanh nằm trong dòng chảy như
cũ. Kết quả đo nhớ trong `localStorage` nên các trang sau không phải cuộn thử
lại. Phím lên/xuống cũng biết chừa: khối vừa nhảy tới mà nằm khuất sau thanh nào
thì trang cuộn thêm đúng phần bị che.

Trong thanh trên có **một `<table>` thật**: ô của bảng tự căn giữa theo chiều dọc
nên tên trang bên trái và kính lúp bên phải luôn ngang nhau, dù người dùng đổi cỡ
chữ hay máy nào màn nào. Làm bằng `float` thì cả hai dính theo đỉnh dòng, lệch
nhau vài điểm thấy rõ ngay; còn flexbox thì WebKit đời này chưa có. Vỏ ngoài vẫn
là `<div>` vì chính nó là cái được dán vào khung nhìn — dán một `<div>` thì bản
WebKit nào cũng làm đúng, dán một `<table>` thì không chắc.

Ô bảng thì căn giữa **hộp chữ**, mà mắt người lại thấy **nét chữ** — dưới nét chữ
luôn còn một khoảng trống dành cho đuôi chữ `g`, `y`, trong khi "YouTube S60"
không có chữ nào thò xuống. Font nào giãn dòng thoáng thì khoảng trống đó càng to,
thành ra chữ nhìn như bị kéo lên. Vì vậy tên trang định hẳn `line-height: 1` (bỏ
phần giãn dòng của font) và ô bên phải đặt `line-height: 0` (bỏ hộp chữ vô hình mà
trình duyệt vẫn dựng sẵn trong mọi ô có chữ). Đo lại bằng cách đếm điểm ảnh trên
ảnh chụp ở cả ba cỡ chữ và hai bề ngang: lệch không quá 1 điểm.

Ô tìm kiếm thu thành **một biểu tượng kính lúp trần ở góc phải thanh trên** (không
viền không nền, chỉ hình), bấm vào là khung tìm bật ra và con trỏ nhảy sẵn vào ô
nhập (phím `*` cũng mở được, phím `C` đóng lại). Làm vậy vì bề ngang là thứ đắt
nhất trên hai màn này: một ô nhập chiếm gần hết dòng đầu mà chín trong mười lần vào
trang là để xem, không phải để gõ.

Trong khung thì ngược lại, nút gửi là chữ **Tìm kiếm** — chỗ này không chật như
thanh trên nên không phải tiết kiệm bề ngang: ngay cả ở cỡ chữ Rất lớn trên màn 360
điểm, ô nhập vẫn còn 211 điểm. Nút đóng là **một mũi nhọn quay lên để trần**, vì
khung tìm từ trên tụt xuống thì đóng là nó thu lên lại, hình chỉ đúng về chỗ nó sẽ
biến vào. Hai nút cố ý khác hẳn nhau: gửi đi là việc chính nên là nút chữ nền đỏ,
đóng là đường lui nên chỉ là một hình xám nhạt — trông giống nhau quá thì dễ bấm
nhầm cái nọ ra cái kia. Đệm quanh hình vẫn giữ rộng để chỗ đâm bằng đầu ngón tay
không bó theo nét hình.

Khung bật ra **không đòi máy phải dán được thanh**: dán được thì nó là `fixed` nằm
ngay dưới thanh, không dán được thì `s60.js` đặt nó bằng `absolute` vào đúng đỉnh
khung nhìn lúc bấm — không đi theo trang khi cuộn, nhưng vừa bấm là thấy ngay, vẫn
hơn là bắt sang một trang khác chỉ để gõ một dòng chữ.

Tắt hẳn JavaScript thì kính lúp là **liên kết thường sang `/search`**, và trang đó
có ô nhập thật — mất JavaScript vẫn tìm được, chỉ tốn thêm một lần tải trang. Vì
thế `/search` khi chưa có từ khoá vẫn giữ ô nhập ngay trong trang; còn khi đã có
kết quả thì trong trang không còn ô nhập nào, bấm kính lúp là khung bật ra với
**từ khoá vừa tìm còn nguyên trong đó** và con trỏ nằm sau chữ cuối, sửa tiếp là
xong.

Ba phần trên nằm trong `public/s60.js`; tắt JavaScript đi thì trang vẫn dùng được
đủ như cũ, chỉ mất đúng ba cái tiện đó.

Biến môi trường:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `8080` | Cổng máy chủ |
| `DATA_DIR` | thư mục dự án | Nơi chứa `cookies.txt`, `devices/`, `cache/` và bộ nhớ đệm của yt-dlp (Docker đặt `/data`) |
| `YT_HL` / `YT_GL` | `vi` / `VN` | Ngôn ngữ và vùng kết quả |
| `PAGE_SIZE` | `12` | Số kết quả mỗi trang, cũng là số video gợi ý ở trang chính |
| `HOME_FEED` | `1` | Đặt `0` để trang chính không lấy gợi ý riêng nữa |
| `MAX_JOBS` | `1` | Số video chuyển mã cùng lúc |
| `FFMPEG_PRESET` | `veryfast` | Tốc độ mã hoá x264; chỉ dùng khi video không có bản H.264 nào |
| `YT_COOKIES_FILE` | `<DATA_DIR>/cookies.txt` | Cookie chung cho máy chưa tự đăng nhập |
| `YT_COOKIES_BROWSER` | trống | Đọc cookie chung thẳng từ trình duyệt |
| `YT_SHARED_COOKIES` | `1` | Đặt `0` để bắt mọi máy phải tự nạp cookie của mình |
| `DEVICE_TTL_DAYS` | `45` | Bao nhiêu ngày không dùng thì xoá cookie của một máy |
| `PUBLIC_URL` | trống | Địa chỉ công khai in ra mã QR và trang `/link` khi chạy sau reverse proxy |
| `TRUST_PROXY` | trống | Đặt `1` khi có reverse proxy đứng trước, để đếm số lần nhập sai theo đúng IP người dùng |
| `REQUIRE_SECURE_LINK` | trống | Đặt `1` để từ chối nhận cookie khi trang `/link` không đi qua HTTPS |
| `FFMPEG_PATH` | tự dò | Chỉ thẳng tới ffmpeg (Docker đặt `/usr/bin/ffmpeg`) |
| `YTDLP_AUTO_UPDATE` | trống | Đặt `1` để container tự cập nhật yt-dlp lúc khởi động |

## Khi gặp trục trặc

**Điện thoại không mở được trang.** Tường lửa Windows thường chặn kết nối vào.
Mở cổng một lần bằng PowerShell quyền quản trị:

```powershell
New-NetFirewallRule -DisplayName "YouTube S60" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

**"YouTube đang đòi đăng nhập từ máy chủ này."** Máy này chưa nạp cookie, hoặc
cookie của nó đã hết hạn — vào mục **Đăng nhập** trên chính chiếc máy đó rồi nạp
lại. Cookie của máy khác không cứu được máy này.

**Đang đăng nhập tự nhiên thành chưa đăng nhập.** Máy mất cookie trình duyệt nên
máy chủ coi nó là máy mới: điện thoại bị xoá dữ liệu duyệt web, hoặc cookie của
máy đó đã quá `DEVICE_TTL_DAYS` ngày không dùng. Nạp lại là xong.

**"Không kết nối được tới YouTube."** Máy chủ không ra được mạng. Nếu mạng công ty
chặn YouTube thì phải bật VPN trên máy tính (điện thoại thì không cần).

**Bản nhẹ chờ lâu, không phải vài giây như nói ở trên.** Video đó không có bản
H.264 nên máy chủ buộc phải mã hoá thật. Chạy `docker exec s60youtube node
tools/formats.js <mã video>` để xem YouTube trả về những luồng nào — nếu cột
mã hình toàn `vp9` hay `av01` thì đúng là trường hợp này. Cứ xem online hoặc
nghe bản chỉ tiếng, cả hai đều không đụng tới ffmpeg.

**Mở video đầu tiên sau khi khởi động lại container thì lâu.** yt-dlp phải tải
và giải mã lại tệp JavaScript của trình phát YouTube. Nó nhớ kết quả trong
`<DATA_DIR>/ytdlp-cache` nên chỉ chậm đúng lần đầu; đừng xoá thư mục đó.

**Bấm vào là máy đòi tải cả file về.** Khung phát trên trang không hiện ra, nên
máy rơi vào liên kết dự phòng. Kiểm tra máy đang chạy Nokia Belle bản mới
(Nokia Browser 7.4 trở lên) — Symbian Anna và cũ hơn không có thẻ `<video>` nên
chỉ tải về được thôi.

**Giao diện bể sau khi cập nhật: ảnh thu nhỏ to như cả trang, chữ đè lên ảnh,
nút Tìm trơ ra như nút mặc định.** Máy đang ghép HTML mới với `s60.css` cũ còn
trong bộ đệm. Địa chỉ file đã có đuôi `?v=...` tính từ nội dung file nên chuyện
này tự hết: bản mới là địa chỉ mới, máy tải lại đúng một lần. Nếu vẫn thấy vậy
thì trang HTML cũng đang bị đệm ở đâu đó — xoá bộ đệm trình duyệt, hoặc xem lại
reverse proxy có tự đệm HTML không.

## Kiểm thử nhanh

```bash
node tools/smoke.js
node tools/test-login.js
node tools/test-convert.js
node tools/preview.js
```

`smoke.js` gọi các trang bằng User-Agent của Nokia N8 và cảnh báo nếu trang quá
nặng, dùng CSS mà Belle không hiểu (flex, grid, biến CSS), có script chèn thẳng
vào HTML, hoặc `s60.js` lỡ viết bằng cú pháp ES6 — WebKit 535 gặp một chữ
`const` là chết cả file mà chết im lặng.

`preview.js` dựng HTML của mọi trang ra thư mục `preview/` để xem trên máy tính,
không cần chạy máy chủ hay gọi YouTube. Mở `preview/sizes.html` là thấy các
trang trong khung 360×640 (N8) và 640×480 (E6) cạnh nhau. Đừng thu nhỏ cửa sổ
trình duyệt để thử màn 360: Chrome và Edge trên Windows không cho cửa sổ hẹp hơn
chừng 500 điểm, chúng vẽ ở 492 điểm rồi cắt bớt — trang trông như bị tràn dù
`@media` chưa hề được áp. Muốn thử tay thì dùng chế độ Responsive của devtools.
`test-login.js` chạy trọn luồng đăng nhập
bằng cookie giả rồi tự đăng xuất, nên không đụng tới cookie thật của bạn; nó
dựng hai "máy Nokia" song song để chắc chắn cookie máy này không dính sang máy
kia.
`test-convert.js` dựng một đoạn phim mẫu, dọn nó qua HTTP giống như YouTube vẫn
dọn luồng, rồi cho ffmpeg chạy y hệt lúc chạy thật — kiểm được cả độ phân giải,
profile H.264 Baseline lẫn vị trí khối `moov`. Hai bài đầu cần máy chủ đang
chạy; bài thứ ba thì không.

## Ghi chú

Dự án dành cho việc tự dùng với máy và tài khoản của chính bạn. Mở ra Internet
thì đọc kỹ mục [Mở ra Internet cho nhiều người](#mở-ra-internet-cho-nhiều-người):
máy chủ giữ phiên đăng nhập Google của mọi người vào trang, nên bạn đang gánh
trách nhiệm với tài khoản của họ.
