import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function check() {
  console.log("--- LATEST MATCHES ---");
  const { data, error } = await supabase
    .from('matches')
    .select('id, leagueId, season, round, status, homeScore, awayScore, odds1, updatedAt')
    .order('updatedAt', { ascending: false })
    .limit(5);
    
  if (error) console.error("DB Error:", error);
  else console.table(data);

  console.log("\n--- SCRAPER LOGS ---");
  try {
    const res = await fetch('http://localhost:3000/api/scraper/logs');
    const logs = await res.json();
    logs.slice(0, 10).forEach((l: any) => console.log(`[${l.timestamp}] ${l.type.toUpperCase()}: ${l.message}`));
  } catch (e: any) {
    console.error("Could not fetch logs:", e.message);
  }
}
check();
