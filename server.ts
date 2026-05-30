import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { WebSocketServer } from 'ws';
import { fetch as undiciFetch } from 'undici';
import { LEAGUES } from './src/shared/constants.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

// Logs storage for the scraper
const serverLogs: any[] = [];
const addServerLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    type
  };
  serverLogs.unshift(logEntry);
  if (serverLogs.length > 100) serverLogs.pop();
  console.log(`[${type.toUpperCase()}] ${message}`);
};

const fetchWithRetry = async (url: string, type: string, leagueId?: string, retries = 2, delay = 1000): Promise<any> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await undiciFetch(url, {
      signal: controller.signal as any,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://bet261.mg',
        'Referer': 'https://bet261.mg/',
        'X-HH-Language': 'fr-FR',
        'X-HH-Platform': 'web'
      }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No body');
      console.warn(`[Proxy] Response not OK: ${response.status} | URL: ${url} | Msg: ${errorText.substring(0, 100)}`);

      if (response.status >= 500 && retries > 0) {
        console.log(`[Proxy] Retrying ${url} (${retries} left)...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, type, leagueId, retries - 1, delay * 2);
      }

      if (response.status === 400 || response.status === 404 || response.status === 503) {
        if (type === 'ranking') {
          // If path format failed, try query format
          if (leagueId && url.includes(`/instantleagues/${leagueId}/ranking`)) {
            const fallbackUrl = `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/ranking?eventCategoryId=${leagueId}`;
            return fetchWithRetry(fallbackUrl, type, leagueId, 0);
          }
          // Fallback case result
          return { teams: [] };
        }
        if (type === 'matches') return { data: { rounds: [], seasonId: 0 } };
        if (type === 'results') return { data: { rounds: [] } };
        if (type === 'round') return { data: { round: { matches: [] } } };
        if (type === 'playout') return { data: { matches: [] } };
      }
      throw new Error(`Sporty API error: ${response.status}`);
    }
    return response.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (retries > 0) {
      console.log(`[Proxy] Network error, retrying ${url} (${retries} left)...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, type, leagueId, retries - 1, delay * 2);
    }
    throw err;
  }
};

// Sporty API proxy
app.get('/api/data/league/:type/:leagueId', async (req, res) => {
  const { type, leagueId } = req.params;
  const { skip = '0', take = '100' } = req.query;
  
  const urls: Record<string, string> = {
    ranking: `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/${leagueId}/ranking`,
    matches: `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/${leagueId}/matches`,
    results: `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/${leagueId}/results?skip=${skip}&take=${take}`
  };

  if (!urls[type]) return res.status(404).json({ error: 'Endpoint not found' });

  try {
    const data = await fetchWithRetry(urls[type], type, leagueId);
    res.json(data.data || data);
  } catch (err: any) {
    console.error(`[Proxy] Final Fetch Error for ${type}:`, err.message);
    if (type === 'ranking') return res.json({ teams: [] });
    if (type === 'matches') return res.json({ rounds: [], seasonId: 0 });
    if (type === 'results') return res.json({ rounds: [] });
    res.status(502).json({ error: 'Upstream service unavailable' });
  }
});

function cleanCookieHeader(rawCookies: string | string[]): string {
  if (!rawCookies) return '';
  const cookieParts: string[] = [];
  const rawStr = Array.isArray(rawCookies) ? rawCookies.join(', ') : rawCookies;
  
  // Directives we want to ignore
  const reserved = ['path', 'domain', 'expires', 'secure', 'httponly', 'samesite', 'max-age'];

  // Split on comma first to handle multiple Set-Cookie headers
  const declarations = rawStr.split(/,(?=\s*[a-zA-Z0-9_\-]+[=])/);
  for (const decl of declarations) {
    // Split each declaration on semicolon to look at its attribute-value pairs
    const pairs = decl.split(';');
    // The very first pair of a Set-Cookie header is ALWAYS the actual cookie key-value
    const firstPair = pairs[0].trim();
    if (firstPair.includes('=')) {
      const eqIdx = firstPair.indexOf('=');
      const key = firstPair.substring(0, eqIdx).trim();
      const lowerKey = key.toLowerCase();
      if (!reserved.includes(lowerKey)) {
        const val = firstPair.substring(eqIdx + 1).trim();
        cookieParts.push(`${key}=${val}`);
      }
    }
    
    // Also parse other pairs in case they are actually other valid cookies (e.g. if the input was already a clean "cookie1=val1; cookie2=val2" string)
    for (let i = 1; i < pairs.length; i++) {
      const pair = pairs[i].trim();
      if (pair.includes('=')) {
        const eqIdx = pair.indexOf('=');
        const key = pair.substring(0, eqIdx).trim();
        const lowerKey = key.toLowerCase();
        if (!reserved.includes(lowerKey) && !cookieParts.some(c => c.startsWith(key + '='))) {
          const val = pair.substring(eqIdx + 1).trim();
          cookieParts.push(`${key}=${val}`);
        }
      }
    }
  }
  return cookieParts.join('; ');
}

