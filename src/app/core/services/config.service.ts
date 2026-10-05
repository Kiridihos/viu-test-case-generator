import { Injectable, signal, computed } from '@angular/core';
import { AppConfig } from '../models/config.model';

const STORAGE_KEY = 'tcg_app_config';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private defaultConfig: AppConfig = {
    azureOrg: '',
    azureProject: '',
    azurePat: '',
    geminiApiKey: '',
    geminiModel: 'gemini-flash-latest'
  };

  private configSignal = signal<AppConfig>(this.loadInitialConfig());

  // Exposed Signals
  readonly currentConfig = this.configSignal.asReadonly();

  readonly isAzureConfigured = computed(() => {
    const cfg = this.configSignal();
    return Boolean(cfg.azureOrg.trim() && cfg.azureProject.trim() && cfg.azurePat.trim());
  });

  readonly isGeminiConfigured = computed(() => {
    const cfg = this.configSignal();
    return Boolean(cfg.geminiApiKey.trim());
  });

  private loadInitialConfig(): AppConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...this.defaultConfig, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Error reading config from localStorage', e);
    }
    return this.defaultConfig;
  }

  saveConfig(newConfig: AppConfig): void {
    this.configSignal.set({ ...newConfig });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch (e) {
      console.error('Error saving config to localStorage', e);
    }
  }

  updateAzureConfig(azureOrg: string, azureProject: string, azurePat: string): void {
    const current = this.configSignal();
    this.saveConfig({ ...current, azureOrg, azureProject, azurePat });
  }

  updateGeminiConfig(geminiApiKey: string, geminiModel: string): void {
    const current = this.configSignal();
    this.saveConfig({ ...current, geminiApiKey, geminiModel });
  }
}
