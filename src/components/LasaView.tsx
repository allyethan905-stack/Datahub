import { useState, useEffect, useMemo } from 'react';
import { 
  ChevronDown, Info, BarChart3, GitCompare, Sparkles, Database, 
  Activity, Target, Sliders, Calendar, Hash, BookOpen, AlertCircle,
  Layers, ArrowLeftRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, type ArchivedMatch } from '../services/localArchive';
import { LEAGUES } from '../shared/constants';
import { getTeamLogo, getLeagueFlag } from '../lib/logos';

export function computeHTFT(homeScore: string | number, awayScore: string | number, scoreDetails: any) {
  const hS = parseInt(String(homeScore || '0'));
  const aS = parseInt(String(awayScore || '0'));
  if (isNaN(hS) || isNaN(aS)) return null;

  const homeGoalsList = scoreDetails?.homeGoals || [];
  const awayGoalsList = scoreDetails?.awayGoals || [];
  const totalGoals = homeGoalsList.length + awayGoalsList.length;

  if (hS === 0 && aS === 0) {
    return 'X/X';
  }

  // If we have goal minute details, compute exactly
  if (totalGoals > 0) {
    let hHt = 0;
    let aHt = 0;
    homeGoalsList.forEach((g: any) => {
      const min = parseInt(g.minute || g.time || '0');
      if (!isNaN(min) && min <= 45) hHt++;
    });
    awayGoalsList.forEach((g: any) => {
      const min = parseInt(g.minute || g.time || '0');
      if (!isNaN(min) && min <= 45) aHt++;
    });
    const htRes = hHt > aHt ? '1' : (hHt < aHt ? '2' : 'X');
    const ftRes = hS > aS ? '1' : (hS < aS ? '2' : 'X');
    return `${htRes}/${ftRes}`;
  }

  return null;
}

export function getDetailedH2hStats(matches: any[]) {
  const played = matches.filter(m => m && m.homeScore !== undefined && m.homeScore !== null && m.awayScore !== undefined && m.awayScore !== null);
  const total = played.length;
  
  if (total === 0) {
    return {
      total: 0,
      homeWinPct: 0,
      drawPct: 0,
      homeLossPct: 0,
      mostFreqScore: 'N/A',
      mostFreqHtFt: 'N/A',
      mostFreqGoalsNum: 'N/A',
      bttsPct: 0,
    };
  }

  let hWins = 0;
  let draws = 0;
  let hLosses = 0;
  let bttsYes = 0;

  const scoreFreq: Record<string, number> = {};
  const htFtFreq: Record<string, number> = {};
  const goalsFreq: Record<number, number> = {};

  played.forEach(m => {
    const hS = parseInt(String(m.homeScore));
    const aS = parseInt(String(m.awayScore));
    
    if (hS > aS) hWins++;
    else if (hS === aS) draws++;
    else hLosses++;

    if (hS > 0 && aS > 0) bttsYes++;

    const scoreKey = `${hS}-${aS}`;
    scoreFreq[scoreKey] = (scoreFreq[scoreKey] || 0) + 1;

    const htFt = computeHTFT(hS, aS, m.scoreDetails);
    if (htFt) {
      htFtFreq[htFt] = (htFtFreq[htFt] || 0) + 1;
    }

    const totalGoals = hS + aS;
    goalsFreq[totalGoals] = (goalsFreq[totalGoals] || 0) + 1;
  });

  const homeWinPct = Math.round((hWins / total) * 100);
  const drawPct = Math.round((draws / total) * 100);
  const homeLossPct = Math.round((hLosses / total) * 100);
  const bttsPct = Math.round((bttsYes / total) * 100);

  let mostFreqScore = 'N/A';
  let maxScoreCount = 0;
  Object.entries(scoreFreq).forEach(([score, count]) => {
    if (count > maxScoreCount) {
      maxScoreCount = count;
      mostFreqScore = score;
    }
  });

  let mostFreqHtFt = 'N/A';
  let maxHtFtCount = 0;
  Object.entries(htFtFreq).forEach(([htFt, count]) => {
    if (count > maxHtFtCount) {
      maxHtFtCount = count;
      mostFreqHtFt = htFt;
    }
  });

  let mostFreqGoalsNum = 'N/A';
  let maxGoalsCount = 0;
  Object.entries(goalsFreq).forEach(([goals, count]) => {
    if (count > maxGoalsCount) {
      maxGoalsCount = count;
      mostFreqGoalsNum = `${goals} but${parseInt(goals) > 1 ? 's' : ''}`;
    }
  });

  return {
    total,
    homeWinPct,
    drawPct,
    homeLossPct,
    mostFreqScore,
    mostFreqHtFt,
    mostFreqGoalsNum,
    bttsPct,
  };
}

