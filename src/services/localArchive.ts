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
  matches!: Table<ArchivedMatch>;
  files!: Table<ArchiveFileMeta>;
  matrices!: Table<AnalysisMatrix>;

  constructor() {
    super('MahakasaArchiveDB');
    this.version(6).stores({
      matches: 'id, leagueId, season, round, sourceFileId, [leagueId+season], [leagueId+season+round], [leagueId+homeTeam+awayTeam]',
      files: 'driveFileId, name, syncedAt',
      matrices: 'id, leagueId, season, roundSaved, [leagueId+season]'
    });

    this.on('versionchange', () => {
      this.close();
    });
  }
}

export const db = new MahakasaDatabase();

export const saveAnalysisMatrix = async (matrix: AnalysisMatrix) => {
  try {
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
    const lId = Number(leagueId);
    return await db.matrices.where('[leagueId+season]').equals([lId, season]).first();
  } catch (err) {
    console.warn('[Dexie] getAnalysisMatrixBySeason index query failed, falling back:', err);
    try {
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

export const exportMatchesToJSON = async () => {
  try {
    const matches = await db.matches.toArray();
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

export const importMatchesFromJSON = async (file: File) => {
  return new Promise<{ success: boolean; count: number }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const matches = JSON.parse(content);
        if (Array.isArray(matches)) {
          // Ensure all IDs are preserved and numeric fields are corrected
          const validatedMatches = matches
            .filter(m => m.homeTeam && m.awayTeam) // Basic validation
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
          resolve({ success: true, count: validatedMatches.length });
        } else {
          reject(new Error('Format de fichier invalide (doit être un tableau)'));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsText(file);
  });
};

export const findSimilarMatches = async (leagueId: number, homeTeam: string, awayTeam: string) => {
  return await db.matches
    .where('[leagueId+homeTeam+awayTeam]')
    .equals([leagueId, homeTeam, awayTeam])
    .toArray();
};

export const findHistoricalMatches = async (leagueId: number, match: any) => {
  const lId = Number(leagueId);
  const home = String(match.homeTeam);
  const away = String(match.awayTeam);
  const { odds1, oddsX, odds2 } = match;

  // We want to find matches in the same league
  // that have either the same teams OR the same odds
  return await db.matches
    .where('leagueId')
    .anyOf([lId, String(lId)])
    .filter(m => {
      // Don't include the current match if it exists in DB
      if (m.id === match.id) return false;

      // Same teams (H2H)
      const sameTeams = (m.homeTeam === home && m.awayTeam === away);
      
      // Same odds
      const sameOdds = (m.odds1 === odds1 && m.oddsX === oddsX && m.odds2 === odds2 && odds1 && oddsX && odds2);

      return sameTeams || sameOdds;
    })
    .reverse()
    .sortBy('expectedStart');
};

export const saveMatchesToLocal = async (matches: ArchivedMatch[]) => {
  try {
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
    return { success: true, count: matchesWithIds.length };
  } catch (err) {
    console.error('[Dexie] Save error:', err);
    throw err;
  }
};

export const getLocalMatchesBySeason = async (leagueId: number, season: string) => {
  const lId = Number(leagueId);
  return await db.matches
    .where('leagueId')
    .anyOf([lId, String(lId)])
    .filter(m => m.season === season)
    .sortBy('round');
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

