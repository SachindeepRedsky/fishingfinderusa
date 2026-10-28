import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building,
  Phone,
  MapPin,
  Star,
  DollarSign,
  Wifi,
  Car,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Home,
  Hotel,
  TreePine,
  Waves,
} from 'lucide-react';

interface Accommodation {
  id: number;
  spot_id: number;
  name: string;
  type: string;
  address: string;
  phone: string;
  price_min: number;
  price_max: number;
  rating: number;
  description: string;
  amenities: string[];
  website: string | null;
  distance_miles: number;
}

interface AccommodationsSectionProps {
  spotId: number;
  spotName: string;
  isProUser: boolean;
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'hotel': return <Hotel className="w-4 h-4" />;
    case 'motel': return <Building className="w-4 h-4" />;
    case 'airbnb': return <Home className="w-4 h-4" />;
    case 'lodge': return <TreePine className="w-4 h-4" />;
    case 'cabin': return <TreePine className="w-4 h-4" />;
    case 'resort': return <Waves className="w-4 h-4" />;
    default: return <Building className="w-4 h-4" />;
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'hotel': return 'bg-blue-600';
    case 'motel': return 'bg-amber-600';
    case 'airbnb': return 'bg-rose-500';
    case 'lodge': return 'bg-green-600';
    case 'cabin': return 'bg-emerald-600';
    case 'resort': return 'bg-purple-600';
    default: return 'bg-gray-600';
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'hotel': return 'Hotel';
    case 'motel': return 'Motel';
    case 'airbnb': return 'Airbnb';
    case 'lodge': return 'Lodge';
    case 'cabin': return 'Cabin';
    case 'resort': return 'Resort';
    default: return type;
  }
};

const getPriceLevel = (min: number) => {
  if (min < 100) return { label: 'Budget', color: 'text-green-400' };
  if (min < 200) return { label: 'Mid-Range', color: 'text-blue-400' };
  if (min < 400) return { label: 'Upscale', color: 'text-purple-400' };
  return { label: 'Luxury', color: 'text-amber-400' };
};

const renderStars = (rating: number) => {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.3;
  const stars = [];
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(
        <Star key={i} className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
      );
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <div key={i} className="relative">
          <Star className="w-3.5 h-3.5 text-gray-500" />
          <div className="absolute inset-0 overflow-hidden w-1/2">
            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
          </div>
        </div>
      );
    } else {
      stars.push(
        <Star key={i} className="w-3.5 h-3.5 text-gray-500" />
      );
    }
  }
  return stars;
};

const getAmenityIcon = (amenity: string) => {
  const lower = amenity.toLowerCase();
  if (lower.includes('wifi')) return <Wifi className="w-3 h-3" />;
  if (lower.includes('parking') || lower.includes('valet')) return <Car className="w-3 h-3" />;
  return null;
};

