/** 24×24 の線のアイコン。`solid` クラスの図形は塗りつぶす。 */
const PATHS = {
  play: '<path class="solid" d="M7 4.5v15l12.5-7.5z"/>',
  pause: '<path class="solid" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
  volume: '<path class="solid" d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>',
  muted: '<path class="solid" d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>',
  comment: '<path d="M4 5h16v11H10l-6 4z"/><path d="M8.5 10.5h7"/>',
  dock: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 15.5h17"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  view: '<path class="solid" d="M7 4.5v15l12.5-7.5z"/>',
  mylist: '<path d="M3 6h7l2 2h9v11H3z"/>',
  nicoru: '<circle cx="12" cy="12" r="8.5"/><path class="solid" d="M8.6 9.2a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0M13 9.2a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0"/><path d="M8 13.5a4.5 4.5 0 0 0 8 0"/>',
  like: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  dark: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  auto: '<circle cx="12" cy="12" r="8"/><path class="solid" d="M12 4a8 8 0 0 1 0 16z"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PATHS[name];
  return svg;
}
