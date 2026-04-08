export interface AppConfig {
  strandsAgentApiUrl: string;
}

let _config: AppConfig | null = null;

/**
 * .env の VITE_STRANDS_AGENT_API_URL (ビルド時注入) を使用する
 */
export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config;

  const envUrl = import.meta.env.VITE_STRANDS_AGENT_API_URL;
  if (!envUrl) throw new Error("VITE_STRANDS_AGENT_API_URL is not set");
  _config = { strandsAgentApiUrl: envUrl };
  return _config;
}
