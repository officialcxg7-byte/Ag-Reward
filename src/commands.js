'use strict';

const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post the AG Rewards ticket panel in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion to the server.')
    .addStringOption((option) => option
      .setName('suggestion')
      .setDescription('What would you like to suggest?')
      .setRequired(true)
      .setMaxLength(1500)),
  new SlashCommandBuilder()
    .setName('suggestion-channel')
    .setDescription('Set the channel where suggestions are posted.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The suggestions channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Post a vouch for a member.')
    .addUserOption((option) => option.setName('member').setDescription('Member who gave the vouch').setRequired(true))
    .addStringOption((option) => option.setName('product').setDescription('Product received').setRequired(true).setMaxLength(100))
    .addIntegerOption((option) => option.setName('stars').setDescription('Rating from 1 to 5').setRequired(true).setMinValue(1).setMaxValue(5)),
  new SlashCommandBuilder()
    .setName('vouch-channel')
    .setDescription('Set the channel where vouches are posted.')
    .addChannelOption((option) => option.setName('channel').setDescription('Vouch channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('promotion-channel').setDescription('Set where staff promotion cards are posted.')
    .addChannelOption((option) => option.setName('channel').setDescription('Promotion announcement channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('infraction-channel').setDescription('Set where staff infraction cards are posted.')
    .addChannelOption((option) => option.setName('channel').setDescription('Infraction record channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('promotion').setDescription('Record and announce a staff promotion.')
    .addUserOption((o) => o.setName('member').setDescription('Staff member promoted').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('New staff role').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Promotion details').setRequired(true).setMaxLength(500))
    .addRoleOption((o) => o.setName('previous_role').setDescription('Old staff role to remove'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('infraction').setDescription('Record a staff infraction.')
    .addUserOption((o) => o.setName('member').setDescription('Staff member').setRequired(true))
    .addStringOption((o) => o.setName('level').setDescription('Infraction level').setRequired(true).addChoices(
      { name: 'Verbal warning', value: 'verbal_warning' }, { name: 'Warning', value: 'warning' }, { name: 'Strike', value: 'strike' },
      { name: 'Demotion', value: 'demotion' }, { name: 'Termination', value: 'termination' },
    ))
    .addStringOption((o) => o.setName('reason').setDescription('Documented reason').setRequired(true).setMaxLength(700))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('staff-points-award').setDescription('Award staff points with an audit entry.')
    .addUserOption((o) => o.setName('member').setDescription('Staff member').setRequired(true))
    .addIntegerOption((o) => o.setName('points').setDescription('Points to award').setRequired(true).setMinValue(1).setMaxValue(1000))
    .addStringOption((o) => o.setName('reason').setDescription('Reason (required for audit)').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('staff-points-deduct').setDescription('Deduct staff points with an audit entry.')
    .addUserOption((o) => o.setName('member').setDescription('Staff member').setRequired(true))
    .addIntegerOption((o) => o.setName('points').setDescription('Points to deduct').setRequired(true).setMinValue(1).setMaxValue(1000))
    .addStringOption((o) => o.setName('reason').setDescription('Reason (required for audit)').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('staff-points-set').setDescription('Set a staff member point balance.')
    .addUserOption((o) => o.setName('member').setDescription('Staff member').setRequired(true))
    .addIntegerOption((o) => o.setName('points').setDescription('New balance').setRequired(true).setMinValue(0).setMaxValue(100000))
    .addStringOption((o) => o.setName('reason').setDescription('Reason (required for audit)').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('staff-points-view').setDescription('View a staff member point balance and recent activity.')
    .addUserOption((o) => o.setName('member').setDescription('Staff member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('staff-points-leaderboard').setDescription('Show the staff points leaderboard.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('staff-points-history').setDescription('Review point ledger entries for a staff member.')
    .addUserOption((o) => o.setName('member').setDescription('Staff member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('staff-points-reset').setDescription('Reset one staff member point balance to zero.')
    .addUserOption((o) => o.setName('member').setDescription('Staff member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason (required for audit)').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('staff-points-reverse').setDescription('Reverse a point ledger entry by entry ID.')
    .addStringOption((o) => o.setName('entry_id').setDescription('Ledger entry ID').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason (required for audit)').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('staff-points-config').setDescription('Configure the staff role used for points and rankings.')
    .addRoleOption((o) => o.setName('role').setDescription('Staff role (omit to clear)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('staff-points-monthly').setDescription('Show this month’s staff points activity.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('point-rewards').setDescription('Show available staff point rewards and their costs.'),
  new SlashCommandBuilder().setName('claimpoint').setDescription('Claim a staff reward by opening a staff ticket.')
    .addStringOption((o) => o.setName('reward').setDescription('Reward to claim').setRequired(true).addChoices(
      { name: 'Nickname change — 50 points', value: 'nickname' }, { name: 'Custom role — 200 points', value: 'custom_role' },
      { name: 'Custom color role — 125 points', value: 'color_role' }, { name: 'Voice channel with keycard — 300 points', value: 'vc_keycard' },
      { name: 'Private voice channel — 400 points', value: 'vc_private' }, { name: 'Private text room — 450 points', value: 'text_room' },
      { name: 'Priority ticket pass — 100 points', value: 'priority_ticket' }, { name: 'Extra break pass — 100 points', value: 'break_pass' },
      { name: 'Bonus day off request — 250 points', value: 'day_off' }, { name: 'Staff feature request — 150 points', value: 'feature_request' },
    )),
  new SlashCommandBuilder().setName('say').setDescription('Post a staff announcement as an embed or Components V2 card.')
    .addStringOption((o) => o.setName('style').setDescription('How the announcement should look').setRequired(true).addChoices(
      { name: 'Embed', value: 'embed' }, { name: 'Components V2', value: 'components_v2' },
    ))
    .addStringOption((o) => o.setName('message').setDescription('Announcement text; separate sections with a blank line').setRequired(true).setMaxLength(3500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('poll').setDescription('Create an interactive poll with 2–5 options.')
    .addStringOption((o) => o.setName('question').setDescription('Poll question').setRequired(true).setMaxLength(200))
    .addStringOption((o) => o.setName('option_1').setDescription('First choice').setRequired(true).setMaxLength(70))
    .addStringOption((o) => o.setName('option_2').setDescription('Second choice').setRequired(true).setMaxLength(70))
    .addStringOption((o) => o.setName('option_3').setDescription('Third choice').setMaxLength(70))
    .addStringOption((o) => o.setName('option_4').setDescription('Fourth choice').setMaxLength(70))
    .addStringOption((o) => o.setName('option_5').setDescription('Fifth choice').setMaxLength(70)),
  new SlashCommandBuilder().setName('staff').setDescription('Staff points and reward center.')
    .addSubcommandGroup((group) => group.setName('points').setDescription('Staff point setup')
      .addSubcommand((sub) => sub.setName('base').setDescription('Set the starting points for eligible staff and seed current staff.')
        .addIntegerOption((o) => o.setName('amount').setDescription('Starting balance').setRequired(true).setMinValue(0).setMaxValue(100000)))
      .addSubcommand((sub) => sub.setName('showbase').setDescription('Show the configured starting balance.')))
    .addSubcommandGroup((group) => group.setName('rewards').setDescription('Staff perk catalog and redemptions')
      .addSubcommand((sub) => sub.setName('list').setDescription('Show available perks and point prices.'))
      .addSubcommand((sub) => sub.setName('claim').setDescription('Redeem points for a staff perk.')
        .addStringOption((o) => o.setName('perk').setDescription('Perk to redeem').setRequired(true).addChoices(
          { name: 'Nickname change — 50', value: 'nickname' }, { name: 'Custom role — 200', value: 'custom_role' },
          { name: 'Custom color role — 125', value: 'color_role' }, { name: 'Voice channel with keycard — 300', value: 'vc_keycard' },
          { name: 'Private voice channel — 400', value: 'vc_private' }, { name: 'Private text room — 450', value: 'text_room' },
          { name: 'Priority ticket pass — 100', value: 'priority_ticket' }, { name: 'Extra break pass — 100', value: 'break_pass' },
          { name: 'Bonus day off request — 250', value: 'day_off' }, { name: 'Staff feature request — 150', value: 'feature_request' },
        ))
        .addStringOption((o) => o.setName('value').setDescription('Nickname, role name, or hex color where relevant').setMaxLength(32)))
      .addSubcommand((sub) => sub.setName('approve').setDescription('Approve a pending manual perk request.')
        .addStringOption((o) => o.setName('request_id').setDescription('Request ID').setRequired(true)))
      .addSubcommand((sub) => sub.setName('reject').setDescription('Reject a pending request and refund its points.')
        .addStringOption((o) => o.setName('request_id').setDescription('Request ID').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for rejection').setRequired(true).setMaxLength(300)))
      .addSubcommand((sub) => sub.setName('keycard-role').setDescription('Set the role that unlocks keycard voice rooms.')
        .addRoleOption((o) => o.setName('role').setDescription('Role to use as keycard access').setRequired(true))))
    .addSubcommandGroup((group) => group.setName('board').setDescription('Configure and display staff rank membership')
      .addSubcommand((sub) => sub.setName('set').setDescription('Set rank names, then attach a Discord role to each one.')
        .addStringOption((o) => o.setName('ranks').setDescription('Comma-separated rank names, from lowest to highest').setRequired(true).setMaxLength(500)))
      .addSubcommand((sub) => sub.setName('show').setDescription('Show staff members grouped by their rank roles.')))
    ,
  new SlashCommandBuilder()
    .setName('logchannels')
    .setDescription('Create the AG Rewards staff log channels.')
    .addSubcommand((subcommand) => subcommand
      .setName('create')
      .setDescription('Create five private channels for bot logs.')),
  new SlashCommandBuilder()
    .setName('welcome-channel')
    .setDescription('Choose where member welcome cards are posted.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The welcome channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('ticket-queue')
    .setDescription('Show the staff queue of open tickets.'),
  new SlashCommandBuilder()
    .setName('suggestion-status')
    .setDescription('Set a suggestion status.')
    .addStringOption((option) => option.setName('id').setDescription('Suggestion ID').setRequired(true))
    .addStringOption((option) => option.setName('status').setDescription('Review status').setRequired(true)
      .addChoices(
        { name: 'Considering', value: 'Considering' },
        { name: 'Approved', value: 'Approved' },
        { name: 'Declined', value: 'Declined' },
      )),
  new SlashCommandBuilder()
    .setName('suggestion-edit')
    .setDescription('Edit one of your pending suggestions.')
    .addStringOption((option) => option.setName('id').setDescription('Suggestion ID').setRequired(true))
    .addStringOption((option) => option.setName('text').setDescription('Updated suggestion text').setRequired(true).setMaxLength(1500)),
  new SlashCommandBuilder()
    .setName('suggestion-withdraw')
    .setDescription('Withdraw one of your suggestions.')
    .addStringOption((option) => option.setName('id').setDescription('Suggestion ID').setRequired(true)),
  new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check invite totals tracked by AG Rewards.')
    .addUserOption((option) => option.setName('member').setDescription('Member whose invite total to view')),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server.')
    .addUserOption((option) => option.setName('member').setDescription('Member to ban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the ban').setRequired(true).setMaxLength(500))
    .addIntegerOption((option) => option.setName('delete_days').setDescription('Days of recent messages to delete (0–7)').setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by their Discord ID.')
    .addStringOption((option) => option.setName('user_id').setDescription('User ID to unban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the unban').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server.')
    .addUserOption((option) => option.setName('member').setDescription('Member to kick').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the kick').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member for a number of minutes (up to 28 days).')
    .addUserOption((option) => option.setName('member').setDescription('Member to timeout').setRequired(true))
    .addIntegerOption((option) => option.setName('minutes').setDescription('Timeout duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the timeout').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a member timeout.')
    .addUserOption((option) => option.setName('member').setDescription('Member to untimeout').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for removing the timeout').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member.')
    .addUserOption((option) => option.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the warning').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View a member’s warning history.')
    .addUserOption((option) => option.setName('member').setDescription('Member whose warnings to view').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear a member’s warning history.')
    .addUserOption((option) => option.setName('member').setDescription('Member whose warnings to clear').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for clearing warnings').setRequired(true).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete recent messages in this channel.')
    .addIntegerOption((option) => option.setName('amount').setDescription('Number of messages (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((option) => option.setName('member').setDescription('Only delete this member’s messages'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('clear').setDescription('Delete recent messages in this channel.')
    .addIntegerOption((option) => option.setName('amount').setDescription('Number to delete (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('afk').setDescription('Set your AFK status.')
    .addStringOption((option) => option.setName('reason').setDescription('Why you are AFK').setMaxLength(150)),
  new SlashCommandBuilder().setName('help').setDescription('Show bot commands and moderation features.'),
  new SlashCommandBuilder().setName('pb').setDescription('Show the bot response time.'),
  new SlashCommandBuilder().setName('mute').setDescription('Timeout a member (mute).')
    .addUserOption((option) => option.setName('member').setDescription('Member to mute').setRequired(true))
    .addIntegerOption((option) => option.setName('minutes').setDescription('Duration, up to 28 days').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('unmute').setDescription('Remove a member timeout.')
    .addUserOption((option) => option.setName('member').setDescription('Member to unmute').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('warns').setDescription('View warnings for a member.')
    .addUserOption((option) => option.setName('member').setDescription('Member to check').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('unwarn').setDescription('Remove a warning by case number.')
    .addUserOption((option) => option.setName('member').setDescription('Member whose warning to remove').setRequired(true))
    .addIntegerOption((option) => option.setName('case').setDescription('Warning case number').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('automod').setDescription('Configure automatic filtering of invites and profanity.')
    .addBooleanOption((option) => option.setName('enabled').setDescription('Enable automatic filtering').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set this channel’s slowmode in seconds.')
    .addIntegerOption((option) => option.setName('seconds').setDescription('Seconds between messages (0 disables)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the change').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Prevent @everyone from sending messages in a channel.')
    .addChannelOption((option) => option.setName('channel').setDescription('Channel to lock (defaults to this channel)').addChannelTypes(ChannelType.GuildText))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for locking').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Allow @everyone to send messages in a channel.')
    .addChannelOption((option) => option.setName('channel').setDescription('Channel to unlock (defaults to this channel)').addChannelTypes(ChannelType.GuildText))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for unlocking').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Change a member’s server nickname.')
    .addUserOption((option) => option.setName('member').setDescription('Member to rename').setRequired(true))
    .addStringOption((option) => option.setName('name').setDescription('New nickname').setRequired(true).setMaxLength(32))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the change').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  new SlashCommandBuilder()
    .setName('nickname-reset')
    .setDescription('Clear a member’s server nickname.')
    .addUserOption((option) => option.setName('member').setDescription('Member whose nickname to clear').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the change').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  new SlashCommandBuilder()
    .setName('verify-panel')
    .setDescription('Post the AG Rewards Components V2 verification panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('role')
    .setDescription('Set up verification roles or assign Unverified to existing members.')
    .addSubcommand((subcommand) => subcommand
      .setName('create')
      .setDescription('Create a verification role and apply channel access rules.')
      .addStringOption((option) => option.setName('type').setDescription('Which verification role to create').setRequired(true)
        .addChoices({ name: 'Verified', value: 'verified' }, { name: 'Unverified', value: 'unverified' })))
    .addSubcommand((subcommand) => subcommand
      .setName('all')
      .setDescription('Assign the configured Unverified role to all current non-bot members.')
      .addRoleOption((option) => option.setName('role').setDescription('Must be the configured Unverified role').setRequired(true))
      .addBooleanOption((option) => option.setName('confirm').setDescription('Confirm this will reset every member to Unverified').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map((command) => command.toJSON());

module.exports = commands;
