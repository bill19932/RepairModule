let lastGeocodingTime = 0;
const GEOCODING_DELAY = 1300; // 1.3 seconds between requests for rate limiting

export const geocodeAddress = async (address: string): Promise<{ lat: number; lon: number } | null> => {
  if (!address) {
    console.warn('[GEOCODE] No address provided');
    return null;
  }

  try {
    // Implement rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastGeocodingTime;
    if (timeSinceLastRequest < GEOCODING_DELAY) {
      await new Promise(resolve => setTimeout(resolve, GEOCODING_DELAY - timeSinceLastRequest));
    }
    lastGeocodingTime = Date.now();

    console.log(`[GEOCODE] Requesting geocoding for: "${address}"`);

    // Try server endpoint first
    try {
      const url = new URL('/api/geocode', window.location.origin);
      url.searchParams.set('address', address);

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          console.log(`[GEOCODE] Server geocoded "${address}" to: ${json.data.lat}, ${json.data.lon}`);
          return {
            lat: json.data.lat,
            lon: json.data.lon
          };
        }
      }
    } catch (serverErr) {
      console.warn('[GEOCODE] Server endpoint failed, trying direct Nominatim API');
    }

    // Fallback to direct Nominatim API
    console.log('[GEOCODE] Using direct Nominatim API');
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(nominatimUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DelcoMusicCo-InvoiceApp/1.0'
      },
      // @ts-ignore
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[GEOCODE] Nominatim API returned status ${res.status}`);
      return null;
    }

    const json = await res.json();

    if (Array.isArray(json) && json.length > 0) {
      const result = {
        lat: parseFloat(json[0].lat),
        lon: parseFloat(json[0].lon)
      };
      console.log(`[GEOCODE] Nominatim geocoded "${address}" to: ${result.lat}, ${result.lon}`);
      return result;
    }

    console.warn(`[GEOCODE] No results found for address: "${address}"`);
    return null;

  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[GEOCODE] Request timeout for address: "${address}"`);
    } else {
      console.error(`[GEOCODE] Exception while geocoding "${address}":`, err);
    }
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
