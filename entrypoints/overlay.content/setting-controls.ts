import { bindSetting, type Setting } from '@/lib/settings';
import { el } from './dom';
import { type IconName, icon } from './icons';

export interface Choice<T> {
  value: T;
  label: string;
  /** あればラベルの代わりにアイコンを出し、ラベルは `title` にする */
  icon?: IconName;
}

/** 選択肢のボタンの並び。押した値を保存し、ほかのタブでの変更にも追従する。 */
export function segmented<T>(
  className: string,
  label: string,
  choices: Choice<T>[],
  setting: Setting<T>,
  signal: AbortSignal,
  onApply?: (value: T) => void,
): HTMLElement {
  const group = el('div', className);
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const buttons = new Map<T, HTMLButtonElement>();
  for (const c of choices) {
    const b = el('button', '', c.icon ? '' : c.label);
    b.type = 'button';
    if (c.icon) {
      b.title = c.label;
      b.setAttribute('aria-label', c.label);
      b.append(icon(c.icon));
    }
    b.addEventListener('click', () => {
      apply(c.value);
      setting.setValue(c.value);
    });
    group.append(b);
    buttons.set(c.value, b);
  }
  const apply = (current: T) => {
    for (const [value, b] of buttons) b.setAttribute('aria-pressed', String(value === current));
    onApply?.(current);
  };
  bindSetting(setting, apply, signal);
  return group;
}

/** 数値を選ぶスライダーの行。動かしている間も保存し、ほかのタブでの変更にも追従する。 */
export function rangeSetting(
  label: string,
  { min, max, step }: { min: number; max: number; step: number },
  setting: Setting<number>,
  signal: AbortSignal,
): HTMLElement {
  const row = el('label', 'setting-row');
  const input = el('input', 'setting-range');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const value = el('output', 'setting-value');
  row.append(el('span', '', label), input, value);
  const apply = (v: number) => {
    input.value = String(v);
    value.textContent = v.toFixed(1);
    input.style.setProperty('--level', `${((v - min) / (max - min)) * 100}%`);
  };
  input.addEventListener('input', () => {
    const v = Number(input.value);
    apply(v);
    setting.setValue(v);
  });
  bindSetting(setting, apply, signal);
  return row;
}
