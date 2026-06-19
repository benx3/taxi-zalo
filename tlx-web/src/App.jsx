import React, { useState, useMemo, useEffect } from "react";
import {
  Car, Package, Users, Plane, Search, Zap, Clock, Wallet, CheckCircle2,
  Shield, CreditCard, Ban, RefreshCw, X, Megaphone, User, TrendingUp,
  Radio, ArrowRight, Hourglass, Sparkles, Filter, MessageCircle, Lock,
  Phone, QrCode, LogOut, UserPlus, AlertTriangle, ChevronRight, Smartphone,
  Settings, ListChecks, Wifi, WifiOff, MapPin
} from "lucide-react";
import { useWorker } from "./useWorker.js";
import { api, getToken, setToken } from "./api.js";

const TYPE_META = { "Bao xe":{icon:Car,color:"#22c55e"},"Ghép 1":{icon:Users,color:"#3b82f6"},"Ghép 2":{icon:Users,color:"#6366f1"},"Hàng":{icon:Package,color:"#f59e0b"},"Sân bay":{icon:Plane,color:"#06b6d4"} };
const TYPE_FILTERS = ["Tất cả","Ghép 1","Ghép 2","Bao xe","Hàng","Sân bay"];
const TIME_FILTERS = [{key:"all",label:"Mọi giờ"},{key:"soon",label:"Sắp tới (≤8h)"},{key:"today",label:"Hôm nay"},{key:"tomorrow",label:"Ngày mai"}];
const CAR_FILTERS = ["Tất cả xe","Sedan/4c","Xe 7c+"];

export default function App() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAdmin = me?.role === "admin";

  // tự đăng nhập lại nếu còn token
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.me().then(setMe).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const logout = async () => { await api.logout(); setMe(null); };

  if (loading) return <div style={{minHeight:"100vh",background:"#070b16",display:"grid",placeItems:"center",color:"#8794ad"}}><StyleVars/>Đang tải…</div>;

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--ink)", fontFamily:"var(--body)" }}>
      <StyleVars />
      <TopBar me={me} isAdmin={isAdmin} onLogout={logout} />
      {isAdmin ? <AdminApp/> : <DriverFlow me={me} setMe={setMe}/>}
    </div>
  );
}

function TopBar({ me, isAdmin, onLogout }) {
  return (
    <div style={{position:"sticky",top:0,zIndex:50,display:"flex",gap:8,padding:"10px 16px",background:"rgba(7,11,22,.9)",backdropFilter:"blur(12px)",borderBottom:"1px solid var(--line)",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginRight:"auto"}}>
        <div style={{width:30,height:30,borderRadius:9,background:"linear-gradient(135deg,#34d399,#06b6d4)",display:"grid",placeItems:"center",boxShadow:"0 0 18px rgba(52,211,153,.5)"}}><Car size={18} color="#04121a" strokeWidth={2.5}/></div>
        <div style={{fontFamily:"var(--display)",fontWeight:800,letterSpacing:"-.02em",fontSize:17}}>Trợ Lý Tài Xế <span style={{color:"var(--accent)"}}>AI</span></div>
        {isAdmin&&<span style={{marginLeft:8,display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,fontWeight:700,color:"#a78bfa",background:"rgba(167,139,250,.15)",padding:"3px 9px",borderRadius:99,border:"1px solid rgba(167,139,250,.3)"}}><Shield size={12}/> Admin</span>}
      </div>
      {me&&isAdmin&&<>
        <span style={{fontSize:12.5,color:"var(--ink-dim)",fontWeight:600}}>{me.name}</span>
        <button onClick={onLogout} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"6px 11px",borderRadius:9,border:"1px solid var(--line)",background:"transparent",color:"var(--ink-dim)",fontSize:12.5,fontWeight:700,cursor:"pointer"}}><LogOut size={14}/> Thoát</button>
      </>}
    </div>
  );
}

/* ============ LUỒNG TÀI XẾ ============ */
function DriverFlow({ me, setMe }) {
  const [screen, setScreen] = useState("login");
  const [zaloConnected, setZaloConnected] = useState(false);
  const [forceReconnect, setForceReconnect] = useState(false);

  if (!me) return screen==="login"
    ? <LoginScreen onLogin={setMe} goRegister={()=>setScreen("register")}/>
    : <RegisterScreen goLogin={()=>setScreen("login")}/>;
  if (me.status==="pending") return <GateScreen kind="pending" me={me} onLogout={()=>{api.logout();setMe(null);}}/>;
  if (me.status==="expired") return <GateScreen kind="expired" me={me} onLogout={()=>{api.logout();setMe(null);}}/>;
  if (me.status==="banned") return <GateScreen kind="banned" me={me} onLogout={()=>{api.logout();setMe(null);}}/>;
  const needZalo = forceReconnect || (!me.hasZalo && !zaloConnected);
  if (needZalo) return <ConnectZalo me={me} onConnected={()=>{setZaloConnected(true);setForceReconnect(false);}}/>;
  return <DriverApp me={me} setMe={setMe} onChangeZalo={()=>{setZaloConnected(false);setForceReconnect(true);}}/>;
}

function LoginScreen({ onLogin, goRegister }) {
  const [phone,setPhone]=useState(""); const [pass,setPass]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const submit=async()=>{ setBusy(true); setErr("");
    try { const u = await api.login({phone:phone.trim(),pass}); onLogin(u); }
    catch(e){ setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Đăng nhập" icon={Lock}>
      <Field label="Số điện thoại / Tài khoản" icon={Phone}><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="SĐT tài xế hoặc tài khoản admin" style={inputStyle} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
      <Field label="Mật khẩu" icon={Lock}><input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Nhập mật khẩu" style={inputStyle} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
      {err&&<ErrBox>{err}</ErrBox>}
      <button onClick={submit} disabled={busy} style={{...primaryBtn,opacity:busy?0.6:1}}>{busy?"ĐANG ĐĂNG NHẬP…":"ĐĂNG NHẬP"}</button>
      <div style={{textAlign:"center",marginTop:14,fontSize:13.5,color:"var(--ink-dim)"}}>Chưa có tài khoản? <button onClick={goRegister} style={linkBtn}>Đăng ký ngay</button></div>
    </AuthShell>
  );
}

function RegisterScreen({ goLogin }) {
  const [name,setName]=useState(""); const [phone,setPhone]=useState(""); const [pass,setPass]=useState(""); const [pass2,setPass2]=useState(""); const [done,setDone]=useState(false); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(!name.trim()||phone.trim().length<9||pass.length<3){setErr("Điền đủ tên, SĐT hợp lệ và mật khẩu (≥3 ký tự).");return;}
    if(pass!==pass2){setErr("Mật khẩu xác nhận không khớp. Vui lòng nhập lại.");return;}
    setBusy(true); setErr("");
    try { await api.register({phone:phone.trim(),pass,name:name.trim()}); setDone(true); }
    catch(e){ setErr(e.message); } finally { setBusy(false); }
  };
  if(done) return (
    <AuthShell title="Đăng ký thành công" icon={CheckCircle2} accent="#34d399">
      <div style={{textAlign:"center",color:"var(--ink-dim)",fontSize:14,lineHeight:1.6,marginBottom:18}}>Tài khoản <b style={{color:"var(--ink)"}}>{phone}</b> đã tạo, đang chờ Admin duyệt và cấp gói.</div>
      <button onClick={goLogin} style={primaryBtn}>Về trang đăng nhập</button>
    </AuthShell>
  );
  const mismatch = pass2.length>0 && pass!==pass2;
  return (
    <AuthShell title="Đăng ký" icon={UserPlus}>
      <Field label="Họ tên / Tên nhà xe" icon={User}><input value={name} onChange={e=>setName(e.target.value)} placeholder="VD: Nhà xe Thanh Thủy" style={inputStyle}/></Field>
      <Field label="Số điện thoại" icon={Phone}><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Dùng để đăng nhập" style={inputStyle}/></Field>
      <Field label="Mật khẩu" icon={Lock}><input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Tạo mật khẩu" style={inputStyle}/></Field>
      <Field label="Xác nhận mật khẩu" icon={Lock}>
        <input type="password" value={pass2} onChange={e=>setPass2(e.target.value)} placeholder="Nhập lại mật khẩu" style={{...inputStyle,borderColor:mismatch?"#ef4444":(pass2&&!mismatch?"#34d399":"var(--line)")}} onKeyDown={e=>e.key==="Enter"&&submit()}/>
        {mismatch&&<div style={{fontSize:12,color:"#f87171",marginTop:6,display:"flex",alignItems:"center",gap:5}}><AlertTriangle size={12}/> Mật khẩu không khớp</div>}
        {pass2&&!mismatch&&<div style={{fontSize:12,color:"#34d399",marginTop:6,display:"flex",alignItems:"center",gap:5}}><CheckCircle2 size={12}/> Khớp</div>}
      </Field>
      {err&&<ErrBox>{err}</ErrBox>}
      <button onClick={submit} disabled={busy} style={{...primaryBtn,opacity:busy?0.6:1}}>{busy?"ĐANG TẠO…":"TẠO TÀI KHOẢN"}</button>
      <div style={{textAlign:"center",marginTop:14,fontSize:13.5,color:"var(--ink-dim)"}}>Đã có tài khoản? <button onClick={goLogin} style={linkBtn}>Đăng nhập</button></div>
    </AuthShell>
  );
}

