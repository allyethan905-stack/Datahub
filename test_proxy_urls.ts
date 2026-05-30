
async function test() {
  const leagueId = 8042;
  const urls = {
    ranking_instant: `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/${leagueId}/ranking`,
  };

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://bet261.mg',
    'Referer': 'https://bet261.mg/'
  };

  for (const [name, url] of Object.entries(urls)) {
    try {
      const res = await fetch(url, { headers });
      console.log(`${name} status: ${res.status}`);
      if (res.ok) {
        const json = await res.json();
        console.log(`${name} keys:`, Object.keys(json));
        if (json.data) console.log(`${name} data keys:`, Object.keys(json.data));
      } else {
        const text = await res.text();
        console.log(`${name} error body:`, text);
      }
    } catch (e: any) {
      console.error(`${name} fetch error:`, e.message);
    }
  }
}

test();
