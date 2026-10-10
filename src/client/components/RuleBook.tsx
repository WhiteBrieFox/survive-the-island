import { useEffect, useState } from "react";
import {
  Anchor, BookOpen, Dices, Fish, Footprints, Gem, LifeBuoy, Mountain,
  Navigation, Shield, ShipWheel, Waves, X
} from "lucide-react";

type RuleSection = "flow" | "movement" | "creatures" | "tiles";

const sections: Array<{ id: RuleSection; label: string; icon: typeof BookOpen }> = [
  { id: "flow", label: "回合流程", icon: ShipWheel },
  { id: "movement", label: "移动救援", icon: Navigation },
  { id: "creatures", label: "生物图鉴", icon: Fish },
  { id: "tiles", label: "地块与能力", icon: Mountain }
];

export function RuleBook({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [section, setSection] = useState<RuleSection>("flow");

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="rules-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="rules-dialog" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <header className="rules-header">
          <div>
            <span className="eyebrow">远征手册</span>
            <h2 id="rules-title">沉岛远征完整规则</h2>
          </div>
          <button className="icon-button" type="button" aria-label="关闭规则" title="关闭规则" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="rules-hero">
          <img src="/assets/generated/main-menu-key-art.png" alt="探险者乘木筏逃离沉没岛屿，海中有鲨鱼、海蛇和巨兽" />
          <div className="rules-hero-copy">
            <strong>救出高价值探险者</strong>
            <span>在第三座火山爆发前，乘木筏抵达外围救援岛。</span>
          </div>
        </div>

        <nav className="rules-tabs" aria-label="规则章节">
          {sections.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={section === id ? "active" : ""} onClick={() => setSection(id)}>
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        <div className="rules-content">
          {section === "flow" && (
            <div className="rules-section">
              <div className="rules-lead">
                <Gem size={28} />
                <div>
                  <h3>目标与胜负</h3>
                  <p>每名探险者拥有隐藏宝藏价值。只有乘木筏到达救援岛才算获救并计分；所有探险者获救或失踪，或第三座火山爆发时游戏结束，得分最高者获胜。</p>
                </div>
              </div>
              <ol className="turn-timeline">
                <li><b>1</b><div><strong>行动阶段</strong><span>获得 3 个行动点，可移动探险者或木筏。每次相邻移动消耗 1 点。</span></div></li>
                <li><b>2</b><div><strong>水位上涨</strong><span>翻开一个当前最低地势：先海滩，再森林，最后山地，并立即结算背面效果。</span></div></li>
                <li><b>3</b><div><strong>生物阶段</strong><span>掷生物骰，由当前玩家选择对应生物并逐格移动，也可以主动跳过。</span></div></li>
                <li><b>4</b><div><strong>下一位玩家</strong><span>所有攻击、推离与能力响应结算完成后，回合才会交给下一位玩家。</span></div></li>
              </ol>
              <div className="rule-callout"><Dices size={20} /><span>开局先轮流放置全部探险者，再放置木筏。整个放置阶段都能看到自己每名探险者的宝藏价值，正式行动开始后隐藏。</span></div>
            </div>
          )}

          {section === "movement" && (
            <div className="rules-section">
              <div className="rules-grid">
                <article>
                  <Footprints size={24} />
                  <h3>探险者</h3>
                  <p>每次走到相邻格，每格最多容纳 5 名探险者。进入水域、从水域离开或在水中移动都算游泳；同一名落水者每回合最多游泳移动一次。</p>
                </article>
                <article>
                  <LifeBuoy size={24} />
                  <h3>木筏</h3>
                  <p>每艘最多乘坐 3 人。木筏进入或经过落水者所在水域时，只要有空位就会自动救起落水者。</p>
                </article>
                <article>
                  <Anchor size={24} />
                  <h3>控制权</h3>
                  <p>空木筏任何玩家都能移动；有乘员时，你必须在船上有人，且你的人数不少于其他任一玩家。</p>
                </article>
                <article>
                  <Navigation size={24} />
                  <h3>抵达终点</h3>
                  <p>救援岛不能游上去，必须乘木筏抵达。到达后探险者留在救援岛，其宝藏价值加入所属玩家分数，且不能再移动。</p>
                </article>
              </div>
              <div className="rule-callout warning"><Waves size={20} /><span>木筏会优先经过能够救人的两格航线；如果船已坐满，剩余落水者会继续留在水中。</span></div>
            </div>
          )}

          {section === "creatures" && (
            <div className="rules-section creature-rules">
              <article className="creature-rule shark-rule">
                <div className="creature-rule-art">鲨鱼</div>
                <div><h3>鲨鱼 · 最多移动 2 格</h3><p>只能在水域行动。进入落水者所在格时吃掉所有仍在游泳的探险者，不会伤害木筏上的乘员。</p></div>
              </article>
              <article className="creature-rule serpent-rule">
                <div className="creature-rule-art">海蛇</div>
                <div><h3>海蛇 · 最多移动 1 格</h3><p>只能在水域行动。进入有单位的格子时，摧毁木筏并使该格全部探险者失踪。海蛇攻击无法使用驱逐剂，是最危险的海洋生物。</p></div>
              </article>
              <article className="creature-rule kaiju-rule">
                <div className="creature-rule-art">巨兽</div>
                <div><h3>巨兽 · 最多移动 2 格</h3><p>可以踏上陆地或进入水域，会摧毁同格木筏并推走其他单位。被推上有空位的木筏会直接登船；被推到鲨鱼或海蛇所在格会立即结算攻击。骰子移动时由掷骰者选择推离方向，翻格出现时随机推离。</p></div>
              </article>
              <div className="rule-callout"><Shield size={20} /><span>驱逐剂只可响应鲨鱼或巨兽攻击，移除攻击者并保护该格单位；海蛇攻击不会出现驱逐剂响应窗口。若对应生物没有合法移动目标，系统会自动跳过。</span></div>
            </div>
          )}

          {section === "tiles" && (
            <div className="rules-section">
              <div className="terrain-order">
                <div className="terrain-step beach-step"><b>1</b><strong>海滩</strong><span>最先沉没</span></div>
                <div className="terrain-step forest-step"><b>2</b><strong>森林</strong><span>海滩耗尽后</span></div>
                <div className="terrain-step mountain-step"><b>3</b><strong>山地</strong><span>最后沉没</span></div>
              </div>
              <div className="rules-grid ability-rules">
                <article><strong>船桨</strong><p>将一艘你能控制的木筏移动最多 2 格，沿途可以自动救起落水者。</p></article>
                <article><strong>海豚</strong><p>将你的一名落水者移动最多 2 格，但不能直接送上救援岛。</p></article>
                <article><strong>潜水</strong><p>把任意一只海洋生物移动到一个没有生物的水域。</p></article>
                <article><strong>生物骰</strong><p>在行动阶段额外掷一次生物骰，完成生物移动后继续原行动阶段。</p></article>
                <article><strong>驱逐剂</strong><p>仅在鲨鱼或巨兽攻击时使用，移除攻击者并取消本次攻击；不能驱逐海蛇。</p></article>
                <article><strong>火山与漩涡</strong><p>火山累计至 3 座会结束游戏；漩涡会吞噬所在格的单位。</p></article>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