function GateScreen({ kind, me, onLogout }) {
  const map={pending:{t:"Chờ duyệt",ic:Hourglass,c:"#f59e0b"},expired:{t:"Hết hạn gói",ic:AlertTriangle,c:"#ef4444"},banned:{t:"Tài khoản bị khoá",ic:Ban,c:"#ef4444"}}[kind];
  return (
    <AuthShell title={map.t} icon={map.ic} accent={map.c}>
      <div style={{textAlign:"center",color:"var(--ink-dim)",fontSize:14,lineHeight:1.65,marginBottom:20}}>
        {kind==="pending"&&<>Tài khoản <b style={{color:"var(--ink)"}}>{me.name}</b> đang chờ Admin duyệt và cấp gói.</>}
        {kind==="expired"&&<>Gói đã hết hạn. Liên hệ Admin để gia hạn.</>}
        {kind==="banned"&&<>Tài khoản đã bị khoá. Liên hệ Admin để biết thêm.</>}
      </div>
      <button onClick={onLogout} style={ghostFull}>Đăng xuất</button>
    </AuthShell>
  );
}

function ConnectZalo({ me, onConnected }) {
  const { connected, qr, zaloReady } = useWorker();
  const [requested,setRequested]=useState(false);
  const [err,setErr]=useState("");
  useEffect(()=>{ if(zaloReady){ const t=setTimeout(onConnected,800); return ()=>clearTimeout(t);} },[zaloReady,onConnected]);
  const start=async()=>{ setErr(""); try{ await api.startZaloQR(); setRequested(true);}catch(e){setErr(e.message);} };
  return (
    <AuthShell title="Kết nối Zalo của bạn" icon={QrCode} wide>
      <div style={{textAlign:"center",color:"var(--ink-dim)",fontSize:13.5,lineHeight:1.6,marginBottom:18}}>
        Dùng <b style={{color:"var(--ink)"}}>tài khoản Zalo phụ</b> đã ở sẵn trong các nhóm tài xế.
        Mở Zalo trên điện thoại → Quét QR. Mỗi tài khoản chỉ thấy nhóm của <b style={{color:"var(--ink)"}}>chính mình</b>.
      </div>
      {!connected&&<ErrBox>Chưa kết nối tới worker. Hãy chạy worker (npm start) rồi tải lại.</ErrBox>}
      {err&&<ErrBox>{err}</ErrBox>}
      <div style={{display:"grid",placeItems:"center",marginBottom:18}}>
        <div style={{width:220,height:220,borderRadius:18,background:"#fff",display:"grid",placeItems:"center",overflow:"hidden"}}>
          {zaloReady ? <CheckCircle2 size={80} color="#16a34a"/>
            : qr ? <img src={qr.startsWith("data:")?qr:`data:image/png;base64,${qr}`} alt="QR" style={{width:200,height:200,objectFit:"contain"}}/>
            : <QrCode size={64} color="#cbd5e1"/>}
        </div>
      </div>
      {zaloReady ? <div style={{textAlign:"center",color:"#34d399",fontWeight:800}}>Đã kết nối! Đang vào…</div>
        : requested ? <div style={{textAlign:"center",color:"#f59e0b",fontWeight:700,fontSize:14}}><Hourglass size={15} style={{verticalAlign:-2,marginRight:5}}/> Đang chờ bạn quét QR…</div>
        : <button onClick={start} disabled={!connected} style={{...primaryBtn,background:"linear-gradient(135deg,#0068ff,#0052cc)",color:"#fff",opacity:connected?1:0.5}}><QrCode size={17} style={{marginRight:7,verticalAlign:-3}}/> Hiện mã QR Zalo</button>}
    </AuthShell>
  );
}

/* ============ MÀN CUỐC (dữ liệu THẬT từ worker) ============ */
const LIMIT_OPTIONS = [10, 20, 30, 50];

