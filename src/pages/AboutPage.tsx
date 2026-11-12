import type { ReactNode } from 'react'
import './about-page.css'

type HouseRule = {
 number: string
 title: string
 paragraphs: ReactNode[]
}

type Chapter = {
 id: string
 number: string
 title: string
 range: string
 rules: HouseRule[]
}

const chapters: Chapter[] = [
 {
  id: 'chapter-1',
  number: '第一章',
  title: '入館之禮',
  range: '01 — 03',
  rules: [
   {
    number: '01',
    title: '入館禮儀',
    paragraphs: [
     '進入館內後，請收起武器、寵物及其他大型召喚物，並切換為走路模式。請勿頻繁奔跑、跳躍、施放技能或使用大量特效，以維護館內寧靜。',
    ],
   },
   {
    number: '02',
    title: '服裝與儀容',
    paragraphs: [
     '歡迎旅人以喜愛的服裝造訪。惟請避免過度裸露、強烈光效或刻意破壞館內氛圍的裝扮。湯浴區可配合情境穿著浴衣、泳裝等適當服飾。',
    ],
   },
   {
    number: '03',
    title: '館內交流',
    paragraphs: [
     '請尊重其他旅人與狐姬，避免洗頻、過度使用情感動作、未經允許的演奏或其他干擾行為。',
     <>建議關閉情感動作的聊天紀錄，可輸入 <code>/emotelog off</code>。</>,
    ],
   },
  ],
 },
 {
  id: 'chapter-2',
  number: '第二章',
  title: '狐姬之約',
  range: '04 — 06',
  rules: [
   {
    number: '04',
    title: '角色與現實的界線',
    paragraphs: [
     '狐隱是以 FFXIV 為舞台的角色扮演場所。',
     '館內狐姬以角色身份接待旅人，所有互動均以遊戲情境為基礎。請勿強迫工作人員透露現實身份、私人聯絡方式或其他個人資訊。',
    ],
   },
   {
    number: '05',
    title: '尊重彼此的意願',
    paragraphs: [
     '狐姬有權拒絕任何超出服務範圍、令人不適或未經同意的要求。',
     '未取得同意前，請勿擅自進行親密互動、強迫好友申請、要求私下陪伴或持續追求。',
    ],
   },
   {
    number: '06',
    title: '禁止不當行為',
    paragraphs: [
     '狐隱不提供色情 RP（ERP）及相關成人服務。嚴禁性騷擾、歧視、辱罵、惡意糾纏與任何違反遊戲規範的行為。',
    ],
   },
  ],
 },
 {
  id: 'chapter-3',
  number: '第三章',
  title: '館內之境',
  range: '07 — 09',
  rules: [
   {
    number: '07',
    title: '公共區域',
    paragraphs: [
     '開放區域歡迎旅人自由交流、休憩與欣賞館內佈置。',
     '請勿占用其他旅人的座位、干擾服務流程，或擅自進入工作人員專用區域。',
    ],
   },
   {
    number: '08',
    title: '湯浴與包廂',
    paragraphs: [
     '湯浴服務區、獨立包廂及特殊體驗空間，請依照預約、現場接待及狐姬指引進入。',
     '未經允許，請勿擅闖正在使用的私人空間，亦不得干擾其他旅人的服務。',
    ],
   },
   {
    number: '09',
    title: '攝影與留念',
    paragraphs: [
     '館內開放一般個人截圖，但若拍攝內容包含其他旅人或狐姬，請先取得同意。',
     '未經館方同意，禁止直播、錄影或對外公開私人服務內容與聊天紀錄。禁止未經同意將他人角色照片用於不當用途。',
    ],
   },
  ],
 },
 {
  id: 'chapter-4',
  number: '第四章',
  title: '服務之儀',
  range: '10 — 13',
  rules: [
   {
    number: '10',
    title: '餐飲及湯浴服務',
    paragraphs: [
     '餐點、飲品、湯浴及其他服務，請依館內菜單與當日供應內容點選。',
     '如有服務時間、名額或區域限制，將由狐姬於服務前告知。',
    ],
   },
   {
    number: '11',
    title: '占卜及特殊體驗',
    paragraphs: [
     '占卜、祈願及特殊體驗均屬 RP 娛樂服務，不代表對現實未來的保證，亦不取代專業建議。',
     '體驗開始前，館方將說明服務內容、時間及相關費用。旅人可拒絕不希望參與的互動情節。',
    ],
   },
   {
    number: '12',
    title: '預約與指名',
    paragraphs: [
     '預約、指定狐姬及包廂使用，均以當日排班、開放名額與館方確認結果為準。',
     '請尊重狐姬的意願與服務安排，不得要求未值班人員額外接待，亦不得強迫延長服務時間。',
    ],
   },
   {
    number: '13',
    title: '費用與付款',
    paragraphs: [
     '狐隱的遊戲內收費服務，僅以 FFXIV 遊戲貨幣 Gil 計價。價格依官方公開菜單或服務前確認內容為準，不接受以現實金錢交換遊戲內服務。',
     '請於交易前確認項目與金額；取消、變更及退款事項，由館方依事先公布的政策處理。',
    ],
   },
  ],
 },
 {
  id: 'chapter-5',
  number: '第五章',
  title: '隱世之誓',
  range: '14',
  rules: [
   {
    number: '14',
    title: '館方管理與處置',
    paragraphs: [
     '如有違反館內規範或妨礙他人體驗之情事，狐隱得視情況進行提醒、停止服務、請求離館，必要時拒絕日後接待。',
     '涉及嚴重騷擾、威脅及其他違反 FFXIV 使用規範的行為，館方得直接中止接待，並由受影響者循遊戲官方管道反映。',
     '所有館內規則均以遊戲官方使用規範為前提，不取代遊戲官方的判定權限。',
    ],
   },
  ],
 },
]

