'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const bridge = {
  scoreboard: (date) => ipcRenderer.invoke('nba:scoreboard', { date: date || null }),
  game: (gameId) => ipcRenderer.invoke('nba:game', { gameId }),
  player: (playerId, seasonYear) =>
    ipcRenderer.invoke('nba:player', { playerId, seasonYear }),
  playerGames: (playerId, seasonYear) =>
    ipcRenderer.invoke('nba:player-games', { playerId, seasonYear }),
  teamStats: (seasonYear) => ipcRenderer.invoke('nba:team-stats', { seasonYear }),
  playerStats: (seasonYear) => ipcRenderer.invoke('nba:player-stats', { seasonYear }),
  standings: (seasonYear) => ipcRenderer.invoke('nba:standings', { seasonYear }),
  dailyLeaders: (date) => ipcRenderer.invoke('nba:daily-leaders', { date }),
  records: () => ipcRenderer.invoke('nba:records'),
  refreshRecords: () => ipcRenderer.invoke('nba:refresh-records'),
  onRecordsUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('nba:records-updated', listener);
    return () => ipcRenderer.removeListener('nba:records-updated', listener);
  },
  onRecordsSyncError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('nba:records-sync-error', listener);
    return () => ipcRenderer.removeListener('nba:records-sync-error', listener);
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback) => {
      const listener = (_event, isMaximized) => callback(Boolean(isMaximized));
      ipcRenderer.on('window:maximized-change', listener);
      return () => ipcRenderer.removeListener('window:maximized-change', listener);
    },
  },
};

contextBridge.exposeInMainWorld('fullcourt', bridge);
