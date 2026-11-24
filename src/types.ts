export type Effect = 'foxfire' | 'sakura' | 'starlight' | 'gold' | 'none'
export type Social = { id: string; label: string; url: string }
export type StaffPhoto = {
 id:string
 imageUrl:string
 thumbnailUrl:string
 imagePath:string|null
 thumbnailPath:string|null
}
export type PhotoDisplayMode = 'single'|'gallery'
export type Staff = {
 id: string
 name: string
 role: string
 tagline: string
 bio: string
 imageUrl: string
 thumbnailUrl: string
 photos?: StaffPhoto[]
 photoDisplayMode?: PhotoDisplayMode
 themeColor: string
 effect: Effect
 socials: Social[]
 services: string[]
 published: boolean
 bookingVisible: boolean
 bookingAllowedPlanIds: string[]|null
 bookingAllowJoint: boolean
 bookingPlanCaps: Record<string,number>
 sortOrder: number
}
export type StaffRow = {
 id: string
 display_name: string
 role: string
 tagline: string
 bio: string
 image_url: string | null
 thumbnail_url: string | null
 photo_gallery?: unknown
 photo_display_mode?: string
 theme_color: string
 effect: Effect
 socials: Social[]
 services: string[]
 is_published: boolean
 is_booking_visible: boolean
 booking_allowed_plan_ids: string[]|null
 booking_allow_joint: boolean
 booking_plan_caps: Record<string,number>|null
 sort_order: number
}
export const EFFECTS: Record<Effect, string> = {
 foxfire:'青色狐火', sakura:'落櫻花瓣', starlight:'夜空星光', gold:'金色微光', none:'無特效',
}
