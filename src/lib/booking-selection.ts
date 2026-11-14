// One ordered source of truth for form submission and confirmation.
// The primary nominee is first, followed by every explicitly selected
// additional person; only display-name snapshots are exposed in the UI.
export type BookingNominee = { id: string; name: string; primary: boolean }
type Person = { id: string; name: string }

export function resolveBookingNominees(
 primary: Person | null,
 people: readonly Person[],
 additionalIds: readonly string[],
 withOthers: boolean
): BookingNominee[] {
 if (!primary) return []
 const nominees: BookingNominee[] = [{ id: primary.id, name: primary.name, primary: true }]
 if (!withOthers) return nominees
 const byId = new Map(people.map(person => [person.id, person]))
 const seen = new Set([primary.id])
 for (const id of additionalIds) {
  if (seen.has(id)) continue
  const person = byId.get(id)
  if (!person) continue
  nominees.push({ id, name: person.name, primary: false })
  seen.add(id)
 }
 return nominees
}
