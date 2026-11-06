import type { McpServer } from '@modelcontextprotocol/server'
import type { PrismaClient } from '@prisma/client'
import { registerForecastTools } from './forecastTools'
import { registerReadTools } from './readTools'
import { registerWriteTools } from './writeTools'

// Every tool Claude gets. The public /tools page has to list them all; see
// src/app/tools/toolGroups.test.ts.
export function registerHusvanTools(
  server: McpServer,
  prisma: PrismaClient,
  userId: string
) {
  registerReadTools(server, prisma, userId)
  registerWriteTools(server, prisma, userId)
  registerForecastTools(server, prisma, userId)
}
