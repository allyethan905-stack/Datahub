import { useState, useEffect } from 'react';
import { Search, Loader2, Target, Zap, RefreshCw } from 'lucide-react';
import { db, ArchivedMatch } from '../services/localArchive';
import { getTeamLogo, getLeagueFlag } from '../lib/logos';
import { LEAGUES } from '../shared/constants';

interface ScanViewProps {
  upcomingMatches: any[];
  leagueId: number;
  onPlaceBet?: (match: any, selection: string, odds: string, stake?: number) => Promise<void>;
  bet261Account?: any;
  rankings: any[];
  allMatches: any[];
  results: any[];
}

interface Match extends ArchivedMatch {
  // Add any display-specific properties if needed
}

interface ScanResult {
  id: string;
  homeTeam: string;
  awayTeam: string;
  upcomingOdds: { 1: string; X: string; 2: string };
  match: any;
  matchingMatches: Match []; // SAME Teams and SAME Odds
  oddsMatches: Match [];     // Different Teams but SAME Odds
  stats: {
    over25: number;
    bothToScore: number;
    homeWin: number;
    draw: number;
    awayWin: number;
  };
}

interface HistoricalGroup {
  oddsKey: string;
  odds: { 1: string; X: string; 2: string };
  matches: Match[];
}

export function ScanView({ upcomingMatches, leagueId, onPlaceBet, bet261Account, rankings, allMatches, results }: ScanViewProps) {
  const [scanResults, setScanResults] = useState<ScanResult[]>([]); // Renamed from results to avoid conflict
  const [historicalPatterns, setHistoricalPatterns] = useState<HistoricalGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [activeMode, setActiveMode] = useState<'upcoming' | 'history'>('upcoming');
  const [isPlacing, setIsPlacing] = useState<Record<string, string | null>>({});

  const getTeamName = (team: any) => {
    if (!team) return '-';
    if (typeof team === 'string') return team;
    return team.name || team.teamName || team.shortName || 'Équipe';
  };

  const getFullForm = (teamName: string) => {
    const formArr: string[] = [];
    const normalizedTarget = teamName.toLowerCase().trim();
    
    results.forEach(round => {
      const ms = round.matches || (Array.isArray(round) ? round : []);
      ms.forEach((m: any) => {
        const hName = getTeamName(m.homeTeam).toLowerCase().trim();
        const aName = getTeamName(m.awayTeam).toLowerCase().trim();
        
        if (hName === normalizedTarget || aName === normalizedTarget) {
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

          const hS = parseInt(String(homeRaw ?? '-1'));
          const aS = parseInt(String(awayRaw ?? '-1'));
          
          if (hS === -1 || aS === -1 || isNaN(hS) || isNaN(aS)) return; // Skip unfinished or invalid scores

          if (hName === normalizedTarget) {
            formArr.push(hS > aS ? 'Won' : (hS < aS ? 'Lost' : 'Draw'));
          } else {
            formArr.push(aS > hS ? 'Won' : (aS < hS ? 'Lost' : 'Draw'));
          }
        }
      });
    });
    return formArr;
  };

  const renderForm = (history: string[]) => {
    if (!history || history.length === 0) return null;
    return (
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
        {history.map((res: string, i: number) => (
          <div key={i} className={`w-2 h-2 shrink-0 rounded-[1.5px] shadow-sm border border-white/5 flex items-center justify-center text-[5px] font-black text-white ${
            res === 'Won' ? 'bg-emerald-500' :
            res === 'Lost' ? 'bg-rose-500' :
            'bg-slate-600'
          }`} title={`Match ${i+1}: ${res}`}>
             {res === 'Won' ? 'V' : res === 'Lost' ? 'D' : 'N'}
          </div>
        ))}
      </div>
    );
  };

  const performScan = async () => {
    setIsScanning(true);
    setLoading(true);
    setProgress({ current: 0, total: 0 });
    
    try {
      // 1. Fetch History FIRST
      const allHistory = await db.matches.where('leagueId').equals(leagueId).toArray();
      console.log(`[Scan] Loaded ${allHistory.length} history matches for league ${leagueId}`);

      // 2. Global DB Scan (Finding patterns in history itself)
      const patternsMap: Record<string, Match[]> = {};
      (allHistory as Match[]).forEach(h => {
        const o1 = (h.odds1 || '0').toString();
        const oX = (h.oddsX || '0').toString();
        const o2 = (h.odds2 || '0').toString();
        if (parseFloat(o1) <= 1.05) return;
        
        const key = `${o1}_${oX}_${o2}`;
        if (!patternsMap[key]) patternsMap[key] = [];
        patternsMap[key].push(h);
      });

      const groups = Object.entries(patternsMap)
        .map(([key, matches]) => ({
          oddsKey: key,
          odds: { 1: matches[0].odds1!, X: matches[0].oddsX!, 2: matches[0].odds2! },
          matches: matches.sort((a,b) => (b.expectedStart || '').localeCompare(a.expectedStart || ''))
        }))
        .filter(g => g.matches.length >= 2) // At least a pair
        .sort((a, b) => b.matches.length - a.matches.length); // Most frequent first

      setHistoricalPatterns(groups);

      // 3. Fetch rounds structure to get more upcoming matches
      const matchesResponse = await fetch(`/api/data/league/matches/${leagueId}`);
      if (!matchesResponse.ok) throw new Error('League connection failed');
      const matchesData = await matchesResponse.json();
      const rootData = Array.isArray(matchesData) ? matchesData[0] : matchesData;
      let categoryId = rootData?.eventCategoryId || rootData?.EventCategoryID || rootData?.seasonId;
      const roundsList = rootData?.rounds || rootData?.data?.rounds || [];
      
      const allUpcoming: any[] = [];
      if (categoryId && categoryId !== 'undefined') {
        const nextRounds = roundsList.filter((r: any) => {
          const start = new Date(r.expectedStart);
          return isNaN(start.getTime()) || start > new Date();
        }).slice(0, 20); // Scan next 20 upcoming rounds
        
        setProgress({ current: 0, total: nextRounds.length });
        
        for (let i = 0; i < nextRounds.length; i++) {
          const r = nextRounds[i];
          const rNum = r.roundNumber || r.id;
          try {
            const res = await fetch(`/api/data/round/${rNum}?eventCategoryId=${categoryId}`);
            if (res.ok) {
              const data = await res.json();
              if (data?.round?.matches) {
                allUpcoming.push(...data.round.matches); 
              } else if (Array.isArray(data?.matches)) {
                allUpcoming.push(...data.matches);
              }
            }
          } catch (e) {}
          setProgress(prev => ({ ...prev, current: i + 1 }));
        }
      }
      
      // 4. Template Pattern Search (Upcoming vs History)
      const scanResults: ScanResult[] = [];
      const rawCandidates = allUpcoming.length > 0 ? allUpcoming : upcomingMatches;
      const candidates = rawCandidates.filter((m: any) => {
        if (m.homeScore !== undefined && m.homeScore !== null && String(m.homeScore).trim() !== '' && m.homeScore !== '-') {
          return false;
        }
        const status = String(m.status || '').toLowerCase().trim();
        if (status === 'finished' || status === '3' || status === 'ft' || status === 'terminé' || status === 'live' || status === '2') {
          return false;
        }
        return true;
      });

      for (const upcoming of candidates) {
        const rawHome = typeof upcoming.homeTeam === 'string' ? upcoming.homeTeam : (upcoming.homeTeam?.name || upcoming.homeTeam?.teamName);
        const rawAway = typeof upcoming.awayTeam === 'string' ? upcoming.awayTeam : (upcoming.awayTeam?.name || upcoming.awayTeam?.teamName);
        if (!rawHome || !rawAway) continue;

        const home = rawHome.trim().toLowerCase();
        const away = rawAway.trim().toLowerCase();

        let uOdds = { 1: '0.00', X: '0.00', 2: '0.00' };
        const extractMarketOdds = (m: any) => {
          if (m.odds1 && m.oddsX && m.odds2) return { 1: String(m.odds1), X: String(m.oddsX), 2: String(m.odds2) };
          const markets = m.eventBetTypes || m.markets || m.odds || [];
          const mk = markets.find((x: any) => 
            ['1X2', 'MATCH RESULT'].includes((x.name || '').toUpperCase()) || 
            x.marketId === '1' || x.id === '1'
          );
          if (!mk) return null;
          const its = mk.eventBetTypeItems || mk.outcomes || mk.items || [];
          const getO = (ns: string[]) => its.find((o: any) => 
            ns.some(n => [o.shortName, o.name, o.outcomeName, o.outcome, String(o.id)].map(v => (v || '').toString().toLowerCase()).includes(n.toLowerCase()))
          )?.odds?.toString();
          
          const o1 = getO(['1', 'home']);
          const oX = getO(['x', 'draw', '2']);
          const o2 = getO(['2', 'away', '3']);
          
          if (!o1 || !o2) return null;
          return { 1: o1, X: oX || '0.00', 2: o2 };
        };

        const extracted = extractMarketOdds(upcoming);
        if (extracted) uOdds = extracted;

        const u1 = parseFloat(uOdds[1]);
        if (u1 <= 1.0) continue;

        const matchingMatches: Match[] = [];
        const oddsMatches: Match[] = [];

        (allHistory as Match[]).forEach(h => {
          const h1 = h.odds1 || '0';
          const hX = h.oddsX || '0';
          const h2 = h.odds2 || '0';
          
          // EXACT Match OR ultra-close
          const tolerance = 0.01;
          const sameOdds = Math.abs(parseFloat(h1) - u1) <= tolerance && 
                           Math.abs(parseFloat(hX) - parseFloat(uOdds.X)) <= tolerance &&
                           Math.abs(parseFloat(h2) - parseFloat(uOdds[2])) <= tolerance;
          
          if (sameOdds) {
            const hHome = (h.homeTeam || '').trim().toLowerCase();
            const hAway = (h.awayTeam || '').trim().toLowerCase();
            
            if (hHome === home && hAway === away) {
              matchingMatches.push(h);
            } else {
              oddsMatches.push(h);
            }
          }
        });

        if (matchingMatches.length + oddsMatches.length > 0) {
          const stats = { over25: 0, bothToScore: 0, homeWin: 0, draw: 0, awayWin: 0 };
          [...matchingMatches, ...oddsMatches].forEach(m => {
            const hs = parseInt(m.homeScore || '0');
            const as = parseInt(m.awayScore || '0');
            if (hs + as > 2.5) stats.over25++;
            if (hs > 0 && as > 0) stats.bothToScore++;
            if (hs > as) stats.homeWin++;
            else if (as > hs) stats.awayWin++;
            else stats.draw++;
          });

          scanResults.push({
            id: upcoming.id || `${rawHome}-${rawAway}-${uOdds[1]}`,
            homeTeam: rawHome,
            awayTeam: rawAway,
            upcomingOdds: uOdds,
            match: upcoming,
            matchingMatches: matchingMatches.sort((a,b) => (b.expectedStart || '').localeCompare(a.expectedStart || '')),
            oddsMatches: oddsMatches.sort((a,b) => (b.expectedStart || '').localeCompare(a.expectedStart || '')),
            stats
          });
        }
      }

      setScanResults(scanResults);
    } catch (error) {
      console.error('Scan Error:', error);
    } finally {
      setLoading(false);
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (upcomingMatches.length > 0 && scanResults.length === 0 && !isScanning) {
      performScan();
    }
  }, [upcomingMatches]);

  if (loading && scanResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 bg-slate-900/50 rounded-[3rem] border border-dashed border-slate-800">
        <div className="relative mb-6">
           <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
           {progress.total > 0 && (
             <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white">
                {Math.round((progress.current / progress.total) * 100)}%
             </div>
           )}
        </div>
        <p className="text-xs font-black text-slate-100 uppercase tracking-[0.3em] animate-pulse mb-2">Analyse des Modèles en cours...</p>
        {progress.total > 0 && (
          <p className="text-[9px] font-bold text-slate-500 uppercase">Round {progress.current} sur {progress.total}</p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-8 pb-32">
      {/* Header & Mode Toggle */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 blur-[100px] -mr-32 -mt-32 rounded-full" />
        
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Search className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-tight">Moteur de Reconnaissance de Patterns</h3>
              <div className="flex items-center gap-2 mt-1">
                <img 
                  src={getLeagueFlag(LEAGUES.find(l => l.id === leagueId)?.country)} 
                  alt="" 
                  className="w-3.5 h-2.5 object-contain"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <p className="text-[10px] font-bold text-slate-500 uppercase">Identification des doublons de cotes et d'équipes</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-1.5 bg-slate-950 rounded-2xl border border-slate-800">
            <button 
              onClick={() => setActiveMode('upcoming')}
              className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeMode === 'upcoming' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Scanner à Venir
            </button>
            <button 
              onClick={() => setActiveMode('history')}
              className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeMode === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Scan Base Locale ({historicalPatterns.length})
            </button>
          </div>

          <button 
            onClick={performScan}
            disabled={loading}
            className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 flex items-center gap-3"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Réanalyser
          </button>
        </div>
      </div>

      {activeMode === 'upcoming' ? (
        /* Upcoming vs History Mode */
        scanResults.length === 0 ? (
          <div className="py-24 text-center bg-slate-900/30 rounded-[3rem] border border-dashed border-slate-800">
             <Target className="w-12 h-12 text-slate-800 mx-auto mb-6 opacity-30" />
             <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-loose">
               Aucun modèle futur détecté<br/>dans les archives locales.
             </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-12">
            {scanResults.map((res) => (
              <div key={res.id} className="bg-slate-900 border border-slate-800 rounded-[3rem] p-8 relative overflow-hidden group shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 blur-[100px] -mr-32 -mt-32 rounded-full" />
                
                <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-10 pb-8 border-b border-white/5 relative z-10">
                   <div className="flex items-center gap-10">
                      <div className="text-right flex items-center gap-4">
                         <div>
                            <div className="flex items-center justify-end gap-2">
                               {(() => {
                                  const rIdx = rankings.findIndex(t => (t.name || t.teamName) === res.homeTeam);
                                  if (rIdx === -1) return null;
                                  return (
                                    <span className="text-[10px] font-black text-indigo-500 bg-indigo-900/20 px-2 rounded-full border border-indigo-500/10">
                                      #{rIdx + 1}
                                    </span>
                                  );
                               })()}
                               <span className="text-lg font-black text-white uppercase block">{res.homeTeam}</span>
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-1">
                               {(() => {
                                  const played = getFullForm(res.homeTeam).length;
                                  if (played === 0) return null;
                                  const r = rankings.find(t => (t.name || t.teamName) === res.homeTeam);
                                  const w = Number(r?.won) || 0;
                                  const d = Number(r?.draw) || 0;
                                  const l = Number(r?.lost) || 0;
                                  return (
                                    <div className="flex flex-col items-end gap-0.5">
                                      <div className="flex gap-1 text-[9px] font-bold">
                                        <span className="text-emerald-500">{Math.round((w/played)*100)}%</span>
                                        <span className="text-amber-500">{Math.round((d/played)*100)}%</span>
                                        <span className="text-rose-500">{Math.round((l/played)*100)}%</span>
                                      </div>
                                      {renderForm(getFullForm(res.homeTeam))}
                                    </div>
                                  );
                               })()}
                               <span className="text-[10px] font-bold text-slate-500 uppercase">Home</span>
                            </div>
                         </div>
                         <div className="w-12 h-12 bg-white/5 p-1 rounded-xl border border-white/10 flex items-center justify-center shrink-0 shadow-lg shadow-black/20 group-hover:scale-110 transition-transform">
                            <img 
                              src={getTeamLogo(res.homeTeam)} 
                              alt="" 
                              className="w-full h-full object-contain" 
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                         </div>
                      </div>

                        <div className="flex flex-col items-center gap-1">
                           <div className="w-14 h-14 bg-slate-950 border border-slate-800 flex items-center justify-center rounded-2xl text-indigo-500 font-black italic text-sm shadow-inner group-hover:border-indigo-500/30 transition-colors">VS</div>
                           {(() => {
                              const normalize = (s: string) => s?.toLowerCase().trim().replace(/\s+/g, ' ') || '';
                              const hName = normalize(res.homeTeam);
                              const aName = normalize(res.awayTeam);
                              
                              const liveMatch = allMatches.find(m => 
                                String(m.id) === String(res.match?.id) || 
                                String(m.apiId) === String(res.match?.id) ||
                                (normalize(getTeamName(m.homeTeam)) === hName && normalize(getTeamName(m.awayTeam)) === aName)
                              );
                              
                              if (!liveMatch) return null;
                              
                              const isLive = liveMatch.status?.toLowerCase() === 'live' || liveMatch.status?.includes("'");
                              const isFinished = liveMatch.status?.toLowerCase() === 'finished' || liveMatch.status === 'Terminé';
                              
                              const hasScore = liveMatch.homeScore !== undefined || liveMatch.awayScore !== undefined;
                              
                              if (!isLive && !isFinished && !hasScore) return null;

                              return (
                                <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
                                  <div className="flex items-center gap-3 mt-2 px-4 py-1.5 bg-slate-950 rounded-full border border-white/5 shadow-xl">
                                    <span className={`text-xl font-black ${isLive ? 'text-emerald-400' : 'text-white'}`}>{liveMatch.homeScore ?? 0}</span>
                                    <span className="text-slate-700 font-bold">:</span>
                                    <span className={`text-xl font-black ${isLive ? 'text-emerald-400' : 'text-white'}`}>{liveMatch.awayScore ?? 0}</span>
                                  </div>
                                  {isLive && (
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                      <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">
                                        En direct · {liveMatch.status}
                                      </span>
                                    </div>
                                  )}
                                  {isFinished && (
                                    <span className="text-[8px] font-black text-slate-500 uppercase mt-1">Terminé</span>
                                  )}

                                  {((liveMatch.scoreDetails?.homeGoals?.length || 0) + (liveMatch.scoreDetails?.awayGoals?.length || 0) > 0) && (
                                    <div className="flex flex-col items-center mt-3">
                                      <span className="text-[7px] font-black text-slate-600 uppercase mb-1 tracking-widest">Chronologie des Buts</span>
                                      <div className="flex flex-wrap justify-center gap-1.5 max-w-[150px]">
                                        {[...(liveMatch.scoreDetails?.homeGoals?.map((g: any) => ({ ...g, side: 'h' })) || []), 
                                          ...(liveMatch.scoreDetails?.awayGoals?.map((g: any) => ({ ...g, side: 'a' })) || [])]
                                          .sort((a, b) => (Number(a.minute || a.time) || 0) - (Number(b.minute || b.time) || 0))
                                          .map((goal, gIdx) => (
                                            <div key={gIdx} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-900 border ${goal.side === 'h' ? 'border-indigo-500/20' : 'border-rose-500/20'}`}>
                                              <div className={`w-1 h-1 rounded-full ${goal.side === 'h' ? 'bg-indigo-400' : 'bg-rose-400'}`} />
                                              <span className={`text-[8px] font-mono font-bold ${goal.side === 'h' ? 'text-indigo-400' : 'text-rose-400'}`}>
                                                {goal.minute || goal.time}'
                                              </span>
                                            </div>
                                          ))
                                        }
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                           })()}
                        </div>

                      <div className="text-left flex flex-row-reverse items-center gap-4">
                         <div>
                            <div className="flex items-center justify-start gap-2">
                               <span className="text-lg font-black text-white uppercase block">{res.awayTeam}</span>
                               {(() => {
                                  const rIdx = rankings.findIndex(t => (t.name || t.teamName) === res.awayTeam);
                                  if (rIdx === -1) return null;
                                  return (
                                    <span className="text-[10px] font-black text-indigo-500 bg-indigo-900/20 px-2 rounded-full border border-indigo-500/10">
                                      #{rIdx + 1}
                                    </span>
                                  );
                               })()}
                            </div>
                            <div className="flex items-center justify-start gap-2 mt-1">
                               <span className="text-[10px] font-bold text-slate-500 uppercase">Away</span>
                               {(() => {
                                  const played = getFullForm(res.awayTeam).length;
                                  if (played === 0) return null;
                                  const r = rankings.find(t => (t.name || t.teamName) === res.awayTeam);
                                  const w = Number(r?.won) || 0;
                                  const d = Number(r?.draw) || 0;
                                  const l = Number(r?.lost) || 0;
                                  return (
                                    <div className="flex flex-col items-start gap-0.5">
                                      <div className="flex gap-1 text-[9px] font-bold">
                                        <span className="text-emerald-500">{Math.round((w/played)*100)}%</span>
                                        <span className="text-amber-500">{Math.round((d/played)*100)}%</span>
                                        <span className="text-rose-500">{Math.round((l/played)*100)}%</span>
                                      </div>
                                      {renderForm(getFullForm(res.awayTeam))}
                                    </div>
                                  );
                               })()}
                            </div>
                         </div>
                         <div className="w-12 h-12 bg-white/5 p-1 rounded-xl border border-white/10 flex items-center justify-center shrink-0 shadow-lg shadow-black/20 group-hover:scale-110 transition-transform">
                            <img 
                              src={getTeamLogo(res.awayTeam)} 
                              alt="" 
                              className="w-full h-full object-contain" 
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                         </div>
                      </div>
                   </div>

                   <div className="flex gap-2">
                      <div className="bg-slate-950 px-5 py-3 rounded-2xl border border-slate-800 flex flex-col items-center min-w-[70px]">
                         <span className="text-[8px] font-black text-slate-600 uppercase mb-1">Cote 1</span>
                         <span className="text-sm font-black text-indigo-400">{res.upcomingOdds[1]}</span>
                      </div>
                      <div className="bg-slate-950 px-5 py-3 rounded-2xl border border-slate-800 flex flex-col items-center min-w-[70px]">
                         <span className="text-[8px] font-black text-slate-600 uppercase mb-1">Cote X</span>
                         <span className="text-sm font-black text-slate-400">{res.upcomingOdds.X}</span>
                      </div>
                      <div className="bg-slate-950 px-5 py-3 rounded-2xl border border-slate-800 flex flex-col items-center min-w-[70px]">
                         <span className="text-[8px] font-black text-slate-600 uppercase mb-1">Cote 2</span>
                         <span className="text-sm font-black text-indigo-400">{res.upcomingOdds[2]}</span>
                      </div>
                   </div>
                </div>

                {bet261Account && onPlaceBet && (
                  <div className="mb-8 p-4 bg-indigo-600/5 border border-indigo-600/20 rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Pari Rapide (Pattern détecté)</span>
                      <p className="text-[9px] text-slate-400">Misez 100 Ar sur ce pattern</p>
                    </div>
                    <div className="flex gap-2">
                      {['1', 'X', '2'].map(sel => {
                        const val = res.upcomingOdds[sel as keyof typeof res.upcomingOdds];
                        if (!val || val === '0.00' || val === '-') return null;
                        const placingInCard = isPlacing[res.id];

                        return (
                          <button
                            key={sel}
                            disabled={!!placingInCard}
                            onClick={async () => {
                              if (confirm(`Placer un pari test de 100 Ar sur ${sel} (@${val}) ?`)) {
                                setIsPlacing(prev => ({ ...prev, [res.id]: sel }));
                                try {
                                  await onPlaceBet(res.match, sel, val, 100);
                                } finally {
                                  setIsPlacing(prev => ({ ...prev, [res.id]: null }));
                                }
                              }
                            }}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${
                              placingInCard === sel 
                                ? 'bg-indigo-400 text-white cursor-not-allowed' 
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                            }`}
                          >
                            {placingInCard === sel && <Loader2 className="w-3 h-3 animate-spin" />}
                            {sel} (@{val})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-10 relative z-10">
                  {res.matchingMatches.length > 0 && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                         <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                         <h4 className="text-xs font-black text-slate-100 uppercase tracking-widest">Archive Directe (Mêmes Équipes + Même Cotes)</h4>
                      </div>
                      <div className="space-y-4">
                         {res.matchingMatches.map((h, i) => (
                           <div key={i} className="bg-slate-950/80 border border-emerald-500/20 rounded-3xl p-6 hover:border-emerald-500/40 transition-all">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                                 <div className="flex items-center gap-4">
                                    <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                      <span className="text-[10px] font-black text-emerald-400">S{h.season?.slice(-2)} - J{h.round}</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">{new Date(h.expectedStart).toLocaleDateString()}</span>
                                 </div>
                                 <div className="flex flex-col items-center justify-center gap-4 md:col-span-2">
                                    <div className="flex items-center justify-between w-full gap-8">
                                      <div className="flex flex-col items-end flex-1">
                                        <div className="flex items-center justify-end gap-2 w-full">
                                          <span className="text-xs font-black text-white uppercase truncate max-w-[120px]">{h.homeTeam}</span>
                                          <img 
                                            src={getTeamLogo(h.homeTeam)} 
                                            alt="" 
                                            className="w-5 h-5 object-contain" 
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                          />
                                        </div>
                                      </div>
                                      <div className="flex flex-col items-center">
                                        <div className={`px-5 py-2 rounded-2xl font-black text-lg min-w-[4rem] text-center border ${
                                          parseInt(h.homeScore!) > parseInt(h.awayScore!) ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                          parseInt(h.homeScore!) < parseInt(h.awayScore!) ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-slate-800/20 border-slate-700 text-slate-400'
                                        }`}>
                                          {h.homeScore} - {h.awayScore}
                                        </div>
                                        {((h.scoreDetails?.homeGoals?.length || 0) + (h.scoreDetails?.awayGoals?.length || 0) > 0) && (
                                          <div className="flex flex-wrap justify-center gap-1 mt-1 max-w-[100px]">
                                            {[...(h.scoreDetails?.homeGoals?.map((g: any) => ({ ...g, side: 'h' })) || []), 
                                              ...(h.scoreDetails?.awayGoals?.map((g: any) => ({ ...g, side: 'a' })) || [])]
                                              .sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0))
                                              .map((goal, gIdx) => (
                                                <span key={gIdx} className={`text-[7px] font-black ${goal.side === 'h' ? 'text-indigo-400' : 'text-rose-400'}`}>
                                                  {goal.time}'
                                                </span>
                                              ))
                                            }
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex flex-col items-start flex-1">
                                        <div className="flex items-center justify-start gap-2 w-full">
                                          <img 
                                            src={getTeamLogo(h.awayTeam)} 
                                            alt="" 
                                            className="w-5 h-5 object-contain" 
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                          />
                                          <span className="text-xs font-black text-white uppercase truncate max-w-[120px]">{h.awayTeam}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Forms in separate rows */}
                                    <div className="w-full space-y-2 mt-2 px-2 border-t border-white/5 pt-2">
                                       <div className="flex flex-col gap-0.5">
                                          <div className="flex items-center justify-between">
                                             <span className="text-[7px] font-black text-slate-500 uppercase tracking-tighter">Forme {h.homeTeam}</span>
                                          </div>
                                          {renderForm(getFullForm(h.homeTeam))}
                                       </div>
                                       <div className="flex flex-col gap-0.5">
                                          <div className="flex items-center justify-between">
                                             <span className="text-[7px] font-black text-slate-500 uppercase tracking-tighter">Forme {h.awayTeam}</span>
                                          </div>
                                          {renderForm(getFullForm(h.awayTeam))}
                                       </div>
                                    </div>
                                 </div>
                                 <div className="flex items-center justify-end gap-3 text-[10px] font-black">
                                    <div className="flex flex-col items-end">
                                       <span className="text-[8px] text-slate-600 uppercase mb-0.5">Vérif Cotes</span>
                                       <div className="flex gap-2">
                                          <span className="text-slate-500">{h.odds1}</span>
                                          <span className="text-slate-500">{h.oddsX}</span>
                                          <span className="text-slate-500">{h.odds2}</span>
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                         ))}
                      </div>
                    </div>
                  )}

                  {res.oddsMatches.length > 0 && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                         <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                         <h4 className="text-xs font-black text-slate-100 uppercase tracking-widest">Templates de Ligue (Équipes Différentes + Même Cotes)</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {res.oddsMatches.map((h, i) => (
                           <div key={i} className="bg-slate-950/40 border border-white/5 rounded-[2rem] p-5 hover:bg-slate-900 transition-colors">
                              <div className="flex items-center justify-between mb-3">
                                 <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-black text-slate-600">S{h.season?.slice(-2)} J{h.round}</span>
                                 </div>
                                 <div className="flex gap-1.5">
                                   <span className="text-[7px] font-black text-slate-500">{h.odds1}</span>
                                   <span className="text-[7px] font-black text-slate-500">{h.oddsX}</span>
                                   <span className="text-[7px] font-black text-slate-500">{h.odds2}</span>
                                 </div>
                              </div>
                               <div className="flex items-center justify-between gap-3">
                                 <div className="flex flex-col items-end flex-1 justify-center min-w-0">
                                   <div className="flex items-center gap-1.5 justify-end w-full">
                                     <span className="text-[10px] font-black text-slate-300 uppercase truncate text-right">{h.homeTeam}</span>
                                     <img 
                                       src={getTeamLogo(h.homeTeam)} 
                                       alt="" 
                                       className="w-3.5 h-3.5 object-contain" 
                                       onError={(e) => (e.currentTarget.style.display = 'none')}
                                     />
                                   </div>
                                   {renderForm(getFullForm(h.homeTeam))}
                                 </div>
                                 <div className="flex flex-col items-center gap-1 min-w-[2.5rem]">
                                   <div className={`px-2.5 py-1 rounded-xl font-black text-xs w-full text-center border ${
                                     parseInt(h.homeScore!) > parseInt(h.awayScore!) ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500' :
                                     parseInt(h.homeScore!) < parseInt(h.awayScore!) ? 'bg-rose-500/5 border-rose-500/10 text-rose-500' : 'bg-slate-800/10 border-slate-700/10 text-slate-500'
                                   }`}>
                                     {h.homeScore}-{h.awayScore}
                                   </div>
                                   {((h.scoreDetails?.homeGoals?.length || 0) + (h.scoreDetails?.awayGoals?.length || 0) > 0) && (
                                     <div className="flex flex-wrap justify-center gap-1 mt-0.5 max-w-[60px]">
                                       {[...(h.scoreDetails?.homeGoals?.map((g: any) => ({ ...g, side: 'h' })) || []), 
                                         ...(h.scoreDetails?.awayGoals?.map((g: any) => ({ ...g, side: 'a' })) || [])]
                                         .sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0))
                                         .map((goal, gIdx) => (
                                           <span key={gIdx} className={`text-[6px] font-black ${goal.side === 'h' ? 'text-indigo-400' : 'text-rose-400'}`}>
                                             {goal.time}'
                                           </span>
                                         ))
                                       }
                                     </div>
                                   )}
                                 </div>
                                 <div className="flex flex-col items-start flex-1 justify-center min-w-0">
                                   <div className="flex items-center gap-1.5 justify-start w-full">
                                     <img 
                                       src={getTeamLogo(h.awayTeam)} 
                                       alt="" 
                                       className="w-3.5 h-3.5 object-contain" 
                                       onError={(e) => (e.currentTarget.style.display = 'none')}
                                     />
                                     <span className="text-[10px] font-black text-slate-300 uppercase truncate text-left">{h.awayTeam}</span>
                                   </div>
                                   {renderForm(getFullForm(h.awayTeam))}
                                 </div>
                              </div>
                           </div>
                         ))}
                      </div>
                    </div>
                  )}
                </div>

                 <div className="mt-10 grid grid-cols-3 md:grid-cols-6 gap-4 p-6 bg-slate-950 rounded-3xl border border-slate-800 relative z-10 text-center">
                    <div>
                       <span className="text-[9px] font-black text-slate-600 uppercase block mb-1">Total Modèles</span>
                       <span className="text-sm font-black text-white">{res.matchingMatches.length + res.oddsMatches.length}</span>
                    </div>
                    <div>
                       <span className="text-[9px] font-black text-emerald-500/60 uppercase block mb-1">Victoire 1</span>
                       <span className="text-sm font-black text-emerald-500">{Math.round((res.stats.homeWin / (res.matchingMatches.length + res.oddsMatches.length)) * 100)}%</span>
                    </div>
                    <div>
                       <span className="text-[9px] font-black text-slate-500/60 uppercase block mb-1">Nulle X</span>
                       <span className="text-sm font-black text-slate-400">{Math.round((res.stats.draw / (res.matchingMatches.length + res.oddsMatches.length)) * 100)}%</span>
                    </div>
                    <div>
                       <span className="text-[9px] font-black text-rose-500/60 uppercase block mb-1">Victoire 2</span>
                       <span className="text-sm font-black text-rose-500">{Math.round((res.stats.awayWin / (res.matchingMatches.length + res.oddsMatches.length)) * 100)}%</span>
                    </div>
                    <div>
                       <span className="text-[9px] font-black text-indigo-400/60 uppercase block mb-1">Over 2.5</span>
                       <span className="text-sm font-black text-indigo-400">{Math.round((res.stats.over25 / (res.matchingMatches.length + res.oddsMatches.length)) * 100)}%</span>
                    </div>
                    <div>
                       <span className="text-[9px] font-black text-indigo-400/60 uppercase block mb-1">GG (BTS)</span>
                       <span className="text-sm font-black text-indigo-400">{Math.round((res.stats.bothToScore / (res.matchingMatches.length + res.oddsMatches.length)) * 100)}%</span>
                    </div>
                 </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Global History Mode */
        historicalPatterns.length === 0 ? (
          <div className="py-24 text-center bg-slate-900/30 rounded-[3rem] border border-dashed border-slate-800">
             <Search className="w-12 h-12 text-slate-800 mx-auto mb-6 opacity-30" />
             <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-loose">
               Aucun doublon de cotes détecté<br/>dans la base de données.
             </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-12">
            {historicalPatterns.map((group, gIdx) => {
              const hWin = group.matches.filter(m => parseInt(m.homeScore!) > parseInt(m.awayScore!)).length;
              const aWin = group.matches.filter(m => parseInt(m.homeScore!) < parseInt(m.awayScore!)).length;
              const draw = group.matches.filter(m => parseInt(m.homeScore!) === parseInt(m.awayScore!)).length;
              const ov25 = group.matches.filter(m => (parseInt(m.homeScore!) + parseInt(m.awayScore!)) > 2.5).length;
              
              return (
                <div key={gIdx} className="bg-slate-900 border border-slate-800 rounded-[3rem] p-8 relative overflow-hidden group shadow-2xl">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-8 pb-8 border-b border-white/5 relative z-10">
                    <div className="flex items-center gap-6">
                      <div className="bg-indigo-600/10 border border-indigo-500/20 px-6 py-4 rounded-3xl flex items-center gap-4">
                        <Zap className="w-6 h-6 text-indigo-500" />
                        <div>
                          <span className="text-[9px] font-black text-indigo-400 uppercase block">Modèle de Cotes</span>
                          <span className="text-lg font-black text-white">{group.odds[1]} · {group.odds.X} · {group.odds[2]}</span>
                        </div>
                      </div>
                      <div>
                         <span className="text-xl font-black text-white block">{group.matches.length} Occurrences</span>
                         <span className="text-[10px] font-bold text-slate-500 uppercase">Archives Détectées</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                       <div className="text-center bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800 min-w-[60px]">
                          <span className="text-[8px] font-black text-emerald-500 block">HOME</span>
                          <span className="text-xs font-black text-white">{Math.round((hWin/group.matches.length)*100)}%</span>
                       </div>
                       <div className="text-center bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800 min-w-[60px]">
                          <span className="text-[8px] font-black text-slate-500 block">DRAW</span>
                          <span className="text-xs font-black text-white">{Math.round((draw/group.matches.length)*100)}%</span>
                       </div>
                       <div className="text-center bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800 min-w-[60px]">
                          <span className="text-[8px] font-black text-rose-500 block">AWAY</span>
                          <span className="text-xs font-black text-white">{Math.round((aWin/group.matches.length)*100)}%</span>
                       </div>
                       <div className="text-center bg-indigo-600/20 px-4 py-2 rounded-2xl border border-indigo-500/30 min-w-[60px]">
                          <span className="text-[8px] font-black text-indigo-400 block">+2.5 G</span>
                          <span className="text-xs font-black text-white">{Math.round((ov25/group.matches.length)*100)}%</span>
                       </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
                    {group.matches.map((m, mIdx) => (
                      <div key={mIdx} className="bg-slate-950/50 border border-slate-800 rounded-[2rem] p-5 hover:border-slate-700 transition-all">
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-[8px] font-black text-slate-600 uppercase">J{m.round} · {m.season}</span>
                           <span className="text-[7px] font-bold text-slate-700">{new Date(m.expectedStart).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                           <div className="flex flex-col items-end flex-1 justify-center min-w-0">
                             <div className="flex items-center gap-1.5 justify-end w-full">
                               <span className="text-[9px] font-black text-slate-300 uppercase truncate text-right">{m.homeTeam}</span>
                               <img 
                                 src={getTeamLogo(m.homeTeam)} 
                                 alt="" 
                                 className="w-3 h-3 object-contain" 
                                 onError={(e) => (e.currentTarget.style.display = 'none')}
                               />
                             </div>
                             {(() => {
                               const r = rankings.find(t => (t.name || t.teamName) === m.homeTeam);
                               return r ? renderForm(r.history) : null;
                             })()}
                           </div>
                           <div className="flex flex-col items-center gap-1 flex-[0_0_auto]">
                             <div className={`px-2 py-0.5 rounded-lg font-black text-[10px] min-w-[2.2rem] text-center bg-slate-900 border border-slate-800 ${
                               parseInt(m.homeScore!) > parseInt(m.awayScore!) ? 'text-emerald-500' : 
                               parseInt(m.homeScore!) < parseInt(m.awayScore!) ? 'text-rose-500' : 'text-slate-400'
                             }`}>
                               {m.homeScore}-{m.awayScore}
                             </div>
                             {((m.scoreDetails?.homeGoals?.length || 0) + (m.scoreDetails?.awayGoals?.length || 0) > 0) && (
                               <div className="flex flex-wrap justify-center gap-1 mt-0.5 max-w-[60px]">
                                 {[...(m.scoreDetails?.homeGoals?.map((g: any) => ({ ...g, side: 'h' })) || []), 
                                   ...(m.scoreDetails?.awayGoals?.map((g: any) => ({ ...g, side: 'a' })) || [])]
                                   .sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0))
                                   .map((goal, gIdx) => (
                                     <span key={gIdx} className={`text-[6px] font-black ${goal.side === 'h' ? 'text-indigo-400' : 'text-rose-400'}`}>
                                       {goal.time}'
                                     </span>
                                   ))
                                 }
                               </div>
                             )}
                           </div>
                           <div className="flex flex-col items-start flex-1 justify-center min-w-0">
                             <div className="flex items-center gap-1.5 justify-start w-full">
                               <img 
                                 src={getTeamLogo(m.awayTeam)} 
                                 alt="" 
                                 className="w-3 h-3 object-contain" 
                                 onError={(e) => (e.currentTarget.style.display = 'none')}
                               />
                               <span className="text-[9px] font-black text-slate-300 uppercase truncate text-left">{m.awayTeam}</span>
                             </div>
                             {(() => {
                               const r = rankings.find(t => (t.name || t.teamName) === m.awayTeam);
                               return r ? renderForm(r.history) : null;
                             })()}
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Logic Card */}
      <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-[2.5rem] p-8 flex items-start gap-6 relative z-10">
        <div className="p-3 bg-indigo-600 rounded-2xl">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-black text-white uppercase tracking-tight">Analyse de Corrélation d'Identité</h4>
          <p className="text-xs text-indigo-200/70 font-medium leading-relaxed">
            Cet outil identifie les régularités algorithmiques. Soit les mêmes équipes se retrouvent avec les mêmes cotes, soit des équipes différentes héritent du même template de probabilité. Dans les deux cas, le résultat historique est un indicateur de haute précision pour le futur scénario.
          </p>
        </div>
      </div>
    </div>
  );
}
