# 03 — Build: carpetas persistidas para casos

**Estado:** IMPLEMENTADO, PENDIENTE DE REVISIÓN  
**Fecha:** 2026-10-26

## Precondiciones y alcance

El brief contiene AC concretos, pero no existe `02-design.md` y su gate sigue pendiente. Para no improvisar una arquitectura completa, este ciclo se limitó a un slice backend reversible de carpetas de casos. No se implementó UI, ciclos, adjuntos ni borrado de casos.

El working tree ya contenía cambios de terceros en client, server, migraciones 004–006 y documentación. Se registraron con `git status --short` y `git diff --stat` antes de editar. No se hizo cleanup, commit, push ni sobrescritura de esos cambios.

## Slice y AC cubiertos

- **AC-01, backend parcial:** carpetas anidadas persistentes y asignación de cada caso a una carpeta o a Sin asignar (`folderId = null`). La vista y la verificación de recarga quedan pendientes.
- **AC-03, reglas backend:** se rechaza mover una carpeta dentro de sí misma o de un descendiente sin modificar la jerarquía previa.
- **AC-04, backend:** solo se eliminan carpetas sin subcarpetas ni casos asociados.
- **AC-29, alcance backend parcial:** padres y asignaciones deben pertenecer al mismo workspace y tipo de árbol.

API añadida:

- `GET/POST /api/workspaces/:wid/folders` con `kind=test|cycle`.
- `PATCH/DELETE /api/folders/:id`.
- `PATCH /api/tests/:id` acepta `folderId`; las respuestas de casos incluyen ese campo.

El tipo `cycle` queda disponible para mantener independientes los árboles, pero este slice no crea la entidad Cycle ni completa AC-02.

## Archivos cambiados por este slice

- Nuevos: `server/core/src/folder-rules.ts`, `folder-rules.test.ts`, `folders.ts` y `server/core/migrations/007_folders.sql`.
- Actualizados: `server/core/src/schema.ts`, `api.ts`, `tests.ts`, `index.ts` y `server/api/src/index.ts`.
- Este entregable: `docs/ai-workflow/test-documentation-cycles/03-build.md`.

La migración crea `folders`, referencias de workspace/padre, índices y `tests.folder_id`; los casos existentes quedan en `NULL` (Sin asignar). Las restricciones `ON DELETE RESTRICT` protegen padres y carpetas asignadas.

## Pruebas y resultados reales

### Red

`bun test core/src/folder-rules.test.ts` desde `server/`

- **Falló como se esperaba:** `Cannot find module './folder-rules'`.
- La prueba se escribió antes de la implementación.

### Green y refactor

`bun test core/src/folder-rules.test.ts`

- **Ejecutado:** 6 pass, 0 fail, 12 assertions.
- Cubre movimiento válido sin mutación del estado anterior, rechazo de ciclos, aislamiento entre workspaces y eliminación solo cuando no hay contenido.

Primer `bun run typecheck` después de Green:

- **Falló:** parámetro `row` con tipo implícito `any` en `server/core/src/folders.ts:30`.
- Se corrigió con el tipo `FolderRow`, sin cambiar conducta.

### Verificación final

| Comando | Resultado |
|---|---|
| `bun test` en `server/` | **Ejecutado:** 26 pass, 0 fail, 70 assertions, 6 archivos. Antes del slice: 20 pass. |
| `bun run typecheck` en `server/` | **Ejecutado tras corrección:** core, api, mcp y demo-shop pasan. |
| `bun run build` en `client/` | **Ejecutado:** TypeScript y Vite build pasan; 101 módulos, build en 3.11 s. |
| `git diff --check` | **Ejecutado:** sin errores; solo avisos preexistentes de conversión LF/CRLF. |

## Evidencia pendiente y riesgos

- **No ejecutado:** aplicación de `007_folders.sql` ni pruebas de integración REST/PostgreSQL. No hay `server/.env` ni `DATABASE_URL`; no se inició Docker ni se escribió en una base de datos.
- **No ejecutado:** recarga del catálogo o validación visual; este slice no añade UI y no se afirma que AC-01 esté funcionalmente cerrado.
- Falta probar contra PostgreSQL creación, persistencia, movimiento, asignación y rechazo de borrado, incluida concurrencia.
- Falta integrar el árbol en client y añadir las vistas Todos/Sin asignar en otro slice.

## Próxima revisión sugerida

Enviar este diff a `review-change`, revisando especialmente reglas de integridad, migración y compatibilidad del contrato. Después, validar el slice contra una PostgreSQL desechable antes de cerrar los AC; los tests verdes no constituyen aprobación final.
