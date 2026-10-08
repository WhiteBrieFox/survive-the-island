import { Bot, ChevronRight, Eye, Flag, Flame, Footprints, RotateCcw, Users } from "lucide-react";
import { useGameStore } from "../gameStore";
import { socket } from "../socket";

export function GameHud() {
  const { clientId, role, room, showNotice } = useGameStore();
  if (!room) return null;
  const current = room.players.find((player) => player.id === room.currentPlayerId);
  const me = room.players.find((player) => player.id === clientId);
  const myTurn = role === "player" && room.currentPlayerId === clientId;
  const winners = room.players.filter((player) => room.winnerIds.includes(player.id));
  const phaseLabel =
    room.turnPhase === "action" ? "行动阶段" : room.turnPhase === "rising" ? "水位上涨" : "生物阶段";

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
