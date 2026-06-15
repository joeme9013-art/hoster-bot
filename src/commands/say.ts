import { Message, ChatInputCommandInteraction, TextChannel } from "discord.js";
import { loadData, saveData } from "../storage.js";

export const SAY_OWNER = "fhfxrt7";

export function isSayOwner(username: string): boolean {
  return username.toLowerCase() === SAY_OWNER.toLowerCase();
}

export async function sayOnCommand(message: Message): Promise<void> {
  if (!isSayOwner(message.author.username)) return;
  const data = loadData();
  data.sayEnabled = true;
  saveData(data);
  try { await message.delete(); } catch { /* ignore */ }
  try {
    const dm = await message.author.createDM();
    await dm.send("✅ Say mode is now **ON** — your messages will be sent through the bot.");
  } catch { /* ignore if DMs closed */ }
}

export async function sayOffCommand(message: Message): Promise<void> {
  if (!isSayOwner(message.author.username)) return;
  const data = loadData();
  data.sayEnabled = false;
  saveData(data);
  try { await message.delete(); } catch { /* ignore */ }
  try {
    const dm = await message.author.createDM();
    await dm.send("🔴 Say mode is now **OFF** — your messages will send normally.");
  } catch { /* ignore if DMs closed */ }
}

export async function handleSaySlash(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isSayOwner(interaction.user.username)) {
    await interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
    return;
  }

  const text = interaction.options.getString("message", true);
  const target = interaction.options.getUser("target");

  try {
    if (target) {
      const channel = interaction.channel;
      if (!channel || !(channel instanceof TextChannel)) {
        await interaction.reply({ content: "❌ This only works in a regular text channel.", ephemeral: true });
        return;
      }

      const member = interaction.guild?.members.cache.get(target.id)
        ?? await interaction.guild?.members.fetch(target.id).catch(() => null);

      const username = member?.displayName ?? target.displayName ?? target.username;
      const avatarURL = target.displayAvatarURL({ size: 128 });

      const webhooks = await channel.fetchWebhooks();
      let webhook = webhooks.find(w => w.name === "BotRelay" && w.owner?.id === interaction.client.user?.id);
      if (!webhook) {
        webhook = await channel.createWebhook({ name: "BotRelay" });
      }

      await webhook.send({ content: text, username, avatarURL });
    } else {
      await interaction.channel?.send(text);
    }

    await interaction.reply({ content: "✅ Sent!", ephemeral: true });
  } catch (err) {
    try {
      await interaction.reply({ content: "❌ Failed to send — make sure I have **Manage Webhooks** permission in this channel.", ephemeral: true });
    } catch { /* already replied */ }
  }
}
