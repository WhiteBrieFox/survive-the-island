import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import "./modelPreview.css";

type Asset = {
  file: string;
  label: string;
  note: string;
};

const assets: Asset[] = [
  { file: "explorer.glb", label: "探险者", note: "衣帽使用 PlayerColor 独立材质，可在游戏中替换玩家色。" },
  { file: "shark.glb", label: "鲨鱼", note: "完整体积模型，包含循环摆尾动画。" },
  { file: "tree-palm.glb", label: "椰子棕榈", note: "曲线树干、厚叶片和独立椰果，适合实例化。" },
  { file: "tree-coastal.glb", label: "海岸阔叶树", note: "宽树冠与外露根系，适合海滩和森林边缘。" },
  { file: "tree-jungle.glb", label: "丛林树", note: "紧凑树冠，适合高密度森林格。" },
  { file: "kaiju.glb", label: "巨兽", note: "原创两栖岛屿巨兽，强调厚重、推撞与棋盘可读性，不复刻现有影视角色。" },
  { file: "fire-dragon.glb", label: "终点火龙", note: "原创火山火龙守卫，用作救援终点附近的场景资产。" },
  { file: "sea-serpent.glb", label: "海蛇", note: "红色热带海蛇，带波浪式游动动画和高辨识度背鳍。" },
  { file: "raft.glb", label: "木筏", note: "加宽七木结构，内置三个独立乘员锚点；彩色小人仅用于验证容量。" },
  { file: "volcano.glb", label: "火山", note: "带熔岩河、火山岩与呼吸式熔岩脉动，可替换当前火山占位。" },
  { file: "rescue-dock.glb", label: "救援码头", note: "完整救援小岛、靠泊码头、信标与旗帜，预留木筏靠泊方向。" },
  { file: "whirlpool.glb", label: "漩涡", note: "多层泡沫环与漏斗水体，包含循环旋转动画。" },
  { file: "coral-reef.glb", label: "珊瑚礁", note: "三色珊瑚、海草与沙质基座，适合海域重复实例化。" },
  { file: "floating-debris.glb", label: "漂浮残骸", note: "断木、木板、绳圈和木桶组合，包含轻微漂移动画。" },
  { file: "terrain-beach.glb", label: "海滩套件", note: "升级版：漂木纹理、枝杈、贝壳、海星、珊瑚、卵石、海玻璃与滨海草，前中部保留自然站位。" },
  { file: "terrain-forest.glb", label: "森林套件", note: "升级版：外露根系、树皮层次、分层树冠、蕨类、藤蔓、蘑菇、花朵与苔石，前中部保持通透。" },
  { file: "terrain-mountain.glb", label: "山地套件", note: "升级版：多层岩壁、不规则积雪、侧脊、碎石坡、晶簇与高山植物，兼顾细节和单位可读性。" }
];

