import { Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { GamePhase, HudSnapshot, PersistentStats, QualityMode } from '../game/types';
import { CoinSvg } from './GameHUD';

interface GameModalsProps {
  phase: GamePhase;
  hud: HudSnapshot;
  stats: PersistentStats;
  isNewBest: boolean;
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onToggleMute: () => void;
  onChangeQuality: (mode: QualityMode) => void;
}

function MetroDashLogo() {
  return (
    <div className="flex flex-col items-center text-center">
      <svg
        viewBox="0 0 320 96"
        className="w-[260px] sm:w-[320px] h-auto drop-shadow-[0_6px_18px_rgba(15,23,42,0.55)]"
        role="img"
        aria-label="Metro Dash"
      >
        <defs>
          <linearGradient id="mdTitleGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>
          <linearGradient id="mdGoldGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>

        {/* Winged Rail Crest */}
        <path d="M108 16H212L202 25H118L108 16Z" fill="url(#mdGoldGrad)" />
        <path d="M132 10H188L182 14H138L132 10Z" fill="#38BDF8" />

        {/* Title Wordmark */}
        <text
          x="160"
          y="63"
          textAnchor="middle"
          fill="url(#mdTitleGrad)"
          fontFamily="Outfit, sans-serif"
          fontWeight="900"
          fontSize="44"
          letterSpacing="2"
        >
          METRO
        </text>
        <text
          x="160"
          y="91"
          textAnchor="middle"
          fill="url(#mdGoldGrad)"
          fontFamily="Outfit, sans-serif"
          fontWeight="900"
          fontSize="26"
          letterSpacing="9"
        >
          DASH
        </text>
      </svg>
    </div>
  );
}

function QualitySelector({
  qualityMode,
  onChange,
}: {
  qualityMode: QualityMode;
  onChange: (mode: QualityMode) => void;
}) {
  const modes: { id: QualityMode; label: string }[] = [
    { id: 'auto', label: 'Auto' },
    { id: 'high', label: 'High' },
    { id: 'eco', label: 'Eco' },
  ];

  return (
    <div
      className="flex items-center gap-1 p-1 bg-slate-950/88 border border-white/12 rounded-xl"
      role="group"
      aria-label="Graphics quality"
    >
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`px-3 py-1.5 min-h-[34px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 ${
            qualityMode === m.id
              ? 'bg-amber-400 text-slate-950'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function GameModals({
  phase,
  hud,
  stats,
  isNewBest,
  onStart,
  onResume,
  onRestart,
  onMainMenu,
  onToggleMute,
  onChangeQuality,
}: GameModalsProps) {
  if (phase === 'playing') return null;

  if (phase === 'menu') {
    return (
      <div className="fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-t from-slate-950/88 via-slate-950/20 to-slate-950/50">
        {/* Top Utility Row */}
        <div className="flex items-center justify-between gap-3">
          <QualitySelector qualityMode={stats.qualityMode} onChange={onChangeQuality} />

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={stats.muted ? 'Unmute audio' : 'Mute audio'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-950/88 border border-white/12 text-slate-100 hover:bg-slate-900 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {stats.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Bottom-Anchored Title Lockup & Start CTA (leaves center 3D scene open) */}
        <div className="flex flex-col items-center gap-5 pb-3 sm:pb-6">
          <MetroDashLogo />

          {/* Clean unboxed career metrics */}
          <div className="flex items-center gap-3 text-sm sm:text-base font-medium text-slate-200 tabular-nums">
            <span>
              Best <strong className="font-mono text-white">{stats.bestScore.toLocaleString()}</strong>
            </span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CoinSvg className="w-4 h-4" />
              <strong className="font-mono text-amber-300">{stats.totalCoins.toLocaleString()}</strong>
            </span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <span>
              Runs <strong className="font-mono text-white">{stats.runsPlayed}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onStart}
            className="min-w-[210px] min-h-[54px] px-8 py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-display text-xl font-black tracking-wide inline-flex items-center justify-center gap-2.5 shadow-xl transition-transform cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
          >
            <Play className="w-5 h-5 fill-slate-950" />
            Play
          </button>

          <p className="text-xs sm:text-sm text-slate-300 text-center max-w-md leading-snug">
            Swipe or Arrows / WASD to Move · Space Jump · Down Slide
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'paused') {
    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/75">
        <div className="w-full max-w-[360px] rounded-2xl bg-slate-900 border border-white/15 p-6 shadow-2xl flex flex-col gap-5">
          <div className="text-center">
            <h2 className="font-display text-2xl font-black text-white">Game Paused</h2>
            <p className="mt-1 text-sm text-slate-400 font-mono tabular-nums">
              {hud.score.toLocaleString()} pts · {hud.distance}m · {hud.coins} coins
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-display text-base font-extrabold inline-flex items-center justify-center gap-2 transition-transform cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              Resume
            </button>

            <button
              type="button"
              onClick={onRestart}
              className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-semibold text-base inline-flex items-center justify-center gap-2 transition-transform cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Restart
            </button>

            <button
              type="button"
              onClick={onMainMenu}
              className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-transparent hover:bg-slate-800/70 text-slate-300 hover:text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              Main Menu
            </button>
          </div>

          <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
            <QualitySelector qualityMode={stats.qualityMode} onChange={onChangeQuality} />
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={stats.muted ? 'Unmute audio' : 'Mute audio'}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100"
            >
              {stats.muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Game Over Screen
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/78">
      <div className="w-full max-w-[390px] rounded-2xl bg-slate-900 border border-white/15 p-6 shadow-2xl flex flex-col gap-5">
        <div className="text-center">
          {isNewBest && (
            <p className="text-xs font-bold tracking-wider text-amber-400 mb-1">
              New Best Score
            </p>
          )}
          <h2 className="font-display text-2xl font-black text-white">Run Complete</h2>
          <div className="mt-2 font-display text-5xl font-black text-amber-400 tabular-nums leading-none">
            {hud.score.toLocaleString()}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-center">
          <div className="py-2">
            <div className="text-xs text-slate-400">Best</div>
            <div className="mt-0.5 font-mono text-base font-bold text-white tabular-nums">
              {stats.bestScore.toLocaleString()}
            </div>
          </div>
          <div className="py-2">
            <div className="text-xs text-slate-400">Distance</div>
            <div className="mt-0.5 font-mono text-base font-bold text-white tabular-nums">
              {hud.distance}m
            </div>
          </div>
          <div className="py-2">
            <div className="text-xs text-slate-400">Coins</div>
            <div className="mt-0.5 font-mono text-base font-bold text-amber-300 tabular-nums inline-flex items-center justify-center gap-1">
              <CoinSvg className="w-4 h-4" />+{hud.coins}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[50px] px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-display text-lg font-extrabold inline-flex items-center justify-center gap-2 transition-transform cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            Play Again
          </button>

          <button
            type="button"
            onClick={onMainMenu}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors cursor-pointer"
          >
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
