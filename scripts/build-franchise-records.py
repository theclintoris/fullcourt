"""Build the completed-season franchise archive from saved history pages and a CSV.

Usage: python scripts/build-franchise-records.py 2026 .tmp/franchise-source

Save Basketball Reference's /teams/<code>/ pages as <code>.html. For TOR,
UTA and WAS the corresponding StatMuse team history page can be saved as
<code>-statmuse.html instead. Include Team Stats Per Game.csv from
https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats.

Game inputs:
- nbaallelo.csv from https://github.com/fivethirtyeight/data/tree/master/nba-elo
- Games.csv from https://www.kaggle.com/datasets/eoinamoore/historical-nba-data-and-player-box-scores
- espn-2025-<id>.json from ESPN's /teams/<id>/schedule?season=2025&seasontype=2
  for each of the 30 teams, to cover gaps in the 2024-25 regular-season CSV.
"""

import csv
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from typing import NamedTuple

# Basketball Reference franchise code, ESPN logo code, ESPN ID, conference, color, first season.
TEAMS = [
    ('ATL', 'atl', 1, 'East', '#e44851', 1950),
    ('BOS', 'bos', 2, 'East', '#32a779', 1947),
    ('NJN', 'bkn', 17, 'East', '#aab3c0', 1968),
    ('CHA', 'cha', 30, 'East', '#2bb8b9', 1989),
    ('CHI', 'chi', 4, 'East', '#e3425a', 1967),
    ('CLE', 'cle', 5, 'East', '#b65b79', 1971),
    ('DAL', 'dal', 6, 'West', '#4a9de5', 1981),
    ('DEN', 'den', 7, 'West', '#f7c34d', 1968),
    ('DET', 'det', 8, 'East', '#e34d6c', 1949),
    ('GSW', 'gs', 9, 'West', '#f7c85a', 1947),
    ('HOU', 'hou', 10, 'West', '#e3425a', 1968),
    ('IND', 'ind', 11, 'East', '#fdbb30', 1968),
    ('LAC', 'lac', 12, 'West', '#668fdb', 1971),
    ('LAL', 'lal', 13, 'West', '#fdb927', 1949),
    ('MEM', 'mem', 29, 'West', '#88a8df', 1996),
    ('MIA', 'mia', 14, 'East', '#e44869', 1989),
    ('MIL', 'mil', 15, 'East', '#53a779', 1969),
    ('MIN', 'min', 16, 'West', '#79bf5d', 1990),
    ('NOH', 'no', 3, 'West', '#c9a970', 2003),
    ('NYK', 'ny', 18, 'East', '#f58426', 1947),
    ('OKC', 'okc', 25, 'West', '#42a9df', 1968),
    ('ORL', 'orl', 19, 'East', '#4f9ce8', 1990),
    ('PHI', 'phi', 20, 'East', '#548fe0', 1950),
    ('PHO', 'phx', 21, 'West', '#f48242', 1969),
    ('POR', 'por', 22, 'West', '#e94856', 1971),
    ('SAC', 'sac', 23, 'West', '#aa83e6', 1949),
    ('SAS', 'sa', 24, 'West', '#aeb9c9', 1968),
    ('TOR', 'tor', 28, 'East', '#e0445e', 1996),
    ('UTA', 'utah', 26, 'West', '#a18cdd', 1975),
    ('WAS', 'wsh', 27, 'East', '#df5670', 1962),
]

STAT_FIELDS = {
    'points': 'pts_per_game',
    'rebounds': 'trb_per_game',
    'assists': 'ast_per_game',
    'steals': 'stl_per_game',
    'blocks': 'blk_per_game',
    'threes': 'x3p_per_game',
}


class HistoryTable(HTMLParser):
    """Read the named table or, for StatMuse, the first table."""

    def __init__(self, html, table_id=None):
        super().__init__()
        self.table_id = table_id
        self.active = False
        self.done = False
        self.rows = []
        self.row = None
        self.cell = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'table' and not self.done:
            self.active = self.table_id is None or attrs.get('id') == self.table_id
        if self.active and tag == 'tr':
            self.row = {}
        if self.row is not None and tag in {'th', 'td'}:
            self.cell = attrs.get('data-stat', len(self.row))
            self.row[self.cell] = ''

    def handle_data(self, data):
        if self.cell is not None:
            self.row[self.cell] += data

    def handle_endtag(self, tag):
        if tag in {'td', 'th'}:
            self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append({key: ' '.join(value.split()) for key, value in self.row.items()})
            self.row = None
        if tag == 'table' and self.active:
            self.active = False
            self.done = True


