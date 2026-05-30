async function test() {
  try {
    const res1 = await fetch('http://localhost:3000/api/proxy/sporty/ranking/8035');
    console.log('proxy ranking status:', res1.status);
    const text1 = await res1.text();
    console.log('proxy ranking body:', text1);
    
    const res2 = await fetch('http://localhost:3000/api/predict-round-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leagueId: 8035 })
    });
    console.log('predict-round-prompt status:', res2.status);
    const text2 = await res2.text();
    console.log('predict-round-prompt body:', text2);
  } catch (e) {
    console.error('error:', e);
  }
}
test();
