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
| Python 3 + yt-dlp | `python -m pip install --upgrade yt-dlp yt-dlp-ejs` |
| ffmpeg | tự có sẵn qua gói `ffmpeg-static` khi `npm install` |
| Máy tính và điện thoại chung một WiFi | |

`yt-dlp-ejs` là bộ giải câu đố JavaScript của YouTube. Xem video khi **chưa**
đăng nhập thì không cần nó, nhưng máy đã nạp cookie thì thiếu nó là không lấy
được luồng nào — xem [Khi gặp trục trặc](#khi-gặp-trục-trặc).

## Cài đặt

```bash
npm install
python -m pip install --upgrade yt-dlp yt-dlp-ejs
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
- `YTDLP_AUTO_UPDATE=1` cho container tự cập nhật yt-dlp (và `yt-dlp-ejs`) mỗi
  lần khởi động. YouTube đổi API liên tục, yt-dlp cũ là hỏng ngay, nên cứ để bật.
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

### Giữ đăng nhập khi thoát trình duyệt — địa chỉ ghi nhớ

Mã thiết bị nằm trong cookie trình duyệt, hạn một năm, và mỗi lần mở trang là hạn
đó lại lùi ra một năm nữa — máy dùng hằng ngày thì không bao giờ phải đăng nhập
lại. Hạn ghi bằng **cả hai cách**: `Max-Age` cho máy đời mới và `Expires` kiểu
Netscape cho Nokia Browser. Bản WebKit đời Symbian chỉ đọc `Expires`; chỉ ghi
`Max-Age` thì nó coi đây là cookie phiên, **thoát trình duyệt là mất** và điện
thoại lại hỏi đăng nhập từ đầu.

Có máy vẫn dọn sạch cookie lúc thoát (đặt trong *Cài đặt › Riêng tư* của trình
duyệt, hay bộ nhớ đầy). Cho trường hợp đó, trang **Đăng nhập** của máy đã đăng
nhập có thêm mục **Ghi nhớ máy này**: bấm vào, rồi lưu **đúng trang vừa mở** vào
Bookmark (*Tuỳ chọn › Bookmark › Lưu làm bookmark*). Địa chỉ của nó,
`/remember?d=<mã máy>`, mang sẵn mã thiết bị — lần nào trình duyệt quên thì mở
bookmark ấy một lần là máy chủ nhận lại tài khoản, khỏi lấy mã và nộp cookie từ
máy tính lần nữa. Trang đó cố tình **không chuyển hướng** đi đâu, để địa chỉ còn
nguyên trên thanh địa chỉ mà lưu.

Địa chỉ ghi nhớ chính là chìa khoá của máy đó: ai mở được nó cũng xem YouTube
bằng tài khoản của bạn, đúng như ai cầm được cookie trình duyệt của máy. Nó chỉ
hiện trên trang Đăng nhập của chính máy đó, và **Xoá đăng nhập khỏi máy này** làm
nó chết ngay.

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
| Địa chỉ ghi nhớ (`/remember?d=`) | Chính là mã thiết bị, chỉ hiện trên trang Đăng nhập của máy đó | Y như cầm được cookie của máy: xem bằng tài khoản đó, và nạp cookie khác hay xoá đăng nhập được |
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
  ra ngay tại chỗ, không phải rời trang đang xem. **Bấm lại kính lúp là đóng
  khung** — đang mở thì kính lúp có nền đậm hơn để biết đường ra. Đang xem kết
  quả mà mở lại thì từ khoá cũ còn nguyên trong ô, sửa tiếp là tìm lại.
- Dán thẳng link YouTube vào khung đó cũng mở đúng video đó.
- Phím **lên / xuống** nhảy hẳn sang khối video kế tiếp, không phải lết con trỏ
  từng chút như mặc định của trình duyệt.
- Phím **trái / phải** là lùi và tiến: đang đứng trong một hàng ngang (bốn ô chân
  trang, hay **Quay lại** với kính lúp ở thanh trên) thì đi trong hàng đó; đang
  trong danh sách thì phải là xuống cuối, trái là về đầu — ở trang kết quả tìm,
  bấm phải một cái là tới thẳng **Trang sau**.
- Phím tắt: `0` về trang chính, `1`–`9` chọn mục, `*` mở khung tìm, `#` sang trang
  sau.

Trang video mở ra là có sẵn khung phát ngay trên trang. Bấm nút phát là xem được
luôn: máy chỉ kéo phần đang xem chứ không tải cả file, xem xong không còn gì
trong bộ nhớ máy. Trình duyệt của Belle (Nokia Browser 7.4 trở lên) đọc được thẻ
`<video>` với H.264/MP4 nên làm được như vậy; máy đời cũ hơn không hiểu thẻ này
sẽ thấy một liên kết thường ở chỗ đó.

### Chọn độ phân giải ngay trên trang video

Ngay dưới khung phát là một hàng các mức xem được của **chính video đó**, bấm
một cái là khung phát đổi sang mức ấy (`/watch?v=<mã>&q=720`). Không phải cài
đặt, không nhớ gì cho lần sau: mỗi video một lựa chọn.

Hàng này khác nhau tuỳ máy, vì đằng sau hai mức là hai đường hoàn toàn khác:

| Mức | Đường đi | Tua được | Ai thấy |
| --- | --- | --- | --- |
| 360p (và 720p ở video cũ) | YouTube có sẵn file MP4 gộp cả hình lẫn tiếng, máy chủ dọn thẳng đi | Có | Mọi máy |
| 480p, 720p, 1080p | Hình và tiếng nằm rời, máy chủ ghép ngay lúc phát | Không | Máy đời mới |

Mức mặc định luôn là bản **gộp sẵn** cao nhất — nhẹ nhất và tua được. Máy Nokia
thì chặn ở 360p cho vừa màn 640×480; máy tính hay điện thoại đời mới lấy bản gộp
sẵn cao nhất còn lại, rồi muốn nét hơn thì bấm sang 720p hay 1080p.

Đường ghép (`/hd/<mã>/<độ phân giải>`) cho ffmpeg chép hai luồng vào chung một
vỏ MP4 **phân mảnh** rồi đổ thẳng ra máy, không qua file nào: bấm là chạy. Chỉ
chép chứ không mã hoá nên NAS chip ARM vẫn kịp. Đổi lại vỏ phân mảnh không có
chỉ mục cho cả file nên **không tua được**, và máy Symbian không đọc được nó —
vì vậy các mức này chỉ hiện cho máy đời mới, nhận theo tên máy trong `User-Agent`.
Muốn vừa nét vừa tua được thì dùng mục **Tạo bản 720p tua được** ở dưới: cũng
ghép, nhưng ghép ra file thật nên chờ vài giây.

Dưới khung phát còn mấy lựa chọn:

| Lựa chọn | Dành cho | Phải chờ |
| --- | --- | --- |
| Nghe ngay — chỉ tiếng | Nghe nhạc, tốn rất ít dung lượng | Không |
| Bản nhẹ 240p | Mạng yếu, xem online hay khựng | Vài giây |
| Tạo bản 720p tua được | Máy đời mới, muốn nét mà vẫn tua được | Vài giây |

**Nghe ngay** không chờ giây nào vì YouTube đã sẵn luồng AAC trong vỏ MP4
(itag 140) — đúng thứ máy Symbian nghe được, nên máy chủ chỉ dọn thẳng nó đi.

**Bản nhẹ 240p** thì máy chủ phải ghép một file, nhưng chỉ ghép chứ không mã
hoá. Nokia ghi rõ E6 đọc được H.264 cả ba profile (base, main, high) tới 720p,
mà YouTube vốn đã có sẵn luồng hình H.264 240p và luồng tiếng AAC — nên ffmpeg
chỉ cần chép hai luồng đó vào chung một vỏ MP4 (`-c copy`). Chép dữ liệu thì
nghẽn ở mạng chứ không đụng CPU, xong trong vài giây kể cả trên NAS chip ARM.

**Tạo bản 720p tua được** chỉ hiện cho máy đời mới — màn 640×480 của Symbian
không dùng tới 720p. Nó cũng là ghép chứ không mã hoá, chỉ khác chỗ lấy luồng
hình H.264 720p thay vì 240p, và ghép ra file thật nên có chỉ mục để tua.

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

Độ phân giải thì không nằm ở đây: nó là chuyện của từng video (video này có mức
nào, máy đang xem đọc được mức nào) chứ không phải một thói quen chung, nên chọn
ngay trên trang video — xem [Chọn độ phân giải ngay trên trang video](#chọn-độ-phân-giải-ngay-trên-trang-video).

Trình duyệt Symbian^3 trở lên (Nokia Browser 7.x/8.x, nền WebKit 533–535) đọc
được HTML5, CSS3 cơ bản và JavaScript. **Riêng SVG thì không**: bản WebKit ấy
được dựng không kèm bộ vẽ SVG, nên đặt `<svg>` thẳng vào trang thì nó không báo
lỗi gì mà cũng không vẽ gì — trên máy thật mọi chỗ có biểu tượng chỉ còn là
khoảng trống. Opera Mobile 12 vẽ được, nhưng không thể để trình duyệt chính của
máy thành ra trang trơ.

Nên biểu tượng **vẽ sẵn bằng SVG mà gửi ra máy là ảnh PNG**: `lib/icons.js` giữ
24 hình dưới dạng một dòng chữ `<path>` (dạng dễ sửa nhất, đọc ra được), còn
`lib/raster.js` tô chúng thành PNG ngay trên máy chủ — phân tích đường, cắt cung
tròn thành đoạn thẳng, tô theo dòng quét với bốn dòng mẫu mỗi điểm ảnh cho rìa
mịn, rồi tự đóng file PNG bằng `zlib` có sẵn của Node. Không thêm thư viện ảnh
nào, và không phải vẽ tay 24 hình bằng từng điểm ảnh. Đây cũng là lý do không
dùng ký tự đặc biệt (▶ ★ ♪) thay hình: font máy thiếu ký tự là hiện ra ô vuông,
còn ảnh thì máy Symbian đời nào cũng mở được.

Ảnh tô ở cỡ **32 điểm**, tức mọi chỗ dùng đều là thu nhỏ lại — kích thước vẫn đo
bằng `em` nên đổi cỡ chữ là hình to nhỏ theo, mà máy nào thu nhỏ thô đến đâu cũng
còn ra hình (phóng to lên thì hình bẹt ngay). Chỗ dùng cần hình to nhất là bốn ô
chân trang: 1,05 lần cỡ chữ gốc, tức 27 điểm khi chọn chữ *Rất lớn*.

Bản SVG cũ tô bằng `currentColor` nên tự ăn theo màu chữ của nơi đặt nó; ảnh thì
không, **màu phải nằm trong tên file**: `/i/warn-amber.png`, `/i/home-gray.png`.
Bảng `TINTS` trong `lib/icons.js` có bảy màu và phải đúng y màu chữ trong
`s60.css`. Mỗi ảnh chừng 300 byte, tô một lần rồi giữ trong bộ nhớ máy chủ (cả
bộ 24 hình × 7 màu chưa tới 60KB), và địa chỉ mang sẵn mã của cả bộ hình nên
điện thoại giữ được cả tháng trong bộ đệm: sửa hình là mã đổi, máy tải lại đúng
một lần.

Thanh đỏ trên đầu và thanh bốn ô ở chân trang **dán vào khung nhìn**, cuộn thế
nào cũng còn đó. Chỗ này không dám tin `position: fixed`: nhiều bản WebKit đời
Symbian nhận thuộc tính đó rồi xử lý như `absolute` — thanh dán vào trang chứ
không vào khung nhìn, cuộn xuống là nó trôi mất, tính ra còn tệ hơn không dán.
Nên `s60.js` **đo thật**: đặt hai ô tí hon sát đỉnh, một `fixed` một `absolute`,
cuộn đi bốn điểm rồi xem toạ độ của chúng so với khung nhìn, đo xong trả lại chỗ
cũ ngay. Ô `absolute` là **thước đo của chính phép đo**: nó phải trôi lên đúng
bốn điểm; đúng thì ô `fixed` không nhích nghĩa là máy dán thật.

Ô `absolute` không trôi thì phép đo không nói lên điều gì cả, và lúc đó câu trả
lời là **không dán**: chỉ dán khi có bằng chứng dán được thật. Tin theo lời máy
khai (`getComputedStyle` báo `fixed`) thì đúng phải họ "nhảy" nói ngay dưới đây.

**Opera Mobile 12 không được dán, dù nó khai là biết `fixed`.** Nền Presto —
nền của Opera Mobile và Opera Mini — không dán thật: cuộn thì lớp dán vẫn đi theo
trang, rồi chừng nửa giây sau khi tay rời màn hình nó mới nhảy về chỗ đúng. Đó là
cách Presto được viết chứ không phải lỗi trang ([quirksmode đo đúng máy Opera
Mobile 12](https://www.quirksmode.org/css/css2/mobile.html) cũng thấy vậy), nên
trang không sửa được. Để dán thì thanh vừa trôi theo trang vừa nhảy giật, và nó
nhảy đè lên giữa danh sách chứ không phải chỗ đã chừa sẵn — tệ hơn hẳn là không
dán. Chỗ này đo bằng JavaScript không ra (lúc đang đo thì trang không cuộn, mà
máy vẫn báo hiệu `fixed` thật), nên `s60.js` **nhận theo tên máy**: `Opera Mobi`,
`Opera Mini`, `Presto` thì bỏ hẳn việc dán, không đo và không nhớ gì. Nhận theo
tên máy là việc thường phải tránh, riêng đây thì được: Presto là một nền đã dừng
hẳn từ 2013, không bản nào ra thêm để mà đổi tính này. Opera đời Blink (`OPR/...`)
không mang tên nào trong số đó nên vẫn dán như mọi trình duyệt mới. Trên Opera
Mobile hai thanh nằm trong dòng chảy: thanh trên cuộn mất, chân trang đợi ở cuối —
kém dán, nhưng cuộn đến đâu cũng thấy đúng chỗ đó.

Đo đúng thì mới đặt lớp `fixnav` vào `<body>`, chừa sẵn khoảng trống ở đỉnh và ở
cuối trang cho khỏi che chữ, và thu hai thanh gọn lại (E6 chỉ cao 480 điểm, hai
thanh ăn chừng 80 điểm là vừa). Đo sai thì bỏ qua, hai thanh nằm trong dòng chảy
như cũ. Kết quả đo nhớ trong `localStorage` nên các trang sau không phải cuộn thử
lại — tên khoá mang số 2, vì cách đo đã đổi một lần mà kết quả của bản cũ còn nằm
trong máy người dùng, đổi tên khoá là máy đo lại một lần. Phím lên/xuống cũng
biết chừa: khối vừa nhảy tới mà nằm khuất sau thanh nào thì trang cuộn thêm đúng
phần bị che.

Kính lúp **nằm trong hàng nhảy của phím lên/xuống**, dù nó đã có phím tắt `*`
riêng. Trước có bỏ nó ra ngoài hàng cho khỏi tốn một lần bấm ở mỗi trang, nhưng
máy nào bấm `*` không tiện thì thành ra không còn đường nào tới chỗ tìm kiếm. Chỉ
tên trang bên trái là vẫn đứng ngoài hàng: nó chỉ là đường về trang chính, mà chân
trang đã có sẵn ô **Trang chính** rồi.

Trái/phải thì khó hơn, vì danh sách xếp một cột nên phần lớn trang **không có gì
nằm ngang thật** — để mặc trình duyệt thì hai phím này bấm như không, mà trên máy
Nokia phím nào cũng đắt. Cho chúng đúng một nghĩa là **lùi và tiến theo thứ tự
trang**, rồi tuỳ chỗ đang đứng mà ra việc: đang trong một hàng ngang thì đi trong
hàng đó và không nhảy ra ngoài; đang trong danh sách thì phải là xuống mục cuối,
trái là về mục đầu; đã ở đầu rồi mà còn bấm trái thì ra **Quay lại** ở thanh trên.
Hàng ngang không đọc theo thẻ `<tr>` mà **đo toạ độ thật**: chân trang đúng là một
bảng, nhưng *Quay lại* với kính lúp chỉ là hai thẻ `<a>` nằm cạnh nhau trong một ô,
hai thứ coi là cùng hàng khi phần chồng nhau theo chiều dọc ăn quá nửa cái thấp
hơn. Cả hai phím chỉ **đưa con trỏ tới** chứ không bấm hộ: phím mũi tên rất dễ chạm
phải, lỡ tay mà nó chuyển trang luôn thì khó chịu.

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

**Bấm lại kính lúp là đóng khung**, trong khung không có nút đóng riêng. Một nút
đóng riêng thì thành hai đường làm một việc, mà thêm dòng nào trong khung cũng ăn
mất một dòng của danh sách video ngay bên dưới. Đang mở thì kính lúp được tô nền đỏ
đậm cho ra dáng đang ấn xuống — đó là chỗ chỉ đường ra, không có nó thì người dùng
mở khung lên rồi không biết đóng bằng cách nào. Khung luôn nằm **dưới** thanh chứ
không đè lên, nên kính lúp lúc nào cũng lộ ra để bấm lần nữa. Nút gửi trong khung
thì ngược lại thanh trên, là chữ **Tìm kiếm** hẳn hoi: chỗ này không chật nên không
phải tiết kiệm bề ngang — ngay cả ở cỡ chữ Rất lớn trên màn 360 điểm, ô nhập vẫn
còn 211 điểm.

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

### Trang nặng bao nhiêu byte

E6 đi Wi-Fi 802.11b/g và vẽ trang bằng chip 680MHz, nên byte nào cũng đắt. Bốn chỗ
tiết kiệm:

**Nén gzip.** Trang chính 4,3KB còn 1,4KB; trang kết quả tìm 7,6KB còn 1,9KB;
`s60.css` với `s60.js` cộng lại 38KB còn 12KB. Nokia Browser tự khai
`Accept-Encoding: gzip` và giải đúng, nhưng máy chủ chỉ nén khi máy có khai — máy
nào không nói thì vẫn nhận bản trần. Hai file tĩnh nén một lần rồi giữ luôn bản nén
trong bộ nhớ, vì địa chỉ của chúng đã mang `?v=<mã nội dung>`: đổi file là đổi mã.

**Biểu tượng ra khỏi HTML.** Hồi còn đặt `<svg>` thẳng trong trang, riêng hình vẽ
đã chiếm gần 3KB của mỗi lần tải trang, lần nào cũng phải tải lại vì nó là một
phần của HTML. Giờ là ảnh PNG chừng 300 byte một hình: lần đầu vào trang máy gọi
thêm chừng mười mấy lần cho hết bộ hình cần dùng, rồi giữ cả tháng trong bộ đệm
nên các trang sau không tốn byte nào cho biểu tượng nữa.

**Ảnh thu nhỏ thu về đúng bề ngang cần hiện.** Ảnh `mqdefault` của YouTube rộng
320 điểm, còn khung ảnh trên trang chỉ rộng chừng 160 — máy đang tải gấp bốn số
điểm ảnh cần thiết rồi còn phải tự thu nhỏ lại. Máy chủ thu sẵn về 192 điểm bằng
ffmpeg (đủ cho cả cỡ chữ *Rất lớn*), thường bớt được một nửa số byte. Không có
ffmpeg, hay ffmpeg trả về thứ gì không phải JPEG, thì dùng ảnh gốc — thừa byte chứ
không mất ảnh.

**Ảnh đệm trên máy chủ.** Một trang danh sách là mười mấy ảnh, mỗi cái một lần gọi
ra `i.ytimg.com`, và đó là phần chờ lâu nhất của trang. Bản đã thu nhỏ nằm trong bộ
nhớ máy chủ một ngày, và trong bộ đệm của điện thoại một tuần.

**Phím lên/xuống không đo lại cả trang mỗi lần bấm.** Danh sách điểm dừng phải hỏi
`offsetParent` của từng thẻ `<a>`, mỗi lần hỏi là một lần bắt trình duyệt tính lại
bố cục; mà một lần bấm phím trước đây phải đo tới ba lượt như vậy. Trang không tự
thêm bớt liên kết nào nên `s60.js` nhớ luôn danh sách đó, chỉ đo lại khi máy xoay
màn hình.

Còn một chỗ chờ nữa không nằm ở byte: trang chính phải gọi `yt-dlp` để lấy gợi ý
riêng, mất khoảng hai giây cho lần đầu trong mỗi 10 phút. Đặt `HOME_FEED=0` là
trang chính mở tức thì, chỉ còn danh sách chủ đề.

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
| `YTDLP_AUTO_UPDATE` | trống | Đặt `1` để container tự cập nhật yt-dlp và `yt-dlp-ejs` lúc khởi động |
| `YTDLP_REMOTE_EJS` | `1` | Cho yt-dlp tải bộ giải JavaScript từ GitHub khi bản cài sẵn thiếu hoặc quá cũ; đặt `0` để cấm hẳn |

## Khi gặp trục trặc

**Điện thoại không mở được trang.** Tường lửa Windows thường chặn kết nối vào.
Mở cổng một lần bằng PowerShell quyền quản trị:

```powershell
New-NetFirewallRule -DisplayName "YouTube S60" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

**"YouTube đang đòi đăng nhập từ máy chủ này."** Máy này chưa nạp cookie, hoặc
cookie của nó đã hết hạn — vào mục **Đăng nhập** trên chính chiếc máy đó rồi nạp
lại. Cookie của máy khác không cứu được máy này.

**Cứ thoát trình duyệt là phải đăng nhập lại từ đầu.** Máy mất mã thiết bị nên máy
chủ coi nó là máy mới, còn file cookie thì vẫn nằm nguyên trên đĩa. Mở mục **Đăng
nhập** rồi bấm **Ghi nhớ máy này** và lưu trang đó vào Bookmark — lần sau mở
bookmark ấy là vào lại được, xem mục *Giữ đăng nhập khi thoát trình duyệt* ở trên.
Nếu bản đang chạy cũ hơn bản có mục đó thì cập nhật máy chủ trước: bản cũ ghi hạn
cookie bằng `Max-Age`, mà trình duyệt Symbian không đọc thuộc tính đó.

**Đang đăng nhập tự nhiên thành chưa đăng nhập.** Ngoài nguyên nhân trên, còn có
thể điện thoại bị xoá dữ liệu duyệt web, hoặc cookie của máy đó đã quá
`DEVICE_TTL_DAYS` ngày không dùng nên máy chủ dọn đi (lúc đó địa chỉ ghi nhớ cũng
không cứu được, phải nạp lại).

**"Không kết nối được tới YouTube."** Máy chủ không ra được mạng. Nếu mạng công ty
chặn YouTube thì phải bật VPN trên máy tính (điện thoại thì không cần).

**Vừa nạp cookie đăng nhập xong là video nào cũng báo "YouTube không trả về
luồng nào", trong khi trước đó chưa đăng nhập vẫn xem được.** Máy chủ thiếu
`yt-dlp-ejs`. Khi không có cookie, yt-dlp lấy luồng bằng máy khách `android_vr`
và địa chỉ ra thẳng, không khoá. Có cookie thì máy khách đó bị bỏ (nó không nhận
cookie) và yt-dlp chuyển sang `tv`/`web creator` — hai cái này bắt giải một đoạn
JavaScript của YouTube trước, không giải được thì danh sách định dạng rỗng. Cài
bộ giải là xong:

```bash
python -m pip install --upgrade yt-dlp yt-dlp-ejs
```

Chạy Docker thì chỉ cần khởi động lại container (ảnh đã cài sẵn, và
`YTDLP_AUTO_UPDATE=1` giữ cho nó theo kịp yt-dlp). Muốn xem đúng lỗi gì thì chạy
tay trong container:

```bash
docker exec s60youtube yt-dlp --cookies /data/devices/<mã máy>.txt \
  -F "https://www.youtube.com/watch?v=jNQXAC9IVRw"
```

Thấy dòng `challenge solving failed` hay `wiki/EJS` là đúng bệnh này.

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

**Trình duyệt gốc của máy không hiện biểu tượng nào, chỗ nào có hình cũng là
khoảng trống.** Máy chủ đang chạy bản cũ, bản còn đặt `<svg>` thẳng vào trang —
trình duyệt Symbian không có bộ vẽ SVG nên nó bỏ qua im lặng. Cập nhật máy chủ:
bản mới gửi biểu tượng dưới dạng ảnh PNG. Kiểm nhanh bằng cách mở
`http://<máy chủ>:8080/i/home-red.png` trên điện thoại — phải thấy hình ngôi nhà
màu đỏ.

**Mở bằng Opera Mobile 12 thì thanh trên và chân trang không dán.** Đúng như
thiết kế. Nền Presto của Opera Mobile không dán thật: nếu dán thì cuộn tới đâu
thanh cũng đi theo trang tới đó, ngừng cuộn chừng nửa giây nó mới nhảy về chỗ
đúng — và nhảy đè lên giữa danh sách. Nên trên Opera Mobile hai thanh để nằm
trong dòng chảy, cuộn đến đâu thấy đúng chỗ đó. Muốn có thanh dán thì mở bằng
trình duyệt gốc của máy (Nokia Browser đời Belle) — máy đó dán thật.

## Kiểm thử nhanh

```bash
node tools/smoke.js
node tools/test-login.js
node tools/test-convert.js
node tools/test-pin.js
node tools/preview.js
```

`smoke.js` gọi các trang bằng User-Agent của Nokia N8 và cảnh báo nếu trang quá
nặng, dùng CSS mà Belle không hiểu (flex, grid, biến CSS), có script chèn thẳng
vào HTML, có `<svg>` đặt thẳng trong trang (trình duyệt gốc không vẽ được, xem
mục [Cài đặt riêng](#cài-đặt-riêng)), hoặc `s60.js` lỡ viết bằng cú pháp ES6 —
WebKit 535 gặp một chữ `const` là chết cả file mà chết im lặng. Nó cũng gọi thử
một biểu tượng để chắc máy chủ còn tô được ảnh PNG.

Với `s60.css` nó còn soi dấu chú thích lẻ: một chú thích đóng sớm (lỡ có `*/` ở
giữa) thì trình duyệt không báo gì cả, nó bỏ đoạn chữ rồi **nuốt luôn quy tắc
ngay sau đó** — nhìn mã nguồn vẫn thấy đủ mà trên máy thì mất một mục bố cục.

`preview.js` dựng HTML của mọi trang ra thư mục `preview/` để xem trên máy tính,
không cần chạy máy chủ hay gọi YouTube. Mở `preview/sizes.html` là thấy các
trang trong khung 360×640 (N8) và 640×480 (E6) cạnh nhau. Đừng thu nhỏ cửa sổ
trình duyệt để thử màn 360: Chrome và Edge trên Windows không cho cửa sổ hẹp hơn
chừng 500 điểm, chúng vẽ ở 492 điểm rồi cắt bớt — trang trông như bị tràn dù
`@media` chưa hề được áp. Muốn thử tay thì dùng chế độ Responsive của devtools.
`test-login.js` chạy trọn luồng đăng nhập
bằng cookie giả rồi tự đăng xuất, nên không đụng tới cookie thật của bạn; nó
dựng hai "máy Nokia" song song để chắc chắn cookie máy này không dính sang máy
kia, và dựng thêm một "máy vừa bị trình duyệt xoá cookie" để thử địa chỉ ghi nhớ.
`test-convert.js` dựng một đoạn phim mẫu, dọn nó qua HTTP giống như YouTube vẫn
dọn luồng, rồi cho ffmpeg chạy y hệt lúc chạy thật — kiểm được cả độ phân giải,
profile H.264 Baseline lẫn vị trí khối `moov`.

`test-pin.js` chạy chính `public/s60.js` trên sáu chiếc "máy giả": máy dán thật,
máy nhận `fixed` rồi xử lý như `absolute`, máy không biết `fixed`, hai kiểu "đo
không được", và một máy khai tên Opera Mobile — máy này đo cái gì cũng đẹp như
máy dán thật mà vẫn phải ra "không dán", vì Presto chỉ nhảy về chỗ đúng sau khi
ngừng cuộn. Chỗ này không thể thử bằng mắt trên máy tính
vì trình duyệt nào trên máy tính cũng dán đúng, nên mọi lỗi chỉ lộ ra trên điện
thoại. Hai bài đầu cần máy chủ đang chạy; hai bài sau thì không.

## Ghi chú

Dự án dành cho việc tự dùng với máy và tài khoản của chính bạn. Mở ra Internet
thì đọc kỹ mục [Mở ra Internet cho nhiều người](#mở-ra-internet-cho-nhiều-người):
máy chủ giữ phiên đăng nhập Google của mọi người vào trang, nên bạn đang gánh
trách nhiệm với tài khoản của họ.
