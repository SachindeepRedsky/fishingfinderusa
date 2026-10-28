export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { address } = await req.json();
    
    if (!address || typeof address !== 'string') {
      return new Response(JSON.stringify({ error: 'Address is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
    
    if (!gatewayApiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const geocodeResponse = await fetch(
      `https://maps.gateway.fastrouter.io/maps/api/geocode/json?address=${encodeURIComponent(address)}`,
      {
        headers: {
          'X-API-Key': gatewayApiKey
        }
      }
    );

    const geocodeData = await geocodeResponse.json();

    if (geocodeData.status === 'OK' && geocodeData.results && geocodeData.results.length > 0) {
      const location = geocodeData.results[0].geometry.location;
      const formattedAddress = geocodeData.results[0].formatted_address;
      
      return new Response(JSON.stringify({
        lat: location.lat,
        lng: location.lng,
        formattedAddress: formattedAddress
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } else {
      return new Response(JSON.stringify({ 
        error: 'Location not found',
        status: geocodeData.status 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
