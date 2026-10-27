'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} = require('discord.js');

const TICKET_CATEGORIES = Object.freeze({
  general_support: { label: 'General Support', emoji: '🛠️' },
  management_support: { label: 'Management Support', emoji: '👥' },
  claim_reward: { label: 'Claim reward', emoji: '🎁' },
  point_reward: { label: 'Staff point reward claim', emoji: '⭐' },
});

const v2 = (container, extra = {}) => ({
  ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'ephemeral')),
  flags: MessageFlags.IsComponentsV2 | (extra.ephemeral ? MessageFlags.Ephemeral : 0),
  components: [container],
});

const text = (content) => new TextDisplayBuilder().setContent(content);
const divider = (large = false) => new SeparatorBuilder()
  .setDivider(true)
  .setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

function ticketPanel() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:select')
    .setPlaceholder('Choose a ticket category')
    .addOptions(Object.entries(TICKET_CATEGORIES).filter(([value]) => value !== 'point_reward').map(([value, category]) => ({
      label: category.label,
      value,
      emoji: category.emoji,
      description: value === 'claim_reward'
        ? 'Request a review of your invite milestone reward.'
        : value === 'management_support'
          ? 'Speak with the AG Rewards management team.'
          : 'Questions, account issues, invite tracking, and other help.',
    })));

  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text('## 🎫 AG Rewards • Ticket Center\n👋 **Welcome to AG Rewards!**\nNeed to claim your rewards or need assistance? Select the appropriate option below to get started.'))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('### 🎁 Claim Invite Rewards\nReached the required invite milestone? Open a ticket to claim your invite rewards. Our staff will verify your invites before approving and delivering your reward.\n\n### 🛠️ Support Ticket\nNeed help with AG Rewards? Open a support ticket for questions, reward issues, invite tracking, account problems, or other concerns.'))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('### 📌 Ticket Guidelines\n✦ Open only one ticket per issue.\n✦ Clearly explain your request and provide any necessary proof.\n✦ Be respectful and patient with our staff team.\n✦ Do not repeatedly ping staff for updates.\n✦ False claims, trolling, or deliberately wasting staff time may result in warnings or a blacklist.'))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('### ⏳ Response Time\nOur staff will respond as soon as they are available. Please remain patient while your ticket is being reviewed.\n\n💙 Thank you for being a part of **AG Rewards!**\n**Select a category below to continue.**'))
    .addSeparatorComponents(divider())
    .addActionRowComponents(new ActionRowBuilder().addComponents(menu)));
}

function ticketWelcome(categoryKey, userId, assignment = null) {
  const category = TICKET_CATEGORIES[categoryKey];
  const moveMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket:move')
    .setPlaceholder('Staff: move ticket to another category')
    .addOptions(Object.entries(TICKET_CATEGORIES).map(([value, item]) => ({
      label: item.label,
      value,
      emoji: item.emoji,
      default: value === categoryKey,
    })));
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(
      text(`## ${category.emoji} ${category.label}`),
      text(`<@${userId}> thanks for opening a ticket. Please explain your request and include any relevant details or proof. A staff member will respond as soon as available.`),
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`Please keep the conversation respectful and avoid opening duplicate tickets.${assignment ? `\n\n**Assigned staff:** <@${assignment}>` : ''}`))
    .addSeparatorComponents(divider())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(moveMenu)));
}

function closedTicketCard(userId) {
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text('## 🔒 Ticket closed\nThis ticket is closed. A transcript was saved to the staff logs when available.'))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`Ticket opener: <@${userId}>`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:reopen').setLabel('Reopen').setEmoji('🔓').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket:delete').setLabel('Delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    )));
}

function suggestionCard({ submitterId, suggestion, upvotes = [], downvotes = [], suggestionId, status = 'Pending' }) {
  const voting = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`suggest:up:${suggestionId}`).setLabel(String(upvotes.length)).setEmoji('✅').setStyle(ButtonStyle.Secondary).setDisabled(status !== 'Pending'),
    new ButtonBuilder().setCustomId(`suggest:down:${suggestionId}`).setLabel(String(downvotes.length)).setEmoji('❌').setStyle(ButtonStyle.Secondary).setDisabled(status !== 'Pending'),
    new ButtonBuilder().setCustomId(`suggest:voters:${suggestionId}`).setLabel('Voters').setStyle(ButtonStyle.Primary),
  );

  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text('## 💡 Suggestion Submitted!'))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      text(`**Suggestion Submitter:**\n<@${submitterId}>`),
      text(`**Suggestion:**\n${suggestion}`),
      text(`**Status:** ${status}`),
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`**User ID:** ${submitterId}  •  **ID:** ${suggestionId}`))
    .addSeparatorComponents(divider())
    .addActionRowComponents(voting));
}

function welcomeCard(member, inviteInfo = '') {
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text(`## 💙 Welcome to ${member.guild.name}!`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`👋 Hey <@${member.id}>! We’re glad you’re here.\n\nTake a moment to read the server rules, explore the channels, and say hello. We hope you enjoy being part of the AG Rewards community!`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`**Member:** ${member.user.tag}\n**Member number:** ${member.guild.memberCount}${inviteInfo ? `\n**Invite:** ${inviteInfo}` : ''}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('🎫 Need help? Open a ticket from the ticket panel.\n💡 Have an idea? Share it with `/suggest`!')));
}

function queueCard(tickets) {
  const rows = tickets.length
    ? tickets.slice(0, 20).map((item, i) => `**${i + 1}.** <#${item.id}> • <@${item.owner}> • ${item.category} • ${item.age}`)
    : ['There are no open tickets right now.'];
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text('## 📥 Staff Ticket Queue'))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(rows.join('\n'))));
}

