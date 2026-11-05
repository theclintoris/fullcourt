# FullCourt 1.2.1 — New Zealand Tip Times

FullCourt is a desktop NBA command center: live scores, full box scores, player and team stats, standings, record books, and era-adjusted comparisons.

## Highlights in 1.2.1

- **New Zealand tip times** — every upcoming game now shows local New Zealand time with the correct `NZDT`/`NZST` label. Game dates follow the NBA schedule.
- **Clearer upcoming games** — upcoming-game labels now say “Tip-off” instead of assuming the game is tonight.
- **Live daily leaders** — points, rebounds, assists, steals, blocks, threes, free throws, field-goal percentage, fantasy score, and turnovers, built from the day's box scores.
- **Fully sortable stats** — every displayed team and player column can be sorted, with click-again-to-reverse behavior.
- **Fully sortable standings** — seed, team, W/L, PCT, GB, PPG, OPP, DIFF, streak, and last ten. Each conference sorts independently.
- **Live standings refresh** — current-season tables refresh every minute while the app is open.
- **League Pass shortcut** — the game detail screen now has a **Watch on League Pass** button for subscribers.
- **Record Book updates** — the Bam Adebayo 83-point game is correctly ranked second all-time; regular-season season/career records are bundled through November 2026, with a launch-time Basketball Reference sync and cached fallback.
- **More resilient stats loading** — team/player/Era screens fall back to a dated league snapshot when Basketball Reference is rate-limited, with a clear cached-data label.
- **Corrected scoring/date handling** — record dates display correctly outside the US time zone.

## Downloads

| Style | File |
| --- | --- |
| Windows installer | `FullCourt-Setup-1.2.1.exe` |
| Windows portable EXE | `FullCourt-Portable-1.2.1.exe` |
| Windows portable folder ZIP | `FullCourt-1.2.1-win-x64.zip` |

All Windows builds are unsigned; SmartScreen may warn on first launch. The portable EXE needs no installation. The ZIP is the simplest fallback: extract the folder and run `FullCourt.exe`.

## Notes

- Live scores, box scores, standings, and daily leaders come from ESPN's public JSON feeds. Historical tables come from Basketball Reference.
- Watching games requires an NBA League Pass subscription. FullCourt opens the official League Pass site and does not proxy or embed any video.
- Record lists are a dated archive plus a merge of current leaderboards; the UI labels the snapshot date. Playoff lists remain the last 2023-24 archive until a live refresh succeeds.
- Era-adjusted metrics are experimental context, not a projection of who would win.
- FullCourt is an independent project, not affiliated with the NBA, ESPN, Basketball Reference, or Kaggle.
- Android source is included, but this release's built downloads are Windows-only.
