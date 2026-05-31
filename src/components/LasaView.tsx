import { useState, useEffect, useMemo } from 'react';
import { 
  ChevronDown, Info, BarChart3, GitCompare, Sparkles, Database, 
  Activity, Target, Sliders, Calendar, Hash, BookOpen, AlertCircle
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

export function LasaView({ upcomingMatches = [] }: { upcomingMatches: any[] }) {
  const [activeLeague, setActiveLeague] = useState(LEAGUES[0].id);
  const [selectedUpcomingMatch, setSelectedUpcomingMatch] = useState<any | null>(null);
  
  // Custom odds manual input
  const [useManualOdds, setUseManualOdds] = useState(false);
  const [manualOdds1, setManualOdds1] = useState('2.10');
  const [manualOddsX, setManualOddsX] = useState('3.20');
  const [manualOdds2, setManualOdds2] = useState('3.40');
  const [manualTolerance, setManualTolerance] = useState(0.12); // Tolerance range +/-
  
  // Right Column Tabs for navigation details
  const [rightTab, setRightTab] = useState<'similar' | 'stats' | 'h2h' | 'patterns'>('similar');

  // HT/FT and Odds filter
  const [selectedHtFtFilter, setSelectedHtFtFilter] = useState<string>('all');

  // Database cache
  const [allDbMatches, setAllDbMatches] = useState<ArchivedMatch[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);

  // Load all matches from IndexedDB for the active league
  useEffect(() => {
    const loadDbMatches = async () => {
      setLoadingDb(true);
      try {
        const lId = Number(activeLeague);
        const matches = await db.matches
          .where('leagueId')
          .anyOf([lId, String(lId)])
          .toArray();
        setAllDbMatches(matches);
      } catch (err) {
        console.error('Failed to load db matches in LasaView:', err);
      } finally {
        setLoadingDb(false);
      }
    };
    loadDbMatches();
  }, [activeLeague]);

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
      if (tgtHome && tgtAway && dbHome === tgtHome && dbAway === tgtAway) {
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
            
            {/* TABS CONTROLLERS */}
            <div className="flex flex-wrap border-b border-slate-800/80 bg-slate-950/40 p-1">
              {[
                { id: 'similar', label: 'Similarités de Cotes', count: similarities.similarOdds.length, icon: Sparkles },
                { id: 'stats', label: 'Distribution 1X2 & HT/FT', icon: BarChart3 },
                { id: 'h2h', label: 'Analogie H2H Directe', count: similarities.h2h.length, icon: GitCompare },
                { id: 'patterns', label: 'Répétitions Scorelines', count: repetitionPatterns.length, icon: Hash }
              ].map((tab) => {
                const TabIcon = tab.icon;
                const isSelected = rightTab === tab.id;
                
                return (
                  <button
                    id={`btn-tab-laser-${tab.id}`}
                    key={tab.id}
                    onClick={() => setRightTab(tab.id as any)}
                    className={`flex items-center gap-2 px-5 py-4 text-[10.5px] font-black uppercase tracking-wider border-b-2 transition-all duration-300 relative ${
                      isSelected 
                        ? 'border-indigo-500 text-indigo-400 bg-indigo-500/[0.02]' 
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/10'
                    }`}
                  >
                    <TabIcon className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && (
                      <span className={`text-[8px] font-mono font-black px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-950 text-slate-500'
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
                        <div className="space-y-3">
                          {similarities.h2h.map((m, idx) => {
                            const hS = parseInt(m.homeScore || '0');
                            const aS = parseInt(m.awayScore || '0');
                            const htFt = computeHTFT(hS, aS, m.scoreDetails);
                            
                            return (
                              <div key={idx} className="bg-slate-950/40 hover:bg-slate-950 p-4 rounded-2xl border border-slate-850 hover:border-slate-700/60 transition-all duration-300 flex flex-col gap-2.5">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
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
