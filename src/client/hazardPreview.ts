import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import "./hazardPreview.css";

type HazardMode = "volcano" | "whirlpool";

const WHIRLPOOL_DURATION = 3.8;
const VOLCANO_DURATION = 4.6;
const ASSET_BASE = "/assets/models-preview";

document.querySelector<HTMLDivElement>("#hazard-preview-root")!.innerHTML = `
  <main class="hazard-shell">
    <canvas id="hazard-canvas"></canvas>
    <header class="topbar">
      <div class="title-block">
        <span class="eyebrow">HAZARD EFFECT REVIEW</span>
        <h1>火山与漩涡效果预览</h1>
      </div>
      <div class="toolbar">
        <div class="mode-switch" role="tablist" aria-label="选择灾害效果">
          <button id="show-volcano" class="active" type="button" role="tab" aria-selected="true">火山</button>
          <button id="show-whirlpool" type="button" role="tab" aria-selected="false">漩涡</button>
        </div>
        <button id="replay" class="icon-button" type="button" title="重新播放" aria-label="重新播放">↻</button>
      </div>
    </header>
    <aside class="info-panel">
      <div class="info-heading">
        <strong id="hazard-name">火山爆发</strong>
        <span id="hazard-status" class="status-badge hyper">游戏试用 Hyper3D 轻量版</span>
      </div>
      <p id="hazard-description" class="description">播放模型内置熔岩脉动，并叠加喷发、火星和熔岩光照。</p>
      <dl class="metrics">
        <div><dt>FPS</dt><dd id="fps">-</dd></div>
        <div><dt>三角面</dt><dd id="triangles">-</dd></div>
        <div><dt>动画进度</dt><dd id="progress">-</dd></div>
      </dl>
    </aside>
    <div id="loading" class="loading">正在加载灾害模型</div>
  </main>
`;

const shell = document.querySelector<HTMLElement>(".hazard-shell")!;
const canvas = document.querySelector<HTMLCanvasElement>("#hazard-canvas")!;
const loading = document.querySelector<HTMLElement>("#loading")!;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#07191d");
scene.fog = new THREE.FogExp2("#07191d", 0.035);

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80);
camera.position.set(4.7, 3.4, 5.8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3.3;
controls.maxDistance = 10;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0.9, 0);

scene.add(new THREE.HemisphereLight("#cceee8", "#07100f", 2));
const keyLight = new THREE.DirectionalLight("#fff0d1", 4.5);
keyLight.position.set(4, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1536, 1536);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight("#48aeb6", 2.4);
fillLight.position.set(-5, 3, -4);
scene.add(fillLight);

const water = new THREE.Mesh(
  new THREE.CircleGeometry(11, 96),
  new THREE.MeshPhysicalMaterial({
    color: "#0c4a55",
    roughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.5,
    clearcoatRoughness: 0.22
  })
);
water.rotation.x = -Math.PI / 2;
water.position.y = -0.52;
water.receiveShadow = true;
scene.add(water);

const island = new THREE.Mesh(
  new THREE.CylinderGeometry(2.15, 2.45, 0.36, 64),
  new THREE.MeshStandardMaterial({ color: "#3b342b", roughness: 0.95 })
);
island.position.y = -0.35;
island.receiveShadow = true;
scene.add(island);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
const clock = new THREE.Clock();

const volcanoRoot = new THREE.Group();
const whirlpoolRoot = new THREE.Group();
const whirlpoolSpin = new THREE.Group();
whirlpoolRoot.add(whirlpoolSpin);
scene.add(volcanoRoot, whirlpoolRoot);

const lavaLight = new THREE.PointLight("#ff5a19", 0, 7, 2);
lavaLight.position.set(0, 1.5, 0);
volcanoRoot.add(lavaLight);

