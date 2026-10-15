import axios from "axios";

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<unknown>(error)) return fallback;

  const body = error.response?.data;
  if (
    typeof body === "object" && body !== null && !Array.isArray(body) &&
    "error" in body && typeof body.error === "string" && body.error.trim()
  ) {
    return body.error;
  }
  return fallback;
}
