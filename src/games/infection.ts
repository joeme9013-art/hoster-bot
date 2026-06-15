import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { activeGames, InfectionGame } from "./state.js";

const GAME_DURATION = 3 * 60_000;
const INFECT_COOLDOWN = 20_000;
const DODGE_DURATION = 15_000;
const DODGE_COOLDOWN = 60_000;
const MIN_PLAYERS = 2;

function getGame(guildId: string): InfectionGame | null {
  const g = activeGames.get(guildId);
  return g?.type === "infection" ? (g as InfectionGame) : null;
}

async function fetchChannel(guildId: string, client: Client): Promise<TextChannel | null> {
  const game = getGame(guildId);
  if (!game) return null;
  try { return (await client.channels.fetch(game.channelId)) as TextChannel; } catch { return null; }
}

export async function startInfectionGame(channel: TextChannel, guildId: string): Promise<void> {
  if (activeGames.has(guildId)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ A game is already running. Use `!game end` first.")] });
    return;
  }

  const game: InfectionGame = {
    type: "infection", guildId, channelId: channel.id,
    phase: "joining", players: [], gameTimer: null,
  };
  activeGames.set(guildId, game);

  const embed = new EmbedBuilder()
    .setColor(0x00C800)
    .setTitle("🦠 Infection — Survival Game")
    .setDescription(
      "One random player starts **infected** and must spread the infection.\n\n" +
      "🦠 **Infected** — use `!infect @user` to spread (20s cooldown)\n" +
      "🛡️ **Survivors** — use `!dodge` for 15s immunity (60s cooldown)\n" +
      "💊 **Survivors** — use `!heal @user` to cure one infected player (once per game)\n\n" +
      "**Infected win** when everyone is infected.\n**Survivors win** if anyone lasts **3 minutes**!\n\n" +
      "Needs at least 3 players — click to join!"
    )
    .setFooter({ text: "Start with !game start once enough players join." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`infection_join_${guildId}`).setLabel("Join Game").setStyle(ButtonStyle.Success).setEmoji("🦠")
  );

  await channel.send({ embeds: [embed], components: [row] });
}

export async function joinInfectionGame(guildId: string, userId: string, username: string): Promise<"joined" | "already_in" | "no_game" | "wrong_phase"> {
  const game = getGame(guildId);
  if (!game) return "no_game";
  if (game.phase !== "joining") return "wrong_phase";
  if (game.players.some(p => p.userId === userId)) return "already_in";
  game.players.push({ userId, username, infected: false, lastInfectTime: 0, dodgeUntil: 0, lastDodgeTime: 0, hasHealed: false });
  return "joined";
}

export async function beginInfectionGame(guildId: string, client: Client): Promise<string | null> {
  const game = getGame(guildId);
  if (!game) return "No active Infection game.";
  if (game.phase !== "joining") return "Game has already started.";
  if (game.players.length < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players (have ${game.players.length}).`;

  const zeroIndex = Math.floor(Math.random() * game.players.length);
  game.players[zeroIndex].infected = true;
  game.phase = "active";

  const channel = await fetchChannel(guildId, client);
  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0x00C800)
      .setTitle(`🦠 Infection has begun! ${game.players.length} players.`)
      .setDescription("The infection has started spreading...\nGame ends in **3 minutes**.\n\n🦠 `!infect @user` — spread infection\n🛡️ `!dodge` — 15s immunity\n💊 `!heal @user` — cure someone (once)")]
  });

  try {
    const pz = game.players[zeroIndex];
    const user = await client.users.fetch(pz.userId);
    await user.send({
      embeds: [new EmbedBuilder().setColor(0x00C800)
        .setTitle("🦠 You are Patient Zero!")
        .setDescription("You are infected! Use `!infect @user` in the game channel to spread it and win!")]
    });
  } catch { /* DMs closed */ }

  game.gameTimer = setTimeout(() => resolveInfection(guildId, client), GAME_DURATION);
  return null;
}

export async function tryInfect(guildId: string, actorId: string, targetId: string, channel: TextChannel, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "active") return;

  const actor = game.players.find(p => p.userId === actorId);
  const target = game.players.find(p => p.userId === targetId);

  if (!actor) { await channel.send(`<@${actorId}> You're not in this game.`); return; }
  if (!actor.infected) { await channel.send(`<@${actorId}> 🛡️ You're not infected — you can't spread it!`); return; }
  if (!target) { await channel.send(`<@${actorId}> That player isn't in this game.`); return; }
  if (target.infected) { await channel.send(`<@${actorId}> **${target.username}** is already infected!`); return; }

  const now = Date.now();
  if (now - actor.lastInfectTime < INFECT_COOLDOWN) {
    const secs = Math.ceil((INFECT_COOLDOWN - (now - actor.lastInfectTime)) / 1000);
    await channel.send(`<@${actorId}> ⏳ Wait **${secs}s** before infecting again.`);
    return;
  }

  if (now < target.dodgeUntil) {
    actor.lastInfectTime = now;
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0x00BFFF)
        .setDescription(`🛡️ **${target.username}** dodged the infection from **${actor.username}**!`)]
    });
    return;
  }

  target.infected = true;
  actor.lastInfectTime = now;

  const survivors = game.players.filter(p => !p.infected).length;
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0x00C800)
      .setDescription(`🦠 **${target.username}** has been infected by **${actor.username}**! **${survivors}** survivor(s) remain.`)]
  });

  try {
    const user = await client.users.fetch(target.userId);
    await user.send({
      embeds: [new EmbedBuilder().setColor(0x00C800)
        .setTitle("🦠 You've been infected!")
        .setDescription("Use `!infect @user` to spread it and help your team win!\nYou can still `!dodge` to block others' infect attempts before you got infected — wait, you're already infected. Go infect others!")]
    });
  } catch { /* DMs closed */ }

  if (game.players.every(p => p.infected)) {
    if (game.gameTimer) clearTimeout(game.gameTimer);
    await resolveInfection(guildId, client);
  }
}

