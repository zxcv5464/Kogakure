import { configured } from './config'
import { supabase } from './supabase'

export type MenuCategory = {
 id: string
 ordinalLabel: string
 name: string
 subtitle: string
 description: string
 sortOrder: number
 published: boolean
 updatedAt: string
}
export type MenuItem = {
 id: string
 categoryId: string
 name: string
 description: string
 priceGil: number
 sortOrder: number
 published: boolean
 available: boolean
 updatedAt: string
}
export type MenuCatalog = { categories: MenuCategory[]; items: MenuItem[] }

type CategoryRow = {
 id: string; ordinal_label: string; name: string; subtitle: string
 description: string; sort_order: number; is_published: boolean; updated_at: string
}
type ItemRow = {
 id: string; category_id: string; name: string; description: string
 price_gil: number; sort_order: number; is_published: boolean
 is_available: boolean; updated_at: string
}

export const initialMenu: MenuCatalog = {
 categories: [
  { id: '10000000-0000-4000-8000-000000000001', ordinalLabel: '壹', name: '茶飲', subtitle: '茶寮之卷', description: '', sortOrder: 10, published: true, updatedAt: '' },
  { id: '10000000-0000-4000-8000-000000000002', ordinalLabel: '貳', name: '和菓', subtitle: '甘味之卷', description: '', sortOrder: 20, published: true, updatedAt: '' },
  { id: '10000000-0000-4000-8000-000000000003', ordinalLabel: '參', name: '御膳', subtitle: '狐宴之卷', description: '由館內精選茶飲與茶點相佐，為旅人獻上一席雅緻茶宴。', sortOrder: 30, published: true, updatedAt: '' },
 ],
 items: [
  { id: '20000000-0000-4000-8000-000000000001', categoryId: '10000000-0000-4000-8000-000000000001', name: '月白蕎麥茶', description: '淡雅蕎麥香氣，溫潤而悠長。', priceGil: 5000, sortOrder: 10, published: true, available: true, updatedAt: '' },
  { id: '20000000-0000-4000-8000-000000000002', categoryId: '10000000-0000-4000-8000-000000000001', name: '狐火多瑪茶', description: '來自多瑪的茶韻，藏著一縷異鄉風情。', priceGil: 5000, sortOrder: 20, published: true, available: true, updatedAt: '' },
  { id: '20000000-0000-4000-8000-000000000003', categoryId: '10000000-0000-4000-8000-000000000001', name: '紫宵莓果茶', description: '仙子莓的清甜果香，宛如紫夜中的微光。', priceGil: 5000, sortOrder: 30, published: true, available: true, updatedAt: '' },
  { id: '20000000-0000-4000-8000-000000000004', categoryId: '10000000-0000-4000-8000-000000000001', name: '狐隱抹茶', description: '細緻而醇厚的抹茶香，靜享片刻茶寮時光。', priceGil: 5000, sortOrder: 40, published: true, available: true, updatedAt: '' },
  { id: '20000000-0000-4000-8000-000000000005', categoryId: '10000000-0000-4000-8000-000000000002', name: '月見芝麻酥', description: '芝麻烘焙的酥香，佐以月下茶韻。', priceGil: 10000, sortOrder: 10, published: true, available: true, updatedAt: '' },
  { id: '20000000-0000-4000-8000-000000000006', categoryId: '10000000-0000-4000-8000-000000000002', name: '狐面可可脆菓', description: '香濃可可與酥脆口感交織的小茶點。', priceGil: 10000, sortOrder: 20, published: true, available: true, updatedAt: '' },
  { id: '20000000-0000-4000-8000-000000000007', categoryId: '10000000-0000-4000-8000-000000000002', name: '櫻雪果凝', description: '晶瑩果凍中藏著輕盈果香，清甜如雪。', priceGil: 10000, sortOrder: 30, published: true, available: true, updatedAt: '' },
  { id: '20000000-0000-4000-8000-000000000008', categoryId: '10000000-0000-4000-8000-000000000002', name: '九尾甜菓盛合', description: '柿子布丁、蘆薈水果凍與芝麻餅乾，三品甘味一次品嚐。', priceGil: 20000, sortOrder: 40, published: true, available: true, updatedAt: '' },
  { id: '20000000-0000-4000-8000-000000000009', categoryId: '10000000-0000-4000-8000-000000000003', name: '月詠茶香', description: '高級瑪黛茶餅乾 ＋ 狐隱抹茶', priceGil: 25000, sortOrder: 10, published: true, available: true, updatedAt: '' },
  { id: '20000000-0000-4000-8000-000000000010', categoryId: '10000000-0000-4000-8000-000000000003', name: '狐火炙香', description: '烤乳酪莫雷特 ＋ 狐火多瑪茶', priceGil: 25000, sortOrder: 20, published: true, available: true, updatedAt: '' },
  { id: '20000000-0000-4000-8000-000000000011', categoryId: '10000000-0000-4000-8000-000000000003', name: '雪月乳香', description: '乳酪麵包球 ＋ 月白蕎麥茶', priceGil: 25000, sortOrder: 30, published: true, available: true, updatedAt: '' },
 ],
}