export function LasaView({ upcomingMatches = [], rankings = [] }: { upcomingMatches: any[]; rankings?: any[] }) {
  const [activeLeague, setActiveLeague] = useState(LEAGUES[0].id);
  const [selectedUpcomingMatch, setSelectedUpcomingMatch] = useState<any | null>(null);
  
  // Custom odds manual input
  const [useManualOdds, setUseManualOdds] = useState(false);
  const [manualOdds1, setManualOdds1] = useState('2.10');
  const [manualOddsX, setManualOddsX] = useState('3.20');
  const [manualOdds2, setManualOdds2] = useState('3.40');
  const [manualTolerance, setManualTolerance] = useState(0.12); // Tolerance range +/-
  
  // Right Column Tabs for navigation details
  const [rightCategory, setRightCategory] = useState<'odds' | 'h2h' | 'sequences'>('odds');
  const [rightTab, setRightTab] = useState<'similar' | 'cotesScores' | 'crossing' | 'stats' | 'h2h' | 'patterns' | 'formSequences' | 'teamH2h'>('similar');

  // States for Team H2H Confrontations Explorer
  const [teamH2hSelectedTeam, setTeamH2hSelectedTeam] = useState<string>('');
  const [teamH2hSelectedSeason, setTeamH2hSelectedSeason] = useState<string>('all');
  const [teamH2hViewMode, setTeamH2hViewMode] = useState<'standard' | 'separated'>('standard');

  // New States for Form Sequences
  const [sequenceLength, setSequenceLength] = useState<number>(4);
  const [sequenceFilterMode, setSequenceFilterMode] = useState<'all' | 'sameTeam' | 'differentTeams'>('all');
  const [selectedSequenceKey, setSelectedSequenceKey] = useState<string | null>(null);
  const [sequenceSearchQuery, setSequenceSearchQuery] = useState<string>('');

  // Sub-tab control and search query for the Cotes et Scores menu
  const [oddsScoresSubTab, setOddsScoresSubTab] = useState<'recurrentScores' | 'oddsRates' | 'individualOdds'>('recurrentScores');
  const [oddsSearchQuery, setOddsSearchQuery] = useState('');
  const [maxVisibleOdds, setMaxVisibleOdds] = useState(30);

  // New States for Odds Crossing Scanner Tab
  const [scanOdd1, setScanOdd1] = useState('1.23');
  const [scanOddX, setScanOddX] = useState('3.30');
  const [scanOdd2, setScanOdd2] = useState('6.10');
  const [scanTolPercent, setScanTolPercent] = useState(10); // Default 10% tolerance matching

  // HT/FT and Odds filter
  const [selectedHtFtFilter, setSelectedHtFtFilter] = useState<string>('all');

  // Database cache
  const [allDbMatches, setAllDbMatches] = useState<ArchivedMatch[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [scanLeagueMode, setScanLeagueMode] = useState<'active' | 'all'>('active');

  // Load all matches from IndexedDB for the active league or all leagues combined
  useEffect(() => {
    const loadDbMatches = async () => {
      setLoadingDb(true);
      try {
        let matches;
        if (scanLeagueMode === 'all') {
          matches = await db.matches.toArray();
        } else {
          const lId = Number(activeLeague);
          matches = await db.matches
            .where('leagueId')
            .anyOf([lId, String(lId)])
            .toArray();
        }
        setAllDbMatches(matches);
      } catch (err) {
        console.error('Failed to load db matches in LasaView:', err);
      } finally {
        setLoadingDb(false);
      }
    };
    loadDbMatches();
  }, [activeLeague, scanLeagueMode]);

  // Unique teams list computed from index database matches
  const uniqueTeamsList = useMemo(() => {
    const teamsSet = new Set<string>();
    allDbMatches.forEach(m => {
      if (m.homeTeam) teamsSet.add(m.homeTeam.trim());
      if (m.awayTeam) teamsSet.add(m.awayTeam.trim());
    });
    return Array.from(teamsSet).sort();
  }, [allDbMatches]);

  // Helper to check if a season identifier is a specific date rather than a typical season range/ID
  const isSeasonADate = (s: string | undefined | null): boolean => {
    if (!s) return false;
    const trimmed = s.trim();
    const hyphenCount = (trimmed.match(/-/g) || []).length;
    const slashCount = (trimmed.match(/\//g) || []).length;
    if (hyphenCount >= 2 || slashCount >= 2) {
      return true;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || /^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(trimmed)) {
      return true;
    }
    return false;
  };

  // Unique seasons list computed from index database matches
  const uniqueSeasonsList = useMemo(() => {
    const seasonsSet = new Set<string>();
    allDbMatches.forEach(m => {
      if (m.season && !isSeasonADate(m.season)) {
        seasonsSet.add(m.season.trim());
      }
    });
    return Array.from(seasonsSet).sort((a, b) => b.localeCompare(a)); // sorted latest season first
  }, [allDbMatches]);

  // Handle default focus team and season setting
  useEffect(() => {
    if (uniqueTeamsList.length > 0 && (!teamH2hSelectedTeam || !uniqueTeamsList.includes(teamH2hSelectedTeam))) {
      setTeamH2hSelectedTeam(uniqueTeamsList[0]);
    }
  }, [uniqueTeamsList, teamH2hSelectedTeam]);

  useEffect(() => {
    if (uniqueSeasonsList.length > 0 && teamH2hSelectedSeason !== 'all' && !uniqueSeasonsList.includes(teamH2hSelectedSeason)) {
      setTeamH2hSelectedSeason('all');
    }
  }, [uniqueSeasonsList, teamH2hSelectedSeason]);

  // Stats computed for the selected team
  const teamH2hStats = useMemo(() => {
    let played = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let points = 0;

    let hWins = 0;
    let hDraws = 0;
    let hLosses = 0;
    let bttsCount = 0;

    const scoreFreq: Record<string, number> = {};
    const htFtFreq: Record<string, number> = {};
    const goalsFreq: Record<number, number> = {};

    allDbMatches.forEach(m => {
      if (isSeasonADate(m.season)) {
        return;
      }
      if (teamH2hSelectedSeason && teamH2hSelectedSeason !== 'all' && m.season !== teamH2hSelectedSeason) {
        return;
      }

      const hName = (m.homeTeam || '').toLowerCase().trim();
      const aName = (m.awayTeam || '').toLowerCase().trim();
      const focusNorm = teamH2hSelectedTeam.toLowerCase().trim();

      const hS = parseInt(String(m.homeScore || ''));
      const aS = parseInt(String(m.awayScore || ''));
      
      if (isNaN(hS) || isNaN(aS)) return; // skip unplayed matches

      const isHome = hName === focusNorm;
      const isAway = aName === focusNorm;

      if (isHome || isAway) {
        played++;
        
        // Outcomes for the home team of the match
        if (hS > aS) hWins++;
        else if (hS === aS) hDraws++;
        else hLosses++;

        // BTTS
        if (hS > 0 && aS > 0) bttsCount++;

        // Frequencies
        const scoreKey = `${hS}-${aS}`;
        scoreFreq[scoreKey] = (scoreFreq[scoreKey] || 0) + 1;

        const htFt = computeHTFT(hS, aS, m.scoreDetails);
        if (htFt) {
          htFtFreq[htFt] = (htFtFreq[htFt] || 0) + 1;
        }

        const totalGoals = hS + aS;
        goalsFreq[totalGoals] = (goalsFreq[totalGoals] || 0) + 1;

        // Custom stats for selected team
        if (isHome) {
          goalsFor += hS;
          goalsAgainst += aS;
          if (hS > aS) {
            wins++;
            points += 3;
          } else if (hS === aS) {
            draws++;
            points += 1;
          } else {
            losses++;
          }
        } else {
          goalsFor += aS;
          goalsAgainst += hS;
          if (aS > hS) {
            wins++;
            points += 3;
          } else if (hS === aS) {
            draws++;
            points += 1;
          } else {
            losses++;
          }
        }
      }
    });

    const homeWinPct = played > 0 ? Math.round((hWins / played) * 100) : 0;
    const homeDrawPct = played > 0 ? Math.round((hDraws / played) * 100) : 0;
    const homeLossPct = played > 0 ? Math.round((hLosses / played) * 100) : 0;
    const bttsPct = played > 0 ? Math.round((bttsCount / played) * 100) : 0;

    let mostFreqScore = 'N/A';
    let maxScoreCount = 0;
    Object.entries(scoreFreq).forEach(([score, cnt]) => {
      if (cnt > maxScoreCount) {
        maxScoreCount = cnt;
        mostFreqScore = score;
      }
    });

    let mostFreqHtFt = 'N/A';
    let maxHtFtCount = 0;
    Object.entries(htFtFreq).forEach(([htFt, cnt]) => {
      if (cnt > maxHtFtCount) {
        maxHtFtCount = cnt;
        mostFreqHtFt = htFt;
      }
    });

    let mostFreqGoalsNum = 'N/A';
    let maxGoalsCount = 0;
    Object.entries(goalsFreq).forEach(([goals, cnt]) => {
      if (cnt > maxGoalsCount) {
        maxGoalsCount = cnt;
        mostFreqGoalsNum = `${goals} but${parseInt(goals) > 1 ? 's' : ''}`;
      }
    });

    return { 
      played, 
      wins, 
      draws, 
      losses, 
      goalsFor, 
      goalsAgainst, 
      points,
      homeWinPct,
      homeDrawPct,
      homeLossPct,
      bttsPct,
      mostFreqScore,
      mostFreqHtFt,
      mostFreqGoalsNum
    };
  }, [allDbMatches, teamH2hSelectedTeam, teamH2hSelectedSeason]);

  // List of matchups grouped by opponent with Aller and Retour games for each season
  const teamH2hMatchups = useMemo(() => {
    if (!teamH2hSelectedTeam) return [];
    
    const teamNorm = teamH2hSelectedTeam.toLowerCase().trim();
    const opponentsSet = new Set<string>();
    
    // Gather all matching matches across the selected season filter criteria
    const seasonMatches = allDbMatches.filter(m => {
      if (isSeasonADate(m.season)) return false;
      const matchSeasonMatches = !teamH2hSelectedSeason || teamH2hSelectedSeason === 'all' || m.season === teamH2hSelectedSeason;
      if (!matchSeasonMatches) return false;
      
      const dbHome = (m.homeTeam || '').toLowerCase().trim();
      const dbAway = (m.awayTeam || '').toLowerCase().trim();
      return dbHome === teamNorm || dbAway === teamNorm;
    });

    seasonMatches.forEach(m => {
      const hStr = (m.homeTeam || '').trim();
      const aStr = (m.awayTeam || '').trim();
      if (hStr && hStr.toLowerCase() !== teamNorm) opponentsSet.add(hStr);
      if (aStr && aStr.toLowerCase() !== teamNorm) opponentsSet.add(aStr);
    });

    const sortedOpponents = Array.from(opponentsSet).sort();

    return sortedOpponents.map(oppName => {
      const oppNorm = oppName.toLowerCase().trim();
      
      // Filter matches with this specific opponent
      const oppMatches = seasonMatches.filter(m => {
        const dbHome = (m.homeTeam || '').toLowerCase().trim();
        const dbAway = (m.awayTeam || '').toLowerCase().trim();
        return dbHome === oppNorm || dbAway === oppNorm;
      });

      // Find all unique seasons for this opponent, descending order (latest season first)
      const seasonsForOpp = Array.from(new Set(oppMatches.map(m => m.season))).sort((a, b) => b.localeCompare(a));

      const seasonsData = seasonsForOpp.map(seasonId => {
        // Aller match (Selected team is Home, Opponent is Away)
        const allerMatch = oppMatches.find(m => {
          const dbHome = (m.homeTeam || '').toLowerCase().trim();
          const dbAway = (m.awayTeam || '').toLowerCase().trim();
          return dbHome === teamNorm && dbAway === oppNorm && m.season === seasonId;
        });

        // Retour match (Opponent is Home, Selected team is Away)
        const retourMatch = oppMatches.find(m => {
          const dbHome = (m.homeTeam || '').toLowerCase().trim();
          const dbAway = (m.awayTeam || '').toLowerCase().trim();
          return dbHome === oppNorm && dbAway === teamNorm && m.season === seasonId;
        });

        // Compute stats for this face-off pair:
        let pointsEarned = 0;
        let matchesPlayed = 0;

        if (allerMatch) {
          const hS = parseInt(allerMatch.homeScore || '0');
          const aS = parseInt(allerMatch.awayScore || '0');
          if (allerMatch.homeScore !== undefined && allerMatch.homeScore !== null) {
            matchesPlayed++;
            if (hS > aS) pointsEarned += 3;
            else if (hS === aS) pointsEarned += 1;
          }
        }

        if (retourMatch) {
          const hS = parseInt(retourMatch.homeScore || '0');
          const aS = parseInt(retourMatch.awayScore || '0');
          if (retourMatch.homeScore !== undefined && retourMatch.homeScore !== null) {
            matchesPlayed++;
            if (aS > hS) pointsEarned += 3;
            else if (aS === hS) pointsEarned += 1;
          }
        }

        return {
          seasonId,
          allerMatch,
          retourMatch,
          pointsEarned,
          matchesPlayed
        };
      });

      const totalPointsEarned = seasonsData.reduce((acc, s) => acc + s.pointsEarned, 0);
      const totalMatchesPlayed = seasonsData.reduce((acc, s) => acc + s.matchesPlayed, 0);

      return {
        oppName,
        seasonsData,
        totalPointsEarned,
        totalMatchesPlayed
      };
    });
  }, [allDbMatches, teamH2hSelectedTeam, teamH2hSelectedSeason]);

  // Filtered upcoming matches for active league
  const leagueUpcomingMatches = useMemo(() => {
    const lId = Number(activeLeague);
    return upcomingMatches.filter(m => {
      const mLeague = Number(m.leagueId || m.league_id);
      return mLeague === lId && m.status !== 'Finished' && m.status !== 'Terminé';
    });
  }, [upcomingMatches, activeLeague]);

  // Set default selected upcoming match when league changes
  useEffect(() => {
    if (leagueUpcomingMatches.length > 0) {
      setSelectedUpcomingMatch(leagueUpcomingMatches[0]);
    } else {
      setSelectedUpcomingMatch(null);
    }
  }, [leagueUpcomingMatches]);

  // Compute similarity matches and full stats engine
  const similarities = useMemo(() => {
    if (loadingDb || allDbMatches.length === 0) {
      return { 
        h2h: [], 
        similarOdds: [], 
        allMatchedOdds: [],
        totalMatchedOdds: 0, 
        ftStats: {}, 
        htFtStats: {},
        averageGoals: '0.00',
        bttsPct: 0,
        over15Pct: 0,
        over25Pct: 0,
        cleanSheetPct: 0
      };
    }

    let tgtHome = '';
    let tgtAway = '';
    let tgt1 = 0;
    let tgtX = 0;
    let tgt2 = 0;

    if (useManualOdds) {
      tgt1 = parseFloat(manualOdds1);
      tgtX = parseFloat(manualOddsX);
      tgt2 = parseFloat(manualOdds2);
    } else if (selectedUpcomingMatch) {
      tgtHome = (selectedUpcomingMatch.homeTeam?.name || selectedUpcomingMatch.homeTeam?.teamName || selectedUpcomingMatch.homeTeam || '').toString().trim().toLowerCase();
      tgtAway = (selectedUpcomingMatch.awayTeam?.name || selectedUpcomingMatch.awayTeam?.teamName || selectedUpcomingMatch.awayTeam || '').toString().trim().toLowerCase();
      tgt1 = parseFloat(selectedUpcomingMatch.odds1 || selectedUpcomingMatch.odds_1 || '0');
      tgtX = parseFloat(selectedUpcomingMatch.oddsX || selectedUpcomingMatch.odds_x || '0');
      tgt2 = parseFloat(selectedUpcomingMatch.odds2 || selectedUpcomingMatch.odds_2 || '0');
    } else {
      return { 
        h2h: [], 
        similarOdds: [], 
        allMatchedOdds: [],
        totalMatchedOdds: 0, 
        ftStats: {}, 
        htFtStats: {},
        averageGoals: '0.00',
        bttsPct: 0,
        over15Pct: 0,
        over25Pct: 0,
        cleanSheetPct: 0
      };
    }

    const h2h: ArchivedMatch[] = [];
    const allMatchedOdds: ArchivedMatch[] = [];

    allDbMatches.forEach(m => {
      const dbHome = (m.homeTeam || '').trim().toLowerCase();
      const dbAway = (m.awayTeam || '').trim().toLowerCase();

      // Ensure we treat the game as played/finished to analyze past results
      const isFinished = m.status === 'Finished' || m.homeScore !== undefined;
      if (!isFinished) return;

      // 1. Check face-à-face (H2H)
      if (tgtHome && tgtAway && (
        (dbHome === tgtHome && dbAway === tgtAway) ||
        (dbHome === tgtAway && dbAway === tgtHome)
      )) {
        h2h.push(m);
      }

      // 2. Check odds similarity (within tolerance percentage)
      if (tgt1 > 0 && tgtX > 0 && tgt2 > 0) {
        const o1 = parseFloat(m.odds1 || '0');
        const oX = parseFloat(m.oddsX || '0');
        const o2 = parseFloat(m.odds2 || '0');

        if (o1 > 0 && oX > 0 && o2 > 0) {
          const diff1 = Math.abs(o1 - tgt1) / tgt1;
          const diffX = Math.abs(oX - tgtX) / tgtX;
          const diff2 = Math.abs(o2 - tgt2) / tgt2;
          
          const tol = useManualOdds ? manualTolerance : 0.15; // 15% tolerance matching matching by default
          if (diff1 <= tol && diffX <= tol && diff2 <= tol) {
            allMatchedOdds.push(m);
          }
        }
      }
    });

    // Compute distribution statistics for Similar Odds matches
    const ftStats: Record<string, number> = { '1': 0, 'X': 0, '2': 0 };
    const htFtStats: Record<string, number> = {};

    let totalGoalsSum = 0;
    let bttsCount = 0;
    let over15Count = 0;
    let over25Count = 0;
    let cleanSheetCount = 0;

    allMatchedOdds.forEach(m => {
      const hS = parseInt(m.homeScore || '0');
      const aS = parseInt(m.awayScore || '0');
      const outcome = hS > aS ? '1' : (hS < aS ? '2' : 'X');
      ftStats[outcome] = (ftStats[outcome] || 0) + 1;

      const htFt = computeHTFT(hS, aS, m.scoreDetails);
      if (htFt) {
        htFtStats[htFt] = (htFtStats[htFt] || 0) + 1;
      }

      // Sports analytics counts
      totalGoalsSum += (hS + aS);
      if (hS > 0 && aS > 0) bttsCount++;
      if ((hS + aS) > 1) over15Count++;
      if ((hS + aS) > 2) over25Count++;
      if (hS === 0 || aS === 0) cleanSheetCount++;
    });

    const matchesCount = allMatchedOdds.length;
    const averageGoals = matchesCount > 0 ? (totalGoalsSum / matchesCount).toFixed(2) : '0.00';
    const bttsPct = matchesCount > 0 ? Math.round((bttsCount / matchesCount) * 100) : 0;
    const over15Pct = matchesCount > 0 ? Math.round((over15Count / matchesCount) * 100) : 0;
    const over25Pct = matchesCount > 0 ? Math.round((over25Count / matchesCount) * 100) : 0;
    const cleanSheetPct = matchesCount > 0 ? Math.round((cleanSheetCount / matchesCount) * 100) : 0;

    // Apply manual HT/FT filters to the final displayed list of similar matches
    let filteredSimilarOdds = allMatchedOdds;
    if (selectedHtFtFilter !== 'all') {
      filteredSimilarOdds = allMatchedOdds.filter(m => {
        const hS = parseInt(m.homeScore || '0');
        const aS = parseInt(m.awayScore || '0');
        return computeHTFT(hS, aS, m.scoreDetails) === selectedHtFtFilter;
      });
    }

    // Sort to show latest first
    h2h.sort((a, b) => b.season.localeCompare(a.season) || (b.round - a.round));
    filteredSimilarOdds.sort((a, b) => b.season.localeCompare(a.season) || (b.round - a.round));

    return { 
      h2h, 
      similarOdds: filteredSimilarOdds, 
      allMatchedOdds,
      totalMatchedOdds: matchesCount, 
      ftStats, 
      htFtStats,
      averageGoals,
      bttsPct,
      over15Pct,
      over25Pct,
      cleanSheetPct
    };
  }, [allDbMatches, selectedUpcomingMatch, useManualOdds, manualOdds1, manualOddsX, manualOdds2, manualTolerance, selectedHtFtFilter, loadingDb]);

  // Find the single best matching direct H2H game in LasaView.tsx
  const bestH2HMatchId = useMemo(() => {
    if (!selectedUpcomingMatch || similarities.h2h.length === 0) return null;
    
    let bestIdx = -1;
    let minD = Infinity;
    
    const r1 = parseFloat(String(selectedUpcomingMatch.odds1 || selectedUpcomingMatch.odds_1 || '0'));
    const rX = parseFloat(String(selectedUpcomingMatch.oddsX || selectedUpcomingMatch.odds_x || selectedUpcomingMatch.odds_X || '0'));
    const r2 = parseFloat(String(selectedUpcomingMatch.odds2 || selectedUpcomingMatch.odds_2 || '0'));
    
    if (isNaN(r1) || isNaN(rX) || isNaN(r2) || r1 <= 0 || rX <= 0 || r2 <= 0) {
      return null;
    }
    
    similarities.h2h.forEach((m: any, idx) => {
      const o1 = parseFloat(String(m.odds1 || m.odds_1 || '0'));
      const oX = parseFloat(String(m.oddsX || m.odds_x || m.odds_X || '0'));
      const o2 = parseFloat(String(m.odds2 || m.odds_2 || '0'));
      
      if (!isNaN(o1) && !isNaN(oX) && !isNaN(o2) && o1 > 0 && oX > 0 && o2 > 0) {
        const d = Math.abs(o1 - r1)/r1 + Math.abs(oX - rX)/rX + Math.abs(o2 - r2)/r2;
        if (d < minD) {
          minD = d;
          bestIdx = idx;
        }
      }
    });
    
    if (minD <= 0.36) {
      return bestIdx;
    }
    return null;
  }, [similarities.h2h, selectedUpcomingMatch]);

  const getCleanName = (team: any) => {
    if (!team) return '';
    const name = typeof team === 'string' ? team : (team.name || team.teamName || '');
    return name.toLowerCase().trim()
      .replace(/fc/gi, '')
      .replace(/sc/gi, '')
      .replace(/rsc/gi, '')
      .replace(/rc/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const curHomeRank = useMemo(() => {
    if (!rankings || rankings.length === 0 || !selectedUpcomingMatch) return 0;
    const name = selectedUpcomingMatch.homeTeam?.name || selectedUpcomingMatch.homeTeam?.teamName || selectedUpcomingMatch.homeTeam || '';
    const cleanCurrentHome = getCleanName(name);
    const idx = rankings.findIndex((t: any) => getCleanName(t.name || t.teamName) === cleanCurrentHome);
    return idx >= 0 ? idx + 1 : 0;
  }, [rankings, selectedUpcomingMatch]);

  const curAwayRank = useMemo(() => {
    if (!rankings || rankings.length === 0 || !selectedUpcomingMatch) return 0;
    const name = selectedUpcomingMatch.awayTeam?.name || selectedUpcomingMatch.awayTeam?.teamName || selectedUpcomingMatch.awayTeam || '';
    const cleanCurrentAway = getCleanName(name);
    const idx = rankings.findIndex((t: any) => getCleanName(t.name || t.teamName) === cleanCurrentAway);
    return idx >= 0 ? idx + 1 : 0;
  }, [rankings, selectedUpcomingMatch]);

  const closestRankH2HIdxs = useMemo(() => {
    if (!rankings || rankings.length === 0 || similarities.h2h.length === 0 || curHomeRank === 0 || curAwayRank === 0 || !selectedUpcomingMatch) {
      return [];
    }

    const curHomeClean = getCleanName(selectedUpcomingMatch.homeTeam);

    const distances = similarities.h2h.map((m: any, idx) => {
      const hRank = m.homeRankAtMatch || 0;
      const aRank = m.awayRankAtMatch || 0;
      if (hRank > 0 && aRank > 0) {
        const isSameConfig = getCleanName(m.homeTeam) === curHomeClean;
        let dist = 0;
        if (isSameConfig) {
          dist = Math.abs(hRank - curHomeRank) + Math.abs(aRank - curAwayRank);
        } else {
          // Inverted teams: past Home was current Away, past Away was current Home
          dist = Math.abs(hRank - curAwayRank) + Math.abs(aRank - curHomeRank);
        }
        return {
          idx,
          dist
        };
      }
      return null;
    }).filter(d => d !== null) as { idx: number; dist: number }[];

    if (distances.length === 0) return [];

    const minDist = Math.min(...distances.map(d => d.dist));
    
    // Within 12 rank sum deviation to avoid flagging completely different matches
    if (minDist > 12) return [];

    return distances.filter(d => d.dist === minDist).map(d => d.idx);
  }, [similarities.h2h, rankings, curHomeRank, curAwayRank, selectedUpcomingMatch]);

  const closestFormH2HIdxs = useMemo(() => {
    if (!selectedUpcomingMatch || similarities.h2h.length === 0) return [];

    const curHV = selectedUpcomingMatch.homeFormWDLPct?.v ?? null;
    const curHN = selectedUpcomingMatch.homeFormWDLPct?.n ?? null;
    const curHD = selectedUpcomingMatch.homeFormWDLPct?.d ?? null;
    const curAV = selectedUpcomingMatch.awayFormWDLPct?.v ?? null;
    const curAN = selectedUpcomingMatch.awayFormWDLPct?.n ?? null;
    const curAD = selectedUpcomingMatch.awayFormWDLPct?.d ?? null;

    if (curHV === null || curAV === null) return [];

    const curHomeClean = getCleanName(selectedUpcomingMatch.homeTeam);

    const distances = similarities.h2h.map((m: any, idx) => {
      const hV = m.homeFormWDLPct?.v ?? null;
      const hN = m.homeFormWDLPct?.n ?? null;
      const hD = m.homeFormWDLPct?.d ?? null;
      const aV = m.awayFormWDLPct?.v ?? null;
      const aN = m.awayFormWDLPct?.n ?? null;
      const aD = m.awayFormWDLPct?.d ?? null;

      if (hV !== null && aV !== null) {
        const isSameConfig = getCleanName(m.homeTeam) === curHomeClean;
        let dist = 0;
        if (isSameConfig) {
          dist = Math.abs(hV - curHV) + Math.abs((hN ?? 0) - (curHN ?? 0)) + Math.abs((hD ?? 0) - (curHD ?? 0)) +
                 Math.abs(aV - curAV) + Math.abs((aN ?? 0) - (curAN ?? 0)) + Math.abs((aD ?? 0) - (curAD ?? 0));
        } else {
          // Inverted teams: compare past Home form to current Away form, and vice versa
          dist = Math.abs(hV - curAV) + Math.abs((hN ?? 0) - (curAN ?? 0)) + Math.abs((hD ?? 0) - (curAD ?? 0)) +
                 Math.abs(aV - curHV) + Math.abs((aN ?? 0) - (curHN ?? 0)) + Math.abs((aD ?? 0) - (curHD ?? 0));
        }
        return {
          idx,
          dist
        };
      }
      return null;
    }).filter(d => d !== null) as { idx: number; dist: number }[];

    if (distances.length === 0) return [];

    const minDist = Math.min(...distances.map(d => d.dist));

    if (minDist > 100) return [];

    return distances.filter(d => d.dist === minDist).map(d => d.idx);
  }, [similarities.h2h, selectedUpcomingMatch]);

  // Dynamic analysis matrix for custom crossed odds combinations (requested by user)
  const crossingAnalysis = useMemo(() => {
    const o1 = parseFloat(scanOdd1);
    const o2 = parseFloat(scanOdd2);
    const tolFactor = scanTolPercent / 100;

    if (isNaN(o1) || o1 <= 0 || loadingDb || allDbMatches.length === 0) {
      return {
        singleRepetitions: 0,
        singleWins: 0,
        singleDraws: 0,
        singleLosses: 0,
        singleTeams: [] as string[],
        singleMatches: [] as ArchivedMatch[],
        crossedRepetitions: 0,
        crossedWins: 0,
        crossedDraws: 0,
        crossedLosses: 0,
        crossedTeams: [] as string[],
        crossedMatches: [] as ArchivedMatch[],
        similarityVerdict: 'Veuillez saisir une cote valide à scanner.'
      };
    }

    const singleMatches: ArchivedMatch[] = [];
    const crossedMatches: ArchivedMatch[] = [];
    const singleTeamsSet = new Set<string>();
    const crossedTeamsSet = new Set<string>();

    let singleWins = 0;
    let singleDraws = 0;
    let singleLosses = 0;

    let crossedWins = 0;
    let crossedDraws = 0;
    let crossedLosses = 0;

    allDbMatches.forEach(m => {
      if (!m.homeScore || !m.awayScore) return;

      const mO1 = parseFloat(m.odds1 || '0');
      const mO2 = parseFloat(m.odds2 || '0');

      if (mO1 <= 0 || mO2 <= 0) return;

      // 1. Single Scan for scanOdd1 (any occurrence on home or away odds)
      const diffHome = Math.abs(mO1 - o1) / o1;
      const diffAway = Math.abs(mO2 - o1) / o1;

      const isHomePrimary = diffHome <= tolFactor;
      const isAwayPrimary = diffAway <= tolFactor;

      if (isHomePrimary || isAwayPrimary) {
        singleMatches.push(m);
        
        const hS = parseInt(m.homeScore);
        const aS = parseInt(m.awayScore);

        if (isHomePrimary) {
          if (m.homeTeam) singleTeamsSet.add(m.homeTeam);
          if (hS > aS) singleWins++;
          else if (hS === aS) singleDraws++;
          else singleLosses++;
        } else {
          if (m.awayTeam) singleTeamsSet.add(m.awayTeam);
          if (aS > hS) singleWins++;
          else if (aS === hS) singleDraws++;
          else singleLosses++;
        }
      }

      // 2. Crossed Scan (one side matches scanOdd1 and other side matches scanOdd2)
      const isHomePrimaryForCross = diffHome <= tolFactor;
      const isAwaySecondaryForCross = (Math.abs(mO2 - o2) / o2) <= tolFactor;

      const isAwayPrimaryForCross = diffAway <= tolFactor;
      const isHomeSecondaryForCross = (Math.abs(mO1 - o2) / o2) <= tolFactor;

      const crossMatchedAsFavHome = isHomePrimaryForCross && isAwaySecondaryForCross;
      const crossMatchedAsFavAway = isAwayPrimaryForCross && isHomeSecondaryForCross;

      if (crossMatchedAsFavHome || crossMatchedAsFavAway) {
        crossedMatches.push(m);
        const hS = parseInt(m.homeScore);
        const aS = parseInt(m.awayScore);

        if (crossMatchedAsFavHome) {
          if (m.homeTeam) crossedTeamsSet.add(m.homeTeam);
          if (m.awayTeam) crossedTeamsSet.add(m.awayTeam);
          if (hS > aS) crossedWins++;
          else if (hS === aS) crossedDraws++;
          else crossedLosses++;
        } else {
          if (m.homeTeam) crossedTeamsSet.add(m.homeTeam);
          if (m.awayTeam) crossedTeamsSet.add(m.awayTeam);
          if (aS > hS) crossedWins++;
          else if (aS === hS) crossedDraws++;
          else crossedLosses++;
        }
      }
    });

    const singleRepetitions = singleMatches.length;
    const crossedRepetitions = crossedMatches.length;

    // Diagnose outcome similarities in French for direct user understanding
    let similarityVerdict = '';
    if (singleRepetitions > 0 && crossedRepetitions > 0) {
      const sWinRate = (singleWins / singleRepetitions) * 100;
      const cWinRate = (crossedWins / crossedRepetitions) * 100;
      const sDrawRate = (singleDraws / singleRepetitions) * 100;
      const cDrawRate = (crossedDraws / crossedRepetitions) * 100;

      const winDiff = Math.abs(sWinRate - cWinRate);
      const drawDiff = Math.abs(sDrawRate - cDrawRate);

      if (winDiff < 12 && drawDiff < 12) {
        similarityVerdict = `Extrêmement Forte (Similarité estimée à ${Math.round(100 - (winDiff + drawDiff) / 2)}%). Les matchs croisant précisément ${scanOdd1} et ${scanOdd2} affichent des comportements identiques à la cote seule : domination nette (${Math.round(cWinRate)}% de victoires vs ${Math.round(sWinRate)}%). Les similarités de résultats sont très unifiées !`;
      } else if (winDiff < 25) {
        similarityVerdict = `Modérée (Similarité estimée à ${Math.round(100 - (winDiff + drawDiff) / 2)}%). Le croisement de cotes (${scanOdd1} vs ${scanOdd2}) conserve la tendance principale mais engendre des variations mineures, augmentant légèrement le taux de nuls/surprises (${Math.round(cWinRate)}% de victoires croisées vs ${Math.round(sWinRate)}% par défaut).`;
      } else {
        similarityVerdict = `Faible/Divergence Constatée. L'opposition de la cote favorisée ${scanOdd1} à l'outsider coté à ${scanOdd2} produit des cassures tactiques majeures. Le comportement est différent (Taux de victoire croisée de ${Math.round(cWinRate)}% comparé à ${Math.round(sWinRate)}% de base).`;
      }
    } else if (singleRepetitions > 0) {
      similarityVerdict = `Données de croisement croisé (${scanOdd1} vs ${scanOdd2}) indisponibles dans la base active, mais l'analyse individuelle de la cote ${scanOdd1} révèle un taux solide de ${Math.round((singleWins / singleRepetitions) * 100)}% de victoires pour l'équipe la portant.`;
    } else {
      similarityVerdict = "Aucune correspondance de cote dans la base de données actuelle pour formuler un verdict comparatif.";
    }

    return {
      singleRepetitions,
      singleWins,
      singleDraws,
      singleLosses,
      singleTeams: Array.from(singleTeamsSet),
      singleMatches: singleMatches.sort((a,b) => b.season.localeCompare(a.season) || b.round - a.round),
      crossedRepetitions,
      crossedWins,
      crossedDraws,
      crossedLosses,
      crossedTeams: Array.from(crossedTeamsSet),
      crossedMatches: crossedMatches.sort((a,b) => b.season.localeCompare(a.season) || b.round - a.round),
      similarityVerdict
    };
  }, [allDbMatches, scanOdd1, scanOddX, scanOdd2, scanTolPercent, loadingDb]);

  // Detect repeating patterns in global league database
  const repetitionPatterns = useMemo(() => {
    if (loadingDb || allDbMatches.length === 0) return [];

    // Group matches by exact final score + HT/FT pattern
    const groups: Record<string, ArchivedMatch[]> = {};
    allDbMatches.forEach(m => {
      if (!m.homeScore || !m.awayScore) return;
      const hS = parseInt(m.homeScore);
      const aS = parseInt(m.awayScore);
      const htFt = computeHTFT(hS, aS, m.scoreDetails) || 'Non défini';
      const scoreKey = `${hS}-${aS} (HT/FT ${htFt})`;

      if (!groups[scoreKey]) {
        groups[scoreKey] = [];
      }
      groups[scoreKey].push(m);
    });

    return Object.entries(groups)
      .map(([key, list]) => ({
        pattern: key,
        count: list.length,
        matches: list.sort((a, b) => b.season.localeCompare(a.season) || b.round - a.round).slice(0, 5)
      }))
      .filter(g => g.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [allDbMatches, loadingDb]);

  // Calculate repeating form sequences across seasons for same or different teams
  const repeatingFormSequences = useMemo(() => {
    if (loadingDb || allDbMatches.length === 0) return [];

    // Group matches by homeTeam & awayTeam for each season of each league
    const teamSeasonHistory: Record<string, Array<{ 
      round: number; 
      outcome: 'V' | 'N' | 'P'; 
      match: ArchivedMatch; 
      isHome: boolean; 
      opponent: string; 
      score: string; 
    }>> = {};

    allDbMatches.forEach(m => {
      if (!m.homeScore || !m.awayScore) return;
      const hS = parseInt(m.homeScore);
      const aS = parseInt(m.awayScore);
      if (isNaN(hS) || isNaN(aS)) return;

      const leagueId = m.leagueId;
      const season = m.season;
      const r = Number(m.round);
      const hT = m.homeTeam;
      const aT = m.awayTeam;

      // Home outcome
      const hOutcome = hS > aS ? 'V' : (hS === aS ? 'N' : 'P');
      const hKey = `${leagueId}_${season}_${hT}`;
      if (!teamSeasonHistory[hKey]) teamSeasonHistory[hKey] = [];
      teamSeasonHistory[hKey].push({
        round: r,
        outcome: hOutcome,
        match: m,
        isHome: true,
        opponent: aT,
        score: `${hS}-${aS}`
      });

      // Away outcome
      const aOutcome = aS > hS ? 'V' : (aS === hS ? 'N' : 'P');
      const aKey = `${leagueId}_${season}_${aT}`;
      if (!teamSeasonHistory[aKey]) teamSeasonHistory[aKey] = [];
      teamSeasonHistory[aKey].push({
        round: r,
        outcome: aOutcome,
        match: m,
        isHome: false,
        opponent: hT,
        score: `${hS}-${aS}`
      });
    });

    // Sort team histories by round ascending
    Object.keys(teamSeasonHistory).forEach(key => {
      teamSeasonHistory[key].sort((a, b) => a.round - b.round);
    });

    // Group repeating sequences of size sequenceLength
    const sequencesMap: Record<string, Array<{
      team: string;
      season: string;
      leagueId: number;
      startRound: number;
      endRound: number;
      games: Array<{ round: number; outcome: 'V' | 'N' | 'P'; opponent: string; score: string; isHome: boolean; match: ArchivedMatch }>;
      nextOutcome: 'V' | 'N' | 'P' | null;
      nextOpponent?: string;
      nextScore?: string;
    }>> = {};

    Object.entries(teamSeasonHistory).forEach(([teamSeasonKey, history]) => {
      const parts = teamSeasonKey.split('_');
      const leagueId = Number(parts[0]);
      const season = parts[1];
      const teamName = parts[2];

      if (history.length < sequenceLength) return;

      for (let i = 0; i <= history.length - sequenceLength; i++) {
        const subHistory = history.slice(i, i + sequenceLength);
        const seqArray = subHistory.map(h => h.outcome);
        const seqKey = seqArray.join(' - ');

        const nextGame = history[i + sequenceLength];
        const nextOutcome = nextGame ? nextGame.outcome : null;

        if (!sequencesMap[seqKey]) {
          sequencesMap[seqKey] = [];
        }

        sequencesMap[seqKey].push({
          team: teamName,
          season,
          leagueId,
          startRound: subHistory[0].round,
          endRound: subHistory[subHistory.length - 1].round,
          games: subHistory,
          nextOutcome,
          nextOpponent: nextGame ? nextGame.opponent : undefined,
          nextScore: nextGame ? nextGame.score : undefined
        });
      }
    });

    // Transform and compute statistics for each sequence key
    let result = Object.entries(sequencesMap).map(([seqKey, occurrences]) => {
      const totalCount = occurrences.length;

      // Group occurrences by team to see how many seasons they repeat it
      const teamSeasonsMap: Record<string, Set<string>> = {};
      occurrences.forEach(occ => {
        if (!teamSeasonsMap[occ.team]) {
          teamSeasonsMap[occ.team] = new Set();
        }
        teamSeasonsMap[occ.team].add(occ.season);
      });

      // Find teams that repeated this sequence in 2 or more different seasons
      const recurrentTeams = Object.entries(teamSeasonsMap)
        .filter(([_, seasons]) => seasons.size >= 2)
        .map(([teamName, seasons]) => ({
          team: teamName,
          seasonsCount: seasons.size,
          seasons: Array.from(seasons).sort()
        }))
        .sort((a, b) => b.seasonsCount - a.seasonsCount);

      // Compute statistics for the NEXT match following this sequence
      let winsNext = 0;
      let drawsNext = 0;
      let lossesNext = 0;
      let totalNext = 0;

      occurrences.forEach(occ => {
        if (occ.nextOutcome) {
          totalNext++;
          if (occ.nextOutcome === 'V') winsNext++;
          else if (occ.nextOutcome === 'N') drawsNext++;
          else if (occ.nextOutcome === 'P') lossesNext++;
        }
      });

      const winsNextPct = totalNext > 0 ? Math.round((winsNext / totalNext) * 100) : 0;
      const drawsNextPct = totalNext > 0 ? Math.round((drawsNext / totalNext) * 100) : 0;
      const lossesNextPct = totalNext > 0 ? Math.round((lossesNext / totalNext) * 100) : 0;

      return {
        seqKey,
        occurrences,
        totalCount,
        recurrentTeams,
        winsNext,
        drawsNext,
        lossesNext,
        totalNext,
        winsNextPct,
        drawsNextPct,
        lossesNextPct
      };
    });

    // Apply Filters
    if (sequenceSearchQuery) {
      const q = sequenceSearchQuery.trim().toLowerCase();
      result = result.filter(item => 
        item.seqKey.toLowerCase().includes(q) || 
        item.occurrences.some(occ => occ.team.toLowerCase().includes(q))
      );
    }

    if (sequenceFilterMode === 'sameTeam') {
      result = result.filter(item => item.recurrentTeams.length > 0);
    }
    else if (sequenceFilterMode === 'differentTeams') {
      result = result.filter(item => {
        const uniqueTeams = new Set(item.occurrences.map(o => o.team));
        return uniqueTeams.size >= 2;
      });
    }

    result.sort((a, b) => b.totalCount - a.totalCount);

    return result;
  }, [allDbMatches, sequenceLength, sequenceFilterMode, sequenceSearchQuery, loadingDb]);

  // Find matches with BOTH similar odds and similar scores/results among themselves
  const repetitionCotesScores = useMemo(() => {
    if (loadingDb || similarities.allMatchedOdds.length === 0) return [];

    // Group similarities.allMatchedOdds by their final score + HT/FT pattern
    const groups: Record<string, ArchivedMatch[]> = {};
    similarities.allMatchedOdds.forEach(m => {
      if (!m.homeScore || !m.awayScore) return;
      const hS = parseInt(m.homeScore);
      const aS = parseInt(m.awayScore);
      const htFt = computeHTFT(hS, aS, m.scoreDetails) || 'Non défini';
      const scoreKey = `${hS}-${aS} (HT/FT ${htFt})`;

      if (!groups[scoreKey]) {
        groups[scoreKey] = [];
      }
      groups[scoreKey].push(m);
    });

    return Object.entries(groups)
      .map(([key, list]) => ({
        pattern: key,
        count: list.length,
        matches: list.sort((a, b) => b.season.localeCompare(a.season) || b.round - a.round)
      }))
      .filter(g => g.count >= 2) // must have recurred at least once
      .sort((a, b) => b.count - a.count);
  }, [similarities.allMatchedOdds, loadingDb]);

  // Group allDbMatches by their odds triplet to calculate win percentages of each odd
  const oddsTripletPerformance = useMemo(() => {
    if (loadingDb || allDbMatches.length === 0) return [];

    const tripletGroups: Record<string, {
      odds1: string;
      oddsX: string;
      odds2: string;
      totalMatches: number;
      homeWins: number;
      draws: number;
      awayWins: number;
      exampleMatches: ArchivedMatch[];
    }> = {};

    allDbMatches.forEach(m => {
      if (!m.homeScore || !m.awayScore || !m.odds1 || !m.oddsX || !m.odds2) return;

      const o1Val = parseFloat(m.odds1);
      const oXVal = parseFloat(m.oddsX);
      const o2Val = parseFloat(m.odds2);
      if (isNaN(o1Val) || isNaN(oXVal) || isNaN(o2Val) || o1Val === 0 || oXVal === 0 || o2Val === 0) return;

      // Group exact combinations (standardized to 2 decimal places to merge duplicate variants)
      const tripletKey = `${o1Val.toFixed(2)} - ${oXVal.toFixed(2)} - ${o2Val.toFixed(2)}`;

      if (!tripletGroups[tripletKey]) {
        tripletGroups[tripletKey] = {
          odds1: m.odds1,
          oddsX: m.oddsX,
          odds2: m.odds2,
          totalMatches: 0,
          homeWins: 0,
          draws: 0,
          awayWins: 0,
          exampleMatches: []
        };
      }

      const grp = tripletGroups[tripletKey];
      grp.totalMatches++;

      const hS = parseInt(m.homeScore);
      const aS = parseInt(m.awayScore);
      if (hS > aS) {
        grp.homeWins++;
      } else if (hS < aS) {
        grp.awayWins++;
      } else {
        grp.draws++;
      }

      if (grp.exampleMatches.length < 3) {
        grp.exampleMatches.push(m);
      }
    });

    return Object.entries(tripletGroups)
      .map(([key, data]) => {
        const pct1 = Math.round((data.homeWins / data.totalMatches) * 100);
        const pctX = Math.round((data.draws / data.totalMatches) * 100);
        const pct2 = Math.round((data.awayWins / data.totalMatches) * 100);

        // Find the "Cote Gagnante Principale" (which of 1, X, 2 has the highest win rate in practice)
        let winningOddMarker = {
          label: 'Domicile (1)',
          value: parseFloat(data.odds1).toFixed(2),
          pct: pct1,
          color: 'indigo'
        };
        if (pct2 > pct1 && pct2 > pctX) {
          winningOddMarker = {
            label: 'Extérieur (2)',
            value: parseFloat(data.odds2).toFixed(2),
            pct: pct2,
            color: 'rose'
          };
        } else if (pctX > pct1 && pctX > pct2) {
          winningOddMarker = {
            label: 'Match Nul (X)',
            value: parseFloat(data.oddsX).toFixed(2),
            pct: pctX,
            color: 'amber'
          };
        }

        return {
          tripletKey: key,
          ...data,
          pct1,
          pctX,
          pct2,
          winningOddMarker
        };
      })
      .sort((a, b) => b.totalMatches - a.totalMatches);
  }, [allDbMatches, loadingDb]);

  // Computed & Filtered list of odds performance based on free-form search input
  const filteredOddsPerformance = useMemo(() => {
    if (!oddsSearchQuery) return oddsTripletPerformance;
    const s = oddsSearchQuery.trim().toLowerCase();
    return oddsTripletPerformance.filter(x => x.tripletKey.toLowerCase().includes(s));
  }, [oddsTripletPerformance, oddsSearchQuery]);

  // Group allDbMatches by individual odd value to calculate overall win percentages from 1.01 to N
  const individualOddsPerformance = useMemo(() => {
    if (loadingDb || allDbMatches.length === 0) return [];

    const stats: Record<string, {
      oddValue: number;
      oddsStr: string;
      totalMatches: number;
      wins: number;
      homeOccurrences: number;
      drawOccurrences: number;
      awayOccurrences: number;
      homeWins: number;
      drawWins: number;
      awayWins: number;
    }> = {};

    allDbMatches.forEach(m => {
      if (!m.homeScore || !m.awayScore) return;

      const hS = parseInt(m.homeScore);
      const aS = parseInt(m.awayScore);
      if (isNaN(hS) || isNaN(aS)) return;

      const outcomes = [
        { raw: m.odds1, kind: '1' },
        { raw: m.oddsX, kind: 'X' },
        { raw: m.odds2, kind: '2' },
      ];

      outcomes.forEach(({ raw, kind }) => {
        if (!raw) return;
        const oVal = parseFloat(raw);
        if (isNaN(oVal) || oVal <= 0) return;

        const key = oVal.toFixed(2);

        if (!stats[key]) {
          stats[key] = {
            oddValue: oVal,
            oddsStr: key,
            totalMatches: 0,
            wins: 0,
            homeOccurrences: 0,
            drawOccurrences: 0,
            awayOccurrences: 0,
            homeWins: 0,
            drawWins: 0,
            awayWins: 0,
          };
        }

        const info = stats[key];
        info.totalMatches++;

        if (kind === '1') {
          info.homeOccurrences++;
          if (hS > aS) {
            info.wins++;
            info.homeWins++;
          }
        } else if (kind === 'X') {
          info.drawOccurrences++;
          if (hS === aS) {
            info.wins++;
            info.drawWins++;
          }
        } else if (kind === '2') {
          info.awayOccurrences++;
          if (hS < aS) {
            info.wins++;
            info.awayWins++;
          }
        }
      });
    });

    return Object.values(stats)
      .map(info => {
        const pct = Math.round((info.wins / info.totalMatches) * 100);
        return {
          ...info,
          pct
        };
      })
      .sort((a, b) => a.oddValue - b.oddValue);
  }, [allDbMatches, loadingDb]);

  // Filtered individual odds performance based on oddsSearchQuery
  const filteredIndividualOdds = useMemo(() => {
    if (!oddsSearchQuery) return individualOddsPerformance;
    const s = oddsSearchQuery.trim();
    return individualOddsPerformance.filter(x => x.oddsStr.includes(s));
  }, [individualOddsPerformance, oddsSearchQuery]);

  // Dynamic advice generator based on current similar cotes outcomes
  const aiAnalysesText = useMemo(() => {
    if (similarities.totalMatchedOdds === 0) return "Saisissez plus de cotes ou augmentez la tolérance pour obtenir des recommandations tactiques.";
    
    const ft = similarities.ftStats;
    const total = similarities.totalMatchedOdds;
    const p1 = Math.round(((ft['1'] || 0) / total) * 100);
    const pX = Math.round(((ft['X'] || 0) / total) * 100);
    const p2 = Math.round(((ft['2'] || 0) / total) * 100);

    let mainTendance = "";
    if (p1 >= 50) mainTendance = "Forte inclinaison vers la Victoire à Domicile (1).";
    else if (p2 >= 50) mainTendance = "Forte inclinaison vers la Victoire à l'Extérieur (2).";
    else if (pX >= 40) mainTendance = "Tendance élevée vers un Match Nul (X).";
    else if (p1 > pX && p1 > p2) mainTendance = "Tendance modérée Domicile (1) avec couverture recommandée.";
    else if (p2 > pX && p2 > p1) mainTendance = "Tendance modérée Extérieur (2) avec couverture recommandée.";
    else mainTendance = "Distribution équilibrée. Match ouvert et incertain.";

    const goalsInfo = parseFloat(similarities.averageGoals) >= 2.65 
      ? `Haute fréquence de buts (Moyenne de ${similarities.averageGoals} buts) avec un BTTS évalué à ${similarities.bttsPct}%.`
      : `Format tactique plutôt défensif (Chances de Clean Sheet : ${similarities.cleanSheetPct}%).`;

    return `${mainTendance} ${goalsInfo} Idéal pour envisager de renforcer vos archives ou d'affiner vos sélections de paris.`;
  }, [similarities]);

  // Goal minutes rendering assistant helper with logos
  const renderGoalTimeline = (match: ArchivedMatch) => {
    const homeGoals = match.scoreDetails?.homeGoals || [];
    const awayGoals = match.scoreDetails?.awayGoals || [];
    const allGoals = [
      ...homeGoals.map(g => ({ ...g, side: 'h' })),
      ...awayGoals.map(g => ({ ...g, side: 'a' }))
    ].sort((a, b) => parseInt(a.minute || '0') - parseInt(b.minute || '0'));

    if (allGoals.length === 0) {
      return (
        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1">
          <Info className="w-3 h-3 opacity-60" /> Aucun but enregistré en détails
        </span>
      );
    }

    return (
      <div className="flex flex-wrap gap-1.5 items-center max-w-full">
        {allGoals.map((g, idx) => (
          <span 
            key={idx} 
            className={`text-[8px] font-mono font-bold flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
              g.side === 'h' 
                ? 'bg-indigo-500/10 border-indigo-500/25 text-indigo-400 hover:bg-indigo-500/20' 
                : 'bg-rose-500/10 border-rose-500/25 text-rose-400 hover:bg-rose-500/20'
            }`}
            title={`${g.player || 'Buteur'} - Minute ${g.minute}`}
          >
            <span className="text-[7px]">⚽</span>
            <span className="font-semibold">{g.minute}'</span>
            {g.player ? <span className="text-slate-500 font-light truncate max-w-[80px]">{g.player.split(' ').pop()}</span> : ''}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER: Simple and Minimal */}
      <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800/60 justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-black text-slate-100 uppercase tracking-tighter">Lasa</h2>
        </div>
        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">Comparateur de cotes</span>
      </div>

      {/* LEAGUE SELECTOR: Segmented "Onglets de ligues" (League Tabs) with Country Flags */}
      <div className="bg-slate-950/40 p-2 rounded-3xl border border-slate-800/80 shadow-inner backdrop-blur-md overflow-hidden">
        <div className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5 px-1 no-scrollbar scrollbar-none">
          {LEAGUES.map((league) => {
            const isActive = activeLeague === league.id;
            const flagUrl = getLeagueFlag(league.country);
            
            return (
              <button
                id={`tab-league-lasa-${league.id}`}
                key={league.id}
                onClick={() => {
                  setActiveLeague(league.id);
                  setSelectedHtFtFilter('all');
                }}
                className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl text-[10.5px] font-black uppercase tracking-wider transition-all duration-300 shrink-0 relative ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeLeagueTabBg" 
                    className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl -z-10 shadow-md shadow-indigo-600/30"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                
                {/* Flag display */}
                <span className="w-5.5 h-4.5 bg-slate-900 rounded overflow-hidden flex items-center justify-center border border-white/10 shrink-0 shadow-sm">
                  <img 
                    src={flagUrl} 
                    alt={league.country} 
                    className="w-full h-full object-cover" 
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </span>

                <div className="flex flex-col items-start leading-none gap-1">
                  <span className="font-extrabold">{league.name}</span>
                  <span className={`text-[7.5px] font-mono tracking-widest uppercase ${isActive ? 'text-indigo-200' : 'text-slate-500'}`}>
                    {league.country}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COMPANION COLUMN: ANALYZER SYSTEM RANGE (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-[2rem] p-6 backdrop-blur-xl shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/5 blur-2xl rounded-full pointer-events-none" />
            
            <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span className="text-[11px] font-black text-slate-200 uppercase tracking-widest font-mono">Module Configuration</span>
              </div>
              
              <button 
                id="btn-toggle-manual-odds"
                onClick={() => {
                  setUseManualOdds(!useManualOdds);
                  setSelectedHtFtFilter('all');
                }}
                className="text-[9px] font-black text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer uppercase underline decoration-indigo-400/40 underline-offset-4 font-mono"
              >
                {useManualOdds ? "Choisir match" : "Saisir cotes"}
              </button>
            </div>

            {/* INTERACTIVE SOURCE PANEL: UPCOMING MATCH OR MANUAL */}
            <AnimatePresence mode="wait">
              {!useManualOdds ? (
                <motion.div 
                  key="upcomingMode"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Sélectionner un Match à Venir
                  </label>
                  
                  {leagueUpcomingMatches.length === 0 ? (
                    <div className="bg-slate-950/60 p-6 rounded-2xl border border-dashed border-slate-800 text-center text-slate-500 font-bold text-[10px] uppercase flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-5 h-5 text-indigo-500 opacity-40 animate-bounce" />
                      <span>Aucun match à venir identifié pour cette ligue.</span>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[360px] overflow-y-auto custom-scrollbar pr-1.5">
                      {leagueUpcomingMatches.map((m) => {
                        const id = m.id || `${m.homeTeam}_vs_${m.awayTeam}`;
                        const isSelected = selectedUpcomingMatch && (selectedUpcomingMatch.id === m.id || (selectedUpcomingMatch.homeTeam === m.homeTeam && selectedUpcomingMatch.awayTeam === m.awayTeam));
                        
                        return (
                          <button
                            id={`btn-select-match-${id}`}
                            key={id}
                            onClick={() => {
                              setSelectedUpcomingMatch(m);
                              setSelectedHtFtFilter('all');
                            }}
                            className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-300 flex flex-col gap-2 relative overflow-hidden group ${
                              isSelected 
                                ? 'bg-indigo-600/10 border-indigo-500/50 shadow-lg shadow-indigo-600/5' 
                                : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700/85 hover:bg-slate-950/70'
                            }`}
                          >
                            {isSelected && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
                            )}
                            
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[8px] font-bold text-slate-500 font-mono bg-slate-900 border border-slate-850 px-1.5 py-0.5 rounded uppercase">
                                Journée {m.round || m.round_number || '?'}
                              </span>
                              
                              <div className="flex items-center gap-1 text-[8px] font-mono font-black">
                                <span className="text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-1 rounded">{m.odds1 || m.odds_1 || '-'}</span>
                                <span className="text-slate-700 font-light">|</span>
                                <span className="text-slate-400 bg-slate-500/5 border border-slate-500/10 px-1 rounded">{m.oddsX || m.odds_x || '-'}</span>
                                <span className="text-slate-700 font-light">|</span>
                                <span className="text-rose-400 bg-rose-500/5 border border-rose-500/10 px-1 rounded">{m.odds2 || m.odds_2 || '-'}</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2.5 mt-1">
                              {/* Logos loaded dynamically */}
                              <div className="flex -space-x-1.5 shrink-0">
                                <img 
                                  src={getTeamLogo(m.homeTeam)} 
                                  alt="" 
                                  className="w-4 h-4 rounded-full object-contain pointer-events-none ring-1 ring-white/10"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                                <img 
                                  src={getTeamLogo(m.awayTeam)} 
                                  alt="" 
                                  className="w-4 h-4 rounded-full object-contain pointer-events-none ring-1 ring-white/10"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                              </div>
                              <span className="text-[11px] font-black text-slate-200 group-hover:text-white transition-colors truncate uppercase font-sans">
                                {m.homeTeam} <span className="text-[9px] text-slate-500 lowercase font-medium">vs</span> {m.awayTeam}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ) : (
                /* PROFESSIONAL MANUAL ODDS INPUT CONTROLLERS */
                <motion.div 
                  key="manualMode"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Saisie manuelle de cotes de pari
                  </label>
                  
                  <div className="grid grid-cols-3 gap-2 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 text-center font-mono">COTE 1</label>
                      <input 
                        id="input-odds-1"
                        type="text" 
                        value={manualOdds1} 
                        onChange={(e) => setManualOdds1(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-2.5 text-center text-indigo-400 text-xs font-mono font-black outline-none focus:border-indigo-500 focus:bg-slate-950 transition-all shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 text-center font-mono">COTE X</label>
                      <input 
                        id="input-odds-x"
                        type="text" 
                        value={manualOddsX} 
                        onChange={(e) => setManualOddsX(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-2.5 text-center text-slate-300 text-xs font-mono font-black outline-none focus:border-indigo-500 focus:bg-slate-950 transition-all shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 text-center font-mono">COTE 2</label>
                      <input 
                        id="input-odds-2"
                        type="text" 
                        value={manualOdds2} 
                        onChange={(e) => setManualOdds2(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-2.5 text-center text-rose-400 text-xs font-mono font-black outline-none focus:border-indigo-500 focus:bg-slate-950 transition-all shadow-inner"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Rayon d'action (Marge de tolérance)</label>
                      <span className="text-[9px] font-mono font-black text-emerald-400 bg-emerald-500/10 border border-emerald-400/20 px-2 py-0.5 rounded">± {Math.round(manualTolerance * 100)}%</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <input 
                        id="range-odds-tolerance"
                        type="range"
                        min="0.05"
                        max="0.40"
                        step="0.01"
                        value={manualTolerance}
                        onChange={(e) => setManualTolerance(parseFloat(e.target.value))}
                        className="w-full accent-indigo-500 cursor-pointer h-1.5 rounded-full"
                      />
                      <div className="flex justify-between text-[7px] font-bold text-slate-600 font-mono mt-1 px-1.5 uppercase">
                        <span>Précis (±5%)</span>
                        <span>Large (±40%)</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* QUICK FILTER BY HT/FT OR ARCHIVES DETECTED */}
            {similarities.totalMatchedOdds > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-800/60">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Filtrer par type HT/FT</label>
                <div className="relative">
                  <select
                    id="select-htft-filter"
                    value={selectedHtFtFilter}
                    onChange={(e) => setSelectedHtFtFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-[10.5px] font-black rounded-xl px-3.5 py-3 pr-9 appearance-none focus:border-indigo-500 outline-none transition-all cursor-pointer uppercase shadow-md font-sans"
                  >
                    <option value="all">Tous les patterns HT/FT ({similarities.totalMatchedOdds})</option>
                    {Object.entries(similarities.htFtStats || {}).map(([key, count]) => (
                      <option key={key} value={key}>{key} — ({count as any} occurrences)</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* INDEXEDDB DATA BANK CAPSULE */}
          <div className="bg-gradient-to-r from-slate-950 to-slate-900 rounded-[2rem] p-5 border border-slate-800/80 flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <div className="text-[17px] font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">
                {allDbMatches.length}
              </div>
              <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Jeux de données historisés (IndexedDB)</div>
            </div>
            <div className="w-11 h-11 bg-slate-900 border border-slate-800 flex items-center justify-center rounded-xl shrink-0">
              <Database className="w-5 h-5 text-indigo-500" />
            </div>
          </div>
        </div>

        {/* RIGHT ANALYTICS BOARD: CENTRAL ANALYTICAL ENGINE & DETAILED VIEW (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* STATS SUMMARY BEN-GRID IF APPLICABLE */}
          {similarities.similarOdds.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Dynamic Coach Tips */}
              <div className="bg-gradient-to-br from-indigo-950/40 via-slate-950 to-slate-950 border border-indigo-500/10 rounded-2xl p-4 flex flex-col justify-between shadow-md">
                <div className="space-y-1.5">
                  <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 animate-pulse" /> Analyse & Recommandation
                  </span>
                  <p className="text-[10px] text-slate-300 leading-relaxed font-sans">{aiAnalysesText}</p>
                </div>
                <div className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-widest mt-2">
                  Basé sur {similarities.totalMatchedOdds} analogie(s)
                </div>
              </div>

              {/* Progress bars Widget Goals & Over stats */}
              <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 space-y-3.5 shadow-md col-span-1 md:col-span-2">
                <div className="flex justify-between items-center pb-1.5 border-b border-white/[0.02]">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-emerald-400" /> Indicateurs Tactiques (Matchs similaires)
                  </span>
                  <span className="text-[11px] font-mono font-black text-white">{similarities.averageGoals} <span className="text-[8.5px] text-slate-500 uppercase font-bold">Buts/m</span></span>
                </div>
                
                <div className="grid grid-cols-3 gap-3.5">
                  {[
                    { label: 'BTTS (Les 2 marquent)', value: similarities.bttsPct, color: 'from-indigo-500 to-violet-500' },
                    { label: 'OVER 1.5 BUTS', value: similarities.over15Pct, color: 'from-emerald-500 to-cyan-500' },
                    { label: 'OVER 2.5 BUTS', value: similarities.over25Pct, color: 'from-rose-500 to-amber-500' }
                  ].map((gStat, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between items-center text-[8.5px] font-bold uppercase tracking-wider text-slate-450">
                        <span className="truncate">{gStat.label}</span>
                        <span className="font-mono font-black">{gStat.value}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${gStat.color}`} style={{ width: `${gStat.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* MAIN RESULTS AND INSIGHT CARD TABS OVERLAY */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-[2rem] shadow-2xl overflow-hidden backdrop-blur-md">
            
            {/* CATEGORIES SELECTOR BAR */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 p-2 bg-slate-950/45 border-b border-slate-800/80">
              {[
                { 
                  id: 'odds', 
                  label: 'Cotes & Analyses', 
                  desc: 'Similarités & Croisements', 
                  count: similarities.similarOdds.length + repetitionCotesScores.length + crossingAnalysis.singleRepetitions,
                  icon: Sparkles,
                  color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
                },
                { 
                  id: 'h2h', 
                  label: 'Duels & Face-à-Face', 
                  desc: 'Analogie & Confrontations H2H', 
                  count: similarities.h2h.length,
                  icon: GitCompare,
                  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                },
                { 
                  id: 'sequences', 
                  label: 'Formes & Séquences', 
                  desc: 'Séries & Répétitions Sportives', 
                  count: repeatingFormSequences.length + repetitionPatterns.length,
                  icon: Activity,
                  color: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                }
              ].map((cat) => {
                const CatIcon = cat.icon;
                const isSelected = rightCategory === cat.id;
                
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setRightCategory(cat.id as any);
                      // Auto-select first tab of this category
                      if (cat.id === 'odds') setRightTab('similar');
                      else if (cat.id === 'h2h') setRightTab('h2h');
                      else setRightTab('formSequences');
                    }}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300 text-left cursor-pointer relative overflow-hidden group ${
                      isSelected 
                        ? 'bg-slate-900 border-white/[0.08] shadow-lg shadow-black/40' 
                        : 'bg-transparent border-transparent hover:bg-slate-800/10'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-0 bottom-0 left-0 w-1 bg-indigo-505 rounded-r" />
                    )}
                    <div className={`p-2 rounded-xl border shrink-0 transition-all ${
                      isSelected 
                        ? cat.color
                        : 'bg-slate-950 border-white/5 text-slate-500 group-hover:text-slate-350'
                    }`}>
                      <CatIcon className="w-4 h-4" />
                    </div>
                    
                    <div className="flex-1 min-w-0 pr-6 leading-tight">
                      <span className={`block text-[11px] font-black uppercase tracking-wider mb-0.5 ${isSelected ? 'text-slate-100' : 'text-slate-400'}`}>
                        {cat.label}
                      </span>
                      <span className="block text-[7.5px] text-slate-500 font-bold uppercase tracking-widest truncate">
                        {cat.desc}
                      </span>
                    </div>

                    {cat.count > 0 && (
                      <span className={`absolute right-3.5 top-1/2 -translate-y-1/2 text-[8px] font-mono font-black py-0.5 px-2 rounded-md ${
                        isSelected ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-950 text-slate-600'
                      }`}>
                        {cat.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* SUB-TABS SELECTOR */}
            <div className="flex flex-wrap border-b border-slate-850/80 bg-slate-950/20 p-2.5 gap-2 justify-start">
              {([
                { id: 'similar', label: 'Similarités de Cotes', count: similarities.similarOdds.length, icon: Sparkles, cat: 'odds' },
                { id: 'cotesScores', label: 'Cotes & Scores Récurrents', count: repetitionCotesScores.length, icon: Layers, cat: 'odds' },
                { id: 'crossing', label: 'Croisement de Cotes', count: crossingAnalysis.singleRepetitions, icon: Sliders, cat: 'odds' },
                { id: 'stats', label: 'Distribution 1X2 & HT/FT', icon: BarChart3, cat: 'odds' },
                
                { id: 'h2h', label: 'Analogie H2H Directe', count: similarities.h2h.length, icon: GitCompare, cat: 'h2h' },
                { id: 'teamH2h', label: 'Confrontations H2H Équipe', icon: ArrowLeftRight, cat: 'h2h' },
                
                { id: 'formSequences', label: 'Séquences de Formes', count: repeatingFormSequences.length, icon: Activity, cat: 'sequences' },
                { id: 'patterns', label: 'Répétitions Scorelines', count: repetitionPatterns.length, icon: Hash, cat: 'sequences' }
              ] as any[])
                .filter(tab => tab.cat === rightCategory)
                .map((tab) => {
                  const TabIcon = tab.icon;
                  const isSelected = rightTab === tab.id;
                  
                  return (
                    <button
                      id={`btn-tab-laser-${tab.id}`}
                      key={tab.id}
                      onClick={() => setRightTab(tab.id as any)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all duration-250 cursor-pointer ${
                        isSelected 
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15 border border-indigo-500/20' 
                          : 'bg-slate-950/40 hover:bg-slate-800/20 border border-transparent text-slate-450 hover:text-slate-200'
                      }`}
                    >
                      <TabIcon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                      {tab.count !== undefined && (
                        <span className={`text-[7.5px] font-mono font-black px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-indigo-900/50 text-indigo-200' : 'bg-slate-950 text-slate-500'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* TAB VIEWS RENDERER ANIMATION */}
            <div className="p-6">
              {loadingDb ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <Database className="w-12 h-12 text-indigo-500 animate-pulse mb-3" />
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Interrogation de Dexie DB...</span>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  
                  {/* TAB: FORM SEQUENCES (requested by user) */}
                  {rightTab === 'formSequences' && (
                    <motion.div
                      key="tab-formSequences"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-6 animate-in fade-in duration-350"
                    >
                      {/* Configuration & Search Bar */}
                      <div className="bg-slate-950/70 p-5 rounded-3xl border border-slate-800 space-y-4">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                          <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                            <Activity className="w-4.5 h-4.5 text-indigo-400" />
                            Analyseur de Séquences de Formes Répétées
                          </h3>
                          <span className="text-[8px] font-bold text-slate-550 uppercase tracking-widest bg-slate-900 border border-slate-850 py-1 px-2.5 rounded-lg font-mono">
                            Modèles de Séries de Résultats
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Sequence length */}
                          <div>
                            <label className="text-[8.5px] font-black text-slate-450 uppercase tracking-wider block mb-1.5 font-mono">Longueur de Série (Matchs)</label>
                            <div className="flex gap-1.5">
                              {[3, 4, 5, 6].map((len) => (
                                <button
                                  key={len}
                                  onClick={() => {
                                    setSequenceLength(len);
                                    setSelectedSequenceKey(null);
                                  }}
                                  className={`flex-1 py-1.5 text-xs font-mono font-black rounded-lg transition-all ${
                                    sequenceLength === len 
                                      ? 'bg-indigo-600 text-white shadow-md' 
                                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                                  }`}
                                >
                                  {len}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Filter Mode */}
                          <div>
                            <label className="text-[8.5px] font-black text-slate-450 uppercase tracking-wider block mb-1.5 font-mono">Type de Répétition</label>
                            <select
                              value={sequenceFilterMode}
                              onChange={(e) => {
                                setSequenceFilterMode(e.target.value as any);
                                setSelectedSequenceKey(null);
                              }}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-350 text-xs font-black outline-none focus:border-indigo-500 transition-all cursor-pointer uppercase h-[30px]"
                            >
                              <option value="all">Toutes les Séries</option>
                              <option value="sameTeam">Même Équipe (Multi-Saisons)</option>
                              <option value="differentTeams">Équipes Différentes</option>
                            </select>
                          </div>

                          {/* Quick string search */}
                          <div>
                            <label className="text-[8.5px] font-black text-slate-450 uppercase tracking-wider block mb-1.5 font-mono">Rechercher Série / Équipe</label>
                            <input
                              type="text"
                              placeholder="ex: V - V - V ou Arsenal..."
                              value={sequenceSearchQuery}
                              onChange={(e) => {
                                setSequenceSearchQuery(e.target.value);
                                setSelectedSequenceKey(null);
                              }}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs placeholder-slate-500 font-sans font-semibold outline-none focus:border-indigo-500 transition-all h-[30px]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Display grid of sequences */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        
                        {/* List column */}
                        <div className={`space-y-3 lg:col-span-12 ${selectedSequenceKey ? 'lg:col-span-5' : ''}`}>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                            Séries calculées ({repeatingFormSequences.length})
                          </h4>

                          <div className="space-y-2.5 max-h-[450px] overflow-y-auto custom-scrollbar pr-1">
                            {repeatingFormSequences.length === 0 ? (
                              <div className="py-16 text-center border-2 border-dashed border-slate-850 rounded-3xl bg-slate-950/20 text-slate-500 uppercase tracking-widest text-[9px] font-bold">
                                Aucun pattern de forme récurrente n'a été trouvé.
                              </div>
                            ) : (
                              repeatingFormSequences.map((item) => {
                                const isSelected = selectedSequenceKey === item.seqKey;
                                
                                return (
                                  <button
                                    key={item.seqKey}
                                    onClick={() => setSelectedSequenceKey(item.seqKey)}
                                    className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 flex flex-col gap-3 relative group overflow-hidden ${
                                      isSelected
                                        ? 'bg-indigo-650/15 border-indigo-500/50 shadow-lg shadow-indigo-650/5'
                                        : 'bg-slate-950/50 border-slate-850 hover:border-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      {/* Visual sequence circles */}
                                      <div className="flex gap-1">
                                        {item.seqKey.split(' - ').map((char, index) => {
                                          let color = 'bg-slate-700 text-slate-300';
                                          if (char === 'V') color = 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400';
                                          else if (char === 'N') color = 'bg-amber-500/20 border border-amber-500/30 text-amber-400';
                                          else if (char === 'P') color = 'bg-rose-500/20 border border-rose-500/30 text-rose-400';
                                          return (
                                            <span key={index} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-black uppercase ${color}`}>
                                              {char}
                                            </span>
                                          );
                                        })}
                                      </div>

                                      {/* Count badge */}
                                      <span className="text-[9px] font-black pointer-events-none text-indigo-400 bg-indigo-500/10 border border-indigo-400/15 px-2.5 py-0.5 rounded-xl font-mono uppercase">
                                        {item.totalCount} fois
                                      </span>
                                    </div>

                                    {/* Additional metadata */}
                                    <div className="flex justify-between items-center text-[8.5px] font-mono text-slate-500 uppercase font-black w-full">
                                      <span>
                                        {item.recurrentTeams.length > 0 ? (
                                          <span className="text-emerald-400 text-[8px]">
                                            ⭐ {item.recurrentTeams.length} Équipes habituées
                                          </span>
                                        ) : 'Répétition générale'}
                                      </span>
                                      <span>
                                        Next (G): <strong className="text-emerald-400">{item.winsNextPct}%</strong>
                                      </span>
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Details column */}
                        {selectedSequenceKey && (
                          <div className="lg:col-span-7 space-y-5">
                            {(() => {
                              const item = repeatingFormSequences.find(s => s.seqKey === selectedSequenceKey);
                              if (!item) return null;

                              return (
                                <div className="bg-slate-950/45 border border-slate-850 rounded-[2rem] p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
                                  {/* Title and Back button (for mobile) */}
                                  <div className="flex justify-between items-center pb-3 border-b border-white/[0.04]">
                                    <div className="flex flex-col">
                                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest font-mono">Détails de la Série</span>
                                      <div className="flex items-center gap-1.5 mt-1.5">
                                        {item.seqKey.split(' - ').map((char, index) => {
                                          let color = 'bg-slate-700 text-slate-300';
                                          if (char === 'V') color = 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400';
                                          else if (char === 'N') color = 'bg-amber-500/20 border border-amber-500/30 text-amber-400';
                                          else if (char === 'P') color = 'bg-rose-500/20 border border-rose-500/30 text-rose-400';
                                          return (
                                            <span key={index} className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-[9px] font-mono font-black uppercase ${color}`}>
                                              {char}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <button
                                      onClick={() => setSelectedSequenceKey(null)}
                                      className="text-[9px] font-black text-slate-400 hover:text-white uppercase font-mono px-3 py-1.5 bg-slate-900 hover:bg-slate-850 rounded-xl border border-white/5 transition-colors shrink-0"
                                    >
                                      Fermer détails
                                    </button>
                                  </div>

                                  {/* Statistics of the subsequent match (Match Suivant) */}
                                  <div className="bg-slate-900/60 p-4.5 rounded-2xl border border-slate-850/80 space-y-3.5">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block font-sans">
                                        Comportement au match suivant ({item.totalNext} fois)
                                      </span>
                                      <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-widest">
                                        Prochain match statistique
                                      </span>
                                    </div>

                                    {item.totalNext === 0 ? (
                                      <div className="text-[9px] text-slate-500 uppercase text-center font-bold">La saison n'a pas encore de match suivant documenté</div>
                                    ) : (
                                      <div className="space-y-3.5">
                                        {/* Visual progress bars */}
                                        <div className="grid grid-cols-3 gap-3.5 text-center font-mono">
                                          {/* Wins next */}
                                          <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded-xl border border-white/[0.01]">
                                            <span className="block text-[7.5px] font-bold text-slate-550 uppercase font-sans">Gagner</span>
                                            <span className="block text-13px font-extrabold text-emerald-400">{item.winsNextPct}%</span>
                                            <span className="block text-[7.5px] font-semibold text-slate-500">({item.winsNext} fois)</span>
                                          </div>

                                          {/* Draws next */}
                                          <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded-xl border border-white/[0.01]">
                                            <span className="block text-[7.5px] font-bold text-slate-555 uppercase font-sans font-mono">Nul [X]</span>
                                            <span className="block text-13px font-extrabold text-slate-350">{item.drawsNextPct}%</span>
                                            <span className="block text-[7.5px] font-semibold text-slate-500">({item.drawsNext} fois)</span>
                                          </div>

                                          {/* Losses next */}
                                          <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded-xl border border-white/[0.01]">
                                            <span className="block text-[7.5px] font-bold text-slate-550 uppercase font-sans">Perdre</span>
                                            <span className="block text-13px font-extrabold text-rose-400">{item.lossesNextPct}%</span>
                                            <span className="block text-[7.5px] font-semibold text-slate-500">({item.lossesNext} fois)</span>
                                          </div>
                                        </div>

                                        {/* Cumulative full percent bar */}
                                        <div className="h-2 w-full rounded-full overflow-hidden bg-slate-950 flex font-mono border border-slate-900">
                                          <div className="h-full bg-emerald-500" style={{ width: `${item.winsNextPct}%` }} title={`Gagner : ${item.winsNextPct}%`} />
                                          <div className="h-full bg-slate-400" style={{ width: `${item.drawsNextPct}%` }} title={`Nul : ${item.drawsNextPct}%`} />
                                          <div className="h-full bg-rose-500" style={{ width: `${item.lossesNextPct}%` }} title={`Perdre : ${item.lossesNextPct}%`} />
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* SAME-TEAM SEASON REPETITION METRICS */}
                                  {item.recurrentTeams.length > 0 && (
                                    <div className="space-y-2.5">
                                      <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest block font-mono">Répété sur différentes Saisons par la même équipe :</span>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-36 overflow-y-auto custom-scrollbar">
                                        {item.recurrentTeams.map((rec, recIdx) => (
                                          <div key={recIdx} className="bg-slate-900/30 p-2.5 rounded-xl border border-slate-850 flex flex-col gap-1 text-[9px]">
                                            <div className="flex items-center gap-1.5 w-full">
                                              <img 
                                                src={getTeamLogo(rec.team)} 
                                                alt="" 
                                                className="w-4.5 h-4.5 rounded-full bg-slate-900 border border-white/5 object-contain"
                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                              />
                                              <span className="font-extrabold text-slate-200 uppercase truncate">{rec.team}</span>
                                            </div>
                                            <span className="text-slate-500 font-bold font-mono text-[7.5px] uppercase mt-0.5">
                                              Répété sur {rec.seasonsCount} saisons différentes : {rec.seasons.join(', ')}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Occurrence list details for the pattern */}
                                  <div className="space-y-2.5">
                                    <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest block font-mono">
                                      Rencontres uniques composant la Série ({item.occurrences.length})
                                    </span>

                                    <div className="space-y-2.5 max-h-56 overflow-y-auto custom-scrollbar pr-1.5">
                                      {item.occurrences.map((occ, occIdx) => {
                                        return (
                                          <div key={occIdx} className="bg-slate-950/70 p-3 rounded-2xl border border-slate-850 hover:border-slate-800 transition-colors flex flex-col gap-2.5 text-[9px] font-sans">
                                            {/* Occ Header */}
                                            <div className="flex justify-between items-center pb-1.5 border-b border-white/[0.02]">
                                              <div className="flex items-center gap-2">
                                                <img 
                                                  src={getTeamLogo(occ.team)} 
                                                  alt="" 
                                                  className="w-4 h-4 rounded-full bg-slate-900 border border-white/5 object-contain"
                                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                />
                                                <span className="font-bold text-slate-200 uppercase">{occ.team}</span>
                                                <span className="text-[7.5px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/15 py-0.5 px-1.5 rounded uppercase font-mono">
                                                  {occ.season}
                                                </span>
                                              </div>
                                              <span className="text-slate-500 font-mono">Journées {occ.startRound} à {occ.endRound}</span>
                                            </div>

                                            {/* The series mini layout */}
                                            <div className="flex justify-between items-center">
                                              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[70%]">
                                                {occ.games.map((g, gi) => {
                                                  let color = 'text-slate-400';
                                                  if (g.outcome === 'V') color = 'text-emerald-400';
                                                  else if (g.outcome === 'N') color = 'text-amber-400';
                                                  else if (g.outcome === 'P') color = 'text-rose-400';
                                                  
                                                  return (
                                                    <span key={gi} className="text-[8.5px] tracking-tight bg-slate-900/60 px-2 py-1 rounded-lg border border-white/[0.01]" title={`${g.isHome ? 'Dom' : 'Ext'} vs ${g.opponent} (${g.score})`}>
                                                      J{g.round} {g.isHome ? 'Dom' : 'Ext'} <strong className={`${color}`}>{g.outcome}</strong> <span className="text-[7.5px] text-slate-550 font-mono">({g.score})</span>
                                                    </span>
                                                  );
                                                })}
                                              </div>

                                              {/* Predict outcome badge */}
                                              {occ.nextOutcome ? (
                                                <div className="flex flex-col items-end gap-0.5 bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-1 rounded-xl text-right">
                                                  <span className="text-[7.5px] text-slate-550 font-bold uppercase tracking-wider font-mono">Match suivant :</span>
                                                  <span className="font-mono text-[9px] font-black text-emerald-400">
                                                    J{occ.endRound + 1} ({occ.nextOutcome}) <span className="text-slate-550 text-[8px] font-light truncate max-w-[80px]">({occ.nextScore} vs {occ.nextOpponent})</span>
                                                  </span>
                                                </div>
                                              ) : (
                                                <span className="text-[7.5px] text-slate-600 uppercase font-bold font-mono italic">Fin de saison</span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                </div>
                              );
                            })()}
                          </div>
                        )}

                      </div>
                    </motion.div>
                  )}

                  {/* TAB 0: ODD CROSSING SCANNER TOOL (requested by user) */}
                  {rightTab === 'crossing' && (
                    <motion.div
                      key="tab-crossing"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-6 animate-in fade-in duration-350"
                    >
                      {/* Interactive Configuration Header */}
                      <div className="bg-slate-950/70 p-5 rounded-3xl border border-slate-800 space-y-4">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                          <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
                            <Sliders className="w-4.5 h-4.5 text-indigo-400" />
                            Scanner de Croisement de Cotes
                          </h3>
                          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900 border border-slate-850 py-1 px-2.5 rounded-lg font-mono">
                            Outil d'Analyse Analogique
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                          <div>
                            <label className="text-[8.5px] font-black text-slate-450 uppercase tracking-wider block mb-1.5 font-mono">Cote Principale (e.g. 1.23)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={scanOdd1}
                              onChange={(e) => setScanOdd1(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-indigo-350 text-xs font-mono font-black outline-none focus:border-indigo-500 transition-all text-center"
                            />
                          </div>
                          <div>
                            <label className="text-[8.5px] font-black text-slate-450 uppercase tracking-wider block mb-1.5 font-mono">Cote du Nul [X] (e.g. 3.30)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={scanOddX}
                              onChange={(e) => setScanOddX(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-400 text-xs font-mono font-black outline-none focus:border-indigo-500 transition-all text-center"
                            />
                          </div>
                          <div>
                            <label className="text-[8.5px] font-black text-slate-450 uppercase tracking-wider block mb-1.5 font-mono">Cote d'En face (e.g. 6.10)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={scanOdd2}
                              onChange={(e) => setScanOdd2(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-rose-450 text-xs font-mono font-black outline-none focus:border-rose-500 transition-all text-center"
                            />
                          </div>
                          <div>
                            <label className="text-[8.5px] font-black text-slate-450 uppercase tracking-wider block mb-1.5 font-mono">Précision/Tolérance</label>
                            <select
                              value={scanTolPercent}
                              onChange={(e) => setScanTolPercent(Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-805 rounded-xl px-3 py-2.5 text-emerald-400 text-xs font-black outline-none focus:border-emerald-500 transition-all uppercase cursor-pointer"
                            >
                              <option value="0">Strict (±0%)</option>
                              <option value="5">Précis (±5%)</option>
                              <option value="8">Fin (±8%)</option>
                              <option value="10">Classique (±10%)</option>
                              <option value="12">Conseillé (±12%)</option>
                              <option value="15">Large (±15%)</option>
                              <option value="20">Très large (±20%)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[8.5px] font-black text-slate-450 uppercase tracking-wider block mb-1.5 font-mono">Périmètre d'Analyse</label>
                            <select
                              value={scanLeagueMode}
                              onChange={(e) => setScanLeagueMode(e.target.value as 'active' | 'all')}
                              className="w-full bg-slate-900 border border-slate-805 rounded-xl px-3 py-2.5 text-indigo-400 text-xs font-black outline-none focus:border-indigo-500 transition-all uppercase cursor-pointer-auto"
                            >
                              <option value="active">Ligue Active Uniquement</option>
                              <option value="all">Toutes les Ligues</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Analysis Results Display */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sans">
                        
                        {/* Column Left: Single Odd Scan */}
                        <div className="bg-slate-950/45 p-5 rounded-3xl border border-slate-800 space-y-4">
                          <div className="flex justify-between items-center pb-2 border-b border-white/[0.04]">
                            <span className="text-[9.5px] font-black text-indigo-400 uppercase tracking-wider font-sans">
                              Analyse Individuelle : Cote {scanOdd1}
                            </span>
                            <span className="text-[8px] text-slate-500 font-mono font-bold uppercase">Cote seule</span>
                          </div>
                          
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-mono font-black text-white">
                              {crossingAnalysis.singleRepetitions}
                            </span>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">occurrences trouvées</span>
                          </div>

                          {crossingAnalysis.singleRepetitions > 0 ? (
                            <div className="space-y-4">
                              {/* Stat bars */}
                              <div className="space-y-2">
                                <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">Distribution 1X2 (%) :</span>
                                <div className="h-6 w-full rounded-lg bg-slate-900 border border-slate-850 overflow-hidden flex font-mono text-[9px] font-black text-center text-slate-950 leading-none">
                                  {crossingAnalysis.singleWins > 0 && (
                                    <div 
                                      className="h-full bg-emerald-400 flex items-center justify-center" 
                                      style={{ width: `${(crossingAnalysis.singleWins / crossingAnalysis.singleRepetitions) * 100}%` }}
                                      title={`Victoires : ${crossingAnalysis.singleWins} (${Math.round((crossingAnalysis.singleWins / crossingAnalysis.singleRepetitions) * 100)}%)`}
                                    >
                                      G ({Math.round((crossingAnalysis.singleWins / crossingAnalysis.singleRepetitions) * 100)}%)
                                    </div>
                                  )}
                                  {crossingAnalysis.singleDraws > 0 && (
                                    <div 
                                      className="h-full bg-slate-300 flex items-center justify-center border-l border-r border-slate-950/20" 
                                      style={{ width: `${(crossingAnalysis.singleDraws / crossingAnalysis.singleRepetitions) * 105}%` }}
                                      title={`Nuls : ${crossingAnalysis.singleDraws} (${Math.round((crossingAnalysis.singleDraws / crossingAnalysis.singleRepetitions) * 100)}%)`}
                                    >
                                      N ({Math.round((crossingAnalysis.singleDraws / crossingAnalysis.singleRepetitions) * 100)}%)
                                    </div>
                                  )}
                                  {crossingAnalysis.singleLosses > 0 && (
                                    <div 
                                      className="h-full bg-rose-500 flex items-center justify-center text-white" 
                                      style={{ width: `${(crossingAnalysis.singleLosses / crossingAnalysis.singleRepetitions) * 100}%` }}
                                      title={`Défaites : ${crossingAnalysis.singleLosses} (${Math.round((crossingAnalysis.singleLosses / crossingAnalysis.singleRepetitions) * 100)}%)`}
                                    >
                                      P ({Math.round((crossingAnalysis.singleLosses / crossingAnalysis.singleRepetitions) * 100)}%)
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-center text-[9px] font-mono p-2.5 bg-slate-950/40 rounded-xl border border-white/[0.02]">
                                <div>
                                  <div className="text-emerald-400 font-black text-xs">{crossingAnalysis.singleWins}</div>
                                  <div className="text-[7.5px] text-slate-500 uppercase tracking-widest text-center mt-0.5 font-sans">Victoires</div>
                                </div>
                                <div className="border-l border-r border-white/5">
                                  <div className="text-slate-300 font-black text-xs">{crossingAnalysis.singleDraws}</div>
                                  <div className="text-[7.5px] text-slate-500 uppercase tracking-widest text-center mt-0.5 font-sans">Nuls</div>
                                </div>
                                <div>
                                  <div className="text-rose-400 font-black text-xs">{crossingAnalysis.singleLosses}</div>
                                  <div className="text-[7.5px] text-slate-500 uppercase tracking-widest text-center mt-0.5 font-sans">Défaites</div>
                                </div>
                              </div>

                              {/* Names of carrying teams */}
                              <div className="space-y-1.5">
                                <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest block font-mono">Équipes portant cette cote :</span>
                                <div className="flex flex-wrap gap-1 max-h-[110px] overflow-y-auto custom-scrollbar p-1">
                                  {crossingAnalysis.singleTeams.length === 0 ? (
                                    <span className="text-[8.5px] text-slate-600 italic">Aucune équipe listée</span>
                                  ) : (
                                    crossingAnalysis.singleTeams.map((tName, tIdx) => (
                                      <span key={tIdx} className="text-[8px] font-black text-indigo-300 bg-indigo-500/10 border border-indigo-400/20 py-1 px-2.5 rounded-xl uppercase tracking-wider">
                                        {tName}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="py-12 text-center text-slate-550 font-bold uppercase tracking-wider text-[9px]">
                              Aucune équipe ne porte cette cote dans la base courante pour cette ligue.
                            </div>
                          )}
                        </div>

                        {/* Column Right: Crossed Odds Scan */}
                        <div className="bg-slate-950/45 p-5 rounded-3xl border border-slate-800 space-y-4">
                          <div className="flex justify-between items-center pb-2 border-b border-white/[0.04]">
                            <span className="text-[9.5px] font-black text-rose-450 uppercase tracking-wider font-sans">
                              Analyse Croisée : {scanOdd1} vs {scanOdd2}
                            </span>
                            <span className="text-[8px] text-slate-500 font-mono font-bold uppercase">Cotes croisées</span>
                          </div>
                          
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-mono font-black text-white">
                              {crossingAnalysis.crossedRepetitions}
                            </span>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">duels croisés identifiés</span>
                          </div>

                          {crossingAnalysis.crossedRepetitions > 0 ? (
                            <div className="space-y-4">
                              {/* Stat bars */}
                              <div className="space-y-2">
                                <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">Performance croisée (%) :</span>
                                <div className="h-6 w-full rounded-lg bg-slate-900 border border-slate-850 overflow-hidden flex font-mono text-[9px] font-black text-center text-slate-950 leading-none">
                                  {crossingAnalysis.crossedWins > 0 && (
                                    <div 
                                      className="h-full bg-emerald-400 flex items-center justify-center animate-pulse" 
                                      style={{ width: `${(crossingAnalysis.crossedWins / crossingAnalysis.crossedRepetitions) * 100}%` }}
                                      title={`Victoires : ${crossingAnalysis.crossedWins} (${Math.round((crossingAnalysis.crossedWins / crossingAnalysis.crossedRepetitions) * 100)}%)`}
                                    >
                                      G ({Math.round((crossingAnalysis.crossedWins / crossingAnalysis.crossedRepetitions) * 100)}%)
                                    </div>
                                  )}
                                  {crossingAnalysis.crossedDraws > 0 && (
                                    <div 
                                      className="h-full bg-slate-300 flex items-center justify-center border-l border-r border-slate-950/20" 
                                      style={{ width: `${(crossingAnalysis.crossedDraws / crossingAnalysis.crossedRepetitions) * 100}%` }}
                                      title={`Nuls : ${crossingAnalysis.crossedDraws} (${Math.round((crossingAnalysis.crossedDraws / crossingAnalysis.crossedRepetitions) * 100)}%)`}
                                    >
                                      N ({Math.round((crossingAnalysis.crossedDraws / crossingAnalysis.crossedRepetitions) * 100)}%)
                                    </div>
                                  )}
                                  {crossingAnalysis.crossedLosses > 0 && (
                                    <div 
                                      className="h-full bg-rose-500 flex items-center justify-center text-white" 
                                      style={{ width: `${(crossingAnalysis.crossedLosses / crossingAnalysis.crossedRepetitions) * 100}%` }}
                                      title={`Défaites : ${crossingAnalysis.crossedLosses} (${Math.round((crossingAnalysis.crossedLosses / crossingAnalysis.crossedRepetitions) * 100)}%)`}
                                    >
                                      P ({Math.round((crossingAnalysis.crossedLosses / crossingAnalysis.crossedRepetitions) * 100)}%)
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-center text-[9px] font-mono p-2.5 bg-slate-950/40 rounded-xl border border-white/[0.02]">
                                <div>
                                  <div className="text-emerald-400 font-black text-xs">{crossingAnalysis.crossedWins}</div>
                                  <div className="text-[7.5px] text-slate-500 uppercase tracking-widest text-center mt-0.5 font-sans">Victoires</div>
                                </div>
                                <div className="border-l border-r border-white/5">
                                  <div className="text-slate-300 font-black text-xs">{crossingAnalysis.crossedDraws}</div>
                                  <div className="text-[7.5px] text-slate-500 uppercase tracking-widest text-center mt-0.5 font-sans">Nuls</div>
                                </div>
                                <div>
                                  <div className="text-rose-400 font-black text-xs">{crossingAnalysis.crossedLosses}</div>
                                  <div className="text-[7.5px] text-slate-500 uppercase tracking-widest text-center mt-0.5 font-sans">Défaites</div>
                                </div>
                              </div>

                              {/* Names of carrying teams in crossed environment */}
                              <div className="space-y-1.5">
                                <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest block font-mono">Équipes de d'affrontements :</span>
                                <div className="flex flex-wrap gap-1 max-h-[110px] overflow-y-auto custom-scrollbar p-1">
                                  {crossingAnalysis.crossedTeams.length === 0 ? (
                                    <span className="text-[8.5px] text-slate-600 italic">Aucune équipe listée</span>
                                  ) : (
                                    crossingAnalysis.crossedTeams.map((tName, tIdx) => (
                                      <span key={tIdx} className="text-[8px] font-black text-rose-300 bg-rose-500/10 border border-rose-400/25 py-1 px-2.5 rounded-xl uppercase tracking-wider">
                                        {tName}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="py-12 text-center text-slate-550 font-bold uppercase tracking-wider text-[9px]">
                              Aucun duel croisé direct trouvé dans la base active pour {scanOdd1} vs {scanOdd2}.
                            </div>
                          )}
                        </div>

                      </div>

                      {/* DIAGNOSIS SYSTEM PANEL : COMPARING RATIOS */}
                      <div className="bg-gradient-to-br from-indigo-950/25 via-slate-950 to-slate-950 p-6 rounded-[2rem] border border-indigo-500/15 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 blur-3xl rounded-full pointer-events-none" />
                        
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
                          <h4 className="text-[11px] font-black text-slate-100 uppercase tracking-wider font-sans">
                            Analyse de Similarité & Fiabilité Statistique
                          </h4>
                        </div>
                        
                        <p className="text-[10.5px] text-slate-300 leading-relaxed font-sans text-justify">
                          {crossingAnalysis.similarityVerdict}
                        </p>
                      </div>

                      {/* MATCH LIST SECTION */}
                      {crossingAnalysis.singleMatches.length > 0 && (
                        <div className="space-y-4 pt-2 font-sans">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                            Matchs de référence identifiés ({crossingAnalysis.singleMatches.length})
                          </h4>
                          
                          <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                            {crossingAnalysis.singleMatches.map((m, mIdx) => {
                              // Highlight if it's a crossed match
                              const isCrossed = crossingAnalysis.crossedMatches.some(cm => cm.id === m.id);
                              
                              return (
                                <div 
                                  key={mIdx} 
                                  className={`p-4 rounded-2xl border transition-all ${
                                    isCrossed 
                                      ? 'bg-gradient-to-r from-indigo-950/15 to-violet-950/25 border-indigo-500/35 hover:border-indigo-500/50 shadow-md shadow-indigo-650/5' 
                                      : 'bg-slate-950/45 border-slate-850 hover:border-slate-800/80'
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2.5 pb-2 border-b border-white/[0.02]">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[8px] font-black text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded uppercase tracking-wide font-mono">
                                        {m.season} J{m.round}
                                      </span>
                                      {isCrossed && (
                                        <span className="text-[7px] font-black text-rose-300 bg-rose-500/15 border border-rose-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse font-mono">
                                          🎯 Match Croisé direct {scanOdd1} vs {scanOdd2}
                                        </span>
                                      )}
                                    </div>
                                    
                                    <div className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                                      Cotes: <span className="text-white bg-slate-950 px-1.5 py-0.5 border border-white/5 rounded font-black">{m.odds1}</span> - <span className="text-slate-450 bg-slate-950 px-1.5 py-0.5 border border-white/5 rounded font-black">{m.oddsX}</span> - <span className="text-rose-400 bg-slate-950 px-1.5 py-0.5 border border-white/5 rounded font-black">{m.odds2}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between gap-4 py-1">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <img 
                                        src={getTeamLogo(m.homeTeam)} 
                                        alt="" 
                                        className="w-5 h-5 rounded-full object-contain p-0.5 bg-slate-900 border border-white/10 shrink-0 shadow-sm"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                      <span className="text-[11px] font-black text-slate-200 uppercase truncate max-w-[150px] font-sans">
                                        {m.homeTeam}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-xs font-mono font-black text-white bg-slate-950 px-3 py-1 rounded-xl border border-slate-850">
                                        {m.homeScore} - {m.awayScore}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2.5 min-w-0 justify-end font-sans">
                                      <span className="text-[11px] font-black text-slate-200 uppercase truncate max-w-[150px] text-right">
                                        {m.awayTeam}
                                      </span>
                                      <img 
                                        src={getTeamLogo(m.awayTeam)} 
                                        alt="" 
                                        className="w-5 h-5 rounded-full object-contain p-0.5 bg-slate-900 border border-white/10 shrink-0 shadow-sm"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    </div>
                                  </div>

                                  {m.scoreDetails && ((m.scoreDetails.homeGoals && m.scoreDetails.homeGoals.length > 0) || (m.scoreDetails.awayGoals && m.scoreDetails.awayGoals.length > 0)) && (
                                    <div className="border-t border-slate-900 outline-none pt-2 w-full mt-2">
                                      {renderGoalTimeline(m)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    </motion.div>
                  )}

                  {/* TAB 1: SIMILAR ODDS LIST WITH FULL DETAILS */}
                  {rightTab === 'similar' && (
                    <motion.div
                      key="tab-similar"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-4"
                    >
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4 text-indigo-400" />
                          Historique de rencontres trouvées
                        </span>
                        {selectedHtFtFilter !== 'all' && (
                          <span className="text-[9px] font-black bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 px-2 py-0.5 rounded-lg uppercase">
                            Filtré HT/FT : {summarizeHtFtLabel(selectedHtFtFilter)}
                          </span>
                        )}
                      </div>

                      {similarities.similarOdds.length === 0 ? (
                        <div className="py-16 text-center border-2 border-dashed border-slate-800/80 rounded-3xl bg-slate-950/20">
                          <Info className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                          <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Aucune correspondance archivée</h4>
                          <p className="text-[9px] text-slate-500 uppercase mt-1.5 leading-relaxed max-w-sm mx-auto">
                            Aucun match trouvé correspondant à vos paramètres de cotes et tolérance dans la ligue active. Essayez d'augmenter la tolérance.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
                          {similarities.similarOdds.map((m, idx) => {
                            const hS = parseInt(m.homeScore || '0');
                            const aS = parseInt(m.awayScore || '0');
                            const htFt = computeHTFT(hS, aS, m.scoreDetails);
                            
                            return (
                              <div key={idx} className="bg-slate-950/50 hover:bg-slate-950 p-4 rounded-2xl border border-slate-850 hover:border-slate-700/60 transition-all duration-300 flex flex-col gap-3 group relative shadow-sm">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                  
                                  {/* Left section: League, Season, Round & Team logos */}
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[8px] font-black text-indigo-400 bg-indigo-500/5 border border-indigo-500/15 px-2 py-0.5 rounded uppercase tracking-tighter text-center font-mono">
                                        {m.season}
                                      </span>
                                      <span className="text-[7.5px] font-mono font-bold text-slate-500 text-center uppercase">
                                        Jour {m.round}
                                      </span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      {/* Home Team Logo & Name */}
                                      <div className="flex items-center gap-2">
                                        <img 
                                          src={getTeamLogo(m.homeTeam)} 
                                          alt="" 
                                          className="w-5 h-5 rounded-full object-contain pointer-events-none ring-1 ring-white/10 shrink-0 bg-slate-900 p-0.5"
                                          referrerPolicy="no-referrer"
                                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                        />
                                        <span className="text-[11px] font-black text-slate-200 group-hover:text-white transition-colors truncate uppercase font-sans">
                                          {m.homeTeam}
                                        </span>
                                      </div>
                                      
                                      <span className="text-[9px] font-bold text-slate-600 font-mono">vs</span>

                                      {/* Away Team Logo & Name */}
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-black text-slate-200 group-hover:text-white transition-colors truncate uppercase font-sans">
                                          {m.awayTeam}
                                        </span>
                                        <img 
                                          src={getTeamLogo(m.awayTeam)} 
                                          alt="" 
                                          className="w-5 h-5 rounded-full object-contain pointer-events-none ring-1 ring-white/10 shrink-0 bg-slate-900 p-0.5"
                                          referrerPolicy="no-referrer"
                                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right section: Odds tag, Score & HT/FT badge */}
                                  <div className="flex items-center gap-3 shrink-0 self-start md:self-center ml-auto md:ml-0">
                                    {htFt && (
                                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-[8px] font-black uppercase tracking-wider">
                                        HT/FT: {htFt}
                                      </span>
                                    )}
                                    
                                    {/* Odds breakdown visually */}
                                    <div className="flex items-center gap-1.5 text-[7.5px] font-mono font-bold text-slate-500 bg-black/30 px-2 py-0.5 rounded border border-white/5">
                                      <span>{m.odds1 || '-'}</span>
                                      <span className="text-slate-800">|</span>
                                      <span>{m.oddsX || '-'}</span>
                                      <span className="text-slate-800">|</span>
                                      <span>{m.odds2 || '-'}</span>
                                    </div>

                                    {/* Final Score Indicator Badge */}
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl text-xs font-black text-emerald-400 font-mono tracking-wider shadow-sm">
                                      {m.homeScore} - {m.awayScore}
                                    </div>
                                  </div>
                                </div>

                                {/* Goalscorer times line */}
                                <div className="border-t border-slate-900 pt-2 flex items-center gap-2">
                                  <span className="text-[7.5px] font-black text-slate-500 uppercase tracking-widest shrink-0 font-mono select-none">Chronologie des buts :</span>
                                  <div className="overflow-x-auto no-scrollbar py-0.5">
                                    {renderGoalTimeline(m)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB: COTES ET SCORES SIMILAIRES */}
                  {rightTab === 'cotesScores' && (
                    <motion.div
                      key="tab-cotesScores"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-4"
                    >
                      {/* Sub-tab navigation inside Cotes et Scores */}
                      <div className="flex bg-slate-900/80 p-1 rounded-2xl border border-slate-800/80 gap-1">
                        <button
                          onClick={() => { setOddsScoresSubTab('recurrentScores'); setMaxVisibleOdds(30); }}
                          className={`flex-1 py-1.5 px-3 rounded-xl text-[9.5px] uppercase font-black tracking-wider transition-all cursor-pointer ${
                            oddsScoresSubTab === 'recurrentScores'
                              ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-400'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/40 border border-transparent'
                          }`}
                        >
                          Scores récurrents
                        </button>
                        <button
                          onClick={() => { setOddsScoresSubTab('oddsRates'); setMaxVisibleOdds(30); }}
                          className={`flex-1 py-1.5 px-3 rounded-xl text-[9.5px] uppercase font-black tracking-wider transition-all cursor-pointer ${
                            oddsScoresSubTab === 'oddsRates'
                              ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-400'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/40 border border-transparent'
                          }`}
                        >
                          Taux par Combinaison
                        </button>
                        <button
                          onClick={() => { setOddsScoresSubTab('individualOdds'); setMaxVisibleOdds(45); }}
                          className={`flex-1 py-1.5 px-3 rounded-xl text-[9.5px] uppercase font-black tracking-wider transition-all cursor-pointer ${
                            oddsScoresSubTab === 'individualOdds'
                              ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-400'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/40 border border-transparent'
                          }`}
                        >
                          Taux par Cote Unique
                        </button>
                      </div>

                      {oddsScoresSubTab === 'recurrentScores' ? (
                        <>
                          <div className="flex justify-between items-center pb-1 border-b border-slate-800/50">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                              <Layers className="w-4 h-4 text-indigo-400" />
                              Cotes Equivalentes + Scores Répétés
                            </span>
                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                              {repetitionCotesScores.length} groupes
                            </span>
                          </div>

                          {repetitionCotesScores.length === 0 ? (
                            <div className="py-16 text-center border-2 border-dashed border-slate-800/80 rounded-3xl bg-slate-950/20 text-slate-500 uppercase tracking-widest text-[9px] font-bold">
                              Aucun scoreline récurrent (au moins 2 occurrences) n'a été trouvé parmi les matches à cotes similaires.
                            </div>
                          ) : (
                            <div className="space-y-4 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                              <p className="text-[9.5px] text-slate-400 uppercase leading-relaxed font-sans">
                                Les groupes ci-dessous réunissent les matches qui partagent <strong className="text-white">à la fois</strong> des cotes comparables et d'autres matches ayant abouti au <strong className="text-indigo-400">même score final exact (et même dynamique mi-temps)</strong>.
                              </p>

                              {repetitionCotesScores.map((gp, i) => (
                                <div key={i} className="bg-slate-950/70 p-4 rounded-2xl border border-slate-850 space-y-3.5 hover:border-slate-800 transition-all">
                                  
                                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.02]">
                                    <span className="text-[10.5px] font-black text-white uppercase tracking-wider flex items-center gap-2 font-sans">
                                      <Target className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
                                      Score récurrent : <span className="text-indigo-400 font-mono font-black py-0.5 px-2 bg-indigo-500/10 rounded-lg">{gp.pattern}</span>
                                    </span>
                                    
                                    <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-400/20 px-2.5 py-0.5 rounded-xl font-mono uppercase tracking-wide">
                                      {gp.count} matches correspondants
                                    </span>
                                  </div>

                                  <div className="space-y-2.5 pl-2 relative border-l border-indigo-500/10">
                                    {gp.matches.map((m, mi) => (
                                      <div key={mi} className="flex justify-between items-center text-[10px] text-slate-400 uppercase gap-3 flex-wrap hover:text-slate-200 transition-colors">
                                        <div className="flex items-center gap-2 min-w-0 font-sans">
                                          <span className="text-[8px] font-black text-slate-600 font-mono bg-slate-900 border border-slate-850 px-1 py-0.5 rounded">
                                            {m.season} J{m.round}
                                          </span>
                                          
                                          <div className="flex items-center gap-1.5 truncate">
                                            <img 
                                              src={getTeamLogo(m.homeTeam)} 
                                              alt="" 
                                              className="w-3.5 h-3.5 rounded-full object-contain pointer-events-none ring-1 ring-white/5 bg-slate-900"
                                              referrerPolicy="no-referrer"
                                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                            />
                                            <span className="font-bold text-slate-300 truncate max-w-[120px]">{m.homeTeam}</span>
                                            <span className="text-[8px] text-slate-600 lowercase font-medium">vs</span>
                                            <span className="font-bold text-slate-300 truncate max-w-[120px]">{m.awayTeam}</span>
                                            <img 
                                              src={getTeamLogo(m.awayTeam)} 
                                              alt="" 
                                              className="w-3.5 h-3.5 rounded-full object-contain pointer-events-none ring-1 ring-white/5 bg-slate-900"
                                              referrerPolicy="no-referrer"
                                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                            />
                                          </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-1.5 shrink-0 ml-auto md:ml-0 font-mono">
                                          {m.odds1 && (
                                            <span className="text-[8px] text-slate-500 bg-black/20 border border-white/5 py-0.5 px-1.5 rounded">
                                              Cotes: {m.odds1} - {m.oddsX} - {m.odds2}
                                            </span>
                                          )}
                                          <span className="text-[8px] text-indigo-400 bg-indigo-500/5 px-1.5 py-0.5 border border-indigo-500/10 rounded">
                                            {(m.scoreDetails?.homeGoals || []).length + (m.scoreDetails?.awayGoals || []).length} but(s)
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : oddsScoresSubTab === 'oddsRates' ? (
                        <>
                          <div className="flex justify-between items-center pb-1 border-b border-slate-800/50">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                              <Target className="w-4 h-4 text-emerald-400" />
                              Performance & Pourcentage de Réussite des Cotes (Combinaisons)
                            </span>
                          </div>

                          {/* Quick Interactive Search filter */}
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Rechercher des cotes (ex: 1.25)..."
                              value={oddsSearchQuery}
                              onChange={(e) => {
                                setOddsSearchQuery(e.target.value);
                                setMaxVisibleOdds(30);
                              }}
                              className="w-full bg-slate-950/80 text-[10px] text-slate-100 placeholder-slate-500 font-sans tracking-wide uppercase pl-9 pr-14 py-2.5 rounded-xl border border-slate-850 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/10 focus:outline-none transition-all placeholder:capitalize"
                            />
                            <div className="absolute left-3.5 top-3 text-slate-600">
                              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                            </div>
                            {oddsSearchQuery && (
                              <button
                                onClick={() => {
                                  setOddsSearchQuery('');
                                  setMaxVisibleOdds(30);
                                }}
                                className="absolute right-3.5 top-2.5 text-slate-400 hover:text-white text-[8px] font-black font-sans uppercase bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded"
                              >
                                Effacer
                              </button>
                            )}
                          </div>

                          {filteredOddsPerformance.length === 0 ? (
                            <div className="py-16 text-center border-2 border-dashed border-slate-850 rounded-3xl bg-slate-950/20 text-slate-500 uppercase tracking-widest text-[9px] font-bold">
                              {oddsSearchQuery 
                                ? "Aucun triplet de cotes ne correspond à votre recherche."
                                : "Aucun match qualifié avec des cotes complètes n'a été identifié."}
                            </div>
                          ) : (
                            <div className="space-y-4 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                              <p className="text-[9px] text-slate-400 uppercase leading-relaxed font-sans">
                                Ce tableau regroupe chaque triplet unique de cotes présente en base. Pour chaque triplet, nous calculons le taux exact où chaque cote individuelle s'est révélée gagnante.
                              </p>

                              {filteredOddsPerformance.slice(0, maxVisibleOdds).map((item, idx) => (
                                <div key={idx} className="bg-slate-950/80 p-4 rounded-2xl border border-slate-850 hover:border-slate-800 transition-all space-y-3.5">
                                  
                                  {/* Header of Triplet Info */}
                                  <div className="flex items-center justify-between border-b border-white/[0.02] pb-2 gap-2 flex-wrap">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9.5px] uppercase font-black text-slate-400 font-sans tracking-wider mr-1">Combine :</span>
                                      <span className="text-[9.5px] font-mono font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 py-0.5 px-2 rounded-lg">
                                        1: {parseFloat(item.odds1).toFixed(2)}
                                      </span>
                                      <span className="text-slate-700 text-xs font-mono font-bold">-</span>
                                      <span className="text-[9.5px] font-mono font-black text-amber-400 bg-amber-500/5 border border-amber-500/10 py-0.5 px-2 rounded-lg">
                                        N: {parseFloat(item.oddsX).toFixed(2)}
                                      </span>
                                      <span className="text-slate-700 text-xs font-mono font-bold">-</span>
                                      <span className="text-[9.5px] font-mono font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 py-0.5 px-2 rounded-lg">
                                        2: {parseFloat(item.odds2).toFixed(2)}
                                      </span>
                                    </div>
                                    
                                    <span className="text-[8px] font-black text-slate-500 font-mono uppercase bg-slate-900 border border-slate-850 px-2 py-1 rounded-xl">
                                      {item.totalMatches} occurrence(s)
                                    </span>
                                  </div>

                                  {/* Detailed odds percentages */}
                                  <div className="grid grid-cols-3 gap-2 text-center select-none">
                                    {/* 1 */}
                                    <div className="bg-slate-900/30 p-2 rounded-xl border border-slate-850/40 space-y-1">
                                      <span className="block text-[7.5px] font-bold text-slate-600 uppercase tracking-wider">Cote 1</span>
                                      <span className="block text-[11px] font-mono font-extrabold text-slate-300">{item.odds1}</span>
                                      <div className={`text-[12px] font-mono font-black ${item.pct1 > 45 ? 'text-emerald-400' : 'text-indigo-400/80'}`}>
                                        {item.pct1}%
                                      </div>
                                      <span className="block text-[7px] text-slate-600 uppercase font-black">({item.homeWins} victoires)</span>
                                    </div>

                                    {/* X */}
                                    <div className="bg-slate-900/30 p-2 rounded-xl border border-slate-850/40 space-y-1">
                                      <span className="block text-[7.5px] font-bold text-slate-600 uppercase tracking-wider">Cote X</span>
                                      <span className="block text-[11px] font-mono font-extrabold text-slate-300">{item.oddsX}</span>
                                      <div className={`text-[12px] font-mono font-black ${item.pctX > 35 ? 'text-emerald-400' : 'text-amber-400/80'}`}>
                                        {item.pctX}%
                                      </div>
                                      <span className="block text-[7px] text-slate-600 uppercase font-black">({item.draws} nuls)</span>
                                    </div>

                                    {/* 2 */}
                                    <div className="bg-slate-900/30 p-2 rounded-xl border border-slate-850/40 space-y-1">
                                      <span className="block text-[7.5px] font-bold text-slate-600 uppercase tracking-wider">Cote 2</span>
                                      <span className="block text-[11px] font-mono font-extrabold text-slate-300">{item.odds2}</span>
                                      <div className={`text-[12px] font-mono font-black ${item.pct2 > 45 ? 'text-emerald-400' : 'text-rose-400/80'}`}>
                                        {item.pct2}%
                                      </div>
                                      <span className="block text-[7px] text-slate-600 uppercase font-black">({item.awayWins} victoires)</span>
                                    </div>
                                  </div>

                                  {/* Verdict: most frequent winning odd */}
                                  <div className="bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-xl flex items-center justify-between text-[9px] font-sans">
                                    <span className="text-slate-400 uppercase">
                                      Cote gagnante principale : <strong className="text-slate-200">{item.winningOddMarker.label} (@{item.winningOddMarker.value})</strong>
                                    </span>
                                    <span className="font-mono font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-400/10">
                                      {item.winningOddMarker.pct}% de réussite
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {filteredOddsPerformance.length > maxVisibleOdds && (
                                <div className="pt-2 text-center">
                                  <button
                                    onClick={() => setMaxVisibleOdds(prev => prev + 40)}
                                    className="w-full py-2.5 px-4 bg-indigo-600/10 hover:bg-indigo-600/20 active:bg-indigo-600/30 text-indigo-400 border border-indigo-500/15 hover:border-indigo-500/30 text-[9.5px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                                  >
                                    Afficher plus de cotes ({filteredOddsPerformance.length - maxVisibleOdds} restantes)
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-center pb-1 border-b border-slate-800/50">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                              <Target className="w-4 h-4 text-emerald-400" />
                              Taux de réussite de chaque cote individuelle (1.01 à N)
                            </span>
                          </div>

                          {/* Quick Interactive Search filter */}
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Rechercher une cote (ex: 1.50)..."
                              value={oddsSearchQuery}
                              onChange={(e) => {
                                setOddsSearchQuery(e.target.value);
                                setMaxVisibleOdds(45);
                              }}
                              className="w-full bg-slate-950/80 text-[10px] text-slate-100 placeholder-slate-500 font-sans tracking-wide uppercase pl-9 pr-14 py-2.5 rounded-xl border border-slate-850 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/10 focus:outline-none transition-all placeholder:capitalize"
                            />
                            <div className="absolute left-3.5 top-3 text-slate-600">
                              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                            </div>
                            {oddsSearchQuery && (
                              <button
                                onClick={() => {
                                  setOddsSearchQuery('');
                                  setMaxVisibleOdds(45);
                                }}
                                className="absolute right-3.5 top-2.5 text-slate-400 hover:text-white text-[8px] font-black font-sans uppercase bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded"
                              >
                                Effacer
                              </button>
                            )}
                          </div>

                          {filteredIndividualOdds.length === 0 ? (
                            <div className="py-16 text-center border-2 border-dashed border-slate-850 rounded-3xl bg-slate-950/20 text-slate-500 uppercase tracking-widest text-[9px] font-bold">
                              {oddsSearchQuery 
                                ? "Aucune cote ne correspond à votre recherche."
                                : "Aucun match qualifié avec des cotes n'a été identifié."}
                            </div>
                          ) : (
                            <div className="space-y-3 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                              <p className="text-[9px] text-slate-400 uppercase leading-relaxed font-sans">
                                Classement par ordre croissant de toutes les cotes individuelles de la base de données. Le taux représente le pourcentage de victoire de l'issue correspondante.
                              </p>

                              {filteredIndividualOdds.slice(0, maxVisibleOdds).map((item, idx) => {
                                // Dynamic color based on success rate
                                let pctColor = 'text-slate-400';
                                let barFill = 'bg-slate-600';
                                if (item.pct >= 65) {
                                  pctColor = 'text-emerald-400';
                                  barFill = 'bg-gradient-to-r from-emerald-500 to-emerald-400';
                                } else if (item.pct >= 45) {
                                  pctColor = 'text-indigo-400';
                                  barFill = 'bg-gradient-to-r from-indigo-500 to-indigo-400';
                                } else if (item.pct >= 30) {
                                  pctColor = 'text-amber-400';
                                  barFill = 'bg-gradient-to-r from-amber-500 to-amber-400';
                                } else {
                                  pctColor = 'text-rose-400/90';
                                  barFill = 'bg-gradient-to-r from-rose-500 to-rose-400';
                                }

                                return (
                                  <div key={idx} className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-850 hover:border-slate-800 transition-all space-y-2.5">
                                    <div className="flex items-center justify-between">
                                      {/* Left block: The Odd value */}
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-mono font-black text-white bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl shadow-inner shadow-slate-950/40">
                                          @{item.oddsStr}
                                        </span>
                                        <span className="text-[8px] font-bold text-slate-550 uppercase tracking-wider font-sans">
                                          {item.totalMatches} match{item.totalMatches > 1 ? 'es' : ''}
                                        </span>
                                      </div>

                                      {/* Right block: Success percentage */}
                                      <div className="flex items-baseline gap-1">
                                        <span className={`text-[13px] font-mono font-black ${pctColor}`}>
                                          {item.pct}%
                                        </span>
                                        <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-widest font-sans">
                                          Gagnante
                                        </span>
                                      </div>
                                    </div>

                                    {/* Mini visual progress bar */}
                                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-850/50">
                                      <div 
                                        className={`h-full rounded-full transition-all duration-550 ${barFill}`}
                                        style={{ width: `${item.pct}%` }}
                                      />
                                    </div>

                                    {/* Detailed Breakdown stats */}
                                    <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono text-[7px] text-slate-500 uppercase font-black">
                                      <div className="bg-slate-900/45 p-1 rounded-lg border border-slate-850/30">
                                        <span className="block text-slate-600 font-sans tracking-wide">Domicile (1)</span>
                                        <span className="block text-[8px] font-bold text-slate-300 mt-0.5">
                                          {item.homeWins}/{item.homeOccurrences}
                                        </span>
                                      </div>
                                      <div className="bg-slate-900/45 p-1 rounded-lg border border-slate-850/30">
                                        <span className="block text-slate-600 font-sans tracking-wide">Match Nul (X)</span>
                                        <span className="block text-[8px] font-bold text-slate-300 mt-0.5">
                                          {item.drawWins}/{item.drawOccurrences}
                                        </span>
                                      </div>
                                      <div className="bg-slate-900/45 p-1 rounded-lg border border-slate-850/30">
                                        <span className="block text-slate-600 font-sans tracking-wide">Extérieur (2)</span>
                                        <span className="block text-[8px] font-bold text-slate-300 mt-0.5">
                                          {item.awayWins}/{item.awayOccurrences}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}

                              {filteredIndividualOdds.length > maxVisibleOdds && (
                                <div className="pt-2 text-center">
                                  <button
                                    onClick={() => setMaxVisibleOdds(prev => prev + 50)}
                                    className="w-full py-2.5 px-4 bg-indigo-600/10 hover:bg-indigo-600/20 active:bg-indigo-600/30 text-indigo-400 border border-indigo-500/15 hover:border-indigo-500/30 text-[9.5px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                                  >
                                    Afficher plus de cotes ({filteredIndividualOdds.length - maxVisibleOdds} restantes)
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 2: PROBABILITY DISTRIBUTION GRAPHS (HTML/SVG style) */}
                  {rightTab === 'stats' && (
                    <motion.div
                      key="tab-stats"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-6"
                    >
                      <div className="pb-2 border-b border-slate-800/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <BarChart3 className="w-4 h-4 text-indigo-400" />
                          Distribution de Résultats & HT/FT Fréquents
                        </span>
                      </div>

                      {similarities.totalMatchedOdds === 0 ? (
                        <div className="py-12 text-center text-slate-500 uppercase font-black tracking-widest text-[9px]">
                          Pas de données statistiques à présenter pour le moment.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          
                          {/* 1X2 Probabilities breakdown visual chart */}
                          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-850/80 space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-300 tracking-wider">Probabilités Totales d'issue Match (1X2)</h4>
                            
                            <div className="space-y-4">
                              {['1', 'X', '2'].map((outcome) => {
                                const count: number = (similarities.ftStats as any)[outcome] || 0;
                                const pct = Math.round((count / similarities.totalMatchedOdds) * 100);
                                const color = outcome === '1' ? 'bg-indigo-500' : (outcome === '2' ? 'bg-rose-500' : 'bg-slate-500');
                                const label = outcome === '1' ? 'Domicile (1)' : (outcome === '2' ? 'Extérieur (2)' : 'Match nul (X)');
                                
                                return (
                                  <div key={outcome} className="space-y-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] font-black text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                                        <span className={`w-2 h-2 rounded-full ${color}`} />
                                        {label}
                                      </span>
                                      <span className="text-[11px] font-mono font-black text-white">{pct}% <span className="text-[9px] text-slate-600 font-bold">({count}m)</span></span>
                                    </div>
                                    <div className="h-3 bg-slate-900 rounded-lg overflow-hidden relative">
                                      <div 
                                        className={`h-full ${color} rounded-lg transition-all duration-1000`} 
                                        style={{ width: `${pct}%` }} 
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* HT/FT detailed distribution breakdown */}
                          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-850/80 space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-300 tracking-wider flex items-center justify-between">
                              <span>Précision d'indications HT/FT récurrents</span>
                              <span className="text-[7.5px] text-slate-500 font-bold tracking-widest">({Object.keys(similarities.htFtStats).length} variantes)</span>
                            </h4>

                            <div className="space-y-3 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                              {Object.keys(similarities.htFtStats).length === 0 ? (
                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest text-center block pt-4">Données HT/FT insuffisantes</span>
                              ) : (
                                Object.entries(similarities.htFtStats)
                                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                                  .map(([key, value]) => {
                                    const count = value as number;
                                    const pct = Math.round((count / similarities.totalMatchedOdds) * 100);
                                    
                                    return (
                                      <div key={key} className="flex items-center justify-between p-2 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors">
                                        <div className="flex items-center gap-2">
                                          <span className="w-10 text-center text-[10px] font-mono font-black text-indigo-400 bg-indigo-500/10 rounded px-1.5 py-0.5">
                                            {key}
                                          </span>
                                          <span className="text-[9.5px] font-bold text-slate-300 uppercase">
                                            {summarizeHtFtLabel(key)}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <div className="text-[9px] font-mono font-bold text-slate-500">{count} fois</div>
                                          <span className="w-12 text-right text-[11.5px] font-mono font-black text-emerald-400 bg-emerald-400/5 px-2 py-0.5 rounded border border-emerald-400/10">
                                            {pct}%
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })
                              )}
                            </div>
                          </div>

                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 3: H2H COMPARISON PRECISE DIRECT DETAILS */}
                  {rightTab === 'h2h' && (
                    <motion.div
                      key="tab-h2h"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-4"
                    >
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <GitCompare className="w-4 h-4 text-indigo-400" />
                          Historique Matchs Directs H2H Archivés
                        </span>
                        {selectedUpcomingMatch && (
                          <span className="text-[10px] font-black text-slate-300 uppercase tracking-wider font-mono">
                            {selectedUpcomingMatch?.homeTeam} vs {selectedUpcomingMatch?.awayTeam}
                          </span>
                        )}
                      </div>

                      {useManualOdds ? (
                        <div className="py-16 text-center border-2 border-dashed border-slate-800/80 rounded-3xl bg-slate-950/20">
                          <AlertCircle className="w-8 h-8 text-indigo-500/40 mx-auto mb-3" />
                          <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">H2H indisponible en saisie manuelle</h4>
                          <p className="text-[9px] text-slate-500 uppercase mt-1 leading-relaxed max-w-sm mx-auto">
                            Basculez sur "Choisir match à venir" pour cibler une confrontation active et voir l'historique de confrontations directes.
                          </p>
                        </div>
                      ) : similarities.h2h.length === 0 ? (
                        <div className="py-16 text-center border-2 border-dashed border-slate-800/80 rounded-3xl bg-slate-950/20">
                          <Info className="w-8 h-8 text-slate-705 mx-auto mb-3" />
                          <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Aucune confrontation H2H directe trouvée</h4>
                          <p className="text-[9px] text-slate-500 uppercase mt-1">
                            Ces deux rivaux n'ont pas encore enregistré de rencontres archivées dans votre base locale.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Cotes Actuelles de Référence du Match */}
                          {selectedUpcomingMatch && (
                            <div className="bg-slate-950/80 p-4 rounded-2xl border border-indigo-500/20 shadow-lg space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[8.5px] font-black uppercase text-indigo-400 tracking-wider bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                                  Cotes Actuelles de Référence
                                </span>
                                <span className="text-[8px] font-mono text-slate-450">
                                  Match Actuel
                                </span>
                              </div>
                              
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                                  <span className="text-xs font-black text-slate-100 uppercase truncate text-right">
                                    {selectedUpcomingMatch.homeTeam?.name || selectedUpcomingMatch.homeTeam?.teamName || selectedUpcomingMatch.homeTeam}
                                  </span>
                                  <img src={getTeamLogo(selectedUpcomingMatch.homeTeam?.name || selectedUpcomingMatch.homeTeam?.teamName || selectedUpcomingMatch.homeTeam)} className="w-5.5 h-5.5 object-contain" alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                </div>
                                <div className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono font-black text-[9px] text-slate-550">VS</div>
                                <div className="flex items-center gap-2 flex-1 justify-start min-w-0">
                                  <img src={getTeamLogo(selectedUpcomingMatch.awayTeam?.name || selectedUpcomingMatch.awayTeam?.teamName || selectedUpcomingMatch.awayTeam)} className="w-5.5 h-5.5 object-contain" alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                  <span className="text-xs font-black text-slate-100 uppercase truncate">
                                    {selectedUpcomingMatch.awayTeam?.name || selectedUpcomingMatch.awayTeam?.teamName || selectedUpcomingMatch.awayTeam}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/[0.03]">
                                {[
                                  { label: '1', val: selectedUpcomingMatch.odds1 || selectedUpcomingMatch.odds_1 || '-', color: 'text-indigo-400' },
                                  { label: 'X', val: selectedUpcomingMatch.oddsX || selectedUpcomingMatch.odds_x || selectedUpcomingMatch.odds_X || '-', color: 'text-amber-500' },
                                  { label: '2', val: selectedUpcomingMatch.odds2 || selectedUpcomingMatch.odds_2 || '-', color: 'text-rose-450' },
                                ].map((o) => (
                                  <div key={o.label} className="bg-slate-900/60 p-1.5 text-center rounded-xl border border-slate-800/80 flex flex-col justify-center items-center shadow-inner hover:border-slate-700/50 transition-all">
                                    <span className="text-[7px] text-slate-550 font-bold uppercase mb-0.5">{o.label}</span>
                                    <span className={`font-mono font-black text-[12px] leading-none ${o.color}`}>{o.val}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-3">
                            {similarities.h2h.map((m, idx) => {
                              const hS = parseInt(m.homeScore || '0');
                              const aS = parseInt(m.awayScore || '0');
                              const htFt = computeHTFT(hS, aS, m.scoreDetails);
                              const isHighestSimilarity = idx === bestH2HMatchId;
                              const isClosestRanks = closestRankH2HIdxs.includes(idx);
                              const isClosestForm = closestFormH2HIdxs.includes(idx);
                              
                              return (
                                <div key={idx} className={`p-4 rounded-2xl transition-all duration-300 flex flex-col gap-2.5 ${
                                  isHighestSimilarity 
                                    ? 'bg-rose-950/15 border border-rose-500/70 shadow-[0_0_12px_rgba(244,63,94,0.12)] ring-1 ring-rose-500/25' 
                                    : (isClosestRanks || isClosestForm)
                                      ? 'bg-emerald-950/15 border border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.12)] ring-1 ring-emerald-500/25'
                                      : 'bg-slate-950/40 hover:bg-slate-950 border border-slate-850 hover:border-slate-700/60'
                                }`}>
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 flex-wrap">
                                      {isHighestSimilarity && (
                                        <span className="text-[7.5px] font-black text-rose-400 bg-rose-500/15 border border-rose-500/25 px-2 py-0.5 rounded font-mono uppercase animate-pulse flex items-center gap-1">
                                          Similarité Élevée 🔥
                                        </span>
                                      )}
                                      {isClosestRanks && (
                                        <span className="text-[7.5px] font-black text-emerald-450 bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 rounded font-mono uppercase flex items-center gap-1">
                                          Rangs Proches 🟢
                                        </span>
                                      )}
                                      {isClosestForm && (
                                        <span className="text-[7.5px] font-black text-teal-400 bg-teal-500/15 border border-teal-500/25 px-2 py-0.5 rounded font-mono uppercase flex items-center gap-1">
                                          Forme Proche 📈
                                        </span>
                                      )}
                                      <span className="text-[7.5px] font-black text-emerald-450 bg-emerald-500/5 border border-emerald-500/15 px-2 py-0.5 rounded font-mono uppercase">
                                        {m.season}
                                      </span>
                                      <span className="text-[8px] font-mono font-black text-slate-500">
                                        Journée {m.round}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <img 
                                          src={getTeamLogo(m.homeTeam)} 
                                          alt="" 
                                          className="w-4 h-4 rounded-full object-contain pointer-events-none bg-slate-900 p-0.5"
                                          referrerPolicy="no-referrer"
                                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                        />
                                        <span className="text-[10px] font-black text-slate-200 uppercase">
                                          {m.homeTeam} vs {m.awayTeam}
                                        </span>
                                        <img 
                                          src={getTeamLogo(m.awayTeam)} 
                                          alt="" 
                                          className="w-4 h-4 rounded-full object-contain pointer-events-none bg-slate-900 p-0.5"
                                          referrerPolicy="no-referrer"
                                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                        />
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 self-start md:self-center ml-auto md:ml-0">
                                      {/* Odds breakdown visually */}
                                      {(m.odds1 || m.oddsX || m.odds2) && (
                                        <span className="inline-flex items-center gap-1 bg-slate-950 border border-slate-850 px-1.5 py-0.5 rounded font-mono text-[7.5px] text-slate-400 leading-none shrink-0" title="Cotes d'origine du match">
                                          <span className="text-[6px] font-sans font-black text-slate-500 uppercase mr-0.5">Cotes</span>
                                          <b className={`font-extrabold px-1 rounded-sm ${isHighestSimilarity ? 'text-rose-450 border border-rose-500/50 bg-rose-500/15' : 'text-emerald-400'}`}>{m.odds1 || '-'}</b>
                                          <span className="text-slate-800 font-bold">|</span>
                                          <b className={`font-extrabold px-1 rounded-sm ${isHighestSimilarity ? 'text-rose-450 border border-rose-500/50 bg-rose-500/15' : 'text-amber-500'}`}>{m.oddsX || '-'}</b>
                                          <span className="text-slate-800 font-bold">|</span>
                                          <b className={`font-extrabold px-1 rounded-sm ${isHighestSimilarity ? 'text-rose-450 border border-rose-500/50 bg-rose-500/15' : 'text-rose-450'}`}>{m.odds2 || '-'}</b>
                                        </span>
                                      )}

                                      {htFt && (
                                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-[7px] font-black uppercase">
                                          HT/FT: {htFt}
                                        </span>
                                      )}
                                      <div className="bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded text-[10px] font-black text-emerald-400 font-mono">
                                        {m.homeScore}-{m.awayScore}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="border-t border-slate-900 pt-2 flex items-center gap-2">
                                    <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest shrink-0 font-mono">Marqueurs :</span>
                                    {renderGoalTimeline(m)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB: TEAM H2H EXPLORER */}
                  {rightTab === 'teamH2h' && (
                    <motion.div
                      key="tab-teamH2h"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-4 text-slate-100 font-sans"
                    >
                      {/* Header and Controls */}
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 shrink-0">
                              <ArrowLeftRight className="w-6 h-6 animate-pulse" />
                            </div>
                            <div>
                              <h2 className="text-sm font-black text-slate-100 uppercase tracking-widest">
                                Confrontations H2H par Équipe (Aller / Retour)
                              </h2>
                              <p className="text-[10px] text-zinc-400 font-medium">
                                Visualisez la matrice aller-retour d'une équipe contre l'ensemble du championnat pour une saison sélectionnée.
                              </p>
                            </div>
                          </div>

                          {/* Controls (Team & Season Dropdowns) */}
                          <div className="flex flex-wrap items-center gap-3 bg-slate-950/45 p-2 rounded-2xl border border-white/5">
                            {/* Team Select */}
                            <div className="flex items-center gap-2">
                              <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider">
                                Équipe :
                              </span>
                              <select
                                value={teamH2hSelectedTeam}
                                onChange={(e) => setTeamH2hSelectedTeam(e.target.value)}
                                className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-[10px] text-indigo-300 font-black uppercase focus:outline-none focus:border-indigo-500 cursor-pointer min-w-[130px]"
                              >
                                {uniqueTeamsList.map((t, idx) => (
                                  <option key={idx} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Season Select */}
                            <div className="flex items-center gap-2">
                              <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider">
                                Saison :
                              </span>
                              <select
                                value={teamH2hSelectedSeason}
                                onChange={(e) => setTeamH2hSelectedSeason(e.target.value)}
                                className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-[10px] text-indigo-300 font-black uppercase focus:outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="all">Toutes saisons</option>
                                {uniqueSeasonsList.map((s, idx) => (
                                  <option key={idx} value={s}>
                                    Saison {s}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Focus Team Cumulative Stats Overview Card */}
                        {teamH2hSelectedTeam && (
                          <div className="bg-slate-950/60 border border-white/[0.03] p-5 rounded-2xl flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={getTeamLogo(teamH2hSelectedTeam)}
                                className="w-11 h-11 object-contain p-1.5 bg-slate-900 rounded-xl border border-white/5 shrink-0"
                                alt=""
                                referrerPolicy="no-referrer"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                              <div>
                                <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                                  {teamH2hSelectedTeam}
                                </h3>
                                <p className="text-[9px] text-indigo-400 uppercase font-bold tracking-widest mt-0.5">
                                  Bilan Général ({teamH2hSelectedSeason === 'all' ? 'Historique Global' : `Saison ${teamH2hSelectedSeason}`}) • {teamH2hStats.played} Matchs
                                </p>
                              </div>
                            </div>

                            {/* Two-column layout for details */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Left: Home Team Result Distribution */}
                              <div className="space-y-2 bg-slate-900/40 p-3.5 rounded-xl border border-white/[0.02]">
                                <h4 className="text-[8px] text-zinc-400 font-black uppercase tracking-wider">
                                  📊 Distribution des résultats (Domicile vs Nul vs Extérieur) :
                                </h4>
                                <div className="grid grid-cols-3 gap-2 text-center mt-1">
                                  <div className="bg-slate-950 px-2.5 py-2 rounded-lg border border-white/[0.03]">
                                    <span className="block text-[6.5px] text-zinc-500 uppercase font-extrabold tracking-wider mb-0.5">Victoire Dom.</span>
                                    <span className="block text-13 font-black text-emerald-400 font-mono leading-none">{teamH2hStats.homeWinPct}%</span>
                                  </div>
                                  <div className="bg-slate-950 px-2.5 py-2 rounded-lg border border-white/[0.03]">
                                    <span className="block text-[6.5px] text-zinc-500 uppercase font-extrabold tracking-wider mb-0.5">Match Nul</span>
                                    <span className="block text-13 font-black text-amber-500 font-mono leading-none">{teamH2hStats.homeDrawPct}%</span>
                                  </div>
                                  <div className="bg-slate-950 px-2.5 py-2 rounded-lg border border-white/[0.03]">
                                    <span className="block text-[6.5px] text-zinc-500 uppercase font-extrabold tracking-wider mb-0.5">Défaite Dom.</span>
                                    <span className="block text-13 font-black text-rose-455 font-mono leading-none">{teamH2hStats.homeLossPct}%</span>
                                  </div>
                                </div>
                              </div>

                              {/* Right: Key Betting/Game Frequencies */}
                              <div className="space-y-2 bg-slate-900/40 p-3.5 rounded-xl border border-white/[0.02]">
                                <h4 className="text-[8px] text-zinc-400 font-black uppercase tracking-wider">
                                  🔥 Indices & Fréquences Clés :
                                </h4>
                                <div className="grid grid-cols-2 gap-2 text-center mt-1">
                                  <div className="bg-slate-950 px-2 py-1.5 rounded-lg border border-white/[0.03] flex justify-between items-center">
                                    <span className="text-[6.5px] text-zinc-500 uppercase font-bold">Score fréquent :</span>
                                    <span className="font-mono font-black text-[10px] text-indigo-300 bg-white/5 px-1 rounded">{teamH2hStats.mostFreqScore}</span>
                                  </div>
                                  <div className="bg-slate-950 px-2 py-1.5 rounded-lg border border-white/[0.03] flex justify-between items-center">
                                    <span className="text-[6.5px] text-zinc-500 uppercase font-bold">HT/FT freq. :</span>
                                    <span className="font-mono font-black text-[10px] text-indigo-300 bg-white/5 px-1 rounded">{teamH2hStats.mostFreqHtFt}</span>
                                  </div>
                                  <div className="bg-slate-950 px-2 py-1.5 rounded-lg border border-white/[0.03] flex justify-between items-center">
                                    <span className="text-[6.5px] text-zinc-500 uppercase font-bold">Nbr de buts :</span>
                                    <span className="font-mono font-black text-[10px] text-indigo-300 bg-white/5 px-1 rounded">{teamH2hStats.mostFreqGoalsNum}</span>
                                  </div>
                                  <div className="bg-slate-950 px-2 py-1.5 rounded-lg border border-white/[0.03] flex justify-between items-center">
                                    <span className="text-[6.5px] text-zinc-500 uppercase font-bold">Les 2 marquent :</span>
                                    <span className="font-mono font-black text-[10px] text-indigo-300 bg-white/5 px-1 rounded">{teamH2hStats.bttsPct}% Oui</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Sub-tabs for H2H View Mode selection */}
                        {teamH2hSelectedTeam && (
                          <div className="flex flex-col sm:flex-row border-t border-slate-800/80 pt-3.5 mt-1 items-start sm:items-center gap-2.5">
                            <span className="text-[8px] font-black uppercase text-zinc-400 tracking-wider">
                              Mode d'affichage des confrontations :
                            </span>
                            <div className="flex bg-slate-950 p-1 rounded-xl border border-white/5 gap-1 shadow-inner w-full sm:w-auto">
                              <button
                                type="button"
                                onClick={() => setTeamH2hViewMode('standard')}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200 flex-1 sm:flex-none ${
                                  teamH2hViewMode === 'standard'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                }`}
                              >
                                Standard (Aller/Retour par Saison)
                              </button>
                              <button
                                type="button"
                                onClick={() => setTeamH2hViewMode('separated')}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200 flex-1 sm:flex-none ${
                                  teamH2hViewMode === 'separated'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                }`}
                              >
                                Cadres Séparés (Chronologique Croissant)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Opponents Aller/Retour Matchups List */}
                      {!teamH2hSelectedTeam ? (
                        <div className="py-16 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-950/10">
                          <Database className="w-8 h-8 text-slate-705 mx-auto mb-2 opacity-55 animate-pulse" />
                          <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-widest">
                            Veuillez sélectionner une équipe focus
                          </h4>
                        </div>
                      ) : teamH2hMatchups.length === 0 ? (
                        <div className="py-16 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-950/10">
                          <Database className="w-8 h-8 text-slate-705 mx-auto mb-2 opacity-55" />
                          <h4 className="text-[10px] font-black text-slate-450 uppercase tracking-widest">
                            Aucun match trouvé pour les critères sélectionnés
                          </h4>
                          <p className="text-[8px] text-slate-500 uppercase mt-1">
                            Ajustez l'équipe ou la saison pour charger l'arbre des duels.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-6 max-h-[600px] overflow-y-auto pr-1 select-none custom-scrollbar">
                          {teamH2hMatchups.map((matchup, idx) => {
                            const { oppName, seasonsData } = matchup;

                            const renderH2hGameRow = (match: any, isAller: boolean) => {
                              if (!match) {
                                return (
                                  <div className="p-3 rounded-xl border border-dashed border-slate-900 bg-slate-950/25 text-center py-4 flex flex-col justify-center items-center">
                                    <span className="text-[8px] font-black text-slate-550 uppercase tracking-widest">
                                      {isAller ? "🏠 Aller non programmé" : "✈️ Retour non programmé"}
                                    </span>
                                  </div>
                                );
                              }

                              const hS = parseInt(match.homeScore || '0');
                              const aS = parseInt(match.awayScore || '0');
                              const htFt = computeHTFT(hS, aS, match.scoreDetails);

                              const homeName = match.homeTeam;
                              const awayName = match.awayTeam;
                              const isHomeHighlight = (homeName || '').toLowerCase().trim() === teamH2hSelectedTeam.toLowerCase().trim();
                              const isAwayHighlight = (awayName || '').toLowerCase().trim() === teamH2hSelectedTeam.toLowerCase().trim();

                              let outcomeText = "NON JOUÉ";
                              let outcomeClass = "text-slate-400 bg-slate-500/10 border-slate-700/20";

                              if (match.homeScore !== undefined && match.homeScore !== null && match.awayScore !== undefined && match.awayScore !== null) {
                                if (isHomeHighlight) {
                                  if (hS > aS) {
                                    outcomeText = "VICTOIRE";
                                    outcomeClass = "text-emerald-400 bg-emerald-500/10 border-emerald-500/25";
                                  } else if (hS < aS) {
                                    outcomeText = "DÉFAITE";
                                    outcomeClass = "text-rose-455 bg-rose-500/10 border-rose-500/25";
                                  } else {
                                    outcomeText = "NUL";
                                    outcomeClass = "text-amber-400 bg-amber-500/10 border-amber-500/25";
                                  }
                                } else if (isAwayHighlight) {
                                  if (aS > hS) {
                                    outcomeText = "VICTOIRE";
                                    outcomeClass = "text-emerald-400 bg-emerald-500/10 border-emerald-500/25";
                                  } else if (aS < hS) {
                                    outcomeText = "DÉFAITE";
                                    outcomeClass = "text-rose-455 bg-rose-500/10 border-rose-500/25";
                                  } else {
                                    outcomeText = "NUL";
                                    outcomeClass = "text-amber-400 bg-amber-500/10 border-amber-500/25";
                                  }
                                }
                              }

                              const dateStr = match.expectedStart
                                ? new Date(match.expectedStart).toLocaleString("fr-FR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "-";

                              return (
                                <div className="p-3 rounded-xl border border-slate-900 bg-slate-950/45 hover:bg-slate-950/80 transition-all duration-200 flex flex-col gap-2">
                                  {/* Sub-card header */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[7.5px] font-bold text-slate-455 uppercase tracking-wider select-none">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[7px] font-black text-indigo-350 bg-indigo-500/15 border border-indigo-500/20 px-1.5 py-0.5 rounded font-mono leading-none uppercase">
                                        JOURNÉE {match.round}
                                      </span>
                                      <span className={`text-[6.5px] font-mono font-black px-1.5 py-0.5 rounded border leading-none uppercase ${outcomeClass}`}>
                                        {outcomeText}
                                      </span>
                                      {htFt && (
                                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/15 text-indigo-400 font-mono text-[6px] font-black uppercase leading-none">
                                          HT/FT: {htFt}
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-mono text-[7px] text-slate-500 shrink-0">
                                      {dateStr}
                                    </span>
                                  </div>

                                  {/* Teams vs block */}
                                  <div className="flex items-center justify-between gap-1.5 py-0.5">
                                    {/* Home Team */}
                                    <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                                      <span className={`text-[9.5px] uppercase truncate text-right tracking-tight font-bold ${
                                        isHomeHighlight
                                          ? "text-amber-450 font-extrabold"
                                          : hS > aS
                                            ? "text-white"
                                            : "text-slate-400 font-medium"
                                      }`}>
                                        {homeName}
                                      </span>
                                      <div className="w-4.5 h-4.5 bg-slate-900 rounded-full flex items-center justify-center p-0.5 border border-slate-800 shrink-0">
                                        <img
                                          src={getTeamLogo(homeName)}
                                          alt=""
                                          className="w-3 h-3 object-contain rounded-full pointer-events-none"
                                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                          referrerPolicy="no-referrer"
                                        />
                                      </div>
                                    </div>

                                    {/* Score Box */}
                                    <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-850 shrink-0 min-w-[38px] justify-center shadow-inner">
                                      <span className={`font-black text-[10.5px] font-mono leading-none ${hS > aS ? "text-indigo-400 scale-105" : "text-slate-300"}`}>
                                        {match.homeScore ?? '-'}
                                      </span>
                                      <span className="text-slate-750 font-black text-[7.5px]">-</span>
                                      <span className={`font-black text-[10.5px] font-mono leading-none ${aS > hS ? "text-indigo-400 scale-105" : "text-slate-300"}`}>
                                        {match.awayScore ?? '-'}
                                      </span>
                                    </div>

                                    {/* Away Team */}
                                    <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
                                      <div className="w-4.5 h-4.5 bg-slate-900 rounded-full flex items-center justify-center p-0.5 border border-slate-800 shrink-0">
                                        <img
                                          src={getTeamLogo(awayName)}
                                          alt=""
                                          className="w-3 h-3 object-contain rounded-full pointer-events-none"
                                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                          referrerPolicy="no-referrer"
                                        />
                                      </div>
                                      <span className={`text-[9.5px] uppercase truncate text-left tracking-tight font-bold ${
                                        isAwayHighlight
                                          ? "text-amber-455 font-extrabold"
                                          : aS > hS
                                            ? "text-white"
                                            : "text-slate-400 font-medium"
                                      }`}>
                                        {awayName}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Goalscorer timeline */}
                                  {((match.scoreDetails?.homeGoals?.length || 0) > 0 || (match.scoreDetails?.awayGoals?.length || 0) > 0) && (
                                    <div className="border-t border-slate-900/60 pt-1.5 flex items-center gap-2">
                                      <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest shrink-0 font-mono">Buteurs:</span>
                                      {renderGoalTimeline(match)}
                                    </div>
                                  )}

                                  {/* Odds */}
                                  {(match.odds1 || match.oddsX || match.odds2) && (
                                    <div className="pt-1.5 border-t border-slate-900/40">
                                      <div className="grid grid-cols-3 gap-1">
                                        {[
                                          { label: "1", val: match.odds1 || "-", color: "text-emerald-400" },
                                          { label: "X", val: match.oddsX || "-", color: "text-amber-500" },
                                          { label: "2", val: match.odds2 || "-", color: "text-rose-455" },
                                        ].map((o) => (
                                          <div
                                            key={o.label}
                                            className="bg-slate-950 p-0.5 text-center border border-white/5 rounded-md flex flex-col justify-center items-center"
                                          >
                                            <span className="text-[6px] text-slate-500 font-bold uppercase mb-0.5">{o.label}</span>
                                            <span className={`font-mono font-black text-[9px] leading-none ${o.color}`}>
                                              {o.val}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            };

                            const matchupAllMatches = seasonsData.map((s: any) => [s.allerMatch, s.retourMatch]).flat().filter(Boolean);
                            const matchupAllerMatches = seasonsData.map((s: any) => s.allerMatch).filter(Boolean);
                            const matchupRetourMatches = seasonsData.map((s: any) => s.retourMatch).filter(Boolean);

                            const detailedH2h = getDetailedH2hStats(matchupAllMatches);
                            const detailedAller = getDetailedH2hStats(matchupAllerMatches);
                            const detailedRetour = getDetailedH2hStats(matchupRetourMatches);

                            return (
                              <div
                                key={idx}
                                className="border border-slate-850 bg-[#0c1322]/20 rounded-2xl p-4 space-y-4 hover:border-slate-800 transition-all shadow-xl"
                              >
                                {/* Group Header: Opponent logo + Name + total stats summary */}
                                <div className="flex items-center justify-between pb-3 border-b border-slate-900/60">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-slate-950 flex items-center justify-center p-1 border border-slate-850 shrink-0">
                                      <img
                                        src={getTeamLogo(oppName)}
                                        className="w-5.5 h-5.5 object-contain pointer-events-none"
                                        alt=""
                                        referrerPolicy="no-referrer"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    </div>
                                    <div>
                                      <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">
                                        {oppName}
                                      </h3>
                                      {rankings && rankings.findIndex((r: any) => (r.name || r.teamName || r.team) === oppName) !== -1 && (
                                        <p className="text-[7.5px] font-mono uppercase font-bold tracking-widest text-slate-500 leading-none mt-0.5">
                                          Rang: #{rankings.findIndex((r: any) => (r.name || r.teamName || r.team) === oppName) + 1}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 font-mono text-[7px] font-black uppercase text-indigo-450 bg-indigo-500/10 border border-indigo-400/20 px-2.5 py-1 rounded-md tracking-wider">
                                    <span>CONFRONTATIONS DUELS:</span>
                                    <span className="text-[8px] text-indigo-300 font-extrabold font-mono">
                                      {detailedH2h.total} MATCHS
                                    </span>
                                  </div>
                                </div>

                                {/* Stack all seasons belonging to this matchup pair list */}
                                {teamH2hViewMode === 'standard' ? (
                                  <div className="space-y-3.5">
                                    {/* Detailed H2H Stats Panel */}
                                    {detailedH2h.total > 0 && (
                                      <div className="bg-slate-950/45 p-3 rounded-xl border border-white/[0.02] grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        {/* Home/Draw/Away % */}
                                        <div className="col-span-1 lg:col-span-2 space-y-1">
                                          <span className="block text-[6.5px] uppercase font-black text-indigo-400 tracking-wider">
                                            Distribution (Domicile vs Nul vs Extérieur) :
                                          </span>
                                          <div className="flex bg-slate-950 p-1.5 rounded-lg border border-white/5 justify-between text-center gap-1 font-mono text-[8.5px] leading-tight">
                                            <div className="flex-1">
                                              <span className="block text-[5.5px] text-zinc-500 font-bold uppercase mb-0.5">Victoire Dom.</span>
                                              <span className="font-black text-emerald-400">{detailedH2h.homeWinPct}%</span>
                                            </div>
                                            <div className="w-[1px] bg-white/5 shrink-0"></div>
                                            <div className="flex-1">
                                              <span className="block text-[5.5px] text-zinc-500 font-bold uppercase mb-0.5">Match Nul</span>
                                              <span className="font-black text-amber-500">{detailedH2h.drawPct}%</span>
                                            </div>
                                            <div className="w-[1px] bg-white/5 shrink-0"></div>
                                            <div className="flex-1">
                                              <span className="block text-[5.5px] text-zinc-500 font-bold uppercase mb-0.5">Défaite Dom.</span>
                                              <span className="font-black text-rose-455">{detailedH2h.homeLossPct}%</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Frequencies Column 1 */}
                                        <div className="space-y-1">
                                          <span className="block text-[6.5px] uppercase font-black text-indigo-400 tracking-wider">
                                            Scores & Buts :
                                          </span>
                                          <div className="bg-slate-950 p-1.5 rounded-lg border border-white/5 text-center space-y-1 text-[7px]">
                                            <div className="flex justify-between items-center">
                                              <span className="text-zinc-505 font-bold uppercase">Score fre. :</span>
                                              <span className="font-mono font-black text-zinc-300 bg-white/5 px-1 rounded">{detailedH2h.mostFreqScore}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                              <span className="text-zinc-505 font-bold uppercase">Nbr buts :</span>
                                              <span className="font-mono font-black text-zinc-300 bg-white/5 px-1 rounded">{detailedH2h.mostFreqGoalsNum}</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Frequencies Column 2 */}
                                        <div className="space-y-1">
                                          <span className="block text-[6.5px] uppercase font-black text-indigo-400 tracking-wider">
                                            HT/FT & BTTS :
                                          </span>
                                          <div className="bg-slate-950 p-1.5 rounded-lg border border-white/5 text-center space-y-1 text-[7px]">
                                            <div className="flex justify-between items-center">
                                              <span className="text-zinc-505 font-bold uppercase">HT/FT fre. :</span>
                                              <span className="font-mono font-black text-zinc-300 bg-white/5 px-1 rounded">{detailedH2h.mostFreqHtFt}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                              <span className="text-zinc-505 font-bold uppercase">2 Marqurent :</span>
                                              <span className="font-mono font-black text-zinc-300 bg-white/5 px-1 rounded">{detailedH2h.bttsPct}% Oui</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {seasonsData.map((sData) => {
                                      const { seasonId, allerMatch, retourMatch, pointsEarned, matchesPlayed } = sData;
                                      return (
                                        <div key={seasonId} className="border border-slate-900 bg-slate-950/20 rounded-xl p-3 space-y-3">
                                          {/* Season Subheader */}
                                          <div className="flex items-center justify-between pb-2 border-b border-slate-900/40">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[8px] font-black text-amber-450 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
                                                SAISON {seasonId}
                                              </span>
                                            </div>
                                            <span className="font-mono text-[7px] text-slate-455 uppercase tracking-wider font-extrabold">
                                              {pointsEarned} PTS / {matchesPlayed * 3} Possibles
                                            </span>
                                          </div>

                                          {/* Aller/Retour grid inside this season */}
                                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                                            {/* ALLER */}
                                            <div className="space-y-1">
                                              <div className="text-slate-500 text-[7px] font-black uppercase tracking-wider select-none pl-1">
                                                🏠 MATCH ALLER (DOMICILE)
                                              </div>
                                              {renderH2hGameRow(allerMatch, true)}
                                            </div>

                                            {/* RETOUR */}
                                            <div className="space-y-1">
                                              <div className="text-slate-500 text-[7px] font-black uppercase tracking-wider select-none pl-1">
                                                ✈️ MATCH RETOUR (EXTÉRIEUR)
                                              </div>
                                              {renderH2hGameRow(retourMatch, false)}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  /* Separated view: Aller only (one frame) and Retour only (another frame), in ascending order of seasons */
                                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                                    {/* ALLER ONLY CONTAINER FRAME */}
                                    <div className="border border-slate-900/80 bg-slate-950/20 rounded-2xl p-4.5 space-y-3">
                                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-900/60">
                                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                                          🏠 CONFRONTATIONS ALLER (🏠 DOMICILE)
                                        </span>
                                        <span className="text-[6.5px] font-mono text-zinc-450 font-black uppercase tracking-widest bg-slate-900 px-2 py-0.5 rounded border border-white/5">
                                          Saisons Croissantes
                                        </span>
                                      </div>

                                      {/* Bilan ALLER */}
                                      {detailedAller.total > 0 && (
                                        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5 space-y-2">
                                          <div className="grid grid-cols-2 gap-2 text-[7px]">
                                            <div className="space-y-1">
                                              <span className="block text-[6px] font-bold text-zinc-400 uppercase tracking-wider">Distribution résultats :</span>
                                              <div className="flex bg-slate-900 px-1.5 py-1 rounded border border-white/5 justify-between text-center gap-1 font-mono font-black select-none">
                                                <span className="text-emerald-400">{detailedAller.homeWinPct}% V</span>
                                                <span className="text-amber-500">{detailedAller.drawPct}% N</span>
                                                <span className="text-rose-455">{detailedAller.homeLossPct}% D</span>
                                              </div>
                                            </div>
                                            <div className="space-y-1">
                                              <span className="block text-[6px] font-bold text-zinc-400 uppercase tracking-wider">BTTS & Nbr Buts :</span>
                                              <div className="flex bg-slate-900 px-1.5 py-1 rounded border border-white/5 justify-between text-center gap-1 font-mono font-black select-none">
                                                <span className="text-zinc-300">{detailedAller.bttsPct}% BTTS</span>
                                                <span className="text-zinc-350">{detailedAller.mostFreqGoalsNum}</span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 border-t border-white/[0.03] pt-1.5 text-[6.5px]">
                                            <div className="flex justify-between items-center px-1">
                                              <span className="text-zinc-505 font-bold uppercase">Score freq:</span>
                                              <span className="font-mono font-black text-indigo-400 bg-white/5 px-1 rounded">{detailedAller.mostFreqScore}</span>
                                            </div>
                                            <div className="flex justify-between items-center px-1">
                                              <span className="text-zinc-505 font-bold uppercase">HT/FT freq:</span>
                                              <span className="font-mono font-black text-indigo-400 bg-white/5 px-1 rounded">{detailedAller.mostFreqHtFt}</span>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      
                                      <div className="space-y-3.5 max-h-[450px] overflow-y-auto pr-1.5 custom-scrollbar">
                                        {[...seasonsData]
                                          .sort((a, b) => a.seasonId.localeCompare(b.seasonId))
                                          .map((sData) => {
                                            const { seasonId, allerMatch } = sData;
                                            return (
                                              <div key={seasonId} className="space-y-1 bg-slate-950/20 border border-white/[0.01] rounded-xl p-1.5">
                                                <div className="flex items-center justify-between px-1">
                                                  <span className="text-[7.5px] font-black text-amber-500 uppercase tracking-wider font-mono">
                                                    Saison {seasonId}
                                                  </span>
                                                </div>
                                                {renderH2hGameRow(allerMatch, true)}
                                              </div>
                                            );
                                          })
                                        }
                                      </div>
                                    </div>

                                    {/* RETOUR ONLY CONTAINER FRAME */}
                                    <div className="border border-slate-900/80 bg-slate-950/20 rounded-2xl p-4.5 space-y-3">
                                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-900/60">
                                        <span className="text-[9px] font-black text-emerald-450 uppercase tracking-widest flex items-center gap-1.5">
                                          ✈️ CONFRONTATIONS RETOUR (✈️ EXTÉRIEUR)
                                        </span>
                                        <span className="text-[6.5px] font-mono text-zinc-450 font-black uppercase tracking-widest bg-slate-900 px-2 py-0.5 rounded border border-white/5">
                                          Saisons Croissantes
                                        </span>
                                      </div>

                                      {/* Bilan RETOUR */}
                                      {detailedRetour.total > 0 && (
                                        <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/5 space-y-2">
                                          <div className="grid grid-cols-2 gap-2 text-[7px]">
                                            <div className="space-y-1">
                                              <span className="block text-[6px] font-bold text-zinc-400 uppercase tracking-wider">Distribution résultats :</span>
                                              <div className="flex bg-slate-900 px-1.5 py-1 rounded border border-white/5 justify-between text-center gap-1 font-mono font-black select-none">
                                                <span className="text-emerald-400">{detailedRetour.homeWinPct}% V</span>
                                                <span className="text-amber-500">{detailedRetour.drawPct}% N</span>
                                                <span className="text-rose-455">{detailedRetour.homeLossPct}% D</span>
                                              </div>
                                            </div>
                                            <div className="space-y-1">
                                              <span className="block text-[6px] font-bold text-zinc-400 uppercase tracking-wider">BTTS & Nbr Buts :</span>
                                              <div className="flex bg-slate-900 px-1.5 py-1 rounded border border-white/5 justify-between text-center gap-1 font-mono font-black select-none">
                                                <span className="text-zinc-300">{detailedRetour.bttsPct}% BTTS</span>
                                                <span className="text-zinc-350">{detailedRetour.mostFreqGoalsNum}</span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 border-t border-white/[0.03] pt-1.5 text-[6.5px]">
                                            <div className="flex justify-between items-center px-1">
                                              <span className="text-zinc-505 font-bold uppercase">Score freq:</span>
                                              <span className="font-mono font-black text-indigo-400 bg-white/5 px-1 rounded">{detailedRetour.mostFreqScore}</span>
                                            </div>
                                            <div className="flex justify-between items-center px-1">
                                              <span className="text-zinc-505 font-bold uppercase">HT/FT freq:</span>
                                              <span className="font-mono font-black text-indigo-400 bg-white/5 px-1 rounded">{detailedRetour.mostFreqHtFt}</span>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      <div className="space-y-3.5 max-h-[450px] overflow-y-auto pr-1.5 custom-scrollbar">
                                        {[...seasonsData]
                                          .sort((a, b) => a.seasonId.localeCompare(b.seasonId))
                                          .map((sData) => {
                                            const { seasonId, retourMatch } = sData;
                                            return (
                                              <div key={seasonId} className="space-y-1 bg-slate-950/20 border border-white/[0.01] rounded-xl p-1.5">
                                                <div className="flex items-center justify-between px-1">
                                                  <span className="text-[7.5px] font-black text-emerald-400 uppercase tracking-wider font-mono">
                                                    Saison {seasonId}
                                                  </span>
                                                </div>
                                                {renderH2hGameRow(retourMatch, false)}
                                              </div>
                                            );
                                          })
                                        }
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 4: REPEATING SCORELINES DETECTOR GLOBAL DATA */}
                  {rightTab === 'patterns' && (
                    <motion.div
                      key="tab-patterns"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.25 }}
                      className="space-y-4"
                    >
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Hash className="w-4 h-4 text-indigo-400" />
                          Dossier Répétitions Fréquentes (Ligue globale)
                        </span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                          Groupement par score + HT/FT
                        </span>
                      </div>

                      {repetitionPatterns.length === 0 ? (
                        <div className="py-16 text-center border-2 border-dashed border-slate-800/80 rounded-3xl bg-slate-950/20 text-slate-500 uppercase tracking-widest text-[9px] font-bold">
                          Données globales IndexedDB insuffisantes pour extraire des répétitions parfaites.
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                          {repetitionPatterns.map((gp, i) => (
                            <div key={i} className="bg-slate-950/70 p-4 rounded-2xl border border-slate-850 space-y-3.5 hover:border-slate-800 transition-all">
                              
                              <div className="flex items-center justify-between pb-2 border-b border-white/[0.02]">
                                <span className="text-[10.5px] font-black text-white uppercase tracking-wider flex items-center gap-2">
                                  <Target className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                                  Pattern : <span className="text-emerald-400 font-mono font-black py-0.5 px-2 bg-emerald-500/10 rounded-lg">{gp.pattern}</span>
                                </span>
                                
                                <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-400/20 px-2.5 py-0.5 rounded-xl font-mono uppercase tracking-wide">
                                  {gp.count} occurrences
                                </span>
                              </div>

                              <div className="space-y-2.5 pl-2 relative border-l border-indigo-500/10">
                                {gp.matches.map((m, mi) => (
                                  <div key={mi} className="flex justify-between items-center text-[10px] text-slate-400 uppercase gap-3 flex-wrap hover:text-slate-200 transition-colors">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-[8px] font-black text-slate-600 font-mono bg-slate-900 border border-slate-850 px-1 py-0.5 rounded">
                                        {m.season} J{m.round}
                                      </span>
                                      
                                      <div className="flex items-center gap-1.5 truncate">
                                        <img 
                                          src={getTeamLogo(m.homeTeam)} 
                                          alt="" 
                                          className="w-3.5 h-3.5 rounded-full object-contain pointer-events-none ring-1 ring-white/5 bg-slate-900"
                                          referrerPolicy="no-referrer"
                                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                        />
                                        <span className="font-bold text-slate-300 truncate max-w-[120px]">{m.homeTeam}</span>
                                        <span className="text-[8px] text-slate-600 lowercase font-medium">vs</span>
                                        <span className="font-bold text-slate-300 truncate max-w-[120px]">{m.awayTeam}</span>
                                        <img 
                                          src={getTeamLogo(m.awayTeam)} 
                                          alt="" 
                                          className="w-3.5 h-3.5 rounded-full object-contain pointer-events-none ring-1 ring-white/5 bg-slate-900"
                                          referrerPolicy="no-referrer"
                                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                        />
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5 shrink-0 ml-auto md:ml-0">
                                      {m.odds1 && (
                                        <span className="text-[8px] font-mono text-slate-500 bg-black/20 border border-white/5 py-0.5 px-1.5 rounded">
                                          Odds: {m.odds1}-{m.oddsX}-{m.odds2}
                                        </span>
                                      )}
                                      <span className="font-mono text-[8px] text-emerald-400 bg-emerald-500/5 px-1.5 py-0.5 border border-emerald-500/10 rounded">
                                        {(m.scoreDetails?.homeGoals || []).length + (m.scoreDetails?.awayGoals || []).length} buts
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}

                </AnimatePresence>
              )}
            </div>

          </div>
          
        </div>

      </div>

    </div>
  );
}

function summarizeHtFtLabel(htFt: string) {
  if (htFt === '1/1') return 'Dom/Dom';
  if (htFt === 'X/1') return 'Nul/Dom';
  if (htFt === 'X/X') return 'Nul/Nul';
  if (htFt === '2/2') return 'Ext/Ext';
  return htFt;
}
