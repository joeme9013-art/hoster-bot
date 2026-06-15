import { Message } from "discord.js";
import { getHoster, setHoster, createDefaultHoster } from "../storage.js";
import { successEmbed, errorEmbed, infoEmbed } from "../embed.js";

export async function warnCommand(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Please mention a user. Usage: `!warn @user <reason>`")] }); return; }
  const reason = args.slice(1).join(" ").trim();
  if (!reason) { await message.reply({ embeds: [errorEmbed("Please provide a reason. Usage: `!warn @user <reason>`")] }); return; }

  const hoster = getHoster(target.id);
  if (!hoster) { await message.reply({ embeds: [errorEmbed(`<@${target.id}> is not on the hosting roster. Add them first with \`!rankhoster\`.`)] }); return; }
  hoster.warnings.push({ reason, moderatorId: message.author.id, moderatorTag: message.author.tag, date: new Date().toISOString() });
  hoster.username = target.user.username;
  setHoster(hoster);

  await message.reply({ embeds: [successEmbed("Warning Issued", `<@${target.id}> has been warned.\n**Reason:** ${reason}\n**Total warnings:** ${hoster.warnings.length}`)] });
}

export async function unwarnCommand(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Please mention a user. Usage: `!unwarn @user [warning #]`")] }); return; }

  const hoster = getHoster(target.id);
  if (!hoster) { await message.reply({ embeds: [errorEmbed(`<@${target.id}> is not on the hosting roster.`)] }); return; }
  if (hoster.warnings.length === 0) { await message.reply({ embeds: [infoEmbed("No Warnings", `<@${target.id}> has no warnings to remove.`)] }); return; }

  const indexArg = args[1] ? parseInt(args[1], 10) : null;
  if (indexArg !== null) {
    if (isNaN(indexArg) || indexArg < 1 || indexArg > hoster.warnings.length) {
      await message.reply({ embeds: [errorEmbed(`Invalid warning number. ${target.displayName} has ${hoster.warnings.length} warning(s).`)] }); return;
    }
    const removed = hoster.warnings.splice(indexArg - 1, 1)[0];
    setHoster(hoster);
    await message.reply({ embeds: [successEmbed("Warning Removed", `Warning #${indexArg} removed from <@${target.id}>.\n**Was:** ${removed.reason}\n**Remaining:** ${hoster.warnings.length}`)] });
  } else {
    const removed = hoster.warnings.pop()!;
    setHoster(hoster);
    await message.reply({ embeds: [successEmbed("Warning Removed", `Most recent warning removed from <@${target.id}>.\n**Was:** ${removed.reason}\n**Remaining:** ${hoster.warnings.length}`)] });
  }
}
