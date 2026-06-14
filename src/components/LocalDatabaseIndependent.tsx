import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Database, Search, ChevronRight, ChevronLeft, ChevronDown, Calendar, 
  Filter, Clock, Target, Zap, Info, Trash2, Download, Upload,
  Sparkles, FileText, X, Check, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  db, type ArchivedMatch, type ArchiveFileMeta, 
  purgeTotalDatabase, exportMatchesToJSON,
  purgeSeasonFromLocal, exportMatchesToJS,
  isPlayedMatch
} from '../services/localArchive';
import { LEAGUES } from '../shared/constants';

import { getTeamLogo, getLeagueFlag } from '../lib/logos';

function TeamBadge({ name, className = "" }: { name: string; className?: string }) {
  const [error, setError] = useState(false);
  const logoUrl = getTeamLogo(name);

  if (error || !name) {
    return (
      <div className={`w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 ${className}`}>
        <span className="text-[10px] font-bold text-slate-500">{name?.charAt(0) || '?'}</span>
      </div>
    );
  }

  return (
    <div className={`w-6 h-6 rounded-full bg-white/5 p-0.5 border border-white/10 overflow-hidden flex items-center justify-center ${className}`}>
      <img 
        src={logoUrl} 
        alt={name}
        className="w-full h-full object-contain"
        onError={() => setError(true)}
      />
    </div>
  );
}

