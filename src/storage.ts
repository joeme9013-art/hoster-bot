import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import type { BotData, Hoster } from "./types.js";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "../bot-data.json");

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env["DATABASE_URL"];
    pool = new Pool({
      connectionString,
      ssl: connectionString ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

const SEED_HOSTERS: Array<{ userId: string; rank: string }> = [
  { userId: "1222684836091658330", rank: "Hoster Manager" },
  { userId: "1198527966972477505", rank: "Assistant Hoster Manager" },
  { userId: "1492904171240820786", rank: "Hoster" },
];

const DEFAULT_DATA: BotData = {
  hosters: {},
  hosterOfTheWeek: null,
  sayEnabled: false,
};

function applySeeds(data: BotData): boolean {
  let changed = false;
  for (const seed of SEED_HOSTERS) {
    if (!data.hosters[seed.userId]) {
      data.hosters[seed.userId] = {
        ...createDefaultHoster(seed.userId, "unknown"),
        rank: seed.rank,
      };
      changed = true;
    }
  }
  return changed;
}

async function dbSave(data: BotData): Promise<void> {
  const db = getPool();
  await db.query(`
    INSERT INTO bot_storage (key, value)
    VALUES ('main', $1)
    ON CONFLICT (key) DO UPDATE SET value = $1
  `, [JSON.stringify(data)]);
}

async function dbLoad(): Promise<BotData | null> {
  try {
    const db = getPool();
    const res = await db.query(`SELECT value FROM bot_storage WHERE key = 'main'`);
    if (res.rows.length === 0) return null;
    return JSON.parse(res.rows[0].value) as BotData;
  } catch {
    return null;
  }
}

export async function initializeStorage(): Promise<void> {
  // Create table if it doesn't exist
  try {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS bot_storage (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    console.log("[Storage] PostgreSQL table ready");
  } catch (e) {
    console.error("[Storage] Failed to create table:", e);
  }

  // Load from Postgres
  try {
    const dbData = await dbLoad();
    if (dbData && Object.keys(dbData.hosters ?? {}).length > 0) {
      const changed = applySeeds(dbData);
      // Write to local file as fast cache
      fs.writeFileSync(DATA_FILE, JSON.stringify(dbData, null, 2), "utf-8");
      if (changed) await dbSave(dbData).catch(() => {});
      console.log(`[Storage] Loaded ${Object.keys(dbData.hosters).length} hosters from PostgreSQL`);
    } else {
      // No DB data yet — seed from the committed bot-data.json
      const localData = loadDataFromFile();
      applySeeds(localData);
      fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2), "utf-8");
      await dbSave(localData).catch(() => {});
      console.log(`[Storage] Seeded ${Object.keys(localData.hosters).length} hosters into PostgreSQL`);
    }
  } catch (e) {
    console.error("[Storage] initializeStorage error:", e);
    // Fallback: just use local file
    const data = loadDataFromFile();
    if (applySeeds(data)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
    }
  }
}

function loadDataFromFile(): BotData {
  try {
    if (!fs.existsSync(DATA_FILE)) return { ...DEFAULT_DATA, hosters: {} };
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as BotData;
  } catch {
    return { ...DEFAULT_DATA };
  }
}

export function loadData(): BotData {
  // Always read from local file (kept in sync with DB)
  return loadDataFromFile();
}

export function saveData(data: BotData): void {
  // Write local file immediately (synchronous, fast)
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  // Persist to PostgreSQL asynchronously (survives redeploys)
  dbSave(data).catch((e) => console.error("[Storage] PostgreSQL save failed:", e));
}

export function getHoster(userId: string): Hoster | undefined {
  return loadData().hosters[userId];
}

export function setHoster(hoster: Hoster): void {
  const data = loadData();
  data.hosters[hoster.userId] = hoster;
  saveData(data);
}

export function removeHoster(userId: string): boolean {
  const data = loadData();
  if (!data.hosters[userId]) return false;
  delete data.hosters[userId];
  saveData(data);
  return true;
}

export function getAllHosters(): Hoster[] {
  return Object.values(loadData().hosters);
}

export function getHosterOfTheWeek(): string | null {
  return loadData().hosterOfTheWeek;
}

export function setHosterOfTheWeek(userId: string | null): void {
  const data = loadData();
  data.hosterOfTheWeek = userId;
  saveData(data);
}

export function createDefaultHoster(userId: string, username: string): Hoster {
  return {
    userId,
    username,
    rank: "Hoster",
    totalHosted: 0,
    onBreak: false,
    breakReason: "",
    onRP: false,
    rpReason: "",
    warnings: [],
    reforms: [],
    joinedAt: new Date().toISOString(),
  };
}
