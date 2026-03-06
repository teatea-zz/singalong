// content.js — 가사 바 렌더링 & 싱크 로직
// YouTube / Spotify Web Player 지원
// 비플랫폼 탭에서는 background.js로부터 현재 가사를 받아 바만 표시

// ─── 상태 ──────────────────────────────────────────────────────────────────
let isEnabled = false;
let lyrics = [];       // [{ time: number (초), text: string }]
let currentIndex = -1;
let syncTimer = null;
let syncOffset = 0;    // 싱크 오프셋 (초 단위, ±0.5씩 조절)

// ─── 플랫폼 감지 ────────────────────────────────────────────────────────────
function getPlatform() {
  if (location.hostname.includes('youtube.com')) return 'youtube';
  if (location.hostname.includes('spotify.com')) return 'spotify';
  return null;
}

const platform = getPlatform();

// ─── 가사 바 DOM ────────────────────────────────────────────────────────────
function createBar() {
  const bar = document.createElement('div');
  bar.id = 'singalong-bar';
  bar.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 64px;
    background: rgba(0, 0, 0, 0.88);
    color: #fff;
    font-family: sans-serif;
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 0 12px;
    gap: 8px;
    z-index: 2147483647;
    pointer-events: none;
    letter-spacing: 0.03em;
    transition: opacity 0.2s;
    box-sizing: border-box;
  `;

  // 좌측: 아티스트 / 곡명
  const info = document.createElement('div');
  info.id = 'singalong-info';
  info.style.cssText = `
    flex: 0 0 auto;
    max-width: 18%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    line-height: 1.3;
  `;
  const infoArtist = document.createElement('div');
  infoArtist.id = 'singalong-artist';
  infoArtist.style.cssText = 'font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
  const infoTitle = document.createElement('div');
  infoTitle.id = 'singalong-title';
  infoTitle.style.cssText = 'font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.75); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
  info.appendChild(infoArtist);
  info.appendChild(infoTitle);

  // 중앙: 현재 가사
  const lyricEl = document.createElement('div');
  lyricEl.id = 'singalong-current';
  lyricEl.style.cssText = `
    flex: 1 1 auto;
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;

  // 우측: 버튼 3종
  const controls = document.createElement('div');
  controls.id = 'singalong-controls';
  controls.style.cssText = `
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 4px;
    pointer-events: auto;
  `;

  const btnStyle = `
    background: none;
    border: none;
    color: rgba(255,255,255,0.6);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background 0.15s;
    font-size: 13px;
    line-height: 1;
  `;

  // 가사 새로고침 버튼
  const btnRefresh = document.createElement('button');
  btnRefresh.id = 'singalong-btn-refresh';
  btnRefresh.title = '가사 새로고침';
  btnRefresh.style.cssText = btnStyle;
  btnRefresh.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;

  // 싱크 − 버튼
  const btnMinus = document.createElement('button');
  btnMinus.id = 'singalong-btn-minus';
  btnMinus.title = '가사 0.5초 늦추기';
  btnMinus.style.cssText = btnStyle;
  btnMinus.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  // 싱크 + 버튼
  const btnPlus = document.createElement('button');
  btnPlus.id = 'singalong-btn-plus';
  btnPlus.title = '가사 0.5초 앞당기기';
  btnPlus.style.cssText = btnStyle;
  btnPlus.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  // 닫기 버튼
  const btnClose = document.createElement('button');
  btnClose.id = 'singalong-btn-close';
  btnClose.title = '닫기';
  btnClose.style.cssText = btnStyle;
  btnClose.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  // 버튼 hover 효과
  [btnRefresh, btnMinus, btnPlus, btnClose].forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.color = '#fff';
      btn.style.background = 'rgba(255,255,255,0.15)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color = 'rgba(255,255,255,0.6)';
      btn.style.background = 'none';
    });
  });

  // 버튼 클릭 핸들러
  btnRefresh.addEventListener('click', () => {
    lastFetchKey = '';
    lastTitle = '';
    const info = getNowPlaying();
    if (info) fetchLyrics(info.title, info.titleAlt, info.artist, info.artistAlt);
  });
  btnMinus.addEventListener('click', () => { syncOffset -= 0.5; });
  btnPlus.addEventListener('click', () => { syncOffset += 0.5; });
  btnClose.addEventListener('click', () => {
    disable();
    chrome.storage.local.set({ enabled: false });
  });

  controls.appendChild(btnRefresh);
  controls.appendChild(btnMinus);
  controls.appendChild(btnPlus);
  controls.appendChild(btnClose);

  bar.appendChild(info);
  bar.appendChild(lyricEl);
  bar.appendChild(controls);
  document.body.appendChild(bar);
  return bar;
}

