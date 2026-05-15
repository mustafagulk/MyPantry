// MyPantry v4 — Fixed sharing + low stock alerts + profile tab
const { useState, useEffect, useMemo } = React;
const { auth, db } = window.firebaseRefs;
const { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } = window.firebaseAuth;
const { collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove, query, where, serverTimestamp, orderBy } = window.firebaseFirestore;

const UNITS = ["units","pcs","kg","g","L","mL","bottles","cans","bags","boxes"];
const PRICE_MODES = ["per unit","per kg","per box","per bottle","per can","total"];
const CATEGORIES = ["🥩 Meat & Fish","🥦 Vegetables","🍎 Fruits","🥛 Dairy","🌾 Grains","🥫 Canned","🧊 Frozen","🧴 Other"];

const AM = {
  added:    {icon:"✨",color:"#16a34a",bg:"#f0fdf4",label:"Added"},
  removed:  {icon:"🗑️",color:"#dc2626",bg:"#fff5f5",label:"Removed"},
  increased:{icon:"📈",color:"#2563eb",bg:"#eff6ff",label:"Increased"},
  decreased:{icon:"📉",color:"#d97706",bg:"#fffbeb",label:"Decreased"},
  edited:   {icon:"✏️",color:"#7c3aed",bg:"#faf5ff",label:"Edited"},
  expiry:   {icon:"📅",color:"#0891b2",bg:"#f0f9ff",label:"Expiry set"},
};

function daysUntil(e){if(!e)return null;const t=new Date();t.setHours(0,0,0,0);return Math.ceil((new Date(e+"T00:00:00")-t)/86400000);}
function fmtDate(d){if(!d)return"";return new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});}
function fmtTime(iso){if(!iso)return"";const d=new Date(iso),now=new Date(),dm=Math.floor((now-d)/60000);if(dm<1)return"Just now";if(dm<60)return`${dm}m ago`;const dh=Math.floor(dm/60);if(dh<24)return`${dh}h ago`;const dd=Math.floor(dh/24);if(dd<7)return`${dd}d ago`;return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});}
function calcPrice(pv,pm,a){if(!pv||!a)return null;const p=parseFloat(pv),amt=parseFloat(a);if(isNaN(p)||isNaN(amt)||amt===0)return null;if(pm==="total")return{total:p.toFixed(2),perUnit:(p/amt).toFixed(2)};return{total:(p*amt).toFixed(2),perUnit:p.toFixed(2)};}
function isLowStock(item){const a=parseFloat(item.amount);return!isNaN(a)&&a<=1;}

function Spinner(){return React.createElement("div",{style:{display:"flex",justifyContent:"center",padding:40}},React.createElement("div",{style:{width:36,height:36,border:"3px solid #dcfce7",borderTopColor:"#16a34a",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}),React.createElement("style",null,"@keyframes spin{to{transform:rotate(360deg)}}"));}

function Badge({days}){
  if(days===null)return null;
  const c=days<0?{bg:"#dc2626",col:"#fff",t:"Expired"}:days===0?{bg:"#fee2e2",col:"#dc2626",t:"Today!"}:days<=2?{bg:"#ffe4e6",col:"#dc2626",t:`${days}d`}:days<=7?{bg:"#fef9c3",col:"#a16207",t:`${days}d`}:{bg:"#dcfce7",col:"#16a34a",t:`${days}d`};
  return React.createElement("span",{style:{background:c.bg,color:c.col,borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:800}},c.t);
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
  const userName=ev.user||"Unknown";
  const ts=ev.ts?.toDate?fmtTime(ev.ts.toDate().toISOString()):fmtTime(ev.ts);
  return React.createElement("div",{style:{display:"flex",gap:12,padding:"11px 0",borderBottom:"1px solid #f7fdf9",alignItems:"flex-start"}},
    React.createElement("div",{style:{width:34,height:34,borderRadius:"50%",background:m.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0,border:`1.5px solid ${m.color}33`}},m.icon),
    React.createElement("div",{style:{flex:1,minWidth:0}},
      showItem&&React.createElement("div",{style:{fontSize:13,fontWeight:800,color:"#111827",marginBottom:1}},ev.itemName),
      React.createElement("div",{style:{fontSize:13,color:"#374151",fontWeight:600}},ev.detail),
      React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}},
        React.createElement("span",{style:{fontSize:11,color:m.color,fontWeight:700,background:m.bg,padding:"1px 7px",borderRadius:10}},m.label),
        React.createElement("span",{style:{fontSize:11,color:"#9ca3af"}},`by ${userName} · ${ts}`)
      )
    )
  );
}

// ── Auth Screen ───────────────────────────────────────────────
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
      if(mode==="login"){
        await signInWithEmailAndPassword(auth,email,pass);
      }else{
        const c=await createUserWithEmailAndPassword(auth,email,pass);
        await updateProfile(c.user,{displayName:name});
        await setDoc(doc(db,"users",c.user.uid),{name,email:email.toLowerCase().trim(),pinnedItems:[],listIds:[],itemFrequency:{}});
      }
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

