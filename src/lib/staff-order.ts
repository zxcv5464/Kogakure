import type { Staff } from '../types'

export type StaffOrderChange = { id: string; before: number; after: number }
export type StaffOrderPlan = { ordered: Staff[]; changes: StaffOrderChange[] }
const LIMIT_LOW = -2147483648
const LIMIT_HIGH = 2147483647
const STEP = 1024

// One row is normally enough: insert a new order value between its neighbors.
// When legacy values are adjacent/duplicated, compact the list into spaced
// values. This deliberately avoids rewriting full staff profiles and photos.
export function planStaffReorder(rows: Staff[], movedId: string, targetIndex: number): StaffOrderPlan {
 const sourceIndex = rows.findIndex(person => person.id === movedId)
 if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= rows.length || sourceIndex === targetIndex) {
  return { ordered: rows, changes: [] }
 }
 const reordered = [...rows]
 const [moved] = reordered.splice(sourceIndex, 1)
 reordered.splice(targetIndex, 0, moved)

 const previous = reordered[targetIndex - 1]
 const following = reordered[targetIndex + 1]
 let candidate: number | null = null
 if (previous && following) {
  const gap = following.sortOrder - previous.sortOrder
  if (gap > 1) candidate = previous.sortOrder + Math.floor(gap / 2)
 } else if (previous) {
  if (previous.sortOrder <= LIMIT_HIGH - STEP) candidate = previous.sortOrder + STEP
 } else if (following) {
  if (following.sortOrder >= LIMIT_LOW + STEP) candidate = following.sortOrder - STEP
 }
 if (candidate !== null) {
  const single = reordered.map(person => person.id === movedId ? { ...person, sortOrder: candidate } : person)
  if (single.every((person, index) => index === 0 || single[index - 1].sortOrder < person.sortOrder)) {
   return { ordered: single, changes: [{ id: movedId, before: moved.sortOrder, after: candidate }] }
  }
 }
 const spaced = reordered.map((person, index) => ({ ...person, sortOrder: (index + 1) * STEP }))
 const changes = spaced.filter((person, index) => person.sortOrder !== reordered[index].sortOrder)
  .map(person => ({ id: person.id, before: rows.find(item => item.id === person.id)!.sortOrder, after: person.sortOrder }))
 return { ordered: spaced, changes }
}
