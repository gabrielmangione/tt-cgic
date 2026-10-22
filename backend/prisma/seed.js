const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@termometro.org'; 
  const plainPassword = 'AdminPassword123!'; 
  
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  const adminUser = await prisma.usuario.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      nombre: 'Admin Principal',
      passwordHash: hashedPassword, // <- Corrección aplicada aquí
      rol: 'ADMIN', 
    },
  });

  console.log('Usuario ADMIN creado:', adminUser.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
