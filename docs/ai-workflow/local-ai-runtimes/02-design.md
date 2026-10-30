# Plan de implementación: usar Claude Code y OpenCode instalados localmente

Fecha: 2026-10-29  
Estado: propuesta técnica revisada con comentarios del usuario; alcance ampliado a Chat, Jira y runner. Pendiente de elección técnica antes de implementar.  
Proyecto: Agent Tester (`snake`).

## 1. Objetivo y alcance

Permitir elegir qué runtime y modelo utilizar en el chat, el análisis/generación de casos de Jira y la ejecución del runner de Agent Tester. Las alternativas deben incluir OpenRouter y las instalaciones locales de Claude Code y OpenCode, aprovechando la autenticación que cada herramienta administra, como hace OpenDesign.

«Local» describe dónde corre el CLI y dónde reside su configuración. No implica que los pesos del modelo estén descargados ni que la inferencia sea offline: Claude normalmente usa un servicio remoto; OpenCode puede usar proveedores remotos o un servidor de inferencia local.

El primer corte verificable será: API ejecutándose en Windows, PostgreSQL en Docker, chat con Claude Code autenticado localmente sin `ANTHROPIC_API_KEY` de Agent Tester, y chat con el servidor OpenCode del mismo usuario. Ambos deben usar las herramientas MCP de Agent Tester y conservar sus sesiones.

Ese corte es una primera demostración, no el alcance completo: el cambio termina cuando también se puede analizar Jira y ejecutar un caso con OpenRouter, OpenCode o Claude según la selección. Para el runner, OpenRouter con `OPENROUTER_API_KEY` (o el alias existente `API_KEY`) será el predeterminado en instalaciones nuevas. Las configuraciones explícitas existentes, como `E2E_BASE_URL`, se conservan.

### Dentro del alcance

- Detección de los runtimes instalados, diagnóstico de conexión/autenticación y selección de modelos.
- Adaptador Claude CLI, reutilización del servidor OpenCode local y compatibilidad con las integraciones existentes.
- Streaming, sesiones, cancelación y herramientas MCP del chat.
- Selección de runtime/modelo por uso: Chat, Jira y runner; posibilidad de aplicar una selección común a los tres mediante una acción explícita.
- Adaptación del análisis Jira a generación estructurada con cualquiera de los tres runtimes.
- Adaptación real del consumo de modelos del runner para usar Claude/OpenCode, incluyendo herramientas, resultados de herramientas y visión cuando el caso la requiera.
- Preferencias persistidas en servidor, overrides por operación y snapshot de la selección efectiva al encolar cada run.
- Configuración, pruebas y documentación para Windows y para el modo Docker existente.

### Límites de este cambio

- Cambiar el runtime/modelo de Jira o del runner debe ser posible desde la interfaz y efectivo en el backend; no basta con mostrar opciones de chat.
- Ejecutar Claude/OpenCode localmente no los convierte automáticamente en endpoints OpenAI-compatible. Implementar un adaptador de modelo para el runner, con contrato de herramientas y contenido multimodal; ver sección 4.
- Incorporar las migraciones mínimas necesarias para preferencias y trazabilidad de IA, conservando casos y runs existentes.
- La validación inicial utilizará API/frontend en Windows y PostgreSQL en Docker; así se comprueban los CLIs del host desde la primera iteración sin un puente. El puente backend Docker → CLIs Windows es una ampliación de despliegue posterior, no un requisito para comprobar Chat, Jira y runner en el host. Ver el procedimiento de la sección 6.
- Laya/Jev conserva su modelo decisor propio: mostrarlo y configurarlo como tal, sin afirmar que cambiar el orquestador Claude/OpenCode cambia el decisor interno. Este plan garantiza las alternativas pedidas en el runner E2E; cualquier sustitución del decisor de Laya requerirá soporte de su protocolo y pruebas específicas.

## 2. Evidencia del estado actual

| Evidencia | Hallazgo |
| --- | --- |
| `server/api/src/ai.ts`, `getAiCatalog()` | OpenCode consulta `/agent` y `/config/providers`; Claude se considera disponible únicamente si existe `ANTHROPIC_API_KEY`. |
| `server/api/src/ai.ts`, `openCodeChat()` | Ya crea/reutiliza sesiones, registra MCP y consume eventos del servidor OpenCode. |
| `server/api/src/ai.ts`, `claudeChat()` | Usa `@anthropic-ai/claude-agent-sdk`, carga configuración user/project/local y pasa `CLAUDE_CODE_OAUTH_TOKEN: undefined` al proceso. |
| `server/.mcp.json` | Configuración MCP basada en `bun` y rutas relativas; presupone mismo host y directorio adecuados. |
| `server/api/src/chat.ts` | Despacha por runtime y ya ofrece un proveedor directo OpenRouter. |
| `server/api/src/index.ts`, ruta Jira `.../analyze` | Usa `generateText` con `createModel("chat")` y valida la salida con `JiraAnalysis`; hoy no recibe selección propia. |
| `server/core/src/model.ts` y `server/runner/e2e.config.ts` | El runner consume un modelo AI SDK, actualmente OpenRouter o un endpoint OpenAI-compatible. Un CLI no es intercambiable sin adaptación. |
| `server/core/src/runner.ts` | Congela `ai_snapshot`, pero la ejecución toma configuración del entorno; se debe pasar la selección congelada al proceso hijo y actualizar la deduplicación de runs. |
| `client/src/data/api.ts` | Hay contrato de catálogo, selección y eventos SSE que conviene extender sin romper. |
| `client/src/data/model.ts` y `client/src/routes/WorkspacePages.tsx` | Runtime, agente, modelo y sesión se guardan en el navegador. |
| `server/docker-compose.yml` y `server/package.json` | Docker inicia su propio OpenCode, fija `OPENCODE_BASE_URL` y usa configuración/auth dentro de Linux; no reutiliza automáticamente la instalación Windows. |
| Comprobación del PATH durante la revisión | Se encontraron `C:\Users\franc\.local\bin\claude.exe` y `C:\Users\franc\AppData\Roaming\npm\opencode.ps1`. |

