import { Message } from "discord.js";
import { getHoster, removeHoster } from "../storage.js";
import { successEmbed, errorEmbed, warningEmbed } from "../embed.js";

export async function removeHosterCommand(message: Message): Promise<void> {
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Please mention a user. Usage: `!removehoster @user`")] }); return; }

  const hoster = getHoster(target.id);
  if (!hoster) { await message.reply({ embeds: [errorEmbed(`<@${target.id}> is not on the hosting roster.`)] }); return; }

  const role = message.guild?.roles.cache.find((r) => r.name === hoster.rank);

  let roleNote = "";
  if (role) {
    try {
      await target.roles.remove(role);
      roleNote = `\nTheir **${hoster.rank}** role has been removed.`;
    } catch {
      roleNote = `\n⚠️ **Could not remove the ${hoster.rank} role.**\nTo fix: Go to **Server Settings → Roles**, then drag **Hoster Bot**'s role to the very top of the list (above every hoster rank). Discord requires this — no code can bypass it.`;
    }
  } else {
    roleNote = `\n*(No matching Discord role named **${hoster.rank}** was found — roster entry removed only.)*`;
  }

  removeHoster(target.id);

  await message.reply({
    embeds: [successEmbed("Hoster Removed", `<@${target.id}> has been removed from the roster.${roleNote}`)],
  });
}
