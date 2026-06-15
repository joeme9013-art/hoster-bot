import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { activeGames, pendingDMActions, MafiaGame, MafiaRole } from "./state.js";
import { logger } from "../logger.js";

const DAY_DURATION = 90_000;
const NIGHT_DURATION = 60_000;
const MIN_PLAYERS = 2;

function getGame(guildId: string): MafiaGame | null {
  const g = activeGames.get(guildId);
  return g?.type === "mafia" ? (g as MafiaGame) : null;
}

function assignRoles(count: number): MafiaRole[] {
  const roles: MafiaRole[] = [];
  const mafiaCount = Math.max(1, Math.floor(count / 4));
  for (let i = 0; i < mafiaCount; i++) roles.push("mafia");
  roles.push("doctor");
  roles.push("sheriff");
  while (roles.length < count) roles.push("town");
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

function roleEmoji(role: MafiaRole): string {
  return { mafia: "🔫", doctor: "💉", sheriff: "🔍", town: "🏠" }[role];
}

function checkWin(game: MafiaGame): "mafia" | "town" | null {
  const alive = game.players.filter(p => p.alive);
  const aliveMafia = alive.filter(p => p.role === "mafia").length;
  const aliveTown = alive.filter(p => p.role !== "mafia").length;
  if (aliveMafia === 0) return "town";
  if (aliveMafia >= aliveTown) return "mafia";
  return null;
}

async function fetchChannel(guildId: string, client: Client): Promise<TextChannel | null> {
  const game = getGame(guildId);
  if (!game) return null;
  try { return (await client.channels.fetch(game.channelId)) as TextChannel; } catch { return null; }
}

export async function startMafiaGame(channel: TextChannel, guildId: string): Promise<void> {
  if (activeGames.has(guildId)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription("❌ A game is already running. Use `!game end` first.")] });
    return;
  }

  const game: MafiaGame = {
    type: "mafia", guildId, channelId: channel.id, phase: "joining",
    players: [], votes: new Map(), nightKillTarget: null, nightSaveTarget: null,
    nightInvestigateTarget: null, mafiaActed: new Set(), doctorActed: false,
    sheriffActed: false, day: 0, phaseTimer: null,
  };
  activeGames.set(guildId, game);

  const embed = new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle("🕵️ Mafia — Social Deduction Game")
    .setDescription(
      "Roles are assigned by DM when the game starts.\n\n" +
      "**Roles:**\n🔫 Mafia (eliminate Town at night)\n💉 Doctor (protect one player)\n🔍 Sheriff (investigate one player)\n🏠 Town (vote out Mafia during the day)\n\n" +
      "**Needs at least 5 players.** Click the button to join."
    )
    .setFooter({ text: "Start the game with !game start once enough players join." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`mafia_join_${guildId}`).setLabel("Join Game").setStyle(ButtonStyle.Primary).setEmoji("✋")
  );

  await channel.send({ embeds: [embed], components: [row] });
}

export async function joinMafiaGame(guildId: string, userId: string, username: string): Promise<"joined" | "already_in" | "no_game" | "wrong_phase"> {
  const game = getGame(guildId);
  if (!game) return "no_game";
  if (game.phase !== "joining") return "wrong_phase";
  if (game.players.some(p => p.userId === userId)) return "already_in";
  game.players.push({ userId, username, role: "town", alive: true });
  return "joined";
}

export async function beginMafiaGame(guildId: string, client: Client): Promise<string | null> {
  const game = getGame(guildId);
  if (!game) return "No active Mafia game.";
  if (game.phase !== "joining") return "Game has already started.";
  if (game.players.length < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players (have ${game.players.length}).`;

  const roles = assignRoles(game.players.length);
  game.players.forEach((p, i) => { p.role = roles[i]; });

  const channel = await fetchChannel(guildId, client);
  const mafiaNames = game.players.filter(p => p.role === "mafia").map(p => p.username).join(", ");

  for (const player of game.players) {
    try {
      const user = await client.users.fetch(player.userId);
      const roleLines: Record<MafiaRole, string> = {
        mafia: `🔫 **You are MAFIA!**\nYour team: **${mafiaNames}**\nEliminate the Town at night — blend in during the day!`,
        doctor: `💉 **You are the DOCTOR!**\nEach night, protect one player from elimination.`,
        sheriff: `🔍 **You are the SHERIFF!**\nEach night, investigate one player to find out if they are Mafia.`,
        town: `🏠 **You are TOWN.**\nWork with others to find and vote out the Mafia!`,
      };
      await user.send({
        embeds: [new EmbedBuilder().setColor(0x8B0000)
          .setTitle(`🎮 Mafia is starting in #${channel?.name ?? "game"}!`)
          .setDescription(roleLines[player.role])]
      });
    } catch { /* DMs closed */ }
  }

  if (channel) {
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0x8B0000)
        .setTitle(`🕵️ MAFIA — ${game.players.length} players. Roles sent by DM.`)
        .setDescription("Discuss here — vote out suspects before night falls!")]
    });
  }

  await startDayPhase(guildId, client);
  return null;
}

