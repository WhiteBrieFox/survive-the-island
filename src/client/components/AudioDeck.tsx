import { useEffect, useRef, useState } from "react";
import { Music, Volume2, VolumeX } from "lucide-react";
import type { PublicRoomState } from "../../shared/types";
import { dayStageFor } from "../dayCycle";
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
  return dayStageFor(room).track;
}

export function AudioDeck({ room }: { room: PublicRoomState | null }) {
  const [mixer, setMixer] = useState(loadMixer);
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const firstBgmRef = useRef<HTMLAudioElement>(null);
  const secondBgmRef = useRef<HTMLAudioElement>(null);
  const activeBgmIndex = useRef(0);
  const currentTrack = useRef("");
  const fadeFrame = useRef<number | null>(null);
  const bgmVolume = useRef(mixer.bgm);
  const previousEventId = useRef<number | null>(null);
  const track = bgmFor(room);

  useEffect(() => {
    localStorage.setItem("island-audio", JSON.stringify(mixer));
    bgmVolume.current = mixer.bgm;
  }, [mixer]);

  const unlockAudio = () => {
    setUnlocked(true);
    if (mixer.muted) return;
    const channels = [firstBgmRef.current, secondBgmRef.current];
    void channels[activeBgmIndex.current]?.play().catch(() => undefined);
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
    const channels = [firstBgmRef.current, secondBgmRef.current];
    if (!channels[0] || !channels[1]) return;
    const active = channels[activeBgmIndex.current]!;

    if (!currentTrack.current) {
      active.src = track;
      active.dataset.track = track;
      active.volume = mixer.muted ? 0 : mixer.bgm;
      active.load();
      currentTrack.current = track;
    }

    if (currentTrack.current === track) {
      active.volume = mixer.muted ? 0 : mixer.bgm;
      if (!unlocked || mixer.muted) active.pause();
      else void active.play().catch(() => setUnlocked(false));
      return;
    }

    if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
    const nextIndex = activeBgmIndex.current === 0 ? 1 : 0;
    const next = channels[nextIndex]!;
    next.pause();
    next.src = track;
    next.dataset.track = track;
    next.currentTime = 0;
    next.volume = 0;
    next.load();

    if (!unlocked || mixer.muted) {
      active.pause();
      active.currentTime = 0;
      active.volume = 0;
      activeBgmIndex.current = nextIndex;
      currentTrack.current = track;
      return;
    }

    void next.play().catch(() => setUnlocked(false));
    const started = performance.now();
    const duration = 1600;
    const fade = () => {
      const progress = Math.min(1, (performance.now() - started) / duration);
      const volume = bgmVolume.current;
      active.volume = volume * (1 - progress);
      next.volume = volume * progress;
      if (progress < 1) {
        fadeFrame.current = requestAnimationFrame(fade);
        return;
      }
      active.pause();
      active.currentTime = 0;
      active.volume = 0;
      activeBgmIndex.current = nextIndex;
      currentTrack.current = track;
      fadeFrame.current = null;
    };
    fadeFrame.current = requestAnimationFrame(fade);

    return () => {
      if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
      fadeFrame.current = null;
    };
  }, [mixer.muted, track, unlocked]);

  useEffect(() => {
    const channels = [firstBgmRef.current, secondBgmRef.current];
    const active = channels[activeBgmIndex.current];
    if (!active || fadeFrame.current !== null) return;
    active.volume = mixer.muted ? 0 : mixer.bgm;
  }, [mixer.bgm, mixer.muted]);

  useEffect(() => () => {
    if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
    [firstBgmRef.current, secondBgmRef.current].forEach((bgm) => {
      if (!bgm) return;
      bgm.pause();
      bgm.currentTime = 0;
      bgm.removeAttribute("src");
      bgm.load();
    });
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
      <audio ref={firstBgmRef} loop preload="auto" />
      <audio ref={secondBgmRef} loop preload="auto" />
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
