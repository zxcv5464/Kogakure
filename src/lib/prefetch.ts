// Warm the lazy component and public staff query only after the visitor shows
// intent to visit the staff page. No extra Supabase requests on page load.
export function prefetchStaffPage(): void {
 void Promise.all([
  import('../pages/StaffPage'),
  import('./public-staff').then(module => module.loadPublicStaff()),
 ]).catch(() => { /* The staff page handles and displays any error. */ })
}