function toCategory(r: CategoryRow): MenuCategory {
 return { id:r.id, ordinalLabel:r.ordinal_label, name:r.name, subtitle:r.subtitle, description:r.description, sortOrder:r.sort_order, published:r.is_published, updatedAt:r.updated_at }
}
function toItem(r: ItemRow): MenuItem {
 return { id:r.id, categoryId:r.category_id, name:r.name, description:r.description, priceGil:r.price_gil, sortOrder:r.sort_order, published:r.is_published, available:r.is_available, updatedAt:r.updated_at }
}
export const sortMenu = (catalog: MenuCatalog): MenuCatalog => ({
 categories: [...catalog.categories].sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'zh-TW')),
 items: [...catalog.items].sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'zh-TW')),
})

export async function fetchMenu(includeUnpublished = false): Promise<MenuCatalog> {
 if (!configured || !supabase) throw new Error('尚未設定 Supabase 菜單資料庫')
 let categoriesQuery = supabase.from('menu_categories').select('*').order('sort_order')
 let itemsQuery = supabase.from('menu_items').select('*').order('sort_order')
 if (!includeUnpublished) {
  categoriesQuery = categoriesQuery.eq('is_published',true)
  itemsQuery = itemsQuery.eq('is_published',true)
 }
 const [catResult,itemResult] = await Promise.all([categoriesQuery,itemsQuery])
 if (catResult.error) throw catResult.error
 if (itemResult.error) throw itemResult.error
 return sortMenu({
  categories: (catResult.data as CategoryRow[]).map(toCategory),
  items: (itemResult.data as ItemRow[]).map(toItem),
 })
}

function requireClient() {
 if (!supabase) throw new Error('請先連接 Supabase')
 return supabase
}
function assertWritten(data: { id: string }[] | null, label: string) {
 if (!data || data.length !== 1) throw new Error(label + '未寫入。可能有人同時修改或刪除了資料，請重新整理後再試。')
}

export async function saveMenuCategory(category: MenuCategory, creating: boolean): Promise<void> {
 const db = requireClient()
 const row = {
  id: category.id,
  ordinal_label: category.ordinalLabel.trim(),
  name: category.name.trim(),
  subtitle: category.subtitle.trim(),
  description: category.description.trim(),
  sort_order: category.sortOrder,
  is_published: category.published,
 }
 if (creating) {
  const {data,error}=await db.from('menu_categories').insert(row).select('id')
  if (error) throw error
  assertWritten(data,'分類')
 } else {
  const {data,error}=await db.from('menu_categories').update(row).eq('id',category.id)
   .eq('updated_at',category.updatedAt).select('id')
  if (error) throw error
  assertWritten(data,'分類')
 }
}
export async function saveMenuItem(item: MenuItem, creating: boolean): Promise<void> {
 const db = requireClient()
 const row = {
  id: item.id,
  category_id: item.categoryId,
  name: item.name.trim(),
  description: item.description.trim(),
  price_gil: item.priceGil,
  sort_order: item.sortOrder,
  is_published: item.published,
  is_available: item.available,
 }
 if (creating) {
  const {data,error}=await db.from('menu_items').insert(row).select('id')
  if (error) throw error
  assertWritten(data,'品項')
 } else {
  const {data,error}=await db.from('menu_items').update(row).eq('id',item.id)
   .eq('updated_at',item.updatedAt).select('id')
  if (error) throw error
  assertWritten(data,'品項')
 }
}
export async function deleteMenuCategory(category: MenuCategory): Promise<void> {
 const {data,error}=await requireClient().from('menu_categories').delete()
  .eq('id',category.id).eq('updated_at',category.updatedAt).select('id')
 if (error) throw error
 assertWritten(data,'分類刪除')
}
export async function deleteMenuItem(item: MenuItem): Promise<void> {
 const {data,error}=await requireClient().from('menu_items').delete()
  .eq('id',item.id).eq('updated_at',item.updatedAt).select('id')
 if (error) throw error
 assertWritten(data,'品項刪除')
}