function votersCard(upvotes, downvotes) {
  const list = (ids) => ids.length ? ids.map((id) => `<@${id}>`).join(', ') : 'None yet';
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text('## 🗳️ Suggestion voters'))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`✅ **Upvotes (${upvotes.length})**\n${list(upvotes)}\n\n❌ **Downvotes (${downvotes.length})**\n${list(downvotes)}`)));
}

function statusCard(message) {
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text(`## AG Rewards Bot\n${message}`))
    .addSeparatorComponents(divider()));
}

function verifyPanel() {
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text('## 🔐 AG Rewards • Server Verification'))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('Welcome! Press **Verify me** to confirm you want to access the server. The bot will assign the Verified role and remove Unverified.\n\nVerification only changes your server roles; it does not ask for your password or account permissions.'))
    .addSeparatorComponents(divider())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify:complete').setLabel('Verify me').setEmoji('✅').setStyle(ButtonStyle.Success),
    )));
}

function vouchCard({ giverId, product, stars, author }) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text('## 🌟 New Vouch'))
    .addSeparatorComponents(divider())
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(text(`**Seller:**\n<@${giverId}>`))
      .setThumbnailAccessory((thumbnail) => thumbnail.setURL(author.displayAvatarURL({ size: 256 })).setDescription(`${author.username}'s avatar`)))
    .addTextDisplayComponents(text(`**Product:**\n${product}\n\n**Stars:**\n${'⭐'.repeat(stars)}\n\n**User:**\n<@${author.id}>\n\n**Time:**\n<t:${Math.floor(Date.now() / 1000)}:R>`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`— ${author.username} • AG Rewards`));
  return v2(container);
}

function staffActionCard({ title, memberId, actorId, reason, timestamp = Date.now(), details = '' }) {
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text(`## ${title}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`**Staff member:** <@${memberId}>\n**Recorded by:** <@${actorId}>${details ? `\n${details}` : ''}\n**Details:** ${reason}\n**Date:** <t:${Math.floor(timestamp / 1000)}:F>`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('AG Rewards • Staff record')));
}

function staffPointsCard({ title, rows }) {
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text(`## ${title}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text((rows || 'No staff points recorded yet.').slice(0, 3800)))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('AG Rewards • Staff points ledger')));
}

function staffBoardSetupCard({ rankName, index, total, ownerId, setupId }) {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`staffboard:role:${ownerId}:${setupId}:${index}`)
    .setPlaceholder(`Attach the Discord role for ${rankName}`)
    .setMinValues(1)
    .setMaxValues(1);
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text(`## Set up staff ranks\nRank **${index + 1} of ${total}: ${rankName}**\nChoose the Discord role members need to hold for this rank.`))
    .addSeparatorComponents(divider())
    .addActionRowComponents(new ActionRowBuilder().addComponents(menu)), { ephemeral: true });
}

function staffBoardCard(ranks, members) {
  const sections = ranks.map((rank) => {
    const holders = [...members.values()].filter((member) => !member.user.bot && member.roles.cache.has(rank.roleId));
    const names = holders.slice(0, 12).map((member) => `<@${member.id}>`).join(', ') || 'No members yet';
    const more = holders.length > 12 ? `, and ${holders.length - 12} more` : '';
    return `### ${rank.name} • <@&${rank.roleId}> (${holders.length})\n${names}${more}`;
  });
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text('## 🏅 Staff rank board'))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(sections.join('\n\n').slice(0, 3800)))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('AG Rewards • Staff ranks')));
}

function announcementCard(content, author) {
  const blocks = content.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/).filter(Boolean);
  const sections = blocks.length <= 3 ? blocks : [...blocks.slice(0, 2), blocks.slice(2).join('\n\n')];
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text('## 📢 Announcement'))
    .addSeparatorComponents(divider());
  sections.forEach((section, index) => {
    container.addTextDisplayComponents(text(section));
    if (index < sections.length - 1) container.addSeparatorComponents(divider());
  });
  container.addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`Posted by **${author.tag}** • AG Rewards`));
  return v2(container);
}

function pollCard(poll) {
  const counts = poll.options.map((_, index) => Object.values(poll.votes || {}).filter((vote) => vote === index).length);
  const options = poll.options.map((option, index) => `**${index + 1}.** ${option} — **${counts[index]}** vote(s)`).join('\n');
  const buttons = poll.options.map((_, index) => new ButtonBuilder()
    .setCustomId(`poll:${poll.id}:${index}`)
    .setLabel(`${index + 1} · ${counts[index]}`)
    .setStyle(ButtonStyle.Secondary));
  return v2(new ContainerBuilder()
    .addTextDisplayComponents(text(`## 📊 ${poll.question}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(options))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('Click a numbered button to vote. Click your choice again to remove your vote.'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(buttons)));
}

module.exports = { TICKET_CATEGORIES, ticketPanel, ticketWelcome, closedTicketCard, suggestionCard, votersCard, welcomeCard, queueCard, statusCard, verifyPanel, vouchCard, staffActionCard, staffPointsCard, staffBoardSetupCard, staffBoardCard, announcementCard, pollCard, v2, text, divider };