### Referencia OpenDesign inspeccionada

Repositorio local de referencia: `C:\Users\franc\Documents\open-design`.

- `apps/daemon/src/runtimes/detection.ts`: resuelve ejecutables, consulta versión/capacidades y descubre modelos cuando el CLI lo permite.
- `apps/daemon/src/runtimes/defs/claude.ts`: utiliza `claude -p --output-format stream-json --verbose`, envía el prompt por stdin y ofrece aliases cuando no hay listado de modelos.
- `apps/daemon/src/runtimes/defs/opencode.ts`: obtiene modelos con `opencode models` y ejecuta `opencode run --format json ... -`.
- `apps/daemon/src/runtimes/invocation.ts`: encapsula invocación de procesos y tratamiento de Windows.

Tomar como referencia la detección y los protocolos estructurados. No copiar automáticamente sus flags de omisión de permisos.

### Incertidumbres que deben cerrarse primero

- No se ejecutó una generación real para comprobar la vigencia de los logins locales.
- No se verificaron las versiones ni los flags efectivos de los CLIs instalados.
- Eliminar el gate de API key o dejar de limpiar una variable OAuth no demuestra que el SDK pueda usar el login local. El SDK y el CLI deben evaluarse con evidencia real y documentación vigente de autenticación aplicable.
- No se inspeccionaron credenciales privadas; el plan no necesita leerlas, copiarlas ni exponerlas.
- El catálogo actual enumera configuración, no garantiza permiso de acceso a cada modelo ni validez de autenticación.

## 3. Alternativas y recomendación

| Opción | Costo y simplicidad | Mantenimiento y compatibilidad | Autenticación y permisos | Complejidad de pruebas / reversibilidad |
| --- | --- | --- | --- | --- |
| A. Ajustar solo Claude Agent SDK | Bajo si la versión soporta el login deseado; requiere validación previa. | Menor cambio; conserva el SDK existente. Dependiente de su soporte de autenticación y selección de ejecutable. | No extraer tokens; usar únicamente mecanismos soportados. | Prueba real indispensable; rollback sencillo. |
| B. Claude CLI local + OpenCode HTTP existente | Medio; un adaptador nuevo y ajustes acotados al catálogo. | Aprovecha el CLI instalado para Claude y conserva sesiones/HTTP de OpenCode. | Cada runtime administra su login. Restricción explícita de herramientas del chat. | Parser/procesos requieren pruebas; transporte seleccionable permite rollback. |
| C. Spawn directo de ambos CLIs, como OpenDesign | Medio/alto; dos adaptadores de procesos. | Arquitectura simétrica, pero reemplaza una integración OpenCode ya existente y exige rehacer su ciclo de sesión/eventos. | Reutiliza contexto del usuario host; misma necesidad de limitar herramientas. | Mayor matriz de compatibilidad y regresiones. |

**Recomendación: B, con una capa compartida de IA para los tres usos.** Implementar Claude CLI como nuevo transporte y mantener OpenCode HTTP apuntando al servidor del usuario en Windows. Reutilizar ambos adaptadores para chat, generación estructurada Jira y el contrato de modelo del runner. La tabla compara transportes; ninguna alternativa elimina el requisito de selector efectivo para Jira/runner. Si la fase de validación demuestra que A satisface todos los criterios con soporte vigente, documentar ese resultado y reevaluar la elección antes de desarrollar el adaptador CLI.

**Decisión humana:** pendiente. Solicitar el plan no implica que una de las alternativas esté aprobada para implementación.

## 4. Arquitectura propuesta

```text
Navegador
  -> GET /api/ai/catalog
  -> Settings: preferencias por uso (Chat / Jira / runner)
  -> Chat: selección + sesión -> stream de conversación
  -> Jira: selección -> generación estructurada -> validación JiraAnalysis
  -> Run: selección -> snapshot inmutable -> cola -> modelo AI SDK adaptado
       -> resolvedor compartido de selección y capacidades
            -> OpenRouter / endpoint compatible existente
            -> Claude CLI host -> stdin / JSON por líneas
            -> OpenCode HTTP host -> sesiones / SSE
            -> Claude SDK, cuando se seleccione ese transporte

Chat Claude / OpenCode -> MCP Agent Tester -> API -> PostgreSQL / cola de runs
Runner -> herramientas browser del motor -> observaciones/resultados -> modelo seleccionado
```

