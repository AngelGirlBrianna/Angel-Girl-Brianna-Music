export interface IATrack {
  identifier: string;
  title: string;
  creator: string;
  album: string;
  trackNumber?: number;
  audioUrl: string;
  albumArtUrl: string;
  originalItemUrl: string;
  format?: string;
  filename: string;
}

export interface IAItem {
  identifier: string;
  title: string;
  creator: string;
  mediatype: string;
}

export type RepeatMode = 'none' | 'one' | 'album' | 'all';

export interface AppSettings {
  isCachingEnabled: boolean;
  isShuffleEnabled: boolean;
}
