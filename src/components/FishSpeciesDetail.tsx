import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FishSpecies } from '@/data/fishSpecies';
import { FishingSpot } from '@/data/fishingSpots';
import { 
  X, MapPin, Calendar, Target, Ruler, Trophy, Lightbulb, Shield, 
  Waves, TreePine, Anchor, Droplets, Building, DollarSign, Fish
} from 'lucide-react';

interface FishSpeciesDetailProps {
  species: FishSpecies;
  relatedSpots: FishingSpot[];
  onClose: () => void;
  onSpotClick?: (spot: FishingSpot) => void;
}

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'Beginner': return 'bg-green-500 text-green-100';
    case 'Intermediate': return 'bg-yellow-500 text-yellow-100';
    case 'Advanced': return 'bg-orange-500 text-orange-100';
    case 'Expert': return 'bg-red-500 text-red-100';
    default: return 'bg-gray-500';
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'freshwater': return 'bg-blue-500';
    case 'saltwater': return 'bg-cyan-600';
    case 'anadromous': return 'bg-purple-500';
    default: return 'bg-gray-500';
  }
};

const getCategoryLabel = (category: string) => {
  switch (category) {
    case 'freshwater': return 'Freshwater';
    case 'saltwater': return 'Saltwater';
    case 'anadromous': return 'Anadromous';
    default: return category;
  }
};

const getSeasonColor = (season: string) => {
  switch (season) {
    case 'Spring': return 'bg-green-500/20 text-green-300 border-green-500/40';
    case 'Summer': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
    case 'Fall': return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
    case 'Winter': return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    default: return 'bg-gray-500/20 text-gray-300 border-gray-500/40';
  }
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'lake': return <Waves className="w-3.5 h-3.5" />;
    case 'river': return <TreePine className="w-3.5 h-3.5" />;
    case 'ocean': return <Anchor className="w-3.5 h-3.5" />;
    case 'dam': return <Droplets className="w-3.5 h-3.5" />;
    case 'private': return <Building className="w-3.5 h-3.5" />;
    case 'pay-lake': return <DollarSign className="w-3.5 h-3.5" />;
    default: return <Fish className="w-3.5 h-3.5" />;
  }
};

