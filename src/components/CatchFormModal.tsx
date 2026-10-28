import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { Camera, Loader2, X, Upload, Fish, MapPin, Calendar, Ruler, Scale, Trophy } from 'lucide-react';
// import { fishSpecies } from '@/data/fishSpecies';
import { getPublicSpecies } from '@/data/fishingSpots';

const speciesNames: string[] = (() => {
  try {
    return (fishSpecies || []).map((s: any) => s?.name).filter(Boolean).sort();
  } catch (err) {
    console.warn('Could not process fish species data:', err);
    return [
      'Largemouth Bass', 'Smallmouth Bass', 'Striped Bass', 'Rainbow Trout',
      'Brown Trout', 'Brook Trout', 'Walleye', 'Northern Pike', 'Channel Catfish',
      'Bluegill', 'Crappie', 'Red Snapper', 'Mahi-Mahi', 'Yellowfin Tuna',
    ];
  }
})();



interface CatchEntry {
  id: string;
  user_id: string;
  species: string;
  weight_lbs: number | string | null;
  length_inches: number | string | null;
  location: string;
  state: string | null;
  water_body: string | null;
  date: string;
  time_of_day: string | null;
  weather: string | null;
  method: string | null;
  lure_bait: string | null;
  photo_url: string | null;
  notes: string | null;
  is_personal_best: boolean;
  catch_and_release: boolean;
}

interface CatchFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editEntry?: CatchEntry | null;
  userId: string;
}

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
  'Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky',
  'Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi',
  'Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico',
  'New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania',
  'Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming'
];

const WEATHER_OPTIONS = ['Sunny', 'Partly Cloudy', 'Overcast', 'Rainy', 'Stormy', 'Windy', 'Foggy', 'Snowy'];
const TIME_OPTIONS = ['Early Morning', 'Morning', 'Midday', 'Afternoon', 'Evening', 'Night'];
const METHOD_OPTIONS = ['Casting', 'Trolling', 'Fly Fishing', 'Bottom Fishing', 'Jigging', 'Drift Fishing', 'Surf Casting', 'Ice Fishing', 'Bank Fishing', 'Kayak Fishing', 'Boat Fishing', 'Wade Fishing', 'Other'];
const WATER_BODY_OPTIONS = ['Lake', 'River', 'Stream', 'Pond', 'Reservoir', 'Ocean', 'Bay', 'Estuary', 'Canal', 'Creek', 'Other'];

