// content.js — 가사 바 렌더링 & 싱크 로직
// YouTube / Spotify Web Player 지원
// 비플랫폼 탭에서는 background.js로부터 현재 가사를 받아 바만 표시

// ─── 상태 ──────────────────────────────────────────────────────────────────
let isEnabled = false;
let lyrics = [];       // [{ time: number (초), text: string }]
let currentIndex = null;
let syncTimer = null;
let syncOffset = 0;    // 싱크 오프셋 (초 단위, ±0.5씩 조절)

// ─── ASCII 애니메이션 ────────────────────────────────────────────────────────
const _fA = '( ˘0˘ )';
const ANIM_FRAMES_A = [
  `      \\ \\ \\ ${_fA} / / /      `,
  `     \\ \\ ♪  ${_fA}  ♪ / /     `,
  `    \\ \\ ♪ \\ ${_fA} / ♪ / /    `,
  `   \\ \\ ♪ \\\\ ${_fA} // ♪ / /   `,
  `  \\\\ ♪ \\\\   ${_fA}   // ♪ //  `,
  ` \\\\\\ ♪      ${_fA}      ♪ ///  `,
  `\\\\\\\\ ♪       ${_fA}       ♪ ////`,
  ` \\\\\\ ♪      ${_fA}      ♪ ///  `,
  `  \\\\ ♪ \\\\   ${_fA}   // ♪ //  `,
  `   \\ \\ ♪ \\\\ ${_fA} // ♪ / /   `,
  `    \\ \\ ♪ \\ ${_fA} / ♪ / /    `,
  `     \\ \\ ♪  ${_fA}  ♪ / /     `,
  `      \\ \\ \\ ${_fA} / / /      `,
];
const _fB = '( ˘ᵕ˘)';
const ANIM_FRAMES_B = [
  `♪ ～～  ${_fB}  ～ ♪`,
  `♪ ～   ${_fB}  ～～ ♪`,
  `♪ ～～～ ${_fB} ～ ♪`,
  `♪ ～   ${_fB}  ～～～ ♪`,
  `♪ ～～  ${_fB}  ～ ♪`,
  `♪ ～   ${_fB}  ～～ ♪`,
  `♪ ～～～ ${_fB} ～ ♪`,
  `♪ ～   ${_fB}  ～～～ ♪`,
];
let animTimer = null;
let animType = null;
let animFrameIdx = 0;

// ─── 플랫폼 감지 ────────────────────────────────────────────────────────────
function getPlatform() {
  if (location.hostname.includes('youtube.com')) return 'youtube';
  if (location.hostname.includes('spotify.com')) return 'spotify';
  return null;
}

const platform = getPlatform();

// ─── 폰트 CDN 인젝션 ────────────────────────────────────────────────────────
function injectFonts() {
  if (document.getElementById('singalong-fonts')) return;
  const links = [
    'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css',
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono&display=swap',
  ];
  links.forEach(href => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  });
  const marker = document.createElement('meta');
  marker.id = 'singalong-fonts';
  document.head.appendChild(marker);
}