### Selección por uso y precedencia

- Definir `AiUsage = chat | jira | runner` y `AiSelection` con runtime, modelo, agente opcional y transporte cuando corresponda.
- Settings ofrece tres selectores independientes y una acción «Aplicar esta selección a todos». Jira y el diálogo de ejecución permiten override para esa operación.
- Resolver: override explícito de operación → preferencia persistida del workspace para ese uso → configuración previa del entorno → default de instalación. El entorno fija credenciales/endpoints y restricciones operativas; un usuario no puede enviar secretos o comandos arbitrarios en la selección.
- Runner nuevo: `native`/OpenRouter por defecto. Sin clave, mostrar cómo configurarla o seleccionar Claude/OpenCode; nunca cambiar de proveedor silenciosamente. Preservar endpoints compatibles previamente configurados.
- Guardar preferencias en servidor mediante un recurso de configuración IA por workspace; las preferencias en localStorage no bastan para runs iniciados por MCP o tras recargar la API.
- Contrato propuesto: `GET/PUT /api/workspaces/:wid/ai/preferences` con selecciones `chat`, `jira` y `runner`; cuerpos de análisis y de inicio de run aceptan `selection` opcional. Actualizar schemas, cliente y MCP juntos, manteniendo compatibles las peticiones antiguas sin ese campo.
- Fijar la selección al iniciar cada operación. Cambiar Settings no modifica análisis en curso ni runs encolados. El chat conserva su selección/sesión o inicia nueva conversación al cambiar de runtime/transporte.
- Las llamadas MCP `run_test` deben usar la preferencia del runner o un override explícito, no heredar accidentalmente el modelo de la conversación que las inició.

### Análisis Jira con selección efectiva

- Extender la ruta `.../jira/issues/:key/analyze` para aceptar una selección opcional y resolver la preferencia Jira en el backend.
- Usar un contrato compartido `generateStructured`: instrucción + ticket no confiable + esquema esperado + selección + señal de cancelación.
- Invocar el modelo elegido sin herramientas de escritura ni acceso MCP innecesario. Validar JSON y `JiraAnalysis` antes de aceptar documentación/sugerencias.
- Una respuesta textual inválida o un error de login debe producir error visible; no recurrir a OpenRouter ni devolver ejemplos simulados.
- Devolver metadatos de runtime/modelo solicitado y efectivo cuando sea observable, para comprobar el selector desde la primera prueba Jira.

### Runner: adaptación de modelo, no solo cambio de etiqueta

El motor actual usa `agent.act`/`agent.assert` sobre un modelo AI SDK. La integración propuesta es un adaptador al contrato `LanguageModel` de la versión instalada, manteniendo el motor de navegador y su reporte por paso:

1. OpenRouter conserva su proveedor AI SDK actual.
2. Para Claude/OpenCode, traducir mensajes, esquemas de herramientas, resultados, opciones de salida y contenido multimodal al protocolo soportado por el runtime; normalizar generación y streaming al contrato que consume `e2e`.
3. El motor E2E conserva la ejecución de herramientas browser. El runtime pide herramientas de ese motor y recibe sus resultados; no ejecuta en paralelo su propio navegador ni se llama recursivamente a `run_test`.
4. Validar en la fase 0 si cada runtime puede exponer fielmente tool calls sin ejecutarlas por su cuenta. Si requiere un puente MCP por run para las herramientas del motor, comprobar que el motor permita registrarlas y mapear resultados. Ese puente de herramientas no es el daemon Windows/Docker.
5. Verificar soporte de imágenes, ciclos de herramientas y cancelación con las versiones reales. No reducir screenshots a texto ni considerar implementado el runner por una respuesta de texto correcta.
6. Si el motor no admite esta adaptación, registrar la evidencia y diseñar dentro de este alcance un ejecutor agentic alternativo sobre herramientas browser controladas, con el mismo contrato `StepResult`/`RunSummary`, artifacts y estados. Elegirlo explícitamente antes de esa fase; no retirar Claude/OpenCode del alcance ni prometer que un proxy HTTP trivial lo soluciona.
7. Congelar selección/capacidades al encolar, pasar configuración por run al proceso hijo sin mutar `process.env` global y distinguir solicitudes activas con configuración diferente. Definir compatibilidad de Replay Cache por runtime/modelo para evitar reutilizar resultados de otro modelo en pruebas de validación.
8. Extender `ai_snapshot` con runtime, transporte, modelo solicitado y efectivo cuando se conozca. Distinguir «runtime en el host» de «inferencia local»; no afirmar que Claude es offline por tener CLI local.

**Decisión de viabilidad obligatoria:** elegir el mecanismo de integración del runner al final de la fase 0. El cambio completo no se considera terminado hasta ejecutar casos y aserciones reales con los tres runtimes.

### Módulos y responsabilidades

Archivos previstos; confirmar nombres finales contra los patrones del repositorio al implementar:

