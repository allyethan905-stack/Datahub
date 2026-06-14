export const extractOddsGlobal = (m: any) => {
  const allOdds: Record<string, any> = {};
  const markets = m.eventBetTypes || m.markets || m.odds || [];
  
  if (Array.isArray(markets)) {
    markets.forEach((mk: any) => {
      const mName = mk.name || mk.id || mk.marketName || 'Unknown';
      const items = mk.eventBetTypeItems || mk.outcomes || mk.items || mk.odds || [];
      if (Array.isArray(items)) {
        allOdds[mName] = items.map((o: any) => ({
          name: o.name || o.shortName || o.outcomeName || o.outcome || o.id || o.label,
          odds: (o.odds || o.price || o.value || o.rate || o.odd)?.toString()
        }));
      }
    });
  }

  const findOdds1X2 = () => {
    if (m.odds1 && m.oddsX && m.odds2) return { odds1: m.odds1.toString(), oddsX: m.oddsX.toString(), odds2: m.odds2.toString() };
    
    // Try to find in allOdds first
    const matchResultKey = Object.keys(allOdds).find(k => ['1X2', 'MATCH RESULT', 'RÉSULTAT DU MATCH'].includes(k.toUpperCase()));
    if (matchResultKey && allOdds[matchResultKey].length >= 3) {
      const its = allOdds[matchResultKey];
      const getO = (ns: string[]) => its.find((o: any) => ns.some(n => o.name && o.name.toLowerCase().includes(n.toLowerCase())))?.odds;
      return { odds1: getO(['1', 'home']), oddsX: getO(['x', 'draw']), odds2: getO(['2', 'away']) };
    }

    const mk = (m.eventBetTypes || m.markets || m.odds || []).find((x: any) => 
      ['1X2', 'MATCH RESULT'].includes((x.name || x.id || '').toUpperCase())
    );
    if (!mk) return {};
    const its = mk.eventBetTypeItems || mk.outcomes || mk.items || mk.odds || [];
    const getO = (ns: string[]) => its.find((o: any) => ns.some(n => [o.shortName, o.name, o.outcomeName, o.outcome, String(o.id)].map(v => (v || '').toString().toLowerCase()).includes(n.toLowerCase())))?.odds?.toString();
    return { odds1: getO(['1', 'home']), oddsX: getO(['x', 'draw']), odds2: getO(['2', 'away']) };
  };

  const result = findOdds1X2();
  
  // Ensure 1X2 is in allOdds if we have it
  if (result.odds1 && result.oddsX && result.odds2 && !Object.keys(allOdds).some(k => ['1X2', 'MATCH RESULT'].includes(k.toUpperCase()))) {
    allOdds['MATCH RESULT'] = [
      { name: '1', odds: result.odds1 },
      { name: 'X', odds: result.oddsX },
      { name: '2', odds: result.odds2 },
    ];
  }

  return { ...result, allOdds };
};

export function cleanTeamName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "") // remove spaces and non-alphanumeric chars
    .trim();
}

export function areTeamsEqual(name1: string, name2: string): boolean {
  const n1 = cleanTeamName(name1);
  const n2 = cleanTeamName(name2);
  if (!n1 || !n2) return false;
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

export function getMatchOddsParsed(m: any) {
  const parsed = extractOddsGlobal(m);
  return {
    o1: parseFloat(parsed.odds1 || m.odds1 || '0'),
    ox: parseFloat(parsed.oddsX || m.oddsX || '0'),
    o2: parseFloat(parsed.odds2 || m.odds2 || '0')
  };
}

export function getMatchAnomalyParsed(m: any, rankings: any[]) {
  const { o1, o2 } = getMatchOddsParsed(m);
  if (o1 <= 0 || o2 <= 0 || isNaN(o1) || isNaN(o2)) return null;

  const rawHome = typeof m.homeTeam === 'string' ? m.homeTeam : (m.homeTeam?.name || m.homeTeam?.teamName || '');
  const rawAway = typeof m.awayTeam === 'string' ? m.awayTeam : (m.awayTeam?.name || m.awayTeam?.teamName || '');

  const homeRank = rankings.findIndex((t: any) => areTeamsEqual(t.name || t.teamName, rawHome)) + 1;
  const awayRank = rankings.findIndex((t: any) => areTeamsEqual(t.name || t.teamName, rawAway)) + 1;

  if (homeRank <= 0 || awayRank <= 0) return null;

  // Case 1: home team is better ranked (smaller rank number) but has higher odds (o1 > o2)
  if (homeRank < awayRank && o1 > o2) {
    return {
      type: 'home',
      betterTeam: rawHome,
      betterRank: homeRank,
      betterOdds: o1,
      worseTeam: rawAway,
      worseRank: awayRank,
      worseOdds: o2,
      difference: (o1 - o2).toFixed(2),
      betOnTeam: '2', // Bet on worse-ranked team (away team), which has the lower odds
      betOdds: o2
    };
  }

  // Case 2: away team is better ranked (smaller rank number) but has higher odds (o2 > o1)
  if (awayRank < homeRank && o2 > o1) {
    return {
      type: 'away',
      betterTeam: rawAway,
      betterRank: awayRank,
      betterOdds: o2,
      worseTeam: rawHome,
      worseRank: homeRank,
      worseOdds: o1,
      difference: (o2 - o1).toFixed(2),
      betOnTeam: '1', // Bet on worse-ranked team (home team), which has the lower odds
      betOdds: o1
    };
  }

  return null;
}
