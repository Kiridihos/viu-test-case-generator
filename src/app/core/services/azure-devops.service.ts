import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, forkJoin, of, map, catchError, switchMap } from 'rxjs';
import { ConfigService } from './config.service';
import { PbiItem } from '../models/pbi.model';
import { GeneratedTestCase, SyncResult, TestCaseStep } from '../models/test-case.model';

@Injectable({
  providedIn: 'root'
})
export class AzureDevOpsService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private getAuthHeaders(): HttpHeaders {
    const config = this.configService.currentConfig();
    const token = config.azurePat.trim();
    const encodedPat = btoa(':' + token);
    return new HttpHeaders({
      'Authorization': `Basic ${encodedPat}`,
      'Content-Type': 'application/json'
    });
  }

  private getPatchHeaders(): HttpHeaders {
    const config = this.configService.currentConfig();
    const token = config.azurePat.trim();
    const encodedPat = btoa(':' + token);
    return new HttpHeaders({
      'Authorization': `Basic ${encodedPat}`,
      'Content-Type': 'application/json-patch+json'
    });
  }

  private getBaseUrl(): string {
    const { azureOrg, azureProject } = this.configService.currentConfig();
    const org = encodeURIComponent(azureOrg.trim());
    const project = encodeURIComponent(azureProject.trim());
    return `https://dev.azure.com/${org}/${project}/_apis`;
  }

  /**
   * Test connection with Azure DevOps by querying project details
   */
  testConnection(): Observable<{ success: boolean; message: string }> {
    const { azureOrg, azureProject, azurePat } = this.configService.currentConfig();
    if (!azureOrg || !azureProject || !azurePat) {
      return of({
        success: false,
        message: 'Faltan parámetros de Azure DevOps (Organización, Proyecto o PAT).'
      });
    }

    const org = encodeURIComponent(azureOrg.trim());
    const project = encodeURIComponent(azureProject.trim());
    const url = `https://dev.azure.com/${org}/_apis/projects/${project}?api-version=7.0`;
    return this.http.get<any>(url, { headers: this.getAuthHeaders() }).pipe(
      map(res => ({
        success: true,
        message: `Conexión exitosa con el proyecto "${res.name || azureProject}".`
      })),
      catchError(err => {
        let msg = 'No se pudo conectar con Azure DevOps.';
        if (err.status === 401 || err.status === 203) {
          msg = 'Personal Access Token (PAT) inválido o expirado.';
        } else if (err.status === 404) {
          msg = 'Organización o Proyecto no encontrado en Azure DevOps.';
        } else if (err.status === 0) {
          msg = 'Error de red o restricción de CORS en Azure DevOps. Verifica tu conexión.';
        } else if (err.error?.message) {
          msg = err.error.message;
        }
        return of({ success: false, message: msg });
      })
    );
  }

  /**
   * Fetches a Work Item / PBI by ID and maps Title, Description, Acceptance Criteria
   */
  getPbi(id: number): Observable<PbiItem> {
    const { azureOrg, azureProject } = this.configService.currentConfig();
    const url = `${this.getBaseUrl()}/wit/workitems/${id}?api-version=7.0`;

    return this.http.get<any>(url, { headers: this.getAuthHeaders() }).pipe(
      map(data => {
        const fields = data.fields || {};
        const rawDesc = fields['System.Description'] || '';
        const rawAc = fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || fields['Custom.AcceptanceCriteria'] || '';

        return {
          id: data.id,
          title: fields['System.Title'] || `PBI #${data.id}`,
          description: this.formatHtmlText(rawDesc),
          acceptanceCriteria: this.formatHtmlText(rawAc),
          state: fields['System.State'],
          assignedTo: fields['System.AssignedTo']?.displayName,
          url: data._links?.html?.href || `https://dev.azure.com/${azureOrg}/${azureProject}/_workitems/edit/${id}`
        };
      }),
      catchError((error: HttpErrorResponse) => {
        let errorMsg = `Error al obtener el PBI #${id}`;
        if (error.status === 404) {
          errorMsg = `El Work Item #${id} no existe en el proyecto especificado.`;
        } else if (error.status === 401 || error.status === 203) {
          errorMsg = 'Error de autenticación: verifica tu Personal Access Token (PAT).';
        } else if (error.error?.message) {
          errorMsg = error.error.message;
        }
        return throwError(() => new Error(errorMsg));
      })
    );
  }

  /**
   * Creates a single Test Case linked to the parent PBI
   */
  createTestCase(pbiId: number, testCase: GeneratedTestCase): Observable<any> {
    const { azureOrg, azureProject } = this.configService.currentConfig();
    const url = `${this.getBaseUrl()}/wit/workitems/$Test%20Case?api-version=7.0`;

    // Construct TCM XML steps structure
    const stepsXml = this.buildTcmStepsXml(testCase);

    // Construct HTML description summary
    const stepsListHtml = (testCase.pasos || []).map((step, idx) => {
      if (typeof step === 'string') {
        return `<li><strong>Acción:</strong> ${this.escapeXml(step)}</li>`;
      }
      return `
        <li>
          <strong>Acción:</strong> ${this.escapeXml(step.accion)}<br/>
          <strong>Resultado Esperado:</strong> ${this.escapeXml(step.resultadoEsperado)}
        </li>
      `;
    }).join('');

    const htmlDescription = `
      <p><strong>Precondiciones:</strong> ${this.escapeXml(testCase.precondiciones || 'N/A')}</p>
      <p><strong>Pasos de Ejecución y Resultados Esperados:</strong></p>
      <ol>
        ${stepsListHtml}
      </ol>
      <p><strong>Resultado Esperado General:</strong> ${this.escapeXml(testCase.resultadoEsperado)}</p>
      <p><em>Generado con IA mediante TestCase Generator</em></p>
    `;

    const patchBody: any[] = [
      {
        op: 'add',
        path: '/fields/System.Title',
        value: testCase.titulo
      },
      {
        op: 'add',
        path: '/fields/System.Description',
        value: htmlDescription
      },
      {
        op: 'add',
        path: '/fields/Microsoft.VSTS.TCM.Steps',
        value: stepsXml
      }
    ];

    if (pbiId && pbiId > 0) {
      patchBody.push({
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: `https://dev.azure.com/${encodeURIComponent(azureOrg)}/${encodeURIComponent(azureProject)}/_apis/wit/workitems/${pbiId}`,
          attributes: {
            comment: 'Vinculado automáticamente desde TestCase Generator IA'
          }
        }
      });
    }

    return this.http.post<any>(url, patchBody, { headers: this.getPatchHeaders() }).pipe(
      catchError((error: HttpErrorResponse) => {
        let errorMsg = `Error al crear el caso "${testCase.titulo}".`;
        if (error.status === 404) {
          if (pbiId && pbiId > 0) {
            errorMsg = `El Work Item padre #${pbiId} no existe en Azure DevOps.`;
          } else {
            errorMsg = `No se encontró el tipo de Work Item 'Test Case' en el proyecto '${azureProject}'.`;
          }
        } else if (error.status === 401 || error.status === 203) {
          errorMsg = 'Personal Access Token (PAT) inválido o sin permisos para crear Work Items.';
        } else if (error.error?.message) {
          errorMsg = error.error.message;
        }
        return throwError(() => new Error(errorMsg));
      })
    );
  }

  /**
   * Creates a batch of selected Test Cases and links them to the PBI
   */
  createTestCasesBatch(pbiId: number, testCases: GeneratedTestCase[]): Observable<SyncResult> {
    const { azureProject, azureOrg } = this.configService.currentConfig();

    // 1. Si se especificó un ID de PBI padre, verificar primero si existe en Azure DevOps
    const verifyPbi$: Observable<PbiItem | null> = (pbiId && pbiId > 0)
      ? this.getPbi(pbiId).pipe(
          catchError((err: any) => {
            const detail = err.message || `El Work Item #${pbiId} no existe.`;
            return throwError(() => new Error(
              `No se pudo sincronizar: ${detail} Verifica el ID en el proyecto '${azureProject}' o déjalo vacío para crear los casos de prueba sin vincular a un padre.`
            ));
          })
        )
      : of(null);

    return verifyPbi$.pipe(
      switchMap(() => {
        const requests = testCases.map(tc =>
          this.createTestCase(pbiId, tc).pipe(
            map(res => ({
              success: true,
              id: res.id,
              url: res._links?.html?.href,
              error: null
            })),
            catchError((err: any) => of({
              success: false,
              id: null,
              url: null,
              error: err.message || 'Error al crear caso de prueba en Azure DevOps'
            }))
          )
        );

        return forkJoin(requests).pipe(
          switchMap(results => {
            const successfulIds = results
              .filter(r => r.success && r.id)
              .map(r => r.id as number);

            if (successfulIds.length === 0) {
              const firstError = results.find(r => r.error)?.error ||
                'No se pudo crear ningún caso de prueba en Azure DevOps.';
              return throwError(() => new Error(firstError));
            }

            return of({
              pbiId,
              project: azureProject || 'Azure DevOps',
              createdCount: successfulIds.length,
              testCaseIds: successfulIds,
              timestamp: new Date()
            });
          })
        );
      })
    );
  }

  /**
   * Converts steps into Microsoft.VSTS.TCM.Steps XML format with Action and Expected result for each step
   */
  private buildTcmStepsXml(testCase: GeneratedTestCase): string {
    let stepsInner = '';
    const pasos = testCase.pasos || [];

    pasos.forEach((pasoItem, index) => {
      const stepId = index + 2;
      let actionText = '';
      let expectedText = '';

      if (typeof pasoItem === 'string') {
        actionText = pasoItem;
        expectedText = index === pasos.length - 1
          ? (testCase.resultadoEsperado || 'Validación completada satisfactoriamente.')
          : `Verificar que la acción del paso #${index + 1} se ejecute correctamente según la especificación.`;
      } else if (pasoItem && typeof pasoItem === 'object') {
        actionText = pasoItem.accion || (pasoItem as any).action || `Paso #${index + 1}`;
        expectedText = pasoItem.resultadoEsperado || (pasoItem as any).expectedResult || testCase.resultadoEsperado || 'Verificación completada exitosamente.';
      }

      const stepAction = this.escapeXml(actionText);
      const stepExpected = this.escapeXml(expectedText);

      stepsInner += `
        <step id="${stepId}" type="ValidateStep">
          <parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;${stepAction}&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>
          <parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;${stepExpected}&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>
          <description/>
        </step>
      `;
    });

    return `<steps id="0" last="${pasos.length + 1}">${stepsInner}</steps>`;
  }

  private escapeXml(unsafe: string): string {
    return (unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Cleans raw Azure DevOps HTML content for legible UI display
   */
  private formatHtmlText(html: string): string {
    if (!html) return '';
    let text = html
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    return text;
  }
}
