import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsset } from '../assets/models/column/asset.mjs';

export const DURATION = 20;
const TAU = Math.PI * 2;
const palette = {
  fog: 0x3c204c, stone: 0x28172f, stoneLight: 0x48304c, gold: 0xd58b84,
  goldDark: 0x7c4556, pink: 0xf063a5, blossom: 0xe95b9c, lavender: 0xa677c0,
};
const homePosition = new THREE.Vector3(2.4, 8.5, 19);
const homeTarget = new THREE.Vector3(2.4, 3.6, -3);
const zoneViews = {
  visual: { position: new THREE.Vector3(-4.5, 5.2, 10), target: new THREE.Vector3(-2.5, 3.5, -4) },
  interactive: { position: new THREE.Vector3(6.5, 4.8, 10), target: new THREE.Vector3(6.5, 3.3, -4) },
  worlds: { position: new THREE.Vector3(11, 5.8, 10), target: new THREE.Vector3(9, 3.7, -4) },
};
const qualityPresets = {
  high: { dpr: 1.5, shadows: true, bloom: true, reflector: true, petals: 360 },
  balanced: { dpr: 1.1, shadows: true, bloom: true, reflector: true, petals: 220 },
  lite: { dpr: 0.85, shadows: false, bloom: false, reflector: false, petals: 100 },
};

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20261106);
const range = (min, max) => min + random() * (max - min);

function archShape(width, height) {
  const radius = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.lineTo(-radius, height - radius);
  shape.absarc(0, height - radius, radius, Math.PI, 0, true);
  shape.lineTo(radius, 0);
  shape.closePath();
  return shape;
}

