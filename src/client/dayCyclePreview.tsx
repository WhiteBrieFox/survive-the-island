import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles, useGLTF } from "@react-three/drei";
import { Clock3, Mountain, Music2, Pause, Play, SkipForward, Sun, Trees } from "lucide-react";
import {
  Color,
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  Vector3,
  type Material,
  type Object3D
} from "three";
import { createIslandCoords, hexDistance, hexToWorld } from "../shared/hex";
import type { Terrain } from "../shared/types";
import "./dayCyclePreview.css";

type StageId = "morning" | "noon" | "dusk";

type Stage = {
  id: StageId;
  label: string;
  time: string;
  phase: string;
  track: string;
  trackLabel: string;
  sky: string;
  fog: string;
  ocean: string;
  sun: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambient: number;
  activeRank: number;
};

const stages: Stage[] = [
  {
    id: "morning",
    label: "清晨",
    time: "08:00",
    phase: "海滩开始下沉",
    track: "/assets/audio/exploration-1.m4a",
    trackLabel: "探索主题 I",
    sky: "#8fd2d7",
    fog: "#65bdc7",
    ocean: "#20a8bd",
    sun: [-18, 15, 8],
    sunColor: "#ffe6ad",
    sunIntensity: 2.5,
    ambient: 1.25,
    activeRank: 0
  },
  {
    id: "noon",
    label: "正午",
    time: "12:30",
    phase: "海滩耗尽，森林开始下沉",
    track: "/assets/audio/exploration-2.m4a",
    trackLabel: "探索主题 II",
    sky: "#45abc4",
    fog: "#278da9",
    ocean: "#118ca9",
    sun: [4, 28, 2],
    sunColor: "#fff6d4",
    sunIntensity: 3.2,
    ambient: 1.05,
    activeRank: 1
  },
  {
    id: "dusk",
    label: "黄昏",
    time: "18:20",
    phase: "森林耗尽，山地开始下沉",
    track: "/assets/audio/crisis-1.m4a",
    trackLabel: "危机主题 I",
    sky: "#c86f62",
    fog: "#8e5360",
    ocean: "#176f87",
    sun: [20, 8, -12],
    sunColor: "#ffb36b",
    sunIntensity: 2.65,
    ambient: 0.64,
    activeRank: 2
  }
];

const terrainColors: Record<Terrain, string> = {
  beach: "#e7c371",
  forest: "#4f9462",
  mountain: "#77757c"
};

const modelPath = (name: string) => `/assets/models-preview/${name}.glb`;

function cloneModel(source: Object3D) {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const cloneMaterial = (material: Material) => material.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });
  return clone;
}

function AssetModel({
  name,
  scale,
  rotation = [0, 0, 0]
}: {
  name: string;
  scale: number;
  rotation?: [number, number, number];
}) {
  const { scene } = useGLTF(modelPath(name));
  const model = useMemo(() => cloneModel(scene), [scene]);
  return <primitive object={model} scale={scale} rotation={rotation} />;
}

["terrain-beach", "terrain-forest", "terrain-mountain", "raft", "shark", "sea-serpent", "kaiju"]
  .forEach((name) => useGLTF.preload(modelPath(name)));

function terrainFor(q: number, r: number): Terrain {
  const distance = hexDistance({ q: 0, r: 0 }, { q, r });
  if (distance >= 4) return "beach";
  if (distance >= 2) return "forest";
  return "mountain";
}

function terrainRank(terrain: Terrain) {
  return terrain === "beach" ? 0 : terrain === "forest" ? 1 : 2;
}

function TerrainTile({
  q,
  r,
  terrain,
  stageRank,
  index
}: {
  q: number;
  r: number;
  terrain: Terrain;
  stageRank: number;
  index: number;
}) {
  const group = useRef<Group>(null);
  const targetVisible = terrainRank(terrain) >= stageRank;
  const progress = useRef(targetVisible ? 1 : 0);
  const { x, z } = hexToWorld({ q, r });

  useEffect(() => {
    progress.current = Math.max(0.001, Math.min(0.999, progress.current));
  }, [targetVisible]);

  useFrame((_, delta) => {
    if (!group.current) return;
    const target = targetVisible ? 1 : 0;
    progress.current += (target - progress.current) * Math.min(1, delta * 2.3);
    const visible = progress.current;
    group.current.position.y = -0.58 + visible * 0.62;
    group.current.rotation.x = (1 - visible) * 0.52;
    group.current.scale.setScalar(0.78 + visible * 0.22);
    group.current.visible = visible > 0.025;
  });

  return (
    <group ref={group} position={[x, 0, z]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[1.08, 1.11, terrain === "mountain" ? 0.48 : 0.36, 6]} />
        <meshStandardMaterial color={terrainColors[terrain]} roughness={0.86} />
      </mesh>
      <mesh position-y={terrain === "mountain" ? -0.25 : -0.19}>
        <cylinderGeometry args={[1.1, 1, 0.16, 6]} />
        <meshStandardMaterial color={terrain === "beach" ? "#a87541" : "#345d47"} roughness={0.96} />
      </mesh>
      <group position={[-0.1, terrain === "mountain" ? 0.27 : 0.19, -0.08]}>
        <AssetModel
          name={`terrain-${terrain}`}
          scale={terrain === "mountain" ? 0.82 : 0.8}
          rotation={[0, (index % 6) * Math.PI / 3, 0]}
        />
      </group>
    </group>
  );
}

