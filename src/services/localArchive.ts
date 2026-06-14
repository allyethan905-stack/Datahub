import Dexie, { type Table } from 'dexie';

export interface ArchivedMatch {
  id?: string;
  sourceFileId?: string; // Link to the original file session
  leagueId: number;
  eventCategoryId?: number; // Season ID for history
  season: string;
  round: number;
  homeTeam: string;
  awayTeam: string;
  homeScore?: string;
  awayScore?: string;
  scoreDetails?: {
    homeGoals?: Array<{ minute: string; player: string }>;
    awayGoals?: Array<{ minute: string; player: string }>;
  };
  status: string;
  odds1?: string;
  oddsX?: string;
  odds2?: string;
  allOdds?: any; // Stores the 33+ markets
  expectedStart: string;
  updatedAt: string;
  isImported?: boolean;
  importedAt?: string;
  homeRankAtMatch?: number;
  awayRankAtMatch?: number;
  homeFormWDLPct?: { v: number; n: number; d: number; played: number };
  awayFormWDLPct?: { v: number; n: number; d: number; played: number };
  homeFormSequence?: string[];
  awayFormSequence?: string[];
}

export interface ArchiveFileMeta {
  driveFileId: string;
  name: string;
  createdTime: string;
  size?: string;
  syncedAt: number;
}

export interface AnalysisMatrix {
  id: string; // e.g., "matrix_{leagueId}_{season_normalized}_r{roundSaved}"
  leagueId: number;
  season: string;
  roundSaved: number;
  rankTimeline: Record<string, number[]>;
  normalizedToOriginal: Record<string, string>;
  teamForms: Array<{
    teamName: string;
    history: string[];
    rank: number;
    points: number;
  }>;
  savedAt: string;
}

export class MahakasaDatabase extends Dexie {
  get matches(): Table<ArchivedMatch> {
    if (!this.isOpen()) {
      this.open().catch(err => console.warn('[Dexie] Auto-reopen matches failed:', err));
    }
    return this.table('matches');
  }

  get files(): Table<ArchiveFileMeta> {
    if (!this.isOpen()) {
      this.open().catch(err => console.warn('[Dexie] Auto-reopen files failed:', err));
    }
    return this.table('files');
  }

  get matrices(): Table<AnalysisMatrix> {
    if (!this.isOpen()) {
      this.open().catch(err => console.warn('[Dexie] Auto-reopen matrices failed:', err));
    }
    return this.table('matrices');
  }

  constructor() {
    super('MahakasaArchiveDB');
    this.version(7).stores({
      matches: 'id, leagueId, season, round, sourceFileId, [leagueId+season], [leagueId+season+round], [leagueId+homeTeam+awayTeam], [leagueId+odds1+oddsX+odds2]',
      files: 'driveFileId, name, syncedAt',
      matrices: 'id, leagueId, season, roundSaved, [leagueId+season]'
    });

    this.on('versionchange', () => {
      this.close();
    });
  }
}

export const db = new MahakasaDatabase();

export const ensureDbOpen = async () => {
  if (!db.isOpen()) {
    console.log('[Dexie] Database is closed. Attempting to reopen...');
    try {
      await db.open();
      console.log('[Dexie] Database successfully reopened.');
    } catch (err) {
      console.error('[Dexie] Failed to reopen database:', err);
    }
  }
};

export const saveAnalysisMatrix = async (matrix: AnalysisMatrix) => {
  try {
    await ensureDbOpen();
    await db.matrices.put(matrix);
    console.log(`[Dexie] [SUCCESS] Matrix saved for League: ${matrix.leagueId}, Season: ${matrix.season}, Round: ${matrix.roundSaved}`);
    return true;
  } catch (err) {
    console.error('[Dexie] saveAnalysisMatrix error:', err);
    return false;
  }
};

export const getAnalysisMatrixBySeason = async (leagueId: number, season: string) => {
  try {
    await ensureDbOpen();
    const lId = Number(leagueId);
    return await db.matrices.where('[leagueId+season]').equals([lId, season]).first();
  } catch (err) {
    console.warn('[Dexie] getAnalysisMatrixBySeason index query failed, falling back:', err);
    try {
      await ensureDbOpen();
      const lId = Number(leagueId);
      return await db.matrices.filter(m => Number(m.leagueId) === lId && m.season === season).first();
    } catch {
      return null;
    }
  }
};

