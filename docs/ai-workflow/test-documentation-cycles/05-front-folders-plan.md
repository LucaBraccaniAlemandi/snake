# 05 — Plan frontend: carpetas de casos

**Estado:** PROPUESTA PENDIENTE DE APROBACIÓN  
**Alcance:** integrar en React las carpetas backend creadas en `03-build.md`.  
**Fuera de alcance:** ciclos, adjuntos, Eliminados, autenticación y rediseño general del catálogo.

## 1. Situación actual verificada

- `client/src/routes/WorkspacePages.tsx:40-58` concentra filtros, agrupación por componente, tabla, creación, duplicado y borrado de casos.
- `client/src/data/api.ts:73-91` adapta el contrato REST a `TestCase`, pero todavía no expone `folderId` ni carpetas.
- `client/src/data/api.ts:115-120` usa las rutas de compatibilidad del workspace `default`.
- `client/src/data/WorkspaceContext.tsx:44-47` carga casos, Runs y bugs; no carga carpetas.
- `client/src/data/WorkspaceContext.tsx:109-157` ya serializa y reintenta ediciones de casos; conviene reutilizar ese mecanismo para asignar carpetas y evitar escrituras concurrentes.
- `client/src/types.ts:8-9` no reproduce todavía el contrato actualizado de `Test`/`TestListItem`.
- `client/src/data/model.ts:22` no incluye carpetas en el estado del workspace.
- No existen tests `*.test.*` ni `*.spec.*` en `client/src`; las pruebas unitarias nuevas deben apoyarse en funciones puras y Bun, sin introducir un framework innecesario.

## 2. Alternativas

| Criterio | A. Cambio local en `WorkspacePages.tsx` | B. Módulo progresivo de carpetas |
|---|---|---|
| Cambios iniciales | Menos archivos | Contrato, contexto, utilidades y componentes nuevos |
| Simplicidad inmediata | Alta para una demo | Media |
| Mantenibilidad | Baja: aumenta una página ya extensa | Alta: árbol y reglas quedan aislados |
| Pruebas | Difícil probar jerarquía sin renderizar toda la página | Funciones puras testeables y componentes acotados |
| Riesgo de regresión | Alto al mezclar catálogo y CRUD de carpetas | Menor, con integración delimitada en `TestsPage` |
| Reutilización para ciclos | Baja | Media: patrones reutilizables sin acoplar entidades |
| Reversibilidad | Simple, pero difusa | Por slices y archivos bien delimitados |

**Recomendación:** alternativa **B**, extrayendo solo el árbol y sus reglas; no dividir toda la página ni crear una arquitectura genérica para futuros ciclos.

**Decisión humana:** pendiente. No iniciar Build hasta elegir A o B o delegar expresamente la decisión.

## 3. Experiencia objetivo

La página de casos tendrá dos zonas dentro del panel actual:

1. **Navegador documental**, a la izquierda en escritorio:
   - Vista **Todos**.
   - Vista **Sin asignar**.
   - Árbol de carpetas `kind=test`, expandible y seleccionable.
   - Acciones para crear carpeta raíz/subcarpeta, renombrar, mover, reordenar y eliminar.
2. **Contenido del catálogo**, a la derecha:
   - Conserva búsqueda y filtros por estado, prioridad y componente.
   - Añade el filtro implícito de la carpeta/vista seleccionada.
   - Sustituye la agrupación visual por componente únicamente cuando una carpeta esté seleccionada; los componentes siguen siendo metadatos y filtros independientes.
   - Permite mover un caso mediante una acción **Mover a carpeta…**, sin exigir drag-and-drop.

Comportamiento de selección:

- `all`: todos los casos.
- `unassigned`: casos con `folderId === null`.
- ID de carpeta: solo casos asignados directamente a esa carpeta en el primer corte. Incluir descendientes requeriría una decisión funcional adicional y no debe asumirse.
- Si la carpeta seleccionada deja de existir, volver a `all` y avisar sin perder los casos.
- La selección puede mantenerse como estado local de `TestsPage`; no es necesario persistirla para cumplir el brief.

En móvil, el navegador se presentará antes del listado o en un panel desplegable; no se reducirá la tabla a un ancho inutilizable.

## 4. Contratos frontend necesarios

### Tipos

Añadir en `client/src/types.ts`:

- `FolderKind = "test" | "cycle"`.
- `Folder = { id, workspaceId, kind, name, parentId, position, createdAt }`.
- `folderId: string | null` en `Test` y, por herencia, en `TestListItem`.
- `CreateFolderInput` y `UpdateFolderInput`, reflejando los campos aceptados por la API.

