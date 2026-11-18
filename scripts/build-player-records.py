"""Build the offline NBA/BAA player record book.

Run python scripts/build-player-records.py .tmp/player-records-source
with these files in the source directory:

- historical.zip from https://www.kaggle.com/datasets/gonzalogigena/nba-all-time-stats
- Player Totals.csv and Advanced.csv from
  https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats
- PlayerStatistics.csv from
  https://www.kaggle.com/datasets/eoinamoore/historical-nba-data-and-player-box-scores
- espn-<id>.json from https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=<id>
  for each ESPN_GAME below, to complete the 2024-25 game log.
"""

import csv
import io
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile


STATS = {
    'pts': ('Points', 'PTS', 'pts', 'points'),
    'reb': ('Rebounds', 'TRB', 'trb', 'reboundsTotal'),
    'ast': ('Assists', 'AST', 'ast', 'assists'),
    'stl': ('Steals', 'STL', 'stl', 'steals'),
    'blk': ('Blocks', 'BLK', 'blk', 'blocks'),
    'tov': ('Turnovers', 'TOV', 'tov', 'turnovers'),
    'fgm': ('Field goals made', 'FG', 'fg', 'fieldGoalsMade'),
    'fga': ('Field goals attempted', 'FGA', 'fga', 'fieldGoalsAttempted'),
    'tpm': ('Threes made', '3P', 'x3p', 'threePointersMade'),
    'tpa': ('Threes attempted', '3PA', 'x3pa', 'threePointersAttempted'),
    'ftm': ('Free throws made', 'FT', 'ft', 'freeThrowsMade'),
    'fta': ('Free throws attempted', 'FTA', 'fta', 'freeThrowsAttempted'),
    'oreb': ('Offensive rebounds', 'ORB', 'orb', 'reboundsOffensive'),
    'dreb': ('Defensive rebounds', 'DRB', 'drb', 'reboundsDefensive'),
    'pf': ('Personal fouls', 'PF', 'pf', 'foulsPersonal'),
}
RATES = {
    'fgPct': ('Field goal %', 'fgm', 'fga', 10, 100),
    'tpPct': ('Three-point %', 'tpm', 'tpa', 5, 50),
    'ftPct': ('Free throw %', 'ftm', 'fta', 5, 50),
    'efgPct': ('Effective field goal %', 'fgm', 'fga', 10, 100),
    'tsPct': ('True shooting %', 'pts', 'fga', 10, 100),
}
KEYS = [*STATS, *RATES, 'gameScore', 'per', 'bpm']
METRICS = [
    *[{'id': key, 'label': fields[0], 'format': 'count'} for key, fields in STATS.items()],
    *[{'id': key, 'label': fields[0], 'format': 'percent'} for key, fields in RATES.items()],
    {'id': 'gameScore', 'label': 'Game Score', 'format': 'decimal', 'scopes': ['game', 'playoffGame']},
    {'id': 'per', 'label': 'Player efficiency rating (PER)', 'format': 'decimal', 'scopes': ['season']},
    {'id': 'bpm', 'label': 'Box plus/minus (BPM)', 'format': 'decimal', 'scopes': ['season']},
]
ESPN_GAMES = {
    '401748705': '2025-01-28',
    '401754705': '2025-03-17',
    '401748706': '2025-03-16',
    '401705193': '2025-03-19',
    '401705554': '2025-04-01',
    '401754706': '2025-04-06',
}
# Source IDs for genuine name variations that cannot be joined by normalized name.
NBA_ALIASES = {
    '1642380': 'balad01', '1642468': 'brownda04', '202710': 'butleji01',
    '1642383': 'claytwa01', '1641842': 'hollaro01', '1641747': 'holmeda01',
    '1641998': 'jemistr01', '1628995': 'knoxke01', '1630231': 'martike04',
    '1626171': 'portibo01', '1630286': 'scotttr01', '1630214': 'tillmxa01',
    '1629057': 'williro04', '1642905': 'yangha01',
}
SUMMARY_TEAMS = re.compile(r'^(TOT|\d+TM)$')
HISTORICAL_END = 2024
REGULAR_END = {
    2020: '2020-08-14', 2021: '2021-05-16', 2022: '2022-04-10',
    2023: '2023-04-09', 2024: '2024-04-14',
}
SHARDS = 16
ROOT = Path(__file__).resolve().parents[1]


def number(value):
    if value in (None, '', 'NA', '--', '-', 'DNP', 'DND', 'NWT', 'Did Not Play'):
        return None
    value = float(value)
    return int(value) if value.is_integer() else value