function getBar() {
  return document.getElementById('singalong-bar') || createBar();
}

function showBar() {
  getBar().style.opacity = '1';
}

function hideBar() {
  const bar = document.getElementById('singalong-bar');
  if (bar) bar.style.opacity = '0';
}

function setTrackInfo(artist, title) {
  getBar();
  const elArtist = document.getElementById('singalong-artist');
  const elTitle = document.getElementById('singalong-title');
  if (elArtist) elArtist.textContent = artist || '';
  if (elTitle) elTitle.textContent = title || '';
}

function setLyricLine(current) {
  getBar();
  const el = document.getElementById('singalong-current');
  if (el) el.textContent = current || '';
}

// ─── YouTube 영상 제목 파싱 ─────────────────────────────────────────────────
function parseYouTubeTitle(raw, channelName) {
  const stripSuffix = (s) => {
    let alt = null;
    const altMatch = s.match(/\p{Script=Hangul}[^(]*\(([A-Za-z0-9 .,'-]+)\)/u);
    if (altMatch) alt = altMatch[1].trim();

    const cleaned = s
      .replace(/\s*[\(\[][^\)\]]*(official|mv|m\/v|video|visualizer|audio|lyric|lyrics|hd|4k|live|ver\.|version|teaser|trailer)[^\)\]]*[\)\]]/gi, '')
      .replace(/\s*[|\/]\s*(official|mv|m\/v|video|visualizer|audio|lyric|lyrics).*/gi, '')
      .replace(/\s+M\/V\s*$/gi, '')
      .replace(/\s+\bMV\s*$/gi, '')
      .replace(/(\p{Script=Hangul}[^(]*)\s*\([A-Za-z0-9 .,'-]+\)/gu, '$1')
      .replace(/\s*\((with|feat\.?|ft\.?)\s+[^)]+\)/gi, '')
      .trim();

    return { cleaned, alt };
  };

  const splitArtist = (s) => {
    s = s.replace(/^\s*\[[^\]]*\]\s*/g, '');
    const altMatch = s.match(/\(([A-Za-z0-9 .'-]+)\)/);
    const alt = altMatch ? altMatch[1].trim() : null;
    const main = s
      .replace(/\s*\([^)]+\)\s*/g, '')
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/\s+(Music|Official|Records?|Entertainment|Labels?|Channel|TV|VEVO)$/i, '')
      .trim();
    return { main, alt };
  };

  const quotedMatch = raw.match(/^(.+?)\s*(?:-\s*)?['\u2018\u2019\u201c\u201d"](.*?)['\u2018\u2019\u201c\u201d"]\s*(.*)$/);
  if (quotedMatch) {
    const artistCandidate = quotedMatch[1].trim();
    const titleCandidate = quotedMatch[2].trim();
    if (artistCandidate && titleCandidate && !/^\d+$/.test(artistCandidate)) {
      const { cleaned, alt: titleAlt } = stripSuffix(titleCandidate);
      const { main: artist, alt: artistAlt } = splitArtist(artistCandidate);
      return { artist, artistAlt, title: cleaned, titleAlt };
    }
  }

  const dashMatch = raw.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) {
    const { cleaned, alt: titleAlt } = stripSuffix(dashMatch[2].trim());
    const { main: artist, alt: artistAlt } = splitArtist(dashMatch[1].trim());
    return { artist, artistAlt, title: cleaned, titleAlt };
  }

  const { cleaned, alt: titleAlt } = stripSuffix(raw);
  const { main: artist, alt: artistAlt } = splitArtist(channelName || '');
  return { artist, artistAlt, title: cleaned, titleAlt };
}

// ─── Spotify DOM 시간 보정 ──────────────────────────────────────────────────
let _spotifyLastDomTime = -1;
let _spotifyLastDomAt = 0;

function spotifyDomTimeCorrection(domTime) {
  const now = Date.now();
  if (domTime !== _spotifyLastDomTime) {
    _spotifyLastDomTime = domTime;
    _spotifyLastDomAt = now;
  }
  return (now - _spotifyLastDomAt) / 1000;
}

// ─── 현재 재생 정보 추출 (플랫폼 탭 전용) ──────────────────────────────────
function getNowPlaying() {
  if (platform === 'youtube') {
    const video = document.querySelector('video');
    if (!video) return null;

    const adBadge = document.querySelector('.ytp-ad-simple-ad-badge, .ytp-ad-text');
    if (adBadge) return null;

    const titleEl =
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
      document.querySelector('ytd-watch-metadata h1 yt-formatted-string') ||
      document.querySelector('#above-the-fold #title h1 yt-formatted-string') ||
      document.querySelector('h1.title.ytd-video-primary-info-renderer');

    const channelEl =
      document.querySelector('ytd-watch-metadata #owner ytd-channel-name a') ||
      document.querySelector('#owner #channel-name a') ||
      document.querySelector('#channel-name a');

    let rawTitle = titleEl?.textContent?.trim() || '';
    if (!rawTitle) {
      rawTitle = document.title.replace(/\s*-\s*YouTube\s*$/, '').trim();
    }

    const channelName = channelEl?.textContent?.trim() || '';
    const { artist, artistAlt, title, titleAlt } = parseYouTubeTitle(rawTitle, channelName);

    return {
      title, titleAlt: titleAlt || null,
      artist, artistAlt: artistAlt || null,
      currentTime: video.currentTime,
      paused: video.paused,
    };
  }

  if (platform === 'spotify') {
    const titleEl =
      document.querySelector('[data-testid="now-playing-widget"] [data-testid="context-item-link"]') ||
      document.querySelector('[data-testid="track-info-name"]');
    const artistEl =
      document.querySelector('[data-testid="now-playing-widget"] [data-testid="context-item-info-artist"]') ||
      document.querySelector('[data-testid="track-info-artists"]');
    const progressEl =
      document.querySelector('[data-testid="playback-position"]');

    if (!titleEl) return null;

    const playBtn = document.querySelector('[data-testid="control-button-playpause"]');
    const paused = playBtn ? playBtn.getAttribute('aria-label')?.toLowerCase().includes('play') ?? false : false;

    // Method A: <audio> 요소 직접 접근 (sub-second 정밀도)
    const audioEls = document.querySelectorAll('audio');
    let audioTime = null;
    for (const a of audioEls) {
      if (a.currentTime > 0 && !a.paused === !paused) {
        audioTime = a.currentTime;
        break;
      }
    }

    // Method B: DOM 텍스트(1초 정밀도) + Date.now() 보정
    const timeText = progressEl?.textContent?.trim() || '0:00';
    const [min, sec] = timeText.split(':').map(Number);
    const domTime = (min || 0) * 60 + (sec || 0);
    const corrected = paused ? domTime : domTime + spotifyDomTimeCorrection(domTime);

    const currentTime = audioTime !== null ? audioTime : corrected;

    return {
      title: titleEl.textContent?.trim() || '',
      artist: artistEl?.textContent?.trim() || '',
      currentTime,
      paused,
    };
  }

  return null;
}

// ─── LRCLIB API ─────────────────────────────────────────────────────────────
let lastFetchKey = '';

async function fetchLyrics(title, titleAlt, artist, artistAlt) {
  const key = `${title}||${artist}`;
  if (key === lastFetchKey) return;
  lastFetchKey = key;
  lyrics = [];
  currentIndex = -1;

  if (!title) return;

  console.log(`[Singalong] 가사 검색: title="${title}"${titleAlt ? `/"${titleAlt}"` : ''} artist="${artist}"${artistAlt ? `/"${artistAlt}"` : ''}`);

  const isKorean = (s) => s && /\p{Script=Hangul}/u.test(s);
  const artistIsKorean = isKorean(artist);

  const combos = [];
  if (artistIsKorean) {
    if (title && artist) combos.push([title, artist]);
    if (titleAlt && artist) combos.push([titleAlt, artist]);
    if (title && artistAlt) combos.push([title, artistAlt]);
    if (titleAlt && artistAlt) combos.push([titleAlt, artistAlt]);
  } else {
    if (!artistAlt) {
      if (titleAlt && artist) combos.push([titleAlt, artist]);
      if (title && artist) combos.push([title, artist]);
    } else {
      if (titleAlt && artistAlt) combos.push([titleAlt, artistAlt]);
      if (title && artistAlt) combos.push([title, artistAlt]);
      if (titleAlt && artist) combos.push([titleAlt, artist]);
      if (title && artist) combos.push([title, artist]);
    }
  }

  const seen = new Set();
  const uniqueCombos = combos.filter(([t, a]) => {
    const k = `${t}||${a}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  try {
    for (let i = 0; i < uniqueCombos.length; i++) {
      const [t, a] = uniqueCombos[i];

      if (i === 0) {
        const params = new URLSearchParams({ track_name: t, artist_name: a });
        const res = await fetch(`https://lrclib.net/api/get?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (data.syncedLyrics) {
            lyrics = parseLrc(data.syncedLyrics);
            currentIndex = -1;
            console.log(`[Singalong] 완료 (get): "${t}" / "${a}" — ${lyrics.length}줄`);
            return;
          }
        }
      }

      const q = `${a} ${t}`.trim();
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) continue;
      const results = await res.json();
      const hit = results.find(r => r.syncedLyrics);
      if (hit) {
        lyrics = parseLrc(hit.syncedLyrics);
        currentIndex = -1;
        console.log(`[Singalong] 완료 (search "${t}"/"${a}"): ${lyrics.length}줄 — ${hit.trackName} / ${hit.artistName}`);
        return;
      }
    }

    console.log('[Singalong] 가사 없음');
  } catch (e) {
    console.warn('[Singalong] 가사 로딩 실패:', e);
  }
}

// ─── LRC 파싱 ───────────────────────────────────────────────────────────────
function parseLrc(lrc) {
  const lines = lrc.split('\n');
  const result = [];
  const timeRe = /\[(\d+):(\d+\.\d+)\](.*)/;

  for (const line of lines) {
    const m = line.match(timeRe);
    if (!m) continue;
    const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
    const text = m[3].trim();
    result.push({ time, text });
  }

  return result.sort((a, b) => a.time - b.time);
}

// ─── 플랫폼 탭: 싱크 루프 ───────────────────────────────────────────────────
let lastTitle = '';

function platformSyncLoop() {
  if (!isEnabled) return;

  const info = getNowPlaying();
  if (!info) return;

  // 곡 변경 감지
  if (info.title && info.title !== lastTitle) {
    lastTitle = info.title;
    syncOffset = 0;
    setTrackInfo(info.artist, info.title);
    fetchLyrics(info.title, info.titleAlt, info.artist, info.artistAlt);
  }

  if (!lyrics.length || info.paused) return;

  const t = info.currentTime + syncOffset;
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= t) idx = i;
    else break;
  }

  const current = idx >= 0 ? lyrics[idx].text : '';

  if (idx !== currentIndex) {
    currentIndex = idx;
    setLyricLine(current);
  }

  // background에 현재 가사 + 트랙 정보 push
  chrome.runtime.sendMessage({
    type: 'NOW_PLAYING',
    data: { current, artist: info.artist, title: info.title },
  }).catch(() => { });
}