`TestCase` conservará `folderId` mediante el tipo base; no se duplicará una segunda fuente de verdad.

### Adaptadores REST

Añadir en `client/src/data/api.ts`:

- `listTestFolders(workspaceId = "default")` → `GET /api/workspaces/:wid/folders?kind=test`.
- `createFolder(input, workspaceId = "default")` → `POST /api/workspaces/:wid/folders` con `kind: "test"`.
- `updateFolder(id, patch)` → `PATCH /api/folders/:id`.
- `deleteFolder(id)` → `DELETE /api/folders/:id`.

Actualizar:

- `fromTest`: propagar `folderId`, incluido `null`.
- `updateTest`: enviar `folderId` solo cuando esté presente en el patch; no convertir omission en desasignación accidental.

No crear rutas para `kind=cycle` en el cliente durante este incremento.

### Estado global

Ampliar `Workspace` en `client/src/data/model.ts` con `folders: Folder[]` y semilla vacía.

Ampliar `WorkspaceContext`:

- Cargar `api.listTestFolders()` en el mismo `Promise.all` de `refresh`.
- Exponer operaciones `createFolder`, `updateFolder`, `deleteFolder`, cada una con retorno `Promise` y actualización desde la respuesta del servidor.
- Reutilizar `updateCase(id, { folderId })` para mover/desasignar casos y conservar la cola de guardado existente.
- Mantener `storageError` y `notify` como canales de error; no mostrar éxito antes de confirmar la operación de carpeta.
- Invalidar/recargar carpetas tras errores de sincronización si el estado pudiera haber quedado divergente.

No añadir SSE de carpetas: el backend no lo ofrece. La recarga HTTP será la reconciliación inicial; la sincronización multiusuario en vivo queda explícitamente pendiente.

## 5. Módulos y archivos previstos

### Nuevos

- `client/src/features/folders/folder-tree.ts`
  - Tipos de nodos del árbol.
  - `buildFolderTree(folders)` ordenado por `position`, `createdAt` e `id`.
  - `filterCasesByFolder(cases, selection)` para `all`, `unassigned` e ID.
  - `getSelectableFolders(folders, movingFolderId)` para excluir la propia carpeta y descendientes en el selector de movimiento.
  - Funciones puras, sin React ni fetch.
- `client/src/features/folders/folder-tree.test.ts`
  - Jerarquía, orden, vistas especiales, exclusión de ciclos y entradas vacías.
- `client/src/features/folders/FolderTree.tsx`
  - Render recursivo, expansión/colapso, selección y acciones por nodo.
  - Botones con nombres accesibles; no depender solo de iconos o drag-and-drop.
- `client/src/features/folders/FolderFormDialog.tsx`
  - Crear, renombrar y mover; validación de nombre y destino.
- `client/src/features/folders/MoveCaseDialog.tsx`
  - Selector de carpeta o Sin asignar para un caso.

### Modificados

- `client/src/types.ts`: contratos.
- `client/src/data/api.ts`: endpoints y mapeo `folderId`.
- `client/src/data/model.ts`: estado `folders`.
- `client/src/data/WorkspaceContext.tsx`: carga y mutaciones.
- `client/src/routes/WorkspacePages.tsx`: composición del navegador, filtros, diálogos y acciones de casos.
- `client/src/components/Icon.tsx`: solo si faltan iconos ya utilizados por el diseño; preferir los existentes.
- `client/src/index.css`: grid del catálogo, árbol, estados seleccionado/expandido, responsive y foco.
- `client/package.json`: script `test` si se incorporan las pruebas Bun al flujo habitual.

## 6. Plan por slices

### Slice 0 — Desbloquear el contrato

**Objetivo:** comprobar que el frontend consumirá una API real, no solo tipos.

1. Aplicar migraciones en una PostgreSQL desechable.
2. Probar crear/listar/mover/eliminar carpetas y asignar `folderId` mediante REST.
3. Registrar respuestas y errores 400/404 para diseñar los mensajes del cliente.

**Entrega:** contrato verificado; sin cambios visuales.

### Slice 1 — Árbol persistente de solo lectura

**Objetivo:** valor visible con bajo riesgo.

1. Actualizar tipos, API, modelo y carga inicial.
2. Implementar `buildFolderTree` y sus tests.
3. Renderizar Todos, Sin asignar y carpetas anidadas.
4. Filtrar la tabla sin alterar la creación, ejecución o edición existentes.
5. Verificar recarga y casos antiguos con `folderId=null`.

**Entrega:** AC-01 de consulta y AC-05 para casos, excepto operaciones de administración.

### Slice 2 — Crear, renombrar y eliminar carpetas

