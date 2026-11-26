import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type CharacterAnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'land'
  | 'slide'
  | 'dodgeLeft'
  | 'dodgeRight'
  | 'fall';

export interface CartoonBoyController {
  root: THREE.Group;
  modelRoot: THREE.Object3D;
  shadowDisc: THREE.Mesh;
  mixer: THREE.AnimationMixer;
  actions: Record<CharacterAnimState, THREE.AnimationAction>;
  setAnimState: (state: CharacterAnimState, fadeDuration?: number) => void;
  setRunTimeScale: (scale: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

// ============================================================================
// 1. High-Fidelity Procedural Textures & Micro-Bump Maps (Mobile-Safe <= 512px)
// ============================================================================

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finalizeColorTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function finalizeDataTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createCartoonFaceTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);

  // Soft warm porcelain-peach skin gradient with realistic cheek/jaw warmth
  const skinGrad = ctx.createLinearGradient(0, 0, 0, 512);
  skinGrad.addColorStop(0, '#fde5d6');
  skinGrad.addColorStop(0.52, '#f9d3bc');
  skinGrad.addColorStop(0.84, '#f3c3a7');
  skinGrad.addColorStop(1, '#e7b194');
  ctx.fillStyle = skinGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle ambient shading under brow & chin
  const browShade = ctx.createRadialGradient(256, 224, 24, 256, 224, 115);
  browShade.addColorStop(0, 'rgba(220, 148, 128, 0.16)');
  browShade.addColorStop(1, 'rgba(220, 148, 128, 0)');
  ctx.fillStyle = browShade;
  ctx.fillRect(130, 140, 252, 160);

  // Soft rosy Pixar blush on cheeks & nose bridge
  for (const cx of [190, 322]) {
    const blush = ctx.createRadialGradient(cx, 286, 4, cx, 286, 42);
    blush.addColorStop(0, 'rgba(244, 114, 148, 0.36)');
    blush.addColorStop(1, 'rgba(244, 114, 148, 0)');
    ctx.fillStyle = blush;
    ctx.fillRect(cx - 46, 240, 92, 92);
  }
  const noseBlush = ctx.createRadialGradient(256, 268, 2, 256, 268, 24);
  noseBlush.addColorStop(0, 'rgba(244, 128, 152, 0.25)');
  noseBlush.addColorStop(1, 'rgba(244, 128, 152, 0)');
  ctx.fillStyle = noseBlush;
  ctx.fillRect(228, 240, 56, 56);

  // Soft upper eyelid crease (3D eyeballs sit in front, this shades the socket cleanly)
  for (const ex of [210, 302]) {
    const socket = ctx.createRadialGradient(ex, 232, 10, ex, 232, 34);
    socket.addColorStop(0, 'rgba(176, 106, 92, 0.24)');
    socket.addColorStop(1, 'rgba(176, 106, 92, 0)');
    ctx.fillStyle = socket;
    ctx.fillRect(ex - 36, 196, 72, 72);

    ctx.strokeStyle = 'rgba(155, 86, 74, 0.55)';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(ex, 224, 30, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  // Friendly sculpted coral-pink lips & warm smile
  const lipGrad = ctx.createLinearGradient(0, 312, 0, 336);
  lipGrad.addColorStop(0, '#e07a82');
  lipGrad.addColorStop(1, '#ed9396');
  ctx.fillStyle = lipGrad;
  ctx.beginPath();
  ctx.ellipse(256, 323, 21, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#a8444e';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(234, 321);
  ctx.quadraticCurveTo(256, 332, 278, 321);
  ctx.stroke();

  // Subtle philtrum & chin highlight
  ctx.fillStyle = 'rgba(255, 245, 238, 0.35)';
  ctx.beginPath();
  ctx.ellipse(256, 348, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Back of head / nape hair shadow fade so sideburns & nape blend cleanly
  const backHair = ctx.createLinearGradient(0, 0, 0, 360);
  backHair.addColorStop(0, '#be4480');
  backHair.addColorStop(1, '#4f1b57');
  ctx.fillStyle = backHair;
  ctx.fillRect(0, 0, 142, 340);
  ctx.fillRect(370, 0, 142, 340);

  return finalizeColorTexture(c);
}

function createEyeTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  // Crisp white sclera with soft peripheral shading
  const scleraGrad = ctx.createRadialGradient(128, 128, 48, 128, 128, 128);
  scleraGrad.addColorStop(0, '#ffffff');
  scleraGrad.addColorStop(0.75, '#f8fafc');
  scleraGrad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = scleraGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Expressive large cerulean-blue iris positioned at U=0.5, V=0.5 (front of sphere)
  const cx = 128;
  const cy = 128;
  const irisGrad = ctx.createRadialGradient(cx, cy + 4, 8, cx, cy, 46);
  irisGrad.addColorStop(0, '#38bdf8');
  irisGrad.addColorStop(0.45, '#1d6ce0');
  irisGrad.addColorStop(0.84, '#1e3a8a');
  irisGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fill();

  // Subtle iris radial fibers
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.35)';
  ctx.lineWidth = 2;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 14) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
    ctx.lineTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42);
    ctx.stroke();
  }

  // Deep pupil
  ctx.fillStyle = '#070b14';
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();

  // Crisp double Pixar catchlights
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - 15, cy - 16, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 14, cy + 14, 5.5, 0, Math.PI * 2);
  ctx.fill();

  return finalizeColorTexture(c);
}

function createPinkPurpleHairTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  // Raspberry-pink highlights blending into rich plum-purple roots (matching reference)
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#5a1e60');
  grad.addColorStop(0.32, '#9d3679');
  grad.addColorStop(0.68, '#df5c9c');
  grad.addColorStop(1, '#f47bb4');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Silky longitudinal hair strand highlights along U (tube length)
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * 256;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(253, 214, 234, 0.24)' : 'rgba(59, 7, 100, 0.28)';
    ctx.lineWidth = 1.5 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(128, y + (Math.random() - 0.5) * 18, 256, y + (Math.random() - 0.5) * 12);
    ctx.stroke();
  }

  return finalizeColorTexture(c);
}

function createHairBumpTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * 256;
    ctx.strokeStyle = i % 2 === 0 ? '#b8b8b8' : '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + (Math.random() - 0.5) * 10);
    ctx.stroke();
  }
  return finalizeDataTexture(c);
}

function createPinkJacketTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);

  // Rich quilted bubblegum-pink varsity puffer jacket
  const jacketGrad = ctx.createLinearGradient(0, 0, 0, 512);
  jacketGrad.addColorStop(0, '#f788bc');
  jacketGrad.addColorStop(0.48, '#ee65a3');
  jacketGrad.addColorStop(1, '#d94889');
  ctx.fillStyle = jacketGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Soft quilted puffer seam shadows & highlights
  for (const y of [105, 200, 295, 390]) {
    ctx.strokeStyle = 'rgba(131, 24, 67, 0.3)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 230, 242, 0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y + 5);
    ctx.lineTo(512, y + 5);
    ctx.stroke();
  }

  // Diagonal crisp white pocket welts on front-left & front-right panels
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(118, 285);
  ctx.lineTo(148, 365);
  ctx.moveTo(394, 285);
  ctx.lineTo(364, 365);
  ctx.stroke();

  // Subtle pocket flap shadow
  ctx.strokeStyle = 'rgba(131, 24, 67, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(112, 287);
  ctx.lineTo(142, 367);
  ctx.moveTo(400, 287);
  ctx.lineTo(370, 367);
  ctx.stroke();

  // Silver zipper trim along the open front edges (x near edges of open-front shell)
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, 12, 468);
  ctx.fillRect(500, 0, 12, 468);
  ctx.fillStyle = '#94a3b8';
  for (let y = 8; y < 460; y += 12) {
    ctx.fillRect(2, y, 7, 5);
    ctx.fillRect(503, y, 7, 5);
  }

  // Pink ribbed bomber waistband at bottom
  ctx.fillStyle = '#d44284';
  ctx.fillRect(0, 444, 512, 68);
  ctx.strokeStyle = 'rgba(131, 24, 67, 0.28)';
  ctx.lineWidth = 3;
  for (let x = 8; x < 512; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 446);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  return finalizeColorTexture(c);
}

function createQuiltBumpTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 0, 256, 256);

  // Quilted vertical/horizontal baffle pillowing + fine woven nylon grain
  for (let row = 0; row < 5; row++) {
    const y0 = row * 51;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + 51);
    g.addColorStop(0, '#444444');
    g.addColorStop(0.25, '#c0c0c0');
    g.addColorStop(0.5, '#d4d4d4');
    g.addColorStop(0.85, '#b2b2b2');
    g.addColorStop(1, '#444444');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, 256, 51);
  }
  return finalizeDataTexture(c);
}

function createHoodieBodyTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  // Light off-white / soft heather-grey fleece hoodie
  const baseGrad = ctx.createLinearGradient(0, 0, 0, 512);
  baseGrad.addColorStop(0, '#f3f5f8');
  baseGrad.addColorStop(0.6, '#e7ebf0');
  baseGrad.addColorStop(1, '#dce1e9');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Soft fleece grain
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(148,163,184,0.14)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Kangaroo pocket & topstitching at front center (U = 0.5 -> x = 256)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(192, 310);
  ctx.lineTo(320, 310);
  ctx.lineTo(334, 422);
  ctx.lineTo(178, 422);
  ctx.closePath();
  ctx.stroke();

  // Hoodie metal grommets + hanging off-white drawstrings
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.arc(236, 44, 5.5, 0, Math.PI * 2);
  ctx.arc(276, 44, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 6.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(236, 48);
  ctx.quadraticCurveTo(232, 118, 236, 178);
  ctx.moveTo(276, 48);
  ctx.quadraticCurveTo(280, 118, 276, 178);
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(236, 48);
  ctx.quadraticCurveTo(232, 118, 236, 178);
  ctx.moveTo(276, 48);
  ctx.quadraticCurveTo(280, 118, 276, 178);
  ctx.stroke();

  // Metal aglet tips
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(233, 174, 6, 12);
  ctx.fillRect(273, 174, 6, 12);

  return finalizeColorTexture(c);
}

function createHoodieSleeveTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#eceff4';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(148,163,184,0.14)';
    ctx.fillRect(x, y, 2, 2);
  }
  // Subtle fabric elbow crease shading
  const crease = ctx.createLinearGradient(0, 100, 0, 150);
  crease.addColorStop(0, 'rgba(148,163,184,0)');
  crease.addColorStop(0.5, 'rgba(148,163,184,0.16)');
  crease.addColorStop(1, 'rgba(148,163,184,0)');
  ctx.fillStyle = crease;
  ctx.fillRect(0, 100, 256, 50);

  // Pink ribbed wrist cuff band
  ctx.fillStyle = '#e45897';
  ctx.fillRect(0, 212, 256, 44);
  ctx.strokeStyle = 'rgba(131, 24, 67, 0.35)';
  ctx.lineWidth = 3;
  for (let x = 8; x < 256; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 212);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  return finalizeColorTexture(c);
}

function createFabricBumpTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = i % 2 === 0 ? '#9c9c9c' : '#656565';
    ctx.fillRect(x, y, 2, 1);
  }
  return finalizeDataTexture(c);
}

function createBlueJeansTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  // Soft light-medium sky blue denim with realistic stonewash & back pocket detail
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#547fb9');
  grad.addColorStop(0.45, '#78a3da');
  grad.addColorStop(1, '#4c75ae');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Diagonal denim twill weave
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1.5;
  for (let i = -512; i < 1024; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 512, 512);
    ctx.stroke();
  }

  // Front thigh stonewash highlight (U = 0.5 -> x = 256)
  const wash = ctx.createRadialGradient(256, 210, 18, 256, 210, 165);
  wash.addColorStop(0, 'rgba(219, 234, 254, 0.44)');
  wash.addColorStop(1, 'rgba(90, 132, 189, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 30, 512, 360);

  // Subtle knee whisker folds
  ctx.strokeStyle = 'rgba(219, 234, 254, 0.25)';
  ctx.lineWidth = 3;
  for (const ky of [240, 258, 276]) {
    ctx.beginPath();
    ctx.moveTo(190, ky);
    ctx.quadraticCurveTo(256, ky + 8, 322, ky);
    ctx.stroke();
  }

  // Back pocket seam outline (visible from rear chase camera on pelvis/upper thigh!)
  ctx.strokeStyle = 'rgba(254, 240, 138, 0.48)';
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(22, 18);
  ctx.lineTo(22, 462);
  ctx.moveTo(490, 18);
  ctx.lineTo(490, 462);
  ctx.stroke();
  ctx.setLineDash([]);

  // Rolled light-blue denim cuff above ankle
  ctx.fillStyle = '#97bce9';
  ctx.fillRect(0, 456, 512, 56);
  ctx.fillStyle = 'rgba(30, 58, 138, 0.28)';
  ctx.fillRect(0, 454, 512, 6);

  return finalizeColorTexture(c);
}

function createPelvisJeansTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 256);
  ctx.fillStyle = '#5c87c0';
  ctx.fillRect(0, 0, 512, 256);

  // Back pockets at U near 0 / 1 (back is theta=0 -> u=0 and u=1!)
  ctx.strokeStyle = 'rgba(253, 224, 120, 0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  for (const px of [34, 418]) {
    ctx.beginPath();
    ctx.moveTo(px, 64);
    ctx.lineTo(px + 60, 64);
    ctx.lineTo(px + 54, 168);
    ctx.lineTo(px + 30, 186);
    ctx.lineTo(px + 6, 168);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Waistband seam
  ctx.fillStyle = '#4f76ad';
  ctx.fillRect(0, 0, 512, 36);

  return finalizeColorTexture(c);
}

function createPinkWhiteSneakerTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  // High-top pink canvas sneaker upper
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#f472b6');
  grad.addColorStop(0.7, '#e25494');
  grad.addColorStop(1, '#c93c7c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // White lace tongue & crisscross laces on front
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(92, 16, 72, 146);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let y = 30; y < 145; y += 22) {
    ctx.beginPath();
    ctx.moveTo(96, y);
    ctx.lineTo(160, y + 14);
    ctx.moveTo(160, y);
    ctx.lineTo(96, y + 14);
    ctx.stroke();
  }

  // White canvas stitching along heel & side collar
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(18, 22, 64, 150);
  ctx.strokeRect(174, 22, 64, 150);
  ctx.setLineDash([]);

  // Clean white rubber sole rim
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 192, 256, 64);
  ctx.fillStyle = '#f472b6';
  ctx.fillRect(0, 190, 256, 5);

  return finalizeColorTexture(c);
}

// ============================================================================
// 2. Sculpted Lofted Geometry + Tapered Hair Locks + Dual-Bone Skinning
// ============================================================================

interface RingDef {
  y: number;
  rx: number;
  rz: number;
  cz?: number;
  cx?: number;
  boneA: number;
  boneB: number;
  wA: number;
  wB: number;
  vCoord: number;
}

interface BuiltPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

