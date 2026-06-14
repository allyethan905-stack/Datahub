import { useState, useRef, useMemo } from 'react';
import { Trophy, AlertTriangle, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { getTeamLogo } from '../lib/logos';
import { getMatchAnomalyParsed } from '../utils/anomaly';

export function ScrollableFormList({ history, size = 'md' }: { history: string[], size?: 'xs' | 'sm' | 'md' }) {
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

const formatTimeOnly = (dateStr: any) => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

export default function MatchCard({ match, rankings, results, onClick, onPlaceBet: _onPlaceBet, bet261Account: _bet261Account, resultsCache }: { 
  match: any, 
  rankings: any[], 
  results: any[],
  onClick?: () => void,
  onPlaceBet?: (match: any, selection: string, odds: string, stake?: number) => Promise<void>,
  bet261Account?: any,
  resultsCache?: { recentMatchesMap: Record<string, any[]>, formMap: Record<string, string[]> }
}) {
  const [homeLogoError, setHomeLogoError] = useState(false);
  const [awayLogoError, setAwayLogoError] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'main' | 'home' | 'away'>('main');

  const getTeamName = (team: any) => {
    if (!team) return '-';
    if (typeof team === 'string') return team;
    return team.name || team.teamName || team.shortName || 'Équipe';
  };

  const homeName = String(getTeamName(match.homeTeam));
  const awayName = String(getTeamName(match.awayTeam));

  // Build local fallback cache inside MatchCard if resultsCache is not passed
  const fallbackCache = useMemo(() => {
    if (resultsCache) return null;
    const recentMatchesMap: Record<string, any[]> = {};
    const formMap: Record<string, string[]> = {};

    results.forEach(round => {
      // support both array of rounds with matches and flat array of matches
      let ms = round.matches;
      if (!ms) {
        if (Array.isArray(round)) {
          ms = round;
        } else if (round && (round.homeTeam || round.awayTeam)) {
          ms = [round];
        } else {
          ms = [];
        }
      }

      ms.forEach((m: any) => {
        const hN = getTeamName(m.homeTeam);
        const aN = getTeamName(m.awayTeam);
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
  }, [results, resultsCache]);

  const activeCache = resultsCache || fallbackCache;

  const getFullForm = (teamName: string) => {
    if (activeCache) {
      return activeCache.formMap[teamName.toLowerCase().trim()] || [];
    }
    return [];
  };

  const getRecentMatches = (teamName: string) => {
    if (activeCache) {
      return activeCache.recentMatchesMap[teamName.toLowerCase().trim()] || [];
    }
    return [];
  };

  const renderDetailedForm = (teamName: string) => {
    const recent = getRecentMatches(teamName);
    if (recent.length === 0) return (
      <div className="py-4 text-center text-slate-500 text-[8px] font-bold uppercase tracking-widest italic">
        Aucun historique trouvé
      </div>
    );

    return (
      <div className="flex flex-col gap-1 mt-1 max-h-[300px] overflow-y-auto no-scrollbar">
        {recent.map((r, i) => {
          const rHName = getTeamName(r.homeTeam);
          const rAName = getTeamName(r.awayTeam);
          const isHome = rHName === teamName;
          const rHScore = parseInt(String(r.homeScore));
          const rAScore = parseInt(String(r.awayScore));
          const outcome = rHScore === rAScore ? 'D' : ((isHome && rHScore > rAScore) || (!isHome && rAScore > rHScore) ? 'W' : 'L');

          const details = r.scoreDetails || r.eventScore?.scoreDetails || {};
          const homeGoalsList = details.homeGoals || [];
          const awayGoalsList = details.awayGoals || [];
          const allGoals = [
            ...(homeGoalsList.map((g: any) => ({ ...g, side: 'h' })) || []),
            ...(awayGoalsList.map((g: any) => ({ ...g, side: 'a' })) || [])
          ].sort((a, b) => parseInt(a.minute || a.time || '0') - parseInt(b.minute || b.time || '0'));

          const hasGoals = allGoals.length > 0;

          // Compute HT/FT
          let htFtBadge = null;
          if (hasGoals) {
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
            const ftRes = rHScore > rAScore ? '1' : (rHScore < rAScore ? '2' : 'X');
            htFtBadge = (
              <span className="px-1 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 font-mono text-[6.5px] font-black uppercase tracking-wider shrink-0 select-none">
                HT/FT {htRes}/{ftRes}
              </span>
            );
          }

          return (
            <div key={i} className="flex flex-col gap-1 p-1.5 rounded bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[7px] font-black text-white shrink-0 ${
                    outcome === 'W' ? 'bg-emerald-500' : outcome === 'L' ? 'bg-rose-500' : 'bg-slate-600'
                  }`}>
                    {outcome === 'W' ? 'V' : outcome === 'L' ? 'D' : 'N'}
                  </span>
                  <div className="flex items-center gap-1 truncate w-full">
                    <span className="text-slate-600 text-[6px] font-black">J{r.roundNumber}</span>
                    <span className={`truncate text-[8px] font-black uppercase ${isHome ? 'text-indigo-400' : 'text-slate-400'}`}>{rHName}</span>
                    <span className="text-slate-700 text-[7px] font-bold px-0.5">vs</span>
                    <span className={`truncate text-[8px] font-black uppercase ${!isHome ? 'text-indigo-400' : 'text-slate-400'}`}>{rAName}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {htFtBadge}
                  <div className="flex items-center gap-1 bg-black/20 px-1.5 py-0.5 rounded shrink-0 ring-1 ring-white/5">
                    <span className={`text-[9px] font-black ${rHScore > rAScore ? 'text-emerald-400' : 'text-slate-400'}`}>{rHScore}</span>
                    <span className="text-[7px] text-slate-600 font-black">-</span>
                    <span className={`text-[9px] font-black ${rAScore > rHScore ? 'text-emerald-400' : 'text-slate-400'}`}>{rAScore}</span>
                  </div>
                </div>
              </div>

              {/* Goal Minutes List */}
              {hasGoals && (
                <div className="flex flex-wrap gap-1 pl-5 max-w-[90%]">
                  {allGoals.map((g, gi) => (
                    <span key={gi} className={`text-[6.5px] font-black font-mono px-1 py-0.2 rounded border ${
                      g.side === 'h' 
                        ? 'bg-indigo-500/5 border-indigo-500/10 text-indigo-400' 
                        : 'bg-rose-500/5 border-rose-500/10 text-rose-400'
                    }`}>
                      {g.minute || g.time}'
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Stats calculation using full results
  const getTeamStats = (name: string) => {
    const history = getFullForm(name);
    if (history.length === 0) return { win: 0, draw: 0, loss: 0 };
    const w = history.filter(r => r === 'Won').length;
    const d = history.filter(r => r === 'Draw').length;
    const l = history.filter(r => r === 'Lost').length;
    return {
      win: Math.round((w / history.length) * 100),
      draw: Math.round((d / history.length) * 100),
      loss: Math.round((l / history.length) * 100)
    };
  };

  const homeStats = getTeamStats(homeName);
  const awayStats = getTeamStats(awayName);

  // Extract odds (handle both API format and DB format)
  let odds1 = match.odds1;
  let oddsX = match.oddsX;
  let odds2 = match.odds2;

  if (!odds1 && match.eventBetTypes) {
    const odds1x2 = match.eventBetTypes?.find((m: any) => 
      m.name?.toUpperCase() === '1X2' || m.name === 'Match Result' || m.id === '1'
    ) || match.markets?.find((m: any) => 
      m.name?.toUpperCase() === '1X2' || m.name === 'Match Result' || m.id === '1'
    );
    const items = odds1x2?.eventBetTypeItems || odds1x2?.outcomes || [];
    const findOdds = (names: string[]) => {
      const item = items.find((o: any) => names.includes(o.shortName) || names.includes(o.name) || names.includes(o.outcomeName));
      return item?.odds || '-';
    };
    odds1 = findOdds(['1', 'Home']);
    oddsX = findOdds(['X', 'Draw']);
    odds2 = findOdds(['2', 'Away']);
  }

  const homeRank = rankings.findIndex(t => (t.name || t.teamName) === homeName) + 1;
  const awayRank = rankings.findIndex(t => (t.name || t.teamName) === awayName) + 1;
  
  const hasAnomaly = useMemo(() => {
    return getMatchAnomalyParsed(match, rankings);
  }, [match, rankings]);

  const isFinished = match.status?.toLowerCase() === 'finished' || match.status?.toLowerCase() === 'ft' || match.status?.toLowerCase() === 'terminé';
  const isLive = match.status?.toLowerCase() === 'live' || match.status?.includes("'");
  const h = parseInt(match.homeScore || '-1');
  const a = parseInt(match.awayScore || '-1');

  const [showAnomalyDetail, setShowAnomalyDetail] = useState(false);

  const borderHighlightClass = useMemo(() => {
    if (!homeStats || !awayStats) return null;
    const homeFormLength = getFullForm(homeName).length;
    const awayFormLength = getFullForm(awayName).length;
    if (homeFormLength === 0 || awayFormLength === 0) return null;

    if (homeStats.draw === awayStats.draw) {
      return {
        className: 'border-2 border-amber-500/90 shadow-[0_0_15px_rgba(245,158,11,0.45)] bg-gradient-to-br from-amber-950/20 to-slate-900/40 hover:border-amber-400 ring-2 ring-amber-500/30 scale-[1.01] transition-all duration-300 animate-[pulse_2s_infinite]',
      };
    }
    if (homeStats.win === awayStats.win) {
      return {
        className: 'border-2 border-emerald-500/90 shadow-[0_0_15px_rgba(16,185,129,0.45)] bg-gradient-to-br from-emerald-950/20 to-slate-900/40 hover:border-emerald-400 ring-2 ring-emerald-500/30 scale-[1.01] transition-all duration-300 animate-[pulse_2s_infinite]',
      };
    }
    if (homeStats.loss === awayStats.loss) {
      return {
        className: 'border-2 border-rose-500/90 shadow-[0_0_15px_rgba(244,63,94,0.45)] bg-gradient-to-br from-rose-950/20 to-slate-900/40 hover:border-rose-400 ring-2 ring-rose-500/30 scale-[1.01] transition-all duration-300 animate-[pulse_2s_infinite]',
      };
    }
    return null;
  }, [homeStats, awayStats, homeName, awayName, results]);

  return (
    <div 
      onClick={activeDetailTab === 'main' ? onClick : undefined}
      key={`${match.id}_card`}
      className={borderHighlightClass
        ? `data-card p-2 flex flex-col justify-between group transition-all duration-300 ${activeDetailTab === 'main' && onClick ? 'cursor-pointer' : ''} ${borderHighlightClass.className}`
        : `data-card p-2 flex flex-col justify-between group transition-all duration-300 ${activeDetailTab === 'main' && onClick ? 'cursor-pointer' : ''} ${isLive ? 'border-emerald-500/50 bg-emerald-950/20' : 'hover:border-indigo-505/30 bg-slate-950/40 border border-slate-800/80 rounded-2xl'}`
      }
    >
      <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[7.5px] font-black px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded uppercase tracking-wider">
            Round {match.round || '-'}
          </span>
          {isLive && <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          <span className={`text-[7.5px] font-black uppercase tracking-widest ${isLive ? 'text-emerald-400' : isFinished ? 'text-slate-500' : 'text-amber-400'}`}>
            {isFinished ? 'Terminé' : isLive ? 'LIVE' : 'À venir'}
          </span>

          {/* Red Alert Button for Odds Anomaly */}
          {hasAnomaly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAnomalyDetail(!showAnomalyDetail);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[6.5px] font-black tracking-wider uppercase animate-pulse transition-all duration-200 shadow-[0_0_8px_rgba(225,29,72,0.5)] hover:scale-105 active:scale-95 shrink-0"
              title="Alerte Anomalie de Cote ! Cliquez pour voir l'analyse."
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              <span>Alerte</span>
            </button>
          )}
        </div>

        <div className="flex gap-1">
          <button 
            onClick={(e) => { e.stopPropagation(); setActiveDetailTab('main'); }}
            className={`px-1.5 py-0.5 rounded text-[6px] font-black uppercase transition-all ${activeDetailTab === 'main' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
          >
            Match
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setActiveDetailTab('home'); }}
            className={`px-1.5 py-0.5 rounded text-[6px] font-black uppercase transition-all ${activeDetailTab === 'home' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
          >
            Forme {homeName.split(' ')[0]}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setActiveDetailTab('away'); }}
            className={`px-1.5 py-0.5 rounded text-[6px] font-black uppercase transition-all ${activeDetailTab === 'away' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
          >
            Forme {awayName.split(' ')[0]}
          </button>
        </div>
      </div>
      
      {activeDetailTab === 'main' ? (
        <>
          {/* Expanded Anomaly Details Banner */}
          {hasAnomaly && showAnomalyDetail && (
            <div 
              onClick={(e) => e.stopPropagation()} 
              className="mb-2.5 p-2 rounded-lg bg-rose-950/25 border border-rose-500/20 text-rose-200 animate-in fade-in slide-in-from-top-1 duration-200 select-none"
            >
              <div className="flex items-start gap-1.5 text-rose-400 font-extrabold text-[8.5px] uppercase tracking-wider mb-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400 animate-bounce" />
                <span className="text-rose-400">Anomalie de cote détectée !</span>
              </div>
              <p className="text-[8px] leading-relaxed text-slate-300 font-medium">
                L'équipe mieux classée <strong className="text-rose-400 font-bold">{hasAnomaly.betterTeam}</strong> (Rang <strong className="text-white">#{hasAnomaly.betterRank}</strong>) a une cote anormalement élevée de <strong className="text-emerald-400 font-bold font-mono">{hasAnomaly.betterOdds}</strong>, tandis que son adversaire <strong className="text-rose-400 font-bold">{hasAnomaly.worseTeam}</strong> (Rang <strong className="text-white">#{hasAnomaly.worseRank}</strong>) est favorisé avec une cote de <strong className="text-rose-400 font-bold font-mono">{hasAnomaly.worseOdds}</strong>.
              </p>
              <div className="mt-2 pt-1.5 border-t border-rose-500/10 flex justify-between items-center text-[7px] font-black uppercase">
                <span className="text-slate-400 font-bold">Écart de cote : <strong className="text-rose-400 font-mono text-[8px]">+{hasAnomaly.difference}</strong></span>
                <span className="text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/20 shadow-sm animate-pulse">Value bet potentiel</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-1 mb-2">
            {/* Home Team */}
            <div className="flex-1 flex flex-col items-end min-w-0">
               <div className="flex items-center justify-end gap-2 w-full">
                  <div className="flex flex-col items-end min-w-0">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-100 uppercase truncate w-full text-right">{homeName}</span>
                    <div className="flex items-center gap-1">
                      {homeStats && (
                        <div className="flex gap-1 text-[8px] font-bold">
                          <span className="text-emerald-500">{homeStats.win}%</span>
                          <span className="text-amber-500">{homeStats.draw}%</span>
                          <span className="text-rose-500">{homeStats.loss}%</span>
                        </div>
                      )}
                      {homeRank > 0 && (
                        <span className="text-[8px] font-black text-indigo-500 bg-indigo-900/20 px-1 rounded-full border border-indigo-500/10">
                          #{homeRank}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-8 h-8 shrink-0 bg-white/5 rounded-full p-1 border border-white/10 flex items-center justify-center overflow-hidden shadow-inner group-hover:scale-110 transition-transform">
                    {!homeLogoError ? (
                      <img src={getTeamLogo(homeName)} alt="" className="w-full h-full object-contain" onError={() => setHomeLogoError(true)} />
                    ) : (
                      <Trophy className="w-4 h-4 text-slate-700" />
                    )}
                  </div>
               </div>
            </div>
            
            {/* Score / VS */}
            <div className="flex flex-col items-center justify-center gap-1.5 px-1 shrink-0 min-w-[3.5rem]">
              {isFinished || isLive ? (
                <div className="flex-col flex items-center">
                  <div className="flex items-center gap-1 bg-black/60 px-2.5 py-1.5 rounded-xl border border-white/10 shadow-2xl">
                    <span className={`text-base font-black ${h > a ? 'text-emerald-400' : 'text-slate-200'}`}>{match.homeScore}</span>
                    <span className="text-slate-600 font-black text-xs">:</span>
                    <span className={`text-base font-black ${a > h ? 'text-emerald-400' : 'text-slate-200'}`}>{match.awayScore}</span>
                  </div>
                  {/* HT/FT Display for MatchCard */}
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
                </div>
              ) : (
                <div className="px-3 py-1 text-slate-500 font-black text-[9px] tracking-[0.2em] bg-slate-950/80 rounded-lg ring-1 ring-white/10 shadow-inner">VS</div>
              )}
              <span className="text-[7px] text-slate-500 font-black flex items-center gap-1 uppercase">
                <Clock className="w-2 h-2" />
                {formatTimeOnly(match.expectedStart || match.updatedAt)}
              </span>

              {/* DRAW PROBABILITY SUM / 2 BADGE */}
              {homeStats && awayStats && (
                <div 
                  className="mt-1 flex flex-col items-center justify-center bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 border border-amber-500/35 px-2 py-0.5 rounded transition-all duration-150 text-amber-400 select-none shadow-[0_0_8px_rgba(245,158,11,0.25)] select-none animate-pulse"
                  title="Σ% Nuls / 2 : Moyenne des probabilités de match nul basées sur la forme."
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[5px] text-amber-500/90 font-black tracking-widest uppercase mb-0.5 whitespace-nowrap">Ø NUL (Σ/2)</span>
                  <span className="font-mono text-[9px] font-black text-amber-300">
                    {Math.round((homeStats.draw + awayStats.draw) / 2)}%
                  </span>
                </div>
              )}
            </div>

            {/* Away Team */}
            <div className="flex-1 flex flex-col items-start min-w-0">
               <div className="flex items-center justify-start gap-2 w-full">
                  <div className="w-8 h-8 shrink-0 bg-white/5 rounded-full p-1 border border-white/10 flex items-center justify-center overflow-hidden shadow-inner group-hover:scale-110 transition-transform">
                    {!awayLogoError ? (
                      <img src={getTeamLogo(awayName)} alt="" className="w-full h-full object-contain" onError={() => setAwayLogoError(true)} />
                    ) : (
                      <Trophy className="w-4 h-4 text-slate-700" />
                    )}
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-100 uppercase truncate w-full">{awayName}</span>
                    <div className="flex items-center gap-1">
                      {awayRank > 0 && (
                        <span className="text-[8px] font-black text-indigo-500 bg-indigo-900/20 px-1 rounded-full border border-indigo-500/10">
                          #{awayRank}
                        </span>
                      )}
                      {awayStats && (
                        <div className="flex gap-1 text-[8px] font-bold">
                          <span className="text-emerald-500">{awayStats.win}%</span>
                          <span className="text-amber-500">{awayStats.draw}%</span>
                          <span className="text-rose-500">{awayStats.loss}%</span>
                        </div>
                      )}
                    </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Form History Stripes */}
          <div className="grid grid-cols-1 gap-1.5 mb-3 px-1">
             <div className="flex flex-col gap-0.5">
               <div className="flex items-center justify-between px-0.5">
                 <span className="text-[6.5px] font-black text-slate-500 uppercase tracking-widest">Forme {homeName}</span>
                 <span className="text-[6.5px] font-bold text-slate-600">{getFullForm(homeName).length} matchs</span>
               </div>
               <div className="bg-slate-950/30 p-1 rounded-md border border-white/5">
                 <ScrollableFormList history={getFullForm(homeName)} size="sm" />
               </div>
             </div>
             <div className="flex flex-col gap-0.5">
               <div className="flex items-center justify-between px-0.5">
                 <span className="text-[6.5px] font-black text-slate-500 uppercase tracking-widest">Forme {awayName}</span>
                 <span className="text-[6.5px] font-bold text-slate-600">{getFullForm(awayName).length} matchs</span>
               </div>
               <div className="bg-slate-950/30 p-1 rounded-md border border-white/5">
                 <ScrollableFormList history={getFullForm(awayName)} size="sm" />
               </div>
             </div>
          </div>
          {/* Goal Timeline */}

          {(match.scoreDetails?.homeGoals?.length || 0) + (match.scoreDetails?.awayGoals?.length || 0) > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mb-2 px-1.5 py-1 bg-white/[0.02] border border-white/5 rounded-lg w-full">
              {[...(match.scoreDetails?.homeGoals?.map((g: any) => ({ ...g, side: 'h' })) || []), 
                ...(match.scoreDetails?.awayGoals?.map((g: any) => ({ ...g, side: 'a' })) || [])]
                .sort((a, b) => parseInt(a.minute || a.time) - parseInt(b.minute || b.time))
                .map((g, gi) => (
                  <div key={gi} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-[4px] border ${g.side === 'h' ? 'text-indigo-400 bg-indigo-400/5 border-indigo-400/10' : 'text-rose-400 bg-rose-400/5 border-rose-400/10'}`}>
                     <span className="text-[9px] font-black">{g.minute || g.time}'</span>
                  </div>
                ))
              }
            </div>
          )}

          {/* Odds Grid */}
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: '1', val: odds1 || '-' },
              { label: 'X', val: oddsX || '-' },
              { label: '2', val: odds2 || '-' },
            ].map((o) => (
              <div key={o.label} className="bg-slate-800/40 rounded p-2 text-center border border-white/5 hover:bg-slate-850/80 transition-all hover:border-slate-700/50">
                <div className="text-[7.5px] text-slate-450 font-bold uppercase mb-0.5">{o.label}</div>
                <div className="font-mono font-black text-white text-[12px] sm:text-[13px] leading-none tracking-tight">{o.val}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
              💡 Historique : {activeDetailTab === 'home' ? homeName : awayName}
            </h4>
            <span className="text-[7px] font-bold text-slate-500">Historique complet</span>
          </div>
          {renderDetailedForm(activeDetailTab === 'home' ? homeName : awayName)}
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); setActiveDetailTab('main'); }}
            className="w-full mt-2 py-1 text-[7px] font-black text-slate-500 hover:text-white uppercase tracking-widest bg-white/5 hover:bg-indigo-600/20 rounded border border-white/5 transition-colors"
          >
            Retour au match
          </button>
        </div>
      )}
    </div>
  );
}
