import { useRef, useState } from 'react';
import { Calculator, TrendingUp, BarChart3, Clock, AlertCircle, Download, FileBarChart, RefreshCw, FileText, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CalculatorStats } from '../shared/constants';

interface CalculatorMenuProps {
  stats: Record<number, CalculatorStats>;
  leagueName: string;
  onReset?: () => void;
}

const COLORS = {
  favoriGagnant: '#10b981', // Emerald 500
  defaiteFavori: '#f43f5e', // Rose 500
  anomalieCorrecte: '#f59e0b', // Amber 500
  anomalieFausse: '#8b5cf6', // Violet 500
  nulle: '#64748b', // Slate 500
};

const CATEGORY_LABELS = {
  favoriGagnant: 'Favori Gagnant',
  defaiteFavori: 'Défaite Favori',
  anomalieCorrecte: 'Anomalie Correcte',
  anomalieFausse: 'Anomalie Fausse',
  nulle: 'Nulle',
};

export default function CalculatorMenu({ stats, leagueName, onReset }: CalculatorMenuProps) {
  const sortedRounds = Object.values(stats).sort((a, b) => b.round - a.round);
  const roundRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const handleExport = async (round: number) => {
    const node = roundRefs.current[round];
    if (!node) return;

    try {
      const dataUrl = await toPng(node, {
        backgroundColor: '#0f172a',
        style: {
          borderRadius: '16px',
        }
      });
      const link = document.createElement('a');
      link.download = `stats-${leagueName}-round-${round}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleExportPDF = async () => {
    if (sortedRounds.length === 0) return;
    setIsExportingPDF(true);

    try {
      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for better table fit
      const margin = 10;
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(`RAPPORT CALCULATEUR: ${leagueName.toUpperCase()}`, margin, 15);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Généré le: ${new Date().toLocaleString()}`, margin, 25);
      doc.text(`Ligue: ${leagueName} | Total Rounds: ${sortedRounds.length}`, margin, 30);

      const tableData = sortedRounds.map(r => {
        const getVal = (key: string) => {
          const cat = r.categories?.[key as keyof typeof r.categories] || { sum: 0, count: 0 };
          return `${cat.sum.toFixed(2)} (${cat.count})`;
        };

        return [
          `J${r.round}`,
          getVal('favoriGagnant'),
          getVal('defaiteFavori'),
          getVal('anomalieCorrecte'),
          getVal('anomalieFausse'),
          getVal('nulle'),
          r.sumOdds.toFixed(2),
          r.matchCount.toString()
        ];
      });

      autoTable(doc, {
        startY: 40,
        head: [[
          'Round', 
          'Favori Gagnant (S/Q)', 
          'Défaite Favori (S/Q)', 
          'Anomalie Corr. (S/Q)', 
          'Anomalie Fausse (S/Q)', 
          'Nulle (S/Q)', 
          'Somme Totale (S)', 
          'Matchs'
        ]],
        body: tableData,
        theme: 'striped',
        headStyles: { 
          fillColor: [79, 70, 229], 
          fontSize: 8, 
          halign: 'center',
          fontStyle: 'bold'
        },
        styles: { 
          fontSize: 8, 
          cellPadding: 3,
          halign: 'center'
        },
        columnStyles: {
          0: { fontStyle: 'bold', halign: 'left' },
          6: { fontStyle: 'bold', textColor: [16, 185, 129] },
          7: { fontStyle: 'bold' }
        },
        // Force 10 rounds per page if requested, or just let it flow?
        // The user asked for "au moins 10 rounds par page". A standard table does this naturally.
        // To be safe and respect the "10 rounds" vibe, we can add a bit of spacing.
        margin: { top: 40 },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(
            `Page ${doc.getNumberOfPages()}`, 
            pageWidth - 20, 
            doc.internal.pageSize.getHeight() - 10
          );
        }
      });

      doc.save(`Rapport-Calculateur-${leagueName}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF Export failed:', err);
      alert("Erreur lors de l'exportation PDF.");
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleGlobalExport = async () => {
    const node = document.getElementById('calculator-content');
    if (!node) return;

    try {
      const dataUrl = await toPng(node, {
        backgroundColor: '#0f172a',
        style: {
          padding: '20px',
          borderRadius: '24px',
        }
      });
      const link = document.createElement('a');
      link.download = `full-report-${leagueName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Global export failed:', err);
    }
  };

  return (
    <div id="calculator-content" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/50 p-6 rounded-2xl border border-slate-800/50 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
            <Calculator className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Calculateur: {leagueName}</h1>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Somme des cotes gagnantes par round</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {onReset && (
            <button
              onClick={onReset}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all border border-red-500/20 active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Réinitialiser</span>
            </button>
          )}
          <div className="flex items-center gap-3 bg-slate-950/50 px-4 py-2 rounded-xl border border-slate-800">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Calcul en temps réel</div>
          </div>
          <button
            onClick={handleExportPDF}
            disabled={isExportingPDF || sortedRounds.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all border border-emerald-500/20 active:scale-95 shadow-lg shadow-emerald-900/20"
          >
            {isExportingPDF ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            <span className="text-[10px] font-black uppercase tracking-widest">Exporter PDF</span>
          </button>
          <button
            onClick={handleGlobalExport}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Rapport Image</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      {sortedRounds.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-800">
          <div className="bg-slate-800 p-4 rounded-full mb-4">
            <BarChart3 className="w-8 h-8 text-slate-600" />
          </div>
          <h3 className="text-slate-300 font-black uppercase tracking-widest text-sm">Aucune donnée chaude</h3>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2">
            Lancez une extraction pour voir les statistiques apparaître ici.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Summary Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800/50 backdrop-blur-xl">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Statistiques Globales
            </h3>
            <div className="space-y-4">
              <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-black mb-1">Rounds Analysés</div>
                <div className="text-2xl font-black text-white">{sortedRounds.length}</div>
              </div>
              <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-black mb-1">Moyenne Somme (S)</div>
                <div className="text-2xl font-black text-indigo-400">
                  {sortedRounds.length > 0 
                    ? (sortedRounds.reduce((acc, curr) => acc + curr.sumOdds, 0) / sortedRounds.length).toFixed(2)
                    : '0.00'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/10 p-6 rounded-2xl border border-amber-500/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black text-amber-500 uppercase tracking-wider mb-1">Information</h4>
                <p className="text-[10px] text-amber-200/70 leading-relaxed font-medium">
                  Les calculs sont effectués automatiquement dès qu'un score est détecté lors de l'extraction. 
                  La somme (S) correspond à l'addition des cotes des résultats finaux (1, N ou 2).
                  Les cotes des matchs nuls (X) sont incluses.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Rounds List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 gap-6">
            {sortedRounds.map((round) => {
              const pieData = Object.entries(round.categories || {}).map(([key, value]) => ({
                  name: CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS],
                  value: value.sum,
                  key: key
                })).filter(d => d.value > 0);

                const barData = Object.entries(round.categories || {}).map(([key, value]) => ({
                  name: CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS].split(' ')[0], // Short name for X axis
                  fullName: CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS],
                  count: value.count,
                  key: key
                }));

                return (
                  <div 
                    key={round.round} 
                    ref={el => { roundRefs.current[round.round] = el; }}
                    className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800/50 hover:border-indigo-500/30 transition-all group relative overflow-hidden"
                  >
                    {/* Background Accent */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[80px] -mr-16 -mt-16 pointer-events-none" />
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 relative z-10">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 group-hover:border-indigo-500/50 transition-all duration-500 shadow-lg shadow-indigo-500/5">
                          <span className="text-lg font-black text-indigo-400">J{round.round}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[8px] font-black uppercase tracking-widest rounded-full border border-indigo-500/20">
                              Saison Active
                            </span>
                            <div className="flex items-center gap-1 text-[9px] text-slate-500 font-black uppercase">
                              <Clock className="w-3 h-3" />
                              {new Date(round.lastUpdate).toLocaleTimeString()}
                            </div>
                          </div>
                          <h2 className="text-xl font-black text-white uppercase tracking-tighter leading-none">Journée {round.round}</h2>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="bg-slate-950/80 backdrop-blur-md p-3 rounded-xl border border-slate-800 min-w-[130px] shadow-inner">
                          <div className="text-[8px] text-slate-500 uppercase font-black mb-1 flex items-center gap-1">
                            <TrendingUp className="w-2.5 h-2.5" /> Somme des Cotes (S)
                          </div>
                          <div className="text-2xl font-black text-emerald-400 tabular-nums">{round.sumOdds.toFixed(2)}</div>
                        </div>
                        <div className="bg-slate-950/80 backdrop-blur-md p-3 rounded-xl border border-slate-800 min-w-[90px] shadow-inner">
                          <div className="text-[8px] text-slate-500 uppercase font-black mb-1 flex items-center gap-1">
                            <FileBarChart className="w-2.5 h-2.5" /> Matchs
                          </div>
                          <div className="text-2xl font-black text-white tabular-nums">{round.matchCount}</div>
                        </div>
                        <button
                          onClick={() => handleExport(round.round)}
                          className="flex items-center gap-2 px-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/20 active:scale-95 group/btn"
                          title="Exporter les graphiques"
                        >
                          <Download className="w-4 h-4 group-hover/btn:bounce" />
                          <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Exporter</span>
                        </button>
                      </div>
                    </div>

                    {/* Charts Section */}
                    <div className="mt-4 pt-8 border-t border-slate-800/50 grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                      {/* Pie Chart: Sum of Odds */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                            Répartition des cotes (Somme)
                          </h4>
                        </div>
                        <div className="h-[280px] w-full bg-slate-950/30 rounded-2xl p-4 border border-slate-800/30">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={90}
                                paddingAngle={8}
                                dataKey="value"
                                stroke="none"
                              >
                                {pieData.map((entry, index) => (
                                  <Cell 
                                    key={`cell-${index}`} 
                                    fill={COLORS[entry.key as keyof typeof COLORS]}
                                    className="hover:opacity-80 transition-opacity cursor-pointer"
                                  />
                                ))}
                              </Pie>
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                                  border: '1px solid rgba(30, 41, 59, 0.5)', 
                                  borderRadius: '12px',
                                  backdropFilter: 'blur(8px)',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                }}
                                itemStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                              />
                              <Legend 
                                verticalAlign="bottom" 
                                height={40}
                                iconType="circle"
                                iconSize={8}
                                formatter={(value) => <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider ml-1">{value}</span>}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Bar Chart: Count of Matches */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                            Nombre de matchs par origine
                          </h4>
                        </div>
                        <div className="h-[280px] w-full bg-slate-950/30 rounded-2xl p-4 border border-slate-800/30">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.3} />
                              <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 9, fontWeight: '900' }}
                              />
                              <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 9, fontWeight: '900' }}
                                allowDecimals={false}
                              />
                              <Tooltip 
                                cursor={{ fill: '#1e293b', opacity: 0.2 }}
                                contentStyle={{ 
                                  backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                                  border: '1px solid rgba(30, 41, 59, 0.5)', 
                                  borderRadius: '12px',
                                  backdropFilter: 'blur(8px)'
                                }}
                                itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                                labelStyle={{ display: 'none' }}
                                formatter={(value: any, _name: any, props: any) => [value, props.payload.fullName]}
                              />
                              <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={35}>
                                {barData.map((entry, index) => (
                                  <Cell 
                                    key={`cell-${index}`} 
                                    fill={COLORS[entry.key as keyof typeof COLORS]}
                                    className="hover:opacity-80 transition-opacity cursor-pointer"
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
