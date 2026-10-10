import { useEffect, useRef, useState } from "react";
import { Music, Volume2, VolumeX } from "lucide-react";
import type { PublicRoomState } from "../../shared/types";

type Mixer = {
  bgm: number;
  sfx: number;
  muted: boolean;
};

const defaultMixer: Mixer = { bgm: 0.38, sfx: 0.62, muted: false };

function loadMixer() {
  try {
    const saved = JSON.parse(localStorage.getItem("island-audio") ?? "{}") as Partial<Mixer>;
    return {
      ...defaultMixer,
      bgm: saved.bgm ?? defaultMixer.bgm,
      sfx: saved.sfx ?? defaultMixer.sfx,
      muted: saved.muted ?? false
    };
  } catch {
    return defaultMixer;
  }
}

function bgmFor(room: PublicRoomState | null) {
  if (!room || room.phase === "lobby") return "/assets/audio/lobby-1.m4a";
  if (room.phase === "finished") return "/assets/audio/finale-1.m4a";
  if (room.volcanoes >= Math.max(1, room.maxVolcanoes - 1)) return "/assets/audio/crisis-1.m4a";
  return "/assets/audio/exploration-1.m4a";
}

function sfxFor(eventType: string) {
  if (eventType === "creature-die") return "/assets/audio/sfx-dice.m4a";
  if (eventType === "kaiju-attack" || eventType === "creature-spawned") return "/assets/audio/sfx-kaiju.m4a";
  if (["shark-attack", "sea-serpent-attack", "whirlpool", "volcano"].includes(eventType)) {
    return "/assets/audio/sfx-attack.m4a";
  }
  return null;
}

export function AudioDeck({ room }: { room: PublicRoomState | null }) {
  const [mixer, setMixer] = useState(loadMixer);
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const ambienceRef = useRef<HTMLAudioElement>(null);
  const previousEventId = useRef<number | null>(null);
  const track = bgmFor(room);

  useEffect(() => {
    localStorage.setItem("island-audio", JSON.stringify(mixer));
  }, [mixer]);

  const unlockAudio = () => {
    setUnlocked(true);
    if (mixer.muted) return;
    void bgmRef.current?.play().catch(() => undefined);
    void ambienceRef.current?.play().catch(() => undefined);
  };

  useEffect(() => {
    if (unlocked) return;
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [unlocked]);

  useEffect(() => {
    const bgm = bgmRef.current;
    const ambience = ambienceRef.current;
    if (!bgm || !ambience) return;
    bgm.volume = mixer.muted ? 0 : mixer.bgm;
    ambience.volume = mixer.muted ? 0 : mixer.bgm * (room ? 0.22 : 0.12);
    if (!unlocked || mixer.muted) {
      bgm.pause();
      ambience.pause();
      return;
    }
    void bgm.play().catch(() => setUnlocked(false));
    void ambience.play().catch(() => undefined);
  }, [mixer.bgm, mixer.muted, room, track, unlocked]);

  useEffect(() => {
    const event = room?.events.at(-1);
    if (!event || previousEventId.current === null) {
      previousEventId.current = event?.id ?? null;
      return;
    }
    if (event.id === previousEventId.current) return;
    previousEventId.current = event.id;
    if (!unlocked || mixer.muted || mixer.sfx <= 0) return;
    const source = sfxFor(event.type);
    if (!source) return;
    const effect = new Audio(source);
    effect.volume = mixer.sfx;
    void effect.play().catch(() => undefined);
  }, [mixer.muted, mixer.sfx, room?.events, unlocked]);

  return (
    <div className="audio-deck">
      <audio ref={bgmRef} key={track} src={track} loop preload="auto" />
      <audio ref={ambienceRef} src="/assets/audio/ocean-ambience.m4a" loop preload="auto" />
      <button
        className="icon-button audio-toggle"
        title={mixer.muted ? "开启音乐" : unlocked ? "音乐设置" : "点击开启音乐"}
        onClick={() => {
          if (!unlocked || mixer.muted) {
            setMixer((current) => ({ ...current, muted: false }));
            unlockAudio();
          }
          setOpen((value) => !value);
        }}
      >
        {mixer.muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>
      {open && (
        <section className="audio-popover">
          <header>
            <span><Music size={15} />音乐与音效</span>
            <button className="quiet-command" onClick={() => setMixer((current) => ({ ...current, muted: !current.muted }))}>
              {mixer.muted ? "开启" : "静音"}
            </button>
          </header>
          {!unlocked && <button className="audio-unlock" onClick={unlockAudio}>点击开启背景音乐</button>}
          <label>
            <span>音乐</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={mixer.bgm}
              onChange={(event) => setMixer((current) => ({ ...current, bgm: Number(event.target.value) }))}
            />
          </label>
          <label>
            <span>音效</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={mixer.sfx}
              onChange={(event) => setMixer((current) => ({ ...current, sfx: Number(event.target.value) }))}
            />
          </label>
        </section>
      )}
    </div>
  );
}
