import { useEffect, useRef, useState } from "react";
import { Music, Volume2, VolumeX } from "lucide-react";
import type { PublicRoomState } from "../../shared/types";
import { dayStageFor } from "../dayCycle";
import { soundForGameEvent } from "../gameSound";
import { useGameStore } from "../gameStore";
import { playSound, stopSounds } from "../sampleSoundDesign";

type Mixer = {
  bgm: number;
  sfx: number;
  muted: boolean;
};

const defaultMixer: Mixer = { bgm: 0.38, sfx: 0.62, muted: false };
const BGM_CROSSFADE_SECONDS = 4;
const STAGE_CROSSFADE_MS = 1600;
const LOBBY_TRACK = "/assets/audio/lobby-1.m4a";
const MORNING_TRACK = "/assets/audio/exploration-1.m4a";

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

function bgmPlanFor(room: PublicRoomState | null) {
  if (!room || room.phase === "lobby") {
    return { key: "lobby", tracks: [LOBBY_TRACK], alternate: false };
  }
  if (room.phase === "finished") {
    return { key: "finished", tracks: ["/assets/audio/finale-1.m4a"], alternate: false };
  }
  const stage = dayStageFor(room);
  if (stage.id === "morning") {
    return { key: "morning", tracks: [LOBBY_TRACK, MORNING_TRACK], alternate: true };
  }
  return { key: stage.id, tracks: [stage.track], alternate: false };
}

