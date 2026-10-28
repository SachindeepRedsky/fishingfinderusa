
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get credentials from the incoming request headers
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const apiKey = req.headers.get("apikey") ?? "";
    const authorization = req.headers.get("authorization") ?? "";

    console.log("URL available:", !!supabaseUrl);
    console.log("apiKey from header available:", !!apiKey, "length:", apiKey.length);
    console.log("authorization from header available:", !!authorization);

    if (!supabaseUrl || !apiKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase credentials' }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // Create client using the apikey from the request header
    const supabase = createClient(supabaseUrl, apiKey, {
      global: {
        headers: {
          authorization: authorization,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await req.json();
    const {
      sort_by = 'weight',
      species = 'all',
      state = 'all',
      time_period = 'all-time',
      limit = 50
    } = body;

    // Build date filter
    let dateFilter: string | null = null;
    const now = new Date();
    if (time_period === 'weekly') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = weekAgo.toISOString().split('T')[0];
    } else if (time_period === 'monthly') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = monthAgo.toISOString().split('T')[0];
    }

    // Build query
    let query = supabase
      .from('catch_log')
      .select(`
        id,
        species,
        weight_lbs,
        length_inches,
        location,
        state,
        water_body,
        date,
        method,
        lure_bait,
        photo_url,
        is_personal_best,
        catch_and_release,
        user_id,
        created_at
      `);

    if (sort_by === 'weight') {
      query = query.not('weight_lbs', 'is', null).gt('weight_lbs', 0);
    } else {
      query = query.not('length_inches', 'is', null).gt('length_inches', 0);
    }

    if (species !== 'all') {
      query = query.eq('species', species);
    }

    if (state !== 'all') {
      query = query.eq('state', state);
    }

    if (dateFilter) {
      query = query.gte('date', dateFilter);
    }

    if (sort_by === 'weight') {
      query = query.order('weight_lbs', { ascending: false });
    } else {
      query = query.order('length_inches', { ascending: false });
    }

    query = query.limit(limit);

    const { data: catches, error: catchError } = await query;

    if (catchError) {
      console.error('Catch query error:', JSON.stringify(catchError));
      return new Response(JSON.stringify({ error: catchError.message, details: JSON.stringify(catchError) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    console.log("Catches found:", catches?.length || 0);

    if (!catches || catches.length === 0) {
      // Still try to get available species/states for filter dropdowns
      const { data: allSpecies } = await supabase
        .from('catch_log')
        .select('species')
        .not('species', 'is', null);

      const { data: allStates } = await supabase
        .from('catch_log')
        .select('state')
        .not('state', 'is', null);

      const uniqueSpeciesList = [...new Set((allSpecies || []).map((s: any) => s.species).filter(Boolean))].sort();
      const uniqueStatesList = [...new Set((allStates || []).map((s: any) => s.state).filter(Boolean))].sort();

      return new Response(JSON.stringify({ 
        entries: [], 
        stats: { total_entries: 0, unique_anglers: 0, unique_species: 0, unique_states: 0 },
        available_species: uniqueSpeciesList,
        available_states: uniqueStatesList,
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    const userIds = [...new Set(catches.map((c: any) => c.user_id))];

    // Try to get profiles for anonymized names
    let profileMap: Record<string, string> = {};
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);

      if (profiles) {
        profiles.forEach((p: any) => {
          if (p.display_name) {
            const name = p.display_name;
            if (name.length <= 2) {
              profileMap[p.id] = name[0] + '*';
            } else {
              const middle = '*'.repeat(Math.min(name.length - 2, 6));
              profileMap[p.id] = name[0] + middle + name[name.length - 1];
            }
          } else {
            profileMap[p.id] = 'Angler';
          }
        });
      }
    } catch (profileErr) {
      console.error('Profile fetch error (non-fatal):', profileErr);
    }

    // Get species records for trophy badges
    let speciesWeightRecords: Record<string, string> = {};
    let speciesLengthRecords: Record<string, string> = {};

    try {
      const { data: weightRecords } = await supabase
        .from('catch_log')
        .select('id, species, weight_lbs')
        .not('weight_lbs', 'is', null)
        .gt('weight_lbs', 0)
        .order('weight_lbs', { ascending: false });

      const { data: lengthRecords } = await supabase
        .from('catch_log')
        .select('id, species, length_inches')
        .not('length_inches', 'is', null)
        .gt('length_inches', 0)
        .order('length_inches', { ascending: false });

      if (weightRecords) {
        for (const r of weightRecords) {
          if (r.species && !speciesWeightRecords[r.species]) {
            speciesWeightRecords[r.species] = r.id;
          }
        }
      }

      if (lengthRecords) {
        for (const r of lengthRecords) {
          if (r.species && !speciesLengthRecords[r.species]) {
            speciesLengthRecords[r.species] = r.id;
          }
        }
      }
    } catch (recordErr) {
      console.error('Record fetch error (non-fatal):', recordErr);
    }

    const entries = catches.map((c: any, index: number) => ({
      rank: index + 1,
      id: c.id,
      angler_name: profileMap[c.user_id] || 'Angler',
      species: c.species || 'Unknown',
      weight_lbs: c.weight_lbs ? parseFloat(c.weight_lbs) : null,
      length_inches: c.length_inches ? parseFloat(c.length_inches) : null,
      location: c.location || 'Unknown',
      state: c.state || 'Unknown',
      water_body: c.water_body,
      date: c.date,
      method: c.method,
      lure_bait: c.lure_bait,
      photo_url: c.photo_url,
      catch_and_release: c.catch_and_release,
      is_species_weight_record: speciesWeightRecords[c.species] === c.id,
      is_species_length_record: speciesLengthRecords[c.species] === c.id,
    }));

    // Get available species/states for filter dropdowns
    const { data: allSpecies } = await supabase
      .from('catch_log')
      .select('species')
      .not('species', 'is', null);

    const { data: allStates } = await supabase
      .from('catch_log')
      .select('state')
      .not('state', 'is', null);

    const uniqueSpeciesList = [...new Set((allSpecies || []).map((s: any) => s.species).filter(Boolean))].sort();
    const uniqueStatesList = [...new Set((allStates || []).map((s: any) => s.state).filter(Boolean))].sort();

    const stats = {
      total_entries: catches.length,
      unique_anglers: userIds.length,
      unique_species: new Set(catches.map((c: any) => c.species).filter(Boolean)).size,
      unique_states: new Set(catches.map((c: any) => c.state).filter(Boolean)).size,
    };

    return new Response(JSON.stringify({ 
      entries, 
      stats,
      available_species: uniqueSpeciesList,
      available_states: uniqueStatesList,
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });

  } catch (err) {
    console.error('Leaderboard error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
});
