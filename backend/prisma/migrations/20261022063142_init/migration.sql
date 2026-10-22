-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'OPERADOR');

-- CreateEnum
CREATE TYPE "TipoPregunta" AS ENUM ('TEXTO', 'NUMERO', 'BOOLEANO', 'SELECCION_UNICA', 'SELECCION_MULTIPLE', 'ESCALA', 'FECHA');

-- CreateEnum
CREATE TYPE "TipoCapa" AS ENUM ('GENERAL', 'SECCION', 'BASE', 'ADICIONAL');

-- CreateEnum
CREATE TYPE "Agregacion" AS ENUM ('SUMA', 'PROMEDIO', 'CONTEO');

-- CreateEnum
CREATE TYPE "EstadoIA" AS ENUM ('PENDIENTE', 'PROCESANDO', 'CLASIFICADA', 'ERROR');

-- CreateEnum
CREATE TYPE "OrigenEncuesta" AS ENUM ('MANUAL', 'CSV');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'OPERADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jurisdiccion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "geometria" JSONB NOT NULL,
    "centro" JSONB NOT NULL,
    "bounds" JSONB NOT NULL,
    "fuente" TEXT,

    CONSTRAINT "Jurisdiccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zona" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "geometria" JSONB,
    "jurisdiccionId" TEXT,

    CONSTRAINT "Zona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organizacion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "contacto" TEXT,

    CONSTRAINT "Organizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "jurisdiccionId" TEXT NOT NULL,
    "eliminado" BOOLEAN NOT NULL DEFAULT false,
    "eliminadoAt" TIMESTAMP(3),
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fase" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Fase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formulario" (
    "id" TEXT NOT NULL,
    "faseId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "variableObjetivoId" TEXT,

    CONSTRAINT "Formulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seccion" (
    "id" TEXT NOT NULL,
    "formularioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "capaId" TEXT,

    CONSTRAINT "Seccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pregunta" (
    "id" TEXT NOT NULL,
    "formularioId" TEXT NOT NULL,
    "seccionId" TEXT,
    "clave" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "ayuda" TEXT,
    "tipo" "TipoPregunta" NOT NULL,
    "opciones" JSONB,
    "requerida" BOOLEAN NOT NULL DEFAULT false,
    "esCausaUrgencia" BOOLEAN NOT NULL DEFAULT false,
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Pregunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capa" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCapa" NOT NULL DEFAULT 'ADICIONAL',
    "color" TEXT NOT NULL DEFAULT '#1F6F8B',
    "icon" TEXT,
    "geojson" JSONB,
    "aliasVariables" JSONB NOT NULL DEFAULT '{}',
    "variablesActivas" JSONB NOT NULL DEFAULT '[]',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Capa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapaPregunta" (
    "capaId" TEXT NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "agregacion" "Agregacion" NOT NULL DEFAULT 'SUMA',

    CONSTRAINT "CapaPregunta_pkey" PRIMARY KEY ("capaId","preguntaId")
);

-- CreateTable
CREATE TABLE "ResumenCapa" (
    "id" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "zonaKey" TEXT NOT NULL DEFAULT '_',
    "preguntaId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT '',
    "n" INTEGER NOT NULL DEFAULT 0,
    "suma" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ResumenCapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encuesta" (
    "id" TEXT NOT NULL,
    "faseId" TEXT NOT NULL,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "zonaKey" TEXT NOT NULL DEFAULT '_',
    "respuestas" JSONB NOT NULL,
    "origen" "OrigenEncuesta" NOT NULL DEFAULT 'MANUAL',
    "cargadaPorId" TEXT NOT NULL,
    "estadoIA" "EstadoIA" NOT NULL DEFAULT 'PENDIENTE',
    "iaIntentos" INTEGER NOT NULL DEFAULT 0,
    "iaProximoIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iaActualizadoAt" TIMESTAMP(3),
    "scoreIA" DOUBLE PRECISION,
    "prioridad" TEXT,
    "necesidadesPrimarias" JSONB,
    "modeloVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Encuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estadistico" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "formula" TEXT NOT NULL,
    "formato" TEXT NOT NULL DEFAULT 'numero',
    "unidad" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Estadistico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OrganizacionToZona" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Evento_eliminado_idx" ON "Evento"("eliminado");

-- CreateIndex
CREATE UNIQUE INDEX "Formulario_faseId_key" ON "Formulario"("faseId");

-- CreateIndex
CREATE UNIQUE INDEX "Pregunta_formularioId_clave_key" ON "Pregunta"("formularioId", "clave");

-- CreateIndex
CREATE INDEX "Capa_eventoId_idx" ON "Capa"("eventoId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumenCapa_capaId_zonaKey_preguntaId_categoria_key" ON "ResumenCapa"("capaId", "zonaKey", "preguntaId", "categoria");

-- CreateIndex
CREATE INDEX "Encuesta_faseId_estadoIA_iaProximoIntento_idx" ON "Encuesta"("faseId", "estadoIA", "iaProximoIntento");

-- CreateIndex
CREATE UNIQUE INDEX "_OrganizacionToZona_AB_unique" ON "_OrganizacionToZona"("A", "B");

-- CreateIndex
CREATE INDEX "_OrganizacionToZona_B_index" ON "_OrganizacionToZona"("B");

-- AddForeignKey
ALTER TABLE "Zona" ADD CONSTRAINT "Zona_jurisdiccionId_fkey" FOREIGN KEY ("jurisdiccionId") REFERENCES "Jurisdiccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_jurisdiccionId_fkey" FOREIGN KEY ("jurisdiccionId") REFERENCES "Jurisdiccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fase" ADD CONSTRAINT "Fase_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formulario" ADD CONSTRAINT "Formulario_faseId_fkey" FOREIGN KEY ("faseId") REFERENCES "Fase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formulario" ADD CONSTRAINT "Formulario_variableObjetivoId_fkey" FOREIGN KEY ("variableObjetivoId") REFERENCES "Pregunta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seccion" ADD CONSTRAINT "Seccion_formularioId_fkey" FOREIGN KEY ("formularioId") REFERENCES "Formulario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seccion" ADD CONSTRAINT "Seccion_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "Capa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pregunta" ADD CONSTRAINT "Pregunta_formularioId_fkey" FOREIGN KEY ("formularioId") REFERENCES "Formulario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pregunta" ADD CONSTRAINT "Pregunta_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capa" ADD CONSTRAINT "Capa_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapaPregunta" ADD CONSTRAINT "CapaPregunta_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "Capa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapaPregunta" ADD CONSTRAINT "CapaPregunta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumenCapa" ADD CONSTRAINT "ResumenCapa_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "Capa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumenCapa" ADD CONSTRAINT "ResumenCapa_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encuesta" ADD CONSTRAINT "Encuesta_faseId_fkey" FOREIGN KEY ("faseId") REFERENCES "Fase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encuesta" ADD CONSTRAINT "Encuesta_cargadaPorId_fkey" FOREIGN KEY ("cargadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estadistico" ADD CONSTRAINT "Estadistico_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrganizacionToZona" ADD CONSTRAINT "_OrganizacionToZona_A_fkey" FOREIGN KEY ("A") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrganizacionToZona" ADD CONSTRAINT "_OrganizacionToZona_B_fkey" FOREIGN KEY ("B") REFERENCES "Zona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
