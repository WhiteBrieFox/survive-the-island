import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Compass, Eye, Gamepad2, Plus, Radio, Users } from "lucide-react";
import type { Ack, PublicRoomState, SessionView } from "../shared/types";
import { AudioDeck } from "./components/AudioDeck";
import { BoardScene } from "./components/BoardScene";
import { GameHud } from "./components/GameHud";
import { LobbyPanel } from "./components/LobbyPanel";
import { useGameStore } from "./gameStore";
import { socket } from "./socket";

export function App() {
  const storeRoom = useGameStore((state) => state.room);
  const clientId = useGameStore((state) => state.clientId);
  const role = useGameStore((state) => state.role);
  const notice = useGameStore((state) => state.notice);
  const setRoom = useGameStore((state) => state.setRoom);
  const setSession = useGameStore((state) => state.setSession);
  const showNotice = useGameStore((state) => state.showNotice);
  const [name, setName] = useState(() => localStorage.getItem("island-name") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [asSpectator, setAsSpectator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [liveRoom, setLiveRoom] = useState<SessionView["room"] | null>(null);
  const room = liveRoom ?? storeRoom;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onState = (state: PublicRoomState) => {
      setRoom(state);
      setLiveRoom(state);
    };
    const onNotice = (message: string) => showNotice(message);
    socket.on("state", onState);
    socket.on("notice", onNotice);
    return () => {
      socket.off("state", onState);
      socket.off("notice", onNotice);
    };
  }, [setRoom, showNotice]);

  useEffect(() => {
    const token = localStorage.getItem("island-reconnect-token");
    if (!token || room) return;
    const resume = () => socket.emit("resumeSession", token, (result) => {
      if (result.ok && result.data) {
        setSession(result.data.clientId, result.data.role, result.data.room);
        setLiveRoom(result.data.room);
      }
      else localStorage.removeItem("island-reconnect-token");
    });
    if (socket.connected) resume();
    else socket.once("connect", resume);
    return () => { socket.off("connect", resume); };
  }, [room, setSession]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => showNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [notice, showNotice]);

  const handleSession = (result: Ack<SessionView>) => {
    if (!result.ok || !result.data) {
      setBusy(false);
      showNotice(result.error ?? "连接失败");
      return;
    }
    localStorage.setItem("island-name", nameRef.current?.value.trim() || name.trim());
    if (result.data.reconnectToken) localStorage.setItem("island-reconnect-token", result.data.reconnectToken);
    setSession(result.data.clientId, result.data.role, result.data.room);
    setLiveRoom(result.data.room);
    setBusy(false);
    window.location.reload();
  };

  const createRoom = () => {
    const currentName = nameRef.current?.value.trim() ?? name.trim();
    if (!currentName) return showNotice("先给自己取个名字");
    setBusy(true);
    socket.emit("createRoom", { name: currentName, password: passwordRef.current?.value ?? password }, handleSession);
  };

  const joinRoom = () => {
    const currentName = nameRef.current?.value.trim() ?? name.trim();
    const currentCode = codeRef.current?.value.trim() ?? code.trim();
    if (!currentName || !currentCode) return showNotice("请填写名字和房间码");
    setBusy(true);
    socket.emit("joinRoom", {
      name: currentName,
      code: currentCode,
      password: passwordRef.current?.value ?? password,
      asSpectator
    }, handleSession);
  };

  return (
    <main className="app-shell">
      <div className="scene-layer">
        <Canvas
          shadows
          dpr={[1, 1.6]}
          frameloop={room && !reducedMotion ? "always" : "demand"}
          camera={{
            position: window.innerWidth <= 760 ? [21, 24, 27] : [14, 16, 19],
            fov: window.innerWidth <= 760 ? 58 : 44
          }}
        >
          <BoardScene room={room} />
        </Canvas>
      </div>
      {!room && <div className="main-menu-art" aria-hidden="true" />}

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
              <input ref={nameRef} value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="探险者" />
            </label>
            <label>
              <span>房间码</span>
              <input
                className="room-code-input"
                ref={codeRef}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={6}
                placeholder="6 位代码"
              />
            </label>
            <label>
              <span>房间密码（可选）</span>
              <input
                ref={passwordRef}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={24}
                type="password"
                placeholder="创建或加入加密房间"
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
        <LobbyPanel room={room} clientId={clientId} role={role} />
      ) : (
        <GameHud room={room} clientId={clientId} role={role} />
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
      <AudioDeck room={room} />
    </main>
  );
}
