import './booking-loading.css'
export default function BookingLoading(){
 return <div className="booking-loading" role="status" aria-live="polite">
  <span aria-hidden="true">◇</span><p>正在尋訪館中的狐姬…</p>
 </div>
}
