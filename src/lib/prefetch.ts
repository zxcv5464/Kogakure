// Warm the lazy component and public staff query only after the visitor shows
// intent to visit the staff page. No extra Supabase requests on page load.
export function prefetchStaffPage(): void {
 void Promise.all([
  import('../pages/StaffPage'),
  import('./public-staff').then(module => module.loadPublicStaff()),
 ]).catch(() => { /* The staff page handles and displays any error. */ })
}

/** Warm the 4-week calendar only when the traveller intends to open shifts.
 * The module deduplicates requests, so entering the page reuses this fetch. */
export function prefetchShiftsPage():void{
 void Promise.all([
  import('../pages/ShiftsPage'),
  import('./public-shifts').then(module=>module.prefetchCurrentPublicShifts()),
 ]).catch(()=>{
  // The shifts page handles errors and provides a manual refresh button.
 })
}
