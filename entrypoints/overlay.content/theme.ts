import { type Theme, themeSetting } from '@/lib/settings';
import { type Choice, segmented } from './setting-controls';

const CHOICES: Choice<Theme>[] = [
  { value: 'light', label: 'ライト', icon: 'light' },
  { value: 'dark', label: 'ダーク', icon: 'dark' },
  { value: 'auto', label: 'OS の設定に合わせる', icon: 'auto' },
];

/** テーマの切り替え。`root` の `data-theme` を設定に合わせ、ほかのタブでの変更にも追従する。 */
export function mountThemeSwitch(root: HTMLElement, signal: AbortSignal): HTMLElement {
  return segmented('theme', 'テーマ', CHOICES, themeSetting, signal, (theme) => {
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
  });
}
