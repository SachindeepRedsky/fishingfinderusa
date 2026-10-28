import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Fish, Search, ArrowLeft, Loader2, X, ExternalLink, DollarSign,
  Shield, Users, Calendar, MapPin, BookOpen, ChevronRight,
  FileText, AlertTriangle, Info, CheckCircle2, XCircle, Scroll, Scale
} from 'lucide-react';


interface FishingLicense {
  id: number;
  state: string;
  state_abbr: string;
  resident_annual_cost: number | null;
  non_resident_annual_cost: number | null;
  resident_daily_cost: number | null;
  non_resident_daily_cost: number | null;
  youth_exemption_age: number | null;
  senior_exemption_age: number | null;
  senior_discount_pct: number;
  free_fishing_days: string | null;
  agency_name: string;
  agency_url: string;
  purchase_url: string | null;
  notes: string | null;
  freshwater_endorsement: boolean;
  saltwater_endorsement: boolean;
  trout_stamp_required: boolean;
  trout_stamp_cost: number | null;
  updated_at: string;
}

const formatCost = (cost: number | string | null | undefined): string => {
  if (cost === null || cost === undefined) return 'N/A';
  const num = typeof cost === 'string' ? parseFloat(cost) : cost;
  if (isNaN(num)) return 'N/A';
  return `$${num.toFixed(2)}`;
};

const toNum = (val: number | string | null | undefined, fallback: number): number => {
  if (val === null || val === undefined) return fallback;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(num) ? fallback : num;
};


