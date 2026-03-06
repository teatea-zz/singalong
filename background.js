// background.js — Service Worker (Manifest V3)
// 역할:
//   1. 팝업 TOGGLE → 모든 탭의 content.js로 브로드캐스트
//   2. 플랫폼 탭(YouTube/Spotify)에서 올라온 NOW_PLAYING 정보를 저장
//   3. 비플랫폼 탭이 GET_NOW_PLAYING 요청 시 저장된 정보 응답

let nowPlaying = null; // { title, titleAlt, artist, artistAlt, lyrics, currentIndex, paused }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // 팝업 → 모든 탭 브로드캐스트
  if (message.type === 'TOGGLE') {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      }
    });
    return;
  }

  // 플랫폼 탭이 현재 재생 정보 + 가사 상태를 push
  if (message.type === 'NOW_PLAYING') {
    nowPlaying = message.data;
    return;
  }

  // 비플랫폼 탭이 현재 가사 상태 요청
  if (message.type === 'GET_NOW_PLAYING') {
    sendResponse(nowPlaying);
    return true; // async sendResponse
  }
});
