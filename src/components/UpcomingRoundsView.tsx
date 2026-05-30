import { useState, useEffect, useRef } from 'react';
import { 
  Calendar, 
  Loader2, 
  AlertCircle, 
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  Zap,
  History,
  Activity
} from 'lucide-react';
import { db, ArchivedMatch } from '../services/localArchive';
import { fetchRoundPlayout } from '../lib/api';
import { getTeamLogo, getLeagueFlag } from '../lib/logos';
import { LEAGUES } from '../shared/constants';

interface Match {
  id: number;
  round: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  expectedStart: string;
  homeScore?: string;
  awayScore?: string;
  status?: string;
  scoreDetails?: {
    homeGoals: Array<{ minute: string; player: string }>;
    awayGoals: Array<{ minute: string; player: string }>;
  };
  eventBetTypes: Array<{
    name: string;
    eventBetTypeItems: Array<{
      shortName: string;
      odds: number;
    }>;
  }>;
}

interface RecommendedMarket {
  marketName: string;
  outcomeName: string;
  odds: string; // Current odds for this outcome
  probability: number;
}

interface MatchRecommendation {
  type: 'H2H' | 'TEMPLATE' | 'NONE';
  count: number;
  markets: RecommendedMarket[];
}

interface RoundData {
  id: number; 
  roundNumber: number;
  expectedStart: string;
  matches: Match[];
}

interface UpcomingRoundsViewProps {
  leagueId: number;
  leagueName: string;
  rankings: any[];
}

