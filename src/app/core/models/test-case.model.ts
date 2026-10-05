export interface TestCaseStep {
  accion: string;
  resultadoEsperado: string;
}

export interface GeneratedTestCase {
  id?: string;
  titulo: string;
  precondiciones: string;
  pasos: (TestCaseStep | string)[];
  resultadoEsperado: string;
  esGherkin?: boolean;
  selected?: boolean;
  synced?: boolean;
  syncedWorkItemId?: number;
  syncedUrl?: string;
  error?: string;
}

export interface SyncResult {
  pbiId: number;
  project: string;
  createdCount: number;
  testCaseIds: number[];
  timestamp: Date;
}
