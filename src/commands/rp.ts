import { Message } from "discord.js";
import { getHoster, setHoster } from "../storage.js";
import { successEmbed, errorEmbed, warningEmbed } from "../embed.js";

export async function rpCommand(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Please mention a user. Usage: `!rp @user`")] }); return; }

  const hoster = getHoster(target.id);
  if (!hoster) { await message.reply({ embeds: [errorEmbed(`<@${target.id}> is not on the hosting roster. Add them first with \`!rankhoster\`.`)] }); return; }

  hoster.totalHosted = (hoster.totalHosted || 0) + 1;
  hoster.username = target.user.username;
  setHoster(hoster);

  await message.reply({ embeds: [successEmbed("Session Logged", `<@${target.id}>'s session has been recorded. Total sessions: **${hoster.totalHosted}**`)] });
}

export async function unrpCommand(message: Message): Promise<void> {
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Please mention a user. Usage: `!unrp @user`")] }); return; }

  const hoster = getHoster(target.id);
  if (!hoster) { await message.reply({ embeds: [errorEmbed(`<@${target.id}> is not on the hosting roster.`)] }); return; }
  if ((hoster.totalHosted || 0) <= 0) { await message.reply({ embeds: [warningEmbed("No Sessions", `<@${target.id}> has no sessions to remove.`)] }); return; }

  hoster.totalHosted = hoster.totalHosted - 1;
  setHoster(hoster);

  await message.reply({ embeds: [successEmbed("Session Removed", `One session removed from <@${target.id}>. Total sessions: **${hoster.totalHosted}**`)] });
}
