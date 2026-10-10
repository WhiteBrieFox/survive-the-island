import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

class NodeFileReader {
  result = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onloadend?.();
    });
  }
}

globalThis.FileReader = NodeFileReader;

const outputDir = resolve("public/assets/models-preview");
const exporter = new GLTFExporter();

const material = (name, color, roughness = 0.72, metalness = 0) => {
  const value = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  value.name = name;
  return value;
};

const materials = {
  player: material("PlayerColor", "#22b9ad", 0.58),
  skin: material("Skin", "#d99661", 0.76),
  hair: material("Hair", "#3b2117", 0.88),
  leather: material("Leather", "#6c3f24", 0.86),
  leatherLight: material("LeatherLight", "#95623a", 0.82),
  khaki: material("Khaki", "#b89a61", 0.9),
  boot: material("Boot", "#37271e", 0.92),
  brass: material("Brass", "#c2903d", 0.4, 0.25),
  eye: material("Eye", "#161d1b", 0.28),
  white: material("EyeWhite", "#f2eadc", 0.72),
  shark: material("SharkEmerald", "#168c7d", 0.48),
  sharkDark: material("SharkDark", "#08665f", 0.54),
  sharkBelly: material("SharkBelly", "#d5d1b8", 0.7),
  mouth: material("Mouth", "#633332", 0.78),
  trunk: material("SculptedBark", "#76502e", 0.94),
  trunkLight: material("SculptedBarkLight", "#9a7042", 0.9),
  leaf: material("LeafBright", "#4d982f", 0.78),
  leafDark: material("LeafDark", "#2f7535", 0.82),
  leafLight: material("LeafHighlight", "#79b83d", 0.74),
  coconut: material("Coconut", "#5e3b22", 0.92),
  kaiju: material("KaijuCobalt", "#315f9f", 0.62),
  kaijuDark: material("KaijuDeepBlue", "#173d70", 0.68),
  kaijuBelly: material("KaijuBelly", "#8db8ad", 0.78),
  horn: material("CoralIvory", "#e3dcc4", 0.76),
  dragon: material("DragonCrimson", "#b83a2d", 0.58),
  dragonDark: material("DragonDark", "#6e2027", 0.68),
  dragonBelly: material("DragonGoldBelly", "#e39b42", 0.66),
  dragonMembrane: material("DragonWingMembrane", "#e55d35", 0.64),
  ember: material("Ember", "#ffb238", 0.3),
  serpent: material("SerpentCrimson", "#c74839", 0.56),
  serpentDark: material("SerpentDark", "#7f2431", 0.66),
  serpentBelly: material("SerpentIvory", "#e8cf9d", 0.74),
  wood: material("RaftWood", "#9b5d2d", 0.9),
  woodLight: material("RaftWoodLight", "#c68a45", 0.86),
  ropeFiber: material("RopeFiber", "#d2b16d", 0.96),
  sail: material("RolledSail", "#e4d4a5", 0.88)
};
materials.leaf.side = THREE.DoubleSide;
materials.leafDark.side = THREE.DoubleSide;
materials.leafLight.side = THREE.DoubleSide;
materials.dragonMembrane.side = THREE.DoubleSide;

function mesh(geometry, mat, name, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const value = new THREE.Mesh(geometry, mat);
  value.name = name;
  value.position.set(...position);
  value.rotation.set(...rotation);
  value.scale.set(...scale);
  value.castShadow = true;
  value.receiveShadow = true;
  return value;
}

function mergeMeshesByMaterial(container, name, excludedRoots = []) {
  container.updateMatrixWorld(true);
  const excluded = new Set();
  for (const root of excludedRoots) root.traverse((object) => excluded.add(object));
  const groups = new Map();
  const meshes = [];
  container.traverse((object) => {
    if (!object.isMesh || excluded.has(object)) return;
    meshes.push(object);
    const values = Array.isArray(object.material) ? object.material : [object.material];
    if (values.length !== 1) throw new Error(`Cannot merge multi-material mesh ${object.name}`);
    const mat = values[0];
    const entries = groups.get(mat) ?? [];
    const source = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    const geometry = source.clone();
    source.dispose();
    const relativeMatrix = new THREE.Matrix4()
      .copy(container.matrixWorld)
      .invert()
      .multiply(object.matrixWorld);
    geometry.applyMatrix4(relativeMatrix);
    for (const attribute of Object.keys(geometry.attributes)) {
      if (!["position", "normal", "uv"].includes(attribute)) geometry.deleteAttribute(attribute);
    }
    if (!geometry.attributes.uv) {
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    }
    entries.push(geometry);
    groups.set(mat, entries);
  });
  for (const object of meshes) object.parent?.remove(object);
  let index = 0;
  for (const [mat, geometries] of groups) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((entry) => entry.dispose());
    if (!geometry) throw new Error(`Failed to merge ${name} material ${mat.name}`);
    container.add(mesh(geometry, mat, `${name}_${mat.name}_${index}`));
    index += 1;
  }
}

function capsule(radius, length, mat, name, position, rotation = [0, 0, 0], scale = [1, 1, 1], segments = 10) {
  return mesh(new THREE.CapsuleGeometry(radius, length, 6, segments), mat, name, position, rotation, scale);
}