/**
 * Purge Radicale (Targeted Wipe)
 * Utilise la commande .clear() pour une suppression immédiate et physique des entrées IndexedDB.
 */
export const purgeTotalDatabase = async () => {
  try {
    console.log('[Purge] Targeted Wipe initiated...');
    
    if (db.isOpen()) {
      // Commande .clear() explicite sur toutes les tables
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          console.log(`[Purge] Clearing table: ${table.name}`);
          await table.clear(); // La commande magique
        }
      });
    }

    // Fermeture propre
    db.close();

    // Suppression physique des bases connues pour éviter les données fantômes
    const dbNames = ['MahakasaArchiveDB', 'MahakasaDB', 'MahakasaMatchesDB'];
    await Promise.all(dbNames.map(name => Dexie.delete(name).catch(() => {})));
    
    // Preserve login configuration
    const unlocked = localStorage.getItem('mahakasa_unlocked');
    const bet261Account = localStorage.getItem('bet261_account');
    const bet261Credentials = localStorage.getItem('bet261_credentials');

    // Nettoyage des résidus session
    localStorage.clear();
    sessionStorage.clear();
    
    // Restore login configuration to prevent auto-closing & locking
    if (unlocked) localStorage.setItem('mahakasa_unlocked', unlocked);
    if (bet261Account) localStorage.setItem('bet261_account', bet261Account);
    if (bet261Credentials) localStorage.setItem('bet261_credentials', bet261Credentials);
    
    console.log('[Purge] Targeted Wipe completed successfully');
    return true;
  } catch (err: any) {
    console.error('[Purge] Targeted Wipe Error:', err);
    return false;
  }
};

export const isPlayedMatch = (m: ArchivedMatch): boolean => {
  const hasHomeScore = m.homeScore !== undefined && m.homeScore !== null && String(m.homeScore).trim() !== '' && String(m.homeScore).trim() !== '-';
  const hasAwayScore = m.awayScore !== undefined && m.awayScore !== null && String(m.awayScore).trim() !== '' && String(m.awayScore).trim() !== '-';
  const isFinished = m.status === 'Finished' || m.status?.toLowerCase() === 'finished';
  return !!(isFinished || (hasHomeScore && hasAwayScore));
};

