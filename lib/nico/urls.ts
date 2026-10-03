export const ORIGIN = 'https://www.nicovideo.jp';

export const HOST = new URL(ORIGIN).hostname;

export const NVAPI = 'https://nvapi.nicovideo.jp';

export const watchPath = (videoId: string) => `/watch/${videoId}`;

export const watchUrl = (videoId: string) => `${ORIGIN}${watchPath(videoId)}`;

/** `public/rules.json` がリダイレクトしない（公式プレイヤーで開く）watch ページの URL */
export const officialWatchUrl = (videoId: string) => `${watchUrl(videoId)}?nico-ext=off`;

export const tagUrl = (name: string) => `${ORIGIN}/tag/${encodeURIComponent(name)}`;

export const userUrl = (userId: number | string) => `${ORIGIN}/user/${userId}`;

export const channelUrl = (channelId: string) => `https://ch.nicovideo.jp/${channelId}`;

export const seriesUrl = (seriesId: number | string) => `${ORIGIN}/series/${seriesId}`;

export const accessRightsHlsUrl = (videoId: string, actionTrackId: string) =>
  `${NVAPI}/v1/watch/${videoId}/access-rights/hls?actionTrackId=${actionTrackId}`;
