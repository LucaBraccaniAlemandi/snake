# Documento de Brief: Documentación y ciclos de pruebas para el proyecto e‑tester

**Ruta:** `docs/ai-workflow/test-documentation-cycles/01-brief.md`  
**Estado:** BORRADOR

---

## 1. Contexto / necesidad de negocio

El catálogo de pruebas necesita una organización documental persistente y una forma de preparar ejecuciones agrupadas. La referencia funcional es AIO Tests: casos y ciclos organizados independientemente en carpetas y subcarpetas, adjuntos asociados a casos y ciclos, y ejecuciones individuales vinculadas a un ciclo.

Esto debe permitir localizar la documentación, preparar una batería antes de ejecutarla, consultar su progreso y resultados, reabrir ciclos finalizados cuando sea necesario y gestionar el ciclo de vida de los casos sin perder información histórica vinculada.

## 2. Actual vs esperado

**Actual:** los casos se agrupan visualmente por componente, no existen carpetas persistidas, adjuntos de usuario ni ciclos; cada Run se ejecuta de forma independiente y conserva un snapshot del caso.

**Esperado:** casos y ciclos organizados en árboles independientes, archivos adjuntos de hasta 256 MB por archivo, un límite global configurable de 40 GB para adjuntos y ciclos que pasen por **Borrador → En curso → Finalizado**. Los ciclos finalizados podrán reabrirse, salvo que hayan sido archivados. Los casos podrán marcarse como **Deprecados** y su eliminación distinguirá entre casos sin dependencias, que se eliminan físicamente con todos sus datos, y casos vinculados, que se ocultan mediante borrado lógico y solo se muestran en la carpeta especial **Eliminados**.

### Hechos verificados

- `tests` y `runs` existen, pero no hay entidades de carpetas o ciclos: `server/core/migrations/001_init.sql:7-33`.
- Los casos ya tienen pasos y metadatos documentales: `server/core/src/schema.ts:49-69`.
- Cada Run conserva el contenido del caso utilizado: `server/core/src/schema.ts:96-110`.
- La agrupación actual del catálogo usa componentes, no carpetas: `client/src/routes/WorkspacePages.tsx:40-58`.
- La vista de ejecuciones es un historial general: `client/src/routes/WorkspacePages.tsx:85-92`.
- La cola actual ejecuta secuencialmente y toma el snapshot al crear el Run: `server/core/src/runner.ts:66-90`.
- La aplicación no tiene autenticación: `README.md:91`.

### Decisiones confirmadas

- “Adjuntados” incluye **archivos en casos/ciclos** y **vinculación de casos a ciclos**.
- Al ejecutar, se utiliza la **versión vigente del caso en ese momento**.
- Un fallo no detiene los demás casos del ciclo.
- El ciclo tendrá estados **Borrador, En curso y Finalizado**, además de la condición **Archivado**.
- Los ciclos pasarán automáticamente a Finalizado cuando todos los Runs de la ejecución actual terminen.
- Los ciclos Finalizados podrán reabrirse; los Archivados no.
- No se añadirá autenticación en este incremento; el uso quedará limitado a entornos confiables.
- Se aceptará **cualquier tipo de archivo de hasta 256 MB por archivo**.
- Existirá un **límite global de almacenamiento de adjuntos de 40 GB**, configurable directamente en la base de datos.
- Las carpetas vacías podrán eliminarse; las carpetas con contenido o subcarpetas no.
- Los casos tendrán un estado **Deprecado**, independiente del borrado.
- Eliminar un caso sin ciclos ni regresiones asociadas eliminará también sus Runs, bugs, adjuntos, archivos y evidencias, después de una doble confirmación.
- Eliminar un caso con dependencias no lo borrará físicamente: se advertirán las dependencias, se solicitará confirmación y, si se continúa, el caso dejará de mostrarse en las vistas normales y solo aparecerá en **Eliminados**.

## 3. In scope