function createArchFrameGeometry(width, height, thickness, depth) {
  const shape = archShape(width, height);
  const innerWidth = width - thickness * 2;
  const inner = archShape(innerWidth, height - thickness);
  inner.translate?.(0, thickness);
  const hole = new THREE.Path();
  const r = innerWidth / 2;
  hole.moveTo(-r, thickness);
  hole.lineTo(-r, height - thickness - r);
  hole.absarc(0, height - thickness - r, r, Math.PI, 0, true);
  hole.lineTo(r, thickness);
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSegments: 3, steps: 1,
    bevelSize: 0.055, bevelThickness: 0.055, curveSegments: 40,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function makeLabelTexture(title, subtitle) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 300;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = 'center';
  context.shadowColor = 'rgba(19,6,25,.85)'; context.shadowBlur = 18;
  context.fillStyle = '#f7e8ed';
  context.font = '500 54px Georgia';
  const words = title.split(' ');
  words.forEach((word, index) => context.fillText(word, 256, 86 + index * 60));
  context.shadowBlur = 8; context.fillStyle = '#f2a4c4'; context.font = '18px sans-serif';
  context.fillText(subtitle.toUpperCase(), 256, 250);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function createPortalMaterial(top, bottom) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform vec3 uTop; uniform vec3 uBottom;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        float wave=sin(vUv.x*9.+uTime*.15)*.025;
        vec3 col=mix(uBottom,uTop,smoothstep(0.,1.,vUv.y+wave));
        float star=step(.994,hash(floor(vUv*90.)))*smoothstep(.35,.8,vUv.y);
        col+=star*vec3(1.,.65,.85)*.8;
        float glow=.08/(.12+abs(vUv.x-.5));
        col+=vec3(.32,.08,.19)*glow*.12;
        gl_FragColor=vec4(col,1.);
      }`,
    side: THREE.DoubleSide,
  });
}

function createFlowerGeometry() {
  const petals = [];
  for (let i = 0; i < 5; i++) {
    const petal = new THREE.CircleGeometry(0.12, 8);
    petal.scale(0.68, 1.25, 1);
    petal.translate(0, 0.105, 0);
    petal.rotateZ(i * TAU / 5);
    petals.push(petal);
  }
  const geometry = mergeGeometries(petals);
  petals.forEach((petal) => petal.dispose());
  return geometry;
}

function createBlossomTree(seed, materials) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  const branches = [];
  const blossoms = [];
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  function branch(start, direction, length, radius, depth) {
    const end = start.clone().addScaledVector(direction, length);
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    quaternion.setFromUnitVectors(up, direction.clone().normalize());
    matrix.compose(midpoint, quaternion, new THREE.Vector3(radius, length, radius));
    branches.push(matrix.clone());
    if (depth <= 0) {
      for (let i = 0; i < 8; i++) {
        const position = end.clone().add(new THREE.Vector3((rng()-.5)*.9, (rng()-.5)*.6, (rng()-.5)*.9));
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng()*TAU, rng()*TAU, rng()*TAU));
        const scale = .65 + rng() * .8;
        matrix.compose(position, q, new THREE.Vector3(scale, scale, scale));
        blossoms.push(matrix.clone());
      }
      return;
    }
    const children = depth === 3 ? 4 : 3;
    for (let i = 0; i < children; i++) {
      const angle = i * TAU / children + rng() * .65;
      const spread = .5 + rng() * .45;
      const next = direction.clone().multiplyScalar(.6).add(new THREE.Vector3(Math.cos(angle)*spread, .35+rng()*.4, Math.sin(angle)*spread)).normalize();
      branch(end, next, length * (.57 + rng()*.12), radius * .62, depth - 1);
    }
  }
  branch(new THREE.Vector3(), new THREE.Vector3(.08, 1, .03).normalize(), 3.2, .24, 3);
  const branchMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, .82, 1, 8), materials.bark, branches.length);
  branches.forEach((item, index) => branchMesh.setMatrixAt(index, item));
  branchMesh.castShadow = true; branchMesh.receiveShadow = true;
  group.add(branchMesh);
  const flowerMesh = new THREE.InstancedMesh(createFlowerGeometry(), materials.blossom, blossoms.length);
  blossoms.forEach((item, index) => {
    flowerMesh.setMatrixAt(index, item);
    flowerMesh.setColorAt(index, new THREE.Color().setHSL(.93 + rng()*.035, .63, .58 + rng()*.18));
  });
  group.add(flowerMesh);
  return group;
}

export function createWorld({ canvas, onPortal, onPrompt, onStats, onReady }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .82;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.fog);
  scene.fog = new THREE.Fog(palette.fog, 28, 68);
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 180);
  camera.position.copy(homePosition); camera.lookAt(homeTarget);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .55;
  pmrem.dispose();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .34, .55, .9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: palette.stone, roughness: .68, metalness: .12 }),
    stoneLight: new THREE.MeshStandardMaterial({ color: palette.stoneLight, roughness: .48, metalness: .18 }),
    gold: new THREE.MeshStandardMaterial({ color: palette.gold, roughness: .23, metalness: .82, emissive: 0x7a283e, emissiveIntensity: .2 }),
    glow: new THREE.MeshBasicMaterial({ color: palette.pink, toneMapped: false }),
    bark: new THREE.MeshStandardMaterial({ color: 0x291528, roughness: .88 }),
    blossom: new THREE.MeshStandardMaterial({ color: palette.blossom, roughness: .55, side: THREE.DoubleSide, emissive: 0x671535, emissiveIntensity: .35 }),
  };

  const hemi = new THREE.HemisphereLight(0xc59bdd, 0x2c132d, .95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffc0ae, 2.0);
  key.position.set(-8, 15, 10); key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  Object.assign(key.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 48 });
  key.shadow.normalBias = .035;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8c79d9, .65); fill.position.set(12, 7, 3); scene.add(fill);
  const bounce = new THREE.PointLight(0xe04f98, 12, 24, 2); bounce.position.set(0, 1, 7); scene.add(bounce);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vPos; void main(){float h=normalize(vPos).y*.5+.5;vec3 low=vec3(.24,.12,.30);vec3 high=vec3(.055,.025,.11);vec3 col=mix(low,high,smoothstep(.15,.85,h));float haze=pow(1.-abs(normalize(vPos).y),5.);col+=vec3(.18,.055,.13)*haze;gl_FragColor=vec4(col,1.);}`,
  }));
  scene.add(sky);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshPhysicalMaterial({
    color: 0x24142d, metalness: .38, roughness: .28, clearcoat: 1, clearcoatRoughness: .12,
  }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(60, 20, 1), materials.stone);
  backWall.position.set(1, 8, -7); backWall.receiveShadow = true; scene.add(backWall);
  const sideWall = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 28), materials.stone);
  sideWall.position.set(-12, 4.8, 3); sideWall.receiveShadow = true; scene.add(sideWall);

  const pool = new Reflector(new THREE.CircleGeometry(6.8, 72), { color: 0x6d3b65, textureWidth: 768, textureHeight: 768, clipBias: .003 });
  pool.rotation.x = -Math.PI / 2; pool.position.set(1.2, .035, 6.5); scene.add(pool);
  const poolRim = new THREE.Mesh(new THREE.TorusGeometry(6.85, .12, 10, 96), materials.gold);
  poolRim.rotation.x = Math.PI / 2; poolRim.position.copy(pool.position); poolRim.position.y = .04; scene.add(poolRim);

  function box(size, position, material = materials.stoneLight) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  for (let i = 0; i < 4; i++) box([11 - i * .65, .22, 1.15], [-.3, .11 + i * .2, -2.4 - i * .65]);
  for (let i = 0; i < 3; i++) box([12.5 - i * .5, .18, 1.0], [7.2, .09 + i * .17, -2.65 - i * .55]);

  const portalMaterials = [];
  const gateway = new THREE.Group(); gateway.position.set(-.4, .45, -4); scene.add(gateway);
  const gatewayMaterial = createPortalMaterial(0x2b1747, 0x9c5c9a);
  const portalDisk = new THREE.Mesh(new THREE.CircleGeometry(4.05, 96), gatewayMaterial);
  portalDisk.position.set(0, 4.55, .06); gateway.add(portalDisk); portalMaterials.push(gatewayMaterial);
  for (const [radius, tube, material, z] of [[4.25,.24,materials.stoneLight,0],[4.05,.075,materials.glow,.16],[4.48,.065,materials.gold,.1],[3.98,.035,materials.gold,.2]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 16, 128), material);
    ring.position.set(0, 4.55, z); ring.castShadow = material !== materials.glow; gateway.add(ring);
  }
  const gateLight = new THREE.PointLight(0xf275bd, 25, 15, 2); gateLight.position.set(-.4, 4.6, -2.5); scene.add(gateLight);

  function floatingIsland(x, y, scale) {
    const island = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(.9, 0, 1.5, 7, 3), materials.stoneLight);
    rock.position.y = -.72; island.add(rock);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.92, .88, .16, 12), new THREE.MeshStandardMaterial({ color: 0x765080, roughness: .8 }));
    island.add(top);
    for (let i = 0; i < 4; i++) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, .55 + i*.09, 6), materials.stoneLight);
      tower.position.set((i-1.5)*.22, .32, (i%2-.5)*.25); island.add(tower);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(.17, .25, 6), materials.gold);
      roof.position.copy(tower.position); roof.position.y += .42 + i*.045; island.add(roof);
    }
    island.position.set(x, y, .3); island.scale.setScalar(scale); gateway.add(island);
  }
  floatingIsland(-.5, 4.3, 1.25); floatingIsland(-2.8, 3.1, .48); floatingIsland(2.65, 5.4, .42);

  const interactiveMeshes = [];
  const portalFrames = new Map();
  // Portal shader uniforms share one clock across all three exhibition entrances.
  const textureLoader = new THREE.TextureLoader();
  const texturePromises = [];
  function loadTexture(path) {
    const promise = textureLoader.loadAsync(path).then((texture) => { texture.colorSpace = THREE.SRGBColorSpace; return texture; });
    texturePromises.push(promise); return promise;
  }
  const portalDefinitions = [
    { zone: 'visual', x: 4.8, title: 'VISUAL DESIGN', subtitle: 'Enter gallery', image: './assets/images/portfolio/nyc-2028.webp', colors: [0x3b1c43, 0x8e476e] },
    { zone: 'interactive', x: 8.25, title: 'INTERACTIVE DESIGN', subtitle: 'Enter gallery', image: './assets/images/portfolio/savesip-overview.webp', colors: [0x321c48, 0x9c4b79] },
    { zone: 'worlds', x: 11.7, title: 'DIGITAL WORLDS', subtitle: 'Enter gallery', image: null, colors: [0x402252, 0xbc73ae] },
  ];
  for (const definition of portalDefinitions) {
    const group = new THREE.Group(); group.position.set(definition.x, .42, -3.95); scene.add(group);
    const frameMaterial = materials.gold.clone(); frameMaterial.emissiveIntensity = .2;
    const frame = new THREE.Mesh(createArchFrameGeometry(2.85, 6.6, .24, .42), frameMaterial);
    frame.castShadow = true; frame.receiveShadow = true; group.add(frame);
    const innerMaterial = createPortalMaterial(...definition.colors);
    const inner = new THREE.Mesh(new THREE.ShapeGeometry(archShape(2.35, 6.28), 40), innerMaterial);
    inner.position.set(0, .15, -.18); group.add(inner); portalMaterials.push(innerMaterial);
    if (definition.image) {
      loadTexture(definition.image).then((texture) => {
        const art = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 2.55), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: .84 }));
        art.position.set(0, 3.7, .02); group.add(art);
      }).catch(() => {});
    } else {
      const miniature = new THREE.Mesh(new THREE.CylinderGeometry(.75, 0, 1.2, 7), materials.stoneLight);
      miniature.position.set(0, 3.3, .05); group.add(miniature);
      const moon = new THREE.Mesh(new THREE.SphereGeometry(.52, 20, 12), new THREE.MeshBasicMaterial({ color: 0xe8a0cf }));
      moon.position.set(.5, 4.65, -.05); group.add(moon);
    }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.35), new THREE.MeshBasicMaterial({ map: makeLabelTexture(definition.title, definition.subtitle), transparent: true, depthWrite: false }));
    label.visible = false;
    label.position.set(0, 1.55, .32); group.add(label);
    const hit = new THREE.Mesh(new THREE.ShapeGeometry(archShape(2.5, 6.3), 24), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    hit.position.set(0, .12, .42); hit.userData.zone = definition.zone; group.add(hit); interactiveMeshes.push(hit);
    portalFrames.set(definition.zone, frameMaterial);
    const light = new THREE.PointLight(0xf277ad, 10, 7, 2); light.position.set(definition.x, 3.5, -2.8); scene.add(light);
  }

  const artDefinitions = [
    [-9.4, 'poster-type'], [-6.5, 'photo-composites'], [1.2, 'brand-systems'], [12.5, 'culture-jamming'],
  ];
  for (const [x, name] of artDefinitions) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.35, 3.05, .16), materials.gold);
    frame.position.set(x, 3.45, -6.35); scene.add(frame);
    loadTexture(`./assets/images/portfolio/${name}.webp`).then((texture) => {
      const art = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 2.85), new THREE.MeshBasicMaterial({ map: texture }));
      art.position.set(x, 3.45, -6.24); scene.add(art);
    }).catch(() => {});
  }

  const treeLeft = createBlossomTree(71, materials); treeLeft.position.set(-8.4, 0, -1.8); treeLeft.scale.setScalar(1.3); scene.add(treeLeft);
  const treeRight = createBlossomTree(98, materials); treeRight.position.set(14.1, 0, -2); treeRight.scale.setScalar(1.18); scene.add(treeRight);
  const treeGroups = [treeLeft, treeRight];
  for (const x of [-9.2, 12.8]) box([3.2, .5, 2.5], [x, .25, -1.8], materials.stone);

  const lanternGlow = new THREE.MeshBasicMaterial({ color: 0xffb08f, toneMapped: false });
  function lantern(x, z, scale = 1) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale);
    const base = new THREE.Mesh(new THREE.BoxGeometry(.48, .12, .48), materials.gold); base.position.y = .06; group.add(base);
    const light = new THREE.Mesh(new THREE.BoxGeometry(.34, .62, .34), lanternGlow); light.position.y = .44; group.add(light);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(.42, .24, 4), materials.gold); roof.position.y = .88; roof.rotation.y = Math.PI/4; group.add(roof);
    scene.add(group);
  }
  [[-7,2.2],[-5,-2],[1,-1.6],[3,-1.4],[11.8,-1.2],[8,3.4]].forEach(([x,z], index) => lantern(x,z,index%2 ? .8 : 1));
  for (const [radius, y, z] of [[9,11.2,-1],[7.2,10.8,-2.2]]) {
    const ceiling = new THREE.Mesh(new THREE.TorusGeometry(radius, .055, 8, 96), materials.gold);
    ceiling.rotation.x = Math.PI/2; ceiling.rotation.z = 0; ceiling.position.set(1,y,z); scene.add(ceiling);
  }

  const maxPetals = qualityPresets.high.petals;
  const petalBase = new Float32Array(maxPetals * 3);
  const petalPositions = new Float32Array(maxPetals * 3);
  for (let i = 0; i < maxPetals; i++) {
    petalBase[i*3] = range(-11, 14); petalBase[i*3+1] = range(0, 10); petalBase[i*3+2] = range(-5, 13);
  }
  const petalGeometry = new THREE.BufferGeometry();
  petalGeometry.setAttribute('position', new THREE.BufferAttribute(petalPositions, 3));
  const petals = new THREE.Points(petalGeometry, new THREE.PointsMaterial({ color: 0xff9ac7, size: .075, transparent: true, opacity: .82, depthWrite: false }));
  scene.add(petals);

  let quality = 'high';
  let reducedMotion = false;
  let immersive = false;
  let elapsed = 0;
  let lastFrame = performance.now();
  let accumulator = 0;
  let frameHandle = 0;
  let transition = null;
  let activeZone = null;
  let currentTarget = homeTarget.clone();
  let yaw = 0, pitch = 0;
  let frameEma = 16.7, statsTimer = 0, adaptiveScale = 1;
  const velocity = new THREE.Vector3();
  const keys = new Set();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);
  const centerPointer = new THREE.Vector2(0, 0);
  const tempDirection = new THREE.Vector3();
  const tempRight = new THREE.Vector3();
  const tempTarget = new THREE.Vector3();
  const captureParams = new URLSearchParams(window.location.search);
  const captureMode = captureParams.has('t');
  if (captureMode) elapsed = Number(captureParams.get('t')) || 0;

  function updatePetals(time) {
    const count = qualityPresets[quality].petals;
    for (let i = 0; i < count; i++) {
      const phase = i * .73;
      petalPositions[i*3] = petalBase[i*3] + Math.sin(time*.35 + phase) * .65;
      petalPositions[i*3+1] = ((petalBase[i*3+1] - time*.3) % 10 + 10) % 10;
      petalPositions[i*3+2] = petalBase[i*3+2] + Math.cos(time*.25 + phase) * .4;
    }
    petalGeometry.attributes.position.needsUpdate = true;
    petalGeometry.setDrawRange(0, count);
  }

  function updateHighlight(zone) {
    if (activeZone === zone) return;
    activeZone = zone;
    for (const [id, material] of portalFrames) {
      material.emissive.setHex(id === zone ? 0xe85b9b : 0x7a283e);
      material.emissiveIntensity = id === zone ? 1.25 : .2;
    }
    onPrompt?.(zone ? `E / click · Enter ${zone === 'interactive' ? 'Interactive Design' : zone === 'visual' ? 'Visual Design' : 'Digital Worlds'}` : 'Move toward an exhibition portal');
    canvas.style.cursor = zone && !immersive ? 'pointer' : 'default';
  }

  function raycast(isCenter = false) {
    raycaster.setFromCamera(isCenter ? centerPointer : pointer, camera);
    raycaster.far = immersive ? 16 : 60;
    const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
    updateHighlight(hit?.object.userData.zone ?? null);
  }

  function setQuality(next) {
    if (!qualityPresets[next]) return;
    quality = next;
    const preset = qualityPresets[quality];
    const ratio = Math.min(window.devicePixelRatio || 1, preset.dpr) * adaptiveScale;
    renderer.setPixelRatio(ratio); composer.setPixelRatio(ratio);
    renderer.shadowMap.enabled = preset.shadows;
    bloom.enabled = preset.bloom;
    bloom.strength = quality === 'balanced' ? .24 : .34;
    pool.visible = preset.reflector;
    petalGeometry.setDrawRange(0, preset.petals);
    resize(); renderFrame();
  }

  function transitionTo(position, target, duration = 1200) {
    if (reducedMotion || captureMode) {
      camera.position.copy(position); currentTarget.copy(target); camera.lookAt(target); renderFrame(); return;
    }
    transition = { from: camera.position.clone(), to: position.clone(), targetFrom: currentTarget.clone(), targetTo: target.clone(), start: performance.now(), duration };
  }

  function enter() {
    immersive = true; transition = null; keys.clear(); velocity.set(0,0,0);
    camera.position.set(1.2, 2.2, 12); yaw = 0; pitch = 0;
    camera.lookAt(1.2, 2.2, 0); currentTarget.set(1.2,2.2,0);
    if (matchMedia('(pointer:fine)').matches) canvas.requestPointerLock?.();
    canvas.focus({ preventScroll: true });
  }
  function exit() {
    immersive = false; keys.clear(); velocity.set(0,0,0);
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    updateHighlight(null); transitionTo(homePosition, homeTarget, 1000);
  }
  function goHome() { immersive = false; transitionTo(homePosition, homeTarget); }
  function showZone(zone) { if (zoneViews[zone]) transitionTo(zoneViews[zone].position, zoneViews[zone].target); }

  function onPointerMove(event) {
    if (immersive && document.pointerLockElement === canvas) {
      yaw += event.movementX * .0018; pitch = THREE.MathUtils.clamp(pitch - event.movementY * .0016, -.8, .75);
      return;
    }
    if (immersive && event.pointerType === 'touch' && event.buttons) {
      yaw += event.movementX * .004; pitch = THREE.MathUtils.clamp(pitch - event.movementY * .003, -.8, .75);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    if (!immersive) raycast(false);
  }
  function onClick(event) {
    if (immersive && document.pointerLockElement !== canvas) {
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycast(false);
    }
    if (activeZone) onPortal?.(activeZone);
  }
  function onKeyDown(event) {
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code) && immersive) {
      keys.add(event.code); event.preventDefault();
    }
    if (event.code === 'KeyE' && immersive && activeZone) onPortal?.(activeZone);
  }
  function onKeyUp(event) { keys.delete(event.code); }
  function onPointerLock() { if (immersive) onPrompt?.(document.pointerLockElement === canvas ? 'WASD to move · aim at a portal · E to interact' : 'Click the scene to resume mouse look'); }
  function onCanvasClick() { if (immersive && !document.pointerLockElement && matchMedia('(pointer:fine)').matches) canvas.requestPointerLock?.(); }
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('click', onCanvasClick);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('pointerlockchange', onPointerLock);

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.aspect = width / height; camera.fov = camera.aspect < .75 ? 52 : 45; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); composer.setSize(width, height);
  }
  window.addEventListener('resize', resize);
  resize();

  function updateMovement(dt) {
    if (!immersive) return;
    const forwardAmount = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const sideAmount = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    tempDirection.set(Math.sin(yaw), 0, -Math.cos(yaw));
    tempRight.set(Math.cos(yaw), 0, Math.sin(yaw));
    tempTarget.copy(tempDirection).multiplyScalar(forwardAmount).addScaledVector(tempRight, sideAmount);
    if (tempTarget.lengthSq() > 1) tempTarget.normalize();
    tempTarget.multiplyScalar(4.1);
    velocity.lerp(tempTarget, 1 - Math.exp(-dt * 8));
    camera.position.addScaledVector(velocity, dt);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -10.5, 13);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, .2, 15);
    camera.position.y = 2.2;
  }

  function renderFrame() {
    renderer.info.reset();
    portalMaterials.forEach((material) => { material.uniforms.uTime.value = reducedMotion ? 0 : elapsed; });
    updatePetals(reducedMotion ? 0 : elapsed);
    if (!immersive) camera.lookAt(currentTarget);
    if (qualityPresets[quality].bloom) composer.render(); else renderer.render(scene, camera);
  }

  function frame(now) {
    if (document.hidden) { lastFrame = now; frameHandle = requestAnimationFrame(frame); return; }
    const deltaMs = Math.min(50, now - lastFrame); lastFrame = now;
    frameEma = frameEma * .97 + deltaMs * .03;
    if (!reducedMotion) elapsed += deltaMs / 1000;
    accumulator += deltaMs / 1000;
    while (accumulator >= 1/60) { updateMovement(1/60); accumulator -= 1/60; }
    if (transition) {
      const progress = Math.min(1, (now - transition.start) / transition.duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(transition.from, transition.to, eased);
      currentTarget.lerpVectors(transition.targetFrom, transition.targetTo, eased);
      if (progress >= 1) transition = null;
    }
    if (immersive) {
      tempDirection.set(Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch));
      currentTarget.copy(camera.position).add(tempDirection); camera.lookAt(currentTarget); raycast(true);
    }
    renderFrame();
    statsTimer += deltaMs;
    if (statsTimer > 1000) {
      const stats = { fps: Math.round(1000/frameEma), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, quality, camera: camera.position.toArray().map((value) => Number(value.toFixed(3))), activeZone, yaw: Number(yaw.toFixed(3)), pitch: Number(pitch.toFixed(3)), petals: petalGeometry.drawRange.count, shadows: renderer.shadowMap.enabled, bloom: bloom.enabled, reflections: pool.visible, pixelRatio: Number(renderer.getPixelRatio().toFixed(2)) };
      window.__WORLD_STATS__ = stats; onStats?.(stats); statsTimer = 0;
      if (frameEma > 36 && adaptiveScale === 1) { adaptiveScale = .85; setQuality(quality); }
    }
    frameHandle = requestAnimationFrame(frame);
  }

  window.__seek = (time) => {
    elapsed = ((Number(time) % DURATION) + DURATION) % DURATION;
    camera.position.copy(homePosition); currentTarget.copy(homeTarget); camera.lookAt(homeTarget);
    updatePetals(elapsed); renderFrame();
  };

  const assetReady = createAsset(THREE, { states: 'lazy', sharedResources: true }).then((root) => {
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 7.8 / size.y;
    [-5.5, 3.1, 13.25].forEach((x, index) => {
      const placement = new THREE.Group();
      placement.add(index === 0 ? root : root.clone(true));
      placement.scale.setScalar(scale); placement.position.set(x, .42, -5.55);
      scene.add(placement);
    });
  }).catch(() => {});

  Promise.allSettled([assetReady, ...texturePromises]).then(() => {
    resize(); updatePetals(elapsed); renderFrame();
    document.body.classList.add('scene-ready');
    window.__SCENE_READY__ = true;
    if (!captureMode && !reducedMotion) {
      camera.position.copy(homePosition).add(new THREE.Vector3(0, .6, 4));
      transitionTo(homePosition, homeTarget, 1600);
    }
    onReady?.();
    if (!captureMode) frameHandle = requestAnimationFrame(frame);
  });

  return {
    setQuality, enter, exit, goHome, showZone,
    setReducedMotion(value) { reducedMotion = value; if (value) transition = null; },
    renderAt(time) { window.__seek(time); },
    dispose() {
      cancelAnimationFrame(frameHandle); window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointermove', onPointerMove); canvas.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onPointerLock);
      scene.traverse((object) => { object.geometry?.dispose(); });
      environment.dispose(); composer.dispose(); renderer.dispose();
    },
  };
}