function roundedBoxGeometry(width, height, depth, radius = 0.05) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(radius * 0.38, depth * 0.16),
    bevelThickness: Math.min(radius * 0.38, depth * 0.16)
  });
  geometry.center();
  return geometry;
}

function addEyes(parent, y, z, xSpread, scale = 1) {
  for (const side of [-1, 1]) {
    parent.add(mesh(
      new THREE.SphereGeometry(0.045 * scale, 10, 8),
      materials.white,
      `EyeWhite_${side}`,
      [side * xSpread, y, z]
    ));
    parent.add(mesh(
      new THREE.SphereGeometry(0.019 * scale, 8, 6),
      materials.eye,
      `Pupil_${side}`,
      [side * xSpread, y, z + 0.039 * scale]
    ));
  }
}

function createExplorer() {
  const root = new THREE.Group();
  root.name = "explorer";

  const body = new THREE.Group();
  body.name = "ExplorerBody";
  root.add(body);

  body.add(mesh(new THREE.CapsuleGeometry(0.27, 0.42, 8, 14), materials.player, "Shirt_PlayerColor", [0, 1.34, 0], [0, 0, 0], [1, 1, 0.78]));
  body.add(mesh(new THREE.SphereGeometry(0.235, 18, 14), materials.skin, "Head", [0, 1.94, 0.02], [0, 0, 0], [0.92, 1.05, 0.88]));
  body.add(mesh(new THREE.SphereGeometry(0.205, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), materials.hair, "Hair", [0, 2.03, -0.015], [0, 0, 0], [1, 0.72, 1]));
  body.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.055, 24), materials.player, "HatBrim_PlayerColor", [0, 2.17, 0]));
  body.add(mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.22, 20), materials.player, "HatCrown_PlayerColor", [0, 2.29, 0]));
  addEyes(body, 1.98, 0.205, 0.085, 0.82);
  body.add(mesh(new THREE.SphereGeometry(0.029, 8, 6), materials.skin, "Nose", [0, 1.91, 0.225], [0, 0, 0], [0.78, 1, 1.08]));
  body.add(mesh(new THREE.TorusGeometry(0.055, 0.008, 5, 14, Math.PI), materials.mouth, "Smile", [0, 1.855, 0.226], [0, 0, Math.PI]));
  for (const side of [-1, 1]) {
    body.add(mesh(new THREE.BoxGeometry(0.09, 0.018, 0.025), materials.hair, `Eyebrow_${side}`, [side * 0.085, 2.045, 0.215], [0, 0, side * -0.11]));
    body.add(mesh(new THREE.SphereGeometry(0.052, 10, 8), materials.skin, `Ear_${side}`, [side * 0.217, 1.94, 0.01], [0, 0, 0], [0.52, 0.82, 0.45]));
  }

  body.add(mesh(roundedBoxGeometry(0.52, 0.34, 0.34, 0.06), materials.khaki, "Shorts", [0, 0.91, 0]));
  body.add(mesh(new THREE.BoxGeometry(0.62, 0.08, 0.39), materials.leather, "Belt", [0, 1.04, 0]));
  body.add(mesh(new THREE.BoxGeometry(0.11, 0.09, 0.06), materials.brass, "BeltBuckle", [0, 1.04, 0.22]));

  for (const side of [-1, 1]) {
    body.add(capsule(0.105, 0.16, materials.player, `Sleeve_PlayerColor_${side}`, [side * 0.32, 1.48, 0], [0, 0, side * -0.16]));
    body.add(capsule(0.083, 0.28, materials.skin, `Forearm_${side}`, [side * 0.38, 1.22, 0], [0, 0, side * -0.16]));
    body.add(mesh(new THREE.SphereGeometry(0.095, 12, 9), materials.skin, `Hand_${side}`, [side * 0.415, 1.02, 0.01], [0, 0, 0], [0.84, 1.08, 0.84]));
    body.add(capsule(0.105, 0.35, materials.skin, `Leg_${side}`, [side * 0.16, 0.55, 0], [0, 0, 0], [0.92, 1, 0.92]));
    body.add(mesh(roundedBoxGeometry(0.24, 0.25, 0.38, 0.055), materials.boot, `Boot_${side}`, [side * 0.16, 0.18, 0.065]));
    body.add(mesh(new THREE.BoxGeometry(0.19, 0.018, 0.29), materials.leatherLight, `BootLaces_${side}`, [side * 0.16, 0.27, 0.105]));
    body.add(mesh(new THREE.BoxGeometry(0.075, 0.69, 0.07), materials.leatherLight, `BackpackStrap_${side}`, [side * 0.2, 1.39, 0.16], [side * -0.08, 0, 0]));
  }

  body.add(mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28, 3, 3, 2), materials.leatherLight, "Backpack", [0, 1.38, -0.27], [0.04, 0, 0]));
  body.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.44, 16), materials.khaki, "Bedroll", [0, 1.76, -0.31], [0, 0, Math.PI / 2]));
  body.add(mesh(new THREE.TorusGeometry(0.16, 0.028, 8, 24), materials.khaki, "Rope", [0.24, 1.34, -0.39], [Math.PI / 2, 0, 0]));
  body.add(mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.055, 20), materials.khaki, "MiniatureBase", [0, 0.025, 0]));
  mergeMeshesByMaterial(body, "Explorer");

  const idle = new THREE.AnimationClip("Idle", 2.4, [
    new THREE.VectorKeyframeTrack("ExplorerBody.scale", [0, 1.2, 2.4], [1, 1, 1, 1.015, 1.025, 1.015, 1, 1, 1]),
    new THREE.QuaternionKeyframeTrack(
      "ExplorerBody.quaternion",
      [0, 1.2, 2.4],
      [0, 0, 0, 1, 0, Math.sin(0.018), 0, Math.cos(0.018), 0, 0, 0, 1]
    )
  ]);
  root.userData.assetType = "explorer";
  root.userData.playerColorMaterial = "PlayerColor";
  return { root, animations: [idle] };
}

