import { Message, EmbedBuilder, GuildMember } from "discord.js";
import { getHoster } from "../storage.js";
import { COLORS } from "../embed.js";

export async function profileCommand(message: Message): Promise<void> {
  const target = message.mentions.members?.first() ?? (message.member as GuildMember | null);
  if (!target) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle("❌ Error").setDescription("Could not find that user.").setTimestamp()] });
    return;
  }

  const hoster = getHoster(target.id);
  if (!hoster) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle("❌ Not a Hoster").setDescription(`<@${target.id}> is not on the hosting roster. Add them with \`!rankhoster @user <rank>\`.`).setTimestamp()] });
    return;
  }

  const statusParts: string[] = [];
  if (hoster.onBreak) statusParts.push(`⏸️ On Break${hoster.breakReason ? `: *${hoster.breakReason}*` : ""}`);
  if (hoster.onRP) statusParts.push(`🚫 RP Penalty${hoster.rpReason ? `: *${hoster.rpReason}*` : ""}`);
  if (statusParts.length === 0) statusParts.push("✅ Active");

  const embed = new EmbedBuilder()
    .setColor(hoster.onBreak || hoster.onRP ? COLORS.warning : COLORS.primary)
    .setTitle(`👤 ${hoster.username}'s Profile`)
    .setThumbnail(target.user.displayAvatarURL())
    .addFields(
      { name: "Rank", value: hoster.rank, inline: true },
      { name: "Total Sessions", value: String(hoster.totalHosted), inline: true },
      { name: "Status", value: statusParts.join("\n"), inline: false },
      {
        name: `Warnings (${hoster.warnings.length})`,
        value: hoster.warnings.length === 0 ? "None" : hoster.warnings.map((w, i) => `**#${i + 1}** ${w.reason} — *by <@${w.moderatorId}>*`).join("\n"),
      },
      {
        name: `Reforms (${hoster.reforms.length})`,
        value: hoster.reforms.length === 0 ? "None" : hoster.reforms.map((r, i) => `**#${i + 1}** ${r.reason} — *by <@${r.moderatorId}>*`).join("\n"),
      }
    )
    .setFooter({ text: `Joined roster: ${new Date(hoster.joinedAt).toLocaleDateString()}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}