// ─── 비플랫폼 탭: background에서 가사 상태 polling ──────────────────────────
function mirrorSyncLoop() {
  if (!isEnabled) return;

  chrome.runtime.sendMessage({ type: 'GET_NOW_PLAYING' }, (data) => {
    if (chrome.runtime.lastError || !data) return;
    setLyricLine(data.current);
    setTrackInfo(data.artist, data.title);
    showBar();
  });
}

// ─── 활성화 / 비활성화 ──────────────────────────────────────────────────────
function enable() {
  isEnabled = true;
  showBar();

  if (platform) {
    syncTimer = setInterval(platformSyncLoop, 250);
  } else {
    mirrorSyncLoop();
    syncTimer = setInterval(mirrorSyncLoop, 250);
  }
}

// 비플랫폼 탭: 탭이 다시 visible 될 때 즉시 싱크 (interval throttle 보완)
document.addEventListener('visibilitychange', () => {
  if (!isEnabled || platform || document.hidden) return;
  mirrorSyncLoop();
});

function disable() {
  isEnabled = false;
  hideBar();
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  lastTitle = '';
  lyrics = [];
  currentIndex = -1;
  lastFetchKey = '';
  syncOffset = 0;
}

// ─── 메시지 수신 (팝업 → background → content) ─────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TOGGLE') {
    message.enabled ? enable() : disable();
  }
});

// ─── 초기 상태 복원 ─────────────────────────────────────────────────────────
chrome.storage.local.get('enabled', ({ enabled }) => {
  if (enabled) enable();
});