function DriverApp({ me, onChangeZalo, setMe }) {
  const wk = useWorker();
  const { connected, trips, states, take, cancel, wonTrip, clearWon, groups, selected, setWatchedGroups, limit, setLimit } = wk;
  const [query,setQuery]=useState(""); const [typeF,setTypeF]=useState("Tất cả");
  const [timeF,setTimeF]=useState("all"); const [carF,setCarF]=useState("Tất cả xe");
  const [freeOnly,setFreeOnly]=useState(false); const [showMenu,setShowMenu]=useState(false);
  const [tab,setTab]=useState("live");        // live | dispatch | history | account
  const [destB,setDestB]=useState("");        // điểm đến cho tab điều phối
  const [fromA,setFromA]=useState("");        // điểm đang ở (ghi chú)

  const filtered = useMemo(()=>trips.filter(t=>{
    if(typeF!=="Tất cả"&&t.type!==typeF)return false;
    if(timeF!=="all"&&t.time?.bucket!==timeF)return false;
    if(carF!=="Tất cả xe"&&t.car!==carF)return false;
    if(freeOnly&&!t.free)return false;
    if(query.trim()&&!((t.text||"")+(t.group||"")+(t.sender||"")).toLowerCase().includes(query.toLowerCase()))return false;
    return true;
  }),[trips,query,typeF,timeF,carF,freeOnly]);

  // điều phối: lọc cuốc có ĐIỂM ĐẾN khớp B
  const dispatchResults = useMemo(()=>{
    if(!destB.trim()) return [];
    const b=destB.toLowerCase();
    return trips.filter(t=>{
      const to=(t.route?.to||"").toLowerCase();
      const txt=(t.text||"").toLowerCase();
      return to.includes(b) || txt.includes(b);
    });
  },[trips,destB]);

  const openCount=filtered.filter(t=>!states[t.msgId]).length;
  const wonCount=Object.values(states).filter(v=>v==="won").length;
  const selectedNames = selected.map(id => groups.find(g=>g.id===id)?.name).filter(Boolean);
  const watchLabel = selected.length===0 ? "Tất cả nhóm"
    : selected.length===1 ? (selectedNames[0] || "1 nhóm")
    : `${selected.length} nhóm`;

  return (
    <div style={{maxWidth:760,margin:"0 auto",padding:"14px 14px 78px",minHeight:"calc(100vh - 52px)"}}>
      {/* ===== TAB CUỐC ===== */}
      {tab==="live" && <>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
          <ConnPill connected={connected}/>
          <span style={{fontSize:12.5,color:"var(--ink-dim)",fontWeight:700}}>{openCount} cuốc mới</span>
          {wonCount>0&&<span style={{fontSize:12.5,color:"#34d399",fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}><CheckCircle2 size={13}/> {wonCount} đã nhận</span>}
          <button onClick={()=>setShowMenu(true)} style={{marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:5,maxWidth:200,padding:"6px 11px",borderRadius:9,border:"1px solid var(--line)",background:"var(--card)",color:"var(--ink-dim)",fontSize:12.5,fontWeight:700,cursor:"pointer"}}><Settings size={14} style={{flexShrink:0}}/> <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{watchLabel}</span></button>
        </div>

        <div style={{position:"relative",marginBottom:12}}>
          <Search size={17} style={{position:"absolute",left:13,top:13,color:"var(--ink-dim)"}}/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm điểm đón, điểm đến, từ khoá…" style={{width:"100%",padding:"11px 13px 11px 40px",borderRadius:12,background:"var(--card)",border:"1px solid var(--line)",color:"var(--ink)",fontSize:14.5,outline:"none",fontFamily:"var(--body)"}}/>
          {query&&<button onClick={()=>setQuery("")} style={{position:"absolute",right:10,top:10,background:"none",border:"none",color:"var(--ink-dim)",cursor:"pointer"}}><X size={17}/></button>}
        </div>

        <FilterRow label="Giờ đón" icon={Clock}>{TIME_FILTERS.map(f=><Chip key={f.key} active={timeF===f.key} onClick={()=>setTimeF(f.key)}>{f.label}</Chip>)}</FilterRow>
        <FilterRow label="Loại cuốc" icon={Filter}>{TYPE_FILTERS.map(f=><Chip key={f} active={typeF===f} onClick={()=>setTypeF(f)} solid>{f}</Chip>)}</FilterRow>
        <FilterRow label="Loại xe" icon={Car}>{CAR_FILTERS.map(f=><Chip key={f} active={carF===f} onClick={()=>setCarF(f)}>{f}</Chip>)}<Chip active={freeOnly} onClick={()=>setFreeOnly(!freeOnly)}><Sparkles size={12} style={{marginRight:3,verticalAlign:-1}}/>Chỉ cuốc free</Chip></FilterRow>

        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,marginBottom:4,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:"var(--ink-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"inline-flex",alignItems:"center",gap:5}}><ListChecks size={12}/> Tối đa</span>
          <div style={{display:"flex",gap:6}}>{LIMIT_OPTIONS.map(n=><Chip key={n} active={limit===n} onClick={()=>setLimit(n)}>{n}</Chip>)}</div>
          <span style={{marginLeft:"auto",fontSize:12,color:"var(--ink-dim)"}}>{filtered.length} cuốc · mới nhất</span>
        </div>

        <div style={{height:6}}/>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {filtered.length===0&&<EmptyBox connected={connected}/>}
          {filtered.map(t=><TripCard key={t.msgId} trip={t} state={states[t.msgId]} onTake={()=>take(t)} onCancel={()=>cancel(t)}/>)}
        </div>
      </>}

      {/* ===== TAB ĐIỀU PHỐI ===== */}
      {tab==="dispatch" && (
        <DispatchTab fromA={fromA} setFromA={setFromA} destB={destB} setDestB={setDestB}
          results={dispatchResults} states={states} onTake={take} onCancel={cancel} connected={connected}/>
      )}

      {/* ===== TAB LỊCH SỬ ===== */}
      {tab==="history" && <HistoryView/>}

      {/* ===== TAB TÀI KHOẢN ===== */}
      {tab==="account" && (
        <AccountTab me={me} onChangeZalo={async()=>{
          if(!confirm("Đăng xuất tài khoản Zalo hiện tại và quét tài khoản khác?")) return;
          try{ await api.logoutZalo(); }catch{}
          onChangeZalo?.();
        }} onLogout={async()=>{ await api.logout(); setMe?.(null); }}/>
      )}

      {wonTrip&&<WonModal trip={wonTrip} onClose={clearWon}/>}
      {showMenu&&<GroupMenu groups={groups} selected={selected} onSave={setWatchedGroups} onClose={()=>setShowMenu(false)}/>}

      {/* ===== BOTTOM NAV ===== */}
      <BottomNav tab={tab} setTab={setTab} wonCount={wonCount}/>
    </div>
  );
}

function EmptyBox({connected}){
  return <div style={{textAlign:"center",padding:"50px 20px",color:"var(--ink-dim)"}}><Radio size={30} style={{opacity:.4,marginBottom:10}}/><div style={{fontWeight:700}}>{connected?"Đang chờ cuốc mới từ nhóm…":"Chưa kết nối worker"}</div><div style={{fontSize:13,marginTop:4}}>{connected?"Cuốc sẽ hiện ngay khi có người đăng.":"Chạy npm start ở worker."}</div></div>;
}

/* ===== Bottom nav (mobile) ===== */
function BottomNav({ tab, setTab, wonCount }) {
  const items=[
    {key:"live",icon:Car,label:"Cuốc"},
    {key:"dispatch",icon:Settings,label:"Điều phối"},
    {key:"history",icon:CheckCircle2,label:"Lịch sử"},
    {key:"account",icon:User,label:"Tài khoản"},
  ];
  return (
    <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:60,background:"rgba(10,15,28,.96)",backdropFilter:"blur(12px)",borderTop:"1px solid var(--line)",display:"flex",paddingBottom:"env(safe-area-inset-bottom,0)"}}>
      <div style={{maxWidth:760,margin:"0 auto",width:"100%",display:"flex"}}>
        {items.map(it=>{const on=tab===it.key;const Icon=it.icon;return(
          <button key={it.key} onClick={()=>setTab(it.key)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"9px 4px 8px",background:"none",border:"none",cursor:"pointer",position:"relative",color:on?"var(--accent)":"var(--ink-dim)"}}>
            <Icon size={21} strokeWidth={on?2.4:2}/>
            <span style={{fontSize:11,fontWeight:on?800:600}}>{it.label}</span>
            {it.key==="history"&&wonCount>0&&<span style={{position:"absolute",top:4,right:"50%",marginRight:-22,minWidth:16,height:16,borderRadius:99,background:"#34d399",color:"#04121a",fontSize:10,fontWeight:800,display:"grid",placeItems:"center",padding:"0 4px"}}>{wonCount}</span>}
          </button>
        );})}
      </div>
    </div>
  );
}