def fold(value):
    letters = unicodedata.normalize('NFKD', value.casefold().translate(str.maketrans('đłø', 'dlo')))
    return ''.join(char for char in letters if char.isascii() and char.isalnum())


def lookup_name(name):
    return fold(re.sub(r'\s+(?:Jr\.?|Sr\.?|II|III|IV)$', '', name, flags=re.IGNORECASE))


def csv_rows(file):
    with file.open(encoding='utf-8-sig', newline='') as source:
        yield from csv.DictReader(source)


def season_label(year):
    return f'{year - 1}-{year % 100:02d}'


def extract_counts(row, source):
    return {key: number(row.get(fields[source])) for key, fields in STATS.items()}


def shooting(stats, key):
    _, made, attempted, _, _ = RATES[key]
    numerator, denominator = stats.get(made), stats.get(attempted)
    if key == 'efgPct':
        # Before the three-point line, every made field goal was worth two.
        threes = stats.get('tpm')
        numerator = None if numerator is None else numerator + 0.5 * (threes or 0)
    elif key == 'tsPct':
        fta = stats.get('fta')
        denominator = None if denominator is None or fta is None else denominator + 0.44 * fta
        denominator = None if denominator is None else denominator * 2
    return numerator, denominator


def game_score(stats):
    terms = {'pts': 1, 'fgm': .4, 'fga': -.7, 'fta': -.4, 'ftm': .4, 'oreb': .7, 'dreb': .3,
             'stl': 1, 'ast': .7, 'blk': .7, 'pf': -.4, 'tov': -1}
    if any(stats.get(key) is None for key in terms):
        return None
    return round(sum(stats[key] * weight for key, weight in terms.items()), 1)


class Totals:
    def __init__(self):
        self.games = 0
        self.teams = set()
        self.sums = defaultdict(int)
        self.covered = defaultdict(int)

    def add(self, counts, team, games=1):
        self.games += games
        self.teams.update(team if isinstance(team, set) else [team])
        for key, count in counts.items():
            if count is not None:
                self.sums[key] += count
                self.covered[key] += games

    def merge(self, other):
        self.games += other.games
        self.teams.update(other.teams)
        for key, value in other.sums.items():
            self.sums[key] += value
            self.covered[key] += other.covered[key]

    def complete_counts(self):
        return {key: self.sums[key] if self.games and self.covered[key] == self.games else None for key in STATS}

    def career(self):
        values = {key: self.sums[key] if self.covered[key] else None for key in STATS}
        partial = {key for key in STATS if 0 < self.covered[key] < self.games}
        for key, (_, made, attempted, _, _) in RATES.items():
            numerator, denominator = shooting(values, key)
            dependencies = {made, attempted, 'fta'} if key == 'tsPct' else {made, attempted}
            if key == 'efgPct' and self.covered['tpm']:
                dependencies.add('tpm')
            values[key] = round(100 * numerator / denominator, 1) if numerator is not None and denominator else None
            if values[key] is not None and dependencies & partial:
                partial.add(key)
        return [self.games, [values.get(key) for key in KEYS], [i for i, key in enumerate(KEYS) if key in partial]]


class Highs:
    def __init__(self):
        self.best = {}

    def consider(self, counts, context, scope, advanced=None):
        values = {key: (value, None) for key, value in counts.items()}
        for key, (_, _, _, short_minimum, season_minimum) in RATES.items():
            numerator, denominator = shooting(counts, key)
            minimum = season_minimum if scope == 'season' else short_minimum
            volume = denominator / 2 if key == 'tsPct' and denominator is not None else denominator
            if numerator is not None and volume is not None and volume >= minimum:
                values[key] = (100 * numerator / denominator, [numerator, denominator])
        if scope in {'game', 'playoffGame'}:
            values['gameScore'] = (game_score(counts), None)
        for key, value in (advanced or {}).items():
            values[key] = (value, None)
        for key, (value, sample) in values.items():
            if value is None:
                continue
            current = self.best.get(key)
            if current is None or value > current[0] or (value == current[0] and context < current[1]):
                self.best[key] = value, context, sample

    def serialize(self):
        contexts = list(dict.fromkeys(context for _, context, _ in self.best.values()))
        locations = {context: index for index, context in enumerate(contexts)}
        values = []
        for key in KEYS:
            record = self.best.get(key)
            if record is None:
                values.append(None)
                continue
            value, context, sample = record
            entry = [round(value, 1), locations[context]]
            if sample and key in {'fgPct', 'tpPct', 'ftPct'}:
                entry.extend(sample)
            values.append(entry)
        return [contexts, values]