function finGeometry(length, height, width = 0.035) {
  const shape = new THREE.Shape();
  shape.moveTo(-length * 0.46, 0);
  shape.lineTo(length * 0.06, height);
  shape.lineTo(length * 0.48, 0);
  shape.lineTo(-length * 0.46, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: width * 0.35,
    bevelThickness: width * 0.35
  });
  geometry.center();
  return geometry;
}

function createShark() {
  const root = new THREE.Group();
  root.name = "shark";
  const swimmer = new THREE.Group();
  swimmer.name = "SharkSwimmer";
  root.add(swimmer);

  swimmer.add(mesh(new THREE.SphereGeometry(0.5, 28, 18), materials.shark, "Body", [0, 0.08, 0], [0, 0, 0], [0.82, 0.7, 1.85]));
  swimmer.add(mesh(new THREE.SphereGeometry(0.42, 24, 14, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.46), materials.sharkBelly, "Belly", [0, -0.09, 0.02], [0, 0, 0], [0.78, 0.52, 1.72]));
  swimmer.add(mesh(new THREE.SphereGeometry(0.4, 24, 16), materials.shark, "Head", [0, 0.05, 0.78], [0, 0, 0], [0.95, 0.72, 1.12]));
  swimmer.add(mesh(new THREE.SphereGeometry(0.31, 20, 14), materials.sharkBelly, "SnoutBelly", [0, -0.08, 1.02], [0, 0, 0], [0.9, 0.45, 0.62]));
  swimmer.add(mesh(new THREE.ConeGeometry(0.24, 0.72, 18), materials.sharkDark, "TailPeduncle", [0, 0.06, -1.02], [Math.PI / 2, 0, 0], [0.65, 1, 0.65]));

  const tail = new THREE.Group();
  tail.name = "SharkTail";
  tail.position.set(0, 0.06, -1.33);
  tail.add(mesh(finGeometry(0.58, 0.62, 0.06), materials.sharkDark, "TailFin", [0, 0, 0], [0, 0, Math.PI / 2]));
  swimmer.add(tail);

  swimmer.add(mesh(finGeometry(0.68, 0.48, 0.07), materials.sharkDark, "DorsalFin", [0, 0.48, -0.2], [0, Math.PI / 2, 0]));
  for (const side of [-1, 1]) {
    swimmer.add(mesh(finGeometry(0.76, 0.35, 0.055), materials.shark, `PectoralFin_${side}`, [side * 0.43, -0.08, 0.12], [Math.PI / 2, side * 0.2, side * -0.18]));
    swimmer.add(mesh(new THREE.SphereGeometry(0.038, 10, 8), materials.white, `SharkEyeWhite_${side}`, [side * 0.27, 0.2, 0.98]));
    swimmer.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), materials.eye, `SharkPupil_${side}`, [side * 0.282, 0.2, 1.014]));
  }
  const mouthCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.19, -0.095, 1.145),
    new THREE.Vector3(-0.09, -0.145, 1.17),
    new THREE.Vector3(0, -0.16, 1.18),
    new THREE.Vector3(0.09, -0.145, 1.17),
    new THREE.Vector3(0.19, -0.095, 1.145)
  ]);
  swimmer.add(mesh(new THREE.TubeGeometry(mouthCurve, 16, 0.012, 6, false), materials.mouth, "MouthLine"));
  for (const [index, x] of [-0.12, -0.04, 0.04, 0.12].entries()) {
    swimmer.add(mesh(new THREE.ConeGeometry(0.016, 0.055, 6), materials.white, `Tooth_${index}`, [x, -0.105 - Math.abs(x) * 0.12, 1.17], [0, 0, Math.PI]));
  }
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      swimmer.add(mesh(new THREE.BoxGeometry(0.012, 0.17, 0.055), materials.sharkDark, `Gill_${side}_${index}`, [side * (0.28 + index * 0.018), 0.02, 0.69 - index * 0.075], [0, side * -0.28, side * 0.13]));
    }
  }
  mergeMeshesByMaterial(tail, "SharkTail");
  mergeMeshesByMaterial(swimmer, "Shark", [tail]);

  const swim = new THREE.AnimationClip("Swim", 1.5, [
    new THREE.QuaternionKeyframeTrack(
      "SharkTail.quaternion",
      [0, 0.375, 0.75, 1.125, 1.5],
      [0, -0.22, 0, 0.976, 0, 0.22, 0, 0.976, 0, -0.22, 0, 0.976, 0, 0.22, 0, 0.976, 0, -0.22, 0, 0.976]
    ),
    new THREE.VectorKeyframeTrack("SharkSwimmer.position", [0, 0.75, 1.5], [0, 0, 0, 0, 0.035, 0, 0, 0, 0])
  ]);
  root.userData.assetType = "shark";
  return { root, animations: [swim] };
}

