import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import TripPlannerModal from '@/components/TripPlannerModal';
import TripChecklist from '@/components/TripChecklist';
import {
  Fish, MapPin, Calendar, Hotel, Plus, Loader2, Trash2,
  Share2, Link2, Check, X, ChevronRight, ArrowLeft,
  Tent, Clock, CheckCircle2, AlertCircle, Eye, Pencil,
  Copy, ExternalLink, Waves, TreePine, Anchor, Building,
  DollarSign, Droplets
} from 'lucide-react';
import {  getPublicFishingSpots,FishingSpot } from '@/data/fishingSpots';

interface Trip {
  id: string;
  spot_id: number;
  spot_name: string;
  spot_state: string;
  spot_type: string;
  accommodation_id: number | null;
  accommodation_name: string | null;
  start_date: string;
  end_date: string;
  notes: string;
  share_id: string;
  is_shared: boolean;
  created_at: string;
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'lake': return <Waves className="w-4 h-4" />;
    case 'river': return <TreePine className="w-4 h-4" />;
    case 'ocean': return <Anchor className="w-4 h-4" />;
    case 'dam': return <Droplets className="w-4 h-4" />;
    case 'private': return <Building className="w-4 h-4" />;
    case 'pay-lake': return <DollarSign className="w-4 h-4" />;
    default: return <Fish className="w-4 h-4" />;
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'lake': return 'bg-blue-500';
    case 'river': return 'bg-green-500';
    case 'ocean': return 'bg-cyan-600';
    case 'dam': return 'bg-slate-600';
    case 'private': return 'bg-purple-500';
    case 'pay-lake': return 'bg-amber-500';
    default: return 'bg-gray-500';
  }
};

