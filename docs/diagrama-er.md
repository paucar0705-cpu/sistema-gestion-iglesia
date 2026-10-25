# Diagrama entidad-relación

GitHub dibuja este diagrama automáticamente. La definición exacta de cada campo está en [`src/db/schema.sql`](../src/db/schema.sql).

```mermaid
erDiagram
    roles ||--o{ usuarios : "tiene"
    miembros |o--o| usuarios : "puede ser"
    usuarios ||--o{ recuperacion_password : "solicita"
    usuarios |o--o{ ministerios : "coordina"
    ministerios ||--o{ ministerio_miembros : "integra"
    miembros ||--o{ ministerio_miembros : "participa"
    miembros |o--o{ eventos : "es responsable"
    ministerios |o--o{ eventos : "organiza"
    eventos ||--o{ asistencias : "registra"
    miembros ||--o{ asistencias : "asiste"
    miembros |o--o{ donaciones : "aporta (opcional)"
    usuarios ||--o{ donaciones : "registra"
    usuarios |o--o{ anuncios : "publica"

    roles {
        int id PK
        text nombre UK
    }
    usuarios {
        int id PK
        text nombre
        text correo UK
        text password_hash
        int rol_id FK
        int miembro_id FK "opcional"
        int activo
    }
    recuperacion_password {
        int id PK
        int usuario_id FK
        text token_hash
        text expira_en
        int usado
    }
    miembros {
        int id PK
        text nombre
        text apellidos
        text telefono
        text correo
        text fecha_ingreso
        int activo
        text fecha_baja
    }
    ministerios {
        int id PK
        text nombre UK
        text descripcion
        int coordinador_id FK
        int activo
    }
    ministerio_miembros {
        int id PK
        int ministerio_id FK
        int miembro_id FK
        text fecha_union
        text fecha_salida
        int activo
    }
    eventos {
        int id PK
        text titulo
        text tipo "culto|reunion|actividad|administrativo"
        text fecha
        text hora
        text lugar
        int responsable_id FK
        int ministerio_id FK "opcional"
        text estado "programado|realizado|cancelado"
    }
    asistencias {
        int id PK
        int evento_id FK
        int miembro_id FK
        int presente "1 presente / 0 ausente"
    }
    donaciones {
        int id PK
        text fecha
        int monto_centavos
        text concepto "diezmo|ofrenda|donacion_especial|otro"
        text metodo "efectivo|transferencia|tarjeta|otro"
        int miembro_id FK "NULL = anónima"
        int registrado_por FK
    }
    anuncios {
        int id PK
        text titulo
        text contenido
        text fecha_publicacion
        int importante
        int autor_id FK
    }
    configuracion_iglesia {
        int id PK "siempre 1"
        text nombre
        text logo_ruta
        text direccion
        text telefono
        text correo
        text horarios
    }
```

## Vistas para panel y reportes

| Vista | Uso | Acceso |
|---|---|---|
| `v_indicadores_panel` | Tarjetas del panel principal | Todos |
| `v_asistencia_por_evento` | Reporte de asistencia (semanal / mensual con `semana`, `mes`) | Admin, Pastor, Secretario |
| `v_participacion_ministerio` | Integrantes, actividades y % de asistencia por ministerio | Admin, Pastor, Secretario |
| `v_ingresos_mensuales` | Ingresos por mes, concepto y método | **Solo Admin y Tesorero** |
| `v_movimiento_miembros` | Altas y bajas por mes | Admin, Pastor, Secretario |