function createKaiju() {
  const root = new THREE.Group();
  root.name = "kaiju";
  const body = new THREE.Group();
  body.name = "KaijuBody";
  root.add(body);

  body.add(mesh(new THREE.SphereGeometry(0.56, 22, 16), materials.kaiju, "Torso", [0, 1.18, 0], [0, 0, 0], [0.86, 1.28, 0.7]));
  body.add(mesh(new THREE.SphereGeometry(0.39, 20, 14), materials.kaiju, "Head", [0, 1.96, 0.04], [0, 0, 0], [0.92, 0.82, 0.88]));
  body.add(mesh(new THREE.SphereGeometry(0.3, 18, 12), materials.kaijuBelly, "Belly", [0, 1.18, 0.39], [0, 0, 0], [0.92, 1.34, 0.34]));
  body.add(mesh(new THREE.SphereGeometry(0.28, 18, 12), materials.kaijuBelly, "Muzzle", [0, 1.84, 0.34], [0, 0, 0], [0.92, 0.48, 0.7]));
  addEyes(body, 2.05, 0.34, 0.14, 0.95);

  for (const side of [-1, 1]) {
    body.add(mesh(new THREE.ConeGeometry(0.1, 0.38, 8), materials.horn, `BrowHorn_${side}`, [side * 0.23, 2.28, 0.02], [0, 0, side * -0.52]));
    body.add(capsule(0.15, 0.54, materials.kaiju, `UpperArm_${side}`, [side * 0.54, 1.42, 0.05], [0.1, 0, side * -0.35], [1, 1, 1.05]));
    body.add(capsule(0.14, 0.42, materials.kaijuDark, `Forearm_${side}`, [side * 0.68, 1.03, 0.22], [-0.5, 0, side * -0.12], [1.12, 1, 1.18]));
    body.add(mesh(new THREE.SphereGeometry(0.18, 12, 9), materials.kaijuDark, `ClawHand_${side}`, [side * 0.73, 0.75, 0.36], [0, 0, 0], [1.12, 0.72, 1.32]));
    body.add(capsule(0.2, 0.48, materials.kaiju, `Thigh_${side}`, [side * 0.27, 0.58, 0], [0, 0, side * -0.08], [1.08, 1, 1]));
    body.add(mesh(new THREE.SphereGeometry(0.22, 14, 10), materials.kaijuDark, `WebbedFoot_${side}`, [side * 0.3, 0.16, 0.18], [0, 0, 0], [1.08, 0.58, 1.55]));
  }

  for (let index = 0; index < 5; index += 1) {
    body.add(mesh(
      finGeometry(0.36 - index * 0.035, 0.28 - index * 0.02, 0.055),
      materials.kaijuDark,
      `DorsalPlate_${index}`,
      [0, 1.66 - index * 0.28, -0.5],
      [0, Math.PI / 2, 0]
    ));
  }

  const tail = new THREE.Group();
  tail.name = "KaijuTail";
  tail.position.set(0, 0.72, -0.42);
  tail.add(curvedTrunk("KaijuTailMesh", [[0, 0, 0], [0.08, -0.08, -0.5], [0.22, -0.22, -0.94], [0.5, -0.35, -1.24]], 0.13, materials.kaijuDark));
  body.add(tail);
  mergeMeshesByMaterial(tail, "KaijuTail");
  mergeMeshesByMaterial(body, "Kaiju", [tail]);

  const breathe = new THREE.AnimationClip("HeavyIdle", 2.8, [
    new THREE.VectorKeyframeTrack("KaijuBody.scale", [0, 1.4, 2.8], [1, 1, 1, 1.018, 1.032, 1.018, 1, 1, 1]),
    new THREE.QuaternionKeyframeTrack(
      "KaijuTail.quaternion",
      [0, 0.7, 1.4, 2.1, 2.8],
      [0, -0.12, 0, 0.993, 0, 0.12, 0, 0.993, 0, -0.12, 0, 0.993, 0, 0.12, 0, 0.993, 0, -0.12, 0, 0.993]
    )
  ]);
  root.userData.assetType = "kaiju";
  root.userData.originalDesign = true;
  return { root, animations: [breathe] };
}

function dragonWingGeometry(span = 1.1, height = 0.72) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(span * 0.42, height);
  shape.lineTo(span, height * 0.52);
  shape.lineTo(span * 0.72, height * 0.18);
  shape.lineTo(span * 0.48, height * 0.34);
  shape.lineTo(span * 0.25, height * 0.08);
  shape.lineTo(0, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.018,
    bevelThickness: 0.018
  });
  geometry.center();
  return geometry;
}

