import type { WatchContext } from '@/lib/nico/session';
import { type NgScoreLevel, ngScoreSetting } from '@/lib/settings';

const NG_LEVELS: { value: NgScoreLevel; label: string }[] = [
  { value: 'none', label: '無' },
  { value: 'low', label: '弱' },
  { value: 'middle', label: '中' },
  { value: 'high', label: '強' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

/** 右パネルの「設定」タブ。共有 NG レベルを選ぶ。ほかのタブでの変更にも追従する。 */
export function mountSettingsPanel(context: Promise<WatchContext>): { element: HTMLElement; destroy(): void } {
  const root = el('div', 'settings');
  const section = el('section', 'setting');
  const title = el('h3', 'setting-title', '共有 NG レベル');
  const group = el('div', 'segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', '共有 NG レベル');
  const buttons = new Map<NgScoreLevel, HTMLButtonElement>();
  for (const { value, label } of NG_LEVELS) {
    const b = el('button', '', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      apply(value);
      ngScoreSetting.setValue(value);
    });
    group.append(b);
    buttons.set(value, b);
  }
  const hint = el('p', 'setting-hint', 'ほかの視聴者の NG 登録が多いコメントを隠します。強いほど多く隠します。');
  const disabled = el('p', 'setting-hint', 'この動画では共有 NG レベルは使われません。');
  disabled.hidden = true;
  section.append(title, group, hint, disabled);
  root.append(section);

  const apply = (level: NgScoreLevel) => {
    for (const [value, b] of buttons) b.setAttribute('aria-pressed', String(value === level));
  };
  ngScoreSetting.getValue().then(apply);
  const unwatch = ngScoreSetting.watch(apply);
  context.then(
    (ctx) => (disabled.hidden = !ctx.data.ngScoreDisabled),
    () => {},
  );
  return { element: root, destroy: unwatch };
}