function Ocean({ color }: { color: string }) {
  const mesh = useRef<Mesh>(null);
  const currentColor = useRef(new Color(color));
  useFrame(({ clock }, delta) => {
    if (!mesh.current) return;
    mesh.current.position.y = -0.48 + Math.sin(clock.elapsedTime * 0.68) * 0.032;
    const material = mesh.current.material;
    if (Array.isArray(material) || !("color" in material) || !(material.color instanceof Color)) return;
    currentColor.current.lerp(new Color(color), Math.min(1, delta * 1.4));
    material.color.copy(currentColor.current);
  });
  return (
    <>
      <mesh ref={mesh} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[20, 128]} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.18}
          metalness={0.08}
          clearcoat={0.75}
          transparent
          opacity={0.95}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.52}>
        <circleGeometry args={[21, 96]} />
        <meshStandardMaterial color="#073f56" roughness={0.8} />
      </mesh>
    </>
  );
}

function PreviewScene({ stage }: { stage: Stage }) {
  const sunlight = useRef<DirectionalLight>(null);
  const ambient = useRef<AmbientLight>(null);
  const sceneColor = useRef(new Color(stage.sky));
  const sceneFog = useRef(new Color(stage.fog));
  const sunPosition = useRef(new Vector3(...stage.sun));
  const coords = useMemo(() => createIslandCoords(61), []);

  useFrame(({ scene }, delta) => {
    sceneColor.current.lerp(new Color(stage.sky), Math.min(1, delta * 0.75));
    sceneFog.current.lerp(new Color(stage.fog), Math.min(1, delta * 0.75));
    scene.background = sceneColor.current;
    if (scene.fog) scene.fog.color.copy(sceneFog.current);
    if (sunlight.current) {
      sunPosition.current.lerp(new Vector3(...stage.sun), Math.min(1, delta * 0.7));
      sunlight.current.position.copy(sunPosition.current);
      sunlight.current.color.lerp(new Color(stage.sunColor), Math.min(1, delta * 0.9));
      sunlight.current.intensity += (stage.sunIntensity - sunlight.current.intensity) * Math.min(1, delta * 0.8);
    }
    if (ambient.current) {
      ambient.current.intensity += (stage.ambient - ambient.current.intensity) * Math.min(1, delta * 0.8);
    }
  });

  return (
    <>
      <fog attach="fog" args={[stage.fog, 48, 112]} />
      <ambientLight ref={ambient} intensity={stage.ambient} />
      <directionalLight
        ref={sunlight}
        position={stage.sun}
        intensity={stage.sunIntensity}
        color={stage.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />
      <hemisphereLight args={["#e8ffff", "#18372f", stage.id === "dusk" ? 0.6 : 1.1]} />
      <group scale={1.32} rotation-y={-0.08}>
        <Ocean color={stage.ocean} />
        <Sparkles count={stage.id === "dusk" ? 110 : 55} scale={[20, 1, 20]} size={1.1} speed={0.18} color="#d8ffff" position-y={0.15} />
        {coords.map((coord, index) => (
          <TerrainTile
            key={`${coord.q}:${coord.r}`}
            {...coord}
            index={index}
            terrain={terrainFor(coord.q, coord.r)}
            stageRank={stage.activeRank}
          />
        ))}
        <group position={[-9.2, -0.18, 3.8]} rotation-y={0.45}><AssetModel name="raft" scale={0.72} /></group>
        <group position={[8.7, -0.32, 1.4]} rotation-y={-0.8}><AssetModel name="shark" scale={0.72} /></group>
        <group position={[-7.8, -0.34, -6.2]} rotation-y={0.25}><AssetModel name="sea-serpent" scale={0.64} /></group>
        {stage.id === "dusk" && (
          <group position={[3.2, 0.18, -1.7]} rotation-y={0.5}><AssetModel name="kaiju" scale={0.48} /></group>
        )}
      </group>
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={22}
        maxDistance={50}
        minPolarAngle={0.62}
        maxPolarAngle={1.28}
        target={[0, 0, 0]}
      />
    </>
  );
}

function useCrossfade(stage: Stage, volume: number) {
  const channels = useRef<[HTMLAudioElement, HTMLAudioElement] | null>(null);
  const activeIndex = useRef(0);
  const fadeFrame = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(stage.track);

  useEffect(() => {
    channels.current = [new Audio(), new Audio()];
    channels.current.forEach((audio) => {
      audio.loop = true;
      audio.preload = "auto";
    });
    return () => channels.current?.forEach((audio) => {
      if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    });
  }, []);

  useEffect(() => {
    const pair = channels.current;
    if (!pair || currentTrack === stage.track) return;
    if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
    const from = pair[activeIndex.current];
    const nextIndex = activeIndex.current === 0 ? 1 : 0;
    const to = pair[nextIndex];
    const fadeVolume = volume;
    to.src = stage.track;
    to.currentTime = 0;
    to.volume = 0;
    if (playing) void to.play().catch(() => undefined);
    const started = performance.now();
    const duration = 1600;
    const fade = () => {
      const progress = Math.min(1, (performance.now() - started) / duration);
      from.volume = fadeVolume * (1 - progress);
      to.volume = fadeVolume * progress;
      if (progress < 1) fadeFrame.current = requestAnimationFrame(fade);
      else {
        from.pause();
        from.currentTime = 0;
        activeIndex.current = nextIndex;
        fadeFrame.current = null;
        setCurrentTrack(stage.track);
      }
    };
    fadeFrame.current = requestAnimationFrame(fade);
    return () => {
      if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
      fadeFrame.current = null;
    };
  }, [currentTrack, playing, stage.track, volume]);

  useEffect(() => {
    const pair = channels.current;
    if (!pair) return;
    pair[activeIndex.current].volume = volume;
  }, [volume]);

  const toggle = () => {
    const pair = channels.current;
    if (!pair) return;
    const active = pair[activeIndex.current];
    if (!active.src) {
      active.src = stage.track;
      setCurrentTrack(stage.track);
    }
    if (playing) {
      pair.forEach((audio) => audio.pause());
      setPlaying(false);
    } else {
      active.volume = volume;
      void active.play().then(() => setPlaying(true)).catch(() => undefined);
    }
  };

  return { playing, toggle };
}

function App() {
  const [stageIndex, setStageIndex] = useState(0);
  const [volume, setVolume] = useState(0.42);
  const [auto, setAuto] = useState(false);
  const stage = stages[stageIndex];
  const { playing, toggle } = useCrossfade(stage, volume);

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => setStageIndex((index) => (index + 1) % stages.length), 9000);
    return () => window.clearInterval(timer);
  }, [auto]);

  return (
    <main className={`cycle-preview stage-${stage.id}`}>
      <section className="cycle-scene">
        <Canvas shadows dpr={[1, 1.6]} camera={{ position: [25, 24, 31], fov: 42 }}>
          <Suspense fallback={null}>
            <PreviewScene stage={stage} />
          </Suspense>
        </Canvas>
      </section>

      <header className="cycle-header">
        <div>
          <span>DAYLIGHT & SCORE REVIEW</span>
          <h1>沉岛远征 · 昼夜与音乐</h1>
        </div>
        <div className="asset-count">
          <Music2 size={16} />
          <strong>8</strong>
          <span>首现有 BGM</span>
        </div>
      </header>

      <aside className="stage-readout">
        <div className="time-lockup">
          <Clock3 size={17} />
          <strong>{stage.time}</strong>
          <span>{stage.label}</span>
        </div>
        <h2>{stage.phase}</h2>
        <div className="track-readout">
          <Music2 size={17} />
          <div>
            <span>当前配乐</span>
            <strong>{stage.trackLabel}</strong>
          </div>
        </div>
      </aside>

      <section className="cycle-controls">
        <div className="stage-tabs">
          {stages.map((item, index) => {
            const Icon = index === 0 ? Sun : index === 1 ? Trees : Mountain;
            return (
              <button
                key={item.id}
                className={stageIndex === index ? "active" : ""}
                type="button"
                onClick={() => setStageIndex(index)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                <small>{item.time}</small>
              </button>
            );
          })}
        </div>
        <div className="transport">
          <button className="play-button" type="button" onClick={toggle} title={playing ? "暂停音乐" : "播放音乐"}>
            {playing ? <Pause size={19} /> : <Play size={19} />}
          </button>
          <label>
            <span>音量</span>
            <input type="range" min="0" max="0.8" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          </label>
          <button className={`auto-button ${auto ? "active" : ""}`} type="button" onClick={() => setAuto((value) => !value)}>
            <SkipForward size={17} />
            自动演示
          </button>
        </div>
      </section>

      <div className="stage-meter" aria-hidden="true">
        <span className={stageIndex >= 0 ? "complete" : ""} />
        <span className={stageIndex >= 1 ? "complete" : ""} />
        <span className={stageIndex >= 2 ? "complete" : ""} />
      </div>
    </main>
  );
}

createRoot(document.querySelector("#day-cycle-root")!).render(<App />);
