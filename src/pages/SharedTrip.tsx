import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import TripChecklist from '@/components/TripChecklist';
import {
  Fish, MapPin, Calendar, Hotel, Loader2, ArrowLeft, Tent,
  Share2, Waves, TreePine, Anchor, Building, DollarSign, Droplets,
  CheckCircle2, Pencil, ExternalLink
} from 'lucide-react';
import { FishingSpot, getPublicFishingSpots } from '@/data/fishingSpots';
// import { getPublicFishingSpots } from '@/services/fishingData';

interface Trip {
  id: string;
  spot_id: number;
  spot_name: string;
  spot_state: string;
  spot_type: string;
  accommodation_name: string | null;
  start_date: string;
  end_date: string;
  notes: string;
  is_shared: boolean;
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

const SharedTrip: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [fishingSpots, setFishingSpots] = useState<FishingSpot[]>([]);

  useEffect(() => {
    getPublicFishingSpots().then(setFishingSpots).catch(() => setFishingSpots([]));
    if (shareId) fetchSharedTrip();
  }, [shareId]);

  const fetchSharedTrip = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('share_id', shareId)
        .eq('is_shared', true)
        .single();

      if (error || !data) {
        setNotFound(true);
      } else {
        setTrip(data);
      }
    } catch (err) {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const getTripDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin mr-3" />
        <span className="text-blue-300 text-lg">Loading trip...</span>
      </div>
    );
  }

  if (notFound || !trip) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
        <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <button onClick={() => navigate('/')} className="flex items-center gap-3">
              <div className="p-2 rounded-lg">
               <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">FishingFinderUSA</h1>
                <p className="text-blue-300 text-sm">Shared Trip</p>
              </div>
            </button>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <Tent className="w-16 h-16 text-blue-400/50 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Trip Not Found</h2>
          <p className="text-blue-300 mb-6">This trip link is invalid or sharing has been disabled.</p>
          <Button onClick={() => navigate('/')} className="bg-blue-500 hover:bg-blue-600">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go to FishingFinderUSA
          </Button>
        </div>
      </div>
    );
  }

  const spot = fishingSpots.find(s => s.id === trip.spot_id);
  const duration = getTripDuration(trip.start_date, trip.end_date);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <div className="p-2 rounded-lg">
              <img src="https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1786088874271_6dcfe28b.webp" alt="FishingFinderUSA Logo" className="w-10 h-10"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-sm">Shared Trip Plan</p>
            </div>
          </button>
          <Button onClick={() => navigate('/')} variant="ghost" className="text-blue-200 hover:text-white hover:bg-blue-500/20">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Explore Spots
          </Button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Shared Banner */}
        <div className="bg-blue-500/10 border border-blue-400/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <Share2 className="w-5 h-5 text-blue-400" />
          <p className="text-blue-200 text-sm">
            Someone shared this fishing trip plan with you! Plan your own trip on FishingFinderUSA.
          </p>
        </div>

        {/* Trip Card */}
        <div className="bg-slate-800/80 rounded-2xl border border-blue-400/20 overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <Badge className={`${getTypeColor(trip.spot_type)} text-white`}>
                <span className="flex items-center gap-1">
                  {getTypeIcon(trip.spot_type)}
                  {trip.spot_type}
                </span>
              </Badge>
            </div>
            <h2 className="text-3xl font-bold text-white mb-1">{trip.spot_name}</h2>
            <p className="text-blue-300 flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {trip.spot_state}
            </p>

            {spot && (
              <p className="text-gray-300 text-sm mt-3">{spot.description}</p>
            )}

            {/* Trip Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-300 text-xs mb-1.5">
                  <Calendar className="w-4 h-4" />
                  Dates
                </div>
                <p className="text-white font-semibold">
                  {new Date(trip.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' '}&ndash;{' '}
                  {new Date(trip.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{duration} night{duration !== 1 ? 's' : ''}</p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-300 text-xs mb-1.5">
                  <Hotel className="w-4 h-4" />
                  Accommodation
                </div>
                <p className="text-white font-semibold">
                  {trip.accommodation_name || 'Not selected'}
                </p>
              </div>

              {spot && (
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-300 text-xs mb-1.5">
                    <Fish className="w-4 h-4" />
                    Fish Species
                  </div>
                  <p className="text-white font-semibold text-sm">
                    {spot.fish.slice(0, 3).join(', ')}
                    {spot.fish.length > 3 && ` +${spot.fish.length - 3}`}
                  </p>
                </div>
              )}
            </div>

            {trip.notes && (
              <div className="bg-slate-700/50 rounded-lg p-4 mt-4">
                <div className="flex items-center gap-2 text-blue-300 text-xs mb-1.5">
                  <Pencil className="w-4 h-4" />
                  Trip Notes
                </div>
                <p className="text-white text-sm">{trip.notes}</p>
              </div>
            )}

            {/* Action */}
            {spot && (
              <Button
                className="mt-4 bg-blue-500 hover:bg-blue-600"
                onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.address)}`, '_blank')}
              >
                <MapPin className="w-4 h-4 mr-2" />
                Get Directions to {trip.spot_name}
              </Button>
            )}
          </div>

          {/* Checklist (read-only) */}
          <div className="p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-400" />
              Packing Checklist
            </h3>
            <TripChecklist tripId={trip.id} readOnly />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedTrip;
