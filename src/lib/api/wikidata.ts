import { fetchJson } from "../fetch-json";

const ENDPOINT = "https://query.wikidata.org/sparql";

async function runQuery(query: string) {
  const response = await fetchJson<Record<string, unknown>>(
    `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`,
    {
      timeoutMs: 20_000,
      headers: {
        Accept: "application/sparql-results+json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Wikidata query failed with status ${response.status}`);
  }

  return response.data;
}

function extractValue(binding: Record<string, unknown> | undefined, key: string) {
  return String((binding?.[key] as Record<string, unknown> | undefined)?.value ?? "");
}

export async function fetchBayernClubFromWikidata() {
  const query = `
    SELECT ?club ?clubLabel ?countryLabel ?venueLabel ?inception ?website WHERE {
      VALUES ?club { wd:Q15789 }
      OPTIONAL { ?club wdt:P17 ?country. }
      OPTIONAL { ?club wdt:P115 ?venue. }
      OPTIONAL { ?club wdt:P571 ?inception. }
      OPTIONAL { ?club wdt:P856 ?website. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de". }
    }
  `;

  const data = await runQuery(query);
  const bindings = ((data.results as Record<string, unknown>)?.bindings as Array<Record<string, unknown>>) ?? [];
  const row = bindings[0];

  return {
    externalId: "Q15789",
    name: extractValue(row, "clubLabel") || "FC Bayern Munich",
    country: extractValue(row, "countryLabel") || "Germany",
    venue: extractValue(row, "venueLabel") || "Allianz Arena",
    founded: extractValue(row, "inception") || null,
    website: extractValue(row, "website") || null,
    raw: data,
  };
}

export async function fetchBayernSquadFromWikidata() {
  const query = `
    SELECT ?player ?playerLabel ?dob ?nationalityLabel ?positionLabel ?shirt ?image WHERE {
      ?player wdt:P54 wd:Q15789.
      OPTIONAL { ?player wdt:P569 ?dob. }
      OPTIONAL { ?player wdt:P27 ?nationality. }
      OPTIONAL { ?player wdt:P413 ?position. }
      OPTIONAL { ?player wdt:P1618 ?shirt. }
      OPTIONAL { ?player wdt:P18 ?image. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de". }
    }
    ORDER BY ?playerLabel
  `;

  const data = await runQuery(query);
  const bindings = ((data.results as Record<string, unknown>)?.bindings as Array<Record<string, unknown>>) ?? [];
  const squad = bindings.map((row) => ({
    externalId: extractValue(row, "player").split("/").pop() || extractValue(row, "playerLabel"),
    name: extractValue(row, "playerLabel"),
    dateOfBirth: extractValue(row, "dob") || null,
    nationality: extractValue(row, "nationalityLabel") || null,
    position: extractValue(row, "positionLabel") || null,
    shirtNumber: extractValue(row, "shirt") || null,
    photoUrl: extractValue(row, "image") || null,
    raw: row,
  }));

  return { squad, raw: data };
}

export async function searchWikidataPlayers(term: string) {
  const query = `
    SELECT ?player ?playerLabel ?dob ?nationalityLabel ?positionLabel ?shirt ?clubLabel ?image WHERE {
      ?player rdfs:label ?label.
      FILTER(LANG(?label) = "en" || LANG(?label) = "de")
      FILTER(CONTAINS(LCASE(?label), LCASE("${term.replace(/"/g, '\\"')}")))
      OPTIONAL { ?player wdt:P569 ?dob. }
      OPTIONAL { ?player wdt:P27 ?nationality. }
      OPTIONAL { ?player wdt:P413 ?position. }
      OPTIONAL { ?player wdt:P1618 ?shirt. }
      OPTIONAL { ?player wdt:P54 ?club. }
      OPTIONAL { ?player wdt:P18 ?image. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de". }
    }
    LIMIT 20
  `;

  const data = await runQuery(query);
  const bindings = ((data.results as Record<string, unknown>)?.bindings as Array<Record<string, unknown>>) ?? [];
  const results = bindings.map((row) => ({
    externalId: extractValue(row, "player").split("/").pop() || extractValue(row, "playerLabel"),
    name: extractValue(row, "playerLabel"),
    dateOfBirth: extractValue(row, "dob") || null,
    nationality: extractValue(row, "nationalityLabel") || null,
    position: extractValue(row, "positionLabel") || null,
    shirtNumber: extractValue(row, "shirt") || null,
    currentClub: extractValue(row, "clubLabel") || null,
    photoUrl: extractValue(row, "image") || null,
    raw: row,
  }));

  return { results, raw: data };
}
