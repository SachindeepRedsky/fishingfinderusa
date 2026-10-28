import { supabase } from '@/lib/supabase';

const API_KEY = 'da8fa76531f86adfb4255e977616a3f9';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';


export interface CurrentWeather {
  temp: number;
  feels_like: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_gust?: number;
  wind_deg: number;
  description: string;
  icon: string;
  main: string;
  visibility: number;
  clouds: number;
  sunrise: number;
  sunset: number;
  dt: number;
  timezone: number;
  city: string;
}

export interface ForecastDay {
  date: string;
  dayName: string;
  temp_min: number;
  temp_max: number;
  description: string;
  icon: string;
  main: string;
  humidity: number;
  wind_speed: number;
  pop: number; // probability of precipitation
}

export interface WeatherData {
  current: CurrentWeather;
  forecast: ForecastDay[];
}

export type FishingCondition = 'excellent' | 'good' | 'fair' | 'poor';

export interface FishingConditionResult {
  condition: FishingCondition;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  reasons: string[];
  score: number;
}

// Extract a searchable location from fishing spot address
function parseLocation(address: string): { zip?: string; city?: string; stateAbbr?: string } {
  // Try to find zip code
  const zipMatch = address.match(/\b(\d{5})\b/);
  
  // Try to find state abbreviation (2 uppercase letters)
  const stateMatch = address.match(/\b([A-Z]{2})\b/);
  
  // Try to extract city - usually the part before the state abbreviation
  const parts = address.split(',').map(p => p.trim());
  let city: string | undefined;
  
  if (parts.length >= 2) {
    // Find the part that contains the state abbreviation and get the city before it
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].trim();
      if (/\b[A-Z]{2}\b/.test(part)) {
        // This part has the state, city is the previous part
        if (i > 0) {
          city = parts[i - 1].trim().replace(/\d+/g, '').trim();
        }
        break;
      }
    }
    // Fallback: use second part if it looks like a city
    if (!city && parts.length >= 2) {
      city = parts[1].trim().replace(/\d+/g, '').trim();
    }
    // If city is empty, try first part
    if (!city || city.length < 2) {
      city = parts[0].trim().replace(/\d+/g, '').trim();
    }
  }
  
  return {
    zip: zipMatch?.[1],
    city: city,
    stateAbbr: stateMatch?.[1],
  };
}

// Build the weather API query parameter
function buildQuery(address: string): string {
  const { zip, city, stateAbbr } = parseLocation(address);
  
  // Prefer zip code for accuracy
  if (zip) {
    return `zip=${zip},US`;
  }
  
  // Fall back to city, state
  if (city && stateAbbr) {
    return `q=${encodeURIComponent(city)},${stateAbbr},US`;
  }
  
  if (city) {
    return `q=${encodeURIComponent(city)},US`;
  }
  
  // Last resort: use the full address
  return `q=${encodeURIComponent(address)}`;
}

export async function fetchCurrentWeather(address: string): Promise<CurrentWeather> {
  const query = buildQuery(address);
  const url = `${BASE_URL}/weather?${query}&appid=${API_KEY}&units=imperial`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    temp: Math.round(data.main.temp),
    feels_like: Math.round(data.main.feels_like),
    humidity: data.main.humidity,
    pressure: data.main.pressure,
    wind_speed: Math.round(data.wind.speed),
    wind_gust: data.wind.gust ? Math.round(data.wind.gust) : undefined,
    wind_deg: data.wind.deg,
    description: data.weather[0].description,
    icon: data.weather[0].icon,
    main: data.weather[0].main,
    visibility: data.visibility,
    clouds: data.clouds.all,
    sunrise: data.sys.sunrise,
    sunset: data.sys.sunset,
    dt: data.dt,
    timezone: data.timezone,
    city: data.name,
  };
}

