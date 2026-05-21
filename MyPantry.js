

// MyPantry v6
const { useState, useEffect, useMemo, useRef } = React;
const { auth, db } = window.firebaseRefs;
const { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } = window.firebaseAuth;
const { collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove, query, serverTimestamp, orderBy, limit } = window.firebaseFirestore;

const UNITS = ["units","piece","kg","g","L","mL","bottles","cans","bags","boxes"];
const PRICE_MODES = ["per unit","per kg","per box","per bottle","per can","total"];
// Units where per-piece weight pricing makes sense
const PIECE_UNITS = ["piece","units"];
const CATEGORIES = ["🥩 Meat & Fish","🥦 Vegetables","🍎 Fruits","🥛 Dairy","🌾 Grains","🥫 Canned","🧊 Frozen","🧴 Other"];
const FILAMENT_COLORS = ["Black","White","Grey","Red","Dark Red","Orange","Yellow","Lime","Green","Dark Green","Teal","Cyan","Sky Blue","Blue","Navy","Purple","Violet","Pink","Magenta","Brown","Beige","Gold","Silver","Transparent","Glow in Dark","Silk Red","Silk Gold","Silk Silver","Silk Blue","Silk Green","Rainbow","Wood Fill","Carbon Fiber","Marble"];
const FILAMENT_TYPES = ["PLA","PLA+","PLA HS","PETG","ABS","ASA","TPU","Nylon","PC","HIPS","PVA","CPE","PP","PA","PA-CF","PETG-CF","PLA-CF","ABS-CF","Resin","Other"];
const COLOR_HEX = {Black:"#111",White:"#f9f9f9",Grey:"#9ca3af",Red:"#ef4444","Dark Red":"#991b1b",Orange:"#f97316",Yellow:"#eab308",Lime:"#a3e635",Green:"#22c55e","Dark Green":"#15803d",Teal:"#14b8a6",Cyan:"#06b6d4","Sky Blue":"#38bdf8",Blue:"#3b82f6",Navy:"#1e3a5f",Purple:"#a855f7",Violet:"#7c3aed",Pink:"#ec4899",Magenta:"#d946ef",Brown:"#92400e",Beige:"#d4c5a9",Gold:"#ca8a04",Silver:"#94a3b8",Transparent:"#e0f2fe","Glow in Dark":"#bbf7d0","Silk Red":"#f87171","Silk Gold":"#fde68a","Silk Silver":"#e2e8f0","Silk Blue":"#93c5fd","Silk Green":"#6ee7b7",Rainbow:"linear-gradient(90deg,#ef4444,#f97316,#eab308,#22c55e,#3b82f6,#a855f7)","Wood Fill":"#a16207","Carbon Fiber":"#374151",Marble:"#e5e7eb"};
const LIST_TYPES = ["pantry","filament"];

const AM = {
  added:    {icon:"✨",color:"#16a34a",bg:"#f0fdf4",label:"Added"},
  removed:  {icon:"🗑️",color:"#dc2626",bg:"#fff5f5",label:"Removed"},
  increased:{icon:"📈",color:"#2563eb",bg:"#eff6ff",label:"Increased"},
  decreased:{icon:"📉",color:"#d97706",bg:"#fffbeb",label:"Decreased"},
  edited:   {icon:"✏️",color:"#7c3aed",bg:"#faf5ff",label:"Edited"},
};

function daysUntil(e){if(!e)return null;const t=new Date();t.setHours(0,0,0,0);return Math.ceil((new Date(e+"T00:00:00")-t)/86400000);}
function fmtDate(d){if(!d)return"";return new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});}
function fmtTime(iso){if(!iso)return"";const d=new Date(iso),now=new Date(),dm=Math.floor((now-d)/60000);if(dm<1)return"Just now";if(dm<60)return`${dm}m ago`;const dh=Math.floor(dm/60);if(dh<24)return`${dh}h ago`;const dd=Math.floor(dh/24);if(dd<7)return`${dd}d ago`;return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});}
function calcPrice(pv,pm,a){if(!pv||!a)return null;const p=parseFloat(pv),amt=parseFloat(a);if(isNaN(p)||isNaN(amt)||amt===0)return null;if(pm==="total")return{total:p.toFixed(2),perUnit:(p/amt).toFixed(2)};return{total:(p*amt).toFixed(2),perUnit:p.toFixed(2)};}
// Weight-based pricing: weightPerPiece (g) + pricePerKg → cost per piece and total
function calcWeightPrice(weightPerPiece,pricePerKg,amount){
  const w=parseFloat(weightPerPiece),p=parseFloat(pricePerKg),a=parseFloat(amount);
  if(isNaN(w)||isNaN(p)||isNaN(a)||w===0||p===0)return null;
  const perPiece=(w/1000)*p;
  return{perPiece:perPiece.toFixed(2),total:(perPiece*a).toFixed(2),weightPerPiece:w,pricePerKg:p};
}
function getLowThreshold(item){const t=parseFloat(item.lowThreshold);return isNaN(t)?1:t;}
function isLowStock(item){const a=parseFloat(item.amount);if(isNaN(a))return false;if(a===0)return true;return a<=getLowThreshold(item);}
function colorSwatch(color){const hex=COLOR_HEX[color]||"#9ca3af";const isGrad=hex.startsWith("linear");return React.createElement("span",{style:{display:"inline-block",width:14,height:14,borderRadius:"50%",background:hex,border:"1.5px solid rgba(0,0,0,0.15)",verticalAlign:"middle",marginRight:5,flexShrink:0}});}

