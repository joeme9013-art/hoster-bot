export type MafiaRole = "mafia" | "doctor" | "sheriff" | "town";

export interface MafiaPlayer {
  userId: string;
  username: string;
  role: MafiaRole;
  alive: boolean;
}

export interface InfectionPlayer {
  userId: string;
  username: string;
  infected: boolean;
  lastInfectTime: number;
  dodgeUntil: number;
  lastDodgeTime: number;
  hasHealed: boolean;
}

export interface HotPotatoPlayer {
  userId: string;
  username: string;
  alive: boolean;
}

export interface RoulettePlayer {
  userId: string;
  username: string;
  alive: boolean;
}

export interface TriviaPlayer {
  userId: string;
  username: string;
  score: number;
}

export interface TriviaQuestion {
  question: string;
  answer: string;
  alt?: string[];
}

export interface MafiaGame {
  type: "mafia";
  guildId: string;
  channelId: string;
  phase: "joining" | "day" | "night" | "ended";
  players: MafiaPlayer[];
  votes: Map<string, string>;
  nightKillTarget: string | null;
  nightSaveTarget: string | null;
  nightInvestigateTarget: string | null;
  mafiaActed: Set<string>;
  doctorActed: boolean;
  sheriffActed: boolean;
  day: number;
  phaseTimer: ReturnType<typeof setTimeout> | null;
}

export interface InfectionGame {
  type: "infection";
  guildId: string;
  channelId: string;
  phase: "joining" | "active" | "ended";
  players: InfectionPlayer[];
  gameTimer: ReturnType<typeof setTimeout> | null;
}

export interface HotPotatoGame {
  type: "hotpotato";
  guildId: string;
  channelId: string;
  phase: "joining" | "active" | "ended";
  players: HotPotatoPlayer[];
  holderId: string;
  round: number;
  roundTimer: ReturnType<typeof setTimeout> | null;
}

export interface RouletteGame {
  type: "roulette";
  guildId: string;
  channelId: string;
  phase: "joining" | "active" | "ended";
  players: RoulettePlayer[];
  roundTimer: ReturnType<typeof setTimeout> | null;
}

export interface TriviaGame {
  type: "trivia";
  guildId: string;
  channelId: string;
  phase: "joining" | "active" | "ended";
  players: TriviaPlayer[];
  questions: TriviaQuestion[];
  questionIndex: number;
  answered: boolean;
  questionTimer: ReturnType<typeof setTimeout> | null;
}

export type AnyGame = MafiaGame | InfectionGame | HotPotatoGame | RouletteGame | TriviaGame;

export interface PendingDMAction {
  guildId: string;
  type: "day_vote" | "night_kill" | "night_save" | "night_investigate";
  options: Array<{ userId: string; name: string }>;
}

export const activeGames = new Map<string, AnyGame>();
export const pendingDMActions = new Map<string, PendingDMAction>();