const particleCount = 180;
const particlePositions = new Float32Array(particleCount * 3);
const particleVelocities: THREE.Vector3[] = [];
const particleSeeds: number[] = [];
for (let index = 0; index < particleCount; index += 1) {
  particleVelocities.push(new THREE.Vector3());
  particleSeeds.push(index / particleCount);
}
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
const eruptionParticles = new THREE.Points(
  particleGeometry,
  new THREE.PointsMaterial({
    color: "#ff8a2a",
    size: 0.055,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
volcanoRoot.add(eruptionParticles);

const ringMaterials: THREE.MeshBasicMaterial[] = [];
for (const [index, radius] of [0.72, 0.96, 1.2].entries()) {
  const material = new THREE.MeshBasicMaterial({
    color: index === 0 ? "#e9ffff" : "#75deda",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.07, 64), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.16 + index * 0.018;
  whirlpoolRoot.add(ring);
  ringMaterials.push(material);
}

let mode: HazardMode = "volcano";
let volcanoMixer: THREE.AnimationMixer | null = null;
let volcanoModel: THREE.Object3D | null = null;
let whirlpoolModel: THREE.Object3D | null = null;
let whirlpoolMaterials: THREE.Material[] = [];
let elapsed = 0;
let fpsFrames = 0;
let fpsElapsed = 0;

function fitModel(root: THREE.Object3D, targetSize: number) {
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.z);
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
}

function countTriangles(root: THREE.Object3D) {
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : object.geometry.attributes.position.count / 3;
  });
  return Math.round(triangles);
}

function prepareVolcano(gltf: GLTF) {
  volcanoModel = gltf.scene;
  volcanoModel.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  fitModel(volcanoModel, 3.5);
  volcanoRoot.add(volcanoModel);
  if (gltf.animations.length) {
    volcanoMixer = new THREE.AnimationMixer(volcanoModel);
    gltf.animations.forEach((clip) => volcanoMixer!.clipAction(clip).play());
  }
}

function prepareWhirlpool(gltf: GLTF) {
  whirlpoolModel = gltf.scene;
  whirlpoolModel.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const prepareMaterial = (source: THREE.Material) => {
      const material = source.clone();
      material.transparent = true;
      whirlpoolMaterials.push(material);
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(prepareMaterial)
      : prepareMaterial(object.material);
    object.castShadow = false;
    object.receiveShadow = true;
  });
  fitModel(whirlpoolModel, 3.4);
  whirlpoolSpin.add(whirlpoolModel);
}

function resetParticles() {
  for (let index = 0; index < particleCount; index += 1) {
    const angle = particleSeeds[index] * Math.PI * 24.7;
    const radius = 0.05 + (index % 11) * 0.012;
    particlePositions[index * 3] = Math.cos(angle) * radius;
    particlePositions[index * 3 + 1] = 1.78 + (index % 9) * 0.008;
    particlePositions[index * 3 + 2] = Math.sin(angle) * radius;
    particleVelocities[index].set(
      Math.cos(angle) * (0.24 + (index % 7) * 0.035),
      1.45 + (index % 13) * 0.075,
      Math.sin(angle) * (0.24 + (index % 5) * 0.045)
    );
  }
  particleGeometry.attributes.position.needsUpdate = true;
}

function replay() {
  elapsed = 0;
  if (mode === "volcano") {
    volcanoMixer?.setTime(0);
    resetParticles();
  } else {
    whirlpoolRoot.scale.setScalar(0.01);
    whirlpoolRoot.position.y = -0.5;
    whirlpoolMaterials.forEach((material) => {
      material.opacity = 1;
    });
  }
}

function updateInfo() {
  const isVolcano = mode === "volcano";
  document.querySelector("#hazard-name")!.textContent = isVolcano ? "火山爆发" : "漩涡吞噬";
  const status = document.querySelector<HTMLElement>("#hazard-status")!;
  status.textContent = isVolcano ? "游戏试用 Hyper3D 轻量版" : "游戏现用 Hyper3D 特效";
  status.classList.toggle("hyper", true);
  document.querySelector("#hazard-description")!.textContent = isVolcano
    ? "播放模型内置熔岩脉动，并叠加喷发、火星和熔岩光照。"
    : "完整播放生成、加速旋转、下沉收束和消失，时长 3.8 秒。";
  const root = isVolcano ? volcanoRoot : whirlpoolSpin;
  document.querySelector("#triangles")!.textContent = countTriangles(root).toLocaleString();
}

function setMode(nextMode: HazardMode) {
  mode = nextMode;
  volcanoRoot.visible = mode === "volcano";
  whirlpoolRoot.visible = mode === "whirlpool";
  island.visible = mode === "volcano";
  document.querySelector("#show-volcano")!.classList.toggle("active", mode === "volcano");
  document.querySelector("#show-whirlpool")!.classList.toggle("active", mode === "whirlpool");
  document.querySelector("#show-volcano")!.setAttribute("aria-selected", String(mode === "volcano"));
  document.querySelector("#show-whirlpool")!.setAttribute("aria-selected", String(mode === "whirlpool"));

  if (mode === "volcano") {
    controls.target.set(0, 1.05, 0);
    camera.position.set(4.6, 3.1, 5.4);
  } else {
    controls.target.set(0, 0.15, 0);
    camera.position.set(4.4, 3.9, 4.8);
  }
  controls.update();
  updateInfo();
  replay();
}