function Spinner(){return React.createElement("div",{style:{display:"flex",justifyContent:"center",padding:40}},React.createElement("div",{style:{width:36,height:36,border:"3px solid #dcfce7",borderTopColor:"#16a34a",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}),React.createElement("style",null,"@keyframes spin{to{transform:rotate(360deg)}}"));}

function Badge({days}){
  if(days===null)return null;
  const c=days<0?{bg:"#dc2626",col:"#fff",t:"Expired"}:days===0?{bg:"#fee2e2",col:"#dc2626",t:"Today!"}:days<=2?{bg:"#ffe4e6",col:"#dc2626",t:`${days}d`}:days<=7?{bg:"#fef9c3",col:"#a16207",t:`${days}d`}:{bg:"#dcfce7",col:"#16a34a",t:`${days}d`};
  return React.createElement("span",{style:{background:c.bg,color:c.col,borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:800}},c.t);
}

function Sheet({show,onClose,title,children}){
  if(!show)return null;
  return React.createElement("div",{onClick:onClose,style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}},
    React.createElement("div",{onClick:e=>e.stopPropagation(),style:{background:"#fff",borderRadius:"24px 24px 0 0",padding:"22px 20px 40px",width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto"}},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}},
        React.createElement("span",{style:{fontSize:17,fontWeight:900,color:"#14532d"}},title),
        React.createElement("button",{onClick:onClose,style:{background:"#f0fdf4",border:"none",borderRadius:"50%",width:30,height:30,fontSize:15,cursor:"pointer"}},"✕")
      ),
      children
    )
  );
}

function HRow({ev,showItem}){
  const m=AM[ev.action]||AM.edited;
  const ts=ev.ts?.toDate?fmtTime(ev.ts.toDate().toISOString()):fmtTime(ev.ts);
  return React.createElement("div",{style:{display:"flex",gap:12,padding:"10px 0",borderBottom:"1px solid #f7fdf9",alignItems:"flex-start"}},
    React.createElement("div",{style:{width:30,height:30,borderRadius:"50%",background:m.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}},m.icon),
    React.createElement("div",{style:{flex:1}},
      showItem&&React.createElement("div",{style:{fontSize:13,fontWeight:800,color:"#111827"}},ev.itemName),
      React.createElement("div",{style:{fontSize:12,color:"#374151",fontWeight:600}},ev.detail),
      React.createElement("div",{style:{fontSize:11,color:"#9ca3af",marginTop:2}},`${m.label} · by ${ev.user||"?"} · ${ts}`)
    )
  );
}

// ── Auth ──────────────────────────────────────────────────────
function AuthScreen(){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [name,setName]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  async function submit(){
    setErr("");setLoading(true);
    try{
      if(mode==="login"){await signInWithEmailAndPassword(auth,email,pass);}
      else{const c=await createUserWithEmailAndPassword(auth,email,pass);await updateProfile(c.user,{displayName:name});await setDoc(doc(db,"users",c.user.uid),{name,email:email.toLowerCase().trim(),pinnedItems:[],listIds:[],itemFrequency:{},photoURL:""});}
    }catch(e){setErr(e.message.replace("Firebase: ","").replace(/\(.*\)/,""));}
    setLoading(false);
  }
  const inp={width:"100%",padding:"11px 14px",borderRadius:12,border:"1.5px solid #d1fae5",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f9fafb",boxSizing:"border-box",marginBottom:12};
  return React.createElement("div",{style:{minHeight:"100vh",background:"linear-gradient(160deg,#f0fdf4,#dcfce7)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Nunito',sans-serif"}},
    React.createElement("div",{style:{fontSize:52,marginBottom:8}},"🥬"),
    React.createElement("h1",{style:{fontSize:30,fontWeight:900,color:"#14532d",letterSpacing:-1,marginBottom:4}},"MyPantry"),
    React.createElement("p",{style:{color:"#6b7280",marginBottom:32,fontSize:14}},"Your family's smart pantry"),
    React.createElement("div",{style:{background:"#fff",borderRadius:24,padding:28,width:"100%",maxWidth:380,boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}},
      React.createElement("div",{style:{display:"flex",background:"#f0fdf4",borderRadius:12,padding:4,marginBottom:24}},
        ["login","signup"].map(m=>React.createElement("button",{key:m,onClick:()=>setMode(m),style:{flex:1,padding:"8px",borderRadius:9,border:"none",background:mode===m?"#16a34a":"transparent",color:mode===m?"#fff":"#6b7280",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:14}},m==="login"?"Sign In":"Create Account"))
      ),
      mode==="signup"&&React.createElement("input",{style:inp,placeholder:"Your name",value:name,onChange:e=>setName(e.target.value)}),
      React.createElement("input",{style:inp,placeholder:"Email address",type:"email",value:email,onChange:e=>setEmail(e.target.value)}),
      React.createElement("input",{style:inp,placeholder:"Password",type:"password",value:pass,onChange:e=>setPass(e.target.value)}),
      err&&React.createElement("div",{style:{color:"#dc2626",fontSize:13,marginBottom:12,padding:"8px 12px",background:"#fee2e2",borderRadius:8}},err),
      React.createElement("button",{style:{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",marginTop:4},onClick:submit,disabled:loading},loading?"Please wait…":mode==="login"?"Sign In":"Create Account")
    )
  );
}

// ── Avatar Component ──────────────────────────────────────────
function Avatar({size=36,photoURL,displayName,onClick,style={}}){
  const initials=(displayName||"?")[0].toUpperCase();
  return photoURL
    ? React.createElement("img",{src:photoURL,onClick,style:{width:size,height:size,borderRadius:"50%",objectFit:"cover",cursor:onClick?"pointer":"default",border:"2px solid rgba(255,255,255,0.4)",...style}})
    : React.createElement("div",{onClick,style:{width:size,height:size,borderRadius:"50%",background:"linear-gradient(135deg,#16a34a,#15803d)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.42,fontWeight:900,color:"#fff",cursor:onClick?"pointer":"default",border:"2px solid rgba(255,255,255,0.4)",flexShrink:0,...style}},initials);
}

// ── Profile Sheet (opened from header avatar) ─────────────────
function ProfileSheet({show,onClose,userId,userProfile}){
  const [newName,setNewName]=useState(auth.currentUser?.displayName||"");
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [photoURL,setPhotoURL]=useState(auth.currentUser?.photoURL||userProfile?.photoURL||"");
  const fileRef=useRef(null);

  async function saveName(){
    if(!newName.trim())return;
    setSaving(true);
    await updateProfile(auth.currentUser,{displayName:newName.trim()});
    await updateDoc(doc(db,"users",userId),{name:newName.trim()});
    setMsg("Saved!");setSaving(false);setTimeout(()=>setMsg(""),2000);
  }

  function handlePhoto(e){
    const file=e.target.files[0];
    if(!file)return;
    if(file.size>2*1024*1024){setMsg("Image must be under 2MB");return;}
    const reader=new FileReader();
    reader.onload=async ev=>{
      const url=ev.target.result; // base64 data URL
      setPhotoURL(url);
      await updateProfile(auth.currentUser,{photoURL:url});
      await updateDoc(doc(db,"users",userId),{photoURL:url});
      setMsg("Photo updated!");setTimeout(()=>setMsg(""),2000);
    };
    reader.readAsDataURL(file);
  }

  const inp={width:"100%",padding:"11px 14px",borderRadius:12,border:"1.5px solid #d1fae5",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f9fafb",boxSizing:"border-box"};

  return React.createElement(Sheet,{show,onClose,title:"👤 Profile"},
    // Avatar upload
    React.createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20}},
      React.createElement("div",{style:{position:"relative",marginBottom:8}},
        React.createElement(Avatar,{size:80,photoURL,displayName:auth.currentUser?.displayName,style:{border:"3px solid #16a34a"}}),
        React.createElement("button",{onClick:()=>fileRef.current?.click(),style:{position:"absolute",bottom:0,right:0,width:26,height:26,borderRadius:"50%",background:"#16a34a",border:"2px solid #fff",color:"#fff",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}},"📷")
      ),
      React.createElement("input",{ref:fileRef,type:"file",accept:"image/*",style:{display:"none"},onChange:handlePhoto}),
      React.createElement("div",{style:{fontSize:11,color:"#9ca3af"}},"Tap camera to change photo"),
      msg&&React.createElement("div",{style:{color:"#16a34a",fontSize:12,marginTop:4,fontWeight:700}},msg)
    ),
    // Email (readonly)
    React.createElement("div",{style:{marginBottom:12}},
      React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}},"Email"),
      React.createElement("div",{style:{fontSize:14,fontWeight:700,color:"#111827",padding:"10px 12px",background:"#f9fafb",borderRadius:10,border:"1.5px solid #f0fdf4"}},(auth.currentUser?.email||"—"))
    ),
    // Display name
    React.createElement("div",{style:{marginBottom:16}},
      React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}},"Display Name"),
      React.createElement("div",{style:{display:"flex",gap:8}},
        React.createElement("input",{style:{...inp,flex:1},value:newName,onChange:e=>setNewName(e.target.value),placeholder:"Your name"}),
        React.createElement("button",{onClick:saveName,disabled:saving,style:{padding:"11px 16px",borderRadius:12,border:"none",background:"#16a34a",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}},saving?"…":"Save")
      )
    ),
    // Stats
    React.createElement("div",{style:{background:"#f9fafb",borderRadius:12,padding:"12px 14px",marginBottom:16}},
      [{l:"Lists",v:userProfile?.listIds?.length||0},{l:"Pinned Items",v:userProfile?.pinnedItems?.length||0}].map(r=>
        React.createElement("div",{key:r.l,style:{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f0fdf4"}},
          React.createElement("span",{style:{fontSize:13,color:"#6b7280",fontWeight:600}},r.l),
          React.createElement("span",{style:{fontSize:13,fontWeight:800,color:"#111827"}},r.v)
        )
      )
    ),
    React.createElement("button",{onClick:()=>signOut(auth),style:{width:"100%",padding:"13px",borderRadius:14,border:"1.5px solid #fecaca",background:"#fff5f5",color:"#dc2626",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}},"🚪 Sign Out")
  );
}

// ── Chat Tab ──────────────────────────────────────────────────
function ChatTab({listId,userId,userProfile}){
  const [messages,setMessages]=useState([]);
  const [text,setText]=useState("");
  const [sending,setSending]=useState(false);
  const [status,setStatus]=useState("loading"); // "loading"|"ok"|"error"
  const [chatErr,setChatErr]=useState("");
  const bottomRef=useRef(null);
  const unsubRef=useRef(null);
  const photoURL=auth.currentUser?.photoURL||userProfile?.photoURL||"";

  useEffect(()=>{
    setStatus("loading");
    setChatErr("");
    setMessages([]);

    // Timeout — if no response in 8s, show error
    const timeout=setTimeout(()=>{
      if(unsubRef.current)unsubRef.current();
      setStatus("error");
      setChatErr("Timed out loading chat. This usually means your Firestore rules are missing the chat rule. Go to Firebase Console → Firestore → Rules, paste the contents of FIRESTORE_RULES.txt and click Publish.");
    },8000);

    try{
      const q=query(collection(db,"lists",listId,"chat"),orderBy("ts","asc"),limit(200));
      const unsub=onSnapshot(q,
        snap=>{
          clearTimeout(timeout);
          setMessages(snap.docs.map(d=>({id:d.id,...d.data()})));
          setStatus("ok");
        },
        err=>{
          clearTimeout(timeout);
          console.error("Chat onSnapshot error:",err.code,err.message);
          setStatus("error");
          if(err.code==="permission-denied"){
            setChatErr("Permission denied. Your Firestore rules are missing the chat subcollection rule. Go to Firebase Console → Firestore → Rules, paste FIRESTORE_RULES.txt and click Publish.");
          }else if(err.code==="failed-precondition"){
            setChatErr("Missing Firestore index. Go to Firebase Console → Firestore → Indexes and create a composite index on lists/{id}/chat with field 'ts Ascending'.");
          }else{
            setChatErr(`Error (${err.code}): ${err.message}`);
          }
        }
      );
      unsubRef.current=unsub;
      return()=>{clearTimeout(timeout);unsub();};
    }catch(e){
      clearTimeout(timeout);
      setStatus("error");
      setChatErr(`Unexpected error: ${e.message}`);
    }
  },[listId]);

  useEffect(()=>{
    if(status==="ok")bottomRef.current?.scrollIntoView({behavior:"smooth"});
  },[messages,status]);

  async function send(){
    const t=text.trim();
    if(!t||sending)return;
    setSending(true);
    setText("");
    try{
      await addDoc(collection(db,"lists",listId,"chat"),{
        text:t,userId,
        userName:auth.currentUser?.displayName||auth.currentUser?.email||"Unknown",
        photoURL:photoURL||"",
        ts:serverTimestamp()
      });
    }catch(e){
      console.error("Send error:",e);
      alert("Could not send message: "+e.message);
      setText(t);
    }
    setSending(false);
  }

  function handleKey(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}

  const grouped=messages.map((msg,i)=>{
    const prev=messages[i-1];
    const showAvatar=!prev||prev.userId!==msg.userId;
    const isMe=msg.userId===userId;
    const ts=msg.ts?.toDate?fmtTime(msg.ts.toDate().toISOString()):"";
    return{...msg,showAvatar,isMe,ts};
  });

  // Loading state
  if(status==="loading") return React.createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"calc(100vh - 200px)",gap:12,color:"#9ca3af"}},
    React.createElement("div",{style:{width:32,height:32,border:"3px solid #dcfce7",borderTopColor:"#16a34a",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}),
    React.createElement("div",{style:{fontSize:13,fontWeight:600}},"Loading chat…"),
    React.createElement("style",null,"@keyframes spin{to{transform:rotate(360deg)}}")
  );

  // Error state
  if(status==="error") return React.createElement("div",{style:{padding:"20px 16px"}},
    React.createElement("div",{style:{background:"#fee2e2",borderRadius:14,padding:"16px",border:"1.5px solid #fecaca"}},
      React.createElement("div",{style:{fontSize:15,fontWeight:900,color:"#dc2626",marginBottom:8}},"⚠️ Chat unavailable"),
      React.createElement("div",{style:{fontSize:13,color:"#7f1d1d",lineHeight:1.6,marginBottom:12}},chatErr),
      React.createElement("div",{style:{fontSize:12,fontWeight:800,color:"#dc2626",marginBottom:6}},"How to fix:"),
      React.createElement("ol",{style:{fontSize:12,color:"#7f1d1d",lineHeight:1.8,paddingLeft:18,margin:0}},
        React.createElement("li",null,"Open Firebase Console"),
        React.createElement("li",null,"Go to Firestore Database → Rules"),
        React.createElement("li",null,"Replace all content with FIRESTORE_RULES.txt"),
        React.createElement("li",null,"Click Publish"),
        React.createElement("li",null,"Wait 30 seconds then reload the app")
      )
    )
  );

  // Normal chat UI
  return React.createElement("div",{style:{display:"flex",flexDirection:"column",height:"calc(100vh - 160px)"}},
    React.createElement("div",{style:{flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:2}},
      messages.length===0&&React.createElement("div",{style:{textAlign:"center",color:"#9ca3af",padding:"60px 20px",fontSize:14,fontWeight:600}},
        React.createElement("div",{style:{fontSize:40,marginBottom:8}},"💬"),
        "No messages yet. Say hi!"
      ),
      grouped.map(msg=>React.createElement("div",{key:msg.id,style:{display:"flex",flexDirection:"column",alignItems:msg.isMe?"flex-end":"flex-start",marginTop:msg.showAvatar?10:2}},
        msg.showAvatar&&React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexDirection:msg.isMe?"row-reverse":"row"}},
          React.createElement(Avatar,{size:22,photoURL:msg.photoURL,displayName:msg.userName}),
          React.createElement("span",{style:{fontSize:11,fontWeight:700,color:"#6b7280"}},msg.isMe?"You":msg.userName)
        ),
        React.createElement("div",{style:{maxWidth:"78%",padding:"9px 13px",borderRadius:msg.isMe?"18px 18px 4px 18px":"18px 18px 18px 4px",background:msg.isMe?"linear-gradient(135deg,#16a34a,#15803d)":"#fff",color:msg.isMe?"#fff":"#111827",fontSize:14,fontWeight:600,boxShadow:"0 1px 4px rgba(0,0,0,0.08)",lineHeight:1.4,wordBreak:"break-word",border:msg.isMe?"none":"1.5px solid #f0fdf4"}},msg.text),
        React.createElement("span",{style:{fontSize:10,color:"#9ca3af",marginTop:2,paddingLeft:msg.isMe?0:4,paddingRight:msg.isMe?4:0}},msg.ts)
      )),
      React.createElement("div",{ref:bottomRef})
    ),
    React.createElement("div",{style:{padding:"10px 14px",background:"#fff",borderTop:"1px solid #f0fdf4",display:"flex",gap:8,alignItems:"flex-end"}},
      React.createElement("textarea",{value:text,onChange:e=>setText(e.target.value),onKeyDown:handleKey,placeholder:"Message…",rows:1,style:{flex:1,padding:"10px 14px",borderRadius:20,border:"1.5px solid #d1fae5",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f9fafb",resize:"none",lineHeight:1.4,maxHeight:100,overflowY:"auto"}}),
      React.createElement("button",{onClick:send,disabled:!text.trim()||sending,style:{width:40,height:40,borderRadius:"50%",background:text.trim()?"linear-gradient(135deg,#16a34a,#15803d)":"#e5e7eb",border:"none",color:"#fff",fontSize:18,cursor:text.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background .2s"}},"➤")
    )
  );
}

// ── Compact Items Tab (Pantry) ────────────────────────────────
function ItemsTab({filtered,items,hist,search,setSearch,filterCat,setFilterCat,sortBy,setSortBy,totalVal,loading,setEditItem,setShowAdd,openDetail,adjust,deleteItem,inp,isFilament}){
  const stepFor=u=>["kg","L","g","mL"].includes(u)?0.1:1;
  return React.createElement("div",null,
    React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:10}},
      React.createElement("input",{style:{...inp,background:"#fff"},placeholder:"🔍 Search…",value:search,onChange:e=>setSearch(e.target.value)}),
      React.createElement("div",{style:{display:"flex",gap:8}},
        !isFilament&&React.createElement("select",{style:{...inp,flex:1,background:"#fff",fontSize:12},value:filterCat,onChange:e=>setFilterCat(e.target.value)},
          React.createElement("option",{value:"All"},"All Categories"),
          CATEGORIES.map(c=>React.createElement("option",{key:c},c))
        ),
        React.createElement("select",{style:{...inp,flex:1,background:"#fff",fontSize:12},value:sortBy,onChange:e=>setSortBy(e.target.value)},
          React.createElement("option",{value:"expiry"},isFilament?"By Date Bought":"By Expiry"),
          React.createElement("option",{value:"name"},"By Name"),
          !isFilament&&React.createElement("option",{value:"category"},"By Category")
        )
      )
    ),
    React.createElement("div",{style:{fontSize:12,color:"#9ca3af",marginBottom:8,fontWeight:600}},`${filtered.length} items${!isFilament&&totalVal>0?` · Est. $${totalVal.toFixed(2)}`:""}`),
    loading?React.createElement(Spinner,null):React.createElement("div",{style:{background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:"1.5px solid #f0fdf4"}},
      filtered.length===0&&React.createElement("div",{style:{textAlign:"center",color:"#9ca3af",padding:"40px 20px",fontSize:14}},"Nothing here. Tap '+ Add'!"),
      filtered.map((item,idx)=>{
        const days=daysUntil(item.expiry),low=isLowStock(item),urgent=days!==null&&days<=2;
        const isWeightBased=item.priceType==="weight";
        const price=isWeightBased?calcWeightPrice(item.weightPerPiece,item.pricePerKg,item.amount):calcPrice(item.priceVal,item.priceMode,item.amount);
        const rowBg=urgent?"#fffbeb":low?"#fff5f5":"#fff";
        const isLast=idx===filtered.length-1;
        const isFilamentItem=isFilament||item.category==="🧵 Filament";
        return React.createElement("div",{key:item.id,style:{display:"flex",alignItems:"center",padding:"10px 14px",background:rowBg,borderBottom:isLast?"none":"1px solid #f0fdf4",gap:10}},
          // Color swatch for filament
          isFilamentItem&&item.color&&React.createElement("div",{style:{width:14,height:14,borderRadius:"50%",background:COLOR_HEX[item.color]||"#9ca3af",border:"1.5px solid rgba(0,0,0,0.15)",flexShrink:0}}),
          React.createElement("div",{onClick:()=>openDetail(item),style:{flex:1,cursor:"pointer",minWidth:0}},
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6}},
              React.createElement("span",{style:{fontSize:14,fontWeight:800,color:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},item.name),
              isFilamentItem&&item.filamentType&&React.createElement("span",{style:{fontSize:10,background:"#f0fdf4",color:"#15803d",borderRadius:8,padding:"1px 6px",fontWeight:700,flexShrink:0}},item.filamentType),
              low&&React.createElement("span",{style:{fontSize:10,background:"#fee2e2",color:"#dc2626",borderRadius:10,padding:"1px 6px",fontWeight:800,flexShrink:0}},"🪫"),
              !isFilamentItem&&React.createElement(Badge,{days})
            ),
            React.createElement("div",{style:{fontSize:11,color:"#9ca3af",marginTop:2}},
              isFilamentItem&&item.color?item.color:(item.category||"")
            )
          ),
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6,flexShrink:0}},
            React.createElement("button",{onClick:()=>adjust(item,-stepFor(item.unit)),style:{width:26,height:26,borderRadius:"50%",background:"#f0fdf4",border:"1.5px solid #86efac",fontSize:16,cursor:"pointer",color:"#16a34a",fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}},"−"),
            React.createElement("span",{style:{fontSize:13,fontWeight:800,color:"#111827",minWidth:55,textAlign:"center"}},`${item.amount}`,React.createElement("span",{style:{fontSize:10,color:"#9ca3af",fontWeight:400}},` ${item.unit}`)),
            React.createElement("button",{onClick:()=>adjust(item,stepFor(item.unit)),style:{width:26,height:26,borderRadius:"50%",background:"#f0fdf4",border:"1.5px solid #86efac",fontSize:16,cursor:"pointer",color:"#16a34a",fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}},"+")
          )
        );
      })
    )
  );
}

