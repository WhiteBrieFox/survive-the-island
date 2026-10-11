import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import "./heroModelPreview.css";

type Asset = {
  id: string;
  label: string;
  note: string;
  highTriangles: string;
  palette: string[];
  modelPath?: string;
  referencePath?: string;
  embeddedMaterials?: boolean;
};

const assets: Asset[] = [
  {
    id: "kaiju-hyper3d",
    label: "巨兽 · Hyper3D",
    note: "由确认后的 Mira 概念图生成：更高的战斗比例、强壮前肢、锐利眼神，并保留 Hyper3D 的 PBR 2K 材质。",
    highTriangles: "36,957",
    palette: ["#174fbd", "#3082e5", "#acd9df", "#d8b86e"],
    modelPath: "/assets/models-hero/kaiju-hyper3d-pbr.glb",
    referencePath: "/assets/models-hero/source/kaiju-hyper3d-reference.png",
    embeddedMaterials: true
  },
  {
    id: "explorer",
    label: "探险者 · Hyper3D",
    note: "保留完整帽子、背包和装备层次，采用适合棋盘角色的紧凑比例与清晰表情。",
    highTriangles: "36,902",
    palette: ["#e82f26", "#f3a05f", "#5e321f", "#f2bb45"],
    modelPath: "/assets/models-hero/explorer-hyper3d-pbr.glb",
    referencePath: "/assets/models-hero/source/explorer-keyart-mira.png",
    embeddedMaterials: true
  },
  {
    id: "shark",
    label: "鲨鱼 · Hyper3D",
    note: "海藻绿背部、薄荷色腹部和锐利牙齿，鳍与尾部轮廓保持完整，适合作为海域棋子。",
    highTriangles: "33,146",
    palette: ["#15865a", "#38a969", "#c5e2c8", "#07523c"],
    modelPath: "/assets/models-hero/shark-hyper3d-pbr.glb",
    referencePath: "/assets/models-hero/source/shark-keyart-mira.png",
    embeddedMaterials: true
  },
  {
    id: "sea-serpent",
    label: "海蛇 · Hyper3D",
    note: "熔岩红鳞片、米白腹甲与金色锐眼，完整保留 S 形盘曲身体和连续背鳍。",
    highTriangles: "36,327",
    palette: ["#d92d1f", "#8f1716", "#dfc39a", "#f2a33a"],
    modelPath: "/assets/models-hero/sea-serpent-hyper3d-pbr.glb",
    referencePath: "/assets/models-hero/source/sea-serpent-keyart-mira.png",
    embeddedMaterials: true
  },
  {
    id: "raft",
    label: "木筏 · Hyper3D",
    note: "厚圆木结构、独立绳结、单桨和物资包均完整生成，俯视时仍有清楚的层次。",
    highTriangles: "39,129",
    palette: ["#7d451f", "#bd732f", "#3d281c", "#d9a450"],
    modelPath: "/assets/models-hero/raft-hyper3d-pbr.glb",
    referencePath: "/assets/models-hero/source/raft-keyart-mira.png",
    embeddedMaterials: true
  }
];

