import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { FishSpecies } from '@/data/fishSpecies';
import { getPublicSpecies } from '@/data/fishingSpots';
import { 
  Fish, Target, Anchor, ChevronDown, ChevronUp, 
  Crosshair, Ruler, Trophy, Calendar, Star
} from 'lucide-react';

interface FishSpeciesSpotSectionProps {
  fishNames: string[];
  onViewFullGuide?: (species: FishSpecies) => void;
}

// Map common alternate names to species IDs
const fishNameAliases: Record<string, string[]> = {
  'catfish': ['channel-catfish', 'blue-catfish', 'flathead-catfish'],
  'bass': ['largemouth-bass', 'smallmouth-bass', 'striped-bass', 'spotted-bass'],
  'trout': ['rainbow-trout', 'brown-trout', 'brook-trout', 'cutthroat-trout', 'lake-trout', 'golden-trout'],
  'salmon': ['chinook-salmon', 'coho-salmon', 'sockeye-salmon', 'kokanee-salmon'],
  'king salmon': ['chinook-salmon'],
  'silver salmon': ['coho-salmon'],
  'mackinaw': ['lake-trout'],
  'lakers': ['lake-trout'],
  'rockfish': ['striped-bass'],
  'striper': ['striped-bass'],
  'stripers': ['striped-bass'],
  'bream': ['bluegill'],
  'sunfish': ['bluegill'],
  'perch': ['yellow-perch'],
  'pike': ['northern-pike'],
  'fluke': ['flounder'],
  'dorado': ['mahi-mahi'],
  'dolphinfish': ['mahi-mahi'],
  'ahi': ['yellowfin-tuna'],
  'ono': ['wahoo'],
  'bronzeback': ['smallmouth-bass'],
};

function matchFishToSpecies(fishName: string, fishSpecies: FishSpecies[]): FishSpecies | null {
  const normalizedName = fishName.toLowerCase().trim();

  // Direct match by name
  const directMatch = fishSpecies.find(
    s => s.name.toLowerCase() === normalizedName
  );
  if (directMatch) return directMatch;

  // Check aliases
  const aliasIds = fishNameAliases[normalizedName];
  if (aliasIds && aliasIds.length > 0) {
    const aliasMatch = fishSpecies.find(s => s.id === aliasIds[0]);
    if (aliasMatch) return aliasMatch;
  }

  // Partial match - species name contains the fish name or vice versa
  const partialMatch = fishSpecies.find(
    s => s.name.toLowerCase().includes(normalizedName) || 
         normalizedName.includes(s.name.toLowerCase())
  );
  if (partialMatch) return partialMatch;

  // Word-based partial match
  const words = normalizedName.split(/\s+/);
  const wordMatch = fishSpecies.find(s => {
    const speciesWords = s.name.toLowerCase().split(/\s+/);
    return words.some(w => w.length > 3 && speciesWords.some(sw => sw.includes(w) || w.includes(sw)));
  });
  if (wordMatch) return wordMatch;

  return null;
}

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'Beginner': return 'bg-green-500/20 text-green-300 border-green-500/40';
    case 'Intermediate': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
    case 'Advanced': return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
    case 'Expert': return 'bg-red-500/20 text-red-300 border-red-500/40';
    default: return 'bg-gray-500/20 text-gray-300 border-gray-500/40';
  }
};

const getCategoryBadgeColor = (category: string) => {
  switch (category) {
    case 'freshwater': return 'bg-blue-500/20 text-blue-300 border-blue-400/40';
    case 'saltwater': return 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40';
    case 'anadromous': return 'bg-purple-500/20 text-purple-300 border-purple-400/40';
    default: return 'bg-gray-500/20 text-gray-300 border-gray-400/40';
  }
};