export function AudioDeck({ room }: { room: PublicRoomState | null }) {
  const clientId = useGameStore((state) => state.clientId);
  const role = useGameStore((state) => state.role);
  const [mixer, setMixer] = useState(loadMixer);
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const firstBgmRef = useRef<HTMLAudioElement>(null);
  const secondBgmRef = useRef<HTMLAudioElement>(null);
  const activeBgmIndex = useRef(0);
  const currentTrack = useRef("");
  const currentPlanKey = useRef("");
  const alternating = useRef(false);
  const fadeFrame = useRef<number | null>(null);
  const bgmVolume = useRef(mixer.bgm);
  const audioUnlocked = useRef(unlocked);
  const audioMuted = useRef(mixer.muted);
  const previousEventId = useRef<number | null>(null);
  const previousMyTurn = useRef(false);
  const pendingTurnSound = useRef(false);
  const bgmPlan = bgmPlanFor(room);
  const planKey = bgmPlan.key;
  const primaryTrack = bgmPlan.tracks[0];
  const alternateTrack = bgmPlan.tracks[1] ?? "";
  alternating.current = bgmPlan.alternate;
  audioUnlocked.current = unlocked;
  audioMuted.current = mixer.muted;

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

  const crossfadeTo = (track: string, duration = STAGE_CROSSFADE_MS) => {
    const channels = [firstBgmRef.current, secondBgmRef.current];
    if (!channels[0] || !channels[1] || !track || currentTrack.current === track) return;
    const wasFading = fadeFrame.current !== null;
    if (fadeFrame.current !== null) {
      cancelAnimationFrame(fadeFrame.current);
      fadeFrame.current = null;
    }
    const activeIndex = wasFading && channels[0]!.volume !== channels[1]!.volume
      ? channels[0]!.volume > channels[1]!.volume ? 0 : 1
      : activeBgmIndex.current;
    const active = channels[activeIndex]!;
    const nextIndex = activeIndex === 0 ? 1 : 0;
    const next = channels[nextIndex]!;
    activeBgmIndex.current = activeIndex;
    next.pause();
    next.loop = false;
    next.src = track;
    next.dataset.track = track;
    next.currentTime = 0;
    next.volume = 0;
    next.load();

    if (!audioUnlocked.current || audioMuted.current) {
      active.pause();
      active.currentTime = 0;
      active.volume = 0;
      activeBgmIndex.current = nextIndex;
      currentTrack.current = track;
      next.loop = !alternating.current;
      return;
    }

    void next.play().catch(() => setUnlocked(false));
    const started = performance.now();
    const startingVolume = active.volume;
    const fade = () => {
      const progress = Math.min(1, (performance.now() - started) / duration);
      const volume = bgmVolume.current;
      active.volume = startingVolume * (1 - progress);
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
      next.loop = !alternating.current;
      fadeFrame.current = null;
    };
    fadeFrame.current = requestAnimationFrame(fade);
  };

  useEffect(() => {
    const channels = [firstBgmRef.current, secondBgmRef.current];
    if (!channels[0] || !channels[1]) return;
    const planChanged = currentPlanKey.current !== planKey;
    currentPlanKey.current = planKey;
    alternating.current = bgmPlan.alternate;

    if (!currentTrack.current) {
      const active = channels[activeBgmIndex.current]!;
      active.src = primaryTrack;
      active.dataset.track = primaryTrack;
      active.loop = !bgmPlan.alternate;
      active.volume = mixer.muted ? 0 : mixer.bgm;
      active.load();
      currentTrack.current = primaryTrack;
      if (unlocked && !mixer.muted) void active.play().catch(() => setUnlocked(false));
      return;
    }

    const active = channels[activeBgmIndex.current]!;
    if (bgmPlan.alternate && bgmPlan.tracks.includes(currentTrack.current)) {
      active.loop = false;
      active.volume = mixer.muted ? 0 : mixer.bgm;
      if (unlocked && !mixer.muted) void active.play().catch(() => setUnlocked(false));
      return;
    }

    if (planChanged && currentTrack.current !== primaryTrack) {
      crossfadeTo(primaryTrack);
      return;
    }

    active.loop = true;
    active.volume = mixer.muted ? 0 : mixer.bgm;
    if (!unlocked || mixer.muted) active.pause();
    else void active.play().catch(() => setUnlocked(false));
  }, [mixer.muted, planKey, primaryTrack, unlocked]);

  useEffect(() => {
    if (!bgmPlan.alternate || !alternateTrack) return;
    const channels = [firstBgmRef.current, secondBgmRef.current];
    const onTimeUpdate = (index: number) => {
      const active = channels[index];
      if (
        !active ||
        index !== activeBgmIndex.current ||
        fadeFrame.current !== null ||
        !Number.isFinite(active.duration) ||
        active.duration - active.currentTime > BGM_CROSSFADE_SECONDS
      ) return;
      const nextTrack = currentTrack.current === primaryTrack ? alternateTrack : primaryTrack;
      crossfadeTo(nextTrack, BGM_CROSSFADE_SECONDS * 1000);
    };
    const onEnded = (index: number) => {
      if (index !== activeBgmIndex.current || fadeFrame.current !== null) return;
      const nextTrack = currentTrack.current === primaryTrack ? alternateTrack : primaryTrack;
      crossfadeTo(nextTrack, 350);
    };
    const listeners = channels.map((audio, index) => {
      if (!audio) return null;
      const timeUpdate = () => onTimeUpdate(index);
      const ended = () => onEnded(index);
      audio.addEventListener("timeupdate", timeUpdate);
      audio.addEventListener("ended", ended);
      return { audio, timeUpdate, ended };
    });
    return () => listeners.forEach((listener) => {
      if (!listener) return;
      listener.audio.removeEventListener("timeupdate", listener.timeUpdate);
      listener.audio.removeEventListener("ended", listener.ended);
    });
  }, [alternateTrack, bgmPlan.alternate, primaryTrack]);

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
      const eventVolume = sound === "whirlpool"
        ? Math.min(1, mixer.sfx * 1.22)
        : mixer.sfx;
      playSound(sound, eventVolume, {
        channel: "game",
        interrupt: false,
        delay: index * 0.28
      });
    });
  }, [mixer.muted, mixer.sfx, room, unlocked]);

  useEffect(() => {
    if (!room) {
      previousMyTurn.current = false;
      pendingTurnSound.current = false;
      return;
    }
    const isMyTurn = role === "player" &&
      room.phase === "playing" &&
      Boolean(clientId) &&
      room.currentPlayerId === clientId;
    const becameMyTurn = isMyTurn && !previousMyTurn.current;
    previousMyTurn.current = isMyTurn;
    if (!isMyTurn) {
      pendingTurnSound.current = false;
      return;
    }
    if (becameMyTurn) pendingTurnSound.current = true;
    if (!pendingTurnSound.current || !unlocked || mixer.muted || mixer.sfx <= 0) return;
    pendingTurnSound.current = false;
    playSound("turn-start", Math.min(1, mixer.sfx * 1.18), {
      channel: "game",
      interrupt: false
    });
  }, [clientId, mixer.muted, mixer.sfx, role, room, unlocked]);

  useEffect(() => {
    if (mixer.muted || mixer.sfx <= 0) stopSounds("game");
  }, [mixer.muted, mixer.sfx]);

  return (
    <div className="audio-deck">
      <audio ref={firstBgmRef} preload="auto" />
      <audio ref={secondBgmRef} preload="auto" />
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
