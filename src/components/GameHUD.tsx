import { memo } from 'react';
import { Pause, Volume2, VolumeX } from 'lucide-react';
import type { HudSnapshot } from '../game/types';

interface GameHUDProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
}

export function CoinSvg({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#F59E0B" />
      <circle cx="12" cy="12" r="7.5" fill="#FBBF24" stroke="#FEF08A" strokeWidth="1.2" />
      <path d="M12 7.5L14.6 12L12 16.5L9.4 12Z" fill="#FEF9C3" />
    </svg>
  );
}

export const GameHUD = memo(function GameHUD({ hud, muted, onToggleMute, onPause }: GameHUDProps) {
  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Top Perimeter Status Row (<= 12% mobile height, zero backdrop-blur) */}
      <div className="flex items-start justify-between gap-3">
        {/* Score & Distance Cluster */}
        <div className="bg-slate-950/88 border border-white/12 rounded-xl px-3.5 py-2 shadow-md">
          <div className="font-display text-2xl sm:text-3xl font-black tracking-tight text-white tabular-nums leading-none">
            {hud.score.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs font-mono text-slate-300 tabular-nums">
            <span>{hud.distance}m</span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <span className="text-amber-300">{hud.speedMultiplier.toFixed(1)}x</span>
          </div>
        </div>

        {/* Coins & Action Controls */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-950/88 border border-white/12 rounded-xl px-3 py-2 flex items-center gap-2 shadow-md min-h-[44px]">
            <CoinSvg className="w-5 h-5 shrink-0" />
            <span className="font-mono text-base sm:text-lg font-bold text-amber-300 tabular-nums leading-none">
              {hud.coins}
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="pointer-events-auto min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-950/88 border border-white/12 text-slate-100 hover:bg-slate-900 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={onPause}
            aria-label="Pause game"
            className="pointer-events-auto min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-950/88 border border-white/12 text-slate-100 hover:bg-slate-900 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <Pause className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Transient Distance Milestone Toast */}
      {hud.milestoneLabel && (
        <div className="self-center mb-10 bg-slate-950/90 border border-amber-400/50 rounded-xl px-5 py-2 text-center shadow-lg">
          <span className="font-display text-base sm:text-lg font-extrabold text-amber-300 tracking-wide">
            {hud.milestoneLabel}
          </span>
        </div>
      )}
    </div>
  );
});