function updateVolcano(delta: number) {
  const progress = (elapsed % VOLCANO_DURATION) / VOLCANO_DURATION;
  const burst = Math.max(0, Math.sin(Math.min(1, progress / 0.68) * Math.PI));
  volcanoMixer?.update(delta);
  lavaLight.intensity = 7 + burst * 20 + Math.sin(elapsed * 9) * 2;
  (eruptionParticles.material as THREE.PointsMaterial).opacity = Math.min(1, burst * 1.7);

  for (let index = 0; index < particleCount; index += 1) {
    const offset = index * 3;
    particlePositions[offset] += particleVelocities[index].x * delta;
    particlePositions[offset + 1] += particleVelocities[index].y * delta;
    particlePositions[offset + 2] += particleVelocities[index].z * delta;
    particleVelocities[index].y -= 2.25 * delta;
    if (particlePositions[offset + 1] < 0.12 || progress < 0.025) {
      const angle = particleSeeds[index] * Math.PI * 24.7;
      particlePositions[offset] = Math.cos(angle) * 0.08;
      particlePositions[offset + 1] = 1.78;
      particlePositions[offset + 2] = Math.sin(angle) * 0.08;
      particleVelocities[index].set(
        Math.cos(angle) * (0.2 + (index % 7) * 0.04),
        1.5 + (index % 13) * 0.075,
        Math.sin(angle) * (0.2 + (index % 5) * 0.05)
      );
    }
  }
  particleGeometry.attributes.position.needsUpdate = true;
  document.querySelector("#progress")!.textContent = `${Math.round(progress * 100)}%`;
}

function updateWhirlpool(delta: number) {
  const progress = Math.min(1, elapsed / WHIRLPOOL_DURATION);
  const enter = Math.min(1, progress / 0.2);
  const exit = Math.max(0, Math.min(1, (progress - 0.72) / 0.28));
  const enterEase = enter * enter * (3 - 2 * enter);
  const exitEase = exit * exit;
  const scale = Math.max(0.01, enterEase * (1 - exitEase));

  whirlpoolRoot.scale.setScalar(scale);
  whirlpoolRoot.position.y = -0.5 - exitEase * 0.5;
  whirlpoolSpin.rotation.y += delta * (2.2 + progress * 5.5);
  whirlpoolMaterials.forEach((material) => {
    material.opacity = Math.max(0, 1 - exitEase);
  });
  ringMaterials.forEach((material, index) => {
    material.opacity = Math.max(0, (0.72 - index * 0.16) * enterEase * (1 - exitEase));
  });
  document.querySelector("#progress")!.textContent = progress >= 1
    ? "已消失"
    : `${Math.round(progress * 100)}%`;
}

document.querySelector("#show-volcano")!.addEventListener("click", () => setMode("volcano"));
document.querySelector("#show-whirlpool")!.addEventListener("click", () => setMode("whirlpool"));
document.querySelector("#replay")!.addEventListener("click", replay);

function resize() {
  const width = shell.clientWidth;
  const height = shell.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(shell);
resize();

function frame() {
  requestAnimationFrame(frame);
  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;
  fpsFrames += 1;
  fpsElapsed += delta;
  if (fpsElapsed >= 0.5) {
    document.querySelector("#fps")!.textContent = String(Math.round(fpsFrames / fpsElapsed));
    fpsFrames = 0;
    fpsElapsed = 0;
  }

  if (mode === "volcano") updateVolcano(delta);
  else updateWhirlpool(delta);
  controls.update();
  renderer.render(scene, camera);
}

async function initialize() {
  try {
    const [volcanoGltf, whirlpoolGltf] = await Promise.all([
      loader.loadAsync(`${ASSET_BASE}/volcano-hyper3d.glb`),
      loader.loadAsync(`${ASSET_BASE}/whirlpool-hyper3d.glb`)
    ]);
    prepareVolcano(volcanoGltf);
    prepareWhirlpool(whirlpoolGltf);
    setMode("volcano");
    loading.classList.add("hidden");
  } catch (error) {
    console.error("Failed to load hazard preview", error);
    loading.textContent = "灾害模型加载失败";
  }
}

frame();
void initialize();
