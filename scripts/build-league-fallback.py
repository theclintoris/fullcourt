"""Build an offline current/historical league snapshot from the Kaggle BBR extract.

This is a resilient fallback for when Basketball Reference rate-limits live
requests. It covers the current season plus the Era Lab defaults. The live
service still prefers fresh BBR data whenever it is reachable.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / ".tmp" / "nba-current"
OUT = ROOT / "src" / "data" / "league-fallback.json"
TARGETS = [2027, 1996, 2013]

LOGO_ABBR = {
    "BRK": "bkn",
    "CHO": "cha",
    "PHO": "phx",
    "NOP": "no",
    "NYK": "ny",
    "GSW": "gs",
    "SAS": "sa",
    "UTA": "utah",
    "WAS": "wsh",
}
ESPN_ABBRS = {
    "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
    "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
    "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
    "SEA", "VAN", "NJN", "NOH", "CHA", "CHH", "WSB", "KCK", "BUF", "SDC",
    "SFW", "PHW", "STL", "CIN", "DET", "BAL", "SYR", "FTW", "MNL",
}
ERA = {
    2027: {"pace": 99.6, "ortg": 113.2, "drtg": 113.2, "tsPct": 57.2, "efgPct": 54.2, "ftr": 28.6, "threePtAr": 42.9, "tovPct": 13.9, "orbPct": 27.4},
    2013: {"pace": 92.0, "ortg": 105.9, "drtg": 105.9, "tsPct": 53.5, "efgPct": 50.3, "ftr": 24.3, "threePtAr": 24.3, "tovPct": 13.4, "orbPct": 27.4},
    1996: {"pace": 91.8, "ortg": 107.6, "drtg": 107.6, "tsPct": 54.2, "efgPct": 50.7, "ftr": 32.9, "threePtAr": 20.0, "tovPct": 14.3, "orbPct": 30.0},
}


def clean(value, digits=1):
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return None
    number = float(value)
    return round(number, digits) if digits is not None else number


def pct(value, digits=1):
    number = clean(value, None)
    return None if number is None else round(number * 100, digits)


def value(series, key, digits=1):
    return clean(series.get(key), digits)


def logo_for(abbr: str):
    code = LOGO_ABBR.get(abbr, abbr).lower()
    if code not in ESPN_ABBRS and code not in {v for v in LOGO_ABBR.values()}:
        code = abbr.lower()
    return f"https://a.espncdn.com/i/teamlogos/nba/500/{code}.png"


def team_payload(year: int, summaries: pd.DataFrame, games: pd.DataFrame, opp: pd.DataFrame):
    era = ERA[year]
    teams = []
    game_map = {row["abbreviation"]: row for _, row in games.iterrows()}
    opp_map = {row["abbreviation"]: row for _, row in opp.iterrows()}
    for _, row in summaries.iterrows():
        abbr = str(row["abbreviation"])
        game = game_map.get(abbr)
        opponent = opp_map.get(abbr)
        if game is None or opponent is None:
            continue
        wins, losses = int(row["w"]), int(row["l"])
        ppg = value(game, "pts_per_game")
        opp_ppg = value(opponent, "opp_pts_per_game")
        teams.append({
            "id": abbr,
            "abbreviation": abbr,
            "displayName": str(row["team"]),
            "shortDisplayName": str(row["team"]).split()[-1],
            "logo": logo_for(abbr),
            "wins": wins,
            "losses": losses,
            "winPct": round(wins / max(wins + losses, 1), 3),
            "record": f"{wins}-{losses}",
            "ppg": ppg,
            "oppPpg": opp_ppg,
            "diff": round((ppg or 0) - (opp_ppg or 0), 1),
            "mov": value(row, "mov"),
            "srs": value(row, "srs"),
            "ortg": value(row, "o_rtg"),
            "drtg": value(row, "d_rtg"),
            "netRtg": value(row, "n_rtg"),
            "pace": value(row, "pace"),
            "ftr": pct(row.get("f_tr")),
            "threePtAr": pct(row.get("x3p_ar")),
            "tsPct": pct(row.get("ts_percent")),
            "efgPct": pct(row.get("e_fg_percent")),
            "tovPct": value(row, "tov_percent"),
            "orbPct": value(row, "orb_percent"),
            "oppEfgPct": pct(row.get("opp_e_fg_percent")),
            "stats": {
                "fgm": value(game, "fg_per_game"), "fga": value(game, "fga_per_game"),
                "fgPct": pct(game.get("fg_percent")),
                "tpm": value(game, "x3p_per_game"), "tpa": value(game, "x3pa_per_game"),
                "tpPct": pct(game.get("x3p_percent")),
                "ftm": value(game, "ft_per_game"), "fta": value(game, "fta_per_game"),
                "ftPct": pct(game.get("ft_percent")),
                "reb": value(game, "trb_per_game"), "oreb": value(game, "orb_per_game"),
                "dreb": value(game, "drb_per_game"), "ast": value(game, "ast_per_game"),
                "stl": value(game, "stl_per_game"), "blk": value(game, "blk_per_game"),
                "tov": value(game, "tov_per_game"), "pf": value(game, "pf_per_game"),
                "pts": ppg,
            },
        })
    teams.sort(key=lambda t: (-t["winPct"], -t["ppg"]))
    return {"era": era, "teams": teams}


def pick_player_rows(per_game: pd.DataFrame, advanced: pd.DataFrame, per100: pd.DataFrame):
    """Keep one row per player, preferring the TOT summary row and then games."""
    def choose(frame):
        frame = frame.copy()
        frame["_tot"] = (frame["team"] == "TOT").astype(int)
        frame = frame.sort_values(["_tot", "g"], ascending=[False, False])
        return frame.drop_duplicates("player_id", keep="first").set_index("player_id")

    return choose(per_game), choose(advanced), choose(per100)


def player_payload(year: int, per_game: pd.DataFrame, advanced: pd.DataFrame, per100: pd.DataFrame):
    pg, adv, p100 = pick_player_rows(per_game, advanced, per100)
    players = []
    for player_id, row in pg.iterrows():
        extra = adv.loc[player_id] if player_id in adv.index else pd.Series(dtype=object)
        hundred = p100.loc[player_id] if player_id in p100.index else pd.Series(dtype=object)
        abbr = str(row.get("team") or "")
        if abbr == "TOT":
            # The TOT row does not identify a current team; use the first
            # non-TOT game row for this player if one exists in the source.
            candidates = per_game[(per_game["player_id"] == player_id) & (per_game["team"] != "TOT")]
            abbr = str(candidates.iloc[-1]["team"]) if len(candidates) else abbr
        name = str(row["player"])
        team_logo = logo_for(abbr)
        stats = {
            "fgm": value(row, "fg_per_game"), "fga": value(row, "fga_per_game"),
            "fgPct": pct(row.get("fg_percent")),
            "tpm": value(row, "x3p_per_game"), "tpa": value(row, "x3pa_per_game"),
            "tpPct": pct(row.get("x3p_percent")),
            "ftm": value(row, "ft_per_game"), "fta": value(row, "fta_per_game"),
            "ftPct": pct(row.get("ft_percent")),
            "oreb": value(row, "orb_per_game"), "dreb": value(row, "drb_per_game"),
            "reb": value(row, "trb_per_game"), "ast": value(row, "ast_per_game"),
            "stl": value(row, "stl_per_game"), "blk": value(row, "blk_per_game"),
            "tov": value(row, "tov_per_game"), "pf": value(row, "pf_per_game"),
            "pts": value(row, "pts_per_game"),
            "efgPct": pct(row.get("e_fg_percent")),
            "tsPct": pct(extra.get("ts_percent")) if not extra.empty else None,
        }
        advanced_stats = {
            "per": value(extra, "per"), "tsPct": pct(extra.get("ts_percent")),
            "threePtAr": pct(extra.get("x3p_ar")), "ftr": pct(extra.get("f_tr")),
            "orbPct": value(extra, "orb_percent"), "drbPct": value(extra, "drb_percent"),
            "trbPct": value(extra, "trb_percent"), "astPct": value(extra, "ast_percent"),
            "stlPct": value(extra, "stl_percent"), "blkPct": value(extra, "blk_percent"),
            "tovPct": value(extra, "tov_percent"), "usgPct": value(extra, "usg_percent"),
            "ows": value(extra, "ows"), "dws": value(extra, "dws"), "ws": value(extra, "ws"),
            "ws48": value(extra, "ws_48", 3), "obpm": value(extra, "obpm"), "dbpm": value(extra, "dbpm"),
            "bpm": value(extra, "bpm"), "vorp": value(extra, "vorp"),
        }
        p100_stats = {
            "pts": value(hundred, "pts_per_100_poss"),
            "reb": value(hundred, "trb_per_100_poss"),
            "ast": value(hundred, "ast_per_100_poss"),
            "stl": value(hundred, "stl_per_100_poss"),
            "blk": value(hundred, "blk_per_100_poss"),
            "tpm": value(hundred, "x3p_per_100_poss"),
        }
        players.append({
            "id": str(player_id),
            "name": name,
            "team": abbr,
            "teamLabel": abbr,
            "teamLogo": team_logo,
            "age": int(row["age"]) if pd.notna(row.get("age")) else None,
            "position": str(row.get("pos") or ""),
            "games": int(row["g"]) if pd.notna(row.get("g")) else 0,
            "gamesStarted": int(row["gs"]) if pd.notna(row.get("gs")) else 0,
            "mpg": value(row, "mp_per_game"),
            "stats": stats,
            "advanced": advanced_stats,
            "per100": p100_stats,
            "per100Estimated": False,
        })
    players.sort(key=lambda p: (-(p["stats"].get("pts") or 0), p["name"]))
    return players


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DATA
    if not source.exists():
        raise SystemExit(f"Missing Kaggle directory: {source}")
    summaries = pd.read_csv(source / "Team Summaries.csv")
    team_games = pd.read_csv(source / "Team Stats Per Game.csv")
    opp_games = pd.read_csv(source / "Opponent Stats Per Game.csv")
    per_game = pd.read_csv(source / "Player Per Game.csv")
    advanced = pd.read_csv(source / "Advanced.csv")
    per100 = pd.read_csv(source / "Per 100 Poss.csv")

    out = {
        "generatedAt": pd.Timestamp.now(tz="UTC").isoformat(),
        "source": "Basketball Reference historical data via Kaggle (offline fallback)",
        "sourceUrl": "https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats",
        "latestDataThrough": "2026-11-01",
        "seasons": {},
    }
    for year in TARGETS:
        # The `playoffs` flag in this extract records whether a team made the
        # playoffs, not whether the row is playoff data. Every row is a regular
        # season line, so do not filter on it.
        s = summaries[(summaries["season"] == year) & (summaries["team"] != "League Average")]
        g = team_games[(team_games["season"] == year) & (team_games["team"] != "League Average")]
        o = opp_games[(opp_games["season"] == year) & (opp_games["team"] != "League Average")]
        pg = per_game[(per_game["season"] == year) & per_game["lg"].isin(["NBA", "BAA"])]
        av = advanced[(advanced["season"] == year) & advanced["lg"].isin(["NBA", "BAA"])]
        p1 = per100[(per100["season"] == year) & per100["lg"].isin(["NBA", "BAA"])]
        bundle = team_payload(year, s, g, o)
        players = player_payload(year, pg, av, p1)
        out["seasons"][str(year)] = {
            "seasonYear": year,
            "seasonLabel": f"{year - 1}-{str(year)[-2:]}",
            "era": bundle["era"],
            "teams": bundle["teams"],
            "players": players,
        }
        print(year, "teams", len(bundle["teams"]), "players", len(players))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
