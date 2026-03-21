export interface AppConfig {
  strandsAgentApiUrl: string;
}

let _config: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config;
  const res = await fetch("/config.json");
  if (!res.ok) throw new Error("Failed to load config.json");
  _config = await res.json();
  return _config!;
}
