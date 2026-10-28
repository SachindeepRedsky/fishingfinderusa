import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Droplets,
  Wind,
  Thermometer,
  Eye,
  Gauge,
  Sunrise,
  Sunset,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Fish,
  CloudRain,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  fetchWeatherData,
  fetchWeatherByCoords,
  analyzeFishingConditions,
  getWindDirection,
  formatTime,
  getDaylightHours,
  getWeatherIconUrl,
  type WeatherData,
  type FishingConditionResult,
} from '@/lib/weather';
import { spotCoordinates } from '@/data/spotCoordinates';

interface WeatherWidgetProps {
  address: string;
  bestSeason: string;
  spotType: string;
  spotName: string;
  spotId?: number;
  coordinates?: { lat: number; lng: number };
}

const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  address,
  bestSeason,
  spotType,
  spotName,
  spotId,
  coordinates
}) => {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [fishingCondition, setFishingCondition] = useState<FishingConditionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadWeather = async () => {
    setLoading(true);
    setError(null);
    try {
      let data: WeatherData;
      // Try edge function with coordinates first (free Open-Meteo API, no key needed)
      const coords = coordinates || null;
      if (coords) {
        try {
          data = await fetchWeatherData(address);
        } catch {
          // Fallback to OpenWeatherMap direct API
          data = await fetchWeatherData(address);
        }
      } else {
        data = await fetchWeatherData(address);
      }
      setWeatherData(data);
      const condition = analyzeFishingConditions(data.current, bestSeason, spotType);
      setFishingCondition(condition);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Weather fetch error:', err);
      setError('Unable to load weather data for this location.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeather();
  }, [address, spotId]);

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-sky-500/10 to-blue-600/10 rounded-lg p-5 border border-sky-400/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-sky-500/20 p-2 rounded-lg">
            <Cloud className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Weather & Fishing Conditions</h3>
            <p className="text-xs text-sky-300">Loading real-time data...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
          <span className="ml-2 text-sky-300 text-sm">Fetching weather data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-sky-500/10 to-blue-600/10 rounded-lg p-5 border border-sky-400/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-sky-500/20 p-2 rounded-lg">
            <Cloud className="w-5 h-5 text-sky-300" />
          </div>
          <h3 className="font-semibold text-white">Weather & Fishing Conditions</h3>
        </div>
        <div className="text-center py-6">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-gray-300 text-sm mb-3">{error}</p>
          <Button
            size="sm"
            variant="outline"
            className="border-sky-400/50 text-sky-300 hover:bg-sky-500/20 bg-inherit"
            onClick={loadWeather}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!weatherData || !fishingCondition) return null;

  const { current, forecast } = weatherData;

  return (
    <div className="bg-gradient-to-br from-sky-500/10 via-blue-600/10 to-indigo-600/10 rounded-lg border border-sky-400/20 overflow-hidden">
      {/* Header with Fishing Conditions Badge */}
      <div className="p-5 pb-0">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-sky-500/20 p-2 rounded-lg">
              <Cloud className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Weather & Fishing Conditions</h3>
              <p className="text-xs text-sky-300">
                {current.city} {lastUpdated && `· Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-sky-300 hover:text-white hover:bg-sky-500/20 p-1.5 h-auto"
            onClick={loadWeather}
            title="Refresh weather"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Fishing Conditions Badge - Prominent */}
        <div className={`${fishingCondition.bgColor} ${fishingCondition.borderColor} border rounded-xl p-4 mb-4`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <Fish className={`w-5 h-5 ${fishingCondition.color}`} />
              <span className="text-white font-semibold text-sm">Fishing Conditions</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`text-2xl font-bold ${fishingCondition.color}`}>
                {fishingCondition.score}
              </div>
              <div className="text-right">
                <Badge className={`${fishingCondition.bgColor} ${fishingCondition.color} border ${fishingCondition.borderColor} font-semibold`}>
                  {fishingCondition.label}
                </Badge>
              </div>
            </div>
          </div>
          {/* Condition Bar */}
          <div className="w-full bg-slate-700/50 rounded-full h-2 mb-3">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                fishingCondition.condition === 'excellent' ? 'bg-green-500' :
                fishingCondition.condition === 'good' ? 'bg-emerald-500' :
                fishingCondition.condition === 'fair' ? 'bg-yellow-500' :
                'bg-red-500'
              }`}
              style={{ width: `${fishingCondition.score}%` }}
            />
          </div>
          {/* Reasons */}
          <ul className="space-y-1">
            {fishingCondition.reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  reason.includes('Ideal') || reason.includes('Peak') || reason.includes('Light wind') || reason.includes('Overcast') || reason.includes('Light rain') || reason.includes('excellent') || reason.includes('Great year')
                    ? 'bg-green-400'
                    : reason.includes('unsafe') || reason.includes('not recommended') || reason.includes('Extreme') || reason.includes('Very high')
                    ? 'bg-red-400'
                    : reason.includes('Off-season') || reason.includes('Strong') || reason.includes('Rain') || reason.includes('Freezing')
                    ? 'bg-yellow-400'
                    : 'bg-blue-400'
                }`} />
                <span className="text-gray-300">{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Current Weather */}
      <div className="px-5 pb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center">
            <img
              src={getWeatherIconUrl(current.icon)}
              alt={current.description}
              className="w-16 h-16 -ml-2"
            />
            <div>
              <div className="text-4xl font-bold text-white">{current.temp}°F</div>
              <div className="text-sm text-sky-300 capitalize">{current.description}</div>
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-sm text-gray-400">Feels like</div>
            <div className="text-lg font-semibold text-white">{current.feels_like}°F</div>
          </div>
        </div>

        {/* Weather Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-slate-800/60 rounded-lg p-3 text-center">
            <Wind className="w-4 h-4 text-sky-400 mx-auto mb-1" />
            <div className="text-white font-semibold text-sm">{current.wind_speed} mph</div>
            <div className="text-[10px] text-gray-400">{getWindDirection(current.wind_deg)} Wind</div>
            {current.wind_gust && (
              <div className="text-[10px] text-amber-400">Gusts {current.wind_gust} mph</div>
            )}
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 text-center">
            <Droplets className="w-4 h-4 text-blue-400 mx-auto mb-1" />
            <div className="text-white font-semibold text-sm">{current.humidity}%</div>
            <div className="text-[10px] text-gray-400">Humidity</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 text-center">
            <Gauge className="w-4 h-4 text-purple-400 mx-auto mb-1" />
            <div className="text-white font-semibold text-sm">{current.pressure} hPa</div>
            <div className="text-[10px] text-gray-400">Pressure</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 text-center">
            <Eye className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <div className="text-white font-semibold text-sm">{(current.visibility / 1609).toFixed(1)} mi</div>
            <div className="text-[10px] text-gray-400">Visibility</div>
          </div>
        </div>

        {/* Sunrise / Sunset */}
        <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-indigo-500/10 rounded-lg p-4 border border-amber-400/15">
          <div className="flex items-center gap-2 mb-3">
            <Sunrise className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-white">Sun Schedule</span>
            <span className="text-xs text-gray-400 ml-auto">
              {getDaylightHours(current.sunrise, current.sunset)} of daylight
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/20 rounded-lg p-2.5">
                <Sunrise className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="text-white font-semibold">{formatTime(current.sunrise, current.timezone)}</div>
                <div className="text-xs text-amber-300">Sunrise</div>
              </div>
            </div>
            {/* Sun arc visualization */}
            <div className="flex-1 mx-4 relative">
              <div className="h-px bg-gradient-to-r from-amber-500/40 via-yellow-400/60 to-indigo-500/40 w-full" />
              <SunArc sunrise={current.sunrise} sunset={current.sunset} timezone={current.timezone} />
            </div>
            <div className="flex items-center gap-3">
              <div>
                <div className="text-white font-semibold text-right">{formatTime(current.sunset, current.timezone)}</div>
                <div className="text-xs text-indigo-300 text-right">Sunset</div>
              </div>
              <div className="bg-indigo-500/20 rounded-lg p-2.5">
                <Sunset className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
          </div>
          {/* Fishing time tips */}
          <div className="mt-3 bg-slate-800/40 rounded-lg p-2.5">
            <div className="flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-300">
                <span className="text-amber-300 font-medium">Best fishing times:</span>{' '}
                30 min before sunrise to 2 hours after, and 2 hours before sunset to 30 min after.
                Dawn and dusk are the golden hours for most species.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 5-Day Forecast (Expandable) */}
      <div className="border-t border-sky-400/10">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-white/5 transition"
        >
          <span className="text-sm font-medium text-sky-300">5-Day Forecast</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-sky-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-sky-400" />
          )}
        </button>

        {expanded && (
          <div className="px-5 pb-5">
            <div className="space-y-2">
              {forecast.map((day, i) => (
                <div
                  key={day.date}
                  className="flex items-center gap-3 bg-slate-800/50 rounded-lg p-3 hover:bg-slate-800/70 transition"
                >
                  <div className="w-10 text-center">
                    <div className="text-xs font-semibold text-white">{day.dayName}</div>
                    <div className="text-[10px] text-gray-400">
                      {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <img
                    src={getWeatherIconUrl(day.icon)}
                    alt={day.description}
                    className="w-10 h-10"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white capitalize truncate">{day.description}</div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Wind className="w-3 h-3" />
                        {day.wind_speed} mph
                      </span>
                      <span className="flex items-center gap-1">
                        <Droplets className="w-3 h-3" />
                        {day.humidity}%
                      </span>
                      {day.pop > 0 && (
                        <span className="flex items-center gap-1 text-blue-400">
                          <CloudRain className="w-3 h-3" />
                          {day.pop}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-white">{day.temp_max}°</div>
                    <div className="text-xs text-gray-400">{day.temp_min}°</div>
                  </div>
                  {/* Mini fishing indicator for forecast days */}
                  <ForecastFishingIndicator day={day} bestSeason={bestSeason} spotType={spotType} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Sun arc position indicator
const SunArc: React.FC<{ sunrise: number; sunset: number; timezone: number }> = ({ sunrise, sunset, timezone }) => {
  const now = Math.floor(Date.now() / 1000);
  const dayLength = sunset - sunrise;
  const elapsed = now - sunrise;
  const progress = Math.max(0, Math.min(1, elapsed / dayLength));
  const isDaytime = now >= sunrise && now <= sunset;

  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0">
      {isDaytime && (
        <div
          className="absolute -top-1.5 w-3 h-3 bg-yellow-400 rounded-full shadow-lg shadow-yellow-400/50 border border-yellow-300"
          style={{ left: `${progress * 100}%`, transform: 'translateX(-50%)' }}
        />
      )}
    </div>
  );
};

// Mini fishing condition indicator for forecast days
const ForecastFishingIndicator: React.FC<{
  day: { temp_max: number; wind_speed: number; pop: number; main: string };
  bestSeason: string;
  spotType: string;
}> = ({ day, bestSeason, spotType }) => {
  let score = 50;

  // Temperature
  const avgTemp = day.temp_max;
  if (avgTemp >= 55 && avgTemp <= 80) score += 15;
  else if (avgTemp >= 40 && avgTemp <= 90) score += 5;
  else score -= 10;

  // Wind
  if (day.wind_speed <= 8) score += 10;
  else if (day.wind_speed <= 15) score += 3;
  else score -= 10;

  // Precipitation
  if (day.pop < 20) score += 5;
  else if (day.pop < 50) score += 0;
  else score -= 5;

  // Weather
  const main = day.main.toLowerCase();
  if (main === 'clouds') score += 5;
  else if (main === 'thunderstorm') score -= 15;

  score = Math.max(0, Math.min(100, score));

  const dotColor = score >= 70 ? 'bg-green-400' : score >= 50 ? 'bg-yellow-400' : 'bg-red-400';
  const label = score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Poor';

  return (
    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
      <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} title={`Fishing: ${label}`} />
      <span className="text-[9px] text-gray-500">{label}</span>
    </div>
  );
};

export default WeatherWidget;