export async function fetchForecast(address: string): Promise<ForecastDay[]> {
  const query = buildQuery(address);
  const url = `${BASE_URL}/forecast?${query}&appid=${API_KEY}&units=imperial`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Forecast API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Group by day and get daily min/max
  const dailyMap = new Map<string, {
    temps: number[];
    descriptions: string[];
    icons: string[];
    mains: string[];
    humidities: number[];
    winds: number[];
    pops: number[];
  }>();
  
  for (const item of data.list) {
    const date = new Date(item.dt * 1000);
    const dateKey = date.toISOString().split('T')[0];
    
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        temps: [],
        descriptions: [],
        icons: [],
        mains: [],
        humidities: [],
        winds: [],
        pops: [],
      });
    }
    
    const day = dailyMap.get(dateKey)!;
    day.temps.push(item.main.temp);
    day.descriptions.push(item.weather[0].description);
    day.icons.push(item.weather[0].icon);
    day.mains.push(item.weather[0].main);
    day.humidities.push(item.main.humidity);
    day.winds.push(item.wind.speed);
    day.pops.push(item.pop || 0);
  }
  
  const days: ForecastDay[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  for (const [dateKey, dayData] of dailyMap) {
    if (dateKey === today) continue; // Skip today
    if (days.length >= 5) break;
    
    const date = new Date(dateKey + 'T12:00:00');
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Pick the midday icon/description (around noon)
    const midIndex = Math.floor(dayData.icons.length / 2);
    
    days.push({
      date: dateKey,
      dayName: dayNames[date.getDay()],
      temp_min: Math.round(Math.min(...dayData.temps)),
      temp_max: Math.round(Math.max(...dayData.temps)),
      description: dayData.descriptions[midIndex] || dayData.descriptions[0],
      icon: dayData.icons[midIndex] || dayData.icons[0],
      main: dayData.mains[midIndex] || dayData.mains[0],
      humidity: Math.round(dayData.humidities.reduce((a, b) => a + b, 0) / dayData.humidities.length),
      wind_speed: Math.round(Math.max(...dayData.winds)),
      pop: Math.round(Math.max(...dayData.pops) * 100),
    });
  }
  
  return days;
}

export async function fetchWeatherData(address: string): Promise<WeatherData> {
  const [current, forecast] = await Promise.all([
    fetchCurrentWeather(address),
    fetchForecast(address),
  ]);
  
  return { current, forecast };
}