/* ===== Tab Điều phối: đang ở A → tìm cuốc về B ===== */
function DispatchTab({ fromA, setFromA, destB, setDestB, results, states, onTake, onCancel, connected }) {
  return (
    <div>
      <div style={{marginBottom:6}}>
        <h2 style={{fontFamily:"var(--display)",fontWeight:800,fontSize:20,margin:"4px 0 2px",display:"flex",alignItems:"center",gap:8}}><Settings size={20} color="var(--accent)"/> Điều phối</h2>
        <p style={{color:"var(--ink-dim)",fontSize:13,margin:0,lineHeight:1.5}}>Bạn đang ở đâu và muốn về đâu? Hệ thống lọc các cuốc có <b style={{color:"var(--ink)"}}>điểm đến</b> trùng nơi bạn muốn tới.</p>
      </div>
      <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:16,padding:16,margin:"12px 0 16px"}}>
        <Field label="Bạn đang ở (tùy chọn)" icon={MapPin}>
          <input value={fromA} onChange={e=>setFromA(e.target.value)} placeholder="VD: Hà Đông" style={inputStyle}/>
        </Field>
        <Field label="Muốn tìm cuốc về" icon={ArrowRight}>
          <input value={destB} onChange={e=>setDestB(e.target.value)} placeholder="VD: Phủ Lý, Ninh Bình…" style={inputStyle} autoFocus/>
        </Field>
        <div style={{fontSize:12.5,color:"var(--ink-dim)"}}>
          {destB.trim() ? <>Tìm thấy <b style={{color:"var(--accent)"}}>{results.length}</b> cuốc về "{destB}"</> : "Nhập điểm đến để lọc cuốc."}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {!destB.trim() && <div style={{textAlign:"center",padding:"40px 20px",color:"var(--ink-dim)"}}><ArrowRight size={28} style={{opacity:.4,marginBottom:10}}/><div style={{fontWeight:700}}>Nhập nơi muốn về để bắt đầu</div></div>}
        {destB.trim() && results.length===0 && <div style={{textAlign:"center",padding:"40px 20px",color:"var(--ink-dim)"}}><Radio size={28} style={{opacity:.4,marginBottom:10}}/><div style={{fontWeight:700}}>Chưa có cuốc nào về "{destB}"</div><div style={{fontSize:13,marginTop:4}}>Cuốc mới khớp sẽ hiện ngay khi có.</div></div>}
        {results.map(t=><TripCard key={t.msgId} trip={t} state={states[t.msgId]} onTake={()=>onTake(t)} onCancel={()=>onCancel(t)}/>)}
      </div>
    </div>
  );
}

/* ===== Tab Tài khoản: đổi mật khẩu, đổi Zalo, đăng xuất ===== */
function AccountTab({ me, onChangeZalo, onLogout }) {
  const [showPw,setShowPw]=useState(false);
  return (
    <div>
      <h2 style={{fontFamily:"var(--display)",fontWeight:800,fontSize:20,margin:"4px 0 14px",display:"flex",alignItems:"center",gap:8}}><User size={20} color="var(--accent)"/> Tài khoản</h2>

      <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:16,padding:16,marginBottom:14}}>
        <Row icon={User} label="Tên" value={me.name}/>
        <Row icon={Phone} label="Số điện thoại" value={me.phone}/>
        <Row icon={CreditCard} label="Gói" value={me.plan||"—"}/>
        <Row icon={Clock} label="Còn lại" value={me.status==="active"?`${me.daysLeft} ngày`:me.status}/>
        <Row icon={QrCode} label="Zalo" value={me.hasZalo?"Đã kết nối":"Chưa"} last/>
      </div>

      <button onClick={()=>setShowPw(true)} style={accBtn}><Lock size={17}/> Đổi mật khẩu <ChevronRight size={16} style={{marginLeft:"auto"}}/></button>
      <button onClick={onChangeZalo} style={accBtn}><QrCode size={17}/> Đổi tài khoản Zalo <ChevronRight size={16} style={{marginLeft:"auto"}}/></button>
      <button onClick={onLogout} style={{...accBtn,color:"#f87171",borderColor:"#ef444433"}}><LogOut size={17}/> Đăng xuất <ChevronRight size={16} style={{marginLeft:"auto"}}/></button>

      {showPw&&<ChangePasswordModal onClose={()=>setShowPw(false)}/>}
    </div>
  );
}
function Row({icon:Icon,label,value,last}){
  return <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:last?"none":"1px solid var(--line)"}}>
    <Icon size={15} color="var(--ink-dim)"/><span style={{fontSize:13.5,color:"var(--ink-dim)"}}>{label}</span>
    <span style={{marginLeft:"auto",fontSize:13.5,fontWeight:700,color:"var(--ink)"}}>{value}</span>
  </div>;
}

function ChangePasswordModal({ onClose }) {
  const [oldP,setOldP]=useState(""); const [n1,setN1]=useState(""); const [n2,setN2]=useState("");
  const [err,setErr]=useState(""); const [ok,setOk]=useState(false); const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(n1.length<3){setErr("Mật khẩu mới phải từ 3 ký tự.");return;}
    if(n1!==n2){setErr("Mật khẩu mới xác nhận không khớp.");return;}
    setBusy(true);setErr("");
    try{ await api.changePassword(oldP,n1); setOk(true); setTimeout(onClose,1200); }
    catch(e){ setErr(e.message); } finally { setBusy(false); }
  };
  useEffect(()=>{const k=e=>e.key==="Escape"&&onClose();window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k);},[onClose]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,display:"grid",placeItems:"center",background:"rgba(3,6,14,.72)",backdropFilter:"blur(4px)",padding:18}} className="overlay-in">
      <div onClick={e=>e.stopPropagation()} className="modal-in" style={{width:"100%",maxWidth:400,background:"var(--card)",borderRadius:20,border:"1px solid var(--line)",padding:"22px 20px",boxShadow:"0 24px 70px rgba(0,0,0,.6)"}}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:16}}>
          <Lock size={18} color="var(--accent)"/><div style={{fontWeight:800,fontSize:17,fontFamily:"var(--display)",color:"var(--ink)"}}>Đổi mật khẩu</div>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--ink-dim)",cursor:"pointer"}}><X size={18}/></button>
        </div>
        {ok ? <div style={{textAlign:"center",padding:"20px 0",color:"#34d399"}}><CheckCircle2 size={40}/><div style={{fontWeight:800,marginTop:8}}>Đã đổi mật khẩu!</div></div> : <>
          <Field label="Mật khẩu hiện tại" icon={Lock}><input type="password" value={oldP} onChange={e=>setOldP(e.target.value)} style={inputStyle}/></Field>
          <Field label="Mật khẩu mới" icon={Lock}><input type="password" value={n1} onChange={e=>setN1(e.target.value)} style={inputStyle}/></Field>
          <Field label="Xác nhận mật khẩu mới" icon={Lock}><input type="password" value={n2} onChange={e=>setN2(e.target.value)} style={{...inputStyle,borderColor:n2&&n1!==n2?"#ef4444":(n2&&n1===n2?"#34d399":"var(--line)")}} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
          {err&&<ErrBox>{err}</ErrBox>}
          <button onClick={submit} disabled={busy} style={{...primaryBtn,opacity:busy?0.6:1}}>{busy?"ĐANG ĐỔI…":"ĐỔI MẬT KHẨU"}</button>
        </>}
      </div>
    </div>
  );
}

