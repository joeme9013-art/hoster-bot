import { Message } from "discord.js";
import { getHoster, setHoster, createDefaultHoster } from "../storage.js";
import { successEmbed, errorEmbed } from "../embed.js";

export async function rankHosterCommand(message: Message, args: string[]): Promise<void> {
  const target = message.mentions.members?.first();
  if (!target) { await message.reply({ embeds: [errorEmbed("Please mention a user. Usage: `!rankhoster @user <rank>`")] }); return; }

  const rank = args.slice(1).join(" ").trim();
  if (!rank) { await message.reply({ embeds: [errorEmbed("Please provide a rank. Usage: `!rankhoster @user <rank>`")] }); return; }

  const newRole = message.guild?.roles.cache.find((r) => r.name === rank);
  if (!newRole) {
    await message.reply({ embeds: [errorEmbed(`No Discord role named **${rank}** was found in this server. Make sure the role name matches exactly.`)] });
    return;
  }

  let hoster = getHoster(target.id) ?? createDefaultHoster(target.id, target.user.username);
  const oldRank = hoster.rank;

  const oldRole = message.guild?.roles.cache.find((r) => r.name === oldRank);
  if (oldRole && oldRank !== rank) {
    await target.roles.remove(oldRole).catch(() => null);
  }

  let roleNote = "";
  try {
    await target.roles.add(newRole);
    roleNote = `\nThey have been given the **${rank}** role.`;
  } catch {
    roleNote = `\n⚠️ **Could not assign the ${rank} role.**\nTo fix: Go to **Server Settings → Roles**, then drag **Hoster Bot**'s role to the very top of the list (above every hoster rank). Discord requires this — no code can bypass it.`;
  }

  hoster.rank = rank;
  hoster.username = target.user.username;
  setHoster(hoster);

  await message.reply({
    embeds: [successEmbed("Rank Set", `<@${target.id}> has been ranked as **${rank}**.${roleNote}${oldRank !== rank ? `\n*(Previous rank: ${oldRank})*` : ""}`)],
  });
}
