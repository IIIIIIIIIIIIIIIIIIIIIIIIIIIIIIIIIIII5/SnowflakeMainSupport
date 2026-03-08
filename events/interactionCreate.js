import { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const JsonBinUrl = `https://api.jsonbin.io/v3/b/${process.env.JSONBIN_ID}`;

const PromptChannelId = "1479873539636203670";

const TicketTypes = {
  report_player: {
    name: "⚠️ | Report a Player",
    category: "1479874558784831561",
    logChannel: "1479876426290303181",
    roles: [
      "1398691449939169331",
      "1398691259568361538",
      "1398691258742079629",
      "1386369108408406096",
      "1443622126203572304"
    ]
  },

  dev_inquiry: {
    name: "🧪 | Development Inquiries",
    category: "1479874725512740975",
    logChannel: "1479876466836635911",
    roles: [
      "1443622126203572304",
      "1386369108408406096",
      "1398691257777393665"
    ]
  },

  general_inquiry: {
    name: "⁉️ | General Inquiries",
    category: "1479874783402528820",
    logChannel: "1479876505327636521",
    roles: [
      "1443622126203572304",
      "1386369108408406096",
      "1398691257777393665",
      "1456906418903978015"
    ]
  }
};

const R2 = new S3Client({
  endpoint: `https://${process.env.R2AccountId}.r2.cloudflarestorage.com`,
  region: "auto",
  credentials: {
    accessKeyId: process.env.R2AccessKey,
    secretAccessKey: process.env.R2SecretKey
  },
});

async function GetTickets() {
  const res = await fetch(JsonBinUrl, { headers: { "X-Master-Key": process.env.JSONBIN_KEY } });
  const data = await res.json();
  return data.record || {};
}

async function SaveTickets(tickets) {
  await fetch(JsonBinUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Master-Key": process.env.JSONBIN_KEY },
    body: JSON.stringify(tickets)
  });
}

async function UploadToR2(buffer, key, contentType) {
  const cmd = new PutObjectCommand({
    Bucket: process.env.R2Bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: "public-read"
  });
  try {
    await R2.send(cmd);
    return `${process.env.R2PublicBase}/${key}`;
  } catch {
    return null;
  }
}

function EscapeHtml(text) {
  return text || "";
}

async function GenerateTranscriptHtml(ChannelName, Messages, Guild) {

  const Css = `
    body { font-family: Segoe UI; background:#36393f; color:#dcddde; padding:20px }
    h1 { color:white }
    .msg { display:flex; margin-bottom:12px }
    .avatar { width:40px; height:40px; border-radius:50%; margin-right:10px }
    .content { background:#2f3136; padding:8px; border-radius:6px; flex:1 }
    .name { font-weight:600; color:white }
    .time { font-size:12px; color:#72767d; margin-left:6px }
    .text { margin-top:4px; white-space:pre-wrap }
    img { max-width:400px; border-radius:5px; margin-top:4px }
  `;

  let Html = `
  <!DOCTYPE html>
  <html>
  <head>
  <meta charset="UTF-8">
  <title>Transcript</title>
  <style>${Css}</style>
  </head>
  <body>
  <h1>Transcript for #${ChannelName}</h1>
  `;

  Messages.reverse().forEach(m => {

    const Time = new Date(m.createdTimestamp).toLocaleString();

    let content = m.content || "";

    content = content.replace(/<@!?(\d+)>/g, (_, id) => {
      const member = Guild.members.cache.get(id);
      return member ? `@${member.displayName}` : "@Unknown";
    });

    Html += `
    <div class="msg">
      <img class="avatar" src="${m.author.displayAvatarURL({ format: "png", size: 128 })}">
      <div class="content">
        <div class="name">${EscapeHtml(m.author.tag)} <span class="time">${Time}</span></div>
        <div class="text">${EscapeHtml(content)}</div>
    `;

    m.attachments.forEach(att => {
      const url = att.url;
      const ext = att.name.split(".").pop().toLowerCase();

      if (["png","jpg","jpeg","gif","webp"].includes(ext)) {
        Html += `<img src="${url}">`;
      } else {
        Html += `<div><a href="${url}">${att.name}</a></div>`;
      }
    });

    Html += `</div></div>`;
  });

  Html += `</body></html>`;

  return Html;
}

async function UploadTranscript(ChannelId, Html) {

  const Key = `${ChannelId}.html`;

  const Command = new PutObjectCommand({
    Bucket: process.env.R2Bucket,
    Key,
    Body: Html,
    ContentType: "text/html",
    ACL: "public-read"
  });

  await R2.send(Command);

  return `${process.env.R2PublicBase}/${Key}`;
}

async function SendPrompt(Client) {

  const channel = await Client.channels.fetch(PromptChannelId).catch(() => null);

  if (!channel) return;

  const messages = await channel.messages.fetch({ limit: 10 });

  const existing = messages.find(m => m.author.id === Client.user.id && m.components.length);

  if (existing) return;

  const embed = new EmbedBuilder()
    .setTitle("Support Tickets")
    .setDescription(`Select a ticket type below.`)
    .setColor("Blue");

  const row = new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId("report_player")
      .setLabel("Report a Player")
      .setEmoji("⚠️")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("dev_inquiry")
      .setLabel("Development Inquiries")
      .setEmoji("🧪")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("general_inquiry")
      .setLabel("General Inquiries")
      .setEmoji("⁉️")
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    embeds: [embed],
    components: [row]
  });
}

