import { useMemo, useState } from "react";
import {
  Anchor, Bot, Crown, Flag, Footprints, Gem, LifeBuoy, Map, Medal,
  RotateCcw, ScrollText, ShieldCheck, Skull, Trophy, Waves
} from "lucide-react";
import type { PublicRoomState } from "../../shared/types";

type ResultPanelProps = {
  room: PublicRoomState;
  clientId: string | null;
  onReturnToLobby: () => void;
  onOpenLog: () => void;
};

const rankLabels = ["冠军", "亚军", "季军"];

export function ResultPanel({ room, clientId, onReturnToLobby, onOpenLog }: ResultPanelProps) {
  const ranking = useMemo(
    () => [...room.players].sort((a, b) => b.score - a.score || b.rescued - a.rescued),
    [room.players]
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState(
    clientId && room.players.some((player) => player.id === clientId)
      ? clientId
      : ranking[0]?.id ?? ""
  );
  const selectedPlayer = room.players.find((player) => player.id === selectedPlayerId) ?? ranking[0];
  const winners = ranking.filter((player) => room.winnerIds.includes(player.id));
  const totalRescued = room.players.reduce((total, player) => total + player.rescued, 0);
  const totalScore = room.players.reduce((total, player) => total + player.score, 0);
  const expeditionEndedByVolcano = room.volcanoes >= room.maxVolcanoes;
  const finishedAt = room.events.at(-1)?.at;

  const playerReport = useMemo(() => {
    if (!selectedPlayer) return null;
    const explorers = room.explorers.filter((explorer) => explorer.ownerId === selectedPlayer.id);
    const stranded = Math.max(0, explorers.length - selectedPlayer.rescued - selectedPlayer.lost);
    const eventCount = (types: string[]) => room.events.filter(
      (event) => event.actorId === selectedPlayer.id && types.includes(event.type)
    ).length;
    return {
      total: explorers.length,
      stranded,
      survivalRate: explorers.length ? Math.round(selectedPlayer.rescued / explorers.length * 100) : 0,
      moves: eventCount(["explorer-moved", "swimmer-moved", "raft-moved"]),
      tiles: eventCount(["tile-sunk"]),
      creatures: eventCount(["creature-moved"]),
      abilities: eventCount(["ability-used"])
    };
  }, [room.events, room.explorers, selectedPlayer]);

  return (
    <div className="result-backdrop">
      <section className="result-dialog" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <header className="result-hero">
          <img src="/assets/generated/main-menu-key-art.png" alt="" />
          <div className="result-hero-shade" />
          <div className="result-title-block">
            <span className="result-kicker"><Flag size={15} />远征完成 · 第 {room.round} 轮</span>
            <div className="result-title-line">
              <span className="result-trophy"><Trophy size={29} /></span>
              <div>
                <h2 id="result-title">
                  {winners.map((winner) => winner.name).join("、")} 获胜
                </h2>
                <p>
                  {winners.length > 1 ? "并列登顶，分享本次远征胜利" : "宝藏满载，成功登顶远征榜首"}
                </p>
              </div>
            </div>
          </div>
          <div className="result-hero-score">
            <span>最高宝藏</span>
            <strong>{winners[0]?.score ?? 0}</strong>
          </div>
        </header>

        <div className="result-summary">
          <div><Map size={18} /><span>远征轮数<strong>{room.round}</strong></span></div>
          <div><LifeBuoy size={18} /><span>成功获救<strong>{totalRescued}</strong></span></div>
          <div><Gem size={18} /><span>带回宝藏<strong>{totalScore}</strong></span></div>
          <div>
            {expeditionEndedByVolcano ? <Waves size={18} /> : <ShieldCheck size={18} />}
            <span>结束原因<strong>{expeditionEndedByVolcano ? "火山爆发" : "全员结算"}</strong></span>
          </div>
        </div>

        <div className="result-content">
          <section className="result-ranking" aria-label="最终排名">
            <div className="result-section-heading">
              <div><Medal size={18} /><strong>最终排名</strong></div>
              <span>点击队员查看远征报告</span>
            </div>
            <div className="result-ranking-list">
              {ranking.map((player, index) => {
                const isWinner = room.winnerIds.includes(player.id);
                const place = index > 0 && player.score === ranking[index - 1].score
                  ? ranking.findIndex((item) => item.score === player.score) + 1
                  : index + 1;
                return (
                  <button
                    type="button"
                    key={player.id}
                    className={`result-rank-row ${selectedPlayer?.id === player.id ? "active" : ""} ${isWinner ? "winner" : ""}`}
                    onClick={() => setSelectedPlayerId(player.id)}
                  >
                    <span className="result-rank-number">{place}</span>
                    <span className={`player-swatch swatch-${player.color}`} />
                    <span className="result-player-name">
                      <strong>{player.name}{player.isAI && <Bot size={13} />}</strong>
                      <small>{isWinner ? rankLabels[0] : rankLabels[place - 1] ?? `第 ${place} 名`}</small>
                    </span>
                    <span className="result-rescue-count">{player.rescued} 获救 · {player.lost} 失踪</span>
                    <span className="result-player-score"><b>{player.score}</b><small>宝藏</small></span>
                    {isWinner && <Crown className="result-crown" size={17} />}
                  </button>
                );
              })}
            </div>
          </section>

          {selectedPlayer && playerReport && (
            <section className="result-report">
              <div className="result-section-heading">
                <div><ScrollText size={18} /><strong>{selectedPlayer.name} 的远征报告</strong></div>
                {selectedPlayer.id === clientId && <span className="result-you">这是你</span>}
              </div>
              <div className="result-report-score">
                <div>
                  <span>带回宝藏</span>
                  <strong>{selectedPlayer.score}</strong>
                </div>
                <div className="result-survival">
                  <span>队伍获救率 <b>{playerReport.survivalRate}%</b></span>
                  <div><i style={{ width: `${playerReport.survivalRate}%` }} /></div>
                </div>
              </div>
              <div className="result-outcomes">
                <div><LifeBuoy size={17} /><span>获救<strong>{selectedPlayer.rescued}</strong></span></div>
                <div><Skull size={17} /><span>失踪<strong>{selectedPlayer.lost}</strong></span></div>
                <div><Anchor size={17} /><span>未归队<strong>{playerReport.stranded}</strong></span></div>
              </div>
              <div className="result-activity">
                <div><Footprints size={16} /><span>移动</span><strong>{playerReport.moves}</strong></div>
                <div><Waves size={16} /><span>下沉地块</span><strong>{playerReport.tiles}</strong></div>
                <div><Map size={16} /><span>操控生物</span><strong>{playerReport.creatures}</strong></div>
                <div><ShieldCheck size={16} /><span>使用能力</span><strong>{playerReport.abilities}</strong></div>
              </div>
            </section>
          )}
        </div>

        <footer className="result-footer">
          <div>
            <span>房间 {room.code}</span>
            <small>
              {finishedAt ? new Date(finishedAt).toLocaleDateString("zh-CN") : "本次远征"}
              {" · "}远征记录已保留在航海日志
            </small>
          </div>
          <button className="secondary-command" type="button" onClick={onOpenLog}>
            <ScrollText size={17} />
            查看航海日志
          </button>
          <button className="primary-command" type="button" onClick={onReturnToLobby}>
            <RotateCcw size={17} />
            返回大厅
          </button>
        </footer>
      </section>
    </div>
  );
}
