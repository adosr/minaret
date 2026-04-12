export function getLocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        maximumAge: 0
      }
    );
  });
}

export function isGeolocationPermissionDenied(error) {
  return !!error && error.code === 1;
}

export async function reverseGeocode(lat, lon, lang, fallback) {
  const langHeader = lang === "ar" ? "ar" : "en";

  const key = `city_${lat.toFixed(3)}_${lon.toFixed(3)}_${langHeader}`;
  const cached = localStorage.getItem(key);

  const EXPIRY = 24 * 60 * 60 * 1000;

  if (cached) {
    try {
      const parsed = JSON.parse(cached);

      if (Date.now() - parsed.timestamp < EXPIRY) {
        return parsed.value;
      }
    } catch {}
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
      {
        headers: {
          "Accept-Language": langHeader,
          "User-Agent": "MinaretApp/1.0"
        }
      }
    );

    if (!res.ok) throw new Error("Reverse geocoding failed");

    const data = await res.json();
    const a = data.address || {};

    const city =
      a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.county ||
      a.state ||
      data.name ||
      fallback;

    localStorage.setItem(
      key,
      JSON.stringify({
        value: city,
        timestamp: Date.now()
      })
    );

    return city;
  } catch {
    return fallback;
  }
}

export function pickCityName(state) {
  if (state.lang === "ar") return state.placeNameAr || state.placeNameEn || "";
  return state.placeNameEn || state.placeNameAr || "";
}

export function formatCoords(lat, lon) {
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}