export async function startDayPhase(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game) return;
  game.phase = "day";
  game.day++;
  game.votes = new Map();

  const channel = await fetchChannel(guildId, client);
  const alive = game.players.filter(p => p.alive);

  if (channel) {
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0xFFD700)
        .setTitle(`☀️ Day ${game.day} — ${alive.length} players alive`)
        .setDescription("Check your DMs to vote! Voting closes in **90 seconds**.\nThe town voted player with the most votes will be eliminated.")]
    });
  }

  for (const player of alive) {
    const options = alive.filter(p => p.userId !== player.userId).map((p, i) => ({ userId: p.userId, name: p.username, i: i + 1 }));
    try {
      const user = await client.users.fetch(player.userId);
      await user.send({
        embeds: [new EmbedBuilder().setColor(0xFFD700)
          .setTitle(`🗳️ Day ${game.day} — Vote to Eliminate`)
          .setDescription(
            `${alive.length} players alive. Who do you think is Mafia?\n\n` +
            options.map(o => `**${o.i}.** ${o.name}`).join("\n") +
            "\n\nReply with a number. You have **90 seconds**."
          )]
      });
      pendingDMActions.set(player.userId, {
        guildId, type: "day_vote",
        options: options.map(o => ({ userId: o.userId, name: o.name })),
      });
    } catch { /* DMs closed */ }
  }

  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  game.phaseTimer = setTimeout(() => tallyVotes(guildId, client), DAY_DURATION);
}

export async function processDayVote(userId: string, choice: number, client: Client): Promise<boolean> {
  const action = pendingDMActions.get(userId);
  if (!action || action.type !== "day_vote") return false;

  const game = getGame(action.guildId);
  if (!game || game.phase !== "day") return false;

  const target = action.options[choice - 1];
  if (!target) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(`❌ Invalid choice. Reply with a number between 1 and ${action.options.length}.`);
    } catch { /* ignore */ }
    return true;
  }

  game.votes.set(userId, target.userId);
  pendingDMActions.delete(userId);

  try {
    const user = await client.users.fetch(userId);
    await user.send(`✅ You voted to eliminate **${target.name}**.`);
  } catch { /* ignore */ }

  const alive = game.players.filter(p => p.alive);
  const voted = alive.filter(p => game.votes.has(p.userId)).length;
  if (voted >= alive.length) {
    if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }
    await tallyVotes(action.guildId, client);
  }
  return true;
}

async function tallyVotes(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "day") return;

  const channel = await fetchChannel(guildId, client);

  for (const player of game.players) {
    if (pendingDMActions.get(player.userId)?.type === "day_vote") pendingDMActions.delete(player.userId);
  }

  const tally = new Map<string, number>();
  for (const [, targetId] of game.votes) tally.set(targetId, (tally.get(targetId) ?? 0) + 1);

  if (tally.size === 0) {
    await channel?.send({ embeds: [new EmbedBuilder().setColor(0x808080).setTitle("⏭️ The town voted to skip!").setDescription("Nobody is eliminated today.")] });
  } else {
    let maxVotes = 0, eliminatedId = "";
    for (const [id, count] of tally) { if (count > maxVotes) { maxVotes = count; eliminatedId = id; } }
    const victim = game.players.find(p => p.userId === eliminatedId);
    if (victim) {
      victim.alive = false;
      await channel?.send({
        embeds: [new EmbedBuilder().setColor(0xFF4444)
          .setTitle("☠️ The town has spoken!")
          .setDescription(`<@${eliminatedId}> **${victim.username}** was eliminated with **${maxVotes}** vote(s).\n*(Their role will be revealed when the game ends.)*`)]
      });
    }
  }

  const winner = checkWin(game);
  if (winner) { await endMafia(guildId, client, winner); return; }
  await startNightPhase(guildId, client);
}