export const exportMatchesToJSON = async () => {
  try {
    await ensureDbOpen();
    let matches = await db.matches.toArray();
    matches = matches.filter(isPlayedMatch);
    const data = JSON.stringify(matches, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `extractions_archive_${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('Export error:', err);
    return false;
  }
};

export const exportMatchesToJS = async (leagueId?: number, leagueName?: string) => {
  try {
    await ensureDbOpen();
    let matches: ArchivedMatch[] = [];
    if (leagueId !== undefined) {
      const lId = Number(leagueId);
      matches = await db.matches
        .where('leagueId')
        .anyOf([lId, String(lId)])
        .toArray();
    } else {
      matches = await db.matches.toArray();
    }

    // Filter to only played matches
    matches = matches.filter(isPlayedMatch);

    // Sort logically by round and then expected start date
    matches.sort((a, b) => {
      if (Number(a.round || 0) !== Number(b.round || 0)) {
        return Number(a.round || 0) - Number(b.round || 0);
      }
      return new Date(a.expectedStart).getTime() - new Date(b.expectedStart).getTime();
    });

    const header = `/**\n * Mahakasa Match Data Export\n * Ligue: ${leagueName || 'Toutes les Ligues'}\n * ID Ligue: ${leagueId ?? 'Tous'}\n * Nombre de matchs: ${matches.length}\n * Date d'exportation: ${new Date().toLocaleString()}\n */\n\n`;
    const jsContent = `${header}const mahakasaMatches = ${JSON.stringify(matches, null, 2)};\n\nif (typeof module !== 'undefined' && module.exports) {\n  module.exports = mahakasaMatches;\n} else if (typeof window !== 'undefined') {\n  window.mahakasaMatches = mahakasaMatches;\n}\n`;

    const blob = new Blob([jsContent], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    const nameSlug = leagueName ? leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'toutes_ligues';
    const filename = `matches_export_${nameSlug}_${date}.js`;

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { success: true, count: matches.length };
  } catch (err) {
    console.error('JS Export error:', err);
    return { success: false, count: 0 };
  }
};

export const parseJSOrJSONMatches = (text: string): ArchivedMatch[] => {
  let cleaned = text.trim();
  
  // Try raw JSON parse first
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // Treat as Javascript file
  }

  // Remove blocks and line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  cleaned = cleaned.replace(/\/\/.*$/gm, '');
  cleaned = cleaned.trim();

  // Find array boundaries [ and ]
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const arrayString = cleaned.substring(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(arrayString);
    } catch (e) {
      try {
        // Safe Function constructor to compile/execute the array wrapper
        const compileArray = new Function(`return ${arrayString};`);
        const res = compileArray();
        if (Array.isArray(res)) return res;
      } catch (err) {
        throw new Error('Echec du parsing ou de l\'évaluation du tableau JS.');
      }
    }
  }

  throw new Error('Aucun tableau de matchs n\'a pu être extrait. Assurez-vous d\'avoir fourni un fichier JS ou JSON contenant un tableau.');
};

export const parseRoundNumber = (roundVal: any): number => {
  if (roundVal === undefined || roundVal === null) return 1;
  if (typeof roundVal === 'number') return roundVal;
  const str = String(roundVal).trim();
  const match = str.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }
  return 1;
};

export const isSameTeamLocal = (t1: string = '', t2: string = ''): boolean => {
  const n1 = t1.toLowerCase().trim();
  const n2 = t2.toLowerCase().trim();
  if (n1 === n2) return true;
  
  const clean = (s: string) => {
    return s
      .replace(/\bfc\b|\brc\b|\bsc\b|\bafc\b|\bas\b|\bud\b|\bcd\b|\bac\b|\bcf\b/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  
  const c1 = clean(n1);
  const c2 = clean(n2);
  if (c1 === c2 && c1 !== '') return true;
  if (c1.length > 3 && c2.length > 3) {
    if (c1.includes(c2) || c2.includes(c1)) return true;
  }
  return false;
};

export const enrichAndSaveMatches = async (matchesToEnrich: ArchivedMatch[], skipFormPct: boolean = false): Promise<ArchivedMatch[]> => {
  if (matchesToEnrich.length === 0) return [];
  await ensureDbOpen();
  
  // 1. Identify distinct [leagueId, season] pairs
  const pairs = new Map<string, { leagueId: number; season: string }>();
  for (const m of matchesToEnrich) {
    if (m.leagueId && m.season) {
      const key = `${m.leagueId}____${m.season}`;
      pairs.set(key, { leagueId: Number(m.leagueId), season: m.season });
    }
  }

  // 2. Load all matches for these pairs
  const seasonCache = new Map<string, ArchivedMatch[]>();
  for (const [key, pair] of pairs.entries()) {
    try {
      let matchesOfSeason: ArchivedMatch[] = [];
      try {
        // Fast composite index lookup (Instantaneous in v7 schema)
        matchesOfSeason = await db.matches
          .where('[leagueId+season]')
          .equals([pair.leagueId, pair.season])
          .toArray();
      } catch (indexErr) {
        console.warn('[Dexie] Composite index [leagueId+season] lookup failed, falling back:', indexErr);
        matchesOfSeason = await db.matches
          .where('leagueId')
          .anyOf([pair.leagueId, String(pair.leagueId)])
          .filter(m => m.season === pair.season && (Number(m.leagueId) === pair.leagueId || String(m.leagueId) === String(pair.leagueId)))
          .toArray();
      }

      // Deduplicate to avoid duplicate representations of the exact same fixtures skewing played counts
      const seen = new Set<string>();
      const uniqueMatches: ArchivedMatch[] = [];
      for (const m of matchesOfSeason) {
        if (!m.homeTeam || !m.awayTeam) continue;
        const hNorm = m.homeTeam.toLowerCase().trim();
        const aNorm = m.awayTeam.toLowerCase().trim();
        const mRound = parseRoundNumber(m.round);
        const matchKey = `${hNorm}____${aNorm}____${mRound}`;
        if (!seen.has(matchKey)) {
          seen.add(matchKey);
          uniqueMatches.push(m);
        }
      }

      seasonCache.set(key, uniqueMatches);
    } catch (err) {
      console.warn('[Dexie] Failed to fetch cache for enrichment', err);
    }
  }

  // 3. For each match to enrich, compute rank and form before its round
  const enrichedList = matchesToEnrich.map(match => {
    const key = `${match.leagueId}____${match.season}`;
    const allSeasonMatches = seasonCache.get(key) || [];

    // Collect all possible raw names of teams in the season to build a canonical map
    const allSeasonTeams: string[] = [];
    for (const m of allSeasonMatches) {
      if (m.homeTeam && !allSeasonTeams.includes(m.homeTeam)) allSeasonTeams.push(m.homeTeam);
      if (m.awayTeam && !allSeasonTeams.includes(m.awayTeam)) allSeasonTeams.push(m.awayTeam);
    }

    const canonicalMap = new Map<string, string>();
    const getCanonical = (teamName: string): string => {
      if (!teamName) return '';
      const lower = teamName.toLowerCase().trim();
      if (canonicalMap.has(lower)) return canonicalMap.get(lower)!;
      
      const matched = allSeasonTeams.find(t => isSameTeamLocal(t, teamName));
      const canonical = matched || teamName;
      canonicalMap.set(lower, canonical);
      return canonical;
    };

    const targetRound = parseRoundNumber(match.round);
    // Filter to matches played in rounds strictly LESS than match.round
    const historyMatches = allSeasonMatches.filter(m => {
      const r = parseRoundNumber(m.round);
      if (r >= targetRound) return false;
      
      const hasHomeScore = m.homeScore !== undefined && m.homeScore !== null && String(m.homeScore).trim() !== '' && String(m.homeScore).trim() !== '-';
      const hasAwayScore = m.awayScore !== undefined && m.awayScore !== null && String(m.awayScore).trim() !== '' && String(m.awayScore).trim() !== '-';
      const isPlayed = m.status === 'Finished' || m.status?.toLowerCase() === 'finished' || (hasHomeScore && hasAwayScore);
      return isPlayed;
    });

    const teamStats: Record<string, {
      name: string;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      gf: number;
      ga: number;
      gd: number;
      points: number;
      form: string[];
    }> = {};

    // Initialize teamStats with canonical names
    for (const teamName of allSeasonTeams) {
      const canon = getCanonical(teamName);
      const canonKey = canon.toLowerCase().trim();
      if (!teamStats[canonKey]) {
        teamStats[canonKey] = { name: canon, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] };
      }
    }

    // Sort history matches chronologically
    const sortedHistoryMatches = [...historyMatches].sort((a, b) => {
      if (a.expectedStart && b.expectedStart) {
        return a.expectedStart.localeCompare(b.expectedStart);
      }
      return parseRoundNumber(a.round) - parseRoundNumber(b.round);
    });

    // Accumulate results from rounds < targetRound
    for (const m of sortedHistoryMatches) {
      const h = m.homeTeam;
      const a = m.awayTeam;
      if (!h || !a) continue;
      
      const hCanon = getCanonical(h);
      const aCanon = getCanonical(a);
      const hKey = hCanon.toLowerCase().trim();
      const aKey = aCanon.toLowerCase().trim();

      if (!teamStats[hKey]) {
        teamStats[hKey] = { name: hCanon, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] };
      }
      if (!teamStats[aKey]) {
        teamStats[aKey] = { name: aCanon, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] };
      }

      const cleanHomeScore = m.homeScore !== undefined && m.homeScore !== null ? String(m.homeScore).trim() : '';
      const cleanAwayScore = m.awayScore !== undefined && m.awayScore !== null ? String(m.awayScore).trim() : '';
      
      const hS = parseInt(cleanHomeScore, 10);
      const aS = parseInt(cleanAwayScore, 10);
      
      if (!isNaN(hS) && !isNaN(aS) && cleanHomeScore !== '' && cleanAwayScore !== '' && cleanHomeScore !== '-' && cleanAwayScore !== '-') {
        teamStats[hKey].played += 1;
        teamStats[aKey].played += 1;
        teamStats[hKey].gf += hS;
        teamStats[hKey].ga += aS;
        teamStats[hKey].gd += (hS - aS);
        teamStats[aKey].gf += aS;
        teamStats[aKey].ga += hS;
        teamStats[aKey].gd += (aS - hS);

        if (hS > aS) {
          teamStats[hKey].wins += 1;
          teamStats[hKey].points += 3;
          teamStats[hKey].form.push('Won');

          teamStats[aKey].losses += 1;
          teamStats[aKey].form.push('Lost');
        } else if (hS < aS) {
          teamStats[aKey].wins += 1;
          teamStats[aKey].points += 3;
          teamStats[aKey].form.push('Won');

          teamStats[hKey].losses += 1;
          teamStats[hKey].form.push('Lost');
        } else {
          teamStats[hKey].draws += 1;
          teamStats[hKey].points += 1;
          teamStats[hKey].form.push('Draw');

          teamStats[aKey].draws += 1;
          teamStats[aKey].points += 1;
          teamStats[aKey].form.push('Draw');
        }
      }
    }

    const standings = Object.values(teamStats);
    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.name.localeCompare(b.name);
    });

    const rankMap = new Map<string, number>();
    standings.forEach((entry, index) => {
      rankMap.set(entry.name.toLowerCase().trim(), index + 1);
    });

    const homeCanonCurrent = getCanonical(match.homeTeam || '');
    const awayCanonCurrent = getCanonical(match.awayTeam || '');
    const homeKey = homeCanonCurrent.toLowerCase().trim();
    const awayKey = awayCanonCurrent.toLowerCase().trim();

    const homeRank = rankMap.get(homeKey) || standings.length || undefined;
    const awayRank = rankMap.get(awayKey) || standings.length || undefined;

    const homeEntry = teamStats[homeKey];
    const awayEntry = teamStats[awayKey];

    const getFormPct = (entry: any) => {
      if (!entry) {
        return { v: 0, n: 0, d: 0, played: 0 };
      }
      const wins = Number(entry.wins) || 0;
      const draws = Number(entry.draws) || 0;
      const losses = Number(entry.losses) || 0;
      const played = Number(entry.played) || 0;
      
      if (played === 0) {
        return { v: 0, n: 0, d: 0, played: 0 };
      }
      
      let v = Math.round((wins / played) * 100);
      let n = Math.round((draws / played) * 100);
      let d = Math.round((losses / played) * 100);
      
      const sum = v + n + d;
      if (sum !== 100) {
        const diff = 100 - sum;
        if (v >= n && v >= d) v += diff;
        else if (n >= v && n >= d) n += diff;
        else d += diff;
      }
      
      v = Math.max(0, Math.min(100, v));
      n = Math.max(0, Math.min(100, n));
      d = Math.max(0, Math.min(100, d));
      
      return { v, n, d, played };
    };

    const hasValidHome = match.homeFormWDLPct && typeof match.homeFormWDLPct.v === 'number';
    const hasValidAway = match.awayFormWDLPct && typeof match.awayFormWDLPct.v === 'number';

    const homeSeq = homeEntry && homeEntry.form ? homeEntry.form : (match.homeFormSequence || []);
    const awaySeq = awayEntry && awayEntry.form ? awayEntry.form : (match.awayFormSequence || []);

    return {
      ...match,
      homeRankAtMatch: homeRank,
      awayRankAtMatch: awayRank,
      homeFormWDLPct: hasValidHome ? (match.homeFormWDLPct!.v + match.homeFormWDLPct!.n + match.homeFormWDLPct!.d === 100 ? match.homeFormWDLPct : getFormPct({ wins: Math.round(match.homeFormWDLPct!.v * match.homeFormWDLPct!.played / 100), draws: Math.round(match.homeFormWDLPct!.n * match.homeFormWDLPct!.played / 100), losses: Math.round(match.homeFormWDLPct!.d * match.homeFormWDLPct!.played / 100), played: match.homeFormWDLPct!.played })) : (skipFormPct ? undefined : (homeEntry && homeEntry.played > 0 ? getFormPct(homeEntry) : (match.homeFormWDLPct || { v: 0, n: 0, d: 0, played: 0 }))),
      awayFormWDLPct: hasValidAway ? (match.awayFormWDLPct!.v + match.awayFormWDLPct!.n + match.awayFormWDLPct!.d === 100 ? match.awayFormWDLPct : getFormPct({ wins: Math.round(match.awayFormWDLPct!.v * match.awayFormWDLPct!.played / 100), draws: Math.round(match.awayFormWDLPct!.n * match.awayFormWDLPct!.played / 100), losses: Math.round(match.awayFormWDLPct!.d * match.awayFormWDLPct!.played / 100), played: match.awayFormWDLPct!.played })) : (skipFormPct ? undefined : (awayEntry && awayEntry.played > 0 ? getFormPct(awayEntry) : (match.awayFormWDLPct || { v: 0, n: 0, d: 0, played: 0 }))),
      homeFormSequence: homeSeq,
      awayFormSequence: awaySeq
    };
  });

  return enrichedList;
};

export const importMatchesFromJSON = async (file: File) => {
  return new Promise<{ success: boolean; count: number }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const matches = parseJSOrJSONMatches(content);
        if (Array.isArray(matches)) {
          // Validate and parse numerical constraints
          const validatedMatches = matches
            .filter(m => m.homeTeam && m.awayTeam)
            .map(m => ({
              ...m,
              leagueId: Number(m.leagueId) || 0,
              round: Number(m.round) || 0,
              updatedAt: m.updatedAt || new Date().toISOString()
            }));

          if (validatedMatches.length === 0) {
            reject(new Error('Aucun match valide trouvé dans le fichier.'));
            return;
          }

          await db.matches.bulkPut(validatedMatches);
          
          try {
            const enriched = await enrichAndSaveMatches(validatedMatches);
            if (enriched.length > 0) {
              await db.matches.bulkPut(enriched);
            }
          } catch (e) {
            console.warn('[Dexie] Failed to enrich on JSON import:', e);
          }

          resolve({ success: true, count: validatedMatches.length });
        } else {
          reject(new Error('Le contenu du fichier n\'est pas un tableau de matchs.'));
        }
      } catch (err: any) {
        reject(new Error(err.message || 'Erreur lors de l\'importation.'));
      }
    };
    reader.onerror = () => reject(new Error('Erreur lors du chargement du fichier.'));
    reader.readAsText(file);
  });
};

export const findSimilarMatches = async (leagueId: number, homeTeam: string, awayTeam: string) => {
  await ensureDbOpen();
  return await db.matches
    .where('[leagueId+homeTeam+awayTeam]')
    .equals([leagueId, homeTeam, awayTeam])
    .toArray();
};

export const findHistoricalMatches = async (leagueId: number, match: any) => {
  await ensureDbOpen();
  console.log('[History] findHistoricalMatches invoked for league:', leagueId);
  
  const getTeamName = (team: any): string => {
    if (!team) return '';
    if (typeof team === 'string') return team;
    return team.name || team.teamName || team.shortName || '';
  };

  const home = getTeamName(match.homeTeam);
  const away = getTeamName(match.awayTeam);
  const odds1 = match.odds1 ? String(match.odds1) : undefined;
  const oddsX = match.oddsX ? String(match.oddsX) : undefined;
  const odds2 = match.odds2 ? String(match.odds2) : undefined;

  let targetTime: number | null = null;
  if (match.expectedStart && !match.expectedStart.startsWith("0001-01-01") && !match.expectedStart.startsWith("0000-00-00")) {
    const parsed = new Date(match.expectedStart).getTime();
    if (!isNaN(parsed) && parsed > 946684800000) { // Valid timestamp greater than year 2000
      targetTime = parsed;
    }
  }

  const targetRound = Number(match.round) || 0;

  // Let's optimize query performance and search efficiency using indexes
  // 1. Direct H2H indexed lookup (instantaneous)
  let h2hMatches: any[] = [];
  try {
    const [h2hSame, h2hInv] = await Promise.all([
      db.matches
        .where('[leagueId+homeTeam+awayTeam]')
        .equals([leagueId, home, away])
        .toArray(),
      db.matches
        .where('[leagueId+homeTeam+awayTeam]')
        .equals([leagueId, away, home])
        .toArray()
    ]);
    h2hMatches = [...h2hSame, ...h2hInv];
  } catch (err) {
    console.warn('[History] index lookup failed, falling back:', err);
    h2hMatches = await db.matches
      .filter(m => Number(m.leagueId) === leagueId && (
        (getTeamName(m.homeTeam) === home && getTeamName(m.awayTeam) === away) ||
        (getTeamName(m.homeTeam) === away && getTeamName(m.awayTeam) === home)
      ))
      .toArray();
  }

  // 2. Direct same-odds lookup within the same league (instantaneous)
  let oddsMatchesSameLeague: any[] = [];
  if (odds1 && oddsX && odds2) {
    try {
      oddsMatchesSameLeague = await db.matches
        .where('[leagueId+odds1+oddsX+odds2]')
        .equals([leagueId, odds1, oddsX, odds2])
        .toArray();
    } catch (err) {
      console.warn('[History] fast index same-odds lookup failed, using fallback:', err);
      try {
        oddsMatchesSameLeague = await db.matches
          .where('leagueId')
          .equals(leagueId)
          .filter(m => {
            return m.id !== match.id && 
                   m.odds1 === odds1 && m.oddsX === oddsX && m.odds2 === odds2;
          })
          .toArray();
      } catch (innerErr) {
        console.warn('[History] fallback same-odds lookup failed:', innerErr);
      }
    }
  }

  // Combine matches to a deduplicated Map
  const candidatesMap = new Map<string, any>();
  h2hMatches.forEach(m => {
    if (m.id && m.id !== match.id) candidatesMap.set(m.id, m);
  });
  oddsMatchesSameLeague.forEach(m => {
    if (m.id && m.id !== match.id) candidatesMap.set(m.id, m);
  });

  // Filter out any matches that are chronologically AFTER or AT the same time as our target match
  // This directly corrects the look-ahead ("too late" / "trop tard") issue with zero computation lag.
  const filtered = Array.from(candidatesMap.values()).filter(m => {
    // A. Chronological Filter ('c'est trop tard' / happened after)
    if (targetTime && m.expectedStart) {
      try {
        const timeM = new Date(m.expectedStart).getTime();
        if (timeM >= targetTime) return false;
      } catch {
        // ignore date error
      }
    }

    // B. Round Filter within the same season for absolute safety
    if (m.leagueId === match.leagueId && m.season && match.season && m.season === match.season && targetRound > 0) {
      const mRound = Number(m.round) || 0;
      if (mRound >= targetRound) return false;
    }

    return true;
  });

  // Sort by expectedStart descending
  filtered.sort((a, b) => {
    const timeA = a.expectedStart ? new Date(a.expectedStart).getTime() : 0;
    const timeB = b.expectedStart ? new Date(b.expectedStart).getTime() : 0;
    return timeB - timeA;
  });

  // 1. Identify matches that need enrichment of team ranks
  const alreadyEnriched = filtered.filter(m => 
    m.homeRankAtMatch !== undefined && 
    m.awayRankAtMatch !== undefined
  );

  const needsEnrichment = filtered.filter(m => 
    m.homeRankAtMatch === undefined || 
    m.awayRankAtMatch === undefined
  );

  if (needsEnrichment.length === 0) {
    return filtered;
  }

  try {
    // Enrich matches purely in memory (incredibly lightweight and fast with composite index)
    // We pass skipFormPct = true to only calculate ranks extremely quickly
    const enriched = await enrichAndSaveMatches(needsEnrichment, true);
    
    // Asynchronously update the local DB so that future queries load instantly, without blocking current UI!
    if (enriched.length > 0) {
      db.matches.bulkPut(enriched).catch(err => {
        console.warn('[Dexie] Background save of enriched matches failed:', err);
      });
    }

    const combined = [...alreadyEnriched, ...enriched];
    combined.sort((a, b) => {
      const timeA = a.expectedStart ? new Date(a.expectedStart).getTime() : 0;
      const timeB = b.expectedStart ? new Date(b.expectedStart).getTime() : 0;
      return timeB - timeA;
    });
    return combined;
  } catch (err) {
    console.warn('[Dexie] Failed to enrich matches in findHistoricalMatches:', err);
    return filtered;
  }
};

export const saveMatchesToLocal = async (matches: ArchivedMatch[]) => {
  try {
    await ensureDbOpen();
    const matchesWithIds = matches.map(m => {
      const leagueId = Number(m.leagueId);
      const round = Number(m.round);
      const season = String(m.season);
      
      return {
        ...m,
        leagueId,
        round,
        season,
        id: m.id || `${leagueId}_${season.replace(/\//g, '_')}_${round}_${m.homeTeam}_${m.awayTeam}`.replace(/[^a-z0-9]/gi, '_'),
        updatedAt: m.updatedAt || new Date().toISOString()
      };
    });
    await db.matches.bulkPut(matchesWithIds);
    try {
      const enriched = await enrichAndSaveMatches(matchesWithIds);
      if (enriched.length > 0) {
        await db.matches.bulkPut(enriched);
      }
    } catch (e) {
      console.warn('[Dexie] Failed to enrich matches on-save:', e);
    }
    return { success: true, count: matchesWithIds.length };
  } catch (err) {
    console.error('[Dexie] Save error:', err);
    throw err;
  }
};

