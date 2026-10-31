import { createClient } from '@supabase/supabase-js';


// Initialize database client
const supabaseUrl = 'https://xybqfeyhvifnstkhooba.supabase.co' 
// const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5YnFmZXlodmlmbnN0a2hvb2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MTUzNzUsImV4cCI6MjEwODk5MTM3NX0.5cIvMNDdxaqhC-_V0DYcA2CFcEw2IaaQjXkhg3OrmWA'
// 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRhN2Y2YzcyLWMwNTktNDUzZi1iMjM1LWIyZTc5ZmExNjkwZiJ9.eyJwcm9qZWN0SWQiOiJlcmJsaWdpd2tkZnd4a2h2d2VwdyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY4NjExNjU3LCJleHAiOjIwODM5NzE2NTcsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.vs5h-rakroCz3b95y9l0OTyvikOb6AdjngntTfY1Sis';
const supabase = createClient(supabaseUrl, supabaseKey);


export { supabase };


async function testSupabaseConnection() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')

  console.log('Fetched data:', data);
  console.log('Supabase error:', error);
}

testSupabaseConnection();