const MyTrips: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlannerModal, setShowPlannerModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [deletingTrip, setDeletingTrip] = useState<string | null>(null);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const [fishingSpots, setFishingSpots] = useState<FishingSpot[]>([]);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');

  useEffect(() => {
    getPublicFishingSpots().then(setFishingSpots).catch(() => setFishingSpots([]));
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      fetchTrips(session.user.id);
    } else {
      setLoading(false);
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchTrips(session.user.id);
      } else {
        setUser(null);
        setTrips([]);
        setLoading(false);
      }
    });
  };

  const fetchTrips = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('user_id', userId)
        .order('start_date', { ascending: true });

      if (error) throw error;
      setTrips(data || []);
    } catch (err) {
      console.error('Error fetching trips:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteTrip = async (tripId: string) => {
    setDeletingTrip(tripId);
    try {
      await supabase.from('trips').delete().eq('id', tripId);
      setTrips(prev => prev.filter(t => t.id !== tripId));
      if (selectedTrip?.id === tripId) setSelectedTrip(null);
    } catch (err) {
      console.error('Error deleting trip:', err);
    } finally {
      setDeletingTrip(null);
    }
  };

  const toggleShare = async (trip: Trip) => {
    const newShared = !trip.is_shared;
    setTrips(prev => prev.map(t => t.id === trip.id ? { ...t, is_shared: newShared } : t));
    if (selectedTrip?.id === trip.id) {
      setSelectedTrip({ ...trip, is_shared: newShared });
    }

    await supabase
      .from('trips')
      .update({ is_shared: newShared })
      .eq('id', trip.id);
  };

  const copyShareLink = (trip: Trip) => {
    const url = `${window.location.origin}/trip/${trip.share_id}`;
    navigator.clipboard.writeText(url);
    setCopiedShareId(trip.id);
    setTimeout(() => setCopiedShareId(null), 2000);
  };

  const today = new Date().toISOString().split('T')[0];

  const filteredTrips = trips.filter(trip => {
    if (filter === 'upcoming') return trip.end_date >= today;
    if (filter === 'past') return trip.end_date < today;
    return true;
  });

  const upcomingCount = trips.filter(t => t.end_date >= today).length;
  const pastCount = trips.filter(t => t.end_date < today).length;

  const getDaysUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getTripDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getTripStatus = (trip: Trip) => {
    const daysUntil = getDaysUntil(trip.start_date);
    const daysUntilEnd = getDaysUntil(trip.end_date);

    if (daysUntilEnd < 0) return { label: 'Completed', color: 'bg-gray-500', icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
    if (daysUntil <= 0 && daysUntilEnd >= 0) return { label: 'Active Now', color: 'bg-green-500', icon: <Fish className="w-3.5 h-3.5" /> };
    if (daysUntil <= 7) return { label: `${daysUntil}d away`, color: 'bg-amber-500', icon: <AlertCircle className="w-3.5 h-3.5" /> };
    return { label: `${daysUntil}d away`, color: 'bg-blue-500', icon: <Clock className="w-3.5 h-3.5" /> };
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
        <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-2 py-4 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="flex items-center gap-3">
              <div className="p-2 rounded-lg">
               <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">FishingFinderUSA</h1>
                <p className="text-blue-300 text-sm">My Trips</p>
              </div>
            </button>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <Tent className="w-16 h-16 text-blue-400/50 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Sign in to plan trips</h2>
          <p className="text-blue-300 mb-6">Create an account to start planning your fishing adventures.</p>
          <Button onClick={() => navigate('/')} className="bg-blue-500 hover:bg-blue-600">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-2 py-4 flex items-center justify-between">
          <Button onClick={() => navigate('/')} variant="ghost" className="text-blue-200 hover:text-white hover:bg-blue-500/20 md:hidden">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <div className="p-2 rounded-lg">
              <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-sm">My Trips</p>
            </div>
          </button>
          <div className="flex items-center gap-3">
            <Button onClick={() => navigate('/')} variant="ghost" className="text-blue-200 hover:text-white hover:bg-blue-500/20 hidden md:flex">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Spot
            </Button>
            <Button onClick={() => setShowPlannerModal(true)} className="bg-blue-500 hover:bg-blue-600">
              <Plus className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Plan New Trip</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <Tent className="w-8 h-8 text-blue-400" />
              My Fishing Trips
            </h2>
            <p className="text-blue-300 mt-1">
              {trips.length} trip{trips.length !== 1 ? 's' : ''} planned &middot; {upcomingCount} upcoming
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { key: 'upcoming' as const, label: 'Upcoming', count: upcomingCount },
            { key: 'past' as const, label: 'Past', count: pastCount },
            { key: 'all' as const, label: 'All Trips', count: trips.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === tab.key
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-blue-200 hover:bg-white/10'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mr-3" />
            <span className="text-blue-300 text-lg">Loading your trips...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Trip List */}
            <div className={`${selectedTrip ? 'lg:col-span-1' : 'lg:col-span-3'} space-y-4`}>
              {filteredTrips.length === 0 ? (
                <div className="text-center py-16">
                  <Tent className="w-16 h-16 text-blue-400/30 mx-auto mb-4" />
                  <h3 className="text-xl text-white mb-2">
                    {filter === 'upcoming' ? 'No upcoming trips' : filter === 'past' ? 'No past trips' : 'No trips yet'}
                  </h3>
                  <p className="text-blue-300 mb-6">Plan your next fishing adventure!</p>
                  <Button onClick={() => setShowPlannerModal(true)} className="bg-blue-500 hover:bg-blue-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Plan Your First Trip
                  </Button>
                </div>
              ) : (
                <div className={`grid ${selectedTrip ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'} gap-4`}>
                  {filteredTrips.map(trip => {
                    const status = getTripStatus(trip);
                    const duration = getTripDuration(trip.start_date, trip.end_date);
                    const isActive = selectedTrip?.id === trip.id;

                    return (
                      <div
                        key={trip.id}
                        onClick={() => setSelectedTrip(isActive ? null : trip)}
                        className={`bg-white/5 backdrop-blur-sm rounded-xl border cursor-pointer transition-all hover:scale-[1.01] ${
                          isActive
                            ? 'border-blue-400 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                            : 'border-white/10 hover:border-blue-400/30 hover:bg-white/10'
                        }`}
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge className={`${getTypeColor(trip.spot_type)} text-white text-[10px]`}>
                                  <span className="flex items-center gap-1">
                                    {getTypeIcon(trip.spot_type)}
                                    {trip.spot_type}
                                  </span>
                                </Badge>
                                <Badge className={`${status.color} text-white text-[10px]`}>
                                  <span className="flex items-center gap-1">
                                    {status.icon}
                                    {status.label}
                                  </span>
                                </Badge>
                              </div>
                              <h3 className="text-white font-bold text-lg truncate">{trip.spot_name}</h3>
                              <div className="flex items-center gap-1.5 text-blue-300 text-sm">
                                <MapPin className="w-3.5 h-3.5" />
                                {trip.spot_state}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-blue-200">
                              <Calendar className="w-4 h-4 text-blue-400" />
                              <span>
                                {new Date(trip.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {' '}&ndash;{' '}
                                {new Date(trip.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              <span className="text-gray-400">({duration}n)</span>
                            </div>

                            {trip.accommodation_name && (
                              <div className="flex items-center gap-2 text-blue-200">
                                <Hotel className="w-4 h-4 text-blue-400" />
                                <span className="truncate">{trip.accommodation_name}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                            <div className="flex gap-1.5">
                              {trip.is_shared && (
                                <Badge className="bg-green-500/20 text-green-300 border-green-400/30 text-[10px]">
                                  <Share2 className="w-3 h-3 mr-1" />
                                  Shared
                                </Badge>
                              )}
                            </div>
                            <span className="text-blue-300 text-xs flex items-center gap-1">
                              View Details <ChevronRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Trip Detail Panel */}
            {selectedTrip && (
              <div className="lg:col-span-2">
                <div className="bg-slate-800/80 rounded-2xl border border-blue-400/20 sticky top-24">
                  {/* Detail Header */}
                  <div className="p-6 border-b border-white/10">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`${getTypeColor(selectedTrip.spot_type)} text-white`}>
                            <span className="flex items-center gap-1">
                              {getTypeIcon(selectedTrip.spot_type)}
                              {selectedTrip.spot_type}
                            </span>
                          </Badge>
                          {(() => {
                            const s = getTripStatus(selectedTrip);
                            return (
                              <Badge className={`${s.color} text-white`}>
                                <span className="flex items-center gap-1">{s.icon} {s.label}</span>
                              </Badge>
                            );
                          })()}
                        </div>
                        <h2 className="text-2xl font-bold text-white">{selectedTrip.spot_name}</h2>
                        <p className="text-blue-300 flex items-center gap-1.5 mt-1">
                          <MapPin className="w-4 h-4" />
                          {selectedTrip.spot_state}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTrip(null)}
                        className="text-gray-400 hover:text-white"
                      >
                        <X className="w-5 h-5" />
                      </Button>
                    </div>

                    {/* Trip Info */}
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-blue-300 text-xs mb-1">
                          <Calendar className="w-3.5 h-3.5" />
                          Dates
                        </div>
                        <p className="text-white text-sm font-medium">
                          {new Date(selectedTrip.start_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          {' '}&ndash;{' '}
                          {new Date(selectedTrip.end_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {getTripDuration(selectedTrip.start_date, selectedTrip.end_date)} night{getTripDuration(selectedTrip.start_date, selectedTrip.end_date) !== 1 ? 's' : ''}
                        </p>
                      </div>

                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-blue-300 text-xs mb-1">
                          <Hotel className="w-3.5 h-3.5" />
                          Accommodation
                        </div>
                        <p className="text-white text-sm font-medium truncate">
                          {selectedTrip.accommodation_name || 'Not selected'}
                        </p>
                      </div>
                    </div>

                    {selectedTrip.notes && (
                      <div className="bg-slate-700/50 rounded-lg p-3 mt-3">
                        <div className="flex items-center gap-2 text-blue-300 text-xs mb-1">
                          <Pencil className="w-3.5 h-3.5" />
                          Notes
                        </div>
                        <p className="text-white text-sm">{selectedTrip.notes}</p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        onClick={() => toggleShare(selectedTrip)}
                        className={selectedTrip.is_shared
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-slate-600 hover:bg-slate-500'
                        }
                      >
                        <Share2 className="w-3.5 h-3.5 mr-1.5" />
                        {selectedTrip.is_shared ? 'Sharing On' : 'Enable Sharing'}
                      </Button>

                      {selectedTrip.is_shared && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyShareLink(selectedTrip)}
                          className="border-blue-400/50 text-blue-300 hover:bg-blue-500/20"
                        >
                          {copiedShareId === selectedTrip.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 mr-1.5 text-green-400" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 mr-1.5" />
                              Copy Link
                            </>
                          )}
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const spot = fishingSpots.find(s => s.id === selectedTrip.spot_id);
                          if (spot) {
                            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.address)}`, '_blank');
                          }
                        }}
                        className="border-blue-400/50 text-blue-300 hover:bg-blue-500/20"
                      >
                        <MapPin className="w-3.5 h-3.5 mr-1.5" />
                        Directions
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteTrip(selectedTrip.id)}
                        disabled={deletingTrip === selectedTrip.id}
                        className="border-red-400/50 text-red-300 hover:bg-red-500/20 ml-auto"
                      >
                        {deletingTrip === selectedTrip.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="p-6 max-h-[50vh] overflow-y-auto">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-blue-400" />
                      Packing Checklist
                    </h3>
                    <TripChecklist tripId={selectedTrip.id} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trip Planner Modal */}
      <TripPlannerModal
        isOpen={showPlannerModal}
        onClose={() => setShowPlannerModal(false)}
        userId={user?.id || ''}
        onTripCreated={() => {
          if (user) fetchTrips(user.id);
        }}
      />
    </div>
  );
};

export default MyTrips;
