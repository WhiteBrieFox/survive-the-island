import { useMemo, useRef, useState } from "react";
import { ContactShadows, Float, OrbitControls, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
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

function TerrainDetails({ terrain }: { terrain: Terrain }) {
  if (terrain === "forest") {
    return (
      <group position={[0, 0.35, 0]}>
        {[-0.38, -0.08, 0.28].map((x, index) => (
          <group key={x} position={[x, index === 1 ? 0.1 : 0, index === 1 ? 0.14 : -0.1]}>
            <mesh castShadow position-y={0.1}>
              <cylinderGeometry args={[0.045, 0.065, 0.3, 7]} />
              <meshStandardMaterial color="#68452d" />
            </mesh>
            <mesh castShadow position-y={0.35}>
              <coneGeometry args={[index === 1 ? 0.26 : 0.22, index === 1 ? 0.56 : 0.46, 8]} />
              <meshStandardMaterial color={index === 1 ? "#12684e" : "#2a8a58"} roughness={0.76} />
            </mesh>
          </group>
        ))}
        <mesh castShadow position={[0.3, 0.08, 0.34]}>
          <dodecahedronGeometry args={[0.13, 0]} />
          <meshStandardMaterial color="#3b7650" roughness={0.9} />
        </mesh>
      </group>
    );
  }
  if (terrain === "mountain") {
    return (
      <group position={[0, 0.35, 0]}>
        <mesh castShadow position={[-0.18, 0.2, 0]}>
          <coneGeometry args={[0.42, 0.85, 6]} />
          <meshStandardMaterial color="#5b6267" roughness={0.88} />
        </mesh>
        <mesh castShadow position={[-0.18, 0.5, 0]}>
          <coneGeometry args={[0.18, 0.25, 6]} />
          <meshStandardMaterial color="#e9f0ed" roughness={0.72} />
        </mesh>
        <mesh castShadow position={[0.24, 0.1, 0.08]}>
          <coneGeometry args={[0.3, 0.62, 6]} />
          <meshStandardMaterial color="#7d8588" roughness={0.9} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[0, 0.27, 0]}>
      <mesh castShadow rotation-z={-0.22}>
        <cylinderGeometry args={[0.05, 0.075, 0.52, 8]} />
        <meshStandardMaterial color="#775039" />
      </mesh>
      {[[-0.16, 0.21, 0], [0.1, 0.29, 0.03], [0.24, 0.18, -0.02]].map((position, index) => (
        <mesh key={index} castShadow position={position as [number, number, number]} rotation-z={index === 0 ? -0.55 : index === 2 ? 0.55 : 0}>
          <sphereGeometry args={[0.17, 9, 6]} />
          <meshStandardMaterial color={index === 1 ? "#217d58" : "#36a468"} roughness={0.78} />
        </mesh>
      ))}
      <mesh castShadow position={[-0.38, -0.16, 0.26]}>
        <dodecahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial color="#d7a95e" roughness={0.9} />
      </mesh>
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
  if (!tile.active) return null;

  if (tile.isRescue) {
    return (
      <group position={[x, -0.15, z]} onClick={(event) => { event.stopPropagation(); onClick(); }}>
        <mesh receiveShadow castShadow>
          <cylinderGeometry args={[1.05, 1.2, 0.5, 6]} />
          <meshStandardMaterial color={highlighted ? "#f5d96e" : "#d0b45d"} emissive={highlighted ? "#4f3b08" : "#000000"} />
        </mesh>
        <mesh position-y={0.45} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 0.8, 8]} />
          <meshStandardMaterial color="#f1eee5" />
        </mesh>
        <mesh position={[0.28, 0.64, 0]} rotation-z={-0.18} castShadow>
          <boxGeometry args={[0.55, 0.32, 0.04]} />
          <meshStandardMaterial color="#f05d4f" />
        </mesh>
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
      <TerrainDetails terrain={tile.terrain} />
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
  const angle = (index % 8) * (Math.PI / 4);
  const radius = index === 0 ? 0 : 0.42;

  return (
    <Float speed={selected ? 4 : 1.4} rotationIntensity={0} floatIntensity={selected ? 0.2 : 0.05}>
      <group
        position={[x + Math.cos(angle) * radius, explorer.raftId ? 0.48 : explorer.swimming ? 0.12 : 0.58, z + Math.sin(angle) * radius]}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        scale={selected ? 1.18 : 1}
      >
        <mesh castShadow position-y={0.12}>
          <cylinderGeometry args={[0.13, 0.2, 0.4, 10]} />
          <meshStandardMaterial color={color} roughness={0.55} />
        </mesh>
        <mesh castShadow position-y={0.38}>
          <sphereGeometry args={[0.15, 12, 9]} />
          <meshStandardMaterial color="#f0c49a" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0, 0.49, 0]}>
          <cylinderGeometry args={[0.2, 0.15, 0.09, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh castShadow position={[0.12, 0.17, 0.03]} rotation-z={-0.24}>
          <boxGeometry args={[0.12, 0.26, 0.12]} />
          <meshStandardMaterial color="#d59b45" roughness={0.82} />
        </mesh>
        <mesh receiveShadow position-y={-0.11}>
          <cylinderGeometry args={[0.25, 0.28, 0.08, 14]} />
          <meshStandardMaterial color="#f2ead7" roughness={0.9} />
        </mesh>
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
      {[-0.3, -0.1, 0.1, 0.3].map((offset, index) => (
        <mesh key={offset} position={[offset, 0.08, 0]} rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.095, 0.11, 1.05, 10]} />
          <meshStandardMaterial color={index % 2 ? "#a86a34" : "#87502c"} roughness={0.92} />
        </mesh>
      ))}
      {[-0.27, 0.27].map((zOffset) => (
        <mesh key={zOffset} position={[0, 0.18, zOffset]} castShadow>
          <boxGeometry args={[0.86, 0.07, 0.08]} />
          <meshStandardMaterial color="#d09a55" roughness={0.86} />
        </mesh>
      ))}
      {[-0.28, 0.28].map((xOffset) => (
        <mesh key={xOffset} position={[xOffset, 0.2, 0]}>
          <torusGeometry args={[0.11, 0.025, 6, 16]} />
          <meshStandardMaterial color="#e6c47b" roughness={1} />
        </mesh>
      ))}
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
  const color = creature.type === "sea-serpent" ? "#d94f43" : creature.type === "shark" ? "#278f72" : "#3e68a8";
  return (
    <Float speed={1.8} floatIntensity={0.12} rotationIntensity={0.08}>
      <group
        position={[x, creature.type === "kaiju" ? 0.46 : 0.16, z]}
        scale={selected ? 1.2 : 1}
        onClick={(event) => { event.stopPropagation(); onClick(); }}
      >
        {creature.type === "shark" ? (
          <group rotation-y={-0.5}>
            <mesh castShadow rotation-z={Math.PI / 2}>
              <coneGeometry args={[0.25, 0.85, 10]} />
              <meshStandardMaterial color={color} roughness={0.5} />
            </mesh>
            <mesh castShadow position={[0, 0.22, 0]} rotation-z={Math.PI}>
              <coneGeometry args={[0.16, 0.3, 5]} />
              <meshStandardMaterial color="#146b60" roughness={0.56} />
            </mesh>
          </group>
        ) : creature.type === "sea-serpent" ? (
          <group>
            {[-0.3, 0, 0.28].map((offset, index) => (
              <mesh key={offset} castShadow position={[offset, index === 1 ? 0.18 : 0, 0]}>
                <sphereGeometry args={[index === 1 ? 0.22 : 0.17, 12, 8]} />
                <meshStandardMaterial color={index === 1 ? "#ef6b55" : color} roughness={0.52} />
              </mesh>
            ))}
            <mesh castShadow position={[0, 0.42, 0]}>
              <dodecahedronGeometry args={[0.24, 0]} />
              <meshStandardMaterial color="#ef6b55" roughness={0.5} />
            </mesh>
          </group>
        ) : (
          <group>
            <mesh castShadow>
              <dodecahedronGeometry args={[0.43, 1]} />
              <meshStandardMaterial color={color} roughness={0.58} />
            </mesh>
            {[-0.24, 0.24].map((offset) => (
              <mesh key={offset} castShadow position={[offset, 0.38, 0]} rotation-z={offset < 0 ? 0.45 : -0.45}>
                <coneGeometry args={[0.1, 0.32, 7]} />
                <meshStandardMaterial color="#d7e8e3" roughness={0.68} />
              </mesh>
            ))}
          </group>
        )}
        {selected && (
          <mesh rotation-x={-Math.PI / 2} position-y={-0.12}>
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