// ── Alerts Tab ────────────────────────────────────────────────
function AlertsTab({items,openDetail,isFilament}){
  const expired=items.filter(i=>daysUntil(i.expiry)<0&&!isFilament);
  const soon=items.filter(i=>{const d=daysUntil(i.expiry);return d!==null&&d>=0&&d<=7&&!isFilament;});

  // Low stock: 0 always first, then sorted by amount ascending, then by threshold
  const low=items
    .filter(i=>isLowStock(i))
    .sort((a,b)=>{
      const aa=parseFloat(a.amount)||0;
      const bb=parseFloat(b.amount)||0;
      if(aa===0&&bb!==0)return -1;
      if(bb===0&&aa!==0)return 1;
      return aa-bb;
    });

  const allClear=expired.length===0&&soon.length===0&&low.length===0;

  function AlertRow({item,bg,border,badge,sub}){
    return React.createElement("div",{onClick:()=>openDetail(item),style:{background:bg,borderRadius:14,padding:"11px 14px",border:`1.5px solid ${border}`,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",gap:8}},
      React.createElement("div",{style:{minWidth:0,flex:1}},
        React.createElement("div",{style:{fontWeight:800,color:"#111827",fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},item.name),
        React.createElement("div",{style:{fontSize:12,color:"#9ca3af",marginTop:2}},sub)
      ),badge
    );
  }

  return React.createElement("div",null,
    allClear&&React.createElement("div",{style:{textAlign:"center",color:"#9ca3af",padding:"48px 20px",fontWeight:600}},React.createElement("div",{style:{fontSize:40,marginBottom:8}},"✅"),"All good!"),
    // 0 quantity always first, separated
    low.filter(i=>parseFloat(i.amount)===0).length>0&&React.createElement("div",null,
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#dc2626",textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:4}},"🚨 Empty (0)"),
      low.filter(i=>parseFloat(i.amount)===0).map(item=>React.createElement(AlertRow,{key:item.id,item,bg:"#fff5f5",border:"#fca5a5",
        badge:React.createElement("span",{style:{background:"#dc2626",color:"#fff",borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:800,flexShrink:0}},"0"),
        sub:`${item.category||""} · threshold: ${getLowThreshold(item)} ${item.unit}`}))
    ),
    // Low stock (>0 but ≤ threshold), sorted by amount asc
    low.filter(i=>parseFloat(i.amount)>0).length>0&&React.createElement("div",null,
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:low.filter(i=>parseFloat(i.amount)===0).length>0?16:4}},"🪫 Low Stock"),
      low.filter(i=>parseFloat(i.amount)>0).map(item=>React.createElement(AlertRow,{key:item.id,item,bg:"#fff5f5",border:"#fca5a5",
        badge:React.createElement("span",{style:{background:"#fee2e2",color:"#dc2626",borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:800,flexShrink:0}},`${item.amount} ${item.unit}`),
        sub:`${item.category||""} · alert below: ${getLowThreshold(item)} ${item.unit}`}))
    ),
    !isFilament&&expired.length>0&&React.createElement("div",null,
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:low.length>0?16:4}},"🚨 Expired"),
      expired.map(item=>React.createElement(AlertRow,{key:item.id,item,bg:"#fff5f5",border:"#fecaca",badge:React.createElement(Badge,{days:daysUntil(item.expiry)}),sub:`${item.amount} ${item.unit} · expired ${fmtDate(item.expiry)}`}))
    ),
    !isFilament&&soon.length>0&&React.createElement("div",null,
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:(low.length>0||expired.length>0)?16:4}},"⏰ Expiring Soon"),
      soon.map(item=>React.createElement(AlertRow,{key:item.id,item,bg:"#fffbeb",border:"#fde68a",badge:React.createElement(Badge,{days:daysUntil(item.expiry)}),sub:`${item.amount} ${item.unit} · exp ${fmtDate(item.expiry)}`}))
    )
  );
}