| Archivo | Responsabilidad |
| --- | --- |
| `server/api/src/ai.ts` | Fachada de catálogo y despacho; extraer responsabilidades progresivamente. |
| `server/core/src/ai/runtime-types.ts` | Contratos compartidos de selección, usos, capacidades, generación y eventos; no importar desde API hacia core. |
| `server/core/src/ai/local-process.ts` | Resolución de binario, spawn, stdin, límites, cancelación y cleanup en Windows/Linux. |
| `server/core/src/ai/claude-cli.ts` | Flags compatibles, sesión, modelo/agente, políticas por uso y normalización del stream Claude. |
| `server/core/src/ai/opencode-http.ts` | Extraer integración actual y explicitar su directorio/contexto de proyecto y políticas por uso. |
| `server/core/src/ai/catalog.ts` | Detección, cache corta, diagnósticos y capacidades por uso/modelo sin credenciales. |
| `server/core/src/ai/selection.ts` y `preferences.ts` | Resolución de defaults/overrides y persistencia de preferencias por workspace. |
| `server/core/src/ai/structured.ts` y `sdk-model.ts` | Generación estructurada Jira y adaptación al contrato de modelo AI SDK del runner. |
| `server/core/src/model.ts`, `runner.ts` y `server/runner/e2e.config.ts` | Selección efectiva por run, integración de modelo y configuración del proceso hijo. |
| `server/core/src/schema.ts`, `api.ts`, `tools.ts` y `server/mcp/src/server.ts` | Contratos de selección de run, snapshot y compatibilidad MCP. |
| `server/core/migrations/<siguiente>_ai_preferences.sql` | Migración aditiva de preferencias; revisar si extender el JSON existente de snapshots basta para runs. |
| `server/api/src/chat.ts` y `server/api/src/index.ts` | Validar selección, propagar abort y conservar contrato de chat. |
| `client/src/data/api.ts` y `client/src/data/model.ts` | Extender tipos y compatibilidad con preferencias/conversaciones anteriores. |
| `client/src/routes/WorkspacePages.tsx`, `client/src/routes/JiraGeneratePage.tsx` y `client/src/components/RunExecutionDialog.tsx` | Selectores por uso/operación y diagnóstico de runtime, modelo y ubicación efectivos. |
| `server/.env.example`, `server/package.json`, `server/docker-compose.yml` | Configuración explícita y comandos de arranque. |
| `README.md` y `DECISIONS.md` | Instrucciones y decisión arquitectónica finalmente adoptada. |

### Contratos de catálogo y selección

- Mantener los IDs públicos `native`, `opencode` y `claude`.
- Enumerar modelos OpenRouter para los tres usos mediante catálogo consultable/cacheado o IDs personalizados validados, no restringir la selección al único `CHAT_MODEL`/`E2E_MODEL` actual.
- Exponer capacidades por uso/modelo: texto, JSON validable, streaming, herramientas y visión. No anunciar soporte del runner a partir de un probe de chat; la adaptación runner de ambos runtimes forma parte de la entrega.
- Agregar metadatos opcionales por runtime: transporte, estado y razón legible del diagnóstico.
- Estados propuestos: `not-installed`, `detected`, `ready`, `auth-required`, `unreachable`, `unsupported` y `error`.
- Definir `available` junto a capacidades/estado por uso: estar listo para chat no acredita estar listo para Jira o runner. Encontrar el ejecutable solo significa `detected`, no login válido.
- Si el CLI tiene una consulta de estado de auth soportada, usarla sin devolver secretos. De lo contrario, ofrecer una prueba de conexión explícita y de bajo consumo; no generar texto facturable automáticamente al cargar Settings.
- Versionar/inutilizar el resultado de esa prueba al cambiar transporte, configuración o contexto relevante; no presentarlo como garantía permanente.
- Indicar si cada modelo fue descubierto o es un alias orientativo. Claude no debe afirmar que sus aliases constituyen un inventario de modelos instalados.
- Conservar `sessionId` y asociar la conversación al transporte que lo produjo. Un cambio de SDK a CLI exige conversación nueva salvo compatibilidad demostrada; no reenviar IDs a otro transporte por suposición.
- Mantener los eventos `session-info`, `text-delta`, `tool-input-available`, `tool-output-available`, `tool-output-error`, `error` y `finish`.
- Garantizar orden y terminalidad: un único `finish` por stream; un error puede precederlo. Diferenciar cancelación de éxito y no ocultar un exit code fallido.

### Configuración propuesta

