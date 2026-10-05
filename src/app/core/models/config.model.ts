export interface AppConfig {
  azureOrg: string;
  azureProject: string;
  azurePat: string;
  geminiApiKey: string;
  geminiModel: string;
}

export interface ConnectionTestResult {
  service: 'azure' | 'gemini';
  success: boolean;
  message: string;
  timestamp: Date;
}
