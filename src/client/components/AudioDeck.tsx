import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { PublicRoomState } from "../../shared/types";

type Mixer = {
  sfx: number;
  muted: boolean;
};

const defaultMixer: Mixer = { sfx: 0.62, muted: false };

function loadMixer() {
  try {
    const saved = JSON.parse(localStorage.getItem("island-audio") ?? "{}") as Partial<Mixer>;
    return { ...defaultMixer, sfx: saved.sfx ?? defaultMixer.sfx, muted: saved.muted ?? false };
  } catch {
    return defaultMixer;
  }
}

export function AudioDeck({ room }: { room: PublicRoomState | null }) {
  const [mixer, setMixer] = useState(loadMixer);
  const [open, setOpen] = useState(false);
  const previousEventId = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem("island-audio", JSON.stringify(mixer));
  }, [mixer]);

  useEffect(() => {
    const event = room?.events.at(-1);
    if (!event || previousEventId.current === null) {
      previousEventId.current = event?.id ?? null;
      return;
    }
    if (event.id === previousEventId.current || mixer.muted || mixer.sfx <= 0) return;
    previousEventId.current = event.id;

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

  return (
    <div className="audio-deck">
      <button
        className="icon-button audio-toggle"
        title={mixer.muted ? "开启音效" : "音效设置"}
        onClick={() => mixer.muted
          ? setMixer((current) => ({ ...current, muted: false }))
          : setOpen((value) => !value)}
      >
        {mixer.muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>
      {open && (
        <section className="audio-popover">
          <header>
            <span>音效</span>
            <button className="quiet-command" onClick={() => setMixer((current) => ({ ...current, muted: !current.muted }))}>
              {mixer.muted ? "开启" : "静音"}
            </button>
          </header>
          <label>
            <span>音量</span>
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
