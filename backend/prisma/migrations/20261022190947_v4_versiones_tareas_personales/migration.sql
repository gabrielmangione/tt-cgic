-- CreateEnum
CREATE TYPE "EstadoEncuesta" AS ENUM ('VIGENTE', 'NO_RELEVADO');

-- CreateEnum
CREATE TYPE "EstadoTarea" AS ENUM ('PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'CANCELADA');

-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'ORGANIZACION';

-- AlterTable
ALTER TABLE "Encuesta" ADD COLUMN     "consentimientoDatos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "datosPersonales" JSONB,
ADD COLUMN     "estado" "EstadoEncuesta" NOT NULL DEFAULT 'VIGENTE',
ADD COLUMN     "modificadaAt" TIMESTAMP(3),
ADD COLUMN     "modificadaPorId" TEXT,
ADD COLUMN     "motivoCambio" TEXT,
ADD COLUMN     "raizId" TEXT,
ADD COLUMN     "tareaId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "zonaOrigen" TEXT NOT NULL DEFAULT 'SIN_ZONA';

-- AlterTable
ALTER TABLE "Formulario" ADD COLUMN     "datosPersonalesCampos" JSONB,
ADD COLUMN     "datosPersonalesFinalidad" TEXT,
ADD COLUMN     "pideDatosPersonales" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "organizacionId" TEXT;

-- CreateTable
CREATE TABLE "Tarea" (
    "id" TEXT NOT NULL,
    "faseId" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" "EstadoTarea" NOT NULL DEFAULT 'PENDIENTE',
    "metaEncuestas" INTEGER,
    "venceAt" TIMESTAMP(3),
    "creadaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TareaToZona" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Tarea_organizacionId_faseId_idx" ON "Tarea"("organizacionId", "faseId");

-- CreateIndex
CREATE UNIQUE INDEX "_TareaToZona_AB_unique" ON "_TareaToZona"("A", "B");

-- CreateIndex
CREATE INDEX "_TareaToZona_B_index" ON "_TareaToZona"("B");

-- CreateIndex
CREATE INDEX "Encuesta_faseId_estado_idx" ON "Encuesta"("faseId", "estado");

-- CreateIndex
CREATE INDEX "Encuesta_raizId_idx" ON "Encuesta"("raizId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encuesta" ADD CONSTRAINT "Encuesta_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_faseId_fkey" FOREIGN KEY ("faseId") REFERENCES "Fase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TareaToZona" ADD CONSTRAINT "_TareaToZona_A_fkey" FOREIGN KEY ("A") REFERENCES "Tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TareaToZona" ADD CONSTRAINT "_TareaToZona_B_fkey" FOREIGN KEY ("B") REFERENCES "Zona"("id") ON DELETE CASCADE ON UPDATE CASCADE;
