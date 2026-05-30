export interface MatchData {
  id: string;
  leagueId: number;
  season?: string | number;
  round?: number;
  homeTeam: string;
  awayTeam: string;
  expectedStart?: string;
  odds1?: string;
  oddsX?: string;
  odds2?: string;
  homeScore?: string;
  awayScore?: string;
  homeRank?: number;
  awayRank?: number;
  homePoints?: number;
  awayPoints?: number;
  status?: string;
  updatedAt: string;
  allOdds?: Record<string, any>;
  serverSecret?: string;
  ai_status?: string;
}

export interface CategoryStats {
  sum: number;
  count: number;
}

export interface CalculatorStats {
  round: number;
  sumOdds: number;
  matchCount: number;
  lastUpdate: Date;
  categories: {
    favoriGagnant: CategoryStats;
    defaiteFavori: CategoryStats;
    anomalieCorrecte: CategoryStats;
    anomalieFausse: CategoryStats;
    nulle: CategoryStats;
  };
}

export const LEAGUES = [
  { id: 8035, name: 'English League', country: 'GB', rounds: 38, matchesPerRound: 10, targetSeasons: 19 },
  { id: 8036, name: 'Italian League', country: 'IT', rounds: 38, matchesPerRound: 10, targetSeasons: 19 },
  { id: 8037, name: 'Spanish League', country: 'ES', rounds: 38, matchesPerRound: 10, targetSeasons: 19 },
  { id: 8060, name: "Coupe d'Afrique", country: 'AF', rounds: 46, matchesPerRound: 12, targetSeasons: 16 },
  { id: 8042, name: 'French League', country: 'FR', rounds: 34, matchesPerRound: 9, targetSeasons: 21 },
  { id: 8043, name: 'German League', country: 'DE', rounds: 34, matchesPerRound: 9, targetSeasons: 21 },
  { id: 8044, name: 'Portuguese League', country: 'PT', rounds: 34, matchesPerRound: 9, targetSeasons: 21 },
  { id: 8056, name: 'Champions League', country: 'EU', rounds: 70, matchesPerRound: 18, targetSeasons: 11 },
  { id: 8065, name: 'Coupe du Monde', country: 'WORLD', rounds: 96, matchesPerRound: 24, targetSeasons: 10 },
];

export const generateMatchId = (leagueId: number, season: string, round: number, homeTeam: string, awayTeam: string) => {
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Grouping by daily season part (Saison DD/MM/YYYY) to avoid duplicates when ID changes
  // Format: "Saison 24/04/2026 | ID: 12345" -> extracts "Saison 24/04/2026"
  const dailySeasonMatch = season.match(/Saison\s+\d{2}\/\d{2}\/\d{4}/i);
  const seasonPart = dailySeasonMatch ? normalize(dailySeasonMatch[0]) : normalize(season);
  
  const h = normalize(homeTeam) || 'unknownh';
  const a = normalize(awayTeam) || 'unknowna';
  
  return `${leagueId}_${seasonPart}_r${round}_${h}_${a}`;
};

export const getDailySeason = (timestamp: string | number | Date) => {
  const isNumericString = typeof timestamp === 'string' && /^\d+$/.test(timestamp);
  let d: Date;
  if (isNumericString || typeof timestamp === 'number') {
    const num = Number(timestamp);
    d = new Date(num < 10000000000 ? num * 1000 : num);
  } else {
    d = new Date(timestamp);
  }
  
  // Fallback to Date.now() if date is invalid or year is before 2000
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) {
    d = new Date();
  }
  
  // Get Madagascar time directly using Intl.DateTimeFormat parts
  const options: Intl.DateTimeFormatOptions = { 
    timeZone: 'Indian/Antananarivo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  };
  
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(d);
  
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
  
  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10) - 1; // 0-indexed
  const day = parseInt(getPart('day'), 10);
  
  const seasonDate = new Date(year, month, day);
  
  const yyyy = seasonDate.getFullYear();
  const mm = String(seasonDate.getMonth() + 1).padStart(2, '0');
  const dd = String(seasonDate.getDate()).padStart(2, '0');
  
  return `Saison ${dd}/${mm}/${yyyy}`;
};

export const formatSeason = (dailySeason: string, seasonId: string | number | undefined | null) => {
  if (!seasonId) return dailySeason;
  const idStr = String(seasonId);
  if (idStr.startsWith('ID:')) return idStr;
  return `ID: ${idStr}`;
};

// Helper to parse dates correctly handling both seconds and milliseconds
export const parseMatchDate = (dateStr: string | number | undefined | null): Date | null => {
  if (!dateStr) return null;
  const str = String(dateStr);
  
  // Check if it's a numeric string (timestamp)
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    // If it's less than 10^10, it's likely seconds, otherwise milliseconds
    return new Date(num < 10000000000 ? num * 1000 : num);
  }
  
  // Try standard date parsing
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

