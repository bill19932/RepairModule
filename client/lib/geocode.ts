let lastGeocodingTime = 0;
const GEOCODING_DELAY = 1000; // 1 second between requests for rate limiting

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
    console.log(`[GEOCODE] Using direct Nominatim API for: "${address}"`);
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;

    console.log(`[GEOCODE] Request URL: ${nominatimUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.warn('[GEOCODE] Request timeout for address: ' + address);
    }, 15000); // 15 second timeout

    let res;
    try {
      res = await fetch(nominatimUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'DelcoMusicCo-InvoiceApp/1.0'
        },
        // @ts-ignore
        signal: controller.signal
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      console.error('[GEOCODE] Fetch error:', fetchErr);
      return null;
    }

    clearTimeout(timeoutId);

    console.log(`[GEOCODE] Response status: ${res.status}`);

    if (!res.ok) {
      console.warn(`[GEOCODE] Nominatim API returned status ${res.status}`);
      const errorText = await res.text();
      console.warn(`[GEOCODE] Response body: ${errorText}`);
      return null;
    }

    let json;
    try {
      json = await res.json();
      console.log(`[GEOCODE] Parsed response:`, json);
    } catch (parseErr) {
      console.error('[GEOCODE] Failed to parse JSON response:', parseErr);
      return null;
    }

    if (Array.isArray(json) && json.length > 0) {
      const result = {
        lat: parseFloat(json[0].lat),
        lon: parseFloat(json[0].lon)
      };
      console.log(`✓ [GEOCODE] SUCCESS: "${address}" → ${result.lat}, ${result.lon}`);
      return result;
    }

    console.log(`[GEOCODE] No results for: "${address}"`);
    console.log(`[GEOCODE] Full response:`, JSON.stringify(json));
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