const FishSpeciesSpotSection: React.FC<FishSpeciesSpotSectionProps> = ({ fishNames, onViewFullGuide }) => {
  const [expandedFish, setExpandedFish] = useState<string | null>(null);
  const [fishSpecies, setFishSpecies] = useState<FishSpecies[]>([]);

  useEffect(() => {
    getPublicSpecies().then(setFishSpecies).catch(() => setFishSpecies([]));
  }, [])

  // Match fish names to species data
  const matchedFish = fishNames.map(name => ({
    name,
    species: matchFishToSpecies(name, fishSpecies),
  }));

  // Deduplicate by species ID (in case multiple names match the same species)
  const seen = new Set<string>();
  const uniqueMatched = matchedFish.filter(item => {
    if (!item.species) return true; // keep unmatched
    if (seen.has(item.species.id)) return false;
    seen.add(item.species.id);
    return true;
  });

  const toggleExpand = (name: string) => {
    setExpandedFish(expandedFish === name ? null : name);
  };

  return (
    <div className="bg-gradient-to-br from-slate-700/50 to-blue-900/30 rounded-xl p-3 border border-blue-400/20">
      <div className="flex items-center gap-2 text-blue-300 mb-4">
        <Fish className="w-3 h-3 text-blue-400" />
        <span className="font-semibold text-white md:text-lg text-[12px]">Fish Species at This Spot</span>
        <Badge className="bg-blue-500/30 text-blue-200 border-blue-400/30 ml-auto md:w-auto w-[85px]">
          {fishNames.length} species
        </Badge>
      </div>
      <p className="text-blue-200/70 text-sm mb-5">
        Tap any species below to see the best bait, lures, and techniques for catching them.
      </p>

      <div className="space-y-3">
        {uniqueMatched.map(({ name, species }) => {
          const isExpanded = expandedFish === name;

          if (!species) {
            // Unmatched fish - show simple card
            return (
              <div
                key={name}
                className="bg-slate-700/60 rounded-lg p-4 border border-white/10"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-slate-600/80 flex items-center justify-center flex-shrink-0">
                    <Fish className="w-6 h-6 text-blue-300" />
                  </div>
                  <div>
                    <h4 className="text-white font-medium">{name}</h4>
                    <p className="text-blue-300/60 text-xs">Species info not yet available</p>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={name}
              className={`rounded-xl overflow-hidden border transition-all duration-300 ${
                isExpanded 
                  ? 'bg-slate-700/80 border-blue-400/40 shadow-lg shadow-blue-500/10' 
                  : 'bg-slate-700/40 border-white/10 hover:border-blue-400/30 hover:bg-slate-700/60'
              }`}
            >
              {/* Collapsed Header - Always Visible */}
              <button
                onClick={() => toggleExpand(name)}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 ring-2 ring-white/10">
                  <img
                    src={species.image}
                    alt={species.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-white font-semibold text-sm">{species.name}</h4>
                    <Badge className={`text-[10px] px-1.5 py-0 border ${getDifficultyColor(species.difficulty)}`}>
                      {species.difficulty}
                    </Badge>
                  </div>
                  <p className="text-blue-200/60 text-xs italic">{species.scientificName}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-blue-300/70 text-xs flex items-center gap-1">
                      <Ruler className="w-3 h-3" />
                      {species.averageSize}
                    </span>
                  </div>
                </div>
                <div className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${isExpanded ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400'}`}>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  {/* Category & Season Info */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge className={`text-xs border ${getCategoryBadgeColor(species.category)}`}>
                      {species.category === 'freshwater' ? 'Freshwater' : species.category === 'saltwater' ? 'Saltwater' : 'Anadromous'}
                    </Badge>
                    <Badge className="bg-slate-600/50 text-slate-200 border-slate-500/40 text-xs border">
                      {species.subcategory}
                    </Badge>
                    <Badge className="bg-amber-500/15 text-amber-300 border-amber-400/30 text-xs border">
                      <Calendar className="w-3 h-3 mr-1" />
                      Peak: {species.peakSeason}
                    </Badge>
                  </div>

                  {/* Fish Image - Larger View */}
                  <div className="relative rounded-lg overflow-hidden h-40">
                    <img
                      src={species.image}
                      alt={species.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
                      <div>
                        <p className="text-white/70 text-xs">Record Size</p>
                        <p className="text-amber-300 text-sm font-semibold flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5" />
                          {species.recordSize}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recommended Bait */}
                  <div className="bg-amber-500/10 rounded-lg p-3.5 border border-amber-400/20">
                    <h5 className="text-amber-300 font-semibold text-sm mb-2.5 flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Best Bait
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {species.recommendedBait.map((bait, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-200 text-xs px-2.5 py-1 rounded-full border border-amber-400/20"
                        >
                          <span className="w-1 h-1 rounded-full bg-amber-400" />
                          {bait}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Recommended Lures */}
                  <div className="bg-cyan-500/10 rounded-lg p-3.5 border border-cyan-400/20">
                    <h5 className="text-cyan-300 font-semibold text-sm mb-2.5 flex items-center gap-2">
                      <Anchor className="w-4 h-4" />
                      Best Lures
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {species.recommendedLures.map((lure, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 bg-cyan-500/15 text-cyan-200 text-xs px-2.5 py-1 rounded-full border border-cyan-400/20"
                        >
                          <span className="w-1 h-1 rounded-full bg-cyan-400" />
                          {lure}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Fishing Techniques */}
                  <div className="bg-purple-500/10 rounded-lg p-3.5 border border-purple-400/20">
                    <h5 className="text-purple-300 font-semibold text-sm mb-2.5 flex items-center gap-2">
                      <Crosshair className="w-4 h-4" />
                      Preferred Techniques
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {species.techniques.map((technique, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 bg-purple-500/15 text-purple-200 text-xs px-2.5 py-1 rounded-full border border-purple-400/20"
                        >
                          <span className="w-1 h-1 rounded-full bg-purple-400" />
                          {technique}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Best Seasons */}
                  <div className="bg-green-500/10 rounded-lg p-3.5 border border-green-400/20">
                    <h5 className="text-green-300 font-semibold text-sm mb-2.5 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Best Seasons
                    </h5>
                    <div className="flex gap-2">
                      {['Spring', 'Summer', 'Fall', 'Winter'].map(season => {
                        const isActive = species.bestSeasons.includes(season);
                        const isPeak = species.peakSeason.toLowerCase().includes(season.toLowerCase());
                        const seasonColors: Record<string, string> = {
                          Spring: isActive ? 'bg-green-500/25 text-green-300 border-green-400/40' : 'bg-slate-700/50 text-slate-500 border-slate-600/40',
                          Summer: isActive ? 'bg-yellow-500/25 text-yellow-300 border-yellow-400/40' : 'bg-slate-700/50 text-slate-500 border-slate-600/40',
                          Fall: isActive ? 'bg-orange-500/25 text-orange-300 border-orange-400/40' : 'bg-slate-700/50 text-slate-500 border-slate-600/40',
                          Winter: isActive ? 'bg-blue-500/25 text-blue-300 border-blue-400/40' : 'bg-slate-700/50 text-slate-500 border-slate-600/40',
                        };
                        return (
                          <div
                            key={season}
                            className={`flex-1 text-center py-1.5 rounded-lg border text-xs font-medium ${seasonColors[season]} ${isPeak ? 'ring-1 ring-white/20' : ''}`}
                          >
                            {season}
                            {isPeak && (
                              <div className="flex items-center justify-center mt-0.5">
                                <Star className="w-2.5 h-2.5 fill-current" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Fun Fact */}
                  <div className="bg-slate-600/30 rounded-lg p-3 border border-white/5">
                    <p className="text-blue-200/70 text-xs leading-relaxed">
                      <span className="text-amber-300 font-semibold">Did you know?</span>{' '}
                      {species.funFact}
                    </p>
                  </div>

                  {/* View Full Guide Button */}
                  {onViewFullGuide && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewFullGuide(species);
                      }}
                      className="w-full text-center text-sm text-blue-400 hover:text-blue-300 font-medium py-2 rounded-lg hover:bg-blue-500/10 transition"
                    >
                      View Full Species Guide →
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FishSpeciesSpotSection;