function createFireDragon() {
  const root = new THREE.Group();
  root.name = "fire_dragon";
  const body = new THREE.Group();
  body.name = "FireDragonBody";
  root.add(body);

  body.add(mesh(new THREE.SphereGeometry(0.46, 22, 16), materials.dragon, "DragonTorso", [0, 0.92, 0], [0, 0, 0], [0.76, 1.18, 1.05]));
  body.add(mesh(new THREE.SphereGeometry(0.34, 20, 14), materials.dragon, "DragonHead", [0, 1.52, 0.38], [-0.12, 0, 0], [0.95, 0.75, 1.15]));
  body.add(mesh(new THREE.SphereGeometry(0.27, 18, 12), materials.dragonBelly, "DragonMuzzle", [0, 1.39, 0.67], [0, 0, 0], [0.95, 0.48, 0.75]));
  body.add(mesh(new THREE.SphereGeometry(0.24, 18, 12), materials.dragonBelly, "DragonChest", [0, 0.93, 0.36], [0, 0, 0], [0.92, 1.48, 0.34]));
  addEyes(body, 1.62, 0.65, 0.13, 0.88);

  for (const side of [-1, 1]) {
    body.add(mesh(new THREE.ConeGeometry(0.075, 0.36, 8), materials.horn, `DragonHorn_${side}`, [side * 0.18, 1.87, 0.2], [-0.4, 0, side * -0.34]));
    body.add(capsule(0.11, 0.4, materials.dragon, `DragonLeg_${side}`, [side * 0.28, 0.47, 0.12], [0.18, 0, side * -0.12]));
    body.add(mesh(new THREE.SphereGeometry(0.15, 12, 8), materials.dragonDark, `DragonFoot_${side}`, [side * 0.31, 0.16, 0.3], [0, 0, 0], [1.18, 0.55, 1.42]));
    body.add(capsule(0.08, 0.3, materials.dragon, `DragonArm_${side}`, [side * 0.32, 1.02, 0.35], [-0.55, 0, side * -0.16]));
  }

  const leftWing = new THREE.Group();
  leftWing.name = "DragonWingLeft";
  leftWing.position.set(-0.3, 1.28, -0.05);
  leftWing.add(mesh(dragonWingGeometry(), materials.dragonMembrane, "LeftWingMembrane", [-0.52, 0.24, -0.08], [0.05, -0.22, -0.14]));
  leftWing.add(capsule(0.045, 0.95, materials.dragonDark, "LeftWingBone", [-0.38, 0.38, -0.08], [0, 0, 0.82]));
  body.add(leftWing);

  const rightWing = new THREE.Group();
  rightWing.name = "DragonWingRight";
  rightWing.position.set(0.3, 1.28, -0.05);
  rightWing.add(mesh(dragonWingGeometry(), materials.dragonMembrane, "RightWingMembrane", [0.52, 0.24, -0.08], [0.05, Math.PI + 0.22, 0.14]));
  rightWing.add(capsule(0.045, 0.95, materials.dragonDark, "RightWingBone", [0.38, 0.38, -0.08], [0, 0, -0.82]));
  body.add(rightWing);

  const tail = new THREE.Group();
  tail.name = "DragonTail";
  tail.position.set(0, 0.72, -0.4);
  tail.add(curvedTrunk("DragonTailMesh", [[0, 0, 0], [-0.1, -0.02, -0.52], [-0.34, -0.18, -0.93], [-0.62, -0.12, -1.18]], 0.1, materials.dragonDark));
  tail.add(mesh(finGeometry(0.42, 0.3, 0.045), materials.ember, "TailFlame", [-0.63, -0.12, -1.2], [0, 0, -0.35]));
  body.add(tail);

  for (let index = 0; index < 4; index += 1) {
    body.add(mesh(finGeometry(0.28, 0.2, 0.04), materials.dragonDark, `DragonSpine_${index}`, [0, 1.18 - index * 0.25, -0.42], [0, Math.PI / 2, 0]));
  }

  mergeMeshesByMaterial(leftWing, "DragonWingLeft");
  mergeMeshesByMaterial(rightWing, "DragonWingRight");
  mergeMeshesByMaterial(tail, "DragonTail");
  mergeMeshesByMaterial(body, "FireDragon", [leftWing, rightWing, tail]);

  const idle = new THREE.AnimationClip("GuardIdle", 3.2, [
    new THREE.VectorKeyframeTrack("FireDragonBody.scale", [0, 1.6, 3.2], [1, 1, 1, 1.018, 1.03, 1.018, 1, 1, 1]),
    new THREE.QuaternionKeyframeTrack(
      "DragonWingLeft.quaternion",
      [0, 1.6, 3.2],
      [0, 0, -0.08, 0.997, 0, 0, 0.12, 0.993, 0, 0, -0.08, 0.997]
    ),
    new THREE.QuaternionKeyframeTrack(
      "DragonWingRight.quaternion",
      [0, 1.6, 3.2],
      [0, 0, 0.08, 0.997, 0, 0, -0.12, 0.993, 0, 0, 0.08, 0.997]
    ),
    new THREE.QuaternionKeyframeTrack(
      "DragonTail.quaternion",
      [0, 0.8, 1.6, 2.4, 3.2],
      [0, -0.1, 0, 0.995, 0, 0.1, 0, 0.995, 0, -0.1, 0, 0.995, 0, 0.1, 0, 0.995, 0, -0.1, 0, 0.995]
    )
  ]);
  root.userData.assetType = "endpoint-guardian";
  root.userData.originalDesign = true;
  return { root, animations: [idle] };
}

