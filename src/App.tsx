import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "motion/react";
import {
  Database,
  Trophy,
  Activity,
  Loader2,
  AlertCircle,
  LogIn,
  RefreshCw,
  Calculator,
  X,
  ShieldCheck,
  Clock,
  History,
  TrendingUp,
  ChevronRight,
  Sparkles,
  Brain,
  AlertTriangle,
  Download,
  Trash2,
  ArrowLeftRight,
  Search,
  Gift,
  Users,
  MessageSquare,
  Inbox,
  Lock,
  Layers,
} from "lucide-react";
import {
  LEAGUES,
  MatchData,
  generateMatchId,
  getDailySeason,
  CalculatorStats,
  formatSeason,
} from "./shared/constants";
import { getTeamLogo, getLeagueFlag } from "./lib/logos";
import { fetchWithRetry, fetchRoundPlayout, safeParseJSON } from "./lib/api";
import DataExtractionMenu from "./components/DataExtractionMenu";
import LocalDatabaseIndependent from "./components/LocalDatabaseIndependent";
import CalculatorMenu from "./components/CalculatorMenu";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import UpcomingRoundsView from "./components/UpcomingRoundsView";
import { findHistoricalMatches, db } from "./services/localArchive";
import AIFormPatternAssistant from "./components/AIFormPatternAssistant";
import { LasaView } from "./components/LasaView";
import UserManagement from "./components/UserManagement";
import MatchCard, { ScrollableFormList } from "./components/MatchCard";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Bot Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
          <h1 className="text-xl font-black text-slate-100 uppercase tracking-tighter mb-2">
            Une erreur est survenue
          </h1>
          <p className="text-xs text-slate-400 font-medium max-w-xs mb-6">
            L'application a rencontré un problème inattendu. Veuillez rafraîchir
            la page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all"
          >
            Rafraîchir
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

import {
  cleanTeamName,
  areTeamsEqual,
  getMatchOddsParsed,
  getMatchAnomalyParsed,
  extractOddsGlobal,
} from "./utils/anomaly";
export {
  cleanTeamName,
  areTeamsEqual,
  getMatchOddsParsed,
  getMatchAnomalyParsed,
  extractOddsGlobal,
};

function getTeamName(team: any) {
  if (!team) return "-";
  if (typeof team === "string") return team;
  return team.name || team.teamName || team.shortName || "Équipe";
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [activeTab, setActiveTab] = useState<
    | "matches"
    | "lasa"
    | "standings"
    | "results"
    | "extraction"
    | "calculator"
    | "local_db"
    | "upcoming"
    | "bot"
    | "users"
  >("matches");

  // Bot States
  const [botEnabled, setBotEnabled] = useState(false);
  const [botSettings, setBotSettings] = useState({
    stake: 500, // Ariary
    minOdds: 1.25,
    maxOdds: 2.5,
    strategy: "safe" as "safe" | "risky" | "balanced" | "anomaly",
    maxDailyBets: 10,
    leagues: LEAGUES.map((l) => l.id),
    checkInterval: 5, // Default polling interval: 5 seconds
    allowSimultaneous: true, // Place multiple matching bets in parallel
  });
  const [botLogs, setBotLogs] = useState<any[]>([]);
  const [dailyBetsCount, setDailyBetsCount] = useState(0);
  const botIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);

  const addBotLog = (
    message: string,
    type: "info" | "success" | "error" | "warning" = "info",
  ) => {
    const uniqueSuffix = Math.random().toString(36).substring(2, 9);
    const newLog = {
      id: `${Date.now()}-${uniqueSuffix}`,
      timestamp: new Date().toLocaleTimeString("mg-MG"),
      message,
      type,
    };
    setBotLogs((prev) => [newLog, ...prev].slice(0, 50));
  };

  const fetchBet261 = async (url: string, options: any = {}) => {
    const account = bet261AccountRef.current;
    const headers = { ...(options.headers || {}) };

    // Inject automatically if we have some token in account
    if (account && account.access_token) {
      if (!headers["Authorization"]) {
        headers["Authorization"] = `Bearer ${account.access_token}`;
      }
      if (!headers["X-Operator-Id"] && !headers["x-operator-id"]) {
        headers["X-Operator-Id"] = account.operatorId || "34";
      }
      if (account.saved_cookies) {
        headers["X-Bet261-Cookie"] = account.saved_cookies;
      }
    }

    options.headers = headers;
    let res = await fetch(url, options);

    if (res.status === 401 || res.status === 403) {
      console.warn(
        `[fetchBet261] Received ${res.status}. Attempting auto-relogin if credentials exist.`,
      );
      const savedCredsStr = localStorage.getItem("bet261_credentials");
      if (savedCredsStr) {
        try {
          const creds = JSON.parse(savedCredsStr);
          if (creds.username && creds.password && creds.autoReconnect) {
            addBotLog(
              `Fidirana ho azy: Mamerina ny fidirana amin'ny Bet261 ho an'ny ${creds.username}...`,
              "warning",
            );

            const accountDataStr = localStorage.getItem("bet261_account");
            let preferredVariant = undefined;
            if (accountDataStr) {
              try {
                const accData = JSON.parse(accountDataStr);
                if (accData.workingVariant) {
                  preferredVariant = accData.workingVariant;
                }
              } catch (e) {}
            }

            const loginRes = await fetch("/api/bet261/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username: creds.username,
                password: creds.password,
                preferredVariant,
              }),
            });
            if (loginRes.ok) {
              const data = await safeParseJSON(loginRes);
              setBet261Account(data);
              localStorage.setItem("bet261_account", JSON.stringify(data));
              bet261AccountRef.current = data;
              addBotLog(
                "Voaverina soamantsara ny fidirana amin'ny Bet261 ho an'ny Bot Mahakasa!",
                "success",
              );

              // Clone options and update headers with new token/cookie
              const retryOptions = { ...options };
              const retryHeaders = { ...(retryOptions.headers || {}) };
              retryHeaders["Authorization"] = `Bearer ${data.access_token}`;
              retryHeaders["X-Operator-Id"] = data.operatorId || "34";
              if (data.saved_cookies) {
                retryHeaders["X-Bet261-Cookie"] = data.saved_cookies;
              }
              retryOptions.headers = retryHeaders;

              res = await fetch(url, retryOptions);
              return res;
            } else {
              addBotLog(
                "Hadisoana: Tsy nahomby ny fidirana ho azy ho an'ny Bot.",
                "error",
              );
            }
          }
        } catch (credsErr) {
          console.error(
            "[fetchBet261] Error parsing credentials from localStorage",
            credsErr,
          );
        }
      }

      // Clean up if re-login wasn't possible or failed, ONLY for customer-info endpoint where valid session is absolutely required
      if (url.includes("/customer-info")) {
        console.warn(
          "[fetchBet261] Session expired or unauthorized (401/403). Cleaning local Bet261 state.",
        );
        setBet261Account(null);
        localStorage.removeItem("bet261_account");
        setBotEnabled(false);
      } else {
        console.warn(
          `[fetchBet261] Request to ${url} returned ${res.status}, but we DO NOT disconnect user or clean state because this is not the main session endpoint.`,
        );
      }
    }

    return res;
  };

  const executeAutoBet = async (
    match: any,
    selection: string,
    odds: string,
    customStake?: number,
  ) => {
    console.log("executeAutoBet called:", {
      matchId: match.id,
      apiId: match.apiId,
      selection,
      odds,
      customStake,
    });

    const account = bet261AccountRef.current;
    if (!account || !account.access_token) {
      addBotLog("Bot: Account not connected", "error");
      console.warn("Bet placement failed: No account connected");
      return;
    }

    const currentSettings = botSettingsRef.current;
    const stake = customStake || currentSettings.stake;

    if (
      dailyBetsCountRef.current >= currentSettings.maxDailyBets &&
      !customStake
    ) {
      addBotLog("Bot: Max daily bets reached", "warning");
      setBotEnabled(false);
      return;
    }

    addBotLog(
      `Bot: Famakafakàna lalao... ${match.homeTeam} vs ${match.awayTeam}`,
      "info",
    );

    // Bet payload matching successful manual placement schema
    const betPayload = {
      selections: [
        {
          eventId: match.apiId,
          marketName: "1X2",
          outcomeName: selection,
          odds: odds,
          leagueId: match.leagueId,
        },
      ],
      stake: typeof stake === "string" ? parseInt(stake) : stake,
      betType: 1,
    };

    try {
      addBotLog(
        `Bot: Fandramana fametrahana pari ho an'ny ${match.homeTeam} (@${odds})...`,
        "info",
      );

      const res = await fetchBet261("/api/bet261/place-bet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.access_token}`,
          "X-Operator-Id": account.operatorId || "34",
        },
        body: JSON.stringify(betPayload),
      });

      if (res.ok) {
        addBotLog(
          `Fandresena: Pari napetraka ho an'ny ${match.homeTeam} (${selection}) @${odds}`,
          "success",
        );
        setDailyBetsCount((prev) => prev + 1);

        if (customStake) {
          alert(
            `✅ Pari napetraka successfully!\nStake: ${stake} Ar\nMatch: ${match.homeTeam} vs ${match.awayTeam}\nSelection: ${selection}`,
          );
        }

        // Immediate balance refresh
        setTimeout(() => refreshBet261Balance(account.access_token), 1500);
      } else {
        const err = await safeParseJSON(res).catch(() => ({
          details: "Détails indisponibles/Format invalide",
        }));
        const errorMsg = err.details || err.error || res.statusText;
        addBotLog(
          `Hadisoana: Tsy nahomby ny fametrahana pari (${errorMsg})`,
          "error",
        );

        if (res.status === 401 || res.status === 403) {
          addBotLog(
            `Mampiahiahy ny fidirana (Pari niteraka hadisoana ${res.status}). Manamarina ny session amin'ny Bet261...`,
            "warning",
          );
          // Trigger info/balance check to verify if session has actually expired
          refreshBet261Balance(account.access_token);
        }

        if (customStake) {
          try {
            // Try to parse if it's a Sporty JSON error
            const sportyErr =
              typeof errorMsg === "string" ? JSON.parse(errorMsg) : errorMsg;
            alert(
              `❌ Tsy nahomby: ${sportyErr.message || sportyErr.details || errorMsg}`,
            );
          } catch {
            alert(`❌ Tsy nahomby ny fametrahana pari: ${errorMsg}`);
          }
        }
      }
    } catch (e: any) {
      addBotLog(`Hadisoana: ${e.message}`, "error");
      if (customStake) {
        alert(`❌ Hadisoana: ${e.message}`);
      }
    }
  };

  // Bot main loop
  useEffect(() => {
    if (botEnabled) {
      addBotLog(
        "Vao mainka ny Bot Mahakasa! Mitady lalao tsara amin'ny fomba haingana...",
        "success",
      );

      const checkAndBet = async () => {
        const currentMatches = matchesRef.current;
        if (currentMatches.length === 0) {
          addBotLog(
            "Bot: Famakafakàna... Tsy misy lalao azo vakiana amin'izao.",
            "info",
          );
          return;
        }

        // Filter valid candidates
        const upcomingMatches = currentMatches.filter((m: any) => {
          if (
            m.homeScore !== undefined &&
            m.homeScore !== null &&
            String(m.homeScore).trim() !== "" &&
            m.homeScore !== "-"
          ) {
            return false;
          }
          const status = String(m.status || "")
            .toLowerCase()
            .trim();
          if (
            status === "finished" ||
            status === "3" ||
            status === "ft" ||
            status === "terminé" ||
            status === "live" ||
            status === "2"
          ) {
            return false;
          }
          return (
            status === "upcoming" ||
            status === "à venir" ||
            status === "pending" ||
            status === "waiting" ||
            status === "1" || // 1 corresponds to Upcoming in SportyBet API
            status === "" ||
            /^\d{2}:\d{2}$/.test(status) ||
            /^\d{2}\/\d{2}/.test(status)
          );
        });

        if (upcomingMatches.length === 0) {
          addBotLog(
            `Bot: Lalao ${currentMatches.length} hita fa efa mandeha na vita daholo.`,
            "warning",
          );
          return;
        }

        const currentSettings = botSettingsRef.current;
        const currentRankings = rankingsRef.current;

        const candidates: any[] = upcomingMatches
          .map((m: any) => {
            const { o1, ox, o2 } = getMatchOddsParsed(m);
            if (o1 <= 0 || o2 <= 0) return null;

            let isMatch = false;
            let selection = "1";
            let oddsStr = "0";

            if (currentSettings.strategy === "safe") {
              isMatch = (o1 > 1 && o1 <= 1.55) || (o2 > 1 && o2 <= 1.55);
              selection = (o1 > 0 && o1 < o2) || o2 === 0 ? "1" : "2";
              oddsStr = selection === "1" ? o1.toString() : o2.toString();
            } else if (currentSettings.strategy === "balanced") {
              isMatch = (o1 >= 1.5 && o1 <= 2.3) || (o2 >= 1.5 && o2 <= 2.3);
              selection = (o1 > 0 && o1 < o2) || o2 === 0 ? "1" : "2";
              oddsStr = selection === "1" ? o1.toString() : o2.toString();
            } else if (currentSettings.strategy === "anomaly") {
              const anomaly = getMatchAnomalyParsed(m, currentRankings);
              if (anomaly) {
                isMatch = true;
                selection = anomaly.betOnTeam; // '1' or '2'
                oddsStr = anomaly.betOdds.toString();
              }
            } else {
              // risky
              isMatch = o1 > 2.2 || o2 > 2.2 || ox > 3.0;
              selection = o1 > o2 ? "1" : "2";
              oddsStr = selection === "1" ? o1.toString() : o2.toString();
            }

            if (isMatch) {
              return {
                match: m,
                selection,
                odds: oddsStr,
              };
            }
            return null;
          })
          .filter(Boolean) as any[];

        if (candidates.length > 0) {
          addBotLog(
            `Bot: Lalao ${candidates.length} no mifanaraka amin'ny safidy "${currentSettings.strategy}".`,
            "success",
          );

          if (currentSettings.allowSimultaneous) {
            let placedCount = 0;
            // Place bets in parallel to speed up execution
            for (const cand of candidates) {
              const { match, selection, odds } = cand;

              const alreadyBet = botLogsRef.current.some(
                (log) =>
                  log.message.includes(match.id) &&
                  (log.type === "success" || log.message.includes("napetraka")),
              );
              if (!alreadyBet) {
                if (
                  dailyBetsCountRef.current + placedCount >=
                  currentSettings.maxDailyBets
                ) {
                  addBotLog(
                    "Bot: Mahatratra ny fetran'ny pari isan'andro sisa (Daily limit reached).",
                    "warning",
                  );
                  break;
                }

                // Call asynchronously without awaiting to execute bets simultaneously!
                executeAutoBet(match, selection, odds);
                placedCount++;
              }
            }
            if (placedCount === 0) {
              addBotLog(
                "Bot: Efa voapetraka ho an'ny lalao rehetra mifanaraka ny pari amin'izao fotoana izao.",
                "info",
              );
            }
          } else {
            // Traditional single mode: Picks the best one
            const { match, selection, odds } = candidates[0];
            const alreadyBet = botLogsRef.current.some(
              (log) =>
                log.message.includes(match.id) &&
                (log.type === "success" || log.message.includes("napetraka")),
            );
            if (!alreadyBet) {
              await executeAutoBet(match, selection, odds);
            } else {
              addBotLog(
                `Bot: Efa nisy pari napetraka ho an'ny ${match.homeTeam}.`,
                "info",
              );
            }
          }
        } else {
          const matchWithOdds = upcomingMatches.find((m) => {
            const { o1, o2 } = getMatchOddsParsed(m);
            return o1 > 0 || o2 > 0;
          });
          if (matchWithOdds) {
            const { o1, ox, o2 } = getMatchOddsParsed(matchWithOdds);
            addBotLog(
              `Bot: Tsy misy lalao mifanaraka amin'ny odds ${currentSettings.strategy} (Hita: ${matchWithOdds.homeTeam} - ${matchWithOdds.awayTeam} misy odds ${o1 || "-"} | ${ox || "-"} | ${o2 || "-"})`,
              "warning",
            );
          } else {
            addBotLog(
              `Bot: Tsy misy lalao mifanaraka amin'ny odds ${currentSettings.strategy} (Tsy misy odds hita tamin'ny lalao rehetra)`,
              "warning",
            );
          }
        }
      };

      // Instant execution upon activation
      checkAndBet();

      // Schedule continuous speedy checks (default 5s)
      const intervalMs = (botSettings.checkInterval || 5) * 1000;
      botIntervalRef.current = setInterval(checkAndBet, intervalMs);

      // Store function in window for manual trigger if needed
      (window as any).forceBotCheck = checkAndBet;
    } else {
      if (botIntervalRef.current) clearInterval(botIntervalRef.current);
      if (botLogs.length > 0) addBotLog("Mijanona ny Bot Mahakasa.", "warning");
    }

    return () => {
      if (botIntervalRef.current) clearInterval(botIntervalRef.current);
    };
  }, [botEnabled, botSettings.checkInterval, botSettings.allowSimultaneous]);
  const [selectedLeague, setSelectedLeague] = useState(LEAGUES[0].id);
  const [extractionTab, setExtractionTab] = useState(LEAGUES[0].id);
  const [calculatorTab, setCalculatorTab] = useState(LEAGUES[0].id);
  const [activeExtractions, setActiveExtractions] = useState<
    Record<number, boolean>
  >({});

  const [matchesSubTab, setMatchesSubTab] = useState<"current" | "future">(
    "current",
  );
  const [matches, setMatches] = useState<any[]>([]);
  const matchesRef = useRef<any[]>([]);
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);
  const [rankings, setRankings] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bet261Account, setBet261Account] = useState<any | null>(null);
  const [freeBets, setFreeBets] = useState<any[]>([]);
  const [showBet261Login, setShowBet261Login] = useState(false);
  const [bet261Loading, setBet261Loading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyBets, setHistoryBets] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyState, setHistoryState] = useState<"Won" | "Lost" | "All">(
    "Won",
  );
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [token, setToken] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<{
    username: string;
    role: "admin" | "user";
    fullName: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [autoRefresh] = useState(true);
  const [currentSeason, setCurrentSeason] = useState<string | null>(null);
  const [seasonFinished, setSeasonFinished] = useState(false);

  // User notifications & messages states
  const [userMessages, setUserMessages] = useState<any[]>([]);
  const [showUserMessages, setShowUserMessages] = useState(false);

  const [calculatorStats, setCalculatorStats] = useState<
    Record<number, Record<number, CalculatorStats>>
  >({});
  const [selectedMatchForBets, setSelectedMatchForBets] = useState<any | null>(
    null,
  );
  const processedMatchIdsRef = useRef<Set<string>>(new Set());

  const bet261AccountRef = useRef(bet261Account);
  const botSettingsRef = useRef(botSettings);
  const rankingsRef = useRef(rankings);
  const botLogsRef = useRef(botLogs);
  const dailyBetsCountRef = useRef(dailyBetsCount);

  useEffect(() => {
    bet261AccountRef.current = bet261Account;
  }, [bet261Account]);
  useEffect(() => {
    botSettingsRef.current = botSettings;
  }, [botSettings]);
  useEffect(() => {
    rankingsRef.current = rankings;
  }, [rankings]);
  useEffect(() => {
    botLogsRef.current = botLogs;
  }, [botLogs]);
  useEffect(() => {
    dailyBetsCountRef.current = dailyBetsCount;
  }, [dailyBetsCount]);

  useEffect(() => {
    if (
      isUnlocked &&
      activeTab === "calculator" &&
      !calculatorStats[calculatorTab]
    ) {
      handleResetCalculator(calculatorTab);
    }
  }, [isUnlocked, activeTab, calculatorTab]);

  const handleAuthLogout = async () => {
    if (confirm("Voulez-vous vous déconnecter de l'application ?")) {
      const savedToken = localStorage.getItem("mahakasa_token");
      if (savedToken) {
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: savedToken }),
          });
        } catch (e) {
          console.error(e);
        }
      }
      localStorage.removeItem("mahakasa_token");
      localStorage.removeItem("mahakasa_user");
      setToken("");
      setCurrentUser(null);
      setIsUnlocked(false);
      isUnlockedRef.current = false;
    }
  };

  // Use refs to access latest state in setInterval without re-triggering it
  const isUnlockedRef = useRef(isUnlocked);
  const autoRefreshRef = useRef(autoRefresh);
  const selectedLeagueRef = useRef(selectedLeague);
  const seasonFinishedRef = useRef(seasonFinished);

  useEffect(() => {
    isUnlockedRef.current = isUnlocked;
  }, [isUnlocked]);

  useEffect(() => {
    autoRefreshRef.current = autoRefresh;
  }, [autoRefresh]);

  useEffect(() => {
    selectedLeagueRef.current = selectedLeague;
  }, [selectedLeague]);

  useEffect(() => {
    seasonFinishedRef.current = seasonFinished;
  }, [seasonFinished]);

  useEffect(() => {
    const checkToken = async () => {
      const savedToken = localStorage.getItem("mahakasa_token");
      const savedUser = localStorage.getItem("mahakasa_user");

      if (savedToken && savedUser) {
        try {
          const response = await fetch("/api/auth/verify-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: savedToken }),
          });
          const data = await response.json();
          if (response.ok && data.success) {
            setToken(savedToken);
            setCurrentUser(data.user);
            setIsUnlocked(true);
            isUnlockedRef.current = true;
          } else {
            console.warn("[Auth] Token validation failed:", data.error);
            localStorage.removeItem("mahakasa_token");
            localStorage.removeItem("mahakasa_user");
          }
        } catch (err) {
          console.error("[Auth] Error verifying stored token:", err);
          // If server is temporarily offline or in transition, fallback and allow session
          try {
            const userObj = JSON.parse(savedUser);
            setToken(savedToken);
            setCurrentUser(userObj);
            setIsUnlocked(true);
            isUnlockedRef.current = true;
          } catch (e) {
            localStorage.removeItem("mahakasa_token");
            localStorage.removeItem("mahakasa_user");
          }
        }
      }
    };
    checkToken();

    const savedBet261 = localStorage.getItem("bet261_account");
    if (savedBet261) {
      try {
        const acc = JSON.parse(savedBet261);
        setBet261Account(acc);
        refreshBet261Balance(acc.access_token);
      } catch (e) {
        localStorage.removeItem("bet261_account");
      }
    }

    // Clear pending reset flag if it exists to allow sync to resume
    if (localStorage.getItem("mahakasa_reset_pending") === "true") {
      console.log("[App] Clearing pending reset flag");
      localStorage.removeItem("mahakasa_reset_pending");
    }
  }, []);

  const fetchUserMessages = async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/auth/messages", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setUserMessages(data.messages || []);
      }
    } catch (err) {
      console.error("[Messages] Failed to load messages:", err);
    }
  };

  const handleMarkMessagesRead = async () => {
    if (!token || userMessages.length === 0) return;
    const unreadIds = userMessages
      .filter((m) => {
        if (m.to.toLowerCase() === "all") {
          return !m.readBy?.includes(currentUser?.username.toLowerCase());
        } else {
          return !m.read;
        }
      })
      .map((m) => m.id);

    if (unreadIds.length === 0) return;

    try {
      const response = await fetch("/api/auth/messages/mark-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messageIds: unreadIds }),
      });
      if (response.ok) {
        fetchUserMessages();
      }
    } catch (err) {
      console.error("[Messages] Error marking read:", err);
    }
  };

  const getUnreadMessagesCount = () => {
    if (!currentUser) return 0;
    return userMessages.filter((m) => {
      if (m.to.toLowerCase() === "all") {
        return !m.readBy?.includes(currentUser.username.toLowerCase());
      } else {
        return !m.read;
      }
    }).length;
  };

  useEffect(() => {
    if (token) {
      fetchUserMessages();
      const interval = setInterval(fetchUserMessages, 40000);
      return () => clearInterval(interval);
    } else {
      setUserMessages([]);
    }
  }, [token, currentUser]);

  // Automated background heartbeat to track active usage seconds and online presence
  useEffect(() => {
    if (!token) return;

    const sendHeartbeat = async () => {
      try {
        await fetch("/api/auth/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      } catch (err: any) {
        console.warn(
          "[Heartbeat] Connection check status (temporary offline or dev server reload):",
          err?.message || err,
        );
      }
    };

    // Send immediate heartbeat on session startup
    sendHeartbeat();

    // Pulse heartbeat every 30 seconds
    const interval = setInterval(sendHeartbeat, 30000);

    // Immediate heartbeat when the browser tab gains visibility/focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendHeartbeat();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [token]);

  useEffect(() => {
    if (isUnlocked) {
      fetchLeagueData(selectedLeague);
    }
  }, [selectedLeague, isUnlocked]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (autoRefreshRef.current) {
        fetchLeagueData(selectedLeagueRef.current, true);
      }
    }, 20000); // 20s is optimal for 70s odds window and 45s match duration
    return () => clearInterval(interval);
  }, []); // Ne dépend plus de seasonFinished pour garantir un rythme constant

  // NEW: Frequent Score Poller (0.5s) using Playout API
  useEffect(() => {
    const interval = setInterval(() => {
      if (isUnlockedRef.current && autoRefreshRef.current) {
        refreshActiveScores();
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const refreshActiveScores = async () => {
    const leagueId = selectedLeagueRef.current;
    const currentMatches = matchesRef.current;
    if (!leagueId || currentMatches.length === 0) return;

    // Identify rounds that have pending or live matches
    const roundsMap = new Map<number, number | string>();

    currentMatches.forEach((m: any) => {
      if (m.status !== "Finished") {
        const r = m.round || 0;
        if (r && !roundsMap.has(r)) {
          const catId =
            m.eventCategoryId || m.EventCategoryID || m.seasonId || m.season;
          if (catId) roundsMap.set(r, catId);
        }
      }
    });

    if (roundsMap.size === 0) return;

    try {
      const updates = await Promise.all(
        Array.from(roundsMap.entries()).map(async ([roundNum, catId]) => {
          try {
            const playoutData = await fetchRoundPlayout(
              roundNum,
              catId as number,
              leagueId,
            );
            return { roundNum, playoutData };
          } catch (e) {
            return { roundNum, playoutData: null };
          }
        }),
      );

      let globalChanged = false;
      const newMatches = [...currentMatches];

      updates.forEach(({ playoutData }) => {
        if (!playoutData || !playoutData.matches) return;

        playoutData.matches.forEach((apiMatch: any) => {
          const mIdx = newMatches.findIndex(
            (m) =>
              String(m.id) === String(apiMatch.id) ||
              String(m.apiId) === String(apiMatch.id) ||
              (m.id && m.id.includes(String(apiMatch.id))),
          );

          if (mIdx !== -1) {
            const goals = apiMatch.goals || [];
            const isLive =
              apiMatch.status === 2 ||
              String(apiMatch.status).toLowerCase() === "live";
            const isFinished =
              apiMatch.status === 3 ||
              String(apiMatch.status).toLowerCase() === "finished" ||
              goals.length > 0 ||
              apiMatch.expectedStart === "0001-01-01T00:00:00Z";

            if (isLive || isFinished) {
              const lastGoal =
                goals.length > 0 ? goals[goals.length - 1] : null;
              const hScore = lastGoal ? String(lastGoal.homeScore) : "0";
              const aScore = lastGoal ? String(lastGoal.awayScore) : "0";

              const currentStatus = isLive ? "LIVE" : "Finished";

              if (
                String(newMatches[mIdx].homeScore) !== String(hScore) ||
                String(newMatches[mIdx].awayScore) !== String(aScore) ||
                newMatches[mIdx].status !== currentStatus
              ) {
                newMatches[mIdx] = {
                  ...newMatches[mIdx],
                  homeScore: hScore,
                  awayScore: aScore,
                  status: currentStatus,
                  scoreDetails: {
                    homeGoals: goals
                      .filter(
                        (g: any, i: number) =>
                          g.homeScore > (i > 0 ? goals[i - 1].homeScore : 0),
                      )
                      .map((g: any) => ({
                        minute: String(g.minute || g.time),
                        player: "But",
                      })),
                    awayGoals: goals
                      .filter(
                        (g: any, i: number) =>
                          g.awayScore > (i > 0 ? goals[i - 1].awayScore : 0),
                      )
                      .map((g: any) => ({
                        minute: String(g.minute || g.time),
                        player: "But",
                      })),
                  },
                };
                globalChanged = true;
              }
            }
          }
        });
      });

      if (globalChanged) {
        setMatches(newMatches);
        // Trigger automatic backup check if matches have updated (to support playout simulations)
        checkAndAutoSaveMatrix(leagueId, results, rankings, newMatches);
      }
    } catch (e) {
      console.warn("[GlobalRefresh] Score update failed:", e);
    }
  };

  const refreshFreeBets = async (token: string) => {
    if (!token || token === "undefined" || token === "null" || !token.trim())
      return;
    try {
      const res = await fetchBet261("/api/bet261/freebet", {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Operator-Id": bet261Account?.operatorId || "34",
        },
      });
      if (res.ok) {
        const data = await safeParseJSON(res);
        const list = Array.isArray(data) ? data : data.data || [];
        setFreeBets(list);
        console.log("[Freebets] Fetched list:", list);
      }
    } catch (e) {
      console.warn("[Freebets] Failed to fetch freebets:", e);
    }
  };

  const refreshBet261Balance = async (token: string) => {
    if (!token || token === "undefined" || token === "null" || !token.trim()) {
      console.warn(
        "[refreshBet261Balance] Skipped due to empty or invalid token",
      );
      return;
    }
    try {
      const res = await fetchBet261("/api/bet261/customer-info", {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Operator-Id": bet261Account?.operatorId || "34",
        },
      });
      if (res.ok) {
        const data = await safeParseJSON(res);
        setBet261Account((prev: any) => {
          const updated = { ...prev, ...data };
          // Ensure balance is a number and prioritize it
          if (updated.balance !== undefined) {
            updated.balance = Number(updated.balance);
          }
          return updated;
        });

        // Update localStorage as well
        const saved = JSON.parse(
          localStorage.getItem("bet261_account") || "{}",
        );
        localStorage.setItem(
          "bet261_account",
          JSON.stringify({ ...saved, ...data }),
        );

        // Refresh freebets as well
        refreshFreeBets(token);
      } else {
        if (res.status === 401 || res.status === 403) {
          console.warn(
            "[refreshBet261Balance] Session expired or unauthorized (401/403). Cleaning local Bet261 state.",
          );
          setBet261Account(null);
          localStorage.removeItem("bet261_account");
        } else {
          const err = await safeParseJSON(res).catch(() => ({
            error: "Unknown response type",
          }));
          console.warn("Balance refresh failed:", err);
        }
      }
    } catch (e) {
      console.error("Balance refresh exception", e);
    }
  };

  const handleBet261Login = async (
    username: string,
    password: string,
    remember: boolean = true,
  ) => {
    setBet261Loading(true);
    try {
      const accountDataStr = localStorage.getItem("bet261_account");
      let preferredVariant = undefined;
      if (accountDataStr) {
        try {
          const accData = JSON.parse(accountDataStr);
          if (accData.workingVariant) {
            preferredVariant = accData.workingVariant;
          }
        } catch (e) {}
      }

      const res = await fetch("/api/bet261/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, preferredVariant }),
      });
      if (res.ok) {
        const data = await safeParseJSON(res);
        setBet261Account(data);
        localStorage.setItem("bet261_account", JSON.stringify(data));

        if (remember) {
          localStorage.setItem(
            "bet261_credentials",
            JSON.stringify({
              username,
              password,
              autoReconnect: true,
            }),
          );
        } else {
          localStorage.removeItem("bet261_credentials");
        }

        await refreshBet261Balance(data.access_token);
        setShowBet261Login(false);
      } else {
        const err = await safeParseJSON(res).catch(() => ({
          details: "Détails indisponibles/Format invalide",
        }));
        setError(`Login Bet261 échoué: ${err.details || res.statusText}`);
      }
    } catch (e: any) {
      setError(`Erreur de connexion: ${e.message}`);
    } finally {
      setBet261Loading(false);
    }
  };

  const handleBet261Logout = () => {
    setBet261Account(null);
    setFreeBets([]);
    localStorage.removeItem("bet261_account");
  };

  const fetchBetHistory = async (
    state: "Won" | "Lost" | "All" = historyState,
    isLoadMore: boolean = false,
  ) => {
    if (!bet261Account) return;
    setHistoryLoading(true);

    const take = 20;
    const newSkip = isLoadMore ? historyBets.length : 0;

    if (!isLoadMore) {
      setHistoryBets([]);
    }

    setHistoryState(state);

    const fetchBatch = async (s: string, skipCount: number) => {
      const res = await fetchBet261(
        `/api/bet261/history?betState=${s}&skip=${skipCount}&take=${take}&t=${Date.now()}`,
        {
          headers: {
            Authorization: `Bearer ${bet261Account.access_token}`,
            "X-Operator-Id": bet261Account.operatorId || "34",
          },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await res.json();
      }
      const text = await res.text();
      console.error("Expected JSON but got:", text.substring(0, 100));
      throw new Error("Réponse serveur non-JSON");
    };

    try {
      let combinedData: any[] = [];
      if (state === "All") {
        // Parallel fetch for both states
        // When combined, we use half the take for each to stay consistent with total display count
        const skipForBoth = isLoadMore ? Math.floor(newSkip / 2) : 0;
        const [won, lost] = await Promise.all([
          fetchBatch("Won", skipForBoth).catch(() => []),
          fetchBatch("Lost", skipForBoth).catch(() => []),
        ]);
        combinedData = [...won, ...lost].sort(
          (a, b) =>
            new Date(b.betDate).getTime() - new Date(a.betDate).getTime(),
        );
        setHasMoreHistory(won.length === take || lost.length === take);
      } else {
        const data = await fetchBatch(state, newSkip);
        combinedData = data;
        setHasMoreHistory(data.length === take);
      }

      if (isLoadMore) {
        setHistoryBets((prev) => {
          const merged = [...prev, ...combinedData];
          // Ensure uniqueness and sort by date descending
          return Array.from(
            new Map(merged.map((item) => [item.id, item])).values(),
          ).sort(
            (a, b) =>
              new Date(b.betDate).getTime() - new Date(a.betDate).getTime(),
          );
        });
      } else {
        setHistoryBets(combinedData);
      }
    } catch (e: any) {
      console.error("History fetch error", e);
      setError(
        e.message === "HTTP 401" || e.message === "401"
          ? "Session Bet261 expirée. Veuillez vous déconnecter et vous reconnecter."
          : `Erreur historique: ${e.message}`,
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const checkAndAutoSaveMatrix = async (
    leagueId: number,
    rList: any[],
    rkList: any[],
    customMatches?: any[],
  ) => {
    if (!rkList || rkList.length === 0) return;
    try {
      // Compile completed/played rounds from matches to support simulations/playouts!
      const matchesToUse =
        customMatches && customMatches.length > 0
          ? customMatches
          : matches && matches.length > 0
            ? matches
            : [];

      const matchesByRound: Record<number, any[]> = {};
      matchesToUse.forEach((m: any) => {
        const r = Number(m.round) || 0;
        if (r) {
          if (!matchesByRound[r]) matchesByRound[r] = [];
          matchesByRound[r].push(m);
        }
      });

      const compiledRounds: any[] = [];
      Object.keys(matchesByRound).forEach((rStr: string) => {
        const rNum = Number(rStr);
        const ms = matchesByRound[rNum];
        // A round is considered completed if ALL its matches have ended/have scores
        const allFinished =
          ms.length > 0 &&
          ms.every((m: any) => {
            let score = m.score;
            if (
              !score &&
              m.homeScore != null &&
              m.awayScore != null &&
              m.homeScore !== "-" &&
              m.awayScore !== "-"
            ) {
              score = `${m.homeScore}-${m.awayScore}`;
            }
            return score && score !== "-" && !score.includes("undefined");
          });
        if (allFinished) {
          compiledRounds.push({
            roundNumber: rNum,
            round: rNum,
            matches: ms,
          });
        }
      });

      let finalRList = rList && rList.length > 0 ? [...rList] : [];
      compiledRounds.forEach((cr: any) => {
        if (
          !finalRList.some(
            (r: any) => (r.roundNumber || r.round) === cr.roundNumber,
          )
        ) {
          finalRList.push(cr);
        }
      });

      if (finalRList.length === 0) return;

      const playedRNumList = finalRList.map((round: any) => {
        return Number(round.roundNumber || round.round) || 0;
      });
      const maxPlayedRound =
        playedRNumList.length > 0 ? Math.max(...playedRNumList) : 0;

      console.log(
        `[Automatic Matrix Backup] Checking league ${leagueId}. Max played round: ${maxPlayedRound}`,
      );

      if (maxPlayedRound > 0) {
        let activeSeason = currentSeason;
        if (!activeSeason && matchesToUse.length > 0) {
          const firstMatchWithSeason = matchesToUse.find(
            (m: any) => m && m.season,
          );
          if (firstMatchWithSeason) {
            activeSeason = firstMatchWithSeason.season;
          }
        }
        if (!activeSeason) {
          activeSeason = getDailySeason(Date.now());
        }

        const matrixId = `matrix_${leagueId}_${activeSeason.replace(/[^a-z0-9]/gi, "_")}`;

        const { db, saveAnalysisMatrix } =
          await import("./services/localArchive");

        // Skip calculation if a backup for this season already exists with a round greater than or equal to current maxPlayedRound
        const existing = await db.matrices.get(matrixId);
        if (existing && existing.roundSaved >= maxPlayedRound) {
          console.log(
            `[Automatic Matrix Backup] Season matrix already up-to-date in database for ${activeSeason} (Saved round: ${existing.roundSaved}, current max: ${maxPlayedRound}). Skipping silent archive.`,
          );
          return;
        }

        console.log(
          `[Automatic Matrix Backup] Computing/updating matrix for ${activeSeason} up to Round ${maxPlayedRound}...`,
        );

        const getTeamNameLocal = (team: any) => {
          if (!team) return "-";
          if (typeof team === "string") return team;
          return team.name || team.teamName || team.shortName || "Équipe";
        };

        const targetRList = finalRList
          .filter((round: any) => {
            const rNum = Number(round.roundNumber || round.round) || 0;
            return rNum <= maxPlayedRound;
          })
          .sort((a: any, b: any) => {
            const rA = Number(a.roundNumber || a.round) || 0;
            const rB = Number(b.roundNumber || b.round) || 0;
            return rA - rB;
          });

        const getFullFormLocal = (teamName: string) => {
          const formArr: string[] = [];
          const normalizedTarget = teamName.toLowerCase().trim();
          targetRList.forEach((round: any) => {
            const ms = round.matches || (Array.isArray(round) ? round : []);
            ms.forEach((m: any) => {
              const hN = getTeamNameLocal(m.homeTeam).toLowerCase().trim();
              const aN = getTeamNameLocal(m.awayTeam).toLowerCase().trim();
              if (hN === normalizedTarget || aN === normalizedTarget) {
                let homeRaw = m.homeScore;
                let awayRaw = m.awayScore;
                if (m.score) {
                  const sep = m.score.includes(":") ? ":" : "-";
                  const parts = m.score.split(sep);
                  if (parts.length === 2) {
                    homeRaw = parts[0];
                    awayRaw = parts[1];
                  }
                }
                if (
                  homeRaw === undefined ||
                  homeRaw === null ||
                  homeRaw === "" ||
                  awayRaw === undefined ||
                  awayRaw === null ||
                  awayRaw === ""
                )
                  return;
                const hS = parseInt(String(homeRaw));
                const aS = parseInt(String(awayRaw));
                if (isNaN(hS) || isNaN(aS)) return;
                if (hN === normalizedTarget) {
                  formArr.push(hS > aS ? "Won" : hS < aS ? "Lost" : "Draw");
                } else {
                  formArr.push(aS > hS ? "Won" : aS < hS ? "Lost" : "Draw");
                }
              }
            });
          });
          return formArr;
        };

        // Rank Evolution timeline
        const allTeamNames = rkList.map((t: any) => getTeamNameLocal(t));
        const statsMap: Record<
          string,
          {
            name: string;
            points: number;
            gd: number;
            gf: number;
            played: number;
          }
        > = {};

        allTeamNames.forEach((teamName: string) => {
          const normalized = teamName.toLowerCase().trim();
          statsMap[normalized] = {
            name: teamName,
            points: 0,
            gd: 0,
            gf: 0,
            played: 0,
          };
        });

        const rankTimeline: Record<string, number[]> = {};
        const normalizedToOriginal: Record<string, string> = {};
        allTeamNames.forEach((teamName: string) => {
          const normalized = teamName.toLowerCase().trim();
          rankTimeline[normalized] = [];
          normalizedToOriginal[normalized] = teamName;
        });

        targetRList.forEach((round: any, roundIndex: number) => {
          const matches = round.matches || (Array.isArray(round) ? round : []);
          matches.forEach((m: any) => {
            const homeName = getTeamNameLocal(m.homeTeam);
            const awayName = getTeamNameLocal(m.awayTeam);
            const hN = homeName.toLowerCase().trim();
            const aN = awayName.toLowerCase().trim();

            if (!statsMap[hN]) {
              statsMap[hN] = {
                name: homeName,
                points: 0,
                gd: 0,
                gf: 0,
                played: 0,
              };
              rankTimeline[hN] = [];
              normalizedToOriginal[hN] = homeName;
            }
            if (!statsMap[aN]) {
              statsMap[aN] = {
                name: awayName,
                points: 0,
                gd: 0,
                gf: 0,
                played: 0,
              };
              rankTimeline[aN] = [];
              normalizedToOriginal[aN] = awayName;
            }

            let homeRaw = m.homeScore;
            let awayRaw = m.awayScore;
            if (m.score) {
              const sep = m.score.includes(":") ? ":" : "-";
              const parts = m.score.split(sep);
              if (parts.length === 2) {
                homeRaw = parts[0];
                awayRaw = parts[1];
              }
            }

            if (
              homeRaw !== undefined &&
              homeRaw !== null &&
              homeRaw !== "" &&
              awayRaw !== undefined &&
              awayRaw !== null &&
              awayRaw !== ""
            ) {
              const hS = parseInt(String(homeRaw));
              const aS = parseInt(String(awayRaw));
              if (!isNaN(hS) && !isNaN(aS)) {
                statsMap[hN].played += 1;
                statsMap[aN].played += 1;
                statsMap[hN].gf += hS;
                statsMap[hN].gd += hS - aS;
                statsMap[aN].gf += aS;
                statsMap[aN].gd += aS - hS;

                if (hS > aS) {
                  statsMap[hN].points += 3;
                } else if (hS < aS) {
                  statsMap[aN].points += 3;
                } else {
                  statsMap[hN].points += 1;
                  statsMap[aN].points += 1;
                }
              }
            }
          });

          const roundStandings = Object.keys(statsMap).map((normKey) => ({
            normKey,
            ...statsMap[normKey],
          }));

          roundStandings.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.gd !== a.gd) return b.gd - a.gd;
            if (b.gf !== a.gf) return b.gf - a.gf;
            return a.name.localeCompare(b.name);
          });

          roundStandings.forEach((entry, idxInStandings) => {
            if (rankTimeline[entry.normKey]) {
              rankTimeline[entry.normKey].push(idxInStandings + 1);
            }
          });

          Object.keys(statsMap).forEach((normKey) => {
            if (rankTimeline[normKey].length < roundIndex + 1) {
              const prevArr = rankTimeline[normKey];
              const lastRank =
                prevArr.length > 0
                  ? prevArr[prevArr.length - 1]
                  : Object.keys(statsMap).length;
              prevArr.push(lastRank);
            }
          });
        });

        // Compile historical standings at round 33 for teamForms
        const finalStandings33 = Object.keys(statsMap).map((normKey) => ({
          normKey,
          ...statsMap[normKey],
        }));

        finalStandings33.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.gd !== a.gd) return b.gd - a.gd;
          if (b.gf !== a.gf) return b.gf - a.gf;
          return a.name.localeCompare(b.name);
        });

        // Superposed Form list with correct standings ranks and points
        const teamForms = finalStandings33.map((entry: any, index: number) => {
          const originalName = entry.name;
          const history = getFullFormLocal(originalName);
          return {
            teamName: originalName,
            history,
            rank: index + 1,
            points: entry.points,
          };
        });

        // 1. Compile and normalize matches to save directly inside this matrix
        const archivedMatches = matchesToUse.map((m: any) => {
          let scoreStr = m.score;
          if (!scoreStr && m.homeScore != null && m.awayScore != null) {
            scoreStr = `${m.homeScore}-${m.awayScore}`;
          }
          const separator = scoreStr?.includes(":") ? ":" : "-";
          const [hS, aS] = (scoreStr || "-").split(separator);

          const hName = getTeamNameLocal(m.homeTeam);
          const aName = getTeamNameLocal(m.awayTeam);

          return {
            leagueId: Number(leagueId),
            season: activeSeason,
            round: Number(m.roundNumber || m.round) || 0,
            homeTeam: hName,
            awayTeam: aName,
            homeScore: hS || m.homeScore || "",
            awayScore: aS || m.awayScore || "",
            status: m.status || "Finished",
            expectedStart:
              m.expectedStart || m.updatedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });

        // 2. Define the matrix object with embedded matches list
        const newMatrixObj = {
          id: matrixId,
          leagueId: Number(leagueId),
          season: activeSeason,
          roundSaved: maxPlayedRound,
          rankTimeline,
          normalizedToOriginal,
          teamForms,
          archivedMatches,
          savedAt: new Date().toISOString(),
        };

        const saved = await saveAnalysisMatrix(newMatrixObj);
        if (saved) {
          console.log(
            `[Automatic Matrix Backup] Matrix updated silently in background up to round ${maxPlayedRound} for season ${activeSeason}`,
          );

          // Auto save matches to local table is CLOSED as requested (Only extraction menu stores matches in database)
          console.log(
            `[Automatic Matrix Backup] Background matches save to local database is disabled by application policy.`,
          );

          window.dispatchEvent(new CustomEvent("matrices_auto_saved"));
        }
      }
    } catch (autoErr) {
      console.error(
        "[Automatic Matrix Backup] Error while auto saving:",
        autoErr,
      );
    }
  };

  const fetchLeagueData = async (
    leagueId: number,
    isAuto = false,
    isDeep = false,
  ) => {
    if (!isUnlockedRef.current) return;
    if (!leagueId || isNaN(leagueId)) return;

    // Abort previous fetch for this league if still running
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort("New fetch started");
    }

    const controller = new AbortController();
    fetchControllerRef.current = controller;

    if (!isAuto) setLoading(true);
    setError(null);
    try {
      const take = isDeep ? 500 : 100;
      const timeoutId = setTimeout(
        () => controller.abort("Délai d'attente du frontend dépassé (15s)"),
        15000,
      ); // 15s timeout for parallel fetches

      const ts = Date.now();
      const [matchesRes, rankingRes, resultsRes] = await Promise.all([
        fetchWithRetry(`/api/data/league/matches/${leagueId}?_t=${ts}`, {
          signal: controller.signal,
        }).catch((e) => {
          if (
            controller.signal.aborted ||
            e.name === "AbortError" ||
            (e instanceof Error && e.message.includes("abort"))
          ) {
            const errObj = new Error("Aborted: Matches fetch cancelled");
            errObj.name = "AbortError";
            throw errObj;
          }
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`Matches: ${msg || "Error"}`);
        }),
        fetchWithRetry(`/api/data/league/ranking/${leagueId}?_t=${ts}`, {
          signal: controller.signal,
        }).catch((e) => {
          console.warn("Ranking fetch failed:", e);
          return { ok: false, json: async () => ({ teams: [] }) } as any;
        }),
        fetchWithRetry(
          `/api/data/league/results/${leagueId}?skip=0&take=${take}&_t=${ts}`,
          { signal: controller.signal },
        ).catch((e) => {
          if (
            controller.signal.aborted ||
            e.name === "AbortError" ||
            (e instanceof Error && e.message.includes("abort"))
          ) {
            const errObj = new Error("Aborted: Results fetch cancelled");
            errObj.name = "AbortError";
            throw errObj;
          }
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`Results: ${msg || "Error"}`);
        }),
      ]).catch((e) => {
        if (
          controller.signal.aborted ||
          e.name === "AbortError" ||
          e === "AbortError" ||
          (e instanceof Error &&
            (e.message.includes("Aborted") ||
              e.message.includes("cancelled") ||
              e.message.includes("fetch started")))
        ) {
          const errObj = new Error(
            e.message || "Délai d'attente dépassé (15s)",
          );
          errObj.name = "AbortError";
          throw errObj;
        }
        throw e;
      });

      clearTimeout(timeoutId);

      if (!matchesRes.ok) {
        const errData = await safeParseJSON(matchesRes).catch(() => ({}));
        throw new Error(
          `Erreur Matches (${matchesRes.status}): ${errData.details || errData.error || matchesRes.statusText}`,
        );
      }
      if (!resultsRes.ok) {
        const errData = await safeParseJSON(resultsRes).catch(() => ({}));
        throw new Error(
          `Erreur Results (${resultsRes.status}): ${errData.details || errData.error || resultsRes.statusText}`,
        );
      }

      const matchesData = await safeParseJSON(matchesRes);
      let rankingData = rankingRes.ok
        ? await safeParseJSON(rankingRes)
        : { teams: [] };
      const resultsData = await safeParseJSON(resultsRes);

      // FIXED: If ranking is empty, try to fetch it with the specific CategoryID from matches
      if (
        !rankingData ||
        !rankingData.teams ||
        rankingData.teams.length === 0
      ) {
        const firstRound = matchesData.rounds?.[0];
        const firstMatchInMatches = firstRound?.matches?.[0];
        const specificCatId =
          firstMatchInMatches?.eventCategoryId ||
          firstMatchInMatches?.EventCategoryID ||
          firstRound?.eventCategoryId;

        if (specificCatId && specificCatId !== leagueId) {
          console.log(
            `[Ranking] Initial fetch failed for ${leagueId}, retrying with specific categoryID: ${specificCatId}`,
          );
          try {
            const retryRes = await fetchWithRetry(
              `/api/data/league/ranking/${specificCatId}?_t=${Date.now()}`,
            );
            if (retryRes.ok) {
              const retryData = await safeParseJSON(retryRes);
              if (retryData && retryData.teams && retryData.teams.length > 0) {
                rankingData = retryData;
              }
            }
          } catch (e) {
            console.warn("[Ranking] Retry failed:", e);
          }
        }
      }

      const extractedMatches = matchesData.rounds
        ? matchesData.rounds.flatMap((r: any) => {
            const round = r.roundNumber || r.round || 0;
            const roundStart =
              r.expectedStart && !r.expectedStart.startsWith("0001")
                ? r.expectedStart
                : undefined;

            return (r.matches || []).map((m: any) => {
              const mStart =
                m.expectedStart && !m.expectedStart.startsWith("0001")
                  ? m.expectedStart
                  : roundStart;
              const matchTime = mStart || Date.now();
              const dailySeason = getDailySeason(matchTime);
              const seasonIdOrEventCategoryId =
                m.eventCategoryId ||
                m.EventCategoryID ||
                r.eventCategoryId ||
                r.EventCategoryID ||
                r.seasonId ||
                r.season ||
                m.seasonId ||
                m.season;
              const season = formatSeason(
                dailySeason,
                seasonIdOrEventCategoryId,
              );

              const homeTeamRaw =
                m.homeTeam?.name ||
                m.homeTeam?.teamName ||
                m.homeTeam ||
                "Unknown";
              const awayTeamRaw =
                m.awayTeam?.name ||
                m.awayTeam?.teamName ||
                m.awayTeam ||
                "Unknown";
              const homeTeam =
                typeof homeTeamRaw === "string"
                  ? homeTeamRaw
                  : typeof homeTeamRaw === "object" && homeTeamRaw !== null
                    ? homeTeamRaw.name ||
                      homeTeamRaw.teamName ||
                      JSON.stringify(homeTeamRaw)
                    : String(homeTeamRaw);
              const awayTeam =
                typeof awayTeamRaw === "string"
                  ? awayTeamRaw
                  : typeof awayTeamRaw === "object" && awayTeamRaw !== null
                    ? awayTeamRaw.name ||
                      awayTeamRaw.teamName ||
                      JSON.stringify(awayTeamRaw)
                    : String(awayTeamRaw);

              const deterministicId = generateMatchId(
                leagueId,
                season,
                round,
                homeTeam,
                awayTeam,
              );
              const odds = extractOddsGlobal(m);
              return {
                ...m,
                ...odds,
                homeTeam,
                awayTeam,
                round,
                id: deterministicId,
                apiId: m.id || m.eventId,
                eventCategoryId:
                  m.eventCategoryId ||
                  m.EventCategoryID ||
                  r.eventCategoryId ||
                  r.EventCategoryID,
                season,
                expectedStart: mStart,
              };
            });
          })
        : [];
      const extractedRankings = rankingData.teams || [];
      const extractedResults =
        resultsData.rounds || (Array.isArray(resultsData) ? resultsData : []);

      // Deduplicate matches by ID to avoid React key warnings
      const uniqueMatchesMap = new Map();
      extractedMatches.forEach((m: any) => {
        if (!uniqueMatchesMap.has(m.id)) {
          uniqueMatchesMap.set(m.id, m);
        }
      });
      const uniqueMatches = Array.from(uniqueMatchesMap.values());

      const fetchedSeason =
        uniqueMatches[0]?.seasonId ||
        uniqueMatches[0]?.season ||
        (extractedResults[0]?.matches?.[0] || extractedResults[0])?.seasonId ||
        (extractedResults[0]?.matches?.[0] || extractedResults[0])?.season;

      // Detect if season is finished (no upcoming matches, but we have results)
      const isFinished =
        uniqueMatches.length === 0 && extractedResults.length > 0;
      setSeasonFinished(isFinished);

      if (currentSeason && fetchedSeason && currentSeason !== fetchedSeason) {
        // Season changed!
        setSyncMessage(`Nouvelle saison détectée (${fetchedSeason}) !`);
        setTimeout(() => setSyncMessage(null), 5000);
      }

      if (fetchedSeason) {
        setCurrentSeason(String(fetchedSeason));
      }

      if (uniqueMatches.length > 0) {
        setMatches((prevMatches) => {
          // Merge logic: preserve 'Finished' status if it was set by Playout API
          const merged = uniqueMatches.map((newM) => {
            const existing = prevMatches.find((p) => p.id === newM.id);
            if (
              existing &&
              existing.status === "Finished" &&
              newM.status !== "Finished"
            ) {
              return {
                ...newM,
                status: "Finished",
                homeScore: existing.homeScore,
                awayScore: existing.awayScore,
                scoreDetails: existing.scoreDetails,
              };
            }
            return newM;
          });
          return merged;
        });
      } else {
        setMatches([]);
      }
      setRankings(extractedRankings);
      setResults(extractedResults);
      console.log(
        `fetchLeagueData: ${uniqueMatches.length} unique matches, ${extractedResults.length} results`,
      );

      // Trigger automatic backup check (runs on every load / sync, regardless of login)
      await checkAndAutoSaveMatrix(
        leagueId,
        extractedResults,
        extractedRankings,
        uniqueMatches,
      );

      // Always sync if app is unlocked
      if (isUnlocked) {
        await syncToDatabase(
          leagueId,
          {
            matches: uniqueMatches,
            results: extractedResults,
            rankings: extractedRankings,
          },
          isAuto,
        );
      }
    } catch (err: any) {
      // Don't show error UI for network errors or purposeful cancellations
      if (
        controller.signal.aborted ||
        (err instanceof Error &&
          (err.name === "AbortError" ||
            err.message?.includes("Aborted") ||
            err.message?.includes("cancelled") ||
            err.message?.includes("fetch started") ||
            err.message?.includes("Failed to fetch") ||
            err.message?.includes("NetworkError")))
      ) {
        console.log(
          "fetchLeagueData: Request cancelled or network error (silent)",
        );
        return;
      }
      console.error("fetchLeagueData error:", err);
      const errorMessage =
        err.message ||
        "Une erreur est survenue lors de la récupération des données";
      if (!isAuto)
        setError(`Erreur lors de la récupération des matchs: ${errorMessage}`);
    } finally {
      if (!isAuto) setLoading(false);
    }
  };

  const updateCalculatorStatsFromMatches = (
    leagueId: number,
    matchesToProcess: any[],
  ) => {
    console.log(
      `updateCalculatorStatsFromMatches: Processing ${matchesToProcess.length} matches for league ${leagueId}`,
    );

    setCalculatorStats((prev) => {
      const newStats = { ...prev };
      if (!newStats[leagueId]) newStats[leagueId] = {};
      const leagueStats = { ...newStats[leagueId] };
      let processedCount = 0;

      matchesToProcess.forEach((m) => {
        // Only process finished matches (handle both Finished and finished)
        if (m.status !== "Finished" && m.status !== "finished") return;

        // Vérifier si ce match a déjà été comptabilisé
        if (processedMatchIdsRef.current.has(m.id)) return;

        // Calculate result if missing
        let result = m.result;
        if (!result && m.homeScore != null && m.awayScore != null) {
          const h = parseInt(m.homeScore);
          const a = parseInt(m.awayScore);
          if (h > a) result = "1";
          else if (a > h) result = "2";
          else result = "X";
        }

        if (!result) return;

        let winningOdds = 0;
        if (result === "1") winningOdds = parseFloat(m.odds1 || "0");
        else if (result === "2") winningOdds = parseFloat(m.odds2 || "0");
        else winningOdds = parseFloat(m.oddsX || "0");

        if (winningOdds > 0) {
          processedMatchIdsRef.current.add(m.id);
          processedCount++;
          const r = m.round || 0;
          let category:
            | "favoriGagnant"
            | "defaiteFavori"
            | "anomalieCorrecte"
            | "anomalieFausse"
            | "nulle" = "nulle";

          if (result === "X") {
            category = "nulle";
          } else {
            const hRank = m.homeRank || 0;
            const aRank = m.awayRank || 0;
            const hOdds = parseFloat(m.odds1 || "0");
            const aOdds = parseFloat(m.odds2 || "0");

            const isHomeBetter = hRank <= aRank;
            const oddsA = isHomeBetter ? hOdds : aOdds;
            const oddsB = isHomeBetter ? aOdds : hOdds;
            const resultA = isHomeBetter ? "1" : "2";

            if (oddsA < oddsB) {
              if (result === resultA) category = "favoriGagnant";
              else category = "defaiteFavori";
            } else {
              if (result === resultA) category = "anomalieFausse";
              else category = "anomalieCorrecte";
            }
          }

          if (leagueStats[r]) {
            const currentCategories = leagueStats[r].categories || {
              favoriGagnant: { sum: 0, count: 0 },
              defaiteFavori: { sum: 0, count: 0 },
              anomalieCorrecte: { sum: 0, count: 0 },
              anomalieFausse: { sum: 0, count: 0 },
              nulle: { sum: 0, count: 0 },
            };

            leagueStats[r] = {
              ...leagueStats[r],
              sumOdds: leagueStats[r].sumOdds + winningOdds,
              matchCount: leagueStats[r].matchCount + 1,
              lastUpdate: new Date(),
              categories: {
                ...currentCategories,
                [category]: {
                  sum: (currentCategories[category]?.sum || 0) + winningOdds,
                  count: (currentCategories[category]?.count || 0) + 1,
                },
              },
            };
          } else {
            const initialCategories: CalculatorStats["categories"] = {
              favoriGagnant: { sum: 0, count: 0 },
              defaiteFavori: { sum: 0, count: 0 },
              anomalieCorrecte: { sum: 0, count: 0 },
              anomalieFausse: { sum: 0, count: 0 },
              nulle: { sum: 0, count: 0 },
            };
            initialCategories[category] = { sum: winningOdds, count: 1 };

            leagueStats[r] = {
              round: r,
              sumOdds: winningOdds,
              matchCount: 1,
              lastUpdate: new Date(),
              categories: initialCategories,
            };
          }
        }
      });

      if (processedCount === 0) return prev;

      console.log(
        `updateCalculatorStatsFromMatches: Processed ${processedCount} NEW matches for league ${leagueId}. Total rounds: ${Object.keys(leagueStats).length}`,
      );
      newStats[leagueId] = leagueStats;
      return newStats;
    });
  };

  const syncToDatabase = async (
    leagueId: number,
    dataToSync?: { matches: any[]; results: any[]; rankings: any[] },
    isAuto = false,
  ) => {
    if (!isUnlockedRef.current) {
      if (!isAuto)
        setError(
          "Veuillez vous connecter pour aspirer et sauvegarder les données.",
        );
      return;
    }

    // Check if a radical reset was just performed
    if (localStorage.getItem("mahakasa_reset_pending") === "true") {
      console.log(
        "[Sync] Radical reset pending - skipping auto-sync to avoid phantom data",
      );
      return;
    }

    setIsSyncing(true);
    const mList = dataToSync ? dataToSync.matches : matches;
    const rList = dataToSync ? dataToSync.results : results;

    if (!isAuto) setSyncMessage(null);

    try {
      const rkList = dataToSync ? dataToSync.rankings : rankings;
      const matchesMap = new Map<string, MatchData>();
      const now = new Date().toISOString();

      const teamPoints: Record<string, any> = {};
      const teamRanks: Record<string, any> = {};
      rkList.forEach((r: any, index: number) => {
        const name = r.name || r.teamName;
        if (name) {
          const extractValue = (v: any) => {
            if (v === null || v === undefined) return null;
            if (typeof v === "object")
              return (
                v.total ?? v.rank ?? v.points ?? v.position ?? JSON.stringify(v)
              );
            return v;
          };
          teamPoints[name] = extractValue(r.points);
          teamRanks[name] = extractValue(r.position) || index + 1;
        }
      });

      const seasonsSet = new Set<string>();
      const firstM =
        dataToSync?.matches?.[0] ||
        dataToSync?.results?.[0]?.matches?.[0] ||
        dataToSync?.results?.[0];
      const apiSeasonVal =
        firstM?.eventCategoryId ||
        firstM?.EventCategoryID ||
        firstM?.seasonId ||
        firstM?.season ||
        currentSeason;
      const apiSeason = apiSeasonVal
        ? String(apiSeasonVal).startsWith("ID:")
          ? apiSeasonVal
          : `ID: ${apiSeasonVal}`
        : null;

      if (apiSeason) seasonsSet.add(String(apiSeason));
      mList.forEach((m: any) =>
        seasonsSet.add(getDailySeason(m.expectedStart || Date.now())),
      );
      rList.forEach((rd: any) =>
        (Array.isArray(rd.matches) ? rd.matches : [rd]).forEach((m: any) =>
          seasonsSet.add(getDailySeason(m.expectedStart || Date.now())),
        ),
      );

      const seasons = Array.from(seasonsSet);
      if (seasons.length === 0) seasons.push(getDailySeason(Date.now()));

      // Fetch existing local matches
      let existingMatches: any[] = [];
      try {
        const { getLocalMatchesBySeason } =
          await import("./services/localArchive");
        for (const s of seasons) {
          const local = await getLocalMatchesBySeason(leagueId, s);
          existingMatches = [...existingMatches, ...local];
        }
      } catch (e) {
        console.warn("Local fetch failed", e);
      }

      existingMatches.forEach((m) => matchesMap.set(m.id, m));

      const extractOdds = (m: any) => {
        const allOdds: Record<string, any> = {};
        const markets = m.eventBetTypes || m.markets || m.odds || [];

        if (Array.isArray(markets)) {
          markets.forEach((mk: any) => {
            const mName = mk.name || mk.id || mk.marketName || "Unknown";
            const items =
              mk.eventBetTypeItems || mk.outcomes || mk.items || mk.odds || [];
            if (Array.isArray(items)) {
              allOdds[mName] = items.map((o: any) => ({
                name:
                  o.name ||
                  o.shortName ||
                  o.outcomeName ||
                  o.outcome ||
                  o.id ||
                  o.label,
                odds: (
                  o.odds ||
                  o.price ||
                  o.value ||
                  o.rate ||
                  o.odd
                )?.toString(),
              }));
            }
          });
        }

        const findOdds1X2 = () => {
          if (m.odds1 && m.oddsX && m.odds2)
            return {
              odds1: m.odds1.toString(),
              oddsX: m.oddsX.toString(),
              odds2: m.odds2.toString(),
            };

          // Try to find in allOdds first
          const matchResultKey = Object.keys(allOdds).find((k) =>
            ["1X2", "MATCH RESULT", "RÉSULTAT DU MATCH"].includes(
              k.toUpperCase(),
            ),
          );
          if (matchResultKey && allOdds[matchResultKey].length >= 3) {
            const its = allOdds[matchResultKey];
            const getO = (ns: string[]) =>
              its.find((o: any) =>
                ns.some(
                  (n) =>
                    o.name && o.name.toLowerCase().includes(n.toLowerCase()),
                ),
              )?.odds;
            return {
              odds1: getO(["1", "home"]),
              oddsX: getO(["x", "draw"]),
              odds2: getO(["2", "away"]),
            };
          }

          const mk = (m.eventBetTypes || m.markets || m.odds || []).find(
            (x: any) =>
              ["1X2", "MATCH RESULT"].includes(
                (x.name || x.id || "").toUpperCase(),
              ),
          );
          if (!mk) return {};
          const its =
            mk.eventBetTypeItems || mk.outcomes || mk.items || mk.odds || [];
          const getO = (ns: string[]) =>
            its
              .find((o: any) =>
                ns.some((n) =>
                  [o.shortName, o.name, o.outcomeName, o.outcome, String(o.id)]
                    .map((v) => (v || "").toString().toLowerCase())
                    .includes(n.toLowerCase()),
                ),
              )
              ?.odds?.toString();
          return {
            odds1: getO(["1", "home"]),
            oddsX: getO(["x", "draw"]),
            odds2: getO(["2", "away"]),
          };
        };

        const result = findOdds1X2();

        // Ensure 1X2 is in allOdds if we have it
        if (
          result.odds1 &&
          result.oddsX &&
          result.odds2 &&
          !Object.keys(allOdds).some((k) =>
            ["1X2", "MATCH RESULT"].includes(k.toUpperCase()),
          )
        ) {
          allOdds["MATCH RESULT"] = [
            { name: "1", odds: result.odds1 },
            { name: "X", odds: result.oddsX },
            { name: "2", odds: result.odds2 },
          ];
        }

        return { ...result, allOdds };
      };

      const upcomingIds = new Set<string>();
      mList.forEach((m) => {
        const odds = extractOdds(m);
        const matchTime = m.expectedStart || Date.now();
        const seasonIdOrEventCategoryId =
          m.eventCategoryId ||
          m.EventCategoryID ||
          m.seasonId ||
          m.season ||
          apiSeason;
        const season = formatSeason(
          getDailySeason(matchTime),
          seasonIdOrEventCategoryId,
        );
        const round = Number(m.round) || 0;
        const home = String(
          m.homeTeam?.name || m.homeTeam?.teamName || m.homeTeam || "Unknown",
        );
        const away = String(
          m.awayTeam?.name || m.awayTeam?.teamName || m.awayTeam || "Unknown",
        );
        const id = generateMatchId(leagueId, season, round, home, away);
        upcomingIds.add(id);
        const score = m.score
          ? { h: m.score.split(/[:-]/)[0], a: m.score.split(/[:-]/)[1] }
          : { h: m.homeScore, a: m.awayScore };
        const isLive =
          score.h != null &&
          score.a != null &&
          score.h !== "-" &&
          score.a !== "-" &&
          String(score.h).trim() !== "";
        const scoreDetails =
          m.scoreDetails || m.eventScore?.scoreDetails || undefined;
        const matchObj = {
          id,
          leagueId,
          eventCategoryId: m.eventCategoryId || m.EventCategoryID,
          season,
          round,
          homeTeam: home,
          awayTeam: away,
          expectedStart: m.expectedStart ? String(m.expectedStart) : undefined,
          ...odds,
          homeRank: teamRanks[home],
          awayRank: teamRanks[away],
          homePoints: teamPoints[home],
          awayPoints: teamPoints[away],
          status: isLive ? "Live" : "Upcoming",
          homeScore: isLive ? String(score.h) : undefined,
          awayScore: isLive ? String(score.a) : undefined,
          scoreDetails,
          updatedAt: now,
        };
        matchesMap.set(id, { ...(matchesMap.get(id) || {}), ...matchObj });
      });

      rList.forEach((rd: any) =>
        (Array.isArray(rd.matches)
          ? rd.matches
          : Array.isArray(rd)
            ? rd
            : [rd]
        ).forEach((m: any) => {
          const odds = extractOdds(m);
          const score = m.score
            ? { h: m.score.split(/[:-]/)[0], a: m.score.split(/[:-]/)[1] }
            : { h: m.homeScore, a: m.awayScore };
          const hasScore =
            score.h != null &&
            score.a != null &&
            score.h !== "-" &&
            String(score.h).trim() !== "";
          const seasonIdOrEventCategoryId =
            m.eventCategoryId ||
            m.EventCategoryID ||
            rd.eventCategoryId ||
            rd.EventCategoryID ||
            m.seasonId ||
            m.season ||
            rd.seasonId ||
            rd.season ||
            apiSeason;
          const season = formatSeason(
            getDailySeason(m.expectedStart || rd.expectedStart || Date.now()),
            seasonIdOrEventCategoryId,
          );
          const round = Number(rd.roundNumber || rd.round || m.round) || 0;
          const home = String(
            m.homeTeam?.name || m.homeTeam?.teamName || m.homeTeam || "Unknown",
          );
          const away = String(
            m.awayTeam?.name || m.awayTeam?.teamName || m.awayTeam || "Unknown",
          );
          const id = generateMatchId(leagueId, season, round, home, away);
          const status = hasScore
            ? upcomingIds.has(id)
              ? "Live"
              : "Finished"
            : "Upcoming";
          const scoreDetails =
            m.scoreDetails || m.eventScore?.scoreDetails || undefined;
          const matchObj = {
            id,
            leagueId,
            eventCategoryId:
              m.eventCategoryId ||
              m.EventCategoryID ||
              rd.eventCategoryId ||
              rd.EventCategoryID,
            season,
            round,
            homeTeam: home,
            awayTeam: away,
            expectedStart: m.expectedStart
              ? String(m.expectedStart)
              : rd.expectedStart
                ? String(rd.expectedStart)
                : undefined,
            homeScore: hasScore ? String(score.h) : undefined,
            awayScore: hasScore ? String(score.a) : undefined,
            ...odds,
            homeRank: teamRanks[home],
            awayRank: teamRanks[away],
            homePoints: teamPoints[home],
            awayPoints: teamPoints[away],
            scoreDetails,
            status,
            updatedAt: now,
          };
          matchesMap.set(id, { ...(matchesMap.get(id) || {}), ...matchObj });
        }),
      );

      const finalMatches = Array.from(matchesMap.values()).filter(
        (m) => m.odds1 || m.oddsX || m.odds2 || m.homeScore !== undefined,
      );

      // Update local UI state
      if (finalMatches.length > 0) {
        // We REMOVE the automatic call to saveMatchesToLocal(finalMatches) here
        // to only allow manual extraction to feed the database

        if (!isAuto) {
          setSyncMessage(
            `${finalMatches.length} matchs synchronisés pour l'affichage`,
          );
          setTimeout(() => setSyncMessage(null), 5000);
        }
        updateCalculatorStatsFromMatches(leagueId, finalMatches);
      }

      // Delegate to unified automatic matrix backup checker
      await checkAndAutoSaveMatrix(leagueId, rList, rkList, mList);

      // Disable old redundant inline automatic save block
      if (false && rList && rList.length > 0 && rkList && rkList.length > 0) {
        try {
          const { LEAGUES } = await import("./shared/constants");
          const leagueConfig = LEAGUES.find(
            (l) => Number(l.id) === Number(leagueId),
          );
          const totalRounds = leagueConfig?.rounds || 34;
          const targetRoundSaved = totalRounds - 1; // e.g. 33 for 34

          if (rList.length === targetRoundSaved) {
            console.log(
              `[Automatic Matrix Backup] Condition met: round ${rList.length} of ${totalRounds} completed.`,
            );
            const activeSeason =
              apiSeason || currentSeason || getDailySeason(Date.now());
            const matrixId = `matrix_${leagueId}_${activeSeason.replace(/[^a-z0-9]/gi, "_")}_r${targetRoundSaved}`;

            const { db, saveAnalysisMatrix } =
              await import("./services/localArchive");
            const existing = await db.matrices.get(matrixId);

            if (!existing) {
              console.log(
                `[Automatic Matrix Backup] Unsaved matrices detected. Computing now...`,
              );

              const getTeamNameLocal = (team: any) => {
                if (!team) return "-";
                if (typeof team === "string") return team;
                return team.name || team.teamName || team.shortName || "Équipe";
              };

              const getFullFormLocal = (teamName: string) => {
                const formArr: string[] = [];
                const normalizedTarget = teamName.toLowerCase().trim();
                rList.forEach((round: any) => {
                  const ms =
                    round.matches || (Array.isArray(round) ? round : []);
                  ms.forEach((m: any) => {
                    const hN = getTeamNameLocal(m.homeTeam)
                      .toLowerCase()
                      .trim();
                    const aN = getTeamNameLocal(m.awayTeam)
                      .toLowerCase()
                      .trim();
                    if (hN === normalizedTarget || aN === normalizedTarget) {
                      let homeRaw = m.homeScore;
                      let awayRaw = m.awayScore;
                      if (m.score) {
                        const sep = m.score.includes(":") ? ":" : "-";
                        const parts = m.score.split(sep);
                        if (parts.length === 2) {
                          homeRaw = parts[0];
                          awayRaw = parts[1];
                        }
                      }
                      if (
                        homeRaw === undefined ||
                        homeRaw === null ||
                        homeRaw === "" ||
                        awayRaw === undefined ||
                        awayRaw === null ||
                        awayRaw === ""
                      )
                        return;
                      const hS = parseInt(String(homeRaw));
                      const aS = parseInt(String(awayRaw));
                      if (isNaN(hS) || isNaN(aS)) return;
                      if (hN === normalizedTarget) {
                        formArr.push(
                          hS > aS ? "Won" : hS < aS ? "Lost" : "Draw",
                        );
                      } else {
                        formArr.push(
                          aS > hS ? "Won" : aS < hS ? "Lost" : "Draw",
                        );
                      }
                    }
                  });
                });
                return formArr;
              };

              // Rank Evolution timeline
              const allTeamNames = rkList.map((t: any) => getTeamNameLocal(t));
              const statsMap: Record<
                string,
                {
                  name: string;
                  points: number;
                  gd: number;
                  gf: number;
                  played: number;
                }
              > = {};

              allTeamNames.forEach((teamName: string) => {
                const normalized = teamName.toLowerCase().trim();
                statsMap[normalized] = {
                  name: teamName,
                  points: 0,
                  gd: 0,
                  gf: 0,
                  played: 0,
                };
              });

              const rankTimeline: Record<string, number[]> = {};
              const normalizedToOriginal: Record<string, string> = {};
              allTeamNames.forEach((teamName: string) => {
                const normalized = teamName.toLowerCase().trim();
                rankTimeline[normalized] = [];
                normalizedToOriginal[normalized] = teamName;
              });

              rList.forEach((round: any, roundIndex: number) => {
                const matches =
                  round.matches || (Array.isArray(round) ? round : []);
                matches.forEach((m: any) => {
                  const homeName = getTeamNameLocal(m.homeTeam);
                  const awayName = getTeamNameLocal(m.awayTeam);
                  const hN = homeName.toLowerCase().trim();
                  const aN = awayName.toLowerCase().trim();

                  if (!statsMap[hN]) {
                    statsMap[hN] = {
                      name: homeName,
                      points: 0,
                      gd: 0,
                      gf: 0,
                      played: 0,
                    };
                    rankTimeline[hN] = [];
                    normalizedToOriginal[hN] = homeName;
                  }
                  if (!statsMap[aN]) {
                    statsMap[aN] = {
                      name: awayName,
                      points: 0,
                      gd: 0,
                      gf: 0,
                      played: 0,
                    };
                    rankTimeline[aN] = [];
                    normalizedToOriginal[aN] = awayName;
                  }

                  let homeRaw = m.homeScore;
                  let awayRaw = m.awayScore;
                  if (m.score) {
                    const sep = m.score.includes(":") ? ":" : "-";
                    const parts = m.score.split(sep);
                    if (parts.length === 2) {
                      homeRaw = parts[0];
                      awayRaw = parts[1];
                    }
                  }

                  if (
                    homeRaw !== undefined &&
                    homeRaw !== null &&
                    homeRaw !== "" &&
                    awayRaw !== undefined &&
                    awayRaw !== null &&
                    awayRaw !== ""
                  ) {
                    const hS = parseInt(String(homeRaw));
                    const aS = parseInt(String(awayRaw));
                    if (!isNaN(hS) && !isNaN(aS)) {
                      statsMap[hN].played += 1;
                      statsMap[aN].played += 1;
                      statsMap[hN].gf += hS;
                      statsMap[hN].gd += hS - aS;
                      statsMap[aN].gf += aS;
                      statsMap[aN].gd += aS - hS;

                      if (hS > aS) {
                        statsMap[hN].points += 3;
                      } else if (hS < aS) {
                        statsMap[aN].points += 3;
                      } else {
                        statsMap[hN].points += 1;
                        statsMap[aN].points += 1;
                      }
                    }
                  }
                });

                const roundStandings = Object.keys(statsMap).map((normKey) => ({
                  normKey,
                  ...statsMap[normKey],
                }));

                roundStandings.sort((a, b) => {
                  if (b.points !== a.points) return b.points - a.points;
                  if (b.gd !== a.gd) return b.gd - a.gd;
                  if (b.gf !== a.gf) return b.gf - a.gf;
                  return a.name.localeCompare(b.name);
                });

                roundStandings.forEach((entry, idxInStandings) => {
                  if (rankTimeline[entry.normKey]) {
                    rankTimeline[entry.normKey].push(idxInStandings + 1);
                  }
                });

                Object.keys(statsMap).forEach((normKey) => {
                  if (rankTimeline[normKey].length < roundIndex + 1) {
                    const prevArr = rankTimeline[normKey];
                    const lastRank =
                      prevArr.length > 0
                        ? prevArr[prevArr.length - 1]
                        : Object.keys(statsMap).length;
                    prevArr.push(lastRank);
                  }
                });
              });

              // Superposed Form list
              const teamForms = rkList.map((team: any, index: number) => {
                const teamName = team.name || team.teamName;
                const history = getFullFormLocal(teamName);
                return {
                  teamName,
                  history,
                  rank: team.position || index + 1,
                  points: team.points || 0,
                };
              });

              const archivedMatches = rList.reduce((acc: any[], round: any) => {
                const rMatches =
                  round.matches || (Array.isArray(round) ? round : []);
                rMatches.forEach((m: any) => {
                  let scoreStr = m.score;
                  if (!scoreStr && m.homeScore != null && m.awayScore != null) {
                    scoreStr = `${m.homeScore}-${m.awayScore}`;
                  }
                  const separator = scoreStr?.includes(":") ? ":" : "-";
                  const [hS, aS] = (scoreStr || "-").split(separator);

                  acc.push({
                    leagueId: Number(leagueId),
                    season: activeSeason,
                    round:
                      Number(m.roundNumber || m.round) ||
                      Number(round.roundNumber || round.round) ||
                      0,
                    homeTeam: getTeamNameLocal(m.homeTeam),
                    awayTeam: getTeamNameLocal(m.awayTeam),
                    homeScore: hS || m.homeScore || "",
                    awayScore: aS || m.awayScore || "",
                    status: m.status || "Finished",
                    expectedStart:
                      m.expectedStart ||
                      m.updatedAt ||
                      new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  });
                });
                return acc;
              }, []);

              const newMatrixObj = {
                id: matrixId,
                leagueId: Number(leagueId),
                season: activeSeason,
                roundSaved: targetRoundSaved,
                rankTimeline,
                normalizedToOriginal,
                teamForms,
                archivedMatches,
                savedAt: new Date().toISOString(),
              };

              const saved = await saveAnalysisMatrix(newMatrixObj);
              if (saved) {
                // Keep database matches table synchronized - CLOSED by application policy (Only extraction menu is allowed to save matches)
                console.log(
                  "[Automatic Matrix Backup] Background matches save to database is disabled.",
                );

                setSyncMessage(
                  `💾 Matrices de R${targetRoundSaved} archivées automatiquement avec succès !`,
                );
                setTimeout(() => setSyncMessage(null), 10000);
                window.dispatchEvent(new CustomEvent("matrices_auto_saved"));
              }
            }
          }
        } catch (autoErr) {
          console.error(
            "[Automatic Matrix Backup] Error while auto saving:",
            autoErr,
          );
        }
      }
    } catch (err: any) {
      console.error(err);
      if (!isAuto) setError("Erreur de synchronisation locale.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncMessage("Synchronisation via Scraper...");
    try {
      const res = await fetch("/api/scraper/run", { method: "POST" });
      if (res.ok) {
        setSyncMessage("Scraper terminé ! Mise à jour locale...");
        await fetchLeagueData(selectedLeague);
      } else {
        throw new Error("Scraper Error");
      }
    } catch (err: any) {
      setSyncMessage("Erreur: " + err.message);
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetCalculator = async (leagueIdToReset: number) => {
    setCalculatorStats((prev) => {
      const newStats = { ...prev };
      delete newStats[leagueIdToReset];
      return newStats;
    });

    const newProcessed = new Set<string>();
    processedMatchIdsRef.current.forEach((id) => {
      if (!id.startsWith(`${leagueIdToReset}_`)) newProcessed.add(id);
    });
    processedMatchIdsRef.current = newProcessed;

    try {
      const { getLocalMatchesBySeason } =
        await import("./services/localArchive");
      // Repopulate from all available local seasons
      const seasons = [getDailySeason(Date.now())]; // Minimal check
      for (const s of seasons) {
        const data = await getLocalMatchesBySeason(leagueIdToReset, s);
        if (data && data.length > 0)
          updateCalculatorStatsFromMatches(leagueIdToReset, data);
      }
    } catch (err) {
      console.error("Error repopulating local stats:", err);
    }
  };

  if (!isUnlocked) {
    return (
      <LoginScreen
        onLoginSuccess={(authToken: string, authUser: any) => {
          localStorage.setItem("mahakasa_token", authToken);
          localStorage.setItem("mahakasa_user", JSON.stringify(authUser));
          setToken(authToken);
          setCurrentUser(authUser);
          setIsUnlocked(true);
          isUnlockedRef.current = true;
          setActiveTab("matches");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-800/50 text-slate-100 font-sans text-[11px] sm:text-[12px] selection:bg-blue-100">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 glass-panel">
        <div className="max-w-[1700px] xl:max-w-[1850px] w-full mx-auto px-3 sm:px-4 py-2 sm:py-0 flex flex-col sm:flex-row sm:h-14 sm:items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Bet261 Status Row */}
          <div className="flex items-center justify-between w-full sm:w-auto gap-3">
            <div className="flex items-center gap-2">
              <div className="bg-slate-950 p-1.5 rounded-lg shadow-sm">
                <Database className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <h1 className="text-xs sm:text-sm font-black text-slate-100 uppercase tracking-tighter leading-none">
                  Mahakasa Virtual
                </h1>
                <p className="text-[7.5px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 hidden min-[400px]:block">
                  Data Hub Store
                </p>
              </div>
            </div>

            {/* Bet261 Action on Mobile next to logo */}
            <div className="flex sm:hidden items-center gap-1.5 shrink-0">
              {bet261Account ? (
                <div className="flex items-center gap-1">
                  <div className="flex items-center bg-slate-800/40 rounded-2xl border border-slate-800 p-0.5 pr-2 shadow-inner">
                    <div className="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-black text-[9px]">
                      {bet261Account.username?.substring(0, 1) || "B"}
                    </div>
                    <span className="text-[10px] font-black text-white font-mono tracking-tighter ml-1.5">
                      {(bet261Account.balance || 0).toLocaleString()}{" "}
                      <span className="text-[7px] text-emerald-500">AR</span>
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Voulez-vous vous déconnecter de Bet261 ?"))
                        handleBet261Logout();
                    }}
                    className="p-1.5 hover:bg-rose-500/10 rounded-lg text-slate-500 hover:text-rose-500 border border-slate-800"
                  >
                    <LogIn className="w-3.5 h-3.5 rotate-180" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowBet261Login(true)}
                  className="flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/15 px-2.5 py-1 rounded-full text-indigo-400"
                >
                  <LogIn className="w-3 h-3" />
                  <span className="text-[8px] font-black uppercase tracking-wider">
                    Bet261
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Controls Area (League selector + sync / Admin states) */}
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto border-t border-slate-800/50 pt-1.5 sm:pt-0 sm:border-t-0">
            {/* Bet261 Account for Desktop */}
            <div className="hidden sm:flex items-center gap-3">
              {bet261Account ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-slate-800/40 rounded-2xl border border-slate-800 p-1 pr-3 shadow-inner group transition-all hover:bg-slate-800/60">
                    <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-black text-[10px] shadow-lg shadow-emerald-500/20 mr-3 relative overflow-hidden group-hover:scale-105 transition-transform">
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      {bet261Account.username?.substring(0, 1) || "B"}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-black text-white font-mono tracking-tighter">
                          {(bet261Account.balance || 0).toLocaleString()}
                          <span className="text-[8px] text-emerald-500 ml-1">
                            AR
                          </span>
                        </span>
                        <button
                          onClick={() =>
                            refreshBet261Balance(bet261Account.access_token)
                          }
                          className="p-1 hover:bg-slate-700/50 rounded-md transition-all text-slate-500 hover:text-emerald-400 group/refresh"
                          title="Rafraîchir le solde"
                        >
                          <RefreshCw className="w-3 h-3 group-active/refresh:rotate-180 transition-transform duration-500" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex items-center gap-0.5">
                          <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
                          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest text-[6px] sm:text-[7px]">
                            Connected
                          </span>
                        </div>
                        {freeBets && freeBets.length > 0 && (
                          <div
                            className="flex items-center gap-0.5 bg-amber-500/10 border border-amber-500/20 px-1 rounded"
                            title={freeBets
                              .map(
                                (fb) =>
                                  `Coupon ID ${fb.id}: ${fb.balance || 0} AR`,
                              )
                              .join("\n")}
                          >
                            <Gift className="w-2 h-2 text-amber-400 animate-bounce" />
                            <span className="text-[6.5px] font-bold text-amber-400 font-mono uppercase">
                              {freeBets.length} FB
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (confirm("Voulez-vous vous déconnecter de Bet261 ?"))
                        handleBet261Logout();
                    }}
                    className="p-2 hover:bg-rose-500/10 rounded-xl text-slate-600 hover:text-rose-500 transition-all border border-slate-800 hover:border-rose-500/20 bg-slate-900/50"
                    title="Déconnexion"
                  >
                    <LogIn className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowBet261Login(true)}
                  className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full hover:bg-indigo-500/20 transition-all group"
                >
                  <LogIn className="w-3 h-3 text-indigo-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
                    Connecter Bet261
                  </span>
                </button>
              )}
            </div>

            {/* League select - compact on mobile, styled nicely */}
            {activeTab !== "extraction" && (
              <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full border border-slate-700/60 max-w-[170px] sm:max-w-none">
                <img
                  src={getLeagueFlag(
                    LEAGUES.find((l) => l.id === selectedLeague)?.country,
                  )}
                  alt=""
                  className="w-3.5 h-2.5 sm:w-4 sm:h-3 object-contain rounded-sm"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  onLoad={(e) => (e.currentTarget.style.display = "block")}
                />
                <label className="font-bold text-slate-400 uppercase text-[8px] sm:text-[9px] tracking-wider shrink-0">
                  Ligue:
                </label>
                <select
                  className="bg-transparent text-slate-100 text-[9px] sm:text-[10px] font-black outline-none cursor-pointer truncate max-w-[80px] sm:max-w-[120px]"
                  value={selectedLeague}
                  onChange={(e) => setSelectedLeague(Number(e.target.value))}
                >
                  {LEAGUES.map((league) => (
                    <option
                      key={league.id}
                      className="bg-slate-900 text-slate-200"
                      value={league.id}
                    >
                      {league.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l border-slate-800/80 shrink-0">
              <div className="hidden sm:flex flex-col items-end">
                <span
                  className="text-[9px] font-black text-slate-100 uppercase tracking-widest leading-none truncate max-w-[120px]"
                  title={currentUser?.fullName || "Utilisateur"}
                >
                  {currentUser?.fullName || "Utilisateur"}
                </span>
                <span className="text-[7.5px] text-emerald-500 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse animate-duration-1000"></span>
                  {currentUser?.role === "admin"
                    ? "Administrateur"
                    : "Membre Validé"}
                </span>
              </div>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className={`bg-slate-800 hover:bg-slate-800/80 p-1.5 sm:p-2 rounded-full border border-slate-850 transition-all duration-300 ${isSyncing ? "text-emerald-500 animate-spin" : "text-slate-400 hover:text-emerald-500 hover:border-emerald-200"}`}
                title="Synchroniser maintenant"
              >
                <RefreshCw
                  className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isSyncing ? "animate-spin" : ""}`}
                />
              </button>

              {/* Notifications / Messages button */}
              <button
                onClick={() => {
                  setShowUserMessages(!showUserMessages);
                  if (!showUserMessages) {
                    fetchUserMessages();
                  }
                }}
                className={`relative p-1.5 sm:p-2 rounded-full border transition-all duration-300 cursor-pointer ${
                  getUnreadMessagesCount() > 0
                    ? "bg-indigo-600 border-indigo-500 text-white animate-pulse"
                    : "bg-slate-800 border-slate-805 text-slate-400 hover:text-indigo-400 hover:border-indigo-900/60"
                }`}
                title="Consulter vos messages et notifications"
              >
                <MessageSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                {getUnreadMessagesCount() > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-black leading-none text-white ring-2 ring-slate-900">
                    {getUnreadMessagesCount()}
                  </span>
                )}
              </button>

              <button
                onClick={handleAuthLogout}
                className="bg-slate-800 hover:bg-rose-950/25 p-1.5 sm:p-2 rounded-full border border-slate-850 text-slate-400 hover:text-rose-400 hover:border-rose-900/40 transition-all cursor-pointer"
                title="Se déconnecter"
              >
                <LogIn className="w-3 h-3 sm:w-3.5 sm:h-3.5 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[1700px] xl:max-w-[1850px] w-full mx-auto p-4 sm:p-6">
        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between items-start sm:items-center">
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-sm overflow-x-auto max-w-full no-scrollbar">
            <TabButton
              icon={<Trophy />}
              label="Matchs"
              malagasy="Lalao"
              active={activeTab === "matches"}
              onClick={() => setActiveTab("matches")}
            />
            <TabButton
              icon={<ArrowLeftRight />}
              label="Scanner"
              malagasy="Scanner"
              active={activeTab === "lasa"}
              onClick={() => setActiveTab("lasa")}
            />
            <TabButton
              icon={<Trophy />}
              label="Classement"
              malagasy="Filaharana"
              active={activeTab === "standings"}
              onClick={() => setActiveTab("standings")}
            />
            <TabButton
              icon={<Activity />}
              label="Formes"
              malagasy="Valiny"
              active={activeTab === "results"}
              onClick={() => setActiveTab("results")}
            />
            <TabButton
              icon={<History />}
              label="Archives"
              malagasy="Arisiva"
              active={activeTab === "local_db"}
              onClick={() => setActiveTab("local_db")}
            />
            <TabButton
              icon={<Calculator />}
              label="Calculateur"
              malagasy="Mpikajy"
              active={activeTab === "calculator"}
              onClick={() => setActiveTab("calculator")}
            />
            <TabButton
              icon={<Clock />}
              label="Sériels"
              malagasy="Sériels"
              active={activeTab === "upcoming"}
              onClick={() => setActiveTab("upcoming")}
            />
            <TabButton
              icon={<RefreshCw />}
              label="Extraction"
              malagasy="Maka dité"
              active={activeTab === "extraction"}
              onClick={() => setActiveTab("extraction")}
            />
            <TabButton
              icon={<ShieldCheck />}
              label="Bot Auto"
              malagasy="Bot Mahakasa"
              active={activeTab === "bot"}
              onClick={() => setActiveTab("bot")}
            />
            {currentUser?.role === "admin" && (
              <TabButton
                icon={<Users />}
                label="Comptes"
                malagasy="Mpamiasa"
                active={activeTab === "users"}
                onClick={() => setActiveTab("users")}
              />
            )}
          </div>
        </div>

        {syncMessage && (
          <div className="mb-4 px-4 py-2 bg-emerald-900/20 border border-emerald-900/50 text-emerald-400 rounded-lg text-[10px] font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-ping"></div>
            {syncMessage}
          </div>
        )}

        {/* Error & Loading States */}
        {error && (
          <div className="mb-4 p-3 bg-rose-900/20 border border-rose-900/50 text-rose-400 rounded flex items-center gap-2 text-xs font-bold">
            <AlertCircle className="w-4 h-4" />
            <div className="text-[10px] uppercase font-black tracking-tight">
              {typeof error === "string" ? error : JSON.stringify(error)}
            </div>
          </div>
        )}

        {isSyncing && syncProgress !== null && (
          <div className="mb-4 p-3 bg-slate-800/50 border border-slate-700 rounded shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Synchronisation en cours...
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-400">
                {syncProgress}%
              </span>
            </div>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${syncProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {seasonFinished && (
          <div className="mb-4 p-3 bg-amber-900/20 border border-amber-800/50 text-amber-200 rounded flex items-center justify-between gap-2 text-xs font-bold shadow-sm animate-pulse">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <p>
                Saison terminée ! En attente du chargement de la nouvelle
                saison...
              </p>
            </div>
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          </div>
        )}

        {loading && !matches.length && activeTab !== "extraction" && (
          <div className="py-12 flex flex-col items-center justify-center text-emerald-400">
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <span className="text-xs font-bold uppercase tracking-widest">
              Chargement...
            </span>
          </div>
        )}

        <div
          className={`bg-slate-900 ${loading && !matches.length && activeTab !== "extraction" ? "hidden" : "block"}`}
        >
          <div className="max-h-[85vh] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar pb-20">
            {activeTab === "matches" && (
              <div className="space-y-4">
                {/* Sub-tabs for Current vs Future Rounds */}
                <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-850 gap-2 w-full max-w-sm mb-4">
                  <button
                    onClick={() => setMatchesSubTab("current")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                      matchesSubTab === "current"
                        ? "bg-[#0f172a] text-emerald-400 border border-slate-800 shadow-md font-extrabold"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/30"
                    }`}
                  >
                    <Trophy className="w-3 h-3 text-emerald-400" />
                    Round Actuel
                  </button>
                  <button
                    onClick={() => setMatchesSubTab("future")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                      matchesSubTab === "future"
                        ? "bg-[#0f172a] text-indigo-400 border border-slate-800 shadow-md font-extrabold"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/30"
                    }`}
                  >
                    <Clock className="w-3 h-3 text-indigo-400" />
                    Rounds Futurs
                  </button>
                </div>

                {matchesSubTab === "current" ? (
                  <MatchesView
                    matches={matches}
                    rankings={rankings}
                    results={results}
                    onMatchClick={(match) => setSelectedMatchForBets(match)}
                    onPlaceBet={executeAutoBet}
                    bet261Account={bet261Account}
                  />
                ) : (
                  <UpcomingRoundsView
                    leagueId={selectedLeague}
                    leagueName={
                      LEAGUES.find((l) => l.id === selectedLeague)?.name || ""
                    }
                    rankings={rankings}
                    results={results}
                    globalMatches={matches}
                    onUpdateMatches={setMatches}
                    onMatchClick={(match) => setSelectedMatchForBets(match)}
                    onPlaceBet={executeAutoBet}
                    bet261Account={bet261Account}
                  />
                )}
              </div>
            )}
            {activeTab === "lasa" && <LasaView upcomingMatches={matches} />}
            {activeTab === "standings" && (
              <StandingsView rankings={rankings} results={results} />
            )}
            {activeTab === "results" && (
              <ResultsView
                results={results}
                rankings={rankings}
                leagueId={selectedLeague}
              />
            )}
            {activeTab === "upcoming" && (
              <UpcomingRoundsView
                leagueId={selectedLeague}
                leagueName={
                  LEAGUES.find((l) => l.id === selectedLeague)?.name || ""
                }
                rankings={rankings}
                results={results}
                globalMatches={matches}
                onUpdateMatches={setMatches}
                onMatchClick={(match) => setSelectedMatchForBets(match)}
                onPlaceBet={executeAutoBet}
                bet261Account={bet261Account}
              />
            )}
            {activeTab === "local_db" && <LocalDatabaseIndependent />}
            {activeTab === "users" && currentUser?.role === "admin" && (
              <UserManagement token={token} />
            )}
            {activeTab === "bot" && (
              <BotDashboard
                isAdmin={currentUser?.role === "admin"}
                bet261Account={bet261Account}
                onRefreshBalance={() =>
                  bet261Account &&
                  refreshBet261Balance(bet261Account.access_token)
                }
                botEnabled={botEnabled}
                setBotEnabled={setBotEnabled}
                botSettings={botSettings}
                setBotSettings={setBotSettings}
                botLogs={botLogs}
                dailyBetsCount={dailyBetsCount}
                showHistory={showHistory}
                setShowHistory={setShowHistory}
                historyBets={historyBets}
                historyLoading={historyLoading}
                historyState={historyState}
                hasMoreHistory={hasMoreHistory}
                fetchBetHistory={fetchBetHistory}
                handleLogout={handleBet261Logout}
                onForceScan={() => (window as any).forceBotCheck?.()}
                onOpenLogin={() => setShowBet261Login(true)}
              />
            )}
            {activeTab === "calculator" && (
              <div className="space-y-4">
                <div className="flex overflow-x-auto gap-2 mb-4 pb-2 custom-scrollbar">
                  {LEAGUES.map((league) => (
                    <button
                      key={league.id}
                      onClick={() => setCalculatorTab(league.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${
                        calculatorTab === league.id
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      <img
                        src={getLeagueFlag(league.country)}
                        alt=""
                        className="w-4 h-3 object-contain"
                        onError={(e) =>
                          (e.currentTarget.style.display = "none")
                        }
                      />
                      {league.name}
                    </button>
                  ))}
                </div>
                {LEAGUES.map((league) => (
                  <div
                    key={league.id}
                    className={calculatorTab === league.id ? "block" : "hidden"}
                  >
                    <CalculatorMenu
                      stats={calculatorStats[league.id] || {}}
                      leagueName={league.name}
                      onReset={() => handleResetCalculator(league.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={activeTab === "extraction" ? "block" : "hidden"}>
          <div className="flex overflow-x-auto gap-2 mb-4 pb-2 custom-scrollbar">
            {LEAGUES.map((league) => (
              <button
                key={league.id}
                onClick={() => setExtractionTab(league.id)}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${
                  extractionTab === league.id
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                <img
                  src={getLeagueFlag(league.country)}
                  alt=""
                  className="w-4 h-3 object-contain"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
                {league.name}
                {activeExtractions[league.id] && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                )}
              </button>
            ))}
          </div>

          {LEAGUES.map((league) => (
            <div
              key={league.id}
              className={extractionTab === league.id ? "block" : "hidden"}
            >
              <DataExtractionMenu
                leagueId={league.id}
                rankings={rankings}
                onActiveChange={(isActive) =>
                  setActiveExtractions((prev) => ({
                    ...prev,
                    [league.id]: isActive,
                  }))
                }
                onMatchesFinished={(finishedMatches) => {
                  updateCalculatorStatsFromMatches(league.id, finishedMatches);
                }}
                onSyncComplete={() => {
                  setIsSyncing(false);
                  setSyncProgress(null);
                  setSyncMessage(null);
                  fetchLeagueData(selectedLeague);
                }}
              />
            </div>
          ))}
        </div>
      </main>

      {selectedMatchForBets && (
        <MatchHistoryModal
          match={selectedMatchForBets}
          leagueId={selectedLeague}
          bet261Account={bet261Account}
          onRefreshBalance={() =>
            bet261Account && refreshBet261Balance(bet261Account.access_token)
          }
          onClose={() => setSelectedMatchForBets(null)}
          fetchBet261={fetchBet261}
          freeBets={freeBets}
          rankings={rankings}
          results={results}
        />
      )}

      {showBet261Login && (
        <Bet261LoginModal
          onClose={() => setShowBet261Login(false)}
          onLogin={handleBet261Login}
          loading={bet261Loading}
        />
      )}

      {/* Messages/Notifications Dialog */}
      {showUserMessages && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400 animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-100">
                  Messagerie & Annonces Administrateur
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUserMessages(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {userMessages.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-505">
                <Inbox className="w-6 h-6 text-slate-600" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Boîte de réception vide
                </span>
                <span className="text-[8.5px] text-slate-600 font-bold uppercase text-center mt-0.5 leading-normal max-w-[280px]">
                  Aucune annonce ou message de l'administration n'a été trouvé.
                </span>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {userMessages
                  .slice()
                  .reverse()
                  .map((msg) => {
                    const isUnread =
                      msg.to.toLowerCase() === "all"
                        ? !msg.readBy?.includes(
                            currentUser?.username.toLowerCase(),
                          )
                        : !msg.read;
                    return (
                      <div
                        key={msg.id}
                        className={`border rounded-lg p-3 space-y-1.5 transition-all ${
                          isUnread
                            ? "bg-indigo-950/20 border-indigo-505/30 text-slate-100"
                            : "bg-slate-950/40 border-slate-805/85 text-slate-300"
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-bold text-[7.5px] uppercase border border-indigo-500/20">
                              De: {msg.from}
                            </span>
                            {msg.to === "all" ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold text-[7.5px] uppercase border border-amber-500/20">
                                Notification Globale
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold text-[7.5px] uppercase border border-blue-500/20">
                                Direct Message
                              </span>
                            )}
                          </div>
                          <span className="text-[8px] text-slate-500 font-bold">
                            {new Date(msg.createdAt).toLocaleDateString(
                              "fr-FR",
                              {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-200 leading-normal font-semibold font-sans whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      </div>
                    );
                  })}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
              <button
                type="button"
                onClick={handleMarkMessagesRead}
                disabled={getUnreadMessagesCount() === 0}
                className="px-2.5 py-1.5 rounded bg-indigo-500/10 hover:bg-indigo-600 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white disabled:opacity-45 disabled:cursor-not-allowed text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Marquer tout comme lu
              </button>
              <button
                type="button"
                onClick={() => setShowUserMessages(false)}
                className="px-3.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-[9px] uppercase font-bold tracking-wider transition-all cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Bet261LoginModal({
  onClose,
  onLogin,
  loading,
}: {
  onClose: () => void;
  onLogin: (u: string, p: string, remember: boolean) => void;
  loading: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(username, password, remember);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-slate-900 w-full max-w-sm rounded-[2rem] border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 pb-4 text-center">
          <div className="w-16 h-16 bg-indigo-500 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-500/20 rotate-3">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-black text-slate-100 uppercase tracking-tighter">
            Connexion Bet261
          </h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">
            Accédez à votre compte malgache
          </p>

          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <p className="text-[9px] text-amber-500 font-bold leading-tight uppercase">
              Note: Si le site bloque les connexions hors Madagascar, la
              connexion serveur peut échouer.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
              Numéro de téléphone
            </label>
            <input
              type="text"
              required
              placeholder="03xxxxxxxx"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-indigo-500 transition-all font-mono"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
              Mot de passe
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-indigo-500 transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 px-1 py-1">
            <input
              id="remember_creds"
              type="checkbox"
              className="w-4 h-4 bg-slate-950 border-slate-800 rounded text-indigo-600 focus:ring-0 cursor-pointer"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <label
              htmlFor="remember_creds"
              className="text-[10px] font-bold text-slate-400 uppercase tracking-wide cursor-pointer selection:bg-transparent"
            >
              Tadidio ny fidirako (Auto re-login n'ny Bot)
            </label>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-[2] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Se connecter"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MatchHistoryModal({
  match: rawMatch,
  leagueId,
  onClose,
  bet261Account,
  onRefreshBalance,
  fetchBet261,
  freeBets = [],
  rankings = [],
  results = [],
}: {
  match: any;
  leagueId: number;
  onClose: () => void;
  bet261Account?: any;
  onRefreshBalance: () => void;
  fetchBet261: (url: string, options?: any) => Promise<Response>;
  freeBets?: any[];
  rankings?: any[];
  results?: any[];
}) {
  const match = React.useMemo(() => {
    let odds1 = rawMatch.odds1;
    let oddsX = rawMatch.oddsX;
    let odds2 = rawMatch.odds2;

    if (!odds1 && rawMatch.eventBetTypes) {
      const odds1x2 =
        rawMatch.eventBetTypes?.find(
          (e: any) =>
            e.name?.toUpperCase() === "1X2" ||
            e.name === "Match Result" ||
            e.id === "1",
        ) ||
        rawMatch.markets?.find(
          (e: any) =>
            e.name?.toUpperCase() === "1X2" ||
            e.name === "Match Result" ||
            e.id === "1",
        );
      const items = odds1x2?.eventBetTypeItems || odds1x2?.outcomes || [];
      const findOdds = (names: string[]) => {
        const item = items.find(
          (o: any) =>
            names.includes(o.shortName) ||
            names.includes(o.name) ||
            names.includes(o.outcomeName),
        );
        return item?.odds || "-";
      };
      odds1 = findOdds(["1", "Home"]);
      oddsX = findOdds(["X", "Draw"]);
      odds2 = findOdds(["2", "Away"]);
    }

    return {
      ...rawMatch,
      odds1,
      oddsX,
      odds2,
    };
  }, [rawMatch]);

  const [stake, setStake] = useState("100");
  const [isBetting, setIsBetting] = useState(false);
  const [betStatus, setBetStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [selectedFreebetId, setSelectedFreebetId] = useState<string | number>(
    "",
  );
  const [homeLogoError, setHomeLogoError] = useState(false);
  const [awayLogoError, setAwayLogoError] = useState(false);
  const [subTab, setSubTab] = useState<"advanced" | "direct" | "database">(
    "advanced",
  );

  const getTeamNameForDisplay = (team: any) => {
    if (!team) return "-";
    if (typeof team === "string") return team;
    return team.name || team.teamName || team.shortName || "Équipe";
  };

  const homeLabel = getTeamNameForDisplay(match.homeTeam);
  const awayLabel = getTeamNameForDisplay(match.awayTeam);

  const homeRank = rankings
    ? rankings.findIndex((t: any) => (t.name || t.teamName) === homeLabel) + 1
    : 0;
  const awayRank = rankings
    ? rankings.findIndex((t: any) => (t.name || t.teamName) === awayLabel) + 1
    : 0;

  const activeCache = React.useMemo(() => {
    const recentMatchesMap: Record<string, any[]> = {};
    const formMap: Record<string, string[]> = {};

    results.forEach((round) => {
      const ms = round.matches || (Array.isArray(round) ? round : []);
      ms.forEach((m: any) => {
        const hN = getTeamNameForDisplay(m.homeTeam);
        const aN = getTeamNameForDisplay(m.awayTeam);
        const hN_lower = hN.toLowerCase().trim();
        const aN_lower = aN.toLowerCase().trim();

        let homeRaw = m.homeScore;
        let awayRaw = m.awayScore;
        if (m.score) {
          const sep = m.score.includes(":") ? ":" : "-";
          const parts = m.score.split(sep);
          if (parts.length === 2) {
            homeRaw = parts[0];
            awayRaw = parts[1];
          }
        }

        const hSText =
          homeRaw !== undefined &&
          homeRaw !== null &&
          String(homeRaw).trim() !== "" &&
          String(homeRaw).trim() !== "-";
        const aSText =
          awayRaw !== undefined &&
          awayRaw !== null &&
          String(awayRaw).trim() !== "" &&
          String(awayRaw).trim() !== "-";

        if (hSText && aSText) {
          const hS = parseInt(String(homeRaw));
          const aS = parseInt(String(awayRaw));

          if (!isNaN(hS) && !isNaN(aS)) {
            const processedMatch = {
              ...m,
              homeScore: homeRaw,
              awayScore: awayRaw,
              roundNumber: round.roundNumber || round.round,
            };

            if (!formMap[hN_lower]) formMap[hN_lower] = [];
            formMap[hN_lower].push(hS > aS ? "Won" : hS < aS ? "Lost" : "Draw");

            if (!formMap[aN_lower]) formMap[aN_lower] = [];
            formMap[aN_lower].push(aS > hS ? "Won" : aS < hS ? "Lost" : "Draw");

            if (!recentMatchesMap[hN_lower]) recentMatchesMap[hN_lower] = [];
            recentMatchesMap[hN_lower].push(processedMatch);

            if (!recentMatchesMap[aN_lower]) recentMatchesMap[aN_lower] = [];
            recentMatchesMap[aN_lower].push(processedMatch);
          }
        }
      });
    });

    Object.keys(recentMatchesMap).forEach((key) => {
      recentMatchesMap[key].sort(
        (a, b) => (Number(b.roundNumber) || 0) - (Number(a.roundNumber) || 0),
      );
    });

    return { recentMatchesMap, formMap };
  }, [results]);

  const getFullForm = (teamName: string) => {
    return activeCache.formMap[teamName.toLowerCase().trim()] || [];
  };

  const getTeamStats = (name: string) => {
    const history = getFullForm(name);
    if (history.length === 0) return { win: 0, draw: 0, loss: 0, played: 0 };
    const w = history.filter((r) => r === "Won").length;
    const d = history.filter((r) => r === "Draw").length;
    const l = history.filter((r) => r === "Lost").length;
    return {
      win: Math.round((w / history.length) * 100),
      draw: Math.round((d / history.length) * 100),
      loss: Math.round((l / history.length) * 100),
      played: history.length,
    };
  };

  const homeStats = getTeamStats(homeLabel);
  const awayStats = getTeamStats(awayLabel);

  const handleFreebetChange = (id: string | number) => {
    setSelectedFreebetId(id);
    if (id) {
      const fb = freeBets.find((f) => String(f.id) === String(id));
      if (fb && fb.balance > 0) {
        setStake(String(Math.round(fb.balance)));
      }
    }
  };

  const handleQuickBet = async (selection: "1" | "X" | "2") => {
    if (!bet261Account) return;
    setIsBetting(true);
    setBetStatus(null);
    try {
      const odds =
        selection === "1"
          ? match.odds1
          : selection === "2"
            ? match.odds2
            : match.oddsX;
      const payload: any = {
        selections: [
          {
            eventId: match.apiId,
            marketName: "1X2",
            outcomeName: selection,
            odds: odds,
            leagueId: match.leagueId,
          },
        ],
        stake: parseInt(stake),
        betType: 1,
      };

      if (selectedFreebetId) {
        payload.freebetId = selectedFreebetId;
      }

      const res = await fetchBet261("/api/bet261/place-bet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bet261Account.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setBetStatus({ type: "success", msg: "Pari placé !" });
        onRefreshBalance();
      } else {
        const err = await safeParseJSON(res).catch(() => ({
          details: "Détails indisponibles/Format invalide",
        }));
        setBetStatus({ type: "error", msg: err.details || "Erreur" });

        if (res.status === 401 || res.status === 403) {
          onRefreshBalance();
        }
      }
    } catch (e: any) {
      setBetStatus({ type: "error", msg: e.message });
    } finally {
      setIsBetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-slate-900 w-full max-w-4xl max-h-[85vh] rounded-[2rem] border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-md sticky top-0 z-20">
          <div>
            <h3 className="text-lg font-black text-slate-100 uppercase tracking-tighter flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-500" />
              H2H avancée
            </h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-0.5">
              {homeLabel} vs {awayLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {bet261Account && match.status === "Upcoming" && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl space-y-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                      Pari Rapide (Bet261)
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">
                      Mise:
                    </span>
                    <input
                      type="number"
                      value={stake}
                      onChange={(e) => setStake(e.target.value)}
                      className="w-16 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] font-black text-white outline-none focus:border-indigo-500"
                    />
                    <span className="text-[9px] font-black text-slate-400 uppercase">
                      Ar
                    </span>
                  </div>
                </div>

                {freeBets && freeBets.length > 0 && (
                  <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
                    <div className="flex items-center gap-1.5 text-amber-500">
                      <Gift className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                      <span className="text-[8px] font-black uppercase tracking-wider">
                        Pari Gratuit disponible:
                      </span>
                    </div>
                    <select
                      value={selectedFreebetId}
                      onChange={(e) => handleFreebetChange(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[9px] font-black text-amber-400 outline-none focus:border-indigo-500 max-w-[170px]"
                    >
                      <option value="">-- Aucun --</option>
                      {freeBets.map((fb) => (
                        <option
                          key={fb.id}
                          value={fb.id}
                          className="text-white"
                        >
                          Ref: {fb.id} ({fb.balance || 0} Ar)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "1", odds: match.odds1, value: "1" },
                  { label: "X", odds: match.oddsX, value: "X" },
                  { label: "2", odds: match.odds2, value: "2" },
                ].map((btn) => (
                  <button
                    key={btn.value}
                    disabled={isBetting || !btn.odds}
                    onClick={() => handleQuickBet(btn.value as any)}
                    className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 p-2 rounded-xl flex flex-col items-center gap-1 transition-all group disabled:opacity-50"
                  >
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                      {btn.label}
                    </span>
                    <span className="text-sm font-black text-white group-hover:text-indigo-400">
                      {btn.odds || "-"}
                    </span>
                  </button>
                ))}
              </div>

              {betStatus && (
                <div
                  className={`text-[10px] font-black uppercase tracking-widest text-center p-2 rounded-lg ${betStatus.type === "success" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}
                >
                  {betStatus.msg}
                </div>
              )}
            </div>
          )}

          {/* Responsive Team Stats/Cotes Summary Header */}
          <div id="modal-match-summary" className="mb-4 space-y-2.5">
            {/* Mobile View: Stacked and spacious */}
            <div
              id="match-summary-mobile"
              className="flex flex-col gap-2 sm:hidden"
            >
              {/* Domicile Team Row */}
              <div
                id="mobile-home-team-card"
                className="flex items-center justify-between gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 shrink-0 bg-white/5 rounded-full p-1 border border-white/10 flex items-center justify-center overflow-hidden">
                    {!homeLogoError ? (
                      <img
                        src={getTeamLogo(homeLabel)}
                        alt=""
                        className="w-full h-full object-contain"
                        onError={() => setHomeLogoError(true)}
                      />
                    ) : (
                      <Trophy className="w-4 h-4 text-slate-600" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-xs font-black text-slate-100 uppercase truncate"
                      title={homeLabel}
                    >
                      {homeLabel}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[7px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/15 px-1 py-0.2 rounded uppercase tracking-wider shrink-0">
                        Dom.
                      </span>
                      {homeRank > 0 ? (
                        <span className="text-[8px] font-black text-indigo-400 bg-indigo-950/80 px-1.5 py-0.2 rounded border border-indigo-500/20 uppercase tracking-tighter shrink-0">
                          #{homeRank}
                        </span>
                      ) : (
                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
                          Pas de rang
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {homeStats.played > 0 ? (
                  <div className="flex gap-1.5 text-[10px] font-mono font-black shrink-0 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-850 shadow-inner">
                    <span className="text-emerald-500" title="Victoires">
                      {homeStats.win}%V
                    </span>
                    <span className="text-slate-700">/</span>
                    <span className="text-amber-500" title="Nuls">
                      {homeStats.draw}%N
                    </span>
                    <span className="text-slate-700">/</span>
                    <span className="text-rose-500" title="Défaites">
                      {homeStats.loss}%D
                    </span>
                  </div>
                ) : (
                  <span className="text-[8px] font-black text-slate-600 uppercase tracking-wider bg-slate-950/40 px-2 py-1 rounded-xl border border-slate-850 shrink-0">
                    N/A
                  </span>
                )}
              </div>

              {/* Mobile Odds Row */}
              <div
                id="mobile-odds-card"
                className="flex flex-col items-center justify-center p-2.5 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl w-full"
              >
                <span className="text-[7.5px] font-black text-indigo-400 uppercase tracking-[0.15em] mb-1.5">
                  Cotes Actuelles
                </span>
                <div className="grid grid-cols-3 gap-2 w-full">
                  <div className="bg-slate-950/60 border border-slate-850 rounded-xl py-1 px-2 flex flex-col justify-center items-center">
                    <span className="text-[7px] font-extrabold text-slate-500 mb-0.5">
                      1
                    </span>
                    <span className="font-mono font-black text-slate-200 text-[11px] leading-none">
                      {match.odds1 || "-"}
                    </span>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-850 rounded-xl py-1 px-2 flex flex-col justify-center items-center">
                    <span className="text-[7px] font-extrabold text-slate-500 mb-0.5">
                      X
                    </span>
                    <span className="font-mono font-black text-slate-200 text-[11px] leading-none">
                      {match.oddsX || "-"}
                    </span>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-850 rounded-xl py-1 px-2 flex flex-col justify-center items-center">
                    <span className="text-[7px] font-extrabold text-slate-500 mb-0.5">
                      2
                    </span>
                    <span className="font-mono font-black text-slate-200 text-[11px] leading-none">
                      {match.odds2 || "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Extérieur Team Row */}
              <div
                id="mobile-away-team-card"
                className="flex items-center justify-between gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 shrink-0 bg-white/5 rounded-full p-1 border border-white/10 flex items-center justify-center overflow-hidden">
                    {!awayLogoError ? (
                      <img
                        src={getTeamLogo(awayLabel)}
                        alt=""
                        className="w-full h-full object-contain"
                        onError={() => setAwayLogoError(true)}
                      />
                    ) : (
                      <Trophy className="w-4 h-4 text-slate-600" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-xs font-black text-slate-100 uppercase truncate"
                      title={awayLabel}
                    >
                      {awayLabel}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[7px] font-black text-indigo-400 bg-indigo-400/10 border border-indigo-400/15 px-1 py-0.2 rounded uppercase tracking-wider shrink-0">
                        Ext.
                      </span>
                      {awayRank > 0 ? (
                        <span className="text-[8px] font-black text-indigo-400 bg-indigo-950/80 px-1.5 py-0.2 rounded border border-indigo-500/20 uppercase tracking-tighter shrink-0">
                          #{awayRank}
                        </span>
                      ) : (
                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
                          Pas de rang
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {awayStats.played > 0 ? (
                  <div className="flex gap-1.5 text-[10px] font-mono font-black shrink-0 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-850 shadow-inner">
                    <span className="text-emerald-500" title="Victoires">
                      {awayStats.win}%V
                    </span>
                    <span className="text-slate-700">/</span>
                    <span className="text-amber-500" title="Nuls">
                      {awayStats.draw}%N
                    </span>
                    <span className="text-slate-700">/</span>
                    <span className="text-rose-500" title="Défaites">
                      {awayStats.loss}%D
                    </span>
                  </div>
                ) : (
                  <span className="text-[8px] font-black text-slate-600 uppercase tracking-wider bg-slate-950/40 px-2 py-1 rounded-xl border border-slate-850 shrink-0">
                    N/A
                  </span>
                )}
              </div>
            </div>

            {/* Desktop & Tablet View: Sleek side-by-side header */}
            <div
              id="match-summary-desktop"
              className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4 p-4 bg-slate-950/40 border border-slate-800 rounded-3xl"
            >
              {/* Domicile Desktop */}
              <div
                id="desktop-home-team-side"
                className="flex-1 flex items-center justify-end gap-3 min-w-0"
              >
                <div className="flex flex-col items-end min-w-0">
                  <span
                    className="text-sm font-black text-slate-100 uppercase truncate w-full text-right"
                    title={homeLabel}
                  >
                    {homeLabel}
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {homeStats.played > 0 && (
                      <div className="flex gap-1.5 text-[9px] font-black pr-1.5 border-r border-slate-800">
                        <span className="text-emerald-500">
                          {homeStats.win}%V
                        </span>
                        <span className="text-amber-500">
                          {homeStats.draw}%N
                        </span>
                        <span className="text-rose-500">
                          {homeStats.loss}%D
                        </span>
                      </div>
                    )}
                    {homeRank > 0 ? (
                      <span className="text-[8px] font-black text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-500/20 uppercase tracking-tighter shrink-0">
                        #{homeRank}
                      </span>
                    ) : (
                      <span className="text-[8px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
                        Pas de rang
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-10 h-10 shrink-0 bg-white/5 rounded-full p-1 border border-white/10 flex items-center justify-center overflow-hidden shadow-inner">
                  {!homeLogoError ? (
                    <img
                      src={getTeamLogo(homeLabel)}
                      alt=""
                      className="w-full h-full object-contain"
                      onError={() => setHomeLogoError(true)}
                    />
                  ) : (
                    <Trophy className="w-5 h-5 text-slate-700" />
                  )}
                </div>
              </div>

              {/* Odds Central Seperator Desktop */}
              <div
                id="desktop-odds-side"
                className="flex flex-col items-center justify-center shrink-0 min-w-[7.5rem] px-2 border-x border-slate-800"
              >
                <span className="text-[7.5px] font-black text-indigo-455 uppercase tracking-[0.15em] mb-1">
                  Cotes Actuelles
                </span>
                <div className="flex items-center gap-1 bg-slate-900/80 px-1.5 py-1 rounded-xl border border-slate-800/60 shadow-inner">
                  <div className="flex flex-col items-center px-1">
                    <span className="text-[6.5px] font-bold text-slate-600 uppercase">
                      1
                    </span>
                    <span className="font-mono font-black text-slate-200 text-[10px]">
                      {match.odds1 || "-"}
                    </span>
                  </div>
                  <span className="text-slate-800 text-[8px] font-bold">|</span>
                  <div className="flex flex-col items-center px-1">
                    <span className="text-[6.5px] font-bold text-slate-600 uppercase">
                      X
                    </span>
                    <span className="font-mono font-black text-slate-200 text-[10px]">
                      {match.oddsX || "-"}
                    </span>
                  </div>
                  <span className="text-slate-800 text-[8px] font-bold">|</span>
                  <div className="flex flex-col items-center px-1">
                    <span className="text-[6.5px] font-bold text-slate-600 uppercase">
                      2
                    </span>
                    <span className="font-mono font-black text-slate-200 text-[10px]">
                      {match.odds2 || "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Extérieur Desktop */}
              <div
                id="desktop-away-team-side"
                className="flex-1 flex items-center justify-start gap-3 min-w-0"
              >
                <div className="w-10 h-10 shrink-0 bg-white/5 rounded-full p-1 border border-white/10 flex items-center justify-center overflow-hidden shadow-inner">
                  {!awayLogoError ? (
                    <img
                      src={getTeamLogo(awayLabel)}
                      alt=""
                      className="w-full h-full object-contain"
                      onError={() => setAwayLogoError(true)}
                    />
                  ) : (
                    <Trophy className="w-5 h-5 text-slate-700" />
                  )}
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span
                    className="text-sm font-black text-slate-100 uppercase truncate w-full text-left"
                    title={awayLabel}
                  >
                    {awayLabel}
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {awayRank > 0 ? (
                      <span className="text-[8px] font-black text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-500/20 uppercase tracking-tighter shrink-0">
                        #{awayRank}
                      </span>
                    ) : (
                      <span className="text-[8px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
                        Pas de rang
                      </span>
                    )}
                    {awayStats.played > 0 && (
                      <div className="flex gap-1.5 text-[9px] font-black pl-1.5 border-l border-slate-800">
                        <span className="text-emerald-500">
                          {awayStats.win}%V
                        </span>
                        <span className="text-amber-500">
                          {awayStats.draw}%N
                        </span>
                        <span className="text-rose-500">
                          {awayStats.loss}%D
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs for H2H Modal */}
          <div className="flex border-b border-slate-800/80 pb-3 mb-4 gap-3 shrink-0 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setSubTab("advanced")}
              className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === "advanced"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/15 border border-indigo-500"
                  : "bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 hover:border-slate-705"
              }`}
            >
              <History className="w-3.5 h-3.5 text-indigo-400" />
              H2H Avancée
            </button>
            <button
              onClick={() => setSubTab("direct")}
              className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === "direct"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/15 border border-indigo-500"
                  : "bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 hover:border-slate-705"
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />
              Direct Aller/Retour
            </button>
            <button
              onClick={() => setSubTab("database")}
              className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === "database"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/15 border border-indigo-500"
                  : "bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 hover:border-slate-705"
              }`}
            >
              <Database className="w-3.5 h-3.5 text-amber-500" />
              H2H Complet (Base)
            </button>
          </div>

          {subTab === "advanced" ? (
            <HistoricalMatchesSection
              match={match}
              leagueId={leagueId}
              rankings={rankings}
            />
          ) : subTab === "direct" ? (
            <DirectH2HSection match={match} results={results} />
          ) : (
            <DatabaseH2HSection match={match} leagueId={leagueId} />
          )}
        </div>

        <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex items-center justify-center shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoricalMatchesSection({
  match,
  leagueId,
  rankings = [],
}: {
  match: any;
  leagueId: number;
  rankings?: any[];
}) {
  const [historicalMatches, setHistoricalMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [advTab, setAdvTab] = useState<"matches" | "correlation">("matches");
  const [correlationText, setCorrelationText] = useState<string>("");
  const [analysing, setAnalysing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string>("");

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const results = await findHistoricalMatches(leagueId, match);
        setHistoricalMatches(results);
      } catch (err) {
        console.error("Error fetching historical matches:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [match, leagueId]);

  // Early returns removed from here to follow the React Rules of Hooks. Hooks must run unconditionally.

  const validHistoricalMatches = historicalMatches.filter((m) => {
    // Must be played (not unplayed). Played matches have homeScore and awayScore defined, non-empty and non-dash
    const hasHomeScore =
      m.homeScore !== undefined &&
      m.homeScore !== null &&
      String(m.homeScore).trim() !== "" &&
      String(m.homeScore).trim() !== "-";
    const hasAwayScore =
      m.awayScore !== undefined &&
      m.awayScore !== null &&
      String(m.awayScore).trim() !== "" &&
      String(m.awayScore).trim() !== "-";
    const isPlayed = m.status === "Finished" || (hasHomeScore && hasAwayScore);

    // Must have odds (has non-empty numeric or string odds for all 1, X, 2)
    const hasOdds =
      m.odds1 !== undefined &&
      m.odds1 !== null &&
      String(m.odds1).trim() !== "" &&
      String(m.odds1).trim() !== "-" &&
      m.oddsX !== undefined &&
      m.oddsX !== null &&
      String(m.oddsX).trim() !== "" &&
      String(m.oddsX).trim() !== "-" &&
      m.odds2 !== undefined &&
      m.odds2 !== null &&
      String(m.odds2).trim() !== "" &&
      String(m.odds2).trim() !== "-";

    return isPlayed && hasOdds;
  });

  // Deduplicate matches of the same season for the same teams
  const deduplicatedHistoricalMatches: any[] = [];

  const getCleanSeasonId = (item: any): string => {
    if (
      item.eventCategoryId !== undefined &&
      item.eventCategoryId !== null &&
      String(item.eventCategoryId).trim() !== ""
    ) {
      return `id_${String(item.eventCategoryId).trim().toLowerCase()}`;
    }
    const val = String(item.season || "")
      .trim()
      .toLowerCase();
    if (!val) return "unknown";

    // 1. If it contains "id: XXX" or "id[:\s]+XXX", extract that digit as the season ID
    const matchId = val.match(/id[:\s]+(\d+)/i);
    if (matchId && matchId[1]) {
      return `id_${matchId[1]}`;
    }

    // 2. If it contains "saison DD/MM/YYYY", extract the full date part as the season identifier
    const dateMatch = val.match(/saison\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (dateMatch && dateMatch[1]) {
      return `date_${dateMatch[1].replace(/\//g, "_")}`;
    }

    // 3. Otherwise, just normalize by removing non-alphanumeric
    const cleaned = val.replace(/[^a-z0-9]/g, "");
    return cleaned ? `norm_${cleaned}` : "unknown";
  };

  for (const m of validHistoricalMatches) {
    const normHome = String(getTeamName(m.homeTeam) || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const normAway = String(getTeamName(m.awayTeam) || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const normSeason = getCleanSeasonId(m);

    const mDate = m.expectedStart ? new Date(m.expectedStart) : null;

    const isDuplicate = deduplicatedHistoricalMatches.some((item) => {
      const itemHome = String(getTeamName(item.homeTeam) || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const itemAway = String(getTeamName(item.awayTeam) || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      if (itemHome !== normHome || itemAway !== normAway) return false;

      const itemSeason = getCleanSeasonId(item);

      // They are duplicates if they have the same teams AND the same season
      if (itemSeason === normSeason && normSeason !== "unknown") {
        return true;
      }

      // If we don't know the season, look at start dates (within 24 hours can denote the same match)
      if (normSeason === "unknown" || itemSeason === "unknown") {
        const itemDate = item.expectedStart
          ? new Date(item.expectedStart)
          : null;
        if (mDate && itemDate) {
          const diffMs = Math.abs(mDate.getTime() - itemDate.getTime());
          return diffMs < 24 * 60 * 60 * 1000;
        }
      }

      return false;
    });

    if (!isDuplicate) {
      deduplicatedHistoricalMatches.push(m);
    }
  }

  const getCleanName = (team: any) => {
    if (!team) return "";
    if (typeof team === "string") return team.trim().toLowerCase();
    return (team.name || team.teamName || team.shortName || "")
      .trim()
      .toLowerCase();
  };

  const matchHomeName = getCleanName(match.homeTeam);
  const matchAwayName = getCleanName(match.awayTeam);

  const sameTeams = deduplicatedHistoricalMatches.filter((m) => {
    const hName = getCleanName(m.homeTeam);
    const aName = getCleanName(m.awayTeam);
    return hName === matchHomeName && aName === matchAwayName;
  });

  const sameOddsButDiffTeams = deduplicatedHistoricalMatches.filter((m) => {
    const isSameHome = getCleanName(m.homeTeam) === matchHomeName;
    const isSameAway = getCleanName(m.awayTeam) === matchAwayName;
    const isSameHomeInv = getCleanName(m.homeTeam) === matchAwayName;
    const isSameAwayInv = getCleanName(m.awayTeam) === matchHomeName;
    const isSimilarOrInverted =
      (isSameHome && isSameAway) || (isSameHomeInv && isSameAwayInv);
    return (
      !isSimilarOrInverted &&
      m.odds1 === match.odds1 &&
      m.oddsX === match.oddsX &&
      m.odds2 === match.odds2
    );
  });

  const chronologicalSameTeams = [...sameTeams].sort((a, b) => {
    const seasonA = Number(a.eventCategoryId || a.season || 0);
    const seasonB = Number(b.eventCategoryId || b.season || 0);
    if (seasonA !== seasonB) {
      return seasonA - seasonB;
    }
    const timeA = a.expectedStart ? new Date(a.expectedStart).getTime() : 0;
    const timeB = b.expectedStart ? new Date(b.expectedStart).getTime() : 0;
    return timeA - timeB;
  });

  const bestH2HMatchId = useMemo(() => {
    if (!match || sameTeams.length === 0) return null;

    let bestId: any = null;
    let minD = Infinity;

    const r1 = parseFloat(String(match.odds1 || match.odds_1 || "0"));
    const rX = parseFloat(
      String(match.oddsX || match.odds_x || match.odds_X || "0"),
    );
    const r2 = parseFloat(String(match.odds2 || match.odds_2 || "0"));

    if (isNaN(r1) || isNaN(rX) || isNaN(r2) || r1 <= 0 || rX <= 0 || r2 <= 0) {
      return null;
    }

    sameTeams.forEach((m) => {
      const o1 = parseFloat(String(m.odds1 || m.odds_1 || "0"));
      const oX = parseFloat(String(m.oddsX || m.odds_x || m.odds_X || "0"));
      const o2 = parseFloat(String(m.odds2 || m.odds_2 || "0"));

      if (
        !isNaN(o1) &&
        !isNaN(oX) &&
        !isNaN(o2) &&
        o1 > 0 &&
        oX > 0 &&
        o2 > 0
      ) {
        const d =
          Math.abs(o1 - r1) / r1 +
          Math.abs(oX - rX) / rX +
          Math.abs(o2 - r2) / r2;
        if (d < minD) {
          minD = d;
          bestId = m.id;
        }
      }
    });

    if (minD <= 0.36) {
      return bestId;
    }
    return null;
  }, [sameTeams, match]);

  const curHomeRank = useMemo(() => {
    if (!rankings || rankings.length === 0 || !match) return 0;
    const name =
      match.homeTeam?.name || match.homeTeam?.teamName || match.homeTeam || "";
    const cleanCurrentHome = getCleanName(name);
    const idx = rankings.findIndex(
      (t: any) => getCleanName(t.name || t.teamName) === cleanCurrentHome,
    );
    return idx >= 0 ? idx + 1 : 0;
  }, [rankings, match, getCleanName]);

  const curAwayRank = useMemo(() => {
    if (!rankings || rankings.length === 0 || !match) return 0;
    const name =
      match.awayTeam?.name || match.awayTeam?.teamName || match.awayTeam || "";
    const cleanCurrentAway = getCleanName(name);
    const idx = rankings.findIndex(
      (t: any) => getCleanName(t.name || t.teamName) === cleanCurrentAway,
    );
    return idx >= 0 ? idx + 1 : 0;
  }, [rankings, match, getCleanName]);

  const closestFormH2HMatchIds = useMemo(() => {
    if (!match || sameTeams.length === 0) return [];

    const curHV = match.homeFormWDLPct?.v ?? null;
    const curHN = match.homeFormWDLPct?.n ?? null;
    const curHD = match.homeFormWDLPct?.d ?? null;
    const curAV = match.awayFormWDLPct?.v ?? null;
    const curAN = match.awayFormWDLPct?.n ?? null;
    const curAD = match.awayFormWDLPct?.d ?? null;

    if (curHV === null || curAV === null) return [];

    const distances = sameTeams
      .map((m) => {
        const hV = m.homeFormWDLPct?.v ?? null;
        const hN = m.homeFormWDLPct?.n ?? null;
        const hD = m.homeFormWDLPct?.d ?? null;
        const aV = m.awayFormWDLPct?.v ?? null;
        const aN = m.awayFormWDLPct?.n ?? null;
        const aD = m.awayFormWDLPct?.d ?? null;

        if (hV !== null && aV !== null) {
          const isSameConfig = getCleanName(m.homeTeam) === matchHomeName;
          let dist = 0;
          if (isSameConfig) {
            dist =
              Math.abs(hV - curHV) +
              Math.abs((hN ?? 0) - (curHN ?? 0)) +
              Math.abs((hD ?? 0) - (curHD ?? 0)) +
              Math.abs(aV - curAV) +
              Math.abs((aN ?? 0) - (curAN ?? 0)) +
              Math.abs((aD ?? 0) - (curAD ?? 0));
          } else {
            // Inverted: past home was current away, past away was current home
            dist =
              Math.abs(hV - curAV) +
              Math.abs((hN ?? 0) - (curAN ?? 0)) +
              Math.abs((hD ?? 0) - (curAD ?? 0)) +
              Math.abs(aV - curHV) +
              Math.abs((aN ?? 0) - (curHN ?? 0)) +
              Math.abs((aD ?? 0) - (curHD ?? 0));
          }
          return {
            id: m.id,
            dist,
          };
        }
        return null;
      })
      .filter((d) => d !== null) as { id: any; dist: number }[];

    if (distances.length === 0) return [];

    const minDist = Math.min(...distances.map((d) => d.dist));

    // Set a threshold of 100 maximum total deviation to keep results highly relevant
    if (minDist > 100) return [];

    return distances.filter((d) => d.dist === minDist).map((d) => d.id);
  }, [sameTeams, match, matchHomeName, getCleanName]);

  const closestRankH2HMatchIds = useMemo(() => {
    if (
      !rankings ||
      rankings.length === 0 ||
      sameTeams.length === 0 ||
      curHomeRank === 0 ||
      curAwayRank === 0
    ) {
      return [];
    }

    const distances = sameTeams
      .map((m) => {
        const hRank = m.homeRankAtMatch || 0;
        const aRank = m.awayRankAtMatch || 0;
        if (hRank > 0 && aRank > 0) {
          const isSameConfig = getCleanName(m.homeTeam) === matchHomeName;
          let dist = 0;
          if (isSameConfig) {
            dist =
              Math.abs(hRank - curHomeRank) + Math.abs(aRank - curAwayRank);
          } else {
            // Inverted teams: past Home was current Away, past Away was current Home
            dist =
              Math.abs(hRank - curAwayRank) + Math.abs(aRank - curHomeRank);
          }
          return {
            id: m.id,
            dist,
          };
        }
        return null;
      })
      .filter((d) => d !== null) as { id: any; dist: number }[];

    if (distances.length === 0) return [];

    const minDist = Math.min(...distances.map((d) => d.dist));

    // Within 12 rank sum deviation to avoid flagging completely different matches
    if (minDist > 12) return [];

    return distances.filter((d) => d.dist === minDist).map((d) => d.id);
  }, [
    sameTeams,
    rankings,
    curHomeRank,
    curAwayRank,
    matchHomeName,
    getCleanName,
  ]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (historicalMatches.length === 0) return null;

  const analyzeCorrelation = async () => {
    setAnalysing(true);
    setAnalysisError("");
    try {
      const sameTeamsData = sameTeams.map((m) => {
        const cIndex = chronologicalSameTeams.findIndex(
          (item) => item.id === m.id,
        );
        const prevM = cIndex > 0 ? chronologicalSameTeams[cIndex - 1] : null;

        const getDiffValue = (currVal: any, prevVal: any) => {
          if (
            currVal === undefined ||
            currVal === null ||
            prevVal === undefined ||
            prevVal === null
          )
            return null;
          const c = parseFloat(String(currVal));
          const p = parseFloat(String(prevVal));
          if (isNaN(c) || isNaN(p)) return null;
          return c - p;
        };

        const d1 = getDiffValue(m.odds1, prevM?.odds1);
        const dX = getDiffValue(m.oddsX, prevM?.oddsX);
        const d2 = getDiffValue(m.odds2, prevM?.odds2);

        return {
          season: m.eventCategoryId || m.season || "-",
          round: m.roundNumber || m.round,
          date: m.expectedStart
            ? new Date(m.expectedStart).toLocaleDateString("fr-FR")
            : "-",
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          score: `${m.homeScore || 0}-${m.awayScore || 0}`,
          odds: {
            odds1: m.odds1 || "-",
            oddsX: m.oddsX || "-",
            odds2: m.odds2 || "-",
          },
          oddsVariations: {
            diff1: d1 ? Number(d1.toFixed(2)) : null,
            diffX: dX ? Number(dX.toFixed(2)) : null,
            diff2: d2 ? Number(d2.toFixed(2)) : null,
          },
        };
      });

      const sameOddsData = sameOddsButDiffTeams.map((m) => ({
        season: m.eventCategoryId || m.season || "-",
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        score: `${m.homeScore || 0}-${m.awayScore || 0}`,
        odds: {
          odds1: m.odds1 || "-",
          oddsX: m.oddsX || "-",
          odds2: m.odds2 || "-",
        },
      }));

      const response = await fetch("/api/ia-algo/h2h-correlation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentMatch: {
            homeTeam: getTeamName(match.homeTeam),
            awayTeam: getTeamName(match.awayTeam),
            odds1: match.odds1,
            oddsX: match.oddsX,
            odds2: match.odds2,
          },
          sameTeamsData,
          sameOddsData,
        }),
      });

      if (!response.ok) {
        const errData = await response
          .json()
          .catch(() => ({
            details: "Erreur réseau ou format de réponse invalide",
          }));
        throw new Error(
          errData.details ||
            errData.error ||
            "Erreur lors de la génération de l'analyse.",
        );
      }

      const data = await response.json();
      setCorrelationText(data.analysis);
    } catch (err: any) {
      console.error("[Correlation Tool Error]:", err);
      setAnalysisError(
        err.message ||
          "Une erreur est survenue lors de l'analyse de corrélation.",
      );
    } finally {
      setAnalysing(false);
    }
  };

  return (
    <div className="space-y-6 pt-3">
      {/* Sub-tabs under H2H Avancée */}
      <div className="flex bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800/80 gap-2 shrink-0">
        <button
          onClick={() => setAdvTab("matches")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            advTab === "matches"
              ? "bg-[#0f172a] text-emerald-400 border border-slate-700/60 shadow-lg"
              : "text-slate-400 hover:text-slate-200 hover:bg-[#0f172a]/20 bg-transparent"
          }`}
        >
          <History className="w-3.5 h-3.5 text-emerald-400" />
          Confrontations & Cotes
        </button>
        <button
          onClick={() => setAdvTab("correlation")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            advTab === "correlation"
              ? "bg-[#0f172a] text-indigo-400 border border-slate-700/60 shadow-lg"
              : "text-slate-400 hover:text-slate-200 hover:bg-[#0f172a]/20 bg-transparent"
          }`}
        >
          <Brain className="w-3.5 h-3.5 text-indigo-400" />
          Analyse Corrélation IA
        </button>
      </div>

      {advTab === "matches" ? (
        <div className="space-y-6">
          {/* Cotes Actuelles de Référence du Match */}
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-indigo-500/20 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-black uppercase text-indigo-400 tracking-wider bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                Cotes Actuelles de Référence
              </span>
              <span className="text-[8px] font-mono text-slate-400">
                Match Actuel
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                <span className="text-xs font-black text-slate-100 uppercase truncate text-right">
                  {getTeamName(match.homeTeam)}
                </span>
                <img
                  src={getTeamLogo(getTeamName(match.homeTeam))}
                  className="w-5.5 h-5.5 object-contain"
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
              <div className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono font-black text-[9px] text-slate-500">
                VS
              </div>
              <div className="flex items-center gap-2 flex-1 justify-start min-w-0">
                <img
                  src={getTeamLogo(getTeamName(match.awayTeam))}
                  className="w-5.5 h-5.5 object-contain"
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <span className="text-xs font-black text-slate-100 uppercase truncate">
                  {getTeamName(match.awayTeam)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/[0.03]">
              {[
                {
                  label: "1",
                  val: match.odds1 || "-",
                  color: "text-indigo-400",
                },
                {
                  label: "X",
                  val: match.oddsX || "-",
                  color: "text-amber-500",
                },
                { label: "2", val: match.odds2 || "-", color: "text-rose-450" },
              ].map((o) => (
                <div
                  key={o.label}
                  className="bg-slate-900 p-2 text-center rounded-xl border border-slate-800/80 flex flex-col justify-center items-center shadow-inner hover:border-slate-700/50 transition-all"
                >
                  <span className="text-[7.5px] text-slate-500 font-bold uppercase mb-0.5">
                    {o.label}
                  </span>
                  <span
                    className={`font-mono font-black text-[12.5px] leading-none ${o.color}`}
                  >
                    {o.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {sameTeams.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-[1px] flex-1 bg-slate-800"></div>
                <div className="flex items-center gap-2 px-2">
                  <History className="w-3 h-3 text-emerald-400" />
                  <h4 className="text-[9px] font-black text-emerald-405 uppercase tracking-[0.2em]">
                    H2H Identique (Mêmes Équipes)
                  </h4>
                </div>
                <div className="h-[1px] flex-1 bg-slate-800"></div>
              </div>
              <div className="grid gap-2">
                {sameTeams.map((m, idx) => {
                  const cIndex = chronologicalSameTeams.findIndex(
                    (item) => item.id === m.id,
                  );
                  const prevM =
                    cIndex > 0 ? chronologicalSameTeams[cIndex - 1] : null;
                  return (
                    <HistoricalMatchCard
                      key={idx}
                      m={m}
                      currentMatch={match}
                      prevMatch={prevM}
                      isBestH2HSimilar={m.id === bestH2HMatchId}
                      isClosestRanks={closestRankH2HMatchIds.includes(m.id)}
                      isClosestForm={closestFormH2HMatchIds.includes(m.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {sameOddsButDiffTeams.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-[1px] flex-1 bg-slate-800"></div>
                <div className="flex items-center gap-2 px-2">
                  <Calculator className="w-3 h-3 text-indigo-400" />
                  <h4 className="text-[9px] font-black text-indigo-405 uppercase tracking-[0.2em]">
                    Mêmes Cotes (Équipes Différentes)
                  </h4>
                </div>
                <div className="h-[1px] flex-1 bg-slate-800"></div>
              </div>
              <div className="grid gap-2">
                {sameOddsButDiffTeams.map((m, idx) => (
                  <HistoricalMatchCard key={idx} m={m} currentMatch={match} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in duration-350">
          <div className="p-4 bg-slate-950/45 border border-slate-850 rounded-2xl flex flex-col items-center text-center gap-3">
            <Sparkles className="w-8 h-8 text-indigo-400 animate-pulse" />
            <div className="space-y-1 max-w-md">
              <h5 className="text-[11px] font-black text-slate-100 uppercase tracking-wider">
                Moteur d'Analyse Mathématique IA
              </h5>
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                L'IA processe les variations chronologiques de cotes d'une
                saison à la suivante et calcule leur impact direct sur les
                scores, les issues de match, et l'écart de buts global.
              </p>
            </div>

            {!correlationText && !analysing && (
              <button
                onClick={analyzeCorrelation}
                className="mt-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-xl shadow-indigo-600/15 py-2.5 px-6 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                Lancer l'Analyse Corrélationnel
              </button>
            )}
          </div>

          {analysing && (
            <div className="p-12 bg-slate-950/20 border border-slate-900 rounded-2xl flex flex-col items-center justify-center gap-4 text-center">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <div className="space-y-1">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block animate-pulse">
                  Corrélation des Cotes en cours...
                </span>
                <p className="text-[8px] font-mono text-slate-500 uppercase">
                  Analyse de {sameTeams.length} H2H directs +{" "}
                  {sameOddsButDiffTeams.length} configuration de cotes
                  identiques
                </p>
              </div>
            </div>
          )}

          {analysisError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/15 rounded-2xl flex items-center gap-3 text-left">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider block">
                  Analyse Échouée
                </span>
                <p className="text-[9px] text-rose-300 font-medium leading-tight">
                  {analysisError}
                </p>
              </div>
            </div>
          )}

          {correlationText && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[8.5px] font-black text-indigo-400 uppercase tracking-[0.15em] flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" /> Étude de corrélation générée
                </span>
                <button
                  onClick={analyzeCorrelation}
                  disabled={analysing}
                  className="flex items-center gap-1 text-[8px] font-black uppercase text-slate-400 hover:text-white transition-all bg-slate-950 px-2 py-1 rounded-md border border-slate-850 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-2.5 h-2.5" /> Régénérer
                </button>
              </div>

              <div className="bg-slate-950/70 border border-slate-850 p-5 rounded-2xl overflow-y-auto max-h-[50vh] text-left">
                <div className="prose prose-invert max-w-none text-xs leading-relaxed font-sans space-y-4 prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tight prose-headings:text-slate-100 prose-headings:border-b prose-headings:border-slate-850 prose-headings:pb-1.5 prose-strong:text-amber-400 prose-strong:font-black">
                  <ReactMarkdown>{correlationText}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DirectH2HSection({ match, results }: { match: any; results: any[] }) {
  const getTeamNameForDisplay = (team: any) => {
    if (!team) return "-";
    if (typeof team === "string") return team;
    return team.name || team.teamName || team.shortName || "Équipe";
  };

  const homeLabel = getTeamNameForDisplay(match.homeTeam);
  const awayLabel = getTeamNameForDisplay(match.awayTeam);

  const { allerMatch, retourMatch } = React.useMemo(() => {
    const allMatches: any[] = [];
    results.forEach((round: any) => {
      const ms = round.matches || (Array.isArray(round) ? round : []);
      ms.forEach((m: any) => {
        const hN = getTeamNameForDisplay(m.homeTeam).toLowerCase().trim();
        const aN = getTeamNameForDisplay(m.awayTeam).toLowerCase().trim();
        const t1 = homeLabel.toLowerCase().trim();
        const t2 = awayLabel.toLowerCase().trim();
        if ((hN === t1 && aN === t2) || (hN === t2 && aN === t1)) {
          allMatches.push({
            ...m,
            roundNumber: round.roundNumber || round.round || m.round,
            expectedStart: m.expectedStart || round.expectedStart,
          });
        }
      });
    });

    const isTargetInResults = allMatches.some(
      (m) => String(m.id) === String(match.id),
    );
    if (!isTargetInResults) {
      allMatches.push({
        ...match,
        roundNumber: match.roundNumber || match.round,
        expectedStart: match.expectedStart,
      });
    }

    allMatches.sort((a, b) => {
      const timeA = a.expectedStart ? new Date(a.expectedStart).getTime() : 0;
      const timeB = b.expectedStart ? new Date(b.expectedStart).getTime() : 0;
      if (timeA && timeB) return timeA - timeB;
      return (Number(a.roundNumber) || 0) - (Number(b.roundNumber) || 0);
    });

    let aller = allMatches[0] || null;
    let retour = allMatches[1] || null;

    return { allerMatch: aller, retourMatch: retour };
  }, [results, match, homeLabel, awayLabel]);

  const renderMatchBox = (m: any, isAller: boolean) => {
    const hostTeamName = m
      ? getTeamNameForDisplay(m.homeTeam)
      : isAller
        ? homeLabel
        : awayLabel;
    const labelTitle = isAller
      ? "🏠 Aller (Chez " + hostTeamName + ")"
      : "✈️ Retour (Chez " + hostTeamName + ")";

    if (!m) {
      return (
        <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800/60 flex flex-col justify-center items-center h-full min-h-[120px] text-center">
          <span className="text-[7.5px] text-slate-500 font-black uppercase tracking-widest block mb-1">
            {labelTitle}
          </span>
          <span className="text-xs font-black text-slate-650 uppercase">
            Non programmé ou non trouvé
          </span>
        </div>
      );
    }

    let hS = m.homeScore ?? "-";
    let aS = m.awayScore ?? "-";
    if (m.score) {
      const sep = m.score.includes(":") ? ":" : "-";
      const parts = m.score.split(sep);
      if (parts.length === 2) {
        hS = parts[0];
        aS = parts[1];
      }
    }

    const hVal = parseInt(String(hS));
    const aVal = parseInt(String(aS));
    const isPlayed = !isNaN(hVal) && !isNaN(aVal);

    let statusText = "Non joué";
    let cardColorClass = "text-slate-500 bg-slate-950/40 border-slate-850";

    if (isPlayed) {
      if (isAller) {
        if (hVal > aVal) {
          statusText = `${homeLabel} a gagné`;
          cardColorClass =
            "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
        } else if (hVal < aVal) {
          statusText = `${awayLabel} a gagné`;
          cardColorClass =
            "text-rose-400 bg-rose-500/10 border border-rose-500/20";
        } else {
          statusText = "Match Nul";
          cardColorClass =
            "text-amber-400 bg-amber-500/10 border border-amber-500/20";
        }
      } else {
        if (hVal < aVal) {
          statusText = `${homeLabel} a gagné`;
          cardColorClass =
            "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
        } else if (hVal > aVal) {
          statusText = `${awayLabel} a gagné`;
          cardColorClass =
            "text-rose-400 bg-rose-500/10 border border-rose-500/20";
        } else {
          statusText = "Match Nul";
          cardColorClass =
            "text-amber-400 bg-amber-500/10 border border-amber-500/20";
        }
      }
    } else {
      if (m.status === "Upcoming" || m.expectedStart) {
        statusText = "Match programmé";
        cardColorClass =
          "text-indigo-400 bg-indigo-500/5 border border-indigo-500/10";
      }
    }

    const goals = [
      ...(m.scoreDetails?.homeGoals?.map((g: any) => ({ ...g, side: "h" })) ||
        []),
      ...(m.scoreDetails?.awayGoals?.map((g: any) => ({ ...g, side: "a" })) ||
        []),
    ].sort((a: any, b: any) => parseInt(a.minute) - parseInt(b.minute));

    return (
      <div
        className={`rounded-xl p-3 bg-slate-950/40 border flex flex-col justify-between min-h-[140px] transition-all duration-150 relative ${cardColorClass}`}
      >
        <div>
          <div className="flex justify-between items-center border-b border-white/[0.03] pb-2 mb-2">
            <span className="text-[7.5px] font-black uppercase tracking-widest text-slate-400">
              {labelTitle}
            </span>
            <span className="text-[8px] font-mono font-black text-indigo-400 bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-900/20">
              Round {m.roundNumber || m.round || "-"}
            </span>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={getTeamLogo(getTeamNameForDisplay(m.homeTeam))}
                className="w-5 h-5 object-contain shrink-0"
                alt=""
                referrerPolicy="no-referrer"
              />
              <span
                className={`text-[10px] font-black uppercase truncate max-w-[90px] ${isAller ? "text-white" : "text-slate-300"}`}
              >
                {getTeamNameForDisplay(m.homeTeam)}
              </span>
            </div>
            <div className="px-2 py-1 bg-slate-900 border border-slate-800 rounded font-mono font-black text-[10px] text-white">
              {isPlayed ? `${hS} - ${aS}` : "VS"}
            </div>
            <div className="flex items-center gap-2 min-w-0 justify-end">
              <span
                className={`text-[10px] font-black uppercase truncate max-w-[90px] ${isAller ? "text-slate-300" : "text-white"}`}
              >
                {getTeamNameForDisplay(m.awayTeam)}
              </span>
              <img
                src={getTeamLogo(getTeamNameForDisplay(m.awayTeam))}
                className="w-5 h-5 object-contain shrink-0"
                alt=""
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-white/[0.02] flex items-center justify-between text-[7px] font-bold uppercase tracking-wider text-slate-400">
          <span>{statusText}</span>
          {m.expectedStart && (
            <span className="text-slate-500 font-mono">
              {new Date(m.expectedStart).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
        </div>

        {(m.odds1 || m.oddsX || m.odds2) && (
          <div className="mt-2 pt-2 border-t border-white/[0.03]">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "1", val: m.odds1 || "-", color: "text-indigo-400" },
                { label: "N", val: m.oddsX || "-", color: "text-amber-500" },
                { label: "2", val: m.odds2 || "-", color: "text-rose-450" },
              ].map((o) => (
                <div
                  key={o.label}
                  className="bg-slate-950/80 p-1.5 text-center rounded-lg border border-slate-900/60 flex flex-col justify-center items-center shadow-inner"
                >
                  <span className="text-[6px] text-slate-500 font-bold uppercase mb-0.5">
                    {o.label}
                  </span>
                  <span
                    className={`font-mono font-black text-[10px] leading-none ${o.color}`}
                  >
                    {o.val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {goals.length > 0 && (
          <div className="mt-2 pt-1.5 border-t border-white/[0.03] flex flex-wrap gap-1 max-h-[35px] overflow-y-auto no-scrollbar">
            {goals.map((g: any, gi: number) => (
              <span
                key={gi}
                className={`text-[8px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1 ${g.side === "h" ? "text-emerald-400 bg-emerald-500/5 border border-emerald-500/10" : "text-amber-400 bg-amber-500/5 border border-amber-500/10"}`}
              >
                ⚽ {g.minute || g.time || "?"}'
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  let homePoints = 0;
  let awayPoints = 0;
  let matchesCount = 0;

  if (allerMatch) {
    let hS = allerMatch.homeScore;
    let aS = allerMatch.awayScore;
    if (allerMatch.score) {
      const sep = allerMatch.score.includes(":") ? ":" : "-";
      const parts = allerMatch.score.split(sep);
      if (parts.length === 2) {
        hS = parts[0];
        aS = parts[1];
      }
    }
    const hVal = parseInt(String(hS));
    const aVal = parseInt(String(aS));
    if (!isNaN(hVal) && !isNaN(aVal)) {
      matchesCount++;
      if (hVal > aVal) {
        homePoints += 3;
      } else if (hVal < aVal) {
        awayPoints += 3;
      } else {
        homePoints += 1;
        awayPoints += 1;
      }
    }
  }

  if (retourMatch) {
    let hS = retourMatch.homeScore;
    let aS = retourMatch.awayScore;
    if (retourMatch.score) {
      const sep = retourMatch.score.includes(":") ? ":" : "-";
      const parts = retourMatch.score.split(sep);
      if (parts.length === 2) {
        hS = parts[0];
        aS = parts[1];
      }
    }
    const hVal = parseInt(String(hS));
    const aVal = parseInt(String(aS));
    if (!isNaN(hVal) && !isNaN(aVal)) {
      matchesCount++;
      if (hVal > aVal) {
        awayPoints += 3;
      } else if (hVal < aVal) {
        homePoints += 3;
      } else {
        homePoints += 1;
        awayPoints += 1;
      }
    }
  }

  const maxPoints = matchesCount * 3 === 0 ? 6 : matchesCount * 3;

  return (
    <div className="space-y-4 pt-2">
      {/* Cotes Actuelles de Référence du Match */}
      <div className="bg-slate-950/80 p-4 rounded-2xl border border-indigo-500/20 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[8.5px] font-black uppercase text-indigo-400 tracking-wider bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
            Cotes Actuelles de Référence
          </span>
          <span className="text-[8px] font-mono text-slate-400">
            Match Actuel
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <span className="text-xs font-black text-slate-100 uppercase truncate text-right">
              {getTeamName(match.homeTeam)}
            </span>
            <img
              src={getTeamLogo(getTeamName(match.homeTeam))}
              className="w-5.5 h-5.5 object-contain"
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
          <div className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono font-black text-[9px] text-slate-500">
            VS
          </div>
          <div className="flex items-center gap-2 flex-1 justify-start min-w-0">
            <img
              src={getTeamLogo(getTeamName(match.awayTeam))}
              className="w-5.5 h-5.5 object-contain"
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <span className="text-xs font-black text-slate-100 uppercase truncate">
              {getTeamName(match.awayTeam)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/[0.03]">
          {[
            { label: "1", val: match.odds1 || "-", color: "text-indigo-400" },
            { label: "X", val: match.oddsX || "-", color: "text-amber-500" },
            { label: "2", val: match.odds2 || "-", color: "text-rose-450" },
          ].map((o) => (
            <div
              key={o.label}
              className="bg-slate-900 p-2 text-center rounded-xl border border-slate-800/80 flex flex-col justify-center items-center shadow-inner hover:border-slate-700/50 transition-all"
            >
              <span className="text-[7.5px] text-slate-500 font-bold uppercase mb-0.5">
                {o.label}
              </span>
              <span
                className={`font-mono font-black text-[12.5px] leading-none ${o.color}`}
              >
                {o.val}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[#0a0f1d] border border-white/[0.03] rounded-2xl shadow">
        <div>
          <h4 className="text-xs font-black text-slate-100 uppercase tracking-widest flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-emerald-400" />
            Double Confrontation Face-à-Face
          </h4>
          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            Exposition détaillée de l'Aller (Domicile) et du Retour (Extérieur)
            entre ces deux formations
          </p>
        </div>

        <div className="flex gap-3 shrink-0">
          <div className="px-3 py-1 bg-slate-950/80 border border-slate-850 rounded-xl text-center">
            <span className="block text-[6.5px] font-black text-slate-500 uppercase tracking-wider">
              Bilan {homeLabel}
            </span>
            <span className="text-[10px] font-mono font-black text-emerald-400">
              {homePoints} / {maxPoints} PTS
            </span>
          </div>
          <div className="px-3 py-1 bg-slate-950/80 border border-slate-850 rounded-xl text-center">
            <span className="block text-[6.5px] font-black text-slate-500 uppercase tracking-wider">
              Bilan {awayLabel}
            </span>
            <span className="text-[10px] font-mono font-black text-amber-400">
              {awayPoints} / {maxPoints} PTS
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderMatchBox(allerMatch, true)}
        {renderMatchBox(retourMatch, false)}
      </div>
    </div>
  );
}

function DatabaseH2HSection({
  match,
  leagueId,
}: {
  match: any;
  leagueId: number;
}) {
  const [h2hMatches, setH2hMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const getTeamNameForDisplay = (team: any) => {
    if (!team) return "-";
    if (typeof team === "string") return team;
    return team.name || team.teamName || team.shortName || "Équipe";
  };

  const homeLabel = getTeamNameForDisplay(match.homeTeam);
  const awayLabel = getTeamNameForDisplay(match.awayTeam);

  useEffect(() => {
    const fetchHistoryAndFilter = async () => {
      setLoading(true);
      try {
        const isSameTeamLocal = (t1: string = "", t2: string = "") => {
          const n1 = t1.toLowerCase().trim();
          const n2 = t2.toLowerCase().trim();
          if (n1 === n2) return true;

          const clean = (s: string) => {
            return s
              .replace(
                /\bfc\b|\brc\b|\bsc\b|\bafc\b|\bas\b|\bud\b|\bcd\b|\bac\b|\bcf\b/g,
                "",
              )
              .replace(/[^a-z0-9]/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          };

          const c1 = clean(n1);
          const c2 = clean(n2);
          if (c1 === c2 && c1 !== "") return true;
          if (c1.length > 3 && c2.length > 3) {
            if (c1.includes(c2) || c2.includes(c1)) return true;
          }
          return false;
        };

        const lidNum = Number(leagueId);

        // 1. Exact compound index lookup for instant results (~1-2ms execution time)
        const [h2h1, h2h2] = await Promise.all([
          db.matches
            .where("[leagueId+homeTeam+awayTeam]")
            .equals([lidNum, homeLabel, awayLabel])
            .toArray(),
          db.matches
            .where("[leagueId+homeTeam+awayTeam]")
            .equals([lidNum, awayLabel, homeLabel])
            .toArray(),
        ]);

        let filtered = [...h2h1, ...h2h2];

        // 2. Falling back to the slower but thorough streaming filter ONLY if the exact index yielded nothing
        if (filtered.length === 0) {
          console.log(
            "[DatabaseH2H] Indexed query was empty, executing on-the-fly streaming database scan...",
          );
          filtered = await db.matches
            .where("leagueId")
            .anyOf([lidNum, String(lidNum)])
            .filter((m) => {
              const hName = getTeamNameForDisplay(m.homeTeam);
              const aName = getTeamNameForDisplay(m.awayTeam);
              return (
                (isSameTeamLocal(hName, homeLabel) &&
                  isSameTeamLocal(aName, awayLabel)) ||
                (isSameTeamLocal(hName, awayLabel) &&
                  isSameTeamLocal(aName, homeLabel))
              );
            })
            .toArray();
        }

        // Apply score validity filter
        filtered = filtered.filter((m) => {
          const hasHomeScore =
            m.homeScore !== undefined &&
            m.homeScore !== null &&
            String(m.homeScore).trim() !== "" &&
            String(m.homeScore).trim() !== "-";
          const hasAwayScore =
            m.awayScore !== undefined &&
            m.awayScore !== null &&
            String(m.awayScore).trim() !== "" &&
            String(m.awayScore).trim() !== "-";
          return hasHomeScore && hasAwayScore;
        });

        // Sort by date (latest first)
        filtered.sort((a, b) => {
          const dateA = a.expectedStart
            ? new Date(a.expectedStart).getTime()
            : 0;
          const dateB = b.expectedStart
            ? new Date(b.expectedStart).getTime()
            : 0;
          return dateB - dateA;
        });

        setH2hMatches(filtered);
      } catch (err) {
        console.error("Error querying database H2H:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistoryAndFilter();
  }, [match, leagueId, homeLabel, awayLabel]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (h2hMatches.length === 0) {
    return (
      <div className="py-12 text-center bg-slate-950/20 rounded-2xl border border-dashed border-slate-800/60">
        <Database className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-55" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Aucun historique direct trouvé dans la base de données
        </p>
      </div>
    );
  }

  // Calculate H2H stats relative to the current match orientation:
  // homeLabel is the upcoming home team, awayLabel is the upcoming away team
  let homeWinsCount = 0;
  let drawsCount = 0;
  let awayWinsCount = 0;

  const isSameTeamLocal = (t1: string = "", t2: string = "") => {
    const n1 = t1.toLowerCase().trim();
    const n2 = t2.toLowerCase().trim();
    if (n1 === n2) return true;

    const clean = (s: string) => {
      return s
        .replace(
          /\bfc\b|\brc\b|\bsc\b|\bafc\b|\bas\b|\bud\b|\bcd\b|\bac\b|\bcf\b/g,
          "",
        )
        .replace(/[^a-z0-9]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const c1 = clean(n1);
    const c2 = clean(n2);
    if (c1 === c2 && c1 !== "") return true;
    if (c1.length > 3 && c2.length > 3) {
      if (c1.includes(c2) || c2.includes(c1)) return true;
    }
    return false;
  };

  h2hMatches.forEach((h) => {
    const hHomeScore = parseInt(h.homeScore || "0");
    const hAwayScore = parseInt(h.awayScore || "0");
    const isHomePlayingHome = isSameTeamLocal(
      getTeamNameForDisplay(h.homeTeam),
      homeLabel,
    );

    if (hHomeScore === hAwayScore) {
      drawsCount++;
    } else if (hHomeScore > hAwayScore) {
      if (isHomePlayingHome) {
        homeWinsCount++;
      } else {
        awayWinsCount++;
      }
    } else {
      if (isHomePlayingHome) {
        awayWinsCount++;
      } else {
        homeWinsCount++;
      }
    }
  });

  const total = h2hMatches.length;
  const pHomeWin = total > 0 ? Math.round((homeWinsCount / total) * 100) : 0;
  const pDraw = total > 0 ? Math.round((drawsCount / total) * 100) : 0;
  const pAwayWin = total > 0 ? 100 - pHomeWin - pDraw : 0;

  // Group by season
  const groupedBySeason: Record<string, any[]> = {};
  h2hMatches.forEach((m) => {
    const sName = m.season || "Saison Inconnue";
    if (!groupedBySeason[sName]) {
      groupedBySeason[sName] = [];
    }
    groupedBySeason[sName].push(m);
  });
  const sortedSeasons = Object.keys(groupedBySeason).sort((a, b) =>
    b.localeCompare(a),
  );

  return (
    <div className="space-y-4 pt-1">
      {/* Cotes Actuelles de Référence du Match */}
      <div className="bg-slate-950/80 p-4 rounded-2xl border border-indigo-500/20 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[8.5px] font-black uppercase text-indigo-400 tracking-wider bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
            Cotes Actuelles de Référence
          </span>
          <span className="text-[8px] font-mono text-slate-400">
            Match Actuel
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <span className="text-xs font-black text-slate-100 uppercase truncate text-right">
              {getTeamName(match.homeTeam)}
            </span>
            <img
              src={getTeamLogo(getTeamName(match.homeTeam))}
              className="w-5.5 h-5.5 object-contain"
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
          <div className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono font-black text-[9px] text-slate-550">
            VS
          </div>
          <div className="flex items-center gap-2 flex-1 justify-start min-w-0">
            <img
              src={getTeamLogo(getTeamName(match.awayTeam))}
              className="w-5.5 h-5.5 object-contain"
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <span className="text-xs font-black text-slate-100 uppercase truncate">
              {getTeamName(match.awayTeam)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/[0.03]">
          {[
            { label: "1", val: match.odds1 || "-", color: "text-indigo-400" },
            { label: "X", val: match.oddsX || "-", color: "text-amber-500" },
            { label: "2", val: match.odds2 || "-", color: "text-rose-450" },
          ].map((o) => (
            <div
              key={o.label}
              className="bg-slate-900 p-2 text-center rounded-xl border border-slate-800/80 flex flex-col justify-center items-center shadow-inner hover:border-slate-700/50 transition-all"
            >
              <span className="text-[7.5px] text-slate-500 font-bold uppercase mb-0.5">
                {o.label}
              </span>
              <span
                className={`font-mono font-black text-[12.5px] leading-none ${o.color}`}
              >
                {o.val}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Overview Stats Card */}
      <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-2xl flex flex-col gap-3 font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              Statistiques H2H Globales ({total} Matchs)
            </h4>
            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              Historique complet enregistré localement dans la base de données
            </p>
          </div>
          <div className="flex gap-2 font-mono text-[9px] font-black shrink-0">
            <span className="text-emerald-400">
              {homeLabel} : {pHomeWin}%
            </span>
            <span className="text-slate-600 font-normal">/</span>
            <span className="text-amber-400">Nuls : {pDraw}%</span>
            <span className="text-slate-600 font-normal">/</span>
            <span className="text-rose-400">
              {awayLabel} : {pAwayWin}%
            </span>
          </div>
        </div>

        {/* Bar Chart Segmented */}
        <div className="w-full h-2 bg-slate-900 rounded-full flex overflow-hidden">
          <div
            className="bg-emerald-500 h-full transition-all"
            style={{ width: `${pHomeWin}%` }}
            title={`Victoires ${homeLabel} : ${pHomeWin}%`}
          />
          <div
            className="bg-amber-500 h-full transition-all"
            style={{ width: `${pDraw}%` }}
            title={`Nuls : ${pDraw}%`}
          />
          <div
            className="bg-rose-500 h-full transition-all"
            style={{ width: `${pAwayWin}%` }}
            title={`Victoires ${awayLabel} : ${pAwayWin}%`}
          />
        </div>

        <div className="flex items-center justify-between text-[8px] font-black text-slate-500 uppercase">
          <span className="text-emerald-400">
            {homeLabel} ({homeWinsCount} V)
          </span>
          <span className="text-amber-400">Matchs Nuls ({drawsCount} N)</span>
          <span className="text-rose-400">
            {awayLabel} ({awayWinsCount} V)
          </span>
        </div>
      </div>

      {/* Season grouping List */}
      <div className="space-y-4 max-h-[425px] overflow-y-auto pr-1.5 font-sans custom-scrollbar">
        {sortedSeasons.map((seasonName) => {
          const seasonMatches = groupedBySeason[seasonName];
          return (
            <div
              key={seasonName}
              className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg transition-all hover:border-slate-700/60"
            >
              <div className="flex items-center justify-between px-4 py-3 bg-slate-950/70 border-b border-slate-850">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                  🏆 Saison {seasonName}
                </span>
                <span className="text-[8.5px] font-bold text-slate-400 font-mono bg-slate-900 border border-slate-800/80 px-2 py-0.5 rounded-md">
                  {seasonMatches.length} match
                  {seasonMatches.length > 1 ? "es" : ""}
                </span>
              </div>

              <div className="divide-y divide-slate-800/40">
                {seasonMatches.map((h, hIdx) => {
                  const hHomeScore = parseInt(h.homeScore || "0");
                  const hAwayScore = parseInt(h.awayScore || "0");
                  const homeGoalsList = h.scoreDetails?.homeGoals || [];
                  const awayGoalsList = h.scoreDetails?.awayGoals || [];
                  let htFtOutcome = "";
                  if (homeGoalsList.length > 0 || awayGoalsList.length > 0) {
                    let hHt = 0;
                    let aHt = 0;
                    homeGoalsList.forEach((g: any) => {
                      const m = parseInt(g.minute || "0");
                      if (!isNaN(m) && m <= 45) hHt++;
                    });
                    awayGoalsList.forEach((g: any) => {
                      const m = parseInt(g.minute || "0");
                      if (!isNaN(m) && m <= 45) aHt++;
                    });
                    const htRes = hHt > aHt ? "1" : hHt < aHt ? "2" : "X";
                    const ftRes =
                      hHomeScore > hAwayScore
                        ? "1"
                        : hHomeScore < hAwayScore
                          ? "2"
                          : "X";
                    htFtOutcome = `${htRes}/${ftRes}`;
                  }

                  const dateStr = h.expectedStart;
                  // Determine outcome color for direct visual reference (left border indicator)
                  let outcomeBorderColor = "border-l-4 border-l-slate-700/60";
                  if (hHomeScore > hAwayScore) {
                    outcomeBorderColor = "border-l-4 border-l-emerald-500/80";
                  } else if (hAwayScore > hHomeScore) {
                    outcomeBorderColor = "border-l-4 border-l-rose-500/80";
                  } else {
                    outcomeBorderColor = "border-l-4 border-l-amber-500/80";
                  }

                  return (
                    <div
                      key={hIdx}
                      className={`p-4 flex flex-col gap-3 hover:bg-slate-950/30 transition-all duration-200 ${outcomeBorderColor}`}
                    >
                      <div className="flex items-center justify-between text-[8px] font-extrabold text-slate-500 uppercase select-none tracking-widest leading-none">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-indigo-300 font-extrabold text-[8.5px] leading-none">
                            Round {h.round}
                          </span>
                          {htFtOutcome && (
                            <span
                              className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono text-[8px] leading-none"
                              title="Mi-temps / Fin de match"
                            >
                              HT/FT {htFtOutcome}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[8.5px] text-slate-400 bg-slate-950/40 px-1.5 py-0.5 rounded border border-slate-900 leading-none">
                          {dateStr}
                        </span>
                      </div>

                      {/* Desktop and Mobile matches list layout */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 flex-1 justify-end min-w-0">
                          <div className="flex flex-col items-end min-w-0 font-sans flex-1">
                            <div className="flex items-center gap-1.5 justify-end w-full min-w-0">
                              {h.homeRankAtMatch !== undefined &&
                                h.homeRankAtMatch > 0 && (
                                  <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 rounded-md font-mono shrink-0 shadow-sm leading-none" title="Rang au moment du match">
                                    #{h.homeRankAtMatch}
                                  </span>
                                )}
                              <span
                                className={`text-[10px] font-black uppercase truncate text-right tracking-wide ${hHomeScore > hAwayScore ? "text-white" : "text-slate-400"}`}
                              >
                                {getTeamNameForDisplay(h.homeTeam)}
                              </span>
                            </div>
                            {h.homeFormWDLPct && (
                              <span className="text-[8.5px] font-bold text-cyan-300 bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded font-mono block text-right mt-1 leading-none shadow-sm whitespace-nowrap shrink-0">
                                NVD: {h.homeFormWDLPct.v}/{h.homeFormWDLPct.n}/
                                {h.homeFormWDLPct.d}%
                              </span>
                            )}
                          </div>
                          <div className="w-6.5 h-6.5 bg-slate-950/50 rounded-lg p-1 border border-slate-850 flex items-center justify-center shrink-0">
                            <img
                              src={getTeamLogo(
                                getTeamNameForDisplay(h.homeTeam),
                              )}
                              alt=""
                              className="w-full h-full object-contain"
                              onError={(e) =>
                                (e.currentTarget.style.display = "none")
                              }
                            />
                          </div>
                        </div>

                        {/* Centered Score Container only */}
                        <div className="flex flex-col items-center justify-center shrink-0 min-w-[50px]">
                          <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-950/95 border border-slate-800 rounded-xl shadow-inner font-mono select-none">
                            <span
                              className={`text-[12.5px] font-black tracking-tight ${hHomeScore > hAwayScore ? "text-emerald-400 font-extrabold" : "text-slate-300"}`}
                            >
                              {hHomeScore}
                            </span>
                            <span className="text-[10px] font-black text-slate-700">
                              :
                            </span>
                            <span
                              className={`text-[12.5px] font-black tracking-tight ${hAwayScore > hHomeScore ? "text-emerald-400 font-extrabold" : "text-slate-300"}`}
                            >
                              {hAwayScore}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
                          <div className="w-6.5 h-6.5 bg-slate-950/50 rounded-lg p-1 border border-slate-850 flex items-center justify-center shrink-0">
                            <img
                              src={getTeamLogo(
                                getTeamNameForDisplay(h.awayTeam),
                              )}
                              alt=""
                              className="w-full h-full object-contain"
                              onError={(e) =>
                                (e.currentTarget.style.display = "none")
                              }
                            />
                          </div>
                          <div className="flex flex-col items-start min-w-0 font-sans flex-1">
                            <div className="flex items-center gap-1.5 justify-start w-full min-w-0">
                              <span
                                className={`text-[10px] font-black uppercase truncate text-left tracking-wide ${hAwayScore > hHomeScore ? "text-white" : "text-slate-400"}`}
                              >
                                {getTeamNameForDisplay(h.awayTeam)}
                              </span>
                              {h.awayRankAtMatch !== undefined &&
                                h.awayRankAtMatch > 0 && (
                                  <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 rounded-md font-mono shrink-0 shadow-sm leading-none" title="Rang au moment du match">
                                    #{h.awayRankAtMatch}
                                  </span>
                                )}
                            </div>
                            {h.awayFormWDLPct && (
                              <span className="text-[8.5px] font-bold text-cyan-300 bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded font-mono block text-left mt-1 leading-none shadow-sm whitespace-nowrap shrink-0">
                                NVD: {h.awayFormWDLPct.v}/{h.awayFormWDLPct.n}/
                                {h.awayFormWDLPct.d}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* List Goals list if any are available (Shown ABOVE final odds as requested) */}
                      {(homeGoalsList.length > 0 ||
                        awayGoalsList.length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-1 justify-center max-h-[55px] overflow-y-auto no-scrollbar py-0.5 border-t border-slate-800/10 pt-1.5 w-full">
                          {[
                            ...homeGoalsList.map((g: any) => ({
                              ...g,
                              side: "h",
                            })),
                            ...awayGoalsList.map((g: any) => ({
                              ...g,
                              side: "a",
                            })),
                          ]
                            .sort(
                              (a: any, b: any) =>
                                parseInt(a.minute || "0") -
                                parseInt(b.minute || "0"),
                            )
                            .map((g: any, gi: number) => (
                              <span
                                key={gi}
                                className={`inline-flex items-center gap-1 text-[8.5px] font-bold px-1.5 py-0.5 rounded-md border ${
                                  g.side === "h"
                                    ? "text-emerald-400 bg-emerald-500/5 border-emerald-500/10"
                                    : "text-rose-455 bg-rose-500/5 border-rose-500/10"
                                }`}
                              >
                                <span className="opacity-85 text-[7px] leading-none">⚽</span>{" "}
                                {g.minute || g.time || "?"}'
                              </span>
                            ))}
                        </div>
                      )}

                      {/* Separate Bottom Container for Odds (spaced out, clearly visible AT THE VERY BOTTOM) */}
                      {(h.odds1 || h.oddsX || h.odds2) && (
                        <div className="flex justify-center mt-1 pt-1.5 border-t border-slate-900/20">
                          <div className="inline-flex items-center gap-3 bg-slate-950/90 px-3 py-1 rounded-lg border border-slate-800/80 shadow-md select-none">
                            <span className="text-[7.5px] font-sans font-black text-indigo-400 uppercase tracking-widest mr-1">COTES</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8px] font-black text-slate-500 font-mono">1</span>
                              <span className={`text-[10px] font-mono font-black ${
                                (() => {
                                  const rv = parseFloat(match?.odds1 || match?.odds_1);
                                  const ov = parseFloat(h.odds1);
                                  return !isNaN(rv) && !isNaN(ov) && rv > 0 && Math.abs(ov - rv) / rv <= 0.12;
                                })() ? "text-rose-400 font-extrabold" : "text-emerald-400 font-extrabold"
                              }`} title="Victoire Domicile">
                                {h.odds1 || "-"}
                              </span>
                            </div>
                            <span className="text-slate-800 text-[10px]">|</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8px] font-black text-slate-500 font-mono">X</span>
                              <span className={`text-[10px] font-mono font-black ${
                                (() => {
                                  const rv = parseFloat(match?.oddsX || match?.odds_x || match?.odds_X);
                                  const ov = parseFloat(h.oddsX);
                                  return !isNaN(rv) && !isNaN(ov) && rv > 0 && Math.abs(ov - rv) / rv <= 0.12;
                                })() ? "text-rose-400 font-extrabold" : "text-amber-405 font-extrabold"
                              }`} title="Match Nul">
                                {h.oddsX || "-"}
                              </span>
                            </div>
                            <span className="text-slate-800 text-[10px]">|</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8px] font-black text-slate-500 font-mono">2</span>
                              <span className={`text-[10px] font-mono font-black ${
                                (() => {
                                  const rv = parseFloat(match?.odds2 || match?.odds_2);
                                  const ov = parseFloat(h.odds2);
                                  return !isNaN(rv) && !isNaN(ov) && rv > 0 && Math.abs(ov - rv) / rv <= 0.12;
                                })() ? "text-rose-400 font-extrabold" : "text-rose-400 font-extrabold"
                              }`} title="Victoire Extérieur">
                                {h.odds2 || "-"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
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
}

function HistoricalMatchCard({
  m,
  currentMatch,
  prevMatch,
  isBestH2HSimilar,
  isClosestRanks,
  isClosestForm,
}: {
  m: any;
  currentMatch: any;
  prevMatch?: any;
  isBestH2HSimilar?: boolean;
  isClosestRanks?: boolean;
  isClosestForm?: boolean;
}) {
  const associatedLeague = LEAGUES.find(
    (le) => Number(le.id) === Number(m.leagueId),
  );

  // Safe parseFloat calculations for odds comparison
  const getDiffValue = (currVal: any, prevVal: any) => {
    if (
      currVal === undefined ||
      currVal === null ||
      prevVal === undefined ||
      prevVal === null
    )
      return null;
    const c = parseFloat(String(currVal));
    const p = parseFloat(String(prevVal));
    if (isNaN(c) || isNaN(p)) return null;
    return c - p;
  };

  const d1 = getDiffValue(m.odds1, prevMatch?.odds1);
  const dX = getDiffValue(m.oddsX, prevMatch?.oddsX);
  const d2 = getDiffValue(m.odds2, prevMatch?.odds2);

  const renderTrendBadge = (diff: number | null) => {
    if (diff === null || Math.abs(diff) < 0.0001) return null;
    const isIncrease = diff > 0;
    const sign = isIncrease ? "+" : "";
    const badgeBg = isIncrease
      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      : "bg-rose-500/10 text-rose-400 border border-rose-500/20";
    return (
      <span
        className={`text-[8px] font-mono font-bold px-1 py-0.5 rounded mt-1 select-none leading-none ${badgeBg}`}
        title={isIncrease ? "Cote en hausse" : "Cote en baisse"}
      >
        {sign}
        {diff.toFixed(2)}
      </span>
    );
  };

  const details = m.scoreDetails || m.eventScore?.scoreDetails || {};
  const homeGoalsList = details.homeGoals || [];
  const awayGoalsList = details.awayGoals || [];
  const allGoals = [
    ...(homeGoalsList.map((g: any) => ({ ...g, side: "h" })) || []),
    ...(awayGoalsList.map((g: any) => ({ ...g, side: "a" })) || []),
  ].sort(
    (a, b) =>
      parseInt(a.minute || a.time || "0") - parseInt(b.minute || b.time || "0"),
  );

  const hasGoals = allGoals.length > 0;

  // Compute HT/FT
  const hHomeScore = parseInt(m.homeScore || "0");
  const hAwayScore = parseInt(m.awayScore || "0");
  let htFtOutcome = "";
  if (hasGoals) {
    let hHt = 0;
    let aHt = 0;
    homeGoalsList.forEach((g: any) => {
      const min = parseInt(g.minute || g.time || "0");
      if (!isNaN(min) && min <= 45) hHt++;
    });
    awayGoalsList.forEach((g: any) => {
      const min = parseInt(g.minute || g.time || "0");
      if (!isNaN(min) && min <= 45) aHt++;
    });
    const htRes = hHt > aHt ? "1" : hHt < aHt ? "2" : "X";
    const ftRes =
      hHomeScore > hAwayScore ? "1" : hHomeScore < hAwayScore ? "2" : "X";
    htFtOutcome = `${htRes}/${ftRes}`;
  }

  const dateStr = m.expectedStart
    ? new Date(m.expectedStart).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  const getTeamNameForDisplay = (team: any) => {
    if (!team) return "-";
    if (typeof team === "string") return team;
    return team.name || team.teamName || team.shortName || "Équipe";
  };

  const homeNameStr = getTeamNameForDisplay(m.homeTeam).toLowerCase().trim();
  const awayNameStr = getTeamNameForDisplay(m.awayTeam).toLowerCase().trim();
  const curHomeStr = getTeamNameForDisplay(currentMatch.homeTeam)
    .toLowerCase()
    .trim();
  const curAwayStr = getTeamNameForDisplay(currentMatch.awayTeam)
    .toLowerCase()
    .trim();

  const isHomeHighlight =
    homeNameStr === curHomeStr || homeNameStr === curAwayStr;
  const isAwayHighlight =
    awayNameStr === curHomeStr || awayNameStr === curAwayStr;

  return (
    <div
      className={`p-4 rounded-2xl overflow-hidden shadow-xl transition-all flex flex-col gap-3 font-sans relative ${
        isBestH2HSimilar
          ? "bg-rose-950/15 border border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/35"
          : isClosestRanks || isClosestForm
            ? "bg-emerald-950/15 border border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/35"
            : "bg-[#0a112f]/70 hover:bg-[#0c163b] border border-indigo-900/50 hover:border-indigo-500/40 hover:shadow-indigo-500/5"
      }`}
    >
      {/* Card header */}
      <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase select-none tracking-wider">
        <div className="flex flex-wrap items-center gap-1.5">
          {isBestH2HSimilar && (
            <span className="text-[8px] font-extrabold text-rose-400 bg-rose-500/20 border border-rose-500/35 px-2.5 py-0.5 rounded animate-pulse leading-none flex items-center gap-1">
              Similarité Élevée 🔥
            </span>
          )}
          {isClosestRanks && (
            <span className="text-[8px] font-extrabold text-emerald-400 bg-emerald-500/20 border border-emerald-500/35 px-2.5 py-0.5 rounded leading-none flex items-center gap-1">
              Rangs Proches 🟢
            </span>
          )}
          {isClosestForm && (
            <span className="text-[8px] font-extrabold text-teal-400 bg-teal-500/20 border border-teal-500/35 px-2.5 py-0.5 rounded leading-none flex items-center gap-1">
              Forme Proche 📈
            </span>
          )}
          {associatedLeague && (
            <span className="flex items-center gap-1 text-[8px] font-extrabold text-slate-200 bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700/60 leading-none">
              {associatedLeague.country && (
                <img
                  src={getLeagueFlag(associatedLeague.country)}
                  alt={associatedLeague.country}
                  className="w-3 h-2 object-cover rounded-sm"
                  referrerPolicy="no-referrer"
                />
              )}
              {associatedLeague.name}
            </span>
          )}
          <span className="text-[8px] font-extrabold text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded border border-indigo-500/20 leading-none">
            Saison {m.eventCategoryId || m.season || "-"}
          </span>
          {(m.roundNumber || m.round) && (
            <span className="text-[8px] font-extrabold text-amber-400 bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 rounded font-mono leading-none">
              Round {m.roundNumber || m.round}
            </span>
          )}
          {htFtOutcome && (
            <span
              className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 font-mono text-[8px] leading-none"
              title="Mi-temps / Fin de match"
            >
              HT/FT {htFtOutcome}
            </span>
          )}
        </div>
        <span className="font-mono text-[8.5px] text-slate-400 bg-slate-900/65 px-1.5 py-0.5 rounded border border-slate-850">
          {dateStr}
        </span>
      </div>

      {/* Main Row layout for matching teams */}
      <div className="flex items-center justify-between gap-1.5 py-1">
        {/* Home Team */}
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <div className="flex flex-col items-end min-w-0 flex-1 font-sans">
            <div className="flex items-center gap-1.5 justify-end w-full min-w-0">
              {m.homeRankAtMatch !== undefined && m.homeRankAtMatch > 0 && (
                <span
                  className="text-[10px] font-black text-amber-300 bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 rounded-md shrink-0 font-mono shadow-sm leading-none"
                  title="Classement de l'équipe"
                >
                  #{m.homeRankAtMatch}
                </span>
              )}
              <span
                className={`text-[11.5px] uppercase truncate text-right tracking-tight transition-all ${
                  isHomeHighlight
                    ? "text-amber-400 font-black drop-shadow-[0_0_8px_rgba(251,191,36,0.15)]"
                    : hHomeScore > hAwayScore
                      ? "text-white font-bold"
                      : "text-slate-300 font-medium"
                }`}
              >
                {getTeamNameForDisplay(m.homeTeam)}
              </span>
            </div>
            {m.homeFormWDLPct && (
              <span className="text-[8.5px] font-bold text-sky-300 bg-slate-950/90 border border-slate-800 px-1.5 py-0.5 rounded font-mono block text-right mt-1 leading-none shadow-sm whitespace-nowrap shrink-0">
                NVD: {m.homeFormWDLPct.v}/{m.homeFormWDLPct.n}/
                {m.homeFormWDLPct.d}%
              </span>
            )}
          </div>
          <div className="w-5.5 h-5.5 bg-slate-900/60 rounded-full flex items-center justify-center p-0.5 border border-slate-800 shrink-0">
            <img
              src={getTeamLogo(getTeamNameForDisplay(m.homeTeam))}
              alt=""
              className="w-4 h-4 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Score central badge */}
        <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-2xl border border-slate-850 shrink-0 min-w-[54px] justify-center shadow-inner">
          <span
            className={`font-black text-[13px] tracking-tight ${hHomeScore > hAwayScore ? "text-indigo-400 font-black scale-105" : "text-slate-300"}`}
          >
            {hHomeScore}
          </span>
          <span className="text-slate-600 font-black text-[10px]">-</span>
          <span
            className={`font-black text-[13px] tracking-tight ${hAwayScore > hHomeScore ? "text-indigo-400 font-black scale-105" : "text-slate-300"}`}
          >
            {hAwayScore}
          </span>
        </div>

        {/* Away Team */}
        <div className="flex items-center gap-2 flex-1 justify-start min-w-0">
          <div className="w-5.5 h-5.5 bg-slate-900/60 rounded-full flex items-center justify-center p-0.5 border border-slate-800 shrink-0">
            <img
              src={getTeamLogo(getTeamNameForDisplay(m.awayTeam))}
              alt=""
              className="w-4 h-4 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex flex-col items-start min-w-0 flex-1 font-sans">
            <div className="flex items-center gap-1.5 justify-start w-full min-w-0">
              <span
                className={`text-[11.5px] uppercase truncate text-left tracking-tight transition-all ${
                  isAwayHighlight
                    ? "text-amber-400 font-black drop-shadow-[0_0_8px_rgba(251,191,36,0.15)]"
                    : hAwayScore > hHomeScore
                      ? "text-white font-bold"
                      : "text-slate-300 font-medium"
                }`}
              >
                {getTeamNameForDisplay(m.awayTeam)}
              </span>
              {m.awayRankAtMatch !== undefined && m.awayRankAtMatch > 0 && (
                <span
                  className="text-[10px] font-black text-amber-300 bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 rounded-md shrink-0 font-mono shadow-sm leading-none"
                  title="Classement de l'équipe"
                >
                  #{m.awayRankAtMatch}
                </span>
              )}
            </div>
            {m.awayFormWDLPct && (
              <span className="text-[8.5px] font-bold text-sky-300 bg-slate-950/90 border border-slate-800 px-1.5 py-0.5 rounded font-mono block text-left mt-1 leading-none shadow-sm whitespace-nowrap shrink-0">
                NVD: {m.awayFormWDLPct.v}/{m.awayFormWDLPct.n}/
                {m.awayFormWDLPct.d}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* List Goals if available */}
      {hasGoals && (
        <div className="mt-0.5 flex flex-wrap gap-1 justify-center max-h-[50px] overflow-y-auto no-scrollbar pt-1.5 border-t border-slate-900/40">
          {allGoals.map((g: any, gi: number) => (
            <span
              key={gi}
              className={`text-[8px] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1 leading-none transition-all ${
                g.side === "h"
                  ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/15"
                  : "text-rose-400 bg-rose-500/10 border border-rose-500/15"
              }`}
            >
              <span>⚽</span>
              <span className="text-[8px] font-bold font-mono">
                {g.minute || g.time || "?"}'
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Odds Displayed nicely at the bottom */}
      {(m.odds1 || m.oddsX || m.odds2) && (
        <div className="mt-1 pt-2.5 border-t border-slate-900/40">
          <div className="grid grid-cols-3 gap-1">
            {[
              {
                label: "1",
                val: m.odds1 || "-",
                diff: d1,
                color: isBestH2HSimilar ? "text-rose-400 font-extrabold" : "text-emerald-400 font-extrabold",
                isSimilar: !!isBestH2HSimilar,
              },
              {
                label: "X",
                val: m.oddsX || "-",
                diff: dX,
                color: isBestH2HSimilar ? "text-rose-400 font-extrabold" : "text-amber-400 font-extrabold",
                isSimilar: !!isBestH2HSimilar,
              },
              {
                label: "2",
                val: m.odds2 || "-",
                diff: d2,
                color: isBestH2HSimilar ? "text-rose-400 font-extrabold" : "text-rose-400 font-extrabold",
                isSimilar: !!isBestH2HSimilar,
              },
            ].map((o) => (
              <div
                key={o.label}
                className={`rounded p-2 text-center border transition-all flex flex-col items-center justify-center min-h-[48px] bg-slate-950/70 ${o.isSimilar ? "border-rose-600/90 ring-1 ring-rose-500/20 shadow-[0_0_8px_rgba(239,68,68,0.15)] bg-rose-950/20" : "border-white/5 hover:border-slate-800 hover:bg-slate-900"}`}
              >
                <div className="text-[7.5px] text-slate-500 font-bold uppercase mb-0.5 flex items-center justify-center gap-1 leading-none select-none">
                  <span>{o.label}</span>
                  {o.isSimilar && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse inline-block"></span>
                  )}
                </div>
                <div
                  className={`font-mono font-black text-[12px] sm:text-[13px] leading-none tracking-tight ${o.color}`}
                >
                  {o.val}
                </div>
                {renderTrendBadge(o.diff)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  label,
  malagasy,
  icon,
  active,
  onClick,
}: {
  label: string;
  malagasy: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg shrink-0 ${
        active ? "nav-tab-active" : "nav-tab-inactive"
      }`}
    >
      <span className={active ? "text-emerald-400" : "text-slate-500"}>
        {React.cloneElement(icon as any, {
          className: "w-3 h-3 sm:w-3.5 sm:h-3.5",
        })}
      </span>
      <div className="flex flex-col items-start leading-none columns-1">
        <span className="text-[8.5px] sm:text-[9px] font-black">{label}</span>
        <span className="text-[5.5px] sm:text-[6px] opacity-50 font-bold mt-0.5">
          {malagasy}
        </span>
      </div>
    </button>
  );
}

export function UnusedMatchCard({
  match,
  rankings,
  results,
  onClick,
  onPlaceBet: _onPlaceBet,
  bet261Account: _bet261Account,
  resultsCache,
}: {
  match: any;
  rankings: any[];
  results: any[];
  onClick?: () => void;
  onPlaceBet?: (
    match: any,
    selection: string,
    odds: string,
    stake?: number,
  ) => Promise<void>;
  bet261Account?: any;
  resultsCache?: {
    recentMatchesMap: Record<string, any[]>;
    formMap: Record<string, string[]>;
  };
}) {
  const [homeLogoError, setHomeLogoError] = useState(false);
  const [awayLogoError, setAwayLogoError] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<
    "main" | "home" | "away"
  >("main");

  const getTeamName = (team: any) => {
    if (!team) return "-";
    if (typeof team === "string") return team;
    return team.name || team.teamName || team.shortName || "Équipe";
  };

  const homeName = String(getTeamName(match.homeTeam));
  const awayName = String(getTeamName(match.awayTeam));

  // Build local fallback cache inside MatchCard if resultsCache is not passed
  const fallbackCache = React.useMemo(() => {
    if (resultsCache) return null;
    const recentMatchesMap: Record<string, any[]> = {};
    const formMap: Record<string, string[]> = {};

    results.forEach((round) => {
      const ms = round.matches || (Array.isArray(round) ? round : []);
      ms.forEach((m: any) => {
        const hN = getTeamName(m.homeTeam);
        const aN = getTeamName(m.awayTeam);
        const hN_lower = hN.toLowerCase().trim();
        const aN_lower = aN.toLowerCase().trim();

        let homeRaw = m.homeScore;
        let awayRaw = m.awayScore;
        if (m.score) {
          const sep = m.score.includes(":") ? ":" : "-";
          const parts = m.score.split(sep);
          if (parts.length === 2) {
            homeRaw = parts[0];
            awayRaw = parts[1];
          }
        }

        const hSText =
          homeRaw !== undefined &&
          homeRaw !== null &&
          String(homeRaw).trim() !== "" &&
          String(homeRaw).trim() !== "-";
        const aSText =
          awayRaw !== undefined &&
          awayRaw !== null &&
          String(awayRaw).trim() !== "" &&
          String(awayRaw).trim() !== "-";

        if (hSText && aSText) {
          const hS = parseInt(String(homeRaw));
          const aS = parseInt(String(awayRaw));

          if (!isNaN(hS) && !isNaN(aS)) {
            const processedMatch = {
              ...m,
              homeScore: homeRaw,
              awayScore: awayRaw,
              roundNumber: round.roundNumber || round.round,
            };

            if (!formMap[hN_lower]) formMap[hN_lower] = [];
            formMap[hN_lower].push(hS > aS ? "Won" : hS < aS ? "Lost" : "Draw");

            if (!formMap[aN_lower]) formMap[aN_lower] = [];
            formMap[aN_lower].push(aS > hS ? "Won" : aS < hS ? "Lost" : "Draw");

            if (!recentMatchesMap[hN_lower]) recentMatchesMap[hN_lower] = [];
            recentMatchesMap[hN_lower].push(processedMatch);

            if (!recentMatchesMap[aN_lower]) recentMatchesMap[aN_lower] = [];
            recentMatchesMap[aN_lower].push(processedMatch);
          }
        }
      });
    });

    Object.keys(recentMatchesMap).forEach((key) => {
      recentMatchesMap[key].sort(
        (a, b) => (Number(b.roundNumber) || 0) - (Number(a.roundNumber) || 0),
      );
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
    if (recent.length === 0)
      return (
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
          const outcome =
            rHScore === rAScore
              ? "D"
              : (isHome && rHScore > rAScore) || (!isHome && rAScore > rHScore)
                ? "W"
                : "L";

          const details = r.scoreDetails || r.eventScore?.scoreDetails || {};
          const homeGoalsList = details.homeGoals || [];
          const awayGoalsList = details.awayGoals || [];
          const allGoals = [
            ...(homeGoalsList.map((g: any) => ({ ...g, side: "h" })) || []),
            ...(awayGoalsList.map((g: any) => ({ ...g, side: "a" })) || []),
          ].sort(
            (a, b) =>
              parseInt(a.minute || a.time || "0") -
              parseInt(b.minute || b.time || "0"),
          );

          const hasGoals = allGoals.length > 0;

          // Compute HT/FT
          let htFtBadge = null;
          if (hasGoals) {
            let hHt = 0;
            let aHt = 0;
            homeGoalsList.forEach((g: any) => {
              const min = parseInt(g.minute || g.time || "0");
              if (!isNaN(min) && min <= 45) hHt++;
            });
            awayGoalsList.forEach((g: any) => {
              const min = parseInt(g.minute || g.time || "0");
              if (!isNaN(min) && min <= 45) aHt++;
            });
            const htRes = hHt > aHt ? "1" : hHt < aHt ? "2" : "X";
            const ftRes =
              rHScore > rAScore ? "1" : rHScore < rAScore ? "2" : "X";
            htFtBadge = (
              <span className="px-1 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 font-mono text-[6.5px] font-black uppercase tracking-wider shrink-0 select-none">
                HT/FT {htRes}/{ftRes}
              </span>
            );
          }

          return (
            <div
              key={i}
              className="flex flex-col gap-1 p-1.5 rounded bg-white/[0.02] border border-white/[0.05]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[7px] font-black text-white shrink-0 ${
                      outcome === "W"
                        ? "bg-emerald-500"
                        : outcome === "L"
                          ? "bg-rose-500"
                          : "bg-slate-600"
                    }`}
                  >
                    {outcome === "W" ? "V" : outcome === "L" ? "D" : "N"}
                  </span>
                  <div className="flex items-center gap-1 truncate w-full">
                    <span className="text-slate-600 text-[6px] font-black">
                      J{r.roundNumber}
                    </span>
                    <span
                      className={`truncate text-[8px] font-black uppercase ${isHome ? "text-indigo-400" : "text-slate-400"}`}
                    >
                      {rHName}
                    </span>
                    <span className="text-slate-700 text-[7px] font-bold px-0.5">
                      vs
                    </span>
                    <span
                      className={`truncate text-[8px] font-black uppercase ${!isHome ? "text-indigo-400" : "text-slate-400"}`}
                    >
                      {rAName}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {htFtBadge}
                  <div className="flex items-center gap-1 bg-black/20 px-1.5 py-0.5 rounded shrink-0 ring-1 ring-white/5">
                    <span
                      className={`text-[9px] font-black ${rHScore > rAScore ? "text-emerald-400" : "text-slate-400"}`}
                    >
                      {rHScore}
                    </span>
                    <span className="text-[7px] text-slate-600 font-black">
                      -
                    </span>
                    <span
                      className={`text-[9px] font-black ${rAScore > rHScore ? "text-emerald-400" : "text-slate-400"}`}
                    >
                      {rAScore}
                    </span>
                  </div>
                </div>
              </div>

              {/* Goal Minutes List */}
              {hasGoals && (
                <div className="flex flex-wrap gap-1 pl-5 max-w-[90%]">
                  {allGoals.map((g, gi) => (
                    <span
                      key={gi}
                      className={`text-[6.5px] font-black font-mono px-1 py-0.2 rounded border ${
                        g.side === "h"
                          ? "bg-indigo-500/5 border-indigo-500/10 text-indigo-400"
                          : "bg-rose-500/5 border-rose-500/10 text-rose-400"
                      }`}
                    >
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
    const w = history.filter((r) => r === "Won").length;
    const d = history.filter((r) => r === "Draw").length;
    const l = history.filter((r) => r === "Lost").length;
    return {
      win: Math.round((w / history.length) * 100),
      draw: Math.round((d / history.length) * 100),
      loss: Math.round((l / history.length) * 100),
    };
  };

  const homeStats = getTeamStats(homeName);
  const awayStats = getTeamStats(awayName);

  // Extract odds (handle both API format and DB format)
  let odds1 = match.odds1;
  let oddsX = match.oddsX;
  let odds2 = match.odds2;

  if (!odds1 && match.eventBetTypes) {
    const odds1x2 =
      match.eventBetTypes?.find(
        (m: any) =>
          m.name?.toUpperCase() === "1X2" ||
          m.name === "Match Result" ||
          m.id === "1",
      ) ||
      match.markets?.find(
        (m: any) =>
          m.name?.toUpperCase() === "1X2" ||
          m.name === "Match Result" ||
          m.id === "1",
      );
    const items = odds1x2?.eventBetTypeItems || odds1x2?.outcomes || [];
    const findOdds = (names: string[]) => {
      const item = items.find(
        (o: any) =>
          names.includes(o.shortName) ||
          names.includes(o.name) ||
          names.includes(o.outcomeName),
      );
      return item?.odds || "-";
    };
    odds1 = findOdds(["1", "Home"]);
    oddsX = findOdds(["X", "Draw"]);
    odds2 = findOdds(["2", "Away"]);
  }

  const homeRank =
    rankings.findIndex((t) => (t.name || t.teamName) === homeName) + 1;
  const awayRank =
    rankings.findIndex((t) => (t.name || t.teamName) === awayName) + 1;

  const hasAnomaly = React.useMemo(() => {
    return getMatchAnomalyParsed(match, rankings);
  }, [match, rankings]);

  const isFinished =
    match.status?.toLowerCase() === "finished" ||
    match.status?.toLowerCase() === "ft" ||
    match.status?.toLowerCase() === "terminé";
  const isLive =
    match.status?.toLowerCase() === "live" || match.status?.includes("'");
  const h = parseInt(match.homeScore || "-1");
  const a = parseInt(match.awayScore || "-1");

  const [showAnomalyDetail, setShowAnomalyDetail] = useState(false);

  const borderHighlightClass = React.useMemo(() => {
    if (!homeStats || !awayStats) return null;
    const homeFormLength = getFullForm(homeName).length;
    const awayFormLength = getFullForm(awayName).length;
    if (homeFormLength === 0 || awayFormLength === 0) return null;

    if (homeStats.draw === awayStats.draw) {
      return {
        className:
          "border-2 border-amber-500/90 shadow-[0_0_15px_rgba(245,158,11,0.45)] bg-gradient-to-br from-amber-950/20 to-slate-900/40 hover:border-amber-400 ring-2 ring-amber-500/30 scale-[1.01] transition-all duration-300 animate-[pulse_2s_infinite]",
      };
    }
    if (homeStats.win === awayStats.win) {
      return {
        className:
          "border-2 border-emerald-500/90 shadow-[0_0_15px_rgba(16,185,129,0.45)] bg-gradient-to-br from-emerald-950/20 to-slate-900/40 hover:border-emerald-400 ring-2 ring-emerald-500/30 scale-[1.01] transition-all duration-300 animate-[pulse_2s_infinite]",
      };
    }
    if (homeStats.loss === awayStats.loss) {
      return {
        className:
          "border-2 border-rose-500/90 shadow-[0_0_15px_rgba(244,63,94,0.45)] bg-gradient-to-br from-rose-950/20 to-slate-900/40 hover:border-rose-400 ring-2 ring-rose-500/30 scale-[1.01] transition-all duration-300 animate-[pulse_2s_infinite]",
      };
    }
    return null;
  }, [homeStats, awayStats, homeName, awayName, results]);

  return (
    <div
      onClick={activeDetailTab === "main" ? onClick : undefined}
      key={`${match.id}_card`}
      className={
        borderHighlightClass
          ? `data-card p-2 flex flex-col justify-between group transition-all duration-300 ${borderHighlightClass.className}`
          : `data-card p-2 flex flex-col justify-between group transition-all duration-300 ${isLive ? "border-emerald-500/50 bg-emerald-900/5" : "hover:border-indigo-500/30"}`
      }
    >
      <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[7.5px] font-black px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded uppercase tracking-wider">
            Round {match.round || "-"}
          </span>
          {isLive && (
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          <span
            className={`text-[7.5px] font-black uppercase tracking-widest ${isLive ? "text-emerald-400" : isFinished ? "text-slate-500" : "text-amber-400"}`}
          >
            {isFinished ? "Terminé" : isLive ? "LIVE" : "À venir"}
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
            onClick={(e) => {
              e.stopPropagation();
              setActiveDetailTab("main");
            }}
            className={`px-1.5 py-0.5 rounded text-[6px] font-black uppercase transition-all ${activeDetailTab === "main" ? "bg-indigo-600 text-white shadow-lg" : "bg-slate-800 text-slate-500 hover:bg-slate-700"}`}
          >
            Match
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveDetailTab("home");
            }}
            className={`px-1.5 py-0.5 rounded text-[6px] font-black uppercase transition-all ${activeDetailTab === "home" ? "bg-indigo-600 text-white shadow-lg" : "bg-slate-800 text-slate-500 hover:bg-slate-700"}`}
          >
            Forme {homeName.split(" ")[0]}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveDetailTab("away");
            }}
            className={`px-1.5 py-0.5 rounded text-[6px] font-black uppercase transition-all ${activeDetailTab === "away" ? "bg-indigo-600 text-white shadow-lg" : "bg-slate-800 text-slate-500 hover:bg-slate-700"}`}
          >
            Forme {awayName.split(" ")[0]}
          </button>
        </div>
      </div>

      {activeDetailTab === "main" ? (
        <>
          {/* Expanded Anomaly Details Banner */}
          {hasAnomaly && showAnomalyDetail && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mb-2.5 p-2 rounded-lg bg-rose-950/25 border border-rose-500/20 text-rose-200 animate-in fade-in slide-in-from-top-1 duration-200 select-none"
            >
              <div className="flex items-start gap-1.5 text-rose-400 font-extrabold text-[8.5px] uppercase tracking-wider mb-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400 animate-bounce" />
                <span className="text-rose-400">
                  Anomalie de cote détectée !
                </span>
              </div>
              <p className="text-[8px] leading-relaxed text-slate-300 font-medium">
                L'équipe mieux classée{" "}
                <strong className="text-rose-400 font-bold">
                  {hasAnomaly.betterTeam}
                </strong>{" "}
                (Rang{" "}
                <strong className="text-white">#{hasAnomaly.betterRank}</strong>
                ) a une cote anormalement élevée de{" "}
                <strong className="text-emerald-400 font-bold font-mono">
                  {hasAnomaly.betterOdds}
                </strong>
                , tandis que son adversaire{" "}
                <strong className="text-rose-400 font-bold">
                  {hasAnomaly.worseTeam}
                </strong>{" "}
                (Rang{" "}
                <strong className="text-white">#{hasAnomaly.worseRank}</strong>)
                est favorisé avec une cote de{" "}
                <strong className="text-rose-400 font-bold font-mono">
                  {hasAnomaly.worseOdds}
                </strong>
                .
              </p>
              <div className="mt-2 pt-1.5 border-t border-rose-500/10 flex justify-between items-center text-[7px] font-black uppercase">
                <span className="text-slate-400 font-bold">
                  Écart de cote :{" "}
                  <strong className="text-rose-400 font-mono text-[8px]">
                    +{hasAnomaly.difference}
                  </strong>
                </span>
                <span className="text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/20 shadow-sm animate-pulse">
                  Value bet potentiel
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-1 mb-2">
            {/* Home Team */}
            <div className="flex-1 flex flex-col items-end min-w-0">
              <div className="flex items-center justify-end gap-2 w-full">
                <div className="flex flex-col items-end min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-black text-slate-100 uppercase truncate w-full text-right">
                    {homeName}
                  </span>
                  <div className="flex items-center gap-1">
                    {homeStats && (
                      <div className="flex gap-1 text-[8px] font-bold">
                        <span className="text-emerald-500">
                          {homeStats.win}%
                        </span>
                        <span className="text-amber-500">
                          {homeStats.draw}%
                        </span>
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
                    <img
                      src={getTeamLogo(homeName)}
                      alt=""
                      className="w-full h-full object-contain"
                      onError={() => setHomeLogoError(true)}
                    />
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
                    <span
                      className={`text-base font-black ${h > a ? "text-emerald-400" : "text-slate-200"}`}
                    >
                      {match.homeScore}
                    </span>
                    <span className="text-slate-600 font-black text-xs">:</span>
                    <span
                      className={`text-base font-black ${a > h ? "text-emerald-400" : "text-slate-200"}`}
                    >
                      {match.awayScore}
                    </span>
                  </div>
                  {/* HT/FT Display for MatchCard */}
                  {(() => {
                    const homeGoalsList = match.scoreDetails?.homeGoals || [];
                    const awayGoalsList = match.scoreDetails?.awayGoals || [];
                    const hHomeScore = parseInt(match.homeScore || "0");
                    const hAwayScore = parseInt(match.awayScore || "0");
                    if (homeGoalsList.length > 0 || awayGoalsList.length > 0) {
                      let hHt = 0;
                      let aHt = 0;
                      homeGoalsList.forEach((g: any) => {
                        const m = parseInt(g.minute || "0");
                        if (!isNaN(m) && m <= 45) hHt++;
                      });
                      awayGoalsList.forEach((g: any) => {
                        const m = parseInt(g.minute || "0");
                        if (!isNaN(m) && m <= 45) aHt++;
                      });
                      const htRes = hHt > aHt ? "1" : hHt < aHt ? "2" : "X";
                      const ftRes =
                        hHomeScore > hAwayScore
                          ? "1"
                          : hHomeScore < hAwayScore
                            ? "2"
                            : "X";
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
                <div className="px-3 py-1 text-slate-500 font-black text-[9px] tracking-[0.2em] bg-slate-950/80 rounded-lg ring-1 ring-white/10 shadow-inner">
                  VS
                </div>
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
                  <span className="text-[5px] text-amber-500/90 font-black tracking-widest uppercase mb-0.5 whitespace-nowrap">
                    Ø NUL (Σ/2)
                  </span>
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
                    <img
                      src={getTeamLogo(awayName)}
                      alt=""
                      className="w-full h-full object-contain"
                      onError={() => setAwayLogoError(true)}
                    />
                  ) : (
                    <Trophy className="w-4 h-4 text-slate-700" />
                  )}
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-black text-slate-100 uppercase truncate w-full">
                    {awayName}
                  </span>
                  <div className="flex items-center gap-1">
                    {awayRank > 0 && (
                      <span className="text-[8px] font-black text-indigo-500 bg-indigo-900/20 px-1 rounded-full border border-indigo-500/10">
                        #{awayRank}
                      </span>
                    )}
                    {awayStats && (
                      <div className="flex gap-1 text-[8px] font-bold">
                        <span className="text-emerald-500">
                          {awayStats.win}%
                        </span>
                        <span className="text-amber-500">
                          {awayStats.draw}%
                        </span>
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
                <span className="text-[6.5px] font-black text-slate-500 uppercase tracking-widest">
                  Forme {homeName}
                </span>
                <span className="text-[6.5px] font-bold text-slate-600">
                  {getFullForm(homeName).length} matchs
                </span>
              </div>
              <div className="bg-slate-950/30 p-1 rounded-md border border-white/5">
                <ScrollableFormList history={getFullForm(homeName)} size="sm" />
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[6.5px] font-black text-slate-500 uppercase tracking-widest">
                  Forme {awayName}
                </span>
                <span className="text-[6.5px] font-bold text-slate-600">
                  {getFullForm(awayName).length} matchs
                </span>
              </div>
              <div className="bg-slate-950/30 p-1 rounded-md border border-white/5">
                <ScrollableFormList history={getFullForm(awayName)} size="sm" />
              </div>
            </div>
          </div>
          {/* Goal Timeline */}
          {(match.scoreDetails?.homeGoals?.length || 0) +
            (match.scoreDetails?.awayGoals?.length || 0) >
            0 && (
            <div className="flex flex-wrap gap-1 justify-center mb-2 px-1.5 py-1 bg-white/[0.02] border border-white/5 rounded-lg w-full">
              {[
                ...(match.scoreDetails?.homeGoals?.map((g: any) => ({
                  ...g,
                  side: "h",
                })) || []),
                ...(match.scoreDetails?.awayGoals?.map((g: any) => ({
                  ...g,
                  side: "a",
                })) || []),
              ]
                .sort(
                  (a, b) =>
                    parseInt(a.minute || a.time) - parseInt(b.minute || b.time),
                )
                .map((g, gi) => (
                  <div
                    key={gi}
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-[4px] border ${g.side === "h" ? "text-indigo-400 bg-indigo-400/5 border-indigo-400/10" : "text-rose-400 bg-rose-400/5 border-rose-400/10"}`}
                  >
                    <span className="text-[9px] font-black">
                      {g.minute || g.time}'
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Odds Grid */}
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: "1", val: odds1 || "-" },
              { label: "X", val: oddsX || "-" },
              { label: "2", val: odds2 || "-" },
            ].map((o) => (
              <div
                key={o.label}
                className="bg-slate-800/40 rounded p-2 text-center border border-white/5 hover:bg-slate-850/80 transition-all hover:border-slate-700/50"
              >
                <div className="text-[7.5px] text-slate-450 font-bold uppercase mb-0.5">
                  {o.label}
                </div>
                <div className="font-mono font-black text-white text-[12px] sm:text-[13px] leading-none tracking-tight">
                  {o.val}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
              <TrendingUp className="w-2.5 h-2.5" />
              Historique : {activeDetailTab === "home" ? homeName : awayName}
            </h4>
            <span className="text-[7px] font-bold text-slate-500">
              Historique complet
            </span>
          </div>
          {renderDetailedForm(activeDetailTab === "home" ? homeName : awayName)}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveDetailTab("main");
            }}
            className="w-full mt-2 py-1 text-[7px] font-black text-slate-500 hover:text-white uppercase tracking-widest bg-white/5 hover:bg-indigo-600/20 rounded border border-white/5 transition-colors"
          >
            Retour au match
          </button>
        </div>
      )}
    </div>
  );
}

const formatTimeOnly = (dateStr: any) => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

function MatchesView({
  matches,
  rankings,
  results,
  onMatchClick,
  onPlaceBet,
  bet261Account,
}: {
  matches: any[];
  rankings: any[];
  results: any[];
  onMatchClick: (match: any) => void;
  onPlaceBet?: (
    match: any,
    selection: string,
    odds: string,
    stake?: number,
  ) => Promise<void>;
  bet261Account?: any;
}) {
  if (!matches || matches.length === 0)
    return (
      <div className="text-slate-400 text-center py-12 bg-slate-900 rounded-xl border border-slate-800">
        Aucun match disponible.
      </div>
    );

  const getTeamNameLocal = (team: any) => {
    if (!team) return "-";
    if (typeof team === "string") return team;
    return team.name || team.teamName || team.shortName || "Équipe";
  };

  // Pre-calculate full form and recent matches for all teams once of the results
  const resultsCache = React.useMemo(() => {
    const recentMatchesMap: Record<string, any[]> = {};
    const formMap: Record<string, string[]> = {};

    results.forEach((round) => {
      const ms = round.matches || (Array.isArray(round) ? round : []);
      ms.forEach((m: any) => {
        const hN = getTeamNameLocal(m.homeTeam);
        const aN = getTeamNameLocal(m.awayTeam);
        const hN_lower = hN.toLowerCase().trim();
        const aN_lower = aN.toLowerCase().trim();

        let homeRaw = m.homeScore;
        let awayRaw = m.awayScore;
        if (m.score) {
          const sep = m.score.includes(":") ? ":" : "-";
          const parts = m.score.split(sep);
          if (parts.length === 2) {
            homeRaw = parts[0];
            awayRaw = parts[1];
          }
        }

        const hSText =
          homeRaw !== undefined &&
          homeRaw !== null &&
          String(homeRaw).trim() !== "" &&
          String(homeRaw).trim() !== "-";
        const aSText =
          awayRaw !== undefined &&
          awayRaw !== null &&
          String(awayRaw).trim() !== "" &&
          String(awayRaw).trim() !== "-";

        if (hSText && aSText) {
          const hS = parseInt(String(homeRaw));
          const aS = parseInt(String(awayRaw));

          if (!isNaN(hS) && !isNaN(aS)) {
            const processedMatch = {
              ...m,
              homeScore: homeRaw,
              awayScore: awayRaw,
              roundNumber: round.roundNumber || round.round,
            };

            if (!formMap[hN_lower]) formMap[hN_lower] = [];
            formMap[hN_lower].push(hS > aS ? "Won" : hS < aS ? "Lost" : "Draw");

            if (!formMap[aN_lower]) formMap[aN_lower] = [];
            formMap[aN_lower].push(aS > hS ? "Won" : aS < hS ? "Lost" : "Draw");

            if (!recentMatchesMap[hN_lower]) recentMatchesMap[hN_lower] = [];
            recentMatchesMap[hN_lower].push(processedMatch);

            if (!recentMatchesMap[aN_lower]) recentMatchesMap[aN_lower] = [];
            recentMatchesMap[aN_lower].push(processedMatch);
          }
        }
      });
    });

    Object.keys(recentMatchesMap).forEach((key) => {
      recentMatchesMap[key].sort(
        (a, b) => (Number(b.roundNumber) || 0) - (Number(a.roundNumber) || 0),
      );
    });

    return { recentMatchesMap, formMap };
  }, [results]);

  const teamRanks: Record<string, number> = {};
  rankings.forEach((team, index) => {
    const name = team.name || team.teamName;
    if (name) {
      teamRanks[name] = team.position || index + 1;
    }
  });

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1650px]:grid-cols-5">
      {matches.map((match: any, index: number) => (
        <MatchCard
          key={`${match.id}_${index}`}
          match={match}
          rankings={rankings}
          results={results}
          onClick={() => onMatchClick(match)}
          onPlaceBet={onPlaceBet}
          bet261Account={bet261Account}
          resultsCache={resultsCache}
        />
      ))}
    </div>
  );
}

function StandingsView({
  rankings,
  results,
}: {
  rankings: any[];
  results: any[];
}) {
  if (!rankings || rankings.length === 0)
    return (
      <div className="text-slate-400 text-center py-12 bg-slate-900 rounded-xl border border-slate-800">
        Aucun classement disponible.
      </div>
    );

  const getTeamName = (team: any) => {
    if (!team) return "-";
    if (typeof team === "string") return team;
    return team.name || team.teamName || team.shortName || "Équipe";
  };

  const formMap = React.useMemo(() => {
    const map: Record<string, string[]> = {};
    results.forEach((round) => {
      const ms = round.matches || (Array.isArray(round) ? round : []);
      ms.forEach((m: any) => {
        const hN = getTeamName(m.homeTeam).toLowerCase().trim();
        const aN = getTeamName(m.awayTeam).toLowerCase().trim();

        let homeRaw = m.homeScore;
        let awayRaw = m.awayScore;
        if (m.score) {
          const sep = m.score.includes(":") ? ":" : "-";
          const parts = m.score.split(sep);
          if (parts.length === 2) {
            homeRaw = parts[0];
            awayRaw = parts[1];
          }
        }

        const hSText =
          homeRaw !== undefined &&
          homeRaw !== null &&
          String(homeRaw).trim() !== "" &&
          String(homeRaw).trim() !== "-";
        const aSText =
          awayRaw !== undefined &&
          awayRaw !== null &&
          String(awayRaw).trim() !== "" &&
          String(awayRaw).trim() !== "-";

        if (hSText && aSText) {
          const hS = parseInt(String(homeRaw));
          const aS = parseInt(String(awayRaw));
          if (!isNaN(hS) && !isNaN(aS)) {
            if (!map[hN]) map[hN] = [];
            map[hN].push(hS > aS ? "Won" : hS < aS ? "Lost" : "Draw");

            if (!map[aN]) map[aN] = [];
            map[aN].push(aS > hS ? "Won" : aS < hS ? "Lost" : "Draw");
          }
        }
      });
    });
    return map;
  }, [results]);

  const getFullForm = (teamName: string) => {
    return formMap[teamName.toLowerCase().trim()] || [];
  };

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 shadow-sm overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-[9px] text-left whitespace-nowrap">
          <thead className="text-[7.5px] text-slate-400 uppercase bg-slate-800/50 border-b border-slate-800">
            <tr>
              <th className="px-2 py-1.5 font-black tracking-widest text-center w-6">
                #
              </th>
              <th className="px-2 py-1.5 font-black tracking-widest">Équipe</th>
              <th className="px-1.5 py-1.5 font-black tracking-widest text-center">
                MJ
              </th>
              <th className="px-1.5 py-1.5 font-black tracking-widest text-center">
                V
              </th>
              <th className="px-1.5 py-1.5 font-black tracking-widest text-center border-r border-slate-800/50">
                V%
              </th>
              <th className="px-1.5 py-1.5 font-black tracking-widest text-center">
                N
              </th>
              <th className="px-1.5 py-1.5 font-black tracking-widest text-center border-r border-slate-800/50">
                N%
              </th>
              <th className="px-1.5 py-1.5 font-black tracking-widest text-center">
                D
              </th>
              <th className="px-1.5 py-1.5 font-black tracking-widest text-center">
                D%
              </th>
              <th className="px-2 py-1.5 font-black tracking-widest text-center text-slate-100">
                PTS
              </th>
              <th className="px-2 py-1.5 font-black tracking-widest text-center">
                Forme
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rankings.map((team: any, index: number) => {
              const playedValue =
                (team.won || 0) + (team.draw || 0) + (team.lost || 0);
              const played =
                typeof playedValue === "object" ? 0 : Number(playedValue);
              const rank = team.position || index + 1;
              const winPct =
                played > 0 ? Math.round((team.won / played) * 100) : 0;
              const drawPct =
                played > 0 ? Math.round((team.draw / played) * 100) : 0;
              const lossPct =
                played > 0 ? Math.round((team.lost / played) * 100) : 0;

              return (
                <tr
                  key={team.id || index}
                  className="hover:bg-slate-800/30 transition-colors group"
                >
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[7px] font-black ${
                        rank <= 4
                          ? "bg-indigo-600/20 text-indigo-400 border border-indigo-600/30"
                          : rank <= 6
                            ? "bg-slate-800 text-slate-300"
                            : rank >= rankings.length - 2
                              ? "bg-rose-900/20 text-rose-500"
                              : "text-slate-400"
                      }`}
                    >
                      {typeof rank === "object" ? JSON.stringify(rank) : rank}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-black text-slate-100 uppercase tracking-tighter">
                    <div className="flex items-center gap-2">
                      <img
                        src={getTeamLogo(
                          typeof (team.name || team.teamName) === "string"
                            ? team.name || team.teamName
                            : "Team",
                        )}
                        alt=""
                        className="w-4 h-4 object-contain shrink-0"
                        onError={(e) =>
                          (e.currentTarget.style.display = "none")
                        }
                      />
                      <span>
                        {typeof (team.name || team.teamName) === "string"
                          ? team.name || team.teamName
                          : JSON.stringify(
                              team.name || team.teamName || "Unknown",
                            )}
                      </span>
                    </div>
                  </td>
                  <td className="px-1.5 py-1.5 text-center text-slate-500 font-bold">
                    {played}
                  </td>
                  <td className="px-1.5 py-1.5 text-center text-slate-500 font-bold">
                    {typeof team.won === "object"
                      ? JSON.stringify(team.won)
                      : team.won || 0}
                  </td>
                  <td className="px-1.5 py-1.5 text-center text-emerald-500 font-black border-r border-slate-800/50 bg-emerald-500/5">
                    {winPct}%
                  </td>
                  <td className="px-1.5 py-1.5 text-center text-slate-500 font-bold">
                    {typeof team.draw === "object"
                      ? JSON.stringify(team.draw)
                      : team.draw || 0}
                  </td>
                  <td className="px-1.5 py-1.5 text-center text-amber-500 font-black border-r border-slate-800/50 bg-amber-500/5">
                    {drawPct}%
                  </td>
                  <td className="px-1.5 py-1.5 text-center text-slate-500 font-bold">
                    {typeof team.lost === "object"
                      ? JSON.stringify(team.lost)
                      : team.lost || 0}
                  </td>
                  <td className="px-1.5 py-1.5 text-center text-rose-500 font-black bg-rose-500/5">
                    {lossPct}%
                  </td>
                  <td className="px-2 py-1.5 text-center font-black text-slate-100">
                    {typeof team.points === "object"
                      ? JSON.stringify(team.points)
                      : team.points || 0}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="max-w-[150px] mx-auto">
                      <ScrollableFormList
                        history={getFullForm(team.name || team.teamName)}
                        size="xs"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultsView({
  results,
  rankings,
  leagueId,
}: {
  results: any[];
  rankings: any[];
  leagueId?: number;
}) {
  const [selectedHistoricalMatrix, setSelectedHistoricalMatrix] = useState<
    any | null
  >(null);
  const [historicalRounds, setHistoricalRounds] = useState<any[] | null>(null);

  useEffect(() => {
    if (!selectedHistoricalMatrix) {
      setHistoricalRounds(null);
      return;
    }

    const loadHistoricalMatches = async () => {
      try {
        const { getLocalMatchesBySeason } =
          await import("./services/localArchive");
        const matchesList = await getLocalMatchesBySeason(
          selectedHistoricalMatrix.leagueId || Number(leagueId),
          selectedHistoricalMatrix.season,
        );

        // Group matchesList by round
        const roundsMap: Record<number, any[]> = {};
        matchesList.forEach((m: any) => {
          const rNum = Number(m.round) || 1;
          if (!roundsMap[rNum]) {
            roundsMap[rNum] = [];
          }
          roundsMap[rNum].push(m);
        });

        const sortedRounds = Object.keys(roundsMap)
          .map(Number)
          .sort((a, b) => a - b)
          .map((rNum) => ({
            roundNumber: rNum,
            round: rNum,
            matches: roundsMap[rNum],
          }));

        setHistoricalRounds(sortedRounds);
      } catch (e) {
        console.error("Failed to load historical matches:", e);
      }
    };

    loadHistoricalMatches();
  }, [selectedHistoricalMatrix, leagueId]);

  const activeResults =
    selectedHistoricalMatrix && historicalRounds ? historicalRounds : results;

  const activeRankings = React.useMemo(() => {
    if (selectedHistoricalMatrix && selectedHistoricalMatrix.teamForms) {
      return selectedHistoricalMatrix.teamForms
        .map((tf: any) => ({
          name: tf.teamName,
          teamName: tf.teamName,
          position: tf.rank,
          points: tf.points,
        }))
        .sort((a: any, b: any) => a.position - b.position);
    }
    return rankings;
  }, [selectedHistoricalMatrix, rankings]);

  if (!results || results.length === 0)
    return (
      <div className="text-slate-400 text-center py-12 bg-slate-900 rounded-xl border border-slate-800">
        Aucun résultat récent disponible.
      </div>
    );

  const [dbBackupInfo, setDbBackupInfo] = useState<{
    savedAt: string;
    roundSaved: number;
  } | null>(null);

  useEffect(() => {
    const checkBackupInDb = async () => {
      if (!leagueId || results.length === 0) return;
      try {
        const firstM =
          results[0]?.matches?.[0] || results[0]?.[0] || results[0];
        const activeSeason = firstM?.seasonId || firstM?.season || "Saison";
        const { getAnalysisMatrixBySeason } =
          await import("./services/localArchive");
        const matrixObj = await getAnalysisMatrixBySeason(
          leagueId,
          String(activeSeason),
        );
        if (matrixObj) {
          setDbBackupInfo({
            savedAt: matrixObj.savedAt,
            roundSaved: matrixObj.roundSaved,
          });
        } else {
          setDbBackupInfo(null);
        }
      } catch (err) {
        console.warn("Error checking backup matrix in DB:", err);
      }
    };

    checkBackupInDb();

    // Listen to the custom event in case of auto-saves during the active session
    const handleAutoSave = () => {
      checkBackupInDb();
    };
    window.addEventListener("matrices_auto_saved", handleAutoSave);
    window.addEventListener("archives_cleared", handleAutoSave);

    return () => {
      window.removeEventListener("matrices_auto_saved", handleAutoSave);
      window.removeEventListener("archives_cleared", handleAutoSave);
    };
  }, [leagueId, results]);

  const [subTab, setSubTab] = useState<
    "all-forms" | "round" | "dynamic" | "ar" | "repetitions"
  >("all-forms");
  const [repetitionK, setRepetitionK] = useState<number>(3);
  const [repetitionLeagueMode, setRepetitionLeagueMode] = useState<
    "all" | "same"
  >("all");
  const [selectedScanTeam, setSelectedScanTeam] = useState<string | null>(null);
  const [allFormsDisplay, setAllFormsDisplay] = useState<"stacked" | "cards">(
    "stacked",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<
    "rank" | "win" | "draw" | "streak" | "length"
  >("rank");
  const [activeTrackTeam, setActiveTrackTeam] = useState<string | null>(null);
  const [activeH2HTeam, setActiveH2HTeam] = useState<string | null>(null);
  const [selectedH2HDuo, setSelectedH2HDuo] = useState<{
    teamA: string;
    teamB: string;
  } | null>(null);

  useEffect(() => {
    if (activeRankings.length > 0 && !activeH2HTeam) {
      const firstTeamName =
        activeRankings[0]?.name || activeRankings[0]?.teamName;
      if (firstTeamName) {
        setActiveH2HTeam(firstTeamName);
      }
    }
  }, [activeRankings, activeH2HTeam]);

  const [savedMatrices, setSavedMatrices] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [seasonSearchQuery, setSeasonSearchQuery] = useState("");

  // States and effects for the stored A/R matrix interactive viewer window
  const [arViewMatrix, setArViewMatrix] = useState<any | null>(null);
  const [arViewMatches, setArViewMatches] = useState<any[]>([]);
  const [arViewLoading, setArViewLoading] = useState<boolean>(false);
  const [arFocusTeam, setArFocusTeam] = useState<string | null>(null);
  const [arFocusDuo, setArFocusDuo] = useState<{
    teamA: string;
    teamB: string;
  } | null>(null);

  useEffect(() => {
    if (!arViewMatrix) {
      setArViewMatches([]);
      setArFocusTeam(null);
      setArFocusDuo(null);
      return;
    }

    const loadMatchesForARView = async () => {
      setArViewLoading(true);
      try {
        const { getLocalMatchesBySeason, saveAnalysisMatrix } =
          await import("./services/localArchive");

        // 1. First, try to load directly from the embedded matches list in the matrix object itself
        let matchesList = arViewMatrix.archivedMatches || [];

        // 2. Fall back to IndexedDB local matches database if embedded list is empty
        if (matchesList.length === 0) {
          matchesList = await getLocalMatchesBySeason(
            arViewMatrix.leagueId || Number(leagueId),
            arViewMatrix.season,
          );
        }

        // 3. Robust Self-Healing Retroactive Support:
        // If DB matches list is still empty, and we have active matches/results in UI memory,
        // we populate from the UI active memory automatically.
        if (matchesList.length === 0 && results && results.length > 0) {
          // Detect active season from results
          let activeSeason = "";
          results.forEach((round: any) => {
            if (activeSeason) return;
            const ms = round.matches || (Array.isArray(round) ? round : []);
            const firstWithSeason = ms.find((m: any) => m && m.season);
            if (firstWithSeason) {
              activeSeason = firstWithSeason.season;
            }
          });
          if (!activeSeason) {
            activeSeason = getDailySeason(Date.now());
          }

          const activeLeagueId = Number(leagueId);

          // Normalize season names to handle dashboard string representations perfectly (e.g. 2025/2026 vs 2025_2026)
          const normArSeason = arViewMatrix.season
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase();
          const normActiveSeason = activeSeason
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase();

          if (
            Number(arViewMatrix.leagueId) === activeLeagueId &&
            normArSeason === normActiveSeason
          ) {
            console.log(
              "[A/R Matrix View] Applying retroactive self-healing score restoration from active memory results",
            );

            const flatMatches: any[] = [];
            results.forEach((round: any) => {
              const ms = round.matches || (Array.isArray(round) ? round : []);
              ms.forEach((m: any) => {
                flatMatches.push(m);
              });
            });

            const archivedMatches = flatMatches.map((m: any) => {
              let scoreStr = m.score;
              if (!scoreStr && m.homeScore != null && m.awayScore != null) {
                scoreStr = `${m.homeScore}-${m.awayScore}`;
              }
              const separator = scoreStr?.includes(":") ? ":" : "-";
              const [hS, aS] = (scoreStr || "-").split(separator);

              const hName = getTeamName(m.homeTeam);
              const aName = getTeamName(m.awayTeam);

              return {
                leagueId: activeLeagueId,
                season: activeSeason,
                round: Number(m.roundNumber || m.round) || 0,
                homeTeam: hName,
                awayTeam: aName,
                homeScore: hS || m.homeScore || "",
                awayScore: aS || m.awayScore || "",
                status: m.status || "Finished",
                expectedStart:
                  m.expectedStart || m.updatedAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
            });

            if (archivedMatches.length > 0) {
              // Save to local matches index is CLOSED (Only extraction menu is allowed to write to database)
              matchesList = archivedMatches;

              // Permanently heal the stored matrix itself in the database by embeding the matches in it!
              try {
                const updatedMatrix = {
                  ...arViewMatrix,
                  archivedMatches: archivedMatches,
                };
                await saveAnalysisMatrix(updatedMatrix);
                console.log(
                  "[A/R Matrix View] Permanent Self-Healing Success: Stored matrix updated with embedded matches data.",
                );
              } catch (saveErr) {
                console.warn(
                  "[A/R Matrix View] Could not permanently write back embedded matches:",
                  saveErr,
                );
              }
            }
          }
        }

        setArViewMatches(matchesList);

        const archivedTeams = arViewMatrix.teamForms || [];
        if (archivedTeams.length > 0) {
          setArFocusTeam(archivedTeams[0].teamName);
        }
      } catch (err) {
        console.error("Failed to load matches for A/R Matrix View:", err);
      } finally {
        setArViewLoading(false);
      }
    };

    loadMatchesForARView();
  }, [arViewMatrix, leagueId, results]);

  const archivedRankings = React.useMemo(() => {
    if (!arViewMatrix || !arViewMatrix.teamForms) return [];
    return [...arViewMatrix.teamForms]
      .map((tf: any) => ({
        name: tf.teamName,
        teamName: tf.teamName,
        rank: tf.rank,
        points: tf.points,
      }))
      .sort((a: any, b: any) => a.rank - b.rank);
  }, [arViewMatrix]);

  const archivedConfrontationMap = React.useMemo(() => {
    const map = new Map<string, any>();
    arViewMatches.forEach((m: any) => {
      const homeName = getTeamName(m.homeTeam).toLowerCase().trim();
      const awayName = getTeamName(m.awayTeam).toLowerCase().trim();
      map.set(`${homeName}_vs_${awayName}`, m);
    });
    return map;
  }, [arViewMatches]);

  const findArchivedConfrontation = (homeName: string, awayName: string) => {
    const normHome = homeName.toLowerCase().trim();
    const normAway = awayName.toLowerCase().trim();
    return archivedConfrontationMap.get(`${normHome}_vs_${normAway}`) || null;
  };

  const loadAllSavedMatrices = async () => {
    try {
      const { db } = await import("./services/localArchive");
      const list = await db.matrices.toArray();
      list.sort(
        (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
      );

      // Filter list to only keep matrices for the current active league!
      // This prevents multi-league background computation and eliminates browser lag.
      const filteredList = list.filter(
        (m: any) => !m.leagueId || Number(m.leagueId) === Number(leagueId),
      );
      setSavedMatrices(filteredList);
    } catch (err) {
      console.error("Error loading saved matrices:", err);
    }
  };

  const deleteSavedMatrix = async (matrixId: string) => {
    try {
      const { db } = await import("./services/localArchive");
      await db.matrices.delete(matrixId);
      if (selectedHistoricalMatrix?.id === matrixId) {
        setSelectedHistoricalMatrix(null);
      }
      await loadAllSavedMatrices();
      window.dispatchEvent(new CustomEvent("matrices_auto_saved"));
    } catch (err) {
      console.error("Error deleting saved matrix:", err);
    }
  };

  useEffect(() => {
    loadAllSavedMatrices();

    const handleAutoSavedUpdate = () => {
      loadAllSavedMatrices();
    };

    window.addEventListener("matrices_auto_saved", handleAutoSavedUpdate);
    window.addEventListener("archives_cleared", handleAutoSavedUpdate);

    return () => {
      window.removeEventListener("matrices_auto_saved", handleAutoSavedUpdate);
      window.removeEventListener("archives_cleared", handleAutoSavedUpdate);
    };
  }, [leagueId]);

  const stackedContainerRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async () => {
    const node = stackedContainerRef.current;
    if (!node) return;
    setIsExporting(true);

    // Save current styling of the main node & scroll elements
    const originalStyle = node.getAttribute("style") || "";

    // Find scrollable elements
    const scrollableDivs = Array.from(
      node.querySelectorAll(".overflow-x-auto"),
    ) as HTMLDivElement[];
    const originalScrollStyles = scrollableDivs.map(
      (el) => el.getAttribute("style") || "",
    );

    try {
      // Find the maximum scroll content width
      let maxScrollWidth = node.scrollWidth;
      scrollableDivs.forEach((div) => {
        if (div.scrollWidth > maxScrollWidth) {
          maxScrollWidth = div.scrollWidth;
        }
      });

      // Temporarily expand the main node and its scroll containers to fit everything
      node.style.width = `${maxScrollWidth + 64}px`;
      node.style.maxWidth = "none";
      node.style.height = "auto";
      node.style.overflow = "visible";
      node.style.backgroundColor = "#0b111e";

      scrollableDivs.forEach((div) => {
        div.style.overflow = "visible";
        div.style.width = "100%";
        div.style.maxWidth = "none";
      });

      // Give a tiny timeout for DOM layout reflow
      await new Promise((resolve) => setTimeout(resolve, 150));

      const dataUrl = await toPng(node, {
        backgroundColor: "#0b111e",
        pixelRatio: 1.2,
        skipFonts: true,
        cacheBust: true,
        style: {
          padding: "32px",
          borderRadius: "16px",
          width: `${maxScrollWidth + 64}px`,
          height: "auto",
          overflow: "visible",
          backgroundColor: "#0b111e",
        },
      });

      // Restore original styling instantly
      if (originalStyle) {
        node.setAttribute("style", originalStyle);
      } else {
        node.removeAttribute("style");
      }

      scrollableDivs.forEach((div, i) => {
        if (originalScrollStyles[i]) {
          div.setAttribute("style", originalScrollStyles[i]);
        } else {
          div.removeAttribute("style");
        }
      });

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: "a4",
      });

      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = doc.internal.pageSize.getHeight();

      const img = new Image();
      img.onerror = () => {
        setIsExporting(false);
        alert(
          "Erreur lors de la capture d'image pour le PDF. Veuillez réessayer.",
        );
      };
      img.onload = () => {
        const totalWidth = img.width;
        const totalHeight = img.height;

        // Match the printable width (20px margins on left/right)
        const scale = (pdfWidth - 40) / totalWidth;

        // Printable page height in PDF coordinate pixels
        const printablePageHeight = pdfHeight - 40;

        // Maximum height of each section on the source canvas/image to fit onto one PDF page
        const sourceChunkHeight = printablePageHeight / scale;

        // Determine how many pages to render (Max 5)
        const numPages = Math.min(
          5,
          Math.ceil(totalHeight / sourceChunkHeight),
        );

        for (let i = 0; i < numPages; i++) {
          if (i > 0) {
            doc.addPage([pdfWidth, pdfHeight], "landscape");
          }

          // Render dark background on the PDF page
          doc.setFillColor(11, 17, 30);
          doc.rect(0, 0, pdfWidth, pdfHeight, "F");

          // Determine slice boundaries for current page
          const chunkStartY = i * sourceChunkHeight;
          const currentChunkHeight = Math.min(
            sourceChunkHeight,
            totalHeight - chunkStartY,
          );

          // Create temporary offscren canvas slicing
          const canvasChunk = document.createElement("canvas");
          canvasChunk.width = totalWidth;
          canvasChunk.height = currentChunkHeight;
          const ctxChunk = canvasChunk.getContext("2d");

          if (ctxChunk) {
            // Fill background with #0b111e
            ctxChunk.fillStyle = "#0b111e";
            ctxChunk.fillRect(0, 0, totalWidth, currentChunkHeight);

            // Draw portion of source image onto chunk canvas
            ctxChunk.drawImage(
              img,
              0,
              chunkStartY,
              totalWidth,
              currentChunkHeight,
              0,
              0,
              totalWidth,
              currentChunkHeight,
            );

            const chunkDataUrl = canvasChunk.toDataURL("image/png", 1.0);

            // Calculate destination size keeping accurate aspect ratio
            const destWidth = pdfWidth - 40;
            const destHeight = currentChunkHeight * scale;
            const destX = 20;
            const destY = 20;

            doc.addImage(
              chunkDataUrl,
              "PNG",
              destX,
              destY,
              destWidth,
              destHeight,
              undefined,
              "FAST",
            );
          }
        }

        doc.save(
          `matrice-formes-equipes-${new Date().toISOString().slice(0, 10)}.pdf`,
        );
        setIsExporting(false);
      };
      img.src = dataUrl;
    } catch (err) {
      console.error("Erreur exportation PDF:", err);
      // Restore styles in case of failure
      if (originalStyle) {
        node.setAttribute("style", originalStyle);
      } else {
        node.removeAttribute("style");
      }
      scrollableDivs.forEach((div, i) => {
        if (originalScrollStyles[i]) {
          div.setAttribute("style", originalScrollStyles[i]);
        } else {
          div.removeAttribute("style");
        }
      });
      setIsExporting(false);
      alert(
        "Erreur lors de la capture d'image pour le PDF. Veuillez réessayer.",
      );
    }
  };

  const arContainerRef = useRef<HTMLDivElement | null>(null);
  const [isExportingAR, setIsExportingAR] = useState(false);

  const handleExportARPDF = async () => {
    const node = arContainerRef.current;
    if (!node) return;
    setIsExportingAR(true);

    const originalStyle = node.getAttribute("style") || "";
    const scrollableDivs = Array.from(
      node.querySelectorAll(".overflow-x-auto"),
    ) as HTMLDivElement[];
    const originalScrollStyles = scrollableDivs.map(
      (el) => el.getAttribute("style") || "",
    );

    try {
      let maxScrollWidth = node.scrollWidth;
      scrollableDivs.forEach((div) => {
        if (div.scrollWidth > maxScrollWidth) {
          maxScrollWidth = div.scrollWidth;
        }
      });

      node.style.width = `${maxScrollWidth + 64}px`;
      node.style.maxWidth = "none";
      node.style.height = "auto";
      node.style.overflow = "visible";
      node.style.backgroundColor = "#0b111e";

      scrollableDivs.forEach((div) => {
        div.style.overflow = "visible";
        div.style.width = "100%";
        div.style.maxWidth = "none";
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      const dataUrl = await toPng(node, {
        backgroundColor: "#0b111e",
        pixelRatio: 1.2,
        skipFonts: true,
        cacheBust: true,
        style: {
          padding: "32px",
          borderRadius: "16px",
          width: `${maxScrollWidth + 64}px`,
          height: "auto",
          overflow: "visible",
          backgroundColor: "#0b111e",
        },
      });

      if (originalStyle) {
        node.setAttribute("style", originalStyle);
      } else {
        node.removeAttribute("style");
      }

      scrollableDivs.forEach((div, i) => {
        if (originalScrollStyles[i]) {
          div.setAttribute("style", originalScrollStyles[i]);
        } else {
          div.removeAttribute("style");
        }
      });

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: "a4",
      });

      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = doc.internal.pageSize.getHeight();

      const img = new Image();
      img.onerror = () => {
        setIsExportingAR(false);
        alert(
          "Erreur lors du traitement de l'image de la matrice croisée. Veuillez réessayer.",
        );
      };
      img.onload = () => {
        const totalWidth = img.width;
        const totalHeight = img.height;
        const scale = (pdfWidth - 40) / totalWidth;
        const printablePageHeight = pdfHeight - 40;
        const sourceChunkHeight = printablePageHeight / scale;
        const numPages = Math.min(
          5,
          Math.ceil(totalHeight / sourceChunkHeight),
        );

        for (let i = 0; i < numPages; i++) {
          if (i > 0) {
            doc.addPage([pdfWidth, pdfHeight], "landscape");
          }

          doc.setFillColor(11, 17, 30);
          doc.rect(0, 0, pdfWidth, pdfHeight, "F");

          const chunkStartY = i * sourceChunkHeight;
          const currentChunkHeight = Math.min(
            sourceChunkHeight,
            totalHeight - chunkStartY,
          );

          const canvasChunk = document.createElement("canvas");
          canvasChunk.width = totalWidth;
          canvasChunk.height = currentChunkHeight;
          const ctxChunk = canvasChunk.getContext("2d");

          if (ctxChunk) {
            ctxChunk.fillStyle = "#0b111e";
            ctxChunk.fillRect(0, 0, totalWidth, currentChunkHeight);
            ctxChunk.drawImage(
              img,
              0,
              chunkStartY,
              totalWidth,
              currentChunkHeight,
              0,
              0,
              totalWidth,
              currentChunkHeight,
            );

            const chunkDataUrl = canvasChunk.toDataURL("image/png", 1.0);
            const destWidth = pdfWidth - 40;
            const destHeight = currentChunkHeight * scale;
            const destX = 20;
            const destY = 20;

            doc.addImage(
              chunkDataUrl,
              "PNG",
              destX,
              destY,
              destWidth,
              destHeight,
              undefined,
              "FAST",
            );
          }
        }

        doc.save(
          `matrice-aller-retour-${new Date().toISOString().slice(0, 10)}.pdf`,
        );
        setIsExportingAR(false);
      };
      img.src = dataUrl;
    } catch (err) {
      console.error("Erreur exportation PDF Aller/Retour:", err);
      if (originalStyle) {
        node.setAttribute("style", originalStyle);
      } else {
        node.removeAttribute("style");
      }
      scrollableDivs.forEach((div, i) => {
        if (originalScrollStyles[i]) {
          div.setAttribute("style", originalScrollStyles[i]);
        } else {
          div.removeAttribute("style");
        }
      });
      setIsExportingAR(false);
      alert(
        "Erreur lors de la capture d'image pour le PDF. Veuillez réessayer.",
      );
    }
  };

  // Pre-computed lookup map for quick O(1) confrontation checks
  const confrontationMap = React.useMemo(() => {
    const map = new Map<string, any>();
    activeResults.forEach((round) => {
      const ms = round.matches || (Array.isArray(round) ? round : []);
      ms.forEach((m: any) => {
        const homeName = getTeamName(m.homeTeam).toLowerCase().trim();
        const awayName = getTeamName(m.awayTeam).toLowerCase().trim();
        map.set(`${homeName}_vs_${awayName}`, m);
      });
    });
    return map;
  }, [activeResults]);

  const findConfrontation = (homeName: string, awayName: string) => {
    const normHome = homeName.toLowerCase().trim();
    const normAway = awayName.toLowerCase().trim();
    return confrontationMap.get(`${normHome}_vs_${normAway}`) || null;
  };

  // Pre-computed lookup map for quick O(1) team forms
  const teamFormsMap = React.useMemo(() => {
    const map = new Map<string, string[]>();
    activeResults.forEach((round) => {
      const ms = round.matches || (Array.isArray(round) ? round : []);
      ms.forEach((m: any) => {
        const homeName = getTeamName(m.homeTeam);
        const awayName = getTeamName(m.awayTeam);
        if (!homeName || !awayName) return;
        const hN = homeName.toLowerCase().trim();
        const aN = awayName.toLowerCase().trim();

        let homeRaw = m.homeScore;
        let awayRaw = m.awayScore;
        if (m.score) {
          const sep = m.score.includes(":") ? ":" : "-";
          const parts = m.score.split(sep);
          if (parts.length === 2) {
            homeRaw = parts[0];
            awayRaw = parts[1];
          }
        }
        if (
          homeRaw === undefined ||
          homeRaw === null ||
          homeRaw === "" ||
          awayRaw === undefined ||
          awayRaw === null ||
          awayRaw === ""
        )
          return;
        const hS = parseInt(String(homeRaw));
        const aS = parseInt(String(awayRaw));
        if (isNaN(hS) || isNaN(aS)) return;

        // Push result for home team
        if (!map.has(hN)) map.set(hN, []);
        map.get(hN)!.push(hS > aS ? "Won" : hS < aS ? "Lost" : "Draw");

        // Push result for away team
        if (!map.has(aN)) map.set(aN, []);
        map.get(aN)!.push(aS > hS ? "Won" : aS < hS ? "Lost" : "Draw");
      });
    });
    return map;
  }, [activeResults]);

  const getFullForm = React.useCallback(
    (teamName: string) => {
      const normalizedTarget = teamName.toLowerCase().trim();
      return teamFormsMap.get(normalizedTarget) || [];
    },
    [teamFormsMap],
  );

  const getOutcome = (hS: number, aS: number, side: "h" | "a") => {
    if (isNaN(hS) || isNaN(aS)) return null;
    if (hS === aS) return "N";
    if (side === "h") return hS > aS ? "V" : "D";
    return aS > hS ? "V" : "D";
  };

  const getStreakInfo = (history: string[]) => {
    if (!history || history.length === 0)
      return {
        type: "None",
        label: "Aucune",
        count: 0,
        color: "text-slate-400 bg-slate-400/10",
      };
    const first = history[0];
    let count = 0;
    for (let i = 0; i < history.length; i++) {
      if (history[i] === first) {
        count++;
      } else {
        break;
      }
    }
    const label =
      first === "Won" ? "Victoire" : first === "Lost" ? "Défaite" : "Nul";
    const color =
      first === "Won"
        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
        : first === "Lost"
          ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
          : "text-slate-400 bg-white/5 border-white/10";
    return { type: first, label, count, color };
  };

  const rankHistoryData = React.useMemo(() => {
    if (selectedHistoricalMatrix) {
      return {
        rankTimeline: selectedHistoricalMatrix.rankTimeline,
        normalizedToOriginal: selectedHistoricalMatrix.normalizedToOriginal,
      };
    }
    const allTeamNames = activeRankings.map((t: any) => getTeamName(t));
    if (allTeamNames.length === 0)
      return { rankTimeline: {}, normalizedToOriginal: {} };

    // Use lowercase trimmed key for stats calculation to be typo-resilient
    const statsMap: Record<
      string,
      {
        name: string;
        points: number;
        gd: number;
        gf: number;
        played: number;
      }
    > = {};

    allTeamNames.forEach((teamName: string) => {
      const normalized = teamName.toLowerCase().trim();
      statsMap[normalized] = {
        name: teamName,
        points: 0,
        gd: 0,
        gf: 0,
        played: 0,
      };
    });

    // Record rankings rankTimeline: Record<normalizedName, number[]>
    const rankTimeline: Record<string, number[]> = {};
    const normalizedToOriginal: Record<string, string> = {};
    allTeamNames.forEach((teamName: string) => {
      const normalized = teamName.toLowerCase().trim();
      rankTimeline[normalized] = [];
      normalizedToOriginal[normalized] = teamName;
    });

    // Loop chronologically through each round/journée
    activeResults.forEach((round, roundIndex) => {
      const matches = round.matches || (Array.isArray(round) ? round : []);

      matches.forEach((m: any) => {
        const homeName = getTeamName(m.homeTeam);
        const awayName = getTeamName(m.awayTeam);
        const hN = homeName.toLowerCase().trim();
        const aN = awayName.toLowerCase().trim();

        // Ensure stats exists
        if (!statsMap[hN]) {
          statsMap[hN] = { name: homeName, points: 0, gd: 0, gf: 0, played: 0 };
          rankTimeline[hN] = [];
          normalizedToOriginal[hN] = homeName;
        }
        if (!statsMap[aN]) {
          statsMap[aN] = { name: awayName, points: 0, gd: 0, gf: 0, played: 0 };
          rankTimeline[aN] = [];
          normalizedToOriginal[aN] = awayName;
        }

        let homeRaw = m.homeScore;
        let awayRaw = m.awayScore;
        if (m.score) {
          const sep = m.score.includes(":") ? ":" : "-";
          const parts = m.score.split(sep);
          if (parts.length === 2) {
            homeRaw = parts[0];
            awayRaw = parts[1];
          }
        }

        if (
          homeRaw !== undefined &&
          homeRaw !== null &&
          homeRaw !== "" &&
          awayRaw !== undefined &&
          awayRaw !== null &&
          awayRaw !== ""
        ) {
          const hS = parseInt(String(homeRaw));
          const aS = parseInt(String(awayRaw));
          if (!isNaN(hS) && !isNaN(aS)) {
            statsMap[hN].played += 1;
            statsMap[aN].played += 1;

            statsMap[hN].gf += hS;
            statsMap[hN].gd += hS - aS;

            statsMap[aN].gf += aS;
            statsMap[aN].gd += aS - hS;

            if (hS > aS) {
              statsMap[hN].points += 3;
            } else if (hS < aS) {
              statsMap[aN].points += 3;
            } else {
              statsMap[hN].points += 1;
              statsMap[aN].points += 1;
            }
          }
        }
      });

      // Calculate the standings for this round
      const roundStandings = Object.keys(statsMap).map((normKey) => ({
        normKey,
        ...statsMap[normKey],
      }));

      // Sort according to soccer standard rules
      roundStandings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.name.localeCompare(b.name);
      });

      // Assign position (1-based index)
      roundStandings.forEach((entry, idxInStandings) => {
        if (rankTimeline[entry.normKey]) {
          rankTimeline[entry.normKey].push(idxInStandings + 1);
        }
      });

      // Ensure that any team that didn't play is tracked as same rank as previous or default
      Object.keys(statsMap).forEach((normKey) => {
        if (rankTimeline[normKey].length < roundIndex + 1) {
          const prevArr = rankTimeline[normKey];
          const lastRank =
            prevArr.length > 0
              ? prevArr[prevArr.length - 1]
              : Object.keys(statsMap).length;
          prevArr.push(lastRank);
        }
      });
    });

    return { rankTimeline, normalizedToOriginal };
  }, [selectedHistoricalMatrix, activeRankings, activeResults]);

  const getTeamRankHistory = () => {
    return rankHistoryData;
  };

  // Prepare full team dataset for rendering inside the At-a-Glance tab
  const teamListData = React.useMemo(() => {
    return selectedHistoricalMatrix
      ? selectedHistoricalMatrix.teamForms.map((tf: any) => {
          const history = tf.history || [];
          const played = history.length;
          const wins = history.filter((h: any) => h === "Won").length;
          const draws = history.filter((h: any) => h === "Draw").length;
          const winPct = played > 0 ? Math.round((wins / played) * 100) : 0;
          const drawPct = played > 0 ? Math.round((draws / played) * 100) : 0;
          const streak = getStreakInfo(history);

          return {
            team: { name: tf.teamName, position: tf.rank, points: tf.points },
            teamName: tf.teamName,
            history,
            played,
            winPct,
            drawPct,
            streak,
            rank: tf.rank,
            points: tf.points,
          };
        })
      : activeRankings.map((team: any, index: number) => {
          const teamName = team.name || team.teamName;
          const history = getFullForm(teamName);
          const playedValue =
            (team.won || 0) + (team.draw || 0) + (team.lost || 0);
          const played =
            typeof playedValue === "object" ? 0 : Number(playedValue);
          const winPct = played > 0 ? Math.round((team.won / played) * 100) : 0;
          const drawPct =
            played > 0 ? Math.round((team.draw / played) * 100) : 0;
          const streak = getStreakInfo(history);

          return {
            team,
            teamName,
            history,
            played,
            winPct,
            drawPct,
            streak,
            rank: team.position || index + 1,
            points: team.points || 0,
          };
        });
  }, [selectedHistoricalMatrix, activeRankings, activeResults]);

  const computedRepetitions = React.useMemo(() => {
    if (
      !teamListData ||
      teamListData.length === 0 ||
      !savedMatrices ||
      savedMatrices.length === 0
    ) {
      return [];
    }

    const filteredSavedMatrices =
      repetitionLeagueMode === "same" && leagueId
        ? savedMatrices.filter(
            (m: any) =>
              m.leagueId === leagueId ||
              String(m.leagueId) === String(leagueId),
          )
        : savedMatrices;

    return teamListData
      .map((currentTeam: any) => {
        const name = currentTeam.teamName;
        const currentHist = currentTeam.history || [];
        const seq = currentHist.slice(-repetitionK);

        if (seq.length === 0) {
          return {
            teamName: name,
            currentSequence: [],
            matches: [],
            stats: null,
          };
        }

        const matches: any[] = [];
        let winCount = 0;
        let drawCount = 0;
        let lostCount = 0;
        let totalWithNext = 0;

        filteredSavedMatrices.forEach((matrix: any) => {
          const archivedTeams = matrix.teamForms || [];
          archivedTeams.forEach((at: any) => {
            const atHist = at.history || [];
            const seqLen = seq.length;

            for (let i = 0; i <= atHist.length - seqLen; i++) {
              let isMatch = true;
              for (let j = 0; j < seqLen; j++) {
                if (atHist[i + j] !== seq[j]) {
                  isMatch = false;
                  break;
                }
              }

              if (isMatch) {
                const nextResult = atHist[i + seqLen] || null;

                // Only push to details matches if within a safe size (100) to avoid memory bloat and frame drop
                if (matches.length < 100) {
                  matches.push({
                    matrixId: matrix.id,
                    leagueId: matrix.leagueId,
                    season: matrix.season,
                    roundSaved: matrix.roundSaved,
                    teamName: at.teamName,
                    rank: at.rank,
                    roundNum: i + seqLen,
                    nextResult,
                  });
                }

                if (nextResult) {
                  totalWithNext++;
                  if (nextResult === "Won") winCount++;
                  else if (nextResult === "Draw") drawCount++;
                  else if (nextResult === "Lost") lostCount++;
                }
              }
            }
          });
        });

        const stats =
          totalWithNext > 0
            ? {
                winPct: Math.round((winCount / totalWithNext) * 100),
                drawPct: Math.round((drawCount / totalWithNext) * 100),
                lostPct: Math.round((lostCount / totalWithNext) * 100),
                winCount,
                drawCount,
                lostCount,
                total: totalWithNext,
              }
            : null;

        return {
          teamName: name,
          currentSequence: seq,
          matches,
          stats,
        };
      })
      .filter((t: any) => t.currentSequence.length > 0)
      .sort((a: any, b: any) => b.matches.length - a.matches.length);
  }, [
    teamListData,
    savedMatrices,
    repetitionK,
    repetitionLeagueMode,
    leagueId,
  ]);

  const seasonSimilarities = React.useMemo(() => {
    if (
      !teamListData ||
      teamListData.length === 0 ||
      !savedMatrices ||
      savedMatrices.length === 0
    ) {
      return [];
    }

    // Pre-normalize current live team names
    const normalizedLiveTeams = teamListData.map((ct: any) => ({
      nameNorm: ct.teamName.toLowerCase().trim(),
      rank: ct.rank,
    }));

    return savedMatrices
      .map((matrix: any) => {
        const archivedTeams = matrix.teamForms || [];
        if (archivedTeams.length === 0)
          return { matrix, score: 0, matchedTeamsCount: 0 };

        // Pre-normalize archived teams
        const normalizedArchived = archivedTeams.map((at: any) => ({
          nameNorm: at.teamName.toLowerCase().trim(),
          rank: at.rank,
        }));

        let totalRankDiff = 0;
        let matchedTeamsCount = 0;

        normalizedLiveTeams.forEach((ct: any) => {
          // Direct equal match first (extremely fast)
          let matched = normalizedArchived.find(
            (at: any) => at.nameNorm === ct.nameNorm,
          );
          if (!matched) {
            // Fallback to substring matching
            matched = normalizedArchived.find(
              (at: any) =>
                at.nameNorm.includes(ct.nameNorm) ||
                ct.nameNorm.includes(at.nameNorm),
            );
          }

          if (matched) {
            matchedTeamsCount++;
            totalRankDiff += Math.abs(ct.rank - matched.rank);
          }
        });

        if (matchedTeamsCount === 0) {
          return {
            matrix,
            score: 0,
            matchedTeamsCount: 0,
          };
        }

        const averageRankDifference = totalRankDiff / matchedTeamsCount;
        const maxRankDev = Math.max(matchedTeamsCount / 2, 8);
        const similarityScore = Math.max(
          0,
          Math.min(
            100,
            Math.round(100 * (1 - averageRankDifference / maxRankDev)),
          ),
        );

        return {
          matrix,
          score: similarityScore,
          averageRankDifference: averageRankDifference.toFixed(1),
          matchedTeamsCount,
        };
      })
      .sort((a: any, b: any) => b.score - a.score);
  }, [teamListData, savedMatrices]);

  const filteredTeams = teamListData
    .filter((row: any) =>
      row.teamName.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .sort((a: any, b: any) => {
      if (sortBy === "win") return b.winPct - a.winPct;
      if (sortBy === "draw") return b.drawPct - a.drawPct;
      if (sortBy === "streak") {
        if (a.streak.type !== b.streak.type) {
          return a.streak.type === "Won" ? -1 : 1;
        }
        return b.streak.count - a.streak.count;
      }
      if (sortBy === "length") return b.history.length - a.history.length;
      return a.rank - b.rank; // default 'rank'
    });

  return (
    <div className="space-y-6 pb-12">
      {/* AI Form Pattern Assistant */}
      <AIFormPatternAssistant
        rankings={activeRankings}
        results={activeResults}
        getFullForm={getFullForm}
      />

      {/* SQLite / IndexedDB Matrices Archivées Controller Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0d1527] p-4 rounded-2xl border border-indigo-500/15 shadow-2xl select-none">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/15 border border-indigo-500/20 rounded-xl">
            <Database className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider">
              🗄️ Matrices Archivées
            </h3>
          </div>
        </div>
        <button
          onClick={() => {
            setIsHistoryOpen(true);
            loadAllSavedMatrices();
          }}
          type="button"
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border border-indigo-500/20 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 active:scale-95 cursor-pointer shadow-indigo-500/5 select-none"
        >
          <Database className="w-3.5 h-3.5" />
          <span>Consulter les Matrices Stockées ({savedMatrices.length})</span>
        </button>
      </div>

      {/* Active Archive Info Banner */}
      {selectedHistoricalMatrix && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 text-amber-400 shadow-[0_4px_25px_rgba(245,158,11,0.08)]">
          <div className="flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-100">
                Mode Exploration d'Archive Activé
              </h4>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Visualisation des données figées de la saison{" "}
                <strong className="text-amber-400 font-extrabold">
                  {selectedHistoricalMatrix.season}
                </strong>{" "}
                (Round #{selectedHistoricalMatrix.roundSaved})
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedHistoricalMatrix(null)}
            type="button"
            className="w-full md:w-auto px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider rounded-lg border border-amber-500/20 active:scale-95 transition-all cursor-pointer font-bold"
          >
            Quitter l'Aperçu d'Archive (Retour au Direct)
          </button>
        </div>
      )}

      {/* Backup list & management modal window */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#0b111e] border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-indigo-400 animate-pulse" />
                <div>
                  <h3 className="text-[12px] font-black text-white uppercase tracking-wider">
                    Base de Données des Matrices Archivées
                  </h3>
                  <p className="text-[8.5px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                    Historique des sauvegardes de fin de saison (J#33 / J-1)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                type="button"
                className="p-1.5 px-3 rounded-lg text-[10px] bg-slate-900 border border-white/5 hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer font-semibold uppercase tracking-wider"
              >
                Fermer
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
              {/* Search input to query by season */}
              {savedMatrices.length > 0 && (
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-400" />
                  <input
                    type="text"
                    placeholder="RECHERCHER PAR SAISON (EX: 2025/2026)..."
                    value={seasonSearchQuery}
                    onChange={(e) => setSeasonSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-950/60 hover:bg-slate-950 border border-white/5 rounded-xl text-[10px] font-black text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-all font-mono tracking-wider"
                  />
                  {seasonSearchQuery && (
                    <button
                      onClick={() => setSeasonSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-[10px] font-black"
                    >
                      EFFACER
                    </button>
                  )}
                </div>
              )}

              {savedMatrices.length === 0 ? (
                <div className="text-center py-12 bg-slate-950/40 border border-white/[0.02] rounded-2xl text-slate-500 flex flex-col items-center justify-center">
                  <span className="text-3xl mb-2">🗄️</span>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Aucune sauvegarde de matrice présente dans la base
                  </p>
                  <p className="text-[8px] text-slate-500 uppercase font-bold tracking-widest mt-1.5 max-w-md leading-relaxed text-center">
                    Les matrices d'évolution des rangs et de forme superposée
                    sont stockées automatiquement dans la base de données dès
                    qu'un round avant-dernier est complété (ex: Round 33 pour
                    34).
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const filtered = savedMatrices.filter((matrix) => {
                      const seasonText = String(
                        matrix.season || "",
                      ).toLowerCase();
                      const queryText = seasonSearchQuery.toLowerCase().trim();
                      return !queryText || seasonText.includes(queryText);
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-8 text-slate-500">
                          <p className="text-[10px] font-black uppercase tracking-wider">
                            Aucune saison correspondante à "{seasonSearchQuery}"
                          </p>
                          <p className="text-[8px] text-slate-600 uppercase tracking-widest mt-1">
                            Essayez un autre terme ou effacez la recherche
                          </p>
                        </div>
                      );
                    }

                    // Group by date
                    const groups: Record<string, typeof filtered> = {};
                    const groupKeys: string[] = [];
                    filtered.forEach((matrix) => {
                      const dateObj = new Date(matrix.savedAt);
                      const key = isNaN(dateObj.getTime())
                        ? "Date inconnue"
                        : dateObj.toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          });
                      if (!groups[key]) {
                        groups[key] = [];
                        groupKeys.push(key);
                      }
                      groups[key].push(matrix);
                    });

                    return (
                      <div className="space-y-6">
                        {groupKeys.map((dateKey) => (
                          <div key={dateKey} className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
                              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider font-mono">
                                Sauvegardes du {dateKey}
                              </span>
                              <div className="flex-1 h-px bg-indigo-500/10"></div>
                            </div>
                            {groups[dateKey].map((matrix) => {
                              const isLoaded =
                                selectedHistoricalMatrix?.id === matrix.id;
                              const timeStr = new Date(
                                matrix.savedAt,
                              ).toLocaleTimeString("fr-FR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                              const leagueConfig = LEAGUES.find(
                                (l) => Number(l.id) === Number(matrix.leagueId),
                              );
                              const leagueName =
                                leagueConfig?.name ||
                                `Ligue ${matrix.leagueId}`;

                              return (
                                <div
                                  key={matrix.id}
                                  className={`p-4 rounded-2xl border transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                    isLoaded
                                      ? "bg-indigo-600/10 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.08)]"
                                      : "bg-slate-900/40 hover:bg-slate-900/80 border-white/5 hover:border-white/10"
                                  }`}
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="bg-slate-950 border border-indigo-500/20 text-indigo-400 font-mono font-black py-0.5 px-2 rounded text-[8.5px] uppercase">
                                        {leagueName}
                                      </span>
                                      <span className="text-slate-200 font-black text-[11px] uppercase tracking-wide font-mono">
                                        Saison {matrix.season}
                                      </span>
                                    </div>
                                    <div className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">
                                      Données calculées{" "}
                                      {matrix.roundSaved
                                        ? `jusqu'au Round #${matrix.roundSaved}`
                                        : ""}{" "}
                                      • Archivé à {timeStr}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 self-end sm:self-auto">
                                    <button
                                      onClick={() => {
                                        if (isLoaded) {
                                          setSelectedHistoricalMatrix(null);
                                        } else {
                                          setSelectedHistoricalMatrix(matrix);
                                          setSubTab("all-forms");
                                        }
                                        setIsHistoryOpen(false);
                                      }}
                                      type="button"
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[8.5px] font-black uppercase tracking-wider cursor-pointer border select-none transition-all ${
                                        isLoaded
                                          ? "bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/20"
                                          : "bg-indigo-600 text-white border-indigo-500/30 hover:bg-indigo-500/80 shadow-[0_2px_6px_rgba(99,102,241,0.15)]"
                                      }`}
                                    >
                                      <TrendingUp className="w-3" />
                                      <span>
                                        {isLoaded ? "Désactiver" : "Aperçu"}
                                      </span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        if (
                                          confirm(
                                            "Voulez-vous vraiment supprimer définitivement cette sauvegarde de matrice de la base ?",
                                          )
                                        ) {
                                          deleteSavedMatrix(matrix.id);
                                        }
                                      }}
                                      type="button"
                                      className="bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/30 text-rose-400 p-2 rounded-lg transition-all cursor-pointer"
                                      title="Supprimer la matrice"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-white/[0.04] pt-4 mt-4 flex items-center justify-between text-[8px] text-slate-500 font-bold uppercase tracking-widest">
              <span>{savedMatrices.length} archives indexées en local</span>
              <span>Dexie Storage Engine</span>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up modal window specifically for stored Aller/Retour (A/R) matrices */}
      {arViewMatrix && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in text-slate-100 select-none">
          <div className="bg-[#060b13] border border-slate-800 rounded-3xl max-w-6xl w-full p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/[0.04] pb-4 mb-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                  <ArrowLeftRight className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <h3 className="text-[12px] font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <span>
                      Aperçu de la Matrice A/R - Saison {arViewMatrix.season}
                    </span>
                    <span className="bg-teal-500/10 text-teal-300 text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded border border-teal-500/15">
                      Round #{arViewMatrix.roundSaved}
                    </span>
                  </h3>
                  <p className="text-[8.5px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                    Ligue #{arViewMatrix.leagueId} •{" "}
                    {LEAGUES.find(
                      (l) => Number(l.id) === Number(arViewMatrix.leagueId),
                    )?.name || "Championnat"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                <span className="text-[8.5px] text-slate-400 font-black uppercase tracking-wider shrink-0 select-none">
                  Équipe Focus :
                </span>
                {archivedRankings.length > 0 && (
                  <select
                    value={arFocusTeam || ""}
                    onChange={(e) => {
                      setArFocusTeam(e.target.value);
                      setArFocusDuo(null);
                    }}
                    className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-teal-300 font-extrabold uppercase focus:outline-none focus:border-teal-500 cursor-pointer min-w-[180px]"
                  >
                    {archivedRankings.map((t: any, idx: number) => {
                      const tName = t.name || t.teamName;
                      return (
                        <option key={idx} value={tName}>
                          {idx + 1}. {tName}
                        </option>
                      );
                    })}
                  </select>
                )}
                <button
                  onClick={() => setArViewMatrix(null)}
                  type="button"
                  className="p-2 px-4 rounded-xl text-[9px] bg-slate-900 border border-white/5 hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all cursor-pointer font-black uppercase tracking-wider select-none active:scale-95"
                >
                  Fermer
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-1">
              {arViewLoading ? (
                <div className="text-center py-24 flex flex-col items-center justify-center space-y-3">
                  <Database className="w-8 h-8 text-teal-400 animate-bounce" />
                  <p className="text-[10px] font-black uppercase tracking-wider text-teal-400">
                    Chargement des données d'archives en cours...
                  </p>
                  <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">
                    Extraction des confrontations croisées d'IndexedDB
                  </p>
                </div>
              ) : archivedRankings.length === 0 ? (
                <div className="text-center py-20 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                  <p className="text-[10px] font-black uppercase tracking-widest">
                    Matrice d'équipes indisponible
                  </p>
                  <p className="text-[8px] text-slate-600 mt-1 uppercase tracking-wider">
                    Aucune équipe n'a pu être extraite de ce tableau archivé.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Explanation label */}
                  <div className="flex items-center gap-2 bg-teal-500/5 border border-teal-500/10 rounded-xl p-3 text-[8.5px] font-bold text-teal-300 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></span>
                    <span>
                      LIGNES = Équipe à Domicile (Aller) | COLONNES = Équipe à
                      l'Extérieur (Retour). Cliquez sur une case pour analyser
                      un face-à-face.
                    </span>
                  </div>

                  {/* Complete Cross Table */}
                  <div className="overflow-x-auto max-w-full rounded-2xl border border-slate-800/80 bg-slate-950/20 custom-scrollbar">
                    <table className="min-w-max border-collapse">
                      <thead>
                        <tr className="bg-slate-900/40 font-mono text-[8.5px] text-slate-400 uppercase tracking-widest border-b border-white/[0.02]">
                          <th className="sticky left-0 bg-[#060b13] z-20 border-r border-slate-800/80 px-4 py-3 text-left font-black uppercase tracking-widest text-[9.5px]">
                            ÉQUIPE
                          </th>
                          {archivedRankings.map((t: any, colIdx: number) => {
                            const tName = t.name || t.teamName;
                            return (
                              <th
                                key={colIdx}
                                className="px-2 py-3 text-center min-w-[94px] font-sans"
                              >
                                <div className="flex flex-col items-center gap-1 group/header relative cursor-help">
                                  <img
                                    src={getTeamLogo(tName)}
                                    className="w-5 h-5 object-contain"
                                    alt=""
                                  />
                                  <span className="text-[7.5px] text-slate-400 font-extrabold">
                                    {tName.substring(0, 3).toUpperCase()}
                                  </span>
                                  <div className="absolute bottom-full mb-2 hidden group-hover/header:block bg-slate-950 text-slate-200 text-[8px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded shadow-2xl border border-white/10 z-30 whitespace-nowrap">
                                    {tName}
                                  </div>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.02]">
                        {archivedRankings.map((rowT: any, rowIdx: number) => {
                          const homeTeamName = rowT.name || rowT.teamName;
                          const isFocus = arFocusTeam === homeTeamName;

                          return (
                            <tr
                              key={rowIdx}
                              className={`transition-colors duration-100 ${
                                isFocus
                                  ? "bg-teal-500/5 hover:bg-teal-500/10"
                                  : "hover:bg-slate-900/40"
                              }`}
                            >
                              {/* Sticky left table name column */}
                              <td
                                onClick={() => {
                                  setArFocusTeam(homeTeamName);
                                  setArFocusDuo(null);
                                }}
                                className={`sticky left-0 z-10 border-r border-slate-800/80 px-4 py-2.5 flex items-center justify-between gap-2.5 w-48 text-left font-sans text-[10px] font-black uppercase tracking-wide cursor-pointer transition-colors ${
                                  isFocus
                                    ? "bg-[#060b13]/95 text-teal-400 border-l-4 border-l-teal-500"
                                    : "bg-[#060b13]/95 text-slate-300"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <img
                                    src={getTeamLogo(homeTeamName)}
                                    className="w-4 h-4 object-contain shrink-0"
                                    alt=""
                                  />
                                  <span className="truncate">
                                    {homeTeamName}
                                  </span>
                                </div>
                                <span className="text-[7.5px] text-slate-600 font-bold font-mono">
                                  #{rowIdx + 1}
                                </span>
                              </td>

                              {/* Opponents Columns */}
                              {archivedRankings.map(
                                (colT: any, colIdx: number) => {
                                  const awayTeamName =
                                    colT.name || colT.teamName;

                                  if (rowIdx === colIdx) {
                                    return (
                                      <td
                                        key={colIdx}
                                        className="p-1.5 min-w-[94px] text-center bg-slate-950/40 border border-white/[0.01]"
                                      >
                                        <div className="w-[82px] h-12 mx-auto flex items-center justify-center text-slate-800 font-mono text-xs select-none">
                                          ✖️
                                        </div>
                                      </td>
                                    );
                                  }

                                  const m_RowHome = findArchivedConfrontation(
                                    homeTeamName,
                                    awayTeamName,
                                  );
                                  const m_ColHome = findArchivedConfrontation(
                                    awayTeamName,
                                    homeTeamName,
                                  );

                                  let matchAller: any = null;
                                  let matchRetour: any = null;

                                  if (m_RowHome && m_ColHome) {
                                    const r_Row =
                                      Number(
                                        m_RowHome.roundNumber ||
                                          m_RowHome.round,
                                      ) || 0;
                                    const r_Col =
                                      Number(
                                        m_ColHome.roundNumber ||
                                          m_ColHome.round,
                                      ) || 0;
                                    if (r_Row <= r_Col) {
                                      matchAller = m_RowHome;
                                      matchRetour = m_ColHome;
                                    } else {
                                      matchAller = m_ColHome;
                                      matchRetour = m_RowHome;
                                    }
                                  } else if (m_RowHome) {
                                    matchAller = m_RowHome;
                                  } else if (m_ColHome) {
                                    matchAller = m_ColHome;
                                  }

                                  const getMatchDetailsProps = (m: any) => {
                                    if (!m)
                                      return {
                                        rowScore: "-",
                                        colScore: "-",
                                        outcomeLabel: "-",
                                        outcome: null,
                                        isRowHome: true,
                                        roundNum: "",
                                      };

                                    const normRow = homeTeamName
                                      .toLowerCase()
                                      .trim();
                                    const isRowHome =
                                      getTeamName(m.homeTeam)
                                        .toLowerCase()
                                        .trim() === normRow;

                                    let hS = m.homeScore ?? "-";
                                    let aS = m.awayScore ?? "-";
                                    if (m.score) {
                                      const sep = m.score.includes(":")
                                        ? ":"
                                        : "-";
                                      const parts = m.score.split(sep);
                                      if (parts.length === 2) {
                                        hS = parts[0];
                                        aS = parts[1];
                                      }
                                    }

                                    const rowScore = isRowHome ? hS : aS;
                                    const colScore = isRowHome ? aS : hS;

                                    let outcome = null;
                                    let outcomeLabel = "-";
                                    const hVal = parseInt(hS);
                                    const aVal = parseInt(aS);

                                    if (!isNaN(hVal) && !isNaN(aVal)) {
                                      outcome = getOutcome(
                                        hVal,
                                        aVal,
                                        isRowHome ? "h" : "a",
                                      );
                                      if (outcome === "V") outcomeLabel = "V";
                                      else if (outcome === "D")
                                        outcomeLabel = "D";
                                      else if (outcome === "N")
                                        outcomeLabel = "N";
                                    }

                                    return {
                                      rowScore,
                                      colScore,
                                      outcomeLabel,
                                      outcome,
                                      isRowHome,
                                      roundNum: m.roundNumber || m.round || "",
                                    };
                                  };

                                  const detailsAller =
                                    getMatchDetailsProps(matchAller);
                                  const detailsRetour =
                                    getMatchDetailsProps(matchRetour);

                                  let allerBadgeColor =
                                    "bg-slate-900/40 text-slate-500 border border-white/[0.04]";
                                  if (detailsAller.outcome === "V") {
                                    allerBadgeColor =
                                      "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25";
                                  } else if (detailsAller.outcome === "D") {
                                    allerBadgeColor =
                                      "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/25";
                                  } else if (detailsAller.outcome === "N") {
                                    allerBadgeColor =
                                      "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25";
                                  }

                                  let retourBadgeColor =
                                    "bg-slate-900/40 text-slate-500 border border-white/[0.04]";
                                  if (detailsRetour.outcome === "V") {
                                    retourBadgeColor =
                                      "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25";
                                  } else if (detailsRetour.outcome === "D") {
                                    retourBadgeColor =
                                      "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/25";
                                  } else if (detailsRetour.outcome === "N") {
                                    retourBadgeColor =
                                      "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25";
                                  }

                                  return (
                                    <td
                                      key={colIdx}
                                      className="p-1 px-[3px] min-w-[94px] border border-white/[0.01]"
                                    >
                                      <div className="flex flex-col gap-1 items-center justify-center py-0.5">
                                        {/* Aller */}
                                        <button
                                          onClick={() => {
                                            setArFocusTeam(homeTeamName);
                                            setArFocusDuo({
                                              teamA: homeTeamName,
                                              teamB: awayTeamName,
                                            });
                                          }}
                                          type="button"
                                          className={`w-[82px] h-[21px] flex items-center justify-between px-1.5 rounded cursor-pointer transition-all duration-100 font-mono text-[8.5px] font-black ${allerBadgeColor}`}
                                          title={`ALLER (${detailsAller.isRowHome ? "Domicile" : "Extérieur"}) : ${homeTeamName} ${detailsAller.rowScore} - ${detailsAller.colScore} ${awayTeamName} ${matchAller ? `(Journée ${detailsAller.roundNum})` : ""}`}
                                        >
                                          <span className="text-[6.5px] text-slate-400 font-bold uppercase tracking-wider">
                                            ALL
                                          </span>
                                          <span className="text-[8.5px] font-bold">
                                            {detailsAller.rowScore}:
                                            {detailsAller.colScore}
                                          </span>
                                          <span className="text-[8px] font-black w-3 text-right">
                                            {detailsAller.outcomeLabel}
                                          </span>
                                        </button>

                                        {/* Retour */}
                                        <button
                                          onClick={() => {
                                            setArFocusTeam(homeTeamName);
                                            setArFocusDuo({
                                              teamA: homeTeamName,
                                              teamB: awayTeamName,
                                            });
                                          }}
                                          type="button"
                                          className={`w-[82px] h-[21px] flex items-center justify-between px-1.5 rounded cursor-pointer transition-all duration-100 font-mono text-[8.5px] font-black ${retourBadgeColor}`}
                                          title={`RETOUR (${detailsRetour.isRowHome ? "Domicile" : "Extérieur"}) : ${homeTeamName} ${detailsRetour.rowScore} - ${detailsRetour.colScore} ${awayTeamName} ${matchRetour ? `(Journée ${detailsRetour.roundNum})` : ""}`}
                                        >
                                          <span className="text-[6.5px] text-slate-400 font-bold uppercase tracking-wider">
                                            RET
                                          </span>
                                          <span className="text-[8.5px] font-bold">
                                            {detailsRetour.rowScore}:
                                            {detailsRetour.colScore}
                                          </span>
                                          <span className="text-[8px] font-black w-3 text-right">
                                            {detailsRetour.outcomeLabel}
                                          </span>
                                        </button>
                                      </div>
                                    </td>
                                  );
                                },
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Badges explanation bar */}
                  <div className="flex flex-wrap gap-4 text-[7.5px] font-black uppercase text-slate-400 tracking-widest p-1 border-t border-white/[0.02]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-emerald-500/15 border border-emerald-500/30"></span>
                      <span>Victoire Domicile</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-amber-500/15 border border-amber-500/30"></span>
                      <span>Match Nul</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-rose-500/15 border border-rose-500/30"></span>
                      <span>Défaite Domicile</span>
                    </div>
                  </div>

                  {/* Show H2H analysis for the selected focus design exactly as the main panel */}
                  {arFocusTeam && (
                    <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-5 space-y-4">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/[0.04] pb-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={getTeamLogo(arFocusTeam)}
                            className="w-10 h-10 object-contain p-1 bg-slate-950 rounded-lg border border-white/10 shrink-0"
                            alt=""
                          />
                          <div>
                            <h4 className="text-[11.5px] font-black text-slate-100 uppercase tracking-widest">
                              Confrontations de l'Archive : {arFocusTeam}
                            </h4>
                            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 font-mono">
                              Index des matches Aller/Retour durant la saison{" "}
                              {arViewMatrix.season}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Opponents mapping cards grid */}
                      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                        {archivedRankings
                          .filter(
                            (t: any) => (t.name || t.teamName) !== arFocusTeam,
                          )
                          .map((opp: any, oppIdx: number) => {
                            const oppName = opp.name || opp.teamName;

                            const allergenMatch = findArchivedConfrontation(
                              arFocusTeam,
                              oppName,
                            );
                            const retourenMatch = findArchivedConfrontation(
                              oppName,
                              arFocusTeam,
                            );

                            let allerScoreText = "- : -";
                            let allerColor =
                              "text-slate-500 bg-slate-950/40 border border-white/[0.02]";
                            if (allergenMatch) {
                              let hS = allergenMatch.homeScore ?? "-";
                              let aS = allergenMatch.awayScore ?? "-";
                              if (allergenMatch.score) {
                                const sep = allergenMatch.score.includes(":")
                                  ? ":"
                                  : "-";
                                const parts = allergenMatch.score.split(sep);
                                if (parts.length === 2) {
                                  hS = parts[0];
                                  aS = parts[1];
                                }
                              }
                              const hVal = parseInt(hS);
                              const aVal = parseInt(aS);
                              allerScoreText = `${hS} - ${aS}`;
                              if (!isNaN(hVal) && !isNaN(aVal)) {
                                if (hVal > aVal) {
                                  allerColor =
                                    "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
                                } else if (hVal < aVal) {
                                  allerColor =
                                    "text-rose-400 bg-rose-500/10 border border-rose-500/20";
                                } else {
                                  allerColor =
                                    "text-amber-400 bg-amber-500/10 border border-amber-500/20";
                                }
                              }
                            }

                            let retourScoreText = "- : -";
                            let retourColor =
                              "text-slate-500 bg-slate-950/40 border border-white/[0.02]";
                            if (retourenMatch) {
                              let hS = retourenMatch.homeScore ?? "-";
                              let aS = retourenMatch.awayScore ?? "-";
                              if (retourenMatch.score) {
                                const sep = retourenMatch.score.includes(":")
                                  ? ":"
                                  : "-";
                                const parts = retourenMatch.score.split(sep);
                                if (parts.length === 2) {
                                  hS = parts[0];
                                  aS = parts[1];
                                }
                              }
                              const hVal = parseInt(hS);
                              const aVal = parseInt(aS);
                              retourScoreText = `${hS} - ${aS}`;
                              if (!isNaN(hVal) && !isNaN(aVal)) {
                                if (hVal > aVal) {
                                  retourColor =
                                    "text-rose-400 bg-rose-500/10 border border-rose-500/20";
                                } else if (hVal < aVal) {
                                  retourColor =
                                    "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
                                } else {
                                  retourColor =
                                    "text-amber-400 bg-amber-500/10 border border-amber-500/20";
                                }
                              }
                            }

                            const isSelectedDuo =
                              arFocusDuo &&
                              ((arFocusDuo.teamA === arFocusTeam &&
                                arFocusDuo.teamB === oppName) ||
                                (arFocusDuo.teamA === oppName &&
                                  arFocusDuo.teamB === arFocusTeam));

                            return (
                              <div
                                key={oppIdx}
                                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                  isSelectedDuo
                                    ? "bg-teal-600/10 border-teal-500/40 shadow-[0_0_12px_rgba(20,184,166,0.1)]"
                                    : "bg-slate-900/60 border-white/[0.03] hover:border-white/10"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <img
                                    src={getTeamLogo(oppName)}
                                    className="w-7 h-7 object-contain bg-slate-950 rounded border border-white/5 p-0.5 shrink-0"
                                    alt=""
                                  />
                                  <div>
                                    <span className="block text-[10px] font-black text-slate-200 uppercase tracking-wide truncate max-w-[150px]">
                                      {oppName}
                                    </span>
                                    <span className="block text-[7px] text-slate-500 uppercase tracking-widest font-bold font-mono">
                                      Rang Final : #{opp.rank} • {opp.points}{" "}
                                      pts
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 font-mono">
                                  <div
                                    className={`px-2 py-1 rounded text-center shrink-0 min-w-[50px] ${allerColor}`}
                                  >
                                    <span className="block text-[5.5px] font-black text-slate-500 uppercase">
                                      DOM
                                    </span>
                                    <span className="text-[9.5px] font-black">
                                      {allerScoreText}
                                    </span>
                                  </div>
                                  <div
                                    className={`px-2 py-1 rounded text-center shrink-0 min-w-[50px] ${retourColor}`}
                                  >
                                    <span className="block text-[5.5px] font-black text-slate-500 uppercase">
                                      EXT
                                    </span>
                                    <span className="text-[9.5px] font-black">
                                      {retourScoreText}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-white/[0.04] pt-4 mt-4 flex items-center justify-between text-[8px] text-slate-500 font-bold uppercase tracking-widest">
              <span>
                Navigateur Intuitif de Archives de Double Confrontation
              </span>
              <span>Visualisation A/R Directe</span>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MENU TABS FOR VALINY (RESULTS) */}
      <div className="flex flex-col xl:flex-row gap-2 p-1 bg-slate-950/70 rounded-xl border border-white/5 shadow-md">
        <button
          onClick={() => setSubTab("all-forms")}
          type="button"
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            subTab === "all-forms"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/10 border border-indigo-500/30"
              : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
          <span>👁️ Formes en un Clin d'Œil</span>
        </button>
        <button
          onClick={() => setSubTab("dynamic")}
          type="button"
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            subTab === "dynamic"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/10 border border-indigo-500/30"
              : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          <span>📈 Rangs Dynamiques</span>
        </button>
        <button
          onClick={() => setSubTab("round")}
          type="button"
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            subTab === "round"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/10 border border-indigo-500/30"
              : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
          }`}
        >
          <History className="w-3.5 h-3.5 text-indigo-400" />
          <span>📅 Journées & Scores</span>
        </button>
        <button
          onClick={() => setSubTab("ar")}
          type="button"
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            subTab === "ar"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/10 border border-indigo-500/30"
              : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
          }`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400" />
          <span>🔄 Aller / Retour (A/R)</span>
        </button>
        <button
          onClick={() => setSubTab("repetitions")}
          type="button"
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            subTab === "repetitions"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/10 border border-indigo-500/30"
              : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>🔁 Répétitions Historiques</span>
        </button>
      </div>

      {subTab === "all-forms" && (
        <div className="space-y-4">
          {dbBackupInfo && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-emerald-400 select-none">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] uppercase font-black tracking-widest leading-none">
                  Sauvegarde de Fin de Saison Sécurisée
                </span>
              </div>
              <div className="text-[9px] uppercase font-semibold text-slate-400 text-center sm:text-right">
                La matrice d'évolution & la matrice de forme ont été archivées
                automatiquement après le round{" "}
                <strong className="text-emerald-400 font-extrabold">
                  #{dbBackupInfo.roundSaved}
                </strong>{" "}
                ({new Date(dbBackupInfo.savedAt).toLocaleDateString()})
              </div>
            </div>
          )}

          {/* General alert banner for patterns of repeated forms found in archived matrices */}
          {savedMatrices &&
            savedMatrices.length > 0 &&
            computedRepetitions.some(
              (r: any) => r.matches && r.matches.length > 0,
            ) &&
            (() => {
              const matchedTeams = computedRepetitions.filter(
                (r: any) => r.matches && r.matches.length > 0,
              );
              return (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4.5 flex flex-col gap-4 text-amber-400 shadow-lg shadow-amber-950/15 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-amber-500/15 border border-amber-500/25 rounded-xl text-amber-400 shrink-0 mt-0.5 animate-pulse">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                          ⚠️ Alerte Formes : Détection de Répétitions
                          Historiques Importantes
                        </h4>
                        <p className="text-[9px] text-slate-300 font-bold uppercase tracking-wide mt-1 leading-relaxed">
                          Des séquences de forme actuelles équivalentes (
                          {repetitionK} derniers matchs) ont été détectées dans
                          vos archives de matrices multi-ligues.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSubTab("repetitions")}
                      type="button"
                      className="bg-amber-500 hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/25 active:scale-95 text-slate-950 text-[9px] font-black uppercase tracking-widest px-4.5 py-3 rounded-xl cursor-pointer transition-all select-none whitespace-nowrap self-end sm:self-center"
                    >
                      Consulter l'analyse prédictive ➡️
                    </button>
                  </div>

                  {/* Detailed matched items list so the user knows exactly which seasons & leagues contained the pattern */}
                  <div className="border-t border-amber-500/10 pt-3 mt-1">
                    <span className="text-[7.5px] text-slate-400 font-black uppercase tracking-widest block mb-2 font-mono">
                      Localisations exactes des séquences identiques répétées :
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1 no-scrollbar">
                      {(() => {
                        const flattened = matchedTeams.flatMap((teamRep: any) =>
                          teamRep.matches.map((matchRow: any, idx: number) => ({
                            teamRep,
                            matchRow,
                            idx,
                          })),
                        );
                        const displayItems = flattened.slice(0, 30);
                        const remainingCount = flattened.length - 30;

                        return (
                          <>
                            {displayItems.map(
                              ({
                                teamRep,
                                matchRow,
                                idx,
                              }: {
                                teamRep: any;
                                matchRow: any;
                                idx: number;
                              }) => {
                                const mLeague = LEAGUES.find(
                                  (l: any) =>
                                    l.id === Number(matchRow.leagueId),
                                );
                                const lName = mLeague
                                  ? mLeague.name
                                  : "Ligue Archivée";
                                const flagUrl = mLeague
                                  ? getLeagueFlag(mLeague.country)
                                  : null;
                                return (
                                  <div
                                    key={`${teamRep.teamName}-${matchRow.matrixId}-${idx}`}
                                    className="bg-slate-950/60 border border-amber-500/10 hover:border-amber-500/20 px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-slate-300 hover:text-white transition-all text-[8.5px]"
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <img
                                        src={getTeamLogo(teamRep.teamName)}
                                        className="w-4 h-4 object-contain shrink-0"
                                        alt=""
                                      />
                                      <div className="truncate font-sans font-bold">
                                        <span className="text-white font-black uppercase">
                                          {teamRep.teamName}
                                        </span>{" "}
                                        (Forme actuelle)
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-right font-mono font-bold shrink-0">
                                      <span className="text-amber-400 font-extrabold uppercase bg-amber-500/15 border border-amber-500/20 px-1.5 py-0.5 rounded text-[7.5px]">
                                        {matchRow.season}
                                      </span>
                                      {flagUrl && (
                                        <img
                                          src={flagUrl}
                                          className="w-3.5 h-2 object-cover rounded-sm shadow-sm"
                                          alt=""
                                          referrerPolicy="no-referrer"
                                        />
                                      )}
                                      <span className="text-slate-400 font-extrabold pb-0.5 select-none text-[8px] uppercase">
                                        {lName} • {matchRow.teamName} (R
                                        {matchRow.rank})
                                      </span>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                            {remainingCount > 0 && (
                              <div className="col-span-1 md:col-span-2 text-center text-[8px] text-slate-400 font-black uppercase tracking-widest py-1.5 bg-slate-950/30 border border-dashed border-white/5 rounded-xl">
                                + {remainingCount} autres correspondances
                                masquées pour optimiser l'affichage
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })()}
          {/* Search, Sort and Layout controls */}
          <div className="flex flex-col lg:flex-row gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-md justify-between items-center">
            {/* Search Input */}
            <div className="relative w-full lg:max-w-xs shrink-0">
              <input
                type="text"
                placeholder="Rechercher une équipe..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950/60 border border-white/10 rounded-lg pl-3 pr-8 py-1.5 text-[9.5px] text-slate-100 font-extrabold uppercase placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* View switcher */}
            <div className="flex bg-slate-950 p-0.5 rounded border border-white/5 gap-1 shrink-0">
              <button
                onClick={() => setAllFormsDisplay("stacked")}
                type="button"
                className={`px-3 py-1 text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  allFormsDisplay === "stacked"
                    ? "bg-indigo-600 text-white shadow-md rounded-[4px]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                ↕️ Alignement Superposé
              </button>
              <button
                onClick={() => setAllFormsDisplay("cards")}
                type="button"
                className={`px-3 py-1 text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  allFormsDisplay === "cards"
                    ? "bg-indigo-600 text-white shadow-md rounded-[4px]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                📋 Grille Détaillée
              </button>
            </div>

            {/* Export pdf button */}
            {allFormsDisplay === "stacked" && (
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all border border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-[0_0_8px_rgba(245,158,11,0.15)] select-none shrink-0"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>
                  {isExporting ? "Exportation..." : "Exporter PDF (Paysage)"}
                </span>
              </button>
            )}

            {/* Sort controls */}
            <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0 no-scrollbar justify-start lg:justify-end">
              <span className="text-[7.5px] font-black text-slate-500 uppercase tracking-widest shrink-0">
                Trier par :
              </span>
              <div className="flex bg-slate-950 p-0.5 rounded border border-white/5 shrink-0">
                {(["rank", "win", "draw", "streak", "length"] as const).map(
                  (mode) => (
                    <button
                      key={mode}
                      onClick={() => setSortBy(mode)}
                      type="button"
                      className={`px-2 py-1 rounded text-[7.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        sortBy === mode
                          ? "bg-zinc-800 text-slate-100"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {mode === "rank"
                        ? "Rang"
                        : mode === "win"
                          ? "V %"
                          : mode === "draw"
                            ? "N %"
                            : mode === "streak"
                              ? "Série"
                              : "Rounds"}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          {allFormsDisplay === "stacked" ? (
            /* Superposed Team Forms View with Shared Sequences Alignment Highlight */
            (() => {
              const sequenceAnalysis = {
                counts: {} as Record<string, number>,
                repeatedKeys: [] as string[],
                keyToPalette: {} as Record<string, any>,
              };

              // Analyze ending sequence of size repetitionK for each team in the current table
              filteredTeams.forEach((row: any) => {
                if (row.history && row.history.length >= repetitionK) {
                  const seq = row.history.slice(-repetitionK).join(",");
                  sequenceAnalysis.counts[seq] =
                    (sequenceAnalysis.counts[seq] || 0) + 1;
                }
              });

              // Track sequences that repeat (exist in at least 2 teams)
              sequenceAnalysis.repeatedKeys = Object.keys(
                sequenceAnalysis.counts,
              )
                .filter((key) => sequenceAnalysis.counts[key] >= 2)
                .sort(
                  (a, b) =>
                    sequenceAnalysis.counts[b] - sequenceAnalysis.counts[a],
                );

              // Custom consistent color palettes for each unique repeating sequence
              const colorPalettes = [
                {
                  bg: "bg-indigo-500/25",
                  text: "text-indigo-200",
                  border: "border-indigo-400",
                  ring: "ring-2 ring-indigo-500",
                  shadow: "shadow-[0_0_12px_rgba(99,102,241,0.6)]",
                  bullet: "bg-indigo-400",
                },
                {
                  bg: "bg-emerald-500/25",
                  text: "text-emerald-200",
                  border: "border-emerald-400",
                  ring: "ring-2 ring-emerald-500",
                  shadow: "shadow-[0_0_12px_rgba(16,185,129,0.6)]",
                  bullet: "bg-emerald-400",
                },
                {
                  bg: "bg-fuchsia-500/25",
                  text: "text-fuchsia-200",
                  border: "border-fuchsia-400",
                  ring: "ring-2 ring-fuchsia-500",
                  shadow: "shadow-[0_0_12px_rgba(217,70,239,0.6)]",
                  bullet: "bg-fuchsia-400",
                },
                {
                  bg: "bg-amber-500/25",
                  text: "text-amber-200",
                  border: "border-amber-400",
                  ring: "ring-2 ring-amber-500",
                  shadow: "shadow-[0_0_12px_rgba(245,158,11,0.6)]",
                  bullet: "bg-amber-400",
                },
                {
                  bg: "bg-rose-500/25",
                  text: "text-rose-200",
                  border: "border-rose-400",
                  ring: "ring-2 ring-rose-500",
                  shadow: "shadow-[0_0_12px_rgba(244,63,94,0.6)]",
                  bullet: "bg-rose-400",
                },
                {
                  bg: "bg-cyan-500/25",
                  text: "text-cyan-200",
                  border: "border-cyan-400",
                  ring: "ring-2 ring-cyan-500",
                  shadow: "shadow-[0_0_12px_rgba(6,182,212,0.6)]",
                  bullet: "bg-cyan-400",
                },
                {
                  bg: "bg-sky-500/25",
                  text: "text-sky-200",
                  border: "border-sky-400",
                  ring: "ring-2 ring-sky-500",
                  shadow: "shadow-[0_0_12px_rgba(14,165,233,0.6)]",
                  bullet: "bg-sky-400",
                },
                {
                  bg: "bg-yellow-500/20",
                  text: "text-yellow-200",
                  border: "border-yellow-400",
                  ring: "ring-2 ring-yellow-500",
                  shadow: "shadow-[0_0_12px_rgba(234,179,8,0.5)]",
                  bullet: "bg-yellow-400",
                },
                {
                  bg: "bg-violet-500/25",
                  text: "text-violet-200",
                  border: "border-violet-400",
                  ring: "ring-2 ring-violet-500",
                  shadow: "shadow-[0_0_12px_rgba(139,92,246,0.6)]",
                  bullet: "bg-violet-400",
                },
                {
                  bg: "bg-teal-500/25",
                  text: "text-teal-200",
                  border: "border-teal-400",
                  ring: "ring-2 ring-teal-500",
                  shadow: "shadow-[0_0_12px_rgba(20,184,166,0.6)]",
                  bullet: "bg-teal-400",
                },
              ];

              sequenceAnalysis.repeatedKeys.forEach((key, idx) => {
                sequenceAnalysis.keyToPalette[key] =
                  colorPalettes[idx % colorPalettes.length];
              });

              return (
                <div
                  ref={stackedContainerRef}
                  className="bg-[#0b111e] border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5"
                >
                  <div className="flex flex-col gap-4 border-b border-white/[0.04] pb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
                        <div className="flex flex-col">
                          <h2 className="text-[11px] font-black text-slate-100 uppercase tracking-wider">
                            Matrice de Forme
                          </h2>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
                        {/* Selector sequence length */}
                        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-white/[0.04] shadow-inner">
                          <span className="text-[7.5px] font-black text-slate-500 uppercase tracking-wider pl-1">
                            Matches Répétitions :
                          </span>
                          <div className="flex gap-0.5">
                            {[2, 3, 4, 5, 6].map((kVal) => (
                              <button
                                key={kVal}
                                onClick={() => setRepetitionK(kVal)}
                                className={`px-2 py-0.5 rounded-md text-[9px] font-black tracking-wider transition-all cursor-pointer ${
                                  repetitionK === kVal
                                    ? "bg-indigo-600 text-white shadow-md border border-indigo-500/20"
                                    : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]"
                                }`}
                                title={`Afficher les séquences de ${kVal} matchs`}
                              >
                                {kVal}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <span className="bg-[#020617] border border-white/5 px-3 py-1 text-[9.5px] font-black text-slate-300 uppercase rounded-full shadow-inner">
                            Total : {filteredTeams.length} équipes
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Highly Visual Sequence Legend Indicator */}
                    {sequenceAnalysis.repeatedKeys.length > 0 && (
                      <div className="bg-slate-950/60 p-3 rounded-xl border border-white/[0.03] flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 text-[8.5px] font-black uppercase text-indigo-400 tracking-wider">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>
                            Légende des Séquences Répétées Communes (
                            {repetitionK} derniers matchs)
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {sequenceAnalysis.repeatedKeys.map((key) => {
                            const palette = sequenceAnalysis.keyToPalette[key];
                            const count = sequenceAnalysis.counts[key];
                            const formattedSeq = key
                              .split(",")
                              .map((s) =>
                                s === "Won" ? "V" : s === "Draw" ? "N" : "D",
                              )
                              .join("-");
                            return (
                              <div
                                key={key}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black font-mono shadow-md ${palette.bg} ${palette.border} ${palette.text}`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${palette.bullet} animate-pulse`}
                                ></span>
                                <span className="tracking-wide">
                                  Séquence {formattedSeq}
                                </span>
                                <span className="text-white/40 font-sans text-[7.5px] font-bold">
                                  ({count} équipes)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stacked comparison grid container */}
                  <div className="space-y-1 overflow-x-auto pb-2 custom-scrollbar">
                    {/* Headers */}
                    <div className="flex items-center min-w-[780px] select-none text-slate-500 font-black text-[9px] uppercase pb-2 border-b border-white/[0.03] tracking-widest font-mono">
                      <div className="w-14 shrink-0 text-center">RANG</div>
                      <div className="w-52 shrink-0 text-left pl-6">
                        ÉQUIPE :
                      </div>
                      <div className="flex gap-2 pl-4">
                        {Array.from({
                          length: Math.max(
                            ...filteredTeams.map((t: any) => t.history.length),
                            0,
                          ),
                        }).map((_, i) => (
                          <div
                            key={i}
                            className="w-7 text-center shrink-0 font-bold"
                          >
                            {i + 1}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Rows mapped following current sorting and filtering criteria */}
                    <div className="divide-y divide-white/[0.02]">
                      {filteredTeams.map((row: any, idx: number) => {
                        const matchRep = computedRepetitions.find(
                          (cr: any) => cr.teamName === row.teamName,
                        );
                        const hasReps =
                          matchRep &&
                          matchRep.matches &&
                          matchRep.matches.length > 0;

                        // Extract current sequence for comparison highlight mapping
                        const isEligibleSequence =
                          row.history && row.history.length >= repetitionK;
                        const rowSeqKey = isEligibleSequence
                          ? row.history.slice(-repetitionK).join(",")
                          : "";
                        const seqPalette = rowSeqKey
                          ? sequenceAnalysis.keyToPalette[rowSeqKey]
                          : null;

                        return (
                          <div
                            key={idx}
                            className="flex items-center py-2.5 hover:bg-slate-900/40 rounded-lg transition-all duration-150 min-w-[780px] group/row"
                          >
                            {/* Rank Badge */}
                            <div className="w-14 shrink-0 text-center font-sans font-black text-xs text-slate-400 group-hover/row:text-indigo-400 transition-colors">
                              #{row.rank}
                            </div>

                            {/* Logo and padded Name alignment & Colon */}
                            <div className="w-52 shrink-0 flex items-center justify-between pl-1">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <img
                                  src={getTeamLogo(row.teamName)}
                                  className="w-5 h-5 object-contain shrink-0 shadow-md animate-fade-in"
                                  alt=""
                                />
                                <span className="font-sans font-black text-slate-200 uppercase tracking-wide text-[10.5px] group-hover/row:text-white transition-colors truncate">
                                  {row.teamName}
                                </span>
                                {hasReps && (
                                  <button
                                    onClick={() => {
                                      setSelectedScanTeam(row.teamName);
                                      setSubTab("repetitions");
                                    }}
                                    className="shrink-0 bg-amber-500/15 hover:bg-amber-500/35 text-amber-400 border border-amber-500/35 text-[7px] font-black uppercase tracking-widest px-1 py-0.5 rounded cursor-pointer flex items-center gap-0.5 ml-1.5 transition-all active:scale-95 animate-pulse"
                                    title={`${matchRep.matches.length} répétitions de formes trouvées. Cliquez pour voir.`}
                                  >
                                    ⚠️ {matchRep.matches.length}R
                                  </button>
                                )}
                              </div>
                              <span className="font-mono font-bold text-slate-600 mr-2 shrink-0">
                                :
                              </span>
                            </div>

                            {/* Chronological forms - aligned character blocks */}
                            <div className="flex gap-2 pl-4">
                              {row.history.map(
                                (res: string, idxForm: number) => {
                                  const val =
                                    res === "Won"
                                      ? "V"
                                      : res === "Lost"
                                        ? "D"
                                        : "N";

                                  // Determine if this cell is inside the repetitionK sequence block at the end
                                  const isInSequenceBlock =
                                    isEligibleSequence &&
                                    idxForm >= row.history.length - repetitionK;

                                  let specColor = "";
                                  if (isInSequenceBlock && seqPalette) {
                                    // This cell belongs to a shared sequence, utilize its custom palette style
                                    specColor = `${seqPalette.bg} ${seqPalette.text} ${seqPalette.border} ${seqPalette.ring} ${seqPalette.shadow} scale-[1.08] z-10`;
                                  } else {
                                    // Standard consecutive match logic
                                    const isRepeated =
                                      row.history.length >= 2 &&
                                      ((idxForm > 0 &&
                                        row.history[idxForm] ===
                                          row.history[idxForm - 1]) ||
                                        (idxForm < row.history.length - 1 &&
                                          row.history[idxForm] ===
                                            row.history[idxForm + 1]));

                                    if (res === "Won") {
                                      specColor = isRepeated
                                        ? "bg-emerald-500/30 text-emerald-300 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)] ring-2 ring-emerald-500 scale-[1.08] z-10"
                                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-[0_1px_5px_rgba(16,185,129,0.1)]";
                                    } else if (res === "Lost") {
                                      specColor = isRepeated
                                        ? "bg-rose-500/30 text-rose-300 border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.5)] ring-2 ring-rose-500 scale-[1.08] z-10"
                                        : "bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-[0_1px_5px_rgba(244,63,94,0.1)]";
                                    } else {
                                      specColor = isRepeated
                                        ? "bg-amber-500/25 text-amber-300 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)] ring-2 ring-amber-500 scale-[1.08] z-10"
                                        : "bg-slate-800 text-slate-300 border-white/5";
                                    }
                                  }

                                  return (
                                    <div
                                      key={idxForm}
                                      className={`w-7 h-7 flex items-center justify-center rounded-md border text-[10.5px] font-black font-mono transition-all duration-100 select-none shrink-0 ${specColor}`}
                                      title={`Match ${idxForm + 1}: ${res === "Won" ? "Victoire" : res === "Lost" ? "Défaite" : "Nul"}${isInSequenceBlock && seqPalette ? " (Fait partie d'une séquence répétée commune)" : ""}`}
                                    >
                                      {val}
                                    </div>
                                  );
                                },
                              )}
                              {/* Fill remaining space to maintain alignments if team played fewer games */}
                              {row.history.length <
                                Math.max(
                                  ...filteredTeams.map(
                                    (t: any) => t.history.length,
                                  ),
                                  0,
                                ) &&
                                Array.from({
                                  length:
                                    Math.max(
                                      ...filteredTeams.map(
                                        (t: any) => t.history.length,
                                      ),
                                      0,
                                    ) - row.history.length,
                                }).map((_, emptyIdx) => (
                                  <div
                                    key={emptyIdx}
                                    className="w-7 h-7 shrink-0 bg-transparent border border-transparent"
                                  ></div>
                                ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            /* Traditional At-a-Glance Dashboard Layout (Cards) */
            <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filteredTeams.map((row: any, idx: number) => {
                const matchRep = computedRepetitions.find(
                  (cr: any) => cr.teamName === row.teamName,
                );
                const hasReps =
                  matchRep && matchRep.matches && matchRep.matches.length > 0;
                return (
                  <div
                    key={idx}
                    className={`border rounded-xl p-3 flex flex-col justify-between hover:shadow-lg transition-all duration-300 group ${
                      hasReps
                        ? "bg-gradient-to-b from-slate-900 via-slate-900 to-amber-950/10 border-amber-500/10 hover:border-amber-500/35 hover:shadow-amber-950/5"
                        : "bg-slate-900 border-slate-800/80 hover:border-indigo-500/20 hover:shadow-indigo-950/20"
                    }`}
                  >
                    <div>
                      {/* Header: Team name, rank, and logo */}
                      <div className="flex items-center justify-between border-b border-white/[0.03] pb-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="bg-slate-950/60 text-slate-400 font-black text-[7.5px] w-4.5 h-4.5 rounded-md flex items-center justify-center border border-white/5 shadow-sm">
                            #{row.rank}
                          </span>
                          <img
                            src={getTeamLogo(row.teamName)}
                            className="w-4 h-4 object-contain shrink-0 shadow-sm"
                            alt=""
                          />
                          <span className="text-[9.5px] font-black text-slate-100 uppercase truncate pr-1">
                            {row.teamName}
                          </span>
                          {hasReps && (
                            <span className="flex h-1.5 w-1.5 relative shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-[9px] font-mono font-black text-indigo-400">
                            {row.points} pts
                          </span>
                        </div>
                      </div>

                      {/* Quick Stats Grid */}
                      <div className="grid grid-cols-3 gap-1 bg-slate-950/40 p-1.5 rounded-lg border border-white/[0.03] text-center mb-2.5">
                        <div>
                          <span className="text-[5.5px] text-slate-500 font-extrabold uppercase tracking-widest block leading-none">
                            Joués
                          </span>
                          <span className="text-[8.5px] font-mono font-black text-slate-300 mt-0.5 block">
                            {row.played}
                          </span>
                        </div>
                        <div>
                          <span className="text-[5.5px] text-emerald-500 font-extrabold uppercase tracking-widest block leading-none">
                            V %
                          </span>
                          <span className="text-[8.5px] font-mono font-black text-emerald-400 mt-0.5 block">
                            {row.winPct}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[5.5px] text-amber-500 font-extrabold uppercase tracking-widest block leading-none">
                            N %
                          </span>
                          <span className="text-[8.5px] font-mono font-black text-amber-400 mt-0.5 block">
                            {row.drawPct}%
                          </span>
                        </div>
                      </div>

                      {/* Scrollable interactive Form Line */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[7px] text-slate-500 font-black uppercase tracking-wider">
                          <span>
                            Séquence Chronologique ({row.history.length})
                          </span>
                          <span className="text-slate-600 font-medium">
                            Récent &rarr; Ancien
                          </span>
                        </div>
                        <ScrollableFormList history={row.history} size="sm" />
                      </div>
                    </div>

                    {/* Footer: Streak badge and link */}
                    <div className="mt-3 pt-2.5 border-t border-white/[0.03] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[6px] text-slate-500 font-black uppercase tracking-widest">
                          Série Actuelle :
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-[2px] text-[7.5px] font-black uppercase flex items-center gap-0.5 border ${row.streak.color}`}
                        >
                          {row.streak.type !== "None"
                            ? `${row.streak.count}x`
                            : ""}{" "}
                          {row.streak.label}
                        </span>
                      </div>

                      {hasReps ? (
                        <button
                          onClick={() => {
                            setSelectedScanTeam(row.teamName);
                            setSubTab("repetitions");
                          }}
                          className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded cursor-pointer transition-all active:scale-95 animate-pulse shrink-0"
                          title={`${matchRep.matches.length} répétitions de formes trouvées. Cliquez pour analyser l'évolution.`}
                        >
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                          <span>{matchRep.matches.length} Répétitions</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 text-indigo-400 text-[7px] hover:text-indigo-300 transition-all font-black uppercase tracking-wider select-none shrink-0">
                          <span>Analyse IA</span>
                          <ChevronRight className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredTeams.length === 0 && (
            <div className="text-slate-500 text-center py-12 font-bold uppercase text-[9px] tracking-widest bg-slate-900 rounded-xl border border-slate-800">
              Aucune équipe trouvée pour "{searchTerm}"
            </div>
          )}
        </div>
      )}

      {subTab === "dynamic" && (
        <div className="space-y-4 animate-fade-in">
          {dbBackupInfo && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-emerald-400 select-none">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] uppercase font-black tracking-widest leading-none">
                  Sauvegarde de Fin de Saison Sécurisée
                </span>
              </div>
              <div className="text-[9px] uppercase font-semibold text-slate-400 text-center sm:text-right">
                La matrice d'évolution & la matrice de forme ont été archivées
                automatiquement après le round{" "}
                <strong className="text-emerald-400 font-extrabold">
                  #{dbBackupInfo.roundSaved}
                </strong>{" "}
                ({new Date(dbBackupInfo.savedAt).toLocaleDateString()})
              </div>
            </div>
          )}
          {/* Active focus analysis banner */}
          <div className="flex flex-col lg:flex-row gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-md justify-between items-center text-slate-100">
            {/* Search Input */}
            <div className="relative w-full lg:max-w-xs shrink-0">
              <input
                type="text"
                placeholder="Rechercher une équipe..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950/60 border border-white/10 rounded-lg pl-3 pr-8 py-1.5 text-[9.5px] text-slate-100 font-extrabold uppercase placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="text-[9px] text-slate-400 font-bold uppercase">
              {activeTrackTeam ? (
                <span className="text-amber-400 animate-pulse">
                  Parcours de {activeTrackTeam} épinglé
                </span>
              ) : (
                "💡 Survolez ou cliquez pour tracer le chemin d'une équipe"
              )}
            </div>

            {/* Export pdf button */}
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all border border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-[0_0_8px_rgba(245,158,11,0.15)] select-none shrink-0"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>
                {isExporting ? "Exportation..." : "Exporter PDF (Paysage)"}
              </span>
            </button>
          </div>

          {activeTrackTeam &&
            (() => {
              const { rankTimeline } = getTeamRankHistory();
              const normK = activeTrackTeam.toLowerCase().trim();
              const timeline = rankTimeline[normK] || [];
              if (timeline.length === 0) return null;

              const best = Math.min(...timeline);
              const worst = Math.max(...timeline);
              const current = timeline[timeline.length - 1];
              const start = timeline[0];
              const finalTrend = start - current; // positive = positive progress

              return (
                <div className="bg-[#0e1626] border border-indigo-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mr-6 -mt-6 opacity-5 pointer-events-none">
                    <Activity className="w-24 h-24 text-indigo-500" />
                  </div>
                  <div className="flex items-center gap-3">
                    <img
                      src={getTeamLogo(activeTrackTeam)}
                      className="w-10 h-10 object-contain p-1 bg-slate-950/50 rounded-lg border border-white/5"
                      alt=""
                    />
                    <div>
                      <h3 className="text-[12px] font-black text-white uppercase tracking-wider">
                        Parcours Analysé : {activeTrackTeam}
                      </h3>
                      <p className="text-[7.5px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        Cliquez à nouveau pour réinitialiser le focus
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-center text-mono">
                    <div className="bg-slate-950/50 px-3 py-1.5 rounded-lg border border-white/5">
                      <span className="block text-[6px] text-slate-500 font-black uppercase tracking-wider">
                        Rang Initial
                      </span>
                      <span className="text-[11px] font-black text-slate-300">
                        #{start}
                      </span>
                    </div>
                    <div className="bg-indigo-600/10 px-3 py-1.5 rounded-lg border border-indigo-500/20">
                      <span className="block text-[6px] text-indigo-400 font-black uppercase tracking-wider">
                        Meilleur Rang
                      </span>
                      <span className="text-[11px] font-black text-indigo-300">
                        #{best}
                      </span>
                    </div>
                    <div className="bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20">
                      <span className="block text-[6px] text-rose-400 font-black uppercase tracking-wider">
                        Pire Rang
                      </span>
                      <span className="text-[11px] font-black text-rose-300">
                        #{worst}
                      </span>
                    </div>
                    <div className="bg-slate-950/50 px-3 py-1.5 rounded-lg border border-white/5">
                      <span className="block text-[6px] text-slate-500 font-black uppercase tracking-wider">
                        Rang Actuel
                      </span>
                      <span className="text-[11px] font-black text-slate-100">
                        #{current}
                      </span>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-lg border ${finalTrend > 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : finalTrend < 0 ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-slate-950/50 border-white/5 text-slate-400"}`}
                    >
                      <span className="block text-[6px] font-black uppercase tracking-wider">
                        Évolution
                      </span>
                      <span className="text-[11px] font-black">
                        {finalTrend > 0
                          ? `+${finalTrend} positions`
                          : finalTrend < 0
                            ? `${finalTrend} positions`
                            : "Stable"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Superposed Team Ranks Matrix View */}
          <div
            ref={stackedContainerRef}
            className="bg-[#0b111e] border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-4">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-indigo-400 shrink-0" />
                <div className="flex flex-col">
                  <h2 className="text-[11px] font-black text-slate-100 uppercase tracking-wider">
                    Évolution des Rangs
                  </h2>
                </div>
              </div>
              <div className="text-right">
                <span className="bg-slate-950 border border-white/5 px-3 py-1 text-[9.5px] font-black text-slate-300 uppercase rounded-full shadow-inner">
                  Total : {filteredTeams.length} équipes
                </span>
              </div>
            </div>

            {/* Stacked comparison grid container */}
            <div className="space-y-1 overflow-x-auto pb-2 custom-scrollbar">
              {/* Headers */}
              <div className="flex items-center min-w-[780px] select-none text-slate-500 font-black text-[9px] uppercase pb-2 border-b border-white/[0.03] tracking-widest font-mono">
                <div className="w-14 shrink-0 text-center">RANG</div>
                <div className="w-52 shrink-0 text-left pl-6">ÉQUIPE :</div>
                <div className="flex gap-2 pl-4">
                  {Array.from({ length: activeResults.length }).map((_, i) => (
                    <div key={i} className="w-7 text-center shrink-0">
                      R{i + 1}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rows mapped following current sorting and filtering criteria */}
              <div className="divide-y divide-white/[0.02]">
                {filteredTeams.map((row: any, idx: number) => {
                  const normKey = row.teamName.toLowerCase().trim();
                  const { rankTimeline } = getTeamRankHistory();
                  const ranksHistory = rankTimeline[normKey] || [];
                  const isTracked =
                    activeTrackTeam !== null &&
                    activeTrackTeam.toLowerCase().trim() === normKey;
                  const isAnyTracked = activeTrackTeam !== null;

                  return (
                    <div
                      key={idx}
                      onMouseEnter={() => {
                        if (!isAnyTracked) setActiveTrackTeam(row.teamName);
                      }}
                      onMouseLeave={() => {
                        if (!isAnyTracked) setActiveTrackTeam(null);
                      }}
                      onClick={() => {
                        if (isTracked) {
                          setActiveTrackTeam(null);
                        } else {
                          setActiveTrackTeam(row.teamName);
                        }
                      }}
                      className={`flex items-center py-2.5 rounded-lg transition-all duration-150 min-w-[780px] group/row cursor-pointer ${
                        isTracked
                          ? "bg-indigo-600/10 border-l-4 border-indigo-500 pl-1"
                          : isAnyTracked
                            ? "opacity-30 hover:opacity-100 hover:bg-slate-900/40"
                            : "hover:bg-slate-900/40"
                      }`}
                    >
                      {/* Rank Badge */}
                      <div className="w-14 shrink-0 text-center font-sans font-black text-xs text-slate-400 group-hover/row:text-indigo-400 transition-colors">
                        #{row.rank}
                      </div>

                      {/* Team Logo and Name */}
                      <div className="w-52 shrink-0 flex items-center justify-between pl-1">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={getTeamLogo(row.teamName)}
                            className="w-5 h-5 object-contain shrink-0 shadow-md"
                            alt=""
                          />
                          <span className="font-sans font-black text-slate-200 uppercase tracking-wide text-[10.5px] group-hover/row:text-white transition-colors truncate">
                            {row.teamName}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-slate-600 mr-2 shrink-0">
                          :
                        </span>
                      </div>

                      {/* Chronological Ranks */}
                      <div className="flex gap-2 pl-4">
                        {ranksHistory.map(
                          (currentRank: number, rIdx: number) => {
                            const prevRank =
                              rIdx > 0 ? ranksHistory[rIdx - 1] : currentRank;
                            const rankDiff = prevRank - currentRank;
                            const state =
                              rIdx === 0
                                ? "stable"
                                : rankDiff > 0
                                  ? "up"
                                  : rankDiff < 0
                                    ? "down"
                                    : "stable";

                            const isElite = currentRank <= 4;
                            const isRelegation =
                              currentRank >= rankings.length - 2;

                            let specColor = "";
                            if (state === "up") {
                              specColor =
                                "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-black shadow-[0_1px_5px_rgba(16,185,129,0.1)]";
                            } else if (state === "down") {
                              specColor =
                                "bg-rose-500/15 text-rose-400 border-rose-500/30 font-black shadow-[0_1px_5px_rgba(244,63,94,0.1)]";
                            } else {
                              if (isElite) {
                                specColor =
                                  "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-black";
                              } else if (isRelegation) {
                                specColor =
                                  "bg-slate-950/60 text-slate-300 border-rose-500/20";
                              } else {
                                specColor =
                                  "bg-slate-800 text-slate-300 border-white/5";
                              }
                            }

                            return (
                              <div
                                key={rIdx}
                                className={`w-7 h-7 flex flex-col items-center justify-center rounded-md border text-[10px] font-black font-mono transition-all duration-150 group-hover/row:scale-105 select-none shrink-0 relative ${specColor}`}
                                title={`Journée ${rIdx + 1}: Rang #${currentRank} (${state === "up" ? "Hausse" : state === "down" ? "Baisse" : "Stable"})`}
                              >
                                <span>{currentRank}</span>
                                {state === "up" && (
                                  <span className="absolute top-0 right-0.5 text-[5px] text-emerald-400 font-extrabold">
                                    ▲
                                  </span>
                                )}
                                {state === "down" && (
                                  <span className="absolute bottom-0 right-0.5 text-[5px] text-rose-400 font-extrabold">
                                    ▼
                                  </span>
                                )}
                              </div>
                            );
                          },
                        )}
                        {/* Empty padding blocks */}
                        {ranksHistory.length < activeResults.length &&
                          Array.from({
                            length: activeResults.length - ranksHistory.length,
                          }).map((_, emptyIdx) => (
                            <div
                              key={emptyIdx}
                              className="w-7 h-7 shrink-0 bg-transparent border border-transparent"
                            ></div>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === "round" && (
        <React.Fragment>
          {/* Table of Forms Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-indigo-400" />
              <h2 className="text-xs font-black text-slate-100 uppercase tracking-widest">
                Tableau des Formes par Round
              </h2>
            </div>
            <div className="space-y-2">
              {activeRankings.map((team: any, idx: number) => {
                const teamName = team.name || team.teamName;
                const history = getFullForm(teamName);
                return (
                  <div
                    key={idx}
                    className="flex flex-col gap-1 p-2 rounded bg-slate-950/40 border border-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img
                          src={getTeamLogo(teamName)}
                          className="w-3.5 h-3.5 object-contain"
                          alt=""
                        />
                        <span className="text-[9px] font-black text-slate-300 uppercase truncate">
                          {teamName}
                        </span>
                      </div>
                      <span className="text-[7px] font-bold text-slate-600">
                        {history.length} Rounds
                      </span>
                    </div>
                    <ScrollableFormList history={history} size="xs" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-950/40 text-[7.5px] p-2 rounded border-l-2 border-indigo-600 font-bold text-slate-400 uppercase tracking-widest leading-loose">
            Détails des Scores & Forme par Match
          </div>

          {activeResults.map((round: any, roundIdx: number) => (
            <div key={roundIdx} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-800 px-1.5 py-0.5 rounded-full border border-slate-700 shadow-sm">
                  Journée {round.roundNumber || round.round || roundIdx + 1}
                </h3>
                <div className="h-[1px] flex-1 bg-slate-800/40"></div>
              </div>
              <div className="grid gap-1 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {(round.matches || round).map(
                  (match: any, matchIdx: number) => {
                    let homeScore = match.homeScore ?? "-";
                    let awayScore = match.awayScore ?? "-";

                    if (match.score) {
                      const separator = match.score.includes(":") ? ":" : "-";
                      const parts = match.score.split(separator);
                      if (parts.length === 2) {
                        homeScore = parts[0];
                        awayScore = parts[1];
                      }
                    }
                    const h = parseInt(homeScore);
                    const a = parseInt(awayScore);

                    const homeOutcome = getOutcome(h, a, "h");
                    const awayOutcome = getOutcome(h, a, "a");

                    return (
                      <div
                        key={matchIdx}
                        className="data-card p-1.5 flex flex-col gap-1 hover:border-slate-700"
                      >
                        <div className="flex items-center justify-between text-[9px]">
                          <div
                            className={`flex-1 text-right font-black uppercase tracking-tighter truncate flex items-center justify-end gap-1.5 ${h > a ? "text-slate-100" : "text-slate-500"}`}
                          >
                            {homeOutcome && (
                              <span
                                className={`w-3 h-3 flex items-center justify-center rounded-[1px] text-[6px] font-black text-white ${
                                  homeOutcome === "V"
                                    ? "bg-emerald-500"
                                    : homeOutcome === "D"
                                      ? "bg-rose-500"
                                      : "bg-slate-600"
                                }`}
                              >
                                {homeOutcome}
                              </span>
                            )}
                            <span className="truncate">
                              {typeof match.homeTeam === "string"
                                ? match.homeTeam
                                : match.homeTeam?.name ||
                                  match.homeTeam?.teamName ||
                                  "Équipe"}
                            </span>
                            <img
                              src={getTeamLogo(
                                typeof match.homeTeam === "string"
                                  ? match.homeTeam
                                  : match.homeTeam?.name ||
                                      match.homeTeam?.teamName ||
                                      "Team",
                              )}
                              alt=""
                              className="w-3.5 h-3.5 object-contain shrink-0"
                              onError={(e) =>
                                (e.currentTarget.style.display = "none")
                              }
                            />
                          </div>
                          <div className="px-1.5 flex items-center gap-1">
                            <span
                              className={`w-4 h-4 flex items-center justify-center rounded font-black text-[9px] ${h > a ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20" : "bg-slate-800/50 text-slate-500"}`}
                            >
                              {homeScore}
                            </span>
                            <span className="text-slate-700 font-black text-[6px]">
                              :
                            </span>
                            <span
                              className={`w-4 h-4 flex items-center justify-center rounded font-black text-[9px] ${a > h ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20" : "bg-slate-800/50 text-slate-500"}`}
                            >
                              {awayScore}
                            </span>
                          </div>
                          <div
                            className={`flex-1 text-left font-black uppercase tracking-tighter truncate flex items-center justify-start gap-1.5 ${a > h ? "text-slate-100" : "text-slate-500"}`}
                          >
                            <img
                              src={getTeamLogo(
                                typeof match.awayTeam === "string"
                                  ? match.awayTeam
                                  : match.awayTeam?.name ||
                                      match.awayTeam?.teamName ||
                                      "Team",
                              )}
                              alt=""
                              className="w-3.5 h-3.5 object-contain shrink-0"
                              onError={(e) =>
                                (e.currentTarget.style.display = "none")
                              }
                            />
                            <span className="truncate">
                              {typeof match.awayTeam === "string"
                                ? match.awayTeam
                                : match.awayTeam?.name ||
                                  match.awayTeam?.teamName ||
                                  "Équipe"}
                            </span>
                            {awayOutcome && (
                              <span
                                className={`w-3 h-3 flex items-center justify-center rounded-[1px] text-[6px] font-black text-white ${
                                  awayOutcome === "V"
                                    ? "bg-emerald-500"
                                    : awayOutcome === "D"
                                      ? "bg-rose-500"
                                      : "bg-slate-600"
                                }`}
                              >
                                {awayOutcome}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Goal Timeline */}
                        {(match.scoreDetails?.homeGoals?.length || 0) +
                          (match.scoreDetails?.awayGoals?.length || 0) >
                          0 && (
                          <div className="flex flex-wrap gap-0.5 justify-center mt-0.5 py-0.5 px-1 bg-white/[0.02] rounded border-t border-white/[0.04]">
                            {[
                              ...(match.scoreDetails?.homeGoals?.map(
                                (g: any) => ({ ...g, side: "h" }),
                              ) || []),
                              ...(match.scoreDetails?.awayGoals?.map(
                                (g: any) => ({ ...g, side: "a" }),
                              ) || []),
                            ]
                              .sort(
                                (a, b) =>
                                  parseInt(a.minute) - parseInt(b.minute),
                              )
                              .map((g, gi) => (
                                <div
                                  key={gi}
                                  className={`flex items-center gap-0.5 px-1 rounded-[2px] border ${g.side === "h" ? "text-emerald-400 bg-emerald-500/5 border-emerald-500/10" : "text-rose-400 bg-rose-500/5 border-rose-500/10"}`}
                                >
                                  <span className="text-[9px] font-bold">
                                    {g.minute}'
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          ))}
        </React.Fragment>
      )}

      {subTab === "ar" && (
        <div className="space-y-6 animate-fade-in text-slate-100">
          {/* Header Banner */}
          <div className="flex flex-col lg:flex-row gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md justify-between items-center text-slate-100">
            <div className="flex items-center gap-2.5 shrink-0 w-full lg:w-auto">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xs font-black text-slate-100 uppercase tracking-widest">
                  Matrice Aller / Retour
                </h2>
              </div>
            </div>

            {/* Dropdown Selector */}
            <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
              <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider shrink-0 select-none">
                Équipe Focus :
              </span>
              <select
                value={activeH2HTeam || ""}
                onChange={(e) => setActiveH2HTeam(e.target.value)}
                className="bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-indigo-300 font-black uppercase focus:outline-none focus:border-indigo-500 cursor-pointer min-w-[200px]"
              >
                {activeRankings.map((t: any, idx: number) => {
                  const tName = t.name || t.teamName;
                  return (
                    <option key={idx} value={tName}>
                      {idx + 1}. {tName}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Complete Grid Table Matrix */}
          <div
            ref={arContainerRef}
            className="bg-[#0b111e] border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.04] pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  Tableau Matriciel Croisé de Double Confrontation (A/R)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[8px] text-slate-500 font-black uppercase tracking-wider hidden md:inline">
                  Lignes = Équipe à Domicile | Colonnes = Équipe à l'Extérieur
                </span>
                <button
                  type="button"
                  onClick={handleExportARPDF}
                  disabled={isExportingAR}
                  className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-[9px] font-black uppercase tracking-wider text-white rounded-md cursor-pointer transition-all border border-indigo-500/30 shadow-md whitespace-nowrap"
                  title="Exporter la matrice en fichier PDF haute résolution"
                >
                  <Download className="w-3 animate-pulse" />
                  <span>
                    {isExportingAR ? "Génération..." : "Exporter PDF"}
                  </span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-w-full rounded-xl border border-white/5 bg-slate-950/40 custom-scrollbar">
              <table className="min-w-max border-collapse">
                <thead>
                  <tr className="bg-slate-900/60 font-mono text-[8.5px] text-slate-400 uppercase tracking-widest border-b border-white/[0.04]">
                    <th className="sticky left-0 bg-slate-950 z-20 border-r border-slate-800/80 px-4 py-3 text-left font-black uppercase tracking-widest text-[9.5px]">
                      ÉQUIPE
                    </th>
                    {activeRankings.map((t: any, colIdx: number) => {
                      const tName = t.name || t.teamName;
                      return (
                        <th
                          key={colIdx}
                          className="px-2 py-3 text-center min-w-[94px] font-sans"
                        >
                          <div className="flex flex-col items-center gap-1 group/header relative cursor-help">
                            <img
                              src={getTeamLogo(tName)}
                              className="w-5 h-5 object-contain"
                              alt=""
                            />
                            <span className="text-[7.5px] text-slate-400 font-extrabold">
                              {tName.substring(0, 3).toUpperCase()}
                            </span>
                            {/* Hover tooltip for complete team name */}
                            <div className="absolute bottom-full mb-2 hidden group-hover/header:block bg-slate-950 text-slate-200 text-[8px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded shadow-2xl border border-white/10 z-30 whitespace-nowrap">
                              {tName}
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {activeRankings.map((rowT: any, rowIdx: number) => {
                    const homeTeamName = rowT.name || rowT.teamName;
                    const isFocus = activeH2HTeam === homeTeamName;

                    return (
                      <tr
                        key={rowIdx}
                        className={`transition-colors duration-100 ${
                          isFocus
                            ? "bg-indigo-600/5 hover:bg-indigo-600/10"
                            : "hover:bg-slate-900/40"
                        }`}
                      >
                        {/* Sticky Left Column with Row Name */}
                        <td
                          onClick={() => {
                            setActiveH2HTeam(homeTeamName);
                            // Avoid setting same team h2h duo
                            if (
                              selectedH2HDuo &&
                              selectedH2HDuo.teamA !== homeTeamName
                            ) {
                              setSelectedH2HDuo(null);
                            }
                          }}
                          className={`sticky left-0 z-10 border-r border-slate-800/80 px-4 py-2.5 flex items-center justify-between gap-2.5 w-48 text-left font-sans text-[10px] font-black uppercase tracking-wide cursor-pointer transition-colors ${
                            isFocus
                              ? "bg-[#0f172a]/95 text-indigo-400 border-l-4 border-l-indigo-500"
                              : "bg-[#0f172a]/95 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={getTeamLogo(homeTeamName)}
                              className="w-4 h-4 object-contain shrink-0"
                              alt=""
                            />
                            <span className="truncate">{homeTeamName}</span>
                          </div>
                          <span className="text-[7.5px] text-slate-600 font-bold font-mono">
                            #{rowIdx + 1}
                          </span>
                        </td>

                        {/* Columns mapped to opposing teams */}
                        {activeRankings.map((colT: any, colIdx: number) => {
                          const awayTeamName = colT.name || colT.teamName;

                          if (rowIdx === colIdx) {
                            return (
                              <td
                                key={colIdx}
                                className="p-1.5 min-w-[94px] text-center bg-slate-950/70 border border-white/[0.02]"
                              >
                                <div className="w-[82px] h-12 mx-auto flex items-center justify-center text-slate-800 font-mono text-xs select-none">
                                  ✖️
                                </div>
                              </td>
                            );
                          }

                          const m_RowHome = findConfrontation(
                            homeTeamName,
                            awayTeamName,
                          );
                          const m_ColHome = findConfrontation(
                            awayTeamName,
                            homeTeamName,
                          );

                          let matchAller: any = null;
                          let matchRetour: any = null;

                          if (m_RowHome && m_ColHome) {
                            const r_Row =
                              Number(
                                m_RowHome.roundNumber || m_RowHome.round,
                              ) || 0;
                            const r_Col =
                              Number(
                                m_ColHome.roundNumber || m_ColHome.round,
                              ) || 0;
                            if (r_Row <= r_Col) {
                              matchAller = m_RowHome;
                              matchRetour = m_ColHome;
                            } else {
                              matchAller = m_ColHome;
                              matchRetour = m_RowHome;
                            }
                          } else if (m_RowHome) {
                            matchAller = m_RowHome;
                          } else if (m_ColHome) {
                            matchAller = m_ColHome;
                          }

                          // Helper to extract Row and Col scores, outcome label/state and details for tooltips
                          const getMatchDetailsProps = (m: any) => {
                            if (!m)
                              return {
                                rowScore: "-",
                                colScore: "-",
                                outcomeLabel: "-",
                                outcome: null,
                                isRowHome: true,
                                roundNum: "",
                              };

                            const normRow = homeTeamName.toLowerCase().trim();
                            const isRowHome =
                              getTeamName(m.homeTeam).toLowerCase().trim() ===
                              normRow;

                            let hS = m.homeScore ?? "-";
                            let aS = m.awayScore ?? "-";
                            if (m.score) {
                              const sep = m.score.includes(":") ? ":" : "-";
                              const parts = m.score.split(sep);
                              if (parts.length === 2) {
                                hS = parts[0];
                                aS = parts[1];
                              }
                            }

                            const rowScore = isRowHome ? hS : aS;
                            const colScore = isRowHome ? aS : hS;

                            let outcome = null;
                            let outcomeLabel = "-";
                            const hVal = parseInt(hS);
                            const aVal = parseInt(aS);

                            if (!isNaN(hVal) && !isNaN(aVal)) {
                              outcome = getOutcome(
                                hVal,
                                aVal,
                                isRowHome ? "h" : "a",
                              );
                              if (outcome === "V") outcomeLabel = "V";
                              else if (outcome === "D") outcomeLabel = "D";
                              else if (outcome === "N") outcomeLabel = "N";
                            }

                            return {
                              rowScore,
                              colScore,
                              outcomeLabel,
                              outcome,
                              isRowHome,
                              roundNum: m.roundNumber || m.round || "",
                            };
                          };

                          const detailsAller = getMatchDetailsProps(matchAller);
                          const detailsRetour =
                            getMatchDetailsProps(matchRetour);

                          let allerBadgeColor =
                            "bg-slate-900/40 text-slate-500 border border-white/[0.04]";
                          if (detailsAller.outcome === "V") {
                            allerBadgeColor =
                              "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20";
                          } else if (detailsAller.outcome === "D") {
                            allerBadgeColor =
                              "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20";
                          } else if (detailsAller.outcome === "N") {
                            allerBadgeColor =
                              "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20";
                          }

                          let retourBadgeColor =
                            "bg-slate-900/40 text-slate-500 border border-white/[0.04]";
                          if (detailsRetour.outcome === "V") {
                            retourBadgeColor =
                              "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20";
                          } else if (detailsRetour.outcome === "D") {
                            retourBadgeColor =
                              "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20";
                          } else if (detailsRetour.outcome === "N") {
                            retourBadgeColor =
                              "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20";
                          }

                          return (
                            <td
                              key={colIdx}
                              className="p-1 px-[3px] min-w-[94px] border border-white/[0.01]"
                            >
                              <div className="flex flex-col gap-1 items-center justify-center py-0.5">
                                {/* Aller (Premier match joué chronologiquement) */}
                                <button
                                  onClick={() => {
                                    setActiveH2HTeam(homeTeamName);
                                    setSelectedH2HDuo({
                                      teamA: homeTeamName,
                                      teamB: awayTeamName,
                                    });
                                  }}
                                  type="button"
                                  className={`w-[82px] h-[21px] flex items-center justify-between px-1.5 rounded cursor-pointer transition-all duration-100 font-mono text-[8.5px] font-black ${allerBadgeColor}`}
                                  title={`ALLER (${detailsAller.isRowHome ? "Domicile" : "Extérieur"}) : ${homeTeamName} ${detailsAller.rowScore} - ${detailsAller.colScore} ${awayTeamName} ${matchAller ? `(Journée ${detailsAller.roundNum})` : ""}`}
                                >
                                  <span className="text-[6.5px] text-slate-400 font-bold uppercase tracking-wider">
                                    ALL
                                  </span>
                                  <span className="text-[8.5px] font-bold">
                                    {detailsAller.rowScore}:
                                    {detailsAller.colScore}
                                  </span>
                                  <span className="text-[8px] font-black w-3 text-right">
                                    {detailsAller.outcomeLabel}
                                  </span>
                                </button>

                                {/* Retour (Deuxième match joué chronologiquement) */}
                                <button
                                  onClick={() => {
                                    setActiveH2HTeam(homeTeamName);
                                    setSelectedH2HDuo({
                                      teamA: homeTeamName,
                                      teamB: awayTeamName,
                                    });
                                  }}
                                  type="button"
                                  className={`w-[82px] h-[21px] flex items-center justify-between px-1.5 rounded cursor-pointer transition-all duration-100 font-mono text-[8.5px] font-black ${retourBadgeColor}`}
                                  title={`RETOUR (${detailsRetour.isRowHome ? "Domicile" : "Extérieur"}) : ${homeTeamName} ${detailsRetour.rowScore} - ${detailsRetour.colScore} ${awayTeamName} ${matchRetour ? `(Journée ${detailsRetour.roundNum})` : ""}`}
                                >
                                  <span className="text-[6.5px] text-slate-400 font-bold uppercase tracking-wider">
                                    RET
                                  </span>
                                  <span className="text-[8.5px] font-bold">
                                    {detailsRetour.rowScore}:
                                    {detailsRetour.colScore}
                                  </span>
                                  <span className="text-[8px] font-black w-3 text-right">
                                    {detailsRetour.outcomeLabel}
                                  </span>
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-4 text-[7.5px] font-black uppercase text-slate-400 tracking-widest p-1 border-t border-white/[0.02]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500/15 border border-emerald-500/30"></span>
                <span>Victoire Domicile</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-amber-500/15 border border-amber-500/30"></span>
                <span>Match Nul</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-rose-500/15 border border-rose-500/30"></span>
                <span>Défaite Domicile</span>
              </div>
              <div className="ml-auto text-slate-500 flex items-center gap-1">
                <span>
                  💡 Astuce : Cliquez sur une ligne ou cellule pour inspecter le
                  duel en face-à-face
                </span>
              </div>
            </div>
          </div>

          {/* H2H Face-à-Face Explorer Panels */}
          {activeH2HTeam && (
            <div className="space-y-4">
              <div className="bg-[#0b101d] border border-indigo-500/15 rounded-2xl p-5 shadow-xl">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/[0.04] pb-3 mb-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={getTeamLogo(activeH2HTeam)}
                      className="w-10 h-10 object-contain p-1 bg-slate-950 rounded-lg border border-white/10 shrink-0"
                      alt=""
                    />
                    <div>
                      <h3 className="text-[11.5px] font-black text-slate-150 uppercase tracking-widest">
                        Double Confrontation Face-à-Face : {activeH2HTeam}
                      </h3>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                        Exposition détaillée de l'Aller (Domicile) et du Retour
                        (Extérieur) contre l'ensemble du championnat
                      </p>
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-white/5 py-1 px-3 rounded-full text-[9px] font-black text-indigo-400 uppercase tracking-widest shadow-inner shrink-0">
                    Analyse des Confrontations
                  </div>
                </div>

                {/* Opponents mapping cards grid */}
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
                  {activeRankings
                    .filter(
                      (t: any) => (t.name || t.teamName) !== activeH2HTeam,
                    )
                    .map((opp: any, oppIdx: number) => {
                      const oppName = opp.name || opp.teamName;

                      const allergenMatch = findConfrontation(
                        activeH2HTeam,
                        oppName,
                      );
                      const retourenMatch = findConfrontation(
                        oppName,
                        activeH2HTeam,
                      );

                      // Calculate H2H stats for activeH2HTeam against oppName
                      let pointsEarned = 0;
                      let matchesPlayed = 0;

                      let allerStatus = "Non joué";
                      let allerScoreText = "- : -";
                      let allerColor =
                        "text-slate-500 bg-slate-950/40 border border-white/[0.02]";
                      let allerGoals: any[] = [];

                      if (allergenMatch) {
                        matchesPlayed++;
                        let hS = allergenMatch.homeScore ?? "-";
                        let aS = allergenMatch.awayScore ?? "-";
                        if (allergenMatch.score) {
                          const sep = allergenMatch.score.includes(":")
                            ? ":"
                            : "-";
                          const parts = allergenMatch.score.split(sep);
                          if (parts.length === 2) {
                            hS = parts[0];
                            aS = parts[1];
                          }
                        }
                        const hVal = parseInt(hS);
                        const aVal = parseInt(aS);
                        allerScoreText = `${hS} - ${aS}`;
                        allerGoals = [
                          ...(allergenMatch.scoreDetails?.homeGoals?.map(
                            (g: any) => ({ ...g, side: "h" }),
                          ) || []),
                          ...(allergenMatch.scoreDetails?.awayGoals?.map(
                            (g: any) => ({ ...g, side: "a" }),
                          ) || []),
                        ].sort(
                          (a, b) => parseInt(a.minute) - parseInt(b.minute),
                        );

                        if (!isNaN(hVal) && !isNaN(aVal)) {
                          if (hVal > aVal) {
                            pointsEarned += 3;
                            allerStatus = "Victoire Domicile";
                            allerColor =
                              "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
                          } else if (hVal < aVal) {
                            allerStatus = "Défaite Domicile";
                            allerColor =
                              "text-rose-400 bg-rose-500/10 border border-rose-500/20";
                          } else {
                            pointsEarned += 1;
                            allerStatus = "Nul Domicile";
                            allerColor =
                              "text-amber-400 bg-amber-500/10 border border-amber-500/20";
                          }
                        }
                      }

                      let retourStatus = "Non joué";
                      let retourScoreText = "- : -";
                      let retourColor =
                        "text-slate-500 bg-slate-950/40 border border-white/[0.02]";
                      let retourGoals: any[] = [];

                      if (retourenMatch) {
                        matchesPlayed++;
                        let hS = retourenMatch.homeScore ?? "-";
                        let aS = retourenMatch.awayScore ?? "-";
                        if (retourenMatch.score) {
                          const sep = retourenMatch.score.includes(":")
                            ? ":"
                            : "-";
                          const parts = retourenMatch.score.split(sep);
                          if (parts.length === 2) {
                            hS = parts[0];
                            aS = parts[1];
                          }
                        }
                        const hVal = parseInt(hS);
                        const aVal = parseInt(aS);
                        retourScoreText = `${hS} - ${aS}`;
                        retourGoals = [
                          ...(retourenMatch.scoreDetails?.homeGoals?.map(
                            (g: any) => ({ ...g, side: "h" }),
                          ) || []),
                          ...(retourenMatch.scoreDetails?.awayGoals?.map(
                            (g: any) => ({ ...g, side: "a" }),
                          ) || []),
                        ].sort(
                          (a, b) => parseInt(a.minute) - parseInt(b.minute),
                        );

                        if (!isNaN(hVal) && !isNaN(aVal)) {
                          if (hVal < aVal) {
                            pointsEarned += 3;
                            retourStatus = "Victoire Extérieur";
                            retourColor =
                              "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
                          } else if (hVal > aVal) {
                            retourStatus = "Défaite Extérieur";
                            retourColor =
                              "text-rose-400 bg-rose-500/10 border border-rose-500/20";
                          } else {
                            pointsEarned += 1;
                            retourStatus = "Nul Extérieur";
                            retourColor =
                              "text-amber-400 bg-amber-500/10 border border-amber-500/20";
                          }
                        }
                      }

                      // Opponent list card borders
                      let oppBorder = "border-white/[0.04] bg-[#0c1322]/40";
                      let h2hBadgeColor =
                        "bg-slate-950 text-slate-400 border border-white/5";

                      if (matchesPlayed >= 1) {
                        if (pointsEarned === 6) {
                          oppBorder =
                            "border-emerald-500/40 bg-emerald-500/[0.02] shadow-[0_4px_20px_rgba(16,185,129,0.03)]";
                          h2hBadgeColor =
                            "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25";
                        } else if (pointsEarned === 4) {
                          oppBorder =
                            "border-indigo-500/30 bg-indigo-500/[0.01]";
                          h2hBadgeColor =
                            "bg-indigo-500/15 text-indigo-400 border border-indigo-500/25";
                        } else if (pointsEarned === 3 && matchesPlayed === 2) {
                          oppBorder = "border-slate-800 bg-[#0c1322]/40";
                          h2hBadgeColor =
                            "bg-slate-900 text-slate-300 border border-white/5";
                        } else if (pointsEarned === 1 || pointsEarned === 0) {
                          oppBorder = "border-rose-500/20 bg-rose-500/[0.01]";
                          h2hBadgeColor =
                            "bg-rose-500/15 text-rose-400 border border-rose-500/25";
                        }
                      }

                      return (
                        <div
                          key={oppIdx}
                          className={`border rounded-xl p-3.5 flex flex-col justify-between transition-all duration-150 relative overflow-hidden group/opp ${oppBorder}`}
                        >
                          {/* Top row: Opponent info and Points earned summary */}
                          <div className="flex items-center justify-between border-b border-white/[0.02] pb-2.5 mb-2.5">
                            <div className="flex items-center gap-2">
                              <img
                                src={getTeamLogo(oppName)}
                                className="w-6 h-6 object-contain shrink-0"
                                alt=""
                              />
                              <div>
                                <span className="text-[10px] font-black uppercase text-slate-200 tracking-wider">
                                  {oppName}
                                </span>
                                <span className="block text-[6.5px] text-slate-500 uppercase tracking-widest font-black font-mono">
                                  Standings Rank : #
                                  {activeRankings.findIndex(
                                    (r: any) =>
                                      (r.name || r.teamName) === oppName,
                                  ) + 1}
                                </span>
                              </div>
                            </div>

                            {/* Cumulative H2H display */}
                            <div
                              className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest font-mono flex items-center gap-1 ${h2hBadgeColor}`}
                            >
                              <span>BILAN :</span>
                              <span className="text-[9.5px]">
                                {pointsEarned} /{" "}
                                {matchesPlayed * 3 === 0
                                  ? 6
                                  : matchesPlayed * 3}{" "}
                                PTS
                              </span>
                            </div>
                          </div>

                          {/* Middle row: Aller & Retour confrontations displays */}
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            {/* Match Aller Box (Home) */}
                            <div className="bg-slate-950/60 rounded-lg p-2.5 border border-white/[0.02] flex flex-col justify-between min-h-[70px]">
                              <div>
                                <span className="text-[6.5px] text-slate-500 font-black uppercase tracking-widest block mb-1">
                                  🏠 Aller (Domicile)
                                </span>
                                <div
                                  className={`px-1.5 py-0.5 rounded-[2px] text-[7.5px] font-black uppercase tracking-wider inline-block ${allerColor}`}
                                >
                                  {allerScoreText}
                                </div>
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[6.5px] font-bold text-slate-400 uppercase tracking-wide">
                                <span className="truncate max-w-[55px]">
                                  {allerStatus}
                                </span>
                                {allergenMatch && (
                                  <span className="text-slate-500 font-mono">
                                    J
                                    {allergenMatch.roundNumber ||
                                      allergenMatch.round}
                                  </span>
                                )}
                              </div>
                              {/* Aller Goals rendering */}
                              {allerGoals.length > 0 && (
                                <div className="mt-1 mt-1.5 pt-1.5 border-t border-white/[0.03] flex flex-wrap gap-0.5 max-h-[22px] overflow-y-auto">
                                  {allerGoals.map((g, gi) => (
                                    <span
                                      key={gi}
                                      className={`text-[5.5px] font-black px-0.5 rounded-[1px] ${g.side === "h" ? "text-emerald-400 bg-emerald-500/5" : "text-slate-500"}`}
                                    >
                                      ⚽ {g.minute}'
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Match Retour Box (Away) */}
                            <div className="bg-slate-950/60 rounded-lg p-2.5 border border-white/[0.02] flex flex-col justify-between min-h-[70px]">
                              <div>
                                <span className="text-[6.5px] text-slate-500 font-black uppercase tracking-widest block mb-1">
                                  ✈️ Retour (Extérieur)
                                </span>
                                <div
                                  className={`px-1.5 py-0.5 rounded-[2px] text-[7.5px] font-black uppercase tracking-wider inline-block ${retourColor}`}
                                >
                                  {retourScoreText}
                                </div>
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[6.5px] font-bold text-slate-400 uppercase tracking-wide">
                                <span className="truncate max-w-[55px]">
                                  {retourStatus}
                                </span>
                                {retourenMatch && (
                                  <span className="text-slate-500 font-mono">
                                    J
                                    {retourenMatch.roundNumber ||
                                      retourenMatch.round}
                                  </span>
                                )}
                              </div>
                              {/* Retour Goals rendering */}
                              {retourGoals.length > 0 && (
                                <div className="mt-1 mt-1.5 pt-1.5 border-t border-white/[0.03] flex flex-wrap gap-0.5 max-h-[22px] overflow-y-auto">
                                  {retourGoals.map((g, gi) => (
                                    <span
                                      key={gi}
                                      className={`text-[5.5px] font-black px-0.5 rounded-[1px] ${g.side === "a" ? "text-emerald-400 bg-emerald-500/5" : "text-slate-400"}`}
                                    >
                                      ⚽ {g.minute}'
                                    </span>
                                  ))}
                                </div>
                              )}
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
      )}

      {subTab === "repetitions" && (
        <div className="space-y-6 animate-fade-in text-slate-100">
          {/* Header Card / Info banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400">
                  <Brain className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-100 uppercase tracking-widest">
                    Répétitions des Formes
                  </h2>
                </div>
              </div>

              {/* Quick Settings Streak Selector */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 bg-slate-950/60 border border-white/5 p-2 rounded-2xl">
                <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider pl-1 select-none">
                  Séquence de Forme :
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {[2, 3, 4, 5, 6, 8, 10].map((k) => (
                    <button
                      key={k}
                      onClick={() => {
                        setRepetitionK(k);
                        setSelectedScanTeam(null);
                      }}
                      type="button"
                      className={`px-2.5 py-1 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        repetitionK === k
                          ? "bg-indigo-600 text-white shadow-md border border-indigo-500/30"
                          : "bg-slate-900 text-slate-400 hover:text-white border border-transparent"
                      }`}
                    >
                      {k} Matchs
                    </button>
                  ))}

                  {/* Custom Number Input Area (No Limit) */}
                  <div className="flex items-center gap-1 border border-white/10 rounded-lg px-2 py-0.5 bg-slate-900 ml-1">
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest select-none">
                      Perso :
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={repetitionK}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val > 0) {
                          setRepetitionK(val);
                          setSelectedScanTeam(null);
                        }
                      }}
                      className="w-10 text-center bg-transparent border-none text-white text-[9.5px] font-black font-mono focus:outline-none focus:ring-0 p-0"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mt-4 pt-4 border-t border-white/[0.04]">
              <div className="flex items-center gap-1.5 text-sans text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                <Layers className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Périmètre : comparaison avec les archives des ligues
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/60 border border-white/5 p-1 rounded-2xl">
                <button
                  onClick={() => {
                    setRepetitionLeagueMode("all");
                    setSelectedScanTeam(null);
                  }}
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    repetitionLeagueMode === "all"
                      ? "bg-[#1e293b] text-indigo-400 shadow-md border border-indigo-500/20"
                      : "bg-transparent text-slate-400 hover:text-white border border-transparent"
                  }`}
                >
                  Toutes les ligues combinées
                </button>
                <button
                  onClick={() => {
                    setRepetitionLeagueMode("same");
                    setSelectedScanTeam(null);
                  }}
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    repetitionLeagueMode === "same"
                      ? "bg-[#1e293b] text-indigo-400 shadow-md border border-indigo-500/20"
                      : "bg-transparent text-slate-400 hover:text-white border border-transparent"
                  }`}
                >
                  Uniquement{" "}
                  {LEAGUES.find((l) => l.id === leagueId)?.name ||
                    "Ligue Active"}
                </button>
              </div>
            </div>
          </div>

          {!savedMatrices || savedMatrices.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
              <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto text-rose-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-250">
                  Aucun historique archivé
                </h3>
                <p className="text-[9px] text-slate-500 leading-relaxed font-bold uppercase tracking-wide">
                  Le scanner de répétitions nécessite au moins une matrice de
                  formes sauvée ou importée dans l'onglet "Archives" pour
                  fonctionner.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => {
                    const el = document.querySelector('[malagasy="Arisiva"]');
                    if (el) (el as HTMLElement).click();
                  }}
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/30 text-[9px] font-black uppercase tracking-widest py-2 px-4 rounded-lg cursor-pointer text-white shadow-md transition-all animate-pulse"
                >
                  Aller aux Archives pour importer/sauvegarder
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT HAND CONTAINER: TEAM TRAJECTORY REPETITION SCANNER */}
              <div className="lg:col-span-8 space-y-4">
                <div className="bg-[#0b111e] border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-3.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                      <span className="text-[10px] font-black text-slate-150 uppercase tracking-widest">
                        Séquence de Résultat Actuelle vs Saisons Archivées
                      </span>
                    </div>
                    <span className="text-[8px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold uppercase py-0.5 px-2.5 rounded-full tracking-wider">
                      {computedRepetitions.length} équipes scannées
                    </span>
                  </div>

                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    {computedRepetitions.map((teamRep: any) => {
                      const isExpanded = selectedScanTeam === teamRep.teamName;
                      const hasStats = teamRep.stats !== null;
                      const repCount = teamRep.matches.length;

                      return (
                        <div
                          key={teamRep.teamName}
                          className={`border rounded-2xl transition-all duration-200 ${
                            isExpanded
                              ? "bg-indigo-600/[0.04] border-indigo-500/40 shadow-lg"
                              : "bg-slate-900/45 hover:bg-slate-900/80 border-white/[0.03] hover:border-white/10"
                          }`}
                        >
                          {/* Card Header clickable */}
                          <div
                            onClick={() =>
                              setSelectedScanTeam(
                                isExpanded ? null : teamRep.teamName,
                              )
                            }
                            className="p-4 cursor-pointer select-none space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <img
                                  src={getTeamLogo(teamRep.teamName)}
                                  className="w-5.5 h-5.5 object-contain"
                                  alt=""
                                />
                                <span className="text-[10.5px] font-black text-slate-100 uppercase tracking-wide truncate max-w-[124px] sm:max-w-none font-sans">
                                  {teamRep.teamName}
                                </span>
                              </div>
                              <span
                                className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                  repCount > 0
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-slate-950 text-slate-500 border border-transparent"
                                }`}
                              >
                                {repCount}{" "}
                                {repCount > 1 ? "Répétitions" : "Répétition"}
                              </span>
                            </div>

                            {/* Current streak display */}
                            <div className="flex justify-between items-center bg-slate-950/40 p-2 rounded-xl border border-white/[0.02]">
                              <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-widest">
                                Séquence (Derniers {repetitionK}) :
                              </span>
                              <div className="flex gap-1.5">
                                {teamRep.currentSequence.map(
                                  (res: string, rid: number) => {
                                    let colorClasses =
                                      "bg-slate-900 border-white/5 text-slate-400";
                                    if (res === "Won")
                                      colorClasses =
                                        "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                                    else if (res === "Draw")
                                      colorClasses =
                                        "bg-amber-500/10 border-amber-500/20 text-amber-400";
                                    else if (res === "Lost")
                                      colorClasses =
                                        "bg-rose-500/10 border-rose-500/20 text-rose-400";

                                    return (
                                      <span
                                        key={rid}
                                        className={`w-[17px] h-[17px] flex items-center justify-center rounded text-[8px] font-black border font-mono ${colorClasses}`}
                                      >
                                        {res === "Won"
                                          ? "V"
                                          : res === "Draw"
                                            ? "N"
                                            : "D"}
                                      </span>
                                    );
                                  },
                                )}
                              </div>
                            </div>

                            {/* Prediction probability bar chart if stats available */}
                            {hasStats && teamRep.stats && (
                              <div className="space-y-1.5 pt-1">
                                <div className="flex justify-between text-[7px] font-bold text-slate-400 uppercase tracking-widest">
                                  <span>
                                    Occurrences historiques associées (
                                    {teamRep.stats.total}) :
                                  </span>
                                  <span className="text-indigo-400 font-mono font-black">
                                    Résultat suivant
                                  </span>
                                </div>
                                <div className="h-2 rounded-full overflow-hidden flex bg-slate-950/80 border border-white/5 shadow-inner">
                                  {teamRep.stats.winPct > 0 && (
                                    <div
                                      style={{
                                        width: `${teamRep.stats.winPct}%`,
                                      }}
                                      className="bg-emerald-500 relative group"
                                      title={`Prochaine Victoire: ${teamRep.stats.winPct}%`}
                                    />
                                  )}
                                  {teamRep.stats.drawPct > 0 && (
                                    <div
                                      style={{
                                        width: `${teamRep.stats.drawPct}%`,
                                      }}
                                      className="bg-amber-500 relative group"
                                      title={`Prochain Nul: ${teamRep.stats.drawPct}%`}
                                    />
                                  )}
                                  {teamRep.stats.lostPct > 0 && (
                                    <div
                                      style={{
                                        width: `${teamRep.stats.lostPct}%`,
                                      }}
                                      className="bg-rose-500 relative group"
                                      title={`Prochaine Défaite: ${teamRep.stats.lostPct}%`}
                                    />
                                  )}
                                </div>
                                {/* Probability Labels */}
                                <div className="flex items-center justify-between text-[7.5px] font-mono font-black uppercase mt-1">
                                  <span className="text-emerald-400">
                                    V: {teamRep.stats.winPct}%
                                  </span>
                                  <span className="text-amber-400">
                                    N: {teamRep.stats.drawPct}%
                                  </span>
                                  <span className="text-rose-400">
                                    D: {teamRep.stats.lostPct}%
                                  </span>
                                </div>
                              </div>
                            )}

                            {!hasStats && (
                              <div className="text-[7.5px] text-slate-500 font-bold uppercase tracking-widest text-center py-1">
                                🔮 Pas assez de suite d'historique complète pour
                                des stats
                              </div>
                            )}
                          </div>

                          {/* Expanded detail list of matches found */}
                          {isExpanded && (
                            <div className="border-t border-white/[0.04] p-3 bg-slate-950/80 rounded-b-2xl space-y-2 max-h-[220px] overflow-y-auto no-scrollbar">
                              <div className="text-[7.5px] text-indigo-400 font-black uppercase tracking-widest pl-1 mb-1">
                                Détails des Répétitions Trouvées :
                              </div>
                              {teamRep.matches.length === 0 ? (
                                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest text-center py-2">
                                  Aucun match parfait trouvé dans l'historique
                                  pour ce pattern.
                                </p>
                              ) : (
                                <div className="space-y-1.5">
                                  {teamRep.matches
                                    .slice(0, 50)
                                    .map((matchRow: any, mIdx: number) => {
                                      let badgeColor =
                                        "bg-slate-900 border-white/5 text-slate-400";
                                      if (matchRow.nextResult === "Won")
                                        badgeColor =
                                          "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                                      else if (matchRow.nextResult === "Draw")
                                        badgeColor =
                                          "bg-amber-500/10 border-amber-500/20 text-amber-400";
                                      else if (matchRow.nextResult === "Lost")
                                        badgeColor =
                                          "bg-rose-500/10 border-rose-500/20 text-rose-400";

                                      const matchLeague = LEAGUES.find(
                                        (l: any) =>
                                          l.id === Number(matchRow.leagueId),
                                      );
                                      const lName = matchLeague
                                        ? matchLeague.name
                                        : "Ligue Multiples / Inconnue";
                                      const flagUrl = matchLeague
                                        ? getLeagueFlag(matchLeague.country)
                                        : null;

                                      return (
                                        <div
                                          key={mIdx}
                                          className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-white/[0.02] hover:border-white/5 hover:bg-slate-900 transition-all gap-2"
                                        >
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              {flagUrl && (
                                                <img
                                                  src={flagUrl}
                                                  className="w-4 h-2.5 object-cover rounded shadow-sm opacity-90 shrink-0"
                                                  alt=""
                                                  title={lName}
                                                  referrerPolicy="no-referrer"
                                                />
                                              )}
                                              <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950 px-1.5 py-0.5 rounded border border-white/[0.03]">
                                                {lName}
                                              </span>
                                              <span className="text-[7.5px] font-black text-amber-405 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded font-mono text-amber-400">
                                                Saison {matchRow.season}
                                              </span>
                                              <span className="text-[7px] text-slate-400 font-extrabold uppercase tracking-widest bg-slate-950/40 border border-white/[0.02] px-1 py-0.5 rounded select-none">
                                                📁 Archivée
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                              <span className="text-[9.5px] font-black text-slate-105 uppercase text-slate-200">
                                                {matchRow.teamName} (R
                                                {matchRow.rank})
                                              </span>
                                              <span className="text-[7.5px] text-indigo-400 font-extrabold uppercase tracking-wide font-mono bg-indigo-500/10 border border-indigo-500/15 px-2 py-0.5 rounded">
                                                Séquence d'origine : J1 à J
                                                {matchRow.roundNum - 1}
                                              </span>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                            <span className="text-[7.5px] text-slate-500 font-bold uppercase tracking-widest">
                                              Suivant :
                                            </span>
                                            <span
                                              className={`px-2 py-0.5 rounded text-[8.5px] font-black border font-mono ${badgeColor}`}
                                            >
                                              {matchRow.nextResult === "Won"
                                                ? "Victoire"
                                                : matchRow.nextResult === "Draw"
                                                  ? "Nul"
                                                  : matchRow.nextResult ===
                                                      "Lost"
                                                    ? "Défaite"
                                                    : "Fin Saison"}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  {teamRep.matches.length > 50 && (
                                    <div className="text-center text-[7.5px] text-slate-500 font-bold uppercase tracking-widest py-2">
                                      + {teamRep.matches.length - 50} autres
                                      répétitions masquées pour fluidifier
                                      l'affichage
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT HAND CONTAINER: SEASON INTEGRAL SIMILARITIES */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-[#0b111e] border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                  <div className="border-b border-white/[0.04] pb-3 ml-1">
                    <h3 className="text-[10px] font-black text-slate-150 uppercase tracking-widest flex items-center gap-2">
                      <Sparkles
                        className="w-4 h-4 text-indigo-400 animate-spin"
                        style={{ animationDuration: "3s" }}
                      />{" "}
                      Similitude Globale Saisonnière
                    </h3>
                    <p className="text-[7.5px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      Compares la distribution des rangs et points avec les
                      archives
                    </p>
                  </div>

                  <div className="space-y-3">
                    {seasonSimilarities.map((similarityRow) => {
                      const m = similarityRow.matrix;
                      const dateSavedStr = new Date(
                        m.savedAt,
                      ).toLocaleDateString("fr-FR", {
                        month: "2-digit",
                        year: "numeric",
                      });
                      const isHigh = similarityRow.score >= 80;

                      return (
                        <div
                          key={m.id}
                          className="bg-slate-900/40 border border-white/[0.02] hover:border-white/[0.06] rounded-2xl p-4 transition-all relative overflow-hidden"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="text-[10.5px] font-black text-slate-200 uppercase tracking-wide font-mono">
                                Saison {m.season}
                              </span>
                              <div className="text-[7px] text-slate-500 font-black uppercase tracking-wider mt-0.5 flex items-center gap-1">
                                <span>R{m.roundSaved}</span>
                                <span>•</span>
                                <span>Sauvé en {dateSavedStr}</span>
                              </div>
                            </div>

                            {/* Score circular visual or elegant badge */}
                            <div className="text-right">
                              <span
                                className={`text-xs font-black font-mono ${
                                  isHigh
                                    ? "text-emerald-400"
                                    : "text-indigo-400"
                                }`}
                              >
                                {similarityRow.score}%
                              </span>
                              <div className="text-[6.5px] text-slate-500 font-black uppercase tracking-wider mt-0.5">
                                de similitude
                              </div>
                            </div>
                          </div>

                          {/* Progress bar similarity */}
                          <div className="w-full bg-slate-950 rounded-full h-1 my-3 overflow-hidden border border-white/[0.01]">
                            <div
                              style={{ width: `${similarityRow.score}%` }}
                              className={`h-full rounded-full ${
                                isHigh
                                  ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                                  : "bg-gradient-to-r from-indigo-500 to-indigo-400"
                              }`}
                            />
                          </div>

                          {/* Secondary metrics row */}
                          <div className="grid grid-cols-2 gap-2 mt-1 pt-1 border-t border-white/[0.02] text-[7.5px] font-bold uppercase tracking-widest text-slate-500">
                            <div>
                              Écart Moyen :{" "}
                              <span className="text-slate-350 font-mono font-black">
                                {similarityRow.averageRankDifference} Rangs
                              </span>
                            </div>
                            <div className="text-right">
                              Analysé sur :{" "}
                              <span className="text-slate-350 font-mono font-black">
                                {similarityRow.matchedTeamsCount} Équipes
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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

function BotDashboard({
  isAdmin,
  bet261Account,
  onRefreshBalance,
  botEnabled,
  setBotEnabled,
  botSettings,
  setBotSettings,
  botLogs,
  dailyBetsCount,
  showHistory,
  setShowHistory,
  historyBets,
  historyLoading,
  historyState,
  hasMoreHistory,
  fetchBetHistory,
  handleLogout,
  onForceScan,
  onOpenLogin,
}: {
  isAdmin: boolean;
  bet261Account: any;
  onRefreshBalance: () => void;
  botEnabled: boolean;
  setBotEnabled: (v: boolean) => void;
  botSettings: any;
  setBotSettings: (s: any) => void;
  botLogs: any[];
  dailyBetsCount: number;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  historyBets: any[];
  historyLoading: boolean;
  historyState: "Won" | "Lost" | "All";
  hasMoreHistory: boolean;
  fetchBetHistory: (
    state?: "Won" | "Lost" | "All",
    isLoadMore?: boolean,
  ) => void;
  handleLogout: () => void;
  onForceScan: () => void;
  onOpenLogin: () => void;
}) {
  const dailyPercent = Math.min(
    100,
    Math.round((dailyBetsCount / (botSettings.maxDailyBets || 10)) * 100),
  );

  if (!bet261Account) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 md:p-12 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[80px] -mr-32 -mt-32 rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-600/5 blur-[80px] -ml-32 -mb-32 rounded-full pointer-events-none" />

          <div className="relative z-10 max-w-md mx-auto space-y-6">
            <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center rounded-3xl mx-auto shadow-xl">
              <ShieldCheck className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-100 uppercase tracking-tighter">
                Kaonty Bet261 Tsy Mifandray
              </h2>
              <p className="text-[10px] text-rose-450 font-bold uppercase tracking-widest">
                Taratasy momba ny fiarovana
              </p>
            </div>

            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide leading-relaxed">
              Mba hahafahana mampiasa ny Bot Mahakasa sy ny fametrahana pari ho
              azy (autonome), dia mila mampifandray ny kaonty Bet261 anao
              mialoha ianao ao amin'ny fizarana kaonty.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={onOpenLogin}
                className="py-4 px-8 bg-indigo-600 hover:bg-indigo-500 hover:border-indigo-400/40 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95 shadow-lg shadow-indigo-600/20 border border-indigo-500/20 text-center"
              >
                Hampifandray ny kaonty (Se connecter)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      {/* 1. MASTER STATUS HERO CONTROL PANEL */}
      <div
        className={`border rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden transition-all duration-500 ${
          botEnabled
            ? "bg-emerald-950/20 border-emerald-500/30"
            : "bg-slate-900 border-slate-800"
        }`}
      >
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Activity
            className={`w-32 h-32 ${botEnabled ? "text-emerald-500 animate-pulse" : "text-slate-500"}`}
          />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-colors duration-500 ${
                botEnabled
                  ? "bg-emerald-500 text-slate-950 shadow-emerald-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-800"
              }`}
            >
              <ShieldCheck className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-100 uppercase tracking-tighter">
                  Bot Mahakasa
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-widest ${
                    botEnabled
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                      : "bg-slate-800 border border-slate-700 text-slate-500"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${botEnabled ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`}
                  />
                  {botEnabled ? "Mandeha (Live)" : "Mijanona (Pause)"}
                </span>
              </div>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1.5">
                Fizarana momba ny fametrahana pari ho azy (Autonome)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              onClick={() => {
                if (!isAdmin) {
                  return;
                }
                setBotEnabled(!botEnabled);
              }}
              disabled={!isAdmin}
              className={`h-11 px-8 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl flex items-center gap-2.5 border ${
                !isAdmin
                  ? "bg-slate-800 border-slate-700/50 text-slate-500 cursor-not-allowed opacity-60"
                  : botEnabled
                    ? "bg-rose-600 hover:bg-rose-500 text-white border-rose-500/30 shadow-rose-600/10 cursor-pointer active:scale-95"
                    : "bg-emerald-400 hover:bg-emerald-305 text-white border-emerald-400/20 shadow-emerald-500/10 cursor-pointer active:scale-95"
              }`}
            >
              {!isAdmin ? (
                <>
                  <Lock className="w-4 h-4 text-slate-500 animate-pulse" />
                  <span>Voahidy (Admin)</span>
                </>
              ) : (
                <>
                  {botEnabled ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {botEnabled ? "Ajanony ny Bot" : "Alefaso ny Bot"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. REALTIME METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card A: Wallet Balance */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col justify-between hover:border-slate-700/60 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Solde Bet261
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onRefreshBalance}
                className="p-1.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-slate-400 transition-all border border-slate-800 cursor-pointer"
                title="Havaozina ny solde"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleLogout}
                className="p-1.5 bg-rose-500/5 hover:bg-rose-500/15 border border-rose-500/10 rounded-lg text-rose-500 transition-all cursor-pointer"
                title="Hivoaka (Disconnect)"
              >
                <LogIn className="w-3.5 h-3.5 rotate-180" />
              </button>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xl font-mono font-black text-white tracking-tight">
              {(bet261Account.balance || 0).toLocaleString()}
              <span className="text-xs text-indigo-400 ml-1.5">AR</span>
            </p>
            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
              Kaonty:{" "}
              <span className="text-slate-300 font-mono">
                {bet261Account.username}
              </span>
            </p>
          </div>
        </div>

        {/* Card B: Quota Progress */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col justify-between hover:border-slate-700/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Pari androany
            </span>
            <span className="text-[9px] font-mono font-black text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {dailyBetsCount} / {botSettings.maxDailyBets}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            <div className="w-full bg-slate-950 h-2 rounded-full border border-slate-850 overflow-hidden">
              <div
                className="bg-indigo-550 h-full rounded-full transition-all duration-500"
                style={{ width: `${dailyPercent}%` }}
              />
            </div>
            <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">
              {dailyPercent}% tamin'ny fetra isan'andro sisa
            </p>
          </div>
        </div>

        {/* Card C: Scan Settings Status */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col justify-between hover:border-slate-700/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Hafaingan'ny fikarohana
            </span>
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-950 border border-slate-800 rounded">
              FREQ
            </span>
          </div>
          <div className="mt-4">
            <p className="text-lg font-mono font-black text-white tracking-tight flex items-baseline gap-1">
              {botSettings.checkInterval || 5}{" "}
              <span className="text-xs font-sans text-slate-500 uppercase w-auto">
                Segondra
              </span>
            </p>
            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mt-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              Loop mamerina tsy tapaka
            </p>
          </div>
        </div>
      </div>

      {/* 3. REORGANIZED MAIN BODY SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left section: Parameters Column */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
          <div className="border-b border-slate-800/60 pb-3 flex items-center justify-between">
            <h3 className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Calculator className="w-3.5 h-3.5 text-indigo-400" /> Kajikajy
              Famaritana (Settings)
            </h3>
            <span className="text-[8px] text-slate-600 font-bold uppercase">
              v2.1
            </span>
          </div>

          <div className="space-y-4">
            {/* Stake Input */}
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">
                Mise isaky ny pari (Mise par pari)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={botSettings.stake}
                  onChange={(e) =>
                    setBotSettings({
                      ...botSettings,
                      stake: Number(e.target.value),
                    })
                  }
                  disabled={!isAdmin}
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-white outline-none focus:border-indigo-500 transition-all ${
                    !isAdmin ? "opacity-50 cursor-not-allowed select-none" : ""
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8.5px] font-black text-slate-500 uppercase">
                  Ar
                </span>
              </div>
            </div>

            {/* Strategy Select */}
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">
                Tetika (Stratégie)
              </label>
              <div className="relative">
                <select
                  value={botSettings.strategy}
                  onChange={(e) =>
                    setBotSettings({
                      ...botSettings,
                      strategy: e.target.value as any,
                    })
                  }
                  disabled={!isAdmin}
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-indigo-500 appearance-none transition-all ${
                    !isAdmin
                      ? "opacity-50 cursor-not-allowed select-none"
                      : "cursor-pointer"
                  }`}
                >
                  <option value="safe">Prudent (Safe)</option>
                  <option value="balanced">Equilibré (Balanced)</option>
                  <option value="risky">Risqué (Risky)</option>
                  <option value="anomaly">
                    🔴 Anomalie de Cote (Alerte Rouge)
                  </option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-650 font-black text-[9px]">
                  ▼
                </div>
              </div>
            </div>

            {/* Check Interval Select */}
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">
                Hafaingan'ny fikarohana (Fréquence)
              </label>
              <div className="relative">
                <select
                  value={botSettings.checkInterval || 5}
                  onChange={(e) =>
                    setBotSettings({
                      ...botSettings,
                      checkInterval: Number(e.target.value),
                    })
                  }
                  disabled={!isAdmin}
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-indigo-500 appearance-none transition-all ${
                    !isAdmin
                      ? "opacity-50 cursor-not-allowed select-none"
                      : "cursor-pointer"
                  }`}
                >
                  <option value={2}>2 seconds (Haingana dia haingana)</option>
                  <option value={5}>5 seconds (Mety tsara / Recommandé)</option>
                  <option value={10}>10 seconds (Standard)</option>
                  <option value={30}>30 seconds (Mahazatra / Modéré)</option>
                  <option value={60}>60 seconds (Miadana)</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-650 font-black text-[9px]">
                  ▼
                </div>
              </div>
            </div>

            {/* Mode Option */}
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">
                Fomba fametrahana pari
              </label>
              <div className="relative">
                <select
                  value={botSettings.allowSimultaneous ? "true" : "false"}
                  onChange={(e) =>
                    setBotSettings({
                      ...botSettings,
                      allowSimultaneous: e.target.value === "true",
                    })
                  }
                  disabled={!isAdmin}
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-indigo-500 appearance-none transition-all ${
                    !isAdmin
                      ? "opacity-50 cursor-not-allowed select-none"
                      : "cursor-pointer"
                  }`}
                >
                  <option value="true">
                    Place paris multiples (Miara-mandeha)
                  </option>
                  <option value="false">
                    Seulement 1 pari par cycle (Iray isaky ny scan)
                  </option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-650 font-black text-[9px]">
                  ▼
                </div>
              </div>
              <p className="text-[7.5px] text-slate-500 italic px-1 leading-relaxed mt-1">
                Rehefa miara-mandeha dia afaka mampitombo ny isan'ny pari
                miaraka ny bot.
              </p>
            </div>
          </div>
        </div>

        {/* Right section: Activity & Logs live column */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col min-h-[380px]">
          <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-emerald-400" /> Suivi
                d'activité (Logs live)
              </h3>
              <span className="text-[8px] text-slate-500 font-bold uppercase">
                {botLogs.length} logs
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onForceScan}
                disabled={!isAdmin}
                className={`px-3 py-1.5 border rounded-lg transition-all flex items-center gap-1.5 font-bold text-[8.5px] uppercase tracking-wider ${
                  !isAdmin
                    ? "bg-slate-800 border-slate-700/50 text-slate-500 cursor-not-allowed opacity-50"
                    : "bg-emerald-500/10 hover:bg-emerald-600/90 hover:text-slate-950 border-emerald-500/20 text-emerald-400 cursor-pointer"
                }`}
                title={
                  !isAdmin
                    ? "Solo ny admin ihany no afaka mampiasa n'ity"
                    : "Forceer le scan immédiat"
                }
              >
                <Activity className="w-3 h-3" />
                Scan Handeha
              </button>

              <button
                onClick={() => {
                  setShowHistory(true);
                  fetchBetHistory("Won");
                }}
                className="px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 rounded-lg transition-all flex items-center gap-1.5 font-bold text-[8.5px] uppercase tracking-wider cursor-pointer"
              >
                <History className="w-3 h-3" />
                Historique
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[240px] flex flex-col justify-start">
            {!botEnabled && botLogs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-700">
                <ShieldCheck className="w-10 h-10 mb-3 opacity-15" />
                <p className="text-[9.5px] font-black uppercase tracking-widest opacity-40">
                  Tsy misy logs mbola hita
                </p>
                <p className="text-[8px] text-slate-500 uppercase mt-1">
                  Alefaso ny bot mba hanomboka ny suivi d'activité
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[300px] no-scrollbar pr-1">
                {botEnabled && (
                  <div className="bg-emerald-500/5 border border-emerald-500/10 p-2 rounded-xl flex items-center gap-2 mb-3 sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]"></div>
                    <span className="text-[8.5px] font-black text-emerald-400 uppercase tracking-widest">
                      Bot mamerina mampitombo lalao...
                    </span>
                  </div>
                )}
                <div className="space-y-1.5">
                  {botLogs.map((log) => (
                    <div
                      key={log.id}
                      className="text-[8px] font-medium p-2 bg-slate-950/40 rounded-lg border border-slate-800/40 flex gap-2 transition-colors hover:bg-slate-950/60"
                    >
                      <span className="text-slate-500 font-mono shrink-0 font-bold">
                        [{log.timestamp}]
                      </span>
                      <span
                        className={`leading-relaxed
                            ${log.type === "success" ? "text-emerald-400 font-bold" : ""}
                            ${log.type === "error" ? "text-rose-400 font-bold" : ""}
                            ${log.type === "warning" ? "text-amber-400" : ""}
                            ${log.type === "info" ? "text-slate-400" : ""}
                         `}
                      >
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {bet261Account && showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <div>
                <h3 className="text-xl font-black text-slate-100 uppercase tracking-tighter flex items-center gap-3">
                  {historyState === "Won" ? (
                    <>
                      <Trophy className="w-6 h-6 text-emerald-400" />
                      Gagnants (Pari azony)
                    </>
                  ) : historyState === "Lost" ? (
                    <>
                      <History className="w-6 h-6 text-rose-400" />
                      Perdants (Pari resy)
                    </>
                  ) : (
                    <>
                      <Activity className="w-6 h-6 text-indigo-400" />
                      Tantara Rehetra (All)
                    </>
                  )}
                </h3>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">
                  {historyState === "Won"
                    ? "Ny tantaranao vao haingana amin'ny fandresena"
                    : historyState === "Lost"
                      ? "Ny tantaranao vao haingana amin'ny fahaverezana"
                      : "Ny tantaranao rehetra (Gagnants & Perdants)"}
                </p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center text-slate-400 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 border-b border-slate-800 bg-slate-900/30">
              <div className="flex p-1 bg-slate-800/50 rounded-2xl gap-1">
                <button
                  onClick={() => fetchBetHistory("All")}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                    historyState === "All"
                      ? "bg-indigo-600 text-white shadow-lg"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Tout (Rehetra)
                </button>
                <button
                  onClick={() => fetchBetHistory("Won")}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                    historyState === "Won"
                      ? "bg-emerald-600 text-white shadow-lg"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Gagnants
                </button>
                <button
                  onClick={() => fetchBetHistory("Lost")}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                    historyState === "Lost"
                      ? "bg-rose-600 text-white shadow-lg"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Perdants
                </button>
              </div>
            </div>

            <div className="p-6">
              <BetHistory
                bets={historyBets}
                loading={historyLoading && historyBets.length === 0}
                state={historyState}
              />

              <div className="mt-6 flex flex-col items-center gap-4">
                {hasMoreHistory && historyBets.length > 0 && (
                  <button
                    onClick={() => fetchBetHistory(historyState, true)}
                    disabled={historyLoading}
                    className="w-full py-4 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-600/20 rounded-2xl text-[11px] font-black uppercase tracking-widest text-indigo-400 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {historyLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                    Afficher plus (Hita bebe kokoa)
                  </button>
                )}

                <button
                  onClick={() => fetchBetHistory(historyState)}
                  disabled={historyLoading}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${historyLoading && historyBets.length === 0 ? "animate-spin" : ""}`}
                  />
                  Havaozina (Refresh)
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function BetHistory({
  bets,
  loading,
  state,
}: {
  bets: any[];
  loading: boolean;
  state: "Won" | "Lost" | "All";
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
          Mampiditra ny tantara...
        </p>
      </div>
    );
  }

  if (!bets || bets.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 opacity-50">
          <History className="w-8 h-8 text-slate-500" />
        </div>
        <p className="text-slate-400 text-sm font-medium">
          Tsy mbola misy tantarana{" "}
          {state === "Won"
            ? "fandresena"
            : state === "Lost"
              ? "fahaverezana (pary resy)"
              : "fandresena na fahaverezana"}{" "}
          hita.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
      {bets.map((bet) => {
        const potentialOdds = bet.maxPayout / (bet.totalStake || 1);
        const displayOdds = bet.fixedOdds > 0 ? bet.fixedOdds : potentialOdds;
        const isWon = bet.state.includes("Won");

        return (
          <div
            key={bet.id}
            className={`bg-slate-900 border border-slate-800 rounded-xl p-4 transition-all group ${isWon ? "hover:border-emerald-500/30" : "hover:border-rose-500/30"}`}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest border ${
                      isWon
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}
                  >
                    {isWon ? "Azonao" : "Resy"}
                  </span>
                  <span className="text-[9px] text-slate-500 font-bold">
                    {new Date(bet.betDate).toLocaleDateString()}{" "}
                    {new Date(bet.betDate).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <h4 className="text-xs font-black text-slate-200 capitalize">
                  {bet.type} - {bet.betCategory}
                </h4>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">
                  {isWon ? "Gain Resultat" : "Potential"}
                </p>
                <p
                  className={`text-sm font-black tracking-tighter ${isWon ? "text-emerald-400" : "text-slate-400"}`}
                >
                  {isWon
                    ? `+${bet.earning.toLocaleString()} Ar`
                    : `${bet.maxPayout.toLocaleString()} Ar`}
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800/50">
              {bet.betLines.map((line: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-[10px]"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center font-black text-[9px] ${
                        line.state === "Won"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-slate-300 font-bold text-[10px] truncate max-w-[150px]">
                        {line.eventName}
                      </p>
                      <p className="text-slate-500 flex items-center gap-1 font-bold text-[9px]">
                        <span
                          className={`font-black uppercase ${line.state === "Won" ? "text-emerald-500" : "text-rose-500"}`}
                        >
                          {line.selectionName}
                        </span>
                        <span className="opacity-50">/</span>
                        <span className="truncate max-w-[100px]">
                          {line.eventBetTypeName}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-slate-400 font-mono font-bold">
                      @{line.odds?.toFixed(2)}
                    </p>
                    <p
                      className={`font-mono font-black text-[9px] ${line.state === "Won" ? "text-emerald-500/80" : "text-rose-500/80"}`}
                    >
                      {line.homeTeamScore}-{line.awayTeamScore}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/50 flex justify-between items-center text-[8px]">
              <div className="flex gap-3">
                <p className="text-slate-500 font-black uppercase">
                  Mise:{" "}
                  <span className="text-slate-300 font-mono">
                    {bet.totalStake.toLocaleString()}
                  </span>
                </p>
                <p className="text-slate-500 font-black uppercase">
                  Cote:{" "}
                  <span className="text-slate-300 font-mono">
                    {displayOdds?.toFixed(2)}
                  </span>
                </p>
              </div>
              <p className="text-slate-600 font-mono">
                #{String(bet.id).slice(-8)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface LoginScreenProps {
  onLoginSuccess: (
    token: string,
    user: { username: string; role: "admin" | "user"; fullName: string },
  ) => void;
}

function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [activeMode, setActiveMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    error && setError(null);
    success && setSuccess(null);
    setLoading(true);

    try {
      if (activeMode === "login") {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Erreur d’authentification");
        }

        onLoginSuccess(data.token, data.user);
      } else {
        if (!fullName.trim()) {
          throw new Error("Le nom complet est requis.");
        }
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, fullName }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Erreur lors de l’inscription");
        }

        setSuccess(
          data.message ||
            "Inscription réussie ! Veuillez patienter pendant qu’un administrateur valide votre compte.",
        );

        // Wait then clear password and switch to login tab
        setTimeout(() => {
          setActiveMode("login");
          setPassword("");
          setError(null);
        }, 5000);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[360px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 transition-all">
        {/* Core Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="bg-slate-850 p-3 rounded-xl border border-slate-800 mb-2 shadow-sm">
            <Database className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-sm font-black text-slate-100 uppercase tracking-wider">
            Mahakasa Virtual
          </h1>
          <p className="text-[8px] text-slate-500 font-extrabold uppercase tracking-widest mt-0.5">
            Application & Data Portal
          </p>
        </div>

        {/* Switch Mode Tabs */}
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-850 mb-5 text-[10px] font-black uppercase tracking-wider">
          <button
            type="button"
            onClick={() => {
              setActiveMode("login");
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-2 rounded-md transition-all ${
              activeMode === "login"
                ? "bg-slate-800 text-slate-100 border border-slate-700/60 font-black"
                : "text-slate-500 hover:text-slate-300 font-bold"
            }`}
          >
            Se Connecter
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode("register");
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-2 rounded-md transition-all ${
              activeMode === "register"
                ? "bg-slate-800 text-slate-100 border border-slate-700/60 font-black"
                : "text-slate-500 hover:text-slate-300 font-bold"
            }`}
          >
            S'inscrire
          </button>
        </div>

        {/* Alert Notifications */}
        {error && (
          <div className="mb-4 p-3 bg-rose-950/20 border border-rose-900/40 text-rose-400 rounded-lg flex items-start gap-2.5 text-[9px] font-bold leading-normal">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-extrabold uppercase tracking-wider text-rose-500">
                Erreur d'accès
              </p>
              <p className="mt-0.5 opacity-90">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-900/20 border border-emerald-900/40 text-emerald-400 rounded-lg flex items-start gap-2.5 text-[9px] font-bold leading-normal">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-extrabold uppercase tracking-wider text-emerald-500">
                Demande Envoyée
              </p>
              <p className="mt-0.5 opacity-90 text-slate-300">{success}</p>
            </div>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {activeMode === "register" && (
            <div>
              <label className="block text-[8px] font-black text-slate-500 uppercase tracking-wider mb-1 ml-1">
                Nom complet
              </label>
              <input
                type="text"
                placeholder="Ex: Jean Dupont"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/35 transition-all"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-[8px] font-black text-slate-500 uppercase tracking-wider mb-1 ml-1">
              Nom d'utilisateur
            </label>
            <input
              type="text"
              placeholder="Ex: admin, jdupont"
              value={username}
              onChange={(e) =>
                setUsername(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ""),
                )
              }
              className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/35 transition-all font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-[8px] font-black text-slate-500 uppercase tracking-wider mb-1 ml-1">
              Mot de passe
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600/35 transition-all font-mono"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 mt-5"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {activeMode === "login" ? "S'authentifier" : "Demander l'accès"}
          </button>
        </form>
      </div>
    </div>
  );
}
