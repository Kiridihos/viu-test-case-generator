import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { AzureDevOpsService } from '../../core/services/azure-devops.service';
import { GeminiAiService } from '../../core/services/gemini-ai.service';
import { PbiItem } from '../../core/models/pbi.model';
import { GeneratedTestCase, SyncResult, TestCaseStep } from '../../core/models/test-case.model';
import { SyncModalComponent } from '../../shared/components/sync-modal/sync-modal.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SyncModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  authService = inject(AuthService);
  configService = inject(ConfigService);
  azureService = inject(AzureDevOpsService);
  geminiService = inject(GeminiAiService);
  router = inject(Router);

  // Requirements Input
  pbiId = signal<string>('');
  pbiTitle = signal<string>('');
  pbiDescription = signal<string>('');
  pbiAcceptanceCriteria = signal<string>('');

  // States
  isSearchingPbi = signal<boolean>(false);
  isGeneratingAi = signal<boolean>(false);
  isSyncingAzure = signal<boolean>(false);
  hasGenerated = signal<boolean>(false);

  // Feedback Messages
  searchError = signal<string | null>(null);
  aiError = signal<string | null>(null);
  syncError = signal<string | null>(null);

  // Results
  testCases = signal<GeneratedTestCase[]>([]);
  syncResult = signal<SyncResult | null>(null);
  showSyncModal = signal<boolean>(false);

  // Computed counts
  selectedCount = computed(() => this.testCases().filter(tc => tc.selected).length);

  ngOnInit(): void {
    // Check if user is authenticated
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
    }
  }

  searchPbi(): void {
    const id = parseInt(this.pbiId().trim(), 10);
    if (isNaN(id) || id <= 0) {
      this.searchError.set('Por favor ingresa un ID numérico de PBI válido.');
      return;
    }

    if (!this.configService.isAzureConfigured()) {
      this.searchError.set('Azure DevOps no está configurado. Ve a "Parámetros del sistema" para agregar tu Organización y PAT.');
      return;
    }

    this.isSearchingPbi.set(true);
    this.searchError.set(null);

    this.azureService.getPbi(id).subscribe({
      next: (pbi: PbiItem) => {
        this.pbiTitle.set(pbi.title);
        this.pbiDescription.set(pbi.description);
        this.pbiAcceptanceCriteria.set(pbi.acceptanceCriteria);
        this.isSearchingPbi.set(false);
      },
      error: (err: any) => {
        this.searchError.set(err.message || 'Error al buscar el PBI en Azure DevOps.');
        this.isSearchingPbi.set(false);
      }
    });
  }

  loadSamplePbi(): void {
    this.pbiId.set('1042');
    this.pbiTitle.set('Pasarela de Pago Alternativa ante Fallo de Pasarela Principal');
    this.pbiDescription.set(
      'Como usuario del portal e-commerce,\n' +
      'deseo contar con una pasarela de pago alternativa automática cuando la pasarela primaria experimente errores (HTTP 500 o timeout),\n' +
      'para poder finalizar mi compra sin perder los artículos de mi carrito ni tener que recargar la página manualmente.'
    );
    this.pbiAcceptanceCriteria.set(
      '1. Si la pasarela primaria responde con error o supera los 5 segundos de espera, debe desplegarse la opción de pago alternativa.\n' +
      '2. El usuario debe recibir una notificación visual clara: "Pasarela principal en mantenimiento. Redirigiendo a pasarela secundaria segura".\n' +
      '3. Los datos del carrito y el monto total deben preservarse íntegros.\n' +
      '4. Si ambas pasarelas fallan, mostrar mensaje de soporte con código de seguimiento único.'
    );
    this.searchError.set(null);
  }

  generateTestCases(): void {
    if (!this.pbiTitle().trim()) {
      this.aiError.set('Debes ingresar al menos el título de la historia de usuario para generar casos de prueba.');
      return;
    }

    if (!this.configService.isGeminiConfigured()) {
      this.aiError.set('Falta configurar tu Gemini API Key en "Parámetros del sistema".');
      return;
    }

    this.isGeneratingAi.set(true);
    this.aiError.set(null);

    const pbiData: PbiItem = {
      id: parseInt(this.pbiId() || '0', 10),
      title: this.pbiTitle(),
      description: this.pbiDescription(),
      acceptanceCriteria: this.pbiAcceptanceCriteria()
    };

    this.geminiService.generateTestCases(pbiData).subscribe({
      next: (cases: GeneratedTestCase[]) => {
        this.testCases.set(cases);
        this.hasGenerated.set(true);
        this.isGeneratingAi.set(false);
      },
      error: (err: any) => {
        this.aiError.set(err.message || 'Error al invocar Google Gemini API.');
        this.isGeneratingAi.set(false);
      }
    });
  }

  toggleSelectAll(): void {
    const allSelected = this.testCases().every(tc => tc.selected);
    this.testCases.update(cases =>
      cases.map(tc => ({ ...tc, selected: !allSelected }))
    );
  }

  toggleCaseSelection(index: number): void {
    this.testCases.update(cases => {
      const copy = [...cases];
      copy[index] = { ...copy[index], selected: !copy[index].selected };
      return copy;
    });
  }

  sendToAzureDevOps(): void {
    const selectedCases = this.testCases().filter(tc => tc.selected);
    if (selectedCases.length === 0) {
      this.syncError.set('Selecciona al menos un caso de prueba para sincronizar con Azure DevOps.');
      return;
    }

    if (!this.configService.isAzureConfigured()) {
      this.syncError.set('Debes configurar Azure DevOps (Organización, Proyecto y PAT) antes de sincronizar.');
      return;
    }

    const pbiIdNum = parseInt(this.pbiId() || '0', 10);
    this.isSyncingAzure.set(true);
    this.syncError.set(null);

    this.azureService.createTestCasesBatch(pbiIdNum, selectedCases).subscribe({
      next: (result: SyncResult) => {
        this.isSyncingAzure.set(false);
        if (result.createdCount > 0) {
          this.syncResult.set(result);
          this.showSyncModal.set(true);

          // Mark synced items
          this.testCases.update(cases =>
            cases.map(tc => tc.selected ? { ...tc, synced: true } : tc)
          );
        } else {
          this.syncError.set('No se crearon casos de prueba en Azure DevOps.');
        }
      },
      error: (err: any) => {
        this.syncError.set(err.message || 'Error al enviar Test Cases a Azure DevOps.');
        this.isSyncingAzure.set(false);
      }
    });
  }

  closeModal(): void {
    this.showSyncModal.set(false);
  }

  getStepAction(step: TestCaseStep | string): string {
    return typeof step === 'string' ? step : (step.accion || '');
  }

  getStepExpected(step: TestCaseStep | string): string | null {
    if (typeof step === 'string') {
      return null;
    }
    return step.resultadoEsperado || null;
  }

  logout(): void {
    this.authService.logout();
  }
}
