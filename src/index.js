'use strict';

require('dotenv').config();
const {
  ActionRowBuilder,
  ActivityType,
  ChannelType,
  Client,
  Events,
  EmbedBuilder,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const store = require('./store');
const {
  TICKET_CATEGORIES,
  ticketPanel,
  ticketWelcome,
  closedTicketCard,
  suggestionCard,
  votersCard,
  welcomeCard,
  queueCard,
  statusCard,
  verifyPanel,
  vouchCard,
  staffActionCard,
  staffPointsCard,
  staffBoardSetupCard,
  staffBoardCard,
  announcementCard,
  pollCard,
} = require('./components');

const { DISCORD_TOKEN, SUPPORT_ROLE_ID, TICKET_CATEGORY_ID } = process.env;
if (!DISCORD_TOKEN || /put_.*_here|your[_ -].*token|placeholder/i.test(DISCORD_TOKEN)) {
  throw new Error('Set a real DISCORD_TOKEN in .env from Discord Developer Portal → Application → Bot.');
}

const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildInvites,
  GatewayIntentBits.MessageContent,
] });
const inviteCache = new Map();
const afkStatuses = new Map();
const PROFANITY = /\b(fuck|fucker|fucking|shit|bitch|bastard|asshole|cunt|nigger|faggot)\b/i;
const LOG_DEFINITIONS = [
  ['tickets', 'ticket-logs'],
  ['suggestions', 'suggestion-logs'],
  ['members', 'member-logs'],
  ['messages', 'message-logs'],
  ['staff', 'staff-logs'],
];

function isStaff(memberOrInteraction) {
  const member = memberOrInteraction.member ?? memberOrInteraction;
  const permissions = memberOrInteraction.memberPermissions ?? member.permissions;
  return Boolean(permissions?.has(PermissionFlagsBits.ManageGuild)
    || (SUPPORT_ROLE_ID && member?.roles?.cache?.has(SUPPORT_ROLE_ID)));
}

function topicValue(topic, key) {
  return topic?.split('|').map((part) => part.trim()).find((part) => part.startsWith(`${key}:`))?.slice(key.length + 1);
}

function setTopicValue(topic, key, value) {
  const parts = (topic || '').split('|').map((part) => part.trim()).filter(Boolean).filter((part) => !part.startsWith(`${key}:`));
  parts.push(`${key}:${value}`);
  return parts.join(' | ');
}

function isTicket(channel) {
  return channel?.type === ChannelType.GuildText && channel.topic?.startsWith('AG Rewards ticket');
}

function v2Reply(message, ephemeral = true) {
  const payload = statusCard(message);
  if (ephemeral) payload.flags |= MessageFlags.Ephemeral;
  return payload;
}

async function respond(interaction, message, ephemeral = true) {
  const payload = typeof message === 'string' ? v2Reply(message, ephemeral) : message;
  if (typeof message === 'string' && !ephemeral) payload.flags &= ~MessageFlags.Ephemeral;
  if (interaction.deferred) return interaction.editReply(payload);
  if (interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function logTo(guild, kind, message) {
  try {
    const id = store.getGuild(guild.id).logChannels[kind];
    const channel = id && await guild.channels.fetch(id).catch(() => null);
    if (channel?.isTextBased()) await channel.send(typeof message === 'string' ? statusCard(message.slice(0, 3800)) : message);
  } catch (error) {
    console.error(`Could not write ${kind} log:`, error);
  }
}

async function publishStaffCard(guild, kind, card, summary) {
  const db = store.getGuild(guild.id);
  const channelId = db[`${kind}Channels`]?.[guild.id];
  const channel = channelId && await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(card);
    await logTo(guild, 'staff', summary);
  } else {
    await logTo(guild, 'staff', card);
  }
}

async function logTranscript(channel, closedBy) {
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return;
  const transcript = [...messages.values()].reverse().map((message) => {
    const componentText = (components) => (components || []).map((component) => {
      const own = component.content || '';
      return `${own}${component.components ? `\n${componentText(component.components)}` : ''}`;
    }).filter(Boolean).join('\n');
    const body = message.content || componentText(message.components) || '[No text content]';
    const attachments = [...message.attachments.values()].map((attachment) => attachment.url).join(' ');
    return `[${message.createdAt.toISOString()}] ${message.author.tag}: ${body}${attachments ? `\nAttachments: ${attachments}` : ''}`;
  }).join('\n');
  const guild = channel.guild;
  const chunks = transcript.match(/[\s\S]{1,3400}/g) || ['(No messages)'];
  await logTo(guild, 'tickets', `Transcript for #${channel.name} (closed by ${closedBy.tag})\n${chunks[0]}`);
  for (let index = 1; index < chunks.length; index += 1) {
    const id = store.getGuild(guild.id).logChannels.tickets;
    const logChannel = id && await guild.channels.fetch(id).catch(() => null);
    if (logChannel?.isTextBased()) await logChannel.send(statusCard(`Transcript continued (${index + 1}/${chunks.length})\n${chunks[index]}`));
  }
}

function claimModal() {
  return new ModalBuilder()
    .setCustomId('ticket:claim-form')
    .setTitle('Claim invite reward')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('invite_count').setLabel('Your invite milestone / invite count').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('proof').setLabel('Proof or invite details (link if available)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('reward').setLabel('Which reward are you claiming?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)),
    );
}

