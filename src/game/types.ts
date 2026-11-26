export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

export type LaneIndex = -1 | 0 | 1;

export type QualityMode = 'auto' | 'high' | 'eco';

export type ObstacleKind =
  | 'barrier_low'
  | 'barrier_high'
  | 'signal'
  | 'train_static'
  | 'train_moving';

export interface HudSnapshot {
  score: number;
  distance: number;
  coins: number;
  speedMultiplier: number;
  bestScore: number;
  milestoneLabel: string | null;
}

export interface PersistentStats {
  bestScore: number;
  totalCoins: number;
  runsPlayed: number;
  muted: boolean;
  qualityMode: QualityMode;
}

export const LANE_WIDTH = 3.1;
export const LANES: readonly LaneIndex[] = [-1, 0, 1];
export const TRACK_SEGMENT_LENGTH = 24;
export const TRACK_SEGMENT_COUNT = 8;

export const BASE_RUN_SPEED = 17.5;
export const MAX_RUN_SPEED = 39.0;
export const JUMP_VELOCITY = 14.8;
export const GRAVITY = 39.0;
export const FAST_FALL_SPEED = 24.0;
export const SLIDE_DURATION = 0.68;

const STORAGE_KEY = 'metro_dash_stats_v1';

export function loadPersistentStats(): PersistentStats {
  const defaults: PersistentStats = {
    bestScore: 0,
    totalCoins: 0,
    runsPlayed: 0,
    muted: false,
    qualityMode: 'auto',
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistentStats>;
    return {
      bestScore: typeof parsed.bestScore === 'number' && Number.isFinite(parsed.bestScore) ? Math.max(0, Math.floor(parsed.bestScore)) : 0,
      totalCoins: typeof parsed.totalCoins === 'number' && Number.isFinite(parsed.totalCoins) ? Math.max(0, Math.floor(parsed.totalCoins)) : 0,
      runsPlayed: typeof parsed.runsPlayed === 'number' && Number.isFinite(parsed.runsPlayed) ? Math.max(0, Math.floor(parsed.runsPlayed)) : 0,
      muted: Boolean(parsed.muted),
      qualityMode: parsed.qualityMode === 'high' || parsed.qualityMode === 'eco' ? parsed.qualityMode : 'auto',
    };
  } catch {
    return defaults;
  }
}

export function savePersistentStats(stats: PersistentStats): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage quota / private mode errors
  }
}