// ─── 가사 바 DOM ────────────────────────────────────────────────────────────
function createBar() {
  injectFonts();
  const bar = document.createElement('div');
  bar.id = 'singalong-bar';
  bar.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 64px;
    background: rgba(26, 26, 26, 0.95);
    color: #fff;
    font-family: 'Pretendard Variable', Pretendard, sans-serif;
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
    gap: 2px;
  `;
  const infoTitle = document.createElement('div');
  infoTitle.id = 'singalong-title';
  infoTitle.style.cssText = 'font-size: 14px; font-weight: 500; color: #ddff57; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
  const infoArtist = document.createElement('div');
  infoArtist.id = 'singalong-artist';
  infoArtist.style.cssText = 'font-size: 12px; font-weight: 400; color: #e0e0e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
  info.appendChild(infoTitle);
  info.appendChild(infoArtist);

  // 중앙: 현재 가사
  const lyricEl = document.createElement('div');
  lyricEl.id = 'singalong-current';
  lyricEl.style.cssText = `
    flex: 1 1 auto;
    text-align: center;
    font-size: 22px;
    font-weight: 600;
    color: #f1f1f1;
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
    gap: 12px;
    pointer-events: auto;
  `;

  const btnBase = `
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    width: 24px;
    height: 24px;
    min-width: 24px;
    min-height: 24px;
    flex-shrink: 0;
    box-sizing: border-box;
    pointer-events: auto;
  `;

  // Btn Refresh — 항상 노란 아이콘, hover 없음
  const btnRefresh = document.createElement('button');
  btnRefresh.id = 'singalong-btn-refresh';
  btnRefresh.title = '가사 새로고침';
  btnRefresh.style.cssText = btnBase;
  btnRefresh.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.4004 12C20.4004 9.77218 19.5148 7.63585 17.9395 6.06055C16.3644 4.48547 14.2284 3.59987 12.001 3.59961C9.64372 3.60881 7.3801 4.52678 5.68359 6.16309L5.68457 6.16406L4.44727 7.40039H8C8.33137 7.40039 8.59961 7.66863 8.59961 8C8.59961 8.33137 8.33137 8.59961 8 8.59961H3C2.66863 8.59961 2.40039 8.33137 2.40039 8V3C2.40039 2.66863 2.66863 2.40039 3 2.40039C3.33137 2.40039 3.59961 2.66863 3.59961 3V6.55176L4.84277 5.30859L5.20996 4.96973C7.08367 3.32554 9.49407 2.40981 11.998 2.40039H12C14.5461 2.40039 16.9877 3.41157 18.7881 5.21191C20.5884 7.01226 21.5996 9.45392 21.5996 12C21.5996 12.3314 21.3314 12.5996 21 12.5996C20.6686 12.5996 20.4004 12.3314 20.4004 12ZM21.5996 21C21.5996 21.3314 21.3314 21.5996 21 21.5996C20.6686 21.5996 20.4004 21.3314 20.4004 21V17.4473L19.1572 18.6914C17.2369 20.5478 14.6728 21.5896 12.002 21.5996H12C9.45392 21.5996 7.01226 20.5884 5.21191 18.7881C3.41157 16.9877 2.40039 14.5461 2.40039 12C2.40039 11.6686 2.66863 11.4004 3 11.4004C3.33137 11.4004 3.59961 11.6686 3.59961 12C3.59961 14.2278 4.48524 16.3641 6.06055 17.9395C7.63539 19.5143 9.77093 20.3989 11.998 20.3994C14.3556 20.3905 16.6187 19.4725 18.3154 17.8359L19.5527 16.5996H16C15.6686 16.5996 15.4004 16.3314 15.4004 16C15.4004 15.6686 15.6686 15.4004 16 15.4004H21C21.3314 15.4004 21.5996 15.6686 21.5996 16V21Z" fill="#F1F1F1"/><path d="M12.0234 7.12173C12.2016 7.00083 12.4288 6.97592 12.6289 7.05532C13.1623 7.26735 13.8695 7.7516 14.3662 8.53774C14.8765 9.34545 15.1447 10.4426 14.8154 11.8122C14.7314 12.161 14.3802 12.3755 14.0312 12.2917C13.6824 12.2076 13.4669 11.8564 13.5508 11.5075C13.7983 10.4774 13.589 9.74097 13.2676 9.23208C13.1972 9.12068 13.1192 9.01911 13.0391 8.92642V14.0563C13.0391 14.0627 13.04 14.0694 13.04 14.0758C13.04 14.082 13.0391 14.0882 13.0391 14.0944V14.1999C13.0391 14.2557 13.0299 14.3093 13.0166 14.361C12.8779 15.3301 12.0475 16.0757 11.04 16.0758C9.93556 16.0758 9.04018 15.1803 9.04004 14.0758C9.04004 12.9713 9.93547 12.0758 11.04 12.0758C11.286 12.0759 11.5206 12.1225 11.7383 12.2038V7.65981C11.7383 7.44451 11.8454 7.24272 12.0234 7.12173Z" fill="#DDFF57"/></svg>`;

  // sync wrap: [Btn Minus] [0.5s] [Btn Plus]
  const syncWrap = document.createElement('div');
  syncWrap.style.cssText = 'display: flex; align-items: center; gap: 4px;';

  // Btn Minus
  const btnMinus = document.createElement('button');
  btnMinus.id = 'singalong-btn-minus';
  btnMinus.title = '가사 0.5초 늦추기';
  btnMinus.style.cssText = btnBase + 'border-radius: 4px; transition: background 0.15s;';
  btnMinus.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 11.2002C16.4418 11.2002 16.7998 11.5582 16.7998 12C16.7998 12.4418 16.4418 12.7998 16 12.7998H8C7.55817 12.7998 7.2002 12.4418 7.2002 12C7.2002 11.5582 7.55817 11.2002 8 11.2002H16Z" fill="#DDFF57"/><rect x="3" y="3" width="18" height="18" rx="4" fill="#F1F1F1" fill-opacity="0"/><rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.4" stroke="#F1F1F1" stroke-opacity="0.6" stroke-width="1.2"/></svg>`;

  // 0.5s 고정 텍스트
  const stepLabel = document.createElement('span');
  stepLabel.textContent = '0.5s';
  stepLabel.style.cssText = 'color: #f1f1f1; font-size: 15px; font-family: "JetBrains Mono", monospace; letter-spacing: -1px; pointer-events: none; white-space: nowrap; padding: 0 3px;';

  // Btn Plus
  const btnPlus = document.createElement('button');
  btnPlus.id = 'singalong-btn-plus';
  btnPlus.title = '가사 0.5초 앞당기기';
  btnPlus.style.cssText = btnBase + 'border-radius: 4px; transition: background 0.15s;';
  btnPlus.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.9951 7.20508C12.4368 7.20514 12.7949 7.56315 12.7949 8.00488V11.2002H16C16.4418 11.2002 16.7998 11.5582 16.7998 12C16.7998 12.4418 16.4418 12.7998 16 12.7998H12.7949V16.0049C12.7949 16.4467 12.4369 16.8046 11.9951 16.8047C11.5533 16.8047 11.1953 16.4467 11.1953 16.0049V12.7998H8C7.55817 12.7998 7.2002 12.4418 7.2002 12C7.2002 11.5582 7.55817 11.2002 8 11.2002H11.1953V8.00488C11.1954 7.56311 11.5533 7.20508 11.9951 7.20508Z" fill="#DDFF57"/><rect x="3" y="3" width="18" height="18" rx="4" fill="#F1F1F1" fill-opacity="0"/><rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.4" stroke="#F1F1F1" stroke-opacity="0.6" stroke-width="1.2"/></svg>`;

  syncWrap.appendChild(btnMinus);
  syncWrap.appendChild(stepLabel);
  syncWrap.appendChild(btnPlus);

  // Btn Close
  const btnClose = document.createElement('button');
  btnClose.id = 'singalong-btn-close';
  btnClose.title = '닫기';
  btnClose.style.cssText = btnBase + 'width: 18px; height: 18px; margin: 3px; border-radius: 4px; transition: background 0.15s;';
  btnClose.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.233 5.75489C17.4673 5.52062 17.8463 5.52071 18.0806 5.75489C18.315 5.98921 18.315 6.36823 18.0806 6.60255L12.6832 12L18.0806 17.3975C18.315 17.6318 18.315 18.0108 18.0806 18.2451C17.8463 18.4794 17.4673 18.4794 17.233 18.2451L11.8355 12.8477L6.76717 17.916C6.53285 18.1503 6.15382 18.1503 5.91951 17.916C5.68533 17.6817 5.68524 17.3026 5.91951 17.0684L10.9879 12L5.91951 6.93165C5.6852 6.69733 5.6852 6.31831 5.91951 6.08399C6.15382 5.84968 6.53285 5.84968 6.76717 6.08399L11.8355 11.1524L17.233 5.75489Z" fill="#F1F1F1"/></svg>`;

  // Hover: Minus, Plus — 배경 추가
  [btnMinus, btnPlus].forEach(btn => {
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(241,241,241,0.1)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
  });

  // Hover: Close
  btnClose.addEventListener('mouseenter', () => { btnClose.style.background = 'rgba(241,241,241,0.1)'; });
  btnClose.addEventListener('mouseleave', () => { btnClose.style.background = 'none'; });

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
  controls.appendChild(syncWrap);
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
  currentIndex = null;

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
            lyrics = markBlankTypes(parseLrc(data.syncedLyrics));
            currentIndex = null;
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
        lyrics = markBlankTypes(parseLrc(hit.syncedLyrics));
        currentIndex = null;
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

// ─── 가사 공백 구간 타입 분류 ────────────────────────────────────────────────
function markBlankTypes(lines) {
  const firstIdx = lines.findIndex(l => l.text !== '');
  const lastIdx = lines.reduce((acc, l, i) => l.text !== '' ? i : acc, -1);
  return lines.map((line, i) => {
    if (line.text !== '') return line;
    const blankType = (firstIdx === -1 || i < firstIdx || i > lastIdx) ? 'B' : 'A';
    return { ...line, blankType };
  });
}

// ─── ASCII 애니메이션 제어 ───────────────────────────────────────────────────
function startAnim(type) {
  if (animTimer && animType === type) return;
  stopAnim();
  animType = type;
  animFrameIdx = 0;
  const frames = type === 'A' ? ANIM_FRAMES_A : ANIM_FRAMES_B;
  const el = document.getElementById('singalong-current');
  if (el) el.style.fontWeight = '400';

  if (type === 'A') {
    setLyricLine(frames[0]);
    animFrameIdx = 1;
    animTimer = setInterval(() => {
      setLyricLine(frames[animFrameIdx % frames.length]);
      animFrameIdx++;
    }, 200);
  } else {
    if (el) { el.style.transition = 'opacity 0.15s'; el.style.opacity = '1'; }
    setLyricLine(frames[0]);
    animFrameIdx = 1;
    animTimer = setInterval(() => {
      const el = document.getElementById('singalong-current');
      if (!el) return;
      el.style.opacity = '0';
      setTimeout(() => {
        el.textContent = frames[animFrameIdx % frames.length];
        el.style.opacity = '1';
        animFrameIdx++;
      }, 150);
    }, 600);
  }
}

function stopAnim() {
  if (!animTimer) return;
  clearInterval(animTimer);
  animTimer = null;
  animType = null;
  animFrameIdx = 0;
  const el = document.getElementById('singalong-current');
  if (el) { el.style.transition = ''; el.style.opacity = '1'; el.style.fontWeight = '600'; }
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
  const line = idx >= 0 ? lyrics[idx] : null;

  if (idx !== currentIndex) {
    currentIndex = idx;
    if (idx < 0) {
      // 첫 번째 가사 이전 → 전주 B타입
      startAnim('B');
    } else if (line && line.text === '' && line.blankType) {
      startAnim(line.blankType);
    } else {
      stopAnim();
      setLyricLine(current);
    }
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
  stopAnim();
  hideBar();
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  lastTitle = '';
  lyrics = [];
  currentIndex = null;
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
