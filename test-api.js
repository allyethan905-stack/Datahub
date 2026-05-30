async function test() {
  const url = 'https://hg-event-api-prod.sporty-tech.net/api/instantleagues/8035/matches';
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://bet261.mg',
        'Referer': 'https://bet261.mg/'
      }
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2).substring(0, 3000));
  } catch (e) {
    console.error(e);
  }
}

test();
