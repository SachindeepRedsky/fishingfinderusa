import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LodgingSection from '@/components/LodgingSection';
import {
  Fish, Search, ArrowLeft, Loader2, X, ExternalLink,
  Shield, Calendar, MapPin, BookOpen, ChevronRight, ChevronDown, ChevronUp,
  AlertTriangle, Info, Scroll, Waves, TreePine, Anchor,
  Scale, Ruler, Clock, Ban, CircleDot, Filter, Hotel
} from 'lucide-react';

interface FishingRegulation {
  id: number;
  state: string;
  state_abbr: string;
  species: string;
  daily_bag_limit: number | null;
  possession_limit: number | null;
  size_limit_inches: number | string | null;
  slot_limit_min: number | string | null;
  slot_limit_max: number | string | null;
  season_open: string | null;
  season_close: string | null;
  season_notes: string | null;
  special_rules: string | null;
  water_body_type: string;
  water_body_name: string | null;
  catch_and_release_only: boolean;
  artificial_lures_only: boolean;
  barbless_hooks_required: boolean;
  updated_at: string;
}

interface StateGroup {
  state: string;
  state_abbr: string;
  regulations: FishingRegulation[];
}

const toNum = (val: number | string | null | undefined): number | null => {
  if (val === null || val === undefined) return null;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(num) ? null : num;
};

const formatSize = (inches: number | string | null | undefined): string => {
  const num = toNum(inches);
  if (num === null) return 'No minimum';
  return `${num}" min`;
};

const formatSlot = (min: number | string | null | undefined, max: number | string | null | undefined): string | null => {
  const minNum = toNum(min);
  const maxNum = toNum(max);
  if (minNum === null || maxNum === null) return null;
  return `${minNum}" - ${maxNum}"`;
};

const waterBodyTypeLabel = (type: string): string => {
  switch (type) {
    case 'freshwater': return 'Freshwater';
    case 'saltwater': return 'Saltwater';
    case 'all': return 'All Waters';
    default: return type;
  }
};

const waterBodyTypeColor = (type: string): string => {
  switch (type) {
    case 'freshwater': return 'bg-blue-500';
    case 'saltwater': return 'bg-cyan-600';
    case 'all': return 'bg-green-500';
    default: return 'bg-gray-500';
  }
};

const waterBodyIcon = (type: string) => {
  switch (type) {
    case 'freshwater': return <Waves className="w-3.5 h-3.5" />;
    case 'saltwater': return <Anchor className="w-3.5 h-3.5" />;
    default: return <TreePine className="w-3.5 h-3.5" />;
  }
};

const regionMap: Record<string, string[]> = {
  'Northeast': ['Connecticut', 'Delaware', 'Maine', 'Maryland', 'Massachusetts', 'New Hampshire', 'New Jersey', 'New York', 'Pennsylvania', 'Rhode Island', 'Vermont'],
  'Southeast': ['Alabama', 'Arkansas', 'Florida', 'Georgia', 'Kentucky', 'Louisiana', 'Mississippi', 'North Carolina', 'South Carolina', 'Tennessee', 'Virginia', 'West Virginia'],
  'Midwest': ['Illinois', 'Indiana', 'Iowa', 'Kansas', 'Michigan', 'Minnesota', 'Missouri', 'Nebraska', 'North Dakota', 'Ohio', 'South Dakota', 'Wisconsin'],
  'West': ['Alaska', 'California', 'Colorado', 'Hawaii', 'Idaho', 'Montana', 'Nevada', 'Oregon', 'Utah', 'Washington', 'Wyoming'],
  'Southwest': ['Arizona', 'New Mexico', 'Oklahoma', 'Texas'],
};

const getRegionForState = (state: string): string => {
  for (const [region, states] of Object.entries(regionMap)) {
    if (states.includes(state)) return region;
  }
  return 'Unknown';
};

const getRegionColor = (region: string): string => {
  switch (region) {
    case 'Northeast': return 'bg-purple-500';
    case 'Southeast': return 'bg-orange-500';
    case 'Midwest': return 'bg-green-500';
    case 'West': return 'bg-blue-500';
    case 'Southwest': return 'bg-amber-500';
    default: return 'bg-gray-500';
  }
};

