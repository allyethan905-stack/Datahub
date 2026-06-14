import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Activity, Database, List, Clock, CheckCircle2, Download, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LEAGUES, generateMatchId } from '../shared/constants';
import { fetchWithRetry, fetchRoundPlayout } from '../lib/api';
import { getTeamLogo, getLeagueFlag } from '../lib/logos';
import { saveMatchesToLocal } from '../services/localArchive';

// --- TYPES ---
export interface ExtractedMatch {
  id: string; // Identifiant unique (ex: Home-Away-Round)
  homeTeam: string;
  awayTeam: string;
  odds1: string;
  oddsX: string;
  odds2: string;
  allOdds?: any; // Store all available markets (the 33+ markets)
  homeRank: number;
  awayRank: number;
  status: 'pending' | 'finished';
  apiId?: number; // Original API ID for faster lookups
  eventCategoryId?: number | string | null;
  score?: string;
  scoreDetails?: {
    homeGoals?: Array<{ minute: string; player: string }>;
    awayGoals?: Array<{ minute: string; player: string }>;
  };
  result?: '1' | 'X' | '2';
  updatedAt: Date;
  round?: number;
  expectedStart?: string | number;
  homeFormWDLPct?: { v: number; n: number; d: number; played: number };
  awayFormWDLPct?: { v: number; n: number; d: number; played: number };
}

interface LogEntry {
  id: string;
  time: Date;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

const parseMatchDate = (dateStr: string | number | undefined | null): Date | null => {
  if (!dateStr) return null;
  const str = String(dateStr);
  let d: Date;
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    d = new Date(num < 10000000000 ? num * 1000 : num);
  } else {
    d = new Date(str);
  }
  // Check if date is valid and year is reasonable (not 0001-01-01)
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  return d;
};