// ── History Tab ───────────────────────────────────────────────
function HistoryTab({hist,hFilter,setHFilter}){
  const opts=[["all","All"],["added","Added"],["removed","Removed"],["increased","Increased"],["decreased","Decreased"],["edited","Edited"]];
  const groups={};
  hist.forEach(e=>{
    const ts=e.ts?.toDate?e.ts.toDate():new Date(e.ts||Date.now());
    const day=ts.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
    if(!groups[day])groups[day]=[];
    groups[day].push(e);
  });
  return React.createElement("div",null,
    React.createElement("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}},
      opts.map(([k,l])=>React.createElement("button",{key:k,onClick:()=>setHFilter(k),style:{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${hFilter===k?"#16a34a":"#d1fae5"}`,background:hFilter===k?"#16a34a":"#fff",color:hFilter===k?"#fff":"#6b7280",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}},k!=="all"&&(AM[k]?.icon+" "),l))
    ),
    hist.length===0&&React.createElement("div",{style:{textAlign:"center",color:"#9ca3af",padding:"40px 0",fontSize:14}},"No history yet."),
    Object.entries(groups).map(([day,evts])=>React.createElement("div",{key:day,style:{marginBottom:16}},
      React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:6}},day),
      React.createElement("div",{style:{background:"#fff",borderRadius:16,padding:"4px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.05)",border:"1.5px solid #f0fdf4"}},
        evts.map(e=>React.createElement(HRow,{key:e.id,ev:e,showItem:true}))
      )
    ))
  );
}

// ── Stats Tab ─────────────────────────────────────────────────
function StatsTab({items,totalVal,isFilament}){
  return React.createElement("div",null,
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}},
      [{l:"Total Items",v:items.length,c:"#16a34a"},
       !isFilament&&{l:"Expiring Soon",v:items.filter(i=>{const d=daysUntil(i.expiry);return d!==null&&d>=0&&d<=7;}).length,c:"#f59e0b"},
       {l:"Low/Empty",v:items.filter(i=>isLowStock(i)).length,c:"#ef4444"},
       !isFilament&&{l:"Est. Value",v:`$${totalVal.toFixed(2)}`,c:"#8b5cf6"},
       isFilament&&{l:"Colors",v:new Set(items.map(i=>i.color).filter(Boolean)).size,c:"#8b5cf6"},
       isFilament&&{l:"Types",v:new Set(items.map(i=>i.filamentType).filter(Boolean)).size,c:"#0891b2"},
      ].filter(Boolean).map(s=>
        React.createElement("div",{key:s.l,style:{background:"#fff",borderRadius:16,padding:"16px 12px",textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}},
          React.createElement("div",{style:{fontSize:26,fontWeight:900,color:s.c}},s.v),
          React.createElement("div",{style:{fontSize:11,color:"#9ca3af",marginTop:3,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}},s.l)
        )
      )
    ),
    isFilament&&React.createElement("div",null,
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},"By Color"),
      [...new Set(items.map(i=>i.color).filter(Boolean))].map(color=>{
        const n=items.filter(i=>i.color===color).length;
        return React.createElement("div",{key:color,style:{display:"flex",alignItems:"center",gap:10,marginBottom:8}},
          React.createElement("div",{style:{width:14,height:14,borderRadius:"50%",background:COLOR_HEX[color]||"#9ca3af",border:"1px solid rgba(0,0,0,0.1)",flexShrink:0}}),
          React.createElement("span",{style:{width:120,fontSize:12,color:"#374151",fontWeight:700,flexShrink:0}},color),
          React.createElement("div",{style:{flex:1,height:8,background:"#f0fdf4",borderRadius:99,overflow:"hidden"}},React.createElement("div",{style:{height:"100%",background:"linear-gradient(90deg,#4ade80,#15803d)",borderRadius:99,width:`${(n/items.length)*100}%`}})),
          React.createElement("span",{style:{fontSize:12,color:"#6b7280",fontWeight:800,width:18,textAlign:"right"}},n)
        );
      })
    ),
    !isFilament&&CATEGORIES.map(cat=>{const n=items.filter(i=>i.category===cat).length;if(!n)return null;return React.createElement("div",{key:cat,style:{display:"flex",alignItems:"center",gap:10,marginBottom:8}},
      React.createElement("span",{style:{width:140,fontSize:12,color:"#374151",fontWeight:700,flexShrink:0}},cat),
      React.createElement("div",{style:{flex:1,height:8,background:"#f0fdf4",borderRadius:99,overflow:"hidden"}},React.createElement("div",{style:{height:"100%",background:"linear-gradient(90deg,#4ade80,#15803d)",borderRadius:99,width:`${(n/items.length)*100}%`}})),
      React.createElement("span",{style:{fontSize:12,color:"#6b7280",fontWeight:800,width:18,textAlign:"right"}},n)
    );})
  );
}

// ── Item Detail Sheet ─────────────────────────────────────────
function ItemDetailSheet({item,hist,show,onClose,onEdit,onAdjust,onDelete,isFilament}){
  if(!item)return null;
  const ih=hist.filter(h=>h.itemId===item.id);
  const price=item.priceType==="weight"
    ?calcWeightPrice(item.weightPerPiece,item.pricePerKg,item.amount)
    :calcPrice(item.priceVal,item.priceMode,item.amount);
  const isWeightPrice=item.priceType==="weight"&&price;
  const days=daysUntil(item.expiry);
  const low=isLowStock(item);
  const stepFor=u=>["kg","L","g","mL"].includes(u)?0.1:1;
  const isFilamentItem=isFilament||item.category==="🧵 Filament";

  return React.createElement(Sheet,{show,onClose,title:""},
    React.createElement("div",{style:{background:"linear-gradient(135deg,#f0fdf4,#dcfce7)",borderRadius:16,padding:"16px",marginBottom:16,border:"1px solid #bbf7d0"}},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}},
        React.createElement("div",null,
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8}},
            isFilamentItem&&item.color&&React.createElement("div",{style:{width:18,height:18,borderRadius:"50%",background:COLOR_HEX[item.color]||"#9ca3af",border:"2px solid rgba(0,0,0,0.15)",flexShrink:0}}),
            React.createElement("div",{style:{fontSize:20,fontWeight:900,color:"#14532d"}},item.name)
          ),
          React.createElement("div",{style:{fontSize:12,color:"#6b7280",marginTop:4}},
            isFilamentItem?[item.color,item.filamentType,item.note].filter(Boolean).join(" · "):(`${item.category||""}${item.note?` · ${item.note}`:""}`)
          )
        ),
        React.createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}},
          low&&React.createElement("span",{style:{background:"#fee2e2",color:"#dc2626",borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:800}},"🪫 Low"),
          !isFilament&&React.createElement(Badge,{days})
        )
      ),
      React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"10px 0",marginBottom:10,background:"rgba(255,255,255,0.5)",borderRadius:12}},
        React.createElement("button",{onClick:()=>onAdjust(item,-stepFor(item.unit)),style:{width:36,height:36,borderRadius:"50%",background:"#fff",border:"2px solid #86efac",fontSize:20,cursor:"pointer",color:"#16a34a",fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}},"−"),
        React.createElement("span",{style:{fontSize:20,fontWeight:900,color:"#14532d",minWidth:90,textAlign:"center"}},`${item.amount} `,React.createElement("span",{style:{fontSize:14,fontWeight:600,color:"#6b7280"}},item.unit)),
        React.createElement("button",{onClick:()=>onAdjust(item,stepFor(item.unit)),style:{width:36,height:36,borderRadius:"50%",background:"#fff",border:"2px solid #86efac",fontSize:20,cursor:"pointer",color:"#16a34a",fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}},"+")
      ),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}},
        [
          isFilamentItem&&{l:"Color",v:item.color||"—"},
          isFilamentItem&&{l:"Type",v:item.filamentType||"—"},
          {l:isFilamentItem?"Date Bought":"Expiry",v:item.expiry?fmtDate(item.expiry):"Not set"},
          {l:"Low Alert At",v:`${getLowThreshold(item)} ${item.unit}`},
          !isFilamentItem&&!isWeightPrice&&{l:"Total",v:price?`$${price.total}`:"—"},
          !isFilamentItem&&!isWeightPrice&&{l:`Per ${item.unit}`,v:price?`$${price.perUnit}`:"—"},
          !isFilamentItem&&isWeightPrice&&{l:"Per piece",v:`$${price.perPiece}`},
          !isFilamentItem&&isWeightPrice&&{l:"Total",v:`$${price.total}`},
          !isFilamentItem&&isWeightPrice&&{l:"Weight/piece",v:`${item.weightPerPiece}g`},
          !isFilamentItem&&isWeightPrice&&{l:"Price/kg",v:`$${item.pricePerKg}`},
        ].filter(Boolean).map(r=>
          React.createElement("div",{key:r.l,style:{background:"rgba(255,255,255,0.7)",borderRadius:10,padding:"8px 10px"}},
            React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:0.5}},r.l),
            React.createElement("div",{style:{fontSize:13,fontWeight:800,color:"#111827",marginTop:2}},r.v)
          )
        )
      ),
      React.createElement("div",{style:{display:"flex",gap:8,marginTop:12}},
        React.createElement("button",{onClick:onEdit,style:{flex:1,padding:"9px",borderRadius:12,border:"none",background:"#16a34a",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}},"✏️ Edit"),
        React.createElement("button",{onClick:()=>{onDelete(item);onClose();},style:{padding:"9px 14px",borderRadius:12,border:"none",background:"#fff1f2",color:"#dc2626",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}},"🗑️")
      )
    ),
    React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:4}},`📋 History (${ih.length})`),
    ih.length===0?React.createElement("div",{style:{color:"#9ca3af",fontSize:13,padding:"20px 0",textAlign:"center"}},"No changes yet."):ih.map(e=>React.createElement(HRow,{key:e.id,ev:e,showItem:false}))
  );
}

// ── Item Form ─────────────────────────────────────────────────
function ItemFormFull({item,onSave,onClose,quickItems,pinnedItems,onTogglePin,isFilament}){
  const defCategory=isFilament?"🧵 Filament":item?.category||"🧴 Other";
  const [f,setF]=useState(item?{
    name:item.name||"",amount:String(item.amount)||"",unit:item.unit||(isFilament?"g":"units"),
    category:item.category||defCategory,expiry:item.expiry||"",
    priceVal:String(item.priceVal||""),priceMode:item.priceMode||"per unit",note:item.note||"",
    lowThreshold:String(item.lowThreshold??1),
    color:item.color||FILAMENT_COLORS[0],filamentType:item.filamentType||FILAMENT_TYPES[0],
    // Weight-based pricing fields
    priceType:item.priceType||"simple", // "simple" | "weight"
    weightPerPiece:String(item.weightPerPiece||""),
    pricePerKg:String(item.pricePerKg||""),
  }:{
    name:"",amount:"",unit:isFilament?"g":"units",category:defCategory,expiry:"",
    priceVal:"",priceMode:"per unit",note:"",lowThreshold:"1",
    color:FILAMENT_COLORS[0],filamentType:FILAMENT_TYPES[0],
    priceType:"simple",weightPerPiece:"",pricePerKg:"",
  });
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isPieceUnit=PIECE_UNITS.includes(f.unit);
  const derived=useMemo(()=>calcPrice(f.priceVal,f.priceMode,f.amount),[f.priceVal,f.priceMode,f.amount]);
  const weightDerived=useMemo(()=>calcWeightPrice(f.weightPerPiece,f.pricePerKg,f.amount),[f.weightPerPiece,f.pricePerKg,f.amount]);
  const inp={width:"100%",padding:"10px 12px",borderRadius:12,border:"1.5px solid #d1fae5",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f9fafb",boxSizing:"border-box"};
  const isFilamentItem=isFilament||f.category==="🧵 Filament";

  return React.createElement("div",null,
    // Quick add
    !isFilament&&quickItems.length>0&&React.createElement("div",{style:{marginBottom:14}},
      React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},"⚡ Quick Add"),
      React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:6}},
        quickItems.map(q=>React.createElement("button",{key:q.name,onClick:()=>set("name",q.name),style:{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${q.pinned?"#16a34a":"#d1fae5"}`,background:q.pinned?"#f0fdf4":"#fff",color:q.pinned?"#15803d":"#374151",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}},q.pinned&&"📌 ",q.name))
      )
    ),
    // Name
    React.createElement("div",{style:{marginBottom:12}},
      React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Name *"),
      React.createElement("div",{style:{position:"relative"}},
        React.createElement("input",{style:{...inp,paddingRight:40},placeholder:isFilament?"e.g. eSun PLA+ Black…":"e.g. Whole Milk…",value:f.name,onChange:e=>set("name",e.target.value)}),
        !isFilament&&f.name.trim()&&React.createElement("button",{onClick:()=>onTogglePin(f.name.trim()),style:{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:(pinnedItems||[]).includes(f.name.trim())?1:0.3}},"📌")
      )
    ),
    // Filament-specific fields
    isFilamentItem&&React.createElement("div",{style:{background:"#f0fdf4",borderRadius:14,padding:"12px",marginBottom:12,border:"1px solid #dcfce7"}},
      React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#15803d",textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}},"🧵 Filament Details"),
      // Color picker
      React.createElement("div",{style:{marginBottom:10}},
        React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Color"),
        React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8}},
          React.createElement("div",{style:{width:22,height:22,borderRadius:"50%",background:COLOR_HEX[f.color]||"#9ca3af",border:"2px solid rgba(0,0,0,0.15)",flexShrink:0}}),
          React.createElement("select",{style:{...inp,flex:1,background:"#fff"},value:f.color,onChange:e=>set("color",e.target.value)},
            FILAMENT_COLORS.map(c=>React.createElement("option",{key:c},c))
          )
        )
      ),
      // Type picker
      React.createElement("div",null,
        React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Filament Type"),
        React.createElement("select",{style:{...inp,background:"#fff"},value:f.filamentType,onChange:e=>set("filamentType",e.target.value)},
          FILAMENT_TYPES.map(t=>React.createElement("option",{key:t},t))
        )
      )
    ),
    // Amount + Unit
    React.createElement("div",{style:{display:"flex",gap:10,marginBottom:12}},
      React.createElement("div",{style:{flex:1}},React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Amount *"),React.createElement("input",{style:inp,type:"number",min:"0",step:"0.01",placeholder:"0",value:f.amount,onChange:e=>set("amount",e.target.value)})),
      React.createElement("div",{style:{flex:1}},React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Unit"),React.createElement("select",{style:inp,value:f.unit,onChange:e=>set("unit",e.target.value)},UNITS.map(u=>React.createElement("option",{key:u},u))))
    ),
    // Low stock threshold
    React.createElement("div",{style:{marginBottom:12}},
      React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Low Stock Alert At (optional, default 1)"),
      React.createElement("input",{style:inp,type:"number",min:"0",step:"0.1",placeholder:"1",value:f.lowThreshold,onChange:e=>set("lowThreshold",e.target.value)})
    ),
    // Category (pantry only)
    !isFilamentItem&&React.createElement("div",{style:{marginBottom:12}},
      React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Category"),
      React.createElement("select",{style:inp,value:f.category,onChange:e=>set("category",e.target.value)},
        CATEGORIES.map(c=>React.createElement("option",{key:c},c))
      )
    ),
    // Expiry / Date Bought
    React.createElement("div",{style:{marginBottom:12}},
      React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},isFilamentItem?"Date Bought (optional)":"Expiry Date (optional)"),
      React.createElement("input",{style:inp,type:"date",value:f.expiry,onChange:e=>set("expiry",e.target.value)})
    ),
    // Price (pantry only)
    !isFilamentItem&&React.createElement("div",{style:{background:"#f0fdf4",borderRadius:14,padding:"12px",marginBottom:12,border:"1px solid #dcfce7"}},
      React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}},"💰 Price (optional)"),
      // Price mode toggle — only show weight option for piece units
      isPieceUnit&&React.createElement("div",{style:{display:"flex",background:"#fff",borderRadius:10,padding:3,marginBottom:10,border:"1px solid #d1fae5"}},
        [{k:"simple",l:"Price per piece"},{k:"weight",l:"Weight × $/kg"}].map(opt=>
          React.createElement("button",{key:opt.k,onClick:()=>set("priceType",opt.k),style:{flex:1,padding:"7px 4px",borderRadius:8,border:"none",background:f.priceType===opt.k?"#16a34a":"transparent",color:f.priceType===opt.k?"#fff":"#6b7280",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}},opt.l)
        )
      ),
      // Simple mode
      f.priceType==="simple"&&React.createElement("div",null,
        React.createElement("div",{style:{display:"flex",gap:10}},
          React.createElement("input",{style:{...inp,flex:1,background:"#fff"},type:"number",min:"0",step:"0.01",placeholder:"0.00",value:f.priceVal,onChange:e=>set("priceVal",e.target.value)}),
          React.createElement("select",{style:{...inp,flex:1,background:"#fff"},value:f.priceMode,onChange:e=>set("priceMode",e.target.value)},PRICE_MODES.map(m=>React.createElement("option",{key:m},m)))
        ),
        derived&&React.createElement("div",{style:{display:"flex",gap:14,marginTop:8,fontSize:13,fontWeight:700}},
          React.createElement("span",{style:{color:"#16a34a"}},`Total: $${derived.total}`),
          parseFloat(f.amount)>1&&React.createElement("span",{style:{color:"#6b7280"}},`Per piece: $${derived.perUnit}`)
        )
      ),
      // Weight-based mode
      f.priceType==="weight"&&React.createElement("div",null,
        React.createElement("div",{style:{fontSize:11,color:"#6b7280",marginBottom:8}},
          "Enter the weight of each piece and your price per kg — the app calculates the rest."
        ),
        React.createElement("div",{style:{display:"flex",gap:10,marginBottom:8}},
          React.createElement("div",{style:{flex:1}},
            React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:4}},"Weight per piece (g)"),
            React.createElement("input",{style:{...inp,background:"#fff"},type:"number",min:"0",step:"1",placeholder:"e.g. 250",value:f.weightPerPiece,onChange:e=>set("weightPerPiece",e.target.value)})
          ),
          React.createElement("div",{style:{flex:1}},
            React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:4}},"Price per kg ($)"),
            React.createElement("input",{style:{...inp,background:"#fff"},type:"number",min:"0",step:"0.01",placeholder:"e.g. 12.00",value:f.pricePerKg,onChange:e=>set("pricePerKg",e.target.value)})
          )
        ),
        weightDerived&&React.createElement("div",{style:{background:"rgba(22,163,74,0.08)",borderRadius:10,padding:"8px 12px",fontSize:13,fontWeight:700}},
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:3}},
            React.createElement("span",{style:{color:"#6b7280"}},"Per piece"),
            React.createElement("span",{style:{color:"#16a34a"}},`$${weightDerived.perPiece}`)
          ),
          parseFloat(f.amount)>0&&React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}},
            React.createElement("span",{style:{color:"#6b7280"}},`Total (${f.amount} pieces)`),
            React.createElement("span",{style:{color:"#16a34a"}},`$${weightDerived.total}`)
          )
        )
      )
    ),
    // Note
    React.createElement("div",{style:{marginBottom:16}},
      React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Note (optional)"),
      React.createElement("input",{style:inp,placeholder:isFilamentItem?"e.g. Brand, bought from Amazon…":"e.g. Organic, from Costco…",value:f.note,onChange:e=>set("note",e.target.value)})
    ),
    React.createElement("div",{style:{display:"flex",gap:10}},
      React.createElement("button",{onClick:onClose,style:{flex:1,padding:"11px",borderRadius:12,border:"1.5px solid #d1fae5",background:"#fff",color:"#6b7280",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}},"Cancel"),
      React.createElement("button",{onClick:()=>{if(f.name.trim()&&f.amount)onSave(f);},style:{flex:2,padding:"11px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}},item?"Save Changes":"Add Item")
    )
  );
}

// ── Members Panel ─────────────────────────────────────────────
function MembersPanel({list,isAdmin,inviteEmail,setInviteEmail,inviteMsg,onInvite,onRemove}){
  const inp={flex:1,padding:"10px 12px",borderRadius:12,border:"1.5px solid #d1fae5",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f9fafb"};
  return React.createElement("div",null,
    React.createElement("div",{style:{marginBottom:16}},
      React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},"Add Member by Email"),
      React.createElement("div",{style:{display:"flex",gap:8}},
        React.createElement("input",{style:inp,placeholder:"name@email.com",type:"email",value:inviteEmail,onChange:e=>setInviteEmail(e.target.value)}),
        React.createElement("button",{onClick:onInvite,style:{padding:"10px 16px",borderRadius:12,border:"none",background:"#16a34a",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}},"Add")
      ),
      inviteMsg.err&&React.createElement("div",{style:{color:"#dc2626",fontSize:12,marginTop:6,padding:"6px 10px",background:"#fee2e2",borderRadius:8}},inviteMsg.err),
      inviteMsg.ok&&React.createElement("div",{style:{color:"#16a34a",fontSize:12,marginTop:6,padding:"6px 10px",background:"#f0fdf4",borderRadius:8}},inviteMsg.ok)
    ),
    React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},"Members"),
    (list.memberEmails||[list.adminEmail]).map((email,i)=>React.createElement("div",{key:email,style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f0fdf4"}},
      React.createElement("div",null,
        React.createElement("div",{style:{fontSize:14,fontWeight:700,color:"#111827"}},email),
        list.adminEmail===email&&React.createElement("div",{style:{fontSize:11,color:"#16a34a",fontWeight:700}},"Admin")
      ),
      isAdmin&&list.adminEmail!==email&&React.createElement("button",{onClick:()=>onRemove(list.memberIds[i],email),style:{background:"#fff1f2",border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:12,color:"#dc2626",fontFamily:"inherit"}},"Remove")
    ))
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────
function DashboardTab({items,isFilament,openDetail,setTab,totalVal,alertCount}){
  const cats=isFilament?["🧵 Filament"]:CATEGORIES;

  // Summary numbers
  const expired=items.filter(i=>daysUntil(i.expiry)<0);
  const soonExp=items.filter(i=>{const d=daysUntil(i.expiry);return d!==null&&d>=0&&d<=7;});
  const low=items.filter(i=>isLowStock(i));

  // Category data
  const catData=cats.map(cat=>{
    const catItems=items.filter(i=>i.category===cat);
    if(!catItems.length)return null;
    const expiredCat=catItems.filter(i=>daysUntil(i.expiry)<0);
    const soonCat=catItems.filter(i=>{const d=daysUntil(i.expiry);return d!==null&&d>=0&&d<=7;});
    const lowCat=catItems.filter(i=>isLowStock(i));
    // Next expiring item
    const withExpiry=catItems.filter(i=>i.expiry).sort((a,b)=>(daysUntil(a.expiry)??9999)-(daysUntil(b.expiry)??9999));
    const nextExp=withExpiry[0]||null;
    return{cat,items:catItems,expired:expiredCat,soon:soonCat,low:lowCat,nextExp,count:catItems.length};
  }).filter(Boolean);

  // Filament: group by color instead
  const filamentColors=isFilament?[...new Set(items.map(i=>i.color).filter(Boolean))]:[];

  function StatusDot({color}){
    return React.createElement("span",{style:{width:8,height:8,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0}});
  }

  function SummaryCard({label,value,color,bg,onClick}){
    return React.createElement("div",{onClick,style:{background:bg,borderRadius:14,padding:"12px 10px",textAlign:"center",border:`1.5px solid ${color}33`,cursor:onClick?"pointer":"default",flex:1}},
      React.createElement("div",{style:{fontSize:22,fontWeight:900,color}},(value)),
      React.createElement("div",{style:{fontSize:10,fontWeight:800,color,textTransform:"uppercase",letterSpacing:0.5,marginTop:2,opacity:0.8}},label)
    );
  }

  return React.createElement("div",null,
    // Top summary bar
    React.createElement("div",{style:{display:"flex",gap:8,marginBottom:16}},
      React.createElement(SummaryCard,{label:"Items",value:items.length,color:"#16a34a",bg:"#f0fdf4"}),
      !isFilament&&React.createElement(SummaryCard,{label:"Expiring",value:soonExp.length,color:"#d97706",bg:"#fffbeb",onClick:()=>setTab("alerts")}),
      React.createElement(SummaryCard,{label:"Low/Empty",value:low.length,color:"#dc2626",bg:"#fff5f5",onClick:()=>setTab("alerts")}),
      totalVal>0&&React.createElement(SummaryCard,{label:"Value",value:`$${totalVal.toFixed(0)}`,color:"#7c3aed",bg:"#faf5ff"})
    ),

    // Filament dashboard — cards by color
    isFilament&&React.createElement("div",null,
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:10}},"By Color"),
      filamentColors.length===0&&React.createElement("div",{style:{textAlign:"center",color:"#9ca3af",padding:"30px 0"}},"No filament added yet"),
      filamentColors.map(color=>{
        const colorItems=items.filter(i=>i.color===color);
        const lowColor=colorItems.filter(i=>isLowStock(i));
        return React.createElement("div",{key:color,style:{background:"#fff",borderRadius:16,padding:"14px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:"1.5px solid #f0fdf4"}},
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:10}},
            React.createElement("div",{style:{width:20,height:20,borderRadius:"50%",background:COLOR_HEX[color]||"#9ca3af",border:"2px solid rgba(0,0,0,0.12)",flexShrink:0}}),
            React.createElement("span",{style:{fontWeight:900,fontSize:15,color:"#111827",flex:1}},color),
            lowColor.length>0&&React.createElement("span",{style:{fontSize:11,background:"#fee2e2",color:"#dc2626",borderRadius:20,padding:"2px 8px",fontWeight:800}},`🪫 ${lowColor.length} low`)
          ),
          React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:4}},
            colorItems.map(item=>React.createElement("div",{key:item.id,onClick:()=>openDetail(item),style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",background:"#f9fafb",borderRadius:10,cursor:"pointer"}},
              React.createElement("div",null,
                React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"#111827"}},item.name),
                item.filamentType&&React.createElement("span",{style:{fontSize:11,color:"#9ca3af",marginLeft:6}},item.filamentType)
              ),
              React.createElement("span",{style:{fontSize:13,fontWeight:800,color:isLowStock(item)?"#dc2626":"#374151"}},`${item.amount} ${item.unit}`)
            ))
          )
        );
      })
    ),

    // Pantry dashboard — cards by category
    !isFilament&&React.createElement("div",null,
      catData.length===0&&React.createElement("div",{style:{textAlign:"center",color:"#9ca3af",padding:"40px 20px"}},"Add some items to see your dashboard!"),
      catData.map(({cat,items:catItems,expired:expCat,soon:soonCat,low:lowCat,nextExp,count})=>{
        const hasIssues=expCat.length>0||soonCat.length>0||lowCat.length>0;
        const borderColor=expCat.length>0?"#fecaca":soonCat.length>0?"#fde68a":lowCat.length>0?"#fca5a5":"#f0fdf4";
        const headerBg=expCat.length>0?"#fff5f5":soonCat.length>0?"#fffbeb":lowCat.length>0?"#fff5f5":"#f0fdf4";

        return React.createElement("div",{key:cat,style:{background:"#fff",borderRadius:18,marginBottom:12,boxShadow:"0 1px 6px rgba(0,0,0,0.07)",border:`1.5px solid ${borderColor}`,overflow:"hidden"}},
          // Category header
          React.createElement("div",{style:{background:headerBg,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}},
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8}},
              React.createElement("span",{style:{fontSize:18}},(cat.split(" ")[0])),
              React.createElement("span",{style:{fontSize:14,fontWeight:900,color:"#111827"}},(cat.split(" ").slice(1).join(" "))),
              React.createElement("span",{style:{background:"#fff",color:"#6b7280",borderRadius:20,padding:"1px 8px",fontSize:11,fontWeight:800}},count)
            ),
            React.createElement("div",{style:{display:"flex",gap:5}},
              expCat.length>0&&React.createElement("span",{style:{fontSize:10,background:"#dc2626",color:"#fff",borderRadius:20,padding:"2px 7px",fontWeight:800}},`${expCat.length} exp`),
              soonCat.length>0&&React.createElement("span",{style:{fontSize:10,background:"#f59e0b",color:"#fff",borderRadius:20,padding:"2px 7px",fontWeight:800}},`${soonCat.length} soon`),
              lowCat.length>0&&React.createElement("span",{style:{fontSize:10,background:"#ef4444",color:"#fff",borderRadius:20,padding:"2px 7px",fontWeight:800}},`${lowCat.length} low`)
            )
          ),
          // Items list
          React.createElement("div",{style:{padding:"6px 0"}},
            catItems
              .sort((a,b)=>{
                // Sort: expired first, then expiring soon, then low stock, then by expiry
                const da=daysUntil(a.expiry)??9999,db=daysUntil(b.expiry)??9999;
                const aLow=isLowStock(a),bLow=isLowStock(b);
                if(da<0&&db>=0)return -1;if(db<0&&da>=0)return 1;
                if(aLow&&!bLow)return -1;if(bLow&&!aLow)return 1;
                return da-db;
              })
              .map((item,idx,arr)=>{
                const days=daysUntil(item.expiry);
                const low=isLowStock(item);
                const isLast=idx===arr.length-1;
                const rowBg=days!==null&&days<0?"#fff5f5":days!==null&&days<=2?"#fffbeb":low?"#fff5f5":"#fff";
                return React.createElement("div",{key:item.id,onClick:()=>openDetail(item),style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",background:rowBg,borderBottom:isLast?"none":"1px solid #f7faf8",cursor:"pointer",gap:8}},
                  React.createElement("div",{style:{flex:1,minWidth:0}},
                    React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6}},
                      React.createElement("span",{style:{fontSize:13,fontWeight:700,color:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},item.name),
                      low&&React.createElement("span",{style:{fontSize:10,background:"#fee2e2",color:"#dc2626",borderRadius:8,padding:"1px 5px",fontWeight:800,flexShrink:0}},"🪫")
                    ),
                    item.expiry&&React.createElement("div",{style:{display:"flex",alignItems:"center",gap:5,marginTop:2}},
                      React.createElement("span",{style:{fontSize:11,color:days<0?"#dc2626":days<=2?"#d97706":days<=7?"#a16207":"#9ca3af"}},
                        days<0?`Expired ${Math.abs(days)}d ago`:days===0?"Expires today":`${days}d left`
                      )
                    )
                  ),
                  React.createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}},
                    React.createElement("span",{style:{fontSize:13,fontWeight:800,color:low?"#dc2626":"#374151"}},`${item.amount} ${item.unit}`),
                    React.createElement(Badge,{days})
                  )
                );
              })
          ),
          // Next expiry footer (if items have expiry)
          nextExp&&React.createElement("div",{style:{padding:"8px 14px",background:"#f9fafb",borderTop:"1px solid #f0fdf4",fontSize:11,color:"#9ca3af",display:"flex",justifyContent:"space-between"}},
            React.createElement("span",null,"Next expiry"),
            React.createElement("span",{style:{fontWeight:700,color:daysUntil(nextExp.expiry)<=7?"#d97706":"#374151"}},`${nextExp.name} · ${fmtDate(nextExp.expiry)}`)
          )
        );
      })
    )
  );
}

