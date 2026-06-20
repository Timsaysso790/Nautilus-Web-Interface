const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

export const API_CONFIG = {
  NAUTILUS_API_URL: "",
  WS_URL: `${protocol}//${window.location.host}`,
  ADMIN_DB_API_URL: "",
  TIMEOUT: 30000,
};

export async function loadApiConfig(): Promise<void> {}

export default API_CONFIG;