- `CLAUDE_TRANSPORT=sdk|cli`: selector explícito; conservar SDK como valor inicial de compatibilidad hasta completar validación.
- `CLAUDE_CLI_PATH`: ruta opcional al ejecutable; sin valor, resolver desde PATH.
- `CLAUDE_CONFIG_DIR`: conservar su soporte y pasarlo de forma consistente al runtime.
- `OPENCODE_BASE_URL`, `OPENCODE_SERVER_USERNAME` y `OPENCODE_SERVER_PASSWORD`: conservar configuración existente.
- `OPENROUTER_API_KEY`/`API_KEY`, `CHAT_MODEL`, `E2E_MODEL`, `E2E_BASE_URL` y `E2E_API_KEY`: conservar defaults y credenciales existentes. Las preferencias por uso y overrides deben transmitirse explícitamente a la operación, sin editar el `.env` para cada selección.
- No introducir el directorio personal de este equipo como valor hardcodeado.
- Detectar flags con versión/help y usar argumentos separados; no construir comandos concatenando entradas del usuario.
- Preferir `.exe` o una invocación Node resoluble en Windows; tratar `.cmd`/`.ps1` con una estrategia explícita y probada, sin asumir que `spawn` los ejecuta directamente.

## 5. Restricciones de integración que deben resolverse

### Autenticación

El modo CLI debe dejar al propio Claude Code utilizar su mecanismo de login soportado, bajo el mismo usuario del sistema operativo. No leer archivos privados de tokens ni sincronizarlos con el navegador o PostgreSQL. No inyectar una API key alternativa silenciosamente: mostrar qué modo se eligió y reportar errores reales de login. Verificar el soporte vigente de esta forma de invocación antes de declararla compatible.

### MCP y permisos

- Construir la configuración MCP de Agent Tester desde rutas absolutas al runtime Bun y al entrypoint, con `cwd` y `SERVER_URL` explícitos.
- Verificar qué flags/configuración permite el Claude instalado para registrar MCP y restringir herramientas. Si no existen capacidades suficientes, reportar incompatibilidad en lugar de habilitar permisos globales.
- Mantener el alcance funcional del chat: herramientas QA autorizadas, sin activar `bypassPermissions` o `dangerously-skip-permissions` globalmente.
- Resolver solicitudes de permiso en modo headless con denegación controlada y error claro; nunca dejar un proceso esperando entrada interactiva indefinidamente.
- Revisar la configuración MCP heredada de usuario/proyecto para que los permisos efectivos no excedan la política del chat.

### OpenCode host y rutas

La integración existente registra MCP usando rutas y `process.execPath` del proceso API. Funciona cuando API y OpenCode comparten host/filesystem; no basta cambiar la URL si uno corre en Docker y otro en Windows. Especificar el directorio del proyecto en las peticiones según el contrato de la versión instalada para cargar sus agentes/configuración correctos. Aislar eventos por sesión y cerrar la suscripción cuando termina el turno.

### Procesos y streams

- Prompt por stdin, incluyendo prompts largos y Unicode; cerrar stdin después de escribir.
- Parsear JSON por líneas incrementalmente, conservando fragmentos UTF-8 y líneas entre chunks.
- Separar stderr de stdout, limitar memoria y redactar datos sensibles en diagnósticos.
- Propagar abort del cliente, cerrar lectores y finalizar el árbol de procesos que pertenece al adaptador; probar específicamente Windows.
- Timeout configurable con error explícito y liberación de recursos; no confundir timeout con respuesta final exitosa.

## 6. Despliegue y compatibilidad

### Cómo comprobar las primeras iteraciones sin puente Docker → Windows

La API no necesita correr en Docker para conectarse a PostgreSQL Docker. Al correr API y CLIs bajo el mismo usuario Windows, ambos ven los ejecutables, rutas y logins del host. Es la modalidad de prueba recomendada desde la fase 0 y permite validar Chat, Jira y runner sin esperar al daemon host.

Desde la raíz del repositorio, usar terminales PowerShell separadas:

```powershell
# Terminal 1: en una instalación de prueba, arrancar solo la base.
# Si ya está levantado el stack completo, detener sus servicios server/client
# antes de iniciar procesos host que usan los mismos puertos.
docker compose -f server/docker-compose.yml stop server client
docker compose -f server/docker-compose.yml up -d db

# Terminal 2: confirmar la instalación y arrancar OpenCode en el proyecto.
claude --version
opencode --version
Set-Location server
opencode serve --hostname 127.0.0.1 --port 4096

# Terminal 3: API + demo-shop en Windows.
Set-Location server
bun install
# Configurar server/.env según .env.example antes del primer arranque.
bun run dev

# Terminal 4: frontend en Windows.
Set-Location client
bun install
bun run dev
```

En `server/.env`, usar `DATABASE_URL` apuntando a `127.0.0.1:5432` con las credenciales reales de la DB de prueba y `OPENCODE_BASE_URL=http://127.0.0.1:4096`. Tras implementar el adaptador, seleccionar `CLAUDE_TRANSPORT=cli`. No configurar una API key Anthropic para la prueba específica de reutilización del login CLI. Mantener OpenRouter configurado para verificar el default del runner y comparar con las alternativas. La integración Jira requiere su conexión TEST ya configurada; no inventar tickets para simularla.

Los comandos son el procedimiento de validación previsto; no se ejecutaron como parte de esta revisión del plan. PostgreSQL debe ser una instancia/base de prueba dedicada si las migraciones o datos de prueba no pueden aplicarse al entorno actual.

