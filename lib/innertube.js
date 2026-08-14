'use strict';

const config = require('./config');
const { TtlCache } = require('./cache');
const {
  collectRenderers,
  readText,
  parseDuration,
  isVideoId,
} = require('./util');

const API_BASE = 'https://www.youtube.com/youtubei/v1';
const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const CLIENT_VERSION = '2.20240614.01.00';

const listCache = new TtlCache(200);

// Token phan trang cua YouTube rat dai; giu trong RAM va chi dua ma ngan len URL.
const tokenStore = new Map();
let tokenSeq = 0;

function saveToken(token) {
  if (!token) return null;
  const id = `p${(tokenSeq += 1)}`;
  tokenStore.set(id, token);
  if (tokenStore.size > 2000) {
    const oldest = tokenStore.keys().next().value;
    tokenStore.delete(oldest);
  }
  return id;
}

function loadToken(id) {
  return id ? tokenStore.get(id) || null : null;
}

async function callApi(endpoint, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}/${endpoint}?key=${API_KEY}&prettyPrint=false`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': config.DESKTOP_UA,
        'Accept-Language': `${config.HL},en;q=0.8`,
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': CLIENT_VERSION,
        Origin: 'https://www.youtube.com',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: CLIENT_VERSION,
            hl: config.HL,
            gl: config.GL,
            userAgent: config.DESKTOP_UA,
          },
        },
        ...body,
      }),
    });
    if (!res.ok) throw new Error(`InnerTube ${endpoint} tra ve HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function mapVideoRenderer(renderer) {
  const id = renderer.videoId;
  if (!isVideoId(id)) return null;
  const lengthText =
    readText(renderer.lengthText) ||
    readText(
      (renderer.thumbnailOverlays || [])
        .map((o) => o.thumbnailOverlayTimeStatusRenderer)
        .find(Boolean)?.text
    );
  return {
    id,
    title: readText(renderer.title) || '(khong co tieu de)',
    author:
      readText(renderer.ownerText) ||
      readText(renderer.longBylineText) ||
      readText(renderer.shortBylineText),
    duration: parseDuration(lengthText),
    durationText: lengthText,
    views: readText(renderer.shortViewCountText) || readText(renderer.viewCountText),
    published: readText(renderer.publishedTimeText),
    live: Boolean(
      renderer.badges?.some?.(
        (b) => b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW'
      )
    ),
  };
}

/**
 * Bo cuc moi cua YouTube (2025 tro di) dung `lockupViewModel` thay cho
 * `videoRenderer`. Hai kieu nay ton tai song song tuy tung endpoint.
 */
function mapLockupViewModel(lockup) {
  if (lockup.contentType && lockup.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') {
    return null;
  }
  const id = lockup.contentId;
  if (!isVideoId(id)) return null;

  const metadata = lockup.metadata?.lockupMetadataViewModel || {};
  const rows = metadata.metadata?.contentMetadataViewModel?.metadataRows || [];
  const rowText = (index) =>
    (rows[index]?.metadataParts || [])
      .map((part) => part.text?.content)
      .filter(Boolean);

  const [views = '', published = ''] = rowText(1);
  const badges =
    lockup.contentImage?.thumbnailViewModel?.overlays?.flatMap(
      (overlay) => overlay.thumbnailBottomOverlayViewModel?.badges || []
    ) || [];
  const durationText = badges
    .map((badge) => badge.thumbnailBadgeViewModel?.text)
    .find((text) => text && /^\d+(:\d+)+$/.test(text));

  return {
    id,
    title: metadata.title?.content || '(khong co tieu de)',
    author: rowText(0).join(' '),
    duration: parseDuration(durationText),
    durationText: durationText || '',
    views,
    published,
    live: false,
  };
}

function extractVideos(json) {
  const seen = new Set();
  const videos = [];

  const push = (video) => {
    if (video && !seen.has(video.id)) {
      seen.add(video.id);
      videos.push(video);
    }
  };

  for (const key of ['videoRenderer', 'compactVideoRenderer', 'gridVideoRenderer']) {
    for (const renderer of collectRenderers(json, key)) push(mapVideoRenderer(renderer));
  }
  for (const lockup of collectRenderers(json, 'lockupViewModel')) {
    push(mapLockupViewModel(lockup));
  }

  return videos;
}

function extractContinuation(json) {
  const commands = collectRenderers(json, 'continuationCommand');
  const token = commands.map((c) => c.token).find(Boolean);
  return token || null;
}

async function search(query, pageId) {
  const token = loadToken(pageId);
  const key = `search:${config.HL}:${query}:${pageId || ''}`;
  return listCache.wrap(key, config.LIST_TTL_MS, async () => {
    const json = await callApi(
      'search',
      token ? { continuation: token } : { query, params: 'EgIQAQ%3D%3D' }
    );
    return {
      videos: extractVideos(json),
      nextPage: saveToken(extractContinuation(json)),
    };
  });
}

/**
 * Ten video, ten kenh, luot xem va mo ta — nam san trong cung cai tra loi
 * `next` ma minh vua goi de lay video lien quan.
 *
 * Cho nay dang gia: no den sau nua giay, trong khi yt-dlp phai vai giay. Nho
 * no ma trang video ve duoc ngay ma khong phai cho danh sach luong (xem
 * server.js), va lay khong ton them mot lan goi mang nao.
 *
 * Luot xem giu nguyen chuoi YouTube da viet san ('1.234 lượt xem'): ban rut
 * gon cua tieng Viet la '1,2 N' — cat chu ra de doi thanh so la ra 12.
 */
function extractMeta(json) {
  const blocks = json.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
  const primary = blocks.map((b) => b.videoPrimaryInfoRenderer).find(Boolean);
  const secondary = blocks.map((b) => b.videoSecondaryInfoRenderer).find(Boolean);
  const owner = secondary?.owner?.videoOwnerRenderer;
  const counter = primary?.viewCount?.videoViewCountRenderer;
  return {
    title: readText(primary?.title) || '',
    author: readText(owner?.title) || '',
    views: readText(counter?.viewCount) || readText(counter?.shortViewCount) || '',
    description:
      secondary?.attributedDescription?.content || readText(secondary?.description) || '',
  };
}

/** Video lien quan + thong tin co ban, lay tu endpoint `next`. */
async function related(videoId) {
  return listCache.wrap(`next:${videoId}`, config.LIST_TTL_MS, async () => {
    const json = await callApi('next', { videoId });
    return {
      videos: extractVideos(json).filter((v) => v.id !== videoId),
      video: extractMeta(json),
    };
  });
}

module.exports = { search, related };