async function startNightPhase(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game) return;
  game.phase = "night";
  game.nightKillTarget = null;
  game.nightSaveTarget = null;
  game.nightInvestigateTarget = null;
  game.mafiaActed = new Set();
  game.doctorActed = false;
  game.sheriffActed = false;

  const channel = await fetchChannel(guildId, client);
  await channel?.send({
    embeds: [new EmbedBuilder().setColor(0x1a1a2e)
      .setTitle(`🌙 Night ${game.day} falls. The town sleeps...`)
      .setDescription("*(Special roles: check your DMs — you have 60 seconds to act!)*")]
  });

  const alive = game.players.filter(p => p.alive);
  const aliveTown = alive.filter(p => p.role !== "mafia");

  for (const mafiaPlayer of alive.filter(p => p.role === "mafia")) {
    const options = aliveTown.map((p, i) => ({ userId: p.userId, name: p.username, i: i + 1 }));
    try {
      const user = await client.users.fetch(mafiaPlayer.userId);
      await user.send({
        embeds: [new EmbedBuilder().setColor(0x8B0000)
          .setTitle("🔫 Night — Choose a target to eliminate")
          .setDescription(options.map(o => `**${o.i}.** ${o.name}`).join("\n") + "\n\nReply with a number. You have **60 seconds**.")]
      });
      pendingDMActions.set(mafiaPlayer.userId, { guildId, type: "night_kill", options: options.map(o => ({ userId: o.userId, name: o.name })) });
    } catch { game.mafiaActed.add(mafiaPlayer.userId); }
  }

  const doctor = alive.find(p => p.role === "doctor");
  if (doctor) {
    const options = alive.map((p, i) => ({ userId: p.userId, name: p.username, i: i + 1 }));
    try {
      const user = await client.users.fetch(doctor.userId);
      await user.send({
        embeds: [new EmbedBuilder().setColor(0x00FF7F)
          .setTitle("💉 Night — Choose someone to protect")
          .setDescription(options.map(o => `**${o.i}.** ${o.name}`).join("\n") + "\n\nReply with a number. You have **60 seconds**.")]
      });
      pendingDMActions.set(doctor.userId, { guildId, type: "night_save", options: options.map(o => ({ userId: o.userId, name: o.name })) });
    } catch { game.doctorActed = true; }
  } else {
    game.doctorActed = true;
  }

  const sheriff = alive.find(p => p.role === "sheriff");
  if (sheriff) {
    const options = alive.filter(p => p.userId !== sheriff.userId).map((p, i) => ({ userId: p.userId, name: p.username, i: i + 1 }));
    try {
      const user = await client.users.fetch(sheriff.userId);
      await user.send({
        embeds: [new EmbedBuilder().setColor(0x4169E1)
          .setTitle("🔍 Night — Choose someone to investigate")
          .setDescription(options.map(o => `**${o.i}.** ${o.name}`).join("\n") + "\n\nReply with a number. You have **60 seconds**.")]
      });
      pendingDMActions.set(sheriff.userId, { guildId, type: "night_investigate", options: options.map(o => ({ userId: o.userId, name: o.name })) });
    } catch { game.sheriffActed = true; }
  } else {
    game.sheriffActed = true;
  }

  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  game.phaseTimer = setTimeout(() => resolveNight(guildId, client), NIGHT_DURATION);
}

