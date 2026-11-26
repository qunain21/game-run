import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SoundEngine } from './audio';
import { createCartoonBoyRunner, type CartoonBoyController } from './cartoonBoy';
import { createModelFactory, type ModelFactory } from './models';
import { createGameTextures, type GameTextureSet } from './textures';
import {
  BASE_RUN_SPEED,
  FAST_FALL_SPEED,
  GRAVITY,
  JUMP_VELOCITY,
  LANE_WIDTH,
  MAX_RUN_SPEED,
  SLIDE_DURATION,
  TRACK_SEGMENT_COUNT,
  TRACK_SEGMENT_LENGTH,
  type GamePhase,
  type HudSnapshot,
  type LaneIndex,
  type ObstacleKind,
  type QualityMode,
} from './types';

interface PooledObstacle {
  kind: ObstacleKind;
  mesh: THREE.Group;
  active: boolean;
  lane: LaneIndex;
  z: number;
  halfDepth: number;
  minY: number;
  maxY: number;
  extraSpeed: number;
}

interface PooledCoin {
  mesh: THREE.Group;
  active: boolean;
  lane: LaneIndex;
  baseY: number;
  z: number;
  phase: number;
}

interface PooledParticle {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  gravity: number;
}

interface SceneryPair {
  z: number;
  leftGroup: THREE.Group;
  rightGroup: THREE.Group;
}

interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onGameOver: (finalSnapshot: HudSnapshot) => void;
  onContextLost?: (lost: boolean) => void;
}

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _v3A = new THREE.Vector3();
const _colorGold = new THREE.Color(0xfbbf24);
const _colorDust = new THREE.Color(0xe2e8f0);
const _colorCrash = new THREE.Color(0xef4444);
const _colorSpark = new THREE.Color(0xf97316);