export default function AboutPage() {
 return (
  <div className="house-rules-page">
   <header className="house-rules-hero">
    <p className="house-rules-brand">狐隱 · KOGAKURE</p>
    <span className="house-rules-ornament" aria-hidden="true">◇</span>
    <h1>狐之館約</h1>
    <p className="house-rules-subtitle">旅人入館須知 · House Rules</p>
    <blockquote className="house-rules-epigraph">「踏入鳥居之後，請將塵世的紛擾留在身後。」</blockquote>
   </header>

   <div className="house-rules-content">
    <section className="house-rules-welcome" aria-label="入館前言">
     <p className="house-rules-greeting">歡迎來到狐隱。</p>
     <p>這裡是遠離塵囂的隱世之館，旅人可以享用茶點、浸浴休憩、探尋命運的指引，或與館內的狐姬共度一段靜謐時光。</p>
     <p>為了讓每位踏入狐隱的旅人，都能安心享受這段相遇，還請您遵守以下約定。</p>
    </section>

    <nav className="house-rules-index" aria-label="館約章節導覽">
     <p className="house-rules-index-label">館約目錄 <span>五章 · 十四約</span></p>
     <div className="house-rules-index-links">
      {chapters.map(chapter => (
       <a key={chapter.id} href={'#' + chapter.id}>{chapter.number} <span>{chapter.title}</span></a>
      ))}
     </div>
    </nav>

    <div className="house-rules-chapters">
     {chapters.map(chapter => (
      <section key={chapter.id} id={chapter.id} className="house-rules-chapter" aria-labelledby={chapter.id + '-title'}>
       <header className="house-rules-chapter-heading">
        <div className="house-rules-chapter-heading-text">
         <p className="house-rules-chapter-number">{chapter.number}</p>
         <h2 id={chapter.id + '-title'}>{chapter.title}</h2>
        </div>
        <span className="house-rules-chapter-range" aria-hidden="true">{chapter.range}</span>
       </header>
       <ol className="house-rules-list">
        {chapter.rules.map(rule => (
         <li key={rule.number} className="house-rules-rule">
          <h3><span className="house-rules-rule-number">{rule.number}．</span>{rule.title}</h3>
          {rule.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
         </li>
        ))}
       </ol>
      </section>
     ))}
    </div>

    <footer className="house-rules-ending">
     <span className="house-rules-ornament" aria-hidden="true">◇</span>
     <p className="house-rules-farewell">「願每一位誤入狐隱的旅人，都能帶走一段值得珍藏的緣分。」</p>
     <p className="house-rules-signature">狐隱 KOGAKURE · 館方敬上</p>
    </footer>
   </div>
  </div>
 )
}
