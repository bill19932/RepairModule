export const geocodeAddress = async (address: string): Promise<{ lat: number; lon: number } | null> => {
  if (!address) {
    console.warn('[GEOCODE] No address provided');
    return null;
  }

  try {
    console.log(`[GEOCODE] Requesting geocoding for: "${address}"`);

    const url = new URL('/api/geocode', window.location.origin);
    url.searchParams.set('address', address);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn(`[GEOCODE] API request failed with status ${res.status}`);
      return null;
    }

    const json = await res.json();

    if (json.success && json.data) {
      console.log(`[GEOCODE] Successfully geocoded "${address}" to: ${json.data.lat}, ${json.data.lon}`);
      return {
        lat: json.data.lat,
        lon: json.data.lon
      };
    }

    console.warn(`[GEOCODE] Geocoding failed: ${json.error || 'Unknown error'}`);
    return null;

  } catch (err) {
    console.error(`[GEOCODE] Exception while geocoding "${address}":`, err);
    return null;
  }
};

export const haversineMiles = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};