const Regulations: React.FC = () => {
  const navigate = useNavigate();
  const [regulations, setRegulations] = useState<FishingRegulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState('all');
  const [selectedSpecies, setSelectedSpecies] = useState('all');
  const [selectedWaterType, setSelectedWaterType] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [selectedRegulation, setSelectedRegulation] = useState<FishingRegulation | null>(null);
  const [viewMode, setViewMode] = useState<'state' | 'species'>('state');

  useEffect(() => {
    fetchRegulations();
  }, []);

  const fetchRegulations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fishing_regulations')
        .select('*')
        .order('state', { ascending: true })
        .order('species', { ascending: true });

      if (error) throw error;
      setRegulations(data || []);
    } catch (err) {
      console.error('Error fetching regulations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Unique values for filters
  const allStates = useMemo(() => {
    const states = [...new Set(regulations.map(r => r.state))].sort();
    return states;
  }, [regulations]);

  const allSpecies = useMemo(() => {
    const species = [...new Set(regulations.map(r => r.species))].sort();
    return species;
  }, [regulations]);

  // Filtered regulations
  const filteredRegulations = useMemo(() => {
    return regulations.filter(reg => {
      const matchesSearch = searchQuery === '' ||
        reg.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
        reg.state_abbr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        reg.species.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (reg.water_body_name && reg.water_body_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (reg.special_rules && reg.special_rules.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesState = selectedState === 'all' || reg.state === selectedState;
      const matchesSpecies = selectedSpecies === 'all' || reg.species === selectedSpecies;
      const matchesWaterType = selectedWaterType === 'all' || reg.water_body_type === selectedWaterType;
      const matchesRegion = selectedRegion === 'all' ||
        (regionMap[selectedRegion]?.includes(reg.state));

      return matchesSearch && matchesState && matchesSpecies && matchesWaterType && matchesRegion;
    });
  }, [regulations, searchQuery, selectedState, selectedSpecies, selectedWaterType, selectedRegion]);

  // Group by state
  const stateGroups = useMemo((): StateGroup[] => {
    const groups: Record<string, StateGroup> = {};
    filteredRegulations.forEach(reg => {
      if (!groups[reg.state]) {
        groups[reg.state] = { state: reg.state, state_abbr: reg.state_abbr, regulations: [] };
      }
      groups[reg.state].regulations.push(reg);
    });
    return Object.values(groups).sort((a, b) => a.state.localeCompare(b.state));
  }, [filteredRegulations]);

  // Group by species
  const speciesGroups = useMemo(() => {
    const groups: Record<string, FishingRegulation[]> = {};
    filteredRegulations.forEach(reg => {
      if (!groups[reg.species]) {
        groups[reg.species] = [];
      }
      groups[reg.species].push(reg);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredRegulations]);

  const toggleState = (state: string) => {
    setExpandedStates(prev => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedStates(new Set(stateGroups.map(g => g.state)));
  };

  const collapseAll = () => {
    setExpandedStates(new Set());
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedState('all');
    setSelectedSpecies('all');
    setSelectedWaterType('all');
    setSelectedRegion('all');
  };

  // Stats
  const totalStates = new Set(regulations.map(r => r.state)).size;
  const totalSpecies = new Set(regulations.map(r => r.species)).size;
  const catchReleaseCount = regulations.filter(r => r.catch_and_release_only).length;
  const slotLimitCount = regulations.filter(r => toNum(r.slot_limit_min) !== null && toNum(r.slot_limit_max) !== null).length;

  const hasActiveFilters = searchQuery !== '' || selectedState !== 'all' || selectedSpecies !== 'all' || selectedWaterType !== 'all' || selectedRegion !== 'all';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
                onClick={() => navigate('/')}
                className="md:hidden border-blue-400 text-blue-300 hover:bg-blue-500/20"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
              </button>
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg transition"
            >
              <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-sm">Fishing Regulations Guide</p>
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => navigate('/')}
                className="text-blue-200 hover:text-white transition flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Fishing Spots
              </button>
              <button
                onClick={() => navigate('/fish-guide')}
                className="text-blue-200 hover:text-white transition flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                <span className='lg:inline hidden'>Fish Guide</span>
              </button>
              <button
                onClick={() => navigate('/licenses')}
                className="text-blue-200 hover:text-white transition flex items-center gap-2"
              >
                <Scroll className="w-4 h-4" />
                <span className='lg:inline hidden'>Licenses</span>
              </button>
              <span className="text-white font-medium flex items-center gap-2">
                <Scale className="w-4 h-4" />
                <span className='lg:inline hidden'>Lodging/Regulations</span>
              </span>
            </div>
            
          </nav>
        </div>
      </header>

      {/* Lodging Section */}
      <LodgingSection />

      {/* Divider between Lodging and Regulations */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
          <div className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-full px-5 py-2">
            <Scale className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-300 text-sm font-medium">Fishing Regulations</span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative py-10 md:py-16 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/30 via-slate-900/30 to-slate-900" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Fishing <span className="bg-gradient-to-r from-emerald-400 to-cyan-300 bg-clip-text text-transparent">Regulations</span> Guide
          </h2>
          <p className="text-xl text-blue-200 mb-8 max-w-2xl mx-auto">
            Catch limits, size requirements, seasonal restrictions, and special rules for every state.
          </p>

          {/* Quick Stats */}
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
              <p className="text-3xl font-bold text-white">{totalStates}</p>
              <p className="text-blue-200 text-xs mt-1">States Covered</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
              <p className="text-3xl font-bold text-emerald-400">{totalSpecies}</p>
              <p className="text-blue-200 text-xs mt-1">Fish Species</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
              <p className="text-3xl font-bold text-white">{regulations.length}</p>
              <p className="text-blue-200 text-xs mt-1">Total Regulations</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
              <p className="text-3xl font-bold text-amber-400">{slotLimitCount}</p>
              <p className="text-blue-200 text-xs mt-1">Slot Limits</p>
            </div>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="max-w-7xl mx-auto px-4 -mt-4 relative z-20">
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Search state, species, water body..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-lg"
              />
            </div>
            <Select value={selectedState} onValueChange={setSelectedState}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {allStates.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedSpecies} onValueChange={setSelectedSpecies}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Species" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Species</SelectItem>
                {allSpecies.map(species => (
                  <SelectItem key={species} value={species}>{species}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedWaterType} onValueChange={setSelectedWaterType}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Water Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Waters</SelectItem>
                <SelectItem value="freshwater">Freshwater</SelectItem>
                <SelectItem value="saltwater">Saltwater</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                <SelectItem value="Northeast">Northeast</SelectItem>
                <SelectItem value="Southeast">Southeast</SelectItem>
                <SelectItem value="Midwest">Midwest</SelectItem>
                <SelectItem value="West">West</SelectItem>
                <SelectItem value="Southwest">Southwest</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">Active filters:</span>
              {searchQuery && (
                <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setSearchQuery('')}>
                  Search: "{searchQuery}" <X className="w-3 h-3 ml-1" />
                </Badge>
              )}
              {selectedState !== 'all' && (
                <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setSelectedState('all')}>
                  {selectedState} <X className="w-3 h-3 ml-1" />
                </Badge>
              )}
              {selectedSpecies !== 'all' && (
                <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setSelectedSpecies('all')}>
                  {selectedSpecies} <X className="w-3 h-3 ml-1" />
                </Badge>
              )}
              {selectedWaterType !== 'all' && (
                <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setSelectedWaterType('all')}>
                  {waterBodyTypeLabel(selectedWaterType)} <X className="w-3 h-3 ml-1" />
                </Badge>
              )}
              {selectedRegion !== 'all' && (
                <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setSelectedRegion('all')}>
                  {selectedRegion} <X className="w-3 h-3 ml-1" />
                </Badge>
              )}
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-2">
                Clear all
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Results Controls */}
      <section className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <p className="text-blue-200">
              Showing <span className="text-white font-semibold">{filteredRegulations.length}</span> regulations
              across <span className="text-white font-semibold">{viewMode === 'state' ? stateGroups.length : speciesGroups.length}</span> {viewMode === 'state' ? 'states' : 'species'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-white/20 overflow-hidden">
              <button
                onClick={() => { setViewMode('state'); setExpandedStates(new Set()); }}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  viewMode === 'state'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/5 text-blue-200 hover:bg-white/10'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 inline mr-1.5" />
                By State
              </button>
              <button
                onClick={() => { setViewMode('species'); setExpandedStates(new Set()); }}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  viewMode === 'species'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/5 text-blue-200 hover:bg-white/10'
                }`}
              >
                <Fish className="w-3.5 h-3.5 inline mr-1.5" />
                By Species
              </button>
            </div>
            {viewMode === 'state' && (
              <div className="flex gap-2">
                <button onClick={expandAll} className="text-xs text-blue-300 hover:text-white transition">
                  Expand All
                </button>
                <span className="text-blue-500">|</span>
                <button onClick={collapseAll} className="text-xs text-blue-300 hover:text-white transition">
                  Collapse All
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Region Quick Filters */}
        <div className="flex gap-2 flex-wrap mt-4">
          {Object.keys(regionMap).map(region => (
            <button
              key={region}
              onClick={() => setSelectedRegion(selectedRegion === region ? 'all' : region)}
              className={`px-3 py-1 rounded-full text-sm transition ${
                selectedRegion === region
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/10 text-blue-200 hover:bg-white/20'
              }`}
            >
              {region}
            </button>
          ))}
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mr-3" />
            <span className="text-blue-300 text-lg">Loading regulations...</span>
          </div>
        ) : viewMode === 'state' ? (
          /* State View */
          <div className="space-y-4">
            {stateGroups.map(group => {
              const isExpanded = expandedStates.has(group.state);
              const region = getRegionForState(group.state);
              const freshwaterCount = group.regulations.filter(r => r.water_body_type === 'freshwater').length;
              const saltwaterCount = group.regulations.filter(r => r.water_body_type === 'saltwater').length;
              const crOnly = group.regulations.filter(r => r.catch_and_release_only).length;

              return (
                <div key={group.state} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition">
                  {/* State Header */}
                  <button
                    onClick={() => toggleState(group.state)}
                    className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Badge className={`${getRegionColor(region)} text-white text-[10px]`}>
                          {region}
                        </Badge>
                      </div>
                      <div className="text-left">
                        <h3 className="text-xl font-bold text-white">{group.state}</h3>
                        <p className="text-blue-300 text-sm">
                          {group.regulations.length} regulation{group.regulations.length !== 1 ? 's' : ''}
                          {freshwaterCount > 0 && <span className="ml-2 text-blue-400">{freshwaterCount} freshwater</span>}
                          {saltwaterCount > 0 && <span className="ml-2 text-cyan-400">{saltwaterCount} saltwater</span>}
                          {crOnly > 0 && <span className="ml-2 text-amber-400">{crOnly} catch & release</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden md:flex gap-1.5">
                        {group.regulations.slice(0, 4).map(reg => (
                          <Badge key={reg.id} variant="outline" className="text-blue-200 border-blue-400/30 text-[10px]">
                            {reg.species}
                          </Badge>
                        ))}
                        {group.regulations.length > 4 && (
                          <Badge variant="outline" className="text-blue-200 border-blue-400/30 text-[10px]">
                            +{group.regulations.length - 4}
                          </Badge>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-blue-300" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-blue-300" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Regulations */}
                  {isExpanded && (
                    <div className="border-t border-white/10">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-white/5">
                              <th className="text-left text-xs text-blue-300 font-medium uppercase tracking-wide px-5 py-3">Species</th>
                              <th className="text-left text-xs text-blue-300 font-medium uppercase tracking-wide px-3 py-3">Water</th>
                              <th className="text-center text-xs text-blue-300 font-medium uppercase tracking-wide px-3 py-3">Daily Limit</th>
                              <th className="text-center text-xs text-blue-300 font-medium uppercase tracking-wide px-3 py-3">Size Limit</th>
                              <th className="text-center text-xs text-blue-300 font-medium uppercase tracking-wide px-3 py-3">Slot Limit</th>
                              <th className="text-left text-xs text-blue-300 font-medium uppercase tracking-wide px-3 py-3">Season</th>
                              <th className="text-center text-xs text-blue-300 font-medium uppercase tracking-wide px-3 py-3">Restrictions</th>
                              <th className="text-right text-xs text-blue-300 font-medium uppercase tracking-wide px-5 py-3"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.regulations.map(reg => {
                              const slotStr = formatSlot(reg.slot_limit_min, reg.slot_limit_max);
                              return (
                                <tr
                                  key={reg.id}
                                  className="border-t border-white/5 hover:bg-white/5 transition cursor-pointer"
                                  onClick={() => setSelectedRegulation(reg)}
                                >
                                  <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-2">
                                      <Fish className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                      <span className="text-white font-medium text-sm">{reg.species}</span>
                                    </div>
                                    {reg.water_body_name && (
                                      <span className="text-blue-300 text-xs ml-6">{reg.water_body_name}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3.5">
                                    <Badge className={`${waterBodyTypeColor(reg.water_body_type)} text-white text-[10px]`}>
                                      {waterBodyIcon(reg.water_body_type)}
                                      <span className="ml-1">{waterBodyTypeLabel(reg.water_body_type)}</span>
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-3.5 text-center">
                                    {reg.catch_and_release_only ? (
                                      <Badge className="bg-red-500/20 text-red-300 text-[10px]">C&R Only</Badge>
                                    ) : (
                                      <span className="text-white font-semibold text-sm">
                                        {reg.daily_bag_limit !== null ? reg.daily_bag_limit : 'No limit'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3.5 text-center">
                                    <span className="text-blue-200 text-sm">{formatSize(reg.size_limit_inches)}</span>
                                  </td>
                                  <td className="px-3 py-3.5 text-center">
                                    {slotStr ? (
                                      <span className="text-amber-300 text-sm font-medium">{slotStr}</span>
                                    ) : (
                                      <span className="text-gray-500 text-sm">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3.5">
                                    <div className="text-sm">
                                      {reg.season_open === 'Year-round' ? (
                                        <span className="text-green-400">Year-round</span>
                                      ) : reg.season_open === 'Varies' ? (
                                        <span className="text-amber-300">Varies</span>
                                      ) : (
                                        <span className="text-blue-200">
                                          {reg.season_open}{reg.season_close ? ` – ${reg.season_close}` : ''}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-3.5 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {reg.catch_and_release_only && (
                                        <span title="Catch & Release Only" className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                                          <Ban className="w-3 h-3 text-red-400" />
                                        </span>
                                      )}
                                      {reg.artificial_lures_only && (
                                        <span title="Artificial Lures Only" className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                                          <CircleDot className="w-3 h-3 text-purple-400" />
                                        </span>
                                      )}
                                      {reg.barbless_hooks_required && (
                                        <span title="Barbless Hooks Required" className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                                        </span>
                                      )}
                                      {!reg.catch_and_release_only && !reg.artificial_lures_only && !reg.barbless_hooks_required && (
                                        <span className="text-gray-500 text-xs">—</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-5 py-3.5 text-right">
                                    <ChevronRight className="w-4 h-4 text-blue-300 inline" />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Species View */
          <div className="space-y-4">
            {speciesGroups.map(([species, regs]) => {
              const isExpanded = expandedStates.has(species);
              const stateCount = new Set(regs.map(r => r.state)).size;
              const avgBagLimit = regs.filter(r => r.daily_bag_limit !== null && !r.catch_and_release_only);
              const avgBag = avgBagLimit.length > 0
                ? Math.round(avgBagLimit.reduce((sum, r) => sum + (r.daily_bag_limit || 0), 0) / avgBagLimit.length)
                : null;

              return (
                <div key={species} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition">
                  <button
                    onClick={() => toggleState(species)}
                    className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-emerald-500/20 p-2.5 rounded-lg">
                        <Fish className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-xl font-bold text-white">{species}</h3>
                        <p className="text-blue-300 text-sm">
                          Regulated in {stateCount} state{stateCount !== 1 ? 's' : ''}
                          {avgBag !== null && <span className="ml-2 text-emerald-400">Avg. bag limit: {avgBag}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-blue-300" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-blue-300" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-white/10 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {regs.sort((a, b) => a.state.localeCompare(b.state)).map(reg => {
                          const slotStr = formatSlot(reg.slot_limit_min, reg.slot_limit_max);
                          return (
                            <div
                              key={reg.id}
                              onClick={() => setSelectedRegulation(reg)}
                              className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition cursor-pointer"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Badge className={`${getRegionColor(getRegionForState(reg.state))} text-white text-[10px]`}>
                                    {reg.state_abbr}
                                  </Badge>
                                  <Badge className={`${waterBodyTypeColor(reg.water_body_type)} text-white text-[10px]`}>
                                    {waterBodyTypeLabel(reg.water_body_type)}
                                  </Badge>
                                </div>
                                <ChevronRight className="w-4 h-4 text-blue-300" />
                              </div>
                              <h4 className="text-white font-medium text-sm mb-1">{reg.state}</h4>
                              {reg.water_body_name && (
                                <p className="text-blue-300 text-xs mb-2">{reg.water_body_name}</p>
                              )}
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-400">Bag Limit:</span>
                                  <span className="text-white ml-1 font-medium">
                                    {reg.catch_and_release_only ? 'C&R' : (reg.daily_bag_limit !== null ? reg.daily_bag_limit : 'None')}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Size:</span>
                                  <span className="text-white ml-1 font-medium">{formatSize(reg.size_limit_inches)}</span>
                                </div>
                                {slotStr && (
                                  <div className="col-span-2">
                                    <span className="text-gray-400">Slot:</span>
                                    <span className="text-amber-300 ml-1 font-medium">{slotStr}</span>
                                  </div>
                                )}
                                <div className="col-span-2">
                                  <span className="text-gray-400">Season:</span>
                                  <span className={`ml-1 font-medium ${reg.season_open === 'Year-round' ? 'text-green-400' : 'text-blue-200'}`}>
                                    {reg.season_open === 'Year-round' ? 'Year-round' : `${reg.season_open}${reg.season_close ? ` – ${reg.season_close}` : ''}`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filteredRegulations.length === 0 && !loading && (
          <div className="text-center py-16">
            <Scale className="w-16 h-16 text-blue-400/50 mx-auto mb-4" />
            <h3 className="text-xl text-white mb-2">No regulations found</h3>
            <p className="text-blue-300 mb-4">Try adjusting your search or filters</p>
            <button
              onClick={clearFilters}
              className="border-blue-400 text-blue-300 hover:bg-blue-500/20"
            >
              Clear Filters
            </button>
          </div>
        )}
      </section>

      {/* Detail Modal */}
      {selectedRegulation && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedRegulation(null)}
        >
          <div
            className="bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge className={`${getRegionColor(getRegionForState(selectedRegulation.state))} text-white`}>
                      {getRegionForState(selectedRegulation.state)}
                    </Badge>
                    <Badge className="bg-slate-600 text-white">{selectedRegulation.state_abbr}</Badge>
                    <Badge className={`${waterBodyTypeColor(selectedRegulation.water_body_type)} text-white`}>
                      {waterBodyIcon(selectedRegulation.water_body_type)}
                      <span className="ml-1">{waterBodyTypeLabel(selectedRegulation.water_body_type)}</span>
                    </Badge>
                  </div>
                  <h2 className="text-2xl font-bold text-white">{selectedRegulation.species}</h2>
                  <p className="text-blue-300 text-sm mt-1">
                    {selectedRegulation.state}
                    {selectedRegulation.water_body_name && ` — ${selectedRegulation.water_body_name}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedRegulation(null)}
                  className="text-gray-400 hover:text-white bg-inherit hover:bg-white/10"
                >
                  <X className="w-6 h-6" />
                </Button>
              </div>

              {/* Catch Limits */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-emerald-300 text-xs mb-2">
                    <Scale className="w-4 h-4" />
                    <span className="font-medium uppercase tracking-wide">Daily Bag Limit</span>
                  </div>
                  {selectedRegulation.catch_and_release_only ? (
                    <div className="flex items-center gap-2">
                      <Ban className="w-5 h-5 text-red-400" />
                      <span className="text-red-300 font-bold text-lg">Catch & Release Only</span>
                    </div>
                  ) : (
                    <p className="text-white font-bold text-2xl">
                      {selectedRegulation.daily_bag_limit !== null ? selectedRegulation.daily_bag_limit : 'No limit'}
                      <span className="text-blue-300 text-sm font-normal ml-1">fish/day</span>
                    </p>
                  )}
                  {selectedRegulation.possession_limit && (
                    <p className="text-blue-300 text-xs mt-1">
                      Possession limit: {selectedRegulation.possession_limit}
                    </p>
                  )}
                </div>
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-blue-300 text-xs mb-2">
                    <Ruler className="w-4 h-4" />
                    <span className="font-medium uppercase tracking-wide">Size Requirements</span>
                  </div>
                  {(() => {
                    const slotStr = formatSlot(selectedRegulation.slot_limit_min, selectedRegulation.slot_limit_max);
                    const sizeNum = toNum(selectedRegulation.size_limit_inches);
                    return (
                      <div>
                        <p className="text-white font-bold text-2xl">
                          {sizeNum !== null ? `${sizeNum}"` : 'No min'}
                          <span className="text-blue-300 text-sm font-normal ml-1">minimum</span>
                        </p>
                        {slotStr && (
                          <div className="mt-2 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-1.5">
                            <span className="text-amber-300 text-sm font-medium">Slot: {slotStr}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Season Info */}
              <div className="bg-slate-700/50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 text-blue-300 text-xs mb-3">
                  <Calendar className="w-4 h-4" />
                  <span className="font-medium uppercase tracking-wide">Season Information</span>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  {selectedRegulation.season_open === 'Year-round' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-green-400 font-semibold text-lg">Open Year-Round</span>
                    </div>
                  ) : selectedRegulation.season_open === 'Varies' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <span className="text-amber-400 font-semibold text-lg">Season Varies</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-gray-400 text-xs">Opens</p>
                        <p className="text-white font-semibold">{selectedRegulation.season_open}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-blue-400" />
                      <div>
                        <p className="text-gray-400 text-xs">Closes</p>
                        <p className="text-white font-semibold">{selectedRegulation.season_close || 'N/A'}</p>
                      </div>
                    </div>
                  )}
                </div>
                {selectedRegulation.season_notes && (
                  <p className="text-blue-200 text-sm mt-2 bg-blue-500/10 rounded-lg px-3 py-2 border border-blue-400/20">
                    {selectedRegulation.season_notes}
                  </p>
                )}
              </div>

              {/* Water Body */}
              {selectedRegulation.water_body_name && (
                <div className="bg-slate-700/50 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 text-blue-300 text-xs mb-2">
                    <MapPin className="w-4 h-4" />
                    <span className="font-medium uppercase tracking-wide">Specific Water Body</span>
                  </div>
                  <p className="text-white font-medium">{selectedRegulation.water_body_name}</p>
                  <p className="text-blue-300 text-sm">{waterBodyTypeLabel(selectedRegulation.water_body_type)}</p>
                </div>
              )}

              {/* Gear Restrictions */}
              {(selectedRegulation.catch_and_release_only || selectedRegulation.artificial_lures_only || selectedRegulation.barbless_hooks_required) && (
                <div className="bg-red-500/10 border border-red-400/20 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 text-red-300 text-xs mb-3">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium uppercase tracking-wide">Special Restrictions</span>
                  </div>
                  <div className="space-y-2">
                    {selectedRegulation.catch_and_release_only && (
                      <div className="flex items-center gap-2">
                        <Ban className="w-4 h-4 text-red-400" />
                        <span className="text-red-200 text-sm font-medium">Catch and Release Only — all fish must be returned immediately</span>
                      </div>
                    )}
                    {selectedRegulation.artificial_lures_only && (
                      <div className="flex items-center gap-2">
                        <CircleDot className="w-4 h-4 text-purple-400" />
                        <span className="text-purple-200 text-sm font-medium">Artificial Lures Only — no live or natural bait permitted</span>
                      </div>
                    )}
                    {selectedRegulation.barbless_hooks_required && (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span className="text-amber-200 text-sm font-medium">Barbless Hooks Required — all hooks must be barbless</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Special Rules */}
              {selectedRegulation.special_rules && (
                <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-blue-300 text-xs font-medium uppercase tracking-wide mb-1">Special Rules & Notes</p>
                      <p className="text-blue-100 text-sm">{selectedRegulation.special_rules}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    setSelectedRegulation(null);
                    setSelectedState(selectedRegulation.state);
                    setViewMode('state');
                    setExpandedStates(new Set([selectedRegulation.state]));
                    window.scrollTo({ top: 400, behavior: 'smooth' });
                  }}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  View All {selectedRegulation.state_abbr} Regulations
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-blue-400 text-blue-300 hover:bg-blue-500/20 bg-inherit"
                  onClick={() => {
                    setSelectedRegulation(null);
                    setSelectedSpecies(selectedRegulation.species);
                    setViewMode('species');
                    setExpandedStates(new Set([selectedRegulation.species]));
                    window.scrollTo({ top: 400, behavior: 'smooth' });
                  }}
                >
                  <Fish className="w-4 h-4 mr-2" />
                  Compare {selectedRegulation.species} Across States
                </Button>
              </div>

              <p className="text-gray-500 text-xs text-center mt-4">
                Last updated: {new Date(selectedRegulation.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
                Always verify with the official state wildlife agency.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Restriction Legend */}
      <section className="max-w-4xl mx-auto px-4 pb-8">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-400" />
            Understanding Regulation Icons
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Ban className="w-4 h-4 text-red-400" />
              </span>
              <div>
                <p className="text-white text-sm font-medium">Catch & Release Only</p>
                <p className="text-blue-300 text-xs">All fish must be returned to the water</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <CircleDot className="w-4 h-4 text-purple-400" />
              </span>
              <div>
                <p className="text-white text-sm font-medium">Artificial Lures Only</p>
                <p className="text-blue-300 text-xs">No live or natural bait allowed</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </span>
              <div>
                <p className="text-white text-sm font-medium">Barbless Hooks Required</p>
                <p className="text-blue-300 text-xs">Hooks must not have barbs</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimer Section */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <div className="bg-amber-500/10 border border-amber-400/20 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-amber-300 font-semibold mb-2">Important Disclaimer</h3>
              <p className="text-amber-200/80 text-sm leading-relaxed">
                Fishing regulations change frequently and may vary by specific water body, season, or emergency order.
                The information provided here is for general reference only. Always verify current regulations with your
                state's official wildlife agency before fishing. Violations can result in fines, loss of fishing privileges,
                and confiscation of equipment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-blue-500/20 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg">
                 <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
                </div>
                <span className="text-lg font-bold text-white">FishingFinderUSA</span>
              </div>
              <p className="text-blue-300 text-sm">
                Your complete guide to fishing regulations, licenses, spots, and species across all 50 states.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Popular Species</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                {['Largemouth Bass', 'Walleye', 'Rainbow Trout', 'Crappie', 'Red Drum', 'Striped Bass'].map(species => (
                  <li key={species}>
                    <button
                      onClick={() => {
                        setSelectedSpecies(species);
                        setViewMode('species');
                        setExpandedStates(new Set([species]));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="hover:text-white transition"
                    >
                      {species}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Regions</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                {Object.keys(regionMap).map(region => (
                  <li key={region}>
                    <button
                      onClick={() => {
                        setSelectedRegion(region);
                        setSelectedRegulation(null);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="hover:text-white transition"
                    >
                      {region} ({regionMap[region].length} states)
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Navigation</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => navigate('/')} className="hover:text-white transition">Fishing Spots</button></li>
                <li><button onClick={() => navigate('/fish-guide')} className="hover:text-white transition">Fish Species Guide</button></li>
                <li><button onClick={() => navigate('/licenses')} className="hover:text-white transition">Fishing Licenses</button></li>
                <li><button className="text-white font-medium">Lodging/Regulations</button></li>
                <li><button onClick={() => navigate('/')} className="hover:text-white transition">Home</button></li>
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

export default Regulations;
