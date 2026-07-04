-- =========================================================
-- ESQUEMA: Gestión de Asistencia y Pagos - Consultorio
-- =========================================================
-- Ejecutar en Supabase: Dashboard > SQL Editor > New query > pegar y RUN

create extension if not exists "pgcrypto";

-- ---------- TIPOS ----------
do $$ begin
  create type tipo_servicio as enum ('inclusion_escolar', 'tratamiento');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_asistencia as enum ('presente', 'ausente_aviso', 'ausente_sin_aviso', 'no_firmado', 'no_laborable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_pago as enum ('sin_comenzar', 'pendiente', 'completado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_dia_no_laborable as enum ('feriado_fijo', 'feriado_trasladable', 'no_laborable', 'fin_de_semana');
exception when duplicate_object then null; end $$;

-- ---------- PACIENTES ----------
create table if not exists pacientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  servicio tipo_servicio not null default 'tratamiento',
  fecha_inicio date,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- TARIFAS (valor hora, varía en el tiempo y por servicio) ----------
create table if not exists tarifas (
  id uuid primary key default gen_random_uuid(),
  servicio tipo_servicio not null,
  valor_hora numeric(12,2) not null,
  vigente_desde date not null,
  vigente_hasta date, -- null = sigue vigente
  created_at timestamptz not null default now()
);
create index if not exists idx_tarifas_servicio_fecha on tarifas (servicio, vigente_desde);

-- ---------- TURNOS (horario semanal fijo de cada paciente) ----------
-- dia_semana: 0=domingo .. 6=sábado (como date_part('dow', ...) de Postgres)
create table if not exists turnos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  modulos int not null check (modulos > 0), -- cantidad de módulos seguidos en ese turno
  minutos_por_modulo int not null default 60 check (minutos_por_modulo > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_turnos_paciente on turnos (paciente_id);

-- ---------- CALENDARIO DE FERIADOS / NO LABORABLES (Argentina, se carga por año) ----------
create table if not exists feriados (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  descripcion text not null,
  tipo tipo_dia_no_laborable not null,
  afecta_cobro boolean not null default true, -- si es true, ese día no se cobra a nadie (no hubo clase)
  created_at timestamptz not null default now()
);

-- ---------- ASISTENCIAS (un registro por turno programado y fecha real) ----------
create table if not exists asistencias (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  turno_id uuid references turnos(id) on delete set null,
  fecha date not null,
  estado estado_asistencia not null default 'presente',
  modulos int not null default 1,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paciente_id, turno_id, fecha)
);
create index if not exists idx_asistencias_paciente_fecha on asistencias (paciente_id, fecha);

-- ---------- PAGOS (liquidación mensual por paciente) ----------
create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  modulos_facturables int not null default 0,
  horas_facturables numeric(10,2) not null default 0,
  valor_hora numeric(12,2) not null default 0,
  monto_total numeric(12,2) not null default 0,
  estado estado_pago not null default 'pendiente',
  fecha_pago date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paciente_id, anio, mes)
);

-- ---------- trigger simple para updated_at ----------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_asistencias_updated on asistencias;
create trigger trg_asistencias_updated before update on asistencias
  for each row execute function set_updated_at();

drop trigger if exists trg_pagos_updated on pagos;
create trigger trg_pagos_updated before update on pagos
  for each row execute function set_updated_at();

-- =========================================================
-- SEGURIDAD (RLS) - app de un solo administrador autenticado
-- =========================================================
alter table pacientes enable row level security;
alter table tarifas enable row level security;
alter table turnos enable row level security;
alter table feriados enable row level security;
alter table asistencias enable row level security;
alter table pagos enable row level security;

-- Cualquier usuario autenticado (vos, con tu login) puede leer/escribir todo.
-- Si más adelante querés sumar profesores con permisos limitados, se ajustan estas políticas.
create policy "auth_all_pacientes" on pacientes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all_tarifas" on tarifas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all_turnos" on turnos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all_feriados" on feriados for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all_asistencias" on asistencias for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_all_pagos" on pagos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =========================================================
-- CALENDARIO DE FERIADOS 2026 (Argentina) - provisto por el usuario
-- =========================================================
insert into feriados (fecha, descripcion, tipo, afecta_cobro) values
  ('2026-01-01', 'Año nuevo', 'feriado_fijo', true),
  ('2026-02-16', 'Carnaval', 'feriado_fijo', true),
  ('2026-02-17', 'Carnaval', 'feriado_fijo', true),
  ('2026-03-23', 'Día no laborable (puente turístico)', 'no_laborable', true),
  ('2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'feriado_fijo', true),
  ('2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'feriado_fijo', true),
  ('2026-04-03', 'Viernes Santo', 'feriado_fijo', true),
  ('2026-05-01', 'Día del Trabajador', 'feriado_fijo', true),
  ('2026-05-25', 'Día de la Revolución de Mayo', 'feriado_fijo', true),
  ('2026-06-15', 'Paso a la Inmortalidad del Gral. Martín Güemes (trasladado)', 'feriado_trasladable', true),
  ('2026-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', 'feriado_fijo', true),
  ('2026-07-09', 'Día de la Independencia', 'feriado_fijo', true),
  ('2026-07-10', 'Día no laborable (puente turístico)', 'no_laborable', true),
  ('2026-08-17', 'Paso a la Inmortalidad del Gral. José de San Martín', 'feriado_trasladable', true),
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural (trasladado)', 'feriado_trasladable', true),
  ('2026-11-23', 'Día de la Soberanía Nacional (trasladado)', 'feriado_trasladable', true),
  ('2026-12-07', 'Día no laborable (puente turístico)', 'no_laborable', true),
  ('2026-12-08', 'Día de la Inmaculada Concepción de María', 'feriado_fijo', true),
  ('2026-12-25', 'Navidad', 'feriado_fijo', true)
on conflict (fecha) do nothing;
