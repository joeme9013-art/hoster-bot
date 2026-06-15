import { Message, EmbedBuilder } from "discord.js";
import { getAllHosters } from "../storage.js";
import { COLORS } from "../embed.js";

export async function leaderboardCommand(message: Message): Promise<void> {
  const hosters = getAllHosters().sort((a, b) => b.totalHosted - a.totalHosted).slice(0, 10);

  if (hosters.length === 0) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle("🏆 Hosting Leaderboard").setDescription("No hosters yet. Add some with `!rankhoster @user <rank>`.").setTimestamp()] });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = hosters.map((h, i) => `${medals[i] ?? `**#${i + 1}**`} <@${h.userId}> — **${h.totalHosted}** sessions *(${h.rank})*`);

  await message.reply({
    embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle("🏆 Hosting Leaderboard").setDescription(lines.join("\n")).setFooter({ text: "Ranked by total sessions hosted" }).setTimestamp()],
  });
}
