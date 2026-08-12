# Anh chay tren NAS Synology (x86_64) lan cac may ARM64 nhu Raspberry Pi.
FROM node:22-alpine

# ffmpeg de chuyen ma, python3 + yt-dlp de lay luong, tini de nhan tin hieu dung.
# Dung ffmpeg cua he dieu hanh thay vi goi ffmpeg-static, vi goi do chi co ban x86.
# yt-dlp-ejs la bo giai cau do JavaScript cua YouTube: thieu no thi may da dang
# nhap khong lay duoc luong nao (Node lam noi chay san trong anh nay).
RUN apk add --no-cache \
      ffmpeg \
      python3 \
      py3-pip \
      tini \
      ca-certificates \
 && pip install --no-cache-dir --break-system-packages --upgrade yt-dlp yt-dlp-ejs

# CI truyen vao de trang Gioi thieu bao duoc dang chay ban nao —
# co the doi chieu sau khi cap nhat tren NAS.
ARG BUILD_VERSION=dev
ARG BUILD_DATE=

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    BUILD_VERSION=${BUILD_VERSION} \
    BUILD_DATE=${BUILD_DATE}

WORKDIR /app

# Chep manifest truoc de Docker dung lai lop cai dat khi chi doi ma nguon.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force

COPY . .

RUN mkdir -p /data/cache
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:${PORT}/ || exit 1

ENTRYPOINT ["/sbin/tini", "--", "sh", "/app/docker-entrypoint.sh"]