class Player:
    def __init__(self, name):
        self.name = name
        self.aliases = set()
        self.seasons = {}
        self.playoffs = defaultdict(Totals)
        self.game = Highs()
        self.playoff_game = Highs()

    def result(self, advanced):
        season_highs, run_highs = Highs(), Highs()
        regular, playoffs = Totals(), Totals()
        for year, line in sorted(self.seasons.items()):
            context = (season_label(year), ', '.join(sorted(line.teams)), line.games)
            season_highs.consider(line.complete_counts(), context, 'season', advanced.get(year))
            regular.merge(line)
        for year, line in sorted(self.playoffs.items()):
            context = (season_label(year), ', '.join(sorted(line.teams)), line.games)
            run_highs.consider(line.complete_counts(), context, 'playoffRun')
            playoffs.merge(line)
        return {
            'game': self.game.serialize(), 'playoffGame': self.playoff_game.serialize(),
            'season': season_highs.serialize(), 'playoffRun': run_highs.serialize(),
            'career': [regular.career(), playoffs.career()],
        }


def read_seasons(directory, completed):
    players, groups, advanced = {}, defaultdict(list), defaultdict(dict)
    for row in csv_rows(directory / 'Player Totals.csv'):
        if row['lg'] in {'NBA', 'BAA'} and row['player_id']:
            ref, year = row['player_id'], int(row['season'])
            players.setdefault(ref, Player(row['player']))
            if year <= completed and int(row['g']) > 0:
                groups[ref, year].append(row)
    for (ref, year), rows in groups.items():
        summary = next((row for row in rows if SUMMARY_TEAMS.fullmatch(row['team'])), None)
        stints = [row for row in rows if not SUMMARY_TEAMS.fullmatch(row['team'])]
        line = Totals()
        for row in [summary] if summary else stints:
            line.add(extract_counts(row, 2), row['team'], int(row['g']))
        if summary and stints:
            line.teams = {row['team'] for row in stints}
        players[ref].seasons[year] = line
    for row in csv_rows(directory / 'Advanced.csv'):
        ref, year = row['player_id'], int(row['season'])
        player = players.get(ref)
        if row['lg'] not in {'NBA', 'BAA'} or player is None or year not in player.seasons:
            continue
        if len(player.seasons[year].teams) > 1 and not SUMMARY_TEAMS.fullmatch(row['team']):
            continue
        if (number(row['mp']) or 0) >= 200:
            advanced[ref][year] = {key: number(row[key]) for key in ('per', 'bpm')}
    return players, advanced


def add_game(player, year, date, team, opponent, stats, playoff):
    if playoff:
        player.playoff_game.consider(stats, (date, team, opponent), 'playoffGame')
        player.playoffs[year].add(stats, team)
    else:
        player.game.consider(stats, (date, team, opponent), 'game')


def historical_games(directory, players):
    with ZipFile(directory / 'historical.zip') as archive:
        with archive.open('schedule.csv') as source:
            schedule = {row['Game Reference']: row for row in csv.DictReader(io.TextIOWrapper(source, encoding='utf8'))
                        if row['League'] in {'NBA', 'BAA'} and row['Game Reference']}
        for name in sorted(archive.namelist()):
            if not re.search(r'/(NBA|BAA)_\d{4}-\d{4}_basic\.csv$', name):
                continue
            year = int(name[-14:-10])
            if year > HISTORICAL_END:
                continue
            seen = set()
            with archive.open(name) as source:
                for row in csv.DictReader(io.TextIOWrapper(source, encoding='utf8')):
                    ref = row['Player Reference']
                    if not ref or row['Period'] != 'game' or not (':' in row['MP'] or row['PTS'].split('.')[0].isdigit()):
                        continue
                    game = schedule.get(row['Game Reference'])
                    team = row['Team']
                    if game is None or team not in {game['Home'], game['Visitor']}:
                        continue
                    # The NBA Cup final is an exhibition and does not count in season totals.
                    playoff = game['Playoffs'] == 'True'
                    date = game['Date'][:10]
                    if not playoff and date > REGULAR_END.get(year, '9999'):
                        continue  # Play-in appearances are outside regular-season and playoff records.
                    if row['Game Reference'] == '202312090LAL':
                        continue
                    key = (row['Game Reference'], ref)
                    if key in seen:
                        continue
                    seen.add(key)
                    stats = extract_counts(row, 1)
                    player = players.setdefault(ref, Player(row['Player Name']))
                    opponent = game['Visitor'] if team == game['Home'] else game['Home']
                    add_game(player, year, date, team, opponent, stats, playoff)


