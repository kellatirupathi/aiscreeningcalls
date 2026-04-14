import { createServer } from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { createMediaBridgeServer } from "./websocket/MediaBridgeServer.js";
import { prisma } from "./db/prisma.js";
import "./workers/callWorker.js"; // activates Bull queue processor

const app = createApp();
const server = createServer(app);

createMediaBridgeServer(server);

// Seed default phone numbers for all orgs that don't have them yet
async function seedDefaultNumbers() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });

  for (const org of orgs) {
    if (env.PLIVO_DEFAULT_NUMBER) {
      const exists = await prisma.phoneNumber.findFirst({
        where: { organizationId: org.id, phoneNumber: env.PLIVO_DEFAULT_NUMBER }
      });
      if (!exists) {
        await prisma.phoneNumber.create({
          data: {
            organizationId: org.id,
            provider: "plivo",
            phoneNumber: env.PLIVO_DEFAULT_NUMBER,
            label: "Plivo Default",
            isActive: true,
            isDefaultOutbound: true
          }
        });
        console.log(`Seeded Plivo default number for org ${org.id}`);
      }
    }

    if (env.EXOTEL_DEFAULT_NUMBER) {
      const exists = await prisma.phoneNumber.findFirst({
        where: { organizationId: org.id, phoneNumber: env.EXOTEL_DEFAULT_NUMBER }
      });
      if (!exists) {
        await prisma.phoneNumber.create({
          data: {
            organizationId: org.id,
            provider: "exotel",
            phoneNumber: env.EXOTEL_DEFAULT_NUMBER,
            label: "Exotel Default",
            isActive: true,
            isDefaultOutbound: false
          }
        });
        console.log(`Seeded Exotel default number for org ${org.id}`);
      }
    }
  }
}

server.listen(env.PORT, async () => {
  console.log(`Server running on ${env.SERVER_URL}`);
  await seedDefaultNumbers().catch((err) => console.error("Seed error:", err.message));
});
