# 06 — Build frontend: carpetas de casos

**Estado:** IMPLEMENTADO, PENDIENTE DE INTEGRACIÓN REAL Y REVISIÓN  
**Fecha:** 2026-10-26  
**Enfoque aplicado:** alternativa B de `05-front-folders-plan.md`, aprobada mediante la solicitud de implementación.

## Alcance implementado

- Árbol persistente de carpetas `kind=test` con expansión, selección y conteo directo de casos.
- Vistas **Todos** y **Sin asignar**, combinables con búsqueda y filtros existentes.
- Creación de raíces/subcarpetas, renombrado, movimiento y reordenación entre hermanos.
- Exclusión de la carpeta movida y sus descendientes en los destinos disponibles.
- Eliminación confirmada; los errores backend de carpetas no vacías se muestran al usuario.
- Movimiento de casos a una carpeta o Sin asignar, reutilizando la cola de guardado de casos.
- Layout responsive y controles accesibles sin drag-and-drop obligatorio.

No se añadieron ciclos, adjuntos, Eliminados, autenticación ni SSE de carpetas.

## Archivos nuevos

- `client/src/features/folders/folder-tree.ts`: construcción, orden, aplanado, destinos válidos y filtro de casos.
- `client/src/features/folders/folder-tree.test.ts`: 7 pruebas unitarias.
- `client/src/features/folders/FolderTree.tsx`: navegación y acciones del árbol.
- `client/src/features/folders/FolderFormDialog.tsx`: crear, renombrar y mover carpetas.
- `client/src/features/folders/MoveCaseDialog.tsx`: mover casos.

## Archivos actualizados

- `client/src/types.ts`: contratos `Folder`, entradas CRUD y `Test.folderId`.
- `client/src/data/api.ts`: endpoints de carpetas y propagación de `folderId`.
- `client/src/data/model.ts`, `seed.ts`: estado `folders` y casos iniciales sin asignar.
- `client/src/data/WorkspaceContext.tsx`: carga inicial, CRUD y movimiento de casos con `flushCase`.
- `client/src/routes/WorkspacePages.tsx`: composición del árbol, filtro seleccionado y acción Mover caso.
- `client/src/index.css`: layout, árbol, acciones y responsive.
- `client/package.json`, `client/tsconfig.json`, `client/bun.lock`: script de tests y tipos `bun-types@1.4.2`.

No se modificó el backend en este ciclo. Los cambios de terceros preexistentes se conservaron; no hubo commit, push ni cleanup destructivo.

## Pruebas y comandos reales

### Red/Green

`bun test src/features/folders/folder-tree.test.ts` desde `client/`:

- **Red esperada:** módulo `./folder-tree` inexistente.
- Después de la primera implementación, 3 expectativas fallaron porque la fixture daba la misma posición a dos raíces y el orden por ID era el correcto. Se corrigió la fixture para hacer explícito el orden pretendido.
- **Green final:** 7 pass, 0 fail, 10 assertions.

### Verificación automatizada

| Comando | Resultado |
|---|---|
| `bun run test` en `client/` | **Ejecutado:** 7 pass, 0 fail. |
| `bun run typecheck` en `client/` | **Ejecutado:** pasa tras registrar `bun-types`. |
| `bun run build` en `client/` | **Ejecutado:** 105 módulos, Vite build en 9.66 s. |
| `bun test` en `server/` | **Ejecutado:** 26 pass, 0 fail, 70 assertions. |
| `bun run typecheck` en `server/` | **Ejecutado:** core, api, mcp y demo-shop pasan. |
| `git diff --check` | **Ejecutado:** sin errores tras retirar una línea vacía final; solo avisos LF/CRLF. |

## Verificación visual con API simulada

Se abrió `http://127.0.0.1:5173/tests` en Chrome y se inyectó una API REST simulada, sin escribir en PostgreSQL. Se comprobó:

1. Renderizado de dos carpetas anidadas, conteos y dos casos.
2. **Sin asignar** mostraba un caso; después de moverlo a Checkout, la vista quedaba en cero y Checkout pasaba a dos.
3. Creación de la carpeta raíz Smoke y actualización inmediata del árbol.
4. Al mover Regresión, el selector excluía Regresión y Checkout; solo ofrecía Raíz y Smoke.
5. Layout responsive en viewport reducido: una sola columna, sin overflow horizontal del documento.
6. Consola del navegador sin errores ni warnings.

Evidencias temporales:

- `C:\Users\franc\AppData\Local\Temp\opencode\snake-folders-desktop.png`
- `C:\Users\franc\AppData\Local\Temp\opencode\snake-folders-mobile.png`

Esta evidencia valida composición e interacción del cliente, **no** persistencia real ni compatibilidad completa con el backend.

## Pendientes y riesgos

- **No ejecutado:** migración/PostgreSQL, integración REST real, persistencia tras recarga y aislamiento entre workspaces. El entorno no tenía `server/.env` ni `DATABASE_URL`.
- **No ejecutado:** E2E real de AC-01/03/04/05/29/31 ni regresión de ejecuciones y bugs con casos asignados.
- La reordenación actualiza posiciones de hermanos secuencialmente; un fallo intermedio produce recarga de reconciliación, pero el backend no ofrece una operación transaccional única.
- Otros clientes solo ven cambios de carpetas al recargar porque no existe SSE para estas entidades.
- La selección de carpeta muestra asignaciones directas, no casos de descendientes, según el corte funcional documentado.

## Próxima revisión sugerida

Ejecutar `review-change` y luego una integración contra PostgreSQL desechable. Verificar especialmente la cola `updateCase` + `flushCase`, errores parciales de reordenación y las respuestas 400/404 reales antes de cerrar los AC. Los tests y la UI simulada no equivalen a aprobación final.
