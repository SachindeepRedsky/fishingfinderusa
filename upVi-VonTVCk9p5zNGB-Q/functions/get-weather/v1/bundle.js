
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

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

    // Fetch current weather + hourly (for pressure) + daily forecast from Open-Meteo
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,precipitation&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max,precipitation_probability_max,uv_index_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&forecast_days=6&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: 'Weather API error', details: errorText }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const weatherData = await response.json();

    // Calculate fishing conditions score (0-100)
    const current = weatherData.current;
    let fishingScore = 50; // Base score
    let factors: { factor: string; impact: string; detail: string }[] = [];

    // Temperature analysis (fish are most active 55-80°F)
    const temp = current.temperature_2m;
    if (temp >= 55 && temp <= 80) {
      fishingScore += 15;
      factors.push({ factor: 'Temperature', impact: 'positive', detail: `${Math.round(temp)}°F is ideal for most species` });
    } else if (temp >= 45 && temp < 55) {
      fishingScore += 5;
      factors.push({ factor: 'Temperature', impact: 'neutral', detail: `${Math.round(temp)}°F - cool but fishable, try slower presentations` });
    } else if (temp > 80 && temp <= 90) {
      fishingScore += 0;
      factors.push({ factor: 'Temperature', impact: 'neutral', detail: `${Math.round(temp)}°F - warm, fish early morning or deep` });
    } else if (temp > 90) {
      fishingScore -= 10;
      factors.push({ factor: 'Temperature', impact: 'negative', detail: `${Math.round(temp)}°F - very hot, fish may be lethargic` });
    } else {
      fishingScore -= 10;
      factors.push({ factor: 'Temperature', impact: 'negative', detail: `${Math.round(temp)}°F - cold conditions, slow fishing expected` });
    }

    // Wind analysis (light wind is good, strong wind is bad)
    const wind = current.wind_speed_10m;
    if (wind >= 5 && wind <= 15) {
      fishingScore += 15;
      factors.push({ factor: 'Wind', impact: 'positive', detail: `${Math.round(wind)} mph - light breeze creates ideal surface chop` });
    } else if (wind < 5) {
      fishingScore += 5;
      factors.push({ factor: 'Wind', impact: 'neutral', detail: `${Math.round(wind)} mph - calm conditions, use subtle presentations` });
    } else if (wind > 15 && wind <= 25) {
      fishingScore -= 5;
      factors.push({ factor: 'Wind', impact: 'neutral', detail: `${Math.round(wind)} mph - moderate wind, fish windblown shorelines` });
    } else {
      fishingScore -= 15;
      factors.push({ factor: 'Wind', impact: 'negative', detail: `${Math.round(wind)} mph - strong wind, difficult conditions` });
    }

    // Barometric pressure analysis (stable/falling pressure is good)
    const pressure = current.surface_pressure;
    const pressureInHg = pressure * 0.02953; // Convert hPa to inHg
    if (pressureInHg >= 29.8 && pressureInHg <= 30.2) {
      fishingScore += 10;
      factors.push({ factor: 'Pressure', impact: 'positive', detail: `${pressureInHg.toFixed(2)} inHg - stable pressure, fish feed actively` });
    } else if (pressureInHg < 29.8) {
      fishingScore += 5;
      factors.push({ factor: 'Pressure', impact: 'neutral', detail: `${pressureInHg.toFixed(2)} inHg - low/falling pressure, fish may feed aggressively before storms` });
    } else {
      fishingScore -= 5;
      factors.push({ factor: 'Pressure', impact: 'neutral', detail: `${pressureInHg.toFixed(2)} inHg - high pressure, fish may be deeper` });
    }

    // Cloud cover (overcast is generally better for fishing)
    const clouds = current.cloud_cover;
    if (clouds >= 50 && clouds <= 90) {
      fishingScore += 10;
      factors.push({ factor: 'Cloud Cover', impact: 'positive', detail: `${clouds}% - overcast skies encourage fish to feed` });
    } else if (clouds >= 25 && clouds < 50) {
      fishingScore += 5;
      factors.push({ factor: 'Cloud Cover', impact: 'neutral', detail: `${clouds}% - partly cloudy, good conditions` });
    } else if (clouds < 25) {
      fishingScore -= 5;
      factors.push({ factor: 'Cloud Cover', impact: 'neutral', detail: `${clouds}% - clear skies, fish deeper or in shade` });
    } else {
      fishingScore += 5;
      factors.push({ factor: 'Cloud Cover', impact: 'positive', detail: `${clouds}% - heavy overcast, excellent for topwater` });
    }

    // Precipitation (light rain can be good, heavy rain is bad)
    const precip = current.precipitation;
    if (precip === 0) {
      fishingScore += 5;
      factors.push({ factor: 'Precipitation', impact: 'positive', detail: 'No rain - comfortable fishing conditions' });
    } else if (precip > 0 && precip <= 0.1) {
      fishingScore += 10;
      factors.push({ factor: 'Precipitation', impact: 'positive', detail: 'Light rain - excellent! Fish feed actively in light rain' });
    } else if (precip > 0.1 && precip <= 0.3) {
      fishingScore -= 5;
      factors.push({ factor: 'Precipitation', impact: 'neutral', detail: 'Moderate rain - can be productive but less comfortable' });
    } else {
      fishingScore -= 15;
      factors.push({ factor: 'Precipitation', impact: 'negative', detail: 'Heavy rain - poor visibility and dangerous conditions' });
    }

    // Humidity
    const humidity = current.relative_humidity_2m;
    if (humidity >= 40 && humidity <= 70) {
      fishingScore += 5;
      factors.push({ factor: 'Humidity', impact: 'positive', detail: `${humidity}% - comfortable humidity level` });
    } else if (humidity > 70 && humidity <= 85) {
      fishingScore += 0;
      factors.push({ factor: 'Humidity', impact: 'neutral', detail: `${humidity}% - humid but fishable` });
    } else if (humidity > 85) {
      fishingScore -= 5;
      factors.push({ factor: 'Humidity', impact: 'negative', detail: `${humidity}% - very humid, insects may be active` });
    } else {
      fishingScore += 0;
      factors.push({ factor: 'Humidity', impact: 'neutral', detail: `${humidity}% - dry conditions` });
    }

    // Clamp score between 0 and 100
    fishingScore = Math.max(0, Math.min(100, fishingScore));

    // Determine rating label
    let ratingLabel = 'Poor';
    let ratingColor = 'red';
    if (fishingScore >= 80) { ratingLabel = 'Excellent'; ratingColor = 'green'; }
    else if (fishingScore >= 65) { ratingLabel = 'Good'; ratingColor = 'blue'; }
    else if (fishingScore >= 50) { ratingLabel = 'Fair'; ratingColor = 'yellow'; }
    else if (fishingScore >= 35) { ratingLabel = 'Below Average'; ratingColor = 'orange'; }

    const result = {
      current: {
        temperature: Math.round(current.temperature_2m),
        feelsLike: Math.round(current.apparent_temperature),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        windDirection: current.wind_direction_10m,
        pressure: pressureInHg.toFixed(2),
        pressureHpa: Math.round(pressure),
        cloudCover: current.cloud_cover,
        precipitation: current.precipitation,
        weatherCode: current.weather_code,
      },
      daily: weatherData.daily ? {
        dates: weatherData.daily.time,
        maxTemps: weatherData.daily.temperature_2m_max.map((t: number) => Math.round(t)),
        minTemps: weatherData.daily.temperature_2m_min.map((t: number) => Math.round(t)),
        weatherCodes: weatherData.daily.weather_code,
        precipSum: weatherData.daily.precipitation_sum,
        windMax: weatherData.daily.wind_speed_10m_max.map((w: number) => Math.round(w)),
        precipProbability: weatherData.daily.precipitation_probability_max,
        uvIndex: weatherData.daily.uv_index_max,
      } : null,
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