/* ===== Lịch sử cuốc đã nhận (đầy đủ thông tin) ===== */
function HistoryView() {
  const [items,setItems]=useState(null);
  const [err,setErr]=useState("");
  useEffect(()=>{ api.savedTrips().then(setItems).catch(e=>setErr(e.message)); },[]);
  const fmtDate=(ms)=>new Date(ms).toLocaleString("vi-VN",{hour12:false});

  if(err) return <ErrBox>{err}</ErrBox>;
  if(items===null) return <div style={{textAlign:"center",padding:"40px",color:"var(--ink-dim)"}}>Đang tải lịch sử…</div>;
  if(items.length===0) return (
    <div style={{textAlign:"center",padding:"50px 20px",color:"var(--ink-dim)"}}>
      <CheckCircle2 size={30} style={{opacity:.4,marginBottom:10}}/>
      <div style={{fontWeight:700}}>Chưa có cuốc nào đã nhận</div>
      <div style={{fontSize:13,marginTop:4}}>Cuốc bạn bấm nhận sẽ được lưu ở đây (giữ 2 tháng).</div>
    </div>
  );
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:12.5,color:"var(--ink-dim)",fontWeight:600}}>{items.length} cuốc đã nhận · lưu trong 2 tháng</div>
      {items.map(it=>{
        const meta=TYPE_META[it.trip_type]||{icon:Radio,color:"#94a3b8"};const Icon=meta.icon;
        const won=it.status==="won";
        return (
          <div key={it.id} style={{background:"var(--card)",border:"1px solid "+(won?"#34d39944":"var(--line)"),borderRadius:16,padding:15,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:won?"#34d399":meta.color}}/>
            <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><Megaphone size={13} color="#60a5fa"/><span style={{color:"#60a5fa",fontWeight:700,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.group_name||it.group_id}</span></div>
                <div style={{display:"flex",alignItems:"center",gap:5,color:"var(--ink-dim)",fontSize:12.5}}><User size={12}/> {it.sender||"—"}</div>
              </div>
              <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11.5,fontWeight:700,padding:"3px 9px",borderRadius:99,
                color:won?"#34d399":"#f59e0b",background:(won?"#34d399":"#f59e0b")+"1f",border:"1px solid "+(won?"#34d399":"#f59e0b")+"33"}}>
                {won?<><CheckCircle2 size={12}/> Đã chốt</>:<><Hourglass size={12}/> Đã xin</>}
              </span>
            </div>
            {(it.route_from||it.route_to)&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9,fontSize:14,fontWeight:600,textTransform:"capitalize"}}><span>{it.route_from||"—"}</span><ArrowRight size={15} color="var(--accent)" style={{flexShrink:0}}/><span style={{color:"var(--accent)"}}>{it.route_to||"—"}</span></div>}
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:9,flexWrap:"wrap"}}>
              {it.trip_type&&<Tag color={meta.color} icon={Icon}>{it.trip_type}</Tag>}
              {it.price&&<span style={{marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:5,fontWeight:800,fontSize:18,color:"#f87171",fontFamily:"var(--display)"}}><Wallet size={15}/> {it.price}k</span>}
            </div>
            <div style={{fontSize:13,color:"var(--ink-dim)",lineHeight:1.5,marginBottom:9,background:"rgba(0,0,0,.2)",padding:"8px 11px",borderRadius:9}}>{it.text}</div>
            <div style={{fontSize:11.5,color:"var(--ink-dim)",display:"flex",alignItems:"center",gap:5}}><Clock size={12}/> Nhận lúc {fmtDate(it.taken_at)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ConnPill({ connected }) {
  return (
    <div style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,fontWeight:700,color:connected?"#34d399":"#f59e0b",padding:"5px 11px",borderRadius:99,background:connected?"rgba(52,211,153,.1)":"rgba(245,158,11,.1)",border:"1px solid "+(connected?"rgba(52,211,153,.3)":"rgba(245,158,11,.3)")}}>
      {connected?<><span className="pulse" style={{width:7,height:7,borderRadius:99,background:"#34d399"}}/> Đã nối worker</>:<><WifiOff size={13}/> Mất kết nối</>}
    </div>
  );
}

/* ====== Menu chọn nhóm theo dõi ====== */
function GroupMenu({ groups, selected, onSave, onClose }) {
  const [pick,setPick]=useState(new Set(selected));
  const [q,setQ]=useState("");
  const toggle=(id)=>{const n=new Set(pick); n.has(id)?n.delete(id):n.add(id); setPick(n);};
  const all = pick.size===0;
  const shown = groups.filter(g=>!q.trim()||(g.name||"").toLowerCase().includes(q.toLowerCase()));
  const selectAllShown=()=>{const n=new Set(pick); shown.forEach(g=>n.add(g.id)); setPick(n);};
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,display:"grid",placeItems:"center",background:"rgba(3,6,14,.72)",backdropFilter:"blur(4px)",padding:18}} className="overlay-in">
      <div onClick={e=>e.stopPropagation()} className="modal-in" style={{width:"100%",maxWidth:460,maxHeight:"82vh",display:"flex",flexDirection:"column",background:"var(--card)",borderRadius:20,border:"1px solid var(--line)",overflow:"hidden",boxShadow:"0 24px 70px rgba(0,0,0,.6)"}}>
        <div style={{padding:"16px 18px",borderBottom:"1px solid var(--line)",display:"flex",alignItems:"center",gap:9}}>
          <ListChecks size={18} color="var(--accent)"/>
          <div style={{fontWeight:800,fontSize:16,fontFamily:"var(--display)",color:"var(--ink)"}}>Chọn nhóm theo dõi</div>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--ink-dim)",cursor:"pointer"}}><X size={18}/></button>
        </div>
        <div style={{padding:"12px 16px 6px"}}>
          <div style={{position:"relative"}}>
            <Search size={16} style={{position:"absolute",left:12,top:11,color:"var(--ink-dim)"}}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm nhóm theo tên…" style={{width:"100%",padding:"10px 12px 10px 38px",borderRadius:10,background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)",fontSize:14,outline:"none",fontFamily:"var(--body)"}}/>
            {q&&<button onClick={()=>setQ("")} style={{position:"absolute",right:10,top:9,background:"none",border:"none",color:"var(--ink-dim)",cursor:"pointer"}}><X size={16}/></button>}
          </div>
        </div>
        <div style={{padding:"4px 18px 8px",fontSize:12,color:"var(--ink-dim)",display:"flex",alignItems:"center",gap:8}}>
          <span>Bỏ chọn hết = theo dõi <b style={{color:"var(--ink)"}}>tất cả</b>.</span>
          <span style={{marginLeft:"auto"}}>{shown.length}/{groups.length} nhóm</span>
        </div>
        <div style={{overflowY:"auto",padding:"4px 10px 8px",flex:1}}>
          {groups.length===0&&<div style={{padding:"30px 16px",textAlign:"center",color:"var(--ink-dim)",fontSize:13}}>Worker chưa gửi danh sách nhóm. Đợi worker tải xong (xem log).</div>}
          {groups.length>0&&shown.length===0&&<div style={{padding:"26px 16px",textAlign:"center",color:"var(--ink-dim)",fontSize:13}}>Không có nhóm khớp "{q}".</div>}
          {shown.map(g=>{const on=pick.has(g.id);return(
            <button key={g.id} onClick={()=>toggle(g.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:11,padding:"11px 12px",borderRadius:11,border:"1px solid "+(on?"var(--accent)":"transparent"),background:on?"rgba(52,211,153,.1)":"transparent",cursor:"pointer",textAlign:"left",marginBottom:4,color:"var(--ink)"}}>
              <div style={{width:20,height:20,borderRadius:6,border:"2px solid "+(on?"var(--accent)":"var(--line)"),background:on?"var(--accent)":"transparent",display:"grid",placeItems:"center",flexShrink:0}}>{on&&<CheckCircle2 size={14} color="#04121a"/>}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:14,color:"var(--ink)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{g.name||g.id}</div></div>
            </button>
          );})}
        </div>
        <div style={{padding:"12px 18px",borderTop:"1px solid var(--line)",display:"flex",gap:9,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:12.5,color:"var(--ink-dim)",marginRight:"auto"}}>{all?"Theo dõi tất cả":`Đã chọn ${pick.size}`}</span>
          {q&&shown.length>0&&<button onClick={selectAllShown} style={ghostFull2}>Chọn hết KQ</button>}
          <button onClick={()=>setPick(new Set())} style={ghostFull2}>Bỏ chọn hết</button>
          <button onClick={()=>{onSave([...pick]);onClose();}} style={{...primaryBtn,marginTop:0,width:"auto",padding:"10px 18px"}}>Lưu</button>
        </div>
      </div>
    </div>
  );
}

