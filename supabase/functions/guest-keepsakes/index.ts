// Public lookup is token-based and returns only short-lived signed links.
// A separate Vault-backed secret authorizes the retention sweep.
import {createClient} from 'npm:@supabase/supabase-js@2.86.0'

const bucket='keepsake-deliveries'
const allowedOrigins=new Set([
 'https://zxcv5464.github.io','http://localhost:5173','http://127.0.0.1:5173',
])
const cors=(origin:string|null):Record<string,string>=>({
 'Access-Control-Allow-Origin':origin&&allowedOrigins.has(origin)?origin:'https://zxcv5464.github.io',
 'Access-Control-Allow-Headers':'content-type,authorization,apikey,x-client-info',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Vary':'Origin',
 'Cache-Control':'no-store',
})
const reply=(data:unknown,status=200,origin:string|null=null)=>
 new Response(JSON.stringify(data),{status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8'}})

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)})
 if(req.method!=='POST')return reply({error:'不支援的請求方式'},405,origin)
 const url=Deno.env.get('SUPABASE_URL')
 const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 if(!url||!secret)return reply({error:'交付服務尚未設定完成'},503,origin)
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
 let body:{action?:string;token?:string}
 try{body=await req.json()}catch{return reply({error:'資料格式錯誤'},400,origin)}
 try{
  if(body.action==='cleanup'){
   const key=req.headers.get('x-cleanup-key')||''
   if(key.length!==64)return reply({error:'無權執行清除作業'},403,origin)
   const valid=await db.rpc('keepsake_cleanup_token_valid',{p_token:key})
   if(valid.error||valid.data!==true)return reply({error:'無權執行清除作業'},403,origin)
   const {data:expired,error:queryError}=await db.from('keepsake_claims')
    .select('id').lte('expires_at',new Date().toISOString()).order('expires_at').limit(100)
   if(queryError)throw queryError
   let removed=0,failed=0
   for(const claim of expired||[]){
    const {data:photos,error:photosError}=await db.from('keepsake_photos')
     .select('storage_path').eq('claim_id',claim.id)
    if(photosError){failed++;continue}
    const paths=(photos||[]).map(photo=>photo.storage_path)
    let storageOkay=true
    for(let i=0;i<paths.length;i+=100){
     const result=await db.storage.from(bucket).remove(paths.slice(i,i+100))
     if(result.error){storageOkay=false;break}
    }
    if(!storageOkay){failed++;continue}
    const result=await db.from('keepsake_claims').delete().eq('id',claim.id)
    if(result.error){failed++;continue}
    removed++
   }
   return reply({removed,failed},200,origin)
  }
  if(body.action!=='lookup')return reply({error:'未知操作'},400,origin)
  const token=String(body.token||'').replace(/[\s-]/g,'').toLowerCase()
  if(!/^[a-f0-9]{32}$/.test(token))return reply({error:'請輸入有效的領取碼'},400,origin)
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))
  const sha=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')
  const {data:claim,error:claimError}=await db.from('keepsake_claims')
   .select('id,guest_label,note,expires_at').eq('token_sha256',sha)
   .gt('expires_at',new Date().toISOString()).maybeSingle()
  if(claimError)throw claimError
  if(!claim)return reply({error:'領取碼不存在，或照片已超過七天保存期限'},404,origin)
  const {data:photos,error:photosError}=await db.from('keepsake_photos')
   .select('id,storage_path,original_name').eq('claim_id',claim.id).order('created_at')
  if(photosError)throw photosError
  const seconds=Math.min(300,Math.max(1,Math.floor((new Date(claim.expires_at).getTime()-Date.now())/1000)))
  const items=[]
  for(const item of photos||[]){
   const {data,error}=await db.storage.from(bucket).createSignedUrl(item.storage_path,seconds,{download:item.original_name})
   if(error)throw error
   items.push({id:item.id,name:item.original_name,url:data.signedUrl})
  }
  return reply({guestLabel:claim.guest_label,note:claim.note,expiresAt:claim.expires_at,photos:items},200,origin)
 }catch(error){
  console.error('guest-keepsakes error',error)
  return reply({error:'目前無法處理請求，請稍後再試'},500,origin)
 }
})
