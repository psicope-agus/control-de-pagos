# Consultorio — Asistencia y Pagos

App para gestionar pacientes, turnos semanales, asistencia diaria y liquidación
mensual de pagos, calculada automáticamente según:

- El horario semanal fijo de cada paciente (día, hora, módulos seguidos).
- El calendario real del mes (cuántas veces cae cada turno).
- El calendario de feriados argentinos (se carga manualmente cada año, porque
  los feriados trasladables cambian por decreto).
- El estado de asistencia de cada sesión:
  - **Presente** → se cobra.
  - **Ausente con aviso** → NO se cobra.
  - **Ausente sin aviso** → SÍ se cobra.
  - **No se firmó** → se cobra (podés cambiarlo sesión por sesión si corresponde).
  - **Feriado / no laborable** → no se cobra a nadie ese día.
- La tarifa vigente en esa fecha, diferenciada por servicio (Inclusión escolar
  vs. Tratamiento/Rehabilitación), con historial de cambios de precio.

No incluye pasarela de pago: es una herramienta de **cálculo y control**, no de
cobro online.

---

## 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) → **New project**.
2. Elegí nombre, contraseña de base de datos y región (la más cercana a
   Argentina suele ser `South America (São Paulo)`).
3. Cuando el proyecto esté listo, entrá a **SQL Editor** → **New query**.
4. Pegá **todo** el contenido de `supabase/schema.sql` y tocá **Run**.
   Esto crea las tablas, los permisos de seguridad y precarga el calendario
   de feriados 2026 que me pasaste.
5. (Opcional) Si querés arrancar con tus pacientes actuales cargados, pegá y
   ejecutá también `supabase/seed_opcional.sql`. Revisalo antes: el servicio
   de cada paciente y los valores de tarifa son una estimación a partir de tus
   Excel, ajustalos si no coinciden.
6. Creá tu usuario administrador: **Authentication → Users → Add user** (con
   email y contraseña). Con ese usuario vas a iniciar sesión en la app.
7. Copiá dos datos que vas a necesitar en el paso 3:
   - **Project URL** (Settings → API → Project URL)
   - **anon public key** (Settings → API → Project API keys → `anon` `public`)

## 2. Subir el código a GitHub

1. Creá un repositorio nuevo (vacío) en GitHub, por ejemplo
   `consultorio-asistencia-pagos`.
2. En tu computadora, dentro de la carpeta del proyecto que te entrego:

   ```bash
   git init
   git add .
   git commit -m "Primera versión de la app"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```

## 3. Conectar la app con Supabase

### Para desarrollo local
1. Copiá `.env.example` a `.env.local`.
2. Completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los datos del
   paso 1.7.
3. Instalá dependencias y corré la app:

   ```bash
   npm install
   npm run dev
   ```

### Para publicarla en internet gratis (GitHub Pages)
El repo ya incluye `.github/workflows/deploy.yml`, que compila y publica la
app automáticamente cada vez que hacés `git push` a `main`.

1. En GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**. Creá dos secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. En **Settings → Pages**, elegí **Source: GitHub Actions**.
3. Hacé `git push` — a los pocos minutos la app queda publicada en
   `https://TU-USUARIO.github.io/TU-REPO/`.

## 4. Primeros pasos dentro de la app

1. Iniciá sesión con el usuario administrador que creaste en Supabase.
2. **Tarifas**: cargá el valor hora actual de cada servicio.
3. **Pacientes**: cargá (o revisá los precargados) con su servicio.
4. **Turnos**: para cada paciente, cargá su horario semanal fijo (día, hora,
   cantidad de módulos seguidos, duración de cada módulo en minutos). Un
   paciente puede tener varios turnos por semana.
5. **Feriados**: revisá que el año que vas a liquidar tenga su calendario
   cargado (2026 ya viene precargado).
6. **Asistencia**: elegí paciente + mes. La app genera automáticamente todas
   las sesiones esperadas según el horario y marca los feriados. Vos solo
   tenés que tocar el estado de las sesiones que no fueron "Presente".
7. **Pagos**: elegí mes/año y vas a ver, paciente por paciente, los módulos y
   horas facturables, el monto calculado y un detalle sesión por sesión. Desde
   ahí marcás el estado del pago (pendiente/completado).

## Estructura del proyecto

```
supabase/schema.sql        → tablas, seguridad y feriados 2026
supabase/seed_opcional.sql → pacientes y tarifas de ejemplo (opcional)
src/lib/supabase.js        → conexión a Supabase
src/lib/liquidacion.js      → motor de cálculo de la liquidación mensual
src/pages/                 → Pacientes, Turnos, Asistencia, Pagos, Tarifas, Feriados
```

## Notas sobre las reglas de negocio

- Si un turno cambia de horario, cargá un turno nuevo y desactivá el viejo
  (no lo borres si ya tiene asistencias asociadas).
- Si el valor hora cambia a mitad de mes, la liquidación de ese mes toma la
  tarifa vigente al día 15. Si necesitás prorratear un cambio de precio a
  mitad de mes, decímelo y agrego ese cálculo día por día.
- Cada año tenés que cargar el calendario de feriados en la sección
  **Feriados** (los trasladables se definen por decreto, no son automáticos).
