import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { getPublicFishingSpots, states, FishingSpot } from '@/data/fishingSpots';
import { defaultChecklistItems } from '@/data/defaultChecklist';
import {
  MapPin, Calendar, Hotel, Fish, Search, Loader2, Check,
  ChevronRight, Star, Building, Home, TreePine, Waves, X,
  Tent, Pencil
} from 'lucide-react';

interface Accommodation {
  id: number;
  name: string;
  type: string;
  price_min: number;
  price_max: number;
  rating: number;
  distance_miles: number;
}

interface TripPlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  preselectedSpot?: FishingSpot | null;
  onTripCreated: () => void;
}

const getAccTypeIcon = (type: string) => {
  switch (type) {
    case 'hotel': return <Hotel className="w-3.5 h-3.5" />;
    case 'motel': return <Building className="w-3.5 h-3.5" />;
    case 'airbnb': return <Home className="w-3.5 h-3.5" />;
    case 'lodge': return <TreePine className="w-3.5 h-3.5" />;
    case 'cabin': return <TreePine className="w-3.5 h-3.5" />;
    case 'resort': return <Waves className="w-3.5 h-3.5" />;
    default: return <Building className="w-3.5 h-3.5" />;
  }
};

const TripPlannerModal: React.FC<TripPlannerModalProps> = ({
  isOpen, onClose, userId, preselectedSpot, onTripCreated
}) => {
  const [step, setStep] = useState(1);
  const [selectedSpot, setSelectedSpot] = useState<FishingSpot | null>(preselectedSpot || null);
  const [spotSearch, setSpotSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('All States');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [selectedAccommodation, setSelectedAccommodation] = useState<Accommodation | null>(null);
  const [loadingAccommodations, setLoadingAccommodations] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fishingSpots, setFishingSpots] = useState<FishingSpot[]>([]);
  useEffect(() => {
    getPublicFishingSpots().then(setFishingSpots).catch(() => setFishingSpots([]));
  }, []);

  useEffect(() => {
    if (preselectedSpot) {
      setSelectedSpot(preselectedSpot);
      setStep(2);
    }
  }, [preselectedSpot]);

  useEffect(() => {
    if (selectedSpot && step === 3) {
      fetchAccommodations();
    }
  }, [selectedSpot, step]);

  const fetchAccommodations = async () => {
    if (!selectedSpot) return;
    setLoadingAccommodations(true);
    try {
      const { data } = await supabase
        .from('accommodations')
        .select('id, name, type, price_min, price_max, rating, distance_miles')
        .eq('spot_id', selectedSpot.id)
        .order('rating', { ascending: false });
      setAccommodations(data || []);
    } catch (err) {
      setAccommodations([]);
    } finally {
      setLoadingAccommodations(false);
    }
  };

  const filteredSpots = fishingSpots.filter(spot => {
    const matchesSearch = spotSearch === '' ||
      spot.name.toLowerCase().includes(spotSearch.toLowerCase()) ||
      spot.state.toLowerCase().includes(spotSearch.toLowerCase());
    const matchesState = stateFilter === 'All States' || spot.state === stateFilter;
    return matchesSearch && matchesState;
  }).slice(0, 20);

  const handleSaveTrip = async () => {
    if (!selectedSpot || !startDate || !endDate) {
      setError('Please fill in all required fields');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('End date must be after start date');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .insert({
          user_id: userId,
          spot_id: selectedSpot.id,
          spot_name: selectedSpot.name,
          spot_state: selectedSpot.state,
          spot_type: selectedSpot.type,
          accommodation_id: selectedAccommodation?.id || null,
          accommodation_name: selectedAccommodation?.name || null,
          start_date: startDate,
          end_date: endDate,
          notes: notes,
        })
        .select()
        .single();

      if (tripError) throw tripError;

      // Insert default checklist items
      if (tripData) {
        const checklistInserts = defaultChecklistItems.map((item, idx) => ({
          trip_id: tripData.id,
          text: item.text,
          category: item.category,
          is_checked: false,
          sort_order: idx,
        }));

        await supabase.from('trip_checklist_items').insert(checklistInserts);
      }

      onTripCreated();
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save trip');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedSpot(preselectedSpot || null);
    setSpotSearch('');
    setStateFilter('All States');
    setStartDate('');
    setEndDate('');
    setSelectedAccommodation(null);
    setNotes('');
    setError('');
    onClose();
  };

  const today = new Date().toISOString().split('T')[0];

  const getTripDuration = () => {
    if (!startDate || !endDate) return 0;
    const diff = new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-3 text-white">
            <div className="bg-blue-500 p-2 rounded-lg">
              <Tent className="w-6 h-6" />
            </div>
            Plan Your Fishing Trip
          </DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[
            { num: 1, label: 'Spot' },
            { num: 2, label: 'Dates' },
            { num: 3, label: 'Stay' },
            { num: 4, label: 'Review' },
          ].map((s, i) => (
            <React.Fragment key={s.num}>
              <button
                onClick={() => {
                  if (s.num <= step) setStep(s.num);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition ${
                  step === s.num
                    ? 'bg-blue-500 text-white'
                    : step > s.num
                    ? 'bg-blue-500/20 text-blue-300 cursor-pointer hover:bg-blue-500/30'
                    : 'bg-white/5 text-gray-500'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  step > s.num ? 'bg-blue-400 text-white' : ''
                }`}>
                  {step > s.num ? <Check className="w-3 h-3" /> : s.num}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < 3 && <ChevronRight className="w-4 h-4 text-gray-600" />}
            </React.Fragment>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Step 1: Select Fishing Spot */}
        {step === 1 && (
          <div className="space-y-2">
            <p className="text-blue-200">Choose a fishing spot for your trip:</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search spots..."
                  value={spotSearch}
                  onChange={(e) => setSpotSearch(e.target.value)}
                  className="pl-9 bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-40 bg-slate-700 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {states.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredSpots.map(spot => (
                <button
                  key={spot.id}
                  onClick={() => {
                    setSelectedSpot(spot);
                    setStep(2);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all hover:scale-[1.01] ${
                    selectedSpot?.id === spot.id
                      ? 'bg-blue-500/20 border-blue-400'
                      : 'bg-slate-700/50 border-white/5 hover:border-blue-400/30 hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white text-sm">{spot.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <MapPin className="w-3 h-3 text-blue-400" />
                        <span className="text-xs text-blue-300">{spot.state}</span>
                        <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-200 border-0">
                          {spot.type}
                        </Badge>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </button>
              ))}
              {filteredSpots.length === 0 && (
                <p className="text-gray-400 text-center py-8">No spots found. Try a different search.</p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Select Dates */}
        {step === 2 && (
          <div className="space-y-6">
            {selectedSpot && (
              <div className="bg-slate-700/50 rounded-xl p-4 border border-blue-400/20">
                <div className="flex items-center gap-2 mb-1">
                  <Fish className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-white">{selectedSpot.name}</span>
                </div>
                <p className="text-sm text-blue-300 ml-6">{selectedSpot.state} &middot; Best season: {selectedSpot.bestSeason}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-blue-200">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  min={today}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (endDate && e.target.value > endDate) setEndDate('');
                  }}
                  className="bg-slate-700 border-slate-600 text-white md:w-[300px] w-[150px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-blue-200">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate || today}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white md:w-[300px] w-[150px]"
                />
              </div>
            </div>

            {startDate && endDate && (
              <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-400/20 text-center">
                <p className="text-blue-200">
                  <Calendar className="w-4 h-4 inline mr-1.5" />
                  {getTripDuration()} night{getTripDuration() !== 1 ? 's' : ''} &middot;{' '}
                  {new Date(startDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' '}&ndash;{' '}
                  {new Date(endDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-blue-200">Trip Notes (optional)</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special plans, gear to bring, people joining..."
                className="w-full h-24 bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white placeholder:text-gray-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="border-slate-600 text-blue-300 hover:bg-slate-700 border rounded-md px-4 py-2">
                Back
              </button>
              <Button
                onClick={() => setStep(3)}
                disabled={!startDate || !endDate}
                className="flex w-[235px] bg-blue-500 hover:bg-blue-600"
              >
                Next: Choose Accommodation
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Select Accommodation */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-blue-200">Choose where to stay near <span className="text-white font-medium">{selectedSpot?.name}</span>:</p>

            {loadingAccommodations ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin mr-2" />
                <span className="text-blue-300">Loading accommodations...</span>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {accommodations.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => setSelectedAccommodation(selectedAccommodation?.id === acc.id ? null : acc)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selectedAccommodation?.id === acc.id
                          ? 'bg-blue-500/20 border-blue-400'
                          : 'bg-slate-700/50 border-white/5 hover:border-blue-400/30 hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {getAccTypeIcon(acc.type)}
                            <span className="font-semibold text-white text-sm">{acc.name}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-blue-300 capitalize">{acc.type}</span>
                            <span className="flex items-center gap-0.5 text-yellow-400">
                              <Star className="w-3 h-3 fill-yellow-400" />
                              {acc.rating}
                            </span>
                            <span className="text-gray-400">{acc.distance_miles} mi</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-green-400 font-semibold text-sm">${acc.price_min}-${acc.price_max}</p>
                          <p className="text-[10px] text-gray-400">per night</p>
                        </div>
                      </div>
                    </button>
                  ))}
                  {accommodations.length === 0 && (
                    <p className="text-gray-400 text-center py-8">No accommodations listed for this spot.</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button  onClick={() => setStep(2)} className="border-slate-600 text-blue-300 hover:bg-slate-700 border rounded-md px-4 py-2">
                    Back
                  </button>
                  <Button
                    onClick={() => setStep(4)}
                    className="flex-1 bg-blue-500 hover:bg-blue-600"
                  >
                    {selectedAccommodation ? 'Next: Review Trip' : 'Skip & Review Trip'}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Review & Save */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-xl p-5 border border-blue-400/20 space-y-4">
              <h3 className="text-lg font-bold text-white">Trip Summary</h3>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Fish className="w-5 h-5 text-blue-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-300">Fishing Spot</p>
                    <p className="text-white font-semibold">{selectedSpot?.name}</p>
                    <p className="text-xs text-gray-400">{selectedSpot?.state} &middot; {selectedSpot?.type}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-blue-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-300">Dates</p>
                    <p className="text-white font-semibold">
                      {new Date(startDate).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })}
                      {' '}&ndash;{' '}
                      {new Date(endDate).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-gray-400">{getTripDuration()} night{getTripDuration() !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {selectedAccommodation && (
                  <div className="flex items-start gap-3">
                    <Hotel className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-300">Accommodation</p>
                      <p className="text-white font-semibold">{selectedAccommodation.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{selectedAccommodation.type} &middot; ${selectedAccommodation.price_min}-${selectedAccommodation.price_max}/night</p>
                    </div>
                  </div>
                )}

                {notes && (
                  <div className="flex items-start gap-3">
                    <Pencil className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-blue-300">Notes</p>
                      <p className="text-white text-sm">{notes}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-3 border border-white/5">
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-green-400" />
                A packing checklist with {defaultChecklistItems.length} items will be added to your trip automatically.
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="border-slate-600 text-blue-300 hover:bg-slate-700 border rounded-md px-4 py-2">
                Back
              </button>
              <Button
                onClick={handleSaveTrip}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving Trip...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Save Trip
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TripPlannerModal;
