import type { McpServer } from '@modelcontextprotocol/server'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import en from '../../../messages/en.json'
import sv from '../../../messages/sv.json'
import { registerHusvanTools } from '@/server/mcp/tools'
import { TOOL_GROUPS, TOOL_NAMES } from './toolGroups'

type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean }

function registeredTools() {
  const tools = new Map<string, Annotations>()
  const server = {
    registerTool: (name: string, config: { annotations?: Annotations }) =>
      tools.set(name, config.annotations ?? {}),
  } as unknown as McpServer
  registerHusvanTools(server, {} as PrismaClient, 'user')
  return tools
}

const group = (key: (typeof TOOL_GROUPS)[number]['key']): string[] => [
  ...TOOL_GROUPS.find((g) => g.key === key)!.tools,
]

describe('the /tools page', () => {
  const tools = registeredTools()

  it('lists every registered tool exactly once', () => {
    expect([...TOOL_NAMES].sort()).toEqual([...tools.keys()].sort())
  })

  it('calls a tool read-only only when it is registered as read-only', () => {
    const readOnly = [...tools]
      .filter(([, annotations]) => annotations.readOnlyHint === true)
      .map(([name]) => name)
    expect(group('read').sort()).toEqual(readOnly.sort())
  })

  it('can say that no tool deletes anything', () => {
    const writing = [...tools].filter(([, a]) => a.readOnlyHint !== true)
    expect(writing.length).toBeGreaterThan(0)
    for (const [name, annotations] of writing) {
      expect([name, annotations.destructiveHint]).toEqual([name, false])
    }
  })

  it.each([
    ['sv', sv],
    ['en', en],
  ])('has a text for every tool in %s and none left over', (_, messages) => {
    const list: Record<string, { title?: string; body?: string }> =
      messages.tools.list
    expect(Object.keys(list).sort()).toEqual([...TOOL_NAMES].sort())
    for (const name of TOOL_NAMES) {
      expect(list[name].title, name).toBeTruthy()
      expect(list[name].body, name).toBeTruthy()
    }
  })
})