// ── List View ─────────────────────────────────────────────────
function ListView({list,userId,userProfile,onBack,isHome,onSetHome}){
  const isFilament=list.listType==="filament";
  const [items,setItems]=useState([]);
  const [hist,setHist]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [filterCat,setFilterCat]=useState("All");
  const [sortBy,setSortBy]=useState("expiry");
  const [tab,setTab]=useState("dashboard");
  const [showAdd,setShowAdd]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [showMembers,setShowMembers]=useState(false);
  const [pinnedItems,setPinnedItems]=useState(userProfile?.pinnedItems||[]);
  const [frequentItems,setFrequentItems]=useState([]);
  const [detailItem,setDetailItem]=useState(null);
  const [showDetail,setShowDetail]=useState(false);
  const [hFilter,setHFilter]=useState("all");
  const [inviteEmail,setInviteEmail]=useState("");
  const [inviteMsg,setInviteMsg]=useState({});
  const [showProfile,setShowProfile]=useState(false);
  const isAdmin=list.adminId===userId;
  const photoURL=auth.currentUser?.photoURL||userProfile?.photoURL||"";

  useEffect(()=>{
    const q=query(collection(db,"lists",list.id,"items"),orderBy("addedAt","desc"));
    return onSnapshot(q,snap=>{setItems(snap.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);});
  },[list.id]);
  useEffect(()=>{
    const q=query(collection(db,"lists",list.id,"history"),orderBy("ts","desc"));
    return onSnapshot(q,snap=>{setHist(snap.docs.map(d=>({id:d.id,...d.data()})));});
  },[list.id]);
  useEffect(()=>{
    getDoc(doc(db,"users",userId)).then(snap=>{
      const freq=snap.data()?.itemFrequency||{};
      setFrequentItems(Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(e=>e[0]));
      setPinnedItems(snap.data()?.pinnedItems||[]);
    });
  },[userId]);

  async function addHist(itemId,itemName,action,detail){
    await addDoc(collection(db,"lists",list.id,"history"),{itemId,itemName,action,detail,user:auth.currentUser?.displayName||auth.currentUser?.email||"Unknown",userId,ts:serverTimestamp()});
  }
  async function togglePin(name){
    const updated=pinnedItems.includes(name)?pinnedItems.filter(n=>n!==name):[...pinnedItems,name];
    setPinnedItems(updated);
    await updateDoc(doc(db,"users",userId),{pinnedItems:updated});
  }
  async function adjust(item,delta){
    const nv=Math.max(0,parseFloat((item.amount+delta).toFixed(3)));
    await updateDoc(doc(db,"lists",list.id,"items",item.id),{amount:nv});
    await addHist(item.id,item.name,delta>0?"increased":"decreased",`${item.amount} ${item.unit} → ${nv} ${item.unit}`);
    if(detailItem&&detailItem.id===item.id)setDetailItem({...item,amount:nv});
  }
  async function saveItem(f){
    const data={...f,amount:parseFloat(f.amount),
      priceVal:f.priceVal?parseFloat(f.priceVal):null,
      lowThreshold:f.lowThreshold!=""?parseFloat(f.lowThreshold):1,
      weightPerPiece:f.weightPerPiece?parseFloat(f.weightPerPiece):null,
      pricePerKg:f.pricePerKg?parseFloat(f.pricePerKg):null,
      updatedAt:serverTimestamp(),
      category:isFilament?"🧵 Filament":f.category
    };
    if(editItem){
      await updateDoc(doc(db,"lists",list.id,"items",editItem.id),data);
      await addHist(editItem.id,f.name,"edited","Item details updated");
    }else{
      const ref=await addDoc(collection(db,"lists",list.id,"items"),{...data,addedAt:serverTimestamp()});
      await addHist(ref.id,f.name,"added",`${f.amount} ${f.unit} added`);
      if(!isFilament){
        const uref=doc(db,"users",userId);
        const snap=await getDoc(uref);
        const freq=snap.data()?.itemFrequency||{};
        freq[f.name.trim()]=(freq[f.name.trim()]||0)+1;
        await updateDoc(uref,{itemFrequency:freq});
      }
    }
    setShowAdd(false);setEditItem(null);
  }
  async function deleteItem(item){
    await addHist(item.id,item.name,"removed",`${item.amount} ${item.unit} removed`);
    await deleteDoc(doc(db,"lists",list.id,"items",item.id));
  }
  async function inviteMember(){
    setInviteMsg({});
    const emailToFind=inviteEmail.trim().toLowerCase();
    if(!emailToFind){setInviteMsg({err:"Please enter an email."});return;}
    try{
      const allUsers=await getDocs(collection(db,"users"));
      const match=allUsers.docs.find(d=>(d.data().email||"").toLowerCase()===emailToFind);
      if(!match){setInviteMsg({err:"No account found. They need to sign up first."});return;}
      if(list.memberIds.includes(match.id)){setInviteMsg({err:"Already a member."});return;}
      await updateDoc(doc(db,"lists",list.id),{memberIds:arrayUnion(match.id),memberEmails:arrayUnion(emailToFind)});
      await updateDoc(doc(db,"users",match.id),{listIds:arrayUnion(list.id)});
      setInviteMsg({ok:`✅ ${emailToFind} added!`});
      setInviteEmail("");
    }catch(e){setInviteMsg({err:"Something went wrong."});}
  }

  const filtered=useMemo(()=>items
    .filter(i=>i.name?.toLowerCase().includes(search.toLowerCase())&&(filterCat==="All"||i.category===filterCat||isFilament))
    .sort((a,b)=>sortBy==="expiry"?(daysUntil(a.expiry)??9999)-(daysUntil(b.expiry)??9999):sortBy==="name"?a.name?.localeCompare(b.name):a.category?.localeCompare(b.category))
  ,[items,search,filterCat,sortBy]);

  const expiring=!isFilament?items.filter(i=>{const d=daysUntil(i.expiry);return d!==null&&d<=3;}):[];
  const lowStock=items.filter(i=>isLowStock(i));
  const alertCount=(!isFilament?(items.filter(i=>daysUntil(i.expiry)<0).length+items.filter(i=>{const d=daysUntil(i.expiry);return d!==null&&d>=0&&d<=7;}).length):0)+lowStock.length;
  const totalVal=items.reduce((acc,i)=>{
    const p=i.priceType==="weight"?calcWeightPrice(i.weightPerPiece,i.pricePerKg,i.amount):calcPrice(i.priceVal,i.priceMode,i.amount);
    return acc+(p?parseFloat(p.total):0);
  },0);
  const filtHist=useMemo(()=>hFilter==="all"?hist:hist.filter(h=>h.action===hFilter),[hist,hFilter]);
  const quickItems=useMemo(()=>{const p=(pinnedItems||[]).map(n=>({name:n,pinned:true}));const fr=(frequentItems||[]).filter(n=>!(pinnedItems||[]).includes(n)).slice(0,8).map(n=>({name:n,pinned:false}));return[...p,...fr].slice(0,12);},[pinnedItems,frequentItems]);
  const inp={width:"100%",padding:"10px 12px",borderRadius:12,border:"1.5px solid #d1fae5",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f9fafb",boxSizing:"border-box"};
  const TABS=[["dashboard","🗂️ Overview"],["items","📦 Items"],["alerts","⚠️"+(alertCount>0?` (${alertCount})`:"")],["chat","💬 Chat"],["history","🕐 History"],["stats","📊 Stats"]];
  const listColor=isFilament?"linear-gradient(135deg,#7c3aed,#5b21b6)":"linear-gradient(135deg,#16a34a,#15803d)";

  return React.createElement("div",{style:{fontFamily:"'Nunito',sans-serif",background:"#f0fdf4",minHeight:"100vh",maxWidth:480,margin:"0 auto"}},
    React.createElement("header",{style:{background:listColor,padding:"13px 14px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 12px rgba(0,0,0,0.2)",display:"flex",alignItems:"center",justifyContent:"space-between"}},
      React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10}},
        React.createElement("button",{onClick:onBack,style:{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:10,color:"#fff",fontWeight:900,fontSize:17,cursor:"pointer",padding:"4px 12px",fontFamily:"inherit"}},"←"),
        React.createElement("div",null,
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:7}},
            React.createElement("span",{style:{fontSize:17,fontWeight:900,color:"#fff"}},`${list.emoji} ${list.name}`),
            isHome&&React.createElement("span",{style:{background:"rgba(255,255,255,0.25)",color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:800}},"🏠 HOME"),
            isFilament&&React.createElement("span",{style:{background:"rgba(255,255,255,0.2)",color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:800}},"🧵")
          ),
          React.createElement("div",{style:{fontSize:11,color:"rgba(255,255,255,0.65)"}},`${list.memberEmails?.length||1} members · ${items.length} items`)
        )
      ),
      React.createElement("div",{style:{display:"flex",gap:6,alignItems:"center"}},
        React.createElement("button",{onClick:()=>onSetHome(list.id),style:{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:10,color:"#fff",fontSize:15,cursor:"pointer",padding:"6px 10px"}},isHome?"🏠":"🏡"),
        isAdmin&&React.createElement("button",{onClick:()=>setShowMembers(true),style:{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:10,color:"#fff",fontSize:15,cursor:"pointer",padding:"6px 10px"}},"👥"),
        React.createElement(Avatar,{size:32,photoURL,displayName:auth.currentUser?.displayName,onClick:()=>setShowProfile(true),style:{border:"2px solid rgba(255,255,255,0.5)"}}),
        React.createElement("button",{onClick:()=>{setEditItem(null);setShowAdd(true);},style:{background:"#fff",color:isFilament?"#7c3aed":"#16a34a",border:"none",borderRadius:20,padding:"7px 14px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}},"+ Add")
      )
    ),
    (expiring.length>0||lowStock.length>0)&&React.createElement("div",{style:{background:"#fef3c7",borderBottom:"2px solid #f59e0b",padding:"8px 14px",display:"flex",gap:8,alignItems:"center"}},
      React.createElement("span",null,"⚠️"),
      React.createElement("span",{style:{fontSize:12,color:"#92400e",fontWeight:700}},[expiring.length>0&&`${expiring.length} expiring soon`,lowStock.length>0&&`${lowStock.length} low/empty`].filter(Boolean).join(" · "))
    ),
    React.createElement("nav",{style:{display:"flex",background:"#fff",borderBottom:"1px solid #dcfce7",overflowX:"auto"}},
      TABS.map(([k,l])=>React.createElement("button",{key:k,onClick:()=>setTab(k),style:{flexShrink:0,padding:"10px 10px",background:"none",border:"none",borderBottom:`3px solid ${tab===k?(isFilament?"#7c3aed":"#16a34a"):"transparent"}`,cursor:"pointer",fontSize:11,fontWeight:700,color:tab===k?(isFilament?"#7c3aed":"#16a34a"):"#9ca3af",fontFamily:"inherit",whiteSpace:"nowrap"}},l))
    ),
    React.createElement("main",{style:{padding:tab==="chat"?"0":"14px 14px 80px"}},
      tab==="dashboard"&&React.createElement(DashboardTab,{items,isFilament,openDetail:(item)=>{setDetailItem(item);setShowDetail(true);},setTab,totalVal,alertCount}),
      tab==="items"&&React.createElement(ItemsTab,{filtered,items,hist,search,setSearch,filterCat,setFilterCat,sortBy,setSortBy,totalVal,loading,setEditItem,setShowAdd,openDetail:(item)=>{setDetailItem(item);setShowDetail(true);},adjust,deleteItem,inp,isFilament}),
      tab==="alerts"&&React.createElement(AlertsTab,{items,openDetail:(item)=>{setDetailItem(item);setShowDetail(true);},isFilament}),
      tab==="chat"&&React.createElement(ChatTab,{listId:list.id,userId,userProfile}),
      tab==="history"&&React.createElement(HistoryTab,{hist:filtHist,hFilter,setHFilter}),
      tab==="stats"&&React.createElement(StatsTab,{items,totalVal,isFilament})
    ),
    React.createElement(Sheet,{show:showAdd,onClose:()=>{setShowAdd(false);setEditItem(null);},title:editItem?"Edit Item":"Add Item"},
      React.createElement(ItemFormFull,{item:editItem,onSave:saveItem,onClose:()=>{setShowAdd(false);setEditItem(null);},quickItems,pinnedItems,onTogglePin:togglePin,isFilament})
    ),
    React.createElement(Sheet,{show:showMembers,onClose:()=>setShowMembers(false),title:"👥 Members"},
      React.createElement(MembersPanel,{list,isAdmin,inviteEmail,setInviteEmail,inviteMsg,onInvite:inviteMember,onRemove:async(uid,email)=>{await updateDoc(doc(db,"lists",list.id),{memberIds:arrayRemove(uid),memberEmails:arrayRemove(email)});await updateDoc(doc(db,"users",uid),{listIds:arrayRemove(list.id)});}})
    ),
    React.createElement(ItemDetailSheet,{item:detailItem,hist,show:showDetail,onClose:()=>setShowDetail(false),onEdit:()=>{setEditItem(detailItem);setShowDetail(false);setShowAdd(true);},onAdjust:adjust,onDelete:deleteItem,isFilament}),
    React.createElement(ProfileSheet,{show:showProfile,onClose:()=>setShowProfile(false),userId,userProfile})
  );
}

