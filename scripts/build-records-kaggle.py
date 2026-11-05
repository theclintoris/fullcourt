#!/usr/bin/env python3
"""Build the static FullCourt record book from the historical Kaggle dataset.

The raw archive is a development-time download and is not committed to the app.
It is a Basketball Reference-derived dataset through the 2023-24 season.
"""
from __future__ import annotations

import csv
import heapq
import io
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / ".records-cache" / "nba-all-time.zip"
OUT = ROOT / "src" / "data" / "records.json"

CATEGORIES = [
    ("PTS", "Points", "PTS"),
    ("TRB", "Rebounds", "TRB"),
    ("AST", "Assists", "AST"),
    ("STL", "Steals", "STL"),
    ("BLK", "Blocks", "BLK"),
    ("3P", "Three-pointers", "3P"),
    ("TOV", "Turnovers", "TOV"),
]

TEAM_RECORDS = [
    {"rank": 1, "category": "Wins, season", "value": 73, "holder": "Golden State Warriors", "detail": "2015-16 · 73-9"},
    {"rank": 2, "category": "Winning percentage, season", "value": ".890", "holder": "Golden State Warriors", "detail": "2015-16 · 73-9"},
    {"rank": 3, "category": "Longest winning streak", "value": 33, "holder": "Los Angeles Lakers", "detail": "1971-72"},
    {"rank": 4, "category": "Points, game", "value": 186, "holder": "Detroit Pistons", "detail": "Dec 13, 1983 · 3OT"},
    {"rank": 5, "category": "Largest margin of victory", "value": 73, "holder": "Memphis Grizzlies", "detail": "Dec 2, 2021 · 152-79"},
    {"rank": 6, "category": "Championships", "value": 18, "holder": "Boston Celtics", "detail": "1957-2024"},
]


def number(value: object) -> int:
    text = str(value or "").replace(",", "").strip()
    if not text:
        return 0
    try:
        parsed = float(text)
    except ValueError:
        return 0
    return int(parsed) if parsed.is_integer() else parsed


def season_label(raw: str) -> str:
    raw = str(raw or "").strip()
    match = re.match(r"^(\d{4})-(\d{4})$", raw)
    if match:
        return f"{match.group(1)}-{match.group(2)[2:]}"
    return raw


def game_date(game_ref: str) -> str:
    match = re.match(r"^(\d{4})(\d{2})(\d{2})", game_ref or "")
    if not match:
        return ""
    return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"


class TopList:
    def __init__(self, limit: int = 100):
        self.limit = limit
        self.heap = []
        self.sequence = 0

    def add(self, value, record):
        if value is None or value <= 0:
            return
        self.sequence += 1
        heapq.heappush(self.heap, (float(value), self.sequence, record))
        if len(self.heap) > self.limit:
            heapq.heappop(self.heap)

    def rows(self, value_key="value"):
        ordered = sorted(self.heap, key=lambda item: (-item[0], item[2].get("player", ""), item[1]))
        rows = []
        for rank, (value, _sequence, record) in enumerate(ordered[:25], start=1):
            rows.append({"rank": rank, **record, value_key: int(value) if float(value).is_integer() else value})
        return rows


def parse_season_totals(zf: ZipFile):
    """Return (season_records, regular_career_records)."""
    with zf.open("player_stats/totals_stats.csv") as handle:
        reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8"))
        rows = [row for row in reader if row.get("League") in {"NBA", "BAA"}]

    grouped = defaultdict(list)
    for row in rows:
        ref = (row.get("Player Reference") or "").strip()
        season = (row.get("Season") or "").strip()
        if not ref or not season:
            continue
        grouped[(ref, season)].append(row)

    seasons = []
    career = defaultdict(lambda: {
        "player": "",
        "ref": "",
        "lastSeason": "",
        "PTS": 0, "TRB": 0, "AST": 0, "STL": 0, "BLK": 0, "3P": 0, "TOV": 0,
    })

    for (ref, raw_season), group in grouped.items():
        if any((row.get("Tm") or "").strip() == "TOT" for row in group):
            row = next(row for row in group if (row.get("Tm") or "").strip() == "TOT")
            team = "TOT"
        elif len(group) == 1:
            row = group[0]
            team = (row.get("Tm") or "").strip()
        else:
            row = defaultdict(int)
            row["Player"] = group[0].get("Player") or ""
            row["Player Reference"] = ref
            row["Season"] = raw_season
            for chunk in group:
                for col in ("PTS", "TRB", "AST", "STL", "BLK", "3P", "TOV"):
                    row[col] += number(chunk.get(col))
            team = "TOT"

        player = (row.get("Player") or "").strip()
        values = {cat: number(row.get(col)) for cat, _label, col in CATEGORIES}
        seasons.append({
            "player": player,
            "ref": ref,
            "team": team,
            "season": season_label(raw_season),
            **values,
        })
        entry = career[ref]
        entry["player"] = player or entry["player"]
        entry["ref"] = ref
        if season_label(raw_season) > entry["lastSeason"]:
            entry["lastSeason"] = season_label(raw_season)
            entry["player"] = player or entry["player"]
        for cat, _label, _col in CATEGORIES:
            entry[cat] += values[cat]

    season_records = {}
    for cat, label, _col in CATEGORIES:
        top = TopList()
        for row in seasons:
            top.add(row[cat], {
                "player": row["player"],
                "team": row["team"],
                "season": row["season"],
            })
        season_records[cat] = {"label": label, "singleSeason": top.rows()}

    career_records = {}
    for cat, label, _col in CATEGORIES:
        top = TopList()
        for row in career.values():
            top.add(row[cat], {
                "player": row["player"],
                "team": "",
            })
        career_records[cat] = {"label": label, "career": top.rows()}

    return season_records, career_records