export class RunnerEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private sound: SoundEngine;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private keyLight!: THREE.DirectionalLight;
  private textures!: GameTextureSet;
  private models!: ModelFactory;

  private isSoftwareGl = false;
  private qualityMode: QualityMode = 'auto';
  private disposed = false;
  private frameId = 0;
  private lastTimestamp = 0;

  private phase: GamePhase = 'menu';
  private runnerAnchor = new THREE.Group();
  private runnerCtrl: CartoonBoyController | null = null;
  private trackSegments: THREE.Group[] = [];
  private sceneryPairs: SceneryPair[] = [];

  private obstaclePool: PooledObstacle[] = [];
  private coinPool: PooledCoin[] = [];
  private particlePool: PooledParticle[] = [];
  private particleGeo!: THREE.BufferGeometry;
  private particleMats: THREE.MeshBasicMaterial[] = [];

  // Player kinematics
  private targetLane: LaneIndex = 0;
  private playerX = 0;
  private playerVx = 0;
  private bodyRoll = 0;
  private bodyYaw = 0;
  private playerY = 0;
  private playerVy = 0;
  private isGrounded = true;
  private slideTimer = 0;
  private squashY = 1;
  private lastHudKey = '';

  // Input buffering (140ms)
  private bufferedJump = 0;
  private bufferedSlide = 0;

  // Progression & juice
  private runSpeed = BASE_RUN_SPEED;
  private distance = 0;
  private score = 0;
  private coins = 0;
  private bestScore = 0;
  private nextSpawnZ = -48;
  private nextMilestone = 500;
  private milestoneText: string | null = null;
  private milestoneTimer = 0;

  private hitstopTimer = 0;
  private crashTimer = 0;
  private shakeTrauma = 0;
  private menuElapsed = 0;
  private hudEmitAccum = 0;

  private onResizeBound: () => void;
  private onContextLostBound: (e: Event) => void;
  private onContextRestoredBound: () => void;

  constructor(
    container: HTMLElement,
    sound: SoundEngine,
    bestScore: number,
    qualityMode: QualityMode,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.sound = sound;
    this.bestScore = bestScore;
    this.qualityMode = qualityMode;
    this.callbacks = callbacks;

    this.onResizeBound = this.handleResize.bind(this);
    this.onContextLostBound = (e: Event) => {
      e.preventDefault();
      this.callbacks.onContextLost?.(true);
    };
    this.onContextRestoredBound = () => {
      this.callbacks.onContextLost?.(false);
    };

    this.initRendererAndScene();
    this.buildWorld();
    this.applyQualitySettings();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.onResizeBound);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLostBound);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestoredBound);

    this.lastTimestamp = performance.now();
    this.scheduleNextFrame();
  }

  private detectSoftwareGl(): boolean {
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return false;
    }
  }

  private initRendererAndScene(): void {
    this.isSoftwareGl = this.detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyColor = 0x8ad4f5;
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.Fog(0xdceefa, 48, 138);

    // Camera tuned for both portrait mobile & widescreen desktop
    const aspect = width / Math.max(1, height);
    const baseFov = aspect < 0.8 ? 66 : 56;
    this.camera = new THREE.PerspectiveCamera(baseFov, aspect, 0.2, 200);
    this.camera.position.set(0, 5.2, 8.2);

    // Mandatory studio environment map via RoomEnvironment + PMREMGenerator
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Warm/cool contrast lighting rig
    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x64748b, 0.78);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xfff1d6, 1.55);
    this.keyLight.position.set(14, 24, 14);
    this.keyLight.target.position.set(0, 0, -12);
    this.scene.add(this.keyLight.target);

    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 75;
    this.keyLight.shadow.camera.left = -16;
    this.keyLight.shadow.camera.right = 16;
    this.keyLight.shadow.camera.top = 24;
    this.keyLight.shadow.camera.bottom = -20;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    const rimLight = new THREE.DirectionalLight(0xfff7ed, 0.72);
    rimLight.position.set(-10, 11, -22);
    this.scene.add(rimLight);
  }

  private buildWorld(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createGameTextures(maxAniso);
    this.models = createModelFactory(this.textures);

    // Rigged Stylized Cartoon Boy Runner (GLB export -> GLTFLoader -> AnimationMixer)
    this.scene.add(this.runnerAnchor);
    createCartoonBoyRunner(this.textures.contactShadow, maxAniso)
      .then((ctrl) => {
        if (this.disposed) {
          ctrl.dispose();
          return;
        }
        this.runnerCtrl = ctrl;
        this.runnerAnchor.add(ctrl.root);
        if (this.phase === 'playing') {
          ctrl.setAnimState('run', 0.05);
        } else {
          ctrl.setAnimState('idle', 0.05);
        }
      })
      .catch(() => {
        // Fallback: keep basic silhouette if GLB export unsupported
        const fallback = this.models.createRunner();
        this.runnerAnchor.add(fallback.root);
      });

    // Endless track segments
    for (let i = 0; i < TRACK_SEGMENT_COUNT; i++) {
      const seg = this.models.createTrackSegment();
      seg.position.z = 12 - i * TRACK_SEGMENT_LENGTH;
      this.scene.add(seg);
      this.trackSegments.push(seg);
    }

    // Flanking buildings & trees
    const scenerySpacing = 18;
    const sceneryCount = 9;
    for (let i = 0; i < sceneryCount; i++) {
      const z = 12 - i * scenerySpacing;
      const leftGroup = new THREE.Group();
      const rightGroup = new THREE.Group();

      const bL = this.models.createBuilding(i, 0.85 + (i % 3) * 0.22);
      bL.position.set(-13.5, 0, 0);
      leftGroup.add(bL);

      const bR = this.models.createBuilding(i + 1, 0.9 + ((i + 1) % 3) * 0.2);
      bR.position.set(13.5, 0, 0);
      rightGroup.add(bR);

      if (i % 2 === 0) {
        const treeL = this.models.createTree();
        treeL.position.set(-7.6, 0.36, 4.5);
        leftGroup.add(treeL);
      } else {
        const treeR = this.models.createTree();
        treeR.position.set(7.6, 0.36, -4.5);
        rightGroup.add(treeR);
      }

      leftGroup.position.z = z;
      rightGroup.position.z = z;
      this.scene.add(leftGroup);
      this.scene.add(rightGroup);
      this.sceneryPairs.push({ z, leftGroup, rightGroup });
    }

    // Obstacle pools
    const addObsPool = (kind: ObstacleKind, count: number, factory: (idx: number) => THREE.Group, halfDepth: number, minY: number, maxY: number) => {
      for (let i = 0; i < count; i++) {
        const mesh = factory(i);
        mesh.visible = false;
        this.scene.add(mesh);
        this.obstaclePool.push({
          kind,
          mesh,
          active: false,
          lane: 0,
          z: -200,
          halfDepth,
          minY,
          maxY,
          extraSpeed: 0,
        });
      }
    };

    addObsPool('barrier_low', 7, () => this.models.createLowBarrier(), 0.36, 0, 1.0);
    addObsPool('barrier_high', 6, () => this.models.createHighBarrier(), 0.36, 1.18, 2.6);
    addObsPool('signal', 6, () => this.models.createSignalPost(), 0.45, 0, 3.4);
    addObsPool('train_static', 5, (i) => this.models.createTrain((i % 3) as 0 | 1 | 2), 6.85, 0, 3.35);
    addObsPool('train_moving', 4, (i) => this.models.createTrain(((i + 1) % 3) as 0 | 1 | 2), 6.85, 0, 3.35);

    // Coin pool (48 coins)
    for (let i = 0; i < 48; i++) {
      const mesh = this.models.createCoin();
      mesh.visible = false;
      this.scene.add(mesh);
      this.coinPool.push({
        mesh,
        active: false,
        lane: 0,
        baseY: 0.9,
        z: -200,
        phase: i * 0.4,
      });
    }

    // Particle pool (64 cubes for coin sparks, dust, crash bursts)
    this.particleGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    for (let i = 0; i < 64; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 1 });
      this.particleMats.push(mat);
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particlePool.push({
        mesh,
        active: false,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.4,
        gravity: 16,
      });
    }
  }

  public setQualityMode(mode: QualityMode): void {
    this.qualityMode = mode;
    this.applyQualitySettings();
  }

  public setBestScore(best: number): void {
    this.bestScore = Math.max(this.bestScore, best);
  }

  private applyQualitySettings(): void {
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.keyLight.castShadow = false;
      return;
    }

    if (this.qualityMode === 'eco') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.keyLight.castShadow = false;
    } else if (this.qualityMode === 'high') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.keyLight.castShadow = true;
    } else {
      const dpr = window.devicePixelRatio || 1;
      const isNarrowMobile = (this.container.clientWidth || window.innerWidth) < 640;
      this.renderer.setPixelRatio(Math.min(dpr, isNarrowMobile ? 1.5 : 2));
      this.renderer.shadowMap.enabled = true;
      this.keyLight.castShadow = true;
    }
  }

  public startRun(): void {
    this.sound.unlock();
    this.resetWorldState();
    this.phase = 'playing';
    // Position camera cleanly behind character for smooth chase pull-back without passing through mesh
    if (this.camera.position.z < 2.5) {
      this.camera.position.set(0, 3.6, 4.2);
    }
    this.runnerCtrl?.setAnimState('run', 0.14);
    this.emitHud();
  }

  public pause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.clearBufferedInputs();
    }
  }

  public resume(): void {
    if (this.phase === 'paused') {
      this.sound.unlock();
      this.lastTimestamp = performance.now();
      this.phase = 'playing';
    }
  }

  public returnToMenu(): void {
    this.resetWorldState();
    this.phase = 'menu';
    this.runnerCtrl?.setAnimState('idle', 0.18);
    this.emitHud();
  }

  private resetWorldState(): void {
    this.targetLane = 0;
    this.playerX = 0;
    this.playerVx = 0;
    this.bodyRoll = 0;
    this.bodyYaw = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.isGrounded = true;
    this.slideTimer = 0;
    this.squashY = 1;
    this.lastHudKey = '';
    this.clearBufferedInputs();

    this.runSpeed = BASE_RUN_SPEED;
    this.distance = 0;
    this.score = 0;
    this.coins = 0;
    this.nextSpawnZ = -44;
    this.nextMilestone = 500;
    this.milestoneText = null;
    this.milestoneTimer = 0;
    this.hitstopTimer = 0;
    this.crashTimer = 0;
    this.shakeTrauma = 0;

    this.runnerAnchor.position.set(0, 0, 0);
    if (this.runnerCtrl) {
      this.runnerCtrl.modelRoot.position.set(0, 0, 0);
      this.runnerCtrl.modelRoot.rotation.set(0, 0, 0);
      this.runnerCtrl.modelRoot.scale.set(1, 1, 1);
    }

    for (const obs of this.obstaclePool) {
      obs.active = false;
      obs.mesh.visible = false;
    }
    for (const c of this.coinPool) {
      c.active = false;
      c.mesh.visible = false;
    }
    for (const p of this.particlePool) {
      p.active = false;
      p.mesh.visible = false;
    }

    // Pre-populate a friendly opening stretch of coins and first obstacles
    while (this.nextSpawnZ > -115) {
      this.spawnNextPattern();
    }
  }

  public clearBufferedInputs(): void {
    this.bufferedJump = 0;
    this.bufferedSlide = 0;
  }

  public inputLane(delta: -1 | 1): void {
    if (this.phase !== 'playing' || this.crashTimer > 0) return;
    this.sound.unlock();
    const next = Math.max(-1, Math.min(1, this.targetLane + delta)) as LaneIndex;
    if (next !== this.targetLane) {
      this.targetLane = next;
      this.sound.playLaneShift();
    }
  }

  public inputJump(): void {
    if (this.phase !== 'playing' || this.crashTimer > 0) return;
    this.sound.unlock();
    if (this.isGrounded) {
      this.executeJump();
    } else {
      this.bufferedJump = 0.14;
    }
  }

  public inputSlide(): void {
    if (this.phase !== 'playing' || this.crashTimer > 0) return;
    this.sound.unlock();
    if (this.isGrounded) {
      this.executeSlide();
    } else {
      // Fast-fall slam into slide!
      this.playerVy = Math.min(this.playerVy, -FAST_FALL_SPEED);
      this.bufferedSlide = 0.22;
    }
  }

  private executeJump(): void {
    this.isGrounded = false;
    this.slideTimer = 0;
    this.playerVy = JUMP_VELOCITY;
    this.squashY = 1.16;
    this.bufferedJump = 0;
    this.runnerCtrl?.setAnimState('jump', 0.08);
    this.sound.playJump();
    this.spawnParticles(this.playerX, 0.15, 0.1, _colorDust, 6, 4.5);
  }

  private executeSlide(): void {
    this.slideTimer = SLIDE_DURATION;
    this.squashY = 0.92;
    this.bufferedSlide = 0;
    this.runnerCtrl?.setAnimState('slide', 0.08);
    this.sound.playSlide();
    this.spawnParticles(this.playerX, 0.15, 0.2, _colorDust, 5, 3.5);
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    color: THREE.Color,
    count: number,
    speed: number,
  ): void {
    let spawned = 0;
    for (const p of this.particlePool) {
      if (!p.active) {
        p.active = true;
        p.life = 0;
        p.maxLife = 0.28 + Math.random() * 0.22;
        p.vx = (Math.random() - 0.5) * speed * 1.4;
        p.vy = (0.35 + Math.random() * 0.85) * speed;
        p.vz = (Math.random() - 0.3) * speed;
        p.gravity = 16;
        p.mesh.position.set(x, y, z);
        p.mesh.scale.setScalar(0.8 + Math.random() * 0.7);
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.color.copy(color);
        mat.opacity = 1;
        p.mesh.visible = true;
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  private acquireObstacle(kind: ObstacleKind): PooledObstacle | null {
    for (const obs of this.obstaclePool) {
      if (!obs.active && obs.kind === kind) {
        return obs;
      }
    }
    return null;
  }

  private acquireCoin(): PooledCoin | null {
    for (const coin of this.coinPool) {
      if (!coin.active) return coin;
    }
    return null;
  }

  private spawnCoinLine(lane: LaneIndex, startZ: number, count: number, spacing: number, arch = false): void {
    for (let i = 0; i < count; i++) {
      const coin = this.acquireCoin();
      if (!coin) return;
      const t = count > 1 ? i / (count - 1) : 0.5;
      const arcY = arch ? 0.9 + Math.sin(t * Math.PI) * 1.75 : 0.92;
      coin.active = true;
      coin.lane = lane;
      coin.baseY = arcY;
      coin.z = startZ - i * spacing;
      coin.mesh.position.set(lane * LANE_WIDTH, arcY, coin.z);
      coin.mesh.visible = true;
    }
  }

  private spawnNextPattern(): void {
    const z = this.nextSpawnZ;
    const difficulty = Math.min(1, this.distance / 1400);
    const roll = Math.random();

    if (roll < 0.25) {
      // Pattern A: Two barriers (one low jumpable, one high slideable) + 1 free lane
      const lanes: LaneIndex[] = [-1, 0, 1];
      const openIdx = Math.floor(Math.random() * 3);
      for (let i = 0; i < 3; i++) {
        const lane = lanes[i];
        if (i === openIdx) {
          this.spawnCoinLine(lane, z + 3, 4, 2.4, false);
          continue;
        }
        const kind: ObstacleKind = Math.random() < 0.52 ? 'barrier_low' : 'barrier_high';
        const obs = this.acquireObstacle(kind);
        if (obs) {
          obs.active = true;
          obs.lane = lane;
          obs.z = z;
          obs.extraSpeed = 0;
          obs.mesh.position.set(lane * LANE_WIDTH, 0, z);
          obs.mesh.visible = true;
          if (kind === 'barrier_low') {
            this.spawnCoinLine(lane, z + 3.2, 3, 3.2, true);
          } else {
            this.spawnCoinLine(lane, z + 2.5, 3, 2.5, false);
          }
        }
      }
      this.nextSpawnZ -= 23 - difficulty * 4;
    } else if (roll < 0.52) {
      // Pattern B: Parked train(s) in 1 or 2 lanes, safe lane gets coin trail
      const safeLane = ([-1, 0, 1] as LaneIndex[])[Math.floor(Math.random() * 3)];
      const blockCount = difficulty > 0.25 && Math.random() < 0.6 ? 2 : 1;
      const otherLanes = ([-1, 0, 1] as LaneIndex[]).filter((l) => l !== safeLane);

      for (let i = 0; i < blockCount; i++) {
        const lane = otherLanes[i];
        const obs = this.acquireObstacle('train_static');
        if (obs) {
          obs.active = true;
          obs.lane = lane;
          obs.z = z - 6;
          obs.extraSpeed = 0;
          obs.mesh.position.set(lane * LANE_WIDTH, 0, obs.z);
          obs.mesh.visible = true;
        }
      }

      // Optional low barrier in safe lane at exit for fun rhythm
      if (Math.random() < 0.45) {
        const low = this.acquireObstacle('barrier_low');
        if (low) {
          low.active = true;
          low.lane = safeLane;
          low.z = z - 6;
          low.extraSpeed = 0;
          low.mesh.position.set(safeLane * LANE_WIDTH, 0, low.z);
          low.mesh.visible = true;
          this.spawnCoinLine(safeLane, z - 2.8, 3, 3.2, true);
        }
      } else {
        this.spawnCoinLine(safeLane, z + 1, 5, 2.6, false);
      }

      this.nextSpawnZ -= 31 - difficulty * 4;
    } else if (roll < 0.78) {
      // Pattern C: Oncoming moving train + signal post
      const trainLane = ([-1, 0, 1] as LaneIndex[])[Math.floor(Math.random() * 3)];
      const obs = this.acquireObstacle('train_moving');
      if (obs) {
        obs.active = true;
        obs.lane = trainLane;
        // Spawn slightly farther back since it approaches faster!
        obs.z = z - 16;
        obs.extraSpeed = 12 + difficulty * 6;
        obs.mesh.position.set(trainLane * LANE_WIDTH, 0, obs.z);
        obs.mesh.visible = true;
      }

      const otherLanes = ([-1, 0, 1] as LaneIndex[]).filter((l) => l !== trainLane);
      const sigLane = otherLanes[0];
      const sig = this.acquireObstacle('signal');
      if (sig) {
        sig.active = true;
        sig.lane = sigLane;
        sig.z = z - 2;
        sig.extraSpeed = 0;
        sig.mesh.position.set(sigLane * LANE_WIDTH, 0, sig.z);
        sig.mesh.visible = true;
      }

      const freeLane = otherLanes[1];
      this.spawnCoinLine(freeLane, z + 2, 5, 2.5, false);

      this.nextSpawnZ -= 27 - difficulty * 3.5;
    } else {
      // Pattern D: Slalom railway signals across lanes
      const lanes: LaneIndex[] = [-1, 0, 1];
      const openLane = lanes[Math.floor(Math.random() * 3)];
      for (const lane of lanes) {
        if (lane === openLane) {
          this.spawnCoinLine(lane, z + 2, 4, 2.4, false);
        } else {
          const sig = this.acquireObstacle('signal');
          if (sig) {
            sig.active = true;
            sig.lane = lane;
            sig.z = z;
            sig.extraSpeed = 0;
            sig.mesh.position.set(lane * LANE_WIDTH, 0, z);
            sig.mesh.visible = true;
          }
        }
      }
      this.nextSpawnZ -= 20 - difficulty * 3;
    }
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.applyQualitySettings();
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => {
        if (!this.disposed) this.tick(performance.now());
      });
    } else {
      this.frameId = requestAnimationFrame((now) => this.tick(now));
    }
  }

  private afterDraw(cb: () => void): void {
    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            this.frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            this.frameId = window.setTimeout(cb, 80);
          }
        };
        this.frameId = window.setTimeout(poll, 5);
        return;
      }
    } catch {
      // Fallback if fenceSync unavailable
    }
    this.frameId = window.setTimeout(cb, 80);
  }

  private tick(now: number): void {
    if (this.disposed) return;

    const rawDt = Math.max(0.001, (now - this.lastTimestamp) / 1000);
    this.lastTimestamp = now;
    const dt = Math.min(rawDt, 0.05);

    if (this.phase === 'menu') {
      this.updateMenuShowcase(dt);
    } else if (this.phase === 'playing') {
      this.updatePlaying(dt);
    }

    this.updateParticles(dt);
    this.updateCamera(dt);

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  }

  private updateMenuShowcase(dt: number): void {
    this.menuElapsed += dt;
    // Advance idle AnimationMixer with feet planted cleanly on the railway track
    this.runnerCtrl?.update(dt);
  }

  private updatePlaying(dt: number): void {
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.4);
      return;
    }

    if (this.crashTimer > 0) {
      this.crashTimer -= dt;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.6);
      this.runnerCtrl?.update(dt);

      if (this.crashTimer <= 0) {
        this.phase = 'gameover';
        const finalSnap = this.buildHudSnapshot();
        this.callbacks.onGameOver(finalSnap);
      }
      return;
    }

    // Gradual speed progression
    this.runSpeed = Math.min(MAX_RUN_SPEED, BASE_RUN_SPEED + this.distance * 0.0115);

    // Process input buffers
    if (this.bufferedJump > 0) this.bufferedJump -= dt;
    if (this.bufferedSlide > 0) this.bufferedSlide -= dt;

    // Smooth critically-damped lateral lane transition (frame-rate independent, zero initial jerk)
    const targetX = this.targetLane * LANE_WIDTH;
    const omega = 19.5;
    const diff = this.playerX - targetX;
    const temp = (this.playerVx + omega * diff) * dt;
    const exp = Math.exp(-omega * dt);
    this.playerX = targetX + (diff + temp) * exp;
    this.playerVx = (this.playerVx - omega * temp) * exp;

    if (Math.abs(this.playerX - targetX) < 0.0005 && Math.abs(this.playerVx) < 0.005) {
      this.playerX = targetX;
      this.playerVx = 0;
    }

    // Subtle natural body roll & turn yaw into the lane change, smoothly returning upright
    const targetRoll = THREE.MathUtils.clamp(-this.playerVx * 0.013, -0.24, 0.24);
    const targetYaw = THREE.MathUtils.clamp(-this.playerVx * 0.01, -0.2, 0.2);
    this.bodyRoll = THREE.MathUtils.damp(this.bodyRoll, targetRoll, 18, dt);
    this.bodyYaw = THREE.MathUtils.damp(this.bodyYaw, targetYaw, 18, dt);
    if (this.runnerCtrl) {
      this.runnerCtrl.modelRoot.rotation.z = this.bodyRoll;
      this.runnerCtrl.modelRoot.rotation.y = this.bodyYaw;
    }

    // Jump & gravity
    if (!this.isGrounded) {
      this.playerVy -= GRAVITY * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerVy = 0;
        this.isGrounded = true;
        this.squashY = 0.84;
        this.spawnParticles(this.playerX, 0.12, 0.1, _colorDust, 5, 3.2);

        if (this.bufferedSlide > 0) {
          this.executeSlide();
        } else if (this.bufferedJump > 0) {
          this.executeJump();
        } else {
          this.runnerCtrl?.setAnimState('land', 0.06);
        }
      }
    }

    // Slide timer
    if (this.slideTimer > 0) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.slideTimer = 0;
        if (this.bufferedJump > 0 && this.isGrounded) {
          this.executeJump();
        } else if (this.isGrounded) {
          this.runnerCtrl?.setAnimState('run', 0.12);
        }
      }
    }

    // Squash & stretch recovery + ground-aligned position
    this.squashY = THREE.MathUtils.damp(this.squashY, 1, 14, dt);
    const invXZ = 1 / Math.sqrt(Math.max(0.7, this.squashY));
    this.runnerAnchor.position.set(this.playerX, 0, 0);

    if (this.runnerCtrl) {
      this.runnerCtrl.modelRoot.position.y = this.playerY;
      this.runnerCtrl.modelRoot.scale.set(invXZ, this.squashY, invXZ);

      const speedFactor = 0.92 + (this.runSpeed / BASE_RUN_SPEED - 1) * 0.65;
      this.runnerCtrl.setRunTimeScale(speedFactor);
      this.runnerCtrl.update(dt);

      // Ground shadow scales with jump altitude
      const shadowScale = Math.max(0.38, 1 - this.playerY * 0.22);
      this.runnerCtrl.shadowDisc.scale.setScalar(shadowScale);
      (this.runnerCtrl.shadowDisc.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0.18,
        0.65 - this.playerY * 0.15,
      );
    }

    // Advance distance & score
    const dz = this.runSpeed * dt;
    this.distance += dz;
    this.score = Math.floor(this.distance * 2.5 + this.coins * 15);
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
    }

    // Milestones every 500m
    if (this.distance >= this.nextMilestone) {
      this.milestoneText = `${this.nextMilestone}m Reached!`;
      this.milestoneTimer = 2.0;
      this.nextMilestone += 500;
      this.sound.playMilestone();
    }
    if (this.milestoneTimer > 0) {
      this.milestoneTimer -= dt;
      if (this.milestoneTimer <= 0) {
        this.milestoneText = null;
      }
    }

    // Scroll tracks
    for (const seg of this.trackSegments) {
      seg.position.z += dz;
      if (seg.position.z > TRACK_SEGMENT_LENGTH + 8) {
        seg.position.z -= TRACK_SEGMENT_COUNT * TRACK_SEGMENT_LENGTH;
      }
    }

    // Scroll buildings & trees
    const scenerySpan = this.sceneryPairs.length * 18;
    for (const pair of this.sceneryPairs) {
      pair.z += dz;
      if (pair.z > 24) {
        pair.z -= scenerySpan;
      }
      pair.leftGroup.position.z = pair.z;
      pair.rightGroup.position.z = pair.z;
    }

    // Advance spawner horizon
    this.nextSpawnZ += dz;
    while (this.nextSpawnZ > -125) {
      this.spawnNextPattern();
    }

    // Player collision bounds
    const playerBottom = this.playerY;
    const playerTop = this.playerY + (this.slideTimer > 0 ? 0.9 : 1.84);
    const playerHalfZ = 0.34;

    // Move obstacles & check collisions
    for (const obs of this.obstaclePool) {
      if (!obs.active) continue;
      obs.z += (this.runSpeed + obs.extraSpeed) * dt;
      obs.mesh.position.z = obs.z;

      if (obs.z - obs.halfDepth > 14) {
        obs.active = false;
        obs.mesh.visible = false;
        continue;
      }

      // Check Z overlap
      if (Math.abs(obs.z) < obs.halfDepth + playerHalfZ) {
        // Check X lane overlap
        const laneX = obs.lane * LANE_WIDTH;
        if (Math.abs(this.playerX - laneX) < 0.88) {
          // Check Y overlap
          if (playerTop > obs.minY + 0.08 && playerBottom < obs.maxY - 0.08) {
            this.triggerCrash();
            return;
          }
        }
      }
    }

    // Move coins & check collection
    for (const coin of this.coinPool) {
      if (!coin.active) continue;
      coin.z += dz;
      coin.phase += dt * 4.5;
      coin.mesh.position.z = coin.z;
      coin.mesh.position.y = coin.baseY + Math.sin(coin.phase) * 0.12;
      coin.mesh.rotation.y += dt * 3.8;

      if (coin.z > 10) {
        coin.active = false;
        coin.mesh.visible = false;
        continue;
      }

      const coinX = coin.lane * LANE_WIDTH;
      const dx = Math.abs(this.playerX - coinX);
      const dy = Math.abs((this.playerY + (this.slideTimer > 0 ? 0.48 : 0.95)) - coin.mesh.position.y);
      const dzCoin = Math.abs(coin.z);

      if (dx < 1.1 && dy < 1.15 && dzCoin < 1.15) {
        coin.active = false;
        coin.mesh.visible = false;
        this.coins += 1;
        this.sound.playCoin();
        this.spawnParticles(coinX, coin.mesh.position.y, coin.z, _colorGold, 7, 5.2);
      }
    }

    // Throttled & dirty-checked HUD updates (~10Hz) so React never causes frame jitter
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.1) {
      this.hudEmitAccum = 0;
      const distInt = Math.floor(this.distance);
      const mult = (this.runSpeed / BASE_RUN_SPEED).toFixed(1);
      const key = `${this.score}|${distInt}|${this.coins}|${mult}|${this.milestoneText ?? ''}`;
      if (key !== this.lastHudKey) {
        this.lastHudKey = key;
        this.emitHud();
      }
    }
  }

  private triggerCrash(): void {
    this.hitstopTimer = 0.065;
    this.crashTimer = 0.52;
    this.shakeTrauma = 0.85;
    this.runnerCtrl?.setAnimState('fall', 0.06);
    this.sound.playCrash();
    this.spawnParticles(this.playerX, this.playerY + 0.9, -0.2, _colorCrash, 12, 7.5);
    this.spawnParticles(this.playerX, this.playerY + 0.7, -0.2, _colorSpark, 8, 6.2);
    this.emitHud();
  }

  private updateParticles(dt: number): void {
    for (const p of this.particlePool) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 7;
      p.mesh.rotation.y += dt * 6;
      const t = 1 - p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t;
      p.mesh.scale.setScalar(0.5 + t * 0.65);
    }
  }

  private updateCamera(dt: number): void {
    const aspect = this.camera.aspect;
    const isPortrait = aspect < 0.85;

    if (this.phase === 'menu') {
      // Showcase Cartoon Boy standing in a natural idle pose from a front-3/4 angle
      const swayX = 1.55 + Math.sin(this.menuElapsed * 0.5) * 0.55;
      const swayY = 1.62 + Math.sin(this.menuElapsed * 0.65) * 0.12;
      const camZ = isPortrait ? -4.5 : -3.6;
      _v3A.set(swayX, swayY, camZ);
      this.camera.position.lerp(_v3A, 1 - Math.exp(-3.5 * dt));
      this.camera.lookAt(0, 0.96, 0);
      const targetFov = isPortrait ? 52 : 44;
      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    // Dynamic chase camera
    const speedRatio = (this.runSpeed - BASE_RUN_SPEED) / (MAX_RUN_SPEED - BASE_RUN_SPEED);
    const targetFov = (isPortrait ? 65 : 56) + speedRatio * 9;
    if (Math.abs(this.camera.fov - targetFov) > 0.02) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, dt);
      this.camera.updateProjectionMatrix();
    }

    const targetCamX = this.playerX * 0.72;
    const targetCamY = (isPortrait ? 5.15 : 4.55) + this.playerY * 0.48;
    const targetCamZ = isPortrait ? 8.8 : 7.2;

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 11, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 9, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 8, dt);

    // Camera trauma shake
    if (this.shakeTrauma > 0.001) {
      const mag = this.shakeTrauma * this.shakeTrauma * 0.45;
      this.camera.position.x += (Math.random() - 0.5) * mag;
      this.camera.position.y += (Math.random() - 0.5) * mag;
    }

    this.camera.lookAt(this.playerX * 0.45, 1.5 + this.playerY * 0.35, -13);
  }

  private buildHudSnapshot(): HudSnapshot {
    return {
      score: this.score,
      distance: Math.floor(this.distance),
      coins: this.coins,
      speedMultiplier: Number((this.runSpeed / BASE_RUN_SPEED).toFixed(1)),
      bestScore: this.bestScore,
      milestoneLabel: this.milestoneText,
    };
  }

  private emitHud(): void {
    this.callbacks.onHudUpdate(this.buildHudSnapshot());
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    window.removeEventListener('resize', this.onResizeBound);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLostBound);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestoredBound);

    this.particleGeo.dispose();
    this.particleMats.forEach((m) => m.dispose());
    this.runnerCtrl?.dispose();
    this.models.dispose();
    this.textures.dispose();

    if (this.scene.environment) {
      this.scene.environment.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
