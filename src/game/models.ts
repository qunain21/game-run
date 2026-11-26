import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameTextureSet } from './textures';
import { LANE_WIDTH, TRACK_SEGMENT_LENGTH } from './types';

export interface RunnerRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  shadowDisc: THREE.Mesh;
}

export interface ModelFactory {
  createRunner: () => RunnerRig;
  createTrackSegment: () => THREE.Group;
  createLowBarrier: () => THREE.Group;
  createHighBarrier: () => THREE.Group;
  createSignalPost: () => THREE.Group;
  createTrain: (variant: 0 | 1 | 2) => THREE.Group;
  createCoin: () => THREE.Group;
  createBuilding: (variant: number, heightScale: number) => THREE.Group;
  createTree: () => THREE.Group;
  dispose: () => void;
}

export function createModelFactory(textures: GameTextureSet): ModelFactory {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Shared PBR Materials (varied roughness & metalness across adjacent parts)
  const matSteelRail = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.22 }),
  );
  const matDarkSteel = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.72, roughness: 0.38 }),
  );
  const matWoodTie = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5c3d28, metalness: 0.05, roughness: 0.9 }),
  );
  const matTrackBed = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.trackBed, roughness: 0.94, metalness: 0.04 }),
  );
  const matPlatform = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.platform, roughness: 0.85, metalness: 0.05 }),
  );
  const matGrass = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x4d7c38, roughness: 0.92, metalness: 0.0 }),
  );
  const matConcrete = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88, metalness: 0.06 }),
  );
  const matChevron = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.hazardChevron, roughness: 0.45, metalness: 0.12 }),
  );
  const matHighGate = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.highGateSign, roughness: 0.4, metalness: 0.15 }),
  );
  const matBeaconAmber = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );
  const matSignalRed = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.1,
    }),
  );
  const matHeadlight = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      emissive: 0xfde047,
      emissiveIntensity: 1.3,
      roughness: 0.15,
      metalness: 0.1,
    }),
  );
  const matTrainGlass = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.35 }),
  );
  const matTrainRoof = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.55, metalness: 0.3 }),
  );
  const matTrainSides = [
    trackMat(new THREE.MeshStandardMaterial({ map: textures.trainSideBlue, roughness: 0.38, metalness: 0.25 })),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.trainSideRed, roughness: 0.38, metalness: 0.25 })),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.trainSideAmber, roughness: 0.38, metalness: 0.25 })),
  ];
  const matTrainFronts = [
    trackMat(new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.3 })),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.3 })),
    trackMat(new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.3 })),
  ];
  const matCoinGold = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xb45309,
      emissiveIntensity: 0.22,
      metalness: 0.88,
      roughness: 0.18,
    }),
  );
  const matCoinRim = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfde047,
      metalness: 0.92,
      roughness: 0.14,
    }),
  );
  const matContactShadow = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    }),
  );
  const matBuildingLight = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.buildingFacadeLight, roughness: 0.82, metalness: 0.05 }),
  );
  const matBuildingWarm = trackMat(
    new THREE.MeshStandardMaterial({ map: textures.buildingFacadeWarm, roughness: 0.86, metalness: 0.04 }),
  );
  const matRoofCap = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.12 }),
  );
  const matTreeTrunk = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.92, metalness: 0.0 }),
  );
  const matFoliageA = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.82, metalness: 0.0 }),
  );
  const matFoliageB = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.85, metalness: 0.0 }),
  );

  // Shared Geometries
  const geoBed = trackGeo(new THREE.PlaneGeometry(LANE_WIDTH * 3 + 1.4, TRACK_SEGMENT_LENGTH));
  geoBed.rotateX(-Math.PI / 2);
  const geoGroundSide = trackGeo(new THREE.PlaneGeometry(24, TRACK_SEGMENT_LENGTH));
  geoGroundSide.rotateX(-Math.PI / 2);
  const geoPlatform = trackGeo(new THREE.BoxGeometry(2.6, 0.36, TRACK_SEGMENT_LENGTH));
  const geoRail = trackGeo(new THREE.BoxGeometry(0.11, 0.12, TRACK_SEGMENT_LENGTH));
  const geoTie = trackGeo(new THREE.BoxGeometry(1.9, 0.07, 0.24));
  const geoShadowDisc = trackGeo(new THREE.PlaneGeometry(1.4, 1.4));
  geoShadowDisc.rotateX(-Math.PI / 2);

  // Coin Lathe/Composite geometries
  const geoCoinCore = trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 20));
  geoCoinCore.rotateX(Math.PI / 2);
  const geoCoinRim = trackGeo(new THREE.TorusGeometry(0.4, 0.06, 8, 22));
  const geoCoinEmblem = trackGeo(new THREE.BoxGeometry(0.22, 0.22, 0.14));

  // Runner geometries
  const geoTorso = trackGeo(new THREE.BoxGeometry(0.56, 0.66, 0.34));
  const geoPack = trackGeo(new THREE.BoxGeometry(0.42, 0.5, 0.22));
  const geoHead = trackGeo(new THREE.SphereGeometry(0.22, 16, 14));
  const geoCapDome = trackGeo(new THREE.SphereGeometry(0.235, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.54));
  const geoCapBrim = trackGeo(new THREE.BoxGeometry(0.32, 0.05, 0.24));
  const geoArm = trackGeo(new THREE.CapsuleGeometry(0.085, 0.42, 6, 10));
  const geoLeg = trackGeo(new THREE.CapsuleGeometry(0.105, 0.44, 6, 10));
  const geoShoe = trackGeo(new THREE.BoxGeometry(0.21, 0.15, 0.34));

  const createRunner = (): RunnerRig => {
    const root = new THREE.Group();
    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    // Contact shadow stays on ground (y = 0.025)
    const shadowDisc = new THREE.Mesh(geoShadowDisc, matContactShadow);
    shadowDisc.position.y = 0.03;
    root.add(shadowDisc);

    // Materials for our expressive runner (vibrant teal jacket, dark joggers, coral-red cap & sneakers)
    const matHoodie = trackMat(new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.68, metalness: 0.05 }));
    const matBackpack = trackMat(new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.52, metalness: 0.12 }));
    const matReflective = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.22, metalness: 0.65 }));
    const matPants = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8, metalness: 0.04 }));
    const matSkin = trackMat(new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.65, metalness: 0.02 }));
    const matAccentRed = trackMat(new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.42, metalness: 0.1 }));

    // Torso pivot at hip height (0.86)
    const torso = new THREE.Group();
    torso.position.set(0, 0.86, 0);
    bodyGroup.add(torso);

    const chest = new THREE.Mesh(geoTorso, matHoodie);
    chest.position.y = 0.33;
    chest.castShadow = true;
    torso.add(chest);

    const backpack = new THREE.Mesh(geoPack, matBackpack);
    backpack.position.set(0, 0.35, 0.25);
    backpack.castShadow = true;
    torso.add(backpack);

    const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.44, 0.07, 0.24)), matReflective);
    stripe.position.set(0, 0.24, 0.26);
    torso.add(stripe);

    // Head + Cap + Visor
    const head = new THREE.Group();
    head.position.set(0, 0.72, 0);
    torso.add(head);

    const headMesh = new THREE.Mesh(geoHead, matSkin);
    headMesh.position.y = 0.2;
    headMesh.castShadow = true;
    head.add(headMesh);

    const capDome = new THREE.Mesh(geoCapDome, matAccentRed);
    capDome.position.set(0, 0.24, 0.01);
    capDome.rotation.x = 0.14;
    head.add(capDome);

    const capBrim = new THREE.Mesh(geoCapBrim, matReflective);
    capBrim.position.set(0, 0.27, -0.2);
    head.add(capBrim);

    // Arms pivoted at shoulder
    const makeArm = (side: -1 | 1): THREE.Group => {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.38, 0.58, 0);
      const limb = new THREE.Mesh(geoArm, matHoodie);
      limb.position.y = -0.24;
      limb.castShadow = true;
      armPivot.add(limb);

      const hand = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.085, 10, 8)), matSkin);
      hand.position.y = -0.5;
      armPivot.add(hand);
      torso.add(armPivot);
      return armPivot;
    };

    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);

    // Legs pivoted at hip
    const makeLeg = (side: -1 | 1): THREE.Group => {
      const legPivot = new THREE.Group();
      legPivot.position.set(side * 0.16, 0.82, 0);
      const limb = new THREE.Mesh(geoLeg, matPants);
      limb.position.y = -0.34;
      limb.castShadow = true;
      legPivot.add(limb);

      const shoe = new THREE.Mesh(geoShoe, matAccentRed);
      shoe.position.set(0, -0.73, -0.05);
      shoe.castShadow = true;
      legPivot.add(shoe);

      const sole = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.05, 0.35)), matReflective);
      sole.position.set(0, -0.79, -0.05);
      legPivot.add(sole);

      bodyGroup.add(legPivot);
      return legPivot;
    };

    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);

    return {
      root,
      bodyGroup,
      torso,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      shadowDisc,
    };
  };

  // Pre-merged per-segment track geometries (cuts 50 meshes/segment -> 6 meshes/segment)
  const cloneAt = (src: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry => {
    const g = src.clone();
    g.translate(x, y, z);
    return g;
  };

  const grassGeos = [
    cloneAt(geoGroundSide, -19, -0.04, 0),
    cloneAt(geoGroundSide, 19, -0.04, 0),
  ];
  const mergedGrassGeo = trackGeo(mergeGeometries(grassGeos, false)!);
  grassGeos.forEach((g) => g.dispose());

  const platGeos = [
    cloneAt(geoPlatform, -(LANE_WIDTH * 1.5 + 1.55), 0.18, 0),
    cloneAt(geoPlatform, LANE_WIDTH * 1.5 + 1.55, 0.18, 0),
  ];
  const mergedPlatGeo = trackGeo(mergeGeometries(platGeos, false)!);
  platGeos.forEach((g) => g.dispose());

  const railGeos: THREE.BufferGeometry[] = [];
  const tieGeos: THREE.BufferGeometry[] = [];
  for (let lane = -1; lane <= 1; lane++) {
    const cx = lane * LANE_WIDTH;
    railGeos.push(cloneAt(geoRail, cx - 0.65, 0.08, 0));
    railGeos.push(cloneAt(geoRail, cx + 0.65, 0.08, 0));
    for (let z = -TRACK_SEGMENT_LENGTH / 2 + 1; z < TRACK_SEGMENT_LENGTH / 2; z += 2.0) {
      tieGeos.push(cloneAt(geoTie, cx, 0.035, z));
    }
  }
  const mergedRailsGeo = trackGeo(mergeGeometries(railGeos, false)!);
  railGeos.forEach((g) => g.dispose());
  const mergedTiesGeo = trackGeo(mergeGeometries(tieGeos, false)!);
  tieGeos.forEach((g) => g.dispose());

  const postBaseGeo = new THREE.BoxGeometry(0.28, 6.4, 0.28);
  const beamBaseGeo = new THREE.BoxGeometry(LANE_WIDTH * 3 + 3.6, 0.26, 0.3);
  const gantryGeos = [
    cloneAt(postBaseGeo, -(LANE_WIDTH * 1.5 + 1.4), 3.2, 0),
    cloneAt(postBaseGeo, LANE_WIDTH * 1.5 + 1.4, 3.2, 0),
    cloneAt(beamBaseGeo, 0, 6.25, 0),
  ];
  postBaseGeo.dispose();
  beamBaseGeo.dispose();
  const mergedGantryGeo = trackGeo(mergeGeometries(gantryGeos, false)!);
  gantryGeos.forEach((g) => g.dispose());

  const createTrackSegment = (): THREE.Group => {
    const seg = new THREE.Group();

    const bed = new THREE.Mesh(geoBed, matTrackBed);
    bed.position.y = 0;
    bed.receiveShadow = true;
    seg.add(bed);

    const grass = new THREE.Mesh(mergedGrassGeo, matGrass);
    grass.receiveShadow = true;
    seg.add(grass);

    const platforms = new THREE.Mesh(mergedPlatGeo, matPlatform);
    platforms.receiveShadow = true;
    seg.add(platforms);

    const rails = new THREE.Mesh(mergedRailsGeo, matSteelRail);
    rails.receiveShadow = true;
    seg.add(rails);

    const ties = new THREE.Mesh(mergedTiesGeo, matWoodTie);
    ties.receiveShadow = true;
    seg.add(ties);

    const gantry = new THREE.Mesh(mergedGantryGeo, matDarkSteel);
    gantry.castShadow = true;
    seg.add(gantry);

    return seg;
  };

  // Low Hurdle Barrier (Jump over): 6-part composite sawhorse barricade
  const createLowBarrier = (): THREE.Group => {
    const g = new THREE.Group();
    const legGeo = trackGeo(new THREE.BoxGeometry(0.16, 1.05, 0.18));
    const footGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.1, 0.72));
    const plankGeo = trackGeo(new THREE.BoxGeometry(2.35, 0.44, 0.18));
    const beaconGeo = trackGeo(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 10));

    for (const sx of [-0.92, 0.92]) {
      const leg = new THREE.Mesh(legGeo, matDarkSteel);
      leg.position.set(sx, 0.55, 0);
      leg.castShadow = true;
      g.add(leg);

      const foot = new THREE.Mesh(footGeo, matConcrete);
      foot.position.set(sx, 0.05, 0);
      foot.receiveShadow = true;
      g.add(foot);

      const beacon = new THREE.Mesh(beaconGeo, matBeaconAmber);
      beacon.position.set(sx, 1.15, 0);
      g.add(beacon);
    }

    const plank = new THREE.Mesh(plankGeo, matChevron);
    plank.position.set(0, 0.78, 0);
    plank.castShadow = true;
    plank.receiveShadow = true;
    g.add(plank);

    const shadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.5, 1.1)), matContactShadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    g.add(shadow);

    return g;
  };

  // High Overhead Gate (Slide under): 6-part composite gantry with clear bottom gap
  const createHighBarrier = (): THREE.Group => {
    const g = new THREE.Group();
    const postGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 2.75, 10));
    const baseGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 0.16, 10));
    const boardGeo = trackGeo(new THREE.BoxGeometry(2.55, 0.92, 0.28));
    const capGeo = trackGeo(new THREE.BoxGeometry(2.7, 0.14, 0.34));

    for (const sx of [-1.18, 1.18]) {
      const post = new THREE.Mesh(postGeo, matDarkSteel);
      post.position.set(sx, 1.375, 0);
      post.castShadow = true;
      g.add(post);

      const base = new THREE.Mesh(baseGeo, matConcrete);
      base.position.set(sx, 0.08, 0);
      g.add(base);
    }

    // Bottom edge at y = 1.18 so standing player (1.85m) hits it, sliding player (0.85m) clears cleanly!
    const board = new THREE.Mesh(boardGeo, matHighGate);
    board.position.set(0, 1.68, 0);
    board.castShadow = true;
    g.add(board);

    const topCap = new THREE.Mesh(capGeo, matDarkSteel);
    topCap.position.set(0, 2.2, 0);
    g.add(topCap);

    const botTrim = new THREE.Mesh(capGeo, matBeaconAmber);
    botTrim.position.set(0, 1.18, 0);
    g.add(botTrim);

    return g;
  };

  // Railway Signal Post (Dodge left/right): 7-part composite vertical blocker
  const createSignalPost = (): THREE.Group => {
    const g = new THREE.Group();

    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.45, 0.95)), matConcrete);
    plinth.position.y = 0.225;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    g.add(plinth);

    const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.18, 3.2, 12)), matDarkSteel);
    mast.position.y = 1.95;
    mast.castShadow = true;
    g.add(mast);

    const housing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 1.35, 0.52)), matDarkSteel);
    housing.position.set(0, 2.95, 0.05);
    housing.castShadow = true;
    g.add(housing);

    const hoodGeo = trackGeo(new THREE.CylinderGeometry(0.19, 0.19, 0.28, 12, 1, true, 0, Math.PI));
    hoodGeo.rotateZ(Math.PI / 2);
    hoodGeo.rotateY(Math.PI / 2);

    const lensRed = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.15, 12, 10)), matSignalRed);
    lensRed.position.set(0, 3.26, 0.3);
    g.add(lensRed);

    const lensAmber = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.15, 12, 10)), matBeaconAmber);
    lensAmber.position.set(0, 2.68, 0.3);
    g.add(lensAmber);

    // Stripped caution collar at chest level
    const collar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.7, 12)), matChevron);
    collar.position.y = 1.15;
    g.add(collar);

    const shadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.5, 1.5)), matContactShadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    g.add(shadow);

    return g;
  };

  // Commuter Train Car (10-part composite): 14m long, 2.5m wide, 3.35m tall
  const createTrain = (variant: 0 | 1 | 2): THREE.Group => {
    const g = new THREE.Group();
    const len = 14.0;

    // 1. Undercarriage chassis
    const chassis = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.38, 0.42, len - 0.3)), matDarkSteel);
    chassis.position.y = 0.48;
    chassis.castShadow = true;
    g.add(chassis);

    // 2. Main passenger body shell (6 materials: sides have livery texture, front/back painted, top/bottom dark)
    const sideMat = matTrainSides[variant];
    const frontMat = matTrainFronts[variant];
    const bodyGeo = trackGeo(new THREE.BoxGeometry(2.48, 2.25, len));
    const body = new THREE.Mesh(bodyGeo, [
      sideMat,
      sideMat,
      matTrainRoof,
      matDarkSteel,
      frontMat,
      frontMat,
    ]);
    body.position.y = 1.8;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // 3. Curved roof crown + HVAC pods
    const roof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.15, 0.28, len - 0.5)), matTrainRoof);
    roof.position.y = 3.04;
    roof.castShadow = true;
    g.add(roof);

    const acGeo = trackGeo(new THREE.BoxGeometry(1.3, 0.22, 1.8));
    for (const az of [-3.6, 3.6]) {
      const ac = new THREE.Mesh(acGeo, matConcrete);
      ac.position.set(0, 3.26, az);
      g.add(ac);
    }

    // 4. Front cab windshield & twin headlights (facing +Z toward player!)
    const windshield = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.96, 0.82, 0.08)), matTrainGlass);
    windshield.position.set(0, 2.25, len / 2 + 0.02);
    g.add(windshield);

    const visor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 0.14, 0.2)), matDarkSteel);
    visor.position.set(0, 2.72, len / 2 + 0.05);
    g.add(visor);

    const bumper = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.52, 0.28, 0.34)), matChevron);
    bumper.position.set(0, 0.44, len / 2 + 0.06);
    g.add(bumper);

    const lampGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 14));
    lampGeo.rotateX(Math.PI / 2);
    for (const lx of [-0.75, 0.75]) {
      const lamp = new THREE.Mesh(lampGeo, matHeadlight);
      lamp.position.set(lx, 1.15, len / 2 + 0.03);
      g.add(lamp);
    }

    // 5. Wheel bogies (4 wheel pairs visible on edges)
    const wheelGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 14));
    wheelGeo.rotateZ(Math.PI / 2);
    for (const wz of [-4.8, -3.4, 3.4, 4.8]) {
      for (const wx of [-1.05, 1.05]) {
        const wheel = new THREE.Mesh(wheelGeo, matSteelRail);
        wheel.position.set(wx, 0.28, wz);
        g.add(wheel);
      }
    }

    // Ground contact shadow
    const shadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.0, len + 0.8)), matContactShadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    g.add(shadow);

    return g;
  };

  // Collectible Coin (3-part composite): beveled gold disc + outer rim + center emblem
  const createCoin = (): THREE.Group => {
    const g = new THREE.Group();
    const core = new THREE.Mesh(geoCoinCore, matCoinGold);
    g.add(core);
    const rim = new THREE.Mesh(geoCoinRim, matCoinRim);
    g.add(rim);
    const emblem = new THREE.Mesh(geoCoinEmblem, matCoinRim);
    emblem.rotation.z = Math.PI / 4;
    g.add(emblem);
    return g;
  };

  // Multi-part Urban Building
  const createBuilding = (variant: number, heightScale: number): THREE.Group => {
    const g = new THREE.Group();
    const w = 7.5 + (variant % 3) * 1.4;
    const d = 8.5 + (variant % 2) * 1.5;
    const h = (14 + (variant % 4) * 5) * heightScale;

    const facadeMat = variant % 2 === 0 ? matBuildingLight : matBuildingWarm;
    const tower = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), facadeMat);
    tower.position.y = h / 2;
    tower.castShadow = false;
    tower.receiveShadow = true;
    g.add(tower);

    const cornice = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.5, 0.6, d + 0.5)), matRoofCap);
    cornice.position.y = h + 0.2;
    g.add(cornice);

    const penthouse = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w * 0.48, 2.2, d * 0.48)), matConcrete);
    penthouse.position.y = h + 1.4;
    g.add(penthouse);

    return g;
  };

  // Multi-part Stylized Tree (4 parts: trunk + 3 foliage spheres)
  const createTree = (): THREE.Group => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 8)), matTreeTrunk);
    trunk.position.y = 1.1;
    g.add(trunk);

    const crownA = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(1.15, 1)), matFoliageA);
    crownA.position.set(0, 2.75, 0);
    g.add(crownA);

    const crownB = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.85, 1)), matFoliageB);
    crownB.position.set(0.6, 2.35, 0.35);
    g.add(crownB);

    const crownC = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.8, 1)), matFoliageA);
    crownC.position.set(-0.55, 2.4, -0.3);
    g.add(crownC);

    return g;
  };

  return {
    createRunner,
    createTrackSegment,
    createLowBarrier,
    createHighBarrier,
    createSignalPost,
    createTrain,
    createCoin,
    createBuilding,
    createTree,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
