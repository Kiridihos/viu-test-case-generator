import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ConfigService } from './config.service';
import { GeneratedTestCase, TestCaseStep } from '../models/test-case.model';
import { PbiItem } from '../models/pbi.model';

@Injectable({
  providedIn: 'root'
})
export class GeminiAiService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private getEndpoint(model: string, apiKey: string): string {
    let selectedModel = model || 'gemini-flash-latest';
    if (['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].includes(selectedModel)) {
      selectedModel = 'gemini-flash-latest';
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey.trim()}`;
  }

  /**
   * Tests connection to Google Gemini API
   */
  testConnection(): Observable<{ success: boolean; message: string }> {
    const { geminiApiKey, geminiModel } = this.configService.currentConfig();
    if (!geminiApiKey) {
      return of({
        success: false,
        message: 'No has ingresado la API Key de Google Gemini.'
      });
    }

    const url = this.getEndpoint(geminiModel, geminiApiKey);
    const testPayload = {
      contents: [
        {
          parts: [{ text: 'Responde {"status": "ok"} para verificar la conexión.' }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    };

    return this.http.post<any>(url, testPayload, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      map(() => ({
        success: true,
        message: `Conexión exitosa con Google Gemini (${geminiModel || 'gemini-2.5-flash'}).`
      })),
      catchError(err => {
        let msg = 'Error al verificar la conexión con Gemini.';
        if (err.status === 400 || err.status === 403) {
          msg = 'API Key de Gemini inválida o sin permisos para el modelo.';
        } else if (err.status === 404) {
          msg = `El modelo especificado (${geminiModel}) no se encuentra disponible.`;
        } else if (err.error?.error?.message) {
          msg = err.error.error.message;
        }
        return of({ success: false, message: msg });
      })
    );
  }

  /**
   * Generates comprehensive QA Test Cases based on PBI details
   */
  generateTestCases(pbi: PbiItem): Observable<GeneratedTestCase[]> {
    const { geminiApiKey, geminiModel } = this.configService.currentConfig();

    if (!geminiApiKey) {
      return throwError(() => new Error('Por favor configura tu API Key de Gemini en Parámetros del Sistema.'));
    }

    const url = this.getEndpoint(geminiModel, geminiApiKey);

    const systemPrompt = `
Eres un QA Automation Lead y Tester Senior experto en diseño de pruebas de software, ISTQB y Azure DevOps.
Tu misión es generar una suite completa y rigurosa de casos de prueba (Test Cases) para una Historia de Usuario.

REGLAS DE DISEÑO:
1. Genera entre 3 y 6 casos de prueba exhaustivos.
2. FORMATO 100% TRADICIONAL PASO A PASO:
   - TODOS los casos de prueba deben ser de tipo tradicional (Paso a Paso con Acción y Resultado Esperado).
   - Las acciones deben ser instrucciones operativas reales de un tester (ej: "1. Ingresar a...", "2. Seleccionar...", "3. Completar el campo con...", "4. Hacer clic en...").
3. Incluye una mezcla equilibrada de:
   - Flujos positivos / Happy Path.
   - Flujos alternativos, negativos y validación de reglas de negocio / casos de borde.
   - Manejo de excepciones, timeouts, validaciones de formato, límites y permisos.
4. Para cada caso de prueba, debes especificar obligatoriamente:
   - "titulo": Descripción clara, concisa, accionable y profesional del caso de prueba.
   - "precondiciones": Estado previo necesario del sistema y datos de prueba requeridos.
   - "pasos": Arreglo de pasos estructurados para Azure DevOps TCM.
     Cada paso en Azure DevOps tiene una columna de Acción (Action) y una columna de Resultado Esperado (Expected result).
     Por lo tanto, CADA PASO DEBE SER UN OBJETO con:
       * "accion": Instrucción clara de lo que el tester ejecuta en este paso (ej: "1. Acceder al módulo de checkout con artículos en el carrito.").
       * "resultadoEsperado": Lo que el sistema debe responder o lo que el tester debe verificar específicamente en este paso (ej: "Se despliega el resumen del pedido y los métodos de pago disponibles."). ¡NUNCA dejes un resultado esperado vacío!
   - "resultadoEsperado": Resumen del resultado esperado general o final del caso de prueba.
   - "esGherkin": false (siempre false, no usar BDD).

DEBES RETORNAR ÚNICAMENTE UN ARREGLO JSON VÁLIDO CON LA SIGUIENTE ESTRUCTURA EXACTA:
[
  {
    "titulo": "Validar procesamiento de pago mediante pasarela alternativa ante timeout de la principal",
    "precondiciones": "La pasarela primaria está caída o responde con timeout (> 5s). El carrito posee artículos válidos.",
    "pasos": [
      {
        "accion": "1. Acceder a la pantalla de checkout e intentar completar el pago con la pasarela primaria.",
        "resultadoEsperado": "El sistema detecta el timeout o fallo de la pasarela primaria en un tiempo máximo de 5 segundos."
      },
      {
        "accion": "2. Observar la pantalla y verificar la activación de la pasarela alternativa.",
        "resultadoEsperado": "Se muestra un mensaje informativo indicando el cambio y se despliega la pasarela secundaria sin recargar la página."
      },
      {
        "accion": "3. Ingresar datos válidos de pago en la pasarela alternativa y presionar 'Confirmar Pago'.",
        "resultadoEsperado": "La transacción es autorizada y procesada exitosamente en la pasarela secundaria."
      },
      {
        "accion": "4. Validar el estado final de la compra y redirección.",
        "resultadoEsperado": "Se redirige a la pantalla de confirmación con el número de orden generado y los productos del carrito intactos."
      }
    ],
    "resultadoEsperado": "La compra se completa exitosamente mediante la pasarela alternativa sin pérdida de datos del carrito.",
    "esGherkin": false
  }
]
No añadas texto introductorio ni formato markdown adicional fuera del JSON.
`;

    const userPrompt = `
HISTORIA DE USUARIO / PBI A ANALIZAR:
- ID: ${pbi.id || 'N/A'}
- Título: ${pbi.title}
- Descripción:
${pbi.description || 'Sin descripción provista'}

- Criterios de Aceptación:
${pbi.acceptanceCriteria || 'Sin criterios de aceptación provistos'}
`;

    const payload = {
      contents: [
        {
          parts: [
            { text: `${systemPrompt}\n\n${userPrompt}` }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.25
      }
    };

    return this.http.post<any>(url, payload, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    }).pipe(
      map(res => {
        try {
          const rawText = res.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
          const parsed = JSON.parse(rawText);
          if (!Array.isArray(parsed)) {
            throw new Error('La respuesta del modelo no es un arreglo de casos de prueba.');
          }

          return parsed.map((tc: any, index: number) => {
            const rawPasos = Array.isArray(tc.pasos) ? tc.pasos : [tc.pasos || ''];
            const fallbackExpected = tc.resultadoEsperado || 'Acción completada con éxito según lo esperado.';

            const normalizedSteps: TestCaseStep[] = rawPasos.map((p: any, pIdx: number) => {
              if (typeof p === 'string') {
                return {
                  accion: p,
                  resultadoEsperado: pIdx === rawPasos.length - 1
                    ? fallbackExpected
                    : `Verificar que la acción del paso #${pIdx + 1} se complete correctamente.`
                };
              }
              return {
                accion: p.accion || p.action || p.step || p.paso || `Paso #${pIdx + 1}`,
                resultadoEsperado: p.resultadoEsperado || p.expectedResult || p.expected || p.resultado ||
                  (pIdx === rawPasos.length - 1 ? fallbackExpected : `Verificación del paso #${pIdx + 1} completada exitosamente.`)
              };
            });

            return {
              id: 'tc-' + (index + 1) + '-' + Date.now().toString(36),
              titulo: tc.titulo || `Caso de Prueba #${index + 1}`,
              precondiciones: tc.precondiciones || '',
              pasos: normalizedSteps,
              resultadoEsperado: tc.resultadoEsperado || '',
              esGherkin: false,
              selected: true,
              synced: false
            };
          });
        } catch (parseError: any) {
          console.error('Error parseando JSON de Gemini:', parseError);
          throw new Error('No se pudo procesar la respuesta generada por Gemini.');
        }
      }),
      catchError(err => {
        let msg = 'Error al generar casos de prueba con Gemini.';
        if (err.status === 400 || err.status === 403) {
          msg = 'Error en API Key de Gemini: verifícala en Configuración.';
        } else if (err.error?.error?.message) {
          msg = err.error.error.message;
        } else if (err.message) {
          msg = err.message;
        }
        return throwError(() => new Error(msg));
      })
    );
  }
}
