import type { WatchContext } from '@/lib/nico/session';
import { type NgScoreLevel, ngScoreSetting, seekHeatmapGammaSetting, seekHeatmapSetting } from '@/lib/settings';

interface Setting<T> {
  getValue(): Promise<T>;
  setValue(value: T): Promise<void>;
  watch(cb: (value: T) => void): () => void;
}

const NG_LEVELS: { value: NgScoreLevel; label: string }[] = [
  { value: 'none', label: '無' },
  { value: 'low', label: '弱' },
  { value: 'middle', label: '中' },
  { value: 'high', label: '強' },
];

const VISIBILITY: { value: boolean; label: string }[] = [
  { value: true, label: '表示' },
  { value: false, label: '隠す' },
];

const GAMMA_MIN = 1;
const GAMMA_MAX = 4;
const GAMMA_STEP = 0.1;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

/** 選択肢のボタンを並べた設定の 1 項目。ほかのタブでの変更にも追従する。 */
function segmentedSetting<T>(
  title: string,
  hint: string,
  options: { value: T; label: string }[],
  setting: Setting<T>,
): { section: HTMLElement; destroy(): void } {
  const section = el('section', 'setting');
  const group = el('div', 'segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', title);
  const buttons = new Map<T, HTMLButtonElement>();
  for (const { value, label } of options) {
    const b = el('button', '', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      apply(value);
      setting.setValue(value);
    });
    group.append(b);
    buttons.set(value, b);
  }
  section.append(el('h3', 'setting-title', title), group, el('p', 'setting-hint', hint));
  const apply = (current: T) => {
    for (const [value, b] of buttons) b.setAttribute('aria-pressed', String(value === current));
  };
  setting.getValue().then(apply);
  return { section, destroy: setting.watch(apply) };
}

/** 数値を選ぶスライダーの行。動かしている間も保存し、ほかのタブでの変更にも追従する。 */
function rangeSetting(
  label: string,
  { min, max, step }: { min: number; max: number; step: number },
  setting: Setting<number>,
): { row: HTMLElement; destroy(): void } {
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
  setting.getValue().then(apply);
  return { row, destroy: setting.watch(apply) };
}

/** 右パネルの「設定」タブ。共有 NG レベルと、シークバーの盛り上がりの表示・強調を選ぶ。 */
export function mountSettingsPanel(context: Promise<WatchContext>): { element: HTMLElement; destroy(): void } {
  const root = el('div', 'settings');
  const ng = segmentedSetting(
    '共有 NG レベル',
    'ほかの視聴者の NG 登録が多いコメントを隠します。強いほど多く隠します。',
    NG_LEVELS,
    ngScoreSetting,
  );
  const disabled = el('p', 'setting-hint', 'この動画では共有 NG レベルは使われません。');
  disabled.hidden = true;
  ng.section.append(disabled);
  const heatmap = segmentedSetting(
    'シークバーの盛り上がり',
    'コメントで盛り上がった区間ほど、シークバーを青から赤に近い色で表示します。帯の細い部分はまだ読み込んでいません。',
    VISIBILITY,
    seekHeatmapSetting,
  );
  const gamma = rangeSetting('強調', { min: GAMMA_MIN, max: GAMMA_MAX, step: GAMMA_STEP }, seekHeatmapGammaSetting);
  heatmap.section.append(
    gamma.row,
    el('p', 'setting-hint', '強調を上げるほど、コメントが特に多い区間だけが赤くなります。1 では値に比例します。'),
  );
  root.append(ng.section, heatmap.section);
  context.then(
    (ctx) => (disabled.hidden = !ctx.data.ngScoreDisabled),
    () => {},
  );
  return {
    element: root,
    destroy() {
      ng.destroy();
      heatmap.destroy();
      gamma.destroy();
    },
  };
}
