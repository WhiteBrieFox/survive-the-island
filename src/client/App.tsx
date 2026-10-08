import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Compass, Eye, Gamepad2, Plus, Radio, Users } from "lucide-react";
import type { Ack, SessionView } from "../shared/types";
import { BoardScene } from "./components/BoardScene";
import { GameHud } from "./components/GameHud";
import { LobbyPanel } from "./components/LobbyPanel";
import { useGameStore } from "./gameStore";
import { socket } from "./socket";

export function App() {
  const { room, setRoom, setSession, notice, showNotice } = useGameStore();
  const [name, setName] = useState(() => localStorage.getItem("island-name") ?? "");
  const [code, setCode] = useState("");
  const [asSpectator, setAsSpectator] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onState = (state: NonNullable<typeof room>) => setRoom(state);
    const onNotice = (message: string) => showNotice(message);
    socket.on("state", onState);
    socket.on("notice", onNotice);
    return () => {
      socket.off("state", onState);
      socket.off("notice", onNotice);
    };
  }, [room, setRoom, showNotice]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => showNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [notice, showNotice]);

  const handleSession = (result: Ack<SessionView>) => {
    setBusy(false);
    if (!result.ok || !result.data) {
      showNotice(result.error ?? "连接失败");
      return;
    }
    localStorage.setItem("island-name", name.trim());
    setSession(result.data.clientId, result.data.role, result.data.room);
  };

  const createRoom = () => {
    if (!name.trim()) return showNotice("先给自己取个名字");
    setBusy(true);
    socket.emit("createRoom", { name }, handleSession);
  };

  const joinRoom = () => {
    if (!name.trim() || !code.trim()) return showNotice("请填写名字和房间码");
    setBusy(true);
    socket.emit("joinRoom", { name, code, asSpectator }, handleSession);
  };

  return (
    <main className="app-shell">
      <div className="scene-layer">
        <Canvas shadows camera={{ position: [10, 12, 13], fov: 42 }}>
          <BoardScene room={room} />
        </Canvas>
      </div>

      {!room ? (
        <section className="entry-panel" aria-label="加入游戏">
          <div className="brand-lockup">
            <div className="brand-mark">
              <Compass size={28} />
            </div>
            <div>
              <span className="eyebrow">原创 3D 联机桌游</span>
              <h1>沉岛远征</h1>
            </div>
          </div>

          <div className="entry-fields">
            <label>
              <span>你的名字</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="探险者" />
            </label>
            <label>
              <span>房间码</span>
              <input
                className="room-code-input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={6}
                placeholder="6 位代码"
              />
            </label>
          </div>

          <div className="role-switch" role="group" aria-label="加入身份">
            <button className={!asSpectator ? "active" : ""} onClick={() => setAsSpectator(false)}>
              <Gamepad2 size={18} />
              入座
            </button>
            <button className={asSpectator ? "active" : ""} onClick={() => setAsSpectator(true)}>
              <Eye size={18} />
              观战
            </button>
          </div>

          <div className="entry-actions">
            <button className="primary-command" disabled={busy} onClick={joinRoom}>
              <Radio size={18} />
              加入房间
            </button>
            <button className="secondary-command" disabled={busy} onClick={createRoom}>
              <Plus size={18} />
              创建房间
            </button>
          </div>

          <div className="entry-meta">
            <span><Users size={15} />2–5 位玩家</span>
            <span><Eye size={15} />支持观战</span>
            <span><Gamepad2 size={15} />服务端 AI</span>
          </div>
        </section>
      ) : room.phase === "lobby" ? (
        <LobbyPanel />
      ) : (
        <GameHud />
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
