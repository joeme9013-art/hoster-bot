import { Message } from "discord.js";
import { getHoster, setHoster, createDefaultHoster } from "../storage.js";
import { successEmbed, errorEmbed } from "../embed.js";

export async function promoteHosterCommand(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Please mention a user. Usage: `!promotehoster @user <new rank>`")] }); return; }

  const newRank = args.slice(1).join(" ").trim();
  if (!newRank) { await message.reply({ embeds: [errorEmbed("Please provide the new rank. Usage: `!promotehoster @user <new rank>`")] }); return; }

  const newRole = message.guild?.roles.cache.find((r) => r.name === newRank);
  if (!newRole) {
    await message.reply({ embeds: [errorEmbed(`No Discord role named **${newRank}** was found in this server. Make sure the role name matches exactly.`)] });
    return;
  }

  let hoster = getHoster(target.id) ?? createDefaultHoster(target.id, target.user.username);
  const oldRank = hoster.rank;

  const oldRole = message.guild?.roles.cache.find((r) => r.name === oldRank);
  if (oldRole && oldRank !== newRank) {
    await target.roles.remove(oldRole).catch(() => null);
  }

  let roleNote = "";
  try {
    await target.roles.add(newRole);
    roleNote = `\nThey have been given the **${newRank}** role.`;
  } catch {
    roleNote = `\n⚠️ **Could not assign the ${newRank} role.**\nTo fix: Go to **Server Settings → Roles**, then drag **Hoster Bot**'s role to the very top of the list (above every hoster rank). Discord requires this — no code can bypass it.`;
  }

  hoster.rank = newRank;
  hoster.username = target.user.username;
  setHoster(hoster);

  await message.reply({
    embeds: [successEmbed("Hoster Promoted", `🎉 <@${target.id}> has been promoted from **${oldRank}** to **${newRank}**!${roleNote}`)],
  });
}
