'use strict';

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const isPlaceholder = (value) => !value || /put_.*_here|your[_ -].*(token|id)|placeholder/i.test(value);
const isDiscordId = (value) => /^\d{17,20}$/.test(value || '');
if (isPlaceholder(DISCORD_TOKEN) || isPlaceholder(CLIENT_ID) || !isDiscordId(CLIENT_ID)) {
  console.error('Configure .env with a real DISCORD_TOKEN and the numeric CLIENT_ID (Application ID) from the Discord Developer Portal.');
  process.exit(1);
}
if (GUILD_ID && (isPlaceholder(GUILD_ID) || !isDiscordId(GUILD_ID))) {
  console.error('GUILD_ID must be a real numeric server ID, or blank to register commands globally.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

rest.put(route, { body: commands })
  .then(() => console.log(`Registered ${commands.length} slash commands${GUILD_ID ? ` in guild ${GUILD_ID}` : ' globally'}.`))
  .catch((error) => { console.error('Failed to register slash commands:', error); process.exitCode = 1; });