def resolver(players):
    names = defaultdict(set)
    for ref, player in players.items():
        names[lookup_name(player.name)].add(ref)

    def resolve(name, year, nba_id=None, fallback=None):
        ref = NBA_ALIASES.get(nba_id)
        if ref is None:
            ids = names[lookup_name(name)]
            recent = [candidate for candidate in ids if player_active(players[candidate], year)]
            candidates = recent or list(ids)
            ref = candidates[0] if len(candidates) == 1 else fallback
        if ref is None:
            raise ValueError(f'Could not resolve {name} in {year}')
        player = players.setdefault(ref, Player(name))
        if fold(name) != fold(player.name):
            player.aliases.add(name)
        return player

    return resolve


def player_active(player, year):
    return any(season in player.seasons for season in (year, year - 1, year - 2))


def modern_games(directory, players, completed):
    resolve = resolver(players)
    identities = {}
    through = ''
    seen = set()
    for row in csv_rows(directory / 'PlayerStatistics.csv'):
        game_id = row['gameId'].zfill(10)
        kind = game_id[:3]
        year = 2001 + int(game_id[3:5])
        if year <= HISTORICAL_END or year > completed + 1 or kind not in {'002', '004'}:
            continue
        if game_id in {'0022400988', '0022400627'}:
            continue  # The rows in this feed refer to postponed games.
        if not row['numMinutes'] or row['comment'].startswith(('DNP', 'DND', 'NWT', 'Inactive')):
            continue
        playoff = kind == '004'
        if playoff and year > completed:
            continue
        person = row['personId']
        if (game_id, person) in seen:
            continue
        seen.add((game_id, person))
        date = row['gameDateTimeEst'][:10]
        name = f"{row['firstName']} {row['lastName']}".strip()
        if person not in identities:
            identities[person] = resolve(name, year, person, f'nba{person}')
        player = identities[person]
        team, opponent = row['playerteamName'], row['opponentteamName']
        stats = extract_counts(row, 3)
        add_game(player, year, date, team, opponent, stats, playoff)
        if year > completed:
            player.seasons.setdefault(year, Totals()).add(stats, team)
        through = max(through, date)

    for game_id, date in ESPN_GAMES.items():
        with (directory / f'espn-{game_id}.json').open(encoding='utf8') as source:
            box = json.load(source)['boxscore']['players']
        for team, opponent in (box, box[::-1]):
            group = team['statistics'][0]
            for athlete in group['athletes']:
                if not athlete['stats'] or athlete.get('didNotPlay'):
                    continue
                row = dict(zip(group['keys'], athlete['stats']))
                for pair in ('fieldGoalsMade-fieldGoalsAttempted', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted',
                             'freeThrowsMade-freeThrowsAttempted'):
                    made, attempted = pair.split('-')
                    row[made], row[attempted] = row[pair].split('-')
                row['threePointersMade'] = row['threePointFieldGoalsMade']
                row['threePointersAttempted'] = row['threePointFieldGoalsAttempted']
                row['reboundsTotal'] = row['rebounds']
                row['foulsPersonal'] = row['fouls']
                name = athlete['athlete']['displayName']
                player = resolve(name, 2025, fallback=f"espn{athlete['athlete']['id']}")
                add_game(player, 2025, date, team['team']['abbreviation'], opponent['team']['abbreviation'],
                         extract_counts(row, 3), False)
    return through


def write_archive(players, advanced, through, completed):
    data = ROOT / 'src' / 'data'
    directory = data / 'player-records'
    directory.mkdir(exist_ok=True)
    profiles = [dict() for _ in range(SHARDS)]
    index = []
    for ref, player in sorted(players.items(), key=lambda item: (lookup_name(item[1].name), item[0])):
        years = {*player.seasons, *player.playoffs}
        if not years:
            continue
        shard = sum(map(ord, ref)) % SHARDS
        index.append([ref, player.name, min(years), max(years), sorted(player.aliases)])
        profiles[shard][ref] = player.result(advanced.get(ref, {}))
    for shard, records in enumerate(profiles):
        rows = (f'  {json.dumps(ref)}: {json.dumps(profile, ensure_ascii=False, separators=(",", ":"))}'
                for ref, profile in records.items())
        (directory / f'{shard}.json').write_text('{\n' + ',\n'.join(rows) + '\n}\n', encoding='utf8')
    (data / 'player-records-index.json').write_text(json.dumps({
        'through': through, 'completed': season_label(completed), 'metrics': METRICS, 'players': index,
    }, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    print(f'{len(index)} player profiles, game data through {through}')


if __name__ == '__main__':
    source = Path(sys.argv[1])
    completed = int(sys.argv[2]) if len(sys.argv) > 2 else 2026
    players, advanced = read_seasons(source, completed)
    historical_games(source, players)
    through = modern_games(source, players, completed)
    write_archive(players, advanced, through, completed)
