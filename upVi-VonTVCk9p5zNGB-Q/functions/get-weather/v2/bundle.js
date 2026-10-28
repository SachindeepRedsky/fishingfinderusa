
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// WMO Weather Code to description mapping
function getWeatherDescription(code: number): { description: string; icon: string; main: string } {
  const map: Record<number, { description: string; icon: string; main: string }> = {
    0: { description: 'clear sky', icon: '01d', main: 'Clear' },
    1: { description: 'mainly clear', icon: '02d', main: 'Clear' },
    2: { description: 'partly cloudy', icon: '03d', main: 'Clouds' },
    3: { description: 'overcast', icon: '04d', main: 'Clouds' },
    45: { description: 'fog', icon: '50d', main: 'Mist' },
    48: { description: 'depositing rime fog', icon: '50d', main: 'Mist' },
    51: { description: 'light drizzle', icon: '09d', main: 'Drizzle' },
    53: { description: 'moderate drizzle', icon: '09d', main: 'Drizzle' },
    55: { description: 'dense drizzle', icon: '09d', main: 'Drizzle' },
    56: { description: 'light freezing drizzle', icon: '09d', main: 'Drizzle' },
    57: { description: 'dense freezing drizzle', icon: '09d', main: 'Drizzle' },
    61: { description: 'slight rain', icon: '10d', main: 'Rain' },
    63: { description: 'moderate rain', icon: '10d', main: 'Rain' },
    65: { description: 'heavy rain', icon: '10d', main: 'Rain' },
    66: { description: 'light freezing rain', icon: '13d', main: 'Rain' },
    67: { description: 'heavy freezing rain', icon: '13d', main: 'Rain' },
    71: { description: 'slight snow', icon: '13d', main: 'Snow' },
    73: { description: 'moderate snow', icon: '13d', main: 'Snow' },
    75: { description: 'heavy snow', icon: '13d', main: 'Snow' },
    77: { description: 'snow grains', icon: '13d', main: 'Snow' },
    80: { description: 'slight rain showers', icon: '09d', main: 'Rain' },
    81: { description: 'moderate rain showers', icon: '09d', main: 'Rain' },
    82: { description: 'violent rain showers', icon: '09d', main: 'Rain' },
    85: { description: 'slight snow showers', icon: '13d', main: 'Snow' },
    86: { description: 'heavy snow showers', icon: '13d', main: 'Snow' },
    95: { description: 'thunderstorm', icon: '11d', main: 'Thunderstorm' },
    96: { description: 'thunderstorm with slight hail', icon: '11d', main: 'Thunderstorm' },
    99: { description: 'thunderstorm with heavy hail', icon: '11d', main: 'Thunderstorm' },
  };
  return map[code] || { description: 'unknown', icon: '01d', main: 'Clear' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { latitude, longitude } = await req.json();

    if (!latitude || !longitude) {
      return new Response(
        JSON.stringify({ error: 'latitude and longitude are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Fetch current weather + daily forecast + sunrise/sunset from Open-Meteo
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover,precipitation,visibility&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max,precipitation_probability_max,uv_index_max,sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&forecast_days=6&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: 'Weather API error', details: errorText }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const weatherData = await response.json();

    const current = weatherData.current;
    const daily = weatherData.daily;
    const weatherInfo = getWeatherDescription(current.weather_code);
    
    // Calculate pressure in hPa from surface pressure
    const pressureHpa = Math.round(current.surface_pressure);
    
    // Get sunrise/sunset for today as unix timestamps
    const todaySunrise = daily?.sunrise?.[0] ? Math.floor(new Date(daily.sunrise[0]).getTime() / 1000) : 0;
    const todaySunset = daily?.sunset?.[0] ? Math.floor(new Date(daily.sunset[0]).getTime() / 1000) : 0;
    
    // Calculate timezone offset in seconds
    const tzOffsetSeconds = weatherData.utc_offset_seconds || 0;

    // Fishing conditions score
    let fishingScore = 50;
    let factors: { factor: string; impact: string; detail: string }[] = [];

    const temp = current.temperature_2m;
    if (temp >= 55 && temp <= 80) {
      fishingScore += 15;
      factors.push({ factor: 'Temperature', impact: 'positive', detail: `${Math.round(temp)}°F is ideal for most species` });
    } else if (temp >= 45 && temp < 55) {
      fishingScore += 5;
      factors.push({ factor: 'Temperature', impact: 'neutral', detail: `${Math.round(temp)}°F - cool but fishable` });
    } else if (temp > 80 && temp <= 90) {
      fishingScore += 0;
      factors.push({ factor: 'Temperature', impact: 'neutral', detail: `${Math.round(temp)}°F - warm, fish early or deep` });
    } else if (temp > 90) {
      fishingScore -= 10;
      factors.push({ factor: 'Temperature', impact: 'negative', detail: `${Math.round(temp)}°F - very hot` });
    } else {
      fishingScore -= 10;
      factors.push({ factor: 'Temperature', impact: 'negative', detail: `${Math.round(temp)}°F - cold conditions` });
    }

    const wind = current.wind_speed_10m;
    if (wind >= 5 && wind <= 15) {
      fishingScore += 15;
      factors.push({ factor: 'Wind', impact: 'positive', detail: `${Math.round(wind)} mph - ideal surface chop` });
    } else if (wind < 5) {
      fishingScore += 5;
      factors.push({ factor: 'Wind', impact: 'neutral', detail: `${Math.round(wind)} mph - calm` });
    } else if (wind > 15 && wind <= 25) {
      fishingScore -= 5;
      factors.push({ factor: 'Wind', impact: 'neutral', detail: `${Math.round(wind)} mph - moderate wind` });
    } else {
      fishingScore -= 15;
      factors.push({ factor: 'Wind', impact: 'negative', detail: `${Math.round(wind)} mph - strong wind` });
    }

    const pressureInHg = current.surface_pressure * 0.02953;
    if (pressureInHg >= 29.8 && pressureInHg <= 30.2) {
      fishingScore += 10;
      factors.push({ factor: 'Pressure', impact: 'positive', detail: `${pressureInHg.toFixed(2)} inHg - stable` });
    } else if (pressureInHg < 29.8) {
      fishingScore += 5;
      factors.push({ factor: 'Pressure', impact: 'neutral', detail: `${pressureInHg.toFixed(2)} inHg - low/falling` });
    } else {
      fishingScore -= 5;
      factors.push({ factor: 'Pressure', impact: 'neutral', detail: `${pressureInHg.toFixed(2)} inHg - high` });
    }

    const clouds = current.cloud_cover;
    if (clouds >= 50 && clouds <= 90) {
      fishingScore += 10;
      factors.push({ factor: 'Cloud Cover', impact: 'positive', detail: `${clouds}% - overcast encourages feeding` });
    } else if (clouds >= 25 && clouds < 50) {
      fishingScore += 5;
      factors.push({ factor: 'Cloud Cover', impact: 'neutral', detail: `${clouds}% - partly cloudy` });
    } else if (clouds < 25) {
      fishingScore -= 5;
      factors.push({ factor: 'Cloud Cover', impact: 'neutral', detail: `${clouds}% - clear skies` });
    } else {
      fishingScore += 5;
      factors.push({ factor: 'Cloud Cover', impact: 'positive', detail: `${clouds}% - heavy overcast` });
    }

    const precip = current.precipitation;
    if (precip === 0) {
      fishingScore += 5;
      factors.push({ factor: 'Precipitation', impact: 'positive', detail: 'No rain' });
    } else if (precip > 0 && precip <= 0.1) {
      fishingScore += 10;
      factors.push({ factor: 'Precipitation', impact: 'positive', detail: 'Light rain - fish feed actively' });
    } else if (precip > 0.1 && precip <= 0.3) {
      fishingScore -= 5;
      factors.push({ factor: 'Precipitation', impact: 'neutral', detail: 'Moderate rain' });
    } else {
      fishingScore -= 15;
      factors.push({ factor: 'Precipitation', impact: 'negative', detail: 'Heavy rain' });
    }

    fishingScore = Math.max(0, Math.min(100, fishingScore));

    let ratingLabel = 'Poor';
    let ratingColor = 'red';
    if (fishingScore >= 80) { ratingLabel = 'Excellent'; ratingColor = 'green'; }
    else if (fishingScore >= 65) { ratingLabel = 'Good'; ratingColor = 'blue'; }
    else if (fishingScore >= 50) { ratingLabel = 'Fair'; ratingColor = 'yellow'; }
    else if (fishingScore >= 35) { ratingLabel = 'Below Average'; ratingColor = 'orange'; }

    // Build forecast days
    const forecastDays = [];
    if (daily) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      // Skip today (index 0), get next 5 days
      for (let i = 1; i < Math.min(daily.time.length, 6); i++) {
        const date = new Date(daily.time[i] + 'T12:00:00');
        const dayWeather = getWeatherDescription(daily.weather_code[i]);
        forecastDays.push({
          date: daily.time[i],
          dayName: dayNames[date.getDay()],
          temp_min: Math.round(daily.temperature_2m_min[i]),
          temp_max: Math.round(daily.temperature_2m_max[i]),
          description: dayWeather.description,
          icon: dayWeather.icon,
          main: dayWeather.main,
          humidity: 0,
          wind_speed: Math.round(daily.wind_speed_10m_max[i]),
          pop: daily.precipitation_probability_max[i] || 0,
        });
      }
    }

    // Visibility in meters (Open-Meteo returns in meters if available)
    const visibilityMeters = current.visibility !== undefined ? current.visibility : 10000;

    const result = {
      current: {
        temp: Math.round(current.temperature_2m),
        feels_like: Math.round(current.apparent_temperature),
        humidity: current.relative_humidity_2m,
        pressure: pressureHpa,
        wind_speed: Math.round(current.wind_speed_10m),
        wind_gust: current.wind_gusts_10m ? Math.round(current.wind_gusts_10m) : undefined,
        wind_deg: current.wind_direction_10m,
        description: weatherInfo.description,
        icon: weatherInfo.icon,
        main: weatherInfo.main,
        visibility: visibilityMeters,
        clouds: current.cloud_cover,
        sunrise: todaySunrise,
        sunset: todaySunset,
        dt: Math.floor(Date.now() / 1000),
        timezone: tzOffsetSeconds,
        city: '',
      },
      forecast: forecastDays,
      fishingConditions: {
        score: fishingScore,
        label: ratingLabel,
        color: ratingColor,
        factors,
      },
      timezone: weatherData.timezone,
    };

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
