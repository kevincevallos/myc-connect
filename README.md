# MYC Connect — Starter v0.1

Primer prototipo interno del CRM / Business Matching Platform de Mishki Yaku Collective.

## 1. Requisitos
- Node.js 22+
- npm
- PostgreSQL accesible (por ejemplo Railway)

## 2. Configuración
1. Copia `.env.example` como `.env`.
2. Pega tu `DATABASE_URL` de PostgreSQL.
3. Ejecuta:
   - `npm install`
   - `npx prisma generate`
   - `npx prisma migrate dev --name init`
   - `npm run dev`

En PowerShell, si la política de ejecución bloquea `npm.ps1`, usa:
- `npm.cmd install`
- `npx.cmd prisma generate`
- `npx.cmd prisma migrate dev --name init`
- `npm.cmd run dev`

## 3. Abrir
- http://localhost:3000
- API health: http://localhost:3000/api/health

## 4. Qué incluye esta v0.1
- Dashboard base
- Métricas conectadas a PostgreSQL
- Registro de organizaciones
- Detección de duplicados por nombre + país
- Listado de organizaciones
- Esquema inicial para contactos, interacciones, oportunidades, matches y tareas
