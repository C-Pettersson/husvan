// The MCP tools as the public /tools page presents them, grouped by what they
// do to the user's data. toolGroups.test.ts fails when a tool is registered
// without being listed here, or without a text in both languages.
export const TOOL_GROUPS = [
  {
    key: 'read',
    tools: [
      'list_houses',
      'get_house',
      'get_document',
      'get_document_file',
      'type_library',
      'open_questions',
      'compare',
    ],
  },
  {
    key: 'draft',
    tools: [
      'propose_changes',
      'add_work_item',
      'answer_questions',
      'edit_draft',
      'confirm_changes',
    ],
  },
  {
    key: 'direct',
    tools: [
      'create_house',
      'save_document',
      'update_listing',
      'set_assumption',
      'forecast',
      'mark_library_review',
    ],
  },
] as const

export const TOOL_NAMES: string[] = TOOL_GROUPS.flatMap((g) => [...g.tools])