// ── Home Screen ───────────────────────────────────────────────
function HomeScreen({userId,userProfile}){
  const [lists,setLists]=useState([]);
  const [loading,setLoading]=useState(true);
  const [activeList,setActiveList]=useState(null);
  const [homeListId,setHomeListId]=useState(userProfile?.homeListId||null);
  const [showCreate,setShowCreate]=useState(false);
  const [newName,setNewName]=useState("");
  const [newEmoji,setNewEmoji]=useState("🏠");
  const [newType,setNewType]=useState("pantry");
  const [creating,setCreating]=useState(false);
  const [showProfile,setShowProfile]=useState(false);
  const emojis=["🏠","🛒","🍽️","❄️","🌿","🎒","⭐","🧺","🧵","🖨️","🎨","📦"];
  const photoURL=auth.currentUser?.photoURL||userProfile?.photoURL||"";

  useEffect(()=>{
    if(!userProfile?.listIds?.length){setLoading(false);return;}
    const listMap={};
    const unsubs=userProfile.listIds.map(lid=>onSnapshot(doc(db,"lists",lid),snap=>{
      if(snap.exists())listMap[lid]={id:lid,...snap.data()};
      else delete listMap[lid];
      setLists(Object.values(listMap).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0)));
      setLoading(false);
    }));
    return()=>unsubs.forEach(u=>u());
  },[userProfile?.listIds]);

  async function createList(){
    if(!newName.trim())return;
    setCreating(true);
    const ref=await addDoc(collection(db,"lists"),{name:newName.trim(),emoji:newEmoji,listType:newType,adminId:userId,adminEmail:auth.currentUser.email,memberIds:[userId],memberEmails:[auth.currentUser.email],createdAt:serverTimestamp()});
    await updateDoc(doc(db,"users",userId),{listIds:arrayUnion(ref.id)});
    setNewName("");setNewType("pantry");setCreating(false);setShowCreate(false);
  }
  async function setHomeList(listId){
    const newHome=listId===homeListId?null:listId;
    setHomeListId(newHome);
    await updateDoc(doc(db,"users",userId),{homeListId:newHome});
  }
  async function deleteList(list){
    if(!window.confirm(`Delete "${list.name}"?`))return;
    await deleteDoc(doc(db,"lists",list.id));
    await updateDoc(doc(db,"users",userId),{listIds:arrayRemove(list.id)});
  }

  const homeList=lists.find(l=>l.id===homeListId);
  const inp={width:"100%",padding:"11px 14px",borderRadius:12,border:"1.5px solid #d1fae5",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f9fafb",boxSizing:"border-box",marginBottom:14};

  if(activeList){
    const full=lists.find(l=>l.id===activeList);
    if(full)return React.createElement(ListView,{list:full,userId,userProfile,onBack:()=>setActiveList(null),isHome:homeListId===activeList,onSetHome:setHomeList});
  }

  return React.createElement("div",{style:{fontFamily:"'Nunito',sans-serif",background:"#f0fdf4",minHeight:"100vh",maxWidth:480,margin:"0 auto"}},
    React.createElement("header",{style:{background:"linear-gradient(135deg,#16a34a,#15803d)",padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 2px 12px rgba(22,163,74,0.3)"}},
      // Profile avatar replaces logo
      React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10},onClick:()=>setShowProfile(true)},
        React.createElement(Avatar,{size:40,photoURL,displayName:auth.currentUser?.displayName,onClick:()=>setShowProfile(true)}),
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:16,fontWeight:900,color:"#fff",letterSpacing:-0.3}},"MyPantry"),
          React.createElement("div",{style:{fontSize:11,color:"rgba(255,255,255,0.75)"}},`${auth.currentUser?.displayName||"Hi there"} · tap to edit`)
        )
      ),
      React.createElement("button",{onClick:()=>setShowCreate(true),style:{background:"#fff",color:"#16a34a",border:"none",borderRadius:20,padding:"7px 16px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}},"+ New List")
    ),
    React.createElement("main",{style:{padding:"16px 14px 80px"}},
      loading?React.createElement(Spinner,null):React.createElement("div",null,
        homeList&&React.createElement("div",{style:{marginBottom:22}},
          React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},"🏠 Home List"),
          React.createElement("div",{onClick:()=>setActiveList(homeList.id),style:{background:homeList.listType==="filament"?"linear-gradient(135deg,#7c3aed,#5b21b6)":"linear-gradient(135deg,#16a34a,#15803d)",borderRadius:18,padding:"18px",cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}},
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:14}},
              React.createElement("span",{style:{fontSize:40}},homeList.emoji),
              React.createElement("div",null,
                React.createElement("div",{style:{fontSize:22,fontWeight:900,color:"#fff"}},homeList.name),
                React.createElement("div",{style:{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:2}},`${homeList.memberEmails?.length||1} members${homeList.listType==="filament"?" · 🧵 Filament":""}`)
              )
            )
          )
        ),
        React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},`All Lists (${lists.length})`),
        lists.length===0&&React.createElement("div",{style:{textAlign:"center",color:"#9ca3af",padding:"40px 20px"}},React.createElement("div",{style:{fontSize:48,marginBottom:12}},"📋"),React.createElement("div",{style:{fontWeight:700,color:"#374151"}},"No lists yet"),React.createElement("div",{style:{fontSize:13}},"Tap '+ New List' to get started!")),
        React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:10}},
          lists.map(list=>{
            const isFilament=list.listType==="filament";
            const accent=isFilament?"#7c3aed":"#16a34a";
            const accentBg=isFilament?"#faf5ff":"#dcfce7";
            return React.createElement("div",{key:list.id,onClick:()=>setActiveList(list.id),style:{background:"#fff",borderRadius:16,padding:"14px 16px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:`1.5px solid #f0fdf4`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}},
              React.createElement("div",{style:{display:"flex",alignItems:"center",gap:12}},
                React.createElement("span",{style:{fontSize:28}},list.emoji),
                React.createElement("div",null,
                  React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6}},
                    React.createElement("span",{style:{fontSize:15,fontWeight:800,color:"#111827"}},list.name),
                    list.id===homeListId&&React.createElement("span",{style:{background:accentBg,color:accent,borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:800}},"HOME"),
                    isFilament&&React.createElement("span",{style:{background:"#faf5ff",color:"#7c3aed",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:800}},"🧵")
                  ),
                  React.createElement("div",{style:{fontSize:12,color:"#9ca3af",marginTop:2}},`${list.memberEmails?.length||1} member${(list.memberEmails?.length||1)!==1?"s":""}`)
                )
              ),
              React.createElement("div",{style:{display:"flex",gap:6},onClick:e=>e.stopPropagation()},
                React.createElement("button",{onClick:()=>setHomeList(list.id),style:{background:"#f3f4f6",border:"none",borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:14}},list.id===homeListId?"🏠":"🏡"),
                list.adminId===userId&&React.createElement("button",{onClick:()=>deleteList(list),style:{background:"#fff1f2",border:"none",borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:14}},"🗑️")
              )
            );
          })
        )
      )
    ),
    // Create list sheet
    React.createElement(Sheet,{show:showCreate,onClose:()=>setShowCreate(false),title:"New List"},
      React.createElement("div",null,
        // List type selector
        React.createElement("div",{style:{marginBottom:14}},
          React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:8}},"List Type"),
          React.createElement("div",{style:{display:"flex",gap:8}},
            [{k:"pantry",l:"🥬 Pantry",desc:"Food & groceries"},{k:"filament",l:"🧵 Filament",desc:"3D printing filament"}].map(t=>
              React.createElement("div",{key:t.k,onClick:()=>setNewType(t.k),style:{flex:1,padding:"12px",borderRadius:12,border:`2px solid ${newType===t.k?"#16a34a":"#e5e7eb"}`,background:newType===t.k?"#f0fdf4":"#fff",cursor:"pointer",textAlign:"center"}},
                React.createElement("div",{style:{fontWeight:800,fontSize:14,color:newType===t.k?"#16a34a":"#374151"}},t.l),
                React.createElement("div",{style:{fontSize:11,color:"#9ca3af",marginTop:2}},t.desc)
              )
            )
          )
        ),
        React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"List Name"),
        React.createElement("input",{style:inp,placeholder:newType==="filament"?"e.g. My Filaments…":"e.g. Family Pantry…",value:newName,onChange:e=>setNewName(e.target.value)}),
        React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:8}},"Icon"),
        React.createElement("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}},
          emojis.map(e=>React.createElement("button",{key:e,onClick:()=>setNewEmoji(e),style:{fontSize:20,width:42,height:42,borderRadius:10,border:`2px solid ${newEmoji===e?"#16a34a":"#e5e7eb"}`,background:newEmoji===e?"#f0fdf4":"#fff",cursor:"pointer"}},e))
        ),
        React.createElement("div",{style:{display:"flex",gap:10}},
          React.createElement("button",{onClick:()=>setShowCreate(false),style:{flex:1,padding:"11px",borderRadius:12,border:"1.5px solid #d1fae5",background:"#fff",color:"#6b7280",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}},"Cancel"),
          React.createElement("button",{onClick:createList,disabled:creating,style:{flex:2,padding:"11px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}},creating?"Creating…":"Create List")
        )
      )
    ),
    React.createElement(ProfileSheet,{show:showProfile,onClose:()=>setShowProfile(false),userId,userProfile})
  );
}

// ── Root ──────────────────────────────────────────────────────
function App(){
  const [user,setUser]=useState(undefined);
  const [userProfile,setUserProfile]=useState(null);
  useEffect(()=>{
    return onAuthStateChanged(auth,async u=>{
      setUser(u);
      if(u){
        const snap=await getDoc(doc(db,"users",u.uid));
        setUserProfile(snap.exists()?snap.data():{listIds:[],pinnedItems:[],homeListId:null,itemFrequency:{},photoURL:""});
        return onSnapshot(doc(db,"users",u.uid),s=>{if(s.exists())setUserProfile(s.data());});
      }else setUserProfile(null);
    });
  },[]);
  if(user===undefined)return React.createElement("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f0fdf4"}},React.createElement(Spinner,null));
  if(!user)return React.createElement(AuthScreen,null);
  if(!userProfile)return React.createElement(Spinner,null);
  return React.createElement(HomeScreen,{userId:user.uid,userProfile});
}

const root=ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App,null));