export const getLocalMatchesBySeason = async (leagueId: number, season: string) => {
  await ensureDbOpen();
  const lId = Number(leagueId);
  try {
    return await db.matches
      .where('[leagueId+season]')
      .equals([lId, season])
      .sortBy('round');
  } catch (err) {
    console.warn('[Dexie] [leagueId+season] query failed, falling back:', err);
    return await db.matches
      .where('leagueId')
      .anyOf([lId, String(lId)])
      .filter(m => m.season === season)
      .sortBy('round');
  }
};

export const purgeSeasonFromLocal = async (leagueId: number, season: string) => {
  try {
    const lId = Number(leagueId);
    console.log(`[Purge] Purging season "${season}" for league ${lId}...`);
    
    // Attempt 1: Fast delete
    let count = await db.matches
      .where('[leagueId+season]')
      .equals([lId, season])
      .delete();
      
    // Attempt 2: Fallback for string leagueId
    if (count === 0) {
      count = await db.matches
        .where('[leagueId+season]')
        .equals([String(lId), season])
        .delete();
    }

    // Attempt 3: Manual filter fallback
    if (count === 0) {
      console.log('[Purge] Index delete returned 0, trying manual filter fallback...');
      const allToPurge = await db.matches
        .where('leagueId')
        .anyOf([lId, String(lId)])
        .filter(m => m.season === season)
        .primaryKeys();
        
      if (allToPurge.length > 0) {
        await db.matches.bulkDelete(allToPurge);
        count = allToPurge.length;
      }
    }
      
    console.log(`[Purge] Successfully deleted ${count} matches for season ${season}`);
    return { success: true, count };
  } catch (err) {
    console.error('[Purge] Error deleting season:', err);
    throw err;
  }
};

