import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMatches() {
  const { data, error } = await supabase
    .from('matches')
    .select('id, expectedStart, status, homeTeam, awayTeam, season, round')
    .limit(5);
    
  console.log("Matches:", data);
}

checkMatches();
