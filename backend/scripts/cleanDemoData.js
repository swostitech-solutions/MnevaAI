import 'dotenv/config'
import { prisma } from '../src/config/prisma.js'

const demoEmails = ['arjun@mneva.ai']
const demoIds = ['usr_demo_arjun']

try {
  const result = await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { in: demoEmails } },
        { id: { in: demoIds } },
      ],
    },
  })

  console.log(`Deleted ${result.count} demo user(s). Related notifications, trust scores, and ledgers were removed by cascade.`)
} catch (error) {
  console.error(`Demo cleanup failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
