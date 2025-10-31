const BASE = process.env.INFOCLIMAT_API_BASE ?? 'https://www.infoclimat.fr/opendata/';
const TOKEN = process.env.INFOCLIMAT_API_TOKEN;

export async function fetchInfoclimat({ station, start, end }) {
  if (!TOKEN) {
    throw new Error('INFOCLIMAT_API_TOKEN is not defined');
  }

  if (!station) {
    throw new Error('Infoclimat station is required');
  }

  const url = new URL(BASE);
  url.searchParams.set('version', '2');
  url.searchParams.set('method', 'get');
  url.searchParams.set('format', 'json');
  url.searchParams.append('stations[]', station);
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  url.searchParams.set('token', TOKEN);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Infoclimat responded with ${res.status}`);
  }

  return res.json();
}

export async function fetchInfoclimatRange(stationId, start, end) {
  return fetchInfoclimat({ station: stationId, start, end });
}