function buildSkinnedLoft(
  rings: RingDef[],
  radialSegs = 18,
  capBottom = false,
  capTop = false,
  startTheta = 0,
  arcLength = Math.PI * 2,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    const cx = ring.cx ?? 0;
    const cz = ring.cz ?? 0;
    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs;
      const theta = startTheta + u * arcLength;
      // theta = 0 -> +Z (back), theta = PI -> -Z (front, u = 0.5 for full wrap)
      const x = cx - Math.sin(theta) * ring.rx;
      const z = cz + Math.cos(theta) * ring.rz;
      positions.push(x, ring.y, z);
      uvs.push(u, ring.vCoord);
      skinIndices.push(ring.boneA, ring.boneB, 0, 0);
      skinWeights.push(ring.wA, ring.wB, 0, 0);
    }
  }

  const rowLen = radialSegs + 1;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const a = r * rowLen + s;
      const b = a + 1;
      const c = (r + 1) * rowLen + s;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  if (capBottom && arcLength >= Math.PI * 1.99) {
    const r0 = rings[0];
    const centerIdx = positions.length / 3;
    positions.push(r0.cx ?? 0, r0.y, r0.cz ?? 0);
    uvs.push(0.5, r0.vCoord);
    skinIndices.push(r0.boneA, r0.boneB, 0, 0);
    skinWeights.push(r0.wA, r0.wB, 0, 0);
    for (let s = 0; s < radialSegs; s++) {
      indices.push(centerIdx, s, s + 1);
    }
  }

  if (capTop && arcLength >= Math.PI * 1.99) {
    const rTop = rings[rings.length - 1];
    const base = (rings.length - 1) * rowLen;
    const centerIdx = positions.length / 3;
    positions.push(rTop.cx ?? 0, rTop.y, rTop.cz ?? 0);
    uvs.push(0.5, rTop.vCoord);
    skinIndices.push(rTop.boneA, rTop.boneB, 0, 0);
    skinWeights.push(rTop.wA, rTop.wB, 0, 0);
    for (let s = 0; s < radialSegs; s++) {
      indices.push(centerIdx, base + s + 1, base + s);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a soft sculpted, tapering, flattened 3D hair lock along a CatmullRomCurve3
 * so hair reads like lush Pixar sculpted curls instead of rigid spiky cones.
 */
function buildTaperedHairLock(
  pts: Array<[number, number, number]>,
  baseRadius: number,
  flatness = 0.62,
  boneIdx: number,
  tubularSegs = 10,
  radialSegs = 8,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const frames = curve.computeFrenetFrames(tubularSegs, false);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const center = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    // Smooth organic taper: plump root -> rounded mid -> soft pointed tip
    const radiusScale = Math.sin(Math.pow(1 - t, 0.72) * Math.PI * 0.5) * (0.35 + 0.65 * Math.sin(t * Math.PI * 0.85 + 0.2));
    const rA = Math.max(0.004, baseRadius * radiusScale);
    const rB = Math.max(0.003, baseRadius * radiusScale * flatness);

    for (let j = 0; j <= radialSegs; j++) {
      const v = (j / radialSegs) * Math.PI * 2;
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      const px = center.x + (N.x * cosV * rA + B.x * sinV * rB);
      const py = center.y + (N.y * cosV * rA + B.y * sinV * rB);
      const pz = center.z + (N.z * cosV * rA + B.z * sinV * rB);
      positions.push(px, py, pz);
      uvs.push(t, j / radialSegs);
    }
  }

  const rowLen = radialSegs + 1;
  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * rowLen + j;
      const b = (i + 1) * rowLen + j;
      const c = (i + 1) * rowLen + (j + 1);
      const d = i * rowLen + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Cap tip cleanly
  const tipCenter = positions.length / 3;
  const endPt = curve.getPointAt(1);
  positions.push(endPt.x, endPt.y, endPt.z);
  uvs.push(1, 0.5);
  const lastRow = tubularSegs * rowLen;
  for (let j = 0; j < radialSegs; j++) {
    indices.push(lastRow + j, tipCenter, lastRow + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return attachRigidSkin(geo, boneIdx, 0, 0, 0);
}

function attachRigidSkin(
  geo: THREE.BufferGeometry,
  boneIdx: number,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0,
): THREE.BufferGeometry {
  if (offsetX !== 0 || offsetY !== 0 || offsetZ !== 0) {
    geo.translate(offsetX, offsetY, offsetZ);
  }
  const count = geo.attributes.position.count;
  const idx = new Uint16Array(count * 4);
  const w = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    idx[i * 4] = boneIdx;
    w[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
  return geo;
}

function attachTransformedSkin(
  geo: THREE.BufferGeometry,
  boneIdx: number,
  pos: [number, number, number],
  rot: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
  m.compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    q,
    new THREE.Vector3(scale[0], scale[1], scale[2]),
  );
  geo.applyMatrix4(m);
  return attachRigidSkin(geo, boneIdx, 0, 0, 0);
}

function mergeSkinnedParts(parts: BuiltPart[]): { geometry: THREE.BufferGeometry; materials: THREE.Material[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];
  const materials: THREE.Material[] = [];

  const merged = new THREE.BufferGeometry();
  let vertexOffset = 0;
  let indexOffset = 0;

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    const g = part.geometry;
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    const sIdx = g.attributes.skinIndex;
    const sWt = g.attributes.skinWeight;

    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      skinIndices.push(sIdx.getX(i), sIdx.getY(i), sIdx.getZ(i), sIdx.getW(i));
      skinWeights.push(sWt.getX(i), sWt.getY(i), sWt.getZ(i), sWt.getW(i));
    }

    const idxAttr = g.getIndex();
    const triCount = idxAttr ? idxAttr.count : pos.count;
    if (idxAttr) {
      for (let i = 0; i < idxAttr.count; i++) {
        indices.push(idxAttr.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices.push(i + vertexOffset);
      }
    }

    merged.addGroup(indexOffset, triCount, p);
    materials.push(part.material);

    vertexOffset += pos.count;
    indexOffset += triCount;
    g.dispose();
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  merged.setIndex(indices);
  return { geometry: merged, materials };
}

// ============================================================================
// 3. Build Rigged Pixar-Style Cartoon Boy Mesh + Properly Bound 17-Bone Skeleton
// ============================================================================

function createCartoonBoyRigAndMesh(maxAnisotropy: number): {
  exportRoot: THREE.Group;
  disposables: { dispose: () => void };
} {
  // Grounded flush at Y = 0, ~1.88m hero cartoon proportions matching reference image
  const Hips = new THREE.Bone();
  Hips.name = 'Hips';
  Hips.position.set(0, 0.88, 0);

  const Spine = new THREE.Bone();
  Spine.name = 'Spine';
  Spine.position.set(0, 0.13, 0); // World Y = 1.01
  Hips.add(Spine);

  const Chest = new THREE.Bone();
  Chest.name = 'Chest';
  Chest.position.set(0, 0.21, 0); // World Y = 1.22
  Spine.add(Chest);

  const Neck = new THREE.Bone();
  Neck.name = 'Neck';
  Neck.position.set(0, 0.19, 0); // World Y = 1.41
  Chest.add(Neck);

  const Head = new THREE.Bone();
  Head.name = 'Head';
  Head.position.set(0, 0.08, 0); // World Y = 1.49
  Neck.add(Head);

  // Arms (full-width shoulder spacing: +/- 0.225m, World Y = 1.37)
  const LeftUpperArm = new THREE.Bone();
  LeftUpperArm.name = 'LeftUpperArm';
  LeftUpperArm.position.set(-0.225, 0.15, 0);
  Chest.add(LeftUpperArm);

  const LeftForearm = new THREE.Bone();
  LeftForearm.name = 'LeftForearm';
  LeftForearm.position.set(0, -0.25, 0); // World Y = 1.12
  LeftUpperArm.add(LeftForearm);

  const LeftHand = new THREE.Bone();
  LeftHand.name = 'LeftHand';
  LeftHand.position.set(0, -0.23, 0); // World Y = 0.89
  LeftForearm.add(LeftHand);

  const RightUpperArm = new THREE.Bone();
  RightUpperArm.name = 'RightUpperArm';
  RightUpperArm.position.set(0.225, 0.15, 0);
  Chest.add(RightUpperArm);

  const RightForearm = new THREE.Bone();
  RightForearm.name = 'RightForearm';
  RightForearm.position.set(0, -0.25, 0);
  RightUpperArm.add(RightForearm);

  const RightHand = new THREE.Bone();
  RightHand.name = 'RightHand';
  RightHand.position.set(0, -0.23, 0);
  RightForearm.add(RightHand);

  // Legs (hip pivot World Y = 0.85, knee = 0.48, ankle = 0.12)
  const LeftThigh = new THREE.Bone();
  LeftThigh.name = 'LeftThigh';
  LeftThigh.position.set(-0.105, -0.03, 0);
  Hips.add(LeftThigh);

  const LeftShin = new THREE.Bone();
  LeftShin.name = 'LeftShin';
  LeftShin.position.set(0, -0.37, 0);
  LeftThigh.add(LeftShin);

  const LeftFoot = new THREE.Bone();
  LeftFoot.name = 'LeftFoot';
  LeftFoot.position.set(0, -0.36, 0);
  LeftShin.add(LeftFoot);

  const RightThigh = new THREE.Bone();
  RightThigh.name = 'RightThigh';
  RightThigh.position.set(0.105, -0.03, 0);
  Hips.add(RightThigh);

  const RightShin = new THREE.Bone();
  RightShin.name = 'RightShin';
  RightShin.position.set(0, -0.37, 0);
  RightThigh.add(RightShin);

  const RightFoot = new THREE.Bone();
  RightFoot.name = 'RightFoot';
  RightFoot.position.set(0, -0.36, 0);
  RightShin.add(RightFoot);

  const boneList = [
    Hips,
    Spine,
    Chest,
    Neck,
    Head,
    LeftUpperArm,
    LeftForearm,
    LeftHand,
    RightUpperArm,
    RightForearm,
    RightHand,
    LeftThigh,
    LeftShin,
    LeftFoot,
    RightThigh,
    RightShin,
    RightFoot,
  ];
  const B = {
    Hips: 0,
    Spine: 1,
    Chest: 2,
    Neck: 3,
    Head: 4,
    LeftUpperArm: 5,
    LeftForearm: 6,
    LeftHand: 7,
    RightUpperArm: 8,
    RightForearm: 9,
    RightHand: 10,
    LeftThigh: 11,
    LeftShin: 12,
    LeftFoot: 13,
    RightThigh: 14,
    RightShin: 15,
    RightFoot: 16,
  };

  // Textures & calibrated PBR materials with real surface bump maps
  const faceTex = createCartoonFaceTexture();
  const eyeTex = createEyeTexture();
  const hairTex = createPinkPurpleHairTexture();
  const hairBump = createHairBumpTexture();
  const jacketTex = createPinkJacketTexture();
  const quiltBump = createQuiltBumpTexture();
  const hoodieBodyTex = createHoodieBodyTexture();
  const hoodieSleeveTex = createHoodieSleeveTexture();
  const fabricBump = createFabricBumpTexture();
  const jeansTex = createBlueJeansTexture();
  const pelvisJeansTex = createPelvisJeansTexture();
  const sneakerTex = createPinkWhiteSneakerTexture();

  for (const t of [faceTex, eyeTex, hairTex, jacketTex, hoodieBodyTex, hoodieSleeveTex, jeansTex, pelvisJeansTex, sneakerTex]) {
    t.anisotropy = maxAnisotropy;
  }

  const matSkin = new THREE.MeshPhysicalMaterial({
    color: 0xf9d3bc,
    roughness: 0.48,
    metalness: 0.01,
    sheen: 0.35,
    sheenColor: new THREE.Color(0xffb4a2),
    sheenRoughness: 0.7,
  });
  const matFace = new THREE.MeshPhysicalMaterial({
    map: faceTex,
    roughness: 0.46,
    metalness: 0.01,
    sheen: 0.35,
    sheenColor: new THREE.Color(0xffb4a2),
    sheenRoughness: 0.7,
  });
  const matEye = new THREE.MeshPhysicalMaterial({
    map: eyeTex,
    roughness: 0.06,
    metalness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });
  const matBrow = new THREE.MeshStandardMaterial({ color: 0x3f2321, roughness: 0.65, metalness: 0.02 });
  const matHair = new THREE.MeshStandardMaterial({
    map: hairTex,
    bumpMap: hairBump,
    bumpScale: 0.008,
    roughness: 0.44,
    metalness: 0.08,
  });
  const matJacket = new THREE.MeshStandardMaterial({
    map: jacketTex,
    bumpMap: quiltBump,
    bumpScale: 0.012,
    roughness: 0.46,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const matPinkRib = new THREE.MeshStandardMaterial({
    color: 0xde4c8e,
    bumpMap: fabricBump,
    bumpScale: 0.006,
    roughness: 0.72,
    metalness: 0.02,
  });
  const matHoodieBody = new THREE.MeshStandardMaterial({
    map: hoodieBodyTex,
    bumpMap: fabricBump,
    bumpScale: 0.006,
    roughness: 0.82,
    metalness: 0.01,
  });
  const matHoodieSleeve = new THREE.MeshStandardMaterial({
    map: hoodieSleeveTex,
    bumpMap: fabricBump,
    bumpScale: 0.006,
    roughness: 0.82,
    metalness: 0.01,
  });
  const matHoodTrim = new THREE.MeshStandardMaterial({
    color: 0xe9edf2,
    bumpMap: fabricBump,
    bumpScale: 0.005,
    roughness: 0.84,
    metalness: 0.01,
  });
  const matJeans = new THREE.MeshStandardMaterial({
    map: jeansTex,
    bumpMap: fabricBump,
    bumpScale: 0.009,
    roughness: 0.78,
    metalness: 0.03,
  });
  const matPelvisJeans = new THREE.MeshStandardMaterial({
    map: pelvisJeansTex,
    bumpMap: fabricBump,
    bumpScale: 0.009,
    roughness: 0.78,
    metalness: 0.03,
  });
  const matDenimCuff = new THREE.MeshStandardMaterial({
    color: 0x97bce9,
    bumpMap: fabricBump,
    bumpScale: 0.008,
    roughness: 0.76,
    metalness: 0.02,
  });
  const matSneaker = new THREE.MeshStandardMaterial({
    map: sneakerTex,
    bumpMap: fabricBump,
    bumpScale: 0.005,
    roughness: 0.46,
    metalness: 0.05,
  });
  const matWhiteSole = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.34, metalness: 0.04 });

  const parts: BuiltPart[] = [];

  // --------------------------------------------------------------------------
  // A. Inner Light-Grey Hoodie Torso (y = 0.85 to 1.41)
  // --------------------------------------------------------------------------
  parts.push({
    geometry: buildSkinnedLoft(
      [
        { y: 0.85, rx: 0.165, rz: 0.118, boneA: B.Hips, boneB: B.Spine, wA: 0.72, wB: 0.28, vCoord: 0.04 },
        { y: 0.99, rx: 0.168, rz: 0.122, boneA: B.Spine, boneB: B.Hips, wA: 0.8, wB: 0.2, vCoord: 0.28 },
        { y: 1.14, rx: 0.182, rz: 0.130, boneA: B.Spine, boneB: B.Chest, wA: 0.42, wB: 0.58, vCoord: 0.54 },
        { y: 1.29, rx: 0.192, rz: 0.134, cz: -0.006, boneA: B.Chest, boneB: B.Spine, wA: 0.88, wB: 0.12, vCoord: 0.80 },
        { y: 1.39, rx: 0.168, rz: 0.114, boneA: B.Chest, boneB: B.Neck, wA: 0.88, wB: 0.12, vCoord: 0.95 },
        { y: 1.43, rx: 0.072, rz: 0.068, boneA: B.Neck, boneB: B.Chest, wA: 0.65, wB: 0.35, vCoord: 0.99 },
      ],
      20,
      true,
      true,
    ),
    material: matHoodieBody,
  });

  // --------------------------------------------------------------------------
  // B. Outer Pink Quilted Sleeveless Jacket (real 3D wrap around sides & back, open front!)
  //    theta wraps from -PI*0.78 around the back (0) to +PI*0.78, leaving front open!
  // --------------------------------------------------------------------------
  parts.push({
    geometry: buildSkinnedLoft(
      [
        { y: 0.89, rx: 0.184, rz: 0.134, boneA: B.Hips, boneB: B.Spine, wA: 0.65, wB: 0.35, vCoord: 0.06 },
        { y: 0.96, rx: 0.196, rz: 0.144, boneA: B.Spine, boneB: B.Hips, wA: 0.78, wB: 0.22, vCoord: 0.20 },
        { y: 1.07, rx: 0.206, rz: 0.150, boneA: B.Spine, boneB: B.Chest, wA: 0.52, wB: 0.48, vCoord: 0.40 },
        { y: 1.19, rx: 0.214, rz: 0.154, boneA: B.Chest, boneB: B.Spine, wA: 0.85, wB: 0.15, vCoord: 0.62 },
        { y: 1.31, rx: 0.212, rz: 0.150, cz: -0.004, boneA: B.Chest, boneB: B.Spine, wA: 0.92, wB: 0.08, vCoord: 0.84 },
        { y: 1.40, rx: 0.184, rz: 0.128, boneA: B.Chest, boneB: B.Neck, wA: 0.92, wB: 0.08, vCoord: 0.98 },
      ],
      18,
      false,
      false,
      -Math.PI * 0.79,
      Math.PI * 1.58,
    ),
    material: matJacket,
  });

  // Pink ribbed bomber waistband around lower jacket + raised pink vest collar
  parts.push({
    geometry: attachTransformedSkin(
      new THREE.TorusGeometry(0.158, 0.026, 10, 22, Math.PI * 1.62),
      B.Hips,
      [0, 0.90, 0.01],
      [Math.PI / 2, 0, Math.PI * 0.19],
      [1.18, 0.94, 1.0],
    ),
    material: matPinkRib,
  });

  parts.push({
    geometry: attachTransformedSkin(
      new THREE.TorusGeometry(0.128, 0.026, 10, 18, Math.PI * 1.45),
      B.Chest,
      [0, 1.39, 0.015],
      [Math.PI / 2 - 0.14, 0, Math.PI * 0.275],
      [1.22, 1.02, 1.0],
    ),
    material: matPinkRib,
  });

  // Soft sculpted 3D light-grey Hoodie Hood draped behind neck & shoulders (hero rear silhouette!)
  parts.push({
    geometry: attachTransformedSkin(
      new THREE.TorusGeometry(0.122, 0.038, 12, 22),
      B.Chest,
      [0, 1.405, 0.026],
      [Math.PI / 2 - 0.28, 0, 0],
      [1.26, 1.12, 0.95],
    ),
    material: matHoodTrim,
  });
  parts.push({
    geometry: attachTransformedSkin(
      new THREE.SphereGeometry(0.152, 16, 12),
      B.Chest,
      [0, 1.355, 0.122],
      [-0.36, 0, 0],
      [1.24, 0.72, 0.85],
    ),
    material: matHoodTrim,
  });

  // --------------------------------------------------------------------------
  // C. Neck, Pixar-Proportioned Head, 3D Glossy Eyes, Nose, Ears & Brows (y = 1.41 to 1.88)
  // --------------------------------------------------------------------------
  parts.push({
    geometry: buildSkinnedLoft(
      [
        { y: 1.39, rx: 0.062, rz: 0.060, boneA: B.Neck, boneB: B.Chest, wA: 0.72, wB: 0.28, vCoord: 0.05 },
        { y: 1.49, rx: 0.058, rz: 0.056, boneA: B.Neck, boneB: B.Head, wA: 0.42, wB: 0.58, vCoord: 0.14 },
      ],
      14,
      false,
      false,
    ),
    material: matSkin,
  });

  parts.push({
    geometry: buildSkinnedLoft(
      [
        { y: 1.47, rx: 0.095, rz: 0.102, cz: -0.012, boneA: B.Head, boneB: B.Neck, wA: 0.85, wB: 0.15, vCoord: 0.18 },
        { y: 1.54, rx: 0.162, rz: 0.172, cz: -0.016, boneA: B.Head, boneB: B.Neck, wA: 1, wB: 0, vCoord: 0.35 },
        { y: 1.64, rx: 0.188, rz: 0.194, cz: -0.010, boneA: B.Head, boneB: B.Neck, wA: 1, wB: 0, vCoord: 0.55 },
        { y: 1.74, rx: 0.182, rz: 0.188, cz: -0.004, boneA: B.Head, boneB: B.Neck, wA: 1, wB: 0, vCoord: 0.74 },
        { y: 1.82, rx: 0.138, rz: 0.144, cz: 0.002, boneA: B.Head, boneB: B.Neck, wA: 1, wB: 0, vCoord: 0.89 },
        { y: 1.86, rx: 0.062, rz: 0.066, cz: 0.004, boneA: B.Head, boneB: B.Neck, wA: 1, wB: 0, vCoord: 0.97 },
      ],
      24,
      true,
      true,
    ),
    material: matFace,
  });

  // 3D Glossy Pixar Eyes + Arched Eyebrows + Cute Nose + Rounded Ears
  for (const sx of [-1, 1] as const) {
    // 3D eyeball oriented so UV center (theta = -PI/2 -> +X; rotateY(-PI/2) faces -Z)
    const eyeGeo = new THREE.SphereGeometry(0.036, 16, 14);
    eyeGeo.rotateY(Math.PI / 2);
    parts.push({
      geometry: attachTransformedSkin(
        eyeGeo,
        B.Head,
        [sx * 0.068, 1.648, -0.174],
        [0, sx * -0.16, 0],
        [1.0, 1.04, 0.72],
      ),
      material: matEye,
    });

    // Dark upper lash arc
    parts.push({
      geometry: attachTransformedSkin(
        new THREE.TorusGeometry(0.036, 0.0055, 6, 12, Math.PI * 0.92),
        B.Head,
        [sx * 0.068, 1.652, -0.182],
        [0.12, sx * -0.16, 0.12],
        [1.0, 1.05, 1.0],
      ),
      material: matBrow,
    });

    // Arched expressive dark brown eyebrow
    parts.push({
      geometry: attachTransformedSkin(
        new THREE.CapsuleGeometry(0.007, 0.044, 4, 8),
        B.Head,
        [sx * 0.068, 1.706, -0.186],
        [0.08, sx * -0.18, Math.PI / 2 + sx * -0.14],
        [1.0, 1.0, 0.75],
      ),
      material: matBrow,
    });

    // Ears
    parts.push({
      geometry: attachTransformedSkin(
        new THREE.SphereGeometry(0.042, 12, 10),
        B.Head,
        [sx * 0.188, 1.622, 0.008],
        [0, sx * -0.25, sx * 0.15],
        [0.58, 1.1, 0.85],
      ),
      material: matSkin,
    });
  }

  // Cute sculpted nose
  parts.push({
    geometry: attachTransformedSkin(
      new THREE.SphereGeometry(0.022, 12, 10),
      B.Head,
      [0, 1.608, -0.198],
      [-0.15, 0, 0],
      [1.05, 0.85, 1.05],
    ),
    material: matSkin,
  });

  // --------------------------------------------------------------------------
  // D. Lush Sculpted Swept Pink & Purple Hair (Curved Locks, Zero Spiky Cones!)
  // --------------------------------------------------------------------------
  // Full rounded under-cap covering top & back of skull
  parts.push({
    geometry: attachTransformedSkin(
      new THREE.SphereGeometry(0.198, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.64),
      B.Head,
      [0, 1.675, 0.016],
      [0.24, 0, 0],
      [1.05, 0.98, 1.08],
    ),
    material: matHair,
  });

  // Sculpted tapered hair locks (swept bangs, tousled crown waves, side locks & layered back locks)
  const hairLockSpecs: Array<{ pts: Array<[number, number, number]>; r: number; flat?: number }> = [
    // Swept forehead bangs curving smoothly to the right (+X) as in reference image
    { pts: [[-0.08, 1.84, -0.06], [-0.04, 1.80, -0.16], [0.03, 1.74, -0.20], [0.09, 1.69, -0.17]], r: 0.046, flat: 0.52 },
    { pts: [[-0.01, 1.86, -0.05], [0.04, 1.81, -0.16], [0.11, 1.75, -0.18], [0.15, 1.70, -0.13]], r: 0.044, flat: 0.55 },
    { pts: [[-0.13, 1.81, -0.05], [-0.14, 1.75, -0.14], [-0.09, 1.70, -0.18]], r: 0.040, flat: 0.55 },
    // Messy layered top waves (thick organic volume, swept upward & slightly back)
    { pts: [[-0.05, 1.80, 0.02], [-0.07, 1.89, -0.02], [-0.02, 1.92, -0.08], [0.06, 1.88, -0.12]], r: 0.054, flat: 0.58 },
    { pts: [[0.03, 1.81, 0.03], [0.06, 1.90, -0.01], [0.12, 1.90, -0.05], [0.17, 1.84, -0.06]], r: 0.052, flat: 0.58 },
    { pts: [[0.0, 1.80, 0.06], [-0.03, 1.89, 0.06], [-0.10, 1.89, 0.02], [-0.16, 1.84, -0.02]], r: 0.050, flat: 0.60 },
    { pts: [[0.01, 1.82, -0.01], [0.02, 1.93, 0.01], [0.08, 1.93, 0.05]], r: 0.045, flat: 0.56 },
    // Side temple curls above ears
    { pts: [[-0.14, 1.76, -0.03], [-0.20, 1.71, -0.04], [-0.21, 1.65, -0.01]], r: 0.042, flat: 0.56 },
    { pts: [[0.14, 1.76, -0.03], [0.20, 1.71, -0.04], [0.21, 1.65, -0.01]], r: 0.042, flat: 0.56 },
    { pts: [[-0.15, 1.72, 0.05], [-0.21, 1.66, 0.05], [-0.19, 1.59, 0.06]], r: 0.038, flat: 0.58 },
    { pts: [[0.15, 1.72, 0.05], [0.21, 1.66, 0.05], [0.19, 1.59, 0.06]], r: 0.038, flat: 0.58 },
    // Rich sculpted back-of-head & nape layers (hero view for endless runner chase camera!)
    { pts: [[-0.08, 1.80, 0.10], [-0.11, 1.73, 0.19], [-0.09, 1.63, 0.21], [-0.05, 1.54, 0.17]], r: 0.054, flat: 0.60 },
    { pts: [[0.0, 1.81, 0.11], [0.0, 1.74, 0.20], [0.01, 1.63, 0.22], [0.0, 1.53, 0.17]], r: 0.056, flat: 0.60 },
    { pts: [[0.08, 1.80, 0.10], [0.11, 1.73, 0.19], [0.09, 1.63, 0.21], [0.05, 1.54, 0.17]], r: 0.054, flat: 0.60 },
    { pts: [[-0.14, 1.72, 0.09], [-0.17, 1.64, 0.16], [-0.14, 1.55, 0.15]], r: 0.046, flat: 0.58 },
    { pts: [[0.14, 1.72, 0.09], [0.17, 1.64, 0.16], [0.14, 1.55, 0.15]], r: 0.046, flat: 0.58 },
    { pts: [[-0.05, 1.64, 0.16], [-0.05, 1.55, 0.17], [-0.02, 1.48, 0.13]], r: 0.042, flat: 0.55 },
    { pts: [[0.05, 1.64, 0.16], [0.05, 1.55, 0.17], [0.02, 1.48, 0.13]], r: 0.042, flat: 0.55 },
  ];

  for (const lock of hairLockSpecs) {
    parts.push({
      geometry: buildTaperedHairLock(lock.pts, lock.r, lock.flat ?? 0.6, B.Head, 8, 8),
      material: matHair,
    });
  }

  // --------------------------------------------------------------------------
  // E. Pelvis Denim Block (y = 0.78 to 0.89)
  // --------------------------------------------------------------------------
  parts.push({
    geometry: buildSkinnedLoft(
      [
        { y: 0.78, rx: 0.165, rz: 0.115, boneA: B.Hips, boneB: B.Spine, wA: 0.95, wB: 0.05, vCoord: 0.15 },
        { y: 0.89, rx: 0.176, rz: 0.122, boneA: B.Hips, boneB: B.Spine, wA: 0.85, wB: 0.15, vCoord: 0.9 },
      ],
      18,
      true,
      true,
    ),
    material: matPelvisJeans,
  });

  // --------------------------------------------------------------------------
  // F. Full Cozy Hoodie Sleeves + Sculpted Cartoon Hands
  // --------------------------------------------------------------------------
  for (const side of [-1, 1] as const) {
    const sx = side * 0.225;
    const upperB = side < 0 ? B.LeftUpperArm : B.RightUpperArm;
    const foreB = side < 0 ? B.LeftForearm : B.RightForearm;
    const handB = side < 0 ? B.LeftHand : B.RightHand;

    parts.push({
      geometry: buildSkinnedLoft(
        [
          { y: 0.89, cx: sx, rx: 0.056, rz: 0.056, boneA: foreB, boneB: handB, wA: 0.86, wB: 0.14, vCoord: 0.04 },
          { y: 0.95, cx: sx, rx: 0.062, rz: 0.062, boneA: foreB, boneB: upperB, wA: 0.94, wB: 0.06, vCoord: 0.20 },
          { y: 1.07, cx: sx, rx: 0.066, rz: 0.066, boneA: foreB, boneB: upperB, wA: 0.85, wB: 0.15, vCoord: 0.42 },
          { y: 1.13, cx: sx, rx: 0.064, rz: 0.064, boneA: upperB, boneB: foreB, wA: 0.5, wB: 0.5, vCoord: 0.54 },
          { y: 1.26, cx: sx, rx: 0.068, rz: 0.068, boneA: upperB, boneB: B.Chest, wA: 0.92, wB: 0.08, vCoord: 0.78 },
          { y: 1.37, cx: sx * 0.88, rx: 0.072, rz: 0.072, boneA: B.Chest, boneB: upperB, wA: 0.58, wB: 0.42, vCoord: 0.96 },
        ],
        14,
        true,
        true,
      ),
      material: matHoodieSleeve,
    });

    // Separate 3D pink ribbed wrist cuff ring for authentic layered look
    parts.push({
      geometry: attachTransformedSkin(
        new THREE.CylinderGeometry(0.059, 0.055, 0.055, 14),
        foreB,
        [sx, 0.905, 0],
        [0, 0, 0],
      ),
      material: matPinkRib,
    });

    // Sculpted 3D Hand (palm + curled finger mitt + thumb)
    parts.push({
      geometry: attachTransformedSkin(
        new THREE.SphereGeometry(0.052, 12, 10),
        handB,
        [sx, 0.84, -0.005],
        [0, 0, 0],
        [0.72, 1.15, 0.92],
      ),
      material: matSkin,
    });
    parts.push({
      geometry: attachTransformedSkin(
        new THREE.CapsuleGeometry(0.017, 0.042, 4, 8),
        handB,
        [sx - side * 0.025, 0.845, -0.032],
        [0.5, 0, side * 0.35],
      ),
      material: matSkin,
    });
  }

  // --------------------------------------------------------------------------
  // G. Full-Cut Blue Jeans + Rolled Ankle Cuffs + Sculpted Pink & White High-Top Sneakers
  // --------------------------------------------------------------------------
  for (const side of [-1, 1] as const) {
    const lx = side * 0.105;
    const thighB = side < 0 ? B.LeftThigh : B.RightThigh;
    const shinB = side < 0 ? B.LeftShin : B.RightShin;
    const footB = side < 0 ? B.LeftFoot : B.RightFoot;

    parts.push({
      geometry: buildSkinnedLoft(
        [
          { y: 0.145, cx: lx, rx: 0.074, rz: 0.076, boneA: shinB, boneB: footB, wA: 0.86, wB: 0.14, vCoord: 0.04 },
          { y: 0.31, cx: lx, rx: 0.076, rz: 0.079, boneA: shinB, boneB: thighB, wA: 0.96, wB: 0.04, vCoord: 0.30 },
          { y: 0.48, cx: lx, rx: 0.078, rz: 0.080, boneA: thighB, boneB: shinB, wA: 0.5, wB: 0.5, vCoord: 0.54 },
          { y: 0.67, cx: lx, rx: 0.090, rz: 0.094, boneA: thighB, boneB: shinB, wA: 0.95, wB: 0.05, vCoord: 0.78 },
          { y: 0.85, cx: lx, rx: 0.098, rz: 0.102, boneA: thighB, boneB: B.Hips, wA: 0.72, wB: 0.28, vCoord: 0.96 },
        ],
        16,
        true,
        true,
      ),
      material: matJeans,
    });

    // 3D Rolled light-blue denim ankle cuff
    parts.push({
      geometry: attachTransformedSkin(
        new THREE.TorusGeometry(0.068, 0.020, 8, 16),
        shinB,
        [lx, 0.155, 0],
        [Math.PI / 2, 0, 0],
        [1.06, 1.08, 1.15],
      ),
      material: matDenimCuff,
    });

    // High-top pink sneaker ankle collar + main upper
    parts.push({
      geometry: attachTransformedSkin(
        new THREE.CylinderGeometry(0.068, 0.072, 0.095, 14),
        footB,
        [lx, 0.102, 0.004],
        [0, 0, 0],
      ),
      material: matSneaker,
    });

    parts.push({
      geometry: attachTransformedSkin(
        new THREE.CapsuleGeometry(0.064, 0.12, 6, 12),
        footB,
        [lx, 0.060, -0.048],
        [Math.PI / 2, 0, 0],
        [1.05, 1.0, 0.85],
      ),
      material: matSneaker,
    });

    // Crisp white rubber sole + rounded toe cap grounded flush at y = 0
    parts.push({
      geometry: attachTransformedSkin(
        new THREE.CapsuleGeometry(0.068, 0.145, 6, 12),
        footB,
        [lx, 0.024, -0.055],
        [Math.PI / 2, 0, 0],
        [1.08, 1.04, 0.36],
      ),
      material: matWhiteSole,
    });

    parts.push({
      geometry: attachTransformedSkin(
        new THREE.SphereGeometry(0.063, 14, 10),
        footB,
        [lx, 0.042, -0.145],
        [0, 0, 0],
        [1.02, 0.65, 1.02],
      ),
      material: matWhiteSole,
    });
  }

  const { geometry, materials } = mergeSkinnedParts(parts);
  const skinnedMesh = new THREE.SkinnedMesh(geometry, materials);
  skinnedMesh.name = 'CartoonBoyMesh';
  skinnedMesh.castShadow = true;
  skinnedMesh.receiveShadow = true;
  skinnedMesh.frustumCulled = false;

  const exportRoot = new THREE.Group();
  exportRoot.name = 'CartoonBoyCharacter';
  exportRoot.add(Hips);
  exportRoot.add(skinnedMesh);

  // CRITICAL: Compute world matrices for the full bone hierarchy BEFORE binding!
  // Without this, boneInverses default to Identity and deform every limb wildly.
  exportRoot.updateMatrixWorld(true);

  const skeleton = new THREE.Skeleton(boneList);
  skinnedMesh.bind(skeleton, skinnedMesh.matrixWorld);

  return {
    exportRoot,
    disposables: {
      dispose: () => {
        geometry.dispose();
        materials.forEach((m) => m.dispose());
        faceTex.dispose();
        eyeTex.dispose();
        hairTex.dispose();
        hairBump.dispose();
        jacketTex.dispose();
        quiltBump.dispose();
        hoodieBodyTex.dispose();
        hoodieSleeveTex.dispose();
        fabricBump.dispose();
        jeansTex.dispose();
        pelvisJeansTex.dispose();
        sneakerTex.dispose();
      },
    },
  };
}

// ============================================================================
// 4. Anatomically Correct, Smooth Pixar-Style Skeletal AnimationClips
//    Coordinate conventions (character faces -Z):
//    - Thigh: +rx swings leg FORWARD (-Z), -rx swings BACKWARD (+Z)
//    - Shin:  -rx bends knee BACKWARD (+Z) naturally (NEVER +rx!)
//    - Foot:  +rx lifts toes UP, -rx points toes DOWN
//    - UpperArm: +rx swings FORWARD (-Z), -rx swings BACKWARD (+Z)
//                LeftUpperArm  rz < 0 abducts OUTWARD (-X)
//                RightUpperArm rz > 0 abducts OUTWARD (+X)
//    - Forearm: +rx bends elbow FORWARD (-Z) naturally (NEVER -rx!)
//    - Spine/Chest: -rx leans torso FORWARD (-Z), +rx leans BACKWARD (+Z)
//    - Head: +rx tilts head UP to look straight ahead when torso leans forward
// ============================================================================

const _eul = new THREE.Euler();
const _quat = new THREE.Quaternion();

function makeQuatTrack(
  boneName: string,
  times: number[],
  eulersDeg: Array<[number, number, number]>,
): THREE.QuaternionKeyframeTrack {
  const values: number[] = [];
  const d2r = Math.PI / 180;
  for (const [rx, ry, rz] of eulersDeg) {
    _eul.set(rx * d2r, ry * d2r, rz * d2r, 'XYZ');
    _quat.setFromEuler(_eul);
    values.push(_quat.x, _quat.y, _quat.z, _quat.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
}

function buildAnimationClips(): THREE.AnimationClip[] {
  // 0. IDLE (2.4s confident friendly Main Menu stance matching reference image)
  const it = [0, 0.6, 1.2, 1.8, 2.4];
  const idleClip = new THREE.AnimationClip('idle', 2.4, [
    new THREE.VectorKeyframeTrack('Hips.position', it, [
      0, 0.88, 0,
      0, 0.872, 0,
      0, 0.88, 0,
      0, 0.872, 0,
      0, 0.88, 0,
    ]),
    makeQuatTrack('Hips', it, [[0, 2, -1], [0, 0, 1], [0, -2, 1], [0, 0, -1], [0, 2, -1]]),
    makeQuatTrack('Spine', it, [[-2, 0, 0], [-4, 0, 0], [-2, 0, 0], [-4, 0, 0], [-2, 0, 0]]),
    makeQuatTrack('Chest', it, [[1, -2, 0], [3, 0, 0], [1, 2, 0], [3, 0, 0], [1, -2, 0]]),
    makeQuatTrack('Head', it, [[1, 3, -1.5], [0, 0, 0], [1, -3, 1.5], [0, 0, 0], [1, 3, -1.5]]),
    makeQuatTrack('LeftThigh', it, [[3, 0, -3], [4, 0, -3], [3, 0, -3], [4, 0, -3], [3, 0, -3]]),
    makeQuatTrack('LeftShin', it, [[-6, 0, 0], [-8, 0, 0], [-6, 0, 0], [-8, 0, 0], [-6, 0, 0]]),
    makeQuatTrack('LeftFoot', it, [[3, 0, 0], [4, 0, 0], [3, 0, 0], [4, 0, 0], [3, 0, 0]]),
    makeQuatTrack('RightThigh', it, [[3, 0, 3], [4, 0, 3], [3, 0, 3], [4, 0, 3], [3, 0, 3]]),
    makeQuatTrack('RightShin', it, [[-6, 0, 0], [-8, 0, 0], [-6, 0, 0], [-8, 0, 0], [-6, 0, 0]]),
    makeQuatTrack('RightFoot', it, [[3, 0, 0], [4, 0, 0], [3, 0, 0], [4, 0, 0], [3, 0, 0]]),
    makeQuatTrack('LeftUpperArm', it, [[3, 0, -10], [5, 0, -12], [3, 0, -10], [1, 0, -9], [3, 0, -10]]),
    makeQuatTrack('LeftForearm', it, [[14, 0, 0], [18, 0, 0], [14, 0, 0], [12, 0, 0], [14, 0, 0]]),
    makeQuatTrack('RightUpperArm', it, [[3, 0, 10], [1, 0, 9], [3, 0, 10], [5, 0, 12], [3, 0, 10]]),
    makeQuatTrack('RightForearm', it, [[14, 0, 0], [12, 0, 0], [14, 0, 0], [18, 0, 0], [14, 0, 0]]),
  ]);

  // 1. WALK (0.96s upbeat natural stroll)
  const wt = [0, 0.24, 0.48, 0.72, 0.96];
  const walkClip = new THREE.AnimationClip('walk', 0.96, [
    new THREE.VectorKeyframeTrack('Hips.position', wt, [
      0, 0.88, 0,
      0, 0.855, 0,
      0, 0.88, 0,
      0, 0.855, 0,
      0, 0.88, 0,
    ]),
    makeQuatTrack('Hips', wt, [[0, 4, 0], [0, 0, -2], [0, -4, 0], [0, 0, 2], [0, 4, 0]]),
    makeQuatTrack('Spine', wt, [[-4, -2, 0], [-2, 0, 0], [-4, 2, 0], [-2, 0, 0], [-4, -2, 0]]),
    makeQuatTrack('Head', wt, [[3, 2, 0], [1, 0, 0], [3, -2, 0], [1, 0, 0], [3, 2, 0]]),
    makeQuatTrack('LeftThigh', wt, [[24, 0, 0], [0, 0, 0], [-22, 0, 0], [12, 0, 0], [24, 0, 0]]),
    makeQuatTrack('LeftShin', wt, [[-10, 0, 0], [-14, 0, 0], [-22, 0, 0], [-44, 0, 0], [-10, 0, 0]]),
    makeQuatTrack('RightThigh', wt, [[-22, 0, 0], [12, 0, 0], [24, 0, 0], [0, 0, 0], [-22, 0, 0]]),
    makeQuatTrack('RightShin', wt, [[-22, 0, 0], [-44, 0, 0], [-10, 0, 0], [-14, 0, 0], [-22, 0, 0]]),
    makeQuatTrack('LeftUpperArm', wt, [[-20, 0, -10], [0, 0, -10], [22, 0, -10], [0, 0, -10], [-20, 0, -10]]),
    makeQuatTrack('LeftForearm', wt, [[16, 0, 0], [22, 0, 0], [32, 0, 0], [20, 0, 0], [16, 0, 0]]),
    makeQuatTrack('RightUpperArm', wt, [[22, 0, 10], [0, 0, 10], [-20, 0, 10], [0, 0, 10], [22, 0, 10]]),
    makeQuatTrack('RightForearm', wt, [[32, 0, 0], [20, 0, 0], [16, 0, 0], [22, 0, 0], [32, 0, 0]]),
  ]);

  // 2. RUN (0.56s athletic Subway-Surfers sprint cycle)
  const rt = [0, 0.14, 0.28, 0.42, 0.56];
  const runClip = new THREE.AnimationClip('run', 0.56, [
    new THREE.VectorKeyframeTrack('Hips.position', rt, [
      0, 0.85, 0,
      0, 0.91, 0,
      0, 0.85, 0,
      0, 0.91, 0,
      0, 0.85, 0,
    ]),
    makeQuatTrack('Hips', rt, [[-4, 6, 0], [-2, 0, -2.5], [-4, -6, 0], [-2, 0, 2.5], [-4, 6, 0]]),
    makeQuatTrack('Spine', rt, [[-12, -5, 0], [-9, 0, 0], [-12, 5, 0], [-9, 0, 0], [-12, -5, 0]]),
    makeQuatTrack('Chest', rt, [[-6, -6, 0], [-5, 0, 0], [-6, 6, 0], [-5, 0, 0], [-6, -6, 0]]),
    makeQuatTrack('Head', rt, [[16, 0, 0], [13, 0, 0], [16, 0, 0], [13, 0, 0], [16, 0, 0]]),
    // Left leg: forward drive (+56) -> stance (+10) -> push-off (-42) -> recovery tuck (+28)
    makeQuatTrack('LeftThigh', rt, [[56, 0, 0], [10, 0, 0], [-42, 0, 0], [28, 0, 0], [56, 0, 0]]),
    makeQuatTrack('LeftShin', rt, [[-22, 0, 0], [-26, 0, 0], [-46, 0, 0], [-86, 0, 0], [-22, 0, 0]]),
    makeQuatTrack('LeftFoot', rt, [[-10, 0, 0], [8, 0, 0], [22, 0, 0], [-8, 0, 0], [-10, 0, 0]]),
    // Right leg: 180 deg out of phase
    makeQuatTrack('RightThigh', rt, [[-42, 0, 0], [28, 0, 0], [56, 0, 0], [10, 0, 0], [-42, 0, 0]]),
    makeQuatTrack('RightShin', rt, [[-46, 0, 0], [-86, 0, 0], [-22, 0, 0], [-26, 0, 0], [-46, 0, 0]]),
    makeQuatTrack('RightFoot', rt, [[22, 0, 0], [-8, 0, 0], [-10, 0, 0], [8, 0, 0], [22, 0, 0]]),
    // Arms opposite legs, abducted cleanly outside hips (-12 left, +12 right), elbows bent FORWARD (+76..+96)
    makeQuatTrack('LeftUpperArm', rt, [[-46, 0, -12], [0, 0, -12], [50, 0, -12], [0, 0, -12], [-46, 0, -12]]),
    makeQuatTrack('LeftForearm', rt, [[74, 0, 0], [88, 0, 0], [96, 0, 0], [82, 0, 0], [74, 0, 0]]),
    makeQuatTrack('RightUpperArm', rt, [[50, 0, 12], [0, 0, 12], [-46, 0, 12], [0, 0, 12], [50, 0, 12]]),
    makeQuatTrack('RightForearm', rt, [[96, 0, 0], [82, 0, 0], [74, 0, 0], [88, 0, 0], [96, 0, 0]]),
  ]);

  // 3. JUMP (0.55s playful tucked athletic leap)
  const jt = [0, 0.16, 0.55];
  const jumpClip = new THREE.AnimationClip('jump', 0.55, [
    new THREE.VectorKeyframeTrack('Hips.position', jt, [0, 0.86, 0, 0, 0.90, 0, 0, 0.88, 0]),
    makeQuatTrack('Spine', jt, [[-8, 0, 0], [-2, 0, 0], [-10, 0, 0]]),
    makeQuatTrack('Chest', jt, [[4, 0, 0], [6, 0, 0], [-4, 0, 0]]),
    makeQuatTrack('LeftThigh', jt, [[66, 0, 0], [76, 0, 0], [50, 0, 0]]),
    makeQuatTrack('LeftShin', jt, [[-78, 0, 0], [-92, 0, 0], [-56, 0, 0]]),
    makeQuatTrack('RightThigh', jt, [[-16, 0, 0], [14, 0, 0], [26, 0, 0]]),
    makeQuatTrack('RightShin', jt, [[-32, 0, 0], [-48, 0, 0], [-36, 0, 0]]),
    makeQuatTrack('LeftUpperArm', jt, [[82, 0, -24], [112, 0, -26], [64, 0, -18]]),
    makeQuatTrack('LeftForearm', jt, [[48, 0, 0], [34, 0, 0], [58, 0, 0]]),
    makeQuatTrack('RightUpperArm', jt, [[72, 0, 24], [102, 0, 26], [54, 0, 18]]),
    makeQuatTrack('RightForearm', jt, [[42, 0, 0], [30, 0, 0], [52, 0, 0]]),
  ]);

  // 4. LAND (0.22s bouncy knee compression)
  const lt = [0, 0.10, 0.22];
  const landClip = new THREE.AnimationClip('land', 0.22, [
    new THREE.VectorKeyframeTrack('Hips.position', lt, [0, 0.82, 0, 0, 0.70, 0, 0, 0.85, 0]),
    makeQuatTrack('Spine', lt, [[-12, 0, 0], [-22, 0, 0], [-10, 0, 0]]),
    makeQuatTrack('Head', lt, [[14, 0, 0], [22, 0, 0], [12, 0, 0]]),
    makeQuatTrack('LeftThigh', lt, [[28, 0, 0], [48, 0, 0], [24, 0, 0]]),
    makeQuatTrack('LeftShin', lt, [[-48, 0, 0], [-80, 0, 0], [-38, 0, 0]]),
    makeQuatTrack('RightThigh', lt, [[24, 0, 0], [42, 0, 0], [20, 0, 0]]),
    makeQuatTrack('RightShin', lt, [[-42, 0, 0], [-74, 0, 0], [-34, 0, 0]]),
    makeQuatTrack('LeftUpperArm', lt, [[-18, 0, -22], [-28, 0, -28], [-12, 0, -12]]),
    makeQuatTrack('LeftForearm', lt, [[50, 0, 0], [65, 0, 0], [65, 0, 0]]),
    makeQuatTrack('RightUpperArm', lt, [[-18, 0, 22], [-28, 0, 28], [-12, 0, 12]]),
    makeQuatTrack('RightForearm', lt, [[50, 0, 0], [65, 0, 0], [65, 0, 0]]),
  ]);

  // 5. SLIDE (0.68s low parkour slide under high barriers)
  const st = [0, 0.12, 0.56, 0.68];
  const slideClip = new THREE.AnimationClip('slide', 0.68, [
    new THREE.VectorKeyframeTrack('Hips.position', st, [
      0, 0.82, 0,
      0, 0.28, 0,
      0, 0.28, 0,
      0, 0.78, 0,
    ]),
    makeQuatTrack('Hips', st, [[14, 0, 0], [38, 0, 0], [38, 0, 0], [10, 0, 0]]),
    makeQuatTrack('Spine', st, [[10, 0, 0], [22, 0, 0], [22, 0, 0], [0, 0, 0]]),
    makeQuatTrack('Chest', st, [[5, 0, 0], [12, 0, 0], [12, 0, 0], [-4, 0, 0]]),
    makeQuatTrack('Neck', st, [[-14, 0, 0], [-26, 0, 0], [-26, 0, 0], [0, 0, 0]]),
    makeQuatTrack('Head', st, [[-10, 0, 0], [-22, 0, 0], [-22, 0, 0], [0, 0, 0]]),
    makeQuatTrack('RightThigh', st, [[42, 0, 0], [102, 0, 0], [102, 0, 0], [28, 0, 0]]),
    makeQuatTrack('RightShin', st, [[-20, 0, 0], [-8, 0, 0], [-8, 0, 0], [-24, 0, 0]]),
    makeQuatTrack('LeftThigh', st, [[36, 0, -8], [86, 0, -14], [86, 0, -14], [24, 0, 0]]),
    makeQuatTrack('LeftShin', st, [[-52, 0, 0], [-102, 0, 0], [-102, 0, 0], [-36, 0, 0]]),
    makeQuatTrack('LeftUpperArm', st, [[-20, 0, -24], [-32, 0, -34], [-32, 0, -34], [-10, 0, -12]]),
    makeQuatTrack('LeftForearm', st, [[40, 0, 0], [52, 0, 0], [52, 0, 0], [58, 0, 0]]),
    makeQuatTrack('RightUpperArm', st, [[35, 0, 22], [55, 0, 28], [55, 0, 28], [20, 0, 12]]),
    makeQuatTrack('RightForearm', st, [[45, 0, 0], [60, 0, 0], [60, 0, 0], [54, 0, 0]]),
  ]);

  // 6. DODGE LEFT & DODGE RIGHT (0.26s crisp lateral bank)
  const dt = [0, 0.12, 0.26];
  const makeDodgeClip = (name: string, dir: -1 | 1): THREE.AnimationClip =>
    new THREE.AnimationClip(name, 0.26, [
      new THREE.VectorKeyframeTrack('Hips.position', dt, [0, 0.86, 0, 0, 0.80, 0, 0, 0.86, 0]),
      makeQuatTrack('Hips', dt, [[0, 0, 0], [-6, dir * -12, dir * -15], [-3, 0, 0]]),
      makeQuatTrack('Spine', dt, [[-8, 0, 0], [-12, dir * 8, dir * -9], [-9, 0, 0]]),
      makeQuatTrack('Head', dt, [[10, 0, 0], [14, dir * 6, dir * 10], [10, 0, 0]]),
      makeQuatTrack('LeftThigh', dt, [[25, 0, 0], [42, 0, -10], [20, 0, 0]]),
      makeQuatTrack('LeftShin', dt, [[-35, 0, 0], [-52, 0, 0], [-30, 0, 0]]),
      makeQuatTrack('RightThigh', dt, [[-16, 0, 0], [18, 0, 10], [-10, 0, 0]]),
      makeQuatTrack('RightShin', dt, [[-25, 0, 0], [-42, 0, 0], [-25, 0, 0]]),
      makeQuatTrack('LeftUpperArm', dt, [[-20, 0, -14], [-26, 0, -32], [-10, 0, -12]]),
      makeQuatTrack('LeftForearm', dt, [[64, 0, 0], [72, 0, 0], [68, 0, 0]]),
      makeQuatTrack('RightUpperArm', dt, [[20, 0, 14], [26, 0, 32], [10, 0, 12]]),
      makeQuatTrack('RightForearm', dt, [[64, 0, 0], [72, 0, 0], [68, 0, 0]]),
    ]);

  const dodgeLeftClip = makeDodgeClip('dodgeLeft', -1);
  const dodgeRightClip = makeDodgeClip('dodgeRight', 1);

  // 7. FALL (0.48s impact recoil & backward fall)
  const ft = [0, 0.18, 0.48];
  const fallClip = new THREE.AnimationClip('fall', 0.48, [
    new THREE.VectorKeyframeTrack('Hips.position', ft, [0, 0.86, 0, 0, 0.56, 0.28, 0, 0.20, 0.56]),
    makeQuatTrack('Hips', ft, [[12, 0, 0], [48, 0, -8], [82, 0, -12]]),
    makeQuatTrack('Spine', ft, [[8, 0, 0], [16, 0, 0], [8, 0, 0]]),
    makeQuatTrack('Head', ft, [[-12, 0, 0], [-22, 0, 10], [-15, 0, 14]]),
    makeQuatTrack('LeftThigh', ft, [[20, 0, 0], [45, 0, -8], [22, 0, -10]]),
    makeQuatTrack('LeftShin', ft, [[-30, 0, 0], [-55, 0, 0], [-28, 0, 0]]),
    makeQuatTrack('RightThigh', ft, [[-10, 0, 0], [25, 0, 8], [12, 0, 10]]),
    makeQuatTrack('RightShin', ft, [[-18, 0, 0], [-40, 0, 0], [-20, 0, 0]]),
    makeQuatTrack('LeftUpperArm', ft, [[40, 0, -35], [80, 0, -58], [45, 0, -68]]),
    makeQuatTrack('RightUpperArm', ft, [[35, 0, 35], [75, 0, 58], [40, 0, 68]]),
  ]);

  return [idleClip, walkClip, runClip, jumpClip, landClip, slideClip, dodgeLeftClip, dodgeRightClip, fallClip];
}

// ============================================================================
// 5. GLB Export -> GLTFLoader Pipeline + AnimationMixer Controller
// ============================================================================

export async function createCartoonBoyRunner(
  contactShadowTexture: THREE.Texture,
  maxAnisotropy = 4,
): Promise<CartoonBoyController> {
  const { exportRoot, disposables } = createCartoonBoyRigAndMesh(maxAnisotropy);
  const clips = buildAnimationClips();

  const exporter = new GLTFExporter();
  const glbBuffer = (await exporter.parseAsync(exportRoot, {
    binary: true,
    animations: clips,
  })) as ArrayBuffer;

  disposables.dispose();

  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(glbBuffer, '');
  const modelRoot = gltf.scene;

  modelRoot.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) std.map.anisotropy = maxAnisotropy;
      }
    }
  });

  const root = new THREE.Group();
  root.add(modelRoot);

  const shadowGeo = new THREE.PlaneGeometry(1.45, 1.45);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.68,
  });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.03;
  root.add(shadowDisc);

  const mixer = new THREE.AnimationMixer(modelRoot);

  const getAction = (name: CharacterAnimState, loop: THREE.AnimationActionLoopStyles, clamp = false) => {
    const clip = THREE.AnimationClip.findByName(gltf.animations, name) ?? clips[0];
    const action = mixer.clipAction(clip);
    action.loop = loop;
    action.clampWhenFinished = clamp;
    return action;
  };

  const actions: Record<CharacterAnimState, THREE.AnimationAction> = {
    idle: getAction('idle', THREE.LoopRepeat),
    walk: getAction('walk', THREE.LoopRepeat),
    run: getAction('run', THREE.LoopRepeat),
    jump: getAction('jump', THREE.LoopOnce, true),
    land: getAction('land', THREE.LoopOnce, false),
    slide: getAction('slide', THREE.LoopOnce, true),
    dodgeLeft: getAction('dodgeLeft', THREE.LoopOnce, false),
    dodgeRight: getAction('dodgeRight', THREE.LoopOnce, false),
    fall: getAction('fall', THREE.LoopOnce, true),
  };

  let currentState: CharacterAnimState = 'idle';
  let activeAction = actions.idle;
  activeAction.play();

  const setAnimState = (nextState: CharacterAnimState, fadeDuration = 0.12) => {
    if (nextState === currentState && (nextState === 'idle' || nextState === 'walk' || nextState === 'run')) return;
    const nextAction = actions[nextState];
    if (!nextAction) return;

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1);
    nextAction.play();

    if (activeAction !== nextAction) {
      activeAction.crossFadeTo(nextAction, fadeDuration, true);
    }
    activeAction = nextAction;
    currentState = nextState;
  };

  mixer.addEventListener('finished', (event) => {
    const finishedAction = (event as unknown as { action: THREE.AnimationAction }).action;
    if (
      finishedAction === actions.land ||
      finishedAction === actions.dodgeLeft ||
      finishedAction === actions.dodgeRight ||
      finishedAction === actions.slide
    ) {
      if (currentState !== 'fall' && currentState !== 'idle' && currentState !== 'walk' && currentState !== 'jump') {
        setAnimState('run', 0.12);
      }
    }
  });

  const setRunTimeScale = (scale: number) => {
    actions.run.setEffectiveTimeScale(scale);
  };

  const update = (dt: number) => {
    mixer.update(dt);
  };

  const dispose = () => {
    mixer.stopAllAction();
    shadowGeo.dispose();
    shadowMat.dispose();
    modelRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
          const std = m as THREE.MeshStandardMaterial;
          std.map?.dispose();
          std.bumpMap?.dispose();
          m.dispose();
        }
      }
    });
  };

  return {
    root,
    modelRoot,
    shadowDisc,
    mixer,
    actions,
    setAnimState,
    setRunTimeScale,
    update,
    dispose,
  };
}
