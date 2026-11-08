import type { Staff } from '../types'
import { asset } from '../lib/paths'

// Placeholder characters only; replace via admin before official opening.
export const demoStaff: Staff[] = [
 {
  id:'demo-1',
  name:'月詠',
  role:'占卜師',
  tagline:'夜色之中，答案或許正悄然浮現。',
  bio:'喜愛在靜謐的夜晚傾聽旅人的故事，偶爾也會讓手中的卡牌替你指引新的方向。',
  imageUrl:asset('images/staff/staff-01-full.webp'),
  thumbnailUrl:asset('images/staff/staff-01-card.webp'),
  themeColor:'#86cfc5',
  effect:'foxfire',
  socials:[],
  services:['占卜'],
  published:true,
  sortOrder:1,
 },
 {
  id:'demo-2',
  name:'白羽',
  role:'接待者',
  tagline:'願這一夜的暖燈，替你拂去旅途疲憊。',
  bio:'在淡淡木香與柔和燈火間，陪伴每一位偶然造訪狐隱的旅人。',
  imageUrl:asset('images/staff/staff-02-full.webp'),
  thumbnailUrl:asset('images/staff/staff-02-card.webp'),
  themeColor:'#e5ad99',
  effect:'sakura',
  socials:[],
  services:['接待'],
  published:true,
  sortOrder:2,
 },
]