document.querySelector<HTMLDivElement>("#hero-model-root")!.innerHTML = `
  <main class="hero-preview">
    <header>
      <div>
        <span>AI 3D ASSET REVIEW</span>
        <h1>正式级模型候选</h1>
        <p>以登录页主视觉为美术基准，由 Mira 生成单体设定并转换为高分网格，现已应用到正式棋盘。</p>
      </div>
      <div class="preview-tools">
        <button id="detail-toggle" type="button">查看高模</button>
        <button id="material-toggle" type="button">查看灰模</button>
        <button id="wire-toggle" type="button">显示线框</button>
        <button id="reset-camera" type="button">重置视角</button>
      </div>
    </header>
    <nav>
      ${assets.map((asset, index) => `<button data-index="${index}" class="${index === 0 ? "active" : ""}">${asset.label}</button>`).join("")}
    </nav>
    <section class="stage">
      <canvas id="hero-canvas"></canvas>
      <aside class="reference">
        <span>登录页主视觉衍生设定</span>
        <img id="reference-image" alt="" />
      </aside>
      <aside class="model-info">
        <span id="quality-label">网页优化版</span>
        <h2 id="asset-name"></h2>
        <p id="asset-note"></p>
        <dl>
          <div><dt>当前三角面</dt><dd id="triangles">-</dd></div>
          <div><dt>高模三角面</dt><dd id="high-triangles">-</dd></div>
          <div><dt>顶点</dt><dd id="vertices">-</dd></div>
          <div><dt>文件体积</dt><dd id="file-size">-</dd></div>
        </dl>
        <small>拖动旋转 · 滚轮缩放 · 右键平移</small>
      </aside>
      <div class="loading" id="loading">正在加载模型</div>
    </section>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#hero-canvas")!;
const stage = document.querySelector<HTMLElement>(".stage")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#dde3e0");
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 80);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.56;
controls.minDistance = 2.2;
controls.maxDistance = 10;

scene.add(new THREE.HemisphereLight("#fffaf0", "#70817d", 1.65));
const key = new THREE.DirectionalLight("#fff4df", 3.8);
key.position.set(4, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);
const fill = new THREE.DirectionalLight("#c8deea", 1.15);
fill.position.set(-4, 3, 4);
scene.add(fill);
const rim = new THREE.DirectionalLight("#fff7e8", 1.6);
rim.position.set(-5, 3, -4);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(4.4, 96),
  new THREE.MeshStandardMaterial({ color: "#b8c1bc", roughness: 0.94 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();
let selectedIndex = 0;
let highDetail = false;
let wireframe = false;
let clayMaterial = false;
let current: THREE.Group | null = null;

const makeColor = (value: string) => new THREE.Color(value);
const mix = (from: string, to: string, amount: number) =>
  makeColor(from).lerp(makeColor(to), THREE.MathUtils.clamp(amount, 0, 1));
const smoothstep = (min: number, max: number, value: number) =>
  THREE.MathUtils.smoothstep(value, min, max);
const grain = (x: number, y: number, z: number) =>
  Math.sin(x * 91.7 + y * 47.3 + z * 73.1) * 0.5 + 0.5;

function explorerColor(x: number, y: number, z: number) {
  const side = Math.abs(x - 0.5);
  const front = smoothstep(0.42, 0.76, z);
  const variation = grain(x, y, z);
  if (y < 0.17) return mix("#38271f", "#62402c", variation * 0.35);
  if (y < 0.31) return mix("#a95f42", "#ce825a", variation * 0.22);
  if (y < 0.42) return mix("#84201d", "#af3028", variation * 0.2);
  if (side > 0.31 && y < 0.68) return mix("#a96145", "#d28a61", 0.42 + variation * 0.16);
  if (y > 0.57 && y < 0.84 && side < 0.38) {
    return mix("#a96043", "#d48b62", 0.45 + variation * 0.14);
  }
  if (y > 0.69 && y < 0.87 && front < 0.34) {
    return mix("#33231d", "#593729", variation * 0.28);
  }
  if (y > 0.84) return mix("#831c1a", "#b62e27", 0.28 + variation * 0.2);
  return mix("#871d1d", "#b52f29", 0.32 + variation * 0.18);
}

function sharkColor(y: number, normalY: number) {
  const belly = 1 - smoothstep(0.3, 0.58, y + normalY * 0.12);
  const body = mix("#176f50", "#349a68", smoothstep(0.18, 0.88, y));
  return body.lerp(makeColor("#c5d9bd"), belly * 0.9);
}

function serpentColor(x: number, y: number, z: number, normalY: number) {
  const center = 1 - smoothstep(0.18, 0.43, Math.abs(x - 0.5));
  const front = smoothstep(0.42, 0.78, z);
  const belly = center * front * smoothstep(0.13, 0.38, y);
  const dorsal = smoothstep(0.48, 0.88, normalY);
  const scales = mix("#a91f1d", "#cf3b29", 0.26 + grain(x, y, z) * 0.25);
  scales.lerp(makeColor("#6e1820"), dorsal * 0.38);
  return scales.lerp(makeColor("#d4bc91"), belly * 0.82);
}

function kaijuColor(x: number, y: number, z: number, normalY: number) {
  const armor = mix("#173b72", "#2d64a2", 0.2 + grain(x, y, z) * 0.28);
  const ridge = smoothstep(0.52, 0.9, normalY) * smoothstep(0.42, 0.72, y);
  armor.lerp(makeColor("#102e60"), ridge * 0.3);
  return armor;
}

function raftColor(x: number, y: number, z: number) {
  const wetness = 1 - smoothstep(0.08, 0.42, y);
  const variation = grain(x * 1.8, y, z * 1.8);
  const wood = mix("#59361f", "#84542d", 0.34 + variation * 0.32);
  wood.lerp(makeColor("#3f2a20"), wetness * 0.24);
  if (y > 0.62) wood.lerp(makeColor("#72503a"), smoothstep(0.62, 0.9, y) * 0.46);
  return wood;
}

function applyReviewMaterial(root: THREE.Object3D, asset: Asset) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (asset.embeddedMaterials && !clayMaterial && !wireframe) {
      object.castShadow = true;
      object.receiveShadow = true;
      return;
    }
    const geometry = object.geometry.clone();
    geometry.computeVertexNormals();
    const bounds = geometry.boundingBox ?? (geometry.computeBoundingBox(), geometry.boundingBox!);
    const size = bounds.getSize(new THREE.Vector3());
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const colors = new Float32Array(position.count * 3);
    for (let index = 0; index < position.count; index += 1) {
      const x = (position.getX(index) - bounds.min.x) / Math.max(size.x, 0.001);
      const y = (position.getY(index) - bounds.min.y) / Math.max(size.y, 0.001);
      const z = (position.getZ(index) - bounds.min.z) / Math.max(size.z, 0.001);
      const normalY = normal.getY(index);
      const normalZ = normal.getZ(index);
      let chosen = makeColor("#a99b83");
      if (!clayMaterial && asset.id === "explorer") chosen = explorerColor(x, y, z);
      if (!clayMaterial && asset.id === "shark") chosen = sharkColor(y, normalY);
      if (!clayMaterial && asset.id === "sea-serpent") chosen = serpentColor(x, y, z, normalY);
      if (!clayMaterial && asset.id === "kaiju") chosen = kaijuColor(x, y, z, normalY);
      if (!clayMaterial && asset.id === "raft") chosen = raftColor(x, y, z);
      chosen.toArray(colors, index * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    object.geometry = geometry;
    object.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: clayMaterial ? 0.86 : asset.id === "shark" || asset.id === "sea-serpent" ? 0.62 : 0.78,
      metalness: 0,
      wireframe
    });
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

async function loadAsset() {
  const asset = assets[selectedIndex];
  const detailToggle = document.querySelector<HTMLButtonElement>("#detail-toggle")!;
  detailToggle.disabled = Boolean(asset.modelPath);
  detailToggle.textContent = asset.modelPath ? "PBR 导出版" : highDetail ? "查看优化版" : "查看高模";
  document.querySelector("#loading")!.classList.remove("hidden");
  document.querySelector("#quality-label")!.textContent = asset.modelPath
    ? "Hyper3D PBR 2K"
    : highDetail
      ? "原始高分网格"
      : "网页优化版";
  document.querySelector("#asset-name")!.textContent = asset.label;
  document.querySelector("#asset-note")!.textContent = asset.note;
  document.querySelector("#high-triangles")!.textContent = asset.highTriangles;
  const source = document.querySelector<HTMLImageElement>("#reference-image")!;
  source.src = asset.referencePath ?? `/assets/models-hero/source/${asset.id}-keyart-mira.png`;
  source.alt = `${asset.label} Mira 造型参考`;
  if (current) scene.remove(current);

  const suffix = highDetail ? "-high" : "";
  const url = asset.modelPath ?? `/assets/models-hero/${asset.id}-keyart${suffix}.glb`;
  const [gltf, response] = await Promise.all([loader.loadAsync(url), fetch(url)]);
  current = gltf.scene;
  applyReviewMaterial(current, asset);
  const bounds = new THREE.Box3().setFromObject(current);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 2.7 / Math.max(size.x, size.y, size.z);
  current.scale.setScalar(scale);
  current.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  scene.add(current);

  let triangles = 0;
  let vertices = 0;
  current.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute("position");
    vertices += position.count;
    triangles += object.geometry.index ? object.geometry.index.count / 3 : position.count / 3;
  });
  document.querySelector("#triangles")!.textContent = Math.round(triangles).toLocaleString();
  document.querySelector("#vertices")!.textContent = vertices.toLocaleString();
  document.querySelector("#file-size")!.textContent = `${((await response.blob()).size / 1024 / 1024).toFixed(2)} MB`;
  resetCamera();
  document.querySelector("#loading")!.classList.add("hidden");
}

function resetCamera() {
  controls.target.set(0, 1.15, 0);
  const distance = camera.aspect < 0.8 ? 1.65 : 1;
  camera.position.set(4.2 * distance, 2.8 * distance, 4.8 * distance);
  controls.update();
}

document.querySelectorAll<HTMLButtonElement>("nav button").forEach((button) => {
  button.addEventListener("click", () => {
    selectedIndex = Number(button.dataset.index);
    document.querySelectorAll("nav button").forEach((item, index) => item.classList.toggle("active", index === selectedIndex));
    void loadAsset();
  });
});
document.querySelector<HTMLButtonElement>("#detail-toggle")!.addEventListener("click", (event) => {
  highDetail = !highDetail;
  (event.currentTarget as HTMLButtonElement).textContent = highDetail ? "查看优化版" : "查看高模";
  void loadAsset();
});
document.querySelector<HTMLButtonElement>("#material-toggle")!.addEventListener("click", (event) => {
  clayMaterial = !clayMaterial;
  (event.currentTarget as HTMLButtonElement).textContent = clayMaterial ? "查看材质色" : "查看灰模";
  void loadAsset();
});
document.querySelector<HTMLButtonElement>("#wire-toggle")!.addEventListener("click", (event) => {
  wireframe = !wireframe;
  (event.currentTarget as HTMLButtonElement).textContent = wireframe ? "隐藏线框" : "显示线框";
  void loadAsset();
});
document.querySelector("#reset-camera")!.addEventListener("click", resetCamera);

new ResizeObserver(() => {
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
}).observe(stage);

function frame() {
  requestAnimationFrame(frame);
  controls.update();
  renderer.render(scene, camera);
}
frame();
void loadAsset();
