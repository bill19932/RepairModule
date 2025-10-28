// Rate limiting to avoid hitting Nominatim API limits (1 request/second)
let lastGeocodingTime = 0;
const GEOCODING_DELAY = 1200; // 1.2 seconds between requests

export const geocodeAddress = async (address: string): Promise<{ lat: number; lon: number } | null> => {
  if (!address) return null;

  try {
    // Implement rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastGeocodingTime;
    if (timeSinceLastRequest < GEOCODING_DELAY) {
      await new Promise(resolve => setTimeout(resolve, GEOCODING_DELAY - timeSinceLastRequest));
    }
    lastGeocodingTime = Date.now();

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DelcoMusicCo-InvoiceApp/1.0'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`Geocoding API returned status ${res.status} for address: ${address}`);
      return null;
    }

    const json = await res.json();
    if (Array.isArray(json) && json.length > 0) {
      const result = { lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon) };
      console.log(`Geocoded "${address}" to: ${result.lat}, ${result.lon}`);
      return result;
    }

    console.warn(`No geocoding results found for address: ${address}`);
    return null;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`Geocoding timeout for address: ${address}`);
    } else {
      console.error(`Geocode error for address "${address}":`, err);
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
