import { useEffect, useMemo, useRef, useState } from "react";
import { ContactShadows, Float, OrbitControls, Sparkles, useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Color, Group, Mesh, type Material, type Object3D } from "three";
import { useShallow } from "zustand/react/shallow";
import type { CreatureView, ExplorerView, PlayerColor, PublicRoomState, RaftView, Terrain, TileView, WaterSpaceView } from "../../shared/types";
import { areAdjacent, createIslandCoords, hexToWorld } from "../../shared/hex";
import { useGameStore } from "../gameStore";
import { socket } from "../socket";

const colorMap: Record<PlayerColor, string> = {
  coral: "#f05d4f",
  teal: "#20a99a",
  gold: "#f2b84b",
  violet: "#8f73d8",
  sky: "#4a9ed8"
};

const terrainColor: Record<Terrain, string> = {
  beach: "#e8c878",
  forest: "#4f9a68",
  mountain: "#7d7b82"
};

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

function Ocean() {
  const mesh = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    mesh.current.position.y = -0.46 + Math.sin(clock.elapsedTime * 0.7) * 0.035;
    mesh.current.rotation.z = Math.sin(clock.elapsedTime * 0.09) * 0.015;
  });
  return (
    <group>
      <mesh ref={mesh} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[19, 128]} />
        <meshPhysicalMaterial
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
        <meshStandardMaterial color="#064b64" roughness={0.72} />
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

function TerrainDetails({ terrain, tileId }: { terrain: Terrain; tileId: string }) {
  if (terrain === "forest") {
    const trees = ["tree-jungle", "tree-coastal", "tree-palm"];
    const variant = tileVariant(tileId, trees.length);
    return (
      <group position={[0, 0.2, 0]}>
        <AssetModel name="terrain-forest" scale={0.92} />
        <AssetModel
          name={trees[variant]}
          position={[variant === 1 ? -0.12 : 0.12, 0.08, variant === 2 ? 0.08 : -0.04]}
          rotation={[0, variant * 1.7, 0]}
          scale={variant === 2 ? 0.31 : 0.34}
        />
      </group>
    );
  }
  if (terrain === "mountain") {
    return (
      <group position={[0, 0.28, 0]}>
        <AssetModel name="terrain-mountain" rotation={[0, tileVariant(tileId, 6) * Math.PI / 3, 0]} scale={0.98} />
      </group>
    );
  }
  return (
    <group position={[0, 0.2, 0]}>
      <AssetModel name="terrain-beach" rotation={[0, tileVariant(tileId, 6) * Math.PI / 3, 0]} scale={0.98} />
      {tileVariant(tileId, 4) === 0 && (
        <AssetModel name="tree-palm" position={[-0.18, 0.08, 0.08]} rotation={[0, 0.6, 0]} scale={0.27} />
      )}
    </group>
  );
}

