import React, { useState, useEffect } from "react";
import {
  Shield, CreditCard, Ban, RefreshCw, X, User, TrendingUp,
  Users, CheckCircle2, Lock, AlertTriangle, LogOut, Settings,
  Search, Phone, Mic, Eye, EyeOff
} from "lucide-react";
import { api, getToken, setToken } from "./api.js";

export default function App() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.me().then(u => {
      if (u.role === "accountant") { window.location.replace("/accountant"); return; }
      if (u.role !== "admin") { setToken(null); setLoading(false); return; }
      setMe(u);
    }).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const logout = async () => { await api.logout(); setMe(null); };

  if (loading) return <div style={{minHeight:"100vh",background:"#070b16",display:"grid",placeItems:"center",color:"#8794ad"}}><StyleVars/>Đang tải…</div>;

  return (
    <>
      <StyleVars />
      {me ? <AdminApp me={me} onLogout={logout}/> : <AdminLoginScreen onLogin={setMe}/>}
    </>
  );
}

function AdminLoginScreen({ onLogin }) {
  const [phone,setPhone]=useState(()=>localStorage.getItem("tlx_admin_phone")||""); const [pass,setPass]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const submit=async()=>{ setBusy(true); setErr("");
    try {
      const u = await api.login({phone:phone.trim(),pass});
      localStorage.setItem("tlx_admin_phone",phone.trim());
      if (u.role === "accountant") { window.location.replace("/accountant"); return; }
      if (u.role !== "admin") { await api.logout(); setErr("Tài khoản này không có quyền Admin hoặc Kế Toán."); return; }
      onLogin(u);
    }
    catch(e){ setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--ink)",fontFamily:"var(--body)",display:"grid",placeItems:"center",padding:16}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:20,padding:"26px 24px",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
            <div style={{width:38,height:38,borderRadius:11,background:"rgba(167,139,250,.15)",display:"grid",placeItems:"center"}}><Shield size={20} color="#a78bfa"/></div>
            <div style={{fontFamily:"var(--display)",fontWeight:800,fontSize:21,letterSpacing:"-.02em"}}>Admin</div>
          </div>
          <Field label="Số điện thoại / Tài khoản" icon={Phone}><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="SĐT Admin" style={inputStyle} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
          <Field label="Mật khẩu" icon={Lock}><input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Nhập mật khẩu" style={inputStyle} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
          {err&&<ErrBox>{err}</ErrBox>}
          <button onClick={submit} disabled={busy} style={{...primaryBtn,background:"linear-gradient(135deg,#a78bfa,#7c3aed)",boxShadow:"0 6px 18px rgba(167,139,250,.3)",opacity:busy?0.6:1}}>{busy?"ĐANG ĐĂNG NHẬP…":"ĐĂNG NHẬP ADMIN"}</button>
        </div>
      </div>
    </div>
  );
}

