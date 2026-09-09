const EARTH_RADIUS_KM = 6371;

export function validLatitude(value) {
  if (value == null || String(value).trim() === '') return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= -90 && number <= 90;
}

export function validLongitude(value) {
  if (value == null || String(value).trim() === '') return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= -180 && number <= 180;
}

export function distanceKm(latitude1, longitude1, latitude2, longitude2) {
  if (
    !validLatitude(latitude1) ||
    !validLongitude(longitude1) ||
    !validLatitude(latitude2) ||
    !validLongitude(longitude2)
  ) {
    return null;
  }

  const toRadians = (degrees) => (Number(degrees) * Math.PI) / 180;
  const lat1 = toRadians(latitude1);
  const lat2 = toRadians(latitude2);
  const latitudeDelta = toRadians(Number(latitude2) - Number(latitude1));
  const longitudeDelta = toRadians(Number(longitude2) - Number(longitude1));
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
