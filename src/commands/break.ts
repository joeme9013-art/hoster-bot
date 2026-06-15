import { Message } from "discord.js";
import { getHoster, setHoster, createDefaultHoster } from "../storage.js";
import { successEmbed, errorEmbed, warningEmbed } from "../embed.js";

export async function breakCommand(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Please mention a user. Usage: `!break @user [reason]`")] }); return; }

  const hoster = getHoster(target.id);
  if (!hoster) { await message.reply({ embeds: [errorEmbed(`<@${target.id}> is not on the hosting roster. Add them first with \`!rankhoster\`.`)] }); return; }
  if (hoster.onBreak) { await message.reply({ embeds: [warningEmbed("Already on Break", `<@${target.id}> is already on break.`)] }); return; }

  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  hoster.onBreak = true;
  hoster.breakReason = reason;
  hoster.username = target.user.username;
  setHoster(hoster);

  await message.reply({ embeds: [successEmbed("Break Applied", `<@${target.id}> has been put on break.\n**Reason:** ${reason}`)] });
}

export async function unbreakCommand(message: Message): Promise<void> {
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Please mention a user. Usage: `!unbreak @user`")] }); return; }

  const hoster = getHoster(target.id);
  if (!hoster) { await message.reply({ embeds: [errorEmbed(`<@${target.id}> is not on the hosting roster.`)] }); return; }
  if (!hoster.onBreak) { await message.reply({ embeds: [warningEmbed("Not on Break", `<@${target.id}> is not currently on break.`)] }); return; }

  hoster.onBreak = false;
  hoster.breakReason = "";
  setHoster(hoster);

  await message.reply({ embeds: [successEmbed("Break Removed", `<@${target.id}> has been returned from break and is now active.`)] });
}
