export function currentSeasonYear(date = new Date()) {
  const year = date.getFullYear();
  return date.getMonth() >= 9 ? year + 1 : year;
}

export function seasonLabelFor(seasonYear) {
  const year = Number(seasonYear);
  if (!Number.isFinite(year) || year < 1946) return 'NBA';
  return `${year - 1}-${String(year).slice(-2)}`;
}

export function seasonOptions(earliest = 1950, latest = currentSeasonYear()) {
  const options = [];
  for (let year = latest; year >= earliest; year -= 1) options.push(year);
  return options;
}

export function seasonsBetween(startYear, endYear) {
  const options = [];
  for (let year = endYear; year >= startYear; year -= 1) options.push(year);
  return options;
}
