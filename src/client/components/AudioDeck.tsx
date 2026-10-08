import { useEffect, useMemo, useRef, useState } from "react";
import { Music, Volume2, VolumeX, Waves } from "lucide-react";
import type { PublicRoomState } from "../../shared/types";

type Mixer = {
  bgm: number;
  ambience: number;
  sfx: number;
  muted: boolean;
};

const defaultMixer: Mixer = { bgm: 0.42, ambience: 0.2, sfx: 0.62, muted: false };

function loadMixer() {
  try {
    return { ...defaultMixer, ...JSON.parse(localStorage.getItem("island-audio") ?? "{}") } as Mixer;
  } catch {
    return defaultMixer;
  }
}

function trackFor(room: PublicRoomState | null) {
  if (!room || room.phase === "lobby") return "/assets/audio/lobby-1.m4a";
  if (room.phase === "finished" || room.volcanoes >= 2) return "/assets/audio/finale-1.m4a";
  if (room.volcanoes >= 1 || room.tiles.filter((tile) => tile.active && !tile.isRescue).length <= 20) {
    return "/assets/audio/crisis-1.m4a";
  }
  return "/assets/audio/exploration-1.m4a";
}

export function AudioDeck({ room }: { room: PublicRoomState | null }) {
  const [mixer, setMixer] = useState(loadMixer);
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const ambienceRef = useRef<HTMLAudioElement>(null);
  const previousEventId = useRef<number | null>(null);
  const track = useMemo(() => trackFor(room), [room]);

  useEffect(() => {
    localStorage.setItem("island-audio", JSON.stringify(mixer));
  }, [mixer]);

  useEffect(() => {
    const unlock = () => setUnlocked(true);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const bgm = bgmRef.current;
    const ambience = ambienceRef.current;
    if (!bgm || !ambience) return;
    bgm.volume = mixer.muted ? 0 : mixer.bgm;
    ambience.volume = mixer.muted ? 0 : mixer.ambience;
    ambience.playbackRate = 0.82;
    if (unlocked && !document.hidden && !mixer.muted) {
      void bgm.play().catch(() => undefined);
      void ambience.play().catch(() => undefined);
    } else {
      bgm.pause();
      ambience.pause();
    }
  }, [mixer, track, unlocked]);

  useEffect(() => {
    const onVisibility = () => {
      const bgm = bgmRef.current;
      const ambience = ambienceRef.current;
      if (!bgm || !ambience) return;
      if (document.hidden || mixer.muted) {
        bgm.pause();
        ambience.pause();
      } else if (unlocked) {
        void bgm.play().catch(() => undefined);
        void ambience.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [mixer.muted, unlocked]);

  useEffect(() => {
    const event = room?.events.at(-1);
    if (!event || previousEventId.current === null) {
      previousEventId.current = event?.id ?? null;
      return;
    }
    if (event.id === previousEventId.current || mixer.muted || mixer.sfx <= 0) return;
    previousEventId.current = event.id;
    const generatedSfx =
      event.type === "creature-die" ? "/assets/audio/sfx-dice.m4a" :
        ["kaiju-attack", "volcano"].includes(event.type) ? "/assets/audio/sfx-kaiju.m4a" :
          ["shark-attack", "sea-serpent-attack", "whirlpool"].includes(event.type) ? "/assets/audio/sfx-attack.m4a" :
            null;
    if (generatedSfx) {
      const audio = new Audio(generatedSfx);
      audio.volume = mixer.sfx;
      void audio.play().catch(() => undefined);
      return;
    }
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const dramatic = ["volcano", "whirlpool", "kaiju-attack", "sea-serpent-attack"].includes(event.type);
    oscillator.type = dramatic ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(dramatic ? 150 : 520, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(dramatic ? 70 : 760, context.currentTime + 0.16);
    gain.gain.setValueAtTime(mixer.sfx * 0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
    oscillator.addEventListener("ended", () => void context.close());
  }, [mixer.muted, mixer.sfx, room?.events]);

  const setLevel = (key: "bgm" | "ambience" | "sfx", value: number) => {
    setMixer((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="audio-deck">
      <audio ref={bgmRef} key={track} src={track} loop preload="auto" />
      <audio ref={ambienceRef} src="/assets/audio/ocean-ambience.m4a" loop preload="auto" />
      <button
        className="icon-button audio-toggle"
        title={mixer.muted ? "开启声音" : "音频设置"}
        onClick={() => mixer.muted ? setMixer((current) => ({ ...current, muted: false })) : setOpen((value) => !value)}
      >
        {mixer.muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>
      {open && (
        <section className="audio-popover">
          <header>
            <span><Music size={15} />声音</span>
            <button className="quiet-command" onClick={() => setMixer((current) => ({ ...current, muted: !current.muted }))}>
              {mixer.muted ? "全部开启" : "全部静音"}
            </button>
          </header>
          <label><span>音乐</span><input type="range" min="0" max="1" step="0.01" value={mixer.bgm} onChange={(event) => setLevel("bgm", Number(event.target.value))} /></label>
          <label><span><Waves size={13} />环境</span><input type="range" min="0" max="1" step="0.01" value={mixer.ambience} onChange={(event) => setLevel("ambience", Number(event.target.value))} /></label>
          <label><span>音效</span><input type="range" min="0" max="1" step="0.01" value={mixer.sfx} onChange={(event) => setLevel("sfx", Number(event.target.value))} /></label>
        </section>
      )}
    </div>
  );
}
