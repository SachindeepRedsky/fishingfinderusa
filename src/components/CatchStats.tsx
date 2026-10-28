import React, { useMemo } from 'react';
import { Fish, Trophy, TrendingUp, Calendar, Ruler, Scale, MapPin, BarChart3 } from 'lucide-react';

interface CatchEntry {
  id: string;
  species: string;
  weight_lbs: number | string | null;
  length_inches: number | string | null;
  location: string;
  state: string | null;
  date: string;
  photo_url: string | null;
  catch_and_release: boolean;
}

interface CatchStatsProps {
  catches: CatchEntry[];
}

const toNum = (val: any, fallback = 0): number => {
  if (val == null || val === '') return fallback;
  const n = typeof val === 'string' ? parseFloat(val) : Number(val);
  return isNaN(n) || !isFinite(n) ? fallback : n;
};

const CatchStats: React.FC<CatchStatsProps> = ({ catches }) => {
  const stats = useMemo(() => {
    try {
      if (!catches || catches.length === 0) {
        return {
          totalCatches: 0,
          biggestFish: null as CatchEntry | null,
          longestFish: null as CatchEntry | null,
          mostCaughtSpecies: '',
          mostCaughtCount: 0,
          uniqueSpecies: 0,
          uniqueLocations: 0,
          catchAndReleaseCount: 0,
          monthlyData: [] as { month: string; count: number; label: string }[],
          thisYearCount: 0,
          avgWeight: 0,
        };
      }

      // Biggest fish by weight
      const withWeight = catches.filter(c => toNum(c.weight_lbs) > 0);
      const biggestFish = withWeight.length > 0
        ? withWeight.reduce((max, c) => toNum(c.weight_lbs) > toNum(max.weight_lbs) ? c : max, withWeight[0])
        : null;

      // Longest fish
      const withLength = catches.filter(c => toNum(c.length_inches) > 0);
      const longestFish = withLength.length > 0
        ? withLength.reduce((max, c) => toNum(c.length_inches) > toNum(max.length_inches) ? c : max, withLength[0])
        : null;

      // Most caught species
      const speciesCount: Record<string, number> = {};
      catches.forEach(c => {
        if (c.species) {
          speciesCount[c.species] = (speciesCount[c.species] || 0) + 1;
        }
      });
      const sortedSpecies = Object.entries(speciesCount).sort((a, b) => b[1] - a[1]);
      const mostCaughtSpecies = sortedSpecies.length > 0 ? sortedSpecies[0] : null;

      // Unique counts
      const uniqueSpecies = new Set(catches.map(c => c.species).filter(Boolean)).size;
      const uniqueLocations = new Set(catches.map(c => c.location).filter(Boolean)).size;

      // Catch and release
      const catchAndReleaseCount = catches.filter(c => c.catch_and_release).length;

      // Monthly data for chart (last 12 months)
      const now = new Date();
      const monthlyData: { month: string; count: number; label: string }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        const count = catches.filter(c => {
          try {
            const cd = new Date(c.date + 'T00:00:00');
            return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
          } catch {
            return false;
          }
        }).length;
        monthlyData.push({ month: key, count, label });
      }

      // This year count
      const thisYear = now.getFullYear();
      const thisYearCount = catches.filter(c => {
        try {
          return new Date(c.date + 'T00:00:00').getFullYear() === thisYear;
        } catch {
          return false;
        }
      }).length;

      // Average weight
      const totalWeight = withWeight.reduce((sum, c) => sum + toNum(c.weight_lbs), 0);
      const avgWeight = withWeight.length > 0 ? totalWeight / withWeight.length : 0;

      return {
        totalCatches: catches.length,
        biggestFish,
        longestFish,
        mostCaughtSpecies: mostCaughtSpecies?.[0] || '',
        mostCaughtCount: mostCaughtSpecies?.[1] || 0,
        uniqueSpecies,
        uniqueLocations,
        catchAndReleaseCount,
        monthlyData,
        thisYearCount,
        avgWeight,
      };
    } catch (err) {
      console.error('Error computing catch stats:', err);
      return {
        totalCatches: catches?.length || 0,
        biggestFish: null,
        longestFish: null,
        mostCaughtSpecies: '',
        mostCaughtCount: 0,
        uniqueSpecies: 0,
        uniqueLocations: 0,
        catchAndReleaseCount: 0,
        monthlyData: [] as { month: string; count: number; label: string }[],
        thisYearCount: 0,
        avgWeight: 0,
      };
    }
  }, [catches]);

  const maxMonthlyCount = useMemo(() => {
    try {
      if (!stats.monthlyData || stats.monthlyData.length === 0) return 1;
      return Math.max(...stats.monthlyData.map(d => d.count), 1);
    } catch {
      return 1;
    }
  }, [stats.monthlyData]);

  if (!catches || catches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-4 hover:bg-white/15 transition">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-blue-500/20 p-2 rounded-lg">
              <Fish className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">{stats.totalCatches}</p>
          <p className="text-blue-300 text-sm">Total Catches</p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-4 hover:bg-white/15 transition">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-amber-500/20 p-2 rounded-lg">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">
            {stats.biggestFish ? `${toNum(stats.biggestFish.weight_lbs).toFixed(1)}` : '\u2014'}
          </p>
          <p className="text-blue-300 text-sm">
            {stats.biggestFish ? `Biggest (lbs) \u00B7 ${stats.biggestFish.species}` : 'Biggest Fish (lbs)'}
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-4 hover:bg-white/15 transition">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-green-500/20 p-2 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">{stats.mostCaughtCount}</p>
          <p className="text-blue-300 text-sm truncate" title={stats.mostCaughtSpecies}>
            {stats.mostCaughtSpecies || 'Most Caught'}
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-4 hover:bg-white/15 transition">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-purple-500/20 p-2 rounded-lg">
              <BarChart3 className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-white">{stats.uniqueSpecies}</p>
          <p className="text-blue-300 text-sm">Species Caught</p>
        </div>
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex items-center gap-3">
          <Calendar className="w-5 h-5 text-cyan-400 flex-shrink-0" />
          <div>
            <p className="text-white font-semibold">{stats.thisYearCount}</p>
            <p className="text-blue-300 text-xs">This Year</p>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex items-center gap-3">
          <Scale className="w-5 h-5 text-orange-400 flex-shrink-0" />
          <div>
            <p className="text-white font-semibold">{stats.avgWeight.toFixed(1)} lbs</p>
            <p className="text-blue-300 text-xs">Avg Weight</p>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex items-center gap-3">
          <MapPin className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-white font-semibold">{stats.uniqueLocations}</p>
            <p className="text-blue-300 text-xs">Locations</p>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex items-center gap-3">
          <Ruler className="w-5 h-5 text-teal-400 flex-shrink-0" />
          <div>
            <p className="text-white font-semibold">
              {stats.longestFish ? `${toNum(stats.longestFish.length_inches).toFixed(1)}"` : '\u2014'}
            </p>
            <p className="text-blue-300 text-xs">Longest Fish</p>
          </div>
        </div>
      </div>

      {/* Monthly Activity Chart */}
      {stats.monthlyData && stats.monthlyData.length > 0 && (
        <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-semibold">Monthly Activity</h3>
            <span className="text-blue-300 text-sm ml-auto">Last 12 months</span>
          </div>
          <div className="flex items-end gap-1.5 h-40">
            {stats.monthlyData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-blue-300 font-medium">
                  {d.count > 0 ? d.count : ''}
                </span>
                <div
                  className={`w-full rounded-t-md transition-all ${
                    d.count > 0
                      ? 'bg-gradient-to-t from-blue-600 to-blue-400'
                      : 'bg-white/5'
                  }`}
                  style={{
                    height: `${Math.max((d.count / maxMonthlyCount) * 100, d.count > 0 ? 8 : 4)}%`,
                    minHeight: d.count > 0 ? '8px' : '4px',
                  }}
                  title={`${d.label}: ${d.count} catches`}
                />
                <span className="text-[10px] text-blue-400">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CatchStats;