| Iteración | Comprobación observable desde `http://localhost:5173` | Qué demuestra |
| --- | --- | --- |
| Fase 0 | Versiones, `/api/health`, prueba mínima de autenticación y experimento herramientas/visión del runner. | Viabilidad de host/auth y elección realista del adaptador runner. |
| Fases 1–2 | Enviar dos turnos por Claude/OpenCode y modificar un caso temporal vía MCP. | Login reutilizado, sesiones, streaming y herramientas del chat. |
| Fase 3 | Analizar el mismo ticket TEST con OpenRouter, Claude y OpenCode seleccionados. | El selector Jira cambia el runtime real; salida validada y metadatos comprobables. |
| Fase 4 | Ejecutar el mismo caso demo-shop con default OpenRouter y overrides Claude/OpenCode; incluir acción browser, aserción y caso negativo. | Cambia el modelo del runner que decide/valida; no solo el modelo que escribió los pasos. |
| Fase 5 | Cambiar Settings, recargar, iniciar desde MCP y revisar snapshots de runs encolados. | Persistencia, precedencia y aislamiento de la selección. |

Usar registros redactados de invocación y snapshots para verificar runtime/modelo. Una respuesta que diga «soy Claude» no es evidencia suficiente. Para la prueba de ejecución, evitar hits de Replay Cache de runs anteriores según la estrategia definida en fase 4.

### Stack completamente Docker

Conservar su funcionamiento actual: OpenCode dentro del contenedor con sus propias credenciales y Claude SDK con su configuración compatible. Mostrar que esa instalación es diferente de la del host. Un contenedor Linux no puede ejecutar `claude.exe` de Windows ni heredar automáticamente sus sesiones autenticadas.

Si posteriormente se necesita que el frontend/backend Docker utilicen los CLIs de Windows, diseñar un daemon host autenticado que gestione procesos, MCP y streams. Ese trabajo debe incluir direcciones alcanzables entre host/contenedor y pruebas de cancelación; `host.docker.internal` resuelve conectividad, no traduce rutas ni ejecutables.

## 7. Plan por incrementos

### Fase 0 — Validar viabilidad y elegir alternativa

- Consultar versiones/help de las instalaciones existentes y registrar capacidades efectivas.
- Comprobar el mecanismo soportado de autenticación no interactiva de Claude CLI/SDK.
- Con aprobación para una llamada real, hacer un prompt mínimo por el CLI bajo el usuario actual sin añadir una API key de Agent Tester; no imprimir credenciales ni modificar su configuración persistente.
- Comprobar que el modelo predeterminado de OpenCode puede responder usando su servidor host.
- Ejecutar un experimento acotado con el contrato AI SDK del motor: tool call → ejecución browser controlada → resultado → siguiente decisión, más una observación con imagen. Probarlo en Claude y OpenCode y registrar qué adaptación necesitan.
- Elegir el mecanismo del runner: adaptador `LanguageModel` preferido o ejecutor agentic con equivalencia de resultados si la librería impide la adaptación. La autenticación correcta del chat no cierra esta prueba.
- Registrar resultados y elegir A, B o C. Si falla el login, conservar el diagnóstico; no afirmar soporte por el solo hecho de detectar el binario.

**Salida:** enfoque de transporte y mecanismo runner elegidos, con prueba reproducible y límites conocidos; bloqueos documentados antes de prometer integración completa.

### Fase 1 — Adaptador Claude mínimo, extremo a extremo

- Implementar resolución de ejecutable, spawn por stdin y parser estructurado.
- Exponer transporte CLI mediante configuración explícita.
- Integrar texto, errores y sesión al SSE existente.
- Probar un turno y un segundo turno que requiera recordar el anterior.

**Salida:** conversación real con Claude local usando su login soportado.

### Fase 2 — Herramientas QA y ciclo de vida

- Registrar MCP de Agent Tester con rutas/contexto explícitos.
- Aplicar restricciones de herramientas y manejar permisos sin interacción bloqueante.
- Probar consulta/edición de un caso temporal y ejecución contra demo-shop con el runner configurado.
- Implementar cancelación, timeout, cleanup, errores y aislamiento entre conversaciones concurrentes.

**Salida:** chat capaz de operar casos a través de MCP, sin procesos huérfanos.

### Fase 3 — Selección compartida, catálogo y análisis Jira

- Agregar detección, capacidades, cache y estados de disponibilidad.
- Mantener OpenCode HTTP, verificando contexto de proyecto, sesión y MCP host.
- Distinguir agentes/modelos descubiertos de opciones orientativas.
- Evitar volver a consultar todo el catálogo de runtimes para validar cada envío cuando existe información válida reciente.
- Implementar persistencia por uso/workspace y resolución de defaults/overrides.
- Extender Jira Analyze y el selector de su pantalla; reutilizar adaptadores sin herramientas de escritura y validar `JiraAnalysis`.
- Analizar un ticket TEST con cada runtime y comprobar JSON, metadatos y errores sin fallback silencioso.

**Salida:** catálogo compartido y análisis Jira ejecutado con runtime/modelo seleccionables.

### Fase 4 — Runner con OpenRouter, OpenCode y Claude