function createSeaSerpent() {
  const root = new THREE.Group();
  root.name = "sea_serpent";
  const swimmer = new THREE.Group();
  swimmer.name = "SeaSerpentSwimmer";
  root.add(swimmer);

  swimmer.add(curvedTrunk(
    "SerpentBody",
    [[0, 0.48, 0.82], [-0.34, 0.1, 0.46], [0.34, 0.02, 0.02], [-0.3, -0.01, -0.5], [0.18, 0.02, -1.08]],
    0.17,
    materials.serpent
  ));
  swimmer.add(mesh(new THREE.SphereGeometry(0.25, 20, 14), materials.serpent, "SerpentHead", [0, 0.62, 0.98], [-0.12, 0, 0], [0.88, 0.78, 1.08]));
  swimmer.add(mesh(new THREE.SphereGeometry(0.18, 18, 12), materials.serpentBelly, "SerpentMuzzle", [0, 0.53, 1.18], [0, 0, 0], [0.9, 0.48, 0.72]));
  addEyes(swimmer, 0.68, 1.18, 0.1, 0.72);
  for (const side of [-1, 1]) {
    swimmer.add(mesh(finGeometry(0.38, 0.23, 0.04), materials.serpentDark, `SerpentFin_${side}`, [side * 0.18, 0.16, 0.38], [Math.PI / 2, side * 0.18, side * -0.3]));
  }
  for (let index = 0; index < 6; index += 1) {
    swimmer.add(mesh(
      finGeometry(0.27 - index * 0.018, 0.22 - index * 0.014, 0.035),
      index % 2 ? materials.serpentDark : materials.ember,
      `SerpentCrest_${index}`,
      [0, 0.74 - index * 0.12, 0.82 - index * 0.31],
      [0, Math.PI / 2, 0]
    ));
  }
  mergeMeshesByMaterial(swimmer, "SeaSerpent");

  const swim = new THREE.AnimationClip("SerpentSwim", 2.2, [
    new THREE.QuaternionKeyframeTrack(
      "SeaSerpentSwimmer.quaternion",
      [0, 0.55, 1.1, 1.65, 2.2],
      [0, -0.05, -0.025, 0.998, 0, 0.06, 0.025, 0.998, 0, -0.05, -0.025, 0.998, 0, 0.06, 0.025, 0.998, 0, -0.05, -0.025, 0.998]
    ),
    new THREE.VectorKeyframeTrack("SeaSerpentSwimmer.position", [0, 1.1, 2.2], [0, 0, 0, 0, 0.08, 0, 0, 0, 0])
  ]);
  root.userData.assetType = "sea-serpent";
  return { root, animations: [swim] };
}

function createRaft() {
  const root = new THREE.Group();
  root.name = "raft";
  const raft = new THREE.Group();
  raft.name = "RaftFloat";
  root.add(raft);

  for (let index = 0; index < 7; index += 1) {
    const x = (index - 3) * 0.23;
    raft.add(mesh(new THREE.CylinderGeometry(0.105, 0.12, 1.9, 12), index % 2 ? materials.wood : materials.woodLight, `Log_${index}`, [x, 0.12, 0], [Math.PI / 2, 0, 0]));
  }
  for (const z of [-0.62, 0.62]) {
    raft.add(mesh(roundedBoxGeometry(1.55, 0.09, 0.1, 0.025), materials.woodLight, `CrossBrace_${z}`, [0, 0.23, z]));
  }
  for (const x of [-0.5, 0.5]) {
    for (const z of [-0.62, 0.62]) {
      raft.add(mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 16), materials.ropeFiber, `RopeLoop_${x}_${z}`, [x, 0.27, z], [Math.PI / 2, 0, 0]));
    }
  }
  raft.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.18, 14), materials.sail, "RolledSail", [0, 0.38, -0.7], [0, 0, Math.PI / 2]));
  for (const side of [-1, 1]) {
    raft.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.55, 10), materials.woodLight, `PaddleShaft_${side}`, [side * 0.58, 0.34, 0.04], [Math.PI / 2, 0, side * 0.2]));
    raft.add(mesh(roundedBoxGeometry(0.16, 0.34, 0.045, 0.03), materials.woodLight, `PaddleBlade_${side}`, [side * 0.71, 0.34, -0.7], [Math.PI / 2, 0, side * 0.2]));
  }

  const seatPositions = [
    [0, 0.31, -0.28],
    [-0.38, 0.31, 0.38],
    [0.38, 0.31, 0.38]
  ];
  seatPositions.forEach((position, index) => {
    raft.add(mesh(
      new THREE.CylinderGeometry(0.2, 0.22, 0.035, 20),
      materials.ropeFiber,
      `SeatPad_${index + 1}`,
      position
    ));
    const anchor = new THREE.Group();
    anchor.name = `Seat_${index + 1}`;
    anchor.position.set(position[0], position[1] + 0.035, position[2]);
    anchor.userData.seatIndex = index;
    anchor.userData.capacity = 1;
    raft.add(anchor);
  });
  mergeMeshesByMaterial(raft, "Raft");

  const bob = new THREE.AnimationClip("Bob", 2.6, [
    new THREE.VectorKeyframeTrack("RaftFloat.position", [0, 0.65, 1.3, 1.95, 2.6], [0, 0, 0, 0, 0.045, 0, 0, 0, 0, 0, -0.035, 0, 0, 0, 0]),
    new THREE.QuaternionKeyframeTrack(
      "RaftFloat.quaternion",
      [0, 1.3, 2.6],
      [0.018, 0, -0.012, 0.999, -0.018, 0, 0.012, 0.999, 0.018, 0, -0.012, 0.999]
    )
  ]);
  root.userData.assetType = "raft";
  root.userData.capacity = 3;
  root.userData.seatAnchors = ["Seat_1", "Seat_2", "Seat_3"];
  return { root, animations: [bob] };
}

