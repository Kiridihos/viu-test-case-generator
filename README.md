# TestCase Generator — QA AI & Azure DevOps Suite

> Herramienta de Aseguramiento de Calidad (QA) basada en Inteligencia Artificial. Se conecta a **Azure DevOps REST API** para consultar Historias de Usuario (PBIs), genera suites completas de casos de prueba con **Google Gemini IA** (flujos positivos, alternativos y escenarios BDD Gherkin automatizables) y crea automáticamente los Work Items de tipo **Test Case** vinculados al PBI padre.

---

## Tabla de Contenidos
1. [Características Principales](#-características-principales)
2. [Arquitectura Tecnológica](#-arquitectura-tecnológica)
3. [Estructura del Proyecto](#-estructura-del-proyecto)
4. [Requisitos Previos](#-requisitos-previos)
5. [Instalación y Puesta en Marcha](#-instalación-y-puesta-en-marcha)
6. [Guía de Configuración](#-guía-de-configuración)
   - [Configuración de Firebase Auth](#1-configuración-de-firebase-authentication)
   - [Configuración de Azure DevOps](#2-configuración-de-azure-devops)
   - [Configuración de Google Gemini IA](#3-configuración-de-google-gemini-ia)
7. [Solución de Problemas Frecuentes (Troubleshooting)](#-solución-de-problemas-frecuentes)
8. [Comandos del Proyecto](#-comandos-del-proyecto)

---

## Características Principales

* **Integración Nativa con Azure DevOps REST API (v7.0):**
  * Consulta historias de usuario por ID numérico.
  * Limpieza automática de formato HTML enriquecido a texto legible.
  * Creación en lote de Work Items de tipo `Test Case` usando formato estándar `application/json-patch+json`.
  * Conversión de pasos al formato XML oficial de Azure Test Runner (`Microsoft.VSTS.TCM.Steps`).
  * Vinculación jerárquica inversa automática (`System.LinkTypes.Hierarchy-Reverse`) para relacionar los Test Cases al PBI padre.

* **Motor Generativo con Google Gemini IA:**
  * Cobertura de pruebas bajo estándares **ISTQB**:
    *  **Happy Path (Flujos Positivos):** Validación de caminos ideales.
    *  **Flujos Alternativos y Casos de Borde:** Errores de validación, timeouts y excepciones de negocio.
    * **BDD Gherkin Automatizable:** Escenarios estructurados en `Dado que / Cuando / Entonces` (**Given / When / Then**).
  * Salida forzada y estricta en JSON (`responseMimeType: "application/json"`).
  * Soporte para modelos de alta velocidad y razonamiento (`gemini-flash-latest`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`).

* **Autenticación y Seguridad (Firebase):**
  * SDK modular de Firebase Authentication.
  * Protección de rutas con Angular Functional Guard (`authGuard`).
  * Perfil de usuario dinámico (Nombre, Correo y Rol QA) desplegado en el Sidebar.
  * Modo de demostración para pruebas inmediatas sin requerir consola activa de Firebase.

---

## Arquitectura Tecnológica

| Componente | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Framework Web** | Angular 21 | Aplicación SPA |
| **Autenticación** | Firebase Authentication Web SDK | Inicio de sesión con correo y contraseña |
| **Gestor de Pruebas** | Azure DevOps REST API v7.0 | Consulta de PBIs y persistencia de Test Cases |
| **Inteligencia Artificial**| Google Gemini REST API | Modelos generativos

---

## Estructura del Proyecto

```text
src/
├── app/
│   ├── core/                           # Servicios singleton, modelos y guardias
│   │   ├── guards/
│   │   │   └── auth.guard.ts           # Protección de rutas privadas (/dashboard, /settings)
│   │   ├── models/
│   │   │   ├── config.model.ts         # Tipos para Azure DevOps y Gemini
│   │   │   ├── pbi.model.ts            # Estructura del Product Backlog Item
│   │   │   ├── test-case.model.ts      # Estructura del caso de prueba y sync
│   │   │   └── user.model.ts           # Perfil de usuario QA
│   │   └── services/
│   │       ├── auth.service.ts         # Integración Firebase Auth y sesión local
│   │       ├── azure-devops.service.ts # Consultas, TCM XML y creación de Test Cases
│   │       ├── config.service.ts       # Persistencia en localStorage con Signals
│   │       └── gemini-ai.service.ts    # Prompting de QA y llamada a Gemini API
│   ├── features/                       # Vistas principales de la aplicación
│   │   ├── auth/                       # Pantalla de Login (Layout split 50/50)
│   │   │   ├── login.component.ts
│   │   │   ├── login.component.html
│   │   │   └── login.component.scss
│   │   ├── dashboard/                  # Generador principal con IA (3 columnas)
│   │   │   ├── dashboard.component.ts
│   │   │   ├── dashboard.component.html
│   │   │   └── dashboard.component.scss
│   │   └── settings/                   # Parámetros del sistema y prueba de conexiones
│   │       ├── settings.component.ts
│   │       ├── settings.component.html
│   │       └── settings.component.scss
│   ├── shared/
│   │   └── components/
│   │       └── sync-modal/             # Modal de confirmación tras sincronización
│   │           ├── sync-modal.component.ts
│   │           ├── sync-modal.component.html
│   │           └── sync-modal.component.scss
│   ├── app.routes.ts                   # Enrutamiento de la aplicación
│   ├── app.config.ts                   # Proveedores globales (Router, HttpClient withFetch)
│   ├── app.component.ts                # Contenedor raíz
│   └── app.component.html
├── environments/
│   ├── environment.ts                  # Variables de entorno (Producción)
│   └── environment.development.ts      # Variables de entorno (Desarrollo)
├── styles/
│   ├── _variables.scss                 # Tokens de color, tipografía, sombras y radios
│   ├── _mixins.scss                    # Utilidades de layout, superficies y botones
│   └── _reset.scss                     # Reset CSS moderno
└── styles.scss                         # Estilos globales y fuentes de Google
```

---

## Requisitos Previos

Antes de ejecutar el proyecto, asegúrate de contar con:

1. **Node.js**: Versión `v18.19.0` o superior 
2. **NPM**: Versión `9` o superior.
3. **Personal Access Token (PAT) de Azure DevOps**:
   * Token generado en `https://dev.azure.com/{tu-organizacion}/_usersSettings/tokens`.
4. **Google Gemini API Key**:
   * Obtenida gratuitamente en [Google AI Studio](https://aistudio.google.com/).

---

## Instalación y Puesta en Marcha

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Kiridihos/TestCaseGenerator-Angular.git
   cd TestCaseGenerator-Angular
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Iniciar el servidor de desarrollo:**
   ```bash
   npm start
   ```

4. **Abrir en el navegador:**
   Navega a `http://localhost:4200/`.

---

## Guía de Configuración

### 1. Configuración de Firebase Authentication
Si vas a utilizar autenticación real con tu propio proyecto de Firebase, edita los archivos [environment.development.ts]() y [environment.ts]():

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: "AIzaSyTuClaveRealDeFirebase...",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef..."
  }
};
```
> **Nota:** Si dejas las claves por defecto, la aplicación habilitará de forma automatica el **modo Demo**, permitiendo iniciar sesión inmediatamente con cualquier correo o mediante el botón *"Autocompletar credenciales"*.

### 2. Configuración de Azure DevOps
Desde la pantalla **Parámetros del Sistema** (`/settings`):
* **Organización:** Nombre que aparece en la URL de tu Azure DevOps (ejemplo: si la URL es `https://dev.azure.com/mi-proyecto`, ingresa `mi-proyecto`).
* **Nombre del Proyecto:** Nombre exacto del proyecto donde residen los PBIs (ej: `Universidad-VIU` o `Soporte-TI`).
* **Personal Access Token:** El token secreto con permisos de lectura y escritura en Work Items.
* Presiona **"Probar Conexión Azure DevOps"** para verificar el acceso.

### 3. Configuración de Google Gemini IA
Desde la misma pantalla (`/settings`):
* **Gemini API Key:** Pega tu clave de API generada en Google AI Studio.
* **Modelo Generativo:** Selecciona **`Gemini Flash (Última versión - Recomendado)`** (`gemini-flash-latest`) o **`Gemini 3.5 Flash Lite`**.
* Presiona **"Probar Conexión Gemini IA"**.

---

## Comandos del Proyecto

| Comando | Descripción |
| :--- | :--- |
| `npm start` | Inicia el servidor de desarrollo local en `http://localhost:4200/` con recarga automática. |
| `npm run build` | Compila la aplicación para producción en la carpeta `dist/`. |
| `npm run watch` | Compila en modo desarrollo observando cambios de archivos. |
| `npm test` | Ejecuta las pruebas unitarias del proyecto con Vitest. |

---

## Licencia y Créditos
Desarrollado como como trabajo de fin de master para la universidad internacional de valencia VIU. El uso de este software esta permitido tanto para fines academicos como para fines comerciales. El autor del software no se hace responsable del mal uso que se le pueda dar al mismo.