def parse_boxscores(zf: ZipFile):
    """Return playoff game set and aggregate boxscore records."""
    with zf.open("schedule.csv") as handle:
        reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8"))
        playoff_games = {
            (row.get("Game Reference") or "").strip()
            for row in reader
            if (row.get("Playoffs") or "").strip().lower() == "true"
        }

    regular_game_tops = {cat: TopList(200) for cat, _label, _col in CATEGORIES}
    playoff_game_tops = {cat: TopList(200) for cat, _label, _col in CATEGORIES}
    playoff_seasons = defaultdict(lambda: defaultdict(int))
    playoff_names = {}
    playoff_refs = {}
    playoff_season_names = {}

    names = [
        name for name in zf.namelist()
        if name.startswith("boxscores_by_year/")
        and name.endswith("_basic.csv")
        and not name.split("/")[-1].startswith("ABA_")
    ]
    for index, name in enumerate(names, start=1):
        season = re.search(r"^(BAA|NBA)_(.*)_basic\.csv$", Path(name).name)
        raw_season = season.group(2) if season else ""
        season_name = season_label(raw_season)
        with zf.open(name) as handle:
            reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8"))
            for row in reader:
                if (row.get("Period") or "").strip().lower() != "game":
                    continue
                ref = (row.get("Player Reference") or "").strip()
                player = (row.get("Player Name") or "").strip()
                if not player and not ref:
                    continue
                key = ref or player.lower()
                game_ref = (row.get("Game Reference") or "").strip()
                is_playoff = game_ref in playoff_games
                team = (row.get("Team") or "").strip()
                date = game_date(game_ref)
                stats = {
                    "PTS": number(row.get("PTS")),
                    "TRB": number(row.get("TRB")),
                    "AST": number(row.get("AST")),
                    "STL": number(row.get("STL")),
                    "BLK": number(row.get("BLK")),
                    "3P": number(row.get("3P")),
                    "TOV": number(row.get("TOV")),
                }
                if is_playoff:
                    playoff_names[key] = player or playoff_names.get(key, "")
                    playoff_refs[key] = key
                    playoff_season_names[(key, season_name)] = player or player
                    target = playoff_game_tops
                    for cat, _label, _col in CATEGORIES:
                        playoff_seasons[(key, season_name)][cat] += stats[cat]
                else:
                    target = regular_game_tops
                for cat, _label, _col in CATEGORIES:
                    target[cat].add(stats[cat], {
                        "player": player,
                        "team": team,
                        "date": date,
                    })
        if index % 25 == 0:
            print(f"  processed {index}/{len(names)} boxscore files", flush=True)

    regular = {}
    for cat, label, _col in CATEGORIES:
        regular[cat] = {"label": label, "singleGame": regular_game_tops[cat].rows()}

    playoff_games_records = {}
    for cat, label, _col in CATEGORIES:
        playoff_games_records[cat] = {
            "label": label,
            "singleGame": playoff_game_tops[cat].rows(),
        }

    playoff_season_top = {cat: TopList() for cat, _label, _col in CATEGORIES}
    for (key, season_name), stats in playoff_seasons.items():
        player = playoff_season_names.get((key, season_name), playoff_names.get(key, ""))
        for cat, _label, _col in CATEGORIES:
            playoff_season_top[cat].add(stats[cat], {
                "player": player,
                "team": "",
                "season": season_name,
            })

    playoffs = {}
    for cat, label, _col in CATEGORIES:
        playoffs[cat] = {
            "label": label,
            "singleGame": playoff_games_records[cat]["singleGame"],
            "singleSeason": playoff_season_top[cat].rows(),
        }

    playoff_career = {cat: TopList() for cat, _label, _col in CATEGORIES}
    playoff_career_stats = defaultdict(lambda: defaultdict(int))
    for (key, _season_name), stats in playoff_seasons.items():
        for cat, _label, _col in CATEGORIES:
            playoff_career_stats[key][cat] += stats[cat]
    for key, stats in playoff_career_stats.items():
        for cat, _label, _col in CATEGORIES:
            playoff_career[cat].add(stats[cat], {
                "player": playoff_names.get(key, key),
                "team": "",
            })
    for cat, label, _col in CATEGORIES:
        playoffs[cat]["career"] = playoff_career[cat].rows()

    return regular, playoffs


def main():
    if not ARCHIVE.exists():
        raise SystemExit(
            f"Missing {ARCHIVE}. Download the Kaggle nba-all-time-stats archive into .records-cache/nba-all-time.zip first."
        )
    print("Reading Kaggle historical archive…", flush=True)
    with ZipFile(ARCHIVE) as zf:
        season_records, career_records = parse_season_totals(zf)
        regular_games, playoffs = parse_boxscores(zf)

    regular = {}
    for cat, label, _col in CATEGORIES:
        regular[cat] = {
            "label": label,
            "singleGame": regular_games[cat]["singleGame"],
            "singleSeason": season_records[cat]["singleSeason"],
            "career": career_records[cat]["career"],
        }
    for cat, label, _col in CATEGORIES:
        playoffs[cat]["label"] = label

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "snapshot": "2023-24",
        "source": "Basketball Reference historical data via Kaggle",
        "sourceUrl": "https://www.kaggle.com/datasets/gonzalogigena/nba-all-time-stats",
        "note": (
            "Regular-season and playoff records computed from historical player-season totals and "
            "game boxscores through 2023-24. Team records are curated. Values are regular-season "
            "unless the Playoffs tab is selected."
        ),
        "regularSeason": regular,
        "playoffs": playoffs,
        "team": TEAM_RECORDS,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    sys.exit(main())
