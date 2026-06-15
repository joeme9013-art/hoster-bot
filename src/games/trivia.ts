import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { activeGames, TriviaGame, TriviaQuestion } from "./state.js";

const MIN_PLAYERS = 2;
const QUESTION_TIME = 30_000;
const TOTAL_QUESTIONS = 10;

const QUESTION_POOL: TriviaQuestion[] = [
  { question: "What is the capital of France?", answer: "paris" },
  { question: "How many sides does a hexagon have?", answer: "6" },
  { question: "What planet is known as the Red Planet?", answer: "mars" },
  { question: "Who wrote Romeo and Juliet?", answer: "shakespeare", alt: ["william shakespeare"] },
  { question: "What is the largest ocean on Earth?", answer: "pacific", alt: ["pacific ocean"] },
  { question: "What is 8 × 7?", answer: "56" },
  { question: "What element has the chemical symbol 'O'?", answer: "oxygen" },
  { question: "What is the fastest land animal?", answer: "cheetah" },
  { question: "In what year did World War 2 end?", answer: "1945" },
  { question: "What is the square root of 144?", answer: "12" },
  { question: "How many bones are in the adult human body?", answer: "206" },
  { question: "What is the currency of Japan?", answer: "yen" },
  { question: "What color is a ruby?", answer: "red" },
  { question: "How many continents are there on Earth?", answer: "7" },
  { question: "What gas do plants absorb for photosynthesis?", answer: "carbon dioxide", alt: ["co2"] },
  { question: "What is the largest planet in the Solar System?", answer: "jupiter" },
  { question: "How many letters are in the English alphabet?", answer: "26" },
  { question: "What is the boiling point of water in Celsius?", answer: "100" },
  { question: "Who invented the telephone?", answer: "alexander graham bell", alt: ["graham bell", "bell"] },
  { question: "What is the smallest country in the world?", answer: "vatican city", alt: ["vatican"] },
  { question: "How many players are on a football (soccer) team?", answer: "11" },
  { question: "What is the chemical formula for water?", answer: "h2o" },
  { question: "Which animal is known as the King of the Jungle?", answer: "lion" },
  { question: "How many hours are in a day?", answer: "24" },
  { question: "What is the tallest mountain in the world?", answer: "mount everest", alt: ["everest"] },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getGame(guildId: string): TriviaGame | null {
  const g = activeGames.get(guildId);
  return g?.type === "trivia" ? (g as TriviaGame) : null;
}

function scoreboard(game: TriviaGame): string {
  if (game.players.length === 0) return "";
  return "**Scores:**\n" + game.players
    .sort((a, b) => b.score - a.score)
    .map((p, i) => `${i + 1}. **${p.username}** — ${p.score} pt${p.score !== 1 ? "s" : ""}`)
    .join("\n");
}

async function fetchChannel(guildId: string, client: Client): Promise<TextChannel | null> {
  const game = getGame(guildId);
  if (!game) return null;
  try { return (await client.channels.fetch(game.channelId)) as TextChannel; } catch { return null; }
}

export async function startTriviaGame(channel: TextChannel, guildId: string): Promise<void> {
  if (activeGames.has(guildId)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ A game is already running. Use `!game end` first.")] });
    return;
  }

  const game: TriviaGame = {
    type: "trivia", guildId, channelId: channel.id,
    phase: "joining", players: [],
    questions: shuffle(QUESTION_POOL).slice(0, TOTAL_QUESTIONS),
    questionIndex: 0, answered: false, questionTimer: null,
  };
  activeGames.set(guildId, game);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🧠 Trivia — General Knowledge")
    .setDescription(
      `**${TOTAL_QUESTIONS} questions** across a range of topics.\n\n` +
      "Type your answer in the chat — **first correct answer** scores a point!\n" +
      "Each question has **30 seconds**.\n\n" +
      "Click to join — anyone in the channel can play!"
    )
    .setFooter({ text: "Start with !game start once players are ready." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`trivia_join_${guildId}`).setLabel("Join Game").setStyle(ButtonStyle.Primary).setEmoji("🧠")
  );

  await channel.send({ embeds: [embed], components: [row] });
}

export async function joinTriviaGame(guildId: string, userId: string, username: string): Promise<"joined" | "already_in" | "no_game" | "wrong_phase"> {
  const game = getGame(guildId);
  if (!game) return "no_game";
  if (game.phase !== "joining") return "wrong_phase";
  if (game.players.some(p => p.userId === userId)) return "already_in";
  game.players.push({ userId, username, score: 0 });
  return "joined";
}

export async function beginTriviaGame(guildId: string, client: Client): Promise<string | null> {
  const game = getGame(guildId);
  if (!game) return "No active Trivia game.";
  if (game.phase !== "joining") return "Game has already started.";
  if (game.players.length < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players (have ${game.players.length}).`;

  game.phase = "active";
  const channel = await fetchChannel(guildId, client);
  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0x5865F2)
      .setTitle(`🧠 Trivia starts now! ${game.players.length} players.`)
      .setDescription(`${TOTAL_QUESTIONS} questions — type your answers fast!\n\nFirst question in 3 seconds...`)]
  });

  setTimeout(() => askQuestion(guildId, client), 3000);
  return null;
}

async function askQuestion(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "active") return;

  if (game.questionIndex >= game.questions.length) {
    await resolveTrivia(guildId, client);
    return;
  }

  game.answered = false;
  const q = game.questions[game.questionIndex];
  const channel = await fetchChannel(guildId, client);

  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0x5865F2)
      .setTitle(`❓ Question ${game.questionIndex + 1} / ${game.questions.length}`)
      .setDescription(`**${q.question}**\n\n⏱️ You have **30 seconds**!`)]
  });

  game.questionTimer = setTimeout(async () => {
    const g = getGame(guildId);
    if (!g || g.phase !== "active" || g.answered) return;
    const ch = await fetchChannel(guildId, client);
    await ch?.send({
      embeds: [new EmbedBuilder().setColor(0xed4245)
        .setDescription(`⏰ Time's up! Nobody got it.\n✅ Answer: **${q.answer}**\n\n${scoreboard(g)}`)]
    });
    g.questionIndex++;
    setTimeout(() => askQuestion(guildId, client), 3000);
  }, QUESTION_TIME);
}