- Implementar la adaptación elegida en fase 0 para llamadas de modelo reales del motor, incluyendo herramientas/resultados, observaciones multimodales y cancelación.
- Conservar OpenRouter como default nuevo y endpoints previamente configurados como selecciones explícitas compatibles.
- Agregar selección al diálogo/API/MCP de ejecución y congelarla al encolar. Pasar configuración por run al proceso hijo.
- Extender snapshot/readers; revisar clave de runs activos y particionado del Replay Cache por selección para evitar cruces.
- Probar el mismo caso demo-shop con los tres runtimes: acción, aserción positiva, negativa y fallo de infraestructura. Verificar `StepResult`, artifacts y `RunSummary`.

**Salida:** runs reales con runtime/modelo seleccionados, resultados por paso y trazabilidad verificable.

### Fase 5 — Interfaz completa y preferencias

- Actualizar Settings con transporte, ubicación y diagnóstico.
- Mostrar selectores separados para Chat, Jira y runner y acción explícita para aplicar una selección a todos.
- Agregar prueba explícita de conexión cuando la comprobación requiere inferencia.
- Conservar preferencias antiguas con defaults compatibles y manejar sesiones de otro transporte.
- Mostrar override y selección resuelta en Jira y diálogo/historial de ejecución. Permitir cambios efectivos en ambos, no solo en el chat.
- Identificar el decisor propio de Laya/Jev cuando se use ese motor, sin confundirlo con el runtime de orquestación.

**Salida:** el usuario puede elegir y verificar el modelo de cada uso, persistir sus preferencias y reconocer qué instalación responde.

### Fase 6 — Regresión, documentación y cierre

- Ejecutar la matriz de aceptación y verificaciones de tipos/tests.
- Verificar stack Docker y proveedor nativo existentes.
- Actualizar README, `.env.example` y decisiones; adjuntar comandos reproducibles y evidencia redactada.

**Salida:** criterios de aceptación satisfechos y rollback comprobado.

## 8. Criterios de aceptación y pruebas

| ID | Criterio | Prueba / punto de aislamiento | Evidencia esperada |
| --- | --- | --- | --- |
| AC-01 | El catálogo detecta instalaciones, ausencia y versiones incompatibles sin confundirlas con login válido. | Unitaria con resolución/probes simulados + integración Windows. | Estados correctos para binario presente/ausente/incompatible; ningún secreto. |
| AC-02 | Claude CLI responde con su login soportado sin API key configurada por Agent Tester. | Integración manual explícita con CLI real. | Respuesta real, modo de auth indicado y ausencia de clave adicional; sin copiar tokens. |
| AC-03 | OpenCode host reutiliza sus providers/modelos y su contexto de proyecto. | Contrato HTTP simulado + integración real. | Agente/modelo configurado responde y coincide con la selección. |
| AC-04 | Sesiones de dos turnos mantienen contexto y no mezclan conversaciones. | Integración de sesión + concurrencia con dos conversaciones. | IDs aislados, respuesta contextual y ningún evento cruzado. |
| AC-05 | MCP consulta y modifica un caso temporal; herramientas ajenas no se habilitan globalmente. | Integración contra DB de prueba + prueba negativa de permisos. | Cambios persistidos verificables y rechazo explícito de una herramienta no autorizada. |
| AC-06 | Cancelación y timeout detienen el trabajo del adaptador. | Prueba de proceso controlado + integración Windows. | Cierre de procesos propios/lectores y resultado cancelado o error de timeout. |
| AC-07 | SSE soporta JSON/UTF-8 fragmentado, tool calls, errores y finalización única. | Unitaria del normalizador con fixtures reales redactados; contrato con cliente. | Texto íntegro, orden de eventos correcto y un solo evento terminal. |
| AC-08 | Fallos de auth/red/CLI no generan éxito aparente ni fallback silencioso. | Salidas de proceso/HTTP simuladas + login fallido controlado. | Mensaje accionable y runtime seleccionado preservado. |
| AC-09 | Preferencias antiguas y sesiones SDK se manejan sin romper el chat. | Pruebas de compatibilidad de datos y selección de transporte. | Defaults estables y nueva conversación cuando la sesión no es compatible. |
| AC-10 | Docker, Claude SDK y proveedor nativo conservan su comportamiento. | Regresión por transporte y smoke de Docker con configuración de prueba. | Arranque correcto, diagnóstico honesto y chat cuando tiene credenciales válidas. |
| AC-11 | Rutas con espacios, Unicode y prompts largos funcionan en Windows. | Unitaria de argumentos + proceso real con entrada larga por stdin. | Prompt íntegro, sin shell injection ni errores de longitud. |
| AC-12 | Se puede seleccionar runtime/modelo para Chat, Jira y runner, y aplicar una selección a todos explícitamente. | UI/contrato de preferencias + resolución backend. | Selectores efectivos, defaults/overrides claros y modelo solicitado/efectivo mostrado sin inferirlo del texto del modelo. |
| AC-13 | Jira analiza el mismo ticket TEST con OpenRouter, Claude y OpenCode. | Integración de generación estructurada, validación de esquema y error controlado. | `JiraAnalysis` válido y metadatos del runtime elegido; ningún fallback ni escenario simulado ante error. |
| AC-14 | El runner usa OpenRouter por defecto en instalación nueva y permite Claude/OpenCode como alternativas reales. | Caso demo-shop idéntico en los tres runtimes, con cache aislada, acción y aserción positiva/negativa. | Invocaciones de modelo verificables, decisiones browser efectivas y `StepResult`/artifacts comparables. |
| AC-15 | La adaptación runner conserva herramientas/resultados y visión cuando se necesita. | Contrato AI SDK con fixtures + integración multimodal de cada runtime. | El motor ejecuta la herramienta una vez y entrega su observación al modelo; la respuesta no sustituye evidencia del browser. |
| AC-16 | Un run encolado conserva su selección aunque cambien Settings. | Prueba de cola con dos configuraciones, deduplicación y proceso hijo. | Snapshot y selección ejecutada coinciden; sin mutación global de entorno ni confusión de runs activos. |
| AC-17 | Preferencias por uso persisten en servidor y aplican a llamadas MCP. | Recarga/reinicio de API y ejecución MCP con/sin override. | El backend resuelve la misma preferencia; no depende de localStorage ni del modelo del chat. |
| AC-18 | Se puede validar el flujo host sin puente Docker/Windows. | Procedimiento de sección 6 con DB de prueba y API/frontend Windows. | Health correcto y comprobaciones Chat/Jira/runner, sin intentar ejecutar binarios Windows desde Linux. |