const Licenses: React.FC = () => {
  const navigate = useNavigate();
  const [licenses, setLicenses] = useState<FishingLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'cost-low' | 'cost-high'>('name');
  const [selectedLicense, setSelectedLicense] = useState<FishingLicense | null>(null);
  const [costType, setCostType] = useState<'resident' | 'non-resident'>('resident');

  const regions: Record<string, string[]> = {
    'Northeast': ['Connecticut', 'Delaware', 'Maine', 'Maryland', 'Massachusetts', 'New Hampshire', 'New Jersey', 'New York', 'Pennsylvania', 'Rhode Island', 'Vermont'],
    'Southeast': ['Alabama', 'Arkansas', 'Florida', 'Georgia', 'Kentucky', 'Louisiana', 'Mississippi', 'North Carolina', 'South Carolina', 'Tennessee', 'Virginia', 'West Virginia'],
    'Midwest': ['Illinois', 'Indiana', 'Iowa', 'Kansas', 'Michigan', 'Minnesota', 'Missouri', 'Nebraska', 'North Dakota', 'Ohio', 'South Dakota', 'Wisconsin'],
    'West': ['Alaska', 'Arizona', 'California', 'Colorado', 'Hawaii', 'Idaho', 'Montana', 'Nevada', 'New Mexico', 'Oregon', 'Utah', 'Washington', 'Wyoming'],
    'Southwest': ['Arizona', 'New Mexico', 'Oklahoma', 'Texas'],
  };

  useEffect(() => {
    fetchLicenses();
  }, []);

  const fetchLicenses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fishing_licenses')
        .select('*')
        .order('state', { ascending: true });

      if (error) throw error;
      setLicenses(data || []);
    } catch (err) {
      console.error('Error fetching licenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLicenses = useMemo(() => {
    let result = licenses.filter(license => {
      const matchesSearch = searchQuery === '' ||
        license.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
        license.state_abbr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        license.agency_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRegion = selectedRegion === 'all' ||
        (regions[selectedRegion]?.includes(license.state));

      return matchesSearch && matchesRegion;
    });

    switch (sortBy) {
      case 'cost-low':
        result.sort((a, b) => {
          const costA = costType === 'resident' ? toNum(a.resident_annual_cost, 999) : toNum(a.non_resident_annual_cost, 999);
          const costB = costType === 'resident' ? toNum(b.resident_annual_cost, 999) : toNum(b.non_resident_annual_cost, 999);
          return costA - costB;
        });
        break;
      case 'cost-high':
        result.sort((a, b) => {
          const costA = costType === 'resident' ? toNum(a.resident_annual_cost, 0) : toNum(a.non_resident_annual_cost, 0);
          const costB = costType === 'resident' ? toNum(b.resident_annual_cost, 0) : toNum(b.non_resident_annual_cost, 0);
          return costB - costA;
        });
        break;
      default:
        result.sort((a, b) => a.state.localeCompare(b.state));
    }

    return result;
  }, [licenses, searchQuery, selectedRegion, sortBy, costType]);

  const avgResidentCost = licenses.length > 0
    ? (licenses.reduce((sum, l) => sum + toNum(l.resident_annual_cost, 0), 0) / licenses.length).toFixed(2)
    : '0.00';

  const cheapestState = licenses.length > 0
    ? licenses.reduce((min, l) => toNum(l.resident_annual_cost, 999) < toNum(min.resident_annual_cost, 999) ? l : min, licenses[0])
    : null;


  const troutStampCount = licenses.filter(l => l.trout_stamp_required).length;

  const getRegionForState = (state: string): string => {
    for (const [region, states] of Object.entries(regions)) {
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
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
              <h1 className="md:text-2xl text-lg font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-sm">Fishing Licenses Guide</p>
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <div className="flex items-center gap-6">
              <button
                onClick={() => navigate('/')}
                className="text-blue-200 hover:text-white transition hidden md:flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="md:inline hidden">Fishing Spots</span>
              </button>
              <button
                onClick={() => navigate('/fish-guide')}
                className="text-blue-200 hover:text-white transition flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                <span className="md:inline hidden">Fish Guide</span>
              </button>
              <span className="text-white font-medium flex items-center gap-2">
                <Scroll className="w-4 h-4" />
                <span className="md:inline hidden">Licenses</span>
              </span>
              <button
                onClick={() => navigate('/regulations')}
                className="text-blue-200 hover:text-white transition flex items-center gap-2"
              >
                <Scale className="w-4 h-4" />
                <span className="md:inline hidden">Lodging/Regulations</span>
              </button>
            </div>
          </nav>

        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-16 md:py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/50 via-slate-900/30 to-slate-900" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 rounded-full px-4 py-2 mb-6">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-blue-300 text-sm font-medium">State-by-State License Guide</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Fishing <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">License</span> Requirements
          </h2>
          <p className="text-xl text-blue-200 mb-8 max-w-2xl mx-auto">
            Complete guide to fishing license costs, age exemptions, and official purchase links for all 50 states. Stay legal, fish responsibly.
          </p>

          {/* Quick Stats */}
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
              <p className="text-3xl font-bold text-white">50</p>
              <p className="text-blue-200 text-xs mt-1">States Covered</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
              <p className="text-3xl font-bold text-green-400">${avgResidentCost}</p>
              <p className="text-blue-200 text-xs mt-1">Avg. Resident Cost</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
              <p className="text-3xl font-bold text-white">{cheapestState?.state_abbr || '--'}</p>
              <p className="text-blue-200 text-xs mt-1">Most Affordable</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
              <p className="text-3xl font-bold text-amber-400">{troutStampCount}</p>
              <p className="text-blue-200 text-xs mt-1">Require Trout Stamp</p>
            </div>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="max-w-7xl mx-auto px-4 -mt-4 relative z-20">
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Search by state name or abbreviation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-lg"
              />
            </div>
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
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="cost-low">Cost: Low to High</SelectItem>
                <SelectItem value="cost-high">Cost: High to Low</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex rounded-lg border overflow-hidden h-12">
              <button
                onClick={() => setCostType('resident')}
                className={`flex-1 text-sm font-medium transition ${
                  costType === 'resident'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Resident
              </button>
              <button
                onClick={() => setCostType('non-resident')}
                className={`flex-1 text-sm font-medium transition ${
                  costType === 'non-resident'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Non-Resident
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Results Count */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <p className="text-blue-200">
            Showing <span className="text-white font-semibold">{filteredLicenses.length}</span> of{' '}
            <span className="text-white font-semibold">{licenses.length}</span> states
            {costType === 'non-resident' && (
              <span className="ml-2 text-amber-300 text-sm">(Non-Resident Pricing)</span>
            )}
          </p>
          <div className="flex gap-2 flex-wrap">
            {Object.keys(regions).map(region => (
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
        </div>
      </section>

      {/* License Cards Grid */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mr-3" />
            <span className="text-blue-300 text-lg">Loading license data...</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredLicenses.map(license => {
                const annualCost = costType === 'resident'
                  ? license.resident_annual_cost
                  : license.non_resident_annual_cost;
                const dailyCost = costType === 'resident'
                  ? license.resident_daily_cost
                  : license.non_resident_daily_cost;
                const region = getRegionForState(license.state);

                return (
                  <div
                    key={license.id}
                    onClick={() => setSelectedLicense(license)}
                    className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl hover:bg-white/15 transition-all cursor-pointer group hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/10"
                  >
                    <div className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <Badge className={`${getRegionColor(region)} text-white text-[10px]`}>
                              {region}
                            </Badge>
                            {license.trout_stamp_required && (
                              <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30 text-[10px]">
                                Trout Stamp
                              </Badge>
                            )}
                          </div>
                          <h3 className="text-xl font-bold text-white group-hover:text-blue-300 transition">
                            {license.state}
                          </h3>
                          <p className="text-blue-300 text-sm">{license.state_abbr}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-green-400">
                            {formatCost(annualCost)}
                          </p>
                          <p className="text-blue-300 text-xs">/year</p>
                        </div>
                      </div>

                      {/* Cost Row */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-slate-700/40 rounded-lg p-2.5">
                          <p className="text-blue-300 text-[10px] uppercase tracking-wide mb-0.5">Annual</p>
                          <p className="text-white font-semibold text-sm">{formatCost(annualCost)}</p>
                        </div>
                        <div className="bg-slate-700/40 rounded-lg p-2.5">
                          <p className="text-blue-300 text-[10px] uppercase tracking-wide mb-0.5">Daily</p>
                          <p className="text-white font-semibold text-sm">{formatCost(dailyCost)}</p>
                        </div>
                      </div>

                      {/* Age Exemptions */}
                      <div className="flex items-center gap-4 mb-3 text-sm">
                        {license.youth_exemption_age && (
                          <div className="flex items-center gap-1.5 text-blue-200">
                            <Users className="w-3.5 h-3.5 text-blue-400" />
                            <span>Under {license.youth_exemption_age}: Free</span>
                          </div>
                        )}
                        {license.senior_exemption_age && (
                          <div className="flex items-center gap-1.5 text-blue-200">
                            <Users className="w-3.5 h-3.5 text-purple-400" />
                            <span>
                              {license.senior_exemption_age}+: {Number(license.senior_discount_pct) === 100 ? 'Free' : `${license.senior_discount_pct}% off`}

                            </span>
                          </div>
                        )}
                      </div>

                      {/* Endorsements */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {license.freshwater_endorsement && (
                          <Badge variant="outline" className="text-blue-200 border-blue-400/40 text-[10px]">
                            FW Endorsement
                          </Badge>
                        )}
                        {license.saltwater_endorsement && (
                          <Badge variant="outline" className="text-cyan-200 border-cyan-400/40 text-[10px]">
                            SW Endorsement
                          </Badge>
                        )}
                        {license.trout_stamp_required && license.trout_stamp_cost && (
                          <Badge variant="outline" className="text-amber-200 border-amber-400/40 text-[10px]">
                            Trout: {formatCost(license.trout_stamp_cost)}
                          </Badge>
                        )}
                      </div>

                      {/* Free Fishing Days */}
                      {license.free_fishing_days && license.free_fishing_days !== 'None designated' && (
                        <div className="bg-green-500/10 border border-green-400/20 rounded-lg p-2.5 mb-3">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                            <p className="text-green-200 text-xs">
                              Free fishing: {license.free_fishing_days}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-white/10">
                        <p className="text-blue-300 text-xs truncate max-w-[60%]">
                          {license.agency_name}
                        </p>
                        <span className="text-blue-300 text-xs flex items-center gap-1 group-hover:text-blue-200">
                          Details
                          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredLicenses.length === 0 && !loading && (
              <div className="text-center py-16">
                <Shield className="w-16 h-16 text-blue-400/50 mx-auto mb-4" />
                <h3 className="text-xl text-white mb-2">No states found</h3>
                <p className="text-blue-300 mb-4">Try adjusting your search or filters</p>
                <Button
                  onClick={() => { setSearchQuery(''); setSelectedRegion('all'); }}
                  variant="outline"
                  className="border-blue-400 text-blue-300 hover:bg-blue-500/20"
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Detail Modal */}
      {selectedLicense && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedLicense(null)}
        >
          <div
            className="bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`${getRegionColor(getRegionForState(selectedLicense.state))} text-white`}>
                      {getRegionForState(selectedLicense.state)}
                    </Badge>
                    <Badge className="bg-slate-600 text-white">{selectedLicense.state_abbr}</Badge>
                  </div>
                  <h2 className="text-3xl font-bold text-white">{selectedLicense.state}</h2>
                  <p className="text-blue-300 text-sm mt-1">{selectedLicense.agency_name}</p>
                </div>
                <button
                  onClick={() => setSelectedLicense(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Cost Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-blue-300 text-xs mb-2">
                    <DollarSign className="w-4 h-4" />
                    <span className="font-medium uppercase tracking-wide">Resident</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300 text-sm">Annual</span>
                      <span className="text-green-400 font-bold text-md">{formatCost(selectedLicense.resident_annual_cost)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300 text-sm">Daily</span>
                      <span className="text-green-400 font-semibold">{formatCost(selectedLicense.resident_daily_cost)}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-amber-300 md:text-xs text-[10px] mb-2">
                    <DollarSign className="w-4 h-4" />
                    <span className="font-medium uppercase tracking-wide">Non-Resident</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300 text-sm">Annual</span>
                      <span className="text-amber-400 font-bold text-md">{formatCost(selectedLicense.non_resident_annual_cost)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300 text-sm">Daily</span>
                      <span className="text-amber-400 font-semibold">{formatCost(selectedLicense.non_resident_daily_cost)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Age Exemptions */}
              <div className="bg-slate-700/50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 text-blue-300 text-xs mb-3">
                  <Users className="w-4 h-4" />
                  <span className="font-medium uppercase tracking-wide">Age Exemptions</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Youth Exemption</p>
                    {selectedLicense.youth_exemption_age ? (
                      <div className="flex items-center gap-2 md:w-auto w-[126px]">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <span className="text-white font-medium md:text-sm text-[12px]">
                          Under {selectedLicense.youth_exemption_age} fish free
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-400">No youth exemption</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Senior Discount</p>
                    {selectedLicense.senior_exemption_age ? (
                      <div className="flex items-center gap-2 md:w-auto w-[134px]">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <span className="text-white font-medium md:text-sm text-[12px]">
                          {selectedLicense.senior_exemption_age}+: {Number(selectedLicense.senior_discount_pct) === 100 ? 'Free' : `${selectedLicense.senior_discount_pct}% discount`}

                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-400">No senior discount</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Endorsements & Stamps */}
              <div className="bg-slate-700/50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 text-blue-300 text-xs mb-3">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium uppercase tracking-wide">Endorsements & Stamps</span>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {selectedLicense.freshwater_endorsement ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      )}
                      <span className="text-white text-sm">Freshwater Endorsement</span>
                    </div>
                    <Badge className={selectedLicense.freshwater_endorsement ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300 md:w-auto w-[109px]'}>
                      {selectedLicense.freshwater_endorsement ? 'Required' : 'Not Required'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {selectedLicense.saltwater_endorsement ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      )}
                      <span className="text-white text-sm">Saltwater Endorsement</span>
                    </div>
                    <Badge className={selectedLicense.saltwater_endorsement ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300'}>
                      {selectedLicense.saltwater_endorsement ? 'Required' : 'Not Required'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {selectedLicense.trout_stamp_required ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      )}
                      <span className="text-white text-sm">Trout Stamp</span>
                    </div>
                    <Badge className={selectedLicense.trout_stamp_required ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300'}>
                      {selectedLicense.trout_stamp_required
                        ? `Required${selectedLicense.trout_stamp_cost ? ` (${formatCost(selectedLicense.trout_stamp_cost)})` : ''}`
                        : 'Not Required'
                      }
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Free Fishing Days */}
              {selectedLicense.free_fishing_days && (
                <div className="bg-green-500/10 border border-green-400/20 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 text-green-300 text-xs mb-2">
                    <Calendar className="w-4 h-4" />
                    <span className="font-medium uppercase tracking-wide">Free Fishing Days</span>
                  </div>
                  <p className="text-green-100 font-medium">{selectedLicense.free_fishing_days}</p>
                  <p className="text-green-300 text-xs mt-1">No license required on these dates</p>
                </div>
              )}

              {/* Notes */}
              {selectedLicense.notes && (
                <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-blue-300 text-xs font-medium uppercase tracking-wide mb-1">Important Notes</p>
                      <p className="text-blue-100 text-sm">{selectedLicense.notes}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                {selectedLicense.purchase_url && (
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => window.open(selectedLicense.purchase_url!, '_blank')}
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Buy License Online
                    <ExternalLink className="w-3.5 h-3.5 ml-2" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="flex-1 border-blue-400 text-blue-300 hover:bg-blue-500/20 bg-inherit"
                  onClick={() => window.open(selectedLicense.agency_url, '_blank')}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Visit {selectedLicense.state_abbr} Wildlife Agency
                  <ExternalLink className="w-3.5 h-3.5 ml-2" />
                </Button>
              </div>

              <p className="text-gray-500 text-xs text-center mt-4">
                Last updated: {new Date(selectedLicense.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. 
                Prices may vary. Always verify with the official state agency.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer Section */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <div className="bg-amber-500/10 border border-amber-400/20 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-amber-300 font-semibold mb-2">Important Disclaimer</h3>
              <p className="text-amber-200/80 text-sm leading-relaxed">
                License fees and regulations are subject to change. The information provided here is for general reference only. 
                Always verify current fees, requirements, and regulations with your state's official wildlife agency before purchasing 
                a license or going fishing. Some states may have additional permits, stamps, or endorsements required for specific 
                species or water bodies not listed here.
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
                Your complete guide to fishing licenses, spots, and species across all 50 states.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Regions</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                {Object.keys(regions).map(region => (
                  <li key={region}>
                    <button
                      onClick={() => { setSelectedRegion(region); setSelectedLicense(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className="hover:text-white transition"
                    >
                      {region} ({regions[region].length} states)
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => { setSortBy('cost-low'); setCostType('resident'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-white transition">Cheapest Licenses</button></li>
                <li><button onClick={() => { setSortBy('cost-low'); setCostType('non-resident'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-white transition">Cheapest Non-Resident</button></li>
                <li><button onClick={() => { setSearchQuery(''); setSelectedRegion('all'); setSortBy('name'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-white transition">View All States</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Navigation</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => navigate('/')} className="hover:text-white transition">Fishing Spots</button></li>
                <li><button onClick={() => navigate('/fish-guide')} className="hover:text-white transition">Fish Species Guide</button></li>
                <li><button className="text-white font-medium">Fishing Licenses</button></li>
                <li><button onClick={() => navigate('/regulations')} className="hover:text-white transition">Lodging/Regulations</button></li>
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

export default Licenses;
