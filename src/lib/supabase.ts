import { createClient } from '@supabase/supabase-js';


// Initialize database client
const supabaseUrl = 'https://erbligiwkdfwxkhvwepw.databasepad.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRhN2Y2YzcyLWMwNTktNDUzZi1iMjM1LWIyZTc5ZmExNjkwZiJ9.eyJwcm9qZWN0SWQiOiJlcmJsaWdpd2tkZnd4a2h2d2VwdyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzY4NjExNjU3LCJleHAiOjIwODM5NzE2NTcsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.vs5h-rakroCz3b95y9l0OTyvikOb6AdjngntTfY1Sis';
const supabase = createClient(supabaseUrl, supabaseKey);


export { supabase };