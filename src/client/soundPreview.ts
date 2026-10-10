import {
  soundDefinitions,
  playSound,
  stopSoundPreview,
  type SoundCategory,
  type SoundId
} from "./sampleSoundDesign";
import "./soundPreview.css";

const categoryNames: Record<SoundCategory, string> = {
  setup: "入场与布置",
  movement: "移动与救援",
  board: "地块与结算",
  creature: "生物行为",
  reward: "能力与奖励",
  ui: "界面提示"
};

const categoryOrder: SoundCategory[] = ["setup", "movement", "board", "creature", "reward", "ui"];
const root = document.querySelector<HTMLDivElement>("#sound-preview-root")!;

root.innerHTML = `
  <main class="sound-shell">
    <header class="sound-header">
      <div>
        <span>BEHAVIOR SOUND REVIEW</span>
        <h1>沉岛远征 · 行为音效预览</h1>
        <p>真实录音素材候选，已按游戏行为分层编排，确认后再接入正式游戏。</p>
      </div>
      <label class="master-volume">
        <span>试听音量</span>
        <input id="master-volume" type="range" min="0" max="1" step="0.01" value="0.72" />
        <output id="volume-output">72%</output>
      </label>
    </header>
    <nav class="sound-tabs">
      ${categoryOrder.map((category, index) => `
        <button type="button" data-category="${category}" class="${index === 0 ? "active" : ""}">
          ${categoryNames[category]}
          <b>${soundDefinitions.filter((sound) => sound.category === category).length}</b>
        </button>
      `).join("")}
    </nav>
    <section class="sound-list" id="sound-list"></section>
    <footer class="sound-footer">
      <strong>试听说明</strong>
      <span>候选素材来自 Mixkit 免费音效库与 Kenney CC0 音效包。试听会自动停止上一项，避免声音相互叠加。</span>
    </footer>
  </main>
`;

const list = document.querySelector<HTMLElement>("#sound-list")!;
const volumeInput = document.querySelector<HTMLInputElement>("#master-volume")!;
const volumeOutput = document.querySelector<HTMLOutputElement>("#volume-output")!;
let activeCategory = categoryOrder[0];
let activeSound: SoundId | null = null;

function render() {
  const sounds = soundDefinitions.filter((sound) => sound.category === activeCategory);
  list.innerHTML = sounds.map((sound, index) => `
    <article class="sound-row ${activeSound === sound.id ? "playing" : ""}">
      <span class="sound-index">${String(index + 1).padStart(2, "0")}</span>
      <div class="sound-copy">
        <strong>${sound.label}</strong>
        <span>${sound.description}</span>
        <em>${sound.source}</em>
      </div>
      <small>${sound.duration}</small>
      <button type="button" data-sound="${sound.id}" title="试听${sound.label}">
        <span class="play-icon"></span>
        试听
      </button>
    </article>
  `).join("");
  list.querySelectorAll<HTMLButtonElement>("[data-sound]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.sound as SoundId;
      activeSound = id;
      render();
      await playSound(id, Number(volumeInput.value));
      window.setTimeout(() => {
        if (activeSound === id) {
          activeSound = null;
          render();
        }
      }, 1600);
    });
  });
}

document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((button) => {
  button.addEventListener("click", () => {
    stopSoundPreview();
    activeCategory = button.dataset.category as SoundCategory;
    activeSound = null;
    document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    render();
  });
});

volumeInput.addEventListener("input", () => {
  volumeOutput.value = `${Math.round(Number(volumeInput.value) * 100)}%`;
});

render();
