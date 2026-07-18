import { prisma } from './src/config/prisma.js';

(async () => {
  try {
    console.log('Attempting to connect to database...');
    await prisma.$connect();
    console.log('✅ Connected to database');

    const user = await prisma.user.findFirst();
    if (user) {
      console.log('Sample user found:', { id: user.id, email: user.email, name: user.name });
    } else {
      console.log('No users found in the `User` table.');
    }

    // Show counts for some tables to verify schema
    const userCount = await prisma.user.count();
    const notifCount = await prisma.notification.count();
    console.log(`Counts -> users: ${userCount}, notifications: ${notifCount}`);
  } catch (err) {
    console.error('DB connection or query failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
