import './staff-loading.css'

export default function StaffLoading() {
 return <div className="staff-loading" role="status" aria-label="狐火正在喚醒名帖">
  <div className="staff-loading__cards" aria-hidden="true">
   {[0, 1].map(index => <div className="staff-loading__card" key={index} style={{ animationDelay: index * 140 + 'ms' }}>
    <div className="staff-loading__loop"><span /></div>
    <div className="staff-loading__body">
     <div className="staff-loading__glow">狐</div>
     <div className="staff-loading__line staff-loading__line--short" />
     <div className="staff-loading__line staff-loading__line--wide" />
     <div className="staff-loading__line staff-loading__line--thin" />
    </div>
   </div>)}
  </div>
  <div className="staff-loading__caption" aria-hidden="true">
   <span className="staff-loading__spark">✦</span>
   <span>狐火正輕輕喚醒名帖</span>
   <span className="staff-loading__spark">✦</span>
  </div>
 </div>
}
