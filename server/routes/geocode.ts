import { RequestHandler } from "express";

interface GeocodeResult {
  lat: number;
  lon: number;
}

interface GeocodeResponse {
  success: boolean;
  data?: GeocodeResult;
  error?: string;
}

// Rate limiting: track last request time
let lastGeocodingTime = 0;
const GEOCODING_DELAY = 1200; // 1.2 seconds between requests

export const handleGeocode: RequestHandler = async (req, res) => {
  try {
    const { address } = req.query;

    if (!address || typeof address !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Address parameter is required',
      } as GeocodeResponse);
    }

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

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DelcoMusicCo-InvoiceApp/1.0'
      },
      // @ts-ignore - fetch API in Node may not have signal, but it's supported in recent versions
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Nominatim API returned status ${response.status} for address: ${address}`);
      return res.status(200).json({
        success: false,
        error: `API returned status ${response.status}`,
      } as GeocodeResponse);
    }

    const json = await response.json();

    if (Array.isArray(json) && json.length > 0) {
      const result: GeocodeResult = {
        lat: parseFloat(json[0].lat),
        lon: parseFloat(json[0].lon)
      };
      console.log(`[GEOCODE] Successfully geocoded "${address}" to: ${result.lat}, ${result.lon}`);
      return res.status(200).json({
        success: true,
        data: result,
      } as GeocodeResponse);
    }

    console.warn(`[GEOCODE] No results found for address: ${address}`);
    return res.status(200).json({
      success: false,
      error: 'No results found for this address',
    } as GeocodeResponse);

  } catch (err) {
    let errorMessage = 'Unknown error';
    
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        errorMessage = 'Request timeout';
      } else {
        errorMessage = err.message;
      }
    }

    console.error(`[GEOCODE] Error: ${errorMessage}`, err);
    return res.status(200).json({
      success: false,
      error: errorMessage,
    } as GeocodeResponse);
  }
};
