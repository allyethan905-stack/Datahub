import { LEAGUES } from './src/shared/constants.js';

async function test() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://bet261.mg',
    'Referer': 'https://bet261.mg/'
  };
  
  for (const league of LEAGUES) {
    const url = `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/${league.id}/ranking`;
    try {
      const res = await fetch(url, { headers });
      console.log(`league ${league.id} ranking status:`, res.status);
    } catch (e) {
      console.error(`league ${league.id} ranking error:`, e);
    }
  }
}
test();