export default function DataExtractionMenu({ leagueId = 1, rankings = [], onActiveChange, onMatchesFinished }: { leagueId?: number, rankings?: any[], onActiveChange?: (isActive: boolean) => void, onMatchesFinished?: (matches: ExtractedMatch[]) => void, onSyncComplete?: () => void }) {
  // --- STATE ---
  const [isActive, setIsActive] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<Map<string, ExtractedMatch>>(new Map());
  const [finishedMatches, setFinishedMatches] = useState<ExtractedMatch[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentSeason, setCurrentSeason] = useState<string | null>(null);
  const [isWaitingForNextSeason, setIsWaitingForNextSeason] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [localRankings, setLocalRankings] = useState<any[]>([]);

  // --- REFS (pour accès dans les setInterval sans dépendances) ---
  const pendingRef = useRef(pendingMatches);
  const finishedRef = useRef(finishedMatches);
  const activeRef = useRef(isActive);
  const leagueIdRef = useRef(leagueId);
  const isWaitingRef = useRef(isWaitingForNextSeason);
  const lastCategoryIdRef = useRef<number | string | null>(null);

  // Maintien des refs à jour
  useEffect(() => { pendingRef.current = pendingMatches; }, [pendingMatches]);
  useEffect(() => { finishedRef.current = finishedMatches; }, [finishedMatches]);
  useEffect(() => { activeRef.current = isActive; }, [isActive]);
  useEffect(() => { isWaitingRef.current = isWaitingForNextSeason; }, [isWaitingForNextSeason]);

  const isSameTeamLocal = (t1: string = '', t2: string = '') => {
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

  const getTeamStatsFromRankings = (name: string) => {
    const activeRankings = localRankings && localRankings.length > 0 ? localRankings : rankings;
    if (!activeRankings || activeRankings.length === 0) return null;
    const r = activeRankings.find(t => isSameTeamLocal(t.name || t.teamName || '', name));
    if (!r) return null;
    const wins = Number(r.won) || 0;
    const draws = Number(r.draw) || 0;
    const losses = Number(r.lost) || 0;
    const played = wins + draws + losses;
    if (played === 0) return { v: 0, n: 0, d: 0, played: 0 };
    
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
    
    return {
      v,
      n,
      d,
      played: played
    };
  };

  useEffect(() => { 
    if (leagueIdRef.current !== leagueId) {
      setPendingMatches(new Map());
      setFinishedMatches([]);
      setLogs([]);
      setIsActive(false);
      setLocalRankings([]);
    }
    leagueIdRef.current = leagueId; 
  }, [leagueId]);

  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => { onActiveChangeRef.current = onActiveChange; }, [onActiveChange]);

  useEffect(() => {
    if (onActiveChangeRef.current) {
      onActiveChangeRef.current(isActive);
    }
  }, [isActive]);

  // --- LOGIC ---
  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => {
      const newLogs = [{ id: Math.random().toString(36).substr(2, 9), time: new Date(), message, type }, ...prev];
      return newLogs.slice(0, 50); // Garder les 50 derniers logs
    });
  };

  // Fonction pour récupérer le classement
  const fetchRanking = async () => {
    try {
      const ts = Date.now();
      const response = await fetchWithRetry(`/api/data/league/ranking/${leagueIdRef.current}?_t=${ts}`).catch(e => { 
        console.warn('Ranking fetch failed:', e);
        return { ok: false, json: async () => ({ teams: [] }) } as any;
      });
      if (!response.ok) {
        return {};
      }
      const data = await response.json();
      
      const rankDict: Record<string, number> = {};
      const teamsList = data && data.teams ? data.teams : [];
      setLocalRankings(teamsList);
      
      teamsList.forEach((team: any) => {
        rankDict[team.name || team.teamName] = team.position;
      });
      addLog('Ranking récupéré avec succès', 'success');
      return rankDict;
    } catch (error) {
      if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
        return {};
      }
      addLog('Erreur lors de la récupération du ranking', 'error');
      return {};
    }
  };

  // Fonction pour récupérer les matchs (Boucle 45s)
  const fetchMatches = async () => {
    if (!activeRef.current || isWaitingRef.current) return;
    
    try {
      const rankDict = await fetchRanking();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

      const ts = Date.now();
      const response = await fetchWithRetry(`/api/data/league/matches/${leagueIdRef.current}?_t=${ts}`, {
        signal: controller.signal
      }).catch(e => { 
        if (e.name === 'AbortError') throw new Error('Délai d\'attente dépassé (120s)');
        throw new Error(`Matches: ${e.message}`); 
      });
      
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`Matches error (${response.status}): ${errData.error || response.statusText}`);
      }
      const data = await response.json();

      // --- DETECTION AUTOMATIQUE DE TRANSITION DE SAISON ---
      const newCategoryId = data?.eventCategoryId || data?.EventCategoryID || data?.seasonId || 
                            (data?.rounds?.[0]?.eventCategoryId) || (data?.rounds?.[0]?.EventCategoryID) || 
                            (data?.rounds?.[0]?.matches?.[0]?.eventCategoryId) || (data?.rounds?.[0]?.matches?.[0]?.EventCategoryID) || null;
      const roundsArray = data?.rounds || (Array.isArray(data) ? data : []);
      
      // Détection STRICTE par changement d'EventCategoryID
      // Quand l'application détecte pour la première fois un changement, c'est signe que la saison actuelle se termine.
      if (newCategoryId && lastCategoryIdRef.current && String(newCategoryId) !== String(lastCategoryIdRef.current)) {
        addLog(`Basculement de saison détecté (ID: ${lastCategoryIdRef.current} -> ${newCategoryId}). Préparation de la saison suivante...`, 'warning');
        lastCategoryIdRef.current = newCategoryId;
        setIsWaitingForNextSeason(true);
        return;
      }
      lastCategoryIdRef.current = newCategoryId;
      // ---------------------------------------------------

      if (roundsArray.length > 0) {
        const newMatches: ExtractedMatch[] = [];
        const processedIds = new Set<string>();
        let detectedSeason = currentSeason;
        
        roundsArray.forEach((r: any) => {
          const matchesInRound = Array.isArray(r.matches) ? r.matches : (Array.isArray(r) ? r : [r]);
          
          matchesInRound.forEach((m: any) => {
            if (!m || !m.homeTeam) return;

            const round = r.roundNumber || r.round || m.round || 0;
            const seasonIdOrEventCategoryId = m.eventCategoryId || m.EventCategoryID || r.eventCategoryId || r.EventCategoryID || m.seasonId || m.season || r.seasonId || r.season || '';
            const season = seasonIdOrEventCategoryId ? (String(seasonIdOrEventCategoryId).startsWith('ID:') ? String(seasonIdOrEventCategoryId) : `ID: ${seasonIdOrEventCategoryId}`) : '';
            if (season && !detectedSeason) detectedSeason = season;

            const home = m.homeTeam?.name || m.homeTeam?.teamName || m.homeTeam || 'Unknown';
            const away = m.awayTeam?.name || m.awayTeam?.teamName || m.awayTeam || 'Unknown';
            const homeStr = typeof home === 'string' ? home : JSON.stringify(home);
            const awayStr = typeof away === 'string' ? away : JSON.stringify(away);
            
            // ID Unique incluant la saison pour éviter les collisions entre saisons
            const id = generateMatchId(leagueIdRef.current, season, round, homeStr, awayStr);
            
            if (processedIds.has(id)) return;
            processedIds.add(id);
            
            // Extraction des cotes (robuste)
            let odds1 = '-', oddsX = '-', odds2 = '-';
            const odds1x2 = m.eventBetTypes?.find((mk: any) => {
              const name = mk.name?.toUpperCase() || '';
              return name === '1X2' || name === 'MATCH RESULT' || name === 'MATCH WINNER' || name === 'RÉSULTAT DU MATCH' || name === 'VAINQUEUR DU MATCH' || mk.id === '1' || mk.id === 1;
            }) || m.markets?.find((mk: any) => {
              const name = mk.name?.toUpperCase() || '';
              return name === '1X2' || name === 'MATCH RESULT' || name === 'MATCH WINNER' || name === 'RÉSULTAT DU MATCH' || name === 'VAINQUEUR DU MATCH' || mk.id === '1' || mk.id === 1;
            }) || m.eventBetType || m.odds1x2;
            
            if (!odds1x2) {
              const anyOdds = m.odds || m.marketOdds || m.outcomes || m.preMatchOdds || [];
              if (Array.isArray(anyOdds) && anyOdds.length >= 3) {
                odds1 = anyOdds[0]?.odds?.toString() || anyOdds[0]?.price?.toString() || anyOdds[0]?.value?.toString() || anyOdds[0]?.toString() || '-';
                oddsX = anyOdds[1]?.odds?.toString() || anyOdds[1]?.price?.toString() || anyOdds[1]?.value?.toString() || anyOdds[1]?.toString() || '-';
                odds2 = anyOdds[2]?.odds?.toString() || anyOdds[2]?.price?.toString() || anyOdds[2]?.value?.toString() || anyOdds[2]?.toString() || '-';
              } else if (m.odds && typeof m.odds === 'object' && m.odds.home && m.odds.draw && m.odds.away) {
                odds1 = m.odds.home.toString();
                oddsX = m.odds.draw.toString();
                odds2 = m.odds.away.toString();
              } else if (m.preMatchOdds && typeof m.preMatchOdds === 'object' && m.preMatchOdds['1'] && m.preMatchOdds['X'] && m.preMatchOdds['2']) {
                odds1 = m.preMatchOdds['1'].toString();
                oddsX = m.preMatchOdds['X'].toString();
                odds2 = m.preMatchOdds['2'].toString();
              } else if (m.odds && typeof m.odds === 'object' && m.odds['1'] && m.odds['X'] && m.odds['2']) {
                odds1 = m.odds['1'].toString();
                oddsX = m.odds['X'].toString();
                odds2 = m.odds['2'].toString();
              }
            } else {
              const items = odds1x2.eventBetTypeItems || odds1x2.outcomes || odds1x2.items || odds1x2.outcomes || [];
              const findOdds = (names: string[]) => {
                const item = items.find((o: any) => 
                  names.some(n => 
                    (o.shortName && o.shortName.toLowerCase() === n.toLowerCase()) || 
                    (o.name && o.name.toLowerCase() === n.toLowerCase()) || 
                    (o.outcomeName && o.outcomeName.toLowerCase() === n.toLowerCase()) ||
                    (o.outcome && o.outcome.toLowerCase() === n.toLowerCase()) ||
                    (o.id && String(o.id) === n)
                  )
                );
                return item?.odds?.toString() || item?.price?.toString() || item?.value?.toString() || item?.rate?.toString() || '-';
              };
              odds1 = findOdds(['1', 'Home', 'Domicile', '1X2_1', '1X2_HOME']);
              oddsX = findOdds(['X', 'Draw', 'Nul', '1X2_2', '1X2_DRAW']);
              odds2 = findOdds(['2', 'Away', 'Extérieur', '1X2_3', '1X2_AWAY']);
            }

            // Attribution des rangs (0 si début de saison)
            const homeRank = rankDict[homeStr] || 0;
            const awayRank = rankDict[awayStr] || 0;

            // Collect all markets for "33 markets" requirement
            const extractAllOdds = (match: any) => {
              const oddsObj: Record<string, any> = {};
              const markets = match.eventBetTypes || match.markets || match.odds || [];
              if (Array.isArray(markets)) {
                markets.forEach((mk: any) => {
                  const mName = mk.name || mk.id || mk.marketName || 'Unknown';
                  const items = mk.eventBetTypeItems || mk.outcomes || mk.items || mk.odds || [];
                  if (Array.isArray(items)) {
                    oddsObj[mName] = items.map((o: any) => ({
                      name: o.name || o.shortName || o.outcomeName || o.outcome || o.id || o.label,
                      odds: (o.odds || o.price || o.value || o.rate || o.odd)?.toString()
                    }));
                  }
                });
              }
              return oddsObj;
            };

            const allOdds = extractAllOdds(m);
            const rStart = r.expectedStart && !String(r.expectedStart).startsWith('0001') ? r.expectedStart : undefined;
            const mStart = m.expectedStart && !String(m.expectedStart).startsWith('0001') ? m.expectedStart : rStart;
            const finalExpectedStart = mStart ? String(mStart) : new Date().toISOString();

            const homeForm = getTeamStatsFromRankings(homeStr) || undefined;
            const awayForm = getTeamStatsFromRankings(awayStr) || undefined;

            newMatches.push({
              id, homeTeam: homeStr, awayTeam: awayStr,
              odds1, oddsX, odds2,
              allOdds,
              homeRank, awayRank,
              status: 'pending',
              apiId: m.id || m.eventId || m.matchId,
              eventCategoryId: m.eventCategoryId || m.EventCategoryID || r.eventCategoryId || r.EventCategoryID || newCategoryId,
              updatedAt: new Date(),
              round,
              expectedStart: finalExpectedStart,
              homeFormWDLPct: homeForm,
              awayFormWDLPct: awayForm
            });
          });
        });

        if (detectedSeason && detectedSeason !== currentSeason) {
          setCurrentSeason(detectedSeason);
          addLog(`Nouvelle saison détectée : ${detectedSeason}`, 'info');
        }

        if (newMatches.length > 0) {
          const actuallyNew = newMatches.filter(m => {
            const isPending = pendingRef.current.has(m.id);
            const isFinished = finishedRef.current.some(fm => fm.id === m.id);
            return !isPending && !isFinished;
          });
          
          if (actuallyNew.length > 0) {
            setPendingMatches(prev => {
              const newMap = new Map(prev);
              actuallyNew.forEach(match => {
                newMap.set(match.id, match);
              });
              return newMap;
            });
            
            addLog(`${actuallyNew.length} nouveau(x) match(s) détecté(s)`, 'info');
          }
        }
      }
    } catch (error: any) {
      if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
        return;
      }
      const msg = error.message || 'Erreur inconnue';
      addLog(`Erreur lors de la récupération des matchs: ${msg}`, 'error');
    }
  };

  // Fonction pour récupérer les scores (Boucle 3s) - OPTIMISÉE AVEC PLAYOUT API
  const fetchResults = async () => {
    if (!activeRef.current || isWaitingRef.current || pendingRef.current.size === 0) return;

    try {
      // 1. Identifier les rounds uniques et les éventuelles catégories des matchs en attente
      const roundsToFetch = new Set<number>();
      pendingRef.current.forEach(m => {
        if (m.round) roundsToFetch.add(m.round);
      });

      const eventCategoryId = lastCategoryIdRef.current;
      const parentCategoryId = leagueIdRef.current;

      if (!eventCategoryId || roundsToFetch.size === 0) {
        // Fallback sur l'API standard si on n'a pas les IDs nécessaires
        return await fetchResultsStandard();
      }

      const finishedUpdates: ExtractedMatch[] = [];

      // 2. Pour chaque round, appeler l'API de Playout accélérée
      for (const roundNum of Array.from(roundsToFetch)) {
        // Déterminer la catégorie spécifique pour ce round si possible
        let roundCatId = eventCategoryId;
        const pendingInRound = Array.from(pendingRef.current.values()).filter(m => m.round === roundNum);
        const matchWithCatId = pendingInRound.find(m => m.eventCategoryId);
        if (matchWithCatId?.eventCategoryId) roundCatId = matchWithCatId.eventCategoryId;

        const playoutData = await fetchRoundPlayout(roundNum, roundCatId, parentCategoryId);
        if (!playoutData || !playoutData.matches) {
          continue;
        }

        playoutData.matches.forEach((apiMatch: any) => {
          // Trouver le match correspondant dans notre liste pending via l'apiId ou id
          const pendingMatch = pendingInRound.find(pm => 
            (pm.apiId && String(pm.apiId) === String(apiMatch.id)) || 
            (pm.id && pm.id.includes(String(apiMatch.id))) ||
            (String(pm.id) === String(apiMatch.id))
          );

          if (pendingMatch) {
            const goals = apiMatch.goals || [];
            // OPTIMISATION : Si le match est dans Playout avec goals OU expectedStart reset, il est fini virtuellement
            const isFinishedVirtually = goals.length > 0 || apiMatch.expectedStart === "0001-01-01T00:00:00Z";
            
            if (isFinishedVirtually) {
              const lastGoal = goals.length > 0 ? goals[goals.length - 1] : null;
              const hScore = lastGoal ? lastGoal.homeScore : 0;
              const aScore = lastGoal ? lastGoal.awayScore : 0;

              // Déduction du résultat
              let result: '1' | 'X' | '2' = 'X';
              if (hScore > aScore) result = '1';
              else if (aScore > hScore) result = '2';

              const scoreDetails = {
                homeGoals: goals.filter((g: any) => {
                  const idx = goals.indexOf(g);
                  const prevGoal = idx > 0 ? goals[idx - 1] : null;
                  return g.homeScore > (prevGoal ? prevGoal.homeScore : 0);
                }).map((g: any) => ({ minute: String(g.minute), player: 'Buteur' })),
                awayGoals: goals.filter((g: any) => {
                  const idx = goals.indexOf(g);
                  const prevGoal = idx > 0 ? goals[idx - 1] : null;
                  return g.awayScore > (prevGoal ? prevGoal.awayScore : 0);
                }).map((g: any) => ({ minute: String(g.minute), player: 'Buteur' }))
              };

              finishedUpdates.push({
                ...pendingMatch,
                status: 'finished',
                score: `${hScore}-${aScore}`,
                scoreDetails,
                result,
                updatedAt: new Date()
              });
            }
          }
        });
      }

      if (finishedUpdates.length > 0) {
        applyFinishedUpdates(finishedUpdates);
      }
    } catch (error) {
      console.error('[Playout] Fetch Error:', error);
      fetchResultsStandard();
    }
  };

  const fetchResultsStandard = async () => {
    try {
      const ts = Date.now();
      const response = await fetchWithRetry(`/api/data/league/results/${leagueIdRef.current}?skip=0&take=200&_t=${ts}`);
      if (!response.ok) return;
      const data = await response.json();
      const roundsArray = data?.rounds || (Array.isArray(data) ? data : []);
      
      const finishedUpdates: ExtractedMatch[] = [];
      roundsArray.forEach((roundData: any) => {
        const matchesInRound = Array.isArray(roundData.matches) ? roundData.matches : (Array.isArray(roundData) ? roundData : [roundData]);
        matchesInRound.forEach((m: any) => {
          if (!m || !m.homeTeam) return;
          const home = m.homeTeam?.name || m.homeTeam?.teamName || m.homeTeam || 'Unknown';
          const away = m.awayTeam?.name || m.awayTeam?.teamName || m.awayTeam || 'Unknown';
          const homeStr = typeof home === 'string' ? home : JSON.stringify(home);
          const awayStr = typeof away === 'string' ? away : JSON.stringify(away);
          const round = roundData.roundNumber || roundData.round || m.round || 0;
          const seasonIdOrEventCategoryId = m.eventCategoryId || m.EventCategoryID || roundData.eventCategoryId || roundData.EventCategoryID || m.seasonId || m.season || roundData.seasonId || roundData.season || '';
          const season = seasonIdOrEventCategoryId ? (String(seasonIdOrEventCategoryId).startsWith('ID:') ? String(seasonIdOrEventCategoryId) : `ID: ${seasonIdOrEventCategoryId}`) : '';
          const id = generateMatchId(leagueIdRef.current, season, round, homeStr, awayStr);

          if (pendingRef.current.has(id)) {
            let hScoreRaw = m.homeScore;
            let aScoreRaw = m.awayScore;
            if (m.score) {
              const separator = m.score.includes(':') ? ':' : '-';
              hScoreRaw = m.score.split(separator)[0];
              aScoreRaw = m.score.split(separator)[1];
            }
            const homeScoreStr = String(hScoreRaw ?? '');
            const awayScoreStr = String(aScoreRaw ?? '');
            const hasScore = homeScoreStr.trim() !== '' && awayScoreStr.trim() !== '' && homeScoreStr !== 'undefined' && awayScoreStr !== 'undefined' && homeScoreStr !== '-';

            if (hasScore) {
              const hScore = parseInt(homeScoreStr);
              const aScore = parseInt(awayScoreStr);
              let result: '1' | 'X' | '2' = 'X';
              if (hScore > aScore) result = '1';
              else if (aScore > hScore) result = '2';

              finishedUpdates.push({
                ...pendingRef.current.get(id)!,
                status: 'finished',
                score: `${hScore}-${aScore}`,
                scoreDetails: { homeGoals: m.homeGoals || [], awayGoals: m.awayGoals || [] },
                result,
                updatedAt: new Date()
              });
            }
          }
        });
      });
      if (finishedUpdates.length > 0) applyFinishedUpdates(finishedUpdates);
    } catch (err) {
      console.error('Standard fetch results failed:', err);
    }
  };

  const applyFinishedUpdates = (finishedUpdates: ExtractedMatch[]) => {
    const enrichedUpdates = finishedUpdates.map(m => ({
      ...m,
      homeFormWDLPct: getTeamStatsFromRankings(m.homeTeam) || undefined,
      awayFormWDLPct: getTeamStatsFromRankings(m.awayTeam) || undefined
    }));

    setPendingMatches(prev => {
      const newMap = new Map(prev);
      enrichedUpdates.forEach(match => newMap.delete(match.id));
      
      // Sauvegarde immédiate du nouvel état (pending restant + nouveaux finis)
      const pendingArray = Array.from(newMap.values());
      const allToSave = pendingArray.concat(enrichedUpdates).map(m => {
        const separator = m.score?.includes(':') ? ':' : '-';
        const [hS, aS] = (m.score || '-').split(separator);
        return {
          leagueId: leagueIdRef.current,
          eventCategoryId: m.eventCategoryId,
          season: currentSeason || new Date().toISOString().split('T')[0],
          round: m.round || 0,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeScore: hS,
          awayScore: aS,
          scoreDetails: m.scoreDetails,
          status: m.status === 'finished' ? 'Finished' : 'Upcoming',
          odds1: m.odds1,
          oddsX: m.oddsX,
          odds2: m.odds2,
          allOdds: m.allOdds,
          expectedStart: String(m.expectedStart || m.updatedAt.toISOString()),
          apiId: m.apiId,
          updatedAt: new Date().toISOString(),
          homeFormWDLPct: m.homeFormWDLPct || getTeamStatsFromRankings(m.homeTeam) || undefined,
          awayFormWDLPct: m.awayFormWDLPct || getTeamStatsFromRankings(m.awayTeam) || undefined
        };
      });
      saveMatchesToLocal(allToSave as any).catch(err => console.error('[LocalSave] Error:', err));
      
      return newMap;
    });
    
    setFinishedMatches(prev => {
      const combined = [...enrichedUpdates, ...prev];
      const uniqueMap = new Map();
      combined.forEach(m => {
        if (!uniqueMap.has(m.id)) uniqueMap.set(m.id, m);
      });
      return Array.from(uniqueMap.values());
    });
    
    if (onMatchesFinished) onMatchesFinished(enrichedUpdates);

    enrichedUpdates.forEach(match => {
      addLog(`[PLAYOUT] Score extrait : ${match.homeTeam} ${match.score} ${match.awayTeam}`, 'success');
    });
  };

  // --- GESTION DES BOUCLES ---
  useEffect(() => {
    let matchInterval: NodeJS.Timeout;
    let resultInterval: NodeJS.Timeout;
    let countdownInterval: NodeJS.Timeout;

    if (isActive) {
      if (isWaitingForNextSeason) {
        addLog('Attente de la prochaine saison (1 min)...', 'info');
        setCountdown(60); // 1 minute = 60 secondes
        
        countdownInterval = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              setIsWaitingForNextSeason(false);
              addLog('Fin de l\'attente, reprise de l\'extraction.', 'success');
              // On réinitialise pour la nouvelle saison
              setPendingMatches(new Map());
              setFinishedMatches([]);
              setCurrentSeason(null);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        addLog('Démarrage de l\'extraction...', 'info');
        
        // Exécution immédiate
        fetchMatches();
        fetchResults();
        
        // Boucle des Matchs (15s) - Plus rapide pour détecter les nouveaux rounds
        matchInterval = setInterval(() => {
          fetchMatches();
        }, 15000);

        // Boucle des Scores (0.5s) - Utilisation ultra-rapide de Playout
        resultInterval = setInterval(() => {
          fetchResults();
        }, 500);
      }
    } else {
      if (logs.length > 0) addLog('Extraction arrêtée', 'warning');
      setIsWaitingForNextSeason(false);
      setCountdown(0);
    }

    return () => {
      clearInterval(matchInterval);
      clearInterval(resultInterval);
      clearInterval(countdownInterval);
    };
  }, [isActive, isWaitingForNextSeason]);

  // Fonction pour synchroniser avec la BD
  const handleSyncToDB = useCallback(async () => {
    if (finishedMatches.length === 0 && pendingMatches.size === 0) return;
    
    setSyncMessage("Synchronisation avec la base de données...");
    
    try {
      const allMatches = [
        ...finishedMatches,
        ...Array.from(pendingMatches.values())
      ];

      const matchesToSave = allMatches.map(m => {
        let homeScore = null;
        let awayScore = null;
        
        if (m.score) {
          const separator = m.score.includes(':') ? ':' : '-';
          homeScore = m.score.split(separator)[0];
          awayScore = m.score.split(separator)[1];
        }
        
        return {
          id: m.id,
          leagueId: leagueIdRef.current,
          eventCategoryId: m.eventCategoryId,
          season: currentSeason || new Date().toISOString().split('T')[0],
          round: m.round || 0,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          expectedStart: String(m.expectedStart || m.updatedAt.toISOString()),
          odds1: m.odds1,
          oddsX: m.oddsX,
          odds2: m.odds2,
          allOdds: m.allOdds,
          homeScore,
          awayScore,
          scoreDetails: m.scoreDetails,
          homeRank: m.homeRank || null,
          awayRank: m.awayRank || null,
          homePoints: null,
          awayPoints: null,
          status: m.status === 'finished' ? 'Finished' : 'Upcoming',
          updatedAt: new Date().toISOString(),
          homeFormWDLPct: m.homeFormWDLPct || getTeamStatsFromRankings(m.homeTeam) || undefined,
          awayFormWDLPct: m.awayFormWDLPct || getTeamStatsFromRankings(m.awayTeam) || undefined
        };
      });

      // Save to Local Storage as well
      await saveMatchesToLocal(matchesToSave as any);

      setSyncMessage("Données sauvegardées localement !");
      addLog(`${matchesToSave.length} matchs sauvegardés dans la base locale`, 'success');
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (error: any) {
      console.error('Sync error:', error);
      setSyncMessage("Erreur lors de la synchronisation");
      addLog(`Erreur synchronisation : ${error.message}`, 'error');
      setTimeout(() => setSyncMessage(null), 5000);
    }
  }, [finishedMatches, pendingMatches, currentSeason, leagueId]);

  const handleExportPDF = useCallback(() => {
    if (finishedMatches.length === 0) return;

    const doc = new jsPDF();
    
    // Titre
    doc.setFontSize(18);
    doc.text('Rapport des Matchs Terminés', 14, 22);
    
    // Date
    doc.setFontSize(11);
    doc.text(`Date d'extraction : ${new Date().toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo' })}`, 14, 30);

    // Préparation des données pour le tableau
    const tableData = [...finishedMatches]
      .sort((a, b) => (b.round || 0) - (a.round || 0))
      .map(m => {
        const matchDate = parseMatchDate(m.expectedStart) || m.updatedAt;
        
        // Formulate NVD strings from saved percentages or fallbacks
        const hForm = m.homeFormWDLPct || getTeamStatsFromRankings(m.homeTeam);
        const aForm = m.awayFormWDLPct || getTeamStatsFromRankings(m.awayTeam);

        const hFormStr = hForm ? `${hForm.v}/${hForm.n}/${hForm.d}% (${hForm.played}m)` : '-';
        const aFormStr = aForm ? `${aForm.v}/${aForm.n}/${aForm.d}% (${aForm.played}m)` : '-';

        return [
          `Journée ${m.round || '-'}`,
          matchDate ? matchDate.toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-',
          `${m.homeTeam} (#${m.homeRank})\nNVD: ${hFormStr}`,
          m.score || '-',
          `${m.awayTeam} (#${m.awayRank})\nNVD: ${aFormStr}`,
          m.result || '-',
          `${m.odds1} | ${m.oddsX} | ${m.odds2}`
        ];
      });

    // Génération du tableau
    autoTable(doc, {
      startY: 36,
      head: [['Journée', 'Date/Heure', 'Domicile', 'Score', 'Extérieur', 'Résultat', 'Cotes (1|X|2)']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [79, 70, 229] }, // Indigo 600
      columnStyles: {
        2: { halign: 'left' },
        4: { halign: 'right' }
      }
    });

    // Sauvegarde
    doc.save(`matchs_termines_${new Date().toISOString().split('T')[0]}.pdf`);
    addLog('Rapport PDF exporté automatiquement.', 'success');
  }, [finishedMatches]);

  // Surveillance de la fin de saison
  useEffect(() => {
    if (!isActive || isWaitingForNextSeason) return;

    const leagueInfo = LEAGUES.find(l => l.id === leagueIdRef.current);
    if (!leagueInfo) return;

    const totalTarget = leagueInfo.rounds * leagueInfo.matchesPerRound;
    
    // Si on a atteint le nombre de matchs cibles et qu'il n'y a plus de matchs en attente
    if (finishedMatches.length >= totalTarget && pendingMatches.size === 0) {
      addLog(`Saison terminée (${finishedMatches.length} matchs).`, 'success');
      
      // Synchronisation automatique avant de passer à l'attente
      const autoSyncAndWait = async () => {
        try {
          addLog('Synchronisation automatique des données de la saison...', 'info');
          await handleSyncToDB();
          addLog('Synchronisation terminée avec succès.', 'success');
          
          // Export PDF automatique
          addLog('Génération automatique du rapport PDF...', 'info');
          handleExportPDF();
        } catch (err) {
          addLog('Erreur lors de la synchronisation automatique.', 'error');
          console.error('Auto-sync error:', err);
        } finally {
          setIsWaitingForNextSeason(true);
        }
      };
      
      autoSyncAndWait();
    }
  }, [finishedMatches.length, pendingMatches.size, isActive, isWaitingForNextSeason, handleSyncToDB, handleExportPDF]);

  const handleReset = () => {
    setPendingMatches(new Map());
    setFinishedMatches([]);
    setLogs([]);
    setCurrentSeason(null);
    setIsWaitingForNextSeason(false);
    setCountdown(0);
    addLog('Opération réinitialisée.', 'info');
  };

  // --- UI RENDER ---
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-slate-200 font-sans max-w-5xl mx-auto my-4 shadow-2xl">
      {/* HEADER */}
      <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6 text-indigo-500" />
            <img 
               src={getLeagueFlag(LEAGUES.find(l => l.id === leagueId)?.country)} 
               alt="" 
               className="w-5 h-4 object-contain"
               onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Moteur d'Extraction</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            {isActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isActive ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
          </span>
          <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">
            {isActive ? 'ON (Extraction en cours)' : 'OFF (En pause)'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
        
        {/* COLONNE GAUCHE : Contrôles & Stats */}
        <div className="space-y-6">
          
          {/* 2. Contrôles */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Contrôle
            </h3>
            
            {isWaitingForNextSeason && (
              <div className="mb-4 p-3 bg-indigo-900/30 border border-indigo-500/50 rounded-lg text-center">
                <div className="text-[10px] text-indigo-400 uppercase font-bold mb-1">Prochaine saison dans</div>
                <div className="text-2xl font-black text-indigo-300">
                  {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    localStorage.removeItem('mahakasa_reset_pending');
                    setIsActive(true);
                  }}
                  disabled={isActive}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" /> Démarrer
                </button>
                <button
                  onClick={() => setIsActive(false)}
                  disabled={!isActive}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
                >
                  <Square className="w-4 h-4" /> Arrêter
                </button>
              </div>
              
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleReset}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold py-2.5 px-4 rounded flex items-center justify-center gap-2 transition-colors uppercase tracking-widest"
                >
                  <List className="w-4 h-4" /> Reset Session
                </button>
              </div>
            </div>
            
            {syncMessage && (
              <div className={`mt-3 p-2 rounded text-[10px] font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-1 ${
                syncMessage.includes('Erreur') ? 'bg-rose-900/20 text-rose-400 border border-rose-900/50' : 'bg-emerald-900/20 text-emerald-400 border border-emerald-900/50'
              }`}>
                {syncMessage.includes('Erreur') ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {syncMessage}
              </div>
            )}
          </div>

          {/* Stats Rapides */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 text-center">
              <div className="text-2xl font-black text-amber-400">{pendingMatches.size}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">En attente</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 text-center">
              <div className="text-2xl font-black text-emerald-400">{finishedMatches.length}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Terminés</div>
            </div>
          </div>

        </div>

        {/* COLONNE CENTRALE : Logs en temps réel */}
        <div className="bg-slate-950 rounded-lg border border-slate-800 flex flex-col h-[400px]">
          <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slate-900/50">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Activité en temps réel</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs custom-scrollbar">
            {logs.length === 0 ? (
              <div className="text-slate-600 text-center mt-10">En attente de démarrage...</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="flex gap-3">
                  <span className="text-slate-600 shrink-0">
                    [{log.time.toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]
                  </span>
                  <span className={`
                    ${log.type === 'info' ? 'text-blue-400' : ''}
                    ${log.type === 'success' ? 'text-emerald-400' : ''}
                    ${log.type === 'warning' ? 'text-amber-400' : ''}
                    ${log.type === 'error' ? 'text-rose-400' : ''}
                  `}>
                    {typeof log.message === 'string' ? log.message : JSON.stringify(log.message)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLONNE DROITE : Derniers Matchs */}
        <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 flex flex-col h-[400px]">
          <div className="p-3 border-b border-slate-700/50 flex items-center gap-2 bg-slate-800/50">
            <List className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Derniers Matchs Extraits</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2">
            
            {/* Affichage des derniers matchs en attente groupés par round */}
            {(() => {
              const pendingArray = Array.from(pendingMatches.values());
              const grouped = pendingArray.reduce((acc, match) => {
                const r = match.round || 0;
                if (!acc[r]) acc[r] = [];
                acc[r].push(match);
                return acc;
              }, {} as Record<number, ExtractedMatch[]>);

              const leagueInfo = LEAGUES.find(l => l.id === leagueIdRef.current);
              const targetMatches = leagueInfo?.matchesPerRound || 10;

              return Object.entries(grouped)
                .sort(([a], [b]) => Number(b) - Number(a)) // Sort rounds descending
                .map(([round, matches]) => (
                  <div key={`pending-round-${round}`} className="mb-4">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 bg-slate-800/80 p-1.5 rounded flex justify-between items-center">
                      <span>Journée {round}</span>
                      <span className="text-[10px] bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded">
                        {matches.length}/{targetMatches} matchs
                      </span>
                    </div>
                    <div className="space-y-2">
                      {matches.map(match => {
                        const matchDate = parseMatchDate(match.expectedStart) || match.updatedAt;
                        const hForm = getTeamStatsFromRankings(match.homeTeam);
                        const aForm = getTeamStatsFromRankings(match.awayTeam);

                        return (
                        <div key={match.id} className="bg-slate-800 p-2 rounded border border-amber-500/30">
                          {matchDate && (
                            <div className="text-[9px] text-slate-400 mb-1 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {matchDate.toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                          <div className="flex justify-between items-center text-sm font-bold">
                            <span className="truncate flex items-center gap-1.5 flex-1 min-w-0">
                              <img 
                                src={getTeamLogo(match.homeTeam)} 
                                alt="" 
                                className="w-4 h-4 object-contain shrink-0" 
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="truncate">{match.homeTeam}</span>
                                {hForm && (
                                  <div className="flex gap-1 text-[9px] font-bold leading-tight">
                                    <span className="text-emerald-500">{hForm.v}%</span>
                                    <span className="text-amber-500">{hForm.n}%</span>
                                    <span className="text-rose-500">{hForm.d}%</span>
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 shrink-0">#{match.homeRank}</span>
                            </span>
                            <span className="text-slate-500 mx-2 shrink-0">vs</span>
                            <span className="truncate flex items-center gap-1.5 flex-1 justify-end min-w-0">
                              <span className="text-[10px] text-slate-500 shrink-0">#{match.awayRank}</span>
                              <div className="flex flex-col items-end min-w-0">
                                <span className="truncate text-right">{match.awayTeam}</span>
                                {aForm && (
                                  <div className="flex gap-1 text-[9px] font-bold leading-tight">
                                    <span className="text-emerald-500">{aForm.v}%</span>
                                    <span className="text-amber-500">{aForm.n}%</span>
                                    <span className="text-rose-500">{aForm.d}%</span>
                                  </div>
                                )}
                              </div>
                              <img 
                                src={getTeamLogo(match.awayTeam)} 
                                alt="" 
                                className="w-4 h-4 object-contain shrink-0" 
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                              />
                            </span>
                          </div>
                          <div className="flex justify-between mt-2 text-[10px] text-slate-400 bg-slate-900 p-1 rounded">
                            <span>1: {match.odds1}</span>
                            <span>X: {match.oddsX}</span>
                            <span>2: {match.odds2}</span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ));
            })()}

            {/* Liste des matchs terminés groupés par round */}
            {finishedMatches.length > 0 && (
              <div className="flex justify-between items-center mb-4 mt-8 border-t border-slate-800 pt-4">
                <h3 className="text-sm font-bold text-slate-300">Matchs Terminés</h3>
                <button
                  onClick={handleExportPDF}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1.5 px-3 rounded flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exporter PDF
                </button>
              </div>
            )}
            
            {(() => {
              const grouped = finishedMatches.reduce((acc, match) => {
                const r = match.round || 0;
                if (!acc[r]) acc[r] = [];
                acc[r].push(match);
                return acc;
              }, {} as Record<number, ExtractedMatch[]>);

              const leagueInfo = LEAGUES.find(l => l.id === leagueIdRef.current);
              const targetMatches = leagueInfo?.matchesPerRound || 10;

              return Object.entries(grouped)
                .sort(([a], [b]) => Number(b) - Number(a)) // Sort rounds descending
                .map(([round, matches]) => (
                  <div key={`round-${round}`} className="mb-4">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 bg-slate-800/80 p-1.5 rounded flex justify-between items-center">
                      <span>Journée {round}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${matches.length >= targetMatches ? 'bg-emerald-900/30 text-emerald-400' : 'bg-amber-900/30 text-amber-400'}`}>
                        {matches.length}/{targetMatches} matchs
                      </span>
                    </div>
                    <div className="space-y-2">
                      {matches.map(match => {
                        const matchDate = parseMatchDate(match.expectedStart) || match.updatedAt;
                        
                        const hStats = getTeamStatsFromRankings(match.homeTeam);
                        const aStats = getTeamStatsFromRankings(match.awayTeam);

                        return (
                        <div key={match.id} className="bg-slate-800/50 p-2 rounded border border-emerald-500/20">
                          {matchDate && (
                            <div className="text-[9px] text-slate-400 mb-1 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {matchDate.toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                          <div className="flex justify-between items-center text-sm font-bold">
                            <span className="truncate flex items-center gap-1.5 flex-1 min-w-0">
                              <img 
                                src={getTeamLogo(match.homeTeam)} 
                                alt="" 
                                className="w-3.5 h-3.5 object-contain shrink-0"
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="truncate">{match.homeTeam}</span>
                                {hStats && (
                                  <div className="flex gap-1 text-[9px] font-bold leading-tight">
                                    <span className="text-emerald-500">{hStats.v}%</span>
                                    <span className="text-amber-500">{hStats.n}%</span>
                                    <span className="text-rose-500">{hStats.d}%</span>
                                  </div>
                                )}
                              </div>
                              <span className="text-[11px] text-indigo-400 font-black shrink-0">#{match.homeRank}</span>
                            </span>
                            <span className="font-black text-emerald-400 px-3 bg-emerald-900/30 rounded mx-2 py-0.5 shrink-0">{match.score}</span>
                            <span className="truncate flex items-center gap-1.5 flex-1 justify-end min-w-0">
                              <span className="text-[11px] text-indigo-400 font-black shrink-0">#{match.awayRank}</span>
                              <div className="flex flex-col items-end min-w-0">
                                <span className="truncate text-right">{match.awayTeam}</span>
                                {aStats && (
                                  <div className="flex gap-1 text-[9px] font-bold leading-tight">
                                    <span className="text-emerald-500">{aStats.v}%</span>
                                    <span className="text-amber-500">{aStats.n}%</span>
                                    <span className="text-rose-500">{aStats.d}%</span>
                                  </div>
                                )}
                              </div>
                              <img 
                                src={getTeamLogo(match.awayTeam)} 
                                alt="" 
                                className="w-3.5 h-3.5 object-contain shrink-0"
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                              />
                            </span>
                          </div>
                          {/* Goal Timeline */}
                          {(match.scoreDetails?.homeGoals?.length || 0) + (match.scoreDetails?.awayGoals?.length || 0) > 0 && (
                            <div className="flex flex-wrap gap-1 justify-center mt-2 py-1 px-2 bg-slate-950/30 rounded-lg">
                              {[...(match.scoreDetails?.homeGoals?.map(g => ({ ...g, side: 'h' })) || []), 
                                ...(match.scoreDetails?.awayGoals?.map(g => ({ ...g, side: 'a' })) || [])]
                                .sort((a, b) => parseInt(a.minute) - parseInt(b.minute))
                                .map((g, gi) => (
                                  <div key={gi} className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${g.side === 'h' ? 'text-emerald-500 bg-emerald-500/5 border-emerald-500/20' : 'text-rose-500 bg-rose-500/5 border-rose-500/20'}`}>
                                     <span className="text-[11px] font-black">{g.minute}'</span>
                                  </div>
                                ))
                              }
                            </div>
                          )}
                          <div className="flex justify-between mt-1.5 text-[9px] text-slate-500 uppercase font-bold">
                            <span>Résultat: <span className="text-emerald-400">{match.result}</span></span>
                            <span>Cotes: {match.odds1} | {match.oddsX} | {match.odds2}</span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ));
            })()}

            {finishedMatches.length === 0 && pendingMatches.size === 0 && (
              <div className="text-slate-500 text-center text-sm mt-10">Aucun match traité pour le moment.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