export const purgeLeagueFromLocal = async (leagueId: number) => {
  try {
    const lId = Number(leagueId);
    console.log(`[Purge] Purging all data for league ${lId}...`);
    
    const countNominal = await db.matches
      .where('leagueId')
      .equals(lId)
      .delete();
      
    const countString = await db.matches
      .where('leagueId')
      .equals(String(lId))
      .delete();
      
    const totalCount = countNominal + countString;
    console.log(`[Purge] Successfully deleted ${totalCount} matches for league ${lId}`);
    return { success: true, count: totalCount };
  } catch (err) {
    console.error('[Purge] Error deleting league data:', err);
    throw err;
  }
};

export const purgeRoundFromLocal = async (leagueId: number, season: string, round: number) => {
  try {
    const lId = Number(leagueId);
    const rNum = Number(round);
    console.log(`[Purge] Purging round ${rNum} for season ${season} in league ${lId}...`);
    
    // Attempt 1: Fast delete
    let count = await db.matches
      .where('[leagueId+season+round]')
      .equals([lId, season, rNum])
      .delete();
      
    // Attempt 2: Fallback
    if (count === 0) {
      const allToPurge = await db.matches
        .where('leagueId')
        .anyOf([lId, String(lId)])
        .filter(m => m.season === season && Number(m.round) === rNum)
        .primaryKeys();
        
      if (allToPurge.length > 0) {
        await db.matches.bulkDelete(allToPurge);
        count = allToPurge.length;
      }
    }
      
    console.log(`[Purge] Successfully deleted ${count} matches`);
    return { success: true, count };
  } catch (err) {
    console.error('[Purge] Error deleting round:', err);
    throw err;
  }
};