// Analyze fishing conditions based on weather and season
export function analyzeFishingConditions(
  weather: CurrentWeather,
  bestSeason: string,
  spotType: string
): FishingConditionResult {
  let score = 50; // Start at neutral
  const reasons: string[] = [];
  
  // 1. Season match (up to +25 or -15 points)
  const currentMonth = new Date().getMonth(); // 0-11
  const seasonMonths: Record<string, number[]> = {
    'spring': [2, 3, 4],
    'summer': [5, 6, 7],
    'fall': [8, 9, 10],
    'autumn': [8, 9, 10],
    'winter': [11, 0, 1],
    'year-round': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };
  
  const bestSeasonLower = bestSeason.toLowerCase();
  let seasonMatch = false;
  
  for (const [season, months] of Object.entries(seasonMonths)) {
    if (bestSeasonLower.includes(season) && months.includes(currentMonth)) {
      seasonMatch = true;
      break;
    }
  }
  
  if (bestSeasonLower.includes('year-round')) {
    score += 15;
    reasons.push('Great year-round fishing destination');
  } else if (seasonMatch) {
    score += 25;
    reasons.push(`Peak season for this spot (${bestSeason})`);
  } else {
    score -= 15;
    reasons.push(`Off-season — best fishing is ${bestSeason}`);
  }
  
  // 2. Temperature analysis (up to +15 or -15 points)
  const temp = weather.temp;
  const isOcean = spotType === 'ocean';
  
  if (isOcean) {
    // Saltwater fishing temp ranges
    if (temp >= 60 && temp <= 85) {
      score += 15;
      reasons.push(`Ideal saltwater fishing temperature (${temp}°F)`);
    } else if (temp >= 50 && temp <= 90) {
      score += 5;
      reasons.push(`Acceptable temperature for saltwater fishing (${temp}°F)`);
    } else {
      score -= 10;
      reasons.push(`Temperature may affect saltwater fishing (${temp}°F)`);
    }
  } else {
    // Freshwater fishing temp ranges
    if (temp >= 55 && temp <= 80) {
      score += 15;
      reasons.push(`Ideal freshwater fishing temperature (${temp}°F)`);
    } else if (temp >= 40 && temp <= 90) {
      score += 5;
      reasons.push(`Acceptable temperature for fishing (${temp}°F)`);
    } else if (temp < 32) {
      score -= 5;
      reasons.push(`Freezing conditions — consider ice fishing (${temp}°F)`);
    } else {
      score -= 10;
      reasons.push(`Extreme temperature may reduce fish activity (${temp}°F)`);
    }
  }
  
  // 3. Wind analysis (up to +10 or -15 points)
  const wind = weather.wind_speed;
  if (wind <= 8) {
    score += 10;
    reasons.push(`Light winds — excellent casting conditions (${wind} mph)`);
  } else if (wind <= 15) {
    score += 3;
    reasons.push(`Moderate winds — manageable for most fishing (${wind} mph)`);
  } else if (wind <= 25) {
    score -= 10;
    reasons.push(`Strong winds may make fishing difficult (${wind} mph)`);
  } else {
    score -= 15;
    reasons.push(`Very high winds — fishing not recommended (${wind} mph)`);
  }
  
  // 4. Precipitation/Weather conditions (up to +10 or -10 points)
  const mainWeather = weather.main.toLowerCase();
  if (mainWeather === 'clear') {
    score += 5;
    reasons.push('Clear skies — good visibility');
  } else if (mainWeather === 'clouds' || mainWeather === 'mist' || mainWeather === 'haze') {
    score += 10;
    reasons.push('Overcast skies — fish are often more active');
  } else if (mainWeather === 'drizzle' || (mainWeather === 'rain' && weather.description.includes('light'))) {
    score += 8;
    reasons.push('Light rain — excellent for fishing activity');
  } else if (mainWeather === 'rain') {
    score -= 5;
    reasons.push('Rain may affect visibility and comfort');
  } else if (mainWeather === 'thunderstorm') {
    score -= 15;
    reasons.push('Thunderstorms — unsafe for fishing, seek shelter');
  } else if (mainWeather === 'snow') {
    score -= 5;
    reasons.push('Snow conditions — dress warmly, consider ice fishing');
  }
  
  // 5. Barometric pressure (up to +5 or -5 points)
  if (weather.pressure < 1010) {
    score += 5;
    reasons.push('Low pressure system — fish tend to feed more actively');
  } else if (weather.pressure > 1025) {
    score -= 3;
    reasons.push('High pressure — fish may be less active, try deeper water');
  } else {
    score += 3;
    reasons.push('Stable barometric pressure');
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  // Determine condition level
  let condition: FishingCondition;
  let color: string;
  let bgColor: string;
  let borderColor: string;
  let label: string;
  
  if (score >= 75) {
    condition = 'excellent';
    color = 'text-green-400';
    bgColor = 'bg-green-500/15';
    borderColor = 'border-green-500/30';
    label = 'Excellent';
  } else if (score >= 55) {
    condition = 'good';
    color = 'text-emerald-400';
    bgColor = 'bg-emerald-500/15';
    borderColor = 'border-emerald-500/30';
    label = 'Good';
  } else if (score >= 35) {
    condition = 'fair';
    color = 'text-yellow-400';
    bgColor = 'bg-yellow-500/15';
    borderColor = 'border-yellow-500/30';
    label = 'Fair';
  } else {
    condition = 'poor';
    color = 'text-red-400';
    bgColor = 'bg-red-500/15';
    borderColor = 'border-red-500/30';
    label = 'Poor';
  }
  
  return { condition, color, bgColor, borderColor, label, reasons, score };
}

// Get wind direction label from degrees
export function getWindDirection(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
}

// Format unix timestamp to local time
export function formatTime(timestamp: number, timezone: number): string {
  const date = new Date((timestamp + timezone) * 1000);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Calculate daylight hours
export function getDaylightHours(sunrise: number, sunset: number): string {
  const diff = sunset - sunrise;
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// Get weather icon URL
// Get weather icon URL
export function getWeatherIconUrl(icon: string): string {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

// Fetch weather data using the get-weather edge function (Open-Meteo, no API key needed)
export async function fetchWeatherByCoords(latitude: number, longitude: number): Promise<WeatherData> {
  const { data, error } = await supabase.functions.invoke('get-weather', {
    body: { latitude, longitude },
  });

  if (error) {
    throw new Error(`Edge function error: ${error.message}`);
  }

  return {
    current: data.current,
    forecast: data.forecast || [],
  };
}
