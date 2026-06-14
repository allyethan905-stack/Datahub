import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Calendar, 
  Loader2, 
  AlertCircle, 
  RefreshCw,
  Activity,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { fetchRoundPlayout } from '../lib/api';
import { getLeagueFlag } from '../lib/logos';
import { LEAGUES } from '../shared/constants';
import MatchCard from './MatchCard';

interface Match {
  id: number;
  round: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  expectedStart: string;
  homeScore?: string;
  awayScore?: string;
  status?: string;
  season?: string;
  leagueId?: number;
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
  results: any[];
  globalMatches?: any[];
  onUpdateMatches?: (updatedMatches: any[] | ((prev: any[]) => any[])) => void;
  onMatchClick?: (match: any) => void;
  onPlaceBet?: (match: any, selection: string, odds: string, stake?: number) => Promise<void>;
  bet261Account?: any;
}

export default function UpcomingRoundsView({ 
  leagueId, 
  leagueName, 
  rankings,
  results,
  globalMatches,
  onUpdateMatches,
  onMatchClick,
  onPlaceBet,
  bet261Account
}: UpcomingRoundsViewProps) {
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [detectedCategoryId, setDetectedCategoryId] = useState<number | string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Pre-calculate full form and recent matches for all teams once of the results
  const resultsCache = useMemo(() => {
    const recentMatchesMap: Record<string, any[]> = {};
    const formMap: Record<string, string[]> = {};

    const getTeamNameLocal = (team: any) => {
      if (!team) return '-';
      if (typeof team === 'string') return team;
      return team.name || team.teamName || team.shortName || 'Équipe';
    };

    const resList = results || [];

    resList.forEach(round => {
      const ms = round.matches || (Array.isArray(round) ? round : []);
      ms.forEach((m: any) => {
        const hN = getTeamNameLocal(m.homeTeam);
        const aN = getTeamNameLocal(m.awayTeam);
        const hN_lower = hN.toLowerCase().trim();
        const aN_lower = aN.toLowerCase().trim();

        let homeRaw = m.homeScore;
        let awayRaw = m.awayScore;
        if (m.score) {
          const sep = m.score.includes(':') ? ':' : '-';
          const parts = m.score.split(sep);
          if (parts.length === 2) {
            homeRaw = parts[0];
            awayRaw = parts[1];
          }
        }

        const hSText = homeRaw !== undefined && homeRaw !== null && String(homeRaw).trim() !== '' && String(homeRaw).trim() !== '-';
        const aSText = awayRaw !== undefined && awayRaw !== null && String(awayRaw).trim() !== '' && String(awayRaw).trim() !== '-';

        if (hSText && aSText) {
          const hS = parseInt(String(homeRaw));
          const aS = parseInt(String(awayRaw));

          if (!isNaN(hS) && !isNaN(aS)) {
            const processedMatch = { ...m, homeScore: homeRaw, awayScore: awayRaw, roundNumber: round.roundNumber || round.round };
            
            if (!formMap[hN_lower]) formMap[hN_lower] = [];
            formMap[hN_lower].push(hS > aS ? 'Won' : (hS < aS ? 'Lost' : 'Draw'));

            if (!formMap[aN_lower]) formMap[aN_lower] = [];
            formMap[aN_lower].push(aS > hS ? 'Won' : (aS < hS ? 'Lost' : 'Draw'));

            if (!recentMatchesMap[hN_lower]) recentMatchesMap[hN_lower] = [];
            recentMatchesMap[hN_lower].push(processedMatch);

            if (!recentMatchesMap[aN_lower]) recentMatchesMap[aN_lower] = [];
            recentMatchesMap[aN_lower].push(processedMatch);
          }
        }
      });
    });

    Object.keys(recentMatchesMap).forEach(key => {
      recentMatchesMap[key].sort((a, b) => (Number(b.roundNumber) || 0) - (Number(a.roundNumber) || 0));
    });

    return { recentMatchesMap, formMap };
  }, [results]);

  const detectedSeason = useMemo(() => {
    if (globalMatches && globalMatches.length > 0) {
      const found = globalMatches.find((m: any) => m.season);
      if (found) return found.season;
    }
    if (results && results.length > 0) {
      for (const r of results) {
        const ms = r.matches || (Array.isArray(r) ? r : []);
        const found = ms.find((m: any) => m.season);
        if (found) return found.season;
      }
    }
    return '';
  }, [globalMatches, results]);

  const updateGlobalMatchesFromPlayout = (playoutMatches: any[]) => {
    if (!onUpdateMatches || !playoutMatches || playoutMatches.length === 0) return;
    
    onUpdateMatches((prevGlobalMatches: any[]) => {
      if (!prevGlobalMatches || prevGlobalMatches.length === 0) return prevGlobalMatches;
      let updatedAny = false;
      const nextGlobalMatches = prevGlobalMatches.map((gm: any) => {
        const pMatch = playoutMatches.find((pm: any) => 
          String(pm.id) === String(gm.apiId) || 
          String(pm.id) === String(gm.id) ||
          (gm.id && gm.id.includes(String(pm.id)))
        );
        
        if (pMatch && pMatch.goals !== undefined) {
          const goals = pMatch.goals || [];
          const lastGoal = goals.length > 0 ? goals[goals.length - 1] : null;
          const hScore = lastGoal ? String(lastGoal.homeScore) : "0";
          const aScore = lastGoal ? String(lastGoal.awayScore) : "0";
          const isLive = pMatch.status === 2 || String(pMatch.status).toLowerCase() === 'live';
          const currentStatus = isLive ? 'LIVE' : 'Finished';
          
          const hGoals: any[] = [];
          const aGoals: any[] = [];
          let prevH = 0;
          let prevA = 0;
          goals.forEach((g: any) => {
            if (g.homeScore > prevH) { hGoals.push({ minute: String(g.minute || g.time), player: 'But' }); prevH = g.homeScore; }
            else if (g.awayScore > prevA) { aGoals.push({ minute: String(g.minute || g.time), player: 'But' }); prevA = g.awayScore; }
          });

          if (String(gm.homeScore) !== hScore || 
              String(gm.awayScore) !== aScore || 
              gm.status !== currentStatus) {
            updatedAny = true;
            return {
              ...gm,
              homeScore: hScore,
              awayScore: aScore,
              status: currentStatus,
              scoreDetails: { homeGoals: hGoals, awayGoals: aGoals }
            };
          }
        }
        return gm;
      });
      
      return updatedAny ? nextGlobalMatches : prevGlobalMatches;
    });
  };

  const fetchUpcomingRounds = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get current state to find categoryId and available round numbers
      const matchesResponse = await fetch(`/api/data/league/matches/${leagueId}`);
      if (!matchesResponse.ok) throw new Error('Cnx League failed');
      const matchesData = await matchesResponse.json();
      
      const rootData = Array.isArray(matchesData) ? matchesData[0] : matchesData;
      
      let categoryId = rootData?.eventCategoryId || rootData?.EventCategoryID || rootData?.seasonId;
      
      if (!categoryId && rootData?.rounds && rootData.rounds.length > 0) {
        categoryId = rootData.rounds[0].eventCategoryId || rootData.rounds[0].EventCategoryID;
      }
      
      if (!categoryId && rootData?.rounds?.[0]?.matches?.[0]) {
        const firstMatch = rootData.rounds[0].matches[0];
        categoryId = firstMatch.eventCategoryId || firstMatch.EventCategoryID;
      }

      if (!categoryId && rootData?.data) {
        categoryId = rootData.data.eventCategoryId || rootData.data.EventCategoryID || rootData.data.seasonId;
      }

      if (!categoryId) {
        console.log('[Upcoming] CategoryId not in matches, trying ranking...');
        const rankRes = await fetch(`/api/data/league/ranking/${leagueId}`);
        if (rankRes.ok) {
          const rankData = await rankRes.json();
          categoryId = rankData.eventCategoryId || rankData.EventCategoryID || rankData.seasonId;
        }
      }

      if (!categoryId || categoryId === 'undefined') {
        throw new Error('ID Catégorie non trouvé');
      }

      setDetectedCategoryId(categoryId);

      const roundsList = rootData?.rounds || rootData?.data?.rounds || [];
      const sortedRounds = [...roundsList].sort((a: any, b: any) => {
        return (a.roundNumber || a.id) - (b.roundNumber || b.id);
      });

      const now = new Date();

      const upcomingIndex = sortedRounds.findIndex((r: any) => {
        const start = new Date(r.expectedStart);
        return !isNaN(start.getTime()) && start > now;
      });

      let listToFetch = sortedRounds;
      if (upcomingIndex !== -1) {
        const startIndex = Math.max(0, upcomingIndex - 1);
        listToFetch = sortedRounds.slice(startIndex);
      }

      const fetchPromises = listToFetch.slice(0, 30).map((r: any) => {
        const roundNum = r.roundNumber || r.id;
        const roundCatId = r.eventCategoryId || r.EventCategoryID || categoryId;
        
        return fetch(`/api/data/round/${roundNum}?eventCategoryId=${roundCatId}`)
          .then(async res => {
            if (!res.ok) {
              return null;
            }
            return res.json();
          })
          .then(async data => {
            if (data && data.round) {
              const roundData = data.round;
              const matches = roundData.matches || [];
              
              matches.forEach((m: any) => {
                const gm = globalMatches?.find((g: any) => 
                  String(g.apiId) === String(m.id) || 
                  String(g.id) === String(m.id) || 
                  (g.id && g.id.includes(String(m.id)))
                );
                if (gm) {
                  m.homeScore = gm.homeScore;
                  m.awayScore = gm.awayScore;
                  m.status = gm.status;
                  m.scoreDetails = gm.scoreDetails;
                }
              });

              try {
                const playoutData = await fetchRoundPlayout(roundNum, roundCatId, leagueId);
                if (playoutData && playoutData.matches) {
                  updateGlobalMatchesFromPlayout(playoutData.matches);

                  matches.forEach((m: any) => {
                    const pMatch = playoutData.matches.find((pm: any) => pm.id === m.id);
                    if (pMatch) {
                      const goals = pMatch.goals || [];
                      const isLive = pMatch.status === 2 || String(pMatch.status).toLowerCase() === 'live';
                      const isFinished = pMatch.status === 3 || String(pMatch.status).toLowerCase() === 'finished' || goals.length > 0 || pMatch.expectedStart === "0001-01-01T00:00:00Z";
                      
                      if (isLive || isFinished) {
                        const lastGoal = goals.length > 0 ? goals[goals.length - 1] : null;
                        m.homeScore = lastGoal ? String(lastGoal.homeScore) : "0";
                        m.awayScore = lastGoal ? String(lastGoal.awayScore) : "0";
                        m.status = isLive ? 'LIVE' : 'Finished';
                        
                        const hGoals: any[] = [];
                        const aGoals: any[] = [];
                        let prevH = 0;
                        let prevA = 0;
                        
                        goals.forEach((g: any) => {
                          if (g.homeScore > prevH) {
                            hGoals.push({ minute: String(g.minute || g.time), player: 'But' });
                            prevH = g.homeScore;
                          } else if (g.awayScore > prevA) {
                            aGoals.push({ minute: String(g.minute || g.time), player: 'But' });
                            prevA = g.awayScore;
                          }
                        });
                        
                        m.scoreDetails = { homeGoals: hGoals, awayGoals: aGoals };
                      }
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

      const resultsTotal = await Promise.all(fetchPromises);
      const validRounds = resultsTotal
        .filter((r): r is RoundData => r !== null && (r.matches?.length || 0) > 0)
        .sort((a, b) => {
          const dateA = new Date(a.expectedStart).getTime();
          const dateB = new Date(b.expectedStart).getTime();
          if (!isNaN(dateA) && !isNaN(dateB)) return dateA - dateB;
          return a.roundNumber - b.roundNumber;
        });
      
      setRounds(validRounds);
      
      if (validRounds.length > 0) {
        // Try to find the first round which has future/not-finished matches, or default to first round
        const firstUpcomingRound = validRounds.find(r => 
          r.matches.some(m => !m.status || (m.status !== 'Finished' && m.status !== 'LIVE'))
        );
        setSelectedRoundNumber(firstUpcomingRound ? firstUpcomingRound.roundNumber : validRounds[0].roundNumber);
      }
    } catch (err: any) {
      console.error('Fetch Upcoming Error:', err);
      setError(err.message || 'Erreur chargement rounds');
    } finally {
      setLoading(false);
    }
  };

  const roundsRef = useRef(rounds);
  const selectedRoundNumberRef = useRef(selectedRoundNumber);
  
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  useEffect(() => { selectedRoundNumberRef.current = selectedRoundNumber; }, [selectedRoundNumber]);

  useEffect(() => {
    fetchUpcomingRounds();
    
    const interval = setInterval(() => {
      refreshScoresOnly();
    }, 500);
    
    return () => clearInterval(interval);
  }, [leagueId]);

  const refreshScoresOnly = async () => {
    const currentRounds = roundsRef.current;
    if (currentRounds.length === 0) return;
    
    let categoryId: any = detectedCategoryId;
    if (!categoryId) {
      for (const r of currentRounds) {
        if (r.matches && r.matches.length > 0) {
          const firstMatch: any = r.matches[0];
          categoryId = firstMatch.eventCategoryId || firstMatch.EventCategoryID;
          if (categoryId) break;
        }
      }
    }
    
    if (!categoryId) return;

    const activeNum = selectedRoundNumberRef.current;
    const firstRoundNum = currentRounds[0]?.roundNumber;
    const roundsToFetch = [...new Set([activeNum, ...(firstRoundNum ? [firstRoundNum] : [])])].filter((r): r is number => r !== null);
    
    if (roundsToFetch.length === 0) return;

    try {
      const updates = await Promise.all(roundsToFetch.map(async (roundNum: number) => {
        const playoutData = await fetchRoundPlayout(roundNum, categoryId, leagueId);
        return { roundNum, playoutData };
      }));

      updates.forEach(({ playoutData }) => {
        if (playoutData && playoutData.matches) {
          updateGlobalMatchesFromPlayout(playoutData.matches);
        }
      });

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
            if (mIdx !== -1) {
              const goals = pMatch.goals || [];
              const isLive = pMatch.status === 2 || String(pMatch.status).toLowerCase() === 'live';
              const isFinished = pMatch.status === 3 || String(pMatch.status).toLowerCase() === 'finished' || goals.length > 0 || pMatch.expectedStart === "0001-01-01T00:00:00Z";
              
              if (isLive || isFinished) {
                const lastGoal = goals.length > 0 ? goals[goals.length - 1] : null;
                const hScore = lastGoal ? String(lastGoal.homeScore) : "0";
                const aScore = lastGoal ? String(lastGoal.awayScore) : "0";
                const currentStatus = isLive ? 'LIVE' : 'Finished';
                
                if (String(roundMatches[mIdx].homeScore) !== String(hScore) || 
                    String(roundMatches[mIdx].awayScore) !== String(aScore) ||
                    roundMatches[mIdx].status !== currentStatus) {
                  
                  const hGoals: any[] = [];
                  const aGoals: any[] = [];
                  let prevH = 0;
                  let prevA = 0;
                  goals.forEach((g: any) => {
                    if (g.homeScore > prevH) { hGoals.push({ minute: String(g.minute || g.time), player: 'But' }); prevH = g.homeScore; }
                    else if (g.awayScore > prevA) { aGoals.push({ minute: String(g.minute || g.time), player: 'But' }); prevA = g.awayScore; }
                  });

                  roundMatches[mIdx] = { 
                    ...roundMatches[mIdx], 
                    homeScore: hScore, 
                    awayScore: aScore, 
                    status: currentStatus,
                    scoreDetails: { homeGoals: hGoals, awayGoals: aGoals }
                  };
                  
                  changed = true;
                  hasGlobalChange = true;
                }
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
      // silent fail
    }
  };

  const handlePrevRound = () => {
    if (rounds.length === 0 || selectedRoundNumber === null) return;
    const currentIdx = rounds.findIndex(r => r.roundNumber === selectedRoundNumber);
    if (currentIdx > 0) {
      const targetRound = rounds[currentIdx - 1].roundNumber;
      setSelectedRoundNumber(targetRound);
      scrollToActiveTab(targetRound);
    }
  };

  const handleNextRound = () => {
    if (rounds.length === 0 || selectedRoundNumber === null) return;
    const currentIdx = rounds.findIndex(r => r.roundNumber === selectedRoundNumber);
    if (currentIdx < rounds.length - 1) {
      const targetRound = rounds[currentIdx + 1].roundNumber;
      setSelectedRoundNumber(targetRound);
      scrollToActiveTab(targetRound);
    }
  };

  const scrollToActiveTab = (roundNum: number) => {
    setTimeout(() => {
      const activeBtn = document.getElementById(`round-tab-${roundNum}`);
      if (activeBtn && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const scrollLeft = activeBtn.offsetLeft - (container.clientWidth / 2) + (activeBtn.clientWidth / 2);
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }, 100);
  };

  const selectedRoundData = rounds.find(r => r.roundNumber === selectedRoundNumber);

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-2xl w-full max-w-full">
      {/* Header Bar */}
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
            className="group flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-indigo-400 shadow-lg active:scale-95 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Mise à jour
          </button>
        </div>
      </div>

      {rounds.length > 0 && (
        /* Round Navigation Bar Flanked with arrows */
        <div className="bg-slate-950/40 border-b border-slate-900 px-4 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevRound}
            disabled={rounds.findIndex(r => r.roundNumber === selectedRoundNumber) === 0}
            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Centered Scrollable Round Tabs */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 flex gap-1.5 overflow-x-auto custom-scrollbar no-scrollbar py-0.5"
            style={{ scrollbarWidth: 'none' }}
          >
            {rounds.map((r) => {
              const isSelected = r.roundNumber === selectedRoundNumber;
              return (
                <button
                  key={r.roundNumber}
                  id={`round-tab-${r.roundNumber}`}
                  type="button"
                  onClick={() => {
                    setSelectedRoundNumber(r.roundNumber);
                    scrollToActiveTab(r.roundNumber);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border shrink-0 whitespace-nowrap scroll-mx-4 ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  J.{r.roundNumber}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleNextRound}
            disabled={rounds.findIndex(r => r.roundNumber === selectedRoundNumber) === rounds.length - 1}
            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main View Grid area */}
      <div className="p-4 min-h-[400px] bg-gradient-to-b from-[#0f172a] to-[#010413]">
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
            <p className="text-sm text-rose-100 font-black uppercase">Erreur de chargement des journées futures</p>
            <button 
              onClick={fetchUpcomingRounds} 
              className="px-6 py-2 bg-[#be123c] hover:bg-rose-600 text-white text-[10px] font-black uppercase rounded-lg cursor-pointer transition-all"
            >
              Réessayer
            </button>
          </div>
        ) : selectedRoundData ? (
          <div className="pt-2">
            {/* Same stylish grid layout as current matches menu */}
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1650px]:grid-cols-5">
              {selectedRoundData.matches.map((rawMatch, index) => {
                const match = (() => {
                  const base = {
                    ...rawMatch,
                    leagueId: Number(leagueId),
                    round: String(selectedRoundNumber || rawMatch.round || ''),
                    season: detectedSeason || rawMatch.season || ''
                  };
                  if (!globalMatches) return base;
                  const gm = globalMatches.find((g: any) => 
                    String(g.apiId) === String(rawMatch.id) || 
                    String(g.id) === String(rawMatch.id) || 
                    (g.id && g.id.includes(String(rawMatch.id)))
                  );
                  if (!gm) return base;
                  return {
                    ...base,
                    homeScore: gm.homeScore !== undefined ? gm.homeScore : rawMatch.homeScore,
                    awayScore: gm.awayScore !== undefined ? gm.awayScore : rawMatch.awayScore,
                    status: gm.status !== undefined ? gm.status : rawMatch.status,
                    scoreDetails: gm.scoreDetails !== undefined ? gm.scoreDetails : rawMatch.scoreDetails
                  };
                })();

                return (
                  <MatchCard 
                    key={`${match.id}_${index}`}
                    match={match}
                    rankings={rankings}
                    results={results}
                    onClick={onMatchClick ? () => onMatchClick(match) : undefined}
                    onPlaceBet={onPlaceBet}
                    bet261Account={bet261Account}
                    resultsCache={resultsCache}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center space-y-2">
            <Activity className="w-10 h-10 text-slate-700 animate-pulse" />
            <p className="text-[10px] font-black uppercase tracking-wider">Aucun futur match disponible pour cette ligue.</p>
          </div>
        )}
      </div>
    </div>
  );
}