function RenderFormSequence({ sequence, align = 'start' }: { sequence?: string[]; align?: 'start' | 'end' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  if (!sequence || sequence.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (containerRef.current) {
      const scrollAmount = 60;
      containerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    startX.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeft.current = containerRef.current.scrollLeft;
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    containerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  return (
    <div className={`flex items-center mt-1 group/scroll relative max-w-full ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      
      {/* Scroll Left Button - Hover Absolute Floating overlay */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          scroll('left');
        }}
        className="absolute -left-2.5 top-1/2 -translate-y-1/2 z-20 w-4 h-4 bg-indigo-600 border border-indigo-500 text-white rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 scale-90 hover:scale-110 active:scale-95 opacity-0 group-hover/scroll:opacity-100 shadow-md shadow-indigo-900/30"
        title="Précédent"
      >
        <ChevronLeft className="w-2.5 h-2.5 stroke-[3px]" />
      </button>

      {/* Container with smooth scroll and mouse-drag */}
      <div className="relative flex items-center max-w-[145px] sm:max-w-[200px] overflow-hidden rounded-md px-1 py-0.5">
        
        {/* Ambient indicator gradient fades masking content offscreen */}
        <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-[#0d122b]/40 to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-2.5 bg-gradient-to-l from-[#0d122b]/40 to-transparent pointer-events-none z-10" />

        <div 
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          className={`flex items-center gap-0.5 overflow-x-auto no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing select-none ${isDragging ? 'scroll-auto' : ''}`}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {sequence.map((res: string, i: number) => {
            const label = res === 'Won' ? 'V' : res === 'Lost' ? 'D' : 'N';
            return (
              <div 
                key={i} 
                className={`w-3.5 h-3.5 text-[7px] rounded-[3px] shrink-0 font-black text-white flex items-center justify-center pointer-events-auto transition-transform duration-200 select-none hover:scale-115 active:scale-90 cursor-help ${
                  res === 'Won' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm shadow-emerald-500/20' :
                  res === 'Lost' ? 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-sm shadow-rose-500/20' :
                  'bg-gradient-to-br from-slate-500 to-slate-700 shadow-sm shadow-slate-600/10'
                }`} 
                title={`Match ${i+1}: ${res === 'Won' ? 'Victoire (V)' : res === 'Lost' ? 'Défaite (D)' : 'Nul (N)'}`}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scroll Right Button - Hover Absolute Floating overlay */}
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          scroll('right');
        }}
        className="absolute -right-2.5 top-1/2 -translate-y-1/2 z-20 w-4 h-4 bg-indigo-600 border border-indigo-500 text-white rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 scale-90 hover:scale-110 active:scale-95 opacity-0 group-hover/scroll:opacity-100 shadow-md shadow-indigo-900/30"
        title="Suivant"
      >
        <ChevronRight className="w-2.5 h-2.5 stroke-[3px]" />
      </button>

    </div>
  );
}

function SyncSessionList({ onDataChange }: { onDataChange: () => void }) {
  const [sessions, setSessions] = useState<ArchiveFileMeta[]>([]);

  const loadSessions = async () => {
    const data = await db.files.toArray();
    setSessions(data.sort((a, b) => (b.syncedAt || 0) - (a.syncedAt || 0)));
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const deleteSession = async (driveFileId: string, name: string) => {
    if (confirm(`Voulez-vous supprimer l'archive "${name}" ?\n\nSouhaitez-vous aussi supprimer TOUS les matchs qui ont été extraits de ce fichier ?`)) {
      try {
        await db.transaction('rw', db.matches, db.files, async () => {
          // Optimized: Delete all matches that originated from this file directly
          const deletedMatchesCount = await db.matches.where('sourceFileId').equals(driveFileId).delete();
          console.log(`[Archive] Deleted ${deletedMatchesCount} matches from session ${driveFileId}`);
          
          // Delete the file record itself
          await db.files.delete(driveFileId);
        });
        
        await loadSessions();
        onDataChange();
      } catch (err) {
        console.error('Erreur suppression session:', err);
      }
    }
  };

  if (sessions.length === 0) return null;

  return (
    <div className="space-y-2 mt-2">
      {sessions.map((s) => (
        <div key={s.driveFileId} className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800/50 group">
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-[10px] font-black text-slate-300 truncate">{s.name}</span>
            <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">
              Sync: {new Date(s.syncedAt).toLocaleDateString()}
            </span>
          </div>
          <button 
            onClick={() => deleteSession(s.driveFileId, s.name)}
            className="shrink-0 p-1.5 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
            title="Supprimer la session sync"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

const MARKET_GROUPS: Record<string, string[]> = {
  "Gagnant & Chance": ["1X2", "Double Chance", "Draw No Bet", "Handicap", "Asian Handicap"],
  "Buts & Scores": ["Over/Under", "Both Teams to Score", "Correct Score", "Score Exact", "Exact Goals", "Total Goals", "Goal Line"],
  "Mi-temps / Fin": ["1st Half", "2nd Half", "Half Time/Full Time", "Mi-Temps"],
  "Stats & Spéciaux": ["Corner", "Card", "Booking", "Penalty", "Cartons", "Corners"],
};



export default function LocalDatabaseIndependent() {
  const [activeLeague, setActiveLeague] = useState(LEAGUES[0].id);
  const [matches, setMatches] = useState<ArchivedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  
  const [isCleaning, setIsCleaning] = useState(false);
  const [expandedRounds, setExpandedRounds] = useState<Record<number, boolean>>({});

  // Single Portal View Control for Imported Matches
  const [viewPortalMode, setViewPortalMode] = useState<'all' | 'imported'>('all');
  const [totalImportedCount, setTotalImportedCount] = useState<number>(0);

  const loadGlobalImportedCount = async () => {
    try {
      const allImported = await db.matches.filter(m => m.isImported === true || !!m.sourceFileId).count();
      setTotalImportedCount(allImported);
    } catch (e) {
      console.warn("Could not query imported count:", e);
    }
  };

  useEffect(() => {
    loadGlobalImportedCount();
  }, [matches]);

  // States for Advanced Data Exchange Portal
  const [showIOModal, setShowIOModal] = useState(false);
  const [modalLeagueExport, setModalLeagueExport] = useState<number | 'all'>('all');
  const [modalFormatExport, setModalFormatExport] = useState<'js' | 'json'>('js');
  
  // Custom states for interactive imports
  const [importStatus, setImportStatus] = useState<{
    state: 'idle' | 'parsing' | 'validated' | 'success' | 'error';
    message: string;
    count?: number;
    detectedLeagues?: string[];
    matchesData?: ArchivedMatch[];
  }>({ state: 'idle', message: '' });

  const handleExportClick = async () => {
    try {
      if (modalLeagueExport === 'all') {
        if (modalFormatExport === 'js') {
          await exportMatchesToJS(undefined, 'Toutes les Ligues');
        } else {
          await exportMatchesToJSON();
        }
      } else {
        const selectedLgObj = LEAGUES.find(l => Number(l.id) === Number(modalLeagueExport));
        const lName = selectedLgObj ? selectedLgObj.name : `Ligue_${modalLeagueExport}`;
        if (modalFormatExport === 'js') {
          await exportMatchesToJS(Number(modalLeagueExport), lName);
        } else {
          const lId = Number(modalLeagueExport);
          const filterMatches = await db.matches
            .where('leagueId')
            .anyOf([lId, String(lId)])
            .toArray();
          filterMatches.sort((a, b) => {
            if (Number(a.round || 0) !== Number(b.round || 0)) {
              return Number(a.round || 0) - Number(b.round || 0);
            }
            return new Date(a.expectedStart).getTime() - new Date(b.expectedStart).getTime();
          });
          const data = JSON.stringify(filterMatches, null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const date = new Date().toISOString().split('T')[0];
          link.href = url;
          link.download = `matches_export_${lName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${date}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Erreur de génération du fichier d'export.");
    }
  };

  const handleFileChange = async (file: File) => {
    if (!file) return;
    setImportStatus({ state: 'parsing', message: 'Analyse et décodage du fichier en cours...' });
    
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          const { parseJSOrJSONMatches } = await import('../services/localArchive');
          const parsedMatches = parseJSOrJSONMatches(text);
          
          if (!Array.isArray(parsedMatches) || parsedMatches.length === 0) {
            setImportStatus({
              state: 'error',
              message: 'Le fichier ne contient pas de tableau de matchs lisible.'
            });
            return;
          }
          
          const validated = parsedMatches.filter(m => m.homeTeam && m.awayTeam);
          const uniqueLeagueIds = Array.from(new Set(validated.map(m => Number(m.leagueId))));
          
          const leaguesNames = uniqueLeagueIds.map(id => {
            const league = LEAGUES.find(lg => Number(lg.id) === id);
            return league ? league.name : `Ligue de l'ID: ${id}`;
          });
          
          if (validated.length === 0) {
            setImportStatus({
              state: 'error',
              message: 'Aucun match structuré valide (équipes manquantes) n\'a été localisé.'
            });
          } else {
            setImportStatus({
              state: 'validated',
              message: `Fichier JS/JSON valide ! Structure lue avec succès.`,
              count: validated.length,
              detectedLeagues: leaguesNames.length > 0 ? leaguesNames : ['Indéterminée'],
              matchesData: validated
            });
          }
        } catch (err: any) {
          setImportStatus({
            state: 'error',
            message: `Erreur d'analyse: ${err.message || err}`
          });
        }
      };
      reader.onerror = () => {
        setImportStatus({ state: 'error', message: 'Impossible de lire physiquement le fichier.' });
      };
      reader.readAsText(file);
    } catch (err: any) {
      setImportStatus({ state: 'error', message: `Erreur lors de la lecture : ${err.message || err}` });
    }
  };

  const confirmImport = async () => {
    if (!importStatus.matchesData || importStatus.matchesData.length === 0) return;
    try {
      setImportStatus(prev => ({ ...prev, state: 'parsing', message: 'Calcul des indices et fusion en cours...' }));
      
      const toWrite = importStatus.matchesData.map(m => ({
        ...m,
        leagueId: Number(m.leagueId) || 0,
        round: Number(m.round) || 0,
        updatedAt: m.updatedAt || new Date().toISOString(),
        isImported: true,
        importedAt: m.importedAt || new Date().toISOString()
      }));
      
      await db.matches.bulkPut(toWrite);
      
      setImportStatus({
        state: 'success',
        message: `${toWrite.length} matchs ont été fusionnés et insérés dans votre base de données IndexedDB.`,
        count: toWrite.length
      });
      
      refreshAfterPurge();
    } catch (err: any) {
      setImportStatus({
        state: 'error',
        message: `Echec d'écriture dans Dexie : ${err.message || err}`
      });
    }
  };

  const cleanGhostDatabase = async () => {
    if (!confirm("Voulez-vous lancer la désinfection des données fantômes ?\n\nCette opération va :\n1. Éliminer/fusionner les matchs en double (même journée, saison et équipes)\n2. Corriger ou supprimer les matchs corrompus (saison invalide, sans équipes réelles ou avec des dates invalides de 1970)\n3. Retirer les matchs et matrices de compétitions obsolètes ou fantômes\n4. Nettoyer les sessions de synchronisation orphelines\n\nCette action est 100% sécurisée et améliorera considérablement les performances de votre navigateur !")) {
      return;
    }
    setIsCleaning(true);
    try {
      const allMatches = await db.matches.toArray();
      const validLeagueIds = LEAGUES.map(l => Number(l.id));
      
      const seenKeys = new Map<string, { id: string; updatedAt: string }>();
      const toDelete: string[] = [];
      let duplicatesCount = 0;
      let corruptCount = 0;
      let ghostsCount = 0;

      for (const m of allMatches) {
        const hName = m.homeTeam?.trim();
        const aName = m.awayTeam?.trim();
        const rNum = Number(m.round);
        const lId = Number(m.leagueId);

        const isGhostSeason = m.season ? (() => {
          const s = String(m.season).toLowerCase();
          return s === 'null' || s === 'undefined' || s.includes('undefined') || s.includes('null') || s.includes('1970') || s.includes('1969') || !s.trim();
        })() : true;

        const isGhostTime = (m.expectedStart && (m.expectedStart.includes('1970') || m.expectedStart.includes('1969'))) || 
                             (m.updatedAt && (m.updatedAt.includes('1970') || m.updatedAt.includes('1969')));

        // Check if data is corrupted or matches are ghosts
        const isCorrupt = !m.id || !hName || !aName || isNaN(rNum) || isNaN(lId) || !m.season || !m.expectedStart || isGhostSeason || isGhostTime;
        const isGhostLeague = !validLeagueIds.includes(lId);

        if (isCorrupt) {
          if (m.id) toDelete.push(m.id);
          corruptCount++;
          continue;
        }

        if (isGhostLeague) {
          if (m.id) toDelete.push(m.id);
          ghostsCount++;
          continue;
        }

        // Generate unique signature for duplicate checking
        const signature = `${lId}_${m.season.toLowerCase().replace(/[^a-z0-9]/gi, '_')}_r${rNum}_${hName.toLowerCase().replace(/\s+/g, '')}_vs_${aName.toLowerCase().replace(/\s+/g, '')}`;
        
        const existing = seenKeys.get(signature);
        if (existing) {
          const currTime = new Date(m.updatedAt || 0).getTime();
          const prevTime = new Date(existing.updatedAt || 0).getTime();
          if (currTime > prevTime) {
            toDelete.push(existing.id);
            seenKeys.set(signature, { id: m.id!, updatedAt: m.updatedAt || '' });
          } else {
            toDelete.push(m.id!);
          }
          duplicatesCount++;
        } else {
          seenKeys.set(signature, { id: m.id!, updatedAt: m.updatedAt || '' });
        }
      }

      if (toDelete.length > 0) {
        await db.matches.bulkDelete(toDelete);
      }

      // Also clean file meta orphans (files with 0 associated matches)
      const allFiles = await db.files.toArray();
      const filesToDelete: string[] = [];
      let fileOrphansCount = 0;

      for (const file of allFiles) {
        const associatedCount = await db.matches.where('sourceFileId').equals(file.driveFileId).count();
        if (associatedCount === 0) {
          filesToDelete.push(file.driveFileId);
          fileOrphansCount++;
        }
      }

      if (filesToDelete.length > 0) {
        await db.files.bulkDelete(filesToDelete);
      }

      // Clean ghost matrices too
      const allMatrices = await db.matrices.toArray();
      const matricesToDelete: string[] = [];
      let ghostMatricesCount = 0;

      for (const mat of allMatrices) {
        const s = String(mat.season || '').toLowerCase();
        const lId = Number(mat.leagueId);
        const isGhostSeason = s === 'null' || s === 'undefined' || s.includes('undefined') || s.includes('null') || s.includes('1970') || s.includes('1969') || !s.trim();
        const isGhostLeague = !validLeagueIds.includes(lId);

        if (isGhostSeason || isGhostLeague) {
          matricesToDelete.push(mat.id);
          ghostMatricesCount++;
        }
      }

      if (matricesToDelete.length > 0) {
        await db.matrices.bulkDelete(matricesToDelete);
      }

      // Reload matches
      const lId = Number(activeLeague);
      const remainingMatches = await db.matches
        .where('leagueId')
        .anyOf([lId, String(lId)])
        .toArray();
      setMatches(remainingMatches.filter(isPlayedMatch));

      alert(`🧹 Base de données assainie avec succès !\n\n• Doublons éliminés : ${duplicatesCount}\n• Matchs corrompus/fantômes purgés : ${corruptCount}\n• Matrices de formes fantômes purgées : ${ghostMatricesCount}\n• Ligues obsolètes nettoyées : ${ghostsCount}\n• Fichiers de sync orphelins : ${fileOrphansCount}`);
    } catch (error) {
      console.error('[Cleaner] Error cleaning database:', error);
      alert('Une erreur est survenue lors de la désinfection : ' + error);
    } finally {
      setIsCleaning(false);
    }
  };

  // Load matches
  useEffect(() => {
    const loadMatches = async () => {
      setLoading(true);
      try {
        const lId = Number(activeLeague);
        const allMatches = await db.matches
          .where('leagueId')
          .anyOf([lId, String(lId)])
          .toArray();
          
        const playedMatches = allMatches.filter(isPlayedMatch);
        setMatches(playedMatches);

        // Detect matches missing sequence and enrich them in the background
        const missingSeq = playedMatches.filter(m => !m.homeFormSequence || !m.awayFormSequence);
        if (missingSeq.length > 0) {
          const { enrichAndSaveMatches } = await import('../services/localArchive');
          enrichAndSaveMatches(playedMatches).then(async (enriched) => {
            if (enriched.length > 0) {
              await db.matches.bulkPut(enriched);
              const updatedMatches = await db.matches
                .where('leagueId')
                .anyOf([lId, String(lId)])
                .toArray();
              setMatches(updatedMatches.filter(isPlayedMatch));
            }
          }).catch(err => {
            console.warn('[Database upgrade] Automatic background enrichment failed:', err);
          });
        }
        
        // Default to most recent season that has played matches
        if (playedMatches.length > 0) {
          const availableSeasons = Array.from(new Set(playedMatches.map(m => m.season))).sort((a, b) => b.localeCompare(a));
          
          if (availableSeasons.length > 0) {
            if (!selectedSeason || !availableSeasons.includes(selectedSeason)) {
              setSelectedSeason(availableSeasons[0]);
            }
          } else {
            setSelectedSeason('');
          }
        } else {
          setSelectedSeason('');
        }
      } catch (err) {
        console.error('Failed to load local matches:', err);
      } finally {
        setLoading(false);
      }
    };
    loadMatches();
  }, [activeLeague]);

  // Derived filters - only display seasons representing played matches in the local DB
  const seasons = useMemo(() => {
    return Array.from(new Set(matches.map(m => m.season))).sort((a, b) => b.localeCompare(a));
  }, [matches]);

  const rounds = useMemo(() => {
    if (!selectedSeason) return [];
    const seasonMatches = matches.filter(m => m.season === selectedSeason);
    return Array.from(new Set(seasonMatches.map(m => m.round || 0))).sort((a, b) => a - b);
  }, [matches, selectedSeason]);

  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      const matchSearch = !searchQuery || 
        m.homeTeam.toLowerCase().includes(searchQuery.toLowerCase()) || 
        m.awayTeam.toLowerCase().includes(searchQuery.toLowerCase());

      if (viewPortalMode === 'imported') {
        const isMImported = m.isImported === true || !!m.sourceFileId;
        return isMImported && matchSearch;
      }

      const matchSeason = m.season === selectedSeason;
      const matchRound = selectedRound === 'all' || Number(m.round) === Number(selectedRound);
      return matchSeason && matchRound && matchSearch;
    }).sort((a, b) => {
      if (Number(a.round || 0) !== Number(b.round || 0)) {
        return Number(a.round || 0) - Number(b.round || 0);
      }
      return new Date(a.expectedStart).getTime() - new Date(b.expectedStart).getTime();
    });
  }, [matches, selectedSeason, selectedRound, searchQuery, viewPortalMode]);

  const groupedByRound = useMemo(() => {
    const roundsMap: Record<number, ArchivedMatch[]> = {};
    filteredMatches.forEach(match => {
      const r = Number(match.round || 0);
      if (!roundsMap[r]) {
        roundsMap[r] = [];
      }
      roundsMap[r].push(match);
    });
    return Object.entries(roundsMap)
      .map(([roundNum, list]) => ({
        round: Number(roundNum),
        matches: list
      }))
      .sort((a, b) => b.round - a.round); // highest round first
  }, [filteredMatches]);

  // Auto-expand the most recent round if user selected season but no expansion exists yet
  useEffect(() => {
    if (groupedByRound.length > 0) {
      const firstRound = groupedByRound[0].round;
      setExpandedRounds(prev => {
        // If already has expanded keys, keep them
        if (Object.keys(prev).length > 0) return prev;
        return { [firstRound]: true };
      });
    }
  }, [groupedByRound]);

  const [refreshKey] = useState(0);

  const refreshAfterPurge = async () => {
    const lId = Number(activeLeague);
    const allMatches = await db.matches
      .where('leagueId')
      .anyOf([lId, String(lId)])
      .toArray();
    setMatches(allMatches.filter(isPlayedMatch));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header & Main Tabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/5 blur-[120px] -mr-48 -mt-48 rounded-full" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-indigo-600 flex items-center justify-center rounded-2xl shadow-lg shadow-indigo-600/20">
              <Database className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tighter uppercase font-sans">Base de Données Locale</h1>
              <p className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">Explorateur de données structurées</p>
            </div>
          </div>

          <div className="flex flex-row items-center gap-3 w-full md:w-auto">
            <button
              onClick={async () => {
                const activeLgObj = LEAGUES.find(l => Number(l.id) === Number(activeLeague));
                const leagueName = activeLgObj ? activeLgObj.name : `Ligue_${activeLeague}`;
                await exportMatchesToJS(Number(activeLeague), leagueName);
              }}
              className="flex-1 md:flex-none py-3 px-5 bg-indigo-600 hover:bg-indigo-500 hover:border-indigo-400/40 text-white border border-indigo-500/10 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
              title="Exporter uniquement la ligue active au format JS"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter en JS (Ligue)</span>
            </button>

            <button
              onClick={async () => {
                await exportMatchesToJS(undefined, 'Toutes les Ligues');
              }}
              className="flex-1 md:flex-none py-3 px-5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md"
              title="Exporter l'intégralité des matchs au format JS"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Exporter en JS (Tout)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Ligues de Football - Onglets de Navigation Intelligents */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 relative overflow-hidden">
        <div className="absolute top-0 left-12 w-48 h-12 bg-indigo-500/10 blur-xl pointer-events-none" />
        
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-3 bg-indigo-500 rounded-full" />
            <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Ligues de Football</span>
          </div>
          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest block md:hidden">Glisser pour défiler ↔</span>
        </div>

        {/* Dynamic Horizontal Tabs with snap-scroll */}
        <div className="flex overflow-x-auto gap-2.5 pb-2 pt-0.5 px-0.5 custom-scrollbar scrollbar-none snap-x scroll-smooth select-none">
          {LEAGUES.map((league) => {
            const isActive = activeLeague === league.id;
            return (
              <button
                key={league.id}
                onClick={() => {
                  setActiveLeague(league.id);
                  setSelectedRound('all');
                }}
                className={`snap-center shrink-0 min-w-fit px-4.5 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2.5 border cursor-pointer ${
                  isActive 
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/35 transform -translate-y-0.5 scale-[1.02]' 
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="w-5.5 h-4 flex items-center justify-center bg-slate-900/60 rounded overflow-hidden shadow-sm shrink-0 border border-slate-800/40">
                  <img 
                    src={getLeagueFlag(league.country)} 
                    alt="" 
                    className="w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                </div>
                <div className="flex flex-col items-start leading-none gap-0.5">
                  <span className="text-[10px] font-black">{league.name}</span>
                  <span className={`text-[7px] font-medium uppercase tracking-wider ${isActive ? 'text-indigo-200' : 'text-slate-500'}`}>
                    {league.country === 'GB' ? 'Angleterre' : 
                     league.country === 'IT' ? 'Italie' : 
                     league.country === 'ES' ? 'Espagne' : 
                     league.country === 'FR' ? 'France' : 
                     league.country === 'DE' ? 'Allemagne' : 
                     league.country === 'PT' ? 'Portugal' : 
                     league.country === 'AF' ? 'Afrique' : 
                     league.country === 'EU' ? 'Europe' : 'International'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Explorer Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Sidebar Filters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-6">
              <Filter className="w-4 h-4 text-indigo-400" />
              <h3 className="text-[11px] font-black text-slate-100 uppercase tracking-widest">Filtres</h3>
            </div>

            <div className="space-y-6">
              {/* Season Selection */}
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block px-1">Saison</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select
                      value={selectedSeason}
                      onChange={(e) => {
                        setSelectedSeason(e.target.value);
                        setSelectedRound('all');
                      }}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-[11px] font-black rounded-xl px-4 py-3 pr-8 appearance-none focus:border-indigo-500 outline-none transition-all"
                    >
                      {seasons.length === 0 ? (
                        <option value="">Aucune saison</option>
                      ) : (
                        seasons.map(s => <option key={s} value={s}>{s}</option>)
                      )}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                  {selectedSeason && (
                    <button
                      onClick={async () => {
                        if (confirm(`Voulez-vous supprimer DÉFINITIVEMENT TOUS les matchs de la saison "${selectedSeason}" pour la ligue active dans votre base locale ?\n\nCette action est 100% irréversible.`)) {
                          try {
                            const res = await purgeSeasonFromLocal(Number(activeLeague), selectedSeason);
                            alert(`Succès : ${res.count} matchs de la saison "${selectedSeason}" ont été purgés de votre base locale.`);
                            
                            // Refresh matches
                            const lId = Number(activeLeague);
                            const remaining = await db.matches
                              .where('leagueId')
                              .anyOf([lId, String(lId)])
                              .toArray();
                            setMatches(remaining.filter(isPlayedMatch));
                            
                            // Select another one if available
                            const remSeasons = Array.from(new Set(remaining.filter(isPlayedMatch).map(m => m.season))).sort((a, b) => b.localeCompare(a));
                            if (remSeasons.length > 0) {
                              setSelectedSeason(remSeasons[0]);
                            } else {
                              setSelectedSeason('');
                            }
                          } catch (err: any) {
                            alert("Erreur lors de la purge de la saison : " + err.message);
                          }
                        }
                      }}
                      type="button"
                      className="px-3 bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white rounded-xl transition-all flex items-center justify-center cursor-pointer active:scale-95 shadow-md"
                      title="Purger cette saison"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Round Navigation */}
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 block px-1">Journées (Rounds)</label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => setSelectedRound('all')}
                    className={`col-span-4 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      selectedRound === 'all' 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-slate-950 border border-slate-800 text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    Toutes les Journées
                  </button>
                  {rounds.map(r => (
                    <button
                      key={r}
                      onClick={() => setSelectedRound(r)}
                      className={`py-2 px-1 rounded-lg text-[10px] font-black transition-all ${
                        selectedRound === r 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-slate-950 border border-slate-800 text-slate-500 hover:text-slate-200'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stats Box */}
              <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/50">
                <div className="text-[14px] font-black text-white">{filteredMatches.length}</div>
                <div className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Matchs affichés</div>
                <div className="h-1 bg-slate-800 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-1000" 
                    style={{ width: `${Math.min(100, (filteredMatches.length / 380) * 100)}%` }} 
                  />
                </div>
              </div>

              {/* Sync History */}
              <div className="pt-4 border-t border-slate-800/50">
                <div className="flex items-center gap-3 mb-4">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-[11px] font-black text-slate-100 uppercase tracking-widest">Sessions Sync</h3>
                </div>
                
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {matches.length > 0 ? (
                    <SyncSessionList 
                      key={refreshKey}
                      onDataChange={async () => {
                        const lId = Number(activeLeague);
                        const results = await db.matches
                          .where('leagueId')
                          .anyOf([lId, String(lId)])
                          .toArray();
                        setMatches(results.filter(isPlayedMatch));
                      }} 
                    />
                  ) : (
                    <div className="text-[9px] text-slate-600 italic uppercase">Aucune donnée localisée</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-4 border-t border-slate-800/50">
                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1 text-center">Gestion de l'Archive (Indépendant)</div>
                
                <button 
                  onClick={() => {
                    setShowIOModal(true);
                    setImportStatus({ state: 'idle', message: '' });
                  }}
                  className="flex flex-col items-center justify-center gap-2 py-4 bg-gradient-to-br from-indigo-500/10 to-emerald-500/5 hover:from-indigo-600 hover:to-emerald-600 text-indigo-400 hover:text-white rounded-2xl border border-indigo-500/20 hover:border-indigo-500/40 transition-all active:scale-95 group w-full relative overflow-hidden cursor-pointer"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 blur-xl rounded-full" />
                  <div className="relative z-10 flex flex-col items-center">
                    <Database className="w-6 h-6 mb-1 text-indigo-400 group-hover:text-white transition-transform group-hover:scale-110" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Portail d'Échange (JS & JSON)</span>
                    <span className="text-[7.5px] font-bold text-slate-500 group-hover:text-indigo-200 mt-1 uppercase">Importer / Exporter par Ligue</span>
                  </div>
                </button>
              </div>

              <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1 mt-4 mb-2 text-center">Maintenance de la Base</div>

              <div className="p-3 bg-slate-950/80 border border-slate-800/60 rounded-2xl space-y-2">
                <button 
                  onClick={cleanGhostDatabase}
                  disabled={isCleaning}
                  className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-600/90 text-emerald-400 hover:text-slate-950 border border-emerald-500/20 rounded-xl text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isCleaning ? 'animate-spin' : ''}`} />
                  {isCleaning ? 'Désinfection...' : 'Éliminer données fantômes'}
                </button>

                <button 
                  onClick={async () => {
                    if (!showConfirm) {
                      setShowConfirm(true);
                      setTimeout(() => setShowConfirm(false), 5000);
                      return;
                    }
                    
                    setIsPurging(true);
                    try {
                      const success = await purgeTotalDatabase();
                      if (success) {
                        setMatches([]);
                        setShowConfirm(false);
                        window.dispatchEvent(new CustomEvent('archives_cleared'));
                        alert('Targeted Wipe terminé. La mémoire a été remise à zéro.');
                        window.location.reload();
                      }
                    } catch (err) {
                      console.error('Purge Error:', err);
                    } finally {
                      setIsPurging(false);
                    }
                  }}
                  disabled={isPurging}
                  className={`w-full py-2 rounded-xl border transition-all text-[9.5px] font-black uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 cursor-pointer ${
                    showConfirm 
                      ? 'bg-amber-600 border-amber-500 text-white animate-pulse' 
                      : 'bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border-rose-500/20'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  {isPurging ? 'Purge...' : showConfirm ? 'CONFIRMER PURGE ?' : 'Exécuter Wipe Total'}
                </button>
              </div>
              </div>
            </div>
          </div>

        {/* Matches Feed */}
        <div className="lg:col-span-3 space-y-6">
          {/* Search bar */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-slate-600 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Rechercher une équipe dans les archives..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-800 text-slate-100 text-sm font-medium pl-14 pr-6 py-5 rounded-[2rem] outline-none focus:border-indigo-500/50 transition-all shadow-xl backdrop-blur-md"
            />
          </div>

          {/* Unified Portal Navigation Tabs */}
          <div className="bg-slate-950/80 p-1.5 border border-slate-800/60 rounded-[1.5rem] flex items-center gap-1.5 backdrop-blur-md shadow-lg">
            <button
              onClick={() => setViewPortalMode('all')}
              className={`flex-1 py-3 px-4 rounded-xl text-[10px] sm:text-[10.5px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 ${
                viewPortalMode === 'all'
                  ? 'bg-slate-900 border border-slate-800 text-indigo-400 font-black shadow-lg shadow-indigo-950/10'
                  : 'text-slate-500 hover:text-slate-305'
              }`}
            >
              <Database className="w-3.5 h-3.5 shrink-0 text-indigo-450" />
              <span>📁 Historique Général</span>
            </button>
            <button
              onClick={() => setViewPortalMode('imported')}
              className={`flex-1 py-3 px-4 rounded-xl text-[10px] sm:text-[10.5px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 relative ${
                viewPortalMode === 'imported'
                  ? 'bg-slate-900 border border-slate-800 text-emerald-400 font-black shadow-lg shadow-emerald-950/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Download className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>📥 Portail des Imports</span>
              {totalImportedCount > 0 && (
                <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-mono px-2 py-0.5 rounded-full font-bold">
                  {totalImportedCount}
                </span>
              )}
            </button>
          </div>

          {/* Header toolbar for Match list */}
          {filteredMatches.length > 0 && !loading && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/40 p-5 border border-slate-800 rounded-3xl backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-indigo-400" />
                {viewPortalMode === 'imported' ? (
                  <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Données Importées
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Saison Active : <span className="text-white">{selectedSeason || 'Non détectée'}</span>
                  </span>
                )}
                <span className="text-[8px] font-black text-slate-705">•</span>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  {filteredMatches.length} Matchs Filtrés
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const allRounds = groupedByRound.map(g => g.round);
                    const expandedObj: Record<number, boolean> = {};
                    allRounds.forEach(r => { expandedObj[r] = true; });
                    setExpandedRounds(expandedObj);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-[9px] font-black uppercase tracking-wider transition-all"
                >
                  Tout développer
                </button>
                <button
                  onClick={() => setExpandedRounds({})}
                  className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-[9px] font-black uppercase tracking-wider transition-all"
                >
                  Tout réduire
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 grayscale opacity-20">
                <Database className="w-12 h-12 animate-pulse mb-4 text-slate-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Chargement des données...</span>
              </div>
            ) : filteredMatches.length === 0 ? (
              viewPortalMode === 'imported' ? (
                <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-[2.5rem] py-20 px-8 text-center">
                  <div className="bg-slate-950 w-20 h-20 flex items-center justify-center rounded-3xl mx-auto mb-6 border border-slate-800 shadow-xl shadow-indigo-950/20">
                    <Download className="w-10 h-10 text-emerald-400" />
                  </div>
                  <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest mb-3">Aucun match importé détecté pour cette ligue</h3>
                  <p className="text-[10.5px] text-slate-400 font-medium uppercase max-w-md mx-auto leading-relaxed mb-6">
                    Vous n'avez pas encore importé de matchs pour cette ligue ou ils ont été vidés. Importez un fichier d'archives (JS/JSON) ci-dessous pour remplir instantanément la base locale.
                  </p>
                  <button
                    onClick={() => {
                      const fileInput = document.getElementById('drag-drop-file-picker');
                      if (fileInput) {
                        fileInput.click();
                      } else {
                        alert("Veuillez utiliser le module d'importation dans la section d'échange avancé ci-dessous.");
                      }
                    }}
                    className="py-3 px-6 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95 shadow-md hover:shadow-emerald-950/50"
                  >
                    Sélectionner un fichier d'archives
                  </button>
                </div>
              ) : (
                <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-[2.5rem] py-20 px-8 text-center">
                  <div className="bg-slate-950 w-16 h-16 flex items-center justify-center rounded-full mx-auto mb-6 border border-slate-800">
                    <Info className="w-8 h-8 text-slate-700" />
                  </div>
                  <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest mb-2">Aucune donnée correspondante</h3>
                  <p className="text-[10px] text-slate-500 font-medium uppercase max-w-sm mx-auto leading-relaxed">
                    Utilisez le menu d'extraction pour peupler cette base de données ou changez vos filtres.
                  </p>
                </div>
              )
            ) : (
              groupedByRound.map((roundGroup) => {
                const isRoundExpanded = !!expandedRounds[roundGroup.round];
                const matchesCount = roundGroup.matches.length;
                const finishedCount = roundGroup.matches.filter(m => m.homeScore !== undefined && m.homeScore !== null && m.homeScore !== '').length;

                return (
                  <div key={roundGroup.round} className="space-y-3">
                    {/* Collapsible Round Row */}
                    <div 
                      onClick={() => setExpandedRounds(prev => ({ ...prev, [roundGroup.round]: !prev[roundGroup.round] }))}
                      className="bg-slate-900 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-705 p-5 rounded-3xl flex items-center justify-between cursor-pointer transition-all select-none group shadow-md"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 group-hover:bg-indigo-500/15 flex items-center justify-center text-sm font-black text-indigo-400 transition-colors">
                          {roundGroup.round}
                        </div>
                        <div>
                          <h4 className="text-xs font-black uppercase text-slate-200 tracking-wider">JOURNÉE {roundGroup.round}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wide">
                              {matchesCount} match{matchesCount > 1 ? 's' : ''} archivé{matchesCount > 1 ? 's' : ''}
                            </span>
                            <span className="text-[8px] font-black text-slate-700">•</span>
                            <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-wide">
                              {finishedCount} / {matchesCount} Joué{finishedCount > 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">


                        <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center group-hover:border-slate-700 transition-colors">
                          <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isRoundExpanded ? 'rotate-180 text-indigo-400' : ''}`} />
                        </div>
                      </div>
                    </div>

                    {/* Round Matches List inside AnimatePresence Collapse */}
                    {isRoundExpanded && (
                      <div className="pl-4 md:pl-8 border-l border-slate-800/60 space-y-3 pt-1 pb-3">
                        {roundGroup.matches.map((match) => (
                          <MatchArchiveCard 
                            key={match.id} 
                            match={match} 
                            isExpanded={expandedMatchId === match.id}
                            onToggle={() => setExpandedMatchId(expandedMatchId === match.id ? null : match.id!)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ADVANCED DATA EXCHANGE PORTAL MODAL */}
      <AnimatePresence>
        {showIOModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
          >
            {/* Backdrop close */}
            <div className="absolute inset-0" onClick={() => setShowIOModal(false)} />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl sm:rounded-[2.5rem] p-4 sm:p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col custom-scrollbar"
            >
              {/* Background Glows */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 blur-[100px] pointer-events-none rounded-full" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 blur-[100px] pointer-events-none rounded-full" />

              {/* Close Button */}
              <button
                onClick={() => setShowIOModal(false)}
                className="absolute top-6 right-6 z-50 w-9 h-9 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/80 rounded-full flex items-center justify-center transition-colors active:scale-90 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header */}
              <div className="flex items-center gap-4 mb-6 relative">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/30">
                  <Database className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Portail d'Échange de Données
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                    Migrer, exporter et importer des matchs (JS / JSON)
                  </p>
                </div>
              </div>

              {/* Grid content */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto custom-scrollbar pr-1 relative flex-1 min-h-[350px]">
                
                {/* 1. EXPORT COLUMN */}
                <div className="p-5 bg-indigo-500/5 rounded-3xl border border-indigo-500/10 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Download className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">
                        Option 1 : Exporter
                      </h4>
                    </div>
                    <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wide leading-relaxed mb-4">
                      Exportez l'intégralité ou une Ligue de compétitions ciblée sous format JS (.js) ou JSON natif compressé.
                    </p>

                    {/* League selection drop */}
                    <div className="space-y-4 mb-4">
                      <div>
                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                          Sélectionner la ligue
                        </label>
                        <select
                          value={modalLeagueExport}
                          onChange={(e) => {
                            const val = e.target.value;
                            setModalLeagueExport(val === 'all' ? 'all' : Number(val));
                          }}
                          className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-[10px] font-black uppercase tracking-wider rounded-xl p-3 outline-none focus:border-indigo-500 transition-colors"
                        >
                          <option value="all">🚀 Toutes les Ligues</option>
                          {LEAGUES.map((l) => (
                            <option key={l.id} value={l.id}>
                              ⚽️ {l.name} ({l.country})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Format Selector */}
                      <div>
                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                          Format de sortie
                        </label>
                        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 border border-slate-800 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setModalFormatExport('js')}
                            className={`py-2 px-3 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                              modalFormatExport === 'js'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            JS Array
                          </button>
                          <button
                            type="button"
                            onClick={() => setModalFormatExport('json')}
                            className={`py-2 px-3 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
                              modalFormatExport === 'json'
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            Standard JSON
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleExportClick}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 duration-200 shadow-lg shadow-indigo-600/20 cursor-pointer"
                  >
                    Générer et Télécharger
                  </button>
                </div>

                {/* 2. IMPORT COLUMN */}
                <div className="p-5 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Upload className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">
                        Option 2 : Importer
                      </h4>
                    </div>

                    {importStatus.state === 'idle' ? (
                      <div className="flex flex-col items-center justify-center p-6 bg-slate-950/60 border border-dashed border-slate-800 hover:border-emerald-500/40 rounded-2xl cursor-pointer transition-colors group relative">
                        <input
                          id="drag-drop-file-picker"
                          type="file"
                          accept=".js,.json"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileChange(f);
                          }}
                        />
                        <FileText className="w-8 h-8 text-slate-600 group-hover:text-emerald-400 transition-colors mb-2" />
                        <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider group-hover:text-slate-200">
                          Cliquez ou déposez
                        </span>
                        <span className="text-[7.5px] font-bold text-slate-600 uppercase mt-1">
                          Fichiers .js ou .json
                        </span>
                      </div>
                    ) : (
                      <div className="bg-slate-950/80 p-4 border border-slate-800 rounded-2xl flex flex-col space-y-3">
                        <div className="flex items-start gap-2.5">
                          {importStatus.state === 'parsing' && (
                            <div className="w-4 h-4 rounded-full border border-indigo-500 border-t-transparent animate-spin mt-0.5" />
                          )}
                          {importStatus.state === 'validated' && (
                            <Check className="w-4 h-4 text-emerald-500 mt-0.5" />
                          )}
                          {importStatus.state === 'success' && (
                            <Check className="w-4 h-4 text-emerald-500 mt-0.5" />
                          )}
                          {importStatus.state === 'error' && (
                            <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <span className="text-[9.5px] font-black text-slate-200 uppercase tracking-tight block">
                              Statut du fichier
                            </span>
                            <span className="text-[8.5px] font-medium text-slate-400 leading-normal block mt-1">
                              {importStatus.message}
                            </span>
                          </div>
                        </div>

                        {importStatus.count && (
                          <div className="flex items-center justify-between text-[9px] font-black uppercase text-slate-500 px-1 border-t border-slate-900 pt-2.5">
                            <span>Total détecté :</span>
                            <span className="text-white font-bold">{importStatus.count} Matchs</span>
                          </div>
                        )}

                        {importStatus.detectedLeagues && importStatus.detectedLeagues.length > 0 && (
                          <div className="px-1 space-y-1">
                            <span className="text-[7.5px] font-black text-slate-600 uppercase tracking-widest block">
                              Ligues détectées :
                            </span>
                            <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto custom-scrollbar">
                              {importStatus.detectedLeagues.map((lg, idx) => (
                                <span key={idx} className="px-2 py-0.5 text-[7px] font-black bg-slate-900 text-indigo-400 border border-slate-800 rounded uppercase">
                                  {lg}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Reset button inside import column */}
                        <button
                          type="button"
                          onClick={() => {
                            setImportStatus({ state: 'idle', message: '' });
                          }}
                          className="w-full text-center hover:underline text-[7.5px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-wider"
                        >
                          Choisir un autre fichier
                        </button>
                      </div>
                    )}
                  </div>

                  {importStatus.state === 'validated' ? (
                    <button
                      onClick={confirmImport}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 duration-200 shadow-lg shadow-emerald-500/20 cursor-pointer"
                    >
                      Fusionner les Matchs
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full py-3.5 bg-slate-950/20 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-xl border border-slate-900"
                    >
                      En attente de fichier
                    </button>
                  )}
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MatchArchiveCard({ match, isExpanded, onToggle }: { match: ArchivedMatch, isExpanded: boolean, onToggle: () => void }) {
  const normalizedAllOdds = useMemo(() => {
    if (!match.allOdds) return [];
    if (Array.isArray(match.allOdds)) {
      return match.allOdds;
    }
    if (typeof match.allOdds === 'object') {
      return Object.entries(match.allOdds).map(([marketName, outcomes]) => ({
        name: marketName,
        outcomes: Array.isArray(outcomes) ? outcomes : []
      }));
    }
    return [];
  }, [match.allOdds]);

  const isMatchInPast = useMemo(() => {
    return match.status === 'Finished' || (
      match.homeScore !== undefined && 
      match.homeScore !== null && 
      String(match.homeScore).trim() !== '' && 
      String(match.homeScore).trim() !== '-'
    );
  }, [match.status, match.homeScore]);

  return (
    <div className={`bg-slate-900/60 border ${isExpanded ? 'border-indigo-500/50 shadow-indigo-500/5' : 'border-slate-800'} rounded-3xl overflow-hidden transition-all duration-300 group relative`}>
      <div 
        onClick={onToggle}
        className="p-3.5 sm:p-5 cursor-pointer hover:bg-slate-800/30 transition-colors"
      >
        {/* Mobile View (screen < 640px) */}
        <div className="flex sm:hidden flex-col gap-3">
          {/* Header row: Round and status */}
          <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
            <div className="flex items-center gap-2">
              <div className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded-md flex items-center gap-1.5">
                {isMatchInPast ? (
                  <span className="text-[10px] font-black text-indigo-400">J{match.round}</span>
                ) : (
                  <span className="text-[10px] font-black text-slate-500">-</span>
                )}
                {(match.isImported || !!match.sourceFileId) && (
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" title="Importé" />
                )}
              </div>
              {match.expectedStart && (
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">
                  {new Date(match.expectedStart).toLocaleString('fr-FR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {match.status === 'Finished' ? (
                <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-full">Terminé</span>
              ) : (
                <span className="text-[9.5px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Live</span>
              )}
              <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-90 text-indigo-400' : ''}`} />
            </div>
          </div>

          {/* Teams list layout for mobile (keeps team names visible without truncation) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <TeamBadge name={match.homeTeam} className="w-5 h-5" />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[12px] font-black text-slate-100 uppercase tracking-tight truncate max-w-[130px]">{match.homeTeam}</span>
                    {match.homeRankAtMatch !== undefined && match.homeRankAtMatch > 0 && (
                      <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded shrink-0">
                        #{match.homeRankAtMatch}
                      </span>
                    )}
                  </div>
                  {match.homeFormWDLPct && (
                    <span className="text-[7.5px] text-indigo-400 bg-slate-950/60 border border-slate-800/80 px-1 rounded font-mono self-start mt-0.5">
                      NVD: {match.homeFormWDLPct.v}/{match.homeFormWDLPct.n}/{match.homeFormWDLPct.d}%
                    </span>
                  )}
                  <RenderFormSequence sequence={match.homeFormSequence} align="start" />
                </div>
              </div>
              <span className="text-[13px] font-black text-white px-2.5 py-1 bg-slate-950/80 rounded-lg border border-slate-800 min-w-[32px] text-center">
                {match.status === 'Finished' ? match.homeScore : '-'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <TeamBadge name={match.awayTeam} className="w-5 h-5" />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[12px] font-black text-slate-100 uppercase tracking-tight truncate max-w-[130px]">{match.awayTeam}</span>
                    {match.awayRankAtMatch !== undefined && match.awayRankAtMatch > 0 && (
                      <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded shrink-0">
                        #{match.awayRankAtMatch}
                      </span>
                    )}
                  </div>
                  {match.awayFormWDLPct && (
                    <span className="text-[7.5px] text-indigo-400 bg-slate-950/60 border border-slate-800/80 px-1 rounded font-mono self-start mt-0.5">
                      NVD: {match.awayFormWDLPct.v}/{match.awayFormWDLPct.n}/{match.awayFormWDLPct.d}%
                    </span>
                  )}
                  <RenderFormSequence sequence={match.awayFormSequence} align="start" />
                </div>
              </div>
              <span className="text-[13px] font-black text-white px-2.5 py-1 bg-slate-950/80 rounded-lg border border-slate-800 min-w-[32px] text-center">
                {match.status === 'Finished' ? match.awayScore : '-'}
              </span>
            </div>
          </div>

          {/* Miniature odds for mobile */}
          {(match.odds1 || match.oddsX || match.odds2) && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/40">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Cotes 1X2</span>
              <div className="flex items-center gap-1.5">
                <span className="bg-slate-950/40 text-slate-300 border border-slate-800/80 px-2.5 py-1 rounded-md text-[9px] font-mono"><span className="text-indigo-400 font-bold mr-1">1</span>{match.odds1 || '-'}</span>
                <span className="bg-slate-950/40 text-slate-300 border border-slate-800/80 px-2.5 py-1 rounded-md text-[9px] font-mono"><span className="text-indigo-400 font-bold mr-1">X</span>{match.oddsX || '-'}</span>
                <span className="bg-slate-950/40 text-slate-300 border border-slate-800/80 px-2.5 py-1 rounded-md text-[9px] font-mono"><span className="text-indigo-400 font-bold mr-1">2</span>{match.odds2 || '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Desktop View (screen >= 640px) */}
        <div className="hidden sm:flex items-center justify-between flex-1">
          <div className="flex items-center gap-6 flex-1">
            <div className="relative shrink-0">
              <div className="w-10 h-10 bg-slate-950 border border-slate-800 flex items-center justify-center rounded-xl group-hover:border-indigo-500/30 transition-colors">
                <span className="text-[12px] font-black text-slate-400">
                  {isMatchInPast ? match.round : '-'}
                </span>
              </div>
              {(match.isImported || !!match.sourceFileId) && (
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-900 shadow-md shadow-emerald-500/30 flex items-center justify-center animate-pulse" title="Match Importé" />
              )}
            </div>
            
            <div className="flex items-center gap-4 flex-1">
              <div className="flex-1 text-right flex items-center justify-end gap-2.5">
                <div className="flex flex-col items-end min-w-0">
                  <div className="flex items-center gap-1.5 justify-end">
                    {match.homeRankAtMatch !== undefined && match.homeRankAtMatch > 0 && (
                      <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded shrink-0">
                        #{match.homeRankAtMatch}
                      </span>
                    )}
                    <span className="text-[13px] font-black text-slate-100 uppercase tracking-tighter truncate max-w-[120px]">{match.homeTeam}</span>
                  </div>
                  {match.homeFormWDLPct && (
                    <span className="text-[7.5px] text-indigo-400 bg-slate-950/60 border border-slate-800/80 px-1 rounded font-mono mt-0.5">
                      NVD: {match.homeFormWDLPct.v}/{match.homeFormWDLPct.n}/{match.homeFormWDLPct.d}%
                    </span>
                  )}
                  <RenderFormSequence sequence={match.homeFormSequence} align="end" />
                </div>
                <TeamBadge name={match.homeTeam} />
              </div>
              
              <div className={`px-4 py-1.5 rounded-full ${match.status === 'Finished' ? 'bg-slate-950 border border-slate-800' : 'bg-emerald-500/10 border border-emerald-500/20'} flex flex-col items-center gap-0.5 shrink-0 min-w-[80px] justify-center`}>
                {match.status === 'Finished' ? (
                  <>
                    <span className="text-[14px] font-black text-white">{match.homeScore}-{match.awayScore}</span>
                    {((match.scoreDetails?.homeGoals?.length || 0) > 0 || (match.scoreDetails?.awayGoals?.length || 0) > 0) && (
                      <div className="flex gap-1 overflow-hidden max-w-[60px] justify-center">
                        {[...(match.scoreDetails?.homeGoals || []), ...(match.scoreDetails?.awayGoals || [])]
                          .sort((a, b) => parseInt(a.minute) - parseInt(b.minute))
                          .slice(0, 3)
                          .map((g, i) => (
                            <span key={i} className="text-[7px] font-bold text-amber-500">{g.minute}'</span>
                          ))}
                        {([...(match.scoreDetails?.homeGoals || []), ...(match.scoreDetails?.awayGoals || [])].length > 3) && (
                          <span className="text-[7px] font-bold text-slate-600">+</span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Live</span>
                )}
              </div>

              <div className="flex-1 text-left flex items-center justify-start gap-2.5">
                <TeamBadge name={match.awayTeam} />
                <div className="flex flex-col items-start min-w-0">
                  <div className="flex items-center gap-1.5 justify-start">
                    <span className="text-[13px] font-black text-slate-100 uppercase tracking-tighter truncate max-w-[120px]">{match.awayTeam}</span>
                    {match.awayRankAtMatch !== undefined && match.awayRankAtMatch > 0 && (
                      <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded shrink-0">
                        #{match.awayRankAtMatch}
                      </span>
                    )}
                  </div>
                  {match.awayFormWDLPct && (
                    <span className="text-[7.5px] text-indigo-400 bg-slate-950/60 border border-slate-800/80 px-1 rounded font-mono mt-0.5">
                      NVD: {match.awayFormWDLPct.v}/{match.awayFormWDLPct.n}/{match.awayFormWDLPct.d}%
                    </span>
                  )}
                  <RenderFormSequence sequence={match.awayFormSequence} align="start" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 ml-8">
            <div className="hidden md:flex items-center gap-2">
              <div className="bg-slate-950/80 px-2 py-1 rounded-md border border-slate-800 group-hover:border-indigo-500/20 transition-all font-mono text-[10px] text-indigo-400">
                {match.odds1}
              </div>
              <div className="bg-slate-950/80 px-2 py-1 rounded-md border border-slate-800 group-hover:border-indigo-500/20 transition-all font-mono text-[10px] text-indigo-400">
                {match.oddsX}
              </div>
              <div className="bg-slate-950/80 px-2 py-1 rounded-md border border-slate-800 group-hover:border-indigo-500/20 transition-all font-mono text-[10px] text-indigo-400">
                {match.odds2}
              </div>
            </div>
            <ChevronRight className={`w-5 h-5 text-slate-600 transition-transform duration-300 ${isExpanded ? 'rotate-90 text-indigo-400' : ''}`} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-800 bg-slate-950/40"
          >
            <div className="p-4 sm:p-8 space-y-4 sm:space-y-8">
              {/* Score Details with goal minutes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 bg-slate-900/40 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800/50">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{match.homeTeam}</span>
                    <span className="text-xl font-black text-white">{match.homeScore}</span>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-2">
                    {match.scoreDetails?.homeGoals?.length ? (
                      match.scoreDetails.homeGoals.map((g, i) => (
                        <div key={i} className="flex items-center gap-3 text-[11px] group/goal">
                          <div className="w-6 h-6 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover/goal:bg-emerald-500/20 transition-colors">
                            <Zap className="w-3 h-3 text-emerald-400" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-slate-100 uppercase tracking-tighter">{g.player || 'Buteur'}</span>
                            <span className="text-[9px] font-black text-emerald-500">{g.minute}'</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-2 text-[10px] text-slate-700 italic px-1">
                        <span>— Aucun but enregistré</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{match.awayTeam}</span>
                    <span className="text-xl font-black text-white">{match.awayScore}</span>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-2">
                    {match.scoreDetails?.awayGoals?.length ? (
                      match.scoreDetails.awayGoals.map((g, i) => (
                        <div key={i} className="flex items-center gap-3 text-[11px] group/goal justify-end">
                          <div className="flex flex-col text-right">
                            <span className="font-black text-slate-100 uppercase tracking-tighter">{g.player || 'Buteur'}</span>
                            <span className="text-[9px] font-black text-emerald-500">{g.minute}'</span>
                          </div>
                          <div className="w-6 h-6 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover/goal:bg-emerald-500/20 transition-colors">
                            <Zap className="w-3 h-3 text-emerald-400" />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-end gap-2 text-[10px] text-slate-700 italic px-1">
                        <span>Aucun but enregistré —</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Markets Section (Bet261 Style) */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <Target className="w-5 h-5 text-indigo-400" />
                    <h4 className="text-[14px] font-black text-white uppercase tracking-tighter">Marchés de Paris Disponibles</h4>
                  </div>
                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-800">
                    {normalizedAllOdds.length || 0} Marchés
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-6">
                  {Object.entries(MARKET_GROUPS).map(([groupName, marketNames]) => {
                    const groupMarkets = normalizedAllOdds.filter((m: any) => {
                      const mName = (m.name || m.marketName || '').toUpperCase();
                      return marketNames.some(target => mName.includes(target.toUpperCase()));
                    });

                    if (!groupMarkets || groupMarkets.length === 0) return null;

                    return (
                      <div key={groupName} className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                          <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                          <h5 className="text-[10px] font-black text-slate-200 uppercase tracking-[0.12em]">{groupName}</h5>
                        </div>
                        
                        <div className="space-y-4">
                          {groupMarkets.map((market: any, mIdx: number) => {
                            const mFullName = (market.name || market.marketName || market.title || '').toUpperCase();
                            const isCorrectScore = mFullName.includes('CORRECT SCORE') || mFullName.includes('SCORE EXACT') || mFullName.includes('CS') || mFullName.includes('CORRECT_SCORE');
                            const is1X2 = mFullName === '1X2' || mFullName.includes('MATCH WINNER') || mFullName.includes('1 X 2') || mFullName.includes('1X2_RESULT');
                            const isDoubleChance = mFullName.includes('DOUBLE CHANCE') || mFullName.includes('DC') || mFullName.includes('DOUBLE_CHANCE');
                            
                            // Support various API structures for outcomes
                            const outcomes = market.outcomes || market.items || market.eventBetTypeItems || market.selections || market.data || [];
                            if (!outcomes || outcomes.length === 0) return null;

                            return (
                              <div key={mIdx} className="overflow-hidden border border-slate-300 rounded-lg bg-slate-100 shadow-sm">
                                {/* Bet261 Market Header */}
                                <div className="bg-[#f0f0f0] px-3 py-2 border-b border-slate-300">
                                  <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight">
                                    {market.name || market.marketName || market.title || 'Marché Inconnu'}
                                  </span>
                                </div>
                                
                                {/* Bet261 Outcome Layout */}
                                <div className={`p-1.5 bg-white/50 ${
                                  is1X2 || isDoubleChance 
                                    ? 'flex flex-wrap gap-1.5' 
                                    : isCorrectScore 
                                      ? 'grid grid-cols-1 gap-1' 
                                      : 'grid grid-cols-1 sm:grid-cols-2 gap-1.5'
                                }`}>
                                  {outcomes.map((o: any, oIdx: number) => {
                                    // Robust odd value detection
                                    const oddValue = o.odds || o.price || o.value || o.oddsValue || o.oddValue || o.rate || o.odd || '-';
                                    // Robust outcome name detection
                                    const outcomeName = o.name || o.desc || o.displayName || o.title || o.selectionName || o.outcomeName || o.outcome || o.shortName || `Option ${oIdx + 1}`;

                                    return (
                                      <div 
                                        key={oIdx} 
                                        className={`flex items-center min-w-0 transition-all ${
                                          (is1X2 || isDoubleChance) ? 'flex-1' : 'w-full'
                                        }`}
                                      >
                                        <div className="flex-1 flex items-center justify-between min-w-0 bg-white rounded-l-md h-9 border border-slate-300 px-3">
                                          <span className="text-[11px] font-black text-slate-700 uppercase truncate">
                                            {outcomeName}
                                          </span>
                                        </div>
                                        <div className="bg-[#28a745] min-w-[65px] h-9 flex items-center justify-center rounded-r-md shadow-sm group-hover:bg-[#218838] transition-colors">
                                          <span className="text-[14px] font-mono font-black text-white drop-shadow-sm">
                                            {oddValue}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Other Markets List */}
                  <div className="xl:col-span-2">
                    <div className="flex items-center gap-2 px-1 mb-4">
                      <div className="w-1 h-3 bg-slate-600 rounded-full" />
                      <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.12em]">Marchés Additionnels</h5>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {normalizedAllOdds.filter((m: any) => {
                        const mName = (m.name || m.marketName || m.title || '').toUpperCase();
                        return !Object.values(MARKET_GROUPS).flat().some(target => mName.includes(target.toUpperCase()));
                      }).map((market: any, idx: number) => (
                        <div key={idx} className="border border-slate-300 rounded-lg overflow-hidden flex flex-col bg-slate-100 shadow-sm">
                          <div className="bg-[#f0f0f0] px-3 py-1.5 border-b border-slate-300">
                             <span className="text-[10px] font-bold text-slate-900 uppercase truncate block">
                               {market.name || market.marketName || market.title}
                             </span>
                          </div>
                          <div className="p-1 space-y-1 bg-white/50">
                            {(market.outcomes || market.items || market.eventBetTypeItems || market.selections || market.data || []).slice(0, 4).map((o: any, i: number) => (
                              <div key={i} className="flex items-center justify-between border border-slate-200 bg-white p-0.5 rounded shadow-inner">
                                <span className="text-[9px] font-bold text-slate-700 uppercase pl-2 truncate">{o.name || o.displayName || o.title || o.selectionName || i+1}</span>
                                <div className="bg-[#28a745] min-w-[45px] h-7 px-1.5 rounded flex items-center justify-center">
                                  <span className="text-[11px] font-mono text-white font-black">{o.odds || o.price || o.value || o.rate || o.odd}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {(!normalizedAllOdds || normalizedAllOdds.length === 0) && (
                      <div className="text-center py-10 bg-slate-900/20 rounded-[2rem] border border-dashed border-slate-800">
                        <Target className="w-8 h-8 text-slate-800 mx-auto mb-3" />
                        <div className="text-[10px] text-slate-600 uppercase font-black tracking-widest italic">
                          Aucune donnée de marché étendue disponible
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Match Metadata */}
              <div className="pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {new Date(match.expectedStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {new Date(match.expectedStart).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <div className="text-[8px] font-black text-slate-700 uppercase tracking-[0.2em] select-none">
                  ID ARCHIVE: {match.id?.slice(0, 16)}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