function FilterRow({label,icon:Icon,children}){return(<div style={{marginBottom:10}}><div style={{fontSize:11,color:"var(--ink-dim)",fontWeight:700,marginBottom:6,display:"flex",alignItems:"center",gap:5,textTransform:"uppercase",letterSpacing:".06em"}}><Icon size={12}/> {label}</div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{children}</div></div>);}

function TripCard({trip,state,onTake,onCancel}){
  const meta=TYPE_META[trip.type]||{icon:Radio,color:"#94a3b8"};const Icon=meta.icon;
  const pending=state==="pending";const won=state==="won";
  const bc=won?"#34d39955":pending?"#f59e0b44":"var(--line)";
  return (
    <div style={{background:"var(--card)",border:"1px solid "+bc,borderRadius:16,padding:15,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:won?"#34d399":pending?"#f59e0b":meta.color}}/>
      {pending&&<StatusBanner color="#f59e0b" icon={Hourglass} text="Đã reply Ok — chờ chủ cuốc xác nhận…"/>}
      {won&&<StatusBanner color="#34d399" icon={CheckCircle2} text="Chủ đã tag bạn — bạn nhận được cuốc này!"/>}
      <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><Megaphone size={13} color="#60a5fa"/><span style={{color:"#60a5fa",fontWeight:700,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{trip.group}</span></div>
          <div style={{display:"flex",alignItems:"center",gap:5,color:"var(--ink-dim)",fontSize:12.5}}><User size={12}/> {trip.sender}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,color:"var(--ink-dim)",fontSize:12}}><Clock size={12}/> {trip.t}</div>
      </div>
      {trip.route&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,fontSize:14,fontWeight:600,textTransform:"capitalize"}}><span>{trip.route.from||"—"}</span><ArrowRight size={15} color="var(--accent)" style={{flexShrink:0}}/><span style={{color:"var(--accent)"}}>{trip.route.to||"—"}</span></div>}
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10,flexWrap:"wrap"}}>
        <Tag color={meta.color} icon={Icon}>{trip.type}</Tag>{trip.time&&<Tag><Clock size={12}/> {trip.time.label}</Tag>}<Tag>{trip.seats}</Tag>
        {trip.car&&<Tag><Car size={12}/> {trip.car}</Tag>}{trip.free&&<Tag color="#34d399"><Sparkles size={11}/> free</Tag>}{trip.bonus&&<Tag color="#a78bfa">+{trip.bonus}</Tag>}
        {trip.price&&<span style={{marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:5,fontWeight:800,fontSize:19,color:"#f87171",fontFamily:"var(--display)"}}><Wallet size={16}/> {trip.price}k</span>}
      </div>
      <div style={{fontSize:13,color:"var(--ink-dim)",lineHeight:1.5,marginBottom:13,background:"rgba(0,0,0,.2)",padding:"8px 11px",borderRadius:9}}>{trip.text}</div>
      {pending ? (
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1,padding:"12px",borderRadius:12,fontWeight:800,fontSize:14.5,fontFamily:"var(--display)",display:"flex",alignItems:"center",justifyContent:"center",gap:7,background:"rgba(245,158,11,.15)",color:"#f59e0b"}}><Hourglass size={16}/> ĐANG CHỜ CHỦ CHỐT…</div>
          <button onClick={onCancel} title="Thu hồi tin Ok đã gửi" style={{padding:"12px 16px",borderRadius:12,border:"1px solid #ef444455",cursor:"pointer",fontWeight:800,fontSize:14.5,fontFamily:"var(--display)",display:"flex",alignItems:"center",gap:6,background:"rgba(239,68,68,.12)",color:"#f87171"}}><X size={16}/> Hủy</button>
        </div>
      ) : (
        <button onClick={()=>!state&&onTake()} disabled={!!state} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",cursor:state?"default":"pointer",fontWeight:800,fontSize:15,fontFamily:"var(--display)",letterSpacing:".02em",display:"flex",alignItems:"center",justifyContent:"center",gap:7,background:won?"rgba(52,211,153,.15)":"linear-gradient(135deg,#22c55e,#16a34a)",color:won?"#34d399":"#04140a",boxShadow:state?"none":"0 6px 18px rgba(34,197,94,.3)"}}>
          {won?<><CheckCircle2 size={16}/> ĐÃ NHẬN ĐƯỢC CUỐC</>:<><Zap size={17}/> NHẬN CUỐC</>}
        </button>
      )}
    </div>
  );
}
function StatusBanner({color,icon:Icon,text}){return(<div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:8,background:color+"1a",color,fontSize:12,fontWeight:700,marginBottom:11,border:"1px solid "+color+"33"}}><Icon size={13}/> {text}</div>);}
function Tag({children,color,icon:Icon}){return(<span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 9px",borderRadius:8,fontSize:12,fontWeight:700,textTransform:"capitalize",background:color?color+"1a":"rgba(148,163,184,.1)",color:color||"var(--ink-dim)",border:"1px solid "+(color?color+"33":"transparent")}}>{Icon&&<Icon size={12}/>}{children}</span>);}

function WonModal({trip,onClose}){
  const meta=TYPE_META[trip.type]||{icon:Radio,color:"#94a3b8"};const Icon=meta.icon;
  const openZalo=()=>{ if(trip.groupId) window.open(`https://zalo.me/g/${trip.groupId}`,"_blank"); onClose(); };
  useEffect(()=>{const k=e=>e.key==="Escape"&&onClose();window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k);},[onClose]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,display:"grid",placeItems:"center",background:"rgba(3,6,14,.72)",backdropFilter:"blur(4px)",padding:18}} className="overlay-in">
      <div onClick={e=>e.stopPropagation()} className="modal-in" style={{width:"100%",maxWidth:380,background:"var(--card)",borderRadius:22,border:"1px solid #34d39955",overflow:"hidden",boxShadow:"0 24px 70px rgba(0,0,0,.6)"}}>
        <div style={{background:"linear-gradient(135deg,#16a34a,#0d9488)",padding:"22px 20px 18px",textAlign:"center",position:"relative"}}>
          <button onClick={onClose} aria-label="Đóng" style={{position:"absolute",top:14,right:14,width:30,height:30,borderRadius:99,border:"none",background:"rgba(0,0,0,.2)",color:"#fff",cursor:"pointer",display:"grid",placeItems:"center"}}><X size={17}/></button>
          <div className="pop-badge" style={{width:56,height:56,borderRadius:99,background:"rgba(255,255,255,.18)",display:"grid",placeItems:"center",margin:"0 auto 11px"}}><CheckCircle2 size={32} color="#fff" strokeWidth={2.5}/></div>
          <div style={{fontFamily:"var(--display)",fontWeight:800,fontSize:20,color:"#fff"}}>Nhận được cuốc!</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.85)",marginTop:3}}>Chủ cuốc đã tag xác nhận cho bạn</div>
        </div>
        <div style={{padding:18}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><Megaphone size={14} color="#60a5fa"/><span style={{color:"#60a5fa",fontWeight:700,fontSize:13.5}}>{trip.group}</span><span style={{marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:4,color:"var(--ink-dim)",fontSize:12}}><User size={12}/> {trip.sender}</span></div>
          {trip.route&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,fontSize:16,fontWeight:700,textTransform:"capitalize"}}><span>{trip.route.from||"—"}</span><ArrowRight size={16} color="var(--accent)"/><span style={{color:"var(--accent)"}}>{trip.route.to||"—"}</span></div>}
          <div style={{fontSize:13,color:"var(--ink-dim)",lineHeight:1.5,marginBottom:16,background:"rgba(0,0,0,.25)",padding:"9px 12px",borderRadius:10}}>{trip.text}</div>
          <button onClick={openZalo} style={{width:"100%",padding:"13px",borderRadius:13,border:"none",cursor:"pointer",fontWeight:800,fontSize:15.5,fontFamily:"var(--display)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"linear-gradient(135deg,#0068ff,#0052cc)",color:"#fff",boxShadow:"0 8px 22px rgba(0,104,255,.4)"}}><MessageCircle size={18}/> Mở nhóm Zalo để chốt</button>
          <button onClick={onClose} style={{width:"100%",padding:"11px",marginTop:8,borderRadius:12,border:"1px solid var(--line)",background:"transparent",color:"var(--ink-dim)",fontWeight:700,fontSize:13.5,cursor:"pointer"}}>Để sau</button>
        </div>
      </div>
    </div>
  );
}

/* ============ ADMIN ============ */
function AdminApp() {
  const [week,setWeek]=useState(30000);const [month,setMonth]=useState(99000);
  const [users,setUsers]=useState([]);
  const [q,setQ]=useState("");
  const fmt=n=>n.toLocaleString("vi-VN")+"đ";
  const reload=()=>api.adminUsers().then(setUsers).catch(()=>{});
  useEffect(()=>{ reload(); const t=setInterval(reload,5000); return ()=>clearInterval(t); },[]);
  // tìm theo SĐT hoặc tên
  const drivers=users.filter(u=>{
    if(!q.trim())return true;
    const s=q.toLowerCase();
    return (u.phone||"").toLowerCase().includes(s)||(u.name||"").toLowerCase().includes(s);
  });
  const stat=users.filter(u=>u.role!=="admin");
  const pending=stat.filter(u=>u.status==="pending").length;
  const active=stat.filter(u=>u.status==="active").length;
  const expired=stat.filter(u=>u.status==="expired").length;
  const rev=stat.filter(u=>u.status==="active").reduce((s,u)=>s+(u.plan==="Tháng"?month:week),0);
  const approve=async(id,plan)=>{await api.approve(id,plan);reload();};
  const renew=async(id)=>{await api.renew(id);reload();};
  const ban=async(id)=>{await api.ban(id);reload();};
  const setRole=async(id,role)=>{
    const verb=role==="admin"?"CẤP quyền admin cho":"GỠ quyền admin của";
    if(!confirm(`${verb} tài khoản này?`))return;
    try{await api.setRole(id,role);reload();}catch(e){alert(e.message);}
  };
  return (
    <div style={{maxWidth:1000,margin:"0 auto",padding:"20px 16px 60px"}}>
      <h1 style={{fontFamily:"var(--display)",fontWeight:800,fontSize:24,letterSpacing:"-.02em",marginBottom:4}}>Bảng điều khiển Admin</h1>
      <p style={{color:"var(--ink-dim)",fontSize:14,marginBottom:22}}>Duyệt tài khoản, cấp gói, gia hạn và phân quyền.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:24}}>
        <Stat icon={Hourglass} color="#f59e0b" label="Chờ duyệt" value={pending}/>
        <Stat icon={CheckCircle2} color="#22c55e" label="Hoạt động" value={active}/>
        <Stat icon={Ban} color="#ef4444" label="Hết hạn" value={expired}/>
        <Stat icon={TrendingUp} color="#06b6d4" label="Doanh thu kỳ này" value={fmt(rev)} small/>
      </div>
      <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:16,padding:18,marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,fontWeight:700,fontSize:15}}><CreditCard size={18} color="var(--accent)"/> Cấu hình giá gói</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
          <PriceInput label="Gói Tuần (7 ngày)" value={week} onChange={setWeek}/>
          <PriceInput label="Gói Tháng (30 ngày)" value={month} onChange={setMonth}/>
        </div>
      </div>
      <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:16,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid var(--line)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{fontWeight:700,fontSize:15}}>Tài khoản</div>
          <span style={{fontSize:12.5,color:"var(--ink-dim)"}}>{drivers.length}/{users.length}{pending>0&&<span style={{color:"#f59e0b"}}> · {pending} chờ duyệt</span>}</span>
          <div style={{position:"relative",marginLeft:"auto",minWidth:220}}>
            <Search size={15} style={{position:"absolute",left:11,top:9,color:"var(--ink-dim)"}}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm theo SĐT hoặc tên…" style={{width:"100%",padding:"8px 11px 8px 34px",borderRadius:9,background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)",fontSize:13.5,outline:"none"}}/>
            {q&&<button onClick={()=>setQ("")} style={{position:"absolute",right:9,top:8,background:"none",border:"none",color:"var(--ink-dim)",cursor:"pointer"}}><X size={15}/></button>}
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13.5,minWidth:820}}>
            <thead><tr style={{color:"var(--ink-dim)",textAlign:"left",fontSize:11.5,textTransform:"uppercase",letterSpacing:".05em"}}><th style={th}>Tài khoản</th><th style={th}>SĐT</th><th style={th}>Vai trò</th><th style={th}>Gói</th><th style={th}>Zalo</th><th style={th}>Còn lại</th><th style={th}>Trạng thái</th><th style={{...th,textAlign:"right"}}>Thao tác</th></tr></thead>
            <tbody>{drivers.length===0&&<tr><td colSpan={8} style={{...td,textAlign:"center",color:"var(--ink-dim)"}}>{q?`Không tìm thấy "${q}"`:"Chưa có tài khoản nào."}</td></tr>}
            {drivers.map(u=>{const isAdmin=u.role==="admin";return(
              <tr key={u.id} style={{borderTop:"1px solid var(--line)",background:u.status==="pending"?"rgba(245,158,11,.05)":isAdmin?"rgba(167,139,250,.05)":"transparent"}}>
                <td style={{...td,fontWeight:600}}>{u.name}</td><td style={{...td,color:"var(--ink-dim)"}}>{u.phone}</td>
                <td style={td}>{isAdmin?<span style={{display:"inline-flex",alignItems:"center",gap:4,color:"#a78bfa",fontWeight:700,fontSize:12}}><Shield size={12}/> Admin</span>:<span style={{color:"var(--ink-dim)",fontSize:12.5}}>Tài xế</span>}</td>
                <td style={td}>{isAdmin?"—":(u.plan||"—")}</td>
                <td style={td}>{u.hasZalo?<span style={{color:"#34d399"}}>✓</span>:<span style={{color:"var(--ink-dim)"}}>—</span>}</td>
                <td style={td}>{!isAdmin&&u.status==="active"?<span style={{color:u.daysLeft<=3?"#f59e0b":"var(--ink)"}}>{u.daysLeft} ngày</span>:<span style={{color:"var(--ink-dim)"}}>—</span>}</td>
                <td style={td}><StatusPill status={u.status}/></td>
                <td style={{...td,textAlign:"right",whiteSpace:"nowrap"}}>
                  {isAdmin ? (
                    <button onClick={()=>setRole(u.id,"driver")} style={miniBtn("#f59e0b")}><Shield size={13}/> Gỡ admin</button>
                  ) : u.status==="pending" ? (<>
                    <button onClick={()=>approve(u.id,"Tuần")} style={miniBtn("#3b82f6")}>Duyệt · Tuần</button>
                    <button onClick={()=>approve(u.id,"Tháng")} style={miniBtn("#22c55e")}>Duyệt · Tháng</button>
                  </>) : (<>
                    <button onClick={()=>setRole(u.id,"admin")} style={miniBtn("#a78bfa")}><Shield size={13}/> Cấp admin</button>
                    <button onClick={()=>renew(u.id)} style={miniBtn("#22c55e")}><RefreshCw size={13}/> Gia hạn</button>
                    <button onClick={()=>ban(u.id)} style={miniBtn(u.status==="banned"?"#3b82f6":"#ef4444")}><Ban size={13}/> {u.status==="banned"?"Mở":"Khoá"}</button>
                  </>)}
                </td>
              </tr>
            );})}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
