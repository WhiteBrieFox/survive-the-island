import { useMemo, useRef, useState } from "react";
import { ContactShadows, Environment, Float, OrbitControls, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import type { ExplorerView, PlayerColor, PublicRoomState, Terrain, TileView } from "../../shared/types";
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
    <mesh ref={mesh} rotation-x={-Math.PI / 2} receiveShadow>
      <circleGeometry args={[18, 96]} />
      <meshStandardMaterial color="#1687a0" roughness={0.2} metalness={0.12} transparent opacity={0.9} />
    </mesh>
  );
}

function TerrainDetails({ terrain }: { terrain: Terrain }) {
  if (terrain === "forest") {
    return (
      <group position={[0, 0.35, 0]}>
        {[-0.34, 0, 0.34].map((x, index) => (
          <group key={x} position={[x, index === 1 ? 0.08 : 0, index === 1 ? 0.06 : -0.08]}>
            <mesh castShadow position-y={0.1}>
              <cylinderGeometry args={[0.045, 0.06, 0.3, 6]} />
              <meshStandardMaterial color="#68452d" />
            </mesh>
            <mesh castShadow position-y={0.35}>
              <coneGeometry args={[0.22, 0.48, 7]} />
              <meshStandardMaterial color={index === 1 ? "#176a50" : "#23815d"} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  if (terrain === "mountain") {
    return (
      <group position={[0, 0.35, 0]}>
        <mesh castShadow position={[-0.18, 0.2, 0]}>
          <coneGeometry args={[0.42, 0.85, 6]} />
          <meshStandardMaterial color="#66656a" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0.24, 0.1, 0.08]}>
          <coneGeometry args={[0.3, 0.62, 6]} />
          <meshStandardMaterial color="#89878c" roughness={0.9} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[0, 0.3, 0]}>
      <mesh castShadow rotation-z={-0.14}>
        <cylinderGeometry args={[0.06, 0.08, 0.55, 7]} />
        <meshStandardMaterial color="#775039" />
      </mesh>
      <mesh castShadow position={[0.13, 0.24, 0]}>
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshStandardMaterial color="#2a8d62" />
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
  const tile = tiles.find((candidate) => candidate.id === explorer.tileId);
  if (!tile || !tile.active || explorer.rescued || explorer.lost) return null;
  const { x, z } = hexToWorld(tile);
  const angle = (index % 8) * (Math.PI / 4);
  const radius = index === 0 ? 0 : 0.42;

  return (
    <Float speed={selected ? 4 : 1.4} rotationIntensity={0} floatIntensity={selected ? 0.2 : 0.05}>
      <group
        position={[x + Math.cos(angle) * radius, 0.58, z + Math.sin(angle) * radius]}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        scale={selected ? 1.18 : 1}
      >
        <mesh castShadow position-y={0.12}>
          <cylinderGeometry args={[0.13, 0.19, 0.38, 8]} />
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
        <mesh receiveShadow position-y={-0.11}>
          <cylinderGeometry args={[0.25, 0.28, 0.08, 14]} />
          <meshStandardMaterial color="#f2ead7" roughness={0.9} />
        </mesh>
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
  const { clientId, role, selectedExplorerId, selectExplorer, showNotice } = useGameStore();
  const selectedExplorer = room?.explorers.find((explorer) => explorer.id === selectedExplorerId);
  const selectedTile = room?.tiles.find((tile) => tile.id === selectedExplorer?.tileId);
  const myTurn = room?.currentPlayerId === clientId && role === "player";
  const terrainRank: Record<Terrain, number> = { beach: 0, forest: 1, mountain: 2 };

  const moveTargets = useMemo(() => {
    if (!room || !selectedTile || !myTurn || room.turnPhase !== "action") return new Set<string>();
    return new Set(room.tiles.filter((tile) => tile.active && areAdjacent(selectedTile, tile)).map((tile) => tile.id));
  }, [myTurn, room, selectedTile]);

  const sinkTargets = useMemo(() => {
    if (!room || !myTurn || room.turnPhase !== "rising") return new Set<string>();
    const activeIsland = room.tiles.filter((tile) => tile.active && !tile.isRescue);
    const lowest = Math.min(...activeIsland.map((tile) => terrainRank[tile.terrain]));
    return new Set(activeIsland.filter((tile) => terrainRank[tile.terrain] === lowest).map((tile) => tile.id));
  }, [myTurn, room]);

  const handleTileClick = (tile: TileView) => {
    if (!room) return;
    if (sinkTargets.has(tile.id)) {
      socket.emit("sinkTile", tile.id, (result) => {
        if (!result.ok) showNotice(result.error ?? "无法翻开这个格子");
      });
      return;
    }
    if (!selectedExplorerId || !moveTargets.has(tile.id)) return;
    socket.emit(
      "moveExplorer",
      { explorerId: selectedExplorerId, targetTileId: tile.id, revision: room.revision },
      (result) => {
        if (!result.ok) showNotice(result.error ?? "移动失败");
        else selectExplorer(null);
      }
    );
  };

  return (
    <>
      <color attach="background" args={["#082f39"]} />
      <fog attach="fog" args={["#082f39", 18, 34]} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[8, 14, 6]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} />
      <hemisphereLight args={["#bfe7ec", "#174336", 1]} />
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
          {room.explorers.map((explorer, index) => {
            const player = room.players.find((candidate) => candidate.id === explorer.ownerId);
            if (!player) return null;
            const selectable =
              myTurn &&
              room.turnPhase === "action" &&
              explorer.ownerId === clientId &&
              !explorer.lost &&
              !explorer.rescued &&
              Boolean(explorer.tileId);
            return (
              <Explorer
                key={explorer.id}
                explorer={explorer}
                color={colorMap[player.color]}
                index={index}
                selected={explorer.id === selectedExplorerId}
                tiles={room.tiles}
                onClick={() => selectable && selectExplorer(explorer.id === selectedExplorerId ? null : explorer.id)}
              />
            );
          })}
        </>
      ) : (
        <PreviewIsland />
      )}
      <ContactShadows position={[0, -0.19, 0]} opacity={0.34} scale={24} blur={2.8} far={8} />
      <Environment preset="sunset" environmentIntensity={0.4} />
      <OrbitControls
        makeDefault
        minDistance={9}
        maxDistance={24}
        minPolarAngle={0.45}
        maxPolarAngle={1.2}
        target={[0, 0, 0]}
        enablePan={false}
      />
    </>
  );
}
