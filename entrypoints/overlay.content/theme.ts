import { type Theme, themeSetting } from '@/lib/settings';
import { icon } from './icons';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
  { value: 'auto', label: 'OS の設定に合わせる' },
];

/** テーマの切り替え。`root` の `data-theme` を設定に合わせ、ほかのタブでの変更にも追従する。 */
export function mountThemeSwitch(root: HTMLElement): { element: HTMLElement; destroy(): void } {
  const group = document.createElement('div');
  group.className = 'theme';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'テーマ');
  const buttons = new Map<Theme, HTMLButtonElement>();
  for (const { value, label } of OPTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.append(icon(value));
    b.addEventListener('click', () => {
      apply(value);
      themeSetting.setValue(value);
    });
    group.append(b);
    buttons.set(value, b);
  }
  const apply = (theme: Theme) => {
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
    for (const [value, b] of buttons) b.setAttribute('aria-pressed', String(value === theme));
  };
  apply('auto');
  themeSetting.getValue().then(apply);
  const unwatch = themeSetting.watch(apply);
  return { element: group, destroy: unwatch };
}