function Tile({
  tile,
  highlighted,
  selected,
  onClick
}: {
  tile: TileView;
  highlighted: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { x, z } = hexToWorld(tile);
  if (!tile.active) {
    if (!tile.revealedEffect) return null;
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
        <cylinderGeometry args={[1, 1.04, tile.terrain === "mountain" ? 0.5 : 0.38, 6]} />
        <meshStandardMaterial
          color={terrainColor[tile.terrain]}
          roughness={0.82}
          emissive={highlighted || selected ? "#685513" : "#000000"}
          emissiveIntensity={highlighted ? 0.6 : selected ? 0.35 : 0}
        />
      </mesh>
      <mesh position-y={tile.terrain === "mountain" ? -0.25 : -0.19} receiveShadow>
        <cylinderGeometry args={[1.04, 0.92, 0.18, 6]} />
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
  tiles
}: {
  explorer: ExplorerView;
  color: string;
  index: number;
  selected: boolean;
  onClick: () => void;
  tiles: TileView[];
}) {
  const tile = tiles.find((candidate) => candidate.id === explorer.locationId);
  if (!tile || explorer.rescued || explorer.lost) return null;
  const { x, z } = hexToWorld(tile);
  const raftSeats: Array<[number, number]> = [[-0.28, 0.16], [0.28, 0.16], [0, -0.28]];
  const landSeats: Array<[number, number]> = [
    [0.48, 0.5],
    [-0.16, 0.64],
    [0.66, -0.08],
    [-0.62, 0.18],
    [0.2, -0.62],
    [-0.42, -0.5]
  ];
  const swimSeats: Array<[number, number]> = [[0, 0], [0.28, 0.2], [-0.28, 0.2], [0, -0.3]];
  const raftSeat = raftSeats[index % raftSeats.length];
  const landSeat = landSeats[index % landSeats.length];
  const swimSeat = swimSeats[index % swimSeats.length];
  const [offsetX, offsetZ] = explorer.raftId
    ? raftSeat
    : explorer.swimming
      ? swimSeat
      : landSeat;
  const terrainHeight = "terrain" in tile && tile.active
    ? tile.terrain === "mountain" ? 0.62 : 0.42
    : -0.04;
  const facing = explorer.raftId || explorer.swimming
    ? 0
    : Math.atan2(-offsetX, -offsetZ);

  return (
    <Float speed={selected ? 4 : 1.4} rotationIntensity={0} floatIntensity={selected ? 0.2 : 0.05}>
      <group
        position={[x + offsetX, explorer.raftId ? 0.23 : terrainHeight, z + offsetZ]}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        scale={selected ? 1.18 : 1}
      >
        <AssetModel name="explorer" color={color} rotation={[0, facing, 0]} scale={0.3} />
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

function RaftPiece({ raft, space, selected, onClick }: { raft: RaftView; space: TileView | WaterSpaceView; selected: boolean; onClick: () => void }) {
  const { x, z } = hexToWorld(space);
  return (
    <group
      position={[x, -0.02, z]}
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
  );
}

function CreaturePiece({ creature, space, selected, onClick }: { creature: CreatureView; space: TileView | WaterSpaceView; selected: boolean; onClick: () => void }) {
  const { x, z } = hexToWorld(space);
  const settings = creature.type === "shark"
    ? { name: "shark", scale: 0.38, y: 0.02, rotation: -0.5 }
    : creature.type === "sea-serpent"
      ? { name: "sea-serpent", scale: 0.4, y: 0.02, rotation: 0.35 }
      : { name: "kaiju", scale: 0.34, y: 0.12, rotation: 0.15 };
  return (
    <Float speed={1.8} floatIntensity={0.12} rotationIntensity={0.08}>
      <group
        position={[x, settings.y, z]}
        scale={selected ? 1.2 : 1}
        onClick={(event) => { event.stopPropagation(); onClick(); }}
      >
        <AssetModel
          name={settings.name}
          rotation={[0, settings.rotation + tileVariant(creature.id, 8) * Math.PI / 4, 0]}
          scale={settings.scale}
        />
        {selected && (
          <mesh rotation-x={-Math.PI / 2} position-y={-0.04}>
            <ringGeometry args={[0.5, 0.64, 28]} />
            <meshBasicMaterial color="#fff0a4" transparent opacity={0.95} />
          </mesh>
        )}
      </group>
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
      socket.emit("sinkTile", tile.id, (result) => {
        if (!result.ok) showNotice(result.error ?? "无法翻开这个格子");
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
      <color attach="background" args={["#063f52"]} />
      <fog attach="fog" args={["#0a5063", 34, 72]} />
      <ambientLight intensity={1.08} />
      <directionalLight position={[8, 14, 6]} intensity={2.8} color="#fff4d5" castShadow shadow-mapSize={[2048, 2048]} />
      <hemisphereLight args={["#d9fbf5", "#174336", 1.28]} />
      <Ocean />
      <OceanDecorations spaces={oceanDecorations} />
      <Sparkles count={80} scale={[20, 1, 20]} size={1.4} speed={0.2} color="#bdeff2" position-y={0.1} />
      {room?.tiles.length ? (
        <>
          {room.tiles.map((tile) => (
            <Tile
              key={tile.id}
              tile={tile}
              highlighted={moveTargets.has(tile.id) || sinkTargets.has(tile.id)}
              selected={selectedTile?.id === tile.id}
              onClick={() => handleTileClick(tile)}
            />
          ))}
          {room.waterSpaces.map((space) => (
            <WaterTarget key={space.id} space={space} highlighted={moveTargets.has(space.id)} onClick={() => handleTarget(space.id)} />
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
            return <CreaturePiece key={creature.id} creature={creature} space={space} selected={creature.id === selectedCreatureId} onClick={() => selectable && selectCreature(creature.id === selectedCreatureId ? null : creature.id)} />;
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
                onClick={() => selectable && selectExplorer(explorer.id === selectedExplorerId ? null : explorer.id)}
              />
            );
          })}
        </>
      ) : (
        <PreviewIsland />
      )}
      <ContactShadows position={[0, -0.19, 0]} opacity={0.34} scale={24} blur={2.8} far={8} />
      <OrbitControls
        makeDefault
        minDistance={9}
        maxDistance={46}
        minPolarAngle={0.45}
        maxPolarAngle={1.2}
        target={[0, 0, 0]}
        enablePan={false}
      />
    </>
  );
}
