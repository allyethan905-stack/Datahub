import React, { useState, useEffect } from 'react';
import { Brain, Sparkles, ChevronRight } from 'lucide-react';
import { getTeamLogo } from '../lib/logos';

interface AIFormPatternAssistantProps {
  rankings: any[];
  results: any[];
  getFullForm: (teamName: string) => string[];
}

export default function AIFormPatternAssistant({
  rankings,
  results,
  getFullForm
}: AIFormPatternAssistantProps) {
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [activeTab, setActiveTab2] = useState<'top' | 'manual'>('top');
  const [expandedTrace, setExpandedTrace] = useState<boolean>(true);

  // Core pattern analyzer
  const analyzePattern = (_teamName: string, history: string[]) => {
    if (!history || history.length === 0) {
      return {
        score: 0,
        patternName: 'Données insuffisantes',
        prediction: 'Inconnu',
        actionTip: 'Pas d\'historique',
        trace: ['Pas d\'historique disponible pour exécuter l\'algorithme de déchiffrage.'],
        winPct: 0, drawPct: 0, lossPct: 0,
        currentStreak: { type: 'None', count: 0 },
        recommendation: 'Attendre plus de matchs',
        gradient: 0
      };
    }

    const n = history.length;
    const wins = history.filter(x => x === 'Won').length;
    const draws = history.filter(x => x === 'Draw').length;
    const losses = history.filter(x => x === 'Lost').length;

    const winPct = Math.round((wins / n) * 100);
    const drawPct = Math.round((draws / n) * 100);
    const lossPct = Math.round((losses / n) * 100);

    // Calculate current streak
    let streakType = history[0];
    let streakCount = 0;
    for (let i = 0; i < n; i++) {
      if (history[i] === streakType) {
        streakCount++;
      } else {
        break;
      }
    }

    // Direct transition rate
    let transitionCount = 0;
    for (let i = 0; i < n - 1; i++) {
      if (history[i] !== history[i + 1]) {
        transitionCount++;
      }
    }
    const transitionRate = n > 1 ? Math.round((transitionCount / (n - 1)) * 100) : 0;

    // Last 5 and Last 10 weightings for dynamic acceleration
    const sub5 = history.slice(0, 5);
    const sub10 = history.slice(0, 10);

    const w5 = sub5.filter(x => x === 'Won').length;
    const d5 = sub5.filter(x => x === 'Draw').length;
    const pts5 = w5 * 3 + d5 * 1;
    const maxPts5 = Math.max(1, sub5.length * 3);
    const power5 = pts5 / maxPts5;

    const w10 = sub10.filter(x => x === 'Won').length;
    const d10 = sub10.filter(x => x === 'Draw').length;
    const pts10 = w10 * 3 + d10 * 1;
    const maxPts10 = Math.max(1, sub10.length * 3);
    const power10 = pts10 / maxPts10;

    const ptsOverall = wins * 3 + draws * 1;
    const powerOverall = ptsOverall / (n * 3);

    // Form acceleration (gradient)
    const formGradient = parseFloat((power5 - power10).toFixed(3));

    // Entropy calculation
    const pW = wins / n;
    const pD = draws / n;
    const pL = losses / n;
    const calcEntropy = (p: number) => p > 0 ? -p * Math.log2(p) : 0;
    const shannonEntropy = calcEntropy(pW) + calcEntropy(pD) + calcEntropy(pL);
    // entropy is maximum (1.585 for 3 states) when uniformly distributed.
    // Predictability score is highest when entropy is low.
    const normalizedEntropy = shannonEntropy / 1.585;
    const entropyPredictability = Math.max(0, 100 - Math.round(normalizedEntropy * 50));

    // Calculating the "Readability score" (Indice de Lisibilité)
    const outcomeBias = Math.max(pW, pD, pL);
    let streakBonus = Math.min(30, streakCount * 6);
    if (streakType === 'Lost') streakBonus *= 0.8;

    let cycleFactor = 0;
    let patternClass = 'Latéralisation Neutre';
    let suggestion = 'Chance Double (1X ou X2)';
    let actionTip = 'Pari Neutre';

    if (transitionRate > 75) {
      cycleFactor = 28;
      patternClass = 'Oscillateur Harmonique Alternant 🔄';
      suggestion = 'Double chance (12) ou Moins de 2.5 buts. Le club alterne constamment ses issues.';
      actionTip = 'Pari Conseillé: 12 (Double chance sans nul)';
    } else if (streakCount >= 4) {
      cycleFactor = 32;
      patternClass = streakType === 'Won' ? 'Impulsion Ascendante Robuste 🚀' : 'Spirale Baissière Linéaire ⚠️';
      suggestion = streakType === 'Won' ? 'Victoire Directe attendue. Série continue solide.' : 'Prudence : Tendance très baissière (conseil handicap adverse).';
      actionTip = streakType === 'Won' ? 'Pari Conseillé: Victoire Simple' : 'Pari Conseillé: Double Chance Adverse';
    } else if (winPct >= 62) {
      patternClass = 'Domination Globale Structurée 🛡️';
      suggestion = `Forte régularité de victoires (${winPct}%). Pari victoire sèche ou over goals.`;
      actionTip = 'Pari Conseillé: Victoire Simple';
    } else if (lossPct >= 58) {
      patternClass = 'Profil Défaillant Récurrent 📉';
      suggestion = `Risque élevé de revers. Pari double chance adverse ou handicap.`;
      actionTip = 'Pari Conseillé: Cover adverse';
    } else if (drawPct >= 38) {
      patternClass = 'Tunnel Stagnant / Spécialiste Nuls ⏳';
      cycleFactor = 16;
      suggestion = 'Forte propension au partage des points. Pari moins de 2.5 buts ou Nul (X) spéculatif.';
      actionTip = 'Pari Conseillé: Moins de 2.5 buts';
    } else if (formGradient > 0.16) {
      patternClass = 'Accélération de Gradient Positive 📈';
      cycleFactor = 18;
      suggestion = `Forme récente en amélioration rapide (+${Math.round(formGradient * 100)}% de points de forme cumulés).`;
      actionTip = 'Pari Conseillé: Double chance club';
    } else if (formGradient < -0.16) {
      patternClass = 'Décélération de Gradient Sévère 📉';
      cycleFactor = 18;
      suggestion = `Fléchissement prononcé des résultats récemment (-${Math.round(Math.abs(formGradient) * 100)}%).`;
      actionTip = 'Pari Conseillé: Double chance contre';
    } else {
      patternClass = 'Comportement Hybride Indéterminé ❌';
      suggestion = 'Séquence mixte instable. Analyse incertaine, préférable de s\'abstenir.';
      actionTip = 'Pas de pari conseillé';
    }

    const baselineReadability = Math.round(outcomeBias * 45) + streakBonus + cycleFactor + (Math.abs(formGradient) * 22) + (entropyPredictability * 0.15);
    const readabilityIndex = Math.min(97, Math.max(38, Math.round(baselineReadability)));

    // Constructing step-by-step trace elements
    const traceSteps = [
      `[MEM_INIT] Lecture des données de forme. Échantillon collecté : N = ${n} rounds enregistrés.`,
      `[MATH_1] Vecteur de probabilités : P_Win = ${(wins/n).toFixed(2)}, P_Draw = ${(draws/n).toFixed(2)}, P_Loss = ${(losses/n).toFixed(2)}.`,
      `[MATH_2] Indice d'Entropie de Shannon normalisé : H = ${shannonEntropy.toFixed(3)} (Lisibilité structurelle = ${entropyPredictability}%).`,
      `[GRAD_3] Force mobile : Globale = ${(powerOverall * 3).toFixed(2)} pts/match | J10 = ${(power10 * 3).toFixed(2)} pts/match | J5 = ${(power5 * 3).toFixed(2)} pts/match.`,
      `[GRAD_4] Gradient de forme Δ(J5-J10) = ${formGradient > 0 ? '+' : ''}${formGradient} (${formGradient >= 0 ? 'Améliorations cinétiques' : 'Régression observée'}).`,
      `[SEQ_5] Transition de chaîne : Fréquence de transition alternée = ${transitionRate}%. Série actuelle : ${streakCount} occurrences de "${streakType === 'Won' ? 'Won' : streakType === 'Lost' ? 'Lost' : 'Draw'}".`,
      `[SYS_PRED] Combinaisons : outcomeBias(${Math.round(outcomeBias * 45)}) + streakBonus(${Math.round(streakBonus)}) + cycleBonus(${cycleFactor}) + gradAdj(${Math.round(Math.abs(formGradient)*22)}).`,
      `[EXPLOIT] Synthèse générée avec succès. Motif indexé : "${patternClass}". Indice de Lisibilité R total = ${readabilityIndex}%.`
    ];

    return {
      score: readabilityIndex,
      patternName: patternClass,
      prediction: suggestion,
      actionTip,
      trace: traceSteps,
      winPct, drawPct, lossPct,
      currentStreak: { type: streakType, count: streakCount },
      gradient: formGradient
    };
  };

  // Precompute all teams' analyses
  const sortedAnalyses = React.useMemo(() => {
    return rankings
      .map(team => {
        const name = team.name || team.teamName;
        const hist = getFullForm(name);
        return {
          teamName: name,
          logo: getTeamLogo(name),
          history: hist,
          analysis: analyzePattern(name, hist)
        };
      })
      .sort((a, b) => b.analysis.score - a.analysis.score);
  }, [rankings, results]);

  // Set default selected team if not set
  useEffect(() => {
    if (sortedAnalyses.length > 0 && !selectedTeam) {
      setSelectedTeam(sortedAnalyses[0].teamName);
    }
  }, [sortedAnalyses, selectedTeam]);

  const activeManualAnalysis = React.useMemo(() => {
    return sortedAnalyses.find(x => x.teamName === selectedTeam) || sortedAnalyses[0];
  }, [selectedTeam, sortedAnalyses]);

  const top3 = sortedAnalyses.slice(0, 3);

  return (
    <div className="bg-gradient-to-br from-indigo-950/50 via-slate-900/60 to-slate-950/50 rounded-2xl border border-indigo-500/20 p-4 shadow-xl mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/5 pb-3.5 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-500/10 p-2 rounded-xl border border-indigo-500/20 shadow-md">
            <Brain className="w-5 h-5 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xs font-black text-slate-100 uppercase tracking-widest">Analyseur de Patterns</h2>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-1 bg-slate-950/60 p-1 rounded-lg border border-white/5 shrink-0 self-start md:self-auto">
          <button
            onClick={() => setActiveTab2('top')}
            type="button"
            className={`px-3 py-1.5 rounded-md font-black text-[9px] uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'top'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🏆 Modèles Prédictibles
          </button>
          <button
            onClick={() => setActiveTab2('manual')}
            type="button"
            className={`px-3 py-1.5 rounded-md font-black text-[9px] uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🔍 Détecteur Libre
          </button>
        </div>
      </div>

      {activeTab === 'top' ? (
        <div className="space-y-3">
          <p className="text-[10px] text-slate-400 leading-normal font-medium">
            Clubs à forte régularité séquentielle (indice de lisibilité élevé).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {top3.map((item, index) => (
              <div 
                key={index}
                onClick={() => {
                  setSelectedTeam(item.teamName);
                  setActiveTab2('manual');
                }}
                className="bg-slate-950/40 hover:bg-slate-950/75 p-3 rounded-xl border border-white/[0.04] hover:border-indigo-500/30 cursor-pointer transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/[0.03]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <img src={item.logo} className="w-4 h-4 object-contain shrink-0" alt="" />
                      <span className="text-[10px] font-black text-slate-100 uppercase truncate pr-1">{item.teamName}</span>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-[6.5px] text-indigo-400 font-extrabold uppercase leading-none">Indice R</span>
                      <span className="text-[11px] font-mono font-black text-emerald-400 leading-none mt-0.5">{item.analysis.score}%</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="text-[7px] text-slate-500 font-black uppercase block leading-none mb-1">Pattern identifié</span>
                      <span className="text-[8px] font-bold text-indigo-300 uppercase block line-clamp-1 leading-normal">{item.analysis.patternName}</span>
                    </div>

                    <div className="flex items-center gap-0.5 overflow-x-auto pb-1 no-scrollbar">
                      {item.history.slice(0, 10).map((res: string, i: number) => (
                        <div key={i} className={`w-2 h-2 shrink-0 rounded-[1.2px] flex items-center justify-center text-[4.5px] font-black text-white ${
                          res === 'Won' ? 'bg-emerald-500' :
                          res === 'Lost' ? 'bg-rose-500' :
                          'bg-slate-600'
                        }`}>
                          {res === 'Won' ? 'V' : res === 'Lost' ? 'D' : 'N'}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-white/[0.03] flex items-center justify-between">
                  <span className="text-[7.5px] text-emerald-400 font-black uppercase tracking-wider">{item.analysis.actionTip}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-white/5">
            <span className="text-[9.5px] font-extrabold text-slate-300 uppercase tracking-wide">Sélectionner une équipe pour décoder sa structure :</span>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded px-2.5 py-1 text-[9.5px] text-slate-100 font-black uppercase cursor-pointer focus:outline-none focus:border-indigo-500 max-w-xs"
            >
              {sortedAnalyses.map((t, idx) => (
                <option key={idx} value={t.teamName}>
                  {t.teamName} (Lisibilité: {t.analysis.score}%)
                </option>
              ))}
            </select>
          </div>

          {activeManualAnalysis && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column: Metrics & Recommendation */}
              <div className="lg:col-span-5 space-y-3">
                <div className="bg-slate-950/45 p-3 rounded-xl border border-white/[0.03] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={activeManualAnalysis.logo} className="w-8 h-8 object-contain shrink-0" alt="" />
                    <div className="min-w-0">
                      <h4 className="text-[11px] font-black text-slate-100 uppercase tracking-wide truncate">{activeManualAnalysis.teamName}</h4>
                      <p className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">Échantillon : {activeManualAnalysis.history.length} matchs</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[6.5px] text-indigo-400 font-black uppercase block tracking-widest leading-none">LISIBILITÉ R</span>
                    <span className="text-[20px] font-mono font-black text-emerald-400 leading-none mt-1 block">{activeManualAnalysis.analysis.score}%</span>
                  </div>
                </div>

                <div className="bg-slate-950/45 p-3 rounded-xl border border-white/[0.03] space-y-2.5 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div>
                      <span className="text-[7.5px] text-slate-500 font-black uppercase tracking-wider block mb-1">Alignement Actuel (Série)</span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-[2.5px] text-[8px] font-black text-white ${
                          activeManualAnalysis.analysis.currentStreak.type === 'Won' ? 'bg-emerald-500' :
                          activeManualAnalysis.analysis.currentStreak.type === 'Lost' ? 'bg-rose-500' : 'bg-slate-600'
                        }`}>
                          {activeManualAnalysis.analysis.currentStreak.type === 'Won' ? 'Victoire' : activeManualAnalysis.analysis.currentStreak.type === 'Lost' ? 'Défaite' : 'Nul'}
                        </span>
                        <span className="text-[9px] text-slate-300 font-bold bg-white/5 px-2 py-0.5 rounded border border-white/[0.03] font-mono">{activeManualAnalysis.analysis.currentStreak.count} matches consécutifs</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[7.5px] text-slate-500 font-black uppercase tracking-wider block mb-1">Dispersion des Résultats</span>
                      <div className="flex items-center gap-3 text-[9.5px] font-mono bg-slate-950/30 p-1.5 rounded border border-white/[0.02]">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                          <span className="text-emerald-400 font-bold">V: {activeManualAnalysis.analysis.winPct}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
                          <span className="text-slate-400 font-bold">N: {activeManualAnalysis.analysis.drawPct}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-rose-500 rounded-full"></div>
                          <span className="text-rose-400 font-bold">D: {activeManualAnalysis.analysis.lossPct}%</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <span className="text-[7.5px] text-slate-500 font-black uppercase tracking-wider block mb-0.5">Signature Chartist</span>
                      <span className="text-[9.5px] font-black text-indigo-300 uppercase block">{activeManualAnalysis.analysis.patternName}</span>
                    </div>
                  </div>

                  <div className="bg-indigo-500/5 p-2 rounded-lg border border-indigo-500/10 space-y-1 mt-1">
                    <span className="text-[6.5px] text-indigo-400 font-black uppercase tracking-widest block font-sans">Loi de Transition Extrapolée</span>
                    <p className="text-[8.5px] text-slate-300 font-bold tracking-tight leading-normal">{activeManualAnalysis.analysis.prediction}</p>
                    <span className="text-[8.5px] text-emerald-400 font-black uppercase block pt-0.5 border-t border-white/[0.03] mt-1">{activeManualAnalysis.analysis.actionTip}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Mathematical debugging trace output */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <div className="bg-slate-950/70 rounded-xl border border-white/5 p-3 font-mono text-[7.5px] h-full flex flex-col justify-between">
                  <div>
                    <div 
                      onClick={() => setExpandedTrace(!expandedTrace)}
                      className="flex items-center justify-between cursor-pointer border-b border-white/5 pb-2 mb-2 select-none group"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-[7.5px] font-black text-slate-100 uppercase tracking-widest">Trace d'Exécution Chartist</span>
                      </div>
                      <span className="text-[6.5px] font-extrabold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 uppercase tracking-widest group-hover:bg-indigo-500/25">
                        {expandedTrace ? 'Cacher' : 'Afficher'}
                      </span>
                    </div>

                    {expandedTrace && (
                      <div className="space-y-1.5 text-slate-300 leading-relaxed font-semibold max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                        {activeManualAnalysis.analysis.trace.map((step, si) => {
                          const isHeader = step.includes('[EXPLOIT]') || step.includes('[MEM_INIT');
                          return (
                            <div 
                              key={si} 
                              className={`p-1.5 rounded-[3px] border transition-all duration-150 ${
                                isHeader 
                                  ? 'bg-indigo-500/10 border-indigo-500/15 text-indigo-300 font-black font-sans' 
                                  : 'bg-white/[0.01] border-white/[0.03] hover:bg-white/[0.02]'
                              }`}
                            >
                              <span className="text-[6.5px] text-slate-500 font-bold block mb-0.5">ALGO_LINE {101 + si * 13} :</span>
                              <span>{step}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[7px] text-slate-500 font-bold font-sans">
                    <span>MODELE: PROBABILITÉS CONDITIONNELLES + GRADIENT DELTA</span>
                    <span className="text-emerald-400 font-mono font-bold font-mono">CALCULATED: LIVE</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
