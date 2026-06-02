const API_URL = "https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints";

export type ApiFetchResult = {
  ok: boolean;
  status: number;
  bodyText: string;
};

export async function fetchExerciseDataPoints(token: string): Promise<ApiFetchResult> {
  const response = await fetch(API_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const bodyText = await response.text();
  return { ok: response.ok, status: response.status, bodyText };
}
