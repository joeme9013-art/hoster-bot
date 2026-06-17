import express from 'express';
const app = express();
const PORT = process.env.PORT || 10000;

// This stops the 404 error
app.get('/', (req, res) => res.send('✅ Bot is running'));

// Start the web server
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
import { Client, GatewayIntentBits, Partials, Message, GuildMember, SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from "discord.js";
import { logger } from "./logger.js";
import { helpCommand } from "./commands/help.js";
import { rosterCommand } from "./commands/roster.js";
import { profileCommand } from "./commands/profile.js";
import { leaderboardCommand } from "./commands/leaderboard.js";
import { rankHosterCommand } from "./commands/rankhoster.js";
import { promoteHosterCommand } from "./commands/promotehoster.js";
import { removeHosterCommand } from "./commands/removehoster.js";
import { breakCommand, unbreakCommand } from "./commands/break.js";
import { rpCommand, unrpCommand } from "./commands/rp.js";
import { warnCommand, unwarnCommand } from "./commands/warn.js";
import { reformCommand, reformsCommand } from "./commands/reform.js";
import { hosterOfTheWeekCommand } from "./commands/hosteroftheweek.js";
import { sayOnCommand, sayOffCommand, handleSaySlash, isSayOwner } from "./commands/say.js";
import { gameCommand, infectCommand, dodgeCommand, healCommand, passCommand } from "./commands/game.js";
import { loadData, initializeStorage } from "./storage.js";
import { pendingDMActions } from "./games/state.js";
import { processDayVote, processNightAction, joinMafiaGame } from "./games/mafia.js";
import { joinInfectionGame } from "./games/infection.js";
import { joinHotPotatoGame } from "./games/hotpotato.js";
import { joinRouletteGame } from "./games/roulette.js";
import { joinTriviaGame, handleTriviaAnswer } from "./games/trivia.js";
import { errorEmbed } from "./embed.js";

const PREFIX = "!";
const ALLOWED_ROLES = ["Hoster Manager", "Assistant Hoster Manager", "Head Host"];

function hasPermission(member: GuildMember): boolean {
  return member.roles.cache.some((role) => ALLOWED_ROLES.includes(role.name));
}

const token = process.env["DISCORD_BOT_TOKEN"];
if (!token) {
  logger.error("DISCORD_BOT_TOKEN is not set.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel],
});

const saySlashCommand = new SlashCommandBuilder()
  .setName("say")
  .setDescription("Send a message through the bot (owner only)")
  .addStringOption((opt) =>
    opt.setName("message").setDescription("The message to send").setRequired(true)
  )
  .addUserOption((opt) =>
    opt.setName("target").setDescription("User to impersonate (optional)").setRequired(false)
  );

client.once("clientReady", async (c) => {
  logger.info({ tag: c.user.tag }, "Discord bot is online");
  c.user.setActivity("!help | Hosting Bot", { type: 3 });

  for (const guild of c.guilds.cache.values()) {
    try {
      await guild.commands.set([saySlashCommand.toJSON()]);
    } catch (err) {
      logger.warn({ err, guild: guild.name }, "Failed to register slash commands");
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    const id = interaction.customId;
    const guildId = interaction.guildId;
    if (!guildId) return;

    const handleJoin = async (result: "joined" | "already_in" | "no_game" | "wrong_phase", label: string) => {
      if (result === "joined") {
        await interaction.reply({ content: `**${interaction.user.username}** joined ${label}!`, ephemeral: false });
      } else if (result === "already_in") {
        await interaction.reply({ content: "You're already in the game!", ephemeral: true });
      } else if (result === "wrong_phase") {
        await interaction.reply({ content: "The game has already started.", ephemeral: true });
      } else {
        await interaction.reply({ content: "No game found.", ephemeral: true });
      }
    };

    if (id.startsWith("mafia_join_")) {
      await handleJoin(await joinMafiaGame(guildId, interaction.user.id, interaction.user.username), "Mafia ✋");
    } else if (id.startsWith("infection_join_")) {
      await handleJoin(await joinInfectionGame(guildId, interaction.user.id, interaction.user.username), "Infection 🦠");
    } else if (id.startsWith("hotpotato_join_")) {
      await handleJoin(await joinHotPotatoGame(guildId, interaction.user.id, interaction.user.username), "Hot Potato 🥔");
    } else if (id.startsWith("roulette_join_")) {
      await handleJoin(await joinRouletteGame(guildId, interaction.user.id, interaction.user.username), "Russian Roulette 🔫");
    } else if (id.startsWith("trivia_join_")) {
      await handleJoin(await joinTriviaGame(guildId, interaction.user.id, interaction.user.username), "Trivia 🧠");
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "say") {
    try { await handleSaySlash(interaction as ChatInputCommandInteraction); } catch (err) { logger.error({ err }, "/say error"); }
  }
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) return;

  // DM messages — game voting
  if (message.channel.type === ChannelType.DM) {
    const action = pendingDMActions.get(message.author.id);
    if (!action) return;
    const choice = parseInt(message.content.trim(), 10);
    if (isNaN(choice) || choice < 1) {
      await message.reply("Please reply with a number from the list.").catch(() => {});
      return;
    }
    if (action.type === "day_vote") await processDayVote(message.author.id, choice, message.client);
    else await processNightAction(message.author.id, choice, message.client);
    return;
  }

  if (!message.member) return;

  const isOwner = isSayOwner(message.author.username);

  // Say owner toggle commands
  if (isOwner && message.content.startsWith(PREFIX)) {
    const cmd = message.content.slice(PREFIX.length).trim().split(/\s+/)[0].toLowerCase();
    if (cmd === "sayon") { try { await sayOnCommand(message); } catch (err) { logger.error({ err }, "sayon error"); } return; }
    if (cmd === "sayoff") { try { await sayOffCommand(message); } catch (err) { logger.error({ err }, "sayoff error"); } return; }
  }

  // Say owner auto-relay
  if (isOwner) {
    const data = loadData();
    if (data.sayEnabled) {
      const content = message.content;
      if (content.trim()) {
        await Promise.all([
          message.delete().catch(() => {}),
          message.channel.send(content).catch((err) => logger.error({ err }, "say relay error")),
        ]);
      } else {
        message.delete().catch(() => {});
      }
      return;
    }
  }

  // Trivia answer check — any non-bot guild message
  if (message.guildId) {
    await handleTriviaAnswer(
      message.guildId, message.author.id, message.author.username,
      message.content, message.channel as any, message.client
    ).catch(() => {});
  }

  if (!message.content.startsWith(PREFIX)) return;

  const raw = message.content.slice(PREFIX.length).trim();
  const args = raw.split(/\s+/);
  const command = args[0].toLowerCase();
  const restArgs = args.slice(1);

  // Game-participation commands — open to all
  const openCommands: Record<string, (m: Message) => Promise<void>> = {
    infect: infectCommand,
    dodge: dodgeCommand,
    heal: healCommand,
    pass: passCommand,
  };
  if (openCommands[command]) {
    try { await openCommands[command](message); } catch (err) { logger.error({ err, command }, "game command error"); }
    return;
  }

  // !game is owner-only
  if (command === "game") {
    if (!isSayOwner(message.author.username)) {
      await message.reply({ embeds: [errorEmbed("You don't have permission to use this command.")] });
      return;
    }
    try { await gameCommand(message, restArgs); } catch (err) { logger.error({ err }, "game error"); }
    return;
  }

  if (!hasPermission(message.member)) {
    await message.reply({
      embeds: [errorEmbed(`You need one of the following roles:\n${ALLOWED_ROLES.map((r) => `**${r}**`).join(", ")}`)],
    });
    return;
  }

  try {
    switch (command) {
      case "help": await helpCommand(message, restArgs); break;
      case "roster": await rosterCommand(message); break;
      case "profile": await profileCommand(message); break;
      case "leaderboard": await leaderboardCommand(message); break;
      case "rankhoster": await rankHosterCommand(message, restArgs); break;
      case "promotehoster": await promoteHosterCommand(message, restArgs); break;
      case "removehoster": await removeHosterCommand(message); break;
      case "break": await breakCommand(message, restArgs); break;
      case "unbreak": await unbreakCommand(message); break;
      case "rp": await rpCommand(message, restArgs); break;
      case "unrp": await unrpCommand(message); break;
      case "warn": await warnCommand(message, restArgs); break;
      case "unwarn": await unwarnCommand(message, restArgs); break;
      case "reform": await reformCommand(message, restArgs); break;
      case "reforms": await reformsCommand(message); break;
      case "hosteroftheweek": await hosterOfTheWeekCommand(message); break;
    }
  } catch (err) {
    logger.error({ err, command }, "Error handling command");
    try { await message.reply("An error occurred while running that command."); } catch { /* ignore */ }
  }
});

// Initialize storage from Replit DB then start bot
initializeStorage().then(() => {
  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to log in to Discord");
    process.exit(1);
  });
});
