import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FishSpecies } from '@/data/fishSpecies';
import { MapPin, Calendar, Target } from 'lucide-react';

interface FishSpeciesCardProps {
  species: FishSpecies;
  onClick: () => void;
  spotCount: number;
  showDetails?: boolean;
}

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'Beginner': return 'bg-green-500';
    case 'Intermediate': return 'bg-yellow-500';
    case 'Advanced': return 'bg-orange-500';
    case 'Expert': return 'bg-red-500';
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

const FishSpeciesCard: React.FC<FishSpeciesCardProps> = ({ species, onClick, spotCount, showDetails = true }) => {
  return (
    <Card 
      className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-all cursor-pointer group overflow-hidden"
      onClick={onClick}
    >
      <div className="relative h-48 overflow-hidden">
        <img 
          src={species.image} 
          alt={species.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge className={`${getCategoryColor(species.category)} text-white text-xs`}>
            {getCategoryLabel(species.category)}
          </Badge>
          <Badge className={`${getDifficultyColor(species.difficulty)} text-white text-xs`}>
            {species.difficulty}
          </Badge>
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-white font-bold text-lg leading-tight group-hover:text-blue-300 transition">
            {species.name}
          </h3>
          <p className="text-blue-200/80 text-xs italic">{species.scientificName}</p>
        </div>
      </div>
      <CardContent className="p-4">
        {showDetails && <p className="text-gray-300 text-sm line-clamp-2 mb-3">{species.description}</p>}
        
        {showDetails && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-amber-300 text-xs">Peak: {species.peakSeason}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Target className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <span className="text-green-300 text-xs">Avg: {species.averageSize}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="text-blue-300 text-xs">
                {spotCount} fishing spot{spotCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-white/10">
          {showDetails && species.bestSeasons.map(season => (
            <Badge
              key={season}
              variant="outline"
              className="text-blue-200 border-blue-400/40 text-xs px-2 py-0"
            >
              {season}
            </Badge>
          ))}
          <Badge variant="outline" className="text-purple-200 border-purple-400/40 text-xs px-2 py-0">
            {species.subcategory}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

export default FishSpeciesCard;
