-- =========================================================
-- DATOS INICIALES OPCIONALES
-- =========================================================
-- Pacientes detectados en tus archivos Excel (Asistencia.xlsx / Control_de_pagos.xlsx).
-- Revisá el servicio asignado a cada uno (se infirió por el nombre de la fila:
-- quien tenía "TRATAMIENTO" en el nombre quedó como tratamiento, el resto quedó
-- como inclusión escolar a modo de ejemplo -> AJUSTALO antes de correr esto).
--
-- Ejecutar en Supabase SQL Editor DESPUÉS de correr schema.sql

insert into pacientes (nombre, servicio, fecha_inicio, activo) values
  ('Aquino Jeremias', 'inclusion_escolar', '2025-08-01', true),
  ('Aquino Jeremias (Tratamiento)', 'tratamiento', '2025-11-01', true),
  ('Castro Morena', 'inclusion_escolar', '2023-01-01', true),
  ('Reynoso Naiara', 'inclusion_escolar', '2025-08-01', true),
  ('Bustos Ambar', 'inclusion_escolar', '2025-09-01', true),
  ('Garcia Abel', 'inclusion_escolar', '2025-08-01', true),
  ('Cuello Efrain', 'inclusion_escolar', '2025-09-01', true),
  ('Novillo Ian Adriel', 'inclusion_escolar', '2025-09-01', true),
  ('Clemente Maximo', 'inclusion_escolar', '2025-09-01', true),
  ('Sambrana Valentino', 'inclusion_escolar', '2025-07-01', true)
on conflict do nothing;

-- Tarifas de ejemplo detectadas en Control_de_pagos.xlsx (2026).
-- AJUSTÁ los valores y la fecha de vigencia real antes de usarlas.
insert into tarifas (servicio, valor_hora, vigente_desde) values
  ('inclusion_escolar', 9169.70, '2026-01-01'),
  ('tratamiento', 11727.65, '2026-01-01')
on conflict do nothing;
