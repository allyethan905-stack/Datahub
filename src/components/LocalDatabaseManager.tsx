import { useState, useEffect } from 'react';
import { db, ArchivedMatch } from '../services/localArchive';
import { Search, Info, Filter, Loader2, Trash2 } from 'lucide-react';
import { LEAGUES } from '../shared/constants';

import { getTeamLogo } from '../lib/logos';

export function LocalDatabaseManager() {
  const [matches, setMatches] = useState<ArchivedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeague, setSelectedLeague] = useState<number | 'all'>('all');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const fetchMatches = async () => {
    setLoading(true);
    try {
      let query;
      
      if (selectedLeague !== 'all') {
        const lId = Number(selectedLeague);
        query = db.matches.where('leagueId').anyOf([lId, String(lId)]);
      } else {
        query = db.matches.toCollection();
      }

      let results = await query.toArray();
      
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        results = results.filter(m => 
          m.homeTeam.toLowerCase().includes(term) || 
          m.awayTeam.toLowerCase().includes(term) ||
          m.season.toLowerCase().includes(term)
        );
      }

      // Sort by updatedAt desc
      results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      
      setMatches(results);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [selectedLeague]);

  const handleDelete = async (id: string) => {
    if (confirm('Supprimer ce match de la base locale ?')) {
      await db.matches.delete(id);
      setMatches(matches.filter(m => m.id !== id));
    }
  };

  const filteredMatches = matches;
  const paginatedMatches = filteredMatches.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text"
                placeholder="Rechercher une équipe ou saison..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchMatches()}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-[10px] font-black uppercase tracking-widest text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select 
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded-xl py-2 pl-10 pr-8 text-[10px] font-black uppercase tracking-widest text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 appearance-none"
              >
                <option value="all">Toutes les ligues</option>
                {LEAGUES.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {matches.length} Matchs enregistrés
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-[10px] text-left">
            <thead className="bg-slate-800/50 text-[8px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Saison / Date</th>
                <th className="px-4 py-3">Ligue / Round</th>
                <th className="px-4 py-3">Affiche</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin mx-auto mb-2" />
                    <span className="font-black text-slate-500 uppercase">Chargement...</span>
                  </td>
                </tr>
              ) : paginatedMatches.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <Info className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                    <span className="font-black text-slate-500 uppercase">Aucune donnée trouvée</span>
                  </td>
                </tr>
              ) : (
                paginatedMatches.map(m => (
                  <tr key={m.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="text-slate-100 font-black uppercase truncate max-w-[150px]">{m.season}</div>
                      <div className="text-slate-500 text-[8px] font-bold mt-0.5">{new Date(m.updatedAt).toLocaleDateString()}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-400 font-black uppercase">{LEAGUES.find(l => l.id === m.leagueId)?.name || 'Ligue'}</div>
                      <div className="text-indigo-400 text-[8px] font-black uppercase mt-0.5">Round {m.round}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <img 
                            src={getTeamLogo(m.homeTeam)} 
                            alt="" 
                            className="w-4 h-4 object-contain" 
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                          <span className="font-black text-slate-100 uppercase tracking-tighter truncate">{m.homeTeam}</span>
                        </div>
                        <div className="text-slate-500 font-bold text-[8px] pl-6">vs</div>
                        <div className="flex items-center gap-2">
                          <img 
                            src={getTeamLogo(m.awayTeam)} 
                            alt="" 
                            className="w-4 h-4 object-contain" 
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                          <span className="font-black text-slate-100 uppercase tracking-tighter truncate">{m.awayTeam}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5 font-black text-xs">
                        <span className="text-indigo-400">{m.homeScore || '-'}</span>
                        <span className="text-slate-700">:</span>
                        <span className="text-indigo-400">{m.awayScore || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button 
                        onClick={() => m.id && handleDelete(m.id)}
                        className="p-2 hover:bg-rose-500/10 text-slate-600 hover:text-rose-500 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {matches.length > pageSize && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button 
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-50"
            >
              Précédent
            </button>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Page {page + 1} / {Math.ceil(matches.length / pageSize)}</span>
            <button 
              disabled={(page + 1) * pageSize >= matches.length}
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
