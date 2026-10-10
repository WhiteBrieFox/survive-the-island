export const PLAYER_COLORS = ["coral", "teal", "gold", "violet", "sky"] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];
export type Terrain = "beach" | "forest" | "mountain";
export type RoomPhase = "lobby" | "playing" | "finished";
export type TurnPhase =
  | "setup-explorer"
  | "setup-raft"
  | "action"
  | "rising"
  | "creature"
  | "creature-move";
export type CreatureRoll = "sea-serpent" | "shark" | "kaiju";
export type CreatureType = CreatureRoll;
export type AbilityType = "paddles" | "dolphin" | "dive" | "creature-die" | "repellent";
export type Role = "player" | "spectator";
export type AIDifficulty = "casual" | "strategic";

export interface HexCoord {
  q: number;
  r: number;
}

export interface PlayerView {
  id: string;
  name: string;
  color: PlayerColor;
  isAI: boolean;
  aiDifficulty: AIDifficulty;
  connected: boolean;
  ready: boolean;
  score: number;
  rescued: number;
  lost: number;
  colors: PlayerColor[];
  abilities: AbilityType[];
  explorersToPlace: number;
  raftsToPlace: number;
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
  blocked?: boolean;
  revealedEffect?: "volcano" | "whirlpool";
}

export interface ExplorerView {
  id: string;
  ownerId: string;
  color: PlayerColor;
  tileId: string | null;
  rescued: boolean;
  lost: boolean;
  locationId: string | null;
  raftId: string | null;
  swimming: boolean;
  swamThisTurn: boolean;
  value?: number;
}

export interface WaterSpaceView extends HexCoord {
  id: string;
}

export interface RaftView {
  id: string;
  locationId: string;
}

export interface CreatureView {
  id: string;
  type: CreatureType;
  locationId: string;
}

export interface PendingChoiceView {
  type: "move-creature" | "repellent" | "displace" | "board-raft";
  creatureType?: CreatureType;
  creatureId?: string;
  stepsRemaining?: number;
  canFinish?: boolean;
  autoSkipReason?: "missing" | "blocked";
  responderIds?: string[];
  declinedIds?: string[];
  entityId?: string;
  entityKind?: "explorer" | "creature";
  allowedTargetIds?: string[];
  raftId?: string;
  candidateExplorerIds?: string[];
  maxSelections?: number;
}

export interface GameEventView {
  id: number;
  at: string;
  type: string;
  actorId?: string;
  message: string;
  detail?: string;
  payload?: Record<string, unknown>;
}

export interface PublicRoomState {
  code: string;
  phase: RoomPhase;
  hostId: string;
  revision: number;
  players: PlayerView[];
  spectators: SpectatorView[];
  tiles: TileView[];
  waterSpaces: WaterSpaceView[];
  explorers: ExplorerView[];
  rafts: RaftView[];
  creatures: CreatureView[];
  currentPlayerId: string | null;
  turnPhase: TurnPhase;
  creatureRoll: CreatureRoll | null;
  creatureRollId: number;
  actionsLeft: number;
  round: number;
  volcanoes: number;
  maxVolcanoes: number;
  pendingChoice: PendingChoiceView | null;
  log: string[];
  events: GameEventView[];
  winnerIds: string[];
}

export interface SessionView {
  clientId: string;
  role: Role;
  room: PublicRoomState;
  reconnectToken?: string;
}

export interface CreateRoomInput {
  name: string;
  password?: string;
  asSpectator?: boolean;
}

export interface JoinRoomInput {
  code: string;
  name: string;
  asSpectator: boolean;
  password?: string;
}

export interface Ack<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ClientToServerEvents {
  createRoom: (input: CreateRoomInput, ack: (result: Ack<SessionView>) => void) => void;
  joinRoom: (input: JoinRoomInput, ack: (result: Ack<SessionView>) => void) => void;
  resumeSession: (token: string, ack: (result: Ack<SessionView>) => void) => void;
  setReady: (ready: boolean, ack: (result: Ack) => void) => void;
  addAI: (difficulty: AIDifficulty, ack: (result: Ack) => void) => void;
  removeAI: (playerId: string, ack: (result: Ack) => void) => void;
  startGame: (ack: (result: Ack) => void) => void;
  placeExplorer: (tileId: string, ack: (result: Ack) => void) => void;
  placeRaft: (waterId: string, ack: (result: Ack) => void) => void;
  moveExplorer: (
    input: { explorerId: string; targetId: string; revision: number },
    ack: (result: Ack) => void
  ) => void;
  moveRaft: (
    input: { raftId: string; targetId: string; revision: number },
    ack: (result: Ack) => void
  ) => void;
  endTurn: (ack: (result: Ack) => void) => void;
  sinkTile: (tileId: string, ack: (result: Ack) => void) => void;
  rollCreatureDie: (ack: (result: Ack<CreatureRoll>) => void) => void;
  moveCreature: (
    input: { creatureId: string; targetId: string; revision: number },
    ack: (result: Ack) => void
  ) => void;
  finishCreatureMove: (ack: (result: Ack) => void) => void;
  respondRepellent: (use: boolean, ack: (result: Ack) => void) => void;
  resolveDisplacement: (targetId: string, ack: (result: Ack) => void) => void;
  resolveBoarding: (explorerIds: string[], ack: (result: Ack) => void) => void;
  useAbility: (
    input: { ability: AbilityType; actorId?: string; targetId?: string; secondaryTargetId?: string },
    ack: (result: Ack) => void
  ) => void;
  leaveRoom: (ack: (result: Ack) => void) => void;
}

export interface ServerToClientEvents {
  state: (state: PublicRoomState) => void;
  session: (session: SessionView) => void;
  notice: (message: string) => void;
}