// Bet261 Authentication & Customer Data
app.post('/api/bet261/login', async (req, res) => {
  let { username, password, preferredVariant } = req.body;
  
  // Normalize phone number: if starts with 0, replace with +261.
  if (username) {
    username = username.trim();
    if (username.startsWith('0')) {
      username = '+261' + username.substring(1);
    } else if (username.startsWith('261')) {
      username = '+' + username;
    } else if (/^[3][23489]/.test(username) && username.length === 9) {
      // Common Malagasy mobile prefixes: 32, 33, 34, 38, 39
      username = '+261' + username;
    }
  }

  console.log(`[Bet261] Login attempt for: ${username} (normalized)`);
  
  // Use a Madagascar IP from the user's logs
  const madaIP = '102.18.161.27';
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
  
  try {
    const makeLoginRequest = async (user: string, clientId: string = 'customer-browser', platformId: string = '1', operatorId: string = '1', useJson: boolean = false) => {
      let body;
      let contentType;

      if (useJson) {
        contentType = 'application/json; charset=utf-8';
        body = JSON.stringify({
          login: user,
          password: password,
          rememberMe: false,
          withRefresh: false
        });
      } else {
        contentType = 'application/x-www-form-urlencoded';
        const p = new URLSearchParams();
        p.append('grant_type', 'password');
        p.append('username', user);
        p.append('password', password);
        p.append('scope', 'Customer');
        p.append('client_id', clientId);
        body = p.toString();
      }

      return await undiciFetch('https://hg-customer-api-prod.sporty-tech.net/api/authentication/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': contentType,
          'Origin': 'https://bet261.mg',
          'Referer': 'https://bet261.mg/home/login',
          'User-Agent': customUserAgent,
          'OperatorID': operatorId,
          'PlatformID': platformId,
          'X-Forwarded-For': madaIP,
          'X-Real-IP': madaIP,
          'True-Client-IP': madaIP,
          'Client-IP': madaIP,
          'Forwarded': `for=${madaIP}`,
          'X-HH-Language': 'fr-FR',
          'X-HH-Platform': platformId === '4' ? 'web_mobile' : 'web'
        },
        body
      });
    };

    // Try a sequence of likely valid combinations, prioritizing JSON as shown in user logs
    const rawNumber = username.replace(/\D/g, ''); // Digits only
    const nineDigits = rawNumber.endsWith(username.substring(username.length - 9)) ? username.substring(username.length - 9) : rawNumber.slice(-9);
    
    const usernameVariants = [
      username,                // e.g. +26138...
      username.replace('+', ''), // e.g. 26138...
      '0' + nineDigits,         // e.g. 038...
      nineDigits                // e.g. 38...
    ].filter((v, i, self) => self.indexOf(v) === i); // Unique only

    const attempts: any[] = [];

    // Prioritize the preferred working variant if supplied!
    if (preferredVariant && preferredVariant.u) {
      console.log(`[Bet261] Prioritizing preferred variant: User=${preferredVariant.u}, Op=${preferredVariant.o}, Plat=${preferredVariant.p}, Json=${preferredVariant.json}`);
      attempts.push({
        u: preferredVariant.u,
        c: preferredVariant.c || 'customer-browser',
        p: preferredVariant.p || '1',
        o: preferredVariant.o || '34',
        json: preferredVariant.json !== undefined ? preferredVariant.json : true
      });
    }

    const addAttempt = (att: any) => {
      const exists = attempts.some(a => a.u === att.u && a.c === att.c && a.p === att.p && a.o === att.o && a.json === att.json);
      if (!exists) {
        attempts.push(att);
      }
    };

    // Prioritize JSON Login with Operator 34 (Madagascar)
    for (const u of usernameVariants) {
      addAttempt({ u, c: 'customer-browser', p: '1', o: '34', json: true });
      addAttempt({ u, c: 'customer-browser', p: '1', o: '1', json: true });
    }
    // Fallback to Form Login if JSON fails
    for (const u of usernameVariants) {
      for (const o of ['34', '1']) {
        for (const p of ['1', '4']) {
          addAttempt({ u, c: 'customer-browser', p, o, json: false });
        }
      }
    }
    // Add PWA specific attempts
    addAttempt({ u: username, c: 'pwa', p: '1', o: '34', json: true });
    addAttempt({ u: username.replace('+', ''), c: 'pwa', p: '1', o: '1', json: true });

    let lastResponse = null;
    let lastErrText = '';

    for (const attempt of attempts) {
      console.log(`[Bet261] Trying ${attempt.json ? 'JSON' : 'FORM'} login: User=${attempt.u}, Op=${attempt.o}, Plat=${attempt.p}`);
      const response = await makeLoginRequest(attempt.u, attempt.c, attempt.p, attempt.o, attempt.json);
      
      const responseText = await response.text();
      lastResponse = response;
      lastErrText = responseText;

      if (response.ok) {
        try {
          const rawData = JSON.parse(responseText);
          
          // 1. High-reliability extraction of token from any nested variation
          const extractedToken = rawData.access_token || rawData.token || rawData.accessToken || 
                                 rawData.data?.access_token || rawData.data?.token || rawData.data?.accessToken;
          
          // 2. High-reliability extraction of primary customer profile payload
          const data = rawData.data ? { ...rawData.data } : { ...rawData };
          
           // 3. Inject operator and normalized token safely
          data.operatorId = attempt.o || rawData.operatorId || rawData.data?.operatorId || '34';
          data.access_token = extractedToken;
          data.workingVariant = {
            u: attempt.u,
            c: attempt.c,
            p: attempt.p,
            o: attempt.o,
            json: attempt.json
          };

          // 4. Capture any set-cookie headers from the Sporty API!
          const setCookieHeaders = response.headers.get('set-cookie');
          if (setCookieHeaders) {
            data.saved_cookies = setCookieHeaders;
            console.log(`[cookies] Captured set-cookie header: ${setCookieHeaders.substring(0, 50)}...`);
          } else if (typeof (response.headers as any).getSetCookie === 'function') {
            const cookiesArr = (response.headers as any).getSetCookie();
            if (cookiesArr && cookiesArr.length > 0) {
              data.saved_cookies = cookiesArr.join('; ');
              console.log(`[cookies] Captured getSetCookie: ${data.saved_cookies.substring(0, 50)}...`);
            }
          }

          console.log(`[Bet261] Login SUCCESS! User=${attempt.u}, Op=${data.operatorId}, Format=${attempt.json ? 'JSON' : 'FORM'}`);
          
          // Log a safe partial token for debugging
          const safeToken = data.access_token ? `${data.access_token.substring(0, 5)}...` : 'undefined';
          console.log(`[Bet261] Token received: ${safeToken}`);
          
          return res.json(data);
        } catch (e: any) {
          console.error(`[Bet261] Login success but body parse failed: ${e.message}`, responseText);
        }
      } else {
        try {
          const errJson = JSON.parse(responseText);
          console.log(`[Bet261] Attempt failed (Code ${errJson.code}): ${errJson.message}`);
        } catch (e) {
          console.log(`[Bet261] Attempt failed (${response.status}): ${responseText.substring(0, 100)}`);
        }
      }
    }

    console.error(`[Bet261] All login attempts failed.`);
    return res.status(lastResponse?.status || 401).json({ error: 'Login failed', details: lastErrText });
  } catch (err: any) {
    console.error(`[Bet261] Login exception: ${err.message}`);
    res.status(500).json({ error: 'Internal server error during login', details: err.message });
  }
});

