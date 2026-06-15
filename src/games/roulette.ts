import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { activeGames, RouletteGame } from "./state.js";

const MIN_PLAYERS = 2;
const SUSPENSE_MS = 3000;
const BETWEEN_MS = 2500;

function getGame(guildId: string): RouletteGame | null {
  const g = activeGames.get(guildId);
  return g?.type === "roulette" ? (g as RouletteGame) : null;
}

async function fetchChannel(guildId: string, client: Client): Promise<TextChannel | null> {
  const game = getGame(guildId);
  if (!game) return null;
  try { return (await client.channels.fetch(game.channelId)) as TextChannel; } catch { return null; }
}

export async function startRouletteGame(channel: TextChannel, guildId: string): Promise<void> {
  if (activeGames.has(guildId)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ A game is already running. Use `!game end` first.")] });
    return;
  }

  const game: RouletteGame = {
    type: "roulette", guildId, channelId: channel.id,
    phase: "joining", players: [], roundTimer: null,
  };
  activeGames.set(guildId, game);

  const embed = new EmbedBuilder()
    .setColor(0x2C2F33)
    .setTitle("🔫 Russian Roulette")
    .setDescription(
      "A random player is chosen each round. There's a **1 in 6** chance the gun fires.\n\n" +
      "☠️ If it fires — you're **eliminated**.\n" +
      "😅 If it clicks — you survive to the next round.\n\n" +
      "Last player alive wins. Click to join!"
    )
    .setFooter({ text: "Start with !game start once enough players join." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`roulette_join_${guildId}`).setLabel("Join Game").setStyle(ButtonStyle.Danger).setEmoji("🔫")
  );

  await channel.send({ embeds: [embed], components: [row] });
}

export async function joinRouletteGame(guildId: string, userId: string, username: string): Promise<"joined" | "already_in" | "no_game" | "wrong_phase"> {
  const game = getGame(guildId);
  if (!game) return "no_game";
  if (game.phase !== "joining") return "wrong_phase";
  if (game.players.some(p => p.userId === userId)) return "already_in";
  game.players.push({ userId, username, alive: true });
  return "joined";
}

export async function beginRouletteGame(guildId: string, client: Client): Promise<string | null> {
  const game = getGame(guildId);
  if (!game) return "No active Russian Roulette game.";
  if (game.phase !== "joining") return "Game has already started.";
  if (game.players.length < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players (have ${game.players.length}).`;

  game.phase = "active";
  const channel = await fetchChannel(guildId, client);
  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0x2C2F33)
      .setTitle(`🔫 Russian Roulette begins! ${game.players.length} players.`)
      .setDescription("A random player will be chosen each round. Survive the chamber to win!\n\n*Good luck...*")]
  });

  setTimeout(() => runRound(guildId, client), 2000);
  return null;
}

async function runRound(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "active") return;

  const alive = game.players.filter(p => p.alive);
  if (alive.length <= 1) { await resolveRoulette(guildId, client); return; }

  const target = alive[Math.floor(Math.random() * alive.length)];
  const channel = await fetchChannel(guildId, client);

  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0xFFA500)
      .setDescription(`🔫 <@${target.userId}> **${target.username}** raises the gun to their head...\n\n*${alive.length} players remain*`)]
  });

  game.roundTimer = setTimeout(async () => {
    const g = getGame(guildId);
    if (!g || g.phase !== "active") return;

    const bang = Math.floor(Math.random() * 6) === 0;

    if (bang) {
      target.alive = false;
      const stillAlive = g.players.filter(p => p.alive);
      await channel?.send({
        embeds: [new EmbedBuilder().setColor(0xFF0000)
          .setTitle("💥 BANG!")
          .setDescription(`**${target.username}** has been eliminated! ${stillAlive.length} player(s) remain.`)]
      });
    } else {
      await channel?.send({
        embeds: [new EmbedBuilder().setColor(0x57f287)
          .setDescription(`🔒 *...click* — <@${target.userId}> **${target.username}** breathes a sigh of relief. 😮‍💨`)]
      });
    }

    const remaining = g.players.filter(p => p.alive);
    if (remaining.length <= 1) {
      g.roundTimer = setTimeout(() => resolveRoulette(guildId, client), BETWEEN_MS);
    } else {
      g.roundTimer = setTimeout(() => runRound(guildId, client), BETWEEN_MS);
    }
  }, SUSPENSE_MS);
}

async function resolveRoulette(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase === "ended") return;
  game.phase = "ended";
  if (game.roundTimer) clearTimeout(game.roundTimer);

  const channel = await fetchChannel(guildId, client);
  const winner = game.players.find(p => p.alive);

  const playerList = game.players
    .map(p => `${p.alive ? "🏆" : "💀"} **${p.username}**`)
    .join("\n");

  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0xFFD700)
      .setTitle("🔫 Russian Roulette — Game Over!")
      .setDescription(
        winner
          ? `🏆 **${winner.username}** wins! The last one standing.\n\n${playerList}`
          : `Everyone was eliminated!\n\n${playerList}`
      )]
  });

  activeGames.delete(guildId);
}

export async function forceEndRoulette(guildId: string, client: Client): Promise<boolean> {
  const game = getGame(guildId);
  if (!game) return false;
  await resolveRoulette(guildId, client);
  return true;
}
