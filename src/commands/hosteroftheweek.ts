import { Message, EmbedBuilder } from "discord.js";
import { getHosterOfTheWeek, setHosterOfTheWeek, getHoster } from "../storage.js";
import { successEmbed, COLORS } from "../embed.js";

export async function hosterOfTheWeekCommand(message: Message): Promise<void> {
  const target = message.mentions.members?.first();

  if (target) {
    setHosterOfTheWeek(target.id);
    await message.reply({ embeds: [successEmbed("Hoster of the Week Set", `🌟 <@${target.id}> is now the **Hoster of the Week**! Congratulations!`)] });
    return;
  }

  const hotw = getHosterOfTheWeek();
  if (!hotw) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle("🌟 Hoster of the Week").setDescription("No Hoster of the Week has been set yet. Use `!HosterOfTheWeek @user` to set one.").setTimestamp()] });
    return;
  }

  const hoster = getHoster(hotw);
  const member = await message.guild?.members.fetch(hotw).catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🌟 Hoster of the Week")
    .setDescription(`<@${hotw}> is this week's featured hoster!`)
    .setTimestamp();

  if (member) embed.setThumbnail(member.user.displayAvatarURL());
  if (hoster) {
    embed.addFields(
      { name: "Rank", value: hoster.rank, inline: true },
      { name: "Total Sessions", value: String(hoster.totalHosted), inline: true }
    );
  }

  await message.reply({ embeds: [embed] });
}
