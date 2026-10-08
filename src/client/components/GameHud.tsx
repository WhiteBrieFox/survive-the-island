import { useEffect, useState } from "react";
import {
  Bot, ChevronRight, Dices, Eye, Fish, Flag, Flame, Footprints, Hand,
  Navigation, RotateCcw, Shield, Users, Waves
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { AbilityType, PublicRoomState, Role } from "../../shared/types";
import { useGameStore } from "../gameStore";
import { socket } from "../socket";

export function GameHud({
  room,
  clientId,
  role
}: {
  room: PublicRoomState;
  clientId: string | null;
  role: Role | null;
}) {
  const {
    selectedExplorerId, selectedRaftId, selectedCreatureId,
    activeAbility, setActiveAbility, showNotice
  } = useGameStore(useShallow((state) => ({
    selectedExplorerId: state.selectedExplorerId,
    selectedRaftId: state.selectedRaftId,
    selectedCreatureId: state.selectedCreatureId,
    activeAbility: state.activeAbility,
    setActiveAbility: state.setActiveAbility,
    showNotice: state.showNotice
  })));
  const [boardingIds, setBoardingIds] = useState<string[]>([]);
  const boardingChoice = room.pendingChoice?.type === "board-raft" ? room.pendingChoice : null;

  useEffect(() => {
    setBoardingIds([]);
  }, [boardingChoice?.raftId]);

  const current = room.players.find((player) => player.id === room.currentPlayerId);
  const me = room.players.find((player) => player.id === clientId);
  const myTurn = role === "player" && room.currentPlayerId === clientId;
  const canRespondRepellent = role === "player" &&
    room.pendingChoice?.type === "repellent" &&
    Boolean(clientId && room.pendingChoice.responderIds?.includes(clientId)) &&
    !room.pendingChoice.declinedIds?.includes(clientId ?? "");
  const winners = room.players.filter((player) => room.winnerIds.includes(player.id));
  const phaseLabels: Record<typeof room.turnPhase, string> = {
    "setup-explorer": "放置探险者",
    "setup-raft": "放置木筏",
    action: "行动阶段",
    rising: "水位上涨",
    creature: "生物阶段",
    "creature-move": "移动生物"
  };
  const phaseLabel = phaseLabels[room.turnPhase];
  const abilityNames: Record<AbilityType, string> = {
    paddles: "船桨", dolphin: "海豚", dive: "潜水", "creature-die": "生物骰", repellent: "驱逐剂"
  };
  const abilityDetails: Record<AbilityType, { description: string; hint: string; icon: typeof Dices }> = {
    paddles: { description: "将你能控制的木筏移动最多 2 格。", hint: "选牌后选择木筏与目标水域", icon: Navigation },
    dolphin: { description: "将一名游泳者移动最多 2 格。", hint: "选牌后选择游泳者与目标格", icon: Fish },
    dive: { description: "将任意一只海洋生物移至空水域。", hint: "选牌后选择生物与目标水域", icon: Waves },
    "creature-die": { description: "重新掷一次本回合的生物骰。", hint: "点击立即使用", icon: Dices },
    repellent: { description: "受到生物攻击时移除攻击者并保护同格单位。", hint: "攻击响应阶段使用", icon: Shield }
  };
  const abilityGroups = me?.abilities.reduce<Array<{ ability: AbilityType; count: number }>>((groups, ability) => {
    const existing = groups.find((group) => group.ability === ability);
    if (existing) existing.count += 1;
    else groups.push({ ability, count: 1 });
    return groups;
  }, []) ?? [];
  const nextExplorer = room.explorers.find((explorer) => explorer.ownerId === clientId && !explorer.locationId && !explorer.lost && !explorer.rescued);

  const activateAbility = (ability: AbilityType) => {
    if (ability === "creature-die") {
      socket.emit("useAbility", { ability }, (result) => !result.ok && showNotice(result.error ?? "能力使用失败"));
      return;
    }
    if (ability === "repellent") return showNotice("驱逐剂会在受到攻击时自动出现响应按钮");
    setActiveAbility(activeAbility === ability ? null : ability);
  };

  return (
    <>
      <header className="game-topbar">
        <div className="compact-brand">
          <span>沉岛远征</span>
          <strong>{room.code}</strong>
        </div>
        <div className="turn-readout">
          {room.phase === "finished" ? (
            <><Flag size={17} />远征结束</>
          ) : (
            <>
              {current?.isAI ? <Bot size={17} /> : <Footprints size={17} />}
              <span>{myTurn ? phaseLabel : `${current?.name ?? "等待"} · ${phaseLabel}`}</span>
              {room.turnPhase === "action" && <strong>{room.actionsLeft}</strong>}
            </>
          )}
        </div>
        <div className="round-readout">
          <span>第 {room.round} 轮</span>
          <span><Flame size={16} />{room.volcanoes}/{room.maxVolcanoes}</span>
          {role === "spectator" && <span><Eye size={16} />观战</span>}
        </div>
      </header>

      <aside className="score-panel">
        <div className="score-heading"><Users size={17} />远征队</div>
        {room.players.map((player) => (
          <div className={`score-row ${player.id === room.currentPlayerId ? "current" : ""}`} key={player.id}>
            <span className={`player-swatch swatch-${player.color}`} />
            <div>
              <strong>{player.name}</strong>
              <span>{player.rescued} 获救 · {player.lost} 失踪</span>
            </div>
            <b>{player.score}</b>
          </div>
        ))}
        {room.spectators.length > 0 && (
          <div className="watching"><Eye size={14} />{room.spectators.length} 人观战</div>
        )}
      </aside>

      <aside className="event-panel">
        <span className="eyebrow">航海日志</span>
        <div className="event-list">
          {room.log.slice(-5).reverse().map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}
        </div>
      </aside>

      {myTurn && room.phase === "playing" && room.turnPhase === "action" && (
        <div className="turn-actions">
          <span>点击己方棋子，再选择高亮相邻格</span>
          <button
            className="primary-command"
            onClick={() => socket.emit("endTurn", (result) => !result.ok && showNotice(result.error ?? "无法结束回合"))}
          >
            结束行动
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {myTurn && room.phase === "playing" && room.turnPhase === "setup-explorer" && (
        <div className="turn-actions setup-prompt">
          <span>选择高亮地形放置探险者</span>
          <strong>宝藏价值 {nextExplorer?.value ?? "?"}</strong>
        </div>
      )}

      {myTurn && room.phase === "playing" && room.turnPhase === "setup-raft" && (
        <div className="turn-actions setup-prompt">
          <span>选择与岛屿相邻的高亮水域放置木筏</span>
        </div>
      )}

      {myTurn && room.phase === "playing" && room.turnPhase === "rising" && (
        <div className="turn-actions phase-prompt">
          <span>选择一个高亮的最低地势格并翻开</span>
        </div>
      )}

      {myTurn && room.phase === "playing" && room.turnPhase === "creature" && (
        <div className="turn-actions">
          <span>水位结算完成，由你掷生物骰</span>
          <button
            className="primary-command"
            onClick={() =>
              socket.emit("rollCreatureDie", (result) => {
                if (!result.ok) showNotice(result.error ?? "无法掷骰");
              })
            }
          >
            掷生物骰
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {myTurn && room.phase === "playing" && room.turnPhase === "creature-move" && (
        <div className="turn-actions phase-prompt">
          {room.pendingChoice?.type === "move-creature" && (
            <>
              <span>
                选择一只{room.pendingChoice.creatureType === "sea-serpent" ? "海蛇" : room.pendingChoice.creatureType === "shark" ? "鲨鱼" : "巨兽"}，
                逐格移动（剩余 {room.pendingChoice.stepsRemaining ?? 0}）
              </span>
              {room.pendingChoice.canFinish && (
                <button
                  className="secondary-command"
                  onClick={() => socket.emit("finishCreatureMove", (result) => !result.ok && showNotice(result.error ?? "无法结束移动"))}
                >
                  结束移动
                </button>
              )}
            </>
          )}
          {room.pendingChoice?.type === "displace" && (
            <span>选择高亮相邻格，决定巨兽将该{room.pendingChoice.entityKind === "explorer" ? "探险者" : "生物"}推往哪里</span>
          )}
          {room.pendingChoice?.type === "repellent" && <span>等待受到攻击的玩家响应驱逐剂</span>}
        </div>
      )}

      {myTurn && room.phase === "playing" && room.turnPhase !== "creature-move" && room.pendingChoice?.type === "displace" && (
        <div className="turn-actions phase-prompt">
          <span>选择高亮相邻格，决定巨兽将该{room.pendingChoice.entityKind === "explorer" ? "探险者" : "生物"}推往哪里</span>
        </div>
      )}

      {canRespondRepellent && (
        <div className="response-panel">
          <strong>生物即将攻击你的探险者</strong>
          <span>使用驱逐剂可移除这只生物，并保护该格全部单位。</span>
          <div>
            <button
              className="primary-command"
              onClick={() => socket.emit("respondRepellent", true, (result) => !result.ok && showNotice(result.error ?? "响应失败"))}
            >
              使用驱逐剂
            </button>
            <button
              className="secondary-command"
              onClick={() => socket.emit("respondRepellent", false, (result) => !result.ok && showNotice(result.error ?? "响应失败"))}
            >
              不使用
            </button>
          </div>
        </div>
      )}

      {myTurn && boardingChoice && (
        <div className="boarding-panel">
          <strong>选择 {boardingChoice.maxSelections} 名探险者登筏</strong>
          <div className="boarding-list">
            {boardingChoice.candidateExplorerIds?.map((explorerId) => {
              const explorer = room.explorers.find((item) => item.id === explorerId);
              const owner = room.players.find((player) => player.id === explorer?.ownerId);
              const selected = boardingIds.includes(explorerId);
              return (
                <button
                  key={explorerId}
                  className={selected ? "active" : ""}
                  onClick={() => setBoardingIds((current) => selected
                    ? current.filter((id) => id !== explorerId)
                    : current.length < (boardingChoice.maxSelections ?? 0) ? [...current, explorerId] : current)}
                >
                  <span className={`player-swatch swatch-${explorer?.color ?? owner?.color ?? "coral"}`} />
                  {owner?.name ?? "探险者"}
                </button>
              );
            })}
          </div>
          <button
            className="primary-command"
            disabled={boardingIds.length !== boardingChoice.maxSelections}
            onClick={() => socket.emit("resolveBoarding", boardingIds, (result) => !result.ok && showNotice(result.error ?? "登筏失败"))}
          >
            确认登筏
          </button>
        </div>
      )}

      {me && me.abilities.length > 0 && room.phase === "playing" && (
        <aside className="ability-panel">
          <div className="ability-heading">
            <span><Hand size={17} />能力牌</span>
            <b>{me.abilities.length}</b>
          </div>
          <div className="ability-list">
            {abilityGroups.map(({ ability, count }) => {
              const detail = abilityDetails[ability];
              const Icon = detail.icon;
              const unavailable = ability === "repellent" && !canRespondRepellent;
              return (
                <button
                  key={ability}
                  className={`ability-card ability-${ability} ${activeAbility === ability ? "active" : ""}`}
                  onClick={() => activateAbility(ability)}
                  aria-pressed={activeAbility === ability}
                  title={detail.hint}
                >
                  <span className="ability-icon"><Icon size={19} /></span>
                  <span className="ability-copy">
                    <strong>{abilityNames[ability]}{count > 1 ? ` ×${count}` : ""}</strong>
                    <span>{detail.description}</span>
                    <small>{unavailable ? "等待攻击响应" : detail.hint}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      )}

      {room.phase === "finished" && (
        <section className="result-panel">
          <span className="eyebrow">远征完成</span>
          <h2>{winners.map((winner) => winner.name).join("、")} 获胜</h2>
          <p>最高得分 {winners[0]?.score ?? 0}</p>
          <button className="secondary-command" onClick={() => window.location.reload()}>
            <RotateCcw size={18} />
            返回大厅
          </button>
        </section>
      )}

      {me && role === "player" && (
        <div className="private-score">你的宝藏：{me.score}</div>
      )}
    </>
  );
}
