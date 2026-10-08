/**
 * Descobre o estado a partir da localização do aparelho, sem enviar a posição a nenhum serviço:
 * a conta é feita aqui, comparando com cidades de referência de cada estado.
 * É uma aproximação (perto da divisa pode errar); por isso o resultado só pré-seleciona a
 * roleta e a pessoa confirma ou muda.
 */

type Point = [lat: number, lon: number];

const CITIES: Record<string, Point[]> = {
  AC: [[-9.97, -67.81], [-7.63, -72.67]],
  AL: [[-9.67, -35.74], [-9.75, -36.66]],
  AP: [[0.03, -51.07], [3.84, -51.83]],
  AM: [[-3.12, -60.02], [-4.25, -69.94], [-2.63, -56.74], [-3.35, -64.71]],
  BA: [[-12.97, -38.51], [-14.86, -40.84], [-12.15, -44.99], [-9.41, -40.5], [-12.27, -38.97], [-14.79, -39.05], [-16.45, -39.06]],
  CE: [[-3.73, -38.52], [-7.21, -39.32], [-3.69, -40.35]],
  DF: [[-15.79, -47.88]],
  ES: [[-20.32, -40.34], [-20.85, -41.11], [-19.54, -40.63], [-19.39, -40.07]],
  GO: [[-16.68, -49.25], [-16.33, -48.95], [-17.8, -50.93], [-18.17, -47.94], [-15.54, -47.34]],
  MA: [[-2.53, -44.3], [-5.52, -47.48], [-7.53, -46.04], [-4.86, -43.36]],
  MT: [[-15.6, -56.1], [-16.47, -54.64], [-11.86, -55.5], [-16.07, -57.68], [-15.89, -52.26]],
  MS: [[-20.47, -54.62], [-22.22, -54.81], [-19.01, -57.65], [-20.75, -51.68], [-22.54, -55.73]],
  MG: [[-19.92, -43.94], [-18.92, -48.28], [-16.73, -43.86], [-21.76, -43.35], [-19.75, -47.93], [-18.85, -41.95], [-21.78, -46.56], [-21.55, -45.43], [-17.86, -41.51], [-17.22, -46.87]],
  PA: [[-1.46, -48.5], [-2.44, -54.71], [-5.37, -49.12], [-3.2, -52.21], [-8.03, -50.03]],
  PB: [[-7.12, -34.86], [-7.23, -35.88], [-7.02, -37.28], [-6.76, -38.23]],
  PR: [[-25.43, -49.27], [-23.31, -51.16], [-23.42, -51.94], [-25.55, -54.59], [-24.96, -53.46], [-25.09, -50.16], [-25.39, -51.46]],
  PE: [[-8.05, -34.88], [-9.39, -40.5], [-8.28, -35.97], [-8.89, -36.5]],
  PI: [[-5.09, -42.8], [-2.9, -41.78], [-7.08, -41.47], [-6.77, -43.02], [-9.07, -44.36]],
  RJ: [[-22.91, -43.17], [-21.75, -41.32], [-22.52, -44.1], [-22.51, -43.18], [-23.0, -44.32], [-22.28, -42.53]],
  RN: [[-5.79, -35.21], [-5.19, -37.34], [-6.46, -37.1]],
  RS: [[-30.03, -51.23], [-29.17, -51.18], [-31.77, -52.34], [-29.69, -53.81], [-28.26, -52.41], [-29.76, -57.09], [-27.87, -54.48]],
  RO: [[-8.76, -63.9], [-10.88, -61.95], [-12.74, -60.15]],
  RR: [[2.82, -60.67]],
  SC: [[-27.6, -48.55], [-26.3, -48.85], [-26.92, -49.07], [-27.1, -52.62], [-27.82, -50.33], [-28.68, -49.37]],
  SP: [[-23.55, -46.63], [-22.91, -47.06], [-21.18, -47.81], [-20.82, -49.38], [-23.96, -46.33], [-23.5, -47.46], [-22.12, -51.39], [-22.31, -49.06], [-21.21, -50.43], [-23.22, -45.9], [-22.21, -49.95], [-20.54, -47.4]],
  SE: [[-10.91, -37.07], [-10.92, -37.67]],
  TO: [[-10.18, -48.33], [-7.19, -48.21], [-11.73, -49.07]],
};

/** Acima disso, a pessoa provavelmente está fora do Brasil: não sugerimos nada. */
const MAX_DISTANCE_KM = 450;

function distanceKm([lat1, lon1]: Point, [lat2, lon2]: Point) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** UF do estado cuja cidade de referência está mais perto, ou null se estiver longe de todas. */
export function stateFromCoords(lat: number, lon: number): string | null {
  let best: { uf: string; km: number } | null = null;
  for (const [uf, cities] of Object.entries(CITIES)) {
    for (const city of cities) {
      const km = distanceKm([lat, lon], city);
      if (!best || km < best.km) best = { uf, km };
    }
  }
  return best && best.km <= MAX_DISTANCE_KM ? best.uf : null;
}

export type LocationResult =
  | { status: "ok"; uf: string }
  | { status: "outside" }
  | { status: "denied" }
  | { status: "unavailable" };

/** Pede a posição ao navegador (só quando a pessoa toca no botão). A posição não é guardada. */
export function detectStateFromDevice(): Promise<LocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ status: "unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const uf = stateFromCoords(coords.latitude, coords.longitude);
        resolve(uf ? { status: "ok", uf } : { status: "outside" });
      },
      (error) =>
        resolve({
          status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });
}
