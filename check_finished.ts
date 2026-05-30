import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function check() {
  console.log("--- LATEST FINISHED MATCHES ---");
  const { data, error } = await supabase
    .from('matches')
    .select('id, round, status, homeScore, awayScore, odds1, updatedAt')
    .eq('status', 'Finished')
    .order('updatedAt', { ascending: false })
    .limit(5);
    
  if (error) console.error("DB Error:", error);
  else console.table(data);
}
check();
