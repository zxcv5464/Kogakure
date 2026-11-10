import './staff-loading.css'

export default function StaffLoading() {
 return <div className="staff-loading" role="status" aria-live="polite" aria-label="狐姬名冊載入中">
  <div className="staff-loading__foxfire" aria-hidden="true">✧</div>
  <p className="staff-loading__caption">狐火正輕輕喚醒名帖</p>
 </div>
}
