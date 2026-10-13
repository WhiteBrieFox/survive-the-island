import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ContactShadows, Edges, Float, Html, OrbitControls, Sparkles, useAnimations, useGLTF, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AmbientLight, Box3, BufferGeometry, CanvasTexture, Color, DirectionalLight, Float32BufferAttribute, Group,
  HemisphereLight, LineSegments, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  MeshStandardMaterial, Plane, Raycaster, SRGBColorSpace, Vector2, Vector3,
  type Material, type Object3D, type Texture
} from "three";
import { useShallow } from "zustand/react/shallow";
import type {
  CreatureRoll, CreatureView, ExplorerView, PlayerColor, PublicRoomState,
  RaftView, Terrain, TileView, WaterSpaceView
} from "../../shared/types";
import { areAdjacent, createIslandCoords, hexToWorld } from "../../shared/hex";
import { dayStageFor, type DayStage } from "../dayCycle";
import { useGameStore } from "../gameStore";
import { prepareHeroModel, type HeroModelName } from "../heroModelMaterials";
import { socket } from "../socket";

const colorMap: Record<PlayerColor, string> = {
  coral: "#f05d4f",
  teal: "#20a99a",
  gold: "#f2b84b",
  violet: "#8f73d8",
  sky: "#4a9ed8"
};

const BOARD_SCALE = 2;

const terrainColor: Record<Terrain, string> = {
  beach: "#e8c878",
  forest: "#4f9a68",
  mountain: "#51453d"
};

const terrainSideColor: Record<Terrain, string> = {
  beach: "#a97643",
  forest: "#355e48",
  mountain: "#38332f"
};

const landUnitSlots: Array<[number, number]> = [
  [0.52, 0.46],
  [-0.02, 0.74],
  [0.78, -0.08],
  [0.3, -0.72],
  [-0.48, 0.52],
  [-0.7, -0.08]
];

const waterUnitSlots: Array<[number, number]> = [
  [0.36, 0.48],
  [-0.36, 0.48],
  [0.68, 0.04],
  [-0.68, 0.04],
  [0.42, -0.48],
  [-0.42, -0.48],
  [0, -0.66],
  [0, 0.08]
];

const EXPLORER_SPACE_CAPACITY = 5;
const WHIRLPOOL_DURATION = 3.8;

type UnitPlacement = {
  x: number;
  z: number;
};

function AnimatedMover({
  position,
  arc = 0.16,
  duration = 0.62,
  children
}: {
  position: [number, number, number];
  arc?: number;
  duration?: number;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const current = useRef(new Vector3(...position));
  const start = useRef(new Vector3(...position));
  const target = useRef(new Vector3(...position));
  const elapsed = useRef(duration);
  const initialized = useRef(false);

  useLayoutEffect(() => {
    const next = new Vector3(...position);
    if (!initialized.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      initialized.current = true;
      current.current.copy(next);
      start.current.copy(next);
      target.current.copy(next);
      elapsed.current = duration;
      group.current?.position.copy(next);
      return;
    }
    start.current.copy(current.current);
    target.current.copy(next);
    elapsed.current = 0;
  }, [duration, position[0], position[1], position[2]]);

  useFrame((_, delta) => {
    if (!group.current || elapsed.current >= duration) return;
    elapsed.current = Math.min(duration, elapsed.current + delta);
    const linear = elapsed.current / duration;
    const eased = linear * linear * (3 - 2 * linear);
    current.current.lerpVectors(start.current, target.current, eased);
    const horizontalDistance = Math.hypot(
      target.current.x - start.current.x,
      target.current.z - start.current.z
    );
    current.current.y += Math.sin(linear * Math.PI) * Math.min(arc, horizontalDistance * 0.12);
    group.current.position.copy(current.current);
  });

  return (
    <group ref={group} position={[current.current.x, current.current.y, current.current.z]}>
      {children}
    </group>
  );
}

const modelPath = (name: string) => `/assets/models-preview/${name}.glb`;
const heroModelPath = (name: HeroModelName) => `/assets/models-hero/${name}-hyper3d-pbr.glb`;
const volcanoModelPath = modelPath("volcano-hyper3d");
const whirlpoolModelPath = modelPath("whirlpool-hyper3d");

type AssetModelProps = {
  name: string;
  color?: string;
  animate?: boolean;
  castShadow?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

function prepareModel(
  source: Object3D,
  color?: string,
  castShadow = true
) {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = castShadow;
    object.receiveShadow = true;
    const prepareMaterial = (sourceMaterial: Material) => {
      const material = sourceMaterial.clone();
      if (color && material.name === "PlayerColor" && "color" in material) {
        (material.color as Color).set(color);
      }
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(prepareMaterial)
      : prepareMaterial(object.material);
  });
  return clone;
}

function prepareVolcanoModel(source: Object3D) {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const cloneMaterial = (sourceMaterial: Material) => sourceMaterial.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });
  const bounds = new Box3().setFromObject(clone);
  const center = bounds.getCenter(new Vector3());
  clone.position.set(-center.x, -bounds.min.y, -center.z);
  return clone;
}

function VolcanoModel({
  rotation,
  scale
}: {
  rotation: [number, number, number];
  scale: number;
}) {
  const { scene } = useGLTF(volcanoModelPath, "/draco/");
  const model = useMemo(() => prepareVolcanoModel(scene), [scene]);
  return (
    <group rotation={rotation} scale={scale}>
      <primitive object={model} />
    </group>
  );
}

function prepareWhirlpoolModel(source: Object3D) {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const prepareMaterial = (sourceMaterial: Material) => {
      const material = sourceMaterial.clone();
      material.transparent = true;
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(prepareMaterial)
      : prepareMaterial(object.material);
    object.castShadow = false;
    object.receiveShadow = true;
  });

  const bounds = new Box3().setFromObject(clone);
  const center = bounds.getCenter(new Vector3());
  clone.position.set(-center.x, -bounds.min.y, -center.z);
  return clone;
}

function AssetModel({
  name,
  color,
  animate = true,
  castShadow = true,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1
}: AssetModelProps) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(
    modelPath(name),
    name.endsWith("-hyper3d") ? "/draco/" : false
  );
  const model = useMemo(
    () => prepareModel(scene, color, castShadow),
    [castShadow, color, scene]
  );
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    if (!animate) return;
    Object.values(actions).forEach((action) => action?.reset().fadeIn(0.2).play());
    return () => Object.values(actions).forEach((action) => action?.fadeOut(0.15));
  }, [actions, animate]);

  return (
    <group ref={group} position={position} rotation={rotation} scale={scale}>
      <primitive object={model} />
    </group>
  );
}