/* ===== Admin: Cài đặt hệ thống ===== */
function AdminSettingsTab() {
  const [settings, setSettings] = useState(null); // null = đang tải
  const [saving, setSaving] = useState(null); // key đang lưu
  const [msg, setMsg] = useState(null);
  const [fptKey, setFptKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const load = () => api.getSettings().then(s => { setSettings(s); setFptKey(""); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };

  const toggleVoice = async () => {
    setSaving("voice");
    try {
      const next = !settings.voice_enabled;
      await api.setSetting("voice_enabled", next);
      setSettings(s => ({ ...s, voice_enabled: next }));
      flash(true, next ? "Đã bật xử lý tin nhắn voice." : "Đã tắt xử lý tin nhắn voice.");
    } catch (e) { flash(false, e.message || "Lỗi lưu"); }
    finally { setSaving(null); }
  };

  const saveFptKey = async () => {
    setSaving("fpt");
    try {
      const r = await api.setSetting("fpt_stt_api_key", fptKey.trim());
      setSettings(s => ({ ...s, fpt_api_key_set: r.fpt_api_key_set, fpt_api_key_hint: r.fpt_api_key_hint }));
      setFptKey("");
      flash(true, fptKey.trim() ? "Đã lưu FPT API Key." : "Đã xoá FPT API Key.");
    } catch (e) { flash(false, e.message || "Lỗi lưu"); }
    finally { setSaving(null); }
  };

  const voiceOn = settings?.voice_enabled;
  const cardStyle = { background:"var(--card)", border:"1px solid var(--line)", borderRadius:16, padding:20, marginBottom:14 };

  return (
    <div style={{maxWidth:540}}>
      {/* Toggle voice */}
      <div style={cardStyle}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <Mic size={17} color="#a78bfa"/>
          <span style={{fontWeight:700,fontSize:15}}>Xử lý tin nhắn Voice</span>
          <span style={{marginLeft:"auto"}}>
            {settings === null
              ? <span style={{color:"var(--ink-dim)",fontSize:13}}>Đang tải…</span>
              : <button onClick={toggleVoice} disabled={!!saving} style={{
                  display:"inline-flex",alignItems:"center",gap:7,padding:"7px 18px",
                  borderRadius:99,cursor:saving?"default":"pointer",fontWeight:700,fontSize:13,
                  background:voiceOn?"rgba(52,211,153,.15)":"rgba(239,68,68,.1)",
                  color:voiceOn?"#34d399":"#f87171",
                  border:"1px solid "+(voiceOn?"#34d39955":"#f8717155"),
                }}>
                  <span style={{width:9,height:9,borderRadius:99,background:voiceOn?"#34d399":"#f87171",display:"inline-block"}}/>
                  {saving==="voice" ? "Đang lưu…" : voiceOn ? "Đang BẬT" : "Đang TẮT"}
                </button>
            }
          </span>
        </div>
        <p style={{color:"var(--ink-dim)",fontSize:13,lineHeight:1.6,margin:0}}>
          Khi <b>bật</b>: voice trong nhóm Zalo được chuyển văn bản qua FPT.AI rồi phân tích cuốc xe.<br/>
          Khi <b>tắt</b>: tin voice bị bỏ qua hoàn toàn, không tốn API key.
        </p>
      </div>

      {/* FPT API Key */}
      <div style={cardStyle}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <Settings size={17} color="#60a5fa"/>
          <span style={{fontWeight:700,fontSize:15}}>FPT.AI STT API Key</span>
          {settings?.fpt_api_key_set && (
            <span style={{marginLeft:"auto",fontSize:12,color:"#34d399",fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
              <CheckCircle2 size={13}/> Đã cấu hình {settings.fpt_api_key_hint}
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{flex:1,position:"relative"}}>
            <input
              type={showKey?"text":"password"}
              value={fptKey}
              onChange={e=>setFptKey(e.target.value)}
              placeholder={settings?.fpt_api_key_set ? "Nhập key mới để thay thế…" : "Nhập FPT.AI API Key…"}
              style={{width:"100%",boxSizing:"border-box",padding:"10px 38px 10px 12px",borderRadius:10,border:"1px solid var(--line)",background:"rgba(0,0,0,.2)",color:"var(--ink)",fontSize:13,outline:"none"}}
              onKeyDown={e=>e.key==="Enter"&&fptKey.trim()&&saveFptKey()}
            />
            <button onClick={()=>setShowKey(p=>!p)} title={showKey?"Ẩn":"Hiện"} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--ink-dim)",padding:2}}>
              {showKey ? <EyeOff size={15}/> : <Eye size={15}/>}
            </button>
          </div>
          <button onClick={saveFptKey} disabled={!!saving||!fptKey.trim()} style={{padding:"10px 18px",borderRadius:10,cursor:fptKey.trim()&&!saving?"pointer":"default",fontWeight:700,fontSize:13,background:"rgba(96,165,250,.15)",color:"#60a5fa",border:"1px solid #60a5fa44",whiteSpace:"nowrap"}}>
            {saving==="fpt"?"Đang lưu…":"Lưu key"}
          </button>
        </div>
        {settings?.fpt_api_key_set && (
          <button onClick={async()=>{
            try{await api.setSetting("fpt_stt_api_key","");setSettings(s=>({...s,fpt_api_key_set:false,fpt_api_key_hint:null}));flash(true,"Đã xoá FPT API Key.");}
            catch(e){flash(false,e.message);}
          }} style={{marginTop:8,background:"none",border:"none",cursor:"pointer",color:"#f87171",fontSize:12,textDecoration:"underline",padding:0}}>
            Xoá key
          </button>
        )}
        <p style={{color:"var(--ink-dim)",fontSize:12,lineHeight:1.5,marginTop:10,marginBottom:0}}>
          Lấy key tại <b>fpt.ai</b> → Console → API Key. Key lưu trong DB, ưu tiên hơn biến môi trường <code style={{background:"rgba(148,163,184,.1)",padding:"1px 4px",borderRadius:3}}>FPT_STT_API_KEY</code>.
        </p>
      </div>

      {msg && (
        <div style={{padding:"10px 14px",borderRadius:10,fontSize:13,fontWeight:600,
          background:msg.ok?"rgba(52,211,153,.12)":"rgba(239,68,68,.12)",
          color:msg.ok?"#34d399":"#f87171",
          border:"1px solid "+(msg.ok?"#34d39944":"#f8717144")}}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

/* ============ ADMIN ============ */
function AdminApp({ me, onLogout }) {
  const [week,setWeek]=useState(30000);const [month,setMonth]=useState(99000);
  const [users,setUsers]=useState([]);
  const [q,setQ]=useState("");
  const [adminPage,setAdminPage]=useState(1);
  useEffect(()=>{setAdminPage(1);},[q]);
  const [adminTab,setAdminTab]=useState("users");
  const [resetTarget,setResetTarget]=useState(null);
  const [acctTarget,setAcctTarget]=useState(null);
  const fmt=n=>n.toLocaleString("vi-VN")+"đ";
  const reload=()=>api.adminUsers().then(setUsers).catch(()=>{});
  useEffect(()=>{ reload(); const t=setInterval(reload,5000); return ()=>clearInterval(t); },[]);
  const drivers=users.filter(u=>{
    if(!q.trim())return true;
    const s=q.toLowerCase();
    return (u.phone||"").toLowerCase().includes(s)||(u.name||"").toLowerCase().includes(s);
  });
  const ADMIN_PG=25;
  const pagedDrivers=drivers.slice((adminPage-1)*ADMIN_PG,adminPage*ADMIN_PG);
  const totalAdminPgs=Math.ceil(Math.max(drivers.length,1)/ADMIN_PG);
  const stat=users.filter(u=>u.role!=="admin");
  const pending=stat.filter(u=>u.status==="pending").length;
  const active=stat.filter(u=>u.status==="active").length;
  const expired=stat.filter(u=>u.status==="expired").length;
  const rev=stat.filter(u=>u.status==="active").reduce((s,u)=>s+(u.plan==="Tháng"?month:week),0);
  const approve=async(id,plan)=>{await api.approve(id,plan,plan==="Tháng"?month:week);reload();};
  const renew=async(id)=>{const u=users.find(x=>x.id===id);await api.renew(id,u?.plan==="Tháng"?month:week);reload();};
  const ban=async(id)=>{await api.ban(id);reload();};
  const setRole=async(id,role)=>{
    const verb=role==="admin"?"CẤP quyền admin cho":"GỠ quyền admin của";
    if(!confirm(`${verb} tài khoản này?`))return;
    try{await api.setRole(id,role);reload();}catch(e){alert(e.message);}
  };
  const TABS=[
    {key:"users",icon:Users,label:"Tài khoản"},
    {key:"stats",icon:TrendingUp,label:"Thống kê"},
    {key:"settings",icon:Settings,label:"Cài đặt"},
  ];
  return (
    <div style={{display:"flex",height:"100dvh",overflow:"hidden",background:"var(--bg)",color:"var(--ink)",fontFamily:"var(--body)"}}>
      {/* Sidebar */}
      <aside style={{width:220,flexShrink:0,background:"var(--card)",borderRight:"1px solid var(--line)",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"20px 18px 14px",borderBottom:"1px solid var(--line)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <div style={{width:30,height:30,borderRadius:9,background:"linear-gradient(135deg,#a78bfa,#7c3aed)",display:"grid",placeItems:"center",flexShrink:0}}><Shield size={16} color="#fff"/></div>
            <div style={{fontFamily:"var(--display)",fontWeight:800,fontSize:17}}>Admin</div>
          </div>
          <div style={{fontSize:12,color:"var(--ink-dim)",paddingLeft:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{me?.name||me?.phone}</div>
        </div>
        <div style={{padding:"12px 14px",borderBottom:"1px solid var(--line)"}}>
          {[{label:"Chờ duyệt",value:pending,color:"#f59e0b"},{label:"Hoạt động",value:active,color:"#22c55e"},{label:"Hết hạn",value:expired,color:"#94a3b8"}].map(s=>(
            <div key={s.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 6px",borderRadius:7,marginBottom:2}}>
              <span style={{fontSize:12,color:"var(--ink-dim)"}}>{s.label}</span>
              <span style={{fontWeight:800,fontSize:15,color:s.color}}>{s.value}</span>
            </div>
          ))}
          <div style={{marginTop:6,padding:"7px 8px",background:"rgba(52,211,153,.08)",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:"var(--ink-dim)"}}>Doanh thu kỳ</span>
            <span style={{fontWeight:800,fontSize:13,color:"var(--accent)"}}>{fmt(rev)}</span>
          </div>
        </div>
        <nav style={{flex:1,padding:10,overflowY:"auto"}}>
          {TABS.map(t=>{const Icon=t.icon;const on=adminTab===t.key;return(
            <button key={t.key} onClick={()=>setAdminTab(t.key)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",marginBottom:2,background:on?"rgba(52,211,153,.12)":"transparent",color:on?"var(--accent)":"var(--ink-dim)",fontWeight:on?700:400,fontSize:14}}>
              <Icon size={17} strokeWidth={on?2.5:1.8}/>
              {t.label}
              {t.key==="users"&&pending>0&&<span style={{marginLeft:"auto",minWidth:18,height:18,borderRadius:99,background:"#f59e0b",fontSize:10,fontWeight:800,color:"#000",display:"grid",placeItems:"center",padding:"0 4px"}}>{pending>9?"9+":pending}</span>}
            </button>
          );})}
        </nav>
        <div style={{padding:"12px 18px",borderTop:"1px solid var(--line)"}}>
          <button onClick={onLogout} style={{display:"flex",alignItems:"center",gap:7,color:"var(--ink-dim)",background:"none",border:"none",cursor:"pointer",fontSize:13,width:"100%",padding:"6px 4px"}}>
            <LogOut size={14}/> Đăng xuất
          </button>
        </div>
      </aside>
      {/* Main content */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <header style={{padding:"14px 24px",borderBottom:"1px solid var(--line)",background:"var(--bg)",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <span style={{fontWeight:700,fontSize:16,flex:1}}>{TABS.find(t=>t.key===adminTab)?.label}</span>
          <button onClick={reload} title="Tải lại" style={{background:"none",border:"none",cursor:"pointer",color:"var(--ink-dim)",padding:6,borderRadius:8,display:"flex"}}><RefreshCw size={15}/></button>
        </header>
        <div style={{flex:1,overflowY:"auto"}}>
          {adminTab==="stats"&&<div style={{padding:"20px 24px"}}><AdminStatsTab/></div>}
          {adminTab==="settings"&&<div style={{padding:"20px 24px",maxWidth:560}}><AdminSettingsTab/></div>}
          {adminTab==="users"&&(
            <div style={{padding:"20px 24px"}}>
              <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:14,padding:"16px 20px",marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:7,color:"var(--ink-dim)",fontSize:13,fontWeight:700,marginBottom:12}}><CreditCard size={15} color="var(--accent)"/> Cấu hình giá gói</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>
                  <PriceInput label="Gói Tuần (7 ngày)" value={week} onChange={setWeek}/>
                  <PriceInput label="Gói Tháng (30 ngày)" value={month} onChange={setMonth}/>
                </div>
              </div>
              <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:16,overflow:"hidden"}}>
                <div style={{padding:"14px 18px",borderBottom:"1px solid var(--line)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <div style={{fontWeight:700,fontSize:15}}>Tài khoản</div>
                  <span style={{fontSize:12.5,color:"var(--ink-dim)"}}>{drivers.length}/{users.length}{pending>0&&<span style={{color:"#f59e0b"}}> · {pending} chờ duyệt</span>}</span>
                  <div style={{position:"relative",marginLeft:"auto",minWidth:240}}>
                    <Search size={15} style={{position:"absolute",left:11,top:9,color:"var(--ink-dim)"}}/>
                    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm theo SĐT hoặc tên…" style={{width:"100%",padding:"8px 11px 8px 34px",borderRadius:9,background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)",fontSize:13.5,outline:"none"}}/>
                    {q&&<button onClick={()=>setQ("")} style={{position:"absolute",right:9,top:8,background:"none",border:"none",color:"var(--ink-dim)",cursor:"pointer"}}><X size={15}/></button>}
                  </div>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13.5,minWidth:820}}>
                    <thead><tr style={{color:"var(--ink-dim)",textAlign:"left",fontSize:11.5,textTransform:"uppercase",letterSpacing:".05em"}}><th style={th}>Tài khoản</th><th style={th}>SĐT</th><th style={th}>Vai trò</th><th style={th}>Gói</th><th style={th}>Zalo</th><th style={th}>Còn lại</th><th style={th}>Trạng thái</th><th style={{...th,textAlign:"right"}}>Thao tác</th></tr></thead>
                    <tbody>{drivers.length===0&&<tr><td colSpan={8} style={{...td,textAlign:"center",color:"var(--ink-dim)"}}>{q?`Không tìm thấy "${q}"`:"Chưa có tài khoản nào."}</td></tr>}
                    {pagedDrivers.map(u=>{const isAdm=u.role==="admin";return(
                      <tr key={u.id} style={{borderTop:"1px solid var(--line)",background:u.status==="pending"?"rgba(245,158,11,.05)":isAdm?"rgba(167,139,250,.05)":"transparent"}}>
                        <td style={{...td,fontWeight:600}}>{u.name}</td><td style={{...td,color:"var(--ink-dim)"}}>{u.phone}</td>
                        <td style={td}>{isAdm?<span style={{display:"inline-flex",alignItems:"center",gap:4,color:"#a78bfa",fontWeight:700,fontSize:12}}><Shield size={12}/> Admin</span>:u.role==="accountant"?<span style={{display:"inline-flex",alignItems:"center",gap:4,color:"#f59e0b",fontWeight:700,fontSize:12}}><Users size={12}/> Kế Toán</span>:<span style={{color:"var(--ink-dim)",fontSize:12.5}}>Tài xế</span>}</td>
                        <td style={td}>{isAdm?"—":(u.plan||"—")}</td>
                        <td style={td}>{u.hasZalo?<span style={{color:"#34d399"}}>✓</span>:<span style={{color:"var(--ink-dim)"}}>—</span>}</td>
                        <td style={td}>{!isAdm&&u.status==="active"?<span style={{color:u.daysLeft<=3?"#f59e0b":"var(--ink)"}}>{u.daysLeft} ngày</span>:<span style={{color:"var(--ink-dim)"}}>—</span>}</td>
                        <td style={td}><StatusPill status={u.status}/></td>
                        <td style={{...td,textAlign:"right",whiteSpace:"nowrap"}}>
                          <button onClick={()=>setResetTarget(u)} style={miniBtn("#8b5cf6")}><Lock size={13}/> Reset MK</button>
                          {isAdm ? (
                            <button onClick={()=>setRole(u.id,"driver")} style={miniBtn("#f59e0b")}><Shield size={13}/> Gỡ admin</button>
                          ) : u.role==="accountant" ? (<>
                            <button onClick={()=>setAcctTarget(u)} style={miniBtn("#f59e0b")}><Users size={13}/> Nhóm KT</button>
                            <button onClick={()=>setRole(u.id,"driver")} style={miniBtn("#94a3b8")}><Users size={13}/> Gỡ KT</button>
                            <button onClick={()=>ban(u.id)} style={miniBtn(u.status==="banned"?"#3b82f6":"#ef4444")}><Ban size={13}/> {u.status==="banned"?"Mở":"Khoá"}</button>
                          </>) : u.status==="pending" ? (<>
                            <button onClick={()=>approve(u.id,"Tuần")} style={miniBtn("#3b82f6")}>Duyệt · Tuần</button>
                            <button onClick={()=>approve(u.id,"Tháng")} style={miniBtn("#22c55e")}>Duyệt · Tháng</button>
                          </>) : (<>
                            <button onClick={()=>setRole(u.id,"admin")} style={miniBtn("#a78bfa")}><Shield size={13}/> Cấp admin</button>
                            <button onClick={()=>setAcctTarget(u)} style={miniBtn("#f59e0b")}><Users size={13}/> Cấp KT</button>
                            <button onClick={()=>renew(u.id)} style={miniBtn("#22c55e")}><RefreshCw size={13}/> Gia hạn</button>
                            <button onClick={()=>ban(u.id)} style={miniBtn(u.status==="banned"?"#3b82f6":"#ef4444")}><Ban size={13}/> {u.status==="banned"?"Mở":"Khoá"}</button>
                          </>)}
                        </td>
                      </tr>
                    );})}</tbody>
                  </table>
                </div>
                {totalAdminPgs>1&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"14px 0 8px"}}>
                  <button onClick={()=>setAdminPage(p=>Math.max(1,p-1))} disabled={adminPage===1} style={{padding:"6px 16px",borderRadius:8,border:"1px solid var(--line)",background:"transparent",color:adminPage===1?"var(--ink-dim)":"var(--ink)",cursor:adminPage===1?"default":"pointer",fontSize:13,fontWeight:700}}>← Trước</button>
                  <span style={{fontSize:13,color:"var(--ink-dim)",minWidth:110,textAlign:"center"}}>Trang {adminPage} / {totalAdminPgs} · {drivers.length} TK</span>
                  <button onClick={()=>setAdminPage(p=>Math.min(totalAdminPgs,p+1))} disabled={adminPage===totalAdminPgs} style={{padding:"6px 16px",borderRadius:8,border:"1px solid var(--line)",background:"transparent",color:adminPage===totalAdminPgs?"var(--ink-dim)":"var(--ink)",cursor:adminPage===totalAdminPgs?"default":"pointer",fontSize:13,fontWeight:700}}>Sau →</button>
                </div>}
              </div>
            </div>
          )}
        </div>
      </div>
      {resetTarget&&<ResetPwdModal target={resetTarget} onClose={()=>setResetTarget(null)} onDone={reload}/>}
      {acctTarget&&<SetAccountantModal target={acctTarget} onClose={()=>setAcctTarget(null)} onDone={()=>{setAcctTarget(null);reload();}}/>}
    </div>
  );
}
function PriceInput({label,value,onChange}){return(<div><div style={{fontSize:12.5,color:"var(--ink-dim)",marginBottom:6,fontWeight:600}}>{label}</div><div style={{position:"relative"}}><input type="number" value={value} onChange={e=>onChange(Number(e.target.value))} style={{width:"100%",padding:"10px 40px 10px 13px",borderRadius:10,background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)",fontSize:15,fontWeight:700,outline:"none",fontFamily:"var(--display)"}}/><span style={{position:"absolute",right:13,top:11,color:"var(--ink-dim)",fontSize:14}}>đ</span></div></div>);}
function StatusPill({status}){const m={active:{t:"Hoạt động",c:"#34d399"},pending:{t:"Chờ duyệt",c:"#f59e0b"},expired:{t:"Hết hạn",c:"#94a3b8"},banned:{t:"Đã khoá",c:"#f87171"}}[status]||{t:status,c:"#94a3b8"};return(<span style={{display:"inline-block",padding:"3px 10px",borderRadius:99,fontSize:12,fontWeight:700,color:m.c,background:m.c+"1f",border:"1px solid "+m.c+"33"}}>{m.t}</span>);}

/* ===== Admin: Reset mật khẩu user ===== */
function ResetPwdModal({ target, onClose, onDone }) {
  const [p1,setP1]=useState(""); const [p2,setP2]=useState("");
  const [err,setErr]=useState(""); const [ok,setOk]=useState(false); const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(p1.length<3){setErr("Mật khẩu phải từ 3 ký tự.");return;}
    if(p1!==p2){setErr("Mật khẩu xác nhận không khớp.");return;}
    setBusy(true);setErr("");
    try{await api.resetPassword(target.id,p1);setOk(true);onDone?.();setTimeout(onClose,1200);}
    catch(e){setErr(e.message);}finally{setBusy(false);}
  };
  useEffect(()=>{const k=e=>e.key==="Escape"&&onClose();window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k);},[onClose]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,display:"grid",placeItems:"center",background:"rgba(3,6,14,.72)",backdropFilter:"blur(4px)",padding:18}} className="overlay-in">
      <div onClick={e=>e.stopPropagation()} className="modal-in" style={{width:"100%",maxWidth:400,background:"var(--card)",borderRadius:20,border:"1px solid var(--line)",padding:"22px 20px",boxShadow:"0 24px 70px rgba(0,0,0,.6)"}}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:4}}>
          <Lock size={18} color="#8b5cf6"/><div style={{fontWeight:800,fontSize:17,fontFamily:"var(--display)"}}>Reset mật khẩu</div>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--ink-dim)",cursor:"pointer"}}><X size={18}/></button>
        </div>
        <div style={{fontSize:13,color:"var(--ink-dim)",marginBottom:16}}>Tài khoản: <b style={{color:"var(--ink)"}}>{target.name}</b> ({target.phone})</div>
        {ok?<div style={{textAlign:"center",padding:"20px 0",color:"#34d399"}}><CheckCircle2 size={40}/><div style={{fontWeight:800,marginTop:8}}>Đã đặt lại mật khẩu!</div></div>:<>
          <Field label="Mật khẩu mới" icon={Lock}><input type="password" value={p1} onChange={e=>setP1(e.target.value)} style={inputStyle} autoFocus/></Field>
          <Field label="Xác nhận mật khẩu mới" icon={Lock}><input type="password" value={p2} onChange={e=>setP2(e.target.value)} style={{...inputStyle,borderColor:p2&&p1!==p2?"#ef4444":(p2&&p1===p2?"#34d399":"var(--line)")}} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
          {err&&<ErrBox>{err}</ErrBox>}
          <button onClick={submit} disabled={busy} style={{...primaryBtn,background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",boxShadow:"0 6px 18px rgba(139,92,246,.3)",opacity:busy?0.6:1}}>{busy?"ĐANG ĐẶT LẠI…":"ĐẶT LẠI MẬT KHẨU"}</button>
        </>}
      </div>
    </div>
  );
}

/* ===== Admin: Cấp / sửa quyền kế toán ===== */
function SetAccountantModal({target,onClose,onDone}){
  const isKT=target.role==="accountant";
  const [limit,setLimit]=useState(String(target.group_limit||3));
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");
  const inputSt={width:"100%",boxSizing:"border-box",padding:"9px 12px",borderRadius:10,border:"1px solid var(--line)",background:"rgba(0,0,0,.2)",color:"var(--ink)",fontSize:13,outline:"none"};
  const save=async()=>{
    const n=parseInt(limit);
    if(!n||n<1){setErr("Số nhóm tối thiểu là 1");return;}
    setSaving(true);setErr("");
    try{await api.setAccountant(target.id,n);onDone();}
    catch(e){setErr(e.message);setSaving(false);}
  };
  const revoke=async()=>{
    if(!confirm("Gỡ quyền kế toán của tài khoản này?"))return;
    setSaving(true);
    try{await api.setRole(target.id,"driver");onDone();}
    catch(e){setErr(e.message);setSaving(false);}
  };
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,display:"grid",placeItems:"center",background:"rgba(3,6,14,.72)",padding:18}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:360,background:"var(--card)",borderRadius:18,padding:20,border:"1px solid var(--line)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <Users size={17} color="#f59e0b"/>
          <span style={{fontWeight:700,fontSize:15}}>{isKT?"Sửa":"Cấp"} quyền Kế Toán</span>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"var(--ink-dim)"}}><X size={18}/></button>
        </div>
        <div style={{background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.2)",borderRadius:10,padding:"10px 12px",marginBottom:16,fontSize:13}}>
          <span style={{fontWeight:700}}>{target.name||target.phone}</span>
          {isKT&&<span style={{marginLeft:8,fontSize:11,color:"#f59e0b",fontWeight:700,background:"rgba(245,158,11,.15)",padding:"2px 7px",borderRadius:99}}>Kế Toán</span>}
        </div>
        <label style={{display:"block",fontSize:12,color:"var(--ink-dim)",marginBottom:5}}>
          Số nhóm tối đa được quản lý
        </label>
        <input type="number" min="1" max="50" value={limit} onChange={e=>setLimit(e.target.value)}
          style={{...inputSt,marginBottom:4}}/>
        <div style={{fontSize:11,color:"var(--ink-dim)",marginBottom:16}}>
          Kế toán tự chọn nhóm trong ứng dụng Kế Toán (giới hạn số nhóm này).
        </div>
        {err&&<div style={{color:"#f87171",fontSize:12,marginBottom:10}}>{err}</div>}
        <div style={{display:"flex",gap:8}}>
          {isKT&&<button onClick={revoke} disabled={saving} style={{flex:"0 0 auto",padding:"10px 14px",borderRadius:12,border:"none",cursor:saving?"default":"pointer",fontWeight:700,fontSize:13,background:"rgba(248,113,113,.12)",color:"#f87171"}}>Gỡ quyền</button>}
          <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:12,border:"none",cursor:saving?"default":"pointer",fontWeight:800,fontSize:14,background:"rgba(245,158,11,.2)",color:"#f59e0b"}}>
            {saving?"Đang lưu…":isKT?"Cập nhật":"Cấp quyền Kế Toán"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== Admin: Thống kê doanh thu & user ===== */
const STATUS_LABELS={active:"Hoạt động",pending:"Chờ duyệt",expired:"Hết hạn",banned:"Đã khoá"};
const STATUS_COLORS={active:"#34d399",pending:"#f59e0b",expired:"#94a3b8",banned:"#f87171"};

function AdminStatsTab() {
  const todayStr=()=>new Date().toISOString().slice(0,10);
  const daysAgoStr=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
  const [from,setFrom]=useState(daysAgoStr(29));
  const [to,setTo]=useState(todayStr());
  const [revData,setRevData]=useState(null);
  const [userData,setUserData]=useState(null);
  const [usrStatus,setUsrStatus]=useState("all");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const toMs=s=>new Date(s+"T00:00:00+07:00").getTime();
  const toEndMs=s=>new Date(s+"T23:59:59+07:00").getTime();

  const load=async()=>{
    setLoading(true);setErr("");
    try{
      const [rev,usr]=await Promise.all([
        api.revenueStats(toMs(from),toEndMs(to)),
        api.userStats(toMs(from),toEndMs(to),usrStatus),
      ]);
      setRevData(rev);setUserData(usr);
    }catch(e){setErr(e.message);}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[]);

  const totalRev=(revData||[]).reduce((s,r)=>s+Number(r.total),0);
  const totalTx=(revData||[]).reduce((s,r)=>s+Number(r.count),0);
  const totalUsr=(userData||[]).reduce((s,r)=>s+Number(r.count),0);
  const fmt=n=>Number(n).toLocaleString("vi-VN")+"đ";

  return (
    <div>
      {/* Bộ lọc ngày */}
      <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:16,padding:16,marginBottom:20,display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:12,color:"var(--ink-dim)",fontWeight:600,marginBottom:5}}>Từ ngày</div>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} max={to} style={{padding:"8px 11px",borderRadius:9,background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)",fontSize:14,outline:"none"}}/>
        </div>
        <div>
          <div style={{fontSize:12,color:"var(--ink-dim)",fontWeight:600,marginBottom:5}}>Đến ngày</div>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} min={from} max={todayStr()} style={{padding:"8px 11px",borderRadius:9,background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)",fontSize:14,outline:"none"}}/>
        </div>
        <button onClick={load} disabled={loading} style={{padding:"9px 20px",borderRadius:9,border:"none",background:"var(--accent)",color:"#04121a",fontWeight:800,fontSize:14,cursor:"pointer",opacity:loading?0.6:1}}>{loading?"Đang tải…":"Tải dữ liệu"}</button>
        {err&&<span style={{fontSize:13,color:"#f87171"}}>{err}</span>}
      </div>

      {/* Doanh thu */}
      <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:16,overflow:"hidden",marginBottom:20}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid var(--line)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{fontWeight:700,fontSize:15,display:"flex",alignItems:"center",gap:7}}><TrendingUp size={17} color="var(--accent)"/> Doanh thu</div>
          {revData&&<>
            <span style={{fontSize:12.5,color:"var(--ink-dim)"}}>{totalTx} giao dịch</span>
            <span style={{marginLeft:"auto",fontFamily:"var(--display)",fontWeight:800,fontSize:18,color:"#34d399"}}>{fmt(totalRev)}</span>
          </>}
        </div>
        {!revData&&!loading&&<div style={{padding:"30px",textAlign:"center",color:"var(--ink-dim)",fontSize:13}}>Chọn khoảng thời gian và bấm "Tải dữ liệu".</div>}
        {revData&&revData.length===0&&<div style={{padding:"30px",textAlign:"center",color:"var(--ink-dim)",fontSize:13}}>Không có giao dịch trong khoảng thời gian này.</div>}
        {revData&&revData.length>0&&(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13.5}}>
              <thead><tr style={{color:"var(--ink-dim)",fontSize:11.5,textTransform:"uppercase",letterSpacing:".05em",textAlign:"left"}}>
                <th style={th}>Ngày</th><th style={th}>Loại</th><th style={th}>Số GD</th><th style={{...th,textAlign:"right"}}>Doanh thu</th>
              </tr></thead>
              <tbody>{revData.map((r,i)=>(
                <tr key={i} style={{borderTop:"1px solid var(--line)"}}>
                  <td style={td}>{r.day}</td>
                  <td style={td}><span style={{fontWeight:700,color:r.note==="approve"?"#34d399":"#60a5fa"}}>{r.note==="approve"?"Duyệt mới":"Gia hạn"}</span></td>
                  <td style={td}>{r.count}</td>
                  <td style={{...td,textAlign:"right",fontWeight:700,color:"#34d399",fontFamily:"var(--display)"}}>{fmt(r.total)}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr style={{borderTop:"2px solid var(--line)",background:"rgba(255,255,255,.03)"}}>
                <td style={{...td,fontWeight:700}} colSpan={2}>Tổng</td>
                <td style={{...td,fontWeight:700}}>{totalTx}</td>
                <td style={{...td,textAlign:"right",fontWeight:800,color:"#34d399",fontFamily:"var(--display)",fontSize:16}}>{fmt(totalRev)}</td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Tài khoản mới */}
      <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:16,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid var(--line)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{fontWeight:700,fontSize:15,display:"flex",alignItems:"center",gap:7}}><Users size={17} color="var(--accent)"/> Tài khoản đăng ký</div>
          {userData&&<span style={{fontSize:12.5,color:"var(--ink-dim)"}}>{totalUsr} tài xế</span>}
          <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
            {["all","active","pending","expired","banned"].map(s=>(
              <button key={s} onClick={()=>{setUsrStatus(s);}} style={{padding:"5px 12px",borderRadius:99,border:"1px solid "+(usrStatus===s?(STATUS_COLORS[s]||"var(--accent)"):"var(--line)"),background:usrStatus===s?((STATUS_COLORS[s]||"var(--accent)")+"1f"):"transparent",color:usrStatus===s?(STATUS_COLORS[s]||"var(--accent)"):"var(--ink-dim)",fontWeight:700,fontSize:12,cursor:"pointer"}} >{s==="all"?"Tất cả":(STATUS_LABELS[s]||s)}</button>
            ))}
          </div>
        </div>
        {!userData&&!loading&&<div style={{padding:"30px",textAlign:"center",color:"var(--ink-dim)",fontSize:13}}>Chọn khoảng thời gian và bấm "Tải dữ liệu".</div>}
        {userData&&userData.length===0&&<div style={{padding:"30px",textAlign:"center",color:"var(--ink-dim)",fontSize:13}}>Không có tài khoản nào đăng ký trong khoảng thời gian này.</div>}
        {userData&&userData.length>0&&(
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13.5}}>
              <thead><tr style={{color:"var(--ink-dim)",fontSize:11.5,textTransform:"uppercase",letterSpacing:".05em",textAlign:"left"}}>
                <th style={th}>Ngày đăng ký</th><th style={th}>Trạng thái</th><th style={{...th,textAlign:"right"}}>Số tài khoản</th>
              </tr></thead>
              <tbody>{userData.map((r,i)=>{const c=STATUS_COLORS[r.status]||"#94a3b8";return(
                <tr key={i} style={{borderTop:"1px solid var(--line)"}}>
                  <td style={td}>{r.day}</td>
                  <td style={td}><span style={{display:"inline-block",padding:"3px 10px",borderRadius:99,fontSize:12,fontWeight:700,color:c,background:c+"1f",border:"1px solid "+c+"33"}}>{STATUS_LABELS[r.status]||r.status}</span></td>
                  <td style={{...td,textAlign:"right",fontWeight:700}}>{r.count}</td>
                </tr>
              );})}
              </tbody>
              <tfoot><tr style={{borderTop:"2px solid var(--line)",background:"rgba(255,255,255,.03)"}}>
                <td style={{...td,fontWeight:700}} colSpan={2}>Tổng</td>
                <td style={{...td,textAlign:"right",fontWeight:800,fontSize:16}}>{totalUsr}</td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== shared UI ===== */
function Field({label,icon:Icon,children}){return(<div style={{marginBottom:14}}><div style={{fontSize:12.5,color:"var(--ink-dim)",fontWeight:600,marginBottom:6,display:"flex",alignItems:"center",gap:5}}>{Icon&&<Icon size={13}/>} {label}</div>{children}</div>);}
function ErrBox({children}){return(<div style={{display:"flex",alignItems:"center",gap:7,padding:"9px 12px",borderRadius:10,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",color:"#f87171",fontSize:13,fontWeight:600,marginBottom:14}}><AlertTriangle size={15}/> {children}</div>);}

const inputStyle={width:"100%",padding:"11px 13px",borderRadius:11,background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)",fontSize:14.5,outline:"none",fontFamily:"var(--body)"};
const primaryBtn={width:"100%",padding:"13px",borderRadius:12,border:"none",cursor:"pointer",fontWeight:800,fontSize:15,fontFamily:"var(--display)",letterSpacing:".02em",background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#04140a",boxShadow:"0 6px 18px rgba(34,197,94,.3)",marginTop:4};
const th={padding:"10px 16px",fontWeight:700};const td={padding:"12px 16px"};
const miniBtn=color=>({display:"inline-flex",alignItems:"center",gap:4,padding:"5px 10px",marginLeft:6,borderRadius:8,border:"1px solid "+color+"44",background:color+"18",color,fontSize:12.5,fontWeight:700,cursor:"pointer"});

function StyleVars(){return(<style>{`
  :root{--bg:#070b16;--card:#0f1525;--line:#1e2740;--ink:#e8edf7;--ink-dim:#8794ad;--accent:#34d399;--display:'Plus Jakarta Sans',system-ui,sans-serif;--body:'Inter',system-ui,sans-serif;}
  *{box-sizing:border-box;}body{margin:0;background:#070b16;}
  button,input,select,textarea{color:inherit;font-family:inherit;}
  button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
  .overlay-in{animation:fadeIn .18s ease;}@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
  .modal-in{animation:modalIn .28s cubic-bezier(.2,.9,.3,1.2);}@keyframes modalIn{from{opacity:0;transform:scale(.95) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}
  table tr:hover td{background:rgba(255,255,255,.02);}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;}}
`}</style>);}
