"""Refresh regular-season season/career record lists from Basketball Reference data.

The source workbook is the Kaggle "NBA Stats (1947-present)" dataset, which is
itself derived from Basketball Reference and updated during the season. Pass the
path to `Player Totals.csv` as the first argument. Single-game lists and playoff
lists are preserved because this workbook contains regular-season totals only.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RECORDS_PATH = ROOT / "src" / "data" / "records.json"
DEFAULT_SOURCE = ROOT / ".tmp" / "nba-current" / "Player Totals.csv"

STATS = {
    "PTS": "pts",
    "TRB": "trb",
    "AST": "ast",
    "STL": "stl",
    "BLK": "blk",
    "3P": "x3p",
    "TOV": "tov",
}


def choose_season_rows(frame: pd.DataFrame) -> pd.DataFrame:
    """Use the multi-team summary row when a player changed teams in a season."""
    summary = frame[frame["team"].isin(["2TM", "3TM", "4TM"])].copy()
    summary["team_count"] = summary["team"].str[0].astype(int)
    summary = summary.sort_values("team_count").drop_duplicates(
        ["player_id", "season"], keep="last"
    )
    summary = summary.drop(columns=["team_count"])

    summary_keys = set(zip(summary["player_id"], summary["season"]))
    team_rows = frame[~frame["team"].isin(["2TM", "3TM", "4TM"])].copy()
    team_rows = team_rows[
        ~team_rows.apply(
            lambda row: (row["player_id"], row["season"]) in summary_keys, axis=1
        )
    ]
    return pd.concat([summary, team_rows], ignore_index=True)


def ranked(frame: pd.DataFrame, stat: str, scope: str) -> list[dict]:
    ordered = frame.sort_values(
        [stat, "player"], ascending=[False, True], kind="mergesort"
    ).head(25)
    rows = []
    for index, (_, row) in enumerate(ordered.iterrows(), start=1):
        entry = {
            "rank": index,
            "player": str(row["player"]).strip(),
            "value": int(round(float(row[stat]))),
        }
        if scope == "singleSeason":
            entry["season"] = str(int(row["season"]) - 1) + "-" + str(int(row["season"]))[-2:]
        rows.append(entry)
    return rows


def main() -> None:
    source_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source_path.exists():
        raise SystemExit(f"Missing input workbook: {source_path}")

    existing = json.loads(RECORDS_PATH.read_text(encoding="utf-8"))
    frame = pd.read_csv(source_path)
    frame = frame[frame["lg"].isin(["NBA", "BAA"])].copy()
    frame["season"] = pd.to_numeric(frame["season"], errors="coerce")
    frame = frame.dropna(subset=["season", "player_id", "player"])

    season_rows = choose_season_rows(frame)
    career_rows = season_rows.groupby(
        ["player_id", "player"], as_index=False
    )[list(STATS.values())].sum()

    for category, stat in STATS.items():
        existing["regularSeason"][category]["singleSeason"] = ranked(
            season_rows, stat, "singleSeason"
        )
        existing["regularSeason"][category]["career"] = ranked(
            career_rows, stat, "career"
        )

    latest = int(season_rows["season"].max())
    existing["generatedAt"] = pd.Timestamp.now(tz="UTC").isoformat()
    existing["snapshot"] = f"{latest - 1}-{str(latest)[-2:]}"
    existing["updatedThrough"] = "2026-11-01"
    existing["source"] = "Basketball Reference historical data via Kaggle"
    existing["sourceUrl"] = "https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats"
    existing["note"] = (
        "Regular-season single-season and career lists rebuilt from the current "
        "Kaggle/Basketball Reference dataset through November 1, 2026. Playoff "
        "lists remain the archived snapshot; single-game scoring is refreshed "
        "through March 2026 and is replaced when the live leaderboard sync succeeds."
    )
    existing["scoringUpdated"] = "2026-03-10"

    RECORDS_PATH.write_text(
        json.dumps(existing, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote {RECORDS_PATH} from {source_path} ({len(career_rows)} careers).")
    print("PTS career:", [(row["player"], row["value"]) for row in existing["regularSeason"]["PTS"]["career"][:3]])
    print("PTS season:", [(row["player"], row["season"], row["value"]) for row in existing["regularSeason"]["PTS"]["singleSeason"][:3]])


if __name__ == "__main__":
    main()
