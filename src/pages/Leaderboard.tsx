
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';

// Inline SVG icons
const FishIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6-3.56 0-7.56-2.54-8.5-6Z"/>
    <path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/>
    <path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5 .23 6.5C5.58 18.03 7 16 7 13.33"/>
  </svg>
);
const TrophyIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  </svg>
);
const ScaleIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
  </svg>
);
const RulerIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>
  </svg>
);
const MapPinIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const CalendarIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
  </svg>
);
const ArrowLeftIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
  </svg>
);
const SpinnerIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);
const StarIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const RefreshIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
  </svg>
);

interface LeaderboardEntry {
  rank: number;
  id: string;
  angler_name: string;
  species: string;
  weight_lbs: number | null;
  length_inches: number | null;
  location: string;
  state: string;
  water_body: string | null;
  date: string;
  method: string | null;
  lure_bait: string | null;
  photo_url: string | null;
  catch_and_release: boolean;
  is_species_weight_record: boolean;
  is_species_length_record: boolean;
}

interface LeaderboardStats {
  total_entries: number;
  unique_anglers: number;
  unique_species: number;
  unique_states: number;
}

const formatDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr || 'Unknown'; }
};

const anonymizeName = (name: string | null): string => {
  if (!name) return 'Angler';
  if (name.length <= 2) return name[0] + '*';
  const middle = '*'.repeat(Math.min(name.length - 2, 6));
  return name[0] + middle + name[name.length - 1];
};

const getRankStyle = (rank: number) => {
  if (rank === 1) return { bg: 'bg-gradient-to-r from-yellow-500/30 to-amber-500/20', border: 'border-yellow-500/50', text: 'text-yellow-400', medal: 'bg-yellow-500' };
  if (rank === 2) return { bg: 'bg-gradient-to-r from-gray-400/20 to-slate-400/10', border: 'border-gray-400/40', text: 'text-gray-300', medal: 'bg-gray-400' };
  if (rank === 3) return { bg: 'bg-gradient-to-r from-amber-700/20 to-orange-700/10', border: 'border-amber-700/40', text: 'text-amber-600', medal: 'bg-amber-700' };
  return { bg: 'bg-white/5', border: 'border-white/10', text: 'text-blue-300', medal: 'bg-slate-600' };
};

