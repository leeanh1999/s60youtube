#!/bin/sh
set -e

mkdir -p "${DATA_DIR:-/data}/cache"

# YouTube doi API luon, yt-dlp cu la hong ngay. Bat bien nay de tu cap nhat
# moi lan khoi dong container, khoi phai dung lai anh.
if [ "${YTDLP_AUTO_UPDATE}" = "1" ]; then
  echo "Dang cap nhat yt-dlp..."
  pip install --no-cache-dir --break-system-packages --upgrade yt-dlp \
    || echo "Khong cap nhat duoc (mang?), dung ban co san."
fi

echo "yt-dlp $(yt-dlp --version 2>/dev/null || echo 'chua cai')"
echo "ffmpeg  $(ffmpeg -version 2>/dev/null | head -n 1 | cut -d' ' -f3)"

exec node server.js
