const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}
