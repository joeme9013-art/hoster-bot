import { Message, EmbedBuilder } from "discord.js";
import { getHoster, setHoster, createDefaultHoster, getAllHosters } from "../storage.js";
import { successEmbed, errorEmbed, infoEmbed, COLORS } from "../embed.js";

export async function reformCommand(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Please mention a user. Usage: `!reform @user <reason>`")] }); return; }
  const reason = args.slice(1).join(" ").trim();
  if (!reason) { await message.reply({ embeds: [errorEmbed("Please provide a reason. Usage: `!reform @user <reason>`")] }); return; }

  const hoster = getHoster(target.id);
  if (!hoster) { await message.reply({ embeds: [errorEmbed(`<@${target.id}> is not on the hosting roster. Add them first with \`!rankhoster\`.`)] }); return; }
  hoster.reforms.push({ reason, moderatorId: message.author.id, moderatorTag: message.author.tag, date: new Date().toISOString() });
  hoster.username = target.user.username;
  setHoster(hoster);

  await message.reply({ embeds: [successEmbed("Reform Added", `<@${target.id}> has been reformed.\n**Reason:** ${reason}\n**Total reforms:** ${hoster.reforms.length}`)] });
}

export async function reformsCommand(message: Message): Promise<void> {
  const target = message.mentions.members?.first();

  if (target) {
    const hoster = getHoster(target.id);
    if (!hoster) { await message.reply({ embeds: [errorEmbed(`<@${target.id}> is not on the hosting roster.`)] }); return; }
    if (hoster.reforms.length === 0) { await message.reply({ embeds: [infoEmbed("No Reforms", `<@${target.id}> has no reform records.`)] }); return; }

    const lines = hoster.reforms.map((r, i) => `**#${i + 1}** ${r.reason}\n*by <@${r.moderatorId}> on ${new Date(r.date).toLocaleDateString()}*`);
    await message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle(`📋 Reforms — ${hoster.username}`).setDescription(lines.join("\n\n")).setTimestamp()] });
    return;
  }

  const withReforms = getAllHosters().filter((h) => h.reforms.length > 0).sort((a, b) => b.reforms.length - a.reforms.length);
  if (withReforms.length === 0) { await message.reply({ embeds: [infoEmbed("No Reforms", "No hosters have any reform records.")] }); return; }

  const lines = withReforms.map((h) => `<@${h.userId}> — **${h.reforms.length}** reform(s) | Latest: *${h.reforms[h.reforms.length - 1].reason}*`);
  await message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle("📋 All Reform Records").setDescription(lines.join("\n")).setTimestamp()] });
}