document.querySelector<HTMLDivElement>("#preview-root")!.innerHTML = `
  <main class="preview-shell">
    <header class="preview-header">
      <div>
        <span class="eyebrow">GLB ASSET REVIEW</span>
        <h1>沉岛远征 · 3D 模型预览</h1>
      </div>
      <div class="header-actions">
        <button id="toggle-animation" type="button" title="暂停或播放模型动画">暂停动画</button>
        <button id="toggle-background" type="button" title="切换明暗背景">切换背景</button>
      </div>
    </header>
    <nav class="asset-tabs" aria-label="模型列表">
      ${assets.map((asset, index) => `<button type="button" data-index="${index}" class="${index === 0 ? "active" : ""}">${asset.label}</button>`).join("")}
    </nav>
    <section class="viewer">
      <canvas id="model-canvas"></canvas>
      <aside class="asset-info">
        <strong id="asset-name"></strong>
        <span id="asset-note"></span>
        <dl>
          <div><dt>三角面</dt><dd id="triangle-count">-</dd></div>
          <div><dt>网格</dt><dd id="mesh-count">-</dd></div>
          <div><dt>材质</dt><dd id="material-count">-</dd></div>
          <div><dt>动画</dt><dd id="animation-count">-</dd></div>
          <div><dt>文件</dt><dd id="file-size">-</dd></div>
        </dl>
      </aside>
      <div class="loading" id="loading">正在加载模型</div>
    </section>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#model-canvas")!;
const viewer = document.querySelector<HTMLElement>(".viewer")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#dce8e1");
scene.fog = new THREE.Fog("#dce8e1", 10, 18);
const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 60);
camera.position.set(3.8, 2.7, 4.8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1.05, 0);
controls.minDistance = 2.2;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.52;

scene.add(new THREE.HemisphereLight("#fff8da", "#44756b", 2.2));
const key = new THREE.DirectionalLight("#fff2cf", 5.2);
key.position.set(4, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);
const rim = new THREE.DirectionalLight("#65d7cf", 3.2);
rim.position.set(-4, 3, -5);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(4.2, 64),
  new THREE.MeshStandardMaterial({ color: "#b8cfc3", roughness: 0.92 })
);
ground.name = "PreviewGround";
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();
const clock = new THREE.Clock();
let model: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;
let animationPlaying = true;
let darkBackground = false;

function addRaftOccupantPreview(root: THREE.Object3D) {
  const colors = ["#ef6a54", "#f0c34f", "#4f78c7"];
  for (let index = 0; index < 3; index += 1) {
    const anchor = root.getObjectByName(`Seat_${index + 1}`);
    if (!anchor) continue;
    const occupant = new THREE.Group();
    occupant.name = `PreviewOccupant_${index + 1}`;
    occupant.userData.previewOnly = true;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.2, 4, 8),
      new THREE.MeshStandardMaterial({ color: colors[index], roughness: 0.62 })
    );
    body.position.y = 0.2;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 8),
      new THREE.MeshStandardMaterial({ color: "#dda06f", roughness: 0.75 })
    );
    head.position.y = 0.42;
    head.castShadow = true;
    occupant.add(body, head);
    anchor.add(occupant);
  }
}

function updateStats(root: THREE.Object3D, animations: THREE.AnimationClip[], fileSize: number) {
  let triangles = 0;
  let meshes = 0;
  const materialSet = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.parent?.userData.previewOnly) return;
    meshes += 1;
    const geometry = object.geometry;
    triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    const values = Array.isArray(object.material) ? object.material : [object.material];
    values.forEach((value) => materialSet.add(value));
  });
  document.querySelector("#triangle-count")!.textContent = Math.round(triangles).toLocaleString();
  document.querySelector("#mesh-count")!.textContent = String(meshes);
  document.querySelector("#material-count")!.textContent = String(materialSet.size);
  document.querySelector("#animation-count")!.textContent = String(animations.length);
  document.querySelector("#file-size")!.textContent = `${(fileSize / 1024).toFixed(0)} KB`;
}

async function loadAsset(index: number) {
  const asset = assets[index];
  document.querySelectorAll<HTMLButtonElement>(".asset-tabs button").forEach((button, buttonIndex) => {
    button.classList.toggle("active", buttonIndex === index);
  });
  document.querySelector("#asset-name")!.textContent = asset.label;
  document.querySelector("#asset-note")!.textContent = asset.note;
  document.querySelector("#loading")!.classList.remove("hidden");
  if (model) scene.remove(model);
  mixer = null;

  const url = `/assets/models-preview/${asset.file}`;
  const [gltf, response] = await Promise.all([
    loader.loadAsync(url),
    fetch(url)
  ]);
  model = gltf.scene;
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const horizontalAssets = new Set([
    "shark.glb",
    "sea-serpent.glb",
    "raft.glb",
    "whirlpool.glb",
    "coral-reef.glb",
    "floating-debris.glb",
    "terrain-beach.glb"
  ]);
  const flatAssets = new Set([
    "whirlpool.glb",
    "coral-reef.glb",
    "floating-debris.glb",
    "terrain-beach.glb"
  ]);
  const targetSizes: Record<string, number> = {
    "shark.glb": 2.8,
    "sea-serpent.glb": 2.8,
    "raft.glb": 2.35,
    "fire-dragon.glb": 2.5,
    "kaiju.glb": 2.75,
    "volcano.glb": 1.85,
    "rescue-dock.glb": 2.5,
    "whirlpool.glb": 2.5,
    "coral-reef.glb": 2.35,
    "floating-debris.glb": 2.25,
    "terrain-beach.glb": 2.35,
    "terrain-forest.glb": 2.15,
    "terrain-mountain.glb": 2.25
  };
  const targetSize = asset.file.includes("tree") ? 2.8 : targetSizes[asset.file] ?? 2.65;
  const sourceSize = horizontalAssets.has(asset.file) ? Math.max(size.x, size.z) : size.y;
  const scale = targetSize / sourceSize;
  const displayHeight = size.y * scale;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  if (asset.file === "raft.glb") addRaftOccupantPreview(model);
  scene.add(model);

  const targetY = Math.max(displayHeight * 0.45, 0.5);
  const terrainAssets = new Set([
    "terrain-beach.glb",
    "terrain-forest.glb",
    "terrain-mountain.glb"
  ]);
  const isTerrain = terrainAssets.has(asset.file);
  controls.target.set(0, isTerrain ? Math.max(displayHeight * 0.28, 0.35) : targetY, 0);
  const displayWidth = (flatAssets.has(asset.file)
    ? Math.hypot(size.x, size.z)
    : Math.max(size.x, size.z)) * scale;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const fitHeightDistance = displayHeight / (2 * Math.tan(verticalFov / 2));
  const fitWidthDistance = displayWidth / (2 * Math.tan(horizontalFov / 2));
  const isMobile = window.innerWidth <= 680;
  const fittedDistance = Math.max(fitHeightDistance, fitWidthDistance) * (isMobile ? 1.48 : 1.28);
  const minimumDistance = flatAssets.has(asset.file)
    ? (isMobile ? 5.6 : 4.45)
    : horizontalAssets.has(asset.file)
      ? (isMobile ? 4.8 : 4.1)
      : (isMobile ? 4.6 : 3.8);
  const distance = Math.max(fittedDistance, minimumDistance) * (isTerrain ? 1.16 : 1);
  const direction = isTerrain
    ? new THREE.Vector3(0.48, 0.82, 0.68).normalize()
    : new THREE.Vector3(0.56, 0.34, 0.76).normalize();
  camera.position.copy(controls.target).add(direction.multiplyScalar(distance));
  controls.update();

  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((clip) => mixer!.clipAction(clip).play());
    mixer.timeScale = animationPlaying ? 1 : 0;
  }
  updateStats(model, gltf.animations, Number(response.headers.get("content-length") ?? (await response.blob()).size));
  document.querySelector("#loading")!.classList.add("hidden");
}

document.querySelectorAll<HTMLButtonElement>(".asset-tabs button").forEach((button) => {
  button.addEventListener("click", () => void loadAsset(Number(button.dataset.index)));
});
document.querySelector<HTMLButtonElement>("#toggle-animation")!.addEventListener("click", (event) => {
  animationPlaying = !animationPlaying;
  if (mixer) mixer.timeScale = animationPlaying ? 1 : 0;
  (event.currentTarget as HTMLButtonElement).textContent = animationPlaying ? "暂停动画" : "播放动画";
});
document.querySelector<HTMLButtonElement>("#toggle-background")!.addEventListener("click", () => {
  darkBackground = !darkBackground;
  const color = darkBackground ? "#102d31" : "#dce8e1";
  scene.background = new THREE.Color(color);
  scene.fog = new THREE.Fog(color, 10, 18);
  ground.material = new THREE.MeshStandardMaterial({
    color: darkBackground ? "#17464a" : "#b8cfc3",
    roughness: 0.92
  });
});

function resize() {
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewer);
resize();

function frame() {
  requestAnimationFrame(frame);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  controls.update();
  renderer.render(scene, camera);
}
frame();
void loadAsset(0);
