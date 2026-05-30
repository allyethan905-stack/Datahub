async function test() {
  const url1 = 'https://hg-event-api-prod.sporty-tech.net/api/instantleagues/8035/results';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://bet261.mg',
    'Referer': 'https://bet261.mg/'
  };
  
  try {
    const res1 = await fetch(url1, { headers });
    console.log('results status:', res1.status);
    const text = await res1.text();
    console.log('results body:', text);
  } catch (e) {
    console.error('results error:', e);
  }
}
test();
