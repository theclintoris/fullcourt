'use strict';

const nba = require('../../electron/nba-service.cjs');
const league = require('../../electron/league-service.cjs');

module.exports = {
  ...nba,
  ...league,
};