async function createTicket(interaction, categoryKey, claimDetails = '', pointClaim = null) {
  const { guild, user } = interaction;
  const category = TICKET_CATEGORIES[categoryKey];
  if (!guild || !category) return respond(interaction, 'This ticket option is not available here.');

  const existing = guild.channels.cache.find((channel) => isTicket(channel)
    && topicValue(channel.topic, 'owner') === user.id && topicValue(channel.topic, 'status') !== 'closed');
  if (existing) return respond(interaction, `You already have an open ticket: <#${existing.id}>`);
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  }

  let pointClaimDb = null;
  if (pointClaim) {
    pointClaimDb = store.getGuild(guild.id);
    const balance = pointClaimDb.staffPoints[guild.id][user.id] || 0;
    if (balance < pointClaim.cost) return respond(interaction, `You need **${pointClaim.cost}** points for this reward; your balance is **${balance}**.`);
    addPointLedgerEntry(pointClaimDb, guild.id, user.id, user.id, -pointClaim.cost, `Claimed ${pointClaim.label}; ticket request pending`);
    store.save();
  }

  const channelName = `${process.env.TICKET_PREFIX || 'ticket'}-${categoryKey}-${user.username}`
    .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 90);
  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
  ];
  if (SUPPORT_ROLE_ID && guild.roles.cache.has(SUPPORT_ROLE_ID)) {
    permissionOverwrites.push({ id: SUPPORT_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  } else {
    const adminRole = guild.roles.cache.find((role) => role.permissions.has(PermissionFlagsBits.Administrator));
    if (adminRole) permissionOverwrites.push({ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  const createdAt = Date.now();
  const options = {
    name: channelName,
    type: ChannelType.GuildText,
    topic: `AG Rewards ticket | owner:${user.id} | category:${categoryKey} | status:open | created:${createdAt}`,
    permissionOverwrites,
    reason: `AG Rewards ${category.label} ticket opened by ${user.tag}`,
  };
  if (TICKET_CATEGORY_ID && guild.channels.cache.get(TICKET_CATEGORY_ID)?.type === ChannelType.GuildCategory) options.parent = TICKET_CATEGORY_ID;

  let channel;
  try {
    channel = await guild.channels.create(options);
    await channel.send(ticketWelcome(categoryKey, user.id));
    if (claimDetails) await channel.send(statusCard(`## 🎁 Reward claim details\n${claimDetails}`));
  } catch (error) {
    if (pointClaim && channel) await channel.delete('Clean up failed point reward ticket creation').catch(() => {});
    if (pointClaim && pointClaimDb) {
      addPointLedgerEntry(pointClaimDb, guild.id, user.id, user.id, pointClaim.cost, `Refund: failed to open ${pointClaim.label} claim ticket`);
      store.save();
    }
    throw error;
  }
  const db = store.getGuild(guild.id);
  db.ticketMetrics[channel.id] = { owner: user.id, category: categoryKey, createdAt, firstStaffReplyAt: null, claimedBy: null, ...(pointClaim ? { pointRewardClaim: { key: pointClaim.key, label: pointClaim.label, cost: pointClaim.cost, status: 'pending' } } : {}) };
  store.save();
  await logTo(guild, 'tickets', `Ticket opened: <#${channel.id}> • ${category.label} • <@${user.id}>`);
  return respond(interaction, `Your ${category.label} ticket is ready: <#${channel.id}>`);
}

async function handleTicketButton(interaction, action) {
  const channel = interaction.channel;
  if (!isTicket(channel)) return respond(interaction, 'This channel is not an AG Rewards ticket.');
  const ownerId = topicValue(channel.topic, 'owner');
  const categoryKey = topicValue(channel.topic, 'category') || 'general_support';
  const closed = topicValue(channel.topic, 'status') === 'closed';

  if (action === 'claim') {
    if (!isStaff(interaction)) return respond(interaction, 'Only ticket staff can claim a ticket.');
    if (closed) return respond(interaction, 'Reopen this ticket before claiming it.');
    const prior = topicValue(channel.topic, 'claimed');
    if (prior && prior !== interaction.user.id) return respond(interaction, `This ticket is already claimed by <@${prior}>.`);
    await channel.setTopic(setTopicValue(channel.topic, 'claimed', interaction.user.id));
    const db = store.getGuild(channel.guildId);
    db.ticketMetrics[channel.id] ??= {};
    db.ticketMetrics[channel.id].claimedBy = interaction.user.id;
    store.save();
    await interaction.message.edit({ components: ticketWelcome(categoryKey, ownerId, interaction.user.id).components });
    await logTo(channel.guild, 'staff', `<@${interaction.user.id}> claimed ticket <#${channel.id}>.`);
    return respond(interaction, 'Ticket assigned to you.');
  }

  if (action === 'close') {
    if (interaction.user.id !== ownerId && !isStaff(interaction)) return respond(interaction, 'Only the ticket opener or staff can close this ticket.');
    if (closed) return respond(interaction, 'This ticket is already closed.');
    await interaction.deferUpdate();
    const metric = store.getGuild(channel.guildId).ticketMetrics[channel.id] || {};
    await logTranscript(channel, interaction.user);
    await channel.permissionOverwrites.edit(ownerId, { SendMessages: false, AttachFiles: false });
    await channel.setTopic(setTopicValue(channel.topic, 'status', 'closed'));
    const responseTime = metric.firstStaffReplyAt ? `${Math.round((metric.firstStaffReplyAt - metric.createdAt) / 60000)} minutes` : 'no staff reply recorded';
    await logTo(channel.guild, 'tickets', `Ticket closed: <#${channel.id}> • by <@${interaction.user.id}> • first response: ${responseTime}`);
    await interaction.message.edit({ components: closedTicketCard(ownerId).components });
    return;
  }

  if (action === 'reopen') {
    if (interaction.user.id !== ownerId && !isStaff(interaction)) return respond(interaction, 'Only the ticket opener or staff can reopen this ticket.');
    if (!closed) return respond(interaction, 'This ticket is already open.');
    await channel.permissionOverwrites.edit(ownerId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
    await channel.setTopic(setTopicValue(channel.topic, 'status', 'open'));
    await interaction.message.edit({ components: ticketWelcome(categoryKey, ownerId, topicValue(channel.topic, 'claimed')).components });
    await logTo(channel.guild, 'tickets', `Ticket reopened: <#${channel.id}> • by <@${interaction.user.id}>`);
    return respond(interaction, 'Ticket reopened.');
  }

  if (action === 'delete') {
    if (!isStaff(interaction)) return respond(interaction, 'Only ticket staff can delete a ticket.');
    await respond(interaction, 'Ticket will be deleted in five seconds.');
    setTimeout(() => channel.delete(`Ticket deleted by ${interaction.user.tag}`).catch(console.error), 5000).unref?.();
  }
}

async function createLogChannels(interaction) {
  const guild = interaction.guild;
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  const everyone = guild.roles.everyone.id;
  const overwrites = [
    { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (SUPPORT_ROLE_ID && guild.roles.cache.has(SUPPORT_ROLE_ID)) {
    overwrites.push({ id: SUPPORT_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  const privateOverwrites = [...new Map(overwrites.map((overwrite) => [overwrite.id, overwrite])).values()];
  let category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === 'ag-rewards-logs');
  if (!category) category = await guild.channels.create({ name: 'ag-rewards-logs', type: ChannelType.GuildCategory, permissionOverwrites: privateOverwrites, reason: 'Create private AG Rewards log channels' });
  else await category.permissionOverwrites.set(privateOverwrites, 'Keep AG Rewards logs private');

  const mapping = store.getGuild(guild.id).logChannels;
  const created = [];
  for (const [key, name] of LOG_DEFINITIONS) {
    let channel = mapping[key] && await guild.channels.fetch(mapping[key]).catch(() => null);
    if (channel?.type !== ChannelType.GuildText) channel = null;
    if (!channel) channel = guild.channels.cache.find((item) => item.parentId === category.id && item.name === name);
    if (!channel) {
      channel = await guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: privateOverwrites, reason: 'Create AG Rewards log channel' });
    }
    else await channel.permissionOverwrites.set(privateOverwrites, 'Keep AG Rewards logs private');
    mapping[key] = channel.id;
    created.push(`<#${channel.id}>`);
  }
  store.save();
  await respond(interaction, `Created or connected all five private log channels:\n${created.join('\n')}`);
  await logTo(guild, 'staff', `<@${interaction.user.id}> ran /logchannels create.`);
}

async function submitSuggestion(interaction, suggestion) {
  const db = store.getGuild(interaction.guildId);
  const channelId = db.suggestionChannels[interaction.guildId];
  const channel = channelId && await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return respond(interaction, 'The suggestion channel is not set or is unavailable. Ask an administrator to run `/suggestion-channel`.');
  }
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  const suggestionId = `${Date.now().toString(36)}${interaction.user.id.slice(-6)}`;
  const data = { id: suggestionId, guildId: interaction.guildId, channelId: channel.id, submitterId: interaction.user.id, suggestion, status: 'Pending', upvotes: [], downvotes: [], messageId: null, threadId: null, createdAt: Date.now() };
  const message = await channel.send(suggestionCard(data));
  data.messageId = message.id;
  store.load().suggestions[suggestionId] = data;
  store.save();
  try {
    const thread = await message.startThread({ name: `Suggestion ${suggestionId}`, autoArchiveDuration: 10080, reason: 'Discussion thread for a new AG Rewards suggestion' });
    data.threadId = thread.id;
    store.save();
  } catch (error) {
    console.error(`Could not create suggestion thread for ${message.id}:`, error);
  }
  await logTo(interaction.guild, 'suggestions', `Suggestion ${suggestionId} submitted by <@${interaction.user.id}>: ${suggestion}`);
  return respond(interaction, `Suggestion **${suggestionId}** submitted${data.threadId ? ' with a discussion thread' : ''}.`);
}

async function refreshSuggestion(data) {
  const guild = await client.guilds.fetch(data.guildId);
  const channel = await guild.channels.fetch(data.channelId).catch(() => null);
  const message = channel?.isTextBased() && await channel.messages.fetch(data.messageId).catch(() => null);
  if (message) await message.edit({ components: suggestionCard(data).components });
  return { guild, message };
}

function recordModerationCase(guild, action, userId, moderatorId, reason, extra = {}) {
  const db = store.getGuild(guild.id);
  db.moderationCases[guild.id] ??= [];
  const cases = db.moderationCases[guild.id];
  const entry = {
    caseId: cases.length ? cases[cases.length - 1].caseId + 1 : 1,
    action,
    userId,
    moderatorId,
    reason,
    timestamp: Date.now(),
    ...extra,
  };
  cases.push(entry);
  if (action === 'WARN') {
    db.warnings[guild.id][userId] ??= [];
    db.warnings[guild.id][userId].push(entry);
  }
  store.save();
  return entry;
}

function actorCanModerate(interaction, permission) {
  return interaction.memberPermissions?.has(permission) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function moderationTarget(interaction, user) {
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!target) throw new Error('That user is not currently a member of this server.');
  if (target.id === interaction.user.id) throw new Error('You cannot use this action on yourself.');
  if (target.id === client.user.id) throw new Error('I cannot moderate myself.');
  if (target.id === interaction.guild.ownerId) throw new Error('The server owner cannot be moderated by the bot.');
  const actor = await interaction.guild.members.fetch(interaction.user.id);
  const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
  if (interaction.user.id !== interaction.guild.ownerId && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    throw new Error('Your highest role must be above the target member’s highest role.');
  }
  if (botMember.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    throw new Error('Move the bot role above the target member’s highest role.');
  }
  return target;
}

async function dmModerationNotice(user, guild, message) {
  try { await user.send(statusCard(`## AG Rewards moderation notice\n**Server:** ${guild.name}\n${message}`)); }
  catch { /* DMs may be disabled; the action still completes. */ }
}

async function completeModeration(interaction, action, user, reason, extra = {}) {
  const entry = recordModerationCase(interaction.guild, action, user.id, interaction.user.id, reason, extra);
  await logTo(interaction.guild, 'staff', `**Case #${entry.caseId} • ${action}**\nMember: <@${user.id}>\nModerator: <@${interaction.user.id}>\nReason: ${reason}${extra.duration ? `\nDuration: ${extra.duration}` : ''}`);
  return entry;
}

async function handleModerationCommand(interaction) {
  const command = interaction.commandName;
  const permissionByCommand = {
    ban: PermissionFlagsBits.BanMembers,
    unban: PermissionFlagsBits.BanMembers,
    kick: PermissionFlagsBits.KickMembers,
    timeout: PermissionFlagsBits.ModerateMembers,
    untimeout: PermissionFlagsBits.ModerateMembers,
    mute: PermissionFlagsBits.ModerateMembers,
    unmute: PermissionFlagsBits.ModerateMembers,
    warn: PermissionFlagsBits.ModerateMembers,
    warnings: PermissionFlagsBits.ModerateMembers,
    warns: PermissionFlagsBits.ModerateMembers,
    unwarn: PermissionFlagsBits.ModerateMembers,
    clearwarnings: PermissionFlagsBits.ModerateMembers,
    purge: PermissionFlagsBits.ManageMessages,
    clear: PermissionFlagsBits.ManageMessages,
    slowmode: PermissionFlagsBits.ManageChannels,
    lock: PermissionFlagsBits.ManageChannels,
    unlock: PermissionFlagsBits.ManageChannels,
    nickname: PermissionFlagsBits.ManageNicknames,
    'nickname-reset': PermissionFlagsBits.ManageNicknames,
  };
  const requiredPermission = permissionByCommand[command];
  if (!requiredPermission || !actorCanModerate(interaction, requiredPermission)) {
    return respond(interaction, 'You do not have permission to use this moderation command.');
  }
  const botMember = interaction.guild.members.me;
  const botPermissionByCommand = {
    ban: PermissionFlagsBits.BanMembers,
    unban: PermissionFlagsBits.BanMembers,
    kick: PermissionFlagsBits.KickMembers,
    timeout: PermissionFlagsBits.ModerateMembers,
    untimeout: PermissionFlagsBits.ModerateMembers,
    mute: PermissionFlagsBits.ModerateMembers,
    unmute: PermissionFlagsBits.ModerateMembers,
    warn: PermissionFlagsBits.ModerateMembers,
    warnings: PermissionFlagsBits.ModerateMembers,
    warns: PermissionFlagsBits.ModerateMembers,
    unwarn: PermissionFlagsBits.ModerateMembers,
    clearwarnings: PermissionFlagsBits.ModerateMembers,
    purge: PermissionFlagsBits.ManageMessages,
    clear: PermissionFlagsBits.ManageMessages,
    slowmode: PermissionFlagsBits.ManageChannels,
    lock: PermissionFlagsBits.ManageChannels,
    unlock: PermissionFlagsBits.ManageChannels,
    nickname: PermissionFlagsBits.ManageNicknames,
    'nickname-reset': PermissionFlagsBits.ManageNicknames,
  };
  const botPermission = botPermissionByCommand[command];
  if (botPermission && !botMember.permissions.has(botPermission)) return respond(interaction, `I need the **${command === 'timeout' || command === 'untimeout' ? 'Moderate Members' : command === 'ban' || command === 'unban' ? 'Ban Members' : command === 'kick' ? 'Kick Members' : command === 'purge' ? 'Manage Messages' : command.startsWith('nickname') ? 'Manage Nicknames' : 'Manage Channels'}** permission to do that.`);

  const reason = interaction.options.getString('reason')?.trim() || 'No reason provided';
  const user = interaction.options.getUser('member');
  let target;

  try {
    if (command === 'ban') {
      const presentMember = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (presentMember) await moderationTarget(interaction, user);
    }
    if (['kick', 'timeout', 'untimeout', 'mute', 'unmute', 'warn', 'unwarn', 'clearwarnings', 'nickname', 'nickname-reset'].includes(command)) {
      target = await moderationTarget(interaction, user);
    }

    if (command === 'ban') {
      const deleteDays = interaction.options.getInteger('delete_days') || 0;
      await interaction.guild.members.ban(user, { reason, deleteMessageSeconds: deleteDays * 86400 });
      const entry = await completeModeration(interaction, 'BAN', user, reason, { deleteDays });
      await dmModerationNotice(user, interaction.guild, `You were banned.\n**Reason:** ${reason}\n**Case:** #${entry.caseId}`);
      return respond(interaction, `Banned <@${user.id}>. Case **#${entry.caseId}**.`);
    }

    if (command === 'unban') {
      const userId = interaction.options.getString('user_id', true).trim();
      if (!/^\d{17,20}$/.test(userId)) return respond(interaction, 'Enter a valid Discord user ID.');
      await interaction.guild.members.unban(userId, reason);
      const bannedUser = await client.users.fetch(userId).catch(() => ({ id: userId }));
      const entry = await completeModeration(interaction, 'UNBAN', bannedUser, reason);
      return respond(interaction, `Unbanned <@${userId}>. Case **#${entry.caseId}**.`);
    }

    if (command === 'kick') {
      await target.kick(reason);
      const entry = await completeModeration(interaction, 'KICK', user, reason);
      await dmModerationNotice(user, interaction.guild, `You were kicked.\n**Reason:** ${reason}\n**Case:** #${entry.caseId}`);
      return respond(interaction, `Kicked <@${user.id}>. Case **#${entry.caseId}**.`);
    }

    if (['timeout', 'untimeout', 'mute', 'unmute'].includes(command)) {
      const minutes = ['timeout', 'mute'].includes(command) ? interaction.options.getInteger('minutes', true) : 0;
      await target.timeout(minutes ? minutes * 60_000 : null, reason);
      const action = minutes ? 'TIMEOUT' : 'UNTIMEOUT';
      const entry = await completeModeration(interaction, action, user, reason, minutes ? { duration: `${minutes} minutes` } : {});
      await dmModerationNotice(user, interaction.guild, minutes ? `You were timed out for **${minutes} minutes**.\n**Reason:** ${reason}\n**Case:** #${entry.caseId}` : `Your timeout was removed.\n**Reason:** ${reason}`);
      return respond(interaction, minutes ? `Timed out <@${user.id}> for ${minutes} minutes. Case **#${entry.caseId}**.` : `Removed timeout for <@${user.id}>. Case **#${entry.caseId}**.`);
    }

    if (command === 'warn') {
      const entry = await completeModeration(interaction, 'WARN', user, reason);
      const count = store.getGuild(interaction.guildId).warnings[interaction.guildId][user.id].length;
      await dmModerationNotice(user, interaction.guild, `You received a warning.\n**Reason:** ${reason}\n**Active warning count:** ${count}\n**Case:** #${entry.caseId}`);
      return respond(interaction, `Warned <@${user.id}>. They now have **${count}** warning(s). Case **#${entry.caseId}**.`);
    }

    if (command === 'warnings' || command === 'warns') {
      const warnedUser = interaction.options.getUser('member', true);
      const warnings = store.getGuild(interaction.guildId).warnings[interaction.guildId][warnedUser.id] || [];
      const lines = warnings.slice(-15).map((item) => `**#${item.caseId}** • <t:${Math.floor(item.timestamp / 1000)}:d> • <@${item.moderatorId}>\n${item.reason}`);
      return respond(interaction, `## ⚠️ Warning history for <@${warnedUser.id}>\n${warnings.length ? lines.join('\n\n').slice(0, 3500) : 'No warnings are recorded.'}`);
    }

    if (command === 'unwarn') {
      const caseId = interaction.options.getInteger('case', true);
      const db = store.getGuild(interaction.guildId);
      const list = db.warnings[interaction.guildId][user.id] || [];
      const at = list.findIndex((item) => item.caseId === caseId);
      if (at < 0) return respond(interaction, `Warning case #${caseId} was not found for <@${user.id}>.`);
      list.splice(at, 1);
      store.save();
      await logTo(interaction.guild, 'staff', `Warning case #${caseId} removed from <@${user.id}> by <@${interaction.user.id}>.`);
      return respond(interaction, `Removed warning case #${caseId} from <@${user.id}>.`);
    }

    if (command === 'clearwarnings') {
      const db = store.getGuild(interaction.guildId);
      const count = (db.warnings[interaction.guildId][user.id] || []).length;
      db.warnings[interaction.guildId][user.id] = [];
      store.save();
      const entry = await completeModeration(interaction, 'CLEAR_WARNINGS', user, reason, { cleared: count });
      return respond(interaction, `Cleared **${count}** warning(s) for <@${user.id}>. Case **#${entry.caseId}**.`);
    }

    if (command === 'purge' || command === 'clear') {
      const amount = interaction.options.getInteger('amount', true);
      const filterUser = command === 'purge' ? interaction.options.getUser('member') : null;
      let deleted;
      if (!filterUser) {
        deleted = await interaction.channel.bulkDelete(amount, true);
      } else {
        const recent = await interaction.channel.messages.fetch({ limit: 100 });
        const matches = recent.filter((message) => message.author.id === filterUser.id).first(amount);
        deleted = await interaction.channel.bulkDelete(matches, true);
      }
      const entry = await completeModeration(interaction, 'PURGE', filterUser || interaction.user, `Deleted ${deleted.size} messages${filterUser ? ` from ${filterUser.tag}` : ''}.`);
      return respond(interaction, `Deleted **${deleted.size}** message(s). Case **#${entry.caseId}**.`);
    }

    if (command === 'slowmode') {
      const seconds = interaction.options.getInteger('seconds', true);
      const channel = interaction.channel;
      await channel.setRateLimitPerUser(seconds, reason);
      const entry = await completeModeration(interaction, 'SLOWMODE', interaction.user, reason, { channelId: channel.id, duration: `${seconds} seconds` });
      return respond(interaction, `${seconds ? `Set slowmode to **${seconds} seconds**` : 'Disabled slowmode'} in <#${channel.id}>. Case **#${entry.caseId}**.`);
    }

    if (command === 'lock' || command === 'unlock') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const lock = command === 'lock';
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: lock ? false : null }, { reason });
      const entry = await completeModeration(interaction, lock ? 'LOCK' : 'UNLOCK', interaction.user, reason, { channelId: channel.id });
      return respond(interaction, `${lock ? 'Locked' : 'Unlocked'} <#${channel.id}>. Case **#${entry.caseId}**.`);
    }

    if (command === 'nickname' || command === 'nickname-reset') {
      const nickname = command === 'nickname' ? interaction.options.getString('name', true) : null;
      await target.setNickname(nickname, reason);
      const entry = await completeModeration(interaction, command === 'nickname' ? 'NICKNAME' : 'NICKNAME_RESET', user, reason, { nickname: nickname || '(cleared)' });
      return respond(interaction, `${nickname ? `Changed <@${user.id}>’s nickname to **${nickname}**` : `Cleared <@${user.id}>’s nickname`}. Case **#${entry.caseId}**.`);
    }
  } catch (error) {
    console.error(`Moderation command ${command} failed:`, error);
    return respond(interaction, `Moderation action failed: ${error.message}`);
  }
}

const INFRACTION_LABELS = { verbal_warning: 'Verbal warning', warning: 'Warning', strike: 'Strike', demotion: 'Demotion', termination: 'Termination' };
const STAFF_PERKS = {
  nickname: { label: 'Nickname change', cost: 50, automatic: true },
  custom_role: { label: 'Custom role', cost: 200, automatic: true },
  color_role: { label: 'Custom color role', cost: 125, automatic: true },
  vc_keycard: { label: 'Voice channel with keycard', cost: 300, automatic: true },
  vc_private: { label: 'Private voice channel', cost: 400, automatic: true },
  text_room: { label: 'Private text room', cost: 450, automatic: true },
  priority_ticket: { label: 'Priority ticket pass', cost: 100 },
  break_pass: { label: 'Extra break pass', cost: 100 },
  day_off: { label: 'Bonus day off request', cost: 250 },
  feature_request: { label: 'Staff feature request', cost: 150 },
};

function addPointLedgerEntry(db, guildId, memberId, actorId, delta, reason) {
  const entry = { id: `S${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, memberId, actorId, delta, reason, timestamp: Date.now() };
  db.staffPoints[guildId][memberId] = Math.max(0, (db.staffPoints[guildId][memberId] || 0) + delta);
  db.staffPointLedger[guildId].push(entry);
  return entry;
}

function memberHasStaffPointsRole(member, db, guildId) {
  const roleId = db.staffPointsRole[guildId] || SUPPORT_ROLE_ID;
  return Boolean(roleId && member.roles.cache.has(roleId));
}

function seedNewStaffPoints(member) {
  const db = store.getGuild(member.guild.id);
  const roleId = db.staffPointsRole[member.guild.id] || SUPPORT_ROLE_ID;
  const base = db.staffPointBase[member.guild.id];
  if (member.user.bot || base === null || !roleId || !member.roles.cache.has(roleId) || Object.hasOwn(db.staffPoints[member.guild.id], member.id)) return;
  const entry = addPointLedgerEntry(db, member.guild.id, member.id, client.user.id, base, 'Staff points base on joining staff');
  entry.baseSeed = true;
  store.save();
}

async function handleStaffRewards(interaction) {
  const db = store.getGuild(interaction.guildId);
  const group = interaction.options.getSubcommandGroup(true);
  const action = interaction.options.getSubcommand(true);
  const guildId = interaction.guildId;
  const isManager = isStaff(interaction);
  if (group === 'board') {
    if (!isManager) return respond(interaction, 'Manage Server or the configured support role is required to configure the staff board.');
    if (action === 'set') {
      const names = interaction.options.getString('ranks', true).split(',').map((name) => name.trim()).filter(Boolean);
      if (!names.length || names.length > 20) return respond(interaction, 'Enter between 1 and 20 comma-separated rank names.');
      if (names.some((name) => name.length > 80) || new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
        return respond(interaction, 'Each rank must be 1–80 characters, and rank names must be unique.');
      }
      const setupId = Math.random().toString(36).slice(2, 9);
      db.staffBoards[interaction.guildId] = { setupId, ranks: names.map((name) => ({ name, roleId: null })), configuredBy: interaction.user.id, updatedAt: Date.now() };
      store.save();
      return respond(interaction, staffBoardSetupCard({ rankName: names[0], index: 0, total: names.length, ownerId: interaction.user.id, setupId }));
    }
    const board = db.staffBoards[interaction.guildId];
    if (!board?.ranks?.length || board.ranks.some((rank) => !rank.roleId)) return respond(interaction, 'The rank board is not fully configured yet. Run `/staff board set` and attach a role to every rank.');
    const members = await interaction.guild.members.fetch();
    await interaction.channel.send(staffBoardCard(board.ranks, members));
    return respond(interaction, 'Staff rank board posted.');
  }
  if (group === 'points') {
    if (!isManager) return respond(interaction, 'Manage Server or the configured support role is required.');
    if (action === 'showbase') return respond(interaction, `Staff starting balance: **${db.staffPointBase[guildId]}** points. Existing balances are preserved.`);
    const roleId = db.staffPointsRole[guildId] || SUPPORT_ROLE_ID;
    if (!roleId) return respond(interaction, 'Configure the eligible staff role first with `/staff-points-config`.');
    const amount = interaction.options.getInteger('amount', true);
    const members = await interaction.guild.members.fetch();
    let seeded = 0;
    for (const member of members.values()) {
      if (member.user.bot || !member.roles.cache.has(roleId) || Object.hasOwn(db.staffPoints[guildId], member.id)) continue;
      const entry = addPointLedgerEntry(db, guildId, member.id, interaction.user.id, amount, 'Initial staff points base');
      entry.baseSeed = true;
      seeded += 1;
    }
    db.staffPointBase[guildId] = amount;
    store.save();
    await logTo(interaction.guild, 'staff', `Staff points base set to ${amount}; seeded ${seeded} staff members by <@${interaction.user.id}>.`);
    return respond(interaction, `Base set to **${amount}**. Seeded **${seeded}** eligible staff member(s); existing balances were left unchanged.`);
  }
  if (action === 'list') {
    const rows = Object.entries(STAFF_PERKS).map(([key, perk]) => `**${perk.label}** — ${perk.cost} points${perk.automatic ? ' (automatic)' : ' (staff approval)'}: /staff rewards claim perk:${key}`).join('\n');
    const payload = staffPointsCard({ title: '🎁 Staff perks', rows }); payload.flags |= MessageFlags.Ephemeral;
    return respond(interaction, payload);
  }
  if (action === 'keycard-role') {
    if (!isManager) return respond(interaction, 'Manage Server or the configured support role is required.');
    const role = interaction.options.getRole('role', true);
    db.staffRewards[guildId].keycardRoleId = role.id; store.save();
    return respond(interaction, `Keycard voice room access configured for <@&${role.id}>.`);
  }
  if (action === 'claim') return redeemStaffPerk(interaction, db);
  if (!isManager) return respond(interaction, 'Manage Server or the configured support role is required to review requests.');
  const requestId = interaction.options.getString('request_id', true);
  const request = db.staffRewards[guildId].requests.find((item) => item.id === requestId && item.status === 'pending');
  if (!request) return respond(interaction, 'Pending perk request not found.');
  if (action === 'approve') {
    request.status = 'approved'; request.reviewedBy = interaction.user.id; request.reviewedAt = Date.now(); store.save();
    await logTo(interaction.guild, 'staff', `Perk request ${request.id} approved by <@${interaction.user.id}>.`);
    return respond(interaction, `Approved **${request.id}**. Fulfill **${STAFF_PERKS[request.perk].label}** for <@${request.memberId}>.`);
  }
  const reason = interaction.options.getString('reason', true);
  request.status = 'rejected'; request.reviewedBy = interaction.user.id; request.reviewedAt = Date.now(); request.reviewReason = reason;
  addPointLedgerEntry(db, guildId, request.memberId, interaction.user.id, request.cost, `Refund for rejected request ${request.id}: ${reason}`);
  store.save();
  await logTo(interaction.guild, 'staff', `Perk request ${request.id} rejected and ${request.cost} points refunded by <@${interaction.user.id}>. ${reason}`);
  return respond(interaction, `Rejected **${request.id}** and refunded **${request.cost}** points to <@${request.memberId}>.`);
}

async function redeemStaffPerk(interaction, db) {
  const guildId = interaction.guildId;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const roleId = db.staffPointsRole[guildId] || SUPPORT_ROLE_ID;
  if (!roleId || !member.roles.cache.has(roleId)) return respond(interaction, 'You need the configured staff points role to redeem perks.');
  const key = interaction.options.getString('perk', true);
  const perk = STAFF_PERKS[key];
  const value = interaction.options.getString('value')?.trim() || '';
  const balance = db.staffPoints[guildId][member.id] || 0;
  if (balance < perk.cost) return respond(interaction, `This perk costs **${perk.cost}** points; your balance is **${balance}**.`);
  if (['nickname', 'custom_role'].includes(key) && !value) return respond(interaction, 'Provide the nickname or custom role name in the value option.');
  if (key === 'color_role' && !/^#?[0-9a-f]{6}$/i.test(value)) return respond(interaction, 'Provide a six-digit hex color, such as #33AAFF.');
  if (key === 'vc_keycard' && !db.staffRewards[guildId].keycardRoleId) return respond(interaction, 'Keycard access is not configured. Ask staff to run /staff rewards keycard-role.');
  let result = '';
  if (perk.automatic) {
    try {
      if (key === 'nickname') {
        await member.setNickname(value, 'Staff perk redemption');
        result = `Nickname changed to **${value}**`;
      } else if (key === 'custom_role' || key === 'color_role') {
        const role = await interaction.guild.roles.create({ name: (key === 'color_role' ? `${interaction.user.username}-custom` : value).slice(0, 100), color: key === 'color_role' ? parseInt(value.replace('#', ''), 16) : 0x5865F2, reason: `Staff perk redemption by ${interaction.user.tag}` });
        try { await member.roles.add(role, 'Staff perk redemption'); }
        catch (error) { await role.delete('Remove unassigned role after failed staff perk').catch(() => {}); throw error; }
        result = `Created and assigned ${role}`;
      } else if (['vc_keycard', 'vc_private', 'text_room'].includes(key)) {
        const type = key === 'text_room' ? ChannelType.GuildText : ChannelType.GuildVoice;
        const allow = type === ChannelType.GuildVoice ? ['ViewChannel', 'Connect', 'Speak'] : ['ViewChannel', 'SendMessages', 'ReadMessageHistory'];
        const overwrites = [
          { id: interaction.guild.roles.everyone.id, deny: ['ViewChannel'] },
          { id: member.id, allow },
        ];
        if (key === 'vc_keycard') overwrites.push({ id: db.staffRewards[guildId].keycardRoleId, allow: ['ViewChannel', 'Connect'] });
        const staffRole = db.staffPointsRole[guildId] || SUPPORT_ROLE_ID;
        if (key === 'vc_private' && staffRole) overwrites.push({ id: staffRole, allow: ['ViewChannel', 'Connect'] });
        const name = `${key === 'text_room' ? 'staff-room' : 'staff-vc'}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);
        const channel = await interaction.guild.channels.create({ name, type, permissionOverwrites: overwrites, reason: `Staff perk redemption by ${interaction.user.tag}` });
        result = `Created private room ${channel}`;
      }
    } catch (error) {
      return respond(interaction, `Could not fulfill this perk, so no points were charged: ${error.message}`);
    }
    addPointLedgerEntry(db, guildId, member.id, member.id, -perk.cost, `Redeemed ${perk.label}`);
    store.save();
    await logTo(interaction.guild, 'staff', `<@${member.id}> redeemed ${perk.label} for ${perk.cost} points. ${result}`);
    return respond(interaction, `${result}. **${perk.cost}** points deducted; balance **${db.staffPoints[guildId][member.id]}**.`);
  }
  const request = { id: `R${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, perk: key, memberId: member.id, value, cost: perk.cost, status: 'pending', createdAt: Date.now() };
  db.staffRewards[guildId].requests.push(request);
  addPointLedgerEntry(db, guildId, member.id, member.id, -perk.cost, `Requested ${perk.label} (${request.id})`);
  store.save();
  await logTo(interaction.guild, 'staff', `<@${member.id}> requested ${perk.label} (${request.id}) for ${perk.cost} points; awaiting review.`);
  return respond(interaction, `${perk.label} request **${request.id}** submitted. **${perk.cost}** points held pending staff approval.`);
}

async function handleStaffSystem(interaction) {
  const command = interaction.commandName;
  const db = store.getGuild(interaction.guildId);
  if (command === 'staff') return handleStaffRewards(interaction);
  if (!isStaff(interaction)) return respond(interaction, 'You need Manage Server or the configured support role to manage staff records.');
  if (command === 'promotion') {
    const user = interaction.options.getUser('member', true);
    const role = interaction.options.getRole('role', true);
    const previousRole = interaction.options.getRole('previous_role');
    const reason = interaction.options.getString('reason', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const actor = await interaction.guild.members.fetch(interaction.user.id);
    const bot = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    if (!member) return respond(interaction, 'That staff member is not in this server.');
    if (role.position >= actor.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) return respond(interaction, 'Your highest role must be above the promotion role.');
    if (role.position >= bot.roles.highest.position) return respond(interaction, 'The bot role must be above the promotion role.');
    await member.roles.add(role, `Staff promotion recorded by ${interaction.user.tag}`);
    if (previousRole && member.roles.cache.has(previousRole.id)) await member.roles.remove(previousRole, `Staff promotion recorded by ${interaction.user.tag}`);
    const record = { id: `P${Date.now().toString(36)}`, memberId: user.id, actorId: interaction.user.id, roleId: role.id, previousRoleId: previousRole?.id || null, reason, timestamp: Date.now() };
    db.promotions[interaction.guildId].push(record); store.save();
    const card = staffActionCard({ title: '🎉 Staff promotion', memberId: user.id, actorId: interaction.user.id, reason, timestamp: record.timestamp, details: `**New role:** <@&${role.id}>${previousRole ? `\n**Previous role removed:** <@&${previousRole.id}>` : ''}\n**Record:** ${record.id}` });
    await publishStaffCard(interaction.guild, 'promotion', card, `Promotion record ${record.id}: <@${user.id}> received <@&${role.id}> from <@${interaction.user.id}>. ${reason}`);
    return respond(interaction, `Promotion recorded and role ${role} assigned. Record **${record.id}**.`);
  }
  if (command === 'infraction') {
    const user = interaction.options.getUser('member', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return respond(interaction, 'That staff member is not in this server.');
    const level = interaction.options.getString('level', true);
    const reason = interaction.options.getString('reason', true);
    const record = { id: `I${Date.now().toString(36)}`, memberId: user.id, actorId: interaction.user.id, level, reason, timestamp: Date.now() };
    db.infractions[interaction.guildId].push(record); store.save();
    const card = staffActionCard({ title: `⚠️ Staff infraction • ${INFRACTION_LABELS[level]}`, memberId: user.id, actorId: interaction.user.id, reason, timestamp: record.timestamp, details: `**Level:** ${INFRACTION_LABELS[level]}\n**Record:** ${record.id}` });
    await publishStaffCard(interaction.guild, 'infraction', card, `Infraction record ${record.id}: ${INFRACTION_LABELS[level]} for <@${user.id}> by <@${interaction.user.id}>. ${reason}`);
    try { await user.send(staffActionCard({ title: `Staff infraction • ${INFRACTION_LABELS[level]}`, memberId: user.id, actorId: interaction.user.id, reason, timestamp: record.timestamp, details: `**Record:** ${record.id}` })); } catch {}
    return respond(interaction, `${INFRACTION_LABELS[level]} recorded for <@${user.id}>. Record **${record.id}**.`);
  }
  if (command === 'staff-points-config') {
    db.staffPointsRole[interaction.guildId] = interaction.options.getRole('role')?.id || null;
    store.save();
    return respond(interaction, db.staffPointsRole[interaction.guildId] ? `Staff points eligibility role set to <@&${db.staffPointsRole[interaction.guildId]}>.` : 'Staff points eligibility role cleared.');
  }
  if (command === 'staff-points-monthly') {
    const roleId = db.staffPointsRole[interaction.guildId];
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const totals = new Map();
    for (const entry of db.staffPointLedger[interaction.guildId]) {
      if (entry.timestamp >= monthStart.getTime()) totals.set(entry.memberId, (totals.get(entry.memberId) || 0) + entry.delta);
    }
    const rows = [...totals.entries()].filter(([id]) => !roleId || interaction.guild.members.cache.get(id)?.roles.cache.has(roleId))
      .sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, points], i) => `**${i + 1}.** <@${id}> — **${points}** points this month`).join('\n');
    return interaction.channel.send(staffPointsCard({ title: '📅 Monthly staff points', rows })).then(() => respond(interaction, 'Monthly staff points posted.'));
  }
  const user = interaction.options.getUser('member');
  if (command === 'staff-points-leaderboard') {
    const roleId = db.staffPointsRole[interaction.guildId];
    const entries = Object.entries(db.staffPoints[interaction.guildId]).filter(([id, points]) => points > 0 && (!roleId || interaction.guild.members.cache.get(id)?.roles.cache.has(roleId))).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const rows = entries.map(([id, points], i) => `**${i + 1}.** <@${id}> — **${points}** points`).join('\n');
    return interaction.channel.send(staffPointsCard({ title: '🏆 Staff points leaderboard', rows })).then(() => respond(interaction, 'Staff leaderboard posted.'));
  }
  if (command === 'staff-points-view' || command === 'staff-points-history') {
    const ledger = db.staffPointLedger[interaction.guildId].filter((entry) => entry.memberId === user.id).slice(-10).reverse();
    const balance = db.staffPoints[interaction.guildId][user.id] || 0;
    const rows = command === 'staff-points-view'
      ? `**Member:** <@${user.id}>\n**Current balance:** ${balance} points\n\n**Recent activity**\n${ledger.map((e) => `(${e.id}) • ${e.delta > 0 ? '+' : ''}${e.delta} • ${e.reason}`).join('\n') || 'No point activity yet.'}`
      : ledger.map((e) => `(${e.id}) • <t:${Math.floor(e.timestamp / 1000)}:d> • ${e.delta > 0 ? '+' : ''}${e.delta} • ${e.reason} • by <@${e.actorId}>`).join('\n') || 'No point activity yet.';
    const reply = staffPointsCard({ title: command === 'staff-points-view' ? '📊 Staff points' : '📜 Staff points history', rows });
    reply.flags |= MessageFlags.Ephemeral;
    return respond(interaction, reply);
  }
  if (command === 'staff-points-reverse') {
    const id = interaction.options.getString('entry_id', true);
    const entry = db.staffPointLedger[interaction.guildId].find((item) => item.id === id);
    if (!entry || entry.reversedBy) return respond(interaction, 'That ledger entry does not exist or has already been reversed.');
    const reason = interaction.options.getString('reason', true);
    entry.reversedBy = `R${Date.now().toString(36)}`;
    const reverse = { id: entry.reversedBy, memberId: entry.memberId, actorId: interaction.user.id, delta: -entry.delta, reason: `Reversal of ${id}: ${reason}`, timestamp: Date.now(), reverses: id };
    db.staffPoints[interaction.guildId][entry.memberId] = Math.max(0, (db.staffPoints[interaction.guildId][entry.memberId] || 0) + reverse.delta);
    db.staffPointLedger[interaction.guildId].push(reverse); store.save();
    await logTo(interaction.guild, 'staff', `Staff points entry ${id} reversed by <@${interaction.user.id}>. New balance: ${db.staffPoints[interaction.guildId][entry.memberId]}.`);
    return respond(interaction, `Reversed entry ${id}. New balance: **${db.staffPoints[interaction.guildId][entry.memberId]}**.`);
  }
  if (!user) return respond(interaction, 'Select a staff member.');
  if (['staff-points-award', 'staff-points-deduct', 'staff-points-set', 'staff-points-reset'].includes(command)) {
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const eligibleRole = db.staffPointsRole[interaction.guildId];
    if (!member || (eligibleRole && !member.roles.cache.has(eligibleRole))) return respond(interaction, 'That member is not currently eligible for staff points. Configure or assign the staff points role first.');
    const previous = db.staffPoints[interaction.guildId][user.id] || 0;
    let next = previous;
    if (command === 'staff-points-award') next += interaction.options.getInteger('points', true);
    if (command === 'staff-points-deduct') next = Math.max(0, next - interaction.options.getInteger('points', true));
    if (command === 'staff-points-set') next = interaction.options.getInteger('points', true);
    if (command === 'staff-points-reset') next = 0;
    const delta = next - previous;
    const record = { id: `S${Date.now().toString(36)}`, memberId: user.id, actorId: interaction.user.id, delta, reason: interaction.options.getString('reason', true), timestamp: Date.now() };
    db.staffPoints[interaction.guildId][user.id] = next; db.staffPointLedger[interaction.guildId].push(record); store.save();
    await logTo(interaction.guild, 'staff', `**Staff points ${delta >= 0 ? ' +' : ''}${delta}** for <@${user.id}> by <@${interaction.user.id}>. Balance: ${next}. ${record.reason} (entry ${record.id})`);
    return respond(interaction, `Updated <@${user.id}>: **${previous} → ${next}** points. Entry ${record.id}.`);
  }
  return respond(interaction, 'Unknown staff action.');
}

async function applyVerificationAccess(guild, roleIds, verificationChannelId = null) {
  const botMember = guild.members.me || await guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Give the bot Manage Channels so it can set verification access on server channels.');
  }
  const verifiedRole = roleIds.verified && guild.roles.cache.get(roleIds.verified);
  const unverifiedRole = roleIds.unverified && guild.roles.cache.get(roleIds.unverified);
  const channels = await guild.channels.fetch();
  const targets = [...channels.values()].filter((channel) =>
    channel && !channel.isThread() && channel.permissionOverwrites
      && (channel.id === verificationChannelId || channel.type === ChannelType.GuildCategory || !channel.parentId || channel.permissionsLocked !== true));
  targets.sort((a, b) => (a.type === ChannelType.GuildCategory ? -1 : 0) - (b.type === ChannelType.GuildCategory ? -1 : 0));
  for (const channel of targets) {
    if (verifiedRole) await channel.permissionOverwrites.edit(verifiedRole, { ViewChannel: true }, { reason: 'AG Rewards verified members can view channels' });
    if (unverifiedRole) {
      const isVerificationChannel = channel.id === verificationChannelId;
      await channel.permissionOverwrites.edit(unverifiedRole, {
        ViewChannel: isVerificationChannel,
        SendMessages: isVerificationChannel ? false : null,
      }, { reason: isVerificationChannel ? 'Allow unverified members to access the verification panel only' : 'AG Rewards unverified members cannot view channels' });
    }
  }
  return targets.length;
}

async function createVerificationRole(interaction) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  const guild = interaction.guild;
  const kind = interaction.options.getString('type', true);
  const botMember = guild.members.me || await guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return respond(interaction, 'The bot needs **Manage Roles** and **Manage Channels** permissions to set up verification.');
  }
  const db = store.getGuild(guild.id);
  const savedId = db.verificationRoles[kind];
  const roleName = kind === 'verified' ? 'Verified' : 'Unverified';
  let role = savedId && guild.roles.cache.get(savedId);
  if (!role) role = guild.roles.cache.find((candidate) => candidate.name.toLowerCase() === roleName.toLowerCase());
  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: kind === 'verified' ? 0x35B779 : 0x747F8D,
      permissions: kind === 'verified' ? [PermissionFlagsBits.ViewChannel] : [],
      hoist: true,
      mentionable: false,
      reason: `Create AG Rewards ${roleName} verification role by ${interaction.user.tag}`,
    });
  } else {
    await role.setPermissions(kind === 'verified' ? [PermissionFlagsBits.ViewChannel] : [], `Set AG Rewards ${roleName} permissions`);
  }
  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    return respond(interaction, `The bot role must be above **${roleName}**. Move the bot’s role higher, then run this command again.`);
  }
  db.verificationRoles[kind] = role.id;
  store.save();
  const channelsUpdated = await applyVerificationAccess(guild, db.verificationRoles, db.verificationChannels[guild.id]);
  await logTo(guild, 'staff', `<@${interaction.user.id}> set up the ${roleName} role and updated channel verification overwrites (${channelsUpdated} channels/categories).`);
  return respond(interaction, `Ready: ${role} is configured. Updated verification access on **${channelsUpdated}** channels/categories. Next create the other verification role, then assign Unverified to current members with the confirmed /role all command.`);
}

async function assignUnverifiedToAll(interaction) {
  const guild = interaction.guild;
  const role = interaction.options.getRole('role', true);
  const confirmed = interaction.options.getBoolean('confirm', true);
  if (!confirmed) return respond(interaction, 'Cancelled. Set `confirm` to true only when you intend to reset all current members to Unverified.');
  const configuredId = store.getGuild(guild.id).verificationRoles.unverified;
  if (!configuredId || role.id !== configuredId) return respond(interaction, 'Choose the Unverified role created by `/role create type:unverified`.');
  if (role.permissions.bitfield !== 0n) return respond(interaction, 'The Unverified role must have no server permissions. Re-run `/role create type:unverified` to reset it safely.');
  const botMember = guild.members.me || await guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || botMember.roles.highest.comparePositionTo(role) <= 0) {
    return respond(interaction, 'The bot needs Manage Roles and its highest role must be above Unverified.');
  }
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  const members = await guild.members.fetch();
  const verifiedId = store.getGuild(guild.id).verificationRoles.verified;
  const verifiedRole = verifiedId && guild.roles.cache.get(verifiedId);
  if (verifiedRole && botMember.roles.highest.comparePositionTo(verifiedRole) <= 0) {
    return respond(interaction, 'Move the bot role above Verified before resetting members to Unverified.');
  }
  const current = [...members.values()].filter((member) => !member.user.bot);
  let changed = 0;
  let failed = 0;
  for (let start = 0; start < current.length; start += 5) {
    const batch = current.slice(start, start + 5);
    const results = await Promise.allSettled(batch.map(async (member) => {
      if (verifiedId && member.roles.cache.has(verifiedId)) await member.roles.remove(verifiedId, 'Reset member to Unverified for AG Rewards verification');
      if (!member.roles.cache.has(role.id)) await member.roles.add(role, 'Assign Unverified role for AG Rewards verification');
    }));
    changed += results.filter((result) => result.status === 'fulfilled').length;
    failed += results.filter((result) => result.status === 'rejected').length;
  }
  await logTo(guild, 'staff', `<@${interaction.user.id}> assigned Unverified to members. Updated: ${changed}, failed: ${failed}.`);
  return respond(interaction, `Finished. Updated **${changed}** member(s); **${failed}** could not be changed. They can verify from the panel.`);
}

async function handleVerificationButton(interaction) {
  if (!interaction.guild) return respond(interaction, 'Use the verification panel in the server.');
  const roles = store.getGuild(interaction.guildId).verificationRoles;
  const verifiedRole = roles.verified && interaction.guild.roles.cache.get(roles.verified);
  const unverifiedRole = roles.unverified && interaction.guild.roles.cache.get(roles.unverified);
  if (!verifiedRole || !unverifiedRole) return respond(interaction, 'Verification is not configured yet. Ask a server administrator to run `/role create` for both roles.');
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(verifiedRole.id)) return respond(interaction, 'You are already verified. Welcome!');
  const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
  if (botMember.roles.highest.comparePositionTo(verifiedRole) <= 0 || botMember.roles.highest.comparePositionTo(unverifiedRole) <= 0) {
    return respond(interaction, 'Verification is temporarily unavailable. Ask staff to move the bot role above Verified and Unverified.');
  }
  await member.roles.add(verifiedRole, 'Member completed AG Rewards server verification');
  if (member.roles.cache.has(unverifiedRole.id)) await member.roles.remove(unverifiedRole, 'Member completed AG Rewards server verification');
  await logTo(interaction.guild, 'members', `<@${member.id}> completed server verification.`);
  return respond(interaction, '✅ You are verified! You now have access to the server.');
}

async function handleSuggestionButton(interaction) {
  const [, action, suggestionId] = interaction.customId.split(':');
  const data = store.load().suggestions[suggestionId];
  if (!data || data.guildId !== interaction.guildId) return respond(interaction, 'This suggestion is no longer available.');
  if (action === 'voters') {
    const reply = votersCard(data.upvotes, data.downvotes);
    reply.flags |= MessageFlags.Ephemeral;
    return interaction.reply(reply);
  }
  if (data.status !== 'Pending') return respond(interaction, 'Voting is closed for this suggestion.');
  const already = (action === 'up' ? data.upvotes : data.downvotes).includes(interaction.user.id);
  data.upvotes = data.upvotes.filter((id) => id !== interaction.user.id);
  data.downvotes = data.downvotes.filter((id) => id !== interaction.user.id);
  if (!already) (action === 'up' ? data.upvotes : data.downvotes).push(interaction.user.id);
  store.save();
  const channel = await interaction.guild.channels.fetch(data.channelId).catch(() => null);
  const message = channel?.isTextBased() && await channel.messages.fetch(data.messageId).catch(() => null);
  if (!message) return respond(interaction, 'I could not find the suggestion message to update.');
  await message.edit({ components: suggestionCard(data).components });
  return respond(interaction, already ? 'Your vote was removed.' : 'Your vote was counted.');
}

async function handlePollVote(interaction) {
  const [, pollId, choiceText] = interaction.customId.split(':');
  const poll = store.getGuild(interaction.guildId).polls[interaction.guildId][pollId];
  const choice = Number(choiceText);
  if (!poll || !Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) return respond(interaction, 'This poll is no longer available.');
  await interaction.deferUpdate();
  const previous = poll.votes[interaction.user.id];
  if (previous === choice) delete poll.votes[interaction.user.id];
  else poll.votes[interaction.user.id] = choice;
  store.save();
  await interaction.message.edit({ components: pollCard(poll).components });
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
      const { commandName } = interaction;
      if (commandName === 'ticket-panel') {
        await interaction.channel.send(ticketPanel());
        return respond(interaction, 'Ticket panel posted.');
      }
      if (commandName === 'suggestion-channel') {
        const channel = interaction.options.getChannel('channel', true);
        store.getGuild(interaction.guildId).suggestionChannels[interaction.guildId] = channel.id;
        store.save();
        return respond(interaction, `Suggestions will be posted in <#${channel.id}>.`);
      }
      if (commandName === 'vouch-channel') {
        const channel = interaction.options.getChannel('channel', true);
        store.getGuild(interaction.guildId).vouchChannels[interaction.guildId] = channel.id;
        store.save();
        return respond(interaction, `Vouches will be posted in <#${channel.id}>.`);
      }
      if (commandName === 'promotion-channel' || commandName === 'infraction-channel') {
        const channel = interaction.options.getChannel('channel', true);
        const key = commandName === 'promotion-channel' ? 'promotionChannels' : 'infractionChannels';
        store.getGuild(interaction.guildId)[key][interaction.guildId] = channel.id;
        store.save();
        return respond(interaction, `${commandName === 'promotion-channel' ? 'Promotion cards' : 'Infraction cards'} will be posted in <#${channel.id}>.`);
      }
      if (commandName === 'vouch') {
        const db = store.getGuild(interaction.guildId);
        const id = db.vouchChannels[interaction.guildId];
        const channel = id && await interaction.guild.channels.fetch(id).catch(() => null);
        if (!channel?.isTextBased()) return respond(interaction, 'Vouch channel is not set or unavailable. Ask an administrator to run `/vouch-channel`.');
        const giver = interaction.options.getUser('member', true);
        const product = interaction.options.getString('product', true);
        const stars = interaction.options.getInteger('stars', true);
        await channel.send(vouchCard({ giverId: giver.id, product, stars, author: interaction.user }));
        return respond(interaction, `Vouch posted in <#${channel.id}>.`);
      }
      if (commandName === 'logchannels') {
        if (!isStaff(interaction)) return respond(interaction, 'You need Manage Server or the configured support role to create log channels.');
        return createLogChannels(interaction);
      }
      if (commandName === 'welcome-channel') {
        const channel = interaction.options.getChannel('channel', true);
        store.getGuild(interaction.guildId).welcomeChannels[interaction.guildId] = channel.id;
        store.save();
        return respond(interaction, `Welcome cards will be posted in <#${channel.id}>.`);
      }
      if (commandName === 'verify-panel') {
        if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return respond(interaction, 'Post the verification panel in a server text channel.');
        const db = store.getGuild(interaction.guildId);
        db.verificationChannels[interaction.guildId] = interaction.channel.id;
        store.save();
        await applyVerificationAccess(interaction.guild, db.verificationRoles, interaction.channel.id);
        await interaction.channel.send(verifyPanel());
        return respond(interaction, 'Verification panel posted.');
      }
      if (commandName === 'role') {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'create') return createVerificationRole(interaction);
        if (subcommand === 'all') return assignUnverifiedToAll(interaction);
      }
      if (commandName === 'ticket-queue') {
        if (!isStaff(interaction)) return respond(interaction, 'This staff queue is only available to ticket staff.');
        const tickets = interaction.guild.channels.cache.filter(isTicket)
          .filter((channel) => topicValue(channel.topic, 'status') !== 'closed')
          .map((channel) => {
            const created = Number(topicValue(channel.topic, 'created')) || channel.createdTimestamp;
            return { id: channel.id, owner: topicValue(channel.topic, 'owner'), category: TICKET_CATEGORIES[topicValue(channel.topic, 'category')]?.label || 'Support', age: `${Math.floor((Date.now() - created) / 60000)}m` };
          });
        const payload = queueCard(tickets);
        payload.flags |= MessageFlags.Ephemeral;
        return respond(interaction, payload);
      }
      if (commandName === 'suggest') {
        const suggestion = interaction.options.getString('suggestion', true).trim();
        if (!suggestion) return respond(interaction, 'Please enter a suggestion.');
        return submitSuggestion(interaction, suggestion);
      }
      if (commandName === 'suggestion-status') {
        if (!isStaff(interaction)) return respond(interaction, 'Only staff can change suggestion status.');
        const id = interaction.options.getString('id', true);
        const data = store.load().suggestions[id];
        if (!data || data.guildId !== interaction.guildId) return respond(interaction, 'Suggestion ID not found.');
        data.status = interaction.options.getString('status', true);
        data.reviewedBy = interaction.user.id;
        data.reviewedAt = Date.now();
        store.save();
        await refreshSuggestion(data);
        await logTo(interaction.guild, 'suggestions', `Suggestion ${id} marked **${data.status}** by <@${interaction.user.id}>.`);
        return respond(interaction, `Suggestion ${id} is now **${data.status}**.`);
      }
      if (commandName === 'suggestion-edit') {
        const id = interaction.options.getString('id', true);
        const data = store.load().suggestions[id];
        if (!data || data.guildId !== interaction.guildId || data.submitterId !== interaction.user.id) return respond(interaction, 'That suggestion was not found under your account.');
        if (data.status !== 'Pending') return respond(interaction, 'Only pending suggestions can be edited.');
        data.suggestion = interaction.options.getString('text', true).trim();
        store.save();
        await refreshSuggestion(data);
        await logTo(interaction.guild, 'suggestions', `Suggestion ${id} edited by <@${interaction.user.id}>.`);
        return respond(interaction, `Suggestion ${id} updated.`);
      }
      if (commandName === 'suggestion-withdraw') {
        const id = interaction.options.getString('id', true);
        const data = store.load().suggestions[id];
        if (!data || data.guildId !== interaction.guildId || data.submitterId !== interaction.user.id) return respond(interaction, 'That suggestion was not found under your account.');
        if (data.status !== 'Pending') return respond(interaction, 'Only pending suggestions can be withdrawn.');
        data.status = 'Withdrawn';
        store.save();
        await refreshSuggestion(data);
        await logTo(interaction.guild, 'suggestions', `Suggestion ${id} withdrawn by <@${interaction.user.id}>.`);
        return respond(interaction, `Suggestion ${id} withdrawn.`);
      }
      if (commandName === 'invites') {
        const member = interaction.options.getUser('member') || interaction.user;
        const count = store.getGuild(interaction.guildId).invites[member.id] || 0;
        return respond(interaction, `**${member.tag}** has **${count}** tracked invite${count === 1 ? '' : 's'}.`);
      }
      if (commandName === 'point-rewards') {
        const rows = Object.values(STAFF_PERKS).map((perk) => `**${perk.label}** — **${perk.cost} points**`).join('\n');
        const payload = staffPointsCard({ title: '🎁 Staff point rewards', rows });
        payload.flags |= MessageFlags.Ephemeral;
        return respond(interaction, payload);
      }
      if (commandName === 'say') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return respond(interaction, 'You need Manage Messages to post announcements.');
        const content = interaction.options.getString('message', true).trim();
        if (!content) return respond(interaction, 'Enter announcement text before posting.');
        const style = interaction.options.getString('style', true);
        if (style === 'embed') {
          const embed = new EmbedBuilder().setColor(0xE67E22).setTitle('📢 Announcement').setDescription(content)
            .setFooter({ text: `Posted by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();
          await interaction.channel.send({ embeds: [embed] });
        } else {
          await interaction.channel.send(announcementCard(content, interaction.user));
        }
        return respond(interaction, 'Announcement posted.');
      }
      if (commandName === 'poll') {
        const question = interaction.options.getString('question', true).trim();
        const options = [1, 2, 3, 4, 5].map((number) => interaction.options.getString(`option_${number}`)?.trim()).filter(Boolean);
        if (!question || options.length < 2) return respond(interaction, 'A poll needs a question and at least two non-empty choices.');
        if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) return respond(interaction, 'Poll choices must be unique.');
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const poll = { id, question, options, votes: {}, guildId: interaction.guildId, channelId: interaction.channelId, creatorId: interaction.user.id, createdAt: Date.now() };
        const message = await interaction.channel.send(pollCard(poll));
        poll.messageId = message.id;
        store.getGuild(interaction.guildId).polls[interaction.guildId][id] = poll;
        store.save();
        return respond(interaction, 'Poll posted. Members can change or remove their vote using its buttons.');
      }
      if (commandName === 'claimpoint') {
        const db = store.getGuild(interaction.guildId);
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!memberHasStaffPointsRole(member, db, interaction.guildId)) return respond(interaction, 'Staff point rewards are available to members with the configured staff points role.');
        const key = interaction.options.getString('reward', true);
        const reward = STAFF_PERKS[key];
        const balance = db.staffPoints[interaction.guildId][member.id] || 0;
        if (balance < reward.cost) return respond(interaction, `**${reward.label}** costs **${reward.cost}** points. Your balance is **${balance}**.`);
        const details = `**Reward:** ${reward.label}\n**Points to hold:** ${reward.cost}\n**Claimant:** <@${member.id}>\n**Claim status:** Pending staff fulfillment`;
        return createTicket(interaction, 'point_reward', details, { key, label: reward.label, cost: reward.cost });
      }
      if (commandName === 'afk') {
        const reason = interaction.options.getString('reason')?.trim() || 'AFK';
        afkStatuses.set(`${interaction.guildId}:${interaction.user.id}`, reason);
        return respond(interaction, `AFK status set: ${reason}`);
      }
      if (commandName === 'help') return respond(interaction, '**Member:** `/afk`, `/vouch`, `/suggest`, `/invites`\n**Moderation:** `/warn`, `/warns`, `/unwarn`, `/mute`, `/unmute`, `/timeout`, `/untimeout`, `/clear`, `/purge`, `/ban`, `/kick`\n**Admin:** `/automod`, `/vouch-channel`, `/suggestion-channel`, `/logchannels`');
      if (commandName === 'pb') return respond(interaction, `Pong! ${client.ws.ping} ms gateway latency.`);
      if (commandName === 'automod') {
        const enabled = interaction.options.getBoolean('enabled', true);
        store.getGuild(interaction.guildId).autoMod[interaction.guildId] = enabled;
        store.save();
        return respond(interaction, `Automod ${enabled ? 'enabled' : 'disabled'}: invite links and configured profanity are ${enabled ? 'filtered' : 'not filtered'}.`);
      }
      if (['promotion', 'infraction', 'staff-points-award', 'staff-points-deduct', 'staff-points-set', 'staff-points-view', 'staff-points-leaderboard', 'staff-points-history', 'staff-points-reset', 'staff-points-reverse', 'staff-points-config', 'staff-points-monthly', 'staff'].includes(commandName)) {
        return handleStaffSystem(interaction);
      }
      if (['ban', 'unban', 'kick', 'timeout', 'untimeout', 'mute', 'unmute', 'warn', 'warnings', 'warns', 'unwarn', 'clearwarnings', 'purge', 'clear', 'slowmode', 'lock', 'unlock', 'nickname', 'nickname-reset'].includes(commandName)) {
        return handleModerationCommand(interaction);
      }
    }

    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('staffboard:role:')) {
      const [, , ownerId, setupId, indexText] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId && !isStaff(interaction)) return respond(interaction, 'Only the person setting up this board or a staff manager can attach its roles.');
      const db = store.getGuild(interaction.guildId);
      const board = db.staffBoards[interaction.guildId];
      const index = Number(indexText);
      if (!board?.ranks?.[index] || board.setupId !== setupId) return respond(interaction, 'This setup has expired. Run `/staff board set` again.');
      const roleId = interaction.values[0];
      if (board.ranks.some((rank, rankIndex) => rankIndex !== index && rank.roleId === roleId)) return respond(interaction, 'That role is already attached to another rank. Choose a different role.');
      board.ranks[index].roleId = roleId;
      store.save();
      const next = index + 1;
      if (next < board.ranks.length) return interaction.update(staffBoardSetupCard({ rankName: board.ranks[next].name, index: next, total: board.ranks.length, ownerId, setupId }));
      await interaction.update(statusCard(`Staff rank board configured with **${board.ranks.length}** ranks. Use /staff board show to post it.`));
      await logTo(interaction.guild, 'staff', `Staff rank board configured by <@${interaction.user.id}> with ${board.ranks.length} ranks.`);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket:select') {
      const categoryKey = interaction.values[0];
      if (categoryKey === 'claim_reward') return interaction.showModal(claimModal());
      return createTicket(interaction, categoryKey);
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket:move') {
      const channel = interaction.channel;
      if (!isTicket(channel)) return respond(interaction, 'This channel is not an AG Rewards ticket.');
      if (!isStaff(interaction)) return respond(interaction, 'Only ticket staff can move a ticket.');
      if (topicValue(channel.topic, 'status') === 'closed') return respond(interaction, 'Reopen this ticket before moving it.');
      const nextCategory = interaction.values[0];
      if (!TICKET_CATEGORIES[nextCategory]) return respond(interaction, 'That ticket category is not available.');
      if (nextCategory === topicValue(channel.topic, 'category')) return respond(interaction, 'This ticket is already in that category.');
      const ownerId = topicValue(channel.topic, 'owner');
      const claimedBy = topicValue(channel.topic, 'claimed');
      await channel.setTopic(setTopicValue(channel.topic, 'category', nextCategory));
      const prefix = process.env.TICKET_PREFIX || 'ticket';
      const safeOwner = (channel.name.split('-').slice(2).join('-') || 'member');
      await channel.setName(`${prefix}-${nextCategory}-${safeOwner}`.slice(0, 90));
      const db = store.getGuild(channel.guildId);
      db.ticketMetrics[channel.id] ??= {};
      db.ticketMetrics[channel.id].category = nextCategory;
      store.save();
      await interaction.message.edit({ components: ticketWelcome(nextCategory, ownerId, claimedBy).components });
      await logTo(channel.guild, 'tickets', `<@${interaction.user.id}> moved <#${channel.id}> to **${TICKET_CATEGORIES[nextCategory].label}**.`);
      return respond(interaction, `Ticket moved to **${TICKET_CATEGORIES[nextCategory].label}**.`);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'ticket:claim-form') {
      const details = `**Invite milestone / count:** ${interaction.fields.getTextInputValue('invite_count')}\n**Proof / invite details:** ${interaction.fields.getTextInputValue('proof')}\n**Reward requested:** ${interaction.fields.getTextInputValue('reward')}`;
      return createTicket(interaction, 'claim_reward', details);
    }
    if (interaction.isButton() && interaction.customId === 'verify:complete') return handleVerificationButton(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('poll:')) return handlePollVote(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('ticket:')) {
      return handleTicketButton(interaction, interaction.customId.slice('ticket:'.length));
    }
    if (interaction.isButton() && interaction.customId.startsWith('suggest:')) return handleSuggestionButton(interaction);
  } catch (error) {
    console.error('Interaction failed:', error);
    if (interaction.isRepliable()) {
      try { await respond(interaction, 'Something went wrong. Check the bot console for details.'); }
      catch (replyError) { console.error('Could not report interaction failure:', replyError); }
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const statusKey = `${message.guildId}:${message.author.id}`;
  if (afkStatuses.has(statusKey)) {
    afkStatuses.delete(statusKey);
    await message.reply(v2Reply('Welcome back! I cleared your AFK status.')).catch(() => {});
  }
  for (const mentioned of message.mentions.users.values()) {
    const reason = afkStatuses.get(`${message.guildId}:${mentioned.id}`);
    if (reason) await message.reply(v2Reply(`<@${mentioned.id}> is AFK: ${reason}`)).catch(() => {});
  }
  if (store.getGuild(message.guildId).autoMod[message.guildId] && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    const normalized = message.content.toLowerCase().normalize('NFKD').replace(/[^a-z0-9.:/]/g, '');
    const hasInvite = /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/|discord\.me\/)[a-z0-9-]+/i.test(normalized);
    const hasProfanity = PROFANITY.test(message.content.toLowerCase().normalize('NFKD').replace(/[^a-z]+/g, ' '));
    if (hasInvite || hasProfanity) {
      await message.delete().catch(() => {});
      await message.channel.send(v2Reply(`<@${message.author.id}>, your message was removed by automod (${hasInvite ? 'invite link' : 'profanity'}).`)).then((notice) => setTimeout(() => notice.delete().catch(() => {}), 7000)).catch(() => {});
      await logTo(message.guild, 'staff', `Automod removed a ${hasInvite ? 'invite link' : 'profanity'} message from <@${message.author.id}> in <#${message.channelId}>.`);
      return;
    }
  }
  if (message.content.trim().toLowerCase() === '!ticket') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply(v2Reply('You need **Manage Server** permission to post the ticket panel.'));
    }
    try { await message.channel.send(ticketPanel()); }
    catch (error) { console.error('Could not post ticket panel:', error); }
    return;
  }
  const channel = message.channel;
  if (isTicket(channel) && topicValue(channel.topic, 'status') === 'open' && isStaff(message.member)) {
    const db = store.getGuild(message.guildId);
    const metric = db.ticketMetrics[channel.id] ??= { owner: topicValue(channel.topic, 'owner'), createdAt: Number(topicValue(channel.topic, 'created')) || Date.now() };
    if (!metric.firstStaffReplyAt) {
      metric.firstStaffReplyAt = Date.now();
      store.save();
      const minutes = Math.max(0, Math.round((metric.firstStaffReplyAt - metric.createdAt) / 60000));
      await logTo(message.guild, 'tickets', `First staff response in <#${channel.id}> by <@${message.author.id}> after ${minutes} minutes.`);
    }
  }
});

