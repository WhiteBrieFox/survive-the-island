import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ContactShadows, Float, OrbitControls, Sparkles, useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  AmbientLight, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Group,
  HemisphereLight, LineSegments, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  MeshStandardMaterial, Vector3, type Material, type Object3D
} from "three";
import { useShallow } from "zustand/react/shallow";
import type { CreatureView, ExplorerView, PlayerColor, PublicRoomState, RaftView, Terrain, TileView, WaterSpaceView } from "../../shared/types";
import { areAdjacent, createIslandCoords, hexToWorld } from "../../shared/hex";
import { dayStageFor, type DayStage } from "../dayCycle";
import { useGameStore } from "../gameStore";
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
  mountain: "#7d7b82"
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
  [0.34, 0.24],
  [-0.34, 0.24],
  [0, -0.38],
  [0.54, -0.22],
  [-0.54, -0.22]
];

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

type AssetModelProps = {
  name: string;
  color?: string;
  animate?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

function prepareModel(source: Object3D, color?: string) {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (!color) return;
    const recolor = (sourceMaterial: Material) => {
      const material = sourceMaterial.clone();
      if (material.name === "PlayerColor" && "color" in material) {
        (material.color as Color).set(color);
      }
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(recolor)
      : recolor(object.material);
  });
  return clone;
}

function AssetModel({
  name,
  color,
  animate = true,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1
}: AssetModelProps) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(modelPath(name));
  const model = useMemo(() => prepareModel(scene, color), [color, scene]);
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

