import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Save, 
  AlertCircle,
  CheckCircle2,
  Loader2,
  Activity,
  Settings,
  Play,
  Pause,
  RefreshCw,
  Clock
} from 'lucide-react';
import { LEAGUES } from '../shared/constants';
import { getTeamLogo, getLeagueFlag } from '../lib/logos';

interface AdminPanelProps {
  onClose: () => void;
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeague, setSelectedLeague] = useState<number | 'all'>('all');
  const [editingMatch, setEditingMatch] = useState<any | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'matches' | 'scraper'>('matches');
  
  // Scraper State
  const [scraperStatus, setScraperStatus] = useState<any>(null);
  const [scraperLogs, setScraperLogs] = useState<any[]>([]);
  const [enabledLeagues, setEnabledLeagues] = useState<number[]>([]);

  // Confirmation Modal States
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteAll = () => {
    setConfirmDeleteAll(true);
  };

  const executeDeleteAll = async () => {
    setConfirmDeleteAll(false);
    const leagueName = selectedLeague === 'all' ? 'tous les championnats' : LEAGUES.find(l => l.id === selectedLeague)?.name;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId: selectedLeague })
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || "Une erreur est survenue lors du formatage");
      }

      setMatches([]);
      setOffset(0);
      setHasMore(false);
      
      setSuccess(`Formatage réussi : ${result.count || 0} matchs supprimés pour ${leagueName}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError("Erreur lors du formatage: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const fetchScraperStatus = async () => {
    try {
      const res = await fetch('/api/scraper/status');
      const data = await res.json();
      setScraperStatus(data);
      if (data.enabledLeagues) {
        setEnabledLeagues(data.enabledLeagues);
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        return;
      }
      console.error("Failed to fetch scraper status", err);
    }
  };

  const fetchScraperLogs = async () => {
    try {
      const res = await fetch('/api/scraper/logs');
      const data = await res.json();
      setScraperLogs(data);
    } catch (err) {
      if (err instanceof Error && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        return;
      }
      console.error("Failed to fetch scraper logs", err);
    }
  };

  const toggleScraper = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/scraper/toggle', { method: 'POST' });
      const data = await res.json();
      setScraperStatus((prev: any) => ({ ...prev, isRunning: data.isRunning }));
      setSuccess(data.isRunning ? "Scraper activé" : "Scraper désactivé");
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError("Erreur lors du basculement du scraper");
    } finally {
      setActionLoading(false);
    }
  };

  const forceScrape = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/scraper/force', { method: 'POST' });
      const data = await res.json();
      setSuccess(data.message);
      fetchScraperStatus();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError("Erreur lors du lancement forcé");
    } finally {
      setActionLoading(false);
    }
  };

  const updateInterval = async (minutes: number) => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/scraper/interval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMs: minutes * 60000 })
      });
      const data = await res.json();
      setScraperStatus((prev: any) => ({ ...prev, intervalMs: data.intervalMs }));
      setSuccess(`Intervalle mis à jour : ${minutes} min`);
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError("Erreur lors de la mise à jour de l'intervalle");
    } finally {
      setActionLoading(false);
    }
  };

  const toggleLeagueExtraction = async (leagueId: number) => {
    try {
      setActionLoading(true);
      // Only allow one league at a time for focus
      const newEnabledLeagues = [leagueId];
      
      const res = await fetch('/api/scraper/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagues: newEnabledLeagues })
      });
      const data = await res.json();
      setEnabledLeagues(data.enabledLeagues);
      setSuccess(`Focus sur ${LEAGUES.find(l => l.id === leagueId)?.name} activé`);
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError("Erreur lors de la mise à jour des ligues");
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'scraper') {
      fetchScraperStatus();
      fetchScraperLogs();
      const interval = setInterval(() => {
        fetchScraperStatus();
        fetchScraperLogs();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchMatches(true);
  }, [selectedLeague, searchTerm]);

  const fetchMatches = async (reset = false) => {
    setLoading(true);
    setError(null);
    try {
      const currentOffset = reset ? 0 : offset;
      const url = new URL('/api/admin/matches', window.location.origin);
      url.searchParams.append('leagueId', String(selectedLeague));
      url.searchParams.append('searchTerm', searchTerm);
      url.searchParams.append('offset', String(currentOffset));
      url.searchParams.append('limit', '20');

      const res = await fetch(url.toString());
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur serveur (${res.status})`);
      }
      
      const data = await res.json();
      const newMatches = data.matches;
      
      if (reset) {
        setMatches(newMatches);
        setOffset(newMatches.length);
      } else {
        setMatches(prev => {
          const combined = [...prev, ...newMatches];
          const uniqueMap = new Map();
          combined.forEach(m => {
            if (!uniqueMap.has(m.id)) uniqueMap.set(m.id, m);
          });
          return Array.from(uniqueMap.values());
        });
        setOffset(prev => prev + newMatches.length);
      }
      
      setHasMore(newMatches.length === 20);
    } catch (err: any) {
      if (err instanceof Error && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        return;
      }
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (matchId: string) => {
    setConfirmDeleteId(matchId);
  };

  const executeDelete = async (matchId: string) => {
    setConfirmDeleteId(null);
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/matches/${matchId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Erreur lors de la suppression");
      
      setMatches(prev => prev.filter(m => m.id !== matchId));
      setSuccess("Match supprimé avec succès");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      const data = { ...editingMatch };
      const id = data.id;
      
      let res;
      if (isAdding) {
        res = await fetch('/api/admin/matches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } else {
        res = await fetch(`/api/admin/matches/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erreur lors de l'enregistrement");
      }
      
      setSuccess(isAdding ? "Match ajouté avec succès" : "Match mis à jour avec succès");
      setEditingMatch(null);
      setIsAdding(false);
      fetchMatches(true);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <Database className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <h1 className="text-base font-black text-white uppercase tracking-tighter leading-none">Gestionnaire Base de Données</h1>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Supabase Database</p>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
          <button 
            onClick={() => setActiveTab('matches')}
            className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === 'matches' 
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' 
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Database className="w-3 h-3" />
            Matchs
          </button>
          <button 
            onClick={() => setActiveTab('scraper')}
            className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === 'scraper' 
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' 
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Activity className="w-3 h-3" />
            Extraction Auto
            {enabledLeagues.length > 0 && (
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${
                activeTab === 'scraper' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-500'
              }`}>
                {enabledLeagues.length}
              </span>
            )}
          </button>
        </div>

        <button 
          onClick={onClose}
          className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-3">
        <div className="max-w-6xl mx-auto">
          {/* Messages */}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-3 flex items-center gap-2 text-rose-500 text-[10px] font-bold uppercase tracking-tight">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {typeof error === 'string' ? error : JSON.stringify(error)}
            </div>
          )}
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-3 flex items-center gap-2 text-emerald-500 text-[10px] font-bold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {success}
            </div>
          )}

          {activeTab === 'matches' ? (
            <>
              {/* League Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-3 custom-scrollbar no-scrollbar scroll-smooth">
                <button 
                  onClick={() => setSelectedLeague('all')}
                  className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                    selectedLeague === 'all' 
                      ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20' 
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Tous les Matchs
                </button>
                {LEAGUES.map(league => (
                  <button 
                    key={league.id}
                    onClick={() => setSelectedLeague(league.id)}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border flex items-center gap-2 ${
                      selectedLeague === league.id 
                        ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20' 
                        : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <img 
                      src={getLeagueFlag(league.country)} 
                      alt="" 
                      className="w-3.5 h-2.5 object-contain"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    {league.name}
                  </button>
                ))}
              </div>

              {/* Filters */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 mb-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px] relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input 
                    type="text"
                    placeholder="Rechercher une équipe..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-[11px] text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
                
                <button 
                  onClick={() => fetchMatches(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-1.5 border border-slate-700"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  Actualiser
                </button>

                <button 
                  onClick={handleDeleteAll}
                  disabled={actionLoading}
                  className="bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-1.5 disabled:opacity-50 border border-rose-500/20"
                >
                  <Trash2 className="w-3 h-3" />
                  Formater
                </button>

                <button 
                  onClick={() => {
                    setEditingMatch({
                      leagueId: typeof selectedLeague === 'number' ? selectedLeague : LEAGUES[0].id,
                      homeTeam: '',
                      awayTeam: '',
                      homeScore: '',
                      awayScore: '',
                      odds1: '',
                      oddsX: '',
                      odds2: '',
                      status: 'Upcoming',
                      season: '',
                      round: 1,
                      id: 'manual_' + Date.now()
                    });
                    setIsAdding(true);
                  }}
                  className="bg-white hover:bg-slate-100 text-black px-4 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-1.5 ml-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter
                </button>
              </div>

              {/* Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/50 border-b border-slate-800">
                      <th className="px-4 py-3 text-[8px] font-black text-slate-500 uppercase tracking-widest">Ligue</th>
                      <th className="px-4 py-3 text-[8px] font-black text-slate-500 uppercase tracking-widest">Match</th>
                      <th className="px-4 py-3 text-[8px] font-black text-slate-500 uppercase tracking-widest">Score</th>
                      <th className="px-4 py-3 text-[8px] font-black text-slate-500 uppercase tracking-widest">Cotes</th>
                      <th className="px-4 py-3 text-[8px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                      <th className="px-4 py-3 text-[8px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((match) => (
                      <tr key={match.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-all group">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <img 
                              src={getLeagueFlag(LEAGUES.find(l => l.id === match.leagueId)?.country)} 
                              alt="" 
                              className="w-3.5 h-2.5 object-contain shrink-0"
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider truncate">
                              {LEAGUES.find(l => l.id === match.leagueId)?.name || match.leagueId}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                               <img 
                                 src={getTeamLogo(match.homeTeam)} 
                                 alt="" 
                                 className="w-4 h-4 object-contain" 
                                 onError={(e) => (e.currentTarget.style.display = 'none')}
                               />
                               <span className="text-[10px] font-bold text-white leading-tight">{match.homeTeam}</span>
                               <span className="text-[8px] text-slate-500 font-bold mx-1">vs</span>
                               <img 
                                 src={getTeamLogo(match.awayTeam)} 
                                 alt="" 
                                 className="w-4 h-4 object-contain" 
                                 onError={(e) => (e.currentTarget.style.display = 'none')}
                               />
                               <span className="text-[10px] font-bold text-white leading-tight">{match.awayTeam}</span>
                            </div>
                            <span className="text-[8px] text-slate-500 font-medium uppercase tracking-widest">{match.season} - R{match.round}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-[10px] font-black text-blue-500">
                            {match.homeScore ?? '-'} : {match.awayScore ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1.5">
                            <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-bold">{match.odds1 || '-'}</span>
                            <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-bold">{match.oddsX || '-'}</span>
                            <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-bold">{match.odds2 || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                            match.status === 'Live' ? 'bg-rose-500/10 text-rose-500' : 
                            match.status === 'Finished' ? 'bg-emerald-500/10 text-emerald-500' : 
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {match.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={() => {
                                setEditingMatch(match);
                                setIsAdding(false);
                              }}
                              className="w-6 h-6 bg-slate-800 hover:bg-blue-500 text-slate-400 hover:text-white rounded-lg flex items-center justify-center transition-all"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => handleDelete(match.id)}
                              className="w-6 h-6 bg-slate-800 hover:bg-rose-500 text-slate-400 hover:text-white rounded-lg flex items-center justify-center transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {loading && (
                  <div className="p-12 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Chargement des données...</p>
                  </div>
                )}

                {!loading && matches.length === 0 && (
                  <div className="p-12 text-center">
                    <p className="text-sm text-slate-500 font-medium italic">Aucun match trouvé dans la base de données.</p>
                  </div>
                )}

                {hasMore && !loading && (
                  <div className="p-6 border-t border-slate-800 text-center">
                    <button 
                      onClick={() => fetchMatches()}
                      className="text-blue-500 hover:text-blue-400 text-[11px] font-black uppercase tracking-widest transition-all"
                    >
                      Charger plus de matchs
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Scraper Controls */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                      <Settings className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-tighter">Configuration</h3>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Paramètres du scraper</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">État du Scraper</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                          scraperStatus?.isRunning ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {scraperStatus?.isRunning ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                      <button 
                        onClick={toggleScraper}
                        disabled={actionLoading}
                        className={`w-full py-2.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                          scraperStatus?.isRunning 
                            ? 'bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20' 
                            : 'bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white border border-emerald-500/20'
                        }`}
                      >
                        {scraperStatus?.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {scraperStatus?.isRunning ? 'Arrêter le Scraper' : 'Démarrer le Scraper'}
                      </button>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Intervalle d'extraction</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 5, 15].map((min) => (
                          <button 
                            key={min}
                            onClick={() => updateInterval(min)}
                            disabled={actionLoading}
                            className={`py-2 rounded-lg text-[10px] font-black transition-all ${
                              scraperStatus?.intervalMs === min * 60000 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                          >
                            {min}m
                          </button>
                        ))}
                      </div>
                    </div>

                    <button 
                      onClick={forceScrape}
                      disabled={actionLoading}
                      className="w-full bg-white hover:bg-slate-100 text-black py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                      Forcer l'extraction maintenant
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Ciblage des données</h4>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {LEAGUES.map((league) => (
                      <div 
                        key={league.id} 
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer group"
                        onClick={() => toggleLeagueExtraction(league.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full border transition-all flex items-center justify-center ${
                            enabledLeagues.includes(league.id) 
                              ? 'bg-blue-500 border-blue-500' 
                              : 'border-slate-700 bg-slate-900'
                          }`}>
                            {enabledLeagues.includes(league.id) && <div className="w-1 h-1 bg-white rounded-full" />}
                          </div>
                          <img 
                            src={getLeagueFlag(league.country)} 
                            alt="" 
                            className="w-3.5 h-2.5 object-contain mx-0.5"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                          <span className={`text-[10px] font-bold transition-all ${
                            enabledLeagues.includes(league.id) ? 'text-white' : 'text-slate-500'
                          }`}>
                            {league.name}
                          </span>
                        </div>
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-400 transition-all">
                          {enabledLeagues.includes(league.id) ? 'Activé' : 'Désactivé'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Dernières Infos</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400">Dernière extraction:</span>
                      <span className="text-white font-bold">{scraperStatus?.lastScrapeTime ? new Date(scraperStatus.lastScrapeTime).toLocaleTimeString() : 'Jamais'}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400">Prochaine extraction:</span>
                      <span className="text-blue-500 font-bold">~ {scraperStatus?.isRunning ? 'En attente' : 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scraper Logs */}
              <div className="lg:col-span-2">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col h-[500px]">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Activity className="w-4 h-4 text-blue-500" />
                      <h3 className="text-sm font-black text-white uppercase tracking-tighter">Logs du Serveur</h3>
                    </div>
                    <button 
                      onClick={fetchScraperLogs}
                      className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-all"
                    >
                      Actualiser
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto p-4 font-mono text-[10px] space-y-1.5">
                    {scraperLogs.length === 0 ? (
                      <div className="text-slate-600 italic">Aucun log disponible...</div>
                    ) : (
                      scraperLogs.map((log, i) => (
                        <div key={`${i}_${log.timestamp}`} className="flex gap-3 border-b border-slate-800/30 pb-1">
                          <span className="text-slate-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <span className={`${
                            log.level === 'error' ? 'text-rose-500' :
                            log.level === 'warn' ? 'text-orange-500' :
                            'text-slate-300'
                          }`}>{typeof log.message === 'string' ? log.message : JSON.stringify(log.message)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {(editingMatch || isAdding) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-2">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 max-w-2xl w-full shadow-2xl overflow-auto max-h-[95vh]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-white uppercase tracking-tighter">
                {isAdding ? 'Ajouter un Match' : 'Modifier le Match'}
              </h2>
              <button 
                onClick={() => {
                  setEditingMatch(null);
                  setIsAdding(false);
                }}
                className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Ligue</label>
                  <select 
                    value={editingMatch.leagueId}
                    onChange={(e) => setEditingMatch({...editingMatch, leagueId: Number(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  >
                    {LEAGUES.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Saison</label>
                  <input 
                    type="text"
                    value={editingMatch.season}
                    onChange={(e) => setEditingMatch({...editingMatch, season: e.target.value})}
                    placeholder="ex: Saison 29/03/2026"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Équipe Domicile</label>
                  <input 
                    type="text"
                    value={editingMatch.homeTeam}
                    onChange={(e) => setEditingMatch({...editingMatch, homeTeam: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Équipe Extérieur</label>
                  <input 
                    type="text"
                    value={editingMatch.awayTeam}
                    onChange={(e) => setEditingMatch({...editingMatch, awayTeam: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Score Domicile</label>
                  <input 
                    type="text"
                    value={editingMatch.homeScore || ''}
                    onChange={(e) => setEditingMatch({...editingMatch, homeScore: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Score Extérieur</label>
                  <input 
                    type="text"
                    value={editingMatch.awayScore || ''}
                    onChange={(e) => setEditingMatch({...editingMatch, awayScore: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Cote 1</label>
                  <input 
                    type="text"
                    value={editingMatch.odds1 || ''}
                    onChange={(e) => setEditingMatch({...editingMatch, odds1: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Cote X</label>
                  <input 
                    type="text"
                    value={editingMatch.oddsX || ''}
                    onChange={(e) => setEditingMatch({...editingMatch, oddsX: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Cote 2</label>
                  <input 
                    type="text"
                    value={editingMatch.odds2 || ''}
                    onChange={(e) => setEditingMatch({...editingMatch, odds2: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Status</label>
                  <select 
                    value={editingMatch.status}
                    onChange={(e) => setEditingMatch({...editingMatch, status: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                  >
                    <option value="Upcoming">Upcoming</option>
                    <option value="Live">Live</option>
                    <option value="Finished">Finished</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setEditingMatch(null);
                    setIsAdding(false);
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-black py-3 rounded-xl transition-all uppercase tracking-widest text-[10px]"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Format/Delete All Confirmation Modal */}
      {confirmDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg shrink-0 bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">
                  Formater le Championnat
                </h3>
                <p className="text-[10px] text-slate-300 leading-relaxed font-medium">
                  Êtes-vous sûr de vouloir formater <strong className="text-white font-black">{selectedLeague === 'all' ? 'tous les championnats' : LEAGUES.find(l => l.id === selectedLeague)?.name}</strong> ? Cette action supprimera définitivement toutes les données correspondantes de Supabase.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDeleteAll(false)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-[9px] uppercase font-bold tracking-wider transition-all"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={executeDeleteAll}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[9px] uppercase font-black tracking-wider transition-all shadow-md shadow-rose-600/15"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg shrink-0 bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">
                  Supprimer le match
                </h3>
                <p className="text-[10px] text-slate-300 leading-relaxed font-medium">
                  Voulez-vous vraiment supprimer ce match de la base de données ? Cette action est irréversible.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-[9px] uppercase font-bold tracking-wider transition-all"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => executeDelete(confirmDeleteId)}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[9px] uppercase font-black tracking-wider transition-all shadow-md shadow-rose-600/15"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