const AccommodationsSection: React.FC<AccommodationsSectionProps> = ({ spotId, spotName, isProUser }) => {
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('rating');

  useEffect(() => {
    fetchAccommodations();
  }, [spotId]);

  const fetchAccommodations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('accommodations')
        .select('*')
        .eq('spot_id', spotId)
        .order('rating', { ascending: false });

      if (error) throw error;
      setAccommodations(data || []);
    } catch (err) {
      console.error('Error fetching accommodations:', err);
      setAccommodations([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredAccommodations = accommodations
    .filter(a => filterType === 'all' || a.type === filterType)
    .sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'price-low') return a.price_min - b.price_min;
      if (sortBy === 'price-high') return b.price_max - a.price_max;
      if (sortBy === 'distance') return a.distance_miles - b.distance_miles;
      return 0;
    });

  const uniqueTypes = [...new Set(accommodations.map(a => a.type))];

  if (loading) {
    return (
      <div className="bg-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Building className="w-5 h-5 text-blue-300" />
          <span className="font-medium text-blue-300">Nearby Accommodations</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="ml-2 text-blue-300">Loading accommodations...</span>
        </div>
      </div>
    );
  }

  if (accommodations.length === 0) {
    return (
      <div className="bg-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Building className="w-5 h-5 text-blue-300" />
          <span className="font-medium text-blue-300">Nearby Accommodations</span>
        </div>
        <div className="text-center py-6">
          <Building className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No accommodations listed yet for this spot.</p>
          <p className="text-gray-500 text-xs mt-1">Check Google Maps for nearby lodging options.</p>
          <button
            className="mt-3 border-blue-400/50 text-blue-300 hover:bg-blue-500/20"
            onClick={() => window.open(`https://www.google.com/maps/search/hotels+near+${encodeURIComponent(spotName)}`, '_blank')}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Search on Google Maps
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-700/60 to-slate-800/60 rounded-lg p-5 border border-blue-400/10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/20 p-2 rounded-lg">
            <Building className="w-5 h-5 text-blue-300" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Nearby Accommodations</h3>
            <p className="text-xs text-blue-300">{accommodations.length} place{accommodations.length !== 1 ? 's' : ''} to stay</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      {uniqueTypes.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-full text-xs transition ${
              filterType === 'all' ? 'bg-blue-500 text-white' : 'bg-white/10 text-blue-200 hover:bg-white/20'
            }`}
          >
            All ({accommodations.length})
          </button>
          {uniqueTypes.map(type => (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? 'all' : type)}
              className={`px-3 py-1 rounded-full text-xs transition flex items-center gap-1 ${
                filterType === type ? 'bg-blue-500 text-white' : 'bg-white/10 text-blue-200 hover:bg-white/20'
              }`}
            >
              {getTypeIcon(type)}
              {getTypeLabel(type)} ({accommodations.filter(a => a.type === type).length})
            </button>
          ))}
        </div>
      )}

      {/* Sort */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-400">Sort by:</span>
        {[
          { value: 'rating', label: 'Rating' },
          { value: 'price-low', label: 'Price: Low' },
          { value: 'price-high', label: 'Price: High' },
          { value: 'distance', label: 'Distance' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setSortBy(opt.value)}
            className={`px-2 py-0.5 rounded text-xs transition ${
              sortBy === opt.value ? 'bg-blue-500/30 text-blue-200' : 'text-gray-400 hover:text-blue-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Accommodation Cards */}
      <div className="space-y-3">
        {filteredAccommodations.map(acc => {
          const priceLevel = getPriceLevel(acc.price_min);
          const isExpanded = expandedId === acc.id;

          return (
            <div
              key={acc.id}
              className="bg-slate-800/80 rounded-xl border border-white/5 overflow-hidden hover:border-blue-500/30 transition-all"
            >
              {/* Main Info */}
              <div
                className="p-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : acc.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className={`${getTypeColor(acc.type)} text-white text-[10px] px-2 py-0`}>
                        <span className="flex items-center gap-1">
                          {getTypeIcon(acc.type)}
                          {getTypeLabel(acc.type)}
                        </span>
                      </Badge>
                      {acc.distance_miles !== null && (
                        <span className="text-[10px] text-gray-400">
                          {acc.distance_miles} mi away
                        </span>
                      )}
                    </div>
                    <h4 className="text-white font-semibold text-sm truncate">{acc.name}</h4>
                    {isProUser ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="flex items-center gap-0.5">
                          {renderStars(acc.rating)}
                        </div>
                        <span className="text-xs text-yellow-400 font-medium">{acc.rating}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-300 mt-1">Ratings are a Pro feature</span>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-sm font-bold ${priceLevel.color}`}>
                      ${acc.price_min} - ${acc.price_max}
                    </div>
                    <div className="text-[10px] text-gray-400">per night</div>
                    <div className={`text-[10px] ${priceLevel.color}`}>{priceLevel.label}</div>
                  </div>
                </div>

                {/* Preview amenities */}
                {acc.amenities && acc.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {acc.amenities.slice(0, 4).map((amenity, i) => (
                      <span key={i} className="bg-white/5 text-gray-300 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        {getAmenityIcon(amenity)}
                        {amenity}
                      </span>
                    ))}
                    {acc.amenities.length > 4 && (
                      <span className="text-[10px] text-gray-400 px-1">
                        +{acc.amenities.length - 4} more
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-center mt-2">
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                  {acc.description && (
                    <p className="text-gray-300 text-sm">{acc.description}</p>
                  )}

                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-300">{acc.address}</span>
                  </div>

                  {acc.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <a
                        href={`tel:${acc.phone}`}
                        className="text-sm text-green-400 hover:text-green-300 transition"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {acc.phone}
                      </a>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="text-sm text-gray-300">
                      <span className="font-semibold text-white">${acc.price_min}</span> - <span className="font-semibold text-white">${acc.price_max}</span> per night
                    </span>
                  </div>

                  {/* All amenities */}
                  {acc.amenities && acc.amenities.length > 0 && (
                    <div>
                      <p className="text-xs text-blue-300 uppercase tracking-wide mb-2">Amenities</p>
                      <div className="flex flex-wrap gap-1.5">
                        {acc.amenities.map((amenity, i) => (
                          <span key={i} className="bg-blue-500/10 text-blue-200 text-xs px-2.5 py-1 rounded-full border border-blue-400/20 flex items-center gap-1">
                            {getAmenityIcon(amenity)}
                            {amenity}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    {acc.phone && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`tel:${acc.phone}`);
                        }}
                      >
                        <Phone className="w-3.5 h-3.5 mr-1.5" />
                        Call Now
                      </Button>
                    )}
                    <button
                      className="border-blue-400/50 text-blue-300 hover:bg-blue-500/20 flex-1 border flex items-center justify-center rounded-md text-sm px-3 py-1.5 transition"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(acc.name + ' ' + acc.address)}`, '_blank');
                      }}
                    >
                      <MapPin className="w-3.5 h-3.5 mr-1.5" />
                      Directions
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Search More Button */}
      <div className="mt-4 text-center">
        <Button
          variant="outline"
          size="sm"
          className="border-blue-400/30 text-blue-300 hover:bg-blue-500/20 bg-inherit"
          onClick={() => window.open(`https://www.google.com/maps/search/hotels+near+${encodeURIComponent(spotName)}`, '_blank')}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          Search More on Google Maps
        </Button>
      </div>
    </div>
  );
};

export default AccommodationsSection;
