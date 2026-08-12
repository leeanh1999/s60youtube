#!/bin/sh
set -e

mkdir -p "${DATA_DIR:-/data}/cache" "${DATA_DIR:-/data}/devices"

# YouTube doi API luon, yt-dlp cu la hong ngay. Bat bien nay de tu cap nhat
# moi lan khoi dong container, khoi phai dung lai anh. Bo giai JavaScript
# (yt-dlp-ejs) di theo tung ban yt-dlp nen phai cap nhat cung mot luc.
if [ "${YTDLP_AUTO_UPDATE}" = "1" ]; then
  echo "Dang cap nhat yt-dlp..."
  pip install --no-cache-dir --break-system-packages --upgrade yt-dlp yt-dlp-ejs \
    || echo "Khong cap nhat duoc (mang?), dung ban co san."
fi

ejs=$(python3 -c "from importlib.metadata import version; print(version('yt-dlp-ejs'))" 2>/dev/null) \
  || ejs="chua co — may da dang nhap se khong lay duoc luong nao"

echo "yt-dlp $(yt-dlp --version 2>/dev/null || echo 'chua cai')"
echo "bo giai JS (yt-dlp-ejs) ${ejs}"
echo "ffmpeg  $(ffmpeg -version 2>/dev/null | head -n 1 | cut -d' ' -f3)"

exec node server.js