function Stat({icon:Icon,color,label,value,small}){return(<div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:14,padding:"15px 16px"}}><div style={{display:"flex",alignItems:"center",gap:7,color:"var(--ink-dim)",fontSize:12.5,marginBottom:9,fontWeight:600}}><Icon size={15} color={color}/> {label}</div><div style={{fontFamily:"var(--display)",fontWeight:800,fontSize:small?22:30,color,letterSpacing:"-.02em"}}>{value}</div></div>);}
function PriceInput({label,value,onChange}){return(<div><div style={{fontSize:12.5,color:"var(--ink-dim)",marginBottom:6,fontWeight:600}}>{label}</div><div style={{position:"relative"}}><input type="number" value={value} onChange={e=>onChange(Number(e.target.value))} style={{width:"100%",padding:"10px 40px 10px 13px",borderRadius:10,background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)",fontSize:15,fontWeight:700,outline:"none",fontFamily:"var(--display)"}}/><span style={{position:"absolute",right:13,top:11,color:"var(--ink-dim)",fontSize:14}}>đ</span></div></div>);}
function StatusPill({status}){const m={active:{t:"Hoạt động",c:"#34d399"},pending:{t:"Chờ duyệt",c:"#f59e0b"},expired:{t:"Hết hạn",c:"#94a3b8"},banned:{t:"Đã khoá",c:"#f87171"}}[status]||{t:status,c:"#94a3b8"};return(<span style={{display:"inline-block",padding:"3px 10px",borderRadius:99,fontSize:12,fontWeight:700,color:m.c,background:m.c+"1f",border:"1px solid "+m.c+"33"}}>{m.t}</span>);}

/* ===== shared UI ===== */
function AuthShell({title,icon:Icon,children,accent="#34d399",wide}){return(<div style={{display:"grid",placeItems:"center",padding:"40px 16px",minHeight:"calc(100vh - 52px)"}}><div style={{width:"100%",maxWidth:wide?420:400}}><div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:20,padding:"26px 24px",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}><div style={{width:38,height:38,borderRadius:11,background:accent+"1f",display:"grid",placeItems:"center"}}><Icon size={20} color={accent}/></div><div style={{fontFamily:"var(--display)",fontWeight:800,fontSize:21,letterSpacing:"-.02em"}}>{title}</div></div>{children}</div></div></div>);}
function Field({label,icon:Icon,children}){return(<div style={{marginBottom:14}}><div style={{fontSize:12.5,color:"var(--ink-dim)",fontWeight:600,marginBottom:6,display:"flex",alignItems:"center",gap:5}}>{Icon&&<Icon size={13}/>} {label}</div>{children}</div>);}
function ErrBox({children}){return(<div style={{display:"flex",alignItems:"center",gap:7,padding:"9px 12px",borderRadius:10,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",color:"#f87171",fontSize:13,fontWeight:600,marginBottom:14}}><AlertTriangle size={15}/> {children}</div>);}

const inputStyle={width:"100%",padding:"11px 13px",borderRadius:11,background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)",fontSize:14.5,outline:"none",fontFamily:"var(--body)"};
const primaryBtn={width:"100%",padding:"13px",borderRadius:12,border:"none",cursor:"pointer",fontWeight:800,fontSize:15,fontFamily:"var(--display)",letterSpacing:".02em",background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#04140a",boxShadow:"0 6px 18px rgba(34,197,94,.3)",marginTop:4};
const ghostFull={width:"100%",padding:"11px",borderRadius:12,border:"1px solid var(--line)",background:"transparent",color:"var(--ink-dim)",fontWeight:700,fontSize:13.5,cursor:"pointer"};
const ghostFull2={padding:"10px 14px",borderRadius:10,border:"1px solid var(--line)",background:"transparent",color:"var(--ink-dim)",fontWeight:700,fontSize:13,cursor:"pointer"};
const linkBtn={background:"none",border:"none",color:"var(--accent)",fontWeight:700,fontSize:13.5,cursor:"pointer",padding:0};
const accBtn={width:"100%",display:"flex",alignItems:"center",gap:10,padding:"14px 16px",marginBottom:10,borderRadius:13,border:"1px solid var(--line)",background:"var(--card)",color:"var(--ink)",fontWeight:700,fontSize:14.5,cursor:"pointer"};
const th={padding:"10px 16px",fontWeight:700};const td={padding:"12px 16px"};
const miniBtn=color=>({display:"inline-flex",alignItems:"center",gap:4,padding:"5px 10px",marginLeft:6,borderRadius:8,border:"1px solid "+color+"44",background:color+"18",color,fontSize:12.5,fontWeight:700,cursor:"pointer"});
function Chip({children,active,onClick,solid}){return(<button onClick={onClick} style={{padding:"7px 13px",borderRadius:99,fontSize:13,fontWeight:700,cursor:"pointer",border:"1px solid "+(active?"transparent":"var(--line)"),background:active?(solid?"var(--accent)":"rgba(52,211,153,.15)"):"var(--card)",color:active?(solid?"#04121a":"var(--accent)"):"var(--ink-dim)"}}>{children}</button>);}

function StyleVars(){return(<style>{`
  :root{--bg:#070b16;--card:#0f1525;--line:#1e2740;--ink:#e8edf7;--ink-dim:#8794ad;--accent:#34d399;--display:'Plus Jakarta Sans',system-ui,sans-serif;--body:'Inter',system-ui,sans-serif;}
  *{box-sizing:border-box;}body{margin:0;background:#070b16;}
  button,input,select,textarea{color:inherit;font-family:inherit;}
  button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
  .pulse{animation:pulse 1.4s infinite;}@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.55;}}
  .overlay-in{animation:fadeIn .18s ease;}@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
  .modal-in{animation:modalIn .28s cubic-bezier(.2,.9,.3,1.2);}@keyframes modalIn{from{opacity:0;transform:scale(.95) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}
  .pop-badge{animation:pop .45s cubic-bezier(.2,.9,.3,1.4);}@keyframes pop{0%{transform:scale(0);}70%{transform:scale(1.15);}100%{transform:scale(1);}}
  table tr:hover td{background:rgba(255,255,255,.02);}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;}}
`}</style>);}
