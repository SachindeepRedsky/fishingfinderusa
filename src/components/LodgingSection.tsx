import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LodgingReviewModal from '@/components/LodgingReviewModal';
import LodgingReviewsList from '@/components/LodgingReviewsList';
import AuthModal from '@/components/AuthModal';
import { useProAccess } from '@/hooks/use-mobile';
import {
  Search, Loader2, ExternalLink, MapPin, Phone, Star, DollarSign,
  Hotel, TreePine, Tent, Building, Waves, Home, Truck,
  Wifi, Car, X, Filter, ChevronDown, ChevronUp, PawPrint,
  Calendar, Mountain, Fish, MessageSquare, PenLine, User
} from 'lucide-react';

interface Lodging {
  id: number;
  name: string;
  type: string;
  state: string;
  state_abbr: string;
  city: string;
  price_range: string;
  price_per_night_min: number;
  price_per_night_max: number;
  proximity_to_water: string;
  amenities: string[];
  booking_url: string | null;
  rating: number;
  review_count: number;
  description: string;
  phone: string | null;
  pet_friendly: boolean;
  seasonal: boolean;
  season_open: string | null;
  season_close: string | null;
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'hotel': return <Hotel className="w-4 h-4" />;
    case 'cabin': return <Home className="w-4 h-4" />;
    case 'campground': return <Tent className="w-4 h-4" />;
    case 'lodge': return <TreePine className="w-4 h-4" />;
    case 'resort': return <Waves className="w-4 h-4" />;
    case 'rv_park': return <Truck className="w-4 h-4" />;
    default: return <Building className="w-4 h-4" />;
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'hotel': return 'Hotel';
    case 'cabin': return 'Cabin';
    case 'campground': return 'Campground';
    case 'lodge': return 'Lodge';
    case 'resort': return 'Resort';
    case 'rv_park': return 'RV Park';
    default: return type;
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'hotel': return 'bg-blue-600';
    case 'cabin': return 'bg-amber-600';
    case 'campground': return 'bg-green-600';
    case 'lodge': return 'bg-emerald-600';
    case 'resort': return 'bg-purple-600';
    case 'rv_park': return 'bg-orange-600';
    default: return 'bg-gray-600';
  }
};

const getTypeGradient = (type: string) => {
  switch (type) {
    case 'hotel': return 'from-blue-500/20 to-blue-600/5';
    case 'cabin': return 'from-amber-500/20 to-amber-600/5';
    case 'campground': return 'from-green-500/20 to-green-600/5';
    case 'lodge': return 'from-emerald-500/20 to-emerald-600/5';
    case 'resort': return 'from-purple-500/20 to-purple-600/5';
    case 'rv_park': return 'from-orange-500/20 to-orange-600/5';
    default: return 'from-gray-500/20 to-gray-600/5';
  }
};

const getPriceColor = (range: string) => {
  switch (range) {
    case '$': return 'text-green-400';
    case '$$': return 'text-blue-400';
    case '$$$': return 'text-purple-400';
    case '$$$$': return 'text-amber-400';
    default: return 'text-gray-400';
  }
};

const getPriceLabel = (range: string) => {
  switch (range) {
    case '$': return 'Budget';
    case '$$': return 'Mid-Range';
    case '$$$': return 'Upscale';
    case '$$$$': return 'Luxury';
    default: return range;
  }
};

const renderStars = (rating: number) => {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.3;
  const stars: React.ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(<Star key={i} className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />);
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
      stars.push(<Star key={i} className="w-3.5 h-3.5 text-gray-500" />);
    }
  }
  return stars;
};

const getAmenityIcon = (amenity: string) => {
  const lower = amenity.toLowerCase();
  if (lower.includes('wifi')) return <Wifi className="w-3 h-3" />;
  if (lower.includes('parking') || lower.includes('hookup')) return <Car className="w-3 h-3" />;
  if (lower.includes('pool')) return <Waves className="w-3 h-3" />;
  if (lower.includes('restaurant') || lower.includes('meal')) return <Building className="w-3 h-3" />;
  if (lower.includes('guide')) return <Fish className="w-3 h-3" />;
  if (lower.includes('mountain') || lower.includes('hiking')) return <Mountain className="w-3 h-3" />;
  return null;
};