export async function tryDodge(guildId: string, actorId: string, channel: TextChannel): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "active") return;

  const actor = game.players.find(p => p.userId === actorId);
  if (!actor) { await channel.send(`<@${actorId}> You're not in this game.`); return; }
  if (actor.infected) { await channel.send(`<@${actorId}> You're already infected — dodge won't help!`); return; }

  const now = Date.now();
  if (now - actor.lastDodgeTime < DODGE_COOLDOWN) {
    const secs = Math.ceil((DODGE_COOLDOWN - (now - actor.lastDodgeTime)) / 1000);
    await channel.send(`<@${actorId}> ⏳ Dodge is on cooldown for **${secs}s**.`);
    return;
  }

  actor.dodgeUntil = now + DODGE_DURATION;
  actor.lastDodgeTime = now;

  await channel.send({
    embeds: [new EmbedBuilder().setColor(0x00BFFF)
      .setDescription(`🛡️ **${actor.username}** activated dodge! Immune for **15 seconds**.`)]
  });
}

export async function tryHeal(guildId: string, actorId: string, targetId: string, channel: TextChannel, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "active") return;

  const actor = game.players.find(p => p.userId === actorId);
  const target = game.players.find(p => p.userId === targetId);

  if (!actor) { await channel.send(`<@${actorId}> You're not in this game.`); return; }
  if (actor.infected) { await channel.send(`<@${actorId}> 🦠 You're infected — you can't heal others!`); return; }
  if (actor.hasHealed) { await channel.send(`<@${actorId}> You've already used your heal this game.`); return; }
  if (!target) { await channel.send(`<@${actorId}> That player isn't in this game.`); return; }
  if (!target.infected) { await channel.send(`<@${actorId}> **${target.username}** isn't infected!`); return; }

  target.infected = false;
  target.lastInfectTime = 0;
  actor.hasHealed = true;

  await channel.send({
    embeds: [new EmbedBuilder().setColor(0x57f287)
      .setDescription(`💊 **${actor.username}** healed **${target.username}**! They're no longer infected. (${game.players.filter(p => !p.infected).length} survivors now)`)]
  });

  try {
    const user = await client.users.fetch(target.userId);
    await user.send({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("💊 You've been healed!").setDescription(`**${actor.username}** cured you! You're a survivor again.`)] });
  } catch { /* DMs closed */ }
}

async function resolveInfection(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase === "ended") return;
  game.phase = "ended";
  if (game.gameTimer) clearTimeout(game.gameTimer);

  const channel = await fetchChannel(guildId, client);
  const survivors = game.players.filter(p => !p.infected);
  const allInfected = survivors.length === 0;

  const playerList = game.players
    .map(p => `${p.infected ? "🦠" : "🛡️"} **${p.username}**`)
    .join("\n");

  await channel?.send({
    embeds: [new EmbedBuilder()
      .setColor(allInfected ? 0x00C800 : 0x00BFFF)
      .setTitle("🎮 Infection — Game Over!")
      .setDescription(
        allInfected
          ? `🦠 **Infected team wins!** Everyone has been infected!\n\n${playerList}`
          : `🛡️ **Survivors win!** ${survivors.length} player(s) remained uninfected!\n\n${playerList}`
      )]
  });

  activeGames.delete(guildId);
}

export async function forceEndInfection(guildId: string, client: Client): Promise<boolean> {
  const game = getGame(guildId);
  if (!game) return false;
  await resolveInfection(guildId, client);
  return true;
}