def normalize_playoffs(value):
    if value in {'Won Finals', 'Won NBA Finals'}:
        return 'Champions'
    if value == 'Lost NBA Finals':
        return 'Lost Finals'
    for short, full in [
        ('E. ', 'East '), ('W. ', 'West '), ('Conf. ', ''),
        ('Div. ', 'Division '), ('1st Rnd.', 'First Round'),
        ('Semis', 'Semifinals'), ('Rnd.-Robin', 'Round Robin'),
        ('Eastern Conference', 'East'), ('Western Conference', 'West'),
    ]:
        value = value.replace(short, full)
    return value


def season_rows(directory, code):
    path = directory / f'{code}.html'
    rows = HistoryTable(path.read_text(encoding='utf-8'), code).rows if path.exists() else []
    if rows:
        return (
            (row['season'], row['lg_id'], row['team_name'].rstrip('*'), row['wins'], row['losses'],
             row['rank_team_playoffs'])
            for row in rows if re.fullmatch(r'\d{4}-\d{2}', row.get('season', ''))
        )
    fallback = directory / f'{code}-statmuse.html'
    header, *rows = HistoryTable(fallback.read_text(encoding='utf-8')).rows
    columns = {name: index for index, name in header.items()}
    keys = [columns[name] for name in ('SEASON', 'NAME', 'W', 'L', 'POSTSEASON')]
    return (
        (row[keys[0]], 'NBA', *(row[key] for key in keys[1:]))
        for row in rows if re.fullmatch(r'\d{4}-\d{2}', row.get(keys[0], ''))
    )


class Game(NamedTuple):
    date: str
    opponent: str
    points: int
    allowed: int
    playoffs: bool
    league: str = 'NBA'

    @property
    def won(self):
        return self.points > self.allowed


def elo_logs(file, team_names):
    logs = defaultdict(list)
    with file.open(encoding='utf-8-sig', newline='') as source:
        for row in csv.DictReader(source):
            year = int(row['year_id'])
            league = row['lg_id']
            date = datetime.strptime(row['date_game'], '%m/%d/%Y').date().isoformat()
            opponent = team_names.get((year, league, row['opp_id']), row['opp_id'])
            logs[year, row['team_id']].append(Game(
                date, opponent, int(row['pts']), int(row['opp_pts']), row['is_playoffs'] == '1',
                'BAA' if year < 1950 else league,
            ))
    return logs


def modern_logs(file, through):
    logs = defaultdict(list)
    with file.open(encoding='utf-8-sig', newline='') as source:
        for row in csv.DictReader(source):
            game_id = row['gameId'].zfill(10)
            kind = game_id[:3]
            year = 2001 + int(game_id[3:5])
            if kind not in {'002', '004'} or not 2016 <= year <= through:
                continue
            if kind == '002' and year == 2025:
                continue
            if not row['homeScore'] or not row['awayScore']:
                continue
            for side, other in [('home', 'away'), ('away', 'home')]:
                team = f"{row[side + 'teamCity']} {row[side + 'teamName']}"
                team = team.replace('LA Clippers', 'Los Angeles Clippers')
                opponent = f"{row[other + 'teamCity']} {row[other + 'teamName']}"
                logs[year, team].append(Game(
                    row['gameDateTimeEst'][:10], opponent, int(row[side + 'Score']),
                    int(row[other + 'Score']), kind == '004',
                ))
    return logs


def espn_2025_log(file, team_id):
    events = json.loads(file.read_text(encoding='utf-8'))['events']
    games = []
    for event in events:
        competition = event['competitions'][0]
        if competition['status']['type']['name'] != 'STATUS_FINAL':
            continue
        if any(note.get('headline') == 'NBA Cup Championship' for note in competition['notes']):
            continue
        competitors = competition['competitors']
        team = next(entry for entry in competitors if entry['id'] == team_id)
        opponent = next(entry for entry in competitors if entry['id'] != team_id)
        # The archived schedule is in UTC. NBA games in this season began before
        # midnight on the US West Coast, which preserves their schedule date.
        date = (datetime.fromisoformat(event['date']) - timedelta(hours=8)).date().isoformat()
        games.append(Game(date, opponent['team']['displayName'], int(team['score']['value']),
                          int(opponent['score']['value']), False))
    return games


