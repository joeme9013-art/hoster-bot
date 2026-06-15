import { Message, EmbedBuilder } from "discord.js";
import { COLORS } from "../embed.js";

export async function helpCommand(message: Message, args: string[]): Promise<void> {
  const prefix = "!";

  if (args.length > 0) {
    const cmd = args[0].toLowerCase();
    const details: Record<string, { usage: string; description: string }> = {
      hosteroftheweek: { usage: `${prefix}HosterOfTheWeek [@user]`, description: "Set or view the Hoster of the Week. Mention a user to set them, or leave blank to view the current one." },
      break: { usage: `${prefix}break @user [reason]`, description: "Put a hoster on break. They will be marked as unavailable for hosting." },
      unbreak: { usage: `${prefix}unbreak @user`, description: "Remove a hoster from break status." },
      leaderboard: { usage: `${prefix}leaderboard`, description: "Show the top hosters ranked by total sessions hosted." },
      profile: { usage: `${prefix}profile [@user]`, description: "View a hoster's profile including rank, stats, warnings, and status." },
      promotehoster: { usage: `${prefix}promotehoster @user <rank>`, description: "Promote a hoster to a new rank (e.g. Senior Hoster, Lead Hoster)." },
      rankhoster: { usage: `${prefix}rankhoster @user <rank>`, description: "Set a hoster's rank directly." },
      reform: { usage: `${prefix}reform @user <reason>`, description: "Add a reform entry to a hoster's record." },
      reforms: { usage: `${prefix}reforms [@user]`, description: "View reform records. Mention a user to see their reforms, or leave blank to see all recent reforms." },
      removehoster: { usage: `${prefix}removehoster @user`, description: "Remove a hoster from the roster entirely." },
      roster: { usage: `${prefix}roster`, description: "Show the full hosting roster with ranks and status." },
      rp: { usage: `${prefix}rp @user`, description: "Log a hosting session for a hoster (+1 to their leaderboard count)." },
      unrp: { usage: `${prefix}unrp @user`, description: "Remove a logged session from a hoster (-1 from their leaderboard count)." },
      warn: { usage: `${prefix}warn @user <reason>`, description: "Issue a warning to a hoster." },
      unwarn: { usage: `${prefix}unwarn @user [#]`, description: "Remove a warning from a hoster. Optionally specify warning number to remove a specific one." },
    };

    const info = details[cmd];
    if (info) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`📖 Command: ${prefix}${cmd}`)
        .addFields(
          { name: "Usage", value: `\`${info.usage}\`` },
          { name: "Description", value: info.description }
        )
        .setTimestamp();
      await message.reply({ embeds: [embed] });
      return;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle("🏠 Hosting Bot — Command List")
    .setDescription("Use `!help <command>` for details on any command.")
    .addFields(
      {
        name: "📋 Roster & Profiles",
        value: [
          "`!roster` — View the full hosting roster",
          "`!profile [@user]` — View a hoster's profile",
          "`!leaderboard` — Top hosters by sessions",
          "`!HosterOfTheWeek [@user]` — View/set hoster of the week",
        ].join("\n"),
      },
      {
        name: "⬆️ Management",
        value: [
          "`!promotehoster @user <rank>` — Promote a hoster",
          "`!rankhoster @user <rank>` — Set a hoster's rank",
          "`!removehoster @user` — Remove from roster",
        ].join("\n"),
      },
      {
        name: "⏸️ Status",
        value: [
          "`!break @user [reason]` — Put on break",
          "`!unbreak @user` — Remove from break",
          "`!rp @user` — Log a session (+1 leaderboard)",
          "`!unrp @user` — Remove a session (-1 leaderboard)",
        ].join("\n"),
      },
      {
        name: "⚠️ Discipline",
        value: [
          "`!warn @user <reason>` — Warn a hoster",
          "`!unwarn @user [#]` — Remove a warning",
          "`!reform @user <reason>` — Add reform entry",
          "`!reforms [@user]` — View reform records",
        ].join("\n"),
      }
    )
    .setFooter({ text: "Hosting Bot • Use !help <command> for more info" })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}