**Objetivo:** administrar jerarquías sin mover elementos todavía.

1. Añadir formularios y operaciones del contexto.
2. Crear raíces y subcarpetas desde la selección actual.
3. Renombrar y confirmar eliminación.
4. Mostrar el error backend si la carpeta no está vacía; no ocultar contenido ni reintentar destructivamente.
5. Mantener selección y expansiones coherentes tras cada respuesta.

**Entrega:** creación y AC-04 con evidencia de persistencia.

### Slice 3 — Mover carpetas y casos

**Objetivo:** completar la organización documental.

1. Añadir **Mover carpeta…** con destinos válidos y exclusión de descendientes.
2. Añadir **Mover caso…** y opción Sin asignar.
3. Enviar cambios mediante la cola existente de edición de casos.
4. Reordenar carpetas con acciones Subir/Bajar y `position`; no hacer drag-and-drop obligatorio.
5. Probar rechazo de ciclos y ausencia de duplicados o pérdida de casos.

**Entrega:** AC-01, AC-03 y AC-05 en el árbol de casos.

### Slice 4 — Endurecimiento

**Objetivo:** accesibilidad, responsive y regresiones.

1. Navegación por teclado, foco visible, nombres accesibles y texto de errores.
2. Comportamiento móvil y nombres largos.
3. Pruebas de creación, edición, duplicado, ejecución y bugs de casos asignados y no asignados.
4. Comprobación de aislamiento por workspace mediante contrato; el selector visual de workspaces no forma parte de este corte.
5. Build, typecheck, tests y revisión visual real.

## 7. Matriz de aceptación y evidencia

| AC | Prueba prevista | Evidencia esperada |
|---|---|---|
| AC-01 | Unitarias de árbol/filtro + E2E crear, anidar, mover caso y recargar | Jerarquía y `folderId` persistidos; caso visible solo en la ubicación elegida |
| AC-03 | Unitarias de destinos + integración API + E2E intento inválido | 400, jerarquía previa intacta y mensaje visible |
| AC-04 | Integración API + E2E carpeta vacía/no vacía | Vacía desaparece; no vacía permanece con hijos y casos |
| AC-05 | Unitarias de selección + E2E Todos/Sin asignar | Totales correctos y ningún caso eliminado oculto por error |
| AC-29 | Contrato con dos workspaces y nombres repetidos | Sin mezcla de carpetas ni asignaciones cruzadas |
| AC-31 | Regresión E2E de crear, editar, ejecutar y consultar Runs/bugs | Mismo comportamiento con carpeta y Sin asignar |

Evidencia mínima por E2E: workspace desechable, datos identificables, estado inicial, acción, respuesta REST relevante, captura final y recarga. No usar producción ni borrar datos existentes.

## 8. Comandos de verificación compatibles con el stack

Desde `client/`:

```sh
bun test
bun run typecheck
bun run build
bun run dev
```

Desde `server/`:

```sh
bun test
bun run typecheck
```

La validación visual se realizará abriendo la aplicación y ejercitando los flujos; un build verde no se registrará como prueba de UI. Los comandos que no se ejecuten quedarán marcados como tales en el entregable Build.

## 9. Riesgos y mitigaciones

- **Working tree con cambios preexistentes:** registrar diff antes de cada slice y editar quirúrgicamente los archivos compartidos.
- **Página monolítica:** extraer únicamente carpetas; evitar un refactor general simultáneo.
- **Guardado concurrente de casos:** reutilizar `updateCase` y su cola; no introducir un PATCH paralelo para `folderId`.
- **Estado obsoleto tras errores:** usar respuestas del servidor, refrescar cuando sea necesario y revertir selecciones huérfanas.
- **Confusión componente/carpeta:** conservar componente como metadato y filtro, no como sustituto del árbol.
- **Reordenación ambigua:** definir orden entre hermanos y probar posiciones duplicadas; no prometer DnD en el primer corte.
- **Backend sin SSE de carpetas:** documentar que otros clientes se sincronizan al recargar; no simular actualización en vivo.
- **Eliminación destructiva:** confirmación clara, sin reintentos automáticos y sin ocultar errores de restricción.

## 10. Rollback y criterio de salida

Cada slice se revertirá por sus archivos propios, sin deshacer cambios de terceros. Si el árbol presenta una regresión, se puede volver al listado actual conservando `folderId` en el contrato; no hace falta revertir la migración ni eliminar datos.

El trabajo estará listo para `review-change` cuando AC-01, AC-03, AC-04, AC-05 y AC-31 tengan evidencia real, los comandos anteriores hayan pasado y no queden acciones de carpeta mostradas como exitosas antes de su confirmación backend.
