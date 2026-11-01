// SCB's statistical database through PxWebApi 2.0 (CC0, at most 30 calls per
// 10 s and 150,000 cells per call). Tables are fetched as JSON-stat 2.
const API = 'https://statistikdatabasen.scb.se/api/v2'

type JsonStat = {
  id: string[]
  size: number[]
  dimension: Record<string, { category: { index: Record<string, number> } }>
  value: (number | null)[]
}

export type Selection = Record<string, string[]>

// One row per cell: the code of every dimension plus the value. SCB marks
// missing values as null ('..').
export type Row = Record<string, string> & { value: number | null }

export async function fetchTable(
  tableId: string,
  selection: Selection
): Promise<Row[]> {
  const res = await fetch(
    `${API}/tables/${tableId}/data?lang=sv&outputFormat=json-stat2`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        selection: Object.entries(selection).map(
          ([variableCode, valueCodes]) => ({
            variableCode,
            valueCodes,
          })
        ),
      }),
    }
  )
  if (!res.ok)
    throw new Error(`SCB ${tableId}: ${res.status} ${await res.text()}`)
  return toRows((await res.json()) as JsonStat)
}

export async function fetchValueCodes(
  tableId: string,
  variable: string
): Promise<string[]> {
  const res = await fetch(`${API}/tables/${tableId}/metadata?lang=sv`)
  if (!res.ok) throw new Error(`SCB ${tableId} metadata: ${res.status}`)
  const meta = (await res.json()) as JsonStat
  return Object.keys(meta.dimension[variable].category.index)
}

export function toRows(data: JsonStat): Row[] {
  // Codes per dimension in position order.
  const codes = data.id.map((dim) => {
    const index = data.dimension[dim].category.index
    const ordered: string[] = []
    for (const [code, position] of Object.entries(index))
      ordered[position] = code
    return ordered
  })
  return data.value.map((value, flat) => {
    const row: Record<string, string> = {}
    // Row-major: the last dimension varies fastest.
    let rest = flat
    for (let d = data.id.length - 1; d >= 0; d--) {
      row[data.id[d]] = codes[d][rest % data.size[d]]
      rest = Math.floor(rest / data.size[d])
    }
    return { ...row, value } as Row
  })
}
