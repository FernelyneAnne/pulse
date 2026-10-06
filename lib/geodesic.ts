// Great-circle interpolation so conversation arcs follow the globe's surface.
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function greatCircle(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
  steps = 48,
): [number, number][] {
  const p1 = toRad(lat1), l1 = toRad(lng1), p2 = toRad(lat2), l2 = toRad(lng2);
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((p2 - p1) / 2) ** 2 +
          Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2,
      ),
    );
  if (d < 1e-6) return [[lng1, lat1], [lng2, lat2]];
  const pts: [number, number][] = [];
  let prevLng: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    let lng = toDeg(Math.atan2(y, x));
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    // Keep longitudes continuous across the antimeridian.
    if (prevLng !== null) {
      while (lng - prevLng > 180) lng -= 360;
      while (lng - prevLng < -180) lng += 360;
    }
    prevLng = lng;
    pts.push([lng, lat]);
  }
  return pts;
}
