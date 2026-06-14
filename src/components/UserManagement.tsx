import { useState, useEffect } from 'react';
import { 
  Users, 
  Check, 
  BadgeAlert, 
  Trash2, 
  Search, 
  RefreshCw,
  UserCheck,
  UserX,
  Clock,
  ShieldAlert,
  X,
  AlertCircle,
  Download,
  Upload,
  MessageSquare,
  Send,
  Inbox
} from 'lucide-react';

interface UserItem {
  username: string;
  fullName: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  totalUsageSeconds?: number;
  lastActiveAt?: string;
  isOnline?: boolean;
}

interface UserMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  read: boolean;
  createdAt: string;
}

interface UserManagementProps {
  token: string;
}

const formatActiveDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
};

const formatTimeAgo = (isoString?: string) => {
  if (!isoString) return 'Jamais connecté';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 15) return 'À l\'instant';
    if (diffSec < 60) return `Il y a ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Il y a ${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `Il y a ${diffHr}h`;
    const diffDays = Math.floor(diffHr / 24);
    return `Il y a ${diffDays}j`;
  } catch (e) {
    return 'Inconnu';
  }
};

export default function UserManagement({ token }: UserManagementProps) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [confirmState, setConfirmState] = useState<{
    targetUsername: string;
    newStatus: 'approved' | 'rejected' | 'deleted';
  } | null>(null);

  // Messages states
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [messageTarget, setMessageTarget] = useState<string | null>(null); // 'all' or standard username
  const [messageContent, setMessageContent] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showMessagesPanel, setShowMessagesPanel] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Impossible de récupérer les utilisateurs.');
      }
      setUsers(data.users || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    setLoadingMessages(true);
    try {
      const response = await fetch('/api/auth/messages', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Erreur de chargement des messages:", err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageTarget || !messageContent.trim()) return;
    setSendingMessage(true);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch('/api/auth/admin/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ to: messageTarget, content: messageContent })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Erreur lors de l’envoi du message.");
      }
      setSuccess(`Message envoyé à : ${messageTarget === 'all' ? 'tous les utilisateurs (Notification globale)' : messageTarget}`);
      setMessageContent('');
      setMessageTarget(null);
      fetchMessages();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || "Impossible de distribuer le message.");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch(`/api/auth/admin/messages/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression.');
      }
      setSuccess('Message d’administration supprimé de l’historique.');
      fetchMessages();
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateStatus = (targetUsername: string, newStatus: 'approved' | 'rejected' | 'deleted') => {
    setConfirmState({ targetUsername, newStatus });
  };

  const executeUpdateStatus = async (targetUsername: string, newStatus: 'approved' | 'rejected' | 'deleted') => {
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/auth/admin/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUsername, status: newStatus })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour.');
      }

      setUsers(data.users || []);
      
      const successMessage = newStatus === 'approved' 
        ? `Le compte de ${targetUsername} a été approuvé avec succès !`
        : newStatus === 'rejected'
        ? `Le compte de ${targetUsername} a été rejeté.`
        : `Le compte de ${targetUsername} a été définitivement supprimé.`;
      
      setSuccess(successMessage);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de l’opération.');
    } finally {
      setConfirmState(null);
    }
  };

  const handleExportBackup = async () => {
    try {
      setError(null);
      const response = await fetch('/api/auth/admin/export-backup', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Échec de l\'exportation de la base des utilisateurs.');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comptes_mahakasa_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      setSuccess('Sauvegarde exportée avec succès sous format JSON ! Vous pouvez la conserver en lieu sûr.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError('Erreur d\'exportation : ' + err.message);
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setError(null);
        setSuccess(null);
        const text = event.target?.result as string;
        const backupUsers = JSON.parse(text);

        if (!Array.isArray(backupUsers)) {
          throw new Error('Le format du fichier est invalide. Il doit s\'agir d\'un tableau JSON d\'utilisateurs.');
        }

        const response = await fetch('/api/auth/admin/import-backup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ backupUsers })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Échec de l\'importation des comptes');
        }

        setUsers(data.users || []);
        setSuccess(`Restauration réussie ! ${data.count} comptes de la sauvegarde ont été fusionnés.`);
        setTimeout(() => setSuccess(null), 5000);
      } catch (err: any) {
        setError('Erreur de restauration de la sauvegarde : ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  useEffect(() => {
    fetchUsers();
    fetchMessages();
    
    // Auto-refresh user sessions and metrics every 15 seconds
    const interval = setInterval(() => {
      fetchUsers();
    }, 15000);
    
    return () => clearInterval(interval);
  }, [token]);

  // Filters application
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = users.filter(u => u.status === 'pending').length;

  return (
    <div className="p-4 sm:p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4 shadow-xl">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-indigo-600 to-indigo-500 p-2 rounded-lg text-white shadow-md shadow-indigo-500/10">
            <Users className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-100 uppercase tracking-wider leading-none">
              Validation des Comptes
            </h2>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              Contrôle d'accès & Approbation administrative
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Action */}
          <button
            onClick={fetchUsers}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-750 border border-slate-700/50 text-[10px] uppercase font-black tracking-wider transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            Rafraîchir
          </button>

          {/* Export Action */}
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-600/15 hover:bg-amber-600 text-amber-400 hover:text-white border border-amber-600/30 text-[10px] uppercase font-black tracking-wider transition-all cursor-pointer"
            title="Exporter une sauvegarde de tous les comptes d'utilisateurs"
          >
            <Download className="w-3.5 h-3.5" />
            Exporter
          </button>

          {/* Import Action (Hidden Input + Button) */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600/15 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-600/30 text-[10px] uppercase font-black tracking-wider transition-all cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Importer
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </label>

          {/* Messages Panel Toggle Action */}
          <button
            type="button"
            onClick={() => {
              setShowMessagesPanel(!showMessagesPanel);
              fetchMessages();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase font-black tracking-wider transition-all cursor-pointer ${
              showMessagesPanel 
                ? 'bg-indigo-600 text-white' 
                : 'bg-indigo-500/15 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30'
            }`}
            title="Gérer les messages et notifications des utilisateurs"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Messagerie ({messages.length})
          </button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-center gap-3 text-amber-500">
          <BadgeAlert className="w-5 h-5 shrink-0" />
          <div className="text-[10px] uppercase font-black tracking-wider leading-normal">
            Attention : vous avez <strong className="text-amber-400 font-extrabold">{pendingCount}</strong> demande(s) d'inscription en attente de votre validation.
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
          <UserCheck className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {showMessagesPanel && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-top-4 duration-205">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-indigo-400 animate-bounce" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-100">
                Historique & Distribution des Messages
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setMessageTarget('all')}
              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-[9px] font-black uppercase tracking-wider text-white flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/15"
            >
              <MessageSquare className="w-3 h-3" />
              Nouveau message global (All)
            </button>
          </div>

          {loadingMessages ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
              <span className="text-[8.5px] font-black uppercase tracking-widest">Chargement...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center text-slate-500 bg-slate-950/20 border border-slate-800/40 rounded-lg">
              <span className="text-[9px] font-bold uppercase tracking-wider">Aucun message envoyé pour le moment.</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {messages.map(m => (
                <div key={m.id} className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2 flex justify-between items-start gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-bold text-[7.5px] uppercase border border-indigo-500/20">
                        De: {m.from}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[7.5px] font-black uppercase border ${
                        m.to.toLowerCase() === 'all' 
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        À: {m.to === 'all' ? 'Tous (Notification globale)' : m.to}
                      </span>
                      <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">
                        {new Date(m.createdAt).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-[9.5px] text-slate-200 leading-normal font-semibold font-sans whitespace-pre-wrap">
                      {m.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(m.id)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Supprimer le message"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters input row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par nom d'utilisateur ou nom complet..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950/40 border border-slate-800/80 rounded-lg pl-9 pr-4 py-2 text-[10px] sm:text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all font-sans font-semibold"
          />
        </div>

        {/* Status Filter */}
        <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0 shrink-0">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                statusFilter === status 
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md' 
                  : 'bg-slate-950/20 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              {status === 'all' && 'Tous'}
              {status === 'pending' && `En attente (${pendingCount})`}
              {status === 'approved' && 'Approuvés'}
              {status === 'rejected' && 'Rejetés'}
            </button>
          ))}
        </div>
      </div>

      {/* Users table */}
      <div className="bg-slate-950/35 border border-slate-800 rounded-xl overflow-hidden shadow-inner">
        {loading && users.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
            <span className="text-[10px] font-black uppercase tracking-widest">Chargement des comptes...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-1.5 text-slate-500">
            <UserX className="w-7 h-7 text-slate-600" />
            <span className="text-[10px] font-black uppercase tracking-widest">Aucun compte trouvé</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800 text-[8.5px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-4 py-3">Utilisateur</th>
                  <th className="px-4 py-3">Rôle & Nom Complet</th>
                  <th className="px-4 py-3">Usage APK & Connexion</th>
                  <th className="px-4 py-3">Date d'inscription</th>
                  <th className="px-4 py-3">Statut actuel</th>
                  <th className="px-4 py-3 text-right">Actions de Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[10px] font-semibold text-slate-300">
                {filteredUsers.map((user) => {
                  const isMainAdmin = user.username === 'admin';
                  return (
                    <tr key={user.username} className="hover:bg-white/[0.01] transition-colors">
                      {/* Username with real-time online status dot */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="relative">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-[9px] border ${
                              isMainAdmin 
                                ? 'bg-indigo-600 border-indigo-500 text-white' 
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}>
                              {user.username.substring(0, 2).toUpperCase()}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 rounded-full ring-2 ring-slate-950 ${
                              user.isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                            }`} title={user.isOnline ? 'En ligne' : 'Hors ligne'}>
                              {user.isOnline && (
                                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                              )}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-100 uppercase tracking-wide flex items-center gap-1.5 leading-none">
                              {user.username}
                            </span>
                            <span className={`text-[7.5px] font-black uppercase mt-1 tracking-wider leading-none ${
                              user.isOnline ? 'text-emerald-400' : 'text-slate-500'
                            }`}>
                              {user.isOnline ? 'En ligne' : 'Hors ligne'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Full name and user role */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <div className="text-slate-200 font-bold uppercase truncate max-w-[150px]">
                            {user.fullName}
                          </div>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider ${
                            user.role === 'admin' 
                              ? 'bg-indigo-500/10 border border-indigo-505/20 text-indigo-400' 
                              : 'bg-slate-800 border border-slate-705 text-slate-400'
                          }`}>
                            {user.role}
                          </span>
                        </div>
                      </td>

                      {/* Usage APK meter and elapsed connect time */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="font-mono text-[10.5px] font-extrabold text-indigo-100">
                              {formatActiveDuration(user.totalUsageSeconds)}
                            </span>
                          </div>
                          <div className="text-[7.5px] text-slate-500 font-black uppercase tracking-wider pl-5">
                            Actif : {formatTimeAgo(user.lastActiveAt)}
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3.5 text-slate-400 text-[9.5px]">
                        <div className="space-y-0.5">
                          <span className="text-slate-350 font-medium">
                            {new Date(user.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                          <div className="text-[8px] text-slate-500 font-bold uppercase">
                            À {new Date(user.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase tracking-wide inline-flex items-center gap-1.5 border-none ${
                          user.status === 'approved' 
                            ? 'bg-emerald-500/10 text-emerald-400' 
                            : user.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 animate-pulse'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${
                            user.status === 'approved' ? 'bg-emerald-400' : user.status === 'pending' ? 'bg-amber-400' : 'bg-rose-400'
                          }`} />
                          {user.status === 'approved' && 'Validé / Actif'}
                          {user.status === 'pending' && 'En Attente'}
                          {user.status === 'rejected' && 'Rejeté'}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3.5 text-right">
                        {isMainAdmin ? (
                          <span className="text-[7.5px] font-black text-slate-500 uppercase tracking-widest pr-4 select-none">Admin racine</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {user.status !== 'approved' && (
                              <button
                                onClick={() => handleUpdateStatus(user.username, 'approved')}
                                className="p-1 px-2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all text-[8px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                                title="Approuver et activer l'utilisateur"
                              >
                                <Check className="w-3 h-3" />
                                Valider
                              </button>
                            )}

                            {user.status !== 'rejected' && (
                              <button
                                onClick={() => handleUpdateStatus(user.username, 'rejected')}
                                className="p-1 px-2 rounded bg-amber-500/15 text-amber-550 border border-amber-500/20 hover:bg-amber-500 hover:text-white transition-all text-[8px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                                title="Rejeter et interdire d'accès"
                              >
                                <X className="w-3 h-3" />
                                Rejeter
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setMessageTarget(user.username)}
                              className="p-1 px-2 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600 hover:text-white transition-all text-[8px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                              title="Écrire un message personnalisé pour cet utilisateur"
                            >
                              <MessageSquare className="w-3 h-3" />
                              Écrire
                            </button>

                            <button
                              onClick={() => handleUpdateStatus(user.username, 'deleted')}
                              className="p-1.5 rounded text-slate-505 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-[9px] text-slate-500 uppercase leading-relaxed font-bold flex items-start gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
        <span>Les comptes "Rejetés" ne peuvent plus se connecter mais restent visibles pour mémoire. Les comptes "Supprimés" sont effacés de la base de données. Tous les mots de passe sont hachés en mode unilatéral cryptographique (SHA-256).</span>
      </div>

      {/* Confirmation Modal */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-lg shrink-0 ${
                confirmState.newStatus === 'deleted' 
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                  : confirmState.newStatus === 'approved'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {confirmState.newStatus === 'deleted' ? (
                  <Trash2 className="w-5 h-5" />
                ) : confirmState.newStatus === 'approved' ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <X className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">
                  Confirmer l'opération
                </h3>
                <p className="text-[10px] text-slate-300 leading-relaxed font-medium">
                  {confirmState.newStatus === 'deleted' && (
                    <>Êtes-vous sûr de vouloir supprimer définitivement le compte de <strong className="text-white font-black">{confirmState.targetUsername}</strong> ?</>
                  )}
                  {confirmState.newStatus === 'approved' && (
                    <>Voulez-vous approuver et valider le compte de <strong className="text-white font-black">{confirmState.targetUsername}</strong> afin de lui accorder l'accès ?</>
                  )}
                  {confirmState.newStatus === 'rejected' && (
                    <>Voulez-vous rejeter le compte de <strong className="text-white font-black">{confirmState.targetUsername}</strong> ? Son accès sera immédiatemment révoqué.</>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-[9px] uppercase font-bold tracking-wider transition-all cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => executeUpdateStatus(confirmState.targetUsername, confirmState.newStatus)}
                className={`px-3 py-1.5 rounded text-white text-[9px] uppercase font-black tracking-wider transition-all cursor-pointer ${
                  confirmState.newStatus === 'deleted'
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/15'
                    : confirmState.newStatus === 'approved'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/15'
                    : 'bg-amber-600 hover:bg-amber-500 shadow-md shadow-amber-600/15'
                }`}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Message/Notification Compose Modal */}
      {messageTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400 animate-pulse" />
                <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">
                  Nouveau Message / Notification
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMessageTarget(null);
                  setMessageContent('');
                }}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Target Indicator */}
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Destinataire</span>
                <div className="px-3 py-1.5 rounded bg-slate-950/50 border border-slate-800 text-[9.5px] font-bold text-slate-300 uppercase">
                  {messageTarget === 'all' ? (
                    <span className="text-amber-400">🚨 Tous les utilisateurs (Notification Globale)</span>
                  ) : (
                    <span>👤 {messageTarget}</span>
                  )}
                </div>
              </div>

              {/* Message Input */}
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase text-slate-500 tracking-wider block font-black">Message</label>
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Écrivez votre message ici... Il s'affichera directement sur le tableau de bord de l'utilisateur."
                  rows={4}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 font-semibold leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
              <button
                type="button"
                onClick={() => {
                  setMessageTarget(null);
                  setMessageContent('');
                }}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-[9px] uppercase font-bold tracking-wider transition-all cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={sendingMessage || !messageContent.trim()}
                className="px-3.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[9px] uppercase font-black tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-600/15"
              >
                {sendingMessage ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin animate-duration-1000" />
                    Envoi...
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3" />
                    Distribuer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
