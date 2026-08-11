# Anh chay tren NAS Synology (x86_64) lan cac may ARM64 nhu Raspberry Pi.
FROM node:22-alpine

# ffmpeg de chuyen ma, python3 + yt-dlp de lay luong, tini de nhan tin hieu dung.
# Dung ffmpeg cua he dieu hanh thay vi goi ffmpeg-static, vi goi do chi co ban x86.
RUN apk add --no-cache \
      ffmpeg \
      python3 \
      py3-pip \
      tini \
      ca-certificates \
 && pip install --no-cache-dir --break-system-packages --upgrade yt-dlp

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    FFMPEG_PATH=/usr/bin/ffmpeg

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
