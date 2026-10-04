import type { WatchContext } from '@/lib/nico/session';
import { clearResume, RESUME_LIMIT, resumeRecords } from '@/lib/resume';
import {
  bindSetting,
  type NgScoreLevel,
  ngScoreSetting,
  type ResumeStart,
  resumeStartSetting,
  type Setting,
  seekHeatmapGammaSetting,
  seekHeatmapSetting,
} from '@/lib/settings';
import { el } from './dom';
import { formatCount } from './format';
import { type Choice, rangeSetting, segmented } from './setting-controls';

const NG_LEVELS: Choice<NgScoreLevel>[] = [
  { value: 'none', label: '無' },
  { value: 'low', label: '弱' },
  { value: 'middle', label: '中' },
  { value: 'high', label: '強' },
];

const VISIBILITY: Choice<boolean>[] = [
  { value: true, label: '表示' },
  { value: false, label: '隠す' },
];

const RESUME_STARTS: Choice<ResumeStart>[] = [
  { value: 'head', label: '先頭から' },
  { value: 'resume', label: '前回の位置から' },
];

const GAMMA_MIN = 1;
const GAMMA_MAX = 4;
const GAMMA_STEP = 0.1;

/** 見出し・選択肢のボタン・説明の 1 項目 */
function segmentedSetting<T>(title: string, hint: string, choices: Choice<T>[], setting: Setting<T>, signal: AbortSignal): HTMLElement {
  const section = el('section', 'setting');
  section.append(el('h3', 'setting-title', title), segmented('segmented', title, choices, setting, signal), el('p', 'setting-hint', hint));
  return section;
}

/** 前回の再生位置の、開いたときの位置・件数・「すべて消す」 */
function resumeSetting(onCleared: () => void, signal: AbortSignal): HTMLElement {
  const section = el('section', 'setting');
  const count = el('span', 'setting-value');
  const clear = el('button', 'setting-button', 'すべて消す');
  clear.type = 'button';
  clear.addEventListener('click', () => clearResume().then(onCleared));
  const start = el('div', 'setting-row');
  start.append('開いたとき', segmented('segmented resume-start', '開いたとき', RESUME_STARTS, resumeStartSetting, signal));
  const row = el('div', 'setting-row');
  row.append(count, clear);
  section.append(
    el('h3', 'setting-title', '前回の再生位置'),
    start,
    row,
    el(
      'p',
      'setting-hint',
      `前回止めた位置をシークバーに ▲ で示します。「前回の位置から」では、開いたときにその位置から再生します。新しいものから ${formatCount(RESUME_LIMIT)} 件を残します。`,
    ),
  );
  bindSetting(resumeRecords, (records) => (count.textContent = `${formatCount(Object.keys(records).length)} 件`), signal);
  return section;
}

/** 右パネルの「設定」タブ。共有 NG レベル、シークバーの盛り上がりの表示・強調、前回の再生位置の消去。 */
export function mountSettingsPanel(context: Promise<WatchContext>, onResumeCleared: () => void, signal: AbortSignal): HTMLElement {
  const root = el('div', 'settings');
  const ng = segmentedSetting(
    '共有 NG レベル',
    'ほかの視聴者の NG 登録が多いコメントを隠します。強いほど多く隠します。',
    NG_LEVELS,
    ngScoreSetting,
    signal,
  );
  const disabled = el('p', 'setting-hint', 'この動画では共有 NG レベルは使われません。');
  disabled.hidden = true;
  ng.append(disabled);
  const heatmap = segmentedSetting(
    'シークバーの盛り上がり',
    'コメントで盛り上がった区間ほど、シークバーを青から赤に近い色で表示します。帯の細い部分はまだ読み込んでいません。',
    VISIBILITY,
    seekHeatmapSetting,
    signal,
  );
  heatmap.append(
    rangeSetting('強調', { min: GAMMA_MIN, max: GAMMA_MAX, step: GAMMA_STEP }, seekHeatmapGammaSetting, signal),
    el('p', 'setting-hint', '強調を上げるほど、コメントが特に多い区間だけが赤くなります。1 では値に比例します。'),
  );
  root.append(ng, heatmap, resumeSetting(onResumeCleared, signal));
  context.then(
    (ctx) => (disabled.hidden = !ctx.data.ngScoreDisabled),
    () => {},
  );
  return root;
}
