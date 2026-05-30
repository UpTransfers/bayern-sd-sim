import { fetchJson } from "../fetch-json";

const BASE = "https://api.openligadb.de";

function normalizeTeamName(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const team = value as Record<string, unknown>;
    return (
      (team.TeamName as string | undefined) ??
      (team.Name as string | undefined) ??
      (team.ShortName as string | undefined) ??
      ""
    );
  }
  return "";
}

function asRecord(value: unknown) {
  return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
}

export async function fetchOpenLigaTable(seasonStartYear: number) {
  const url = `${BASE}/getbltable/bl1/${seasonStartYear}`;
  const response = await fetchJson<unknown[]>(url, { timeoutMs: 12_000 });
  if (!response.ok) {
    throw new Error(`OpenLigaDB table request failed with status ${response.status}`);
  }

  const rows = Array.isArray(response.data) ? response.data : [];
  const normalized = rows.map((row, index) => {
    const item = asRecord(row);
    return {
      position: Number(item.OrderId ?? item.TablePosition ?? index + 1),
      clubName: normalizeTeamName(item.Team ?? item.TeamName ?? item.TeamInfo),
      played: Number(item.Matches ?? item.MatchCount ?? 0),
      won: Number(item.Won ?? item.WonMatches ?? 0),
      drawn: Number(item.Draw ?? item.Drawn ?? 0),
      lost: Number(item.Lost ?? item.LostMatches ?? 0),
      goalsFor: Number(item.Goals ?? item.GoalsFor ?? 0),
      goalsAgainst: Number(item.OppGoals ?? item.GoalsAgainst ?? 0),
      goalDifference: Number(item.GoalDiff ?? item.GoalDifference ?? 0),
      points: Number(item.Points ?? 0),
      raw: row,
    };
  });

  return { url, raw: response.data, table: normalized };
}

export async function fetchOpenLigaMatches(seasonStartYear: number) {
  const url = `${BASE}/getmatchdata/bl1/${seasonStartYear}`;
  const response = await fetchJson<unknown[]>(url, { timeoutMs: 18_000 });
  if (!response.ok) {
    throw new Error(`OpenLigaDB match request failed with status ${response.status}`);
  }

  const matches = Array.isArray(response.data) ? response.data : [];
  const normalized = matches.map((match, index) => {
    const item = asRecord(match);
    const team1 = asRecord(item.Team1);
    const team2 = asRecord(item.Team2);
    const result = Array.isArray(item.MatchResults) ? item.MatchResults : [];
    const finalResult = [...result]
      .reverse()
      .find((entry) => {
        const res = asRecord(entry);
        return Number(res.ResultTypeID ?? res.ResultType ?? 0) === 2 || Number(res.ResultName ?? 0) === 2;
      }) as Record<string, unknown> | undefined;

    return {
      externalId: String(item.MatchID ?? item.Id ?? index),
      competition: "Bundesliga",
      season: `${seasonStartYear}/${String(seasonStartYear + 1).slice(-2)}`,
      matchday: Number(asRecord(item.Group).GroupOrderID ?? item.GroupOrderID ?? item.Matchday ?? 0) || null,
      utcDate: String(item.MatchDateTimeUTC ?? item.MatchDate ?? item.MatchDateTime ?? "") || null,
      homeTeam: String(team1.TeamName ?? asRecord(team1.Team).TeamName ?? team1.TeamShortName ?? ""),
      awayTeam: String(team2.TeamName ?? asRecord(team2.Team).TeamName ?? team2.TeamShortName ?? ""),
      homeScore:
        finalResult && typeof finalResult.GoalsTeam1 === "number"
          ? Number(finalResult.GoalsTeam1)
          : null,
      awayScore:
        finalResult && typeof finalResult.GoalsTeam2 === "number"
          ? Number(finalResult.GoalsTeam2)
          : null,
      status: String(item.MatchIsFinished ? "FINISHED" : item.MatchDateTimeUTC ? "SCHEDULED" : "UNKNOWN"),
      raw: match,
    };
  });

  return { url, raw: response.data, matches: normalized };
}

export async function fetchOpenLigaRecentMatchesForBayern(seasonStartYear: number) {
  const all = await fetchOpenLigaMatches(seasonStartYear);
  return all.matches.filter((match) => /bayern/i.test(match.homeTeam) || /bayern/i.test(match.awayTeam)).slice(-8);
}