// ── Items Tab ─────────────────────────────────────────────────
function ItemsTab({filtered,items,hist,search,setSearch,filterCat,setFilterCat,sortBy,setSortBy,totalVal,loading,setEditItem,setShowAdd,openDetail,adjust,deleteItem,inp}){
  const stepFor=u=>["kg","L","g","mL"].includes(u)?0.1:1;
  return React.createElement("div",null,
    React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:10}},
      React.createElement("input",{style:{...inp,background:"#fff"},placeholder:"🔍 Search…",value:search,onChange:e=>setSearch(e.target.value)}),
      React.createElement("div",{style:{display:"flex",gap:8}},
        React.createElement("select",{style:{...inp,flex:1,background:"#fff",fontSize:12},value:filterCat,onChange:e=>setFilterCat(e.target.value)},
          React.createElement("option",{value:"All"},"All Categories"),
          CATEGORIES.map(c=>React.createElement("option",{key:c},c))
        ),
        React.createElement("select",{style:{...inp,flex:1,background:"#fff",fontSize:12},value:sortBy,onChange:e=>setSortBy(e.target.value)},
          React.createElement("option",{value:"expiry"},"By Expiry"),
          React.createElement("option",{value:"name"},"By Name"),
          React.createElement("option",{value:"category"},"By Category")
        )
      )
    ),
    React.createElement("div",{style:{fontSize:12,color:"#9ca3af",marginBottom:10,fontWeight:600}},`${filtered.length} items${totalVal>0?` · Est. $${totalVal.toFixed(2)}`:""}`),
    loading?React.createElement(Spinner,null):React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:10}},
      filtered.length===0&&React.createElement("div",{style:{textAlign:"center",color:"#9ca3af",padding:"40px 20px",fontSize:14}},"Nothing here. Tap '+ Add'! 🛒"),
      filtered.map(item=>{
        const days=daysUntil(item.expiry),price=calcPrice(item.priceVal,item.priceMode,item.amount),urgent=days!==null&&days<=2,low=isLowStock(item);
        const lastChange=hist.find(h=>h.itemId===item.id);
        const ts=lastChange?.ts?.toDate?fmtTime(lastChange.ts.toDate().toISOString()):lastChange?fmtTime(lastChange.ts):"";
        const borderColor=urgent?"#fde68a":low?"#fca5a5":"#f0fdf4";
        const bgColor=urgent?"#fffbeb":low?"#fff5f5":"#fff";
        return React.createElement("div",{key:item.id,style:{background:bgColor,borderRadius:16,padding:"14px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:`1.5px solid ${borderColor}`}},
          React.createElement("div",{onClick:()=>openDetail(item),style:{cursor:"pointer"}},
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}},
              React.createElement("div",null,
                React.createElement("div",{style:{fontSize:15,fontWeight:800,color:"#111827",marginBottom:2}},item.name),
                React.createElement("div",{style:{fontSize:11,color:"#9ca3af"}},`${item.category}${item.note?` · ${item.note}`:""}`)
              ),
              React.createElement("div",{style:{display:"flex",alignItems:"center",gap:5}},
                low&&React.createElement("span",{style:{background:"#fee2e2",color:"#dc2626",borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:800}},"🪫 Low"),
                React.createElement(Badge,{days}),
                React.createElement("span",{style:{color:"#d1d5db",fontSize:16}},"›")
              )
            ),
            lastChange&&React.createElement("div",{style:{display:"flex",alignItems:"center",gap:5,marginBottom:8}},
              React.createElement("span",{style:{fontSize:10,color:"#9ca3af"}},"Last:"),
              React.createElement("span",{style:{fontSize:10,background:(AM[lastChange.action]||AM.edited).bg,color:(AM[lastChange.action]||AM.edited).color,borderRadius:10,padding:"1px 7px",fontWeight:700}},`${(AM[lastChange.action]||AM.edited).icon} ${lastChange.detail}`),
              React.createElement("span",{style:{fontSize:10,color:"#9ca3af"}},ts)
            )
          ),
          React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}},
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8}},
              React.createElement("button",{onClick:()=>adjust(item,-stepFor(item.unit)),style:{width:30,height:30,borderRadius:"50%",background:"#f0fdf4",border:"1.5px solid #86efac",fontSize:18,cursor:"pointer",color:"#16a34a",fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}},"−"),
              React.createElement("span",{style:{fontSize:15,fontWeight:800,minWidth:70,textAlign:"center"}},`${item.amount}`,React.createElement("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:400}},` ${item.unit}`)),
              React.createElement("button",{onClick:()=>adjust(item,stepFor(item.unit)),style:{width:30,height:30,borderRadius:"50%",background:"#f0fdf4",border:"1.5px solid #86efac",fontSize:18,cursor:"pointer",color:"#16a34a",fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}},"+")
            ),
            React.createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}},
              price&&React.createElement("span",{style:{fontSize:13,fontWeight:800,color:"#16a34a"}},`$${price.total}`),
              item.expiry&&React.createElement("span",{style:{fontSize:11,color:"#9ca3af"}},fmtDate(item.expiry))
            )
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"flex-end",gap:6,marginTop:10,paddingTop:10,borderTop:"1px solid #f0fdf4"}},
            React.createElement("button",{onClick:()=>{setEditItem(item);setShowAdd(true);},style:{background:"#f3f4f6",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"}},"✏️ Edit"),
            React.createElement("button",{onClick:()=>deleteItem(item),style:{background:"#fff1f2",border:"none",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:600,color:"#dc2626",fontFamily:"inherit"}},"🗑️ Remove")
          )
        );
      })
    )
  );
}