function taperedLeafGeometry(length = 1, width = 0.3, bend = 0.16, segments = 7) {
  const positions = [];
  const indices = [];
  for (let layer = 0; layer < 2; layer += 1) {
    const thickness = layer === 0 ? 0.018 : -0.018;
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const halfWidth = Math.sin(Math.PI * t) * width * 0.5;
      const y = Math.sin(Math.PI * t) * bend - t * bend * 0.75;
      positions.push(-halfWidth, y + thickness, t * length);
      positions.push(halfWidth, y + thickness, t * length);
    }
  }
  const stride = (segments + 1) * 2;
  for (let layer = 0; layer < 2; layer += 1) {
    for (let index = 0; index < segments; index += 1) {
      const a = layer * stride + index * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (layer === 0) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  for (let index = 0; index <= segments; index += 1) {
    const top = index * 2;
    const bottom = stride + index * 2;
    indices.push(top, bottom, top + 1, top + 1, bottom, bottom + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function curvedTrunk(name, points, radius, mat = materials.trunk) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return mesh(new THREE.TubeGeometry(curve, 12, radius, 9, false), mat, name);
}

function rootTubes(parent, radius, count, y = 0.06) {
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const length = 0.36 + (index % 3) * 0.08;
    parent.add(curvedTrunk(
      `Root_${index}`,
      [[0, y + 0.16, 0], [Math.cos(angle) * length * 0.45, y + 0.05, Math.sin(angle) * length * 0.45], [Math.cos(angle) * length, y, Math.sin(angle) * length]],
      radius,
      index % 2 ? materials.trunk : materials.trunkLight
    ));
  }
}

function makeSway(root, nodeName, amount = 0.025, duration = 3.2) {
  return new THREE.AnimationClip("Sway", duration, [
    new THREE.QuaternionKeyframeTrack(
      `${nodeName}.quaternion`,
      [0, duration / 2, duration],
      [0, 0, -amount, Math.sqrt(1 - amount * amount), 0, 0, amount, Math.sqrt(1 - amount * amount), 0, 0, -amount, Math.sqrt(1 - amount * amount)]
    )
  ]);
}

function createPalm() {
  const root = new THREE.Group();
  root.name = "tree_palm_a";
  rootTubes(root, 0.045, 7);
  const canopy = new THREE.Group();
  canopy.name = "PalmCanopy";
  root.add(canopy);
  canopy.add(curvedTrunk("PalmTrunk", [[0, 0.08, 0], [0.12, 0.8, 0], [0.34, 1.55, 0.05], [0.27, 2.18, 0]], 0.13));
  canopy.position.set(0, 0, 0);
  for (let ring = 0; ring < 8; ring += 1) {
    const angle = (ring / 8) * Math.PI * 2;
    const frond = new THREE.Group();
    frond.name = `PalmFrond_${ring}`;
    frond.position.set(0.27, 2.18, 0);
    frond.rotation.set(0.08 + (ring % 2) * 0.06, angle, 0);
    frond.add(curvedTrunk("FrondRib", [[0, 0, 0], [0, 0.04, 0.42], [0, -0.04, 0.82], [0, -0.18, 1.12]], 0.018, materials.leafDark));
    for (let index = 1; index <= 6; index += 1) {
      const z = index * 0.15;
      const length = 0.3 - index * 0.022;
      for (const side of [-1, 1]) {
        frond.add(mesh(
          taperedLeafGeometry(length, 0.12, 0.055, 4),
          (ring + index) % 3 === 0 ? materials.leafLight : materials.leaf,
          `Leaflet_${index}_${side}`,
          [0, 0.02 - index * 0.018, z],
          [0.02, side * (Math.PI / 2 - 0.2), side * -0.1]
        ));
      }
    }
    frond.add(mesh(taperedLeafGeometry(0.32, 0.13, 0.07, 5), materials.leafLight, "FrondTip", [0, -0.16, 1.02]));
    canopy.add(frond);
  }
  for (const [index, angle] of [0, 2.1, 4.2].entries()) {
    canopy.add(mesh(new THREE.SphereGeometry(0.12, 12, 10), materials.coconut, `Coconut_${index}`, [0.27 + Math.cos(angle) * 0.13, 2.08, Math.sin(angle) * 0.13]));
  }
  mergeMeshesByMaterial(root, "PalmRoots", [canopy]);
  mergeMeshesByMaterial(canopy, "PalmCanopy");
  root.userData.assetType = "tree";
  root.userData.variant = "palm";
  return { root, animations: [makeSway(root, "PalmCanopy", 0.018, 3.6)] };
}

function foliageCluster(name, position, scale, mat, detail = 1) {
  return mesh(new THREE.IcosahedronGeometry(0.45, detail), mat, name, position, [0, 0, 0], scale);
}

function addBroadCanopy(parent, y, compact = false) {
  const count = compact ? 10 : 14;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + (index % 2) * 0.16;
    const ring = index % 3 === 0 ? 0.32 : compact ? 0.48 : 0.68;
    const height = y + (index % 4) * 0.08;
    parent.add(foliageCluster(
      `Foliage_${index}`,
      [Math.cos(angle) * ring, height, Math.sin(angle) * ring],
      compact ? [0.72, 0.58, 0.72] : [0.9, 0.58, 0.82],
      index % 3 === 0 ? materials.leafLight : index % 2 ? materials.leaf : materials.leafDark,
      1
    ));
  }
  parent.add(foliageCluster("FoliageTop", [0, y + 0.32, 0], compact ? [0.9, 0.72, 0.9] : [1.08, 0.72, 1.08], materials.leaf, 1));
}

function createCoastalTree() {
  const root = new THREE.Group();
  root.name = "tree_coastal_a";
  rootTubes(root, 0.05, 8);
  const canopy = new THREE.Group();
  canopy.name = "CoastalCanopy";
  root.add(canopy);
  canopy.add(curvedTrunk("CoastalTrunk", [[0, 0.08, 0], [0.02, 0.72, 0], [-0.08, 1.38, 0.02], [0, 1.78, 0]], 0.18));
  for (const [index, direction] of [[0, -1], [1, 1]]) {
    canopy.add(curvedTrunk(`MajorBranch_${index}`, [[0, 1.1, 0], [direction * 0.28, 1.48, 0], [direction * 0.6, 1.7, 0.08]], 0.095));
  }
  addBroadCanopy(canopy, 1.78, false);
  mergeMeshesByMaterial(root, "CoastalRoots", [canopy]);
  mergeMeshesByMaterial(canopy, "CoastalCanopy");
  root.userData.assetType = "tree";
  root.userData.variant = "coastal";
  return { root, animations: [makeSway(root, "CoastalCanopy", 0.014, 4.2)] };
}

function createJungleTree() {
  const root = new THREE.Group();
  root.name = "tree_jungle_a";
  rootTubes(root, 0.04, 7);
  const canopy = new THREE.Group();
  canopy.name = "JungleCanopy";
  root.add(canopy);
  canopy.add(curvedTrunk("JungleTrunk", [[0, 0.06, 0], [0.04, 0.64, 0], [-0.04, 1.2, 0], [0, 1.58, 0]], 0.16));
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    canopy.add(curvedTrunk(
      `JungleBranch_${index}`,
      [[0, 0.9 + index * 0.09, 0], [Math.cos(angle) * 0.25, 1.22, Math.sin(angle) * 0.25], [Math.cos(angle) * 0.48, 1.45, Math.sin(angle) * 0.48]],
      0.075
    ));
  }
  addBroadCanopy(canopy, 1.55, true);
  mergeMeshesByMaterial(root, "JungleRoots", [canopy]);
  mergeMeshesByMaterial(canopy, "JungleCanopy");
  root.userData.assetType = "tree";
  root.userData.variant = "jungle";
  return { root, animations: [makeSway(root, "JungleCanopy", 0.02, 3.8)] };
}