export async function processNightAction(userId: string, choice: number, client: Client): Promise<boolean> {
  const action = pendingDMActions.get(userId);
  if (!action || !["night_kill", "night_save", "night_investigate"].includes(action.type)) return false;

  const game = getGame(action.guildId);
  if (!game || game.phase !== "night") return false;

  const target = action.options[choice - 1];
  if (!target) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(`❌ Invalid choice. Reply with a number between 1 and ${action.options.length}.`);
    } catch { /* ignore */ }
    return true;
  }

  pendingDMActions.delete(userId);

  if (action.type === "night_kill") {
    if (!game.nightKillTarget) game.nightKillTarget = target.userId;
    game.mafiaActed.add(userId);
    try { const u = await client.users.fetch(userId); await u.send(`✅ You chose to eliminate **${target.name}** tonight.`); } catch { /* ignore */ }
  } else if (action.type === "night_save") {
    game.nightSaveTarget = target.userId;
    game.doctorActed = true;
    try { const u = await client.users.fetch(userId); await u.send(`✅ You chose to protect **${target.name}** tonight.`); } catch { /* ignore */ }
  } else if (action.type === "night_investigate") {
    game.sheriffActed = true;
    game.nightInvestigateTarget = target.userId;
    const targetPlayer = game.players.find(p => p.userId === target.userId);
    const result = targetPlayer?.role === "mafia" ? "🔴 **MAFIA**" : "🟢 **Innocent**";
    try { const u = await client.users.fetch(userId); await u.send(`🔍 Investigation result for **${target.name}**: ${result}`); } catch { /* ignore */ }
  }

  await checkNightComplete(action.guildId, client);
  return true;
}

async function checkNightComplete(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "night") return;

  const aliveMafia = game.players.filter(p => p.alive && p.role === "mafia");
  const allMafiaActed = aliveMafia.length === 0 || aliveMafia.every(p => game.mafiaActed.has(p.userId));

  if (allMafiaActed && game.doctorActed && game.sheriffActed) {
    if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }
    await resolveNight(guildId, client);
  }
}

async function resolveNight(guildId: string, client: Client): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase !== "night") return;

  for (const p of game.players) {
    const a = pendingDMActions.get(p.userId);
    if (a && ["night_kill", "night_save", "night_investigate"].includes(a.type)) pendingDMActions.delete(p.userId);
  }

  const channel = await fetchChannel(guildId, client);
  await channel?.send({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle("🌅 Morning comes...")] });

  if (game.nightKillTarget) {
    if (game.nightKillTarget === game.nightSaveTarget) {
      await channel?.send({ embeds: [new EmbedBuilder().setColor(0x00FF7F).setDescription("🛡️ The Doctor saved someone last night! No one was eliminated.")] });
    } else {
      const victim = game.players.find(p => p.userId === game.nightKillTarget);
      if (victim) {
        victim.alive = false;
        await channel?.send({
          embeds: [new EmbedBuilder().setColor(0xFF0000)
            .setTitle("💀 Someone was found dead!")
            .setDescription(`<@${victim.userId}> **${victim.username}** was found dead. The Mafia struck in the night.\n*(Their role is not revealed until the game ends.)*`)]
        });
      }
    }
  } else {
    await channel?.send({ embeds: [new EmbedBuilder().setColor(0x808080).setDescription("😴 The night was quiet. No one was eliminated.")] });
  }

  const winner = checkWin(game);
  if (winner) { await endMafia(guildId, client, winner); return; }
  await startDayPhase(guildId, client);
}

async function endMafia(guildId: string, client: Client, winner: "mafia" | "town"): Promise<void> {
  const game = getGame(guildId);
  if (!game || game.phase === "ended") return;
  game.phase = "ended";
  if (game.phaseTimer) clearTimeout(game.phaseTimer);

  const channel = await fetchChannel(guildId, client);

  const roleReveal = game.players
    .map(p => `${p.alive ? "✅" : "☠️"} **${p.username}** — ${roleEmoji(p.role)} ${p.role.toUpperCase()}`)
    .join("\n");

  const winMsg = winner === "town"
    ? "🏆 **The Town wins!** All Mafia members eliminated!"
    : "🔫 **The Mafia wins!** They've taken over the town!";

  await channel?.send({
    embeds: [new EmbedBuilder()
      .setColor(winner === "town" ? 0x00FF7F : 0x8B0000)
      .setTitle("🎮 Game Over!")
      .setDescription(`${winMsg}\n\n**Final Roles:**\n${roleReveal}`)]
  });

  for (const p of game.players) pendingDMActions.delete(p.userId);
  activeGames.delete(guildId);
}

export async function forceEndMafia(guildId: string, client: Client): Promise<boolean> {
  const game = getGame(guildId);
  if (!game) return false;
  await endMafia(guildId, client, "town");
  return true;
}