export default {

  name: "interactionCreate",

  async execute(Interaction, Client) {

    const Guild = Interaction.guild;
    const User = Interaction.user;

    let ActiveTickets = await GetTickets();

    if (!Client.TicketCounts) Client.TicketCounts = {};

    for (const T of Object.values(ActiveTickets)) {

      if (!Client.TicketCounts[T.categoryType])
        Client.TicketCounts[T.categoryType] = 0;

      if (T.ticketNumber > Client.TicketCounts[T.categoryType])
        Client.TicketCounts[T.categoryType] = T.ticketNumber;
    }

    if (Interaction.isChatInputCommand()) {

      const cmd = Client.commands.get(Interaction.commandName);

      if (!cmd) return;

      try {
        await cmd.execute(Interaction, Client);
      } catch {
        if (!Interaction.replied)
          await Interaction.reply({ content: "Command error.", ephemeral: true });
      }

      return;
    }

    if (!Interaction.isButton()) return;

    if (!Interaction.deferred && !Interaction.replied)
      await Interaction.deferReply({ ephemeral: true });

    const TicketData = ActiveTickets[Interaction.channel?.id];

    if (Interaction.customId === "claim_ticket") {

      if (!TicketData)
        return Interaction.editReply({ content: "Ticket data not found." });

      if (TicketData.claimerId)
        return Interaction.editReply({ content: "Ticket already claimed." });

      const config = TicketTypes[TicketData.categoryType];

      const member = await Guild.members.fetch(User.id);

      const hasRole = member.roles.cache.some(r => config.roles.includes(r.id));

      if (!hasRole && !member.permissions.has(PermissionsBitField.Flags.Administrator))
        return Interaction.editReply({ content: "No permission." });

      TicketData.claimerId = User.id;

      ActiveTickets[Interaction.channel.id] = TicketData;

      await SaveTickets(ActiveTickets);

      await Interaction.channel.permissionOverwrites.edit(User.id,{
        ViewChannel:true,
        SendMessages:true
      });

      return Interaction.editReply({ content:`Ticket claimed by ${User.tag}` });
    }

    if (Interaction.customId === "close_ticket") {

      const confirmEmbed = new EmbedBuilder()
        .setTitle("Confirm Ticket Closure")
        .setColor("Red")
        .setDescription("Are you sure?");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("confirm_close_yes").setLabel("Yes").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("confirm_close_no").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
      );

      return Interaction.editReply({ embeds: [confirmEmbed], components: [row] });
    }

    if (Interaction.customId === "confirm_close_no")
      return Interaction.editReply({ content:"Cancelled." });

    if (Interaction.customId === "confirm_close_yes") {

      if (!TicketData)
        return Interaction.editReply({ content:"Ticket data missing." });

      const config = TicketTypes[TicketData.categoryType];

      const logChannel = await Guild.channels.fetch(config.logChannel);

      const msgs = await Interaction.channel.messages.fetch({ limit:100 });

      const html = await GenerateTranscriptHtml(Interaction.channel.name,msgs,Guild);

      const url = await UploadTranscript(Interaction.channel.id,html);

      const embed = new EmbedBuilder()
        .setTitle("Ticket Closed")
        .addFields(
          { name:"Ticket",value:Interaction.channel.name,inline:true },
          { name:"Closed by",value:User.tag,inline:true }
        )
        .setColor("Red")
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Transcript").setStyle(ButtonStyle.Link).setURL(url)
      );

      await logChannel.send({ embeds:[embed],components:[row] });

      delete ActiveTickets[Interaction.channel.id];

      await SaveTickets(ActiveTickets);

      await Interaction.editReply({ content:"Ticket closed." });

      setTimeout(()=>Interaction.channel.delete().catch(()=>{}),2000);

      return;
    }

    const config = TicketTypes[Interaction.customId];

    if (!config)
      return Interaction.editReply({ content:"Unknown ticket type." });

    const existing = Object.values(ActiveTickets)
      .find(t => t.ownerId === User.id && t.categoryType === Interaction.customId);

    if (existing)
      return Interaction.editReply({ content:"You already have an open ticket." });

    if (!Client.TicketCounts[Interaction.customId])
      Client.TicketCounts[Interaction.customId] = 0;

    Client.TicketCounts[Interaction.customId]++;

    const number = Client.TicketCounts[Interaction.customId];

    const channel = await Guild.channels.create({
      name:`ticket-${User.username}`,
      type:ChannelType.GuildText,
      parent:config.category
    });

    await channel.permissionOverwrites.edit(User.id,{
      ViewChannel:true,
      SendMessages:true,
      AttachFiles:true
    });

    for (const role of config.roles) {
      await channel.permissionOverwrites.edit(role,{
        ViewChannel:true,
        SendMessages:true,
        ReadMessageHistory:true
      });
    }

    ActiveTickets[channel.id] = {
      ownerId:User.id,
      claimerId:null,
      createdAt:Date.now(),
      categoryType:Interaction.customId,
      ticketNumber:number
    };

    await SaveTickets(ActiveTickets);

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("claim_ticket").setLabel("Claim Ticket").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("close_ticket").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle(`${config.name} Ticket #${number}`)
      .setDescription(`Hello ${User}, a staff member will assist you shortly.`)
      .setColor("Green");

    await channel.send({
      content:`<@${User.id}>`,
      embeds:[embed],
      components:[buttons]
    });

    await Interaction.editReply({
      content:`Ticket created: <#${channel.id}>`
    });
  },

  async init(Client) {
    SendPrompt(Client);
  }
};
