import { Message, EmbedBuilder } from "discord.js";
import { getAllHosters } from "../storage.js";
import { COLORS } from "../embed.js";

export async function rosterCommand(message: Message): Promise<void> {
  const hosters = getAllHosters();

  if (hosters.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle("📋 Hosting Roster")
      .setDescription("No hosters have been added yet. Use `!rankhoster @user <rank>` to add one.")
      .setTimestamp();
    await message.reply({ embeds: [embed] });
    return;
  }

  const active = hosters.filter((h) => !h.onBreak && !h.onRP);
  const onBreak = hosters.filter((h) => h.onBreak);
  const onRP = hosters.filter((h) => h.onRP && !h.onBreak);

  const fmt = (h: ReturnType<typeof getAllHosters>[0]) =>
    `<@${h.userId}> — **${h.rank}** • ${h.totalHosted} sessions`;

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle("📋 Hosting Roster")
    .setDescription(`**${hosters.length}** total hoster(s) registered`)
    .setTimestamp();

  if (active.length > 0) {
    embed.addFields({ name: `✅ Active (${active.length})`, value: active.map(fmt).join("\n") });
  }
  if (onBreak.length > 0) {
    embed.addFields({
      name: `⏸️ On Break (${onBreak.length})`,
      value: onBreak.map((h) => `<@${h.userId}> — ${h.rank}${h.breakReason ? ` *(${h.breakReason})*` : ""}`).join("\n"),
    });
  }
  if (onRP.length > 0) {
    embed.addFields({
      name: `🚫 RP Penalty (${onRP.length})`,
      value: onRP.map((h) => `<@${h.userId}> — ${h.rank}${h.rpReason ? ` *(${h.rpReason})*` : ""}`).join("\n"),
    });
  }

  await message.reply({ embeds: [embed] });
}