const Leaderboard: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<LeaderboardStats>({ total_entries: 0, unique_anglers: 0, unique_species: 0, unique_states: 0 });
  const [availableSpecies, setAvailableSpecies] = useState<string[]>([]);
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sortBy, setSortBy] = useState<'weight' | 'length'>('weight');
  const [species, setSpecies] = useState('all');
  const [state, setState] = useState('all');
  const [timePeriod, setTimePeriod] = useState('all-time');
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Build date filter
      let dateFilter: string | null = null;
      const now = new Date();
      if (timePeriod === 'weekly') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = weekAgo.toISOString().split('T')[0];
      } else if (timePeriod === 'monthly') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = monthAgo.toISOString().split('T')[0];
      }

      // Build query
      let query = supabase
        .from('catch_log')
        .select('id, species, weight_lbs, length_inches, location, state, water_body, date, method, lure_bait, photo_url, is_personal_best, catch_and_release, user_id, created_at');

      if (sortBy === 'weight') {
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

      if (sortBy === 'weight') {
        query = query.order('weight_lbs', { ascending: false });
      } else {
        query = query.order('length_inches', { ascending: false });
      }

      query = query.limit(50);

      const { data: catches, error: catchError } = await query;

      if (catchError) {
        throw new Error(catchError.message);
      }

      // Get available species and states for filters
      const { data: allCatches } = await supabase
        .from('catch_log')
        .select('species, state');

      const uniqueSpeciesList = [...new Set((allCatches || []).map(c => c.species).filter(Boolean))].sort() as string[];
      const uniqueStatesList = [...new Set((allCatches || []).map(c => c.state).filter(Boolean))].sort() as string[];
      setAvailableSpecies(uniqueSpeciesList);
      setAvailableStates(uniqueStatesList);

      if (!catches || catches.length === 0) {
        setEntries([]);
        setStats({ total_entries: 0, unique_anglers: 0, unique_species: 0, unique_states: 0 });
        return;
      }

      // Get profiles for anonymized names
      const userIds = [...new Set(catches.map(c => c.user_id))];
      const profileMap: Record<string, string> = {};

      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds);

        if (profiles) {
          profiles.forEach((p: any) => {
            profileMap[p.id] = anonymizeName(p.display_name);
          });
        }
      } catch {
        // Non-fatal - just use default names
      }

      // Determine species records for trophy badges
      const speciesWeightRecords: Record<string, string> = {};
      const speciesLengthRecords: Record<string, string> = {};

      // Get all catches to determine records (not just filtered ones)
      try {
        const { data: weightRecs } = await supabase
          .from('catch_log')
          .select('id, species, weight_lbs')
          .not('weight_lbs', 'is', null)
          .gt('weight_lbs', 0)
          .order('weight_lbs', { ascending: false });

        if (weightRecs) {
          for (const r of weightRecs) {
            if (r.species && !speciesWeightRecords[r.species]) {
              speciesWeightRecords[r.species] = r.id;
            }
          }
        }

        const { data: lengthRecs } = await supabase
          .from('catch_log')
          .select('id, species, length_inches')
          .not('length_inches', 'is', null)
          .gt('length_inches', 0)
          .order('length_inches', { ascending: false });

        if (lengthRecs) {
          for (const r of lengthRecs) {
            if (r.species && !speciesLengthRecords[r.species]) {
              speciesLengthRecords[r.species] = r.id;
            }
          }
        }
      } catch {
        // Non-fatal
      }

      const leaderboardEntries: LeaderboardEntry[] = catches.map((c: any, index: number) => ({
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

      setEntries(leaderboardEntries);
      setStats({
        total_entries: catches.length,
        unique_anglers: userIds.length,
        unique_species: new Set(catches.map((c: any) => c.species).filter(Boolean)).size,
        unique_states: new Set(catches.map((c: any) => c.state).filter(Boolean)).size,
      });
    } catch (err: any) {
      console.error('Leaderboard fetch error:', err);
      setError(err?.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [sortBy, species, state, timePeriod]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 rounded-lg transition">
              <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-sm">Community Leaderboard</p>
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-6">
              <button onClick={() => navigate('/')} className="text-blue-200 hover:text-white transition flex items-center gap-1.5 text-sm"><ArrowLeftIcon /> Spots</button>
              <button onClick={() => navigate('/fish-guide')} className="text-blue-200 hover:text-white transition text-sm">Fish Guide</button>
              <button onClick={() => navigate('/my-catches')} className="text-blue-200 hover:text-white transition text-sm">Catch Log</button>
              <span className="text-white font-medium text-sm flex items-center gap-1.5"><TrophyIcon className="w-4 h-4" /> Leaderboard</span>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-12 md:py-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-900/20 via-slate-900/30 to-slate-900" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-400/30 rounded-full px-4 py-2 mb-6">
            <TrophyIcon className="w-4 h-4 text-amber-400" />
            <span className="text-amber-300 text-sm font-medium">Community Rankings</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-4">
            <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 bg-clip-text text-transparent">Leaderboard</span>
          </h2>
          <p className="text-xl text-blue-200 mb-6 max-w-2xl mx-auto">
            See the biggest catches from anglers across the nation. Filter by species, state, and time period.
          </p>
          {/* Stats row */}
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-6 py-3 border border-white/20">
              <p className="text-2xl font-bold text-white">{stats.total_entries}</p>
              <p className="text-blue-300 text-xs">Catches Ranked</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-6 py-3 border border-white/20">
              <p className="text-2xl font-bold text-white">{stats.unique_anglers}</p>
              <p className="text-blue-300 text-xs">Anglers</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-6 py-3 border border-white/20">
              <p className="text-2xl font-bold text-white">{stats.unique_species}</p>
              <p className="text-blue-300 text-xs">Species</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-6 py-3 border border-white/20">
              <p className="text-2xl font-bold text-white">{stats.unique_states}</p>
              <p className="text-blue-300 text-xs">States</p>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="max-w-7xl mx-auto px-4 -mt-4 relative z-20 mb-8">
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-5">
          {/* Sort Tabs */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-blue-300 text-sm font-medium mr-2">Rank by:</span>
            <button onClick={() => setSortBy('weight')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${sortBy === 'weight' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white/10 text-blue-300 hover:bg-white/20'}`}>
              <ScaleIcon className="w-4 h-4" /> Weight
            </button>
            <button onClick={() => setSortBy('length')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${sortBy === 'length' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white/10 text-blue-300 hover:bg-white/20'}`}>
              <RulerIcon className="w-4 h-4" /> Length
            </button>
            <div className="flex-1" />
            <button onClick={fetchLeaderboard} className="text-blue-300 hover:text-white hover:bg-white/10 p-2 rounded-lg transition" title="Refresh">
              <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Filter row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={species} onChange={e => setSpecies(e.target.value)} className="h-10 rounded-lg border border-white/20 bg-slate-800/80 text-white px-3 text-sm focus:border-blue-400 focus:outline-none">
              <option value="all">All Species</option>
              {availableSpecies.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={state} onChange={e => setState(e.target.value)} className="h-10 rounded-lg border border-white/20 bg-slate-800/80 text-white px-3 text-sm focus:border-blue-400 focus:outline-none">
              <option value="all">All States</option>
              {availableStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={timePeriod} onChange={e => setTimePeriod(e.target.value)} className="h-10 rounded-lg border border-white/20 bg-slate-800/80 text-white px-3 text-sm focus:border-blue-400 focus:outline-none">
              <option value="all-time">All Time</option>
              <option value="monthly">This Month</option>
              <option value="weekly">This Week</option>
            </select>
          </div>

          {/* Active filters */}
          {(species !== 'all' || state !== 'all' || timePeriod !== 'all-time') && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5 flex-wrap">
              <span className="text-blue-400 text-xs">Active filters:</span>
              {species !== 'all' && <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30 text-xs cursor-pointer hover:bg-blue-500/30" onClick={() => setSpecies('all')}>{species} &times;</Badge>}
              {state !== 'all' && <Badge className="bg-green-500/20 text-green-300 border-green-400/30 text-xs cursor-pointer hover:bg-green-500/30" onClick={() => setState('all')}>{state} &times;</Badge>}
              {timePeriod !== 'all-time' && <Badge className="bg-purple-500/20 text-purple-300 border-purple-400/30 text-xs cursor-pointer hover:bg-purple-500/30" onClick={() => setTimePeriod('all-time')}>{timePeriod === 'weekly' ? 'This Week' : 'This Month'} &times;</Badge>}
              <button onClick={() => { setSpecies('all'); setState('all'); setTimePeriod('all-time'); }} className="text-blue-300 hover:text-white text-xs underline ml-2">Clear all</button>
            </div>
          )}
        </div>
      </section>

      {/* Leaderboard Content */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <SpinnerIcon className="w-8 h-8 text-blue-400 mr-3" />
            <span className="text-blue-300 text-lg">Loading leaderboard...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <div className="bg-white/5 rounded-2xl border border-white/10 p-12 max-w-lg mx-auto">
              <TrophyIcon className="w-16 h-16 text-amber-400/30 mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-white mb-3">Could Not Load Leaderboard</h3>
              <p className="text-blue-300 mb-6 text-sm">{error}</p>
              <button onClick={fetchLeaderboard} className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium transition">Try Again</button>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20">
            <div className="bg-white/5 rounded-2xl border border-white/10 p-12 max-w-lg mx-auto">
              <TrophyIcon className="w-16 h-16 text-amber-400/30 mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-white mb-3">No Catches Yet</h3>
              <p className="text-blue-300 mb-6">Be the first to log a catch and claim the top spot!</p>
              <button onClick={() => navigate('/my-catches')} className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium transition">Log a Catch</button>
            </div>
          </div>
        ) : (
          <>
            {/* Top 3 Podium */}
            {entries.length >= 3 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {[entries[1], entries[0], entries[2]].map((entry, idx) => {
                  const actualRank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
                  const rs = getRankStyle(actualRank);
                  const isCenter = idx === 1;
                  return (
                    <div key={entry.id} className={`${rs.bg} border ${rs.border} rounded-2xl p-5 text-center transition hover:scale-[1.02] cursor-pointer ${isCenter ? 'md:-mt-4 md:mb-0' : ''}`} onClick={() => setSelectedEntry(entry)}>
                      <div className={`${rs.medal} w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg`}>
                        {actualRank === 1 ? <TrophyIcon className="w-6 h-6 text-white" /> : <span className="text-white font-bold text-lg">#{actualRank}</span>}
                      </div>
                      {entry.photo_url && (
                        <div className="w-20 h-20 rounded-full mx-auto mb-3 overflow-hidden border-2 border-white/20">
                          <img src={entry.photo_url} alt={entry.species} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      )}
                      <p className={`font-bold text-lg ${rs.text}`}>{entry.angler_name}</p>
                      <p className="text-white font-semibold text-xl mt-1">{entry.species}</p>
                      <div className="flex items-center justify-center gap-3 mt-2">
                        {entry.weight_lbs && <span className="text-green-400 font-bold text-lg">{entry.weight_lbs.toFixed(2)} lbs</span>}
                        {entry.weight_lbs && entry.length_inches && <span className="text-white/30">|</span>}
                        {entry.length_inches && <span className="text-teal-400 font-bold text-lg">{entry.length_inches.toFixed(1)}"</span>}
                      </div>
                      <div className="flex items-center justify-center gap-1 mt-2 text-blue-300 text-xs">
                        <MapPinIcon className="w-3 h-3" /> {entry.location}{entry.state !== 'Unknown' ? `, ${entry.state}` : ''}
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-2">
                        {entry.is_species_weight_record && <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30 text-[10px]"><StarIcon className="w-3 h-3 mr-0.5" /> Weight Record</Badge>}
                        {entry.is_species_length_record && <Badge className="bg-teal-500/20 text-teal-300 border-teal-400/30 text-[10px]"><StarIcon className="w-3 h-3 mr-0.5" /> Length Record</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full Leaderboard Table */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <TrophyIcon className="w-5 h-5 text-amber-400" />
                  Full Rankings — By {sortBy === 'weight' ? 'Weight' : 'Length'}
                </h3>
                <span className="text-blue-300 text-sm">{entries.length} entries</span>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 text-blue-300 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left w-16">Rank</th>
                      <th className="px-4 py-3 text-left">Angler</th>
                      <th className="px-4 py-3 text-left">Species</th>
                      <th className="px-4 py-3 text-right">{sortBy === 'weight' ? 'Weight' : 'Length'}</th>
                      <th className="px-4 py-3 text-right">{sortBy === 'weight' ? 'Length' : 'Weight'}</th>
                      <th className="px-4 py-3 text-left">Location</th>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-center">Badges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => {
                      const rs = getRankStyle(entry.rank);
                      return (
                        <tr key={entry.id} className={`${rs.bg} border-b border-white/5 hover:bg-white/10 transition cursor-pointer`} onClick={() => setSelectedEntry(entry)}>
                          <td className="px-4 py-3">
                            <div className={`${rs.medal} w-8 h-8 rounded-full flex items-center justify-center`}>
                              {entry.rank <= 3 ? <TrophyIcon className="w-4 h-4 text-white" /> : <span className="text-white text-xs font-bold">{entry.rank}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {entry.photo_url && <img src={entry.photo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-white/20" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                              <span className={`font-medium ${entry.rank <= 3 ? rs.text : 'text-white'}`}>{entry.angler_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-white font-medium">{entry.species}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold ${sortBy === 'weight' ? 'text-green-400 text-base' : 'text-teal-400 text-base'}`}>
                              {sortBy === 'weight' ? (entry.weight_lbs ? `${entry.weight_lbs.toFixed(2)} lbs` : '\u2014') : (entry.length_inches ? `${entry.length_inches.toFixed(1)}"` : '\u2014')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-blue-300 text-sm">
                            {sortBy === 'weight' ? (entry.length_inches ? `${entry.length_inches.toFixed(1)}"` : '\u2014') : (entry.weight_lbs ? `${entry.weight_lbs.toFixed(2)} lbs` : '\u2014')}
                          </td>
                          <td className="px-4 py-3 text-blue-300 text-sm">
                            <div className="flex items-center gap-1 max-w-[180px] truncate">
                              <MapPinIcon className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{entry.location}{entry.state !== 'Unknown' ? `, ${entry.state}` : ''}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-blue-300 text-sm">{formatDate(entry.date)}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              {entry.is_species_weight_record && <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30 text-[9px]"><StarIcon className="w-2.5 h-2.5" /> Wt Rec</Badge>}
                              {entry.is_species_length_record && <Badge className="bg-teal-500/20 text-teal-300 border-teal-400/30 text-[9px]"><StarIcon className="w-2.5 h-2.5" /> Ln Rec</Badge>}
                              {entry.catch_and_release && <Badge className="bg-green-500/20 text-green-300 border-green-400/30 text-[9px]">C&R</Badge>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-white/5">
                {entries.map(entry => {
                  const rs = getRankStyle(entry.rank);
                  return (
                    <div key={entry.id} className={`${rs.bg} p-4 flex items-center gap-3 cursor-pointer hover:bg-white/10 transition`} onClick={() => setSelectedEntry(entry)}>
                      <div className={`${rs.medal} w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0`}>
                        {entry.rank <= 3 ? <TrophyIcon className="w-5 h-5 text-white" /> : <span className="text-white text-sm font-bold">{entry.rank}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${entry.rank <= 3 ? rs.text : 'text-white'}`}>{entry.angler_name}</span>
                          {entry.is_species_weight_record && <StarIcon className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                        </div>
                        <p className="text-white font-medium text-sm">{entry.species}</p>
                        <p className="text-blue-300 text-xs truncate">{entry.location}{entry.state !== 'Unknown' ? `, ${entry.state}` : ''}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {entry.weight_lbs && <p className="text-green-400 font-bold">{entry.weight_lbs.toFixed(2)} lbs</p>}
                        {entry.length_inches && <p className="text-teal-400 text-sm font-medium">{entry.length_inches.toFixed(1)}"</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedEntry(null)}>
          <div className="bg-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {selectedEntry.photo_url && (
              <div className="relative h-52 overflow-hidden rounded-t-2xl">
                <img src={selectedEntry.photo_url} alt={selectedEntry.species} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-800 via-transparent to-transparent" />
              </div>
            )}
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`${getRankStyle(selectedEntry.rank).medal} w-8 h-8 rounded-full flex items-center justify-center`}>
                      {selectedEntry.rank <= 3 ? <TrophyIcon className="w-4 h-4 text-white" /> : <span className="text-white text-xs font-bold">#{selectedEntry.rank}</span>}
                    </div>
                    <span className={`text-sm font-medium ${getRankStyle(selectedEntry.rank).text}`}>{selectedEntry.angler_name}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white">{selectedEntry.species}</h2>
                </div>
                <button onClick={() => setSelectedEntry(null)} className="text-gray-400 hover:text-white p-2 rounded-lg transition">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-slate-700/50 rounded-xl p-3 text-center">
                  <ScaleIcon className="w-5 h-5 text-green-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-white">{selectedEntry.weight_lbs ? `${selectedEntry.weight_lbs.toFixed(2)} lbs` : '\u2014'}</p>
                  <p className="text-blue-300 text-xs">Weight</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3 text-center">
                  <RulerIcon className="w-5 h-5 text-teal-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-white">{selectedEntry.length_inches ? `${selectedEntry.length_inches.toFixed(1)}"` : '\u2014'}</p>
                  <p className="text-blue-300 text-xs">Length</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                  <MapPinIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-white text-sm font-medium">{selectedEntry.location}</p>
                    <p className="text-blue-300 text-xs">{[selectedEntry.state, selectedEntry.water_body].filter(Boolean).join(' \u00B7 ')}</p>
                  </div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                  <CalendarIcon className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <p className="text-white text-sm">{formatDate(selectedEntry.date)}</p>
                </div>
                {selectedEntry.method && selectedEntry.method !== 'none' && (
                  <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                    <FishIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <p className="text-white text-sm">{selectedEntry.method}{selectedEntry.lure_bait ? ` \u2014 ${selectedEntry.lure_bait}` : ''}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedEntry.is_species_weight_record && <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30"><StarIcon className="w-3 h-3 mr-1" /> Species Weight Record</Badge>}
                {selectedEntry.is_species_length_record && <Badge className="bg-teal-500/20 text-teal-300 border-teal-400/30"><StarIcon className="w-3 h-3 mr-1" /> Species Length Record</Badge>}
                {selectedEntry.catch_and_release && <Badge className="bg-green-500/20 text-green-300 border-green-400/30">Catch & Release</Badge>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-blue-500/20 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg"><img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/></div>
                <span className="text-xl font-bold text-white">FishingFinderUSA</span>
              </div>
              <p className="text-blue-300 text-sm">Community leaderboard showcasing the biggest catches from anglers across all 50 states.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Explore</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => navigate('/')} className="hover:text-white transition">Fishing Spots</button></li>
                <li><button onClick={() => navigate('/fish-guide')} className="hover:text-white transition">Fish Species Guide</button></li>
                <li><button onClick={() => navigate('/licenses')} className="hover:text-white transition">Fishing Licenses</button></li>
                <li><button onClick={() => navigate('/regulations')} className="hover:text-white transition">Lodging/Regulations</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">My Account</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => navigate('/my-catches')} className="hover:text-white transition">My Catch Log</button></li>
                <li><button onClick={() => navigate('/my-trips')} className="hover:text-white transition">My Trips</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Leaderboard</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => { setSortBy('weight'); setTimePeriod('all-time'); }} className="hover:text-white transition">All-Time Heaviest</button></li>
                <li><button onClick={() => { setSortBy('length'); setTimePeriod('all-time'); }} className="hover:text-white transition">All-Time Longest</button></li>
                <li><button onClick={() => { setSortBy('weight'); setTimePeriod('weekly'); }} className="hover:text-white transition">This Week's Best</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-blue-500/20 mt-8 pt-8 text-center text-blue-300 text-sm">
            <p>&copy; 2026 FishingFinderUSA. All rights reserved. Always check local regulations before fishing.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Leaderboard;