const FishSpeciesDetail: React.FC<FishSpeciesDetailProps> = ({ species, relatedSpots, onClose, onSpotClick }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div 
        className="bg-slate-800 rounded-2xl max-w-4xl w-full my-8 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Hero Image */}
        <div className="relative h-64 md:h-80">
          <img 
            src={species.image} 
            alt={species.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-800 via-slate-800/30 to-transparent" />
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex gap-2 mb-3">
              <Badge className={`${getCategoryColor(species.category)} text-white`}>
                {getCategoryLabel(species.category)}
              </Badge>
              <Badge className={getDifficultyColor(species.difficulty)}>
                {species.difficulty}
              </Badge>
              <Badge className="bg-white/20 text-white">
                {species.subcategory}
              </Badge>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white">{species.name}</h2>
            <p className="text-blue-200 italic text-lg">{species.scientificName}</p>
          </div>
        </div>

        <div className="p-6 md:p-8">
          {/* Description */}
          <p className="text-gray-300 text-lg leading-relaxed mb-8">{species.description}</p>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-700/50 rounded-xl p-4 text-center">
              <Ruler className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <p className="text-xs text-blue-300 uppercase tracking-wide mb-1">Average Size</p>
              <p className="text-white font-semibold text-sm">{species.averageSize}</p>
            </div>
            <div className="bg-slate-700/50 rounded-xl p-4 text-center">
              <Trophy className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <p className="text-xs text-amber-300 uppercase tracking-wide mb-1">Record Size</p>
              <p className="text-white font-semibold text-sm">{species.recordSize}</p>
            </div>
            <div className="bg-slate-700/50 rounded-xl p-4 text-center">
              <Calendar className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <p className="text-xs text-green-300 uppercase tracking-wide mb-1">Peak Season</p>
              <p className="text-white font-semibold text-sm">{species.peakSeason}</p>
            </div>
            <div className="bg-slate-700/50 rounded-xl p-4 text-center">
              <MapPin className="w-6 h-6 text-purple-400 mx-auto mb-2" />
              <p className="text-xs text-purple-300 uppercase tracking-wide mb-1">Fishing Spots</p>
              <p className="text-white font-semibold text-sm">{relatedSpots.length} locations</p>
            </div>
          </div>

          {/* Habitat */}
          <div className="bg-slate-700/30 rounded-xl p-5 mb-6">
            <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
              <Waves className="w-5 h-5 text-blue-400" />
              Habitat & Environment
            </h3>
            <p className="text-gray-300 leading-relaxed">{species.habitat}</p>
          </div>

          {/* Best Seasons */}
          <div className="bg-slate-700/30 rounded-xl p-5 mb-6">
            <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-green-400" />
              Best Seasons
            </h3>
            <div className="flex flex-wrap gap-2">
              {['Spring', 'Summer', 'Fall', 'Winter'].map(season => {
                const isActive = species.bestSeasons.includes(season);
                const isPeak = species.peakSeason.toLowerCase().includes(season.toLowerCase());
                return (
                  <div 
                    key={season}
                    className={`px-4 py-2 rounded-lg border transition ${
                      isActive 
                        ? `${getSeasonColor(season)} ${isPeak ? 'ring-2 ring-white/30' : ''}`
                        : 'bg-slate-700/50 text-gray-500 border-slate-600'
                    }`}
                  >
                    <span className="font-medium">{season}</span>
                    {isPeak && <span className="ml-2 text-xs opacity-80">(Peak)</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bait & Lures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-slate-700/30 rounded-xl p-5">
              <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-400" />
                Recommended Bait
              </h3>
              <ul className="space-y-2">
                {species.recommendedBait.map((bait, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    {bait}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-700/30 rounded-xl p-5">
              <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
                <Fish className="w-5 h-5 text-cyan-400" />
                Recommended Lures
              </h3>
              <ul className="space-y-2">
                {species.recommendedLures.map((lure, i) => (
                  <li key={i} className="flex items-center gap-2 text-gray-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                    {lure}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Techniques */}
          <div className="bg-slate-700/30 rounded-xl p-5 mb-6">
            <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-400" />
              Fishing Techniques
            </h3>
            <div className="flex flex-wrap gap-2">
              {species.techniques.map((technique, i) => (
                <Badge key={i} className="bg-purple-500/20 text-purple-200 border border-purple-400/40">
                  {technique}
                </Badge>
              ))}
            </div>
          </div>

          {/* Fun Fact */}
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-5 mb-6">
            <h3 className="text-amber-300 font-bold text-lg mb-2 flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              Fun Fact
            </h3>
            <p className="text-amber-100/80 leading-relaxed">{species.funFact}</p>
          </div>

          {/* Conservation */}
          <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-5 mb-6">
            <h3 className="text-green-300 font-bold text-lg mb-2 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Conservation Status
            </h3>
            <p className="text-green-100/80 leading-relaxed">{species.conservation}</p>
          </div>

          {/* Related Fishing Spots */}
          {relatedSpots.length > 0 && (
            <div className="mb-6">
              <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-400" />
                Where to Catch {species.name} ({relatedSpots.length} spots)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {relatedSpots.map(spot => (
                  <button
                    key={spot.id}
                    onClick={() => onSpotClick?.(spot)}
                    className="bg-slate-700/50 hover:bg-slate-700 rounded-lg p-4 text-left transition group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 flex-shrink-0">
                        {getTypeIcon(spot.type)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-white font-medium text-sm group-hover:text-blue-300 transition truncate">
                          {spot.name}
                        </h4>
                        <p className="text-blue-300/70 text-xs flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          {spot.state}
                        </p>
                        <p className="text-green-400/80 text-xs mt-1">{spot.cost}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-center pt-4">
            <Button 
              onClick={onClose}
              className="bg-blue-500 hover:bg-blue-600 text-white px-8"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FishSpeciesDetail;