const CatchFormModal: React.FC<CatchFormModalProps> = ({ isOpen, onClose, onSave, editEntry, userId }) => {
  const [speciesNames, setSpeciesNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [species, setSpecies] = useState('');
  const [customSpecies, setCustomSpecies] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [lengthInches, setLengthInches] = useState('');
  const [location, setLocation] = useState('');
  const [state, setState] = useState('');
  const [waterBody, setWaterBody] = useState('');
  const [date, setDate] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('');
  const [weather, setWeather] = useState('');
  const [method, setMethod] = useState('');
  const [lureBait, setLureBait] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isPersonalBest, setIsPersonalBest] = useState(false);
  const [catchAndRelease, setCatchAndRelease] = useState(false);

  // Safe date default
  const getTodayStr = () => {
    try {
      return new Date().toISOString().split('T')[0];
    } catch {
      return '2026-01-01';
    }
  };

  useEffect(() => {
    getPublicSpecies().then((items) => setSpeciesNames(items.map((item) => item.name).sort())).catch(() => setSpeciesNames([]));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    
    try {
      if (editEntry) {
        const matchedSpecies = speciesNames.find(s => s === editEntry.species);
        if (matchedSpecies) {
          setSpecies(matchedSpecies);
          setCustomSpecies('');
        } else {
          setSpecies('__custom__');
          setCustomSpecies(editEntry.species || '');
        }
        setWeightLbs(editEntry.weight_lbs != null ? String(editEntry.weight_lbs) : '');
        setLengthInches(editEntry.length_inches != null ? String(editEntry.length_inches) : '');
        setLocation(editEntry.location || '');
        setState(editEntry.state || '');
        setWaterBody(editEntry.water_body || '');
        setDate(editEntry.date || getTodayStr());
        setTimeOfDay(editEntry.time_of_day || '');
        setWeather(editEntry.weather || '');
        setMethod(editEntry.method || '');
        setLureBait(editEntry.lure_bait || '');
        setPhotoUrl(editEntry.photo_url || '');
        setNotes(editEntry.notes || '');
        setIsPersonalBest(editEntry.is_personal_best || false);
        setCatchAndRelease(editEntry.catch_and_release || false);
      } else {
        resetForm();
      }
    } catch (err) {
      console.error('Error initializing form:', err);
      resetForm();
    }
  }, [editEntry, isOpen]);

  const resetForm = () => {
    setSpecies('');
    setCustomSpecies('');
    setWeightLbs('');
    setLengthInches('');
    setLocation('');
    setState('');
    setWaterBody('');
    setDate(getTodayStr());
    setTimeOfDay('');
    setWeather('');
    setMethod('');
    setLureBait('');
    setPhotoUrl('');
    setNotes('');
    setIsPersonalBest(false);
    setCatchAndRelease(false);
    setError('');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Photo must be under 5MB');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${userId}/${Date.now()}.${ext}`;

      const { data, error: uploadError } = await supabase.storage
        .from('catch-photos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('catch-photos')
        .getPublicUrl(data.path);

      setPhotoUrl(urlData.publicUrl);
    } catch (err: any) {
      console.error('Photo upload error:', err);
      setError('Failed to upload photo: ' + (err?.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (photoUrl) {
      try {
        const path = photoUrl.split('/catch-photos/')[1];
        if (path) {
          await supabase.storage.from('catch-photos').remove([path]);
        }
      } catch (err) {
        console.warn('Could not remove photo from storage:', err);
      }
    }
    setPhotoUrl('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const finalSpecies = species === '__custom__' ? customSpecies.trim() : species;
    if (!finalSpecies) {
      setError('Please select or enter a species');
      return;
    }
    if (!location.trim()) {
      setError('Please enter a location');
      return;
    }
    if (!date) {
      setError('Please select a date');
      return;
    }

    setLoading(true);

    try {
      const payload: Record<string, any> = {
        user_id: userId,
        species: finalSpecies,
        weight_lbs: weightLbs ? parseFloat(weightLbs) : null,
        length_inches: lengthInches ? parseFloat(lengthInches) : null,
        location: location.trim(),
        state: state && state !== 'none' ? state : null,
        water_body: waterBody && waterBody !== 'none' ? waterBody : null,
        date,
        time_of_day: timeOfDay && timeOfDay !== 'none' ? timeOfDay : null,
        weather: weather && weather !== 'none' ? weather : null,
        method: method && method !== 'none' ? method : null,
        lure_bait: lureBait.trim() || null,
        photo_url: photoUrl || null,
        notes: notes.trim() || null,
        is_personal_best: isPersonalBest,
        catch_and_release: catchAndRelease,
      };

      if (editEntry) {
        payload.updated_at = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('catch_log')
          .update(payload)
          .eq('id', editEntry.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('catch_log')
          .insert(payload);
        if (insertError) throw insertError;
      }

      onSave();
      onClose();
      resetForm();
    } catch (err: any) {
      console.error('Error saving catch:', err);
      setError(err?.message || 'Failed to save catch. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2 text-blue-200">
            <Fish className="w-6 h-6 text-blue-400" />
            {editEntry ? 'Edit Catch' : 'Log New Catch'}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Species Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-blue-200 flex items-center gap-1.5">
                <Fish className="w-4 h-4" /> Species *
              </Label>
              <Select value={species} onValueChange={setSpecies}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select species" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600 max-h-60">
                  {speciesNames.map(name => (
                    <SelectItem key={name} value={name} className="text-white hover:bg-slate-600">
                      {name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-blue-300 hover:bg-slate-600">
                    Other (type custom)
                  </SelectItem>
                </SelectContent>
              </Select>
              {species === '__custom__' && (
                <Input
                  placeholder="Enter species name"
                  value={customSpecies}
                  onChange={e => setCustomSpecies(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-gray-400 mt-2"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-blue-200 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" /> Date *
              </Label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                max={getTodayStr()}
                className="bg-slate-700 border-slate-600 text-white w-[320px] md:w-[300px]"
                required
              />
            </div>
          </div>

          {/* Weight & Length */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-blue-200 flex items-center gap-1.5">
                <Scale className="w-4 h-4" /> Weight (lbs)
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 4.5"
                value={weightLbs}
                onChange={e => setWeightLbs(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-gray-400"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-blue-200 flex items-center gap-1.5">
                <Ruler className="w-4 h-4" /> Length (inches)
              </Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                placeholder="e.g. 18.5"
                value={lengthInches}
                onChange={e => setLengthInches(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-blue-200 flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> Location *
              </Label>
              <Input
                placeholder="e.g. Lake Okeechobee"
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-gray-400"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-blue-200">State</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600 max-h-60">
                  <SelectItem value="none" className="text-gray-400 hover:bg-slate-600">No state</SelectItem>
                  {US_STATES.map(s => (
                    <SelectItem key={s} value={s} className="text-white hover:bg-slate-600">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Water Body & Method */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-blue-200">Water Body Type</Label>
              <Select value={waterBody} onValueChange={setWaterBody}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  <SelectItem value="none" className="text-gray-400 hover:bg-slate-600">Not specified</SelectItem>
                  {WATER_BODY_OPTIONS.map(w => (
                    <SelectItem key={w} value={w} className="text-white hover:bg-slate-600">{w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-blue-200">Fishing Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  <SelectItem value="none" className="text-gray-400 hover:bg-slate-600">Not specified</SelectItem>
                  {METHOD_OPTIONS.map(m => (
                    <SelectItem key={m} value={m} className="text-white hover:bg-slate-600">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Time & Weather */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-blue-200">Time of Day</Label>
              <Select value={timeOfDay} onValueChange={setTimeOfDay}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  <SelectItem value="none" className="text-gray-400 hover:bg-slate-600">Not specified</SelectItem>
                  {TIME_OPTIONS.map(t => (
                    <SelectItem key={t} value={t} className="text-white hover:bg-slate-600">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-blue-200">Weather</Label>
              <Select value={weather} onValueChange={setWeather}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Select weather" />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  <SelectItem value="none" className="text-gray-400 hover:bg-slate-600">Not specified</SelectItem>
                  {WEATHER_OPTIONS.map(w => (
                    <SelectItem key={w} value={w} className="text-white hover:bg-slate-600">{w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Lure/Bait */}
          <div className="space-y-2">
            <Label className="text-blue-200">Lure / Bait Used</Label>
            <Input
              placeholder="e.g. Texas-rigged plastic worm, live shiners"
              value={lureBait}
              onChange={e => setLureBait(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white placeholder:text-gray-400"
            />
          </div>

          {/* Photo Upload */}
          <div className="space-y-2">
            <Label className="text-blue-200 flex items-center gap-1.5">
              <Camera className="w-4 h-4" /> Photo
            </Label>
            {photoUrl ? (
              <div className="relative inline-block">
                <img
                  src={photoUrl}
                  alt="Catch photo"
                  className="w-full max-w-xs h-48 object-cover rounded-lg border border-slate-600"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500/50 hover:bg-slate-700/50 transition"
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    <span className="text-blue-300 text-sm">Uploading...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-blue-400" />
                    <span className="text-blue-300 text-sm">Click to upload a photo (max 5MB)</span>
                  </div>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-blue-200">Notes</Label>
            <Textarea
              placeholder="Any additional details about this catch..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white placeholder:text-gray-400 min-h-[80px]"
            />
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={catchAndRelease}
                onChange={e => setCatchAndRelease(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-blue-200 text-sm">Catch & Release</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPersonalBest}
                onChange={e => setIsPersonalBest(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-amber-200 text-sm flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5" /> Personal Best
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Fish className="w-4 h-4 mr-2" />
                  {editEntry ? 'Update Catch' : 'Log Catch'}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-600 text-gray-300 hover:bg-slate-700 bg-inherit"
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CatchFormModal;