export async function handleTriviaAnswer(
  guildId: string, userId: string, username: string,
  content: string, channel: TextChannel, client: Client
): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "active") return;
  if (game.channelId !== channel.id) return;
  if (game.answered) return;

  const q = game.questions[game.questionIndex];
  if (!q) return;

  const normalized = content.toLowerCase().trim();
  const accepted = [q.answer, ...(q.alt ?? [])];
  if (!accepted.some(a => normalized === a)) return;

  game.answered = true;
  if (game.questionTimer) clearTimeout(game.questionTimer);

  let player = game.players.find(p => p.userId === userId);
  if (player) {
    player.score++;
  } else {
    player = { userId, username, score: 1 };
    game.players.push(player);
  }

  await channel.send({
    embeds: [new EmbedBuilder().setColor(0x57f287)
      .setTitle(`✅ **${username}** got it!`)
      .setDescription(`Answer: **${q.answer}**\n\n${scoreboard(game)}`)]
  });

  game.questionIndex++;
  setTimeout(() => askQuestion(guildId, client), 3000);
}

async function resolveTrivia(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase === "ended") return;
  game.phase = "ended";
  if (game.questionTimer) clearTimeout(game.questionTimer);

  const channel = await fetchChannel(guildId, client);
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  const finalBoard = sorted.length > 0
    ? sorted.map((p, i) => `${["🥇","🥈","🥉"][i] ?? `${i+1}.`} **${p.username}** — ${p.score} pt${p.score !== 1 ? "s" : ""}`).join("\n")
    : "No one scored!";

  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0xFFD700)
      .setTitle("🧠 Trivia — Final Results!")
      .setDescription(
        winner
          ? `🏆 **${winner.username}** wins with **${winner.score}** point${winner.score !== 1 ? "s" : ""}!\n\n${finalBoard}`
          : finalBoard
      )]
  });

  activeGames.delete(guildId);
}

export async function forceEndTrivia(guildId: string, client: Client): Promise<boolean> {
  const game = getGame(guildId);
  if (!game) return false;
  await resolveTrivia(guildId, client);
  return true;
}
