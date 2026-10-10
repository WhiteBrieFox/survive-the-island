import { useEffect, useRef, useState } from "react";
import { Music, Volume2, VolumeX } from "lucide-react";
import type { PublicRoomState } from "../../shared/types";
import { soundForGameEvent } from "../gameSound";
import { playSound, stopSounds } from "../sampleSoundDesign";

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

export function AudioDeck({ room }: { room: PublicRoomState | null }) {
  const [mixer, setMixer] = useState(loadMixer);
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const previousEventId = useRef<number | null>(null);
  const track = bgmFor(room);

  useEffect(() => {
    localStorage.setItem("island-audio", JSON.stringify(mixer));
  }, [mixer]);

  const unlockAudio = () => {
    setUnlocked(true);
    if (mixer.muted) return;
    void bgmRef.current?.play().catch(() => undefined);
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
    if (!bgm) return;
    if (bgm.dataset.track !== track) {
      bgm.pause();
      bgm.currentTime = 0;
      bgm.src = track;
      bgm.dataset.track = track;
      bgm.load();
    }
    bgm.volume = mixer.muted ? 0 : mixer.bgm;
    if (!unlocked || mixer.muted) {
      bgm.pause();
      return;
    }
    void bgm.play().catch(() => setUnlocked(false));
  }, [mixer.bgm, mixer.muted, track, unlocked]);

  useEffect(() => () => {
    const bgm = bgmRef.current;
    if (!bgm) return;
    bgm.pause();
    bgm.currentTime = 0;
    bgm.removeAttribute("src");
    bgm.load();
    stopSounds("game");
  }, []);

  useEffect(() => {
    const currentRoom = room;
    if (!currentRoom) {
      previousEventId.current = null;
      stopSounds("game");
      return;
    }
    const newestEvent = currentRoom.events.at(-1);
    if (!newestEvent || previousEventId.current === null) {
      previousEventId.current = newestEvent?.id ?? null;
      return;
    }
    if (newestEvent.id <= previousEventId.current) return;
    const unseenEvents = currentRoom.events.filter((event) => event.id > previousEventId.current!);
    previousEventId.current = newestEvent.id;
    if (!unlocked || mixer.muted || mixer.sfx <= 0) return;
    const sounds = unseenEvents
      .map((event) => soundForGameEvent(event, currentRoom))
      .filter((sound): sound is NonNullable<typeof sound> => sound !== null);
    sounds.forEach((sound, index) => {
      playSound(sound, mixer.sfx, {
        channel: "game",
        interrupt: false,
        delay: index * 0.28
      });
    });
  }, [mixer.muted, mixer.sfx, room, unlocked]);

  useEffect(() => {
    if (mixer.muted || mixer.sfx <= 0) stopSounds("game");
  }, [mixer.muted, mixer.sfx]);

  return (
    <div className="audio-deck">
      <audio ref={bgmRef} loop preload="auto" />
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
