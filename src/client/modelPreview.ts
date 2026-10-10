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
  { file: "tree-jungle.glb", label: "丛林树", note: "紧凑树冠，适合高密度森林格。" }
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

function updateStats(root: THREE.Object3D, animations: THREE.AnimationClip[], fileSize: number) {
  let triangles = 0;
  let meshes = 0;
  const materialSet = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
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
  const targetHeight = asset.file.includes("tree") ? 2.8 : asset.file === "shark.glb" ? 1.55 : 2.65;
  const scale = targetHeight / size.y;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  scene.add(model);

  controls.target.set(0, targetHeight * 0.45, 0);
  const mobileDistance = window.innerWidth <= 680 ? 1.34 : 1;
  camera.position.set(
    (asset.file === "shark.glb" ? 3.4 : 3.6) * mobileDistance,
    targetHeight * (window.innerWidth <= 680 ? 0.88 : 0.78),
    (asset.file === "shark.glb" ? 4.5 : 4.2) * mobileDistance
  );
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
