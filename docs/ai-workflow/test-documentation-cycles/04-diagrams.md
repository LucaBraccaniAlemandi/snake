# 04 — Diagramas del slice de carpetas

Los diagramas describen únicamente la implementación backend realizada. La entidad Cycle todavía no existe; `FolderKind.cycle` solo reserva un árbol independiente para un incremento posterior.

## Flujo: crear una carpeta

```mermaid
flowchart TD
    A[POST /api/workspaces/:wid/folders] --> B[Validar body con CreateFolderBody]
    B --> C{¿Workspace existe?}
    C -- No --> C1[404 Workspace not found]
    C -- Sí --> D{¿Tiene carpeta padre?}
    D -- No --> G[Calcular posición si fue omitida]
    D -- Sí --> E{¿Padre existe y pertenece<br/>al mismo workspace y tipo?}
    E -- No --> E1[400 o 404 según corresponda]
    E -- Sí --> G
    G --> H[INSERT en folders]
    H --> I[201 con Folder persistida]
```

## Flujo: mover una carpeta

```mermaid
flowchart TD
    A[PATCH /api/folders/:id con parentId] --> B[Obtener carpeta actual]
    B --> C{¿Existe?}
    C -- No --> C1[404 Folder not found]
    C -- Sí --> D[Cargar árbol del mismo workspace y tipo]
    D --> E{¿parentId es null?}
    E -- Sí --> J[Mover a raíz]
    E -- No --> F{¿Padre pertenece<br/>al mismo workspace y tipo?}
    F -- No --> F1[400 Parent folder inválido<br/>Jerarquía sin cambios]
    F -- Sí --> G{¿Padre es la propia carpeta<br/>o uno de sus descendientes?}
    G -- Sí --> G1[400 Movimiento rechazado<br/>Jerarquía sin cambios]
    G -- No --> H{¿La jerarquía previa<br/>contiene un ciclo?}
    H -- Sí --> H1[400 Jerarquía inválida<br/>Jerarquía sin cambios]
    H -- No --> J
    J --> K[UPDATE de parent_id]
    K --> L[200 con Folder actualizada]
```

## Flujo: asignar un caso a una carpeta

```mermaid
flowchart TD
    A[PATCH /api/tests/:id con folderId] --> B[Obtener caso actual]
    B --> C{¿Caso existe?}
    C -- No --> C1[404 Test not found]
    C -- Sí --> D{¿folderId es null<br/>o fue omitido?}
    D -- Omitido --> H[Conservar folder_id actual]
    D -- Null --> I[Guardar folder_id = NULL<br/>Caso Sin asignar]
    D -- Con valor --> E{¿Carpeta existe y pertenece<br/>al workspace del caso y a kind=test?}
    E -- No --> E1[400 o 404<br/>Asignación sin cambios]
    E -- Sí --> F[Guardar folder_id]
    F --> G[Publicar test-updated]
    H --> G
    I --> G
    G --> J[200 con caso actualizado]
```

## Flujo: eliminar una carpeta

```mermaid
flowchart TD
    A[DELETE /api/folders/:id] --> B[Obtener carpeta]
    B --> C{¿Existe?}
    C -- No --> C1[404 Folder not found]
    C -- Sí --> D[Contar subcarpetas]
    D --> E{¿kind = test?}
    E -- Sí --> F[Contar casos asignados]
    E -- No --> G[No hay elementos Cycle que contar<br/>en este incremento]
    F --> H{¿Subcarpetas = 0<br/>y elementos = 0?}
    G --> H
    H -- No --> H1[400 Folder is not empty<br/>Contenido sin cambios]
    H -- Sí --> I[DELETE de la carpeta]
    I --> J[204 sin contenido]
```

## Diagrama entidad-relación físico

```mermaid
erDiagram
    WORKSPACES ||--o{ FOLDERS : "organiza"
    WORKSPACES ||--o{ TESTS : "contiene"
    FOLDERS o|--o{ FOLDERS : "padre de"
    FOLDERS o|--o{ TESTS : "agrupa"
    TESTS ||--o{ RUNS : "ejecuta"

    WORKSPACES {
        text id PK
        text name
        timestamptz created_at
    }

    FOLDERS {
        text id PK
        text workspace_id FK
        text kind "test | cycle"
        text name
        text parent_id FK "nullable"
        integer position
        timestamptz created_at
    }

    TESTS {
        text id PK
        text workspace_id FK
        text folder_id FK "nullable"
        text name
        text url
        jsonb steps
        jsonb metadata
        timestamptz updated_at
    }

    RUNS {
        text id PK
        text test_id FK
        text status
        jsonb test_snapshot
        timestamptz created_at
    }
```

Cardinalidades y reglas:

- Un caso pertenece a un workspace y puede tener cero o una carpeta.
- Una carpeta puede contener cero o varios casos y cero o varias subcarpetas.
- Una carpeta tiene como máximo un padre; `parent_id = NULL` representa la raíz.
- `tests.folder_id = NULL` representa **Sin asignar** y conserva los casos anteriores a la migración.
- `ON DELETE RESTRICT` impide borrar una carpeta con subcarpetas o casos; la aplicación valida antes para devolver un error comprensible.
- Runs conserva su snapshot y no cambia con la organización documental del caso.

## Diagrama de dominio

```mermaid
classDiagram
    class Workspace {
        +string id
        +string name
        +Date createdAt
    }

    class Folder {
        +string id
        +string workspaceId
        +FolderKind kind
        +string name
        +string? parentId
        +number position
        +Date createdAt
    }

    class FolderKind {
        <<enumeration>>
        test
        cycle
    }

    class TestCase {
        +string id
        +string workspaceId
        +string? folderId
        +string name
        +string url
        +Step[] steps
        +Metadata metadata
        +Date updatedAt
    }

    class FolderRules {
        <<domain rules>>
        +moveFolder(folders, id, parentId) Folder[]
        +assertFolderEmpty(childFolderCount, itemCount) void
    }

    class FolderService {
        <<application service>>
        +listFolders(workspaceId, kind) Folder[]
        +createFolder(workspaceId, input) Folder
        +updateFolder(id, patch) Folder
        +deleteFolder(id) void
        +getFolderForWorkspace(workspaceId, id, kind) Folder
    }

    class TestService {
        <<application service>>
        +updateTest(id, patch, source) TestCase
    }

    Workspace "1" --> "*" Folder : árboles
    Workspace "1" --> "*" TestCase : catálogo
    Folder "0..1" --> "*" Folder : jerarquía
    Folder "0..1" --> "*" TestCase : asignación
    Folder --> FolderKind : tipo
    FolderService ..> FolderRules : aplica invariantes
    FolderService ..> Folder : persiste
    TestService ..> FolderService : valida asignación
    TestService ..> TestCase : actualiza
```

Invariantes de dominio implementadas:

1. Los árboles se aíslan por `workspaceId` y `FolderKind`.
2. La jerarquía es acíclica: una carpeta no puede ser padre de sí misma ni moverse bajo un descendiente.
3. Solo se elimina una carpeta vacía.
4. Un caso tiene una única ubicación opcional; no puede asignarse a una carpeta de otro workspace o al árbol `cycle`.
5. Cambiar la organización no altera pasos, metadatos ni snapshots de ejecución.
