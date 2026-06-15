import { Message, TextChannel } from "discord.js";
import { activeGames } from "../games/state.js";
import { startMafiaGame, beginMafiaGame, forceEndMafia } from "../games/mafia.js";
import { startInfectionGame, beginInfectionGame, forceEndInfection, tryInfect, tryDodge, tryHeal } from "../games/infection.js";
import { startHotPotatoGame, beginHotPotatoGame, forceEndHotPotato, tryPass } from "../games/hotpotato.js";
import { startRouletteGame, beginRouletteGame, forceEndRoulette } from "../games/roulette.js";
import { startTriviaGame, beginTriviaGame, forceEndTrivia } from "../games/trivia.js";
import { errorEmbed, infoEmbed } from "../embed.js";

export async function gameCommand(message: Message, args: string[]): Promise<void> {
  const sub = args[0]?.toLowerCase();
  const guildId = message.guildId!;
  const channel = message.channel as TextChannel;

  if (!sub || sub === "help") {
    await message.reply({
      embeds: [infoEmbed("🎮 Games", [
        "`!game mafia` — Social deduction (2+ players)",
        "`!game infection` — Spread the virus (2+ players)",
        "`!game hotpotato` — Don't hold the bomb! (2+ players)",
        "`!game roulette` — Russian Roulette (2+ players)",
        "`!game trivia` — General knowledge quiz (2+ players)",
        "",
        "`!game start` — Begin after players join",
        "`!game end` — Force-end current game",
      ].join("\n"))]
    });
    return;
  }

  if (sub === "mafia") { await startMafiaGame(channel, guildId); return; }
  if (sub === "infection") { await startInfectionGame(channel, guildId); return; }
  if (sub === "hotpotato") { await startHotPotatoGame(channel, guildId); return; }
  if (sub === "roulette") { await startRouletteGame(channel, guildId); return; }
  if (sub === "trivia") { await startTriviaGame(channel, guildId); return; }

  if (sub === "start") {
    const game = activeGames.get(guildId);
    if (!game) { await message.reply({ embeds: [errorEmbed("No game running. Start one with `!game help`.")] }); return; }
    let err: string | null = null;
    if (game.type === "mafia") err = await beginMafiaGame(guildId, message.client);
    else if (game.type === "infection") err = await beginInfectionGame(guildId, message.client);
    else if (game.type === "hotpotato") err = await beginHotPotatoGame(guildId, message.client);
    else if (game.type === "roulette") err = await beginRouletteGame(guildId, message.client);
    else if (game.type === "trivia") err = await beginTriviaGame(guildId, message.client);
    if (err) await message.reply({ embeds: [errorEmbed(err)] });
    return;
  }

  if (sub === "end") {
    const game = activeGames.get(guildId);
    if (!game) { await message.reply({ embeds: [errorEmbed("No game is currently running.")] }); return; }
    let ended = false;
    if (game.type === "mafia") ended = await forceEndMafia(guildId, message.client);
    else if (game.type === "infection") ended = await forceEndInfection(guildId, message.client);
    else if (game.type === "hotpotato") ended = await forceEndHotPotato(guildId, message.client);
    else if (game.type === "roulette") ended = await forceEndRoulette(guildId, message.client);
    else if (game.type === "trivia") ended = await forceEndTrivia(guildId, message.client);
    if (!ended) await message.reply({ embeds: [errorEmbed("Could not end the game.")] });
    return;
  }

  await message.reply({ embeds: [errorEmbed("Unknown subcommand. Use `!game help` for options.")] });
}

export async function infectCommand(message: Message): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) return;
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Usage: `!infect @user`")] }); return; }
  await tryInfect(guildId, message.author.id, target.id, message.channel as TextChannel, message.client);
}

export async function dodgeCommand(message: Message): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) return;
  await tryDodge(guildId, message.author.id, message.channel as TextChannel);
}

export async function healCommand(message: Message): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) return;
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Usage: `!heal @user`")] }); return; }
  await tryHeal(guildId, message.author.id, target.id, message.channel as TextChannel, message.client);
}

export async function passCommand(message: Message): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) return;
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Usage: `!pass @user`")] }); return; }
  await tryPass(guildId, message.author.id, target.id, message.channel as TextChannel, message.client);
}
