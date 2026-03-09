import { SlashCommandBuilder } from "discord.js";

const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${process.env.JSONBIN_ID}`;
const ALLOWED_ROLES = [
  "1443622126203572304",
  "1386369108408406096",
  "1398691257777393665",
  "1398691258742079629",
  "1398691259568361538",
  "1398691449939169331",
  "1456906418903978015",
];

async function getTickets() {
  const res = await fetch(JSONBIN_URL, { headers: { "X-Master-Key": process.env.JSONBIN_KEY } });
  const data = await res.json();
  return data.record || {};
}

export default {
  data: new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add a user to the current ticket")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User to add to this ticket")
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const channel = interaction.channel;
    const member = interaction.member;

    const tickets = await getTickets();
    const ticketData = tickets[channel.id];

    if (!channel.name.startsWith("ticket-")) {
      return interaction.reply({ content: "This command can only be used inside a ticket channel.", ephemeral: true });
    }

    const hasRole = member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
    if (!hasRole) return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });

    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      ReadMessageHistory: true
    });

    await interaction.reply({ content: `${user.tag} has been added to this ticket.`, ephemeral: false });
  }
};
