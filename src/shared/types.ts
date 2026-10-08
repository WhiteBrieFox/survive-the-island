export const PLAYER_COLORS = ["coral", "teal", "gold", "violet", "sky"] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];
export type Terrain = "beach" | "forest" | "mountain";
export type RoomPhase = "lobby" | "playing" | "finished";
export type TurnPhase = "action" | "rising" | "creature";
export type CreatureRoll = "sea-serpent" | "shark" | "kaiju";
export type Role = "player" | "spectator";

export interface HexCoord {
  q: number;
  r: number;
}

export interface PlayerView {
  id: string;
  name: string;
  color: PlayerColor;
  isAI: boolean;
  connected: boolean;
  ready: boolean;
  score: number;
  rescued: number;
  lost: number;
}

export interface SpectatorView {
  id: string;
  name: string;
  connected: boolean;
}

export interface TileView extends HexCoord {
  id: string;
  terrain: Terrain;
  active: boolean;
  sinking: boolean;
  isRescue?: boolean;
}

export interface ExplorerView {
  id: string;
  ownerId: string;
  tileId: string | null;
  rescued: boolean;
  lost: boolean;
  value?: number;
}

export interface PublicRoomState {
  code: string;
  phase: RoomPhase;
  hostId: string;
  revision: number;
  players: PlayerView[];
  spectators: SpectatorView[];
  tiles: TileView[];
  explorers: ExplorerView[];
  currentPlayerId: string | null;
  turnPhase: TurnPhase;
  creatureRoll: CreatureRoll | null;
  actionsLeft: number;
  round: number;
  volcanoes: number;
  maxVolcanoes: number;
  log: string[];
  winnerIds: string[];
}

export interface SessionView {
  clientId: string;
  role: Role;
  room: PublicRoomState;
}

export interface CreateRoomInput {
  name: string;
  asSpectator?: boolean;
}

export interface JoinRoomInput {
  code: string;
  name: string;
  asSpectator: boolean;
}

export interface Ack<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ClientToServerEvents {
  createRoom: (input: CreateRoomInput, ack: (result: Ack<SessionView>) => void) => void;
  joinRoom: (input: JoinRoomInput, ack: (result: Ack<SessionView>) => void) => void;
  setReady: (ready: boolean, ack: (result: Ack) => void) => void;
  addAI: (ack: (result: Ack) => void) => void;
  removeAI: (playerId: string, ack: (result: Ack) => void) => void;
  startGame: (ack: (result: Ack) => void) => void;
  moveExplorer: (
    input: { explorerId: string; targetTileId: string; revision: number },
    ack: (result: Ack) => void
  ) => void;
  endTurn: (ack: (result: Ack) => void) => void;
  sinkTile: (tileId: string, ack: (result: Ack) => void) => void;
  rollCreatureDie: (ack: (result: Ack<CreatureRoll>) => void) => void;
  leaveRoom: (ack: (result: Ack) => void) => void;
}

export interface ServerToClientEvents {
  state: (state: PublicRoomState) => void;
  session: (session: SessionView) => void;
  notice: (message: string) => void;
}