- Crear, renombrar, mover, reordenar y eliminar carpetas vacías.
- Carpetas y subcarpetas para casos, con sus vistas **Todos** y **Sin asignar**.
- Un árbol independiente equivalente para ciclos.
- Asociar cada caso o ciclo a una única carpeta de su árbol.
- Subir, descargar y eliminar adjuntos en casos y ciclos.
- Aplicar un límite de 256 MB por archivo y un límite global inicial de 40 GB para adjuntos.
- Permitir cambiar el límite global directamente en la base de datos, sin requerir una interfaz de administración.
- Preparar ciclos con nombre, objetivo, carpeta y fechas opcionales.
- Añadir, quitar y ordenar casos únicos dentro de un ciclo en Borrador.
- Ejecutar todos los casos incluidos y mostrar progreso y resultados agregados.
- Reabrir ciclos Finalizados y volver a ejecutarlos conservando los Runs históricos.
- Archivar ciclos Finalizados para impedir su reapertura y edición.
- Marcar casos como Deprecados sin eliminar su contenido ni su histórico.
- Eliminar físicamente casos sin dependencias, incluyendo todos sus datos y archivos, con doble confirmación.
- Aplicar borrado lógico a casos con dependencias y mostrarlos únicamente en la carpeta especial **Eliminados**.
- Mantener la trazabilidad entre ciclo, caso y Run.
- Conservar el funcionamiento de los Runs independientes y del resto del catálogo.

## 4. Out of scope

- Integración o migración desde AIO Tests, Zephyr, TestRail, Xray o Testmo.
- Versionado completo de casos o selección de versiones dentro del ciclo.
- Clonado o cancelación de ciclos.
- Desarchivar ciclos.
- Restaurar casos desde la carpeta Eliminados o purgar físicamente casos con dependencias.
- Programación automática de ejecuciones.
- Ejecución paralela o sustitución de la cola actual.
- Asignación de testers, etiquetas, informes avanzados o métricas nuevas.
- Biblioteca global para reutilizar adjuntos.
- Autenticación, autorización y antivirus.
- Interfaz gráfica para configurar el límite global de almacenamiento.
- Importación/exportación de carpetas, ciclos o adjuntos.

## 5. Restricciones, datos y dependencias

- Los datos actuales deben conservarse; los casos existentes aparecerán inicialmente en **Sin asignar**.
- Los Runs deben conservar sus snapshots y resultados aunque el caso cambie posteriormente.
- La ejecución dependerá de la cola secuencial existente.
- Los adjuntos deberán utilizar almacenamiento persistente y separado de las evidencias generadas por los Runs.
- Aunque se acepte cualquier formato, los archivos no deberán ejecutarse ni renderizarse como contenido activo de la aplicación.
- El límite de 256 MB por archivo deberá aplicarse de forma coherente entre cliente y servidor.
- El límite global de adjuntos será inicialmente de 40 GB y su configuración se almacenará en la base de datos.
- Alcanzar el límite global impedirá nuevas subidas, pero no eliminará ni alterará los adjuntos existentes.
- La eliminación física de un caso sin dependencias deberá abarcar sus Runs, bugs, adjuntos, archivos y evidencias.
- El borrado lógico de un caso con dependencias conservará en la base de datos y en el almacenamiento toda la información necesaria para mantener el histórico.
- La carpeta **Eliminados** será una ubicación especial del sistema, no una carpeta documental editable equivalente a las demás.
- El estado **Deprecado** no implica borrado lógico ni traslado a Eliminados.
- La ausencia de autenticación obliga a limitar el despliegue a entornos locales o redes confiables.
- Una interrupción del servidor durante un ciclo es un riesgo: la recuperación de trabajos en cola no forma parte de este incremento.

## 6. Criterios de aceptación

### Carpetas

**AC-01 — Organizar casos**  
**Dado** un workspace con casos, **cuando** el usuario crea carpetas anidadas y mueve casos entre ellas, **entonces** al volver al catálogo se conserva la jerarquía y cada caso aparece en la carpeta seleccionada.

**AC-02 — Organizar ciclos independientemente**  
**Dado** un workspace con ciclos, **cuando** el usuario crea subcarpetas y mueve ciclos, **entonces** la organización se conserva sin modificar el árbol de casos.

**AC-03 — Administrar jerarquías válidas**  
**Dado** una carpeta con descendientes, **cuando** se intenta moverla dentro de sí misma o de un descendiente, **entonces** la operación se rechaza y la jerarquía anterior permanece intacta.

**AC-04 — Eliminar únicamente carpetas vacías**  
**Dado** una carpeta vacía, **cuando** se elimina, **entonces** desaparece del árbol.  
**Dado** una carpeta que contiene elementos o subcarpetas, **cuando** se intenta eliminar, **entonces** se rechaza la operación y no se pierde ningún contenido.

**AC-05 — Vistas Todos y Sin asignar**  
**Dado** un workspace con casos o ciclos dentro y fuera de carpetas, **cuando** se seleccionan esas vistas, **entonces** Todos muestra la totalidad de los elementos no eliminados y Sin asignar únicamente los elementos no eliminados que no tienen carpeta.

### Adjuntos y almacenamiento

