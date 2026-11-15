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

/** Only on hover/focus/touch intent: reuse a brief published-content cache
 * instead of making a fresh Supabase request on every visit. */
export function prefetchServicesPage():void{
 void Promise.all([
  import('../pages/ServicesPage'),
  import('./public-services').then(module=>module.prefetchPublicServices()),
 ]).catch(()=>{
  // The services page displays any error and can be revisited to retry.
 })
}