// ── Alerts Tab ────────────────────────────────────────────────
function AlertsTab({items,openDetail}){
  const expired=items.filter(i=>daysUntil(i.expiry)<0);
  const soon=items.filter(i=>{const d=daysUntil(i.expiry);return d!==null&&d>=0&&d<=7;});
  const low=items.filter(i=>isLowStock(i));
  const allClear=expired.length===0&&soon.length===0&&low.length===0;

  function AlertCard({item,bg,border,badge,sub}){
    return React.createElement("div",{onClick:()=>openDetail(item),style:{background:bg,borderRadius:16,padding:"14px",border:`1.5px solid ${border}`,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}},
      React.createElement("div",null,
        React.createElement("div",{style:{fontWeight:800,color:"#111827"}},item.name),
        React.createElement("div",{style:{fontSize:12,color:"#9ca3af",marginTop:2}},sub)
      ),
      badge
    );
  }

  return React.createElement("div",null,
    allClear&&React.createElement("div",{style:{textAlign:"center",color:"#9ca3af",padding:"48px 20px",fontWeight:600}},
      React.createElement("div",{style:{fontSize:40,marginBottom:8}},"✅"),
      "All good! Nothing needs attention."
    ),

    // Expired section
    expired.length>0&&React.createElement("div",null,
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:4}},"🚨 Expired"),
      expired.map(item=>React.createElement(AlertCard,{key:item.id,item,bg:"#fff5f5",border:"#fecaca",
        badge:React.createElement(Badge,{days:daysUntil(item.expiry)}),
        sub:`${item.amount} ${item.unit} · expired ${fmtDate(item.expiry)}`
      }))
    ),

    // Expiring soon section
    soon.length>0&&React.createElement("div",null,
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:expired.length>0?16:4}},"⏰ Expiring Soon"),
      soon.map(item=>React.createElement(AlertCard,{key:item.id,item,bg:"#fffbeb",border:"#fde68a",
        badge:React.createElement(Badge,{days:daysUntil(item.expiry)}),
        sub:`${item.amount} ${item.unit} · exp ${fmtDate(item.expiry)}`
      }))
    ),

    // Low stock section
    low.length>0&&React.createElement("div",null,
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:(expired.length>0||soon.length>0)?16:4}},"🪫 Low Stock (0 or 1)"),
      low.map(item=>React.createElement(AlertCard,{key:item.id,item,bg:"#fff5f5",border:"#fca5a5",
        badge:React.createElement("span",{style:{background:"#fee2e2",color:"#dc2626",borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:800}},`${item.amount} ${item.unit}`),
        sub:item.category
      }))
    )
  );
}