**AC-06 — Adjuntar archivos**  
**Dado** un caso o ciclo existente y espacio global disponible, **cuando** se adjunta un archivo válido, **entonces** aparece asociado con su nombre y tamaño y permanece disponible tras recargar.

**AC-07 — Aplicar el límite por archivo**  
**Dado** un archivo de exactamente 256 MB y espacio global disponible, **cuando** se sube, **entonces** se acepta.  
**Dado** un archivo que supera 256 MB, **cuando** se intenta subir, **entonces** se rechaza con un mensaje comprensible y no queda un adjunto parcial.

**AC-08 — Descargar cualquier formato de forma segura**  
**Dado** un adjunto de cualquier tipo permitido por el alcance, **cuando** se descarga, **entonces** se recupera el contenido original y el archivo no se ejecuta dentro de la aplicación.

**AC-09 — Gestionar errores de almacenamiento**  
**Dado** un fallo durante la subida o el borrado, **cuando** termina la operación, **entonces** se informa del error y no queda un registro visible que apunte a contenido inexistente.

**AC-10 — Eliminar adjuntos**  
**Dado** un adjunto existente, **cuando** el usuario confirma su eliminación, **entonces** deja de aparecer y no puede descargarse, sin alterar el caso o ciclo propietario.

**AC-11 — Aplicar el límite global de 40 GB**  
**Dado** que una nueva subida haría superar el límite global configurado, **cuando** se intenta cargar el archivo, **entonces** se rechaza antes de persistirlo, se informa que no hay espacio disponible y todos los adjuntos existentes permanecen intactos.

**AC-12 — Configurar el límite global en base de datos**  
**Dado** un límite global distinto de 40 GB guardado en la configuración de la base de datos, **cuando** se evalúan nuevas subidas, **entonces** se aplica el valor configurado sin modificar el límite individual de 256 MB por archivo.

### Preparación y ejecución de ciclos

**AC-13 — Preparar un ciclo**  
**Dado** una carpeta de ciclos o la vista Sin asignar, **cuando** el usuario crea un ciclo con nombre y datos opcionales válidos, **entonces** queda guardado como Borrador sin generar Runs.

**AC-14 — Validar fechas**  
**Dado** un ciclo cuya fecha de inicio es posterior a su fecha de fin, **cuando** se intenta guardar, **entonces** se rechaza el cambio y se conserva la versión válida anterior.

**AC-15 — Seleccionar y ordenar casos**  
**Dado** un ciclo en Borrador, **cuando** se añaden, retiran o reordenan casos, **entonces** se conserva esa composición sin duplicados y todavía no se generan ejecuciones.

**AC-16 — Impedir ejecutar un ciclo vacío**  
**Dado** un ciclo sin casos, **cuando** se intenta iniciar, **entonces** la operación se rechaza y el ciclo permanece en Borrador.

**AC-17 — Iniciar una sola vez por acción**  
**Dado** un ciclo válido en Borrador, **cuando** se inicia, incluso si se repite accidentalmente la misma acción, **entonces** pasa a En curso y se crea exactamente un Run por caso incluido en esa ejecución.

**AC-18 — Utilizar el contenido vigente**  
**Dado** un caso modificado después de preparar el ciclo pero antes de iniciar su Run, **cuando** comienza ese Run, **entonces** utiliza el contenido vigente y conserva el snapshot correspondiente.

**AC-19 — Continuar después de un fallo**  
**Dado** un ciclo con varios casos y un Run que termina como failed o error, **cuando** finaliza ese Run, **entonces** los casos restantes continúan procesándose hasta obtener un resultado terminal.

**AC-20 — Mostrar progreso y finalizar automáticamente**  
**Dado** un ciclo En curso, **cuando** sus Runs cambian de estado, **entonces** se actualizan los totales de pendientes, aprobados, fallidos y errores; cuando todos los Runs de la ejecución actual alcanzan un estado terminal, el ciclo pasa automáticamente a Finalizado.

**AC-21 — Reabrir un ciclo Finalizado**  
**Dado** un ciclo Finalizado y no Archivado, **cuando** el usuario lo reabre, **entonces** vuelve a Borrador, conserva todos sus Runs históricos y permite modificar su composición para una nueva ejecución.

**AC-22 — Conservar el histórico al volver a ejecutar**  
**Dado** un ciclo reabierto que ya tiene Runs históricos, **cuando** se inicia una nueva ejecución, **entonces** se crean nuevos Runs sin sobrescribir los anteriores y el ciclo finaliza cuando todos los Runs de esa nueva ejecución terminan.