function WhirlpoolEffect({ tile }: { tile: TileView }) {
  const root = useRef<Group>(null);
  const modelGroup = useRef<Group>(null);
  const materials = useRef<Material[]>([]);
  const elapsed = useRef(0);
  const { x, z } = hexToWorld(tile);
  const adjacentOffsets = useMemo(() => {
    const directions = [
      [1, 0], [1, -1], [0, -1],
      [-1, 0], [-1, 1], [0, 1]
    ] as const;
    return directions.map(([q, r]) => {
      const neighbor = hexToWorld({ q: tile.q + q, r: tile.r + r });
      return [neighbor.x - x, neighbor.z - z] as const;
    });
  }, [tile.q, tile.r, x, z]);
  const { scene } = useGLTF(whirlpoolModelPath, "/draco/");
  const model = useMemo(() => {
    const prepared = prepareWhirlpoolModel(scene);
    const nextMaterials: Material[] = [];
    prepared.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const values = Array.isArray(object.material) ? object.material : [object.material];
      nextMaterials.push(...values);
    });
    materials.current = nextMaterials;
    return prepared;
  }, [scene]);

  useFrame((_, delta) => {
    if (!root.current || !modelGroup.current) return;
    elapsed.current = Math.min(WHIRLPOOL_DURATION, elapsed.current + delta);
    const progress = elapsed.current / WHIRLPOOL_DURATION;
    const enter = Math.min(1, progress / 0.2);
    const exit = Math.max(0, Math.min(1, (progress - 0.72) / 0.28));
    const enterEase = enter * enter * (3 - 2 * enter);
    const exitEase = exit * exit;
    const scale = Math.max(0.01, enterEase * (1 - exitEase));

    root.current.scale.setScalar(scale);
    root.current.position.y = -0.5 - exitEase * 0.5;
    modelGroup.current.rotation.y += delta * (2.2 + progress * 5.5);
    materials.current.forEach((material) => {
      material.opacity = Math.max(0, 1 - exitEase);
    });
  });

  return (
    <group ref={root} position={[x, -0.5, z]} scale={0.01}>
      <group ref={modelGroup} rotation={[0, tileVariant(tile.id, 8) * Math.PI / 4, 0]} scale={0.9}>
        <primitive object={model} />
      </group>
      {[0.78, 1.08].map((radius, index) => (
        <mesh key={radius} rotation-x={-Math.PI / 2} position-y={0.16 + index * 0.018}>
          <ringGeometry args={[radius, radius + 0.07, 32]} />
          <meshBasicMaterial
            color={index === 0 ? "#e9ffff" : "#75deda"}
            transparent
            opacity={0.72 - index * 0.16}
            depthWrite={false}
          />
        </mesh>
      ))}
      {adjacentOffsets.map(([offsetX, offsetZ], neighborIndex) => (
        <group
          key={`${offsetX}-${offsetZ}`}
          position={[offsetX, 0.1, offsetZ]}
          rotation-y={neighborIndex * Math.PI / 3}
        >
          {[0.58, 0.84].map((radius, ringIndex) => (
            <mesh key={radius} rotation-x={-Math.PI / 2} position-y={ringIndex * 0.016}>
              <ringGeometry args={[radius, radius + 0.055, 24]} />
              <meshBasicMaterial
                color={ringIndex === 0 ? "#e8ffff" : "#68d7d5"}
                transparent
                opacity={0.54 - ringIndex * 0.16}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function HeroAssetModel({
  name,
  color,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1
}: Omit<AssetModelProps, "name" | "animate"> & { name: HeroModelName }) {
  const { scene } = useGLTF(heroModelPath(name));
  const model = useMemo(
    () => prepareHeroModel(scene, name, color),
    [color, name, scene]
  );

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={model} />
    </group>
  );
}

[
  "explorer",
  "shark",
  "kaiju",
  "sea-serpent",
  "raft",
  "rescue-dock-hyper3d",
  "terrain-beach",
  "terrain-forest",
  "terrain-mountain",
  "terrain-beach-hyper3d",
  "terrain-forest-hyper3d",
  "terrain-mountain-hyper3d"
].forEach((name) => useGLTF.preload(
  modelPath(name),
  name.endsWith("-hyper3d") ? "/draco/" : false
));

useGLTF.preload(whirlpoolModelPath, "/draco/");
useGLTF.preload(volcanoModelPath, "/draco/");

(["explorer", "shark", "sea-serpent", "kaiju", "raft"] satisfies HeroModelName[])
  .forEach((name) => useGLTF.preload(heroModelPath(name)));

function tileVariant(id: string, count: number) {
  let value = 0;
  for (const character of id) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value % count;
}

function Ocean({ stage }: { stage: DayStage }) {
  const mesh = useRef<Mesh>(null);
  const surfaceMaterial = useRef<MeshPhysicalMaterial>(null);
  const depthMaterial = useRef<MeshStandardMaterial>(null);
  const surfaceColor = useRef(new Color(stage.ocean));
  const depthColor = useRef(new Color(stage.oceanDepth));
  const targetSurface = useMemo(() => new Color(stage.ocean), [stage.ocean]);
  const targetDepth = useMemo(() => new Color(stage.oceanDepth), [stage.oceanDepth]);

  useFrame(({ clock }, delta) => {
    if (!mesh.current) return;
    mesh.current.position.y = -0.46 + Math.sin(clock.elapsedTime * 0.7) * 0.035;
    mesh.current.rotation.z = Math.sin(clock.elapsedTime * 0.09) * 0.015;
    surfaceColor.current.lerp(targetSurface, Math.min(1, delta * 0.8));
    depthColor.current.lerp(targetDepth, Math.min(1, delta * 0.8));
    surfaceMaterial.current?.color.copy(surfaceColor.current);
    depthMaterial.current?.color.copy(depthColor.current);
  });
  return (
    <group>
      <mesh ref={mesh} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[19, 128]} />
        <meshPhysicalMaterial
          ref={surfaceMaterial}
          color="#149bb2"
          roughness={0.16}
          metalness={0.08}
          clearcoat={0.72}
          clearcoatRoughness={0.2}
          transparent
          opacity={0.94}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.5}>
        <circleGeometry args={[20, 96]} />
        <meshStandardMaterial ref={depthMaterial} color="#064b64" roughness={0.72} />
      </mesh>
      {[7.8, 11.8, 15.8].map((radius) => (
        <mesh key={radius} rotation-x={-Math.PI / 2} position-y={-0.39}>
          <ringGeometry args={[radius, radius + 0.035, 128]} />
          <meshBasicMaterial color="#8be1df" transparent opacity={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function DayLighting({ stage }: { stage: DayStage }) {
  const ambient = useRef<AmbientLight>(null);
  const sunlight = useRef<DirectionalLight>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const background = useRef(new Color(stage.sky));
  const fog = useRef(new Color(stage.fog));
  const sunPosition = useRef(new Vector3(...stage.sun));
  const targetBackground = useMemo(() => new Color(stage.sky), [stage.sky]);
  const targetFog = useMemo(() => new Color(stage.fog), [stage.fog]);
  const targetSun = useMemo(() => new Vector3(...stage.sun), [stage.sun]);
  const targetSunColor = useMemo(() => new Color(stage.sunColor), [stage.sunColor]);
  const targetHemisphereSky = useMemo(() => new Color(stage.hemisphereSky), [stage.hemisphereSky]);
  const targetHemisphereGround = useMemo(() => new Color(stage.hemisphereGround), [stage.hemisphereGround]);

  useFrame(({ gl, scene }, delta) => {
    const colorStep = Math.min(1, delta * 0.75);
    background.current.lerp(targetBackground, colorStep);
    fog.current.lerp(targetFog, colorStep);
    scene.background = background.current;
    if (scene.fog) scene.fog.color.copy(fog.current);

    if (ambient.current) {
      ambient.current.intensity += (stage.ambient - ambient.current.intensity) * Math.min(1, delta * 0.8);
    }
    if (sunlight.current) {
      sunPosition.current.lerp(targetSun, Math.min(1, delta * 0.7));
      sunlight.current.position.copy(sunPosition.current);
      sunlight.current.color.lerp(targetSunColor, Math.min(1, delta * 0.9));
      sunlight.current.intensity += (stage.sunIntensity - sunlight.current.intensity) * Math.min(1, delta * 0.8);
    }
    if (hemisphere.current) {
      hemisphere.current.color.lerp(targetHemisphereSky, colorStep);
      hemisphere.current.groundColor.lerp(targetHemisphereGround, colorStep);
      hemisphere.current.intensity +=
        (stage.hemisphereIntensity - hemisphere.current.intensity) * Math.min(1, delta * 0.8);
    }
    gl.toneMappingExposure +=
      (stage.exposure - gl.toneMappingExposure) * Math.min(1, delta * 0.8);
  });

  return (
    <>
      <color attach="background" args={[stage.sky]} />
      <fog attach="fog" args={[stage.fog, 64, 136]} />
      <ambientLight ref={ambient} intensity={stage.ambient} />
      <directionalLight
        ref={sunlight}
        position={stage.sun}
        intensity={stage.sunIntensity}
        color={stage.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={80}
      />
      <hemisphereLight
        ref={hemisphere}
        args={[stage.hemisphereSky, stage.hemisphereGround, stage.hemisphereIntensity]}
      />
    </>
  );
}

function TerrainDetails({
  terrain,
  tileId,
  makeRoomForKaiju = false
}: {
  terrain: Terrain;
  tileId: string;
  makeRoomForKaiju?: boolean;
}) {
  const rotation = (tileVariant(tileId, 3) - 1) * (terrain === "beach" ? 0.14 : 0.12);
  const accommodation = makeRoomForKaiju
    ? { position: [-0.12, 0, -0.34] as [number, number, number], scale: 0.7 }
    : { position: [0, 0, 0] as [number, number, number], scale: 1 };
  if (terrain === "forest") {
    return (
      <group position={accommodation.position} scale={accommodation.scale}>
        <group position={[-0.12, 0.2, -0.1]}>
          <AssetModel name="terrain-forest-hyper3d" castShadow={false} rotation={[0, rotation, 0]} scale={0.82} />
        </group>
      </group>
    );
  }
  if (terrain === "mountain") {
    return (
      <group position={accommodation.position} scale={accommodation.scale}>
        <group position={[-0.08, 0.28, -0.08]}>
          <AssetModel name="terrain-mountain-hyper3d" castShadow={false} rotation={[0, rotation, 0]} scale={0.84} />
        </group>
      </group>
    );
  }
  return (
    <group position={accommodation.position} scale={accommodation.scale}>
      <group position={[-0.1, 0.2, -0.08]}>
        <AssetModel name="terrain-beach-hyper3d" castShadow={false} rotation={[0, rotation, 0]} scale={0.84} />
      </group>
    </group>
  );
}

const SINK_DURATION = 1.72;

function RouteGrid({ spaces, tiles }: { spaces: Array<TileView | WaterSpaceView>; tiles: TileView[] }) {
  const lines = useRef<LineSegments>(null);
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const space of spaces) {
      const { x, z } = hexToWorld(space);
      const tile = tiles.find((candidate) => candidate.id === space.id);
      const y = tile?.active
        ? tile.isRescue ? 0.04 : tile.terrain === "mountain" ? 0.37 : 0.23
        : -0.37;
      const corners = Array.from({ length: 6 }, (_, index) => {
        const angle = Math.PI / 6 + index * Math.PI / 3;
        return [x + Math.cos(angle) * 1.04, y, z + Math.sin(angle) * 1.04] as const;
      });
      corners.forEach((corner, index) => {
        const next = corners[(index + 1) % corners.length];
        positions.push(...corner, ...next);
      });
    }
    const result = new BufferGeometry();
    result.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return result;
  }, [spaces, tiles]);

  useLayoutEffect(() => {
    lines.current?.computeLineDistances();
    return () => geometry.dispose();
  }, [geometry]);

  return (
    <group>
      <lineSegments geometry={geometry} renderOrder={1}>
        <lineBasicMaterial color="#4d8f91" transparent opacity={0.34} depthWrite={false} />
      </lineSegments>
      <lineSegments ref={lines} geometry={geometry} renderOrder={2}>
        <lineDashedMaterial
          color="#effff5"
          dashSize={0.2}
          gapSize={0.1}
          transparent
          opacity={0.68}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

function SinkingTile({ tile }: { tile: TileView }) {
  const tileGroup = useRef<Group>(null);
  const markerGroup = useRef<Group>(null);
  const splashGroup = useRef<Group>(null);
  const markerMaterial = useRef<MeshBasicMaterial>(null);
  const splashMaterials = useRef<Array<MeshBasicMaterial | null>>([]);
  const elapsed = useRef(0);
  const { x, z } = hexToWorld(tile);
  const baseY = tile.terrain === "mountain" ? 0.1 : 0;

  useFrame((_, delta) => {
    elapsed.current = Math.min(SINK_DURATION, elapsed.current + delta);
    const progress = elapsed.current / SINK_DURATION;
    const anticipation = Math.min(1, progress / 0.2);
    const flipProgress = Math.max(0, Math.min(1, (progress - 0.16) / 0.48));
    const flipEase = flipProgress * flipProgress * (3 - 2 * flipProgress);
    const sinkProgress = Math.max(0, Math.min(1, (progress - 0.56) / 0.44));
    const sinkEase = sinkProgress * sinkProgress;

    if (tileGroup.current) {
      tileGroup.current.position.y = baseY + Math.sin(anticipation * Math.PI) * 0.2 - sinkEase * 1.5;
      tileGroup.current.rotation.x = flipEase * Math.PI * 0.94;
      tileGroup.current.rotation.y = Math.sin(progress * Math.PI * 4) * 0.035;
      tileGroup.current.scale.setScalar(1 - sinkEase * 0.16);
    }
    if (markerGroup.current) {
      markerGroup.current.scale.setScalar(1 + Math.sin(elapsed.current * 11) * 0.09);
      markerGroup.current.visible = progress < 0.58;
    }
    if (markerMaterial.current) markerMaterial.current.opacity = Math.max(0, 0.95 - progress * 1.45);
    if (splashGroup.current) {
      const splashProgress = Math.max(0, Math.min(1, (progress - 0.48) / 0.44));
      splashGroup.current.visible = splashProgress > 0;
      splashGroup.current.scale.setScalar(0.45 + splashProgress * 1.35);
      splashMaterials.current.forEach((material, index) => {
        if (material) material.opacity = Math.max(0, (0.72 - index * 0.14) * (1 - splashProgress));
      });
    }
  });

  return (
    <group position={[x, 0, z]}>
      <group ref={tileGroup} position-y={baseY}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[1.09, 1.12, tile.terrain === "mountain" ? 0.5 : 0.38, 6]} />
          <meshStandardMaterial
            color={terrainColor[tile.terrain]}
            roughness={0.82}
            emissive="#8b6515"
            emissiveIntensity={0.38}
          />
        </mesh>
        <mesh position-y={tile.terrain === "mountain" ? -0.25 : -0.19} receiveShadow>
          <cylinderGeometry args={[1.12, 1.02, 0.18, 6]} />
          <meshStandardMaterial color={terrainSideColor[tile.terrain]} roughness={0.96} />
        </mesh>
        <TerrainDetails terrain={tile.terrain} tileId={tile.id} />
      </group>
      <group ref={markerGroup} position-y={0.62} rotation-x={-Math.PI / 2}>
        <mesh>
          <ringGeometry args={[0.82, 1.08, 6]} />
          <meshBasicMaterial ref={markerMaterial} color="#ffe48a" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      </group>
      <group ref={splashGroup} position-y={-0.37} rotation-x={-Math.PI / 2} visible={false}>
        {[0.62, 0.82, 1.02].map((radius, index) => (
          <mesh key={radius} position-z={index * 0.006}>
            <ringGeometry args={[radius, radius + 0.075, 48]} />
            <meshBasicMaterial
              ref={(material) => { splashMaterials.current[index] = material; }}
              color={index === 0 ? "#e4ffff" : "#8de7e5"}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Tile({
  tile,
  highlighted,
  selected,
  kaijuPresent = false,
  suppressReveal,
  onClick
}: {
  tile: TileView;
  highlighted: boolean;
  selected: boolean;
  kaijuPresent?: boolean;
  suppressReveal?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { x, z } = hexToWorld(tile);
  if (!tile.active) {
    if (tile.revealedEffect !== "volcano" || suppressReveal) return null;
    return (
      <group
        position={[x, -0.28, z]}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        <VolcanoModel
          rotation={[0, tileVariant(tile.id, 8) * Math.PI / 4, 0]}
          scale={1.18}
        />
        <pointLight color="#ff5a19" intensity={5.5} distance={3.4} position={[0, 0.92, 0]} />
      </group>
    );
  }

  if (tile.isRescue) {
    return (
      <group position={[x, -0.18, z]} onClick={(event) => { event.stopPropagation(); onClick(); }}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.08}>
          <circleGeometry args={[1.18, 32]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
        <AssetModel
          name="rescue-dock-hyper3d"
          rotation={[0, Math.atan2(-x, -z), 0]}
          scale={0.86}
        />
        {highlighted && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.22} renderOrder={20}>
            <ringGeometry args={[0.82, 1.02, 32]} />
            <meshBasicMaterial
              color="#fff1a8"
              transparent
              opacity={0.92}
              depthTest={false}
              depthWrite={false}
              fog={false}
              toneMapped={false}
            />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group
      position={[x, tile.terrain === "mountain" ? 0.1 : 0, z]}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerEnter={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerLeave={() => {
        setHovered(false);
        document.body.style.cursor = "default";
      }}
    >
      <mesh castShadow receiveShadow scale-y={hovered || selected ? 1.08 : 1}>
        <cylinderGeometry args={[1.09, 1.12, tile.terrain === "mountain" ? 0.5 : 0.38, 6]} />
        <meshStandardMaterial
          color={terrainColor[tile.terrain]}
          roughness={0.82}
          emissive={selected ? "#685513" : "#000000"}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </mesh>
      <mesh position-y={tile.terrain === "mountain" ? -0.25 : -0.19} receiveShadow>
        <cylinderGeometry args={[1.12, 1.02, 0.18, 6]} />
        <meshStandardMaterial color={terrainSideColor[tile.terrain]} roughness={0.96} />
      </mesh>
      <TerrainDetails terrain={tile.terrain} tileId={tile.id} makeRoomForKaiju={kaijuPresent} />
      {(highlighted || selected) && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.28} renderOrder={20}>
          <ringGeometry args={[0.72, 0.86, 6]} />
          <meshBasicMaterial
            color={highlighted ? "#fff1a8" : "#ffffff"}
            transparent
            opacity={0.9}
            depthTest={!highlighted}
            depthWrite={false}
            fog={!highlighted}
            toneMapped={!highlighted}
          />
        </mesh>
      )}
    </group>
  );
}

function Explorer({
  explorer,
  color,
  index,
  selected,
  onClick,
  tiles,
  placement,
  showValue
}: {
  explorer: ExplorerView;
  color: string;
  index: number;
  selected: boolean;
  onClick: () => void;
  tiles: TileView[];
  placement?: UnitPlacement;
  showValue?: boolean;
}) {
  const tile = tiles.find((candidate) => candidate.id === explorer.locationId);
  if (!tile || explorer.lost) return null;
  const { x, z } = hexToWorld(tile);
  const raftSeats: Array<[number, number]> = [[-0.28, 0.16], [0.28, 0.16], [0, -0.28]];
  const raftSeat = raftSeats[index % raftSeats.length];
  const [offsetX, offsetZ] = explorer.raftId
    ? raftSeat
    : placement
      ? [placement.x, placement.z]
      : [0, 0];
  const terrainHeight = "terrain" in tile && tile.active
    ? tile.isRescue ? 0.16 : tile.terrain === "mountain" ? 0.36 : 0.2
    : -0.39;
  const facing = explorer.raftId || explorer.swimming
    ? 0
    : Math.atan2(-offsetX, -offsetZ);
  const modelRotation: [number, number, number] = explorer.swimming
    ? [-1.18, facing, 0]
    : [0, facing, 0];
  const modelScale = explorer.swimming ? 0.32 : 0.37;

  return (
    <Float
      speed={selected ? 4 : 1.4}
      rotationIntensity={0}
      floatIntensity={selected ? 0.16 : explorer.rescued ? 0 : explorer.swimming ? 0.06 : explorer.raftId ? 0.03 : 0}
    >
      <AnimatedMover
        position={[x + offsetX, explorer.raftId ? 0.23 : terrainHeight, z + offsetZ]}
        arc={explorer.swimming ? 0.08 : 0.18}
      >
        <group
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          scale={selected ? 1.18 : 1}
        >
          <HeroAssetModel name="explorer" color={color} rotation={modelRotation} scale={modelScale} />
          {explorer.swimming && (
            <group position-y={0.02}>
              <mesh rotation-x={-Math.PI / 2}>
                <ringGeometry args={[0.24, 0.29, 32]} />
                <meshBasicMaterial color="#c9fbf4" transparent opacity={0.8} depthWrite={false} />
              </mesh>
              <mesh rotation-x={-Math.PI / 2}>
                <ringGeometry args={[0.36, 0.39, 32]} />
                <meshBasicMaterial color="#8de6df" transparent opacity={0.48} depthWrite={false} />
              </mesh>
            </group>
          )}
          {!explorer.raftId && !explorer.swimming && (
            <mesh rotation-x={-Math.PI / 2} position-y={0.015}>
              <circleGeometry args={[0.22, 24]} />
              <meshBasicMaterial color={color} transparent opacity={0.72} />
            </mesh>
          )}
          {selected && (
            <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
              <ringGeometry args={[0.28, 0.36, 24]} />
              <meshBasicMaterial color="#fff0a4" transparent opacity={0.95} />
            </mesh>
          )}
          {showValue && explorer.value !== undefined && (
            <Html
              center
              position={[0, 0.72, 0]}
              distanceFactor={12}
              className="explorer-value-anchor"
              style={{ pointerEvents: "none" }}
            >
              <span className="explorer-value-badge">{explorer.value}</span>
            </Html>
          )}
        </group>
      </AnimatedMover>
    </Float>
  );
}

function WaterTarget({ space, highlighted, onClick }: { space: WaterSpaceView; highlighted: boolean; onClick: () => void }) {
  if (!highlighted) return null;
  const { x, z } = hexToWorld(space);
  return (
    <group
      position={[x, -0.18, z]}
      rotation-x={-Math.PI / 2}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
    >
      <mesh renderOrder={8}>
        <circleGeometry args={[1.02, 6]} />
        <meshBasicMaterial
          color="#fff1a8"
          transparent
          opacity={0.12}
          depthTest={false}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position-z={0.008} renderOrder={9}>
        <ringGeometry args={[0.58, 0.86, 6]} />
        <meshBasicMaterial
          color="#fff1a8"
          transparent
          opacity={0.94}
          depthTest={false}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function SunkenTileTarget({ tile, highlighted, onClick }: { tile: TileView; highlighted: boolean; onClick: () => void }) {
  if (!highlighted || tile.active || tile.blocked || tile.isRescue) return null;
  const { x, z } = hexToWorld(tile);
  return (
    <group position={[x, -0.4, z]} onClick={(event) => { event.stopPropagation(); onClick(); }}>
      <mesh rotation-x={-Math.PI / 2} renderOrder={20}>
        <circleGeometry args={[0.84, 32]} />
        <meshBasicMaterial
          color="#fff1a8"
          transparent
          opacity={0.08}
          depthTest={false}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.006} renderOrder={21}>
        <ringGeometry args={[0.62, 0.84, 6]} />
        <meshBasicMaterial
          color="#fff1a8"
          transparent
          opacity={0.9}
          depthTest={false}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function RaftPiece({ raft, space, selected, onClick }: { raft: RaftView; space: TileView | WaterSpaceView; selected: boolean; onClick: () => void }) {
  const { x, z } = hexToWorld(space);
  return (
    <AnimatedMover position={[x, -0.02, z]} arc={0.08} duration={0.72}>
      <group
        rotation-y={0.35}
        scale={selected ? 1.12 : 1}
        onClick={(event) => { event.stopPropagation(); onClick(); }}
      >
        <HeroAssetModel name="raft" scale={0.7} />
        {selected && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
            <ringGeometry args={[0.68, 0.82, 24]} />
            <meshBasicMaterial color="#fff0a4" transparent opacity={0.95} />
          </mesh>
        )}
      </group>
    </AnimatedMover>
  );
}

function CreaturePiece({
  creature,
  space,
  selected,
  onClick,
  placement
}: {
  creature: CreatureView;
  space: TileView | WaterSpaceView;
  selected: boolean;
  onClick: () => void;
  placement?: UnitPlacement;
}) {
  const { x, z } = hexToWorld(space);
  const activeLand = "terrain" in space && space.active && !space.isRescue;
  const landHeight = activeLand ? (space.terrain === "mountain" ? 0.56 : 0.36) : 0;
  const settings = creature.type === "shark"
    ? { name: "shark" as const, scale: 0.7, y: 0.02, rotation: -0.5, x: 0, z: 0 }
    : creature.type === "sea-serpent"
      ? { name: "sea-serpent" as const, scale: 0.72, y: 0.02, rotation: 0.35, x: 0, z: 0 }
      : {
          name: "kaiju" as const,
          scale: activeLand ? 0.5 : 0.62,
          y: activeLand ? landHeight : 0.12,
          rotation: 0.15,
          x: activeLand ? 0.12 : (placement?.x ?? 0) * 0.45,
          z: activeLand ? 0.34 : (placement?.z ?? 0) * 0.45
        };
  if (creature.type !== "kaiju") {
    settings.x = (placement?.x ?? 0) * 0.45;
    settings.z = (placement?.z ?? 0) * 0.45;
  }
  return (
    <Float speed={1.8} floatIntensity={0.12} rotationIntensity={0.08}>
      <AnimatedMover
        position={[x + settings.x, settings.y, z + settings.z]}
        arc={creature.type === "kaiju" ? 0.22 : 0.1}
        duration={creature.type === "kaiju" ? 0.78 : 0.66}
      >
        <group
          scale={selected ? 1.2 : 1}
          onClick={(event) => { event.stopPropagation(); onClick(); }}
        >
          <HeroAssetModel
            name={settings.name}
            rotation={[0, settings.rotation + tileVariant(creature.id, 8) * Math.PI / 4, 0]}
            scale={settings.scale}
          />
          {creature.type === "kaiju" && (
            <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
              <circleGeometry args={[activeLand ? 0.44 : 0.52, 28]} />
              <meshBasicMaterial color="#173d70" transparent opacity={0.55} />
            </mesh>
          )}
          {selected && (
            <mesh rotation-x={-Math.PI / 2} position-y={-0.04}>
              <ringGeometry args={[0.66, 0.8, 28]} />
              <meshBasicMaterial color="#fff0a4" transparent opacity={0.95} />
            </mesh>
          )}
        </group>
      </AnimatedMover>
    </Float>
  );
}

function normalizeDieFaceBackground(source: Texture) {
  const image = source.image as HTMLImageElement;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return source;

  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const seedRed = pixels[0];
  const seedGreen = pixels[1];
  const seedBlue = pixels[2];
  let head = 0;
  let tail = 1;
  queue[0] = 0;
  visited[0] = 1;

  while (head < tail) {
    const pixelIndex = queue[head++];
    const offset = pixelIndex * 4;
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const neighbors = [
      x > 0 ? pixelIndex - 1 : -1,
      x < width - 1 ? pixelIndex + 1 : -1,
      y > 0 ? pixelIndex - width : -1,
      y < height - 1 ? pixelIndex + width : -1
    ];
    neighbors.forEach((neighbor) => {
      if (neighbor < 0 || visited[neighbor]) return;
      const neighborOffset = neighbor * 4;
      const matchesBackground =
        Math.abs(pixels[neighborOffset] - seedRed) <= 18 &&
        Math.abs(pixels[neighborOffset + 1] - seedGreen) <= 18 &&
        Math.abs(pixels[neighborOffset + 2] - seedBlue) <= 18;
      if (!matchesBackground) return;
      visited[neighbor] = 1;
      queue[tail++] = neighbor;
    });
  }

  context.putImageData(imageData, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = source.flipY;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.magFilter = source.magFilter;
  texture.minFilter = source.minFilter;
  texture.generateMipmaps = source.generateMipmaps;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function useDieFaceTextures() {
  const [serpentTexture, sharkTexture, kaijuTexture] = useTexture([
    "/assets/ui/dice/sea-serpent.png",
    "/assets/ui/dice/shark.png",
    "/assets/ui/dice/kaiju.png"
  ]);
  const faceTextures = useMemo(() => {
    return {
      serpent: normalizeDieFaceBackground(serpentTexture),
      shark: normalizeDieFaceBackground(sharkTexture),
      kaiju: normalizeDieFaceBackground(kaijuTexture)
    };
  }, [kaijuTexture, serpentTexture, sharkTexture]);
  useEffect(() => () => {
    Object.values(faceTextures).forEach((texture) => {
      if (texture !== serpentTexture && texture !== sharkTexture && texture !== kaijuTexture) {
        texture.dispose();
      }
    });
  }, [faceTextures, kaijuTexture, serpentTexture, sharkTexture]);
  return faceTextures;
}

function CreatureDieRoll({
  roll,
  rollId,
  rolledAt,
  faceTextures
}: {
  roll: CreatureRoll;
  rollId: number;
  rolledAt: string;
  faceTextures: ReturnType<typeof useDieFaceTextures>;
}) {
  const die = useRef<Group>(null);
  const elapsed = useRef(0);
  const isRecent = () => Date.now() - new Date(rolledAt).getTime() < 6000;
  const [visible, setVisible] = useState(isRecent);
  const finalRotation: [number, number, number] = roll === "sea-serpent"
    ? [0, 0, Math.PI / 2]
    : roll === "shark"
      ? [0, 0, 0]
      : [-Math.PI / 2, 0, 0];

  useEffect(() => {
    elapsed.current = 0;
    setVisible(isRecent());
    const timer = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [rollId, rolledAt]);

  useFrame((_, delta) => {
    if (!die.current || !visible) return;
    elapsed.current += delta;
    const rolling = Math.min(1, elapsed.current / 1.35);
    if (rolling < 1) {
      die.current.position.y = 4.8 + Math.sin(rolling * Math.PI) * 2.6;
      die.current.rotation.x += delta * 8.4;
      die.current.rotation.y += delta * 10.2;
      die.current.rotation.z += delta * 6.6;
      die.current.scale.setScalar(0.72 + Math.sin(rolling * Math.PI) * 0.18);
      return;
    }
    const settleStep = Math.min(1, delta * 7);
    die.current.position.y += (4.8 - die.current.position.y) * settleStep;
    die.current.rotation.x += (finalRotation[0] - die.current.rotation.x) * settleStep;
    die.current.rotation.y += (finalRotation[1] - die.current.rotation.y) * settleStep;
    die.current.rotation.z += (finalRotation[2] - die.current.rotation.z) * settleStep;
    die.current.scale.lerp(new Vector3(0.86, 0.86, 0.86), settleStep);
  });

  if (!visible) return null;
  return (
    <group ref={die} position={[0, 4.8, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.65, 1.65, 1.65]} />
        <meshStandardMaterial attach="material-0" color="#ffffff" map={faceTextures.serpent} roughness={0.42} />
        <meshStandardMaterial attach="material-1" color="#ffffff" map={faceTextures.serpent} roughness={0.42} />
        <meshStandardMaterial attach="material-2" color="#ffffff" map={faceTextures.shark} roughness={0.42} />
        <meshStandardMaterial attach="material-3" color="#ffffff" map={faceTextures.shark} roughness={0.42} />
        <meshStandardMaterial attach="material-4" color="#ffffff" map={faceTextures.kaiju} roughness={0.42} />
        <meshStandardMaterial attach="material-5" color="#ffffff" map={faceTextures.kaiju} roughness={0.42} />
        <Edges color="#ffffff" threshold={10} />
      </mesh>
    </group>
  );
}

function PreviewIsland() {
  const coords = useMemo(() => createIslandCoords(40, { excludeCenter: true }), []);
  return (
    <>
      {coords.map((coord, index) => {
        const terrain: Terrain = index % 7 === 0 ? "mountain" : index % 3 === 0 ? "forest" : "beach";
        return <Tile key={hexKeySafe(coord)} tile={{ ...coord, id: `preview-${index}`, terrain, active: true, sinking: false }} highlighted={false} selected={false} onClick={() => undefined} />;
      })}
    </>
  );
}

const hexKeySafe = ({ q, r }: { q: number; r: number }) => `${q}:${r}`;

function roundAxial(q: number, r: number) {
  let cubeX = q;
  let cubeZ = r;
  let cubeY = -cubeX - cubeZ;
  let roundedX = Math.round(cubeX);
  let roundedY = Math.round(cubeY);
  let roundedZ = Math.round(cubeZ);
  const xDiff = Math.abs(roundedX - cubeX);
  const yDiff = Math.abs(roundedY - cubeY);
  const zDiff = Math.abs(roundedZ - cubeZ);
  if (xDiff > yDiff && xDiff > zDiff) roundedX = -roundedY - roundedZ;
  else if (yDiff > zDiff) roundedY = -roundedX - roundedZ;
  else roundedZ = -roundedX - roundedY;
  return { q: roundedX, r: roundedZ };
}

function MarkerPointerController({
  spaces,
  onPlace
}: {
  spaces: Array<TileView | WaterSpaceView>;
  onPlace: (locationId: string) => void;
}) {
  const { camera, gl } = useThree();
  const spacesRef = useRef(spaces);
  const onPlaceRef = useRef(onPlace);
  spacesRef.current = spaces;
  onPlaceRef.current = onPlace;

  useEffect(() => {
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const boardPlane = new Plane(new Vector3(0, 1, 0), 0);
    const intersection = new Vector3();
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !useGameStore.getState().markerHotkeyPressed) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("button, input, textarea, .game-topbar, .score-panel, .event-panel, .log-dialog, .result-panel")
      ) return;
      const rect = gl.domElement.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) return;
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(boardPlane, intersection)) return;
      const localX = intersection.x / BOARD_SCALE;
      const localZ = intersection.z / BOARD_SCALE;
      const size = 1.12;
      const axial = roundAxial(
        (Math.sqrt(3) / 3 * localX - localZ / 3) / size,
        (2 / 3 * localZ) / size
      );
      const location = spacesRef.current.find((space) => space.q === axial.q && space.r === axial.r);
      if (!location) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onPlaceRef.current(location.id);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [camera, gl]);

  return null;
}

function MapMarker({ color, name }: { color: string; name: string }) {
  const pointer = useRef<Group>(null);
  const target = useRef<Group>(null);

  useFrame(({ clock }) => {
    const pulse = (Math.sin(clock.elapsedTime * 4.5) + 1) / 2;
    if (pointer.current) pointer.current.position.y = 2.08 + pulse * 0.12;
    if (target.current) target.current.scale.setScalar(0.92 + pulse * 0.18);
  });

  const overlayMaterial = {
    depthTest: false,
    depthWrite: false,
    transparent: true
  } as const;

  return (
    <group>
      <group ref={target} position-y={0.58} rotation-x={-Math.PI / 2}>
        <mesh renderOrder={98}>
          <ringGeometry args={[0.34, 0.54, 32]} />
          <meshBasicMaterial color="#ffffff" opacity={0.92} {...overlayMaterial} />
        </mesh>
        <mesh position-z={0.012} renderOrder={99}>
          <ringGeometry args={[0.4, 0.49, 32]} />
          <meshBasicMaterial color={color} opacity={1} {...overlayMaterial} />
        </mesh>
      </group>
      <group ref={pointer} position-y={2.08}>
        <mesh position-y={-0.7} renderOrder={98}>
          <cylinderGeometry args={[0.035, 0.035, 1.08, 10]} />
          <meshBasicMaterial color="#ffffff" opacity={0.9} {...overlayMaterial} />
        </mesh>
        <mesh position-y={-1.18} rotation-z={Math.PI} renderOrder={99}>
          <coneGeometry args={[0.2, 0.46, 20]} />
          <meshBasicMaterial color={color} opacity={1} {...overlayMaterial} />
        </mesh>
        <mesh renderOrder={98}>
          <sphereGeometry args={[0.3, 24, 16]} />
          <meshBasicMaterial color="#ffffff" opacity={0.96} {...overlayMaterial} />
        </mesh>
        <mesh renderOrder={99}>
          <sphereGeometry args={[0.23, 24, 16]} />
          <meshBasicMaterial color={color} opacity={1} {...overlayMaterial} />
        </mesh>
        <Html center position={[0, 0.56, 0]} distanceFactor={14} zIndexRange={[1000, 900]}>
          <span className="map-marker-label" style={{ "--marker-color": color } as CSSProperties}>
            {name}
          </span>
        </Html>
      </group>
    </group>
  );
}

export function BoardScene({ room }: { room: PublicRoomState | null }) {
  const dieFaceTextures = useDieFaceTextures();
  const {
    clientId, role, selectedExplorerId, selectedRaftId, selectedCreatureId,
    activeAbility, markerHotkeyPressed,
    selectExplorer, selectRaft, selectCreature, setActiveAbility, showNotice
  } = useGameStore(useShallow((state) => ({
    clientId: state.clientId,
    role: state.role,
    selectedExplorerId: state.selectedExplorerId,
    selectedRaftId: state.selectedRaftId,
    selectedCreatureId: state.selectedCreatureId,
    activeAbility: state.activeAbility,
    markerHotkeyPressed: state.markerHotkeyPressed,
    selectExplorer: state.selectExplorer,
    selectRaft: state.selectRaft,
    selectCreature: state.selectCreature,
    setActiveAbility: state.setActiveAbility,
    showNotice: state.showNotice
  })));
  const selectedExplorer = room?.explorers.find((explorer) => explorer.id === selectedExplorerId);
  const allSpaces = room ? [...room.tiles, ...room.waterSpaces] : [];
  const selectedTile = allSpaces.find((tile) => tile.id === selectedExplorer?.locationId);
  const selectedRaft = room?.rafts.find((raft) => raft.id === selectedRaftId);
  const selectedRaftSpace = allSpaces.find((space) => space.id === selectedRaft?.locationId);
  const selectedCreature = room?.creatures.find((creature) => creature.id === selectedCreatureId);
  const selectedCreatureSpace = allSpaces.find((space) => space.id === selectedCreature?.locationId);
  const myTurn = room?.currentPlayerId === clientId && role === "player";
  const terrainRank: Record<Terrain, number> = { beach: 0, forest: 1, mountain: 2 };
  const previousTiles = useRef<Map<string, TileView> | null>(null);
  const sinkTimers = useRef(new Map<string, number>());
  const whirlpoolTimers = useRef(new Map<string, number>());
  const [sinkingTiles, setSinkingTiles] = useState<TileView[]>([]);
  const [whirlpoolEffects, setWhirlpoolEffects] = useState<Array<{ id: string; tileId: string }>>([]);
  const [sinkRequestPending, setSinkRequestPending] = useState(false);
  const dayStage = dayStageFor(room);

  useEffect(() => {
    if (!room) {
      previousTiles.current = null;
      setSinkingTiles([]);
      setWhirlpoolEffects([]);
      setSinkRequestPending(false);
      return;
    }
    const nextTiles = new Map(room.tiles.map((tile) => [tile.id, tile]));
    const previous = previousTiles.current;
    if (previous) {
      const newlySunk = room.tiles
        .filter((tile) => !tile.active && previous.get(tile.id)?.active)
        .map((tile) => previous.get(tile.id)!)
        .filter((tile) => !tile.isRescue);
      if (newlySunk.length) {
        setSinkRequestPending(false);
        setSinkingTiles((current) => [
          ...current.filter((tile) => !newlySunk.some((next) => next.id === tile.id)),
          ...newlySunk
        ]);
        newlySunk.forEach((tile) => {
          const existing = sinkTimers.current.get(tile.id);
          if (existing) window.clearTimeout(existing);
          const timer = window.setTimeout(() => {
            sinkTimers.current.delete(tile.id);
            setSinkingTiles((current) => current.filter((item) => item.id !== tile.id));
          }, SINK_DURATION * 1000);
          sinkTimers.current.set(tile.id, timer);
        });

        const newWhirlpools = room.tiles
          .filter((tile) =>
            !tile.active &&
            tile.revealedEffect === "whirlpool" &&
            previous.get(tile.id)?.active
          )
          .map((tile) => ({ id: `${tile.id}-${room.revision}`, tileId: tile.id }));
        if (newWhirlpools.length) {
          setWhirlpoolEffects((current) => [...current, ...newWhirlpools]);
          newWhirlpools.forEach(({ id }) => {
            const timer = window.setTimeout(() => {
              whirlpoolTimers.current.delete(id);
              setWhirlpoolEffects((current) => current.filter((effect) => effect.id !== id));
            }, WHIRLPOOL_DURATION * 1000);
            whirlpoolTimers.current.set(id, timer);
          });
        }
      }
    }
    previousTiles.current = nextTiles;
  }, [room]);

  useEffect(() => () => {
    sinkTimers.current.forEach((timer) => window.clearTimeout(timer));
    sinkTimers.current.clear();
    whirlpoolTimers.current.forEach((timer) => window.clearTimeout(timer));
    whirlpoolTimers.current.clear();
  }, []);

  const sinkingTileIds = useMemo(() => new Set(sinkingTiles.map((tile) => tile.id)), [sinkingTiles]);
  const sinkAnimationLocked = sinkRequestPending || sinkingTiles.length > 0;
  const creatureRollEvent = room?.events.find((event) => event.id === room.creatureRollId);
  const unitPlacements = useMemo(() => {
    const placements = new Map<string, UnitPlacement>();
    if (!room) return placements;

    for (const space of allSpaces) {
      const tile = room.tiles.find((candidate) => candidate.id === space.id);
      const slots = tile?.active ? landUnitSlots : waterUnitSlots;
      const units = [
        ...room.creatures
          .filter((creature) => creature.locationId === space.id)
          .map((creature) => ({
            id: creature.id,
            priority: creature.type === "kaiju" ? 0 : creature.type === "sea-serpent" ? 1 : 2
          })),
        ...room.explorers
          .filter((explorer) =>
            explorer.locationId === space.id &&
            !explorer.raftId &&
            !explorer.lost &&
            !explorer.rescued
          )
          .map((explorer) => ({ id: explorer.id, priority: 3 }))
      ].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

      units.forEach((unit, index) => {
        const slot = slots[index % slots.length];
        placements.set(unit.id, { x: slot[0], z: slot[1] });
      });
    }
    return placements;
  }, [allSpaces, room]);
  const moveTargets = useMemo(() => {
    if (!room || !myTurn) return new Set<string>();
    if (room.turnPhase === "setup-explorer") {
      const placed = room.explorers.filter((explorer) => explorer.locationId).length;
      return new Set(room.tiles.filter((tile) => {
        if (!tile.active || tile.isRescue) return false;
        const count = room.explorers.filter((explorer) => explorer.locationId === tile.id).length;
        return count < (room.players.length === 5 && placed >= 40 ? 2 : 1);
      }).map((tile) => tile.id));
    }
    if (room.turnPhase === "setup-raft") {
      return new Set(room.waterSpaces.filter((space) =>
        !room.rafts.some((raft) => raft.locationId === space.id) &&
        !room.creatures.some((creature) =>
          creature.type === "sea-serpent" && creature.locationId === space.id
        ) &&
        room.tiles.some((tile) => tile.active && !tile.isRescue && areAdjacent(space, tile))
      ).map((space) => space.id));
    }
    if (room.pendingChoice?.type === "displace") {
      return new Set(room.pendingChoice.allowedTargetIds ?? []);
    }
    if (room.turnPhase === "creature-move" && selectedCreature && selectedCreatureSpace) {
      const maxSteps = room.pendingChoice?.type === "move-creature"
        ? room.pendingChoice.stepsRemaining ?? 0
        : 0;
      const hasCreatureInteraction = (locationId: string) => {
        const explorers = room.explorers.filter((explorer) =>
          explorer.locationId === locationId &&
          !explorer.lost &&
          !explorer.rescued
        );
        if (selectedCreature.type === "sea-serpent") {
          return explorers.length > 0 || room.rafts.some((raft) => raft.locationId === locationId);
        }
        if (selectedCreature.type === "shark") {
          return explorers.some((explorer) => explorer.swimming);
        }
        return explorers.length > 0 ||
          room.rafts.some((raft) => raft.locationId === locationId) ||
          room.creatures.some((creature) =>
            creature.id !== selectedCreature.id && creature.locationId === locationId
          );
      };
      const reachable = new Set<string>();
      let frontier = new Set([selectedCreature.locationId]);
      for (let step = 0; step < maxSteps; step += 1) {
        const next = new Set<string>();
        for (const fromId of frontier) {
          const from = allSpaces.find((space) => space.id === fromId);
          if (!from) continue;
          for (const space of allSpaces) {
            const land = room.tiles.find((tile) => tile.id === space.id);
            const legal = areAdjacent(from, space) && !land?.isRescue &&
              (selectedCreature.type === "kaiju" ||
                room.waterSpaces.some((water) => water.id === space.id) ||
                Boolean(land && !land.active && !land.blocked)) &&
              !(selectedCreature.type !== "kaiju" && room.creatures.some((creature) =>
                creature.type === "kaiju" && creature.locationId === space.id
              )) &&
              !(selectedCreature.type === "kaiju" && room.creatures.some((creature) =>
                creature.id !== selectedCreature.id &&
                creature.type === "kaiju" &&
                creature.locationId === space.id
              ));
            if (!legal || reachable.has(space.id) || space.id === selectedCreature.locationId) continue;
            reachable.add(space.id);
            if (!hasCreatureInteraction(space.id)) next.add(space.id);
          }
        }
        frontier = next;
      }
      return reachable;
    }
    if (room.turnPhase !== "action") return new Set<string>();
    if (activeAbility === "paddles" && selectedRaft && selectedRaftSpace) {
      const aboardIds = room.explorers
        .filter((explorer) => explorer.raftId === selectedRaft.id && !explorer.lost && !explorer.rescued)
        .map((explorer) => explorer.id);
      const isWaterSpace = (space: TileView | WaterSpaceView) =>
        room.waterSpaces.some((water) => water.id === space.id) ||
        room.tiles.some((tile) => tile.id === space.id && !tile.active && !tile.blocked);
      const hasCapacity = (locationId: string) =>
        room.explorers.filter((explorer) =>
          explorer.locationId === locationId &&
          !explorer.lost &&
          !aboardIds.includes(explorer.id)
        ).length + aboardIds.length <= EXPLORER_SPACE_CAPACITY;
      return new Set(allSpaces.filter((space) => {
        const distance = Math.max(
          Math.abs(selectedRaftSpace.q - space.q),
          Math.abs(selectedRaftSpace.r - space.r),
          Math.abs(selectedRaftSpace.q + selectedRaftSpace.r - space.q - space.r)
        );
        if (distance < 1 || distance > 2 || !isWaterSpace(space)) return false;
        if (
          room.rafts.some((raft) => raft.locationId === space.id) ||
          room.creatures.some((creature) => creature.type === "kaiju" && creature.locationId === space.id) ||
          !hasCapacity(space.id)
        ) return false;
        if (distance === 1) return true;
        return allSpaces.some((middle) =>
          areAdjacent(selectedRaftSpace, middle) &&
          areAdjacent(middle, space) &&
          isWaterSpace(middle) &&
          !room.rafts.some((raft) => raft.locationId === middle.id) &&
          !room.creatures.some((creature) =>
            (creature.type === "kaiju" || creature.type === "sea-serpent") &&
            creature.locationId === middle.id
          ) &&
          hasCapacity(middle.id)
        );
      }).map((space) => space.id));
    }
    if (activeAbility === "dolphin" && selectedExplorer?.swimming && selectedTile) {
      const isWaterSpace = (space: TileView | WaterSpaceView) =>
        room.waterSpaces.some((water) => water.id === space.id) ||
        room.tiles.some((tile) => tile.id === space.id && !tile.active && !tile.blocked);
      const hasCapacity = (locationId: string) =>
        room.explorers.filter((explorer) =>
          explorer.locationId === locationId &&
          !explorer.lost &&
          explorer.id !== selectedExplorer.id
        ).length < EXPLORER_SPACE_CAPACITY;
      return new Set(allSpaces.filter((space) => {
        const distance = Math.max(
          Math.abs(selectedTile.q - space.q),
          Math.abs(selectedTile.r - space.r),
          Math.abs(selectedTile.q + selectedTile.r - space.q - space.r)
        );
        const targetTile = room.tiles.find((tile) => tile.id === space.id);
        const targetRaft = room.rafts.find((raft) => raft.locationId === space.id);
        if (
          distance < 1 ||
          distance > 2 ||
          targetTile?.isRescue ||
          targetTile?.blocked ||
          room.creatures.some((creature) => creature.type === "kaiju" && creature.locationId === space.id) ||
          !hasCapacity(space.id) ||
          Boolean(targetRaft && room.explorers.filter((explorer) => explorer.raftId === targetRaft.id).length >= 3)
        ) return false;
        if (distance === 1) return true;
        return allSpaces.some((middle) =>
          areAdjacent(selectedTile, middle) &&
          areAdjacent(middle, space) &&
          isWaterSpace(middle) &&
          !room.rafts.some((raft) => raft.locationId === middle.id) &&
          !room.creatures.some((creature) => creature.locationId === middle.id) &&
          hasCapacity(middle.id)
        );
      }).map((space) => space.id));
    }
    if (activeAbility === "dive" && selectedCreature) {
      return new Set(room.waterSpaces.filter((space) =>
        !room.creatures.some((creature) => creature.locationId === space.id) &&
        !room.explorers.some((explorer) =>
          explorer.locationId === space.id && !explorer.rescued && !explorer.lost
        ) &&
        !room.rafts.some((raft) => raft.locationId === space.id)
      ).map((space) => space.id));
    }
    if (selectedExplorer && selectedTile) return new Set(allSpaces.filter((space) => {
      if (!areAdjacent(selectedTile, space)) return false;
      const targetTile = room.tiles.find((tile) => tile.id === space.id);
      if (
        targetTile?.blocked ||
        room.creatures.some((creature) => creature.type === "kaiju" && creature.locationId === space.id) ||
        (targetTile?.isRescue && !selectedExplorer.raftId)
      ) return false;
      if (!targetTile?.isRescue && room.explorers.filter((explorer) =>
        explorer.locationId === space.id &&
        !explorer.lost &&
        explorer.id !== selectedExplorer.id
      ).length >= EXPLORER_SPACE_CAPACITY) return false;
      const destinationRaft = room.rafts.find((raft) => raft.locationId === space.id);
      if (destinationRaft && room.explorers.filter((explorer) =>
        explorer.raftId === destinationRaft.id &&
        !explorer.lost &&
        !explorer.rescued
      ).length >= 3) return false;
      const sourceStable = Boolean(
        selectedExplorer.raftId ||
        room.tiles.some((tile) => tile.id === selectedExplorer.locationId && tile.active)
      );
      const targetStable = Boolean(destinationRaft || targetTile?.active);
      return !(!sourceStable || !targetStable) || !selectedExplorer.swamThisTurn;
    }).map((space) => space.id));
    if (selectedRaft && selectedRaftSpace) {
      const aboardIds = room.explorers
        .filter((explorer) => explorer.raftId === selectedRaft.id && !explorer.lost && !explorer.rescued)
        .map((explorer) => explorer.id);
      return new Set(allSpaces.filter((space) =>
        areAdjacent(selectedRaftSpace, space) &&
        (room.waterSpaces.some((water) => water.id === space.id) || room.tiles.some((tile) => tile.id === space.id && !tile.active && !tile.blocked)) &&
        !room.rafts.some((raft) => raft.locationId === space.id) &&
        !room.creatures.some((creature) => creature.type === "kaiju" && creature.locationId === space.id) &&
        room.explorers.filter((explorer) =>
          explorer.locationId === space.id &&
          !explorer.lost &&
          !aboardIds.includes(explorer.id)
        ).length + aboardIds.length <= EXPLORER_SPACE_CAPACITY
      ).map((space) => space.id));
    }
    return new Set<string>();
  }, [activeAbility, allSpaces, myTurn, room, selectedCreature, selectedCreatureSpace, selectedExplorer, selectedRaft, selectedRaftSpace, selectedTile]);

  const sinkTargets = useMemo(() => {
    if (!room || !myTurn || room.turnPhase !== "rising") return new Set<string>();
    const activeIsland = room.tiles.filter((tile) => tile.active && !tile.isRescue);
    const lowest = Math.min(...activeIsland.map((tile) => terrainRank[tile.terrain]));
    return new Set(activeIsland.filter((tile) => terrainRank[tile.terrain] === lowest).map((tile) => tile.id));
  }, [myTurn, room]);

  const handleTileClick = (tile: TileView) => {
    if (!room) return;
    if (useGameStore.getState().markerHotkeyPressed) {
      placeMarker(tile.id);
      return;
    }
    if (myTurn && room.turnPhase === "setup-explorer" && moveTargets.has(tile.id)) {
      socket.emit("placeExplorer", tile.id, (result) => !result.ok && showNotice(result.error ?? "放置失败"));
      return;
    }
    if (sinkTargets.has(tile.id)) {
      if (sinkAnimationLocked) {
        showNotice("等待当前地块完成下沉");
        return;
      }
      setSinkRequestPending(true);
      socket.emit("sinkTile", tile.id, (result) => {
        if (!result.ok) {
          setSinkRequestPending(false);
          showNotice(result.error ?? "无法翻开这个格子");
        }
      });
      return;
    }
    handleTarget(tile.id);
  };

  const handleTarget = (targetId: string) => {
    if (!room) return;
    if (useGameStore.getState().markerHotkeyPressed) {
      placeMarker(targetId);
      return;
    }
    if (!moveTargets.has(targetId)) return;
    if (room.pendingChoice?.type === "displace") {
      socket.emit("resolveDisplacement", targetId, (result) => {
        if (!result.ok) showNotice(result.error ?? "推离失败");
      });
    } else if (activeAbility) {
      const actorId = activeAbility === "paddles" ? selectedRaftId :
        activeAbility === "dolphin" ? selectedExplorerId : selectedCreatureId;
      socket.emit("useAbility", { ability: activeAbility, actorId: actorId ?? undefined, targetId }, (result) => {
        if (!result.ok) showNotice(result.error ?? "能力使用失败");
        else {
          setActiveAbility(null);
          selectExplorer(null);
        }
      });
    } else if (room.turnPhase === "setup-raft") {
      socket.emit("placeRaft", targetId, (result) => !result.ok && showNotice(result.error ?? "放置失败"));
    } else if (room.turnPhase === "creature-move" && selectedCreatureId) {
      socket.emit("moveCreature", { creatureId: selectedCreatureId, targetId, revision: room.revision }, (result) => {
        if (!result.ok) showNotice(result.error ?? "生物移动失败"); else selectCreature(null);
      });
    } else if (selectedExplorerId) {
      socket.emit("moveExplorer", { explorerId: selectedExplorerId, targetId, revision: room.revision }, (result) => {
        if (!result.ok) showNotice(result.error ?? "移动失败"); else selectExplorer(null);
      });
    } else if (selectedRaftId) {
      socket.emit("moveRaft", { raftId: selectedRaftId, targetId, revision: room.revision }, (result) => {
        if (!result.ok) showNotice(result.error ?? "木筏移动失败"); else selectRaft(null);
      });
    }
  };

  const placeMarker = (locationId: string) => {
    const ownMarker = room?.markers.find((marker) => marker.playerId === clientId);
    socket.emit("setMapMarker", ownMarker?.locationId === locationId ? null : locationId, (result) => {
      if (!result.ok) showNotice(result.error ?? "标记失败");
    });
  };

  const handleRaftClick = (raft: RaftView) => {
    if (!room || !myTurn) return;
    if (room.pendingChoice?.type === "displace" && moveTargets.has(raft.locationId)) {
      handleTarget(raft.locationId);
      return;
    }
    if (room.turnPhase !== "action") return;
    if (selectedExplorerId && moveTargets.has(raft.locationId)) {
      handleTarget(raft.locationId);
      return;
    }
    selectRaft(raft.id === selectedRaftId ? null : raft.id);
  };

  return (
    <>
      <DayLighting stage={dayStage} />
      {room && (
        <MarkerPointerController
          spaces={allSpaces}
          onPlace={placeMarker}
        />
      )}
      <group scale={BOARD_SCALE}>
        <Ocean stage={dayStage} />
        {room && <RouteGrid spaces={allSpaces} tiles={room.tiles} />}
        <Sparkles count={80} scale={[20, 1, 20]} size={1.4} speed={0.2} color={dayStage.sparkle} position-y={0.1} />
        {room?.creatureRoll && room.creatureRollId > 0 && creatureRollEvent && (
          <CreatureDieRoll
            key={room.creatureRollId}
            roll={room.creatureRoll}
            rollId={room.creatureRollId}
            rolledAt={creatureRollEvent.at}
            faceTextures={dieFaceTextures}
          />
        )}
        {room?.tiles.length ? (
          <>
            {room.tiles.map((tile) => (
              <Tile
                key={tile.id}
                tile={tile}
                highlighted={markerHotkeyPressed || moveTargets.has(tile.id) || sinkTargets.has(tile.id)}
                selected={selectedTile?.id === tile.id}
                kaijuPresent={room.creatures.some((creature) =>
                  creature.type === "kaiju" && creature.locationId === tile.id
                )}
                suppressReveal={sinkingTileIds.has(tile.id)}
                onClick={() => handleTileClick(tile)}
              />
            ))}
            {room.markers.map((marker) => {
              const space = allSpaces.find((candidate) => candidate.id === marker.locationId);
              const player = room.players.find((candidate) => candidate.id === marker.playerId);
              if (!space || !player) return null;
              const { x, z } = hexToWorld(space);
              return (
                <group key={marker.playerId} position={[x, 0, z]}>
                  <MapMarker color={colorMap[player.color]} name={player.name} />
                </group>
              );
            })}
            {sinkingTiles.map((tile) => <SinkingTile key={`sinking-${tile.id}`} tile={tile} />)}
            {whirlpoolEffects.map((effect) => {
              const tile = room.tiles.find((candidate) => candidate.id === effect.tileId);
              return tile ? <WhirlpoolEffect key={effect.id} tile={tile} /> : null;
            })}
            {room.waterSpaces.map((space) => (
              <WaterTarget key={space.id} space={space} highlighted={markerHotkeyPressed || moveTargets.has(space.id)} onClick={() => handleTarget(space.id)} />
            ))}
            {room.tiles.map((tile) => (
              <SunkenTileTarget
                key={`sunken-target-${tile.id}`}
                tile={tile}
                highlighted={markerHotkeyPressed || moveTargets.has(tile.id)}
                onClick={() => handleTarget(tile.id)}
              />
            ))}
            {room.rafts.map((raft) => {
              const space = allSpaces.find((item) => item.id === raft.locationId);
              if (!space) return null;
              return (
                <RaftPiece
                  key={raft.id}
                  raft={raft}
                  space={space}
                  selected={raft.id === selectedRaftId}
                  onClick={() => useGameStore.getState().markerHotkeyPressed ? placeMarker(raft.locationId) : handleRaftClick(raft)}
                />
              );
            })}
            {room.creatures.map((creature) => {
              const space = allSpaces.find((item) => item.id === creature.locationId);
              if (!space) return null;
              const selectable = myTurn && (
                (room.turnPhase === "creature-move" &&
                  room.pendingChoice?.type === "move-creature" &&
                  creature.type === room.pendingChoice.creatureType &&
                  (!room.pendingChoice.creatureId || room.pendingChoice.creatureId === creature.id)) ||
                (room.turnPhase === "action" && (activeAbility === "dive" || activeAbility === "repellent"))
              );
              return (
                <CreaturePiece
                  key={creature.id}
                  creature={creature}
                  space={space}
                  selected={creature.id === selectedCreatureId}
                  placement={unitPlacements.get(creature.id)}
                  onClick={() => {
                    if (useGameStore.getState().markerHotkeyPressed) placeMarker(creature.locationId);
                    else if (room.pendingChoice?.type === "displace" && moveTargets.has(creature.locationId)) {
                      handleTarget(creature.locationId);
                    }
                    else if (selectable) selectCreature(creature.id === selectedCreatureId ? null : creature.id);
                  }}
                />
              );
            })}
            {room.explorers.map((explorer, index) => {
              if (explorer.rescued || !explorer.locationId) return null;
              const player = room.players.find((candidate) => candidate.id === explorer.ownerId);
              if (!player) return null;
              const selectable =
                myTurn &&
                room.turnPhase === "action" &&
                explorer.ownerId === clientId &&
                !explorer.lost &&
                !explorer.rescued &&
                Boolean(explorer.tileId) &&
                (!activeAbility || activeAbility !== "dolphin" || explorer.swimming);
              const locationIndex = room.explorers
                .filter((item) => item.locationId === explorer.locationId && !item.lost)
                .findIndex((item) => item.id === explorer.id);
              return (
                <Explorer
                  key={explorer.id}
                  explorer={explorer}
                  color={colorMap[explorer.color]}
                  index={locationIndex >= 0 ? locationIndex : index}
                  selected={explorer.id === selectedExplorerId}
                  tiles={allSpaces as TileView[]}
                  placement={unitPlacements.get(explorer.id)}
                  showValue={
                    explorer.ownerId === clientId &&
                    explorer.value !== undefined &&
                    (room.turnPhase === "setup-explorer" || room.turnPhase === "setup-raft")
                  }
                  onClick={() => {
                    if (useGameStore.getState().markerHotkeyPressed) placeMarker(explorer.locationId!);
                    else if (room.pendingChoice?.type === "displace" && moveTargets.has(explorer.locationId!)) {
                      handleTarget(explorer.locationId!);
                    }
                    else if (selectable) selectExplorer(explorer.id === selectedExplorerId ? null : explorer.id);
                  }}
                />
              );
            })}
          </>
        ) : (
          <PreviewIsland />
        )}
        <ContactShadows position={[0, -0.19, 0]} opacity={0.34} scale={24} blur={2.8} far={8} />
      </group>
      <OrbitControls
        makeDefault
        minDistance={16}
        maxDistance={86}
        minPolarAngle={0.45}
        maxPolarAngle={1.2}
        target={[0, 0, 0]}
        enablePan={false}
      />
    </>
  );
}