async function exportModel(filename, create) {
  const { root, animations } = create();
  root.traverse((object) => {
    if (object.isMesh) {
      if (!object.geometry.attributes.normal) object.geometry.computeVertexNormals();
      object.geometry.computeBoundingBox();
      object.geometry.computeBoundingSphere();
    }
  });
  root.updateMatrixWorld(true);
  const result = await exporter.parseAsync(root, {
    binary: true,
    animations,
    trs: true,
    onlyVisible: true
  });
  await writeFile(resolve(outputDir, filename), Buffer.from(result));

  let triangles = 0;
  let meshes = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    const geometry = object.geometry;
    triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
  });
  return { file: filename, triangles: Math.round(triangles), meshes, animations: animations.map((clip) => clip.name) };
}

await mkdir(outputDir, { recursive: true });
const assets = [];
assets.push(await exportModel("explorer.glb", createExplorer));
assets.push(await exportModel("shark.glb", createShark));
assets.push(await exportModel("tree-palm.glb", createPalm));
assets.push(await exportModel("tree-coastal.glb", createCoastalTree));
assets.push(await exportModel("tree-jungle.glb", createJungleTree));
assets.push(await exportModel("kaiju.glb", createKaiju));
assets.push(await exportModel("fire-dragon.glb", createFireDragon));
assets.push(await exportModel("sea-serpent.glb", createSeaSerpent));
assets.push(await exportModel("raft.glb", createRaft));
await writeFile(resolve(outputDir, "manifest.json"), JSON.stringify({
  generatedAt: "2026-10-10",
  status: "preview-only",
  integratedIntoGame: false,
  sourceReferences: "/art-source/mira",
  assets
}, null, 2));
console.table(assets);
