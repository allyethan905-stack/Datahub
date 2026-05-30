
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  console.log('Checking "matches" table with leagueId 8036...');
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('leagueId', 8036)
    .order('updatedAt', { ascending: false })
    .limit(2000);

  if (error) {
    console.error('Error fetching matches:', error);
  } else {
    console.log('Successfully fetched matches. Table exists.');
    if (data.length > 0) {
      console.log('Sample match:', data[0]);
    } else {
      console.log('Table is empty.');
    }
  }
}

checkTable();
