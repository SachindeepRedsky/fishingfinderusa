import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, Fish, ArrowLeft, SlidersHorizontal, BookOpen, 
  Waves, Anchor, GitBranch, X
} from 'lucide-react';
import { fishCategories, fishSubcategories, difficultyLevels, seasons, FishSpecies } from '@/data/fishSpecies';
import { getPublicFishingSpots, getPublicSpecies, FishingSpot } from '@/data/fishingSpots';
import FishSpeciesCard from '@/components/FishSpeciesCard';
import FishSpeciesDetail from '@/components/FishSpeciesDetail';
import { useProAccess } from '@/hooks/use-mobile';

const heroImage = "https://d64gsuwffb70l.cloudfront.net/696adf30edc51934c9430e8d_1771192564326_3eb57550.jpg";

const FishGuide: React.FC = () => {
  const navigate = useNavigate();
  const { isProUser } = useProAccess();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<FishSpecies | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [fishSpecies, setFishSpecies] = useState<FishSpecies[]>([]);
  const [fishingSpots, setFishingSpots] = useState<FishingSpot[]>([]);

  useEffect(() => {
    getPublicSpecies().then(setFishSpecies).catch(() => setFishSpecies([]));
    getPublicFishingSpots().then(setFishingSpots).catch(() => setFishingSpots([]));
  }, []);

  // Get spot count for each species
  const getSpotCount = (speciesName: string): number => {
    return fishingSpots.filter(spot => 
      spot.fish.some(f => f.toLowerCase().includes(speciesName.toLowerCase()) || 
        speciesName.toLowerCase().includes(f.toLowerCase()))
    ).length;
  };

  // Get related spots for a species
  const getRelatedSpots = (speciesName: string): FishingSpot[] => {
    return fishingSpots.filter(spot => 
      spot.fish.some(f => f.toLowerCase().includes(speciesName.toLowerCase()) || 
        speciesName.toLowerCase().includes(f.toLowerCase()))
    );
  };

  const openSpeciesDetails = (species: FishSpecies) => {
    if (isProUser) setSelectedSpecies(species);
    else navigate('/pricing');
  };

  const filteredSpecies = useMemo(() => {
    let result = fishSpecies.filter(species => {
      const matchesSearch = searchQuery === '' ||
        species.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        species.scientificName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        species.subcategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
        species.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        species.recommendedBait.some(b => b.toLowerCase().includes(searchQuery.toLowerCase())) ||
        species.recommendedLures.some(l => l.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory = selectedCategory === 'all' || species.category === selectedCategory;
      const matchesSubcategory = selectedSubcategory === 'all' || species.subcategory === selectedSubcategory;
      const matchesDifficulty = selectedDifficulty === 'all' || species.difficulty === selectedDifficulty;
      const matchesSeason = !selectedSeason || species.bestSeasons.includes(selectedSeason);

      return matchesSearch && matchesCategory && matchesSubcategory && matchesDifficulty && matchesSeason;
    });

    // Sort
    switch (sortBy) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'difficulty':
        const diffOrder = { 'Beginner': 0, 'Intermediate': 1, 'Advanced': 2, 'Expert': 3 };
        result.sort((a, b) => diffOrder[a.difficulty] - diffOrder[b.difficulty]);
        break;
      case 'spots':
        result.sort((a, b) => getSpotCount(b.name) - getSpotCount(a.name));
        break;
      case 'category':
        result.sort((a, b) => a.category.localeCompare(b.category));
        break;
    }

    return result;
  }, [searchQuery, selectedCategory, selectedSubcategory, selectedDifficulty, selectedSeason, sortBy, fishSpecies, fishingSpots]);

  const activeFilterCount = [
    selectedCategory !== 'all',
    selectedSubcategory !== 'all',
    selectedDifficulty !== 'all',
    selectedSeason !== null,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSelectedCategory('all');
    setSelectedSubcategory('all');
    setSelectedDifficulty('all');
    setSelectedSeason(null);
    setSearchQuery('');
  };

  // Stats
  const freshwaterCount = fishSpecies.filter(s => s.category === 'freshwater').length;
  const saltwaterCount = fishSpecies.filter(s => s.category === 'saltwater').length;
  const anadromousCount = fishSpecies.filter(s => s.category === 'anadromous').length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
              <h1 className="text-lg md:text-2xl font-bold text-white">FishingFinderUSA</h1>
              <p className="text-blue-300 text-sm">Fish Species Guide</p>
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <div className="flex items-center gap-6">
              <button 
                onClick={() => navigate('/')}
                className="text-blue-200 hover:text-white transition md:flex items-center gap-2 hidden"
              >
                <ArrowLeft className="w-4 h-4" />
                Fishing Spots
              </button>
              <span className="text-white font-medium flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                <span className="md:inline hidden">Fish Guide</span>
              </span>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-16 md:py-24 px-4 overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImage} alt="Underwater scene" className="w-full h-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 via-blue-900/70 to-slate-900" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 rounded-full px-4 py-2 mb-6">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span className="text-blue-300 text-sm font-medium">Comprehensive Species Guide</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Know Your <span className="text-blue-400">Fish</span>
          </h2>
          <p className="text-xl text-blue-200 mb-8 max-w-2xl mx-auto">
            Explore detailed profiles of {fishSpecies.length} fish species. Learn about their habitat, 
            best seasons, recommended bait and lures, and where to find them.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="bg-blue-500/20 backdrop-blur-sm rounded-lg px-5 py-3 border border-blue-400/30">
              <div className="flex items-center gap-2 mb-1">
                <Waves className="w-4 h-4 text-blue-400" />
                <p className="text-2xl font-bold text-white">{freshwaterCount}</p>
              </div>
              <p className="text-blue-300 text-xs">Freshwater</p>
            </div>
            <div className="bg-cyan-500/20 backdrop-blur-sm rounded-lg px-5 py-3 border border-cyan-400/30">
              <div className="flex items-center gap-2 mb-1">
                <Anchor className="w-4 h-4 text-cyan-400" />
                <p className="text-2xl font-bold text-white">{saltwaterCount}</p>
              </div>
              <p className="text-cyan-300 text-xs">Saltwater</p>
            </div>
            <div className="bg-purple-500/20 backdrop-blur-sm rounded-lg px-5 py-3 border border-purple-400/30">
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="w-4 h-4 text-purple-400" />
                <p className="text-2xl font-bold text-white">{anadromousCount}</p>
              </div>
              <p className="text-purple-300 text-xs">Anadromous</p>
            </div>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="max-w-7xl mx-auto px-4 -mt-6 relative z-20">
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Search fish by name, type, bait, or lure..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-lg"
              />
            </div>
            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-12 w-[160px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name A-Z</SelectItem>
                  <SelectItem value="difficulty">Difficulty</SelectItem>
                  <SelectItem value="spots">Most Spots</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                className={`h-12 gap-2 ${showFilters ? 'bg-blue-50 border-blue-300' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-blue-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1 block">Category</label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fishCategories.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1 block">Fish Type</label>
                  <Select value={selectedSubcategory} onValueChange={setSelectedSubcategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fishSubcategories.map(sub => (
                        <SelectItem key={sub.value} value={sub.value}>{sub.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1 block">Difficulty</label>
                  <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {difficultyLevels.map(diff => (
                        <SelectItem key={diff.value} value={diff.value}>{diff.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1 block">Season</label>
                  <div className="flex gap-1">
                    {seasons.map(season => (
                      <button
                        key={season}
                        onClick={() => setSelectedSeason(selectedSeason === season ? null : season)}
                        className={`flex-1 py-2 rounded text-xs font-medium transition ${
                          selectedSeason === season
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {season.slice(0, 2)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {activeFilterCount > 0 && (
                <div className="mt-3 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500 hover:text-gray-700">
                    <X className="w-3 h-3 mr-1" />
                    Clear all filters
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Results Count & Quick Filters */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <p className="text-blue-200">
            Showing <span className="text-white font-semibold">{filteredSpecies.length}</span> of {fishSpecies.length} species
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setSelectedCategory(selectedCategory === 'freshwater' ? 'all' : 'freshwater');
              }}
              className={`px-3 py-1 rounded-full text-sm transition flex items-center gap-1.5 ${
                selectedCategory === 'freshwater'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/10 text-blue-200 hover:bg-white/20'
              }`}
            >
              <Waves className="w-3.5 h-3.5" />
              Freshwater
            </button>
            <button
              onClick={() => {
                setSelectedCategory(selectedCategory === 'saltwater' ? 'all' : 'saltwater');
              }}
              className={`px-3 py-1 rounded-full text-sm transition flex items-center gap-1.5 ${
                selectedCategory === 'saltwater'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white/10 text-blue-200 hover:bg-white/20'
              }`}
            >
              <Anchor className="w-3.5 h-3.5" />
              Saltwater
            </button>
            <button
              onClick={() => {
                setSelectedCategory(selectedCategory === 'anadromous' ? 'all' : 'anadromous');
              }}
              className={`px-3 py-1 rounded-full text-sm transition flex items-center gap-1.5 ${
                selectedCategory === 'anadromous'
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/10 text-blue-200 hover:bg-white/20'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Anadromous
            </button>
          </div>
        </div>
      </section>

      {/* Fish Species Grid */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredSpecies.map(species => (
            <FishSpeciesCard
              key={species.id}
              species={species}
              spotCount={getSpotCount(species.name)}
              showDetails={isProUser}
              onClick={() => openSpeciesDetails(species)}
            />
          ))}
        </div>

        {filteredSpecies.length === 0 && (
          <div className="text-center py-16">
            <Fish className="w-16 h-16 text-blue-400/50 mx-auto mb-4" />
            <h3 className="text-xl text-white mb-2">No fish species found</h3>
            <p className="text-blue-300 mb-4">Try adjusting your search or filters</p>
            <Button 
              onClick={clearFilters}
              variant="outline"
              className="border-blue-400 text-blue-300 hover:bg-blue-500/20"
            >
              Clear All Filters
            </Button>
          </div>
        )}
      </section>

      {/* Species Detail Modal */}
      {selectedSpecies && (
        <FishSpeciesDetail
          species={selectedSpecies}
          relatedSpots={getRelatedSpots(selectedSpecies.name)}
          onClose={() => setSelectedSpecies(null)}
          onSpotClick={(spot) => {
            setSelectedSpecies(null);
            navigate('/', { state: { spotId: spot.id } });
          }}
        />
      )}

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
                Your ultimate guide to fishing spots and fish species across all 50 states.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Fish Categories</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => { setSelectedCategory('freshwater'); setSelectedSubcategory('all'); }} className="hover:text-white transition">Freshwater Fish</button></li>
                <li><button onClick={() => { setSelectedCategory('saltwater'); setSelectedSubcategory('all'); }} className="hover:text-white transition">Saltwater Fish</button></li>
                <li><button onClick={() => { setSelectedCategory('anadromous'); setSelectedSubcategory('all'); }} className="hover:text-white transition">Anadromous Fish</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Popular Species</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                {fishSpecies.slice(0, 5).map(species => (
                  <li key={species.id}>
                    <button
                      onClick={() => openSpeciesDetails(species)}
                      className="hover:text-white transition"
                    >
                      {species.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Navigation</h4>
              <ul className="space-y-2 text-blue-300 text-sm">
                <li><button onClick={() => navigate('/')} className="hover:text-white transition">Fishing Spots</button></li>
                <li><button className="text-white font-medium">Fish Species Guide</button></li>
                <li><button onClick={() => navigate('/')} className="hover:text-white transition">Home</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-blue-500/20 mt-8 pt-8 text-center text-blue-300 text-sm">
            <p>© 2026 FishingFinderUSA. All rights reserved. Always check local regulations before fishing.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default FishGuide;
