async function test() {
  const url = 'https://hg-event-api-prod.sporty-tech.net/api/instantleagues/8035/results?skip=0&take=1000';
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://bet261.mg',
        'Referer': 'https://bet261.mg/'
      }
    });
    const data = await response.json();
    console.log("Rounds returned:", data.rounds ? data.rounds.length : 0);
    if (data.rounds && data.rounds.length > 0) {
      console.log("First round:", data.rounds[0].roundNumber);
      console.log("Last round:", data.rounds[data.rounds.length - 1].roundNumber);
    }
  } catch (e) {
    console.error(e);
  }
}
test();
