// Tool answers: JSON text for the model and the same object as structured
// content. An error is a result with isError, so Claude reads why.
export function result(value: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  }
}

export function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}
