export interface Warning {
  reason: string;
  moderatorId: string;
  moderatorTag: string;
  date: string;
}

export interface Reform {
  reason: string;
  moderatorId: string;
  moderatorTag: string;
  date: string;
}

export interface Hoster {
  userId: string;
  username: string;
  rank: string;
  totalHosted: number;
  onBreak: boolean;
  breakReason: string;
  onRP: boolean;
  rpReason: string;
  warnings: Warning[];
  reforms: Reform[];
  joinedAt: string;
}

export interface BotData {
  hosters: Record<string, Hoster>;
  hosterOfTheWeek: string | null;
  sayEnabled: boolean;
}
