import { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, PermissionsBitField } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move the current ticket to another category"),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({ content: "You need Manage Channels permissions to use this command.", ephemeral: true });
    }

    const TICKET_CATEGORIES = {
      report: process.env.REPORT_CATEGORY,
      devinquiry: process.env.DEV_CATEGORY,
      inquiry: process.env.GEN_CATEGORY
    };

    const moveMenu = new StringSelectMenuBuilder()
      .setCustomId("move_ticket")
      .setPlaceholder("Select a category to move this ticket to")
      .addOptions([
        { label: "Player Report", value: TICKET_CATEGORIES.report },
        { label: "Developer Inquiry", value: TICKET_CATEGORIES.devinquiry },
        { label: "General Inquiry", value: TICKET_CATEGORIES.inquiry }
      ]);

    const row = new ActionRowBuilder().addComponents(moveMenu);
    await interaction.reply({ content: "Select the category to move this ticket to:", components: [row], ephemeral: true });
  }
};
