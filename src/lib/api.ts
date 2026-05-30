
/**
 * Utility to fetch with retries on the client side
 */
export async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 5, backoff = 2000): Promise<Response> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // If it's a server error (500+), we might want to retry too
      if (response.status >= 500 && attempt < retries) {
        const waitTime = backoff * (attempt + 1) + Math.random() * 2000;
        console.warn(`Fetch attempt ${attempt + 1} failed with status ${response.status}. Retrying in ${Math.round(waitTime)}ms...`);
        
        if (options.signal) {
          if (options.signal.aborted) throw options.signal.reason || new Error('Aborted');
          await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(resolve, waitTime);
            options.signal?.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(options.signal?.reason || new Error('Aborted'));
            }, { once: true });
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        continue;
      }
      
      return response;
    } catch (error: any) {
      lastError = error;
      
      // Don't retry if it was aborted by the signal
      if (error.name === 'AbortError') {
        throw error;
      }
      
      if (attempt < retries) {
        const waitTime = backoff * (attempt + 1) + Math.random() * 2000;
        console.warn(`Fetch attempt ${attempt + 1} failed: ${error.message}. Retrying in ${Math.round(waitTime)}ms...`);
        
        // Make the backoff wait abortable
        if (options.signal) {
          if (options.signal.aborted) throw options.signal.reason || new Error('Aborted');
          await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(resolve, waitTime);
            options.signal?.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(options.signal?.reason || new Error('Aborted'));
            }, { once: true });
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        continue;
      }
    }
  }
  
  throw lastError;
}

/**
 * Safely parses JSON response, checking content type and throwing clear errors on HTML/text
 */
export async function safeParseJSON(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const snippet = text.substring(0, 100).trim();
    throw new Error(`Format de réponse invalide. Attendu: JSON, Reçu: HTML/Texte (Status ${response.status}) [${snippet}]`);
  }
  return response.json();
}

/**
 * Optimized helper to fetch final scores for an entire round via Playout API (server proxy)
 */
export async function fetchRoundPlayout(roundId: number, eventCategoryId: string | number, parentEventCategoryId: string | number) {
  const url = `/api/data/round/${roundId}/playout?eventCategoryId=${eventCategoryId}&parentEventCategoryId=${parentEventCategoryId}`;
  
  try {
    const response = await fetchWithRetry(url);
    if (!response.ok) return null;
    return await safeParseJSON(response);
  } catch (err: any) {
    if (err && (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('cancel'))) {
      console.log(`[Playout API] Fetch for round ${roundId} was aborted/cancelled`);
    } else {
      console.warn(`[Playout API] Note: Round ${roundId} fetch skipped or retrying (${err instanceof Error ? err.message : String(err)})`);
    }
    return null;
  }
}
