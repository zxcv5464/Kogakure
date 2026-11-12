// SSR content smoke test. No browser, Supabase credentials, or production writes.
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({
 server: { middlewareMode: true, hmr: false },
 appType: 'custom',
})

try {
 const { default: AboutPage } = await vite.ssrLoadModule('/src/pages/AboutPage.tsx')
 const html = renderToStaticMarkup(createElement(AboutPage))
 const count = pattern => [...html.matchAll(pattern)].length

 assert.match(html, /狐之館約/)
 assert.match(html, /旅人入館須知 · House Rules/)
 assert.match(html, /踏入鳥居之後，請將塵世的紛擾留在身後/)
 assert.match(html, /願每一位誤入狐隱的旅人，都能帶走一段值得珍藏的緣分/)
 assert.match(html, /狐隱 KOGAKURE · 館方敬上/)

 assert.equal(count(/class="house-rules-chapter"/g), 5, 'Should render five chapters')
 assert.equal(count(/class="house-rules-rule"/g), 14, 'Should render fourteen rules')
 assert.equal(count(/class="house-rules-rule-number"/g), 14, 'Each rule needs a visible number')

 for (let i = 1; i <= 5; i++) {
  assert.ok(html.includes('href="#chapter-' + i + '"'), 'Missing chapter shortcut ' + i)
  assert.ok(html.includes('id="chapter-' + i + '"'), 'Missing chapter target ' + i)
 }
 const titles = [
  '入館禮儀', '服裝與儀容', '館內交流',
  '角色與現實的界線', '尊重彼此的意願', '禁止不當行為',
  '公共區域', '湯浴與包廂', '攝影與留念',
  '餐飲及湯浴服務', '占卜及特殊體驗', '預約與指名',
  '費用與付款', '館方管理與處置',
 ]
 for (let i = 0; i < titles.length; i++) {
  const number = String(i + 1).padStart(2, '0')
  assert.ok(html.includes('>' + number + '．</span>'), 'Missing rule number ' + number)
  assert.ok(html.includes(titles[i]), 'Missing rule ' + titles[i])
 }
 for (const required of [
  '/emotelog off', '色情 RP（ERP）', '個人資訊', '未經館方同意，禁止直播',
  'Gil 計價', '現實金錢', '遊戲官方使用規範',
 ]) assert.ok(html.includes(required), 'Missing safety/payment content: ' + required)

 assert.ok(!html.includes('內容籌備中'), 'Old placeholder should not show')
 console.log('PASS: five chapters, fourteen rules, all chapter links, key policies and full house-rules page render')
} finally {
 await vite.close()
}
