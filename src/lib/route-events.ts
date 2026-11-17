// Emitted once the staff directory can show its actual content (or an error).
export const STAFF_PAGE_READY_EVENT = 'kogakure:staff-page-ready'
// Emitted after the tea menu has resolved live Supabase data (or a clearly labeled preview).
export const MENU_PAGE_READY_EVENT = 'kogakure:menu-page-ready'
export const BOOKING_PAGE_READY_EVENT = 'kogakure:booking-page-ready'

// The public four-week calendar mounts its 28 stable date cells before the route fade reveals it.
export const SHIFT_PAGE_READY_EVENT = 'kogakure:shift-page-ready'

// Emitted only when a lazy public route and its stylesheet have committed.
export const PUBLIC_ROUTE_MOUNTED_EVENT = 'kogakure:public-route-mounted'
