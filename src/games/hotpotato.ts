import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { activeGames, HotPotatoGame } from "./state.js";

const MIN_PLAYERS = 2;
const MIN_TIMER = 15_000;
const MAX_TIMER = 45_000;

function getGame(guildId: string): HotPotatoGame | null {
  const g = activeGames.get(guildId);
  return g?.type === "hotpotato" ? (g as HotPotatoGame) : null;
}

async function fetchChannel(guildId: string, client: Client): Promise<TextChannel | null> {
  const game = getGame(guildId);
  if (!game) return null;
  try { return (await client.channels.fetch(game.channelId)) as TextChannel; } catch { return null; }
}

function randomTimer(): number {
  return MIN_TIMER + Math.floor(Math.random() * (MAX_TIMER - MIN_TIMER));
}

export async function startHotPotatoGame(channel: TextChannel, guildId: string): Promise<void> {
  if (activeGames.has(guildId)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ A game is already running. Use `!game end` first.")] });
    return;
  }

  const game: HotPotatoGame = {
    type: "hotpotato", guildId, channelId: channel.id,
    phase: "joining", players: [], holderId: "", round: 0, roundTimer: null,
  };
  activeGames.set(guildId, game);

  const embed = new EmbedBuilder()
    .setColor(0xFF6B00)
    .setTitle("🥔 Hot Potato — Don't get caught!")
    .setDescription(
      "A random player gets the **💣 bomb**. Pass it before it explodes!\n\n" +
      "💣 **Bomb holder** — use `!pass @user` to pass it to someone else\n" +
      "☠️ Whoever holds it when the timer runs out is **eliminated**\n" +
      "⏱️ The timer is **random** — you never know when it'll go off!\n\n" +
      "Last player standing wins. Needs at least 3 players — click to join!"
    )
    .setFooter({ text: "Start with !game start once enough players join." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`hotpotato_join_${guildId}`).setLabel("Join Game").setStyle(ButtonStyle.Danger).setEmoji("🥔")
  );

  await channel.send({ embeds: [embed], components: [row] });
}

export async function joinHotPotatoGame(guildId: string, userId: string, username: string): Promise<"joined" | "already_in" | "no_game" | "wrong_phase"> {
  const game = getGame(guildId);
  if (!game) return "no_game";
  if (game.phase !== "joining") return "wrong_phase";
  if (game.players.some(p => p.userId === userId)) return "already_in";
  game.players.push({ userId, username, alive: true });
  return "joined";
}

export async function beginHotPotatoGame(guildId: string, client: Client): Promise<string | null> {
  const game = getGame(guildId);
  if (!game) return "No active Hot Potato game.";
  if (game.phase !== "joining") return "Game has already started.";
  if (game.players.length < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players (have ${game.players.length}).`;

  game.phase = "active";
  await startRound(guildId, client);
  return null;
}

async function startRound(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "active") return;

  const alive = game.players.filter(p => p.alive);
  if (alive.length <= 1) { await resolveHotPotato(guildId, client); return; }

  game.round++;
  const holderIndex = Math.floor(Math.random() * alive.length);
  game.holderId = alive[holderIndex].userId;

  const channel = await fetchChannel(guildId, client);
  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0xFF6B00)
      .setTitle(`💣 Round ${game.round} — ${alive.length} players left`)
      .setDescription(`<@${game.holderId}> **${alive[holderIndex].username}** has the bomb! Use \`!pass @user\` to pass it — quick!`)]
  });

  const ms = randomTimer();
  if (game.roundTimer) clearTimeout(game.roundTimer);
  game.roundTimer = setTimeout(() => explodeBomb(guildId, client), ms);
}

async function explodeBomb(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "active") return;

  const victim = game.players.find(p => p.userId === game.holderId);
  if (victim) victim.alive = false;

  const channel = await fetchChannel(guildId, client);
  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0xFF0000)
      .setTitle("💥 BOOM!")
      .setDescription(`<@${game.holderId}> **${victim?.username ?? "Someone"}** was holding the bomb and got eliminated!`)]
  });

  const alive = game.players.filter(p => p.alive);
  if (alive.length <= 1) {
    await resolveHotPotato(guildId, client);
  } else {
    setTimeout(() => startRound(guildId, client), 2000);
  }
}

export async function tryPass(guildId: string, actorId: string, targetId: string, channel: TextChannel, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "active") return;

  if (game.holderId !== actorId) {
    await channel.send(`<@${actorId}> You don't have the bomb!`);
    return;
  }

  const target = game.players.find(p => p.userId === targetId && p.alive);
  if (!target) {
    await channel.send(`<@${actorId}> That player isn't in the game or is already eliminated.`);
    return;
  }

  if (targetId === actorId) {
    await channel.send(`<@${actorId}> You can't pass it to yourself!`);
    return;
  }

  if (game.roundTimer) clearTimeout(game.roundTimer);

  game.holderId = targetId;

  await channel.send({
    embeds: [new EmbedBuilder().setColor(0xFF6B00)
      .setDescription(`🥔 <@${actorId}> passed the bomb to <@${targetId}> **${target.username}**! Tick tock...`)]
  });

  const ms = randomTimer();
  game.roundTimer = setTimeout(() => explodeBomb(guildId, client), ms);
}

async function resolveHotPotato(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase === "ended") return;
  game.phase = "ended";
  if (game.roundTimer) clearTimeout(game.roundTimer);

  const channel = await fetchChannel(guildId, client);
  const winner = game.players.find(p => p.alive);

  const playerList = game.players
    .map(p => `${p.alive ? "🏆" : "💥"} **${p.username}**`)
    .join("\n");

  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0xFFD700)
      .setTitle("🎮 Hot Potato — Game Over!")
      .setDescription(
        winner
          ? `🏆 **${winner.username}** wins! They survived the bomb!\n\n${playerList}`
          : `💥 Everyone exploded!\n\n${playerList}`
      )]
  });

  activeGames.delete(guildId);
}

export async function forceEndHotPotato(guildId: string, client: Client): Promise<boolean> {
  const game = getGame(guildId);
  if (!game) return false;
  await resolveHotPotato(guildId, client);
  return true;
}