function ScrollableFormList({ history, size = 'md' }: { history: string[], size?: 'xs' | 'sm' | 'md' }) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (!history || history.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (containerRef.current) {
      const scrollAmount = size === 'xs' ? 50 : (size === 'sm' ? 60 : 80);
      containerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const itemClass = size === 'xs' 
    ? 'w-2 h-2 text-[5px] rounded-[1px]'
    : size === 'sm'
    ? 'w-2.5 h-2.5 text-[5px] rounded-[1.2px]'
    : 'w-3 h-3 text-[6px] rounded-[2px]';

  const btnClass = size === 'xs'
    ? 'w-3 h-3 bg-slate-900/90 hover:bg-slate-800'
    : size === 'sm'
    ? 'w-3.5 h-3.5 bg-slate-900/95 hover:bg-slate-800'
    : 'w-4 h-4 bg-slate-900 border border-white/5 shadow-sm hover:border-slate-700';

  const iconClass = size === 'xs'
    ? 'w-1.5 h-1.5'
    : size === 'sm'
    ? 'w-2 h-2'
    : 'w-2.5 h-2.5';

  return (
    <div className="flex items-center gap-1 group/scroll relative w-full">
      {/* Scroll Left Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          scroll('left');
        }}
        className={`${btnClass} rounded-full text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition-all duration-200 shrink-0 opacity-60 hover:opacity-100`}
        title="Précédent"
      >
        <ChevronLeft className={iconClass} />
      </button>

      {/* Scrollable Container */}
      <div 
        ref={containerRef}
        className="flex-1 flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 max-w-full"
      >
        {history.map((res: string, i: number) => (
          <div key={i} className={`${itemClass} shrink-0 shadow-sm border border-white/10 flex items-center justify-center font-black text-white ${
            res === 'Won' ? 'bg-emerald-500' :
            res === 'Lost' ? 'bg-rose-500' :
            'bg-slate-600'
          }`} title={`Match ${i+1}: ${res}`}>
             {res === 'Won' ? 'V' : res === 'Lost' ? 'D' : 'N'}
          </div>
        ))}
      </div>

      {/* Scroll Right Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          scroll('right');
        }}
        className={`${btnClass} rounded-full text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition-all duration-200 shrink-0 opacity-60 hover:opacity-100`}
        title="Suivant"
      >
        <ChevronRight className={iconClass} />
      </button>
    </div>
  );
}

export default function UpcomingRoundsView({ leagueId, leagueName, rankings }: UpcomingRoundsViewProps) {
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [history, setHistory] = useState<ArchivedMatch[]>([]);
  const [matrices, setMatrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [matchTabs, setMatchTabs] = useState<Record<string, 'analysis' | 'h2h'>>({});

  const toggleMatchTab = (matchId: string | number, tab: 'analysis' | 'h2h') => {
    setMatchTabs(prev => ({ ...prev, [matchId]: tab }));
  };

  const fetchUpcomingRounds = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch History first
      const archive = await db.matches.where('leagueId').equals(leagueId).toArray();
      setHistory(archive as ArchivedMatch[]);

      const archivedMatrices = await db.matrices.where('leagueId').equals(leagueId).toArray();
      setMatrices(archivedMatrices);

      // 1. Get current state to find categoryId and available round numbers
      const matchesResponse = await fetch(`/api/data/league/matches/${leagueId}`);
      if (!matchesResponse.ok) throw new Error('Cnx League failed');
      const matchesData = await matchesResponse.json();
      
      // Handle if response is an array
      const rootData = Array.isArray(matchesData) ? matchesData[0] : matchesData;
      
      let categoryId = rootData?.eventCategoryId || rootData?.EventCategoryID || rootData?.seasonId;
      
      // Resilience: Search in rounds if not at root
      if (!categoryId && rootData?.rounds && rootData.rounds.length > 0) {
        categoryId = rootData.rounds[0].eventCategoryId || rootData.rounds[0].EventCategoryID;
      }
      
      // Resilience: Search in matches
      if (!categoryId && rootData?.rounds?.[0]?.matches?.[0]) {
        const firstMatch = rootData.rounds[0].matches[0];
        categoryId = firstMatch.eventCategoryId || firstMatch.EventCategoryID;
      }

      // Resilience: Search in entries if it's formatted as { status, data: { ... } }
      if (!categoryId && rootData?.data) {
        categoryId = rootData.data.eventCategoryId || rootData.data.EventCategoryID || rootData.data.seasonId;
      }

      // Final fallback: Try ranking API if still missing
      if (!categoryId) {
        console.log('[Upcoming] CategoryId not in matches, trying ranking...');
        const rankRes = await fetch(`/api/data/league/ranking/${leagueId}`);
        if (rankRes.ok) {
          const rankData = await rankRes.json();
          categoryId = rankData.eventCategoryId || rankData.EventCategoryID || rankData.seasonId;
        }
      }

      if (!categoryId || categoryId === 'undefined') {
        console.error('[Upcoming] Could not find valid categoryId in:', matchesData);
        throw new Error('ID Catégorie non trouvé');
      }

      const roundsList = rootData?.rounds || rootData?.data?.rounds || [];
      if (roundsList.length === 0) {
        console.log('[Upcoming] No rounds found in rootData, trying fallback values');
      }

      // Filter for upcoming rounds first if possible, or just take the most relevant ones
      const now = new Date();
      const upcomingRounds = roundsList.filter((r: any) => {
        const start = new Date(r.expectedStart);
        return isNaN(start.getTime()) || start > now;
      });

      // If we don't have enough upcoming rounds, just use the list as fallback but prioritized
      const listToFetch = upcomingRounds.length > 0 ? upcomingRounds : roundsList;

      const fetchPromises = listToFetch.slice(0, 30).map((r: any) => {
        const roundNum = r.roundNumber || r.id;
        const roundCatId = r.eventCategoryId || r.EventCategoryID || categoryId;
        
        return fetch(`/api/data/round/${roundNum}?eventCategoryId=${roundCatId}`)
          .then(async res => {
            if (!res.ok) {
              const errorText = await res.text().catch(() => 'No body');
              console.warn(`[Upcoming] Round ${roundNum} failed (${res.status}): ${errorText}`);
              return null;
            }
            return res.json();
          })
          .then(async data => {
            if (data && data.round) {
              const roundData = data.round;
              const matches = roundData.matches || [];
              
              // NEW: Fetch Playout (Scores) for these matches using the optimized API
              try {
                const playoutData = await fetchRoundPlayout(roundNum, roundCatId, leagueId);
                if (playoutData && playoutData.matches) {
                  matches.forEach((m: any) => {
                    const pMatch = playoutData.matches.find((pm: any) => pm.id === m.id);
                    if (pMatch && pMatch.goals) {
                      const lastGoal = pMatch.goals[pMatch.goals.length - 1];
                      m.homeScore = lastGoal ? String(lastGoal.homeScore) : "0";
                      m.awayScore = lastGoal ? String(lastGoal.awayScore) : "0";
                      
                      // Parse goals for display
                      const hGoals: any[] = [];
                      const aGoals: any[] = [];
                      let prevH = 0;
                      let prevA = 0;
                      
                      pMatch.goals.forEach((g: any) => {
                        if (g.homeScore > prevH) {
                          hGoals.push({ minute: String(g.minute), player: 'But' });
                          prevH = g.homeScore;
                        } else if (g.awayScore > prevA) {
                          aGoals.push({ minute: String(g.minute), player: 'But' });
                          prevA = g.awayScore;
                        }
                      });
                      
                      m.scoreDetails = { homeGoals: hGoals, awayGoals: aGoals };
                    }
                  });
                }
              } catch (e) {
                console.warn(`[Upcoming] Playout fetch failed for round ${roundNum}`, e);
              }

              return {
                id: roundData.id || roundNum,
                roundNumber: roundData.id || roundData.roundNumber || roundNum,
                expectedStart: roundData.expectedStart,
                matches: matches
              } as RoundData;
            }
            return null;
          })
          .catch(err => {
            console.error(`[Upcoming] Round ${roundNum} fetch error:`, err);
            return null;
          });
      });

      const results = await Promise.all(fetchPromises);
      const validRounds = results
        .filter((r): r is RoundData => r !== null && (r.matches?.length || 0) > 0)
        .sort((a, b) => {
          const dateA = new Date(a.expectedStart).getTime();
          const dateB = new Date(b.expectedStart).getTime();
          if (!isNaN(dateA) && !isNaN(dateB)) return dateA - dateB;
          return a.roundNumber - b.roundNumber;
        });
      
      setRounds(validRounds);
      if (validRounds.length > 0) {
        setExpandedRounds(new Set([validRounds[0].roundNumber]));
      }
    } catch (err: any) {
      console.error('Fetch Upcoming Error:', err);
      setError(err.message || 'Erreur chargement rounds');
    } finally {
      setLoading(false);
    }
  };

  const roundsRef = useRef(rounds);
  const expandedRoundsRef = useRef(expandedRounds);
  
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  useEffect(() => { expandedRoundsRef.current = expandedRounds; }, [expandedRounds]);

  useEffect(() => {
    fetchUpcomingRounds();
    
    // Auto-refresh scores every 0.5 second for live-like experience
    const interval = setInterval(() => {
      refreshScoresOnly();
    }, 500);
    
    return () => clearInterval(interval);
  }, [leagueId]);

  const refreshScoresOnly = async () => {
    const currentRounds = roundsRef.current;
    if (currentRounds.length === 0) return;
    
    // Improved categoryId detection
    let categoryId: any = null;
    for (const r of currentRounds) {
      if (r.matches && r.matches.length > 0) {
        const firstMatch: any = r.matches[0];
        categoryId = firstMatch.eventCategoryId || firstMatch.EventCategoryID;
        if (categoryId) break;
      }
    }
    
    if (!categoryId) {
      // Try to find it in the flat list
      const firstMatchWithCatId = currentRounds.flatMap((r: any) => (r.matches || []) as any[]).find((m: any) => m.eventCategoryId || m.EventCategoryID);
      categoryId = firstMatchWithCatId?.eventCategoryId || firstMatchWithCatId?.EventCategoryID;
    }
    
    if (!categoryId) return;

    const expandedNums = Array.from(expandedRoundsRef.current) as number[];
    if (expandedNums.length === 0) return;

    try {
      const updates = await Promise.all(expandedNums.map(async (roundNum: number) => {
        const playoutData = await fetchRoundPlayout(roundNum, categoryId, leagueId);
        return { roundNum, playoutData };
      }));

      setRounds(prevRounds => {
        const newRounds = [...prevRounds];
        let hasGlobalChange = false;
        
        updates.forEach(({ roundNum, playoutData }) => {
          if (!playoutData || !playoutData.matches) return;
          const rIdx = newRounds.findIndex(r => r.roundNumber === roundNum);
          if (rIdx === -1) return;

          const roundMatches = [...newRounds[rIdx].matches];
          let changed = false;

          playoutData.matches.forEach((pMatch: any) => {
            const mIdx = roundMatches.findIndex(m => String(m.id) === String(pMatch.id));
            if (mIdx !== -1 && pMatch.goals !== undefined) {
              const goals = pMatch.goals || [];
              const lastGoal = goals.length > 0 ? goals[goals.length - 1] : null;
              const hScore = lastGoal ? String(lastGoal.homeScore) : "0";
              const aScore = lastGoal ? String(lastGoal.awayScore) : "0";
              
              if (String(roundMatches[mIdx].homeScore) !== String(hScore) || String(roundMatches[mIdx].awayScore) !== String(aScore)) {
                roundMatches[mIdx] = { ...roundMatches[mIdx], homeScore: hScore, awayScore: aScore, status: 'Finished' };
                
                // Update match details if goals changed
                const hGoals: any[] = [];
                const aGoals: any[] = [];
                let prevH = 0;
                let prevA = 0;
                goals.forEach((g: any) => {
                  if (g.homeScore > prevH) { hGoals.push({ minute: String(g.minute), player: 'But' }); prevH = g.homeScore; }
                  else if (g.awayScore > prevA) { aGoals.push({ minute: String(g.minute), player: 'But' }); prevA = g.awayScore; }
                });
                roundMatches[mIdx].scoreDetails = { homeGoals: hGoals, awayGoals: aGoals };
                changed = true;
                hasGlobalChange = true;
              }
            }
          });

          if (changed) {
            newRounds[rIdx] = { ...newRounds[rIdx], matches: roundMatches };
          }
        });
        return hasGlobalChange ? newRounds : prevRounds;
      });
    } catch (e) {
      // Small silent error for background refresh
    }
  };

  const toggleRound = (roundNum: number) => {
    const next = new Set(expandedRounds);
    if (next.has(roundNum)) next.delete(roundNum);
    else next.add(roundNum);
    setExpandedRounds(next);
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '-';
    }
  };

  const getRecommendation = (match: Match): MatchRecommendation => {
    if (history.length === 0) return { type: 'NONE', count: 0, markets: [] };

    const home = match.homeTeam.name;
    const away = match.awayTeam.name;
    
    const odds1X2 = match.eventBetTypes.find(t => t.name === '1X2');
    const u1 = odds1X2?.eventBetTypeItems.find(i => i.shortName === '1')?.odds || 0;
    const uX = odds1X2?.eventBetTypeItems.find(i => i.shortName === 'X')?.odds || 0;
    const u2 = odds1X2?.eventBetTypeItems.find(i => i.shortName === '2')?.odds || 0;

    const h2h = history.filter(h => h.homeTeam === home && h.awayTeam === away);
    const templates = history.filter(h => {
       if (u1 <= 1.05) return false;
       const h1 = parseFloat(h.odds1 || '0');
       const hX = parseFloat(h.oddsX || '0');
       const h2 = parseFloat(h.odds2 || '0');
       return Math.abs(h1 - u1) <= 0.05 && Math.abs(hX - uX) <= 0.05 && Math.abs(h2 - u2) <= 0.05;
    });

    const isH2H = h2h.length >= 2;
    const relevant = isH2H ? h2h : templates.length >= 3 ? templates : [];
    
    if (relevant.length === 0) return { type: 'NONE', count: 0, markets: [] };

    const count = relevant.length;
    const recs: RecommendedMarket[] = [];

    // Helper to evaluate a market against history
    const evalMarket = (marketName: string, outcomeName: string, predicate: (h: ArchivedMatch) => boolean) => {
      const wins = relevant.filter(predicate).length;
      const prob = (wins / count) * 100;
      
      if (prob >= 65) {
        // Find current odds from the upcoming match
        const market = match.eventBetTypes.find(t => 
          t.name.toLowerCase().includes(marketName.toLowerCase()) || 
          (marketName === 'GG/NG' && (t.name.includes('Goal') || t.name.includes('marquent'))) ||
          (marketName.includes('Over/Under') && t.name.includes('Over/Under'))
        );
        
        let odds = "0.00";
        if (market) {
          const item = market.eventBetTypeItems.find(i => {
             const short = i.shortName.toLowerCase();
             const target = outcomeName.toLowerCase();
             return short === target ||
                    (target === 'yes' && (short === 'oui' || short === 'y')) ||
                    (target === 'no' && (short === 'non' || short === 'n')) ||
                    (target.includes('over') && short.includes('over')) ||
                    (target.includes('under') && short.includes('under')) ||
                    (marketName === '1X2' && short === target);
          });
          if (item) odds = item.odds.toFixed(2);
        }

        if (odds !== "0.00") {
          recs.push({ marketName, outcomeName, odds, probability: prob });
        }
      }
    };

    // 1X2
    evalMarket('1X2', '1', (h) => parseInt(h.homeScore!) > parseInt(h.awayScore!));
    evalMarket('1X2', 'X', (h) => parseInt(h.homeScore!) === parseInt(h.awayScore!));
    evalMarket('1X2', '2', (h) => parseInt(h.homeScore!) < parseInt(h.awayScore!));

    // Double Chance
    evalMarket('Double Chance', '1X', (h) => parseInt(h.homeScore!) >= parseInt(h.awayScore!));
    evalMarket('Double Chance', 'X2', (h) => parseInt(h.homeScore!) <= parseInt(h.awayScore!));
    evalMarket('Double Chance', '12', (h) => parseInt(h.homeScore!) !== parseInt(h.awayScore!));

    // BTTS
    evalMarket('GG/NG', 'Yes', (h) => parseInt(h.homeScore!) > 0 && parseInt(h.awayScore!) > 0);
    evalMarket('GG/NG', 'No', (h) => parseInt(h.homeScore!) === 0 || parseInt(h.awayScore!) === 0);

    // Over/Under 2.5
    evalMarket('Over/Under 2.5', 'Over 2.5', (h) => (parseInt(h.homeScore!) + parseInt(h.awayScore!)) > 2.5);
    evalMarket('Over/Under 2.5', 'Under 2.5', (h) => (parseInt(h.homeScore!) + parseInt(h.awayScore!)) < 2.5);

    // Over/Under 1.5
    evalMarket('Over/Under 1.5', 'Over 1.5', (h) => (parseInt(h.homeScore!) + parseInt(h.awayScore!)) > 1.5);

    // Over/Under 3.5
    evalMarket('Over/Under 3.5', 'Over 3.5', (h) => (parseInt(h.homeScore!) + parseInt(h.awayScore!)) > 3.5);
    evalMarket('Over/Under 3.5', 'Under 3.5', (h) => (parseInt(h.homeScore!) + parseInt(h.awayScore!)) < 3.5);

    // Clean Sheet
    evalMarket('Clean Sheet', 'Dom. Non encaissé', (h) => parseInt(h.awayScore!) === 0);
    evalMarket('Clean Sheet', 'Ext. Non encaissé', (h) => parseInt(h.homeScore!) === 0);

    // Win to Nil
    evalMarket('Win to Nil', 'Dom. Gagne sans encaisser', (h) => parseInt(h.homeScore!) > parseInt(h.awayScore!) && parseInt(h.awayScore!) === 0);
    evalMarket('Win to Nil', 'Ext. Gagne sans encaisser', (h) => parseInt(h.awayScore!) > parseInt(h.homeScore!) && parseInt(h.homeScore!) === 0);
    
    // Sort markets by probability
    recs.sort((a, b) => b.probability - a.probability);

    return {
      type: isH2H ? 'H2H' : 'TEMPLATE',
      count,
      markets: recs.slice(0, 5) // Recommend top 5
    };
  };

  const isSameTeam = (t1: string = '', t2: string = '') => {
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

  const isSameSeason = (s1: string = '', s2: string = '') => {
    const n1 = s1.toLowerCase().replace(/\s+/g, '').replace(/[\-/]/g, '');
    const n2 = s2.toLowerCase().replace(/\s+/g, '').replace(/[\-/]/g, '');
    if (n1 === n2) return true;
    if (n1.includes(n2) || n2.includes(n1)) return true;
    return false;
  };

  const getHistoricalRank = (teamName: string, season: string, round: number) => {
    if (!matrices || matrices.length === 0) return null;
    
    // Find matching matrix by season
    const matrix = matrices.find(m => isSameSeason(m.season, season));
    
    if (!matrix) return null;
    
    // Find closest key in rankTimeline
    let matchedKey = Object.keys(matrix.rankTimeline || {}).find(k => isSameTeam(k, teamName));
    
    if (matchedKey && matrix.rankTimeline[matchedKey]) {
      const historyArr = matrix.rankTimeline[matchedKey];
      const rIdx = round - 1; // 1-indexed to 0-indexed
      if (rIdx >= 0 && rIdx < historyArr.length) {
        return historyArr[rIdx];
      }
      if (historyArr.length > 0) {
        return historyArr[Math.min(rIdx, historyArr.length - 1)];
      }
    }
    
    // Fallback: search in teamForms
    if (matrix.teamForms) {
      const matchedForm = matrix.teamForms.find((tf: any) => isSameTeam(tf.teamName, teamName));
      if (matchedForm) {
        return matchedForm.rank;
      }
    }
    
    return null;
  };

  const getTeamGlobalStats = (teamName: string) => {
    if (!history || history.length === 0) return null;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let played = 0;

    history.forEach(m => {
      const hScoreStr = m.homeScore;
      const aScoreStr = m.awayScore;
      if (hScoreStr === undefined || hScoreStr === null || hScoreStr === '' || hScoreStr === '-') return;
      if (aScoreStr === undefined || aScoreStr === null || aScoreStr === '' || aScoreStr === '-') return;

      const hN = m.homeTeam || '';
      const aN = m.awayTeam || '';

      if (isSameTeam(hN, teamName)) {
        played++;
        const hScore = parseInt(hScoreStr);
        const aScore = parseInt(aScoreStr);
        if (hScore > aScore) wins++;
        else if (hScore === aScore) draws++;
        else losses++;
      } else if (isSameTeam(aN, teamName)) {
        played++;
        const hScore = parseInt(hScoreStr);
        const aScore = parseInt(aScoreStr);
        if (aScore > hScore) wins++;
        else if (hScore === aScore) draws++;
        else losses++;
      }
    });

    if (played === 0) return null;
    const winPct = Math.round((wins / played) * 100);
    const drawPct = Math.round((draws / played) * 100);
    const lossPct = Math.round((losses / played) * 100);

    return { wins, draws, losses, played, winPct, drawPct, lossPct };
  };

  const getTeamStatsAtMoment = (teamName: string, season: string, beforeDate: string | undefined, beforeRound: number) => {
    if (!history || history.length === 0) return null;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let played = 0;
    
    // Filter and sort chronologically so forms are calculated correctly
    const pastMatchesOfSeason = history.filter(m => {
      if (!isSameSeason(m.season, season)) return false;
      const hScoreStr = m.homeScore;
      const aScoreStr = m.awayScore;
      if (hScoreStr === undefined || hScoreStr === null || hScoreStr === '' || hScoreStr === '-') return false;
      if (aScoreStr === undefined || aScoreStr === null || aScoreStr === '' || aScoreStr === '-') return false;
      
      if (beforeDate && m.expectedStart) {
        return new Date(m.expectedStart).getTime() < new Date(beforeDate).getTime();
      } else {
        return Number(m.round) < beforeRound;
      }
    }).sort((a, b) => (a.expectedStart || '').localeCompare(b.expectedStart || ''));

    const forms: string[] = [];

    pastMatchesOfSeason.forEach(m => {
      const hN = m.homeTeam || '';
      const aN = m.awayTeam || '';
      const hScore = parseInt(m.homeScore || '0');
      const aScore = parseInt(m.awayScore || '0');

      if (isSameTeam(hN, teamName)) {
        played++;
        if (hScore > aScore) {
          wins++;
          forms.push('Won');
        } else if (hScore === aScore) {
          draws++;
          forms.push('Draw');
        } else {
          losses++;
          forms.push('Lost');
        }
      } else if (isSameTeam(aN, teamName)) {
        played++;
        if (aScore > hScore) {
          wins++;
          forms.push('Won');
        } else if (hScore === aScore) {
          draws++;
          forms.push('Draw');
        } else {
          losses++;
          forms.push('Lost');
        }
      }
    });

    if (played === 0) return null;
    const winPct = Math.round((wins / played) * 100);
    const drawPct = Math.round((draws / played) * 100);
    const lossPct = Math.round((losses / played) * 100);
    const last5Form = forms.slice(-5);

    return { wins, draws, losses, played, winPct, drawPct, lossPct, form: last5Form, allForms: forms };
  };

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-2xl max-w-6xl mx-auto">
      <div className="p-4 border-b border-slate-800 bg-[#020617]/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 shadow-inner">
            <Calendar className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tight">Prochaines Journées</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
              <img 
                src={getLeagueFlag(LEAGUES.find(l => l.id === leagueId)?.country)} 
                alt="" 
                className="w-3.5 h-2.5 object-contain"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em]">{leagueName}</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Mise à jour</span>
            <span className="text-[10px] font-bold text-slate-300 uppercase">{new Date().toLocaleTimeString('fr-FR')}</span>
          </div>
          <button 
            onClick={fetchUpcomingRounds}
            disabled={loading}
            className="group flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-indigo-400 shadow-lg active:scale-95"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Mise à jour
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 max-h-[85vh] overflow-y-auto custom-scrollbar bg-gradient-to-b from-[#0f172a] to-[#010413]">
        {loading && rounds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-600/30 blur-2xl rounded-full scale-150 animate-pulse" />
              <Loader2 className="relative w-12 h-12 text-indigo-500 animate-spin" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Exploration des Matchs...</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center space-y-4 bg-rose-500/5 rounded-3xl border-2 border-dashed border-rose-500/20">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm text-rose-100 font-black uppercase">Erreur de chargement</p>
            <button 
              onClick={fetchUpcomingRounds} 
              className="px-6 py-2 bg-rose-500 text-white text-[10px] font-black uppercase rounded-lg"
            >
              Réessayer
            </button>
          </div>
        ) : (
          rounds.map((round) => (
            <div key={round.roundNumber} className="group border border-slate-800/80 rounded-2xl overflow-hidden bg-[#020617]/40 hover:border-indigo-500/30 transition-all duration-300">
              <button
                onClick={() => toggleRound(round.roundNumber)}
                className="w-full p-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-5">
                   <div className="relative">
                      <div className="relative flex flex-col items-center justify-center bg-[#010413] px-4 py-1.5 rounded-xl border border-slate-800 group-hover:border-indigo-500/40 transition-all">
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none mb-0.5">Round</span>
                        <span className="text-lg font-black text-indigo-400 leading-none">{round.roundNumber}</span>
                      </div>
                   </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-indigo-300">
                      <Clock className="w-3 h-3" />
                      <span className="text-[11px] font-black uppercase tracking-tight">{formatTime(round.expectedStart)}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="w-2.5 h-2.5" />
                      {round.matches.length} Matchs
                    </div>
                  </div>
                </div>
                <div className={`p-1.5 rounded-lg border border-slate-800 transition-all ${expandedRounds.has(round.roundNumber) ? 'rotate-180 bg-indigo-600 border-indigo-400 text-white' : 'text-slate-500'}`}>
                  <ChevronDown className="w-4 h-4" />
                </div>
              </button>

              {expandedRounds.has(round.roundNumber) && (
                <div className="p-3 pt-1 grid grid-cols-1 lg:grid-cols-2 gap-3 border-t border-slate-800/60 bg-gradient-to-br from-[#020617]/50 to-transparent">
                  {round.matches.map((match) => {
                    const rec = getRecommendation(match);
                    const activeTab = matchTabs[match.id] || 'analysis';
                    const home = match.homeTeam.name;
                    const away = match.awayTeam.name;

                    const activeSeasonsList = Array.from(new Set(history.map(m => m.season).filter(Boolean)));
                    const activeSeason = activeSeasonsList.sort((a, b) => b.localeCompare(a))[0] || "2024/2025";
                    const homeRowTemporal = getTeamStatsAtMoment(home, activeSeason, match.expectedStart, round.roundNumber);
                    const awayRowTemporal = getTeamStatsAtMoment(away, activeSeason, match.expectedStart, round.roundNumber);

                    const h2hHistory = history.filter(h => {
                      const hHome = (h.homeTeam || '').toLowerCase().trim();
                      const hAway = (h.awayTeam || '').toLowerCase().trim();
                      const curHome = home.toLowerCase().trim();
                      const curAway = away.toLowerCase().trim();

                      const hasHomeScore = h.homeScore !== undefined && h.homeScore !== null && String(h.homeScore).trim() !== '' && String(h.homeScore).trim() !== '-';
                      const hasAwayScore = h.awayScore !== undefined && h.awayScore !== null && String(h.awayScore).trim() !== '' && String(h.awayScore).trim() !== '-';
                      if (!hasHomeScore || !hasAwayScore) return false;

                      return (hHome === curHome && hAway === curAway) || 
                             (hHome === curAway && hAway === curHome);
                    }).sort((a, b) => (b.expectedStart || '').localeCompare(a.expectedStart || ''));

                    return (
                      <div key={match.id} className="relative bg-slate-900/40 border border-slate-800/60 rounded-[1.5rem] p-4 transition-all hover:bg-slate-800/40 group/match overflow-hidden">
                        {/* Tabs Header */}
                        <div className="flex items-center gap-1 mb-4 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                          <button 
                            onClick={() => toggleMatchTab(match.id, 'analysis')}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${activeTab === 'analysis' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                          >
                            <Zap className="w-3 h-3" />
                            Analyse
                          </button>
                          <button 
                            onClick={() => toggleMatchTab(match.id, 'h2h')}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${activeTab === 'h2h' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                          >
                            <History className="w-3 h-3" />
                            H2H
                            {h2hHistory.length > 0 && <span className="ml-1 opacity-60">({h2hHistory.length})</span>}
                          </button>
                        </div>

                        {/* Match Header */}
                        <div className="relative z-10 flex items-center justify-between mb-4 gap-2">
                          <div className="flex-1 flex flex-col items-center text-center gap-1.5 overflow-hidden">
                             <div className="flex items-center gap-1.5 w-full justify-center">
                                {(() => {
                                   const rIdx = rankings.findIndex(t => (t.name || t.teamName) === match.homeTeam.name);
                                   if (rIdx === -1) return null;
                                   return (
                                     <span className="text-[8px] font-black text-indigo-500 bg-indigo-500/10 px-1.5 rounded-full border border-indigo-500/10">
                                       #{rIdx + 1}
                                     </span>
                                   );
                                })()}
                                <div className="w-8 h-8 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden shadow-lg shadow-black/20">
                                   <img 
                                     src={getTeamLogo(match.homeTeam.name)} 
                                     alt="" 
                                     className="w-full h-full object-contain" 
                                     onError={(e) => (e.currentTarget.style.display = 'none')}
                                   />
                                </div>
                             </div>
                             <span className="text-[10px] font-black text-slate-100 uppercase tracking-tighter truncate w-full">{match.homeTeam.name}</span>
                             {(() => {
                                const r = rankings.find(t => (t.name || t.teamName) === match.homeTeam.name);
                                if (!r) return null;
                                const played = (Number(r.won) || 0) + (Number(r.draw) || 0) + (Number(r.lost) || 0);
                                if (played === 0) return null;
                                return (
                                  <div className="flex gap-1 text-[8px] font-bold">
                                    <span className="text-emerald-500">{Math.round((Number(r.won)/played)*100)}%</span>
                                    <span className="text-amber-500">{Math.round((Number(r.draw)/played)*100)}%</span>
                                    <span className="text-rose-500">{Math.round((Number(r.lost)/played)*100)}%</span>
                                  </div>
                                );
                             })()}
                             {homeRowTemporal?.allForms && homeRowTemporal.allForms.length > 0 && (
                               <div className="mt-1 w-full max-w-[105px] bg-slate-950/20 p-0.5 rounded border border-white/[0.02]">
                                 <ScrollableFormList history={homeRowTemporal.allForms} size="xs" />
                               </div>
                             )}
                          </div>

                          <div className="flex flex-col items-center gap-2">
                             {match.homeScore !== undefined && match.awayScore !== undefined ? (
                               <div className="flex flex-col items-center">
                                 <div className="flex items-center gap-1.5">
                                   <span className="text-xl font-black text-white bg-slate-950 px-3 py-1 rounded-xl border border-slate-800 shadow-inner">
                                     {match.homeScore}
                                   </span>
                                   <span className="text-slate-600 font-black text-xs">:</span>
                                   <span className="text-xl font-black text-white bg-slate-950 px-3 py-1 rounded-xl border border-slate-800 shadow-inner">
                                     {match.awayScore}
                                   </span>
                                 </div>

                                 {/* HT/FT Calculation and Display */}
                                 {(() => {
                                   const homeGoalsList = match.scoreDetails?.homeGoals || [];
                                   const awayGoalsList = match.scoreDetails?.awayGoals || [];
                                   const hHomeScore = parseInt(match.homeScore || '0');
                                   const hAwayScore = parseInt(match.awayScore || '0');
                                   if (homeGoalsList.length > 0 || awayGoalsList.length > 0) {
                                     let hHt = 0;
                                     let aHt = 0;
                                     homeGoalsList.forEach((g: any) => {
                                       const m = parseInt(g.minute || '0');
                                       if (!isNaN(m) && m <= 45) hHt++;
                                     });
                                     awayGoalsList.forEach((g: any) => {
                                       const m = parseInt(g.minute || '0');
                                       if (!isNaN(m) && m <= 45) aHt++;
                                     });
                                     const htRes = hHt > aHt ? '1' : (hHt < aHt ? '2' : 'X');
                                     const ftRes = hHomeScore > hAwayScore ? '1' : (hHomeScore < hAwayScore ? '2' : 'X');
                                     return (
                                       <div className="mt-1 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 font-mono text-[7px] font-black uppercase tracking-wider">
                                         HT/FT {htRes}/{ftRes}
                                       </div>
                                     );
                                   }
                                   return null;
                                 })()}
                                 {match.status && (match.status.includes("'") || match.status.toLowerCase() === 'live') && (
                                   <div className="flex items-center gap-1 mt-1.5">
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                      <span className="text-[9px] font-black text-emerald-500 uppercase">{match.status}</span>
                                   </div>
                                 )}
                               </div>
                             ) : (
                               <div className="w-8 h-8 rounded-full bg-[#010413] border border-slate-700 flex items-center justify-center text-[9px] font-black text-indigo-400 italic">VS</div>
                             )}
                          </div>

                          <div className="flex-1 flex flex-col items-center text-center gap-1.5 overflow-hidden">
                             <div className="flex items-center gap-1.5 w-full justify-center">
                                <div className="w-8 h-8 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden shadow-lg shadow-black/20">
                                   <img 
                                     src={getTeamLogo(match.awayTeam.name)} 
                                     alt="" 
                                     className="w-full h-full object-contain" 
                                     onError={(e) => (e.currentTarget.style.display = 'none')}
                                   />
                                </div>
                                {(() => {
                                   const rIdx = rankings.findIndex(t => (t.name || t.teamName) === match.awayTeam.name);
                                   if (rIdx === -1) return null;
                                   return (
                                     <span className="text-[8px] font-black text-indigo-500 bg-indigo-500/10 px-1.5 rounded-full border border-indigo-500/10">
                                       #{rIdx + 1}
                                     </span>
                                   );
                                })()}
                             </div>
                             <span className="text-[10px] font-black text-slate-100 uppercase tracking-tighter truncate w-full">{match.awayTeam.name}</span>
                             {(() => {
                                const r = rankings.find(t => (t.name || t.teamName) === match.awayTeam.name);
                                if (!r) return null;
                                const played = (Number(r.won) || 0) + (Number(r.draw) || 0) + (Number(r.lost) || 0);
                                if (played === 0) return null;
                                return (
                                  <div className="flex gap-1 text-[8px] font-bold">
                                    <span className="text-emerald-500">{Math.round((Number(r.won)/played)*100)}%</span>
                                    <span className="text-amber-500">{Math.round((Number(r.draw)/played)*100)}%</span>
                                    <span className="text-rose-500">{Math.round((Number(r.lost)/played)*100)}%</span>
                                  </div>
                                );
                             })()}
                             {awayRowTemporal?.allForms && awayRowTemporal.allForms.length > 0 && (
                               <div className="mt-1 w-full max-w-[105px] bg-slate-950/20 p-0.5 rounded border border-white/[0.02]">
                                 <ScrollableFormList history={awayRowTemporal.allForms} size="xs" />
                               </div>
                             )}
                          </div>
                        </div>

                        {/* 1X2 Odds */}
                        {(() => {
                          const odds1X2 = match.eventBetTypes?.find(t => t.name === '1X2');
                          const o1 = odds1X2?.eventBetTypeItems?.find(i => i.shortName === '1')?.odds;
                          const oX = odds1X2?.eventBetTypeItems?.find(i => i.shortName === 'X')?.odds;
                          const o2 = odds1X2?.eventBetTypeItems?.find(i => i.shortName === '2')?.odds;
                          
                          if (!o1 && !oX && !o2) return null;
                          return (
                            <div className="grid grid-cols-3 gap-2 bg-slate-950/60 border border-slate-800/70 p-1.5 rounded-xl mb-4 text-center">
                              <div className="flex flex-col items-center py-1 px-1 bg-slate-950/40 rounded-lg border border-white/[0.02]">
                                <span className="text-[7.5px] text-slate-500 font-extrabold uppercase tracking-wider">1 (Dom.)</span>
                                <span className="text-[11.5px] font-black text-indigo-400 font-mono mt-0.5">{o1 ? o1.toFixed(2) : '-'}</span>
                              </div>
                              <div className="flex flex-col items-center py-1 px-1 bg-slate-950/40 rounded-lg border border-white/[0.02]">
                                <span className="text-[7.5px] text-slate-500 font-extrabold uppercase tracking-wider">X (Nul)</span>
                                <span className="text-[11.5px] font-black text-amber-500 font-mono mt-0.5">{oX ? oX.toFixed(2) : '-'}</span>
                              </div>
                              <div className="flex flex-col items-center py-1 px-1 bg-slate-950/40 rounded-lg border border-white/[0.02]">
                                <span className="text-[7.5px] text-slate-500 font-extrabold uppercase tracking-wider">2 (Ext.)</span>
                                <span className="text-[11.5px] font-black text-rose-500 font-mono mt-0.5">{o2 ? o2.toFixed(2) : '-'}</span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Goal Timeline */}
                        {(match.scoreDetails?.homeGoals?.length || 0) + (match.scoreDetails?.awayGoals?.length || 0) > 0 && (
                          <div className="flex flex-wrap gap-1 justify-center mb-4 py-1.5 px-2 border-y border-white/[0.03] bg-white/[0.02] rounded-xl">
                            {[...(match.scoreDetails?.homeGoals?.map(g => ({ ...g, side: 'h' })) || []), 
                              ...(match.scoreDetails?.awayGoals?.map(g => ({ ...g, side: 'a' })) || [])]
                              .sort((a, b) => parseInt(a.minute) - parseInt(b.minute))
                              .map((g, gi) => (
                                <div key={gi} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${g.side === 'h' ? 'text-emerald-500 bg-emerald-500/5 border-emerald-500/20' : 'text-rose-500 bg-rose-500/5 border-rose-500/20'}`}>
                                   <span className="text-[8px] font-black">{g.minute}'</span>
                                </div>
                              ))
                            }
                          </div>
                        )}

                        <div className="relative min-h-[140px]">
                          {activeTab === 'analysis' ? (
                            <div className="space-y-2.5">
                              {rec.type !== 'NONE' && rec.markets.length > 0 ? (
                                <>
                                  <div className="flex items-center justify-between mb-2 px-1">
                                     <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Pronostics IA</span>
                                     <span className="text-[8px] font-bold text-slate-600 uppercase italic">{rec.count} archives</span>
                                  </div>
                                  <div className="grid grid-cols-1 gap-1.5">
                                     {rec.markets.slice(0, 3).map((m, idx) => (
                                       <div key={idx} className="flex items-center justify-between bg-[#010413]/60 border border-slate-800/50 rounded-xl p-2.5 hover:bg-[#010413] transition-all">
                                          <div className="flex flex-col">
                                             <span className="text-[6px] font-black text-indigo-400 uppercase tracking-widest">{m.marketName}</span>
                                             <span className="text-[9px] font-black text-white uppercase truncate max-w-[100px]">{m.outcomeName}</span>
                                          </div>
                                          <div className="flex items-center gap-4">
                                             <div className="flex flex-col items-end">
                                                <span className="text-[6px] font-black text-slate-500 uppercase">Prob.</span>
                                                <span className="text-[10px] font-black text-emerald-400">{m.probability.toFixed(0)}%</span>
                                             </div>
                                             <div className="bg-indigo-600 px-3 py-1 rounded-lg border border-indigo-400">
                                                <span className="text-xs font-black text-white">{m.odds}</span>
                                             </div>
                                          </div>
                                       </div>
                                     ))}
                                  </div>
                                </>
                              ) : (
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                  {match.eventBetTypes.find(t => t.name === '1X2')?.eventBetTypeItems.map(odd => (
                                    <div key={odd.shortName} className="bg-[#010413] p-3 rounded-xl border border-slate-800 text-center">
                                      <div className="text-[7px] text-slate-500 font-bold uppercase mb-1">{odd.shortName === 'X' ? 'Nul' : odd.shortName === '1' ? 'Dom.' : 'Ext.'}</div>
                                      <div className="text-xs font-black text-white italic">{odd.odds.toFixed(2)}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                              {(() => {
                                if (h2hHistory.length === 0) {
                                  return (
                                    <div className="py-10 text-center bg-slate-950/20 rounded-2xl border border-dashed border-slate-800">
                                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Aucun historique direct</p>
                                    </div>
                                  );
                                }

                                // Compute stats relative to upcoming home/away
                                let homeWins = 0;
                                let draws = 0;
                                let awayWins = 0;
                                const curHome = home.toLowerCase().trim();

                                h2hHistory.forEach(h => {
                                  const hHomeScore = parseInt(h.homeScore || '0');
                                  const hAwayScore = parseInt(h.awayScore || '0');
                                  const hHome = (h.homeTeam || '').toLowerCase().trim();
                                  const isHomePlayingHome = hHome === curHome;

                                  if (hHomeScore === hAwayScore) {
                                    draws++;
                                  } else if (hHomeScore > hAwayScore) {
                                    if (isHomePlayingHome) {
                                      homeWins++;
                                    } else {
                                      awayWins++;
                                    }
                                  } else {
                                    if (isHomePlayingHome) {
                                      awayWins++;
                                    } else {
                                      homeWins++;
                                    }
                                  }
                                });

                                const total = h2hHistory.length;
                                const pHomeWin = total > 0 ? Math.round((homeWins / total) * 100) : 0;
                                const pDraw = total > 0 ? Math.round((draws / total) * 100) : 0;
                                const pAwayWin = total > 0 ? (100 - pHomeWin - pDraw) : 0; // Ensures perfect 100% total sum

                                const hGlobal = getTeamGlobalStats(home);
                                const aGlobal = getTeamGlobalStats(away);

                                return (
                                  <>
                                    <div className="bg-slate-950/40 border border-slate-800/80 p-2.5 rounded-2xl flex flex-col gap-2 mb-3">
                                      <div className="flex items-center justify-between text-[7.5px] font-black text-slate-400 uppercase tracking-wider">
                                        <span>Statistiques H2H ({total} Matchs)</span>
                                        <div className="flex gap-2 font-mono">
                                          <span className="text-emerald-400">V : {pHomeWin}%</span>
                                          <span className="text-amber-400">N : {pDraw}%</span>
                                          <span className="text-rose-400">D : {pAwayWin}%</span>
                                        </div>
                                      </div>
                                      
                                      {/* Segmented bar graph */}
                                      <div className="w-full h-1.5 bg-slate-900 rounded-full flex overflow-hidden">
                                        <div className="bg-emerald-500 h-full" style={{ width: `${pHomeWin}%` }} title={`Victoires ${home} : ${pHomeWin}%`} />
                                        <div className="bg-amber-500 h-full" style={{ width: `${pDraw}%` }} title={`Nuls : ${pDraw}%`} />
                                        <div className="bg-rose-500 h-full" style={{ width: `${pAwayWin}%` }} title={`Victoires ${away} : ${pAwayWin}%`} />
                                      </div>

                                      <div className="flex items-center justify-between text-[8px] font-black text-slate-500 uppercase mt-0.5">
                                        <div className="flex flex-col min-w-0">
                                          <span className="truncate max-w-[120px] text-emerald-400">{home} ({homeWins})</span>
                                          {hGlobal && (
                                            <span className="text-[6.5px] text-slate-400 font-mono lowercase whitespace-nowrap mt-0.5">
                                              Bilan: {hGlobal.winPct}%v / {hGlobal.drawPct}%n / {hGlobal.lossPct}%d
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-amber-400">Nuls ({draws})</span>
                                        <div className="flex flex-col items-end min-w-0">
                                          <span className="truncate max-w-[120px] text-right text-rose-400">{away} ({awayWins})</span>
                                          {aGlobal && (
                                            <span className="text-[6.5px] text-slate-400 font-mono lowercase whitespace-nowrap mt-0.5">
                                              Bilan: {aGlobal.winPct}%v / {aGlobal.drawPct}%n / {aGlobal.lossPct}%d
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>



                                    {(() => {
                                      const groupedBySeason: Record<string, typeof h2hHistory> = {};
                                      h2hHistory.forEach(h2hMatch => {
                                        const sName = h2hMatch.season || 'Saison Inconnue';
                                        if (!groupedBySeason[sName]) {
                                          groupedBySeason[sName] = [];
                                        }
                                        groupedBySeason[sName].push(h2hMatch);
                                      });
                                      const sortedSeasons = Object.keys(groupedBySeason).sort((a, b) => b.localeCompare(a));
                                      return sortedSeasons.map((seasonName) => {
                                        const seasonMatches = groupedBySeason[seasonName];
                                        return (
                                          <div key={seasonName} className="bg-[#050920]/45 border border-indigo-950/40 rounded-2xl overflow-hidden shadow-xl mb-3">
                                            {/* Same season main card header */}
                                            <div className="flex items-center justify-between px-3.5 py-2.5 bg-indigo-950/20 border-b border-indigo-950/30">
                                              <span className="text-[9.5px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 select-none">
                                                🏆 Saison {seasonName}
                                              </span>
                                              <span className="text-[8px] font-black text-slate-400 font-mono bg-slate-950/70 border border-slate-800/80 px-2 py-0.5 rounded">
                                                {seasonMatches.length} match{seasonMatches.length > 1 ? 'es' : ''}
                                              </span>
                                            </div>

                                            <div className="divide-y divide-slate-800/25">
                                              {seasonMatches.map((h, hIdx) => {
                                                const hHomeScore = parseInt(h.homeScore || '0');
                                                const hAwayScore = parseInt(h.awayScore || '0');
                                                const homeRank = getHistoricalRank(h.homeTeam, h.season, h.round);
                                                const awayRank = getHistoricalRank(h.awayTeam, h.season, h.round);
                                                const hasGoals = (h.scoreDetails?.homeGoals?.length || 0) + (h.scoreDetails?.awayGoals?.length || 0) > 0;

                                                const homeGoalsList = h.scoreDetails?.homeGoals || [];
                                                const awayGoalsList = h.scoreDetails?.awayGoals || [];
                                                let htFtOutcome = '';
                                                if (homeGoalsList.length > 0 || awayGoalsList.length > 0) {
                                                  let hHt = 0;
                                                  let aHt = 0;
                                                  homeGoalsList.forEach((g: any) => {
                                                    const m = parseInt(g.minute || '0');
                                                    if (!isNaN(m) && m <= 45) hHt++;
                                                  });
                                                  awayGoalsList.forEach((g: any) => {
                                                    const m = parseInt(g.minute || '0');
                                                    if (!isNaN(m) && m <= 45) aHt++;
                                                  });
                                                  const htRes = hHt > aHt ? '1' : (hHt < aHt ? '2' : 'X');
                                                  const ftRes = hHomeScore > hAwayScore ? '1' : (hHomeScore < hAwayScore ? '2' : 'X');
                                                  htFtOutcome = `${htRes}/${ftRes}`;
                                                }

                                                const hRowGlobal = getTeamGlobalStats(h.homeTeam);
                                                const aRowGlobal = getTeamGlobalStats(h.awayTeam);

                                                const hRowTemporal = getTeamStatsAtMoment(h.homeTeam, h.season, h.expectedStart, h.round);
                                                const aRowTemporal = getTeamStatsAtMoment(h.awayTeam, h.season, h.expectedStart, h.round);

                                                return (
                                                  <div key={hIdx} className="p-3.5 flex flex-col gap-2 hover:bg-slate-900/10 transition-all">
                                                     <div className="flex items-center justify-between text-[7px] font-black text-slate-500 uppercase select-none tracking-wider">
                                                        <div className="flex items-center gap-1.5">
                                                          <span>Round {h.round}</span>
                                                          {htFtOutcome && (
                                                            <span className="px-1 py-0.5 rounded-sm bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 font-mono text-[6.5px]" title="Mi-temps / Fin de match">
                                                              HT/FT {htFtOutcome}
                                                            </span>
                                                          )}
                                                        </div>
                                                        <span>{h.expectedStart ? new Date(h.expectedStart).toLocaleDateString('fr-FR') : '-'}</span>
                                                     </div>
                                                     <div className="flex items-center justify-between gap-1">
                                                        <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                                                           {homeRank !== null && (
                                                             <span className="text-[8.5px] font-black text-indigo-300 bg-indigo-500/15 border border-indigo-500/35 px-1.5 py-0.5 rounded shadow-sm shrink-0 select-none font-mono" title={`Rang au Round ${h.round}`}>
                                                               #{homeRank}
                                                             </span>
                                                           )}
                                                           <div className="flex flex-col items-end min-w-0">
                                                              <span className={`text-[9.5px] font-black uppercase truncate text-right ${hHomeScore > hAwayScore ? 'text-white' : 'text-slate-500'}`}>{h.homeTeam}</span>
                                                              
                                                              {hRowTemporal ? (
                                                                <div className="flex flex-col items-end gap-1 mt-1">
                                                                  <div className="flex items-center gap-1 text-[10.5px] font-black font-mono select-none" title={`${hRowTemporal.wins}V ${hRowTemporal.draws}N ${hRowTemporal.losses}D sur ${hRowTemporal.played} matches avant ce match`}>
                                                                    <span className="text-emerald-400">{hRowTemporal.winPct}%<span className="text-[7.5px] font-black text-emerald-400/80 ml-0.5 uppercase">v</span></span>
                                                                    <span className="text-slate-600 font-normal">/</span>
                                                                    <span className="text-amber-400">{hRowTemporal.drawPct}%<span className="text-[7.5px] font-black text-amber-400/80 ml-0.5 uppercase">n</span></span>
                                                                    <span className="text-slate-600 font-normal">/</span>
                                                                    <span className="text-rose-400">{hRowTemporal.lossPct}%<span className="text-[7.5px] font-black text-rose-400/80 ml-0.5 uppercase">d</span></span>
                                                                  </div>

                                                                </div>
                                                              ) : hRowGlobal ? (
                                                                <div className="flex items-center gap-1 text-[8px] font-bold font-mono tracking-tighter opacity-80" title="Bilan global complet">
                                                                  <span className="text-emerald-500">{hRowGlobal.winPct}%<span className="text-[7px] font-bold text-emerald-500/80 ml-0.5 uppercase">v</span></span>
                                                                  <span className="text-slate-600">/</span>
                                                                  <span className="text-amber-500">{hRowGlobal.drawPct}%<span className="text-[7px] font-bold text-amber-500/80 ml-0.5 uppercase">n</span></span>
                                                                  <span className="text-slate-600">/</span>
                                                                  <span className="text-rose-500">{hRowGlobal.lossPct}%<span className="text-[7px] font-bold text-rose-500/80 ml-0.5 uppercase">d</span></span>
                                                                </div>
                                                              ) : null}
                                                           </div>
                                                           <img 
                                                             src={getTeamLogo(h.homeTeam)} 
                                                             alt="" 
                                                             className="w-3.5 h-3.5 object-contain shrink-0" 
                                                             onError={(e) => (e.currentTarget.style.display = 'none')}
                                                           />
                                                        </div>
                                                        <div className="flex items-center gap-1.5 bg-slate-950 px-1.5 py-0.5 rounded-lg border border-slate-800 shrink-0">
                                                           <span className={`w-5 h-5 flex items-center justify-center rounded font-black text-[10px] ${hHomeScore > hAwayScore ? 'text-indigo-400' : 'text-slate-500'}`}>{h.homeScore !== undefined && h.homeScore !== null && h.homeScore !== '' ? h.homeScore : '-'}</span>
                                                           <span className="text-slate-700 font-black text-[8px]">:</span>
                                                           <span className={`w-5 h-5 flex items-center justify-center rounded font-black text-[10px] ${hAwayScore > hHomeScore ? 'text-indigo-400' : 'text-slate-500'}`}>{h.awayScore !== undefined && h.awayScore !== null && h.awayScore !== '' ? h.awayScore : '-'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
                                                           <img 
                                                             src={getTeamLogo(h.awayTeam)} 
                                                             alt="" 
                                                             className="w-3.5 h-3.5 object-contain shrink-0" 
                                                             onError={(e) => (e.currentTarget.style.display = 'none')}
                                                           />
                                                           <div className="flex flex-col items-start min-w-0">
                                                              <span className={`text-[9.5px] font-black uppercase truncate text-left ${hAwayScore > hHomeScore ? 'text-white' : 'text-slate-500'}`}>{h.awayTeam}</span>
                                                              
                                                              {aRowTemporal ? (
                                                                <div className="flex flex-col items-start gap-1 mt-1">
                                                                  <div className="flex items-center gap-1 text-[10.5px] font-black font-mono select-none" title={`${aRowTemporal.wins}V ${aRowTemporal.draws}N ${aRowTemporal.losses}D sur ${aRowTemporal.played} matches avant ce match`}>
                                                                    <span className="text-emerald-400">{aRowTemporal.winPct}%<span className="text-[7.5px] font-black text-emerald-400/80 ml-0.5 uppercase">v</span></span>
                                                                    <span className="text-slate-600 font-normal">/</span>
                                                                    <span className="text-amber-400">{aRowTemporal.drawPct}%<span className="text-[7.5px] font-black text-amber-400/80 ml-0.5 uppercase">n</span></span>
                                                                    <span className="text-slate-600 font-normal">/</span>
                                                                    <span className="text-rose-400">{aRowTemporal.lossPct}%<span className="text-[7.5px] font-black text-rose-400/80 ml-0.5 uppercase">d</span></span>
                                                                  </div>

                                                                </div>
                                                              ) : aRowGlobal ? (
                                                                <div className="flex items-center gap-1 text-[8px] font-bold font-mono tracking-tighter opacity-80" title="Bilan global complet">
                                                                  <span className="text-emerald-500">{aRowGlobal.winPct}%<span className="text-[7px] font-bold text-emerald-500/80 ml-0.5 uppercase">v</span></span>
                                                                  <span className="text-slate-600">/</span>
                                                                  <span className="text-amber-500">{aRowGlobal.drawPct}%<span className="text-[7px] font-bold text-amber-500/80 ml-0.5 uppercase">n</span></span>
                                                                  <span className="text-slate-600">/</span>
                                                                  <span className="text-rose-500">{aRowGlobal.lossPct}%<span className="text-[7px] font-bold text-rose-500/80 ml-0.5 uppercase">d</span></span>
                                                                </div>
                                                              ) : null}
                                                           </div>
                                                           {awayRank !== null && (
                                                             <span className="text-[8.5px] font-black text-indigo-300 bg-indigo-500/15 border border-indigo-500/35 px-1.5 py-0.5 rounded shadow-sm shrink-0 select-none font-mono" title={`Rang au Round ${h.round}`}>
                                                               #{awayRank}
                                                             </span>
                                                           )}
                                                        </div>
                                                     </div>
                                                      {/* Form History Stripes inside H2H matches */}
                                                      {(() => {
                                                        const hForm = hRowTemporal?.allForms || [];
                                                        const aForm = aRowTemporal?.allForms || [];
                                                        if (hForm.length === 0 && aForm.length === 0) return null;
                                                        return (
                                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 px-1 bg-slate-950/25 p-2 rounded-xl border border-white/[0.03] text-left">
                                                             <div className="flex flex-col gap-0.5">
                                                               <div className="flex items-center justify-between px-0.5">
                                                                 <span className="text-[6.5px] font-black text-slate-500 uppercase tracking-widest">Forme {h.homeTeam}</span>
                                                                 <span className="text-[6.5px] font-bold text-slate-600">{hForm.length} matchs</span>
                                                               </div>
                                                               <div className="bg-slate-950/30 p-1 rounded-md border border-white/5">
                                                                 <ScrollableFormList history={hForm} size="sm" />
                                                               </div>
                                                             </div>
                                                             <div className="flex flex-col gap-0.5">
                                                               <div className="flex items-center justify-between px-0.5">
                                                                 <span className="text-[6.5px] font-black text-slate-500 uppercase tracking-widest">Forme {h.awayTeam}</span>
                                                                 <span className="text-[6.5px] font-bold text-slate-600">{aForm.length} matchs</span>
                                                               </div>
                                                               <div className="bg-slate-950/30 p-1 rounded-md border border-white/5">
                                                                 <ScrollableFormList history={aForm} size="sm" />
                                                               </div>
                                                             </div>
                                                          </div>
                                                        );
                                                      })()}

                                                     {hasGoals && (
                                                        <div className="flex flex-wrap gap-1 justify-center mt-0.5 py-1 px-2 bg-slate-950/50 rounded-xl border border-white/[0.02]">
                                                           {[...(h.scoreDetails?.homeGoals?.map(g => ({ ...g, side: 'h' })) || []), 
                                                             ...(h.scoreDetails?.awayGoals?.map(g => ({ ...g, side: 'a' })) || [])]
                                                             .sort((a, b) => {
                                                               const minA = parseInt(a.minute) || 0;
                                                               const minB = parseInt(b.minute) || 0;
                                                               return minA - minB;
                                                             })
                                                             .map((g, gi) => (
                                                               <div key={gi} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[7px] font-black border ${g.side === 'h' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15' : 'text-rose-400 bg-rose-500/10 border-rose-500/15'}`} title={`${g.player || ''}`}>
                                                                  <span>⚽ {g.minute}'</span>
                                                               </div>
                                                             ))
                                                           }
                                                        </div>
                                                     )}
                                                     {(h.odds1 || h.oddsX || h.odds2) && (
                                                        <div className="flex items-center justify-between mt-0.5 pt-1.5 border-t border-white/[0.03] text-[8.5px] font-mono select-none text-slate-400">
                                                           <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">Cotes d'époque :</span>
                                                           <div className="flex gap-2 text-[8px] font-black">
                                                              {h.odds1 && <span><span className="text-indigo-400 font-bold mr-0.5">1:</span>{parseFloat(h.odds1).toFixed(2)}</span>}
                                                              {h.oddsX && <span><span className="text-amber-400 font-bold mr-0.5">X:</span>{parseFloat(h.oddsX).toFixed(2)}</span>}
                                                              {h.odds2 && <span><span className="text-rose-400 font-bold mr-0.5">2:</span>{parseFloat(h.odds2).toFixed(2)}</span>}
                                                           </div>
                                                        </div>
                                                     )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      });
                                    })()}
                                    {false && h2hHistory.map((h, hIdx) => {
                                      const hHomeScore = parseInt(h.homeScore || '0');
                                      const hAwayScore = parseInt(h.awayScore || '0');
                                      const homeRank = getHistoricalRank(h.homeTeam, h.season, h.round);
                                      const awayRank = getHistoricalRank(h.awayTeam, h.season, h.round);
                                      const hasGoals = (h.scoreDetails?.homeGoals?.length || 0) + (h.scoreDetails?.awayGoals?.length || 0) > 0;

                                      const hRowGlobal = getTeamGlobalStats(h.homeTeam);
                                      const aRowGlobal = getTeamGlobalStats(h.awayTeam);

                                      const hRowTemporal = getTeamStatsAtMoment(h.homeTeam, h.season, h.expectedStart, h.round);
                                      const aRowTemporal = getTeamStatsAtMoment(h.awayTeam, h.season, h.expectedStart, h.round);

                                      return (
                                        <div key={hIdx} className="bg-[#010413]/60 border border-slate-800/60 rounded-2xl p-3 flex flex-col gap-2 shadow-lg mb-2">
                                           <div className="flex items-center justify-between text-[7px] font-black text-slate-500 uppercase">
                                              <span>R{h.round} • {h.season}</span>
                                              <span>{h.expectedStart ? new Date(h.expectedStart).toLocaleDateString('fr-FR') : '-'}</span>
                                           </div>
                                           <div className="flex items-center justify-between gap-1">
                                              <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                                                 {homeRank !== null && (
                                                   <span className="text-[7.5px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1 py-0.2 rounded-md shrink-0" title={`Rang au Round ${h.round}`}>
                                                     #{homeRank}
                                                   </span>
                                                 )}
                                                 <div className="flex flex-col items-end min-w-0">
                                                    <span className={`text-[9.5px] font-black uppercase truncate text-right ${hHomeScore > hAwayScore ? 'text-white' : 'text-slate-500'}`}>{h.homeTeam}</span>
                                                    
                                                    {hRowTemporal ? (
                                                      <div className="flex flex-col items-end gap-1 mt-1">
                                                        <div className="flex items-center gap-1 text-[10.5px] font-black font-mono select-none" title={`${hRowTemporal.wins}V ${hRowTemporal.draws}N ${hRowTemporal.losses}D sur ${hRowTemporal.played} matches avant ce match`}>
                                                          <span className="text-emerald-400">{hRowTemporal.winPct}%<span className="text-[7.5px] font-black text-emerald-400/80 ml-0.5 uppercase">v</span></span>
                                                          <span className="text-slate-600 font-normal">/</span>
                                                          <span className="text-amber-400">{hRowTemporal.drawPct}%<span className="text-[7.5px] font-black text-amber-400/80 ml-0.5 uppercase">n</span></span>
                                                          <span className="text-slate-600 font-normal">/</span>
                                                          <span className="text-rose-400">{hRowTemporal.lossPct}%<span className="text-[7.5px] font-black text-rose-400/80 ml-0.5 uppercase">d</span></span>
                                                        </div>
                                                        {hRowTemporal.form && hRowTemporal.form.length > 0 && (
                                                          <div className="flex items-center gap-0.5 mt-0.5 scale-[0.8] origin-right">
                                                            {hRowTemporal.form.map((res: string, i: number) => (
                                                              <div key={i} className={`w-2 h-2 shrink-0 rounded-[1px] flex items-center justify-center text-[4.5px] font-black text-white ${
                                                                res === 'Won' ? 'bg-emerald-500' :
                                                                res === 'Lost' ? 'bg-rose-500' :
                                                                'bg-slate-600'
                                                              }`} title={res}>
                                                                {res === 'Won' ? 'V' : res === 'Lost' ? 'D' : 'N'}
                                                              </div>
                                                            ))}
                                                          </div>
                                                        )}
                                                      </div>
                                                    ) : hRowGlobal ? (
                                                      <div className="flex items-center gap-1 text-[8px] font-bold font-mono tracking-tighter opacity-80" title="Bilan global complet">
                                                        <span className="text-emerald-500">{hRowGlobal.winPct}%<span className="text-[7px] font-bold text-emerald-500/80 ml-0.5 uppercase">v</span></span>
                                                        <span className="text-slate-600">/</span>
                                                        <span className="text-amber-500">{hRowGlobal.drawPct}%<span className="text-[7px] font-bold text-amber-500/80 ml-0.5 uppercase">n</span></span>
                                                        <span className="text-slate-600">/</span>
                                                        <span className="text-rose-500">{hRowGlobal.lossPct}%<span className="text-[7px] font-bold text-rose-500/80 ml-0.5 uppercase">d</span></span>
                                                      </div>
                                                    ) : null}
                                                 </div>
                                                 <img 
                                                   src={getTeamLogo(h.homeTeam)} 
                                                   alt="" 
                                                   className="w-3 h-3 object-contain shrink-0" 
                                                   onError={(e) => (e.currentTarget.style.display = 'none')}
                                                 />
                                              </div>
                                              <div className="flex items-center gap-1.5 bg-slate-950 px-1.5 py-0.5 rounded-lg border border-slate-800 shrink-0">
                                                 <span className={`w-5 h-5 flex items-center justify-center rounded font-black text-[10px] ${hHomeScore > hAwayScore ? 'text-indigo-400' : 'text-slate-500'}`}>{h.homeScore !== undefined && h.homeScore !== null && h.homeScore !== '' ? h.homeScore : '-'}</span>
                                                 <span className="text-slate-700 font-black text-[8px]">:</span>
                                                 <span className={`w-5 h-5 flex items-center justify-center rounded font-black text-[10px] ${hAwayScore > hHomeScore ? 'text-indigo-400' : 'text-slate-500'}`}>{h.awayScore !== undefined && h.awayScore !== null && h.awayScore !== '' ? h.awayScore : '-'}</span>
                                              </div>
                                              <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
                                                 <img 
                                                   src={getTeamLogo(h.awayTeam)} 
                                                   alt="" 
                                                   className="w-3 h-3 object-contain shrink-0" 
                                                   onError={(e) => (e.currentTarget.style.display = 'none')}
                                                 />
                                                 <div className="flex flex-col items-start min-w-0">
                                                    <span className={`text-[9.5px] font-black uppercase truncate text-left ${hAwayScore > hHomeScore ? 'text-white' : 'text-slate-500'}`}>{h.awayTeam}</span>
                                                    
                                                    {aRowTemporal ? (
                                                      <div className="flex flex-col items-start gap-1 mt-1">
                                                        <div className="flex items-center gap-1 text-[10.5px] font-black font-mono select-none" title={`${aRowTemporal.wins}V ${aRowTemporal.draws}N ${aRowTemporal.losses}D sur ${aRowTemporal.played} matches avant ce match`}>
                                                          <span className="text-emerald-400">{aRowTemporal.winPct}%<span className="text-[7.5px] font-black text-emerald-400/80 ml-0.5 uppercase">v</span></span>
                                                          <span className="text-slate-600 font-normal">/</span>
                                                          <span className="text-amber-400">{aRowTemporal.drawPct}%<span className="text-[7.5px] font-black text-amber-400/80 ml-0.5 uppercase">n</span></span>
                                                          <span className="text-slate-600 font-normal">/</span>
                                                          <span className="text-rose-400">{aRowTemporal.lossPct}%<span className="text-[7.5px] font-black text-rose-400/80 ml-0.5 uppercase">d</span></span>
                                                        </div>
                                                        {aRowTemporal.form && aRowTemporal.form.length > 0 && (
                                                          <div className="flex items-center gap-0.5 mt-0.5 scale-[0.8] origin-left">
                                                            {aRowTemporal.form.map((res: string, i: number) => (
                                                              <div key={i} className={`w-2 h-2 shrink-0 rounded-[1px] flex items-center justify-center text-[4.5px] font-black text-white ${
                                                                res === 'Won' ? 'bg-emerald-500' :
                                                                res === 'Lost' ? 'bg-rose-500' :
                                                                'bg-slate-600'
                                                              }`} title={res}>
                                                                {res === 'Won' ? 'V' : res === 'Lost' ? 'D' : 'N'}
                                                              </div>
                                                            ))}
                                                          </div>
                                                        )}
                                                      </div>
                                                    ) : aRowGlobal ? (
                                                      <div className="flex items-center gap-1 text-[8px] font-bold font-mono tracking-tighter opacity-80" title="Bilan global complet">
                                                        <span className="text-emerald-500">{aRowGlobal.winPct}%<span className="text-[7px] font-bold text-emerald-500/80 ml-0.5 uppercase">v</span></span>
                                                        <span className="text-slate-600">/</span>
                                                        <span className="text-amber-500">{aRowGlobal.drawPct}%<span className="text-[7px] font-bold text-amber-500/80 ml-0.5 uppercase">n</span></span>
                                                        <span className="text-slate-600">/</span>
                                                        <span className="text-rose-500">{aRowGlobal.lossPct}%<span className="text-[7px] font-bold text-rose-500/80 ml-0.5 uppercase">d</span></span>
                                                      </div>
                                                    ) : null}
                                                 </div>
                                                 {awayRank !== null && (
                                                   <span className="text-[7.5px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1 py-0.2 rounded-md shrink-0" title={`Rang au Round ${h.round}`}>
                                                     #{awayRank}
                                                   </span>
                                                 )}
                                              </div>
                                           </div>
                                           {hasGoals && (
                                              <div className="flex flex-wrap gap-1 justify-center mt-0.5 py-1 px-2 bg-slate-950/50 rounded-xl border border-white/[0.02]">
                                                 {[...(h.scoreDetails?.homeGoals?.map(g => ({ ...g, side: 'h' })) || []), 
                                                   ...(h.scoreDetails?.awayGoals?.map(g => ({ ...g, side: 'a' })) || [])]
                                                   .sort((a, b) => {
                                                     const minA = parseInt(a.minute) || 0;
                                                     const minB = parseInt(b.minute) || 0;
                                                     return minA - minB;
                                                   })
                                                   .map((g, gi) => (
                                                     <div key={gi} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[7px] font-black border ${g.side === 'h' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15' : 'text-rose-400 bg-rose-500/10 border-rose-500/15'}`} title={`${g.player || ''}`}>
                                                        <span>⚽ {g.minute}'</span>
                                                     </div>
                                                   ))
                                                 }
                                              </div>
                                           )}
                                           {(h.odds1 || h.oddsX || h.odds2) && (
                                              <div className="flex items-center justify-between mt-0.5 pt-1.5 border-t border-white/[0.03] text-[8.5px] font-mono select-none text-slate-400">
                                                 <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">Cotes d'époque :</span>
                                                 <div className="flex gap-2 text-[8px] font-black">
                                                    {h.odds1 && <span><span className="text-indigo-400 font-bold mr-0.5">1:</span>{parseFloat(h.odds1).toFixed(2)}</span>}
                                                    {h.oddsX && <span><span className="text-amber-400 font-bold mr-0.5">X:</span>{parseFloat(h.oddsX).toFixed(2)}</span>}
                                                    {h.odds2 && <span><span className="text-rose-400 font-bold mr-0.5">2:</span>{parseFloat(h.odds2).toFixed(2)}</span>}
                                                 </div>
                                              </div>
                                           )}
                                        </div>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
