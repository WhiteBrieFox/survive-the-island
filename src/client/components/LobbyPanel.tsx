import { Bot, Check, Copy, Eye, LogOut, Play, Plus, Radio, Trash2, Users } from "lucide-react";
import { useGameStore } from "../gameStore";
import { socket } from "../socket";

export function LobbyPanel() {
  const { clientId, role, room, showNotice, reset } = useGameStore();
  if (!room) return null;
  const me = room.players.find((player) => player.id === clientId);
  const isHost = room.hostId === clientId;
  const allReady = room.players.length >= 2 && room.players.every((player) => player.isAI || player.ready);

  const emitSimple = (event: "addAI" | "startGame", errorFallback: string) => {
    socket.emit(event, (result) => {
      if (!result.ok) showNotice(result.error ?? errorFallback);
    });
  };

  const leave = () => {
    socket.emit("leaveRoom", () => {
      reset();
      window.location.reload();
    });
  };

  return (
    <section className="lobby-panel">
      <header className="panel-header">
        <div>
          <span className="eyebrow">远征集结中</span>
          <h2>房间 {room.code}</h2>
        </div>
        <button
          className="icon-button"
          title="复制房间码"
          onClick={() => navigator.clipboard?.writeText(room.code).then(() => showNotice("房间码已复制"))}
        >
          <Copy size={19} />
        </button>
      </header>

      <div className="lobby-status">
        <span><Radio size={15} />等待开始</span>
        <span><Users size={15} />{room.players.length}/5</span>
        <span><Eye size={15} />{room.spectators.length}</span>
      </div>

      <div className="seat-list">
        {room.players.map((player) => (
          <div className="seat-row" key={player.id}>
            <span className={`player-swatch swatch-${player.color}`} />
            <div className="seat-copy">
              <strong>{player.name}</strong>
              <span>{player.isAI ? "服务端 AI" : player.id === room.hostId ? "房主" : player.ready ? "已准备" : "未准备"}</span>
            </div>
            {player.isAI ? <Bot size={19} /> : player.ready ? <Check className="ready-icon" size={19} /> : null}
            {isHost && player.isAI && (
              <button
                className="icon-button small"
                title="移除 AI"
                onClick={() => socket.emit("removeAI", player.id, (result) => !result.ok && showNotice(result.error ?? "移除失败"))}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {room.spectators.length > 0 && (
        <div className="spectator-strip">
          <Eye size={16} />
          <span>{room.spectators.map((spectator) => spectator.name).join("、")}</span>
        </div>
      )}

      <div className="panel-actions">
        {role === "player" && me && (
          <button className={me.ready ? "secondary-command" : "primary-command"} onClick={() => socket.emit("setReady", !me.ready, () => undefined)}>
            <Check size={18} />
            {me.ready ? "取消准备" : "准备"}
          </button>
        )}
        {isHost && room.players.length < 5 && (
          <button className="secondary-command" onClick={() => emitSimple("addAI", "添加 AI 失败")}>
            <Plus size={18} />
            添加 AI
          </button>
        )}
        {isHost && (
          <button className="primary-command" disabled={!allReady} onClick={() => emitSimple("startGame", "无法开始")}>
            <Play size={18} />
            开始远征
          </button>
        )}
      </div>

      <button className="quiet-command" onClick={leave}>
        <LogOut size={16} />
        离开房间
      </button>
    </section>
  );
}