### Ejecución y datos de prueba

- Backend: `bun run typecheck` y `bun test`, desde `server/`; revisar fallos previos antes de atribuirlos al cambio.
- Frontend: `bun run typecheck`, `bun test` y `bun run build`, desde `client/`.
- Unitarias/contrato con ejecutor de procesos y cliente HTTP inyectables; no depender de cuentas reales en CI.
- Integraciones reales opt-in, sin lanzar generaciones facturables en la suite por defecto.
- Usar workspace/casos identificados con un prefijo único de prueba y DB de prueba; eliminar datos creados al finalizar y reportar cleanup incompleto.
- No reintentar automáticamente prompts que puedan haber ejecutado una herramienta de escritura; verificar el estado antes de repetir.
- Evidencia: versión de CLI, transporte, modelo solicitado/efectivo cuando sea observable, eventos redactados, exit code y resultado del cleanup. Nunca tokens ni variables de entorno completas.

## 9. Riesgos y rollback

| Riesgo                                                     | Mitigación                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Cambios de flags o formato de CLI.                         | Detectar capacidades, probar fixtures de versiones reales y fallar con diagnóstico de incompatibilidad. |
| Login local no disponible para esa versión/modalidad.      | Validación previa con CLI real y documentación vigente; mantener SDK/API key como selección explícita.  |
| MCP o credenciales en filesystem distinto.                 | Primer corte en mismo host; separar claramente modalidad Windows y Docker.                              |
| Permisos headless amplios o bloqueo por confirmación.      | Lista autorizada efectiva y denegación explícita; no copiar flags de bypass de OpenDesign.              |
| Eventos duplicados, sesiones mezcladas o proceso huérfano. | Normalizador probado, filtro de sesión y lifecycle verificado en Windows.                               |
| Código en curso ya modificado en el repositorio.           | Hacer cambios acotados sobre el estado actual; no restaurar ni sobrescribir modificaciones ajenas.      |

Riesgos adicionales del alcance ampliado:

- AI SDK y CLIs exponen contratos diferentes de herramientas/visión: resolverlos con el experimento de fase 0 y elegir explícitamente la integración runner; una respuesta textual no acredita compatibilidad E2E.
- La selección puede cambiar entre encolado y ejecución: snapshot inmutable, configuración por operación/proceso y deduplicación/cache conscientes de la selección.

Rollback: volver `CLAUDE_TRANSPORT` a `sdk`, seleccionar OpenRouter o el endpoint anterior para Jira/runner y abrir una conversación nueva si el ID pertenece al CLI. Aplicar el cambio solo a operaciones nuevas; los runs ya encolados conservan su snapshot y se completan con versión compatible o se cancelan explícitamente. Mantener OpenCode HTTP y proveedor nativo disponibles; no borrar configuraciones, logins ni sesiones. Las migraciones serán aditivas y se probará lectura de datos/snapshots antiguos; no borrar columnas/tablas en el rollback inicial. Confirmar tolerancia de lectores anteriores antes de volver a una versión previa.

## 10. Condiciones para iniciar implementación

1. Elegir alternativa; recomendada: B.
2. Utilizar el procedimiento host Windows + PostgreSQL Docker para validar desde las primeras iteraciones; si se exige API Docker desde el inicio, incorporar el daemon host como prerrequisito de despliegue antes de esa validación.
3. Completar la prueba de viabilidad de autenticación, herramientas y visión y elegir el mecanismo de adaptación del runner.
4. Mantener como criterio de cierre la selección efectiva en los tres usos: Chat, Jira y runner, con OpenRouter predeterminado del runner y alternativas Claude/OpenCode.

Este documento es el plan de trabajo. No se han aplicado cambios al funcionamiento de IA ni se han ejecutado pruebas de inferencia como parte de su redacción.