const ITEMS_PER_PAGE = 12;

const LodgingSection: React.FC = () => {
  const navigate = useNavigate();
  const { isProUser } = useProAccess();
  const [lodgings, setLodgings] = useState<Lodging[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedPrice, setSelectedPrice] = useState('all');
  const [sortBy, setSortBy] = useState('rating');
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  // Review system state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewLodging, setReviewLodging] = useState<Lodging | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [reviewRefreshTrigger, setReviewRefreshTrigger] = useState(0);

  useEffect(() => {
    fetchLodgings();
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  const fetchLodgings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lodging')
        .select('*')
        .order('rating', { ascending: false });

      if (error) throw error;
      setLodgings(data || []);
    } catch (err) {
      console.error('Error fetching lodging:', err);
      setLodgings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleWriteReview = useCallback((lodging: Lodging) => {
    if (!isProUser) {
      navigate('/pricing');
      return;
    }
    if (!currentUser) {
      setReviewLodging(lodging);
      setAuthModalOpen(true);
      return;
    }
    setReviewLodging(lodging);
    setReviewModalOpen(true);
  }, [currentUser, isProUser, navigate]);

  const handleAuthSuccess = useCallback(() => {
    checkAuth();
    // If there was a pending review, open the review modal
    if (reviewLodging) {
      setTimeout(() => {
        setReviewModalOpen(true);
      }, 300);
    }
  }, [reviewLodging]);

  const handleReviewSubmitted = useCallback(() => {
    setReviewRefreshTrigger(prev => prev + 1);
    // Refresh lodging data to get updated ratings
    fetchLodgings();
  }, []);

  const allStates = useMemo(() => {
    return [...new Set(lodgings.map(l => l.state))].sort();
  }, [lodgings]);

  const allTypes = useMemo(() => {
    return [...new Set(lodgings.map(l => l.type))].sort();
  }, [lodgings]);

  const filteredLodgings = useMemo(() => {
    let results = lodgings.filter(l => {
      const matchesSearch = searchQuery === '' ||
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesState = selectedState === 'all' || l.state === selectedState;
      const matchesType = selectedType === 'all' || l.type === selectedType;
      const matchesPrice = selectedPrice === 'all' || l.price_range === selectedPrice;
      return matchesSearch && matchesState && matchesType && matchesPrice;
    });

    results.sort((a, b) => {
      switch (sortBy) {
        case 'rating': return b.rating - a.rating;
        case 'price-low': return a.price_per_night_min - b.price_per_night_min;
        case 'price-high': return b.price_per_night_max - a.price_per_night_max;
        case 'name': return a.name.localeCompare(b.name);
        case 'reviews': return b.review_count - a.review_count;
        default: return 0;
      }
    });

    return results;
  }, [lodgings, searchQuery, selectedState, selectedType, selectedPrice, sortBy]);

  const hasActiveFilters = searchQuery !== '' || selectedState !== 'all' || selectedType !== 'all' || selectedPrice !== 'all';

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [searchQuery, selectedState, selectedType, selectedPrice, sortBy]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedState('all');
    setSelectedType('all');
    setSelectedPrice('all');
  };

  const visibleLodgings = useMemo(() => {
    return filteredLodgings.slice(0, visibleCount);
  }, [filteredLodgings, visibleCount]);

  const hasMore = visibleCount < filteredLodgings.length;
  const remainingCount = filteredLodgings.length - visibleCount;


  // Stats
  const typeStats = useMemo(() => {
    const stats: Record<string, number> = {};
    filteredLodgings.forEach(l => {
      stats[l.type] = (stats[l.type] || 0) + 1;
    });
    return stats;
  }, [filteredLodgings]);

  return (
    <section className="max-w-7xl mx-auto px-4 pb-12">
      {/* Section Header */}
      <div className="text-center mb-8 mt-2">
        <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-400/30 rounded-full px-4 py-2 mb-4">
          <Hotel className="w-4 h-4 text-amber-400" />
          <span className="text-amber-300 text-sm font-medium">Fishing Lodging & Accommodations</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
          Find Your <span className="bg-gradient-to-r from-amber-400 to-orange-300 bg-clip-text text-transparent">Perfect Stay</span>
        </h2>
        <p className="text-blue-200 max-w-2xl mx-auto">
          Browse <span className="text-white font-semibold">{lodgings.length}</span> hotels, cabins, campgrounds, lodges, and resorts near the best fishing spots across all <span className="text-white font-semibold">50 states</span>.
        </p>
      </div>


      {/* Search & Filters Card */}
      <div className="bg-white rounded-2xl shadow-2xl p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search */}
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Search lodging by name, city, state..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-lg"
            />
          </div>
          {/* State Filter */}
          <Select value={selectedState} onValueChange={setSelectedState}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {allStates.map(state => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Type Filter */}
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {allTypes.map(type => (
                <SelectItem key={type} value={type}>
                  {getTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Price Filter */}
          <Select value={selectedPrice} onValueChange={setSelectedPrice}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Any Price" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Price</SelectItem>
              <SelectItem value="$">$ — Budget</SelectItem>
              <SelectItem value="$$">$$ — Mid-Range</SelectItem>
              <SelectItem value="$$$">$$$ — Upscale</SelectItem>
              <SelectItem value="$$$$">$$$$ — Luxury</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active Filters */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
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
            {selectedType !== 'all' && (
              <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setSelectedType('all')}>
                {getTypeLabel(selectedType)} <X className="w-3 h-3 ml-1" />
              </Badge>
            )}
            {selectedPrice !== 'all' && (
              <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => setSelectedPrice('all')}>
                {selectedPrice} ({getPriceLabel(selectedPrice)}) <X className="w-3 h-3 ml-1" />
              </Badge>
            )}
            <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-2">
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Results Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <p className="text-blue-200">
            <span className="text-white font-semibold">{filteredLodgings.length}</span> lodging option{filteredLodgings.length !== 1 ? 's' : ''} found
          </p>
          {/* Type Quick Filters */}
          <div className="flex gap-2 flex-wrap">
            {allTypes.map(type => (
              <button
                key={type}
                onClick={() => setSelectedType(selectedType === type ? 'all' : type)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition ${
                  selectedType === type
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-blue-200 hover:bg-white/20'
                }`}
              >
                {getTypeIcon(type)}
                {getTypeLabel(type)}
                {typeStats[type] ? ` (${typeStats[type]})` : ''}
              </button>
            ))}
          </div>
        </div>
        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-300">Sort by:</span>
          {[
            { value: 'rating', label: 'Rating' },
            { value: 'price-low', label: 'Price: Low' },
            { value: 'price-high', label: 'Price: High' },
            { value: 'reviews', label: 'Reviews' },
            { value: 'name', label: 'Name' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`px-2.5 py-1 rounded text-xs transition ${
                sortBy === opt.value
                  ? 'bg-blue-500/30 text-white font-medium'
                  : 'text-blue-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mr-3" />
          <span className="text-blue-300 text-lg">Loading lodging options...</span>
        </div>
      ) : filteredLodgings.length === 0 ? (
        <div className="text-center py-16">
          <Hotel className="w-16 h-16 text-blue-400/50 mx-auto mb-4" />
          <h3 className="text-xl text-white mb-2">No lodging found</h3>
          <p className="text-blue-300 mb-4">Try adjusting your search or filters</p>
          <button
            onClick={clearFilters}
            className="border-blue-400 text-blue-300 hover:bg-blue-500/20"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <>
        {/* Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleLodgings.map(lodging => {
            const isExpanded = expandedCard === lodging.id;
            return (
              <div
                key={lodging.id}
                className={`bg-gradient-to-br ${getTypeGradient(lodging.type)} backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:border-white/25 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10 flex flex-col`}
              >
                {/* Card Header with Type Badge */}
                <div className="p-5 pb-0">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge className={`${getTypeColor(lodging.type)} text-white text-[10px] px-2.5 py-0.5`}>
                        <span className="flex items-center gap-1">
                          {getTypeIcon(lodging.type)}
                          {getTypeLabel(lodging.type)}
                        </span>
                      </Badge>
                      {lodging.pet_friendly && (
                        <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                          <PawPrint className="w-3 h-3" />
                          Pet Friendly
                        </span>
                      )}
                    </div>
                    <div className={`text-sm font-bold ${getPriceColor(lodging.price_range)}`}>
                      {lodging.price_range}
                    </div>
                  </div>

                  {/* Name & Location */}
                  <h3 className="text-lg font-bold text-white mb-1 leading-tight">{lodging.name}</h3>
                  <div className="flex items-center gap-1.5 text-blue-300 text-sm mb-2">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{lodging.city}, {lodging.state_abbr}</span>
                    <span className="text-blue-500 mx-1">|</span>
                    <span className="text-cyan-400 text-xs">{lodging.proximity_to_water}</span>
                  </div>

                  {/* Rating */}
                  {isProUser ? (
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-0.5">
                        {renderStars(lodging.rating)}
                      </div>
                      <span className="text-yellow-400 font-semibold text-sm">{lodging.rating}</span>
                      <span className="text-gray-400 text-xs">({lodging.review_count} review{lodging.review_count !== 1 ? 's' : ''})</span>
                    </div>
                  ) : (
                    <p className="text-amber-300 text-xs mb-3">Member ratings and reviews are a Pro feature.</p>
                  )}

                  {/* Price */}
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="w-4 h-4 text-green-400" />
                    <span className="text-white font-semibold">
                      ${lodging.price_per_night_min}
                      {lodging.price_per_night_max !== lodging.price_per_night_min && (
                        <span> - ${lodging.price_per_night_max}</span>
                      )}
                    </span>
                    <span className="text-gray-400 text-xs">/ night</span>
                    <span className={`text-xs ${getPriceColor(lodging.price_range)}`}>
                      ({getPriceLabel(lodging.price_range)})
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-blue-200/80 text-sm leading-relaxed mb-3 line-clamp-2">
                    {lodging.description}
                  </p>

                  {/* Amenities Preview */}
                  {lodging.amenities && lodging.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {lodging.amenities.slice(0, isExpanded ? lodging.amenities.length : 4).map((amenity, i) => (
                        <span
                          key={i}
                          className="bg-white/5 text-blue-200 text-[10px] px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1"
                        >
                          {getAmenityIcon(amenity)}
                          {amenity}
                        </span>
                      ))}
                      {!isExpanded && lodging.amenities.length > 4 && (
                        <span className="text-[10px] text-gray-400 px-1 self-center">
                          +{lodging.amenities.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Seasonal Notice */}
                  {lodging.seasonal && lodging.season_open && (
                    <div className="flex items-center gap-1.5 text-amber-300 text-xs bg-amber-500/10 rounded-lg px-3 py-1.5 mb-3 border border-amber-400/20">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Seasonal: {lodging.season_open} – {lodging.season_close}</span>
                    </div>
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-5 pb-2 space-y-3 border-t border-white/5 pt-3">
                    {lodging.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-green-400 flex-shrink-0" />
                        <a
                          href={`tel:${lodging.phone}`}
                          className="text-sm text-green-400 hover:text-green-300 transition"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {lodging.phone}
                        </a>
                      </div>
                    )}
                    <p className="text-blue-200/80 text-sm leading-relaxed">
                      {lodging.description}
                    </p>

                    {/* Reviews Section */}
                      {isProUser ? (
                    <div className="border-t border-white/10 pt-3">
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-white text-sm font-semibold flex items-center gap-1.5">
                              <MessageSquare className="w-4 h-4 text-amber-400" />
                              Guest Reviews
                            </h4>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleWriteReview(lodging);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition"
                            >
                              <PenLine className="w-3 h-3" />
                              Write Review
                            </button>
                          </div>
                          <LodgingReviewsList
                            lodgingId={lodging.id}
                            refreshTrigger={reviewRefreshTrigger}
                          />
                        </>
                        </div>
                      ) : (
                        <div className= "flex flex-col items-center gap-2 mt-3 pt-3 border-t border-white/5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-400/30 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white self-center"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate('/pricing');
                            }}
                          >
                            Unlock lodging reviews with Pro
                          </Button>
                        </div>
                      )}
                  </div>
                )}

                {/* Card Footer Actions */}
                <div className="mt-auto p-5 pt-2 space-y-2">
                  {/* Write Review + Show More row */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedCard(isExpanded ? null : lodging.id)}
                      className="flex-1 flex items-center justify-center gap-1 text-xs text-blue-300 hover:text-white transition py-1"
                    >
                      {isExpanded ? (
                        <>Show Less <ChevronUp className="w-3.5 h-3.5" /></>
                      ) : (
                        <>Show More <ChevronDown className="w-3.5 h-3.5" /></>
                      )}
                    </button>
                    {!isExpanded && isProUser && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWriteReview(lodging);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/20 text-amber-300 text-[10px] font-medium hover:bg-amber-500/25 transition"
                      >
                        <PenLine className="w-3 h-3" />
                        Review
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {lodging.booking_url && (
                      <Button
                        size="sm"
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                        onClick={() => window.open(lodging.booking_url!, '_blank')}
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Book Now
                      </Button>
                    )}
                    {lodging.phone && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-green-400/50 text-green-300 hover:bg-green-500/20 text-xs bg-inherit"
                        onClick={() => window.open(`tel:${lodging.phone}`)}
                      >
                        <Phone className="w-3.5 h-3.5 mr-1.5" />
                        Call
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-400/50 text-blue-300 hover:bg-blue-500/20 text-xs bg-inherit"
                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lodging.name + ' ' + lodging.city + ' ' + lodging.state)}`, '_blank')}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Load More Button */}
        {hasMore && (
          <div className="text-center mt-8">
            <Button
              onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-8 py-3 text-sm font-medium rounded-xl shadow-lg shadow-amber-500/20"
            >
              <ChevronDown className="w-4 h-4 mr-2" />
              Load More ({Math.min(remainingCount, ITEMS_PER_PAGE)} of {remainingCount} remaining)
            </Button>
            <p className="text-blue-300/60 text-xs mt-2">
              Showing {visibleCount} of {filteredLodgings.length} results
            </p>
          </div>
        )}

        {/* Showing all indicator */}
        {!hasMore && filteredLodgings.length > ITEMS_PER_PAGE && (
          <div className="text-center mt-6">
            <p className="text-blue-300/60 text-xs">
              Showing all {filteredLodgings.length} results
            </p>
            <button
              onClick={() => {
                setVisibleCount(ITEMS_PER_PAGE);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="text-xs text-blue-400 hover:text-blue-300 mt-1 transition"
            >
              Back to top
            </button>
          </div>
        )}
        </>
      )}


      {/* Review Modal */}
      {isProUser && reviewLodging && (
        <LodgingReviewModal
          isOpen={reviewModalOpen}
          onClose={() => {
            setReviewModalOpen(false);
            setReviewLodging(null);
          }}
          lodgingId={reviewLodging.id}
          lodgingName={reviewLodging.name}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}

      {/* Auth Modal (shown when user tries to review without being signed in) */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          if (!currentUser) {
            setReviewLodging(null);
          }
        }}
        onAuthSuccess={handleAuthSuccess}
      />
    </section>
  );
};

export default LodgingSection;
