export interface AppConfig {
  strandsAgentApiUrl: string;
}

let _config: AppConfig | null = null;

/**
 * ローカル開発: .env の VITE_STRANDS_AGENT_API_URL (ビルド時注入)
 * CDK デプロイ: FrontendStack が S3 に配置する /config.json (ランタイム取得)
 */
export async function loadConfig(): Promise<AppConfig> {
  if (_config) return _config;

  // .env (Vite ビルド時注入) を優先
  const envUrl = import.meta.env.VITE_STRANDS_AGENT_API_URL;
  if (envUrl) {
    _config = { strandsAgentApiUrl: envUrl };
    return _config;
  }

  // フォールバック: CDK が配置する config.json
  const res = await fetch("/config.json");
  if (!res.ok) throw new Error("Failed to load config.json");
  _config = await res.json();
  return _config!;
}