**AC-23 — Archivar un ciclo**  
**Dado** un ciclo Finalizado, **cuando** el usuario lo archiva, **entonces** permanece consultable pero no puede editarse, reabrirse ni ejecutarse nuevamente.

### Eliminación y deprecación de casos

**AC-24 — Eliminar físicamente un caso sin dependencias**  
**Dado** un caso que no pertenece a ningún ciclo ni regresión, **cuando** el usuario solicita eliminarlo, **entonces** se muestra un único aviso que detalla que también se eliminarán sus Runs, bugs, adjuntos, archivos y evidencias, y la operación exige dos confirmaciones explícitas antes de ejecutarse.

**AC-25 — Completar la eliminación física**  
**Dado** un caso sin dependencias cuya eliminación fue confirmada dos veces, **cuando** se completa la operación, **entonces** el caso deja de existir junto con todos sus datos y archivos asociados y no aparece en la carpeta Eliminados.

**AC-26 — Advertir dependencias antes de un borrado lógico**  
**Dado** un caso incluido en uno o más ciclos o regresiones, **cuando** el usuario solicita eliminarlo, **entonces** se muestran sus dependencias y se pregunta si está seguro antes de realizar cualquier cambio.

**AC-27 — Ocultar un caso con dependencias sin borrarlo de la base de datos**  
**Dado** un caso con dependencias cuya eliminación fue confirmada, **cuando** se completa la operación, **entonces** el registro y su histórico se conservan, desaparece de Todos, Sin asignar y las demás vistas normales, y solo puede localizarse en la carpeta especial Eliminados.

**AC-28 — Diferenciar Deprecado de Eliminado**  
**Dado** un caso vigente, **cuando** el usuario lo marca como Deprecado, **entonces** se muestra ese estado, se conservan sus adjuntos, Runs y evidencias, y el caso no se traslada a la carpeta Eliminados ni se elimina físicamente.

### Seguridad, aislamiento y regresiones

**AC-29 — Aislar workspaces**  
**Dado** dos workspaces con nombres de carpetas o ciclos iguales, **cuando** se consultan o modifican, **entonces** no se mezclan carpetas, adjuntos, casos, ciclos ni Runs entre workspaces.

**AC-30 — Mantener el acceso actual**  
**Dado** un usuario dentro del entorno confiable actual, **cuando** utiliza estas funciones, **entonces** no se le solicita un nuevo proceso de autenticación; la documentación mantiene la advertencia contra exposición pública.

**AC-31 — Evitar regresiones en operaciones no destructivas**  
**Dado** un caso del catálogo, **cuando** se crea, edita o ejecuta como antes, **entonces** esas operaciones, sus Runs, evidencias y bugs siguen funcionando tanto si el caso está asignado a una carpeta como si está Sin asignar.

## 7. Evidencia inicial

- Investigación oficial de [carpetas en AIO Tests](https://aiosupport.atlassian.net/wiki/spaces/AioTests/pages/2000453705/Creating+Folders+and+Sub-Folders) y [creación de ciclos](https://aiosupport.atlassian.net/wiki/spaces/AioTests/pages/1970438178/Creating+a+Cycle).
- Referencia alternativa de [carpetas en Zephyr](https://support.smartbear.com/zephyr/docs/en/working-with-folders.html).
- Separación entre repositorio y ejecución en [Xray Test Repository](https://docs.getxray.app/display/XRAYCLOUD/Test%20Repository) y [Xray Test Plan](https://docs.getxray.app/display/XRAYCLOUD/Test%20Plan).
- Referencia de adjuntos en [TestRail](https://support.testrail.com/hc/en-us/articles/7611165648660-Managing-attachments).

## 8. Notaciones incorporadas

- Se mantiene la eliminación de carpetas vacías y el rechazo de carpetas no vacías.
- Se confirma la finalización automática de ciclos al terminar todos los Runs de la ejecución actual.
- Se incorpora la reapertura de ciclos Finalizados y el bloqueo de reapertura para ciclos Archivados.
- Se sustituye el rechazo de eliminación de casos vinculados por borrado lógico, advertencia de dependencias y carpeta especial Eliminados.
- Se incorpora el estado Deprecado como clasificación independiente del borrado.
- Se añade el límite global inicial de 40 GB para adjuntos, configurable directamente en la base de datos.
- Se exige doble confirmación para la eliminación física de casos sin dependencias y se detallan todos los datos y archivos que se eliminarán.

**Gate:** pendiente de revisión final del documento actualizado antes de avanzar a Design.