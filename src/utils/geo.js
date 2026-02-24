export function inSamaraArea(lat, lon) {
  const minLat = Number(process.env.SAMARA_MIN_LAT || 53.05);
  const maxLat = Number(process.env.SAMARA_MAX_LAT || 53.35);
  const minLon = Number(process.env.SAMARA_MIN_LON || 49.95);
  const maxLon = Number(process.env.SAMARA_MAX_LON || 50.35);
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}
