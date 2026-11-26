import * as THREE from 'three';

export interface GameTextureSet {
  trackBed: THREE.CanvasTexture;
  platform: THREE.CanvasTexture;
  hazardChevron: THREE.CanvasTexture;
  highGateSign: THREE.CanvasTexture;
  trainSideBlue: THREE.CanvasTexture;
  trainSideRed: THREE.CanvasTexture;
  trainSideAmber: THREE.CanvasTexture;
  buildingFacadeLight: THREE.CanvasTexture;
  buildingFacadeWarm: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

export function createGameTextures(maxAnisotropy: number): GameTextureSet {
  const created: THREE.CanvasTexture[] = [];
  const aniso = Math.max(1, Math.min(8, maxAnisotropy));

  // 1. Track ballast gravel bed
  const [bedCanvas, bedCtx] = makeCanvas(256, 256);
  bedCtx.fillStyle = '#5c6470';
  bedCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const shade = 70 + Math.floor(Math.random() * 48);
    bedCtx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 10})`;
    bedCtx.fillRect(x, y, 3, 3);
  }
  // Subtle lane shadow troughs
  bedCtx.fillStyle = 'rgba(20, 25, 34, 0.25)';
  bedCtx.fillRect(10, 0, 68, 256);
  bedCtx.fillRect(94, 0, 68, 256);
  bedCtx.fillRect(178, 0, 68, 256);
  const trackBed = finalizeColorTexture(bedCanvas, aniso, 1, 4);
  created.push(trackBed);

  // 2. Concrete side platform with tactile yellow safety strip
  const [platCanvas, platCtx] = makeCanvas(256, 256);
  platCtx.fillStyle = '#cbd5e1';
  platCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 188 + Math.floor(Math.random() * 34);
    platCtx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 8})`;
    platCtx.fillRect(x, y, 2, 2);
  }
  // Expansion joint lines
  platCtx.fillStyle = 'rgba(71, 85, 105, 0.35)';
  platCtx.fillRect(0, 62, 256, 3);
  platCtx.fillRect(0, 190, 256, 3);
  // Tactile yellow edge
  platCtx.fillStyle = '#facc15';
  platCtx.fillRect(0, 0, 22, 256);
  platCtx.fillRect(234, 0, 22, 256);
  const platform = finalizeColorTexture(platCanvas, aniso, 1, 6);
  created.push(platform);

  // 3. Low barrier hazard chevron stripes
  const [chevCanvas, chevCtx] = makeCanvas(256, 64);
  chevCtx.fillStyle = '#f59e0b';
  chevCtx.fillRect(0, 0, 256, 64);
  chevCtx.fillStyle = '#1e293b';
  for (let x = -64; x < 320; x += 48) {
    chevCtx.beginPath();
    chevCtx.moveTo(x, 0);
    chevCtx.lineTo(x + 24, 0);
    chevCtx.lineTo(x + 56, 64);
    chevCtx.lineTo(x + 32, 64);
    chevCtx.closePath();
    chevCtx.fill();
  }
  const hazardChevron = finalizeColorTexture(chevCanvas, aniso);
  created.push(hazardChevron);

  // 4. High overhead gate warning board ("LOW CLEARANCE / SLIDE")
  const [gateCanvas, gateCtx] = makeCanvas(512, 128);
  gateCtx.fillStyle = '#dc2626';
  gateCtx.fillRect(0, 0, 512, 128);
  // White stripe border
  gateCtx.fillStyle = '#f8fafc';
  for (let x = -32; x < 544; x += 64) {
    gateCtx.beginPath();
    gateCtx.moveTo(x, 0);
    gateCtx.lineTo(x + 28, 0);
    gateCtx.lineTo(x + 48, 22);
    gateCtx.lineTo(x + 20, 22);
    gateCtx.closePath();
    gateCtx.fill();

    gateCtx.beginPath();
    gateCtx.moveTo(x, 106);
    gateCtx.lineTo(x + 28, 106);
    gateCtx.lineTo(x + 48, 128);
    gateCtx.lineTo(x + 20, 128);
    gateCtx.closePath();
    gateCtx.fill();
  }
  // Downward arrow icons
  gateCtx.fillStyle = '#ffffff';
  const drawDownArrow = (cx: number) => {
    gateCtx.fillRect(cx - 10, 34, 20, 30);
    gateCtx.beginPath();
    gateCtx.moveTo(cx - 24, 62);
    gateCtx.lineTo(cx + 24, 62);
    gateCtx.lineTo(cx, 94);
    gateCtx.closePath();
    gateCtx.fill();
  };
  drawDownArrow(96);
  drawDownArrow(256);
  drawDownArrow(416);
  const highGateSign = finalizeColorTexture(gateCanvas, aniso);
  created.push(highGateSign);

  // 5. Train livery textures
  const makeTrainSide = (bodyColor: string, stripeColor: string): THREE.CanvasTexture => {
    const [c, ctx] = makeCanvas(512, 192);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(0, 0, 512, 192);

    // Metallic lower skirt
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 154, 512, 38);

    // Racing accent stripe
    ctx.fillStyle = stripeColor;
    ctx.fillRect(0, 114, 512, 18);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 108, 512, 5);

    // Windows & passenger doors
    for (let i = 0; i < 6; i++) {
      const wx = 26 + i * 80;
      if (i === 1 || i === 4) {
        // Double sliding door frame
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(wx - 4, 34, 56, 118);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(wx, 38, 23, 110);
        ctx.fillRect(wx + 25, 38, 23, 110);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(wx + 3, 46, 17, 42);
        ctx.fillRect(wx + 28, 46, 17, 42);
      } else {
        // Passenger window
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(wx, 38, 56, 52, 8);
        ctx.fill();
        // Specular sky reflection in glass
        ctx.fillStyle = 'rgba(186, 230, 253, 0.35)';
        ctx.beginPath();
        ctx.moveTo(wx + 6, 44);
        ctx.lineTo(wx + 26, 44);
        ctx.lineTo(wx + 12, 84);
        ctx.lineTo(wx + 6, 84);
        ctx.closePath();
        ctx.fill();
      }
    }
    const tex = finalizeColorTexture(c, aniso);
    created.push(tex);
    return tex;
  };

  const trainSideBlue = makeTrainSide('#2563eb', '#facc15');
  const trainSideRed = makeTrainSide('#dc2626', '#f8fafc');
  const trainSideAmber = makeTrainSide('#d97706', '#0f172a');

  // 6. Building facade textures
  const makeBuildingTex = (wall: string, trim: string, lit: string): THREE.CanvasTexture => {
    const [c, ctx] = makeCanvas(256, 512);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, 256, 512);

    ctx.fillStyle = trim;
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(0, y, 256, 5);
    }

    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 4; col++) {
        const wx = 18 + col * 60;
        const wy = 16 + row * 64;
        const isWarm = (row * 3 + col * 5) % 4 === 0;
        ctx.fillStyle = isWarm ? lit : '#1e293b';
        ctx.fillRect(wx, wy, 36, 38);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(wx + 3, wy + 3, 12, 32);
      }
    }

    // Ground storefront
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 456, 256, 56);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(24, 468, 92, 36);
    ctx.fillRect(140, 468, 92, 36);

    const tex = finalizeColorTexture(c, aniso);
    created.push(tex);
    return tex;
  };

  const buildingFacadeLight = makeBuildingTex('#e2e8f0', '#cbd5e1', '#fef08a');
  const buildingFacadeWarm = makeBuildingTex('#d97757', '#b45339', '#fde047');

  // 7. Radial soft contact shadow texture
  const [shadCanvas, shadCtx] = makeCanvas(128, 128);
  const grad = shadCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.65)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.25)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  shadCtx.fillStyle = grad;
  shadCtx.fillRect(0, 0, 128, 128);
  const contactShadow = finalizeColorTexture(shadCanvas, 1);
  created.push(contactShadow);

  return {
    trackBed,
    platform,
    hazardChevron,
    highGateSign,
    trainSideBlue,
    trainSideRed,
    trainSideAmber,
    buildingFacadeLight,
    buildingFacadeWarm,
    contactShadow,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