def streaks(games):
    longest = {}
    previous = None
    length = 0
    for game in games:
        if game.won != previous:
            length = 0
            start = game.date
        previous = game.won
        length += 1
        if length > longest.get(game.won, {}).get('value', 0):
            longest[game.won] = {'value': length, 'first': start, 'last': game.date}
    return longest


def game_records(games):
    games = sorted(games, key=lambda game: game.date)
    scoring = max(games, key=lambda game: game.points)
    margin = max(games, key=lambda game: game.points - game.allowed)
    runs = streaks(games)
    return {
        'points': {key: value for key, value in scoring._asdict().items() if key != 'playoffs'},
        'margin': {key: value for key, value in margin._asdict().items() if key != 'playoffs'},
        'winStreak': runs[True],
        'lossStreak': runs[False],
    }


def build_archive(through, directory):
    with (directory / 'Team Stats Per Game.csv').open(encoding='utf-8-sig', newline='') as source:
        box_scores = {(int(row['season']), row['lg'], row['team']): row for row in csv.DictReader(source)}
    team_names = {(year, league, row['abbreviation']): name for (year, league, name), row in box_scores.items()}
    early = elo_logs(directory / 'nbaallelo.csv', team_names)
    modern = modern_logs(directory / 'Games.csv', through)

    teams = []
    for code, logo, espn_id, conference, color, first in TEAMS:
        seasons = []
        regular_games = []
        for season, league, name, wins, losses, playoffs in season_rows(directory, code):
            year = int(season[:4]) + 1
            if year > through:
                continue
            wins, losses = int(wins), int(losses)
            stats = box_scores[year, league, name]
            if int(stats['g']) != wins + losses:
                raise ValueError(f'{name} {season}: record and games played disagree')
            if year <= 2015:
                games = early[year, stats['abbreviation']]
            else:
                games = modern[year, name]
            if year == 2025:
                games = games + espn_2025_log(directory / f'espn-2025-{espn_id}.json', str(espn_id))
            regular = [game for game in games if not game.playoffs]
            regular_wins = sum(game.won for game in regular)
            if (regular_wins, len(regular) - regular_wins) != (wins, losses):
                raise ValueError(
                    f'{name} {season}: game log has {regular_wins}-{len(regular) - regular_wins}, '
                    f'expected {wins}-{losses}'
                )
            regular_games.extend(regular)
            postseason = [game for game in games if game.playoffs]
            playoff_wins = sum(game.won for game in postseason)
            if bool(playoffs) != bool(postseason):
                raise ValueError(f'{name} {season}: playoff outcome and game log disagree')
            seasons.append({
                'season': season, 'league': league, 'team': name, 'wins': wins,
                'losses': losses, 'playoffs': normalize_playoffs(playoffs),
                'playoffWins': playoff_wins, 'playoffLosses': len(postseason) - playoff_wins,
                **{key: float(stats[field]) if stats[field] not in {'', 'NA'} else None
                   for key, field in STAT_FIELDS.items()},
            })
        seasons.sort(key=lambda row: row['season'], reverse=True)
        expected = [year for year in range(through, first - 1, -1)
                    if code != 'CHA' or year not in {2003, 2004}]
        if [int(row['season'][:4]) + 1 for row in seasons] != expected:
            raise ValueError(f'{code}: missing or duplicate seasons')
        teams.append({
            'id': code, 'name': seasons[0]['team'], 'logoCode': logo, 'espnId': str(espn_id),
            'conference': conference, 'color': color, 'gameRecords': game_records(regular_games),
            'seasons': seasons,
        })
    return {'through': f'{through - 1}-{through % 100:02d}', 'teams': teams}


if __name__ == '__main__':
    archive = build_archive(int(sys.argv[1]), Path(sys.argv[2]))
    target = Path(__file__).resolve().parents[1] / 'src' / 'data' / 'franchise-records.json'
    # Keep each season on one line to make archive updates easy to review.
    header = json.dumps({'through': archive['through']})[:-1]
    entries = []
    for team in archive['teams']:
        seasons = team.pop('seasons')
        metadata = json.dumps(team, ensure_ascii=False)[:-1]
        rows = ',\n'.join(f'      {json.dumps(row, ensure_ascii=False)}' for row in seasons)
        entries.append(f'    {metadata}, "seasons": [\n{rows}\n    ]}}')
    target.write_text(f'{header},\n  "teams": [\n' + ',\n'.join(entries) + '\n  ]\n}\n', encoding='utf-8')
