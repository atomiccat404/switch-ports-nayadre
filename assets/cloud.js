// Единственная точка обмена данными с Supabase.
const Cloud = (() => {
  let db;
  const bucket='covers';
  const checked = (r) => { if(r.error) throw Error(r.error.message); return r.data; };
  const http = s => {try {const u=new URL(s); return u.protocol==='https:'?u.href:''}catch{return ''}};
  const github = s => {try {const u=new URL(s);return u.protocol==='https:'&&u.hostname==='github.com'&&u.pathname.split('/').filter(Boolean).length>=2?u.href:''}catch{return ''}};
  function init(){if(db)return;if(!SITE.supabaseUrl||!SITE.supabaseKey)throw Error('База данных ещё не настроена. Заполни config.js по инструкции из архива.');if(!window.supabase)throw Error('Не удалось загрузить библиотеку Supabase. Проверь интернет.');db=window.supabase.createClient(SITE.supabaseUrl,SITE.supabaseKey,{auth:{detectSessionInUrl:false}})}
  async function admin(){const s=checked(await db.auth.getSession());if(!s.session)return false;return checked(await db.rpc('is_admin'))===true;}
  async function login(email,password){checked(await db.auth.signInWithPassword({email,password}));if(!await admin()){await db.auth.signOut();throw Error('Нет прав администратора')}}
  async function logout(){checked(await db.auth.signOut())}
  function onChange(cb){db.auth.onAuthStateChange((event)=>setTimeout(()=>cb(event),0))}
  async function list(isAdmin){let rows=[];const size=500;for(let start=0;;start+=size){let q=db.from('ports').select('*').order('date',{ascending:false}).order('id').range(start,start+size-1);if(!isAdmin)q=q.eq('published',true);const page=checked(await q);rows.push(...page);if(page.length<size)break}return rows.map(p=>({...p,cover:p.cover_path?db.storage.from(bucket).getPublicUrl(p.cover_path).data.publicUrl:p.cover_url||'',views:Number(p.views)}));}
  function validateImport(p){if(!p||typeof p!=='object')throw Error('Некорректная запись');const text=(k,max)=>String(p[k]??'').trim().slice(0,max);const title=text('title',140),platform=text('platform',100),genre=text('genre',100);if(!title||!platform||!genre)throw Error('У записи отсутствует название, платформа или жанр');const repo=github(text('repo',2000));if(p.repo&&!repo)throw Error('Некорректный GitHub у '+title);return {id:crypto.randomUUID(),title,platform,genre,repo,author:text('author',120)||'Не указан',status:statuses.includes(p.status)?p.status:'В разработке',type:types.includes(p.type)?p.type:'Фанатский порт',description:text('description',30000),install:text('install',30000),cover:http(p.cover)||'',date:new Date().toISOString(),published:false,featured:!!p.featured};}
  async function write(p,previous){
    let cover_path=previous?.cover_path||null,cover_url=previous?.cover_url||'',uploaded=null;
    if(/^data:image\/(webp|png|jpeg);base64,/i.test(p.cover||'')){
      const blob=await (await fetch(p.cover)).blob();if(blob.size>2*1024*1024)throw Error('Обложка больше 2 МБ');
      const ext=blob.type==='image/webp'?'webp':blob.type==='image/png'?'png':'jpg';uploaded=`${p.id}/${crypto.randomUUID()}.${ext}`;checked(await db.storage.from(bucket).upload(uploaded,blob,{contentType:blob.type,cacheControl:'3600'}));cover_path=uploaded;cover_url='';
    } else if(p.cover!==previous?.cover){cover_path=null;cover_url=http(p.cover)||'';}
    const row={id:p.id,title:p.title,author:p.author,repo:p.repo,platform:p.platform,genre:p.genre,type:p.type,status:p.status,description:p.description,install:p.install,cover_path,cover_url,date:p.date,published:p.published,featured:!!p.featured};
    try{if(previous){const r=checked(await db.from('ports').update(row).eq('id',p.id).select('id'));if(r.length!==1)throw Error('Запись не найдена или нет прав')}else checked(await db.from('ports').insert(row));}catch(e){if(uploaded)await db.storage.from(bucket).remove([uploaded]);throw e;}
    if(previous?.cover_path&&previous.cover_path!==cover_path){const r=await db.storage.from(bucket).remove([previous.cover_path]);if(r.error)console.warn('Не удалось убрать старую обложку',r.error)}
  }
  async function remove(p){const r=checked(await db.from('ports').delete().eq('id',p.id).select('id'));if(r.length!==1)throw Error('Нет прав или запись не найдена');if(p.cover_path){const result=await db.storage.from(bucket).remove([p.cover_path]);if(result.error)console.warn('Обложка не удалена',result.error)}}
  async function view(id){let visitor;try{visitor=localStorage.getItem('nayadre-visitor');if(!visitor){visitor=crypto.randomUUID();localStorage.setItem('nayadre-visitor',visitor)}}catch{return null}const n=checked(await db.rpc('count_port_view',{p_id:id,p_visitor:visitor}));return n===null?null:Number(n);}
  let guestPending;
  async function communitySession(){
    const s=checked(await db.auth.getSession());if(s.session)return;
    if(!guestPending)guestPending=(async()=>{const again=checked(await db.auth.getSession());if(!again.session)checked(await db.auth.signInAnonymously())})().finally(()=>{guestPending=null});
    return guestPending;
  }
  async function reactions(id){return checked(await db.rpc('port_reactions_v04',{p_id:id}))}
  async function vote(id,v){return checked(await db.rpc('set_port_vote_v04',{p_id:id,p_vote:v}))}
  async function comments(id,offset=0){return checked(await db.rpc('list_port_comments_v04',{p_id:id,p_offset:offset}))||[]}
  async function addComment(id,nick,body){return checked(await db.rpc('add_port_comment_v04',{p_id:id,p_nickname:nick,p_body:body}))}
  async function hideComment(id){return checked(await db.rpc('hide_port_comment_v04',{p_id:id}))}
  return {init,admin,login,logout,onChange,list,write,remove,view,validateImport,communitySession,reactions,vote,comments,addComment,hideComment};
})();
