import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { GameModals } from './components/GameModals';
import { SoundEngine } from './game/audio';
import { RunnerEngine } from './game/RunnerEngine';
import {
  loadPersistentStats,
  savePersistentStats,
  type GamePhase,
  type HudSnapshot,
  type PersistentStats,
  type QualityMode,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  score: 0,
  distance: 0,
  coins: 0,
  speedMultiplier: 1.0,
  bestScore: 0,
  milestoneLabel: null,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RunnerEngine | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);

  const [initialStats] = useState<PersistentStats>(() => loadPersistentStats());
  const [stats, setStats] = useState<PersistentStats>(initialStats);
  const statsRef = useRef<PersistentStats>(initialStats);

  const [phase, setPhase] = useState<GamePhase>('menu');
  const phaseRef = useRef<GamePhase>('menu');

  const [hud, setHud] = useState<HudSnapshot>({
    ...INITIAL_HUD,
    bestScore: initialStats.bestScore,
  });
  const [isNewBest, setIsNewBest] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const updatePhase = useCallback((next: GamePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const updateStats = useCallback((updater: (prev: PersistentStats) => PersistentStats) => {
    setStats((prev) => {
      const next = updater(prev);
      statsRef.current = next;
      savePersistentStats(next);
      return next;
    });
  }, []);

  // Initialize Three.js RunnerEngine once inside isolated ref container
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const sound = new SoundEngine(statsRef.current.muted);
    soundRef.current = sound;

    let engine: RunnerEngine | null = null;
    try {
      engine = new RunnerEngine(
        container,
        sound,
        statsRef.current.bestScore,
        statsRef.current.qualityMode,
        {
          onHudUpdate: (snapshot) => {
            setHud(snapshot);
          },
          onGameOver: (finalSnapshot) => {
            const prevBest = statsRef.current.bestScore;
            const beatBest = finalSnapshot.score > prevBest;
            setIsNewBest(beatBest);
            setHud(finalSnapshot);
            updateStats((prev) => ({
              ...prev,
              bestScore: Math.max(prev.bestScore, finalSnapshot.score),
              totalCoins: prev.totalCoins + finalSnapshot.coins,
              runsPlayed: prev.runsPlayed + 1,
            }));
            updatePhase('gameover');
          },
          onContextLost: (lost) => {
            setContextLost(lost);
          },
        },
      );
      engineRef.current = engine;
    } catch {
      setContextLost(true);
    }

    return () => {
      engine?.dispose();
      engineRef.current = null;
      sound.dispose();
      soundRef.current = null;
    };
  }, [updatePhase, updateStats]);

  const handleStart = useCallback(() => {
    setIsNewBest(false);
    setHud({ ...INITIAL_HUD, bestScore: statsRef.current.bestScore });
    updatePhase('playing');
    engineRef.current?.startRun();
  }, [updatePhase]);

  const handlePause = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    engineRef.current?.pause();
    updatePhase('paused');
  }, [updatePhase]);

  const handleResume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    engineRef.current?.resume();
    updatePhase('playing');
  }, [updatePhase]);

  const handleMainMenu = useCallback(() => {
    engineRef.current?.returnToMenu();
    updatePhase('menu');
  }, [updatePhase]);

  const handleToggleMute = useCallback(() => {
    updateStats((prev) => {
      const muted = !prev.muted;
      soundRef.current?.setMuted(muted);
      return { ...prev, muted };
    });
  }, [updateStats]);

  const handleChangeQuality = useCallback(
    (qualityMode: QualityMode) => {
      engineRef.current?.setQualityMode(qualityMode);
      updateStats((prev) => ({ ...prev, qualityMode }));
    },
    [updateStats],
  );

  // Keyboard controls + blur safety
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const currentPhase = phaseRef.current;

      if (currentPhase === 'menu' || currentPhase === 'gameover') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStart();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (currentPhase === 'playing') {
          handlePause();
        } else if (currentPhase === 'paused') {
          handleResume();
        }
        return;
      }

      if (currentPhase !== 'playing') return;
      if (e.repeat) return;

      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault();
          engineRef.current?.inputLane(-1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault();
          engineRef.current?.inputLane(1);
          break;
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
          e.preventDefault();
          engineRef.current?.inputJump();
          break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault();
          engineRef.current?.inputSlide();
          break;
      }
    };

    const onBlur = () => {
      engineRef.current?.clearBufferedInputs();
      if (phaseRef.current === 'playing') {
        handlePause();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [handlePause, handleResume, handleStart]);

  // Responsive touch swipe controls (instant trigger on threshold, prevents page scroll)
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let triggered = false;
    const SWIPE_THRESHOLD = 18;

    const onTouchStart = (e: TouchEvent) => {
      if (phaseRef.current !== 'playing') return;
      // Ignore touches originating on HUD buttons
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button')) return;

      if (e.touches.length > 0) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
        triggered = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (phaseRef.current !== 'playing') return;
      // Prevent browser scrolling / pull-to-refresh while playing
      e.preventDefault();

      if (!tracking || triggered || e.touches.length === 0) return;

      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (Math.max(absX, absY) >= SWIPE_THRESHOLD) {
        triggered = true;
        if (absX > absY) {
          engineRef.current?.inputLane(dx > 0 ? 1 : -1);
        } else {
          if (dy < 0) {
            engineRef.current?.inputJump();
          } else {
            engineRef.current?.inputSlide();
          }
        }
      }
    };

    const onTouchEnd = () => {
      tracking = false;
      triggered = false;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return (
    <main className="relative w-screen h-[100dvh] overflow-hidden bg-slate-950 select-none touch-none">
      {/* Isolated WebGL mount point — React never renders children here */}
      <div ref={mountRef} className="fixed inset-0 w-full h-full" />

      {/* Graceful WebGL fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-slate-950 text-center">
          <div className="max-w-sm rounded-2xl bg-slate-900 border border-white/15 p-6">
            <h1 className="font-display text-xl font-bold text-white">3D Renderer Paused</h1>
            <p className="mt-2 text-sm text-slate-300">
              WebGL context was interrupted or is unavailable on this device. Reload the page to restore the 3D scene.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 px-5 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-sm"
            >
              Reload Game
            </button>
          </div>
        </div>
      )}

      {/* Active Gameplay HUD */}
      {phase === 'playing' && (
        <GameHUD
          hud={hud}
          muted={stats.muted}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
        />
      )}

      {/* Main Menu / Pause / Game Over Overlays */}
      <GameModals
        phase={phase}
        hud={hud}
        stats={stats}
        isNewBest={isNewBest}
        onStart={handleStart}
        onResume={handleResume}
        onRestart={handleStart}
        onMainMenu={handleMainMenu}
        onToggleMute={handleToggleMute}
        onChangeQuality={handleChangeQuality}
      />
    </main>
  );
}
