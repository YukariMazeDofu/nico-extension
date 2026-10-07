import { log } from './log';
import { resumeStartSetting } from './settings';

export interface ResumeEntry {
  /** 位置（秒、整数） */
  sec: number;
  /** 記録した日時（ms） */
  at: number;
}

export type ResumeRecords = Record<string, ResumeEntry>;

export const RESUME_LIMIT = 1000;

/** 前回の再生位置。全動画の記録を 1 つの値に持つ */
export const resumeRecords = storage.defineItem<ResumeRecords>('local:resume', { fallback: {} });

let queue = Promise.resolve();

/** 読み直した記録を `change` で書き換える。同じタブの書き込みは順に行う。 */
function update(change: (records: ResumeRecords) => ResumeRecords): Promise<void> {
  queue = queue
    .then(async () => resumeRecords.setValue(change({ ...(await resumeRecords.getValue()) })))
    .catch((e) => log.warn(`resume write failed: ${e}`));
  return queue;
}

export const readResume = async (videoId: string): Promise<ResumeEntry | undefined> => (await resumeRecords.getValue())[videoId];

/** 開いたときの再生の位置（秒）。`from` が `duration` 未満ならその位置。先頭なら -1 */
export async function startPositionOf(videoId: string, from?: number, duration = Infinity): Promise<number> {
  if (from !== undefined && from < duration) return from;
  if ((await resumeStartSetting.getValue()) !== 'resume') return -1;
  return (await readResume(videoId))?.sec ?? -1;
}

/** 位置を書き、`RESUME_LIMIT` を超えた分を記録した日時の古いものから消す。 */
export const writeResume = (videoId: string, sec: number) =>
  update((records) => {
    records[videoId] = { sec: Math.floor(sec), at: Date.now() };
    const entries = Object.entries(records);
    if (entries.length <= RESUME_LIMIT) return records;
    return Object.fromEntries(entries.sort(([, a], [, b]) => b.at - a.at).slice(0, RESUME_LIMIT));
  });

export const removeResume = (videoId: string) =>
  update((records) => {
    delete records[videoId];
    return records;
  });

export const clearResume = () => update(() => ({}));