client.on(Events.MessageDelete, async (message) => {
  if (message.guild && !message.author?.bot) await logTo(message.guild, 'messages', `Message deleted in <#${message.channelId}> by ${message.author ? `<@${message.author.id}>` : 'unknown user'}: ${(message.content || '[no text]').slice(0, 1500)}`);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (newMessage.guild && !newMessage.author?.bot && oldMessage.content !== newMessage.content) {
    await logTo(newMessage.guild, 'messages', `Message edited in <#${newMessage.channelId}> by <@${newMessage.author.id}>.\nBefore: ${(oldMessage.content || '[empty]').slice(0, 1000)}\nAfter: ${(newMessage.content || '[empty]').slice(0, 1000)}`);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  seedNewStaffPoints(member);
  const configuredUnverified = store.getGuild(member.guild.id).verificationRoles.unverified;
  const unverifiedRole = configuredUnverified && member.guild.roles.cache.get(configuredUnverified);
  if (unverifiedRole) {
    try { await member.roles.add(unverifiedRole, 'Assign Unverified role to new AG Rewards member'); }
    catch (error) { console.error(`Could not assign Unverified to ${member.user.tag}:`, error.message); }
  }
  let inviteInfo = '';
  try {
    const currentInvites = await member.guild.invites.fetch();
    const previous = inviteCache.get(member.guild.id) || new Map();
    const used = currentInvites.find((invite) => invite.uses > (previous.get(invite.code) || 0));
    inviteCache.set(member.guild.id, new Map(currentInvites.map((invite) => [invite.code, invite.uses || 0])));
    if (used?.inviter) {
      const invites = store.getGuild(member.guild.id).invites;
      invites[used.inviter.id] = (invites[used.inviter.id] || 0) + 1;
      store.save();
      inviteInfo = `Invited by <@${used.inviter.id}> (invite count: ${invites[used.inviter.id]})`;
    }
  } catch (error) {
    console.error(`Could not track invites for ${member.guild.name}:`, error.message);
  }
  const welcomeId = store.getGuild(member.guild.id).welcomeChannels[member.guild.id];
  const welcomeChannel = welcomeId && await member.guild.channels.fetch(welcomeId).catch(() => null);
  if (welcomeChannel?.isTextBased()) await welcomeChannel.send(welcomeCard(member, inviteInfo));
  await logTo(member.guild, 'members', `Member joined: <@${member.id}> (${member.user.tag})${inviteInfo ? ` • ${inviteInfo}` : ''}`);
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  const roleId = store.getGuild(newMember.guild.id).staffPointsRole[newMember.guild.id] || SUPPORT_ROLE_ID;
  if (roleId && !oldMember.roles.cache.has(roleId) && newMember.roles.cache.has(roleId)) seedNewStaffPoints(newMember);
});

client.on(Events.GuildMemberRemove, async (member) => {
  await logTo(member.guild, 'members', `Member left: <@${member.id}> (${member.user.tag})`);
});

client.on(Events.GuildBanAdd, async (ban) => {
  await logTo(ban.guild, 'staff', `Member banned: <@${ban.user.id}> (${ban.user.tag})${ban.reason ? ` • ${ban.reason}` : ''}`);
});

client.on(Events.InviteCreate, async (invite) => {
  if (!invite.guild) return;
  const guildInvites = inviteCache.get(invite.guild.id) || new Map();
  guildInvites.set(invite.code, invite.uses || 0);
  inviteCache.set(invite.guild.id, guildInvites);
});

client.on(Events.InviteDelete, async (invite) => {
  if (invite.guild) inviteCache.get(invite.guild.id)?.delete(invite.code);
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`AG Rewards bot is online as ${readyClient.user.tag}`);
  readyClient.user.setPresence({ activities: [{ name: 'Managing AG Rewards', type: ActivityType.Watching }], status: 'online' });
  for (const guild of readyClient.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      inviteCache.set(guild.id, new Map(invites.map((invite) => [invite.code, invite.uses || 0])));
    } catch (error) {
      console.error(`Invite tracking unavailable for ${guild.name}: ${error.message}`);
    }
  }
});

client.login(DISCORD_TOKEN);
