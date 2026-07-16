const API_BASE = "https://health.googleapis.com/v4/users/me/dataTypes";

export type ApiFetchResult = {
  ok: boolean;
  status: number;
  bodyText: string;
};

export async function fetchDataPoints(token: string, dataType: string): Promise<ApiFetchResult> {
  const response = await fetch(`${API_BASE}/${dataType}/dataPoints`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const bodyText = await response.text();
  return { ok: response.ok, status: response.status, bodyText };
}
