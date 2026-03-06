// popup.js — 토글 상태 관리

const toggle = document.getElementById('toggle');
const label = document.getElementById('toggle-label');

// 저장된 상태 불러오기
chrome.storage.local.get('enabled', ({ enabled }) => {
  toggle.checked = !!enabled;
  label.textContent = enabled ? '켜짐' : '꺼짐';
});

// 토글 변경 시
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  label.textContent = enabled ? '켜짐' : '꺼짐';

  chrome.storage.local.set({ enabled });
  chrome.runtime.sendMessage({ type: 'TOGGLE', enabled });
});
