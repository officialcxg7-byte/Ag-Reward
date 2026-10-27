'use strict';

const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const file = path.join(dataDir, 'store.json');
let state;

function load() {
  if (state) return state;
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    state = {};
    save();
  }
  state.suggestionChannels ??= {};
  state.suggestions ??= {};
  state.logChannels ??= {};
  state.welcomeChannels ??= {};
  state.vouchChannels ??= {};
  state.promotionChannels ??= {};
  state.infractionChannels ??= {};
  state.invites ??= {};
  state.ticketMetrics ??= {};
  state.warnings ??= {};
  state.moderationCases ??= {};
  state.verificationRoles ??= {};
  state.verificationChannels ??= {};
  state.autoMod ??= {};
  state.infractions ??= {};
  state.promotions ??= {};
  state.staffPoints ??= {};
  state.staffPointLedger ??= {};
  state.staffPointsRole ??= {};
  state.staffPointBase ??= {};
  state.staffRewards ??= {};
  state.staffBoards ??= {};
  state.polls ??= {};
  return state;
}

function save() {
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, file);
}

function getGuild(guildId) {
  const db = load();
  db.suggestionChannels[guildId] ??= null;
  db.logChannels[guildId] ??= {};
  db.welcomeChannels[guildId] ??= null;
  db.vouchChannels[guildId] ??= null;
  db.promotionChannels[guildId] ??= null;
  db.infractionChannels[guildId] ??= null;
  db.invites[guildId] ??= {};
  db.ticketMetrics[guildId] ??= {};
  db.warnings[guildId] ??= {};
  db.verificationRoles[guildId] ??= {};
  db.verificationChannels[guildId] ??= null;
  db.autoMod[guildId] ??= true;
  db.infractions[guildId] ??= [];
  db.promotions[guildId] ??= [];
  db.staffPoints[guildId] ??= {};
  db.staffPointLedger[guildId] ??= [];
  db.staffPointsRole[guildId] ??= null;
  db.staffPointBase[guildId] ??= null;
  db.staffRewards[guildId] ??= { keycardRoleId: null, requests: [] };
  db.staffBoards[guildId] ??= null;
  db.polls[guildId] ??= {};
  return db;
}

module.exports = { load, save, getGuild };