[
  "explorer",
  "shark",
  "tree-palm",
  "tree-coastal",
  "tree-jungle",
  "kaiju",
  "sea-serpent",
  "raft",
  "volcano",
  "rescue-dock",
  "whirlpool",
  "coral-reef",
  "floating-debris",
  "terrain-beach",
  "terrain-forest",
  "terrain-mountain"
].forEach((name) => useGLTF.preload(modelPath(name)));

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

  useFrame(({ scene }, delta) => {
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

function TerrainDetails({ terrain, tileId }: { terrain: Terrain; tileId: string }) {
  if (terrain === "forest") {
    return (
      <group position={[-0.12, 0.2, -0.1]}>
        <AssetModel name="terrain-forest" rotation={[0, (tileVariant(tileId, 3) - 1) * 0.12, 0]} scale={0.82} />
      </group>
    );
  }
  if (terrain === "mountain") {
    return (
      <group position={[-0.08, 0.28, -0.08]}>
        <AssetModel name="terrain-mountain" rotation={[0, (tileVariant(tileId, 3) - 1) * 0.12, 0]} scale={0.84} />
      </group>
    );
  }
  return (
    <group position={[-0.1, 0.2, -0.08]}>
      <AssetModel name="terrain-beach" rotation={[0, (tileVariant(tileId, 3) - 1) * 0.14, 0]} scale={0.84} />
      {tileVariant(tileId, 4) === 0 && (
        <AssetModel name="tree-palm" position={[-0.34, 0.04, -0.36]} rotation={[0, 0.6, 0]} scale={0.16} />
      )}
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
    <lineSegments ref={lines} geometry={geometry} renderOrder={1}>
      <lineDashedMaterial
        color="#d9f3e8"
        dashSize={0.15}
        gapSize={0.13}
        transparent
        opacity={0.28}
        depthWrite={false}
      />
    </lineSegments>
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
          <meshStandardMaterial color={tile.terrain === "beach" ? "#a97643" : "#355e48"} roughness={0.96} />
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
  suppressReveal,
  onClick
}: {
  tile: TileView;
  highlighted: boolean;
  selected: boolean;
  suppressReveal?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { x, z } = hexToWorld(tile);
  if (!tile.active) {
    if (!tile.revealedEffect || suppressReveal) return null;
    return (
      <group
        position={[x, tile.revealedEffect === "volcano" ? -0.28 : -0.16, z]}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        <AssetModel
          name={tile.revealedEffect}
          rotation={[0, tileVariant(tile.id, 8) * Math.PI / 4, 0]}
          scale={tile.revealedEffect === "volcano" ? 0.88 : 0.82}
        />
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
        <AssetModel name="rescue-dock" rotation={[0, tileVariant(tile.id, 4) * Math.PI / 2, 0]} scale={0.86} />
        {highlighted && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.22}>
            <ringGeometry args={[0.82, 1.02, 32]} />
            <meshBasicMaterial color="#fff1a8" transparent opacity={0.92} />
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
          emissive={highlighted || selected ? "#685513" : "#000000"}
          emissiveIntensity={highlighted ? 0.6 : selected ? 0.35 : 0}
        />
      </mesh>
      <mesh position-y={tile.terrain === "mountain" ? -0.25 : -0.19} receiveShadow>
        <cylinderGeometry args={[1.12, 1.02, 0.18, 6]} />
        <meshStandardMaterial color={tile.terrain === "beach" ? "#a97643" : "#355e48"} roughness={0.96} />
      </mesh>
      <TerrainDetails terrain={tile.terrain} tileId={tile.id} />
      {(highlighted || selected) && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.28}>
          <ringGeometry args={[0.72, 0.86, 6]} />
          <meshBasicMaterial color={highlighted ? "#fff1a8" : "#ffffff"} transparent opacity={0.9} />
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
  placement
}: {
  explorer: ExplorerView;
  color: string;
  index: number;
  selected: boolean;
  onClick: () => void;
  tiles: TileView[];
  placement?: UnitPlacement;
}) {
  const tile = tiles.find((candidate) => candidate.id === explorer.locationId);
  if (!tile || explorer.rescued || explorer.lost) return null;
  const { x, z } = hexToWorld(tile);
  const raftSeats: Array<[number, number]> = [[-0.28, 0.16], [0.28, 0.16], [0, -0.28]];
  const raftSeat = raftSeats[index % raftSeats.length];
  const [offsetX, offsetZ] = explorer.raftId
    ? raftSeat
    : placement
      ? [placement.x, placement.z]
      : [0, 0];
  const terrainHeight = "terrain" in tile && tile.active
    ? tile.terrain === "mountain" ? 0.36 : 0.2
    : -0.39;
  const facing = explorer.raftId || explorer.swimming
    ? 0
    : Math.atan2(-offsetX, -offsetZ);
  const modelRotation: [number, number, number] = explorer.swimming
    ? [-1.18, facing, 0]
    : [0, facing, 0];
  const modelScale = explorer.swimming ? 0.27 : 0.3;

  return (
    <Float
      speed={selected ? 4 : 1.4}
      rotationIntensity={0}
      floatIntensity={selected ? 0.16 : explorer.swimming ? 0.06 : explorer.raftId ? 0.03 : 0}
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
          <AssetModel name="explorer" color={color} rotation={modelRotation} scale={modelScale} />
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
        </group>
      </AnimatedMover>
    </Float>
  );
}

function WaterTarget({ space, highlighted, onClick }: { space: WaterSpaceView; highlighted: boolean; onClick: () => void }) {
  if (!highlighted) return null;
  const { x, z } = hexToWorld(space);
  return (
    <mesh
      position={[x, -0.19, z]}
      rotation-x={-Math.PI / 2}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
    >
      <ringGeometry args={[0.58, 0.82, 6]} />
      <meshBasicMaterial color="#fff1a8" transparent opacity={0.9} />
    </mesh>
  );
}

function SunkenTileTarget({ tile, highlighted, onClick }: { tile: TileView; highlighted: boolean; onClick: () => void }) {
  if (!highlighted || tile.active || tile.blocked || tile.isRescue) return null;
  const { x, z } = hexToWorld(tile);
  return (
    <group position={[x, -0.4, z]} onClick={(event) => { event.stopPropagation(); onClick(); }}>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.84, 32]} />
        <meshBasicMaterial color="#fff1a8" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.006}>
        <ringGeometry args={[0.62, 0.84, 6]} />
        <meshBasicMaterial color="#fff1a8" transparent opacity={0.9} depthWrite={false} />
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
        <AssetModel name="raft" scale={0.72} />
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
    ? { name: "shark", scale: 0.38, y: 0.02, rotation: -0.5, x: 0, z: 0 }
    : creature.type === "sea-serpent"
      ? { name: "sea-serpent", scale: 0.4, y: 0.02, rotation: 0.35, x: 0, z: 0 }
      : {
          name: "kaiju",
          scale: activeLand ? 0.31 : 0.34,
          y: activeLand ? landHeight : 0.12,
          rotation: 0.15,
          x: placement?.x ?? 0,
          z: placement?.z ?? 0
        };
  if (creature.type !== "kaiju") {
    settings.x = placement?.x ?? 0;
    settings.z = placement?.z ?? 0;
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
          <AssetModel
            name={settings.name}
            rotation={[0, settings.rotation + tileVariant(creature.id, 8) * Math.PI / 4, 0]}
            scale={settings.scale}
          />
          {creature.type === "kaiju" && (
            <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
              <circleGeometry args={[0.38, 28]} />
              <meshBasicMaterial color="#173d70" transparent opacity={0.55} />
            </mesh>
          )}
          {selected && (
            <mesh rotation-x={-Math.PI / 2} position-y={-0.04}>
              <ringGeometry args={[0.5, 0.64, 28]} />
              <meshBasicMaterial color="#fff0a4" transparent opacity={0.95} />
            </mesh>
          )}
        </group>
      </AnimatedMover>
    </Float>
  );
}

function PreviewIsland() {
  const coords = useMemo(() => createIslandCoords(40), []);
  return (
    <>
      {coords.map((coord, index) => {
        const terrain: Terrain = index % 7 === 0 ? "mountain" : index % 3 === 0 ? "forest" : "beach";
        return <Tile key={hexKeySafe(coord)} tile={{ ...coord, id: `preview-${index}`, terrain, active: true, sinking: false }} highlighted={false} selected={false} onClick={() => undefined} />;
      })}
    </>
  );
}

function OceanDecorations({ spaces }: { spaces: WaterSpaceView[] }) {
  return (
    <>
      {spaces.map((space, index) => {
        const { x, z } = hexToWorld(space);
        const coral = index % 2 === 0;
        return (
          <group key={space.id} position={[x, coral ? -0.42 : -0.18, z]}>
            <AssetModel
              name={coral ? "coral-reef" : "floating-debris"}
              rotation={[0, tileVariant(space.id, 8) * Math.PI / 4, 0]}
              scale={coral ? 0.58 : 0.62}
            />
          </group>
        );
      })}
    </>
  );
}

const hexKeySafe = ({ q, r }: { q: number; r: number }) => `${q}:${r}`;

export function BoardScene({ room }: { room: PublicRoomState | null }) {
  const {
    clientId, role, selectedExplorerId, selectedRaftId, selectedCreatureId,
    activeAbility, selectExplorer, selectRaft, selectCreature, setActiveAbility, showNotice
  } = useGameStore(useShallow((state) => ({
    clientId: state.clientId,
    role: state.role,
    selectedExplorerId: state.selectedExplorerId,
    selectedRaftId: state.selectedRaftId,
    selectedCreatureId: state.selectedCreatureId,
    activeAbility: state.activeAbility,
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
  const [sinkingTiles, setSinkingTiles] = useState<TileView[]>([]);
  const [sinkRequestPending, setSinkRequestPending] = useState(false);
  const dayStage = dayStageFor(room);

  useEffect(() => {
    if (!room) {
      previousTiles.current = null;
      setSinkingTiles([]);
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
      }
    }
    previousTiles.current = nextTiles;
  }, [room]);

  useEffect(() => () => {
    sinkTimers.current.forEach((timer) => window.clearTimeout(timer));
    sinkTimers.current.clear();
  }, []);

  const sinkingTileIds = useMemo(() => new Set(sinkingTiles.map((tile) => tile.id)), [sinkingTiles]);
  const sinkAnimationLocked = sinkRequestPending || sinkingTiles.length > 0;
  const unitPlacements = useMemo(() => {
    const placements = new Map<string, UnitPlacement>();
    if (!room) return placements;

    for (const space of allSpaces) {
      const tile = room.tiles.find((candidate) => candidate.id === space.id);
      const slots = tile?.active && !tile.isRescue ? landUnitSlots : waterUnitSlots;
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
  const oceanDecorations = useMemo(() => {
    if (!room) return [];
    const occupied = new Set([
      ...room.rafts.map((raft) => raft.locationId),
      ...room.creatures.map((creature) => creature.locationId),
      ...room.explorers.flatMap((explorer) => explorer.locationId ? [explorer.locationId] : [])
    ]);
    return room.waterSpaces
      .filter((space) => !occupied.has(space.id) && tileVariant(space.id, 13) === 0)
      .slice(0, 12);
  }, [room]);

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
        room.tiles.some((tile) => tile.active && !tile.isRescue && areAdjacent(space, tile))
      ).map((space) => space.id));
    }
    if (room.pendingChoice?.type === "displace") {
      return new Set(room.pendingChoice.allowedTargetIds ?? []);
    }
    if (room.turnPhase === "creature-move" && selectedCreature && selectedCreatureSpace) {
      return new Set(allSpaces.filter((space) => {
        const land = room.tiles.find((tile) => tile.id === space.id);
        return room.pendingChoice?.type === "move-creature" &&
          areAdjacent(selectedCreatureSpace, space) && !land?.isRescue &&
          (selectedCreature.type === "kaiju" || room.waterSpaces.some((water) => water.id === space.id) || (land && !land.active && !land.blocked));
      }).map((space) => space.id));
    }
    if (room.turnPhase !== "action") return new Set<string>();
    if (activeAbility === "paddles" && selectedRaft && selectedRaftSpace) {
      return new Set(allSpaces.filter((space) => {
        const distance = Math.max(
          Math.abs(selectedRaftSpace.q - space.q),
          Math.abs(selectedRaftSpace.r - space.r),
          Math.abs(selectedRaftSpace.q + selectedRaftSpace.r - space.q - space.r)
        );
        return distance >= 1 && distance <= 2 &&
          (room.waterSpaces.some((water) => water.id === space.id) || room.tiles.some((tile) => tile.id === space.id && !tile.active && !tile.blocked)) &&
          !room.rafts.some((raft) => raft.locationId === space.id);
      }).map((space) => space.id));
    }
    if (activeAbility === "dolphin" && selectedExplorer?.swimming && selectedTile) {
      return new Set(allSpaces.filter((space) => {
        const distance = Math.max(
          Math.abs(selectedTile.q - space.q),
          Math.abs(selectedTile.r - space.r),
          Math.abs(selectedTile.q + selectedTile.r - space.q - space.r)
        );
        return distance >= 1 && distance <= 2;
      }).map((space) => space.id));
    }
    if (activeAbility === "dive" && selectedCreature) {
      return new Set(room.waterSpaces.filter((space) => !room.creatures.some((creature) => creature.locationId === space.id)).map((space) => space.id));
    }
    if (selectedExplorer && selectedTile) return new Set(allSpaces.filter((space) => areAdjacent(selectedTile, space)).map((space) => space.id));
    if (selectedRaft && selectedRaftSpace) return new Set(allSpaces.filter((space) =>
      areAdjacent(selectedRaftSpace, space) &&
      (room.waterSpaces.some((water) => water.id === space.id) || room.tiles.some((tile) => tile.id === space.id && !tile.active && !tile.blocked)) &&
      !room.rafts.some((raft) => raft.locationId === space.id)
    ).map((space) => space.id));
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
    if (!room || !moveTargets.has(targetId)) return;
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

  const handleRaftClick = (raft: RaftView) => {
    if (!room || !myTurn || room.turnPhase !== "action") return;
    if (selectedExplorerId && moveTargets.has(raft.locationId)) {
      handleTarget(raft.locationId);
      return;
    }
    selectRaft(raft.id === selectedRaftId ? null : raft.id);
  };

  return (
    <>
      <DayLighting stage={dayStage} />
      <group scale={BOARD_SCALE}>
        <Ocean stage={dayStage} />
        <OceanDecorations spaces={oceanDecorations} />
        {room && <RouteGrid spaces={allSpaces} tiles={room.tiles} />}
        <Sparkles count={80} scale={[20, 1, 20]} size={1.4} speed={0.2} color={dayStage.sparkle} position-y={0.1} />
        {room?.tiles.length ? (
          <>
            {room.tiles.map((tile) => (
              <Tile
                key={tile.id}
                tile={tile}
                highlighted={moveTargets.has(tile.id) || sinkTargets.has(tile.id)}
                selected={selectedTile?.id === tile.id}
                suppressReveal={sinkingTileIds.has(tile.id)}
                onClick={() => handleTileClick(tile)}
              />
            ))}
            {sinkingTiles.map((tile) => <SinkingTile key={`sinking-${tile.id}`} tile={tile} />)}
            {room.waterSpaces.map((space) => (
              <WaterTarget key={space.id} space={space} highlighted={moveTargets.has(space.id)} onClick={() => handleTarget(space.id)} />
            ))}
            {room.tiles.map((tile) => (
              <SunkenTileTarget
                key={`sunken-target-${tile.id}`}
                tile={tile}
                highlighted={moveTargets.has(tile.id)}
                onClick={() => handleTarget(tile.id)}
              />
            ))}
            {room.rafts.map((raft) => {
              const space = allSpaces.find((item) => item.id === raft.locationId);
              if (!space) return null;
              return <RaftPiece key={raft.id} raft={raft} space={space} selected={raft.id === selectedRaftId} onClick={() => handleRaftClick(raft)} />;
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
                  onClick={() => selectable && selectCreature(creature.id === selectedCreatureId ? null : creature.id)}
                />
              );
            })}
            {room.explorers.map((explorer, index) => {
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
                .filter((item) => item.locationId === explorer.locationId && !item.lost && !item.rescued)
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
                  onClick={() => selectable && selectExplorer(explorer.id === selectedExplorerId ? null : explorer.id)}
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