app.get('/api/bet261/customer-info', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || token.includes('undefined') || token.includes('null') || token.trim() === 'Bearer') {
    return res.status(401).json({ error: 'Token missing or invalid' });
  }

  const operatorId = (req.headers['x-operator-id'] as string) || '34';
  const customCookie = req.headers['x-bet261-cookie'] as string;
  const madaIP = '102.18.161.27';
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  try {
    const fetchInfo = async (op: string) => {
      // Sporty APIs can be picky about Bearer prefix and PlatformID.
      const sendReq = async (useBearer: boolean, platformId: string, endpoint: string) => {
        let cleanToken = token;
        while (cleanToken.toLowerCase().startsWith('bearer ')) {
          cleanToken = cleanToken.substring(7).trim();
        }
        const authHeader = useBearer ? `Bearer ${cleanToken}` : cleanToken;

        const headers: any = {
          'Authorization': authHeader,
          'OperatorID': op,
          'PlatformID': platformId,
          'Origin': 'https://bet261.mg',
          'Referer': 'https://bet261.mg/',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'X-HH-Language': 'fr-FR',
          'X-HH-Platform': platformId === '4' ? 'web_mobile' : 'web',
          'X-Forwarded-For': madaIP,
          'X-Real-IP': madaIP,
          'True-Client-IP': madaIP,
          'Client-IP': madaIP,
          'Forwarded': `for=${madaIP}`,
          'User-Agent': customUserAgent
        };

        if (customCookie) {
          headers['Cookie'] = cleanCookieHeader(customCookie);
        }

        return await undiciFetch(endpoint, { headers });
      };

      const tryAllCombos = async (endpoint: string) => {
        const platforms = ['1', '4'];
        const bearers = [true, false];
        let lastResp = null;
        for (const p of platforms) {
          for (const b of bearers) {
            const r = await sendReq(b, p, endpoint);
            if (r.ok) return r;
            lastResp = r;
            if (r.status === 403) {
              console.warn(`[Bet261] 403 forbidden for Op ${op} Plat ${p} Bearer ${b}`);
            }
          }
        }
        return lastResp;
      };

      // Try main endpoint
      let res = await tryAllCombos('https://hg-customer-api-prod.sporty-tech.net/api/authentication/me?onLogin=true');
      if (res && res.ok) return res;

      // If unauthorized (401 or 403), fail early to avoid log spam and redundant fallback calls
      if (res && (res.status === 401 || res.status === 403)) {
        return res;
      }

      // Try reporting/balance as fallback (when not 401/403, e.g. other API failures)
      console.log(`[Bet261] Info failed or returned no response for Op ${op}, trying balance fallback...`);
      res = await tryAllCombos('https://hg-customer-api-prod.sporty-tech.net/api/reporting/balance');
      if (res && res.ok) return res;

      // Final fallback to generic account info
      return await sendReq(true, '1', 'https://hg-customer-api-prod.sporty-tech.net/api/authentication/me?onLogin=true');
    };

    let response = await fetchInfo(operatorId);

    // If 401 or 403, try the other common OperatorID
    if (response && (response.status === 401 || response.status === 403) && (operatorId === '34' || operatorId === '1')) {
      const altOp = operatorId === '34' ? '1' : '34';
      console.log(`[Bet261] Attempting info retry with Op ${altOp}...`);
      const retryResponse = await fetchInfo(altOp);
      if (retryResponse && retryResponse.ok) {
        response = retryResponse;
      }
    }

    if (!response || !response.ok) {
      const status = response ? response.status : 401;
      const errText = response ? await response.text() : 'No response';
      if (status === 401 || status === 403) {
        console.log(`[Bet261] Info endpoint returned unauthenticated status ${status}`);
      } else {
        console.warn(`[Bet261] Info endpoint request returned non-success code: ${status} | ${errText.substring(0, 100)}`);
      }
      return res.status(status).json({ error: 'Failed to fetch account info', details: errText });
    }

    const rawData: any = await response.json();
    const data = rawData.data || rawData;

    // Capture any set-cookie headers from the Sporty API during info fetch
    const setCookieHeaders = response.headers.get('set-cookie');
    if (setCookieHeaders) {
      data.saved_cookies = setCookieHeaders;
      console.log(`[cookies] Captured set-cookie header on info: ${setCookieHeaders.substring(0, 50)}...`);
    } else if (typeof (response.headers as any).getSetCookie === 'function') {
      const cookiesArr = (response.headers as any).getSetCookie();
      if (cookiesArr && cookiesArr.length > 0) {
        data.saved_cookies = cookiesArr.join('; ');
        console.log(`[cookies] Captured getSetCookie on info: ${data.saved_cookies.substring(0, 50)}...`);
      }
    }

    // Normalize balance: authentication/me returns balance at root
    if (data.balance === undefined && data.availableBalance !== undefined) {
      data.balance = data.availableBalance;
    }

    console.log(`[Bet261] Account info fetched. Balance: ${data.balance}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error fetching account info', details: err.message });
  }
});

async function resolveDynamicIDs(eventId: string | number, selectionName: string, suppliedLeagueId?: string | number) {
  const requestedLeagueId = Number(suppliedLeagueId || 8035);
  const otherLeagues = [8035, 8036, 8037, 8060, 8042, 8043, 8044, 8056, 8065].filter(id => id !== requestedLeagueId);
  const searchLeagues = [requestedLeagueId, ...otherLeagues];

  for (const lgId of searchLeagues) {
    try {
      const url = `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/${lgId}/matches`;
      const response = await undiciFetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://bet261.mg',
          'Referer': 'https://bet261.mg/'
        }
      });
      if (!response.ok) continue;

      const data: any = await response.json();
      const rounds = data.data?.rounds || data.rounds || [];

      for (const round of rounds) {
        const matches = round.matches || [];
        for (const match of matches) {
          if (String(match.id) === String(eventId)) {
            const markets = match.eventBetTypes || [];
            const market = markets.find((m: any) => m.betTypeId === 30083 || String(m.name).toUpperCase() === '1X2');
            if (market) {
              const items = market.eventBetTypeItems || [];
              const nameNorm = String(selectionName).trim().toUpperCase();

              let targetShortName = '1';
              if (nameNorm === 'X' || nameNorm === 'DRAW' || nameNorm === 'NUL') {
                targetShortName = 'X';
              } else if (nameNorm === '2' || nameNorm === 'AWAY') {
                targetShortName = '2';
              }

              const item = items.find((it: any) => String(it.shortName).trim().toUpperCase() === targetShortName);
              if (item) {
                console.log(`[Proxy] Resolved eventId ${eventId} (${selectionName}) to marketId ${market.id}, outcomeId ${item.id}, odds ${item.odds} in league ${lgId}`);
                return {
                  marketId: String(market.id),
                  outcomeId: String(item.id),
                  odds: String(item.odds)
                };
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`[Proxy] Failed to search league ${lgId}: ${e.message}`);
    }
  }
  return null;
}

app.get('/api/bet261/freebet', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || token.includes('undefined') || token.includes('null') || token.trim() === 'Bearer') {
    return res.status(401).json({ error: 'Token missing or invalid' });
  }

  const operatorId = (req.headers['x-operator-id'] as string) || '34';
  const customCookie = req.headers['x-bet261-cookie'] as string;
  const madaIP = '102.18.161.27';
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  try {
    const fetchFreebets = async (op: string) => {
      const sendReq = async (useBearer: boolean, platformId: string) => {
        let cleanToken = token;
        while (cleanToken.toLowerCase().startsWith('bearer ')) {
          cleanToken = cleanToken.substring(7).trim();
        }
        const authHeader = useBearer ? `Bearer ${cleanToken}` : cleanToken;

        const headers: any = {
          'Authorization': authHeader,
          'OperatorID': op,
          'PlatformID': platformId,
          'Origin': 'https://bet261.mg',
          'Referer': 'https://bet261.mg/',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'X-HH-Language': 'fr-FR',
          'X-HH-Platform': platformId === '4' ? 'web_mobile' : 'web',
          'X-Forwarded-For': madaIP,
          'X-Real-IP': madaIP,
          'True-Client-IP': madaIP,
          'Client-IP': madaIP,
          'Forwarded': `for=${madaIP}`,
          'User-Agent': customUserAgent
        };

        if (customCookie) {
          headers['Cookie'] = cleanCookieHeader(customCookie);
        }

        const url = 'https://hg-customer-api-prod.sporty-tech.net/api/freebet?forBetting=true';
        return await undiciFetch(url, { headers });
      };

      const tryAllCombos = async () => {
        const platforms = ['1', '4'];
        const bearers = [true, false];
        let lastResp = null;
        for (const p of platforms) {
          for (const b of bearers) {
            const r = await sendReq(b, p);
            if (r.ok) return r;
            lastResp = r;
          }
        }
        return lastResp;
      };

      return await tryAllCombos();
    };

    let response = await fetchFreebets(operatorId);

    if (response && (response.status === 401 || response.status === 403) && (operatorId === '34' || operatorId === '1')) {
      const altOp = operatorId === '34' ? '1' : '34';
      console.log(`[cookies] Retrying freebet fetch with Op ${altOp}...`);
      const retryResponse = await fetchFreebets(altOp);
      if (retryResponse && retryResponse.ok) {
        response = retryResponse;
      }
    }

    if (!response || !response.ok) {
      const status = response ? response.status : 401;
      const errText = response ? await response.text() : 'No response';
      if (status === 401 || status === 403) {
        console.log(`[Bet261] Freebet endpoint returned unauthenticated status ${status}`);
      } else {
        console.warn(`[Bet261] Freebet endpoint request returned non-success code: ${status} | ${errText.substring(0, 100)}`);
      }
      return res.status(status).json({ error: 'Failed to fetch freebets', details: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error(`[Bet261] Freebet exception: ${err.message}`);
    res.status(500).json({ error: 'Internal server error fetching freebets', details: err.message });
  }
});

app.post('/api/bet261/place-bet', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || token.includes('undefined') || token.includes('null') || token.trim() === 'Bearer') {
    return res.status(401).json({ error: 'Token missing or invalid' });
  }

  const operatorId = (req.headers['x-operator-id'] as string) || '34';
  const customCookie = req.headers['x-bet261-cookie'] as string;
  const madaIP = '102.18.161.27';
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  try {
    const rawSelections = req.body.selections || (req.body.bets && req.body.bets[0] && req.body.bets[0].selections) || [];
    
    // Pre-resolve dynamic IDs and actual live odds for all selections to avoid querying the games endpoint multiple times inside loops
    const resolvedDataList: any[] = [];
    for (const sel of rawSelections) {
      const resolved = await resolveDynamicIDs(sel.eventId, sel.outcomeName || sel.outcomeId, sel.leagueId);
      if (resolved) {
        resolvedDataList.push({
          success: true,
          outcomeId: String(resolved.outcomeId),
          marketId: String(resolved.marketId),
          liveOdds: String(resolved.odds),
          userOdds: String(sel.odds || resolved.odds)
        });
      } else {
        let outcomeId = sel.outcomeId;
        if (!outcomeId && sel.outcomeName) {
          const name = String(sel.outcomeName).trim().toUpperCase();
          if (name === '1' || name === 'HOME') {
            outcomeId = '1';
          } else if (name === 'X' || name === 'DRAW' || name === 'NUL') {
            outcomeId = '2';
          } else if (name === '2' || name === 'AWAY') {
            outcomeId = '3';
          }
        }
        resolvedDataList.push({
          success: false,
          fallbackOutcomeId: String(outcomeId || '1'),
          userOdds: String(sel.odds || '1.0')
        });
      }
    }

    // Function to build selections format depending on requirements of the tried strategy
    const buildSelections = (useStringIDs: boolean, useLiveOdds: boolean) => {
      const selectionsList: any[] = [];
      for (let i = 0; i < rawSelections.length; i++) {
        const rawSel = rawSelections[i];
        const rData = resolvedDataList[i];

        let outcomeId = '1';
        let marketId = '1';
        let odds = 1.0;

        if (rData.success) {
          outcomeId = rData.outcomeId;
          marketId = rData.marketId;
          odds = useLiveOdds ? Number(rData.liveOdds) : Number(rData.userOdds);
        } else {
          outcomeId = rData.fallbackOutcomeId;
          marketId = '1';
          odds = Number(rawSel.odds || rData.userOdds || '1.0');
        }

        const parsedOutcomeId = !isNaN(Number(outcomeId)) ? Number(outcomeId) : outcomeId;
        const parsedMarketId = !isNaN(Number(marketId)) ? Number(marketId) : marketId;

        selectionsList.push({
          eventId: useStringIDs ? String(rawSel.eventId) : Number(rawSel.eventId),
          outcomeId: useStringIDs ? String(outcomeId) : parsedOutcomeId,
          odds: Number(odds),
          marketId: useStringIDs ? String(marketId) : parsedMarketId,
          marketName: '1X2'
        });
      }
      return selectionsList;
    };

    // Sequential list of configurations and strategies to try if placing a bet fails
    const strategies = [
      // 1. Strings with Live Odds (the most accurate matching SportyBet's direct active state)
      { useStringIDs: true, useLiveOdds: true, oddsChangeType: 1 },
      { useStringIDs: true, useLiveOdds: true, oddsChangeType: 3 },
      { useStringIDs: true, useLiveOdds: true, oddsChangeType: 2 },
      { useStringIDs: true, useLiveOdds: true, oddsChangeType: 0 },

      // 2. Numbers with Live Odds
      { useStringIDs: false, useLiveOdds: true, oddsChangeType: 1 },
      { useStringIDs: false, useLiveOdds: true, oddsChangeType: 3 },
      { useStringIDs: false, useLiveOdds: true, oddsChangeType: 2 },

      // 3. Strings with User/Frontend Odds
      { useStringIDs: true, useLiveOdds: false, oddsChangeType: 1 },
      { useStringIDs: true, useLiveOdds: false, oddsChangeType: 3 }
    ];

    const fetchBetting = async (op: string) => {
      const stake = req.body.stake || (req.body.bets && req.body.bets[0] && req.body.bets[0].stake) || 500;
      let lastStatus = 400;
      let lastBodyText = '';

      for (const strat of strategies) {
        const selections = buildSelections(strat.useStringIDs, strat.useLiveOdds);
        
        const finalBody: any = {
          source: req.body.source || 1,
          flexi: req.body.flexi || false,
          oddsChangeType: strat.oddsChangeType,
          betLines: [
            {
              stake: Number(stake),
              type: 1
            }
          ],
          bets: [
            {
              stake: Number(stake),
              type: 1,
              selections: selections
            }
          ],
          selections: selections
        };

        if (req.body.freebetId) {
          finalBody.freebetId = Number(req.body.freebetId) || req.body.freebetId;
          if (finalBody.bets && finalBody.bets[0]) {
            finalBody.bets[0].freebetId = Number(req.body.freebetId) || req.body.freebetId;
          }
        }

        const platforms = ['1', '4'];
        const bearers = [true, false]; // true sends Bearer prefix, false sends clean token string

        for (const platformId of platforms) {
          for (const useBearer of bearers) {
            let cleanToken = token;
            while (cleanToken.toLowerCase().startsWith('bearer ')) {
              cleanToken = cleanToken.substring(7).trim();
            }
            const authHeader = useBearer ? `Bearer ${cleanToken}` : cleanToken;

             try {
              console.log(`[Proxy Trial] Op: ${op}, Strat: Strings=${strat.useStringIDs} LiveOdds=${strat.useLiveOdds} ChangeType=${strat.oddsChangeType}, Platform: ${platformId}, Bearer: ${useBearer}`);
              
              const h: any = {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'OperatorID': op,
                'PlatformID': platformId,
                'Origin': 'https://bet261.mg',
                'Referer': 'https://bet261.mg/',
                'X-HH-Language': 'fr-FR',
                'X-HH-Platform': platformId === '4' ? 'web_mobile' : 'web',
                'X-Forwarded-For': madaIP,
                'X-Real-IP': madaIP,
                'True-Client-IP': madaIP,
                'Client-IP': madaIP,
                'Forwarded': `for=${madaIP}`,
                'User-Agent': customUserAgent
              };

              if (customCookie) {
                h['Cookie'] = cleanCookieHeader(customCookie);
              }

              const response = await undiciFetch('https://hg-betting-api-prod.sporty-tech.net/api/betting', {
                method: 'POST',
                headers: h,
                body: JSON.stringify(finalBody)
              });

              const text = await response.text();
              console.log(`[Proxy Trial Response] Status: ${response.status} | Body: ${text.substring(0, 150)}`);

              if (response.ok) {
                return { ok: true, status: response.status, body: text };
              } else {
                lastStatus = response.status;
                lastBodyText = text;
              }
            } catch (err: any) {
              console.warn(`[Proxy Trial Exception] Err: ${err.message}`);
              lastBodyText = err.message;
            }
          }
        }
      }

      return { ok: false, status: lastStatus, body: lastBodyText };
    };

    let runResult = await fetchBetting(operatorId);

    if (!runResult.ok && (runResult.status === 401 || runResult.status === 403) && (operatorId === '34' || operatorId === '1')) {
      const altOp = operatorId === '34' ? '1' : '34';
      console.log(`[Proxy Retry] FAILED with operator ${operatorId}, trying operator ${altOp}...`);
      const retryResult = await fetchBetting(altOp);
      if (retryResult.ok) {
        runResult = retryResult;
      }
    }

    if (!runResult.ok) {
      console.warn(`[Bet261] Bet placement failed across all configuration trials. Status: ${runResult.status} | Body: ${runResult.body}`);
      return res.status(runResult.status).json({ error: 'Bet placement failed', details: runResult.body });
    }

    console.log(`[Bet261] Bet placement success: ${runResult.body.substring(0, 200)}`);
    const data = JSON.parse(runResult.body);
    res.json(data);
  } catch (err: any) {
    console.error(`[Bet261] Bet placement exception: ${err.message}`);
    res.status(500).json({ error: 'Internal server error placing bet', details: err.message });
  }
});

// History endpoint
app.get('/api/bet261/history', async (req, res) => {
  console.log('[Bet261] GET /api/bet261/history hit');
  const token = req.headers.authorization;
  if (!token || token.includes('undefined')) {
    return res.status(401).json({ error: 'Token missing or invalid' });
  }

  const operatorId = (req.headers['x-operator-id'] as string) || '34';
  const customCookie = req.headers['x-bet261-cookie'] as string;
  const madaIP = '102.18.161.27';
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  const skip = req.query.skip || '0';
  const take = req.query.take || '5';
  const betState = req.query.betState || 'Won';

  console.log(`[Bet261] Fetching history: skip=${skip}, take=${take}, state=${betState}, op=${operatorId}`);

  try {
    const fetchHistory = async (op: string) => {
      const sendReq = async (useBearer: boolean, platformId: string) => {
        let cleanToken = token;
        while (cleanToken.toLowerCase().startsWith('bearer ')) {
          cleanToken = cleanToken.substring(7).trim();
        }
        const authHeader = useBearer ? `Bearer ${cleanToken}` : cleanToken;

        const headers: any = {
          'Authorization': authHeader,
          'OperatorID': op,
          'PlatformID': platformId,
          'Origin': 'https://bet261.mg',
          'Referer': 'https://bet261.mg/',
          'X-Forwarded-For': madaIP,
          'X-Real-IP': madaIP,
          'True-Client-IP': madaIP,
          'Client-IP': madaIP,
          'Forwarded': `for=${madaIP}`,
          'User-Agent': customUserAgent,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'X-HH-Language': 'fr-FR',
          'X-HH-Platform': platformId === '4' ? 'web_mobile' : 'web'
        };

        if (customCookie) {
          headers['Cookie'] = cleanCookieHeader(customCookie);
        }

        return await undiciFetch(`https://hg-customer-api-prod.sporty-tech.net/api/reporting/history?skip=${skip}&take=${take}&betState=${betState}`, {
          headers
        });
      };

      const tryAllCombos = async () => {
        const platforms = ['1', '4'];
        const bearers = [true, false];
        for (const p of platforms) {
          for (const b of bearers) {
            const r = await sendReq(b, p);
            if (r.ok) return r;
          }
        }
        return null;
      };

      let res = await tryAllCombos();
      if (res && res.ok) return res;

      return await sendReq(true, '1');
    };

    let response = await fetchHistory(operatorId);

    if ((response.status === 401 || response.status === 403) && (operatorId === '34' || operatorId === '1')) {
      const altOp = operatorId === '34' ? '1' : '34';
      const retryResponse = await fetchHistory(altOp);
      if (retryResponse.ok) response = retryResponse;
    }

    const responseText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch history', details: responseText });
    }

    const data = JSON.parse(responseText);
    res.json(data);
  } catch (err: any) {
    console.error(`[Bet261] History exception: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch history', details: err.message });
  }
});

// Refactored Round Proxy
app.get('/api/data/round/:roundNumber', async (req, res) => {
  const { roundNumber } = req.params;
  const { eventCategoryId } = req.query;
  if (!eventCategoryId || eventCategoryId === 'undefined') return res.status(400).json({ error: 'eventCategoryId is required' });

  const url = `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/round/${roundNumber}?eventCategoryId=${eventCategoryId}&getNext=false`;
  try {
    const data = await fetchWithRetry(url, 'round');
    res.json(data.data || data);
  } catch (err: any) {
    res.json({ round: { matches: [], id: roundNumber, roundNumber } });
  }
});

// Refactored Playout Proxy 
app.get('/api/data/round/:roundNumber/playout', async (req, res) => {
  const { roundNumber } = req.params;
  const { eventCategoryId, parentEventCategoryId = '8056' } = req.query;
  if (!eventCategoryId || eventCategoryId === 'undefined') return res.status(400).json({ error: 'eventCategoryId is required' });

  const url = `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/round/${roundNumber}/playout?eventCategoryId=${eventCategoryId}&parentEventCategoryId=${parentEventCategoryId}`;
  console.log(`[Playout] Fetching round ${roundNumber} (Cat: ${eventCategoryId}, Parent: ${parentEventCategoryId})`);
  try {
    const data = await fetchWithRetry(url, 'playout');
    const matchesCount = data?.data?.matches?.length || data?.matches?.length || 0;
    const matchesWithGoals = (data?.data?.matches || data?.matches || []).filter((m: any) => m.goals && m.goals.length > 0).length;
    console.log(`[Playout] Received ${matchesCount} matches for round ${roundNumber} (${matchesWithGoals} with goals)`);
    res.json(data.data || data);
  } catch (err: any) {
    console.warn(`[Playout] Error for round ${roundNumber}:`, err.message);
    res.json({ matches: [] });
  }
});

// Minimal scraper status for the UI
app.get('/api/scraper/status', (_req, res) => {
  res.json({ isRunning: false, enabledLeagues: LEAGUES.map(l => l.id), logs: serverLogs });
});

app.get('/api/scraper/logs', (_req, res) => {
  res.json(serverLogs);
});

// Mock run endpoint for the manual sync button in App.tsx
app.post('/api/scraper/run', (_req, res) => {
  addServerLog("Synchronisation manuelle demandée", 'info');
  res.json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    ws.send(JSON.stringify({ message: 'Connected to Mahakasa Server' }));
  });
}

startServer();