// ── History Tab ───────────────────────────────────────────────
function HistoryTab({hist,hFilter,setHFilter}){
  const filterOptions=[["all","All"],["added","Added"],["removed","Removed"],["increased","Increased"],["decreased","Decreased"],["edited","Edited"]];
  const groups={};
  hist.forEach(e=>{
    const ts=e.ts?.toDate?e.ts.toDate():new Date(e.ts);
    const day=ts.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
    if(!groups[day])groups[day]=[];
    groups[day].push(e);
  });
  return React.createElement("div",null,
    React.createElement("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}},
      filterOptions.map(([k,l])=>React.createElement("button",{key:k,onClick:()=>setHFilter(k),style:{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${hFilter===k?"#16a34a":"#d1fae5"}`,background:hFilter===k?"#16a34a":"#fff",color:hFilter===k?"#fff":"#6b7280",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}},k!=="all"&&(AM[k]?.icon+" "),l))
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
function StatsTab({items,totalVal}){
  return React.createElement("div",null,
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}},
      [{l:"Total Items",v:items.length,c:"#16a34a"},{l:"Expiring Soon",v:items.filter(i=>{const d=daysUntil(i.expiry);return d!==null&&d>=0&&d<=7;}).length,c:"#f59e0b"},{l:"Expired",v:items.filter(i=>daysUntil(i.expiry)<0).length,c:"#ef4444"},{l:"Est. Value",v:`$${totalVal.toFixed(2)}`,c:"#8b5cf6"}].map(s=>
        React.createElement("div",{key:s.l,style:{background:"#fff",borderRadius:16,padding:"16px 12px",textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}},
          React.createElement("div",{style:{fontSize:26,fontWeight:900,color:s.c}},s.v),
          React.createElement("div",{style:{fontSize:11,color:"#9ca3af",marginTop:3,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}},s.l)
        )
      )
    ),
    CATEGORIES.map(cat=>{const n=items.filter(i=>i.category===cat).length;if(!n)return null;return React.createElement("div",{key:cat,style:{display:"flex",alignItems:"center",gap:10,marginBottom:8}},
      React.createElement("span",{style:{width:140,fontSize:12,color:"#374151",fontWeight:700,flexShrink:0}},cat),
      React.createElement("div",{style:{flex:1,height:8,background:"#f0fdf4",borderRadius:99,overflow:"hidden"}},React.createElement("div",{style:{height:"100%",background:"linear-gradient(90deg,#4ade80,#15803d)",borderRadius:99,width:`${(n/items.length)*100}%`}})),
      React.createElement("span",{style:{fontSize:12,color:"#6b7280",fontWeight:800,width:18,textAlign:"right"}},n)
    );})
  );
}

// ── Item Detail Sheet ─────────────────────────────────────────
function ItemDetailSheet({item,hist,show,onClose,onEdit}){
  if(!item)return null;
  const ih=hist.filter(h=>h.itemId===item.id);
  const price=calcPrice(item.priceVal,item.priceMode,item.amount);
  const days=daysUntil(item.expiry);
  const low=isLowStock(item);
  return React.createElement(Sheet,{show,onClose,title:""},
    React.createElement("div",{style:{background:"linear-gradient(135deg,#f0fdf4,#dcfce7)",borderRadius:16,padding:"16px",marginBottom:16,border:"1px solid #bbf7d0"}},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:20,fontWeight:900,color:"#14532d"}},item.name),
          React.createElement("div",{style:{fontSize:12,color:"#6b7280",marginTop:2}},`${item.category}${item.note?` · ${item.note}`:""}`)
        ),
        React.createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}},
          low&&React.createElement("span",{style:{background:"#fee2e2",color:"#dc2626",borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:800}},"🪫 Low Stock"),
          React.createElement(Badge,{days})
        )
      ),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10}},
        [{l:"Amount",v:`${item.amount} ${item.unit}`},{l:"Expiry",v:item.expiry?fmtDate(item.expiry):"Not set"},{l:"Total",v:price?`$${price.total}`:"—"},{l:`Per ${item.unit}`,v:price?`$${price.perUnit}`:"—"}].map(r=>
          React.createElement("div",{key:r.l,style:{background:"rgba(255,255,255,0.7)",borderRadius:10,padding:"8px 10px"}},
            React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:0.5}},r.l),
            React.createElement("div",{style:{fontSize:14,fontWeight:800,color:"#111827",marginTop:2}},r.v)
          )
        )
      ),
      React.createElement("button",{onClick:onEdit,style:{marginTop:12,width:"100%",padding:"9px",borderRadius:12,border:"none",background:"#16a34a",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}},"✏️ Edit Item")
    ),
    React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:4}},`📋 Item History (${ih.length})`),
    ih.length===0
      ?React.createElement("div",{style:{color:"#9ca3af",fontSize:13,padding:"20px 0",textAlign:"center"}},"No changes recorded yet.")
      :ih.map(e=>React.createElement(HRow,{key:e.id,ev:e,showItem:false}))
  );
}

// ── Item Form ─────────────────────────────────────────────────
function ItemFormFull({item,onSave,onClose,quickItems,pinnedItems,onTogglePin}){
  const [f,setF]=useState(item?{name:item.name||"",amount:String(item.amount)||"",unit:item.unit||"units",category:item.category||"🧴 Other",expiry:item.expiry||"",priceVal:String(item.priceVal||""),priceMode:item.priceMode||"per unit",note:item.note||""}:{name:"",amount:"",unit:"units",category:"🧴 Other",expiry:"",priceVal:"",priceMode:"per unit",note:""});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const derived=useMemo(()=>calcPrice(f.priceVal,f.priceMode,f.amount),[f.priceVal,f.priceMode,f.amount]);
  const inp={width:"100%",padding:"10px 12px",borderRadius:12,border:"1.5px solid #d1fae5",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f9fafb",boxSizing:"border-box"};

  return React.createElement("div",null,
    quickItems.length>0&&React.createElement("div",{style:{marginBottom:14}},
      React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},"⚡ Quick Add"),
      React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:6}},
        quickItems.map(q=>React.createElement("button",{key:q.name,onClick:()=>set("name",q.name),style:{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${q.pinned?"#16a34a":"#d1fae5"}`,background:q.pinned?"#f0fdf4":"#fff",color:q.pinned?"#15803d":"#374151",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}},q.pinned&&"📌 ",q.name))
      )
    ),
    React.createElement("div",{style:{marginBottom:12}},
      React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Item Name *"),
      React.createElement("div",{style:{position:"relative"}},
        React.createElement("input",{style:{...inp,paddingRight:40},placeholder:"e.g. Whole Milk…",value:f.name,onChange:e=>set("name",e.target.value)}),
        f.name.trim()&&React.createElement("button",{onClick:()=>onTogglePin(f.name.trim()),style:{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:(pinnedItems||[]).includes(f.name.trim())?1:0.3}},"📌")
      )
    ),
    React.createElement("div",{style:{display:"flex",gap:10,marginBottom:12}},
      React.createElement("div",{style:{flex:1}},React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Amount *"),React.createElement("input",{style:inp,type:"number",min:"0",step:"0.01",placeholder:"0",value:f.amount,onChange:e=>set("amount",e.target.value)})),
      React.createElement("div",{style:{flex:1}},React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Unit"),React.createElement("select",{style:inp,value:f.unit,onChange:e=>set("unit",e.target.value)},UNITS.map(u=>React.createElement("option",{key:u},u))))
    ),
    React.createElement("div",{style:{background:"#f0fdf4",borderRadius:14,padding:"12px",marginBottom:12,border:"1px solid #dcfce7"}},
      React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}},"💰 Price (optional)"),
      React.createElement("div",{style:{display:"flex",gap:10}},
        React.createElement("input",{style:{...inp,flex:1,background:"#fff"},type:"number",min:"0",step:"0.01",placeholder:"0.00",value:f.priceVal,onChange:e=>set("priceVal",e.target.value)}),
        React.createElement("select",{style:{...inp,flex:1,background:"#fff"},value:f.priceMode,onChange:e=>set("priceMode",e.target.value)},PRICE_MODES.map(m=>React.createElement("option",{key:m},m)))
      ),
      derived&&React.createElement("div",{style:{display:"flex",gap:14,marginTop:8,fontSize:13,fontWeight:700}},
        React.createElement("span",{style:{color:"#16a34a"}},`Total: $${derived.total}`),
        parseFloat(f.amount)>1&&React.createElement("span",{style:{color:"#6b7280"}},`Per ${f.unit}: $${derived.perUnit}`)
      )
    ),
    React.createElement("div",{style:{marginBottom:12}},React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Category"),React.createElement("select",{style:inp,value:f.category,onChange:e=>set("category",e.target.value)},CATEGORIES.map(c=>React.createElement("option",{key:c},c)))),
    React.createElement("div",{style:{marginBottom:16}},React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"Expiry Date"),React.createElement("input",{style:inp,type:"date",value:f.expiry,onChange:e=>set("expiry",e.target.value)})),
    React.createElement("div",{style:{display:"flex",gap:10}},
      React.createElement("button",{onClick:onClose,style:{flex:1,padding:"11px",borderRadius:12,border:"1.5px solid #d1fae5",background:"#fff",color:"#6b7280",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}},"Cancel"),
      React.createElement("button",{onClick:()=>{if(f.name.trim()&&f.amount)onSave(f);},style:{flex:2,padding:"11px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}},item?"Save Changes":"Add to Pantry")
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
    React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},"Current Members"),
    (list.memberEmails||[list.adminEmail]).map((email,i)=>React.createElement("div",{key:email,style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f0fdf4"}},
      React.createElement("div",null,
        React.createElement("div",{style:{fontSize:14,fontWeight:700,color:"#111827"}},email),
        list.adminEmail===email&&React.createElement("div",{style:{fontSize:11,color:"#16a34a",fontWeight:700}},"Admin")
      ),
      isAdmin&&list.adminEmail!==email&&React.createElement("button",{onClick:()=>onRemove(list.memberIds[i],email),style:{background:"#fff1f2",border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:12,color:"#dc2626",fontFamily:"inherit"}},"Remove")
    ))
  );
}

// ── List View ─────────────────────────────────────────────────
function ListView({list,userId,userProfile,onBack,isHome,onSetHome}){
  const [items,setItems]=useState([]);
  const [hist,setHist]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [filterCat,setFilterCat]=useState("All");
  const [sortBy,setSortBy]=useState("expiry");
  const [tab,setTab]=useState("items");
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
  const isAdmin=list.adminId===userId;

  useEffect(()=>{
    const q=query(collection(db,"lists",list.id,"items"),orderBy("addedAt","desc"));
    const unsub=onSnapshot(q,snap=>{setItems(snap.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);});
    return unsub;
  },[list.id]);

  useEffect(()=>{
    const q=query(collection(db,"lists",list.id,"history"),orderBy("ts","desc"));
    const unsub=onSnapshot(q,snap=>{setHist(snap.docs.map(d=>({id:d.id,...d.data()})));});
    return unsub;
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
    const uref=doc(db,"users",userId);
    const isPinned=pinnedItems.includes(name);
    const updated=isPinned?pinnedItems.filter(n=>n!==name):[...pinnedItems,name];
    setPinnedItems(updated);
    await updateDoc(uref,{pinnedItems:updated});
  }

  async function adjust(item,delta){
    const nv=Math.max(0,parseFloat((item.amount+delta).toFixed(3)));
    await updateDoc(doc(db,"lists",list.id,"items",item.id),{amount:nv});
    await addHist(item.id,item.name,delta>0?"increased":"decreased",`${item.amount} ${item.unit} → ${nv} ${item.unit}`);
  }

  async function saveItem(f){
    const data={...f,amount:parseFloat(f.amount),priceVal:f.priceVal?parseFloat(f.priceVal):null,updatedAt:serverTimestamp()};
    if(editItem){
      await updateDoc(doc(db,"lists",list.id,"items",editItem.id),data);
      await addHist(editItem.id,f.name,"edited","Item details updated");
    }else{
      const ref=await addDoc(collection(db,"lists",list.id,"items"),{...data,addedAt:serverTimestamp()});
      await addHist(ref.id,f.name,"added",`${f.amount} ${f.unit} added`);
      const uref=doc(db,"users",userId);
      const snap=await getDoc(uref);
      const freq=snap.data()?.itemFrequency||{};
      freq[f.name.trim()]=(freq[f.name.trim()]||0)+1;
      await updateDoc(uref,{itemFrequency:freq});
    }
    setShowAdd(false);setEditItem(null);
  }

  async function deleteItem(item){
    await addHist(item.id,item.name,"removed",`${item.amount} ${item.unit} removed`);
    await deleteDoc(doc(db,"lists",list.id,"items",item.id));
  }

  // ── FIXED: invite by scanning all users client-side (no index needed) ──
  async function inviteMember(){
    setInviteMsg({});
    const emailToFind=inviteEmail.trim().toLowerCase();
    if(!emailToFind){setInviteMsg({err:"Please enter an email address."});return;}
    try{
      // Fetch all user docs and match email client-side — avoids any index requirement
      const allUsers=await getDocs(collection(db,"users"));
      const match=allUsers.docs.find(d=>(d.data().email||"").toLowerCase()===emailToFind);
      if(!match){setInviteMsg({err:"No MyPantry account found with that email. They need to sign up first."});return;}
      if(list.memberIds.includes(match.id)){setInviteMsg({err:"This person is already a member."});return;}
      await updateDoc(doc(db,"lists",list.id),{memberIds:arrayUnion(match.id),memberEmails:arrayUnion(emailToFind)});
      await updateDoc(doc(db,"users",match.id),{listIds:arrayUnion(list.id)});
      setInviteMsg({ok:`✅ ${emailToFind} has been added!`});
      setInviteEmail("");
    }catch(e){setInviteMsg({err:"Something went wrong. Check your connection and try again."});}
  }

  const filtered=useMemo(()=>items.filter(i=>i.name?.toLowerCase().includes(search.toLowerCase())&&(filterCat==="All"||i.category===filterCat)).sort((a,b)=>sortBy==="expiry"?(daysUntil(a.expiry)??9999)-(daysUntil(b.expiry)??9999):sortBy==="name"?a.name?.localeCompare(b.name):a.category?.localeCompare(b.category)),[items,search,filterCat,sortBy]);
  const expiring=items.filter(i=>{const d=daysUntil(i.expiry);return d!==null&&d<=3;});
  const lowStock=items.filter(i=>isLowStock(i));
  const alertCount=items.filter(i=>daysUntil(i.expiry)<0).length+items.filter(i=>{const d=daysUntil(i.expiry);return d!==null&&d>=0&&d<=7;}).length+lowStock.length;
  const totalVal=items.reduce((acc,i)=>{const p=calcPrice(i.priceVal,i.priceMode,i.amount);return acc+(p?parseFloat(p.total):0);},0);
  const filtHist=useMemo(()=>hFilter==="all"?hist:hist.filter(h=>h.action===hFilter),[hist,hFilter]);
  const quickItems=useMemo(()=>{const p=(pinnedItems||[]).map(n=>({name:n,pinned:true}));const fr=(frequentItems||[]).filter(n=>!(pinnedItems||[]).includes(n)).slice(0,8).map(n=>({name:n,pinned:false}));return[...p,...fr].slice(0,12);},[pinnedItems,frequentItems]);
  const inp={width:"100%",padding:"10px 12px",borderRadius:12,border:"1.5px solid #d1fae5",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f9fafb",boxSizing:"border-box"};

  return React.createElement("div",{style:{fontFamily:"'Nunito',sans-serif",background:"#f0fdf4",minHeight:"100vh",maxWidth:480,margin:"0 auto"}},
    React.createElement("header",{style:{background:"linear-gradient(135deg,#16a34a,#15803d)",padding:"13px 14px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 12px rgba(22,163,74,0.3)",display:"flex",alignItems:"center",justifyContent:"space-between"}},
      React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10}},
        React.createElement("button",{onClick:onBack,style:{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:10,color:"#fff",fontWeight:900,fontSize:17,cursor:"pointer",padding:"4px 12px",fontFamily:"inherit"}},"←"),
        React.createElement("div",null,
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:7}},
            React.createElement("span",{style:{fontSize:18,fontWeight:900,color:"#fff"}},`${list.emoji} ${list.name}`),
            isHome&&React.createElement("span",{style:{background:"rgba(255,255,255,0.25)",color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:800}},"🏠 HOME")
          ),
          React.createElement("div",{style:{fontSize:11,color:"rgba(255,255,255,0.65)"}},`${list.memberEmails?.length||1} members · ${items.length} items`)
        )
      ),
      React.createElement("div",{style:{display:"flex",gap:6}},
        React.createElement("button",{onClick:()=>onSetHome(list.id),style:{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:10,color:"#fff",fontSize:15,cursor:"pointer",padding:"6px 10px"}},isHome?"🏠":"🏡"),
        isAdmin&&React.createElement("button",{onClick:()=>setShowMembers(true),style:{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:10,color:"#fff",fontSize:15,cursor:"pointer",padding:"6px 10px"}},"👥"),
        React.createElement("button",{onClick:()=>{setEditItem(null);setShowAdd(true);},style:{background:"#fff",color:"#16a34a",border:"none",borderRadius:20,padding:"7px 14px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}},"+ Add")
      )
    ),
    (expiring.length>0||lowStock.length>0)&&React.createElement("div",{style:{background:"#fef3c7",borderBottom:"2px solid #f59e0b",padding:"8px 14px",display:"flex",gap:8,alignItems:"center"}},
      React.createElement("span",null,"⚠️"),
      React.createElement("span",{style:{fontSize:12,color:"#92400e",fontWeight:700}},
        [expiring.length>0&&`${expiring.length} expiring soon`,lowStock.length>0&&`${lowStock.length} low stock`].filter(Boolean).join(" · ")
      )
    ),
    React.createElement("nav",{style:{display:"flex",background:"#fff",borderBottom:"1px solid #dcfce7"}},
      [["items","📦 Items"],["alerts","⚠️"+(alertCount>0?` (${alertCount})` :"")],["history","🕐 History"],["stats","📊 Stats"]].map(([k,l])=>
        React.createElement("button",{key:k,onClick:()=>setTab(k),style:{flex:1,padding:"10px 2px",background:"none",border:"none",borderBottom:`3px solid ${tab===k?"#16a34a":"transparent"}`,cursor:"pointer",fontSize:11,fontWeight:700,color:tab===k?"#16a34a":"#9ca3af",fontFamily:"inherit",whiteSpace:"nowrap"}},l)
      )
    ),
    React.createElement("main",{style:{padding:"14px 14px 80px"}},
      tab==="items"&&React.createElement(ItemsTab,{filtered,items,hist,search,setSearch,filterCat,setFilterCat,sortBy,setSortBy,totalVal,loading,setEditItem,setShowAdd,openDetail:(item)=>{setDetailItem(item);setShowDetail(true);},adjust,deleteItem,inp}),
      tab==="alerts"&&React.createElement(AlertsTab,{items,openDetail:(item)=>{setDetailItem(item);setShowDetail(true);}}),
      tab==="history"&&React.createElement(HistoryTab,{hist:filtHist,hFilter,setHFilter}),
      tab==="stats"&&React.createElement(StatsTab,{items,totalVal})
    ),
    React.createElement(Sheet,{show:showAdd,onClose:()=>{setShowAdd(false);setEditItem(null);},title:editItem?"Edit Item":"Add Item"},
      React.createElement(ItemFormFull,{item:editItem,onSave:saveItem,onClose:()=>{setShowAdd(false);setEditItem(null);},quickItems,pinnedItems,onTogglePin:togglePin})
    ),
    React.createElement(Sheet,{show:showMembers,onClose:()=>setShowMembers(false),title:"👥 Members"},
      React.createElement(MembersPanel,{list,isAdmin,inviteEmail,setInviteEmail,inviteMsg,onInvite:inviteMember,onRemove:async(uid,email)=>{await updateDoc(doc(db,"lists",list.id),{memberIds:arrayRemove(uid),memberEmails:arrayRemove(email)});await updateDoc(doc(db,"users",uid),{listIds:arrayRemove(list.id)});}})
    ),
    React.createElement(ItemDetailSheet,{item:detailItem,hist,show:showDetail,onClose:()=>setShowDetail(false),onEdit:()=>{setEditItem(detailItem);setShowDetail(false);setShowAdd(true);}})
  );
}

