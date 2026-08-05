export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  distance: number; // meters
  moving_time: number; // seconds
  start_date: string; // ISO 8601
  [key: string]: unknown;
};

export type StravaApiFetchResult = {
  ok: boolean;
  status: number;
  bodyText: string;
};

export function parseActivities(bodyText: string): StravaActivity[] {
  try {
    const parsed = JSON.parse(bodyText);
    return Array.isArray(parsed) ? (parsed as StravaActivity[]) : [];
  } catch {
    return [];
  }
}

export async function fetchActivities(token: string, perPage = 30): Promise<StravaApiFetchResult> {
  const response = await fetch(`/api/strava-activities?per_page=${perPage}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const bodyText = await response.text();
  return { ok: response.ok, status: response.status, bodyText };
}