// ── Profile Tab ───────────────────────────────────────────────
function ProfileTab({userId,userProfile}){
  const [newName,setNewName]=useState(auth.currentUser?.displayName||"");
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");

  async function saveName(){
    if(!newName.trim())return;
    setSaving(true);
    await updateProfile(auth.currentUser,{displayName:newName.trim()});
    await updateDoc(doc(db,"users",userId),{name:newName.trim()});
    setMsg("Name updated!");setSaving(false);
    setTimeout(()=>setMsg(""),2500);
  }

  const inp={width:"100%",padding:"11px 14px",borderRadius:12,border:"1.5px solid #d1fae5",fontSize:14,fontFamily:"inherit",outline:"none",background:"#f9fafb",boxSizing:"border-box"};

  return React.createElement("div",{style:{padding:"16px 14px 80px",fontFamily:"'Nunito',sans-serif"}},
    // Avatar
    React.createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 0 24px"}},
      React.createElement("div",{style:{width:80,height:80,borderRadius:"50%",background:"linear-gradient(135deg,#16a34a,#15803d)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,marginBottom:12,boxShadow:"0 4px 16px rgba(22,163,74,0.3)"}},
        (auth.currentUser?.displayName||"?")[0].toUpperCase()
      ),
      React.createElement("div",{style:{fontSize:20,fontWeight:900,color:"#14532d"}},(auth.currentUser?.displayName||"User")),
      React.createElement("div",{style:{fontSize:13,color:"#9ca3af",marginTop:4}},(auth.currentUser?.email||""))
    ),

    // Account info card
    React.createElement("div",{style:{background:"#fff",borderRadius:16,padding:"16px",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:"1.5px solid #f0fdf4"}},
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:14}},"Account Details"),
      React.createElement("div",{style:{marginBottom:12}},
        React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"#6b7280",marginBottom:4}},"EMAIL ADDRESS"),
        React.createElement("div",{style:{fontSize:14,fontWeight:700,color:"#111827",padding:"10px 12px",background:"#f9fafb",borderRadius:10,border:"1.5px solid #f0fdf4"}},(auth.currentUser?.email||"—"))
      ),
      React.createElement("div",null,
        React.createElement("div",{style:{fontSize:11,fontWeight:700,color:"#6b7280",marginBottom:4}},"DISPLAY NAME"),
        React.createElement("div",{style:{display:"flex",gap:8}},
          React.createElement("input",{style:{...inp,flex:1},value:newName,onChange:e=>setNewName(e.target.value),placeholder:"Your name"}),
          React.createElement("button",{onClick:saveName,disabled:saving,style:{padding:"11px 16px",borderRadius:12,border:"none",background:"#16a34a",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}},saving?"…":"Save")
        ),
        msg&&React.createElement("div",{style:{color:"#16a34a",fontSize:12,marginTop:6,fontWeight:700}},msg)
      )
    ),

    // Stats card
    React.createElement("div",{style:{background:"#fff",borderRadius:16,padding:"16px",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:"1.5px solid #f0fdf4"}},
      React.createElement("div",{style:{fontSize:11,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:14}},"My Account"),
      [{l:"User ID",v:(userId||"").slice(0,16)+"…"},{l:"Lists",v:userProfile?.listIds?.length||0},{l:"Pinned Items",v:userProfile?.pinnedItems?.length||0}].map(r=>
        React.createElement("div",{key:r.l,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f0fdf4"}},
          React.createElement("span",{style:{fontSize:13,color:"#6b7280",fontWeight:600}},r.l),
          React.createElement("span",{style:{fontSize:13,fontWeight:800,color:"#111827"}},r.v)
        )
      )
    ),

    // Sign out
    React.createElement("button",{onClick:()=>signOut(auth),style:{width:"100%",padding:"13px",borderRadius:14,border:"1.5px solid #fecaca",background:"#fff5f5",color:"#dc2626",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}},"🚪 Sign Out")
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
  const [creating,setCreating]=useState(false);
  const [mainTab,setMainTab]=useState("lists"); // "lists" | "profile"
  const emojis=["🏠","🛒","🍽️","❄️","🌿","🎒","⭐","🧺"];

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
    const ref=await addDoc(collection(db,"lists"),{name:newName.trim(),emoji:newEmoji,adminId:userId,adminEmail:auth.currentUser.email,memberIds:[userId],memberEmails:[auth.currentUser.email],createdAt:serverTimestamp()});
    await updateDoc(doc(db,"users",userId),{listIds:arrayUnion(ref.id)});
    setNewName("");setCreating(false);setShowCreate(false);
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
      React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10}},
        React.createElement("span",{style:{fontSize:28}},"🥬"),
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:20,fontWeight:900,color:"#fff",letterSpacing:-0.5}},"MyPantry"),
          React.createElement("div",{style:{fontSize:11,color:"rgba(255,255,255,0.65)"}},`Hi, ${auth.currentUser?.displayName||"there"} 👋`)
        )
      ),
      mainTab==="lists"&&React.createElement("button",{onClick:()=>setShowCreate(true),style:{background:"#fff",color:"#16a34a",border:"none",borderRadius:20,padding:"7px 16px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}},"+ New List")
    ),

    // Bottom nav tabs
    React.createElement("nav",{style:{display:"flex",background:"#fff",borderBottom:"1px solid #dcfce7"}},
      [["lists","🏠 Lists"],["profile","👤 Profile"]].map(([k,l])=>
        React.createElement("button",{key:k,onClick:()=>setMainTab(k),style:{flex:1,padding:"11px 4px",background:"none",border:"none",borderBottom:`3px solid ${mainTab===k?"#16a34a":"transparent"}`,cursor:"pointer",fontSize:13,fontWeight:700,color:mainTab===k?"#16a34a":"#9ca3af",fontFamily:"inherit"}},l)
      )
    ),

    // Lists tab
    mainTab==="lists"&&React.createElement("main",{style:{padding:"16px 14px 80px"}},
      loading?React.createElement(Spinner,null):React.createElement("div",null,
        homeList&&React.createElement("div",{style:{marginBottom:22}},
          React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},"🏠 Home List"),
          React.createElement("div",{onClick:()=>setActiveList(homeList.id),style:{background:"linear-gradient(135deg,#16a34a,#15803d)",borderRadius:18,padding:"18px",cursor:"pointer",boxShadow:"0 4px 16px rgba(22,163,74,0.3)"}},
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:14}},
              React.createElement("span",{style:{fontSize:40}},homeList.emoji),
              React.createElement("div",null,
                React.createElement("div",{style:{fontSize:22,fontWeight:900,color:"#fff"}},homeList.name),
                React.createElement("div",{style:{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:2}},`${homeList.memberEmails?.length||1} members`)
              )
            )
          )
        ),
        React.createElement("div",{style:{fontSize:10,fontWeight:800,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:8}},`All Lists (${lists.length})`),
        lists.length===0&&React.createElement("div",{style:{textAlign:"center",color:"#9ca3af",padding:"40px 20px"}},
          React.createElement("div",{style:{fontSize:48,marginBottom:12}},"📋"),
          React.createElement("div",{style:{fontWeight:700,color:"#374151"}},"No lists yet"),
          React.createElement("div",{style:{fontSize:13}},"Tap '+ New List' to get started!")
        ),
        React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:10}},
          lists.map(list=>React.createElement("div",{key:list.id,onClick:()=>setActiveList(list.id),style:{background:"#fff",borderRadius:16,padding:"14px 16px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",border:"1.5px solid #f0fdf4",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}},
            React.createElement("div",{style:{display:"flex",alignItems:"center",gap:12}},
              React.createElement("span",{style:{fontSize:28}},list.emoji),
              React.createElement("div",null,
                React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6}},
                  React.createElement("span",{style:{fontSize:15,fontWeight:800,color:"#111827"}},list.name),
                  list.id===homeListId&&React.createElement("span",{style:{background:"#dcfce7",color:"#15803d",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:800}},"HOME")
                ),
                React.createElement("div",{style:{fontSize:12,color:"#9ca3af",marginTop:2}},`${list.memberEmails?.length||1} member${(list.memberEmails?.length||1)!==1?"s":""}`)
              )
            ),
            React.createElement("div",{style:{display:"flex",gap:6},onClick:e=>e.stopPropagation()},
              React.createElement("button",{onClick:()=>setHomeList(list.id),style:{background:"#f3f4f6",border:"none",borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:14}},list.id===homeListId?"🏠":"🏡"),
              list.adminId===userId&&React.createElement("button",{onClick:()=>deleteList(list),style:{background:"#fff1f2",border:"none",borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:14}},"🗑️")
            )
          ))
        )
      )
    ),

    // Profile tab
    mainTab==="profile"&&React.createElement(ProfileTab,{userId,userProfile}),

    React.createElement(Sheet,{show:showCreate,onClose:()=>setShowCreate(false),title:"New List"},
      React.createElement("div",null,
        React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:4}},"List Name"),
        React.createElement("input",{style:inp,placeholder:"e.g. Family Pantry, Fridge…",value:newName,onChange:e=>setNewName(e.target.value)}),
        React.createElement("label",{style:{fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.8,display:"block",marginBottom:8}},"Icon"),
        React.createElement("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}},
          emojis.map(e=>React.createElement("button",{key:e,onClick:()=>setNewEmoji(e),style:{fontSize:20,width:42,height:42,borderRadius:10,border:`2px solid ${newEmoji===e?"#16a34a":"#e5e7eb"}`,background:newEmoji===e?"#f0fdf4":"#fff",cursor:"pointer"}},e))
        ),
        React.createElement("div",{style:{display:"flex",gap:10}},
          React.createElement("button",{onClick:()=>setShowCreate(false),style:{flex:1,padding:"11px",borderRadius:12,border:"1.5px solid #d1fae5",background:"#fff",color:"#6b7280",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}},"Cancel"),
          React.createElement("button",{onClick:createList,disabled:creating,style:{flex:2,padding:"11px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}},creating?"Creating…":"Create List")
        )
      )
    )
  );
}

// ── Root ──────────────────────────────────────────────────────
function App(){
  const [user,setUser]=useState(undefined);
  const [userProfile,setUserProfile]=useState(null);

  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,async u=>{
      setUser(u);
      if(u){
        const snap=await getDoc(doc(db,"users",u.uid));
        setUserProfile(snap.exists()?snap.data():{listIds:[],pinnedItems:[],homeListId:null,itemFrequency:{}});
        const profUnsub=onSnapshot(doc(db,"users",u.uid),s=>{if(s.exists())setUserProfile(s.data());});
        return profUnsub;
      }else setUserProfile(null);
    });
    return unsub;
  },[]);

  if(user===undefined)return React.createElement("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f0fdf4"}},React.createElement(Spinner,null));
  if(!user)return React.createElement(AuthScreen,null);
  if(!userProfile)return React.createElement(Spinner,null);
  return React.createElement(HomeScreen,{userId:user.uid,userProfile});
}

const root=ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App,null));
