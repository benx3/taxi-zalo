import React, { useState, useEffect } from "react";
import {
  Shield, CreditCard, Ban, RefreshCw, X, User, TrendingUp,
  Users, CheckCircle2, Lock, AlertTriangle, LogOut, Settings,
  Search, Phone, Mic, Eye, EyeOff, GitMerge, UserPlus, Activity, Bot,
  Database, Trash2, Menu, Award
} from "lucide-react";
import { api, getToken, setToken } from "./api.js";

export default function App() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Driver app redirect admin/accountant sang đây kèm #token= trong hash
    const hashToken = window.location.hash.match(/#token=([^&]+)/)?.[1];
    if (hashToken) {
      setToken(hashToken);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
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

/* ===== Admin: Quản lý dữ liệu hệ thống ===== */
const DATA_TABLES = [
  { key: 'barem_trip_log',     label: 'Log cuốc xe',       note: 'Cache tạm cuốc xe',              recommend: 3  },
  { key: 'barem_claim_log',    label: 'Log claim',          note: 'Cache tạm claim tài xế',         recommend: 3  },
  { key: 'barem_msg_refs',     label: 'Tra cứu tin nhắn',  note: 'Index hủy/điều chỉnh Section E', recommend: 7  },
  { key: 'point_transactions', label: 'Giao dịch điểm',    note: 'Lịch sử tính điểm barem',        recommend: 30 },
  { key: 'raw_messages',       label: 'Tin nhắn thô',      note: 'Tin nhắn Zalo lưu debug',        recommend: 3  },
  { key: 'saved_trips',        label: 'Cuốc đã lưu',       note: 'Lịch sử cuốc xe tài xế',        recommend: 30 },
];
function DataManagementSection({ flash, cardStyle }) {
  const [stats, setStats] = useState(null);
  const [purging, setPurging] = useState(null);
  const [confirmPurge, setConfirmPurge] = useState(null);

  const loadStats = () => api.getDataStats().then(setStats).catch(() => setStats({}));
  useEffect(() => { loadStats(); }, []);

  const doPurge = async () => {
    const { table, days } = confirmPurge;
    setConfirmPurge(null);
    setPurging(table);
    try {
      const r = await api.purgeTable(table, days);
      flash(true, `Đã xóa ${r.deleted.toLocaleString()} dòng từ "${DATA_TABLES.find(t => t.key === table)?.label}"`);
      loadStats();
    } catch (e) { flash(false, e.message || 'Lỗi xóa'); }
    finally { setPurging(null); }
  };

  return (
    <div style={cardStyle}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
        <Database size={17} color="#94a3b8"/>
        <span style={{fontWeight:700,fontSize:15}}>Dữ liệu hệ thống</span>
        <button onClick={loadStats} style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:'var(--ink-dim)',padding:4}} title="Tải lại">
          <RefreshCw size={14}/>
        </button>
      </div>

      {confirmPurge && (
        <div style={{background:'rgba(248,113,113,.08)',border:'1px solid #f8717133',borderRadius:10,padding:12,marginBottom:12}}>
          <p style={{margin:'0 0 10px',fontSize:13,color:'var(--ink)'}}>
            Xóa dữ liệu cũ hơn <b>{confirmPurge.days} ngày</b> từ bảng <b>"{DATA_TABLES.find(t=>t.key===confirmPurge.table)?.label}"</b>?
          </p>
          <div style={{display:'flex',gap:8}}>
            <button onClick={doPurge} style={{padding:'6px 14px',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:12,background:'rgba(248,113,113,.15)',color:'#f87171',border:'1px solid #f8717144'}}>Xóa</button>
            <button onClick={()=>setConfirmPurge(null)} style={{padding:'6px 14px',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:12,background:'transparent',color:'var(--ink-dim)',border:'1px solid var(--line)'}}>Hủy</button>
          </div>
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {DATA_TABLES.map(t => {
          const s = stats?.[t.key];
          const busy = purging === t.key;
          return (
            <div key={t.key} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:10,background:'rgba(0,0,0,.15)'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13}}>{t.label}</div>
                <div style={{fontSize:11,color:'var(--ink-dim)'}}>{t.note} · khuyến nghị ≤{t.recommend} ngày</div>
              </div>
              <div style={{textAlign:'right',minWidth:72}}>
                {stats === null
                  ? <span style={{fontSize:12,color:'var(--ink-dim)'}}>…</span>
                  : <>
                      <div style={{fontSize:13,fontWeight:700}}>{(s?.count ?? 0).toLocaleString()}</div>
                      {s?.oldestDays != null && <div style={{fontSize:11,color:'var(--ink-dim)'}}>cũ: {s.oldestDays}d</div>}
                    </>
                }
              </div>
              <button
                onClick={() => !busy && !confirmPurge && setConfirmPurge({ table: t.key, days: t.recommend })}
                disabled={busy || !!confirmPurge}
                title={`Xóa dữ liệu cũ hơn ${t.recommend} ngày`}
                style={{padding:'5px 10px',borderRadius:8,cursor:busy||confirmPurge?'default':'pointer',fontWeight:700,fontSize:12,
                  background:'rgba(248,113,113,.08)',color:'#f87171',border:'1px solid #f8717133',whiteSpace:'nowrap',
                  display:'flex',alignItems:'center',gap:5}}
              >
                <Trash2 size={11}/>
                {busy ? '…' : `>${t.recommend}d`}
              </button>
            </div>
          );
        })}
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
  const [groqKey, setGroqKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [showGroq, setShowGroq] = useState(false);
  const [showGemini, setShowGemini] = useState(false);

  const load = () => api.getSettings().then(s => { setSettings(s); setFptKey(""); setGroqKey(""); setGeminiKey(""); }).catch(() => {});
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

  const setParseMode = async (mode) => {
    setSaving("ai");
    try {
      await api.setSetting("parse_mode", mode);
      setSettings(s => ({ ...s, parse_mode: mode }));
      const labels = { regex: "Chỉ Regex", both: "Regex + AI", ai: "Chỉ AI" };
      flash(true, `Chế độ parse: ${labels[mode]}`);
    } catch (e) { flash(false, e.message || "Lỗi lưu"); }
    finally { setSaving(null); }
  };

  const saveGroqKey = async () => {
    setSaving("groq");
    try {
      const r = await api.setSetting("groq_api_key", groqKey.trim());
      setSettings(s => ({ ...s, groq_key_set: r.groq_key_set, groq_key_hint: r.groq_key_hint }));
      setGroqKey("");
      flash(true, groqKey.trim() ? "Đã lưu Groq API Key." : "Đã xoá Groq API Key.");
    } catch (e) { flash(false, e.message || "Lỗi lưu"); }
    finally { setSaving(null); }
  };

  const saveGeminiKey = async () => {
    setSaving("gemini");
    try {
      const r = await api.setSetting("gemini_api_key", geminiKey.trim());
      setSettings(s => ({ ...s, gemini_key_set: r.gemini_key_set, gemini_key_hint: r.gemini_key_hint }));
      setGeminiKey("");
      flash(true, geminiKey.trim() ? "Đã lưu Gemini API Key." : "Đã xoá Gemini API Key.");
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

      {/* AI Parse */}
      <div style={cardStyle}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <Bot size={17} color="#f59e0b"/>
          <span style={{fontWeight:700,fontSize:15}}>Chế độ parse cuốc xe</span>
        </div>
        {settings === null ? <div style={{color:"var(--ink-dim)",fontSize:13,marginBottom:14}}>Đang tải…</div> : (() => {
          const cur = settings.parse_mode || "regex";
          const modes = [
            { key:"regex", label:"Chỉ Regex", desc:"Nhanh, miễn phí, không cần API key", color:"#60a5fa" },
            { key:"both",  label:"Regex + AI", desc:"Regex trước, AI bổ sung khi thiếu route", color:"#f59e0b" },
            { key:"ai",    label:"Chỉ AI",     desc:"Bỏ qua regex, AI xử lý toàn bộ", color:"#a78bfa" },
          ];
          return (
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {modes.map(m => {
                const sel = cur === m.key;
                return (
                  <button key={m.key} onClick={()=>!saving&&setParseMode(m.key)} style={{
                    flex:1,padding:"10px 8px",borderRadius:12,cursor:saving?"default":"pointer",
                    border:"2px solid "+(sel?m.color:"var(--line)"),
                    background:sel?`${m.color}18`:"transparent",
                    textAlign:"center",transition:"all .15s",
                  }}>
                    <div style={{fontWeight:800,fontSize:13,color:sel?m.color:"var(--ink-dim)",marginBottom:3}}>{m.label}</div>
                    <div style={{fontSize:11,color:"var(--ink-dim)",lineHeight:1.4}}>{m.desc}</div>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Groq Key */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
            <span style={{fontSize:13,fontWeight:700,color:"var(--ink-dim)"}}>Groq API Key <span style={{fontWeight:400,fontSize:11}}>(ưu tiên · miễn phí)</span></span>
            {settings?.groq_key_set && <span style={{fontSize:12,color:"#34d399",fontWeight:700,display:"flex",alignItems:"center",gap:4}}><CheckCircle2 size={12}/> {settings.groq_key_hint}</span>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <div style={{flex:1,position:"relative"}}>
              <input type={showGroq?"text":"password"} value={groqKey} onChange={e=>setGroqKey(e.target.value)}
                placeholder={settings?.groq_key_set?"Nhập key mới để thay thế…":"Nhập Groq API Key…"}
                style={{width:"100%",boxSizing:"border-box",padding:"10px 38px 10px 12px",borderRadius:10,border:"1px solid var(--line)",background:"rgba(0,0,0,.2)",color:"var(--ink)",fontSize:13,outline:"none"}}
                onKeyDown={e=>e.key==="Enter"&&groqKey.trim()&&saveGroqKey()}/>
              <button onClick={()=>setShowGroq(p=>!p)} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--ink-dim)",padding:2}}>
                {showGroq?<EyeOff size={15}/>:<Eye size={15}/>}
              </button>
            </div>
            <button onClick={saveGroqKey} disabled={!!saving||!groqKey.trim()} style={{padding:"10px 16px",borderRadius:10,cursor:groqKey.trim()&&!saving?"pointer":"default",fontWeight:700,fontSize:13,background:"rgba(245,158,11,.15)",color:"#f59e0b",border:"1px solid #f59e0b44",whiteSpace:"nowrap"}}>
              {saving==="groq"?"Đang lưu…":"Lưu key"}
            </button>
          </div>
          {settings?.groq_key_set&&<button onClick={async()=>{try{await api.setSetting("groq_api_key","");setSettings(s=>({...s,groq_key_set:false,groq_key_hint:null}));flash(true,"Đã xoá Groq Key.");}catch(e){flash(false,e.message);}}} style={{marginTop:6,background:"none",border:"none",cursor:"pointer",color:"#f87171",fontSize:12,textDecoration:"underline",padding:0}}>Xoá key</button>}
        </div>

        {/* Gemini Key */}
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
            <span style={{fontSize:13,fontWeight:700,color:"var(--ink-dim)"}}>Gemini API Key <span style={{fontWeight:400,fontSize:11}}>(fallback · free tier)</span></span>
            {settings?.gemini_key_set && <span style={{fontSize:12,color:"#34d399",fontWeight:700,display:"flex",alignItems:"center",gap:4}}><CheckCircle2 size={12}/> {settings.gemini_key_hint}</span>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <div style={{flex:1,position:"relative"}}>
              <input type={showGemini?"text":"password"} value={geminiKey} onChange={e=>setGeminiKey(e.target.value)}
                placeholder={settings?.gemini_key_set?"Nhập key mới để thay thế…":"Nhập Gemini API Key…"}
                style={{width:"100%",boxSizing:"border-box",padding:"10px 38px 10px 12px",borderRadius:10,border:"1px solid var(--line)",background:"rgba(0,0,0,.2)",color:"var(--ink)",fontSize:13,outline:"none"}}
                onKeyDown={e=>e.key==="Enter"&&geminiKey.trim()&&saveGeminiKey()}/>
              <button onClick={()=>setShowGemini(p=>!p)} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--ink-dim)",padding:2}}>
                {showGemini?<EyeOff size={15}/>:<Eye size={15}/>}
              </button>
            </div>
            <button onClick={saveGeminiKey} disabled={!!saving||!geminiKey.trim()} style={{padding:"10px 16px",borderRadius:10,cursor:geminiKey.trim()&&!saving?"pointer":"default",fontWeight:700,fontSize:13,background:"rgba(245,158,11,.15)",color:"#f59e0b",border:"1px solid #f59e0b44",whiteSpace:"nowrap"}}>
              {saving==="gemini"?"Đang lưu…":"Lưu key"}
            </button>
          </div>
          {settings?.gemini_key_set&&<button onClick={async()=>{try{await api.setSetting("gemini_api_key","");setSettings(s=>({...s,gemini_key_set:false,gemini_key_hint:null}));flash(true,"Đã xoá Gemini Key.");}catch(e){flash(false,e.message);}}} style={{marginTop:6,background:"none",border:"none",cursor:"pointer",color:"#f87171",fontSize:12,textDecoration:"underline",padding:0}}>Xoá key</button>}
        </div>

        <p style={{color:"var(--ink-dim)",fontSize:12,lineHeight:1.5,marginTop:12,marginBottom:0}}>
          Groq: lấy key tại <b>console.groq.com</b> → API Keys (miễn phí, nhanh nhất).<br/>
          Gemini: lấy key tại <b>aistudio.google.com</b> → Get API Key (free tier 1500 req/ngày).
        </p>
      </div>

      <DataManagementSection flash={flash} cardStyle={cardStyle}/>

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
  const [navOpen,setNavOpen]=useState(()=>window.innerWidth>=768);
  const [resetTarget,setResetTarget]=useState(null);
  const [acctTarget,setAcctTarget]=useState(null);
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [renewTarget,setRenewTarget]=useState(null);
  const fmt=n=>n.toLocaleString("vi-VN")+"đ";
  const reload=()=>api.adminUsers().then(setUsers).catch(()=>{});
  useEffect(()=>{ reload(); const t=setInterval(reload,30000); return ()=>clearInterval(t); },[]);
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
    {key:"groups",icon:GitMerge,label:"Cài đặt nhóm"},
    {key:"accountant-groups",icon:CreditCard,label:"Nhóm KT"},
    {key:"group-points",icon:Award,label:"Điểm nhóm"},
    {key:"health",icon:Activity,label:"Sức khỏe"},
    {key:"stats",icon:TrendingUp,label:"Thống kê"},
    {key:"settings",icon:Settings,label:"Cài đặt"},
  ];
  return (
    <div style={{display:"flex",height:"100dvh",overflow:"hidden",background:"var(--bg)",color:"var(--ink)",fontFamily:"var(--body)"}}>
      {/* Mobile backdrop */}
      {navOpen&&window.innerWidth<768&&(
        <div onClick={()=>setNavOpen(false)} style={{position:"fixed",inset:0,zIndex:99,background:"rgba(0,0,0,.45)"}}/>
      )}
      {/* Sidebar */}
      <aside style={{width:navOpen?220:0,minWidth:0,flexShrink:0,background:"var(--card)",borderRight:navOpen?"1px solid var(--line)":"none",display:"flex",flexDirection:"column",overflow:"hidden",transition:"width .2s",...(navOpen&&window.innerWidth<768?{position:"fixed",left:0,top:0,height:"100%",zIndex:100}:{})}}>
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
          <button onClick={()=>setNavOpen(v=>!v)} title="Menu" style={{background:"none",border:"none",cursor:"pointer",color:"var(--ink-dim)",padding:4,borderRadius:8,display:"flex",flexShrink:0}}><Menu size={18}/></button>
          <span style={{fontWeight:700,fontSize:16,flex:1}}>{TABS.find(t=>t.key===adminTab)?.label}</span>
          <button onClick={reload} title="Tải lại" style={{background:"none",border:"none",cursor:"pointer",color:"var(--ink-dim)",padding:6,borderRadius:8,display:"flex"}}><RefreshCw size={15}/></button>
        </header>
        <div style={{flex:1,overflowY:"auto"}}>
          {adminTab==="groups"&&<div style={{padding:"20px 24px"}}><AdminGroupsTab/></div>}
          {adminTab==="accountant-groups"&&<div style={{padding:"20px 24px"}}><AccountantGroupsTab/></div>}
          {adminTab==="group-points"&&<div style={{padding:"20px 24px"}}><AdminGroupPointsTab/></div>}
          {adminTab==="health"&&<div style={{padding:"20px 24px"}}><SessionHealthTab/></div>}
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
                            <button onClick={()=>setDeleteTarget(u)} style={miniBtn("#ef4444")}>✕ Xóa</button>
                          </>) : u.status==="pending" ? (<>
                            <button onClick={()=>approve(u.id,"Tuần")} style={miniBtn("#3b82f6")}>Duyệt · Tuần</button>
                            <button onClick={()=>approve(u.id,"Tháng")} style={miniBtn("#22c55e")}>Duyệt · Tháng</button>
                            <button onClick={()=>setDeleteTarget(u)} style={miniBtn("#ef4444")}>✕ Xóa</button>
                          </>) : (<>
                            <button onClick={()=>setRole(u.id,"admin")} style={miniBtn("#a78bfa")}><Shield size={13}/> Cấp admin</button>
                            <button onClick={()=>setAcctTarget(u)} style={miniBtn("#f59e0b")}><Users size={13}/> Cấp KT</button>
                            <button onClick={()=>setRenewTarget(u)} style={miniBtn("#22c55e")}><RefreshCw size={13}/> Gia hạn</button>
                            <button onClick={()=>ban(u.id)} style={miniBtn(u.status==="banned"?"#3b82f6":"#ef4444")}><Ban size={13}/> {u.status==="banned"?"Mở":"Khoá"}</button>
                            <button onClick={()=>setDeleteTarget(u)} style={miniBtn("#ef4444")}>✕ Xóa</button>
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
      {deleteTarget&&<DeleteUserModal target={deleteTarget} onClose={()=>setDeleteTarget(null)} onDone={()=>{setDeleteTarget(null);reload();}}/>}
      {renewTarget&&<RenewModal target={renewTarget} week={week} month={month} onClose={()=>setRenewTarget(null)} onDone={()=>{setRenewTarget(null);reload();}}/>}
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

/* ===== Modal: Phân quyền kế toán cho nhóm ===== */
function GroupAccessModal({ group, onClose }) {
  const [allUsers, setAllUsers] = useState([]);
  const [current, setCurrent] = useState([]);
  const [saving, setSaving] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    Promise.all([
      api.adminUsers(),
      api.groupAccountants(group.group_id),
    ]).then(([users, accts]) => {
      setAllUsers(users.filter(u => u.role === "accountant" || u.role === "admin"));
      setCurrent(accts.map(a => a.accountant_id));
    }).catch(() => {});
  }, [group.group_id]);

  const hasAccess = (uid) => current.includes(uid);

  const toggle = async (user) => {
    const action = hasAccess(user.id) ? "remove" : "add";
    setSaving(user.id);
    try {
      await api.setAccountantGroup(user.id, group.group_id, group.group_name, action);
      setCurrent(prev => action === "add" ? [...prev, user.id] : prev.filter(id => id !== user.id));
      setMsg({ ok: true, text: action === "add" ? `Đã cấp quyền cho ${user.phone}` : `Đã thu hồi quyền ${user.phone}` });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setSaving(null); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: "24px 28px", width: 440, maxWidth: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <UserPlus size={18} color="var(--accent)" />
          <div style={{ fontWeight: 800, fontSize: 16 }}>Phân quyền kế toán</div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 16 }}>
          Nhóm: <b style={{ color: "var(--ink)" }}>{group.group_name || group.group_id}</b>
          <br />Chọn kế toán có quyền xem và quản lý nhóm này (không cần Zalo).
        </div>
        {msg && <div style={{ padding: "7px 12px", borderRadius: 8, marginBottom: 10, fontSize: 13, fontWeight: 600, background: msg.ok ? "rgba(52,211,153,.12)" : "rgba(239,68,68,.12)", color: msg.ok ? "#34d399" : "#f87171" }}>{msg.text}</div>}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {allUsers.length === 0 && <div style={{ textAlign: "center", padding: 24, color: "var(--ink-dim)", fontSize: 13 }}>Chưa có kế toán nào trong hệ thống.</div>}
          {allUsers.map(u => {
            const active = hasAccess(u.id);
            const isSaving = saving === u.id;
            return (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: "1px solid var(--line)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{u.phone}</div>
                  {u.name && <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>{u.name}</div>}
                </div>
                {active && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(52,211,153,.12)", color: "#34d399", fontWeight: 700 }}>Có quyền</span>}
                <button
                  onClick={() => toggle(u)}
                  disabled={!!isSaving}
                  style={{ padding: "7px 14px", borderRadius: 9, border: "none", cursor: isSaving ? "default" : "pointer", fontWeight: 700, fontSize: 12, opacity: isSaving ? 0.5 : 1, background: active ? "rgba(239,68,68,.15)" : "rgba(52,211,153,.15)", color: active ? "#f87171" : "#34d399" }}>
                  {isSaving ? "…" : active ? "Thu hồi" : "Cấp quyền"}
                </button>
              </div>
            );
          })}
        </div>
        <button onClick={onClose} style={{ marginTop: 16, padding: "9px 0", borderRadius: 10, border: "1px solid var(--line)", background: "none", color: "var(--ink-dim)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Đóng</button>
      </div>
    </div>
  );
}

/* ===== Admin: Xem & chỉnh điểm bất kỳ nhóm ===== */
function AdminGroupPointsTab() {
  const [instances, setInstances] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [subTab, setSubTab] = useState("members");
  const [members, setMembers] = useState(null);
  const [txs, setTxs] = useState(null);
  const [pending, setPending] = useState(null);
  const [msg, setMsg] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [deletingTx, setDeletingTx] = useState(null);

  const flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3500); };
  const fmtPts = (n) => Number(n || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  const fmtDate = (ms) => {
    if (!ms) return "—";
    return new Date(Number(ms)).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  useEffect(() => {
    api.listAccountantGroups().then(g => {
      setInstances(g);
      if (g.length === 1) setSelectedId(g[0].group_id);
    }).catch(() => setInstances([]));
  }, []);

  const selected = instances?.find(g => g.group_id === selectedId);

  const loadMembers  = () => { setMembers(null);  api.adminGetMembers(selectedId).then(setMembers).catch(() => setMembers([])); };
  const loadTxs      = () => { setTxs(null);      api.adminGetTransactions(selectedId).then(setTxs).catch(() => setTxs([])); };
  const loadPending  = () => { setPending(null);   api.adminGetPendingTransfers(selectedId).then(setPending).catch(() => setPending([])); };

  useEffect(() => {
    if (!selectedId) { setMembers(null); setTxs(null); setPending(null); return; }
    if (subTab === "members")      loadMembers();
    else if (subTab === "transactions") loadTxs();
    else if (subTab === "pending") loadPending();
  }, [selectedId, subTab]);

  const doAdjust = async () => {
    const delta = parseFloat(adjustDelta);
    if (!delta || isNaN(delta) || !adjustTarget) return;
    setAdjusting(true);
    try {
      await api.adminAdjustPoints({ groupId: selectedId, zaloUid: adjustTarget.uid, delta, reason: adjustReason.trim() || "Admin chỉnh tay" });
      flash(true, `Đã chỉnh ${delta > 0 ? "+" : ""}${delta}đ cho ${adjustTarget.name}`);
      setAdjustTarget(null); setAdjustDelta(""); setAdjustReason("");
      loadMembers();
    } catch (e) { flash(false, e.message); }
    finally { setAdjusting(false); }
  };

  const doDeleteTx = async (id) => {
    if (!confirm("Xóa giao dịch này? Không thể hoàn tác.")) return;
    setDeletingTx(id);
    try { await api.adminDeleteTransaction(id); flash(true, "Đã xóa giao dịch"); loadTxs(); }
    catch (e) { flash(false, e.message); }
    finally { setDeletingTx(null); }
  };

  const doApproveTransfer = async (id) => {
    try { await api.adminApproveTransfer(id); flash(true, "Đã duyệt san điểm"); loadPending(); }
    catch (e) { flash(false, e.message); }
  };
  const doRejectTransfer = async (id) => {
    try { await api.adminRejectTransfer(id); flash(true, "Đã từ chối san điểm"); loadPending(); }
    catch (e) { flash(false, e.message); }
  };

  const cardStyle = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" };
  const SUB_TABS = [
    { key: "members",      label: "Thành viên & Điểm" },
    { key: "transactions", label: "Giao dịch" },
    { key: "pending",      label: "San điểm chờ duyệt" },
  ];

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Group selector */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 18px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Award size={17} color="var(--accent)" />
        <span style={{ fontWeight: 700, fontSize: 15, flexShrink: 0 }}>Chọn nhóm</span>
        <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setAdjustTarget(null); }}
          style={{ flex: 1, minWidth: 240, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 13, outline: "none" }}>
          <option value="">— Chọn nhóm kế toán —</option>
          {(instances || []).map(g => (
            <option key={g.group_id} value={g.group_id}>{g.group_name} ({g.accountant_name})</option>
          ))}
        </select>
        {selected && (
          <span style={{ fontSize: 12, color: "var(--ink-dim)", flexShrink: 0 }}>
            {selected.member_count} TV ·{" "}
            <span style={{ color: selected.public_visible ? "#34d399" : "var(--ink-dim)" }}>
              {selected.public_visible ? "Công khai" : "Ẩn"}
            </span>
          </span>
        )}
      </div>

      {selectedId && (
        <>
          {/* Sub-tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 14, borderBottom: "1px solid var(--line)" }}>
            {SUB_TABS.map(t => (
              <button key={t.key} onClick={() => setSubTab(t.key)} style={{
                padding: "9px 18px", border: "none", cursor: "pointer", fontWeight: subTab === t.key ? 700 : 400, fontSize: 13, background: "transparent",
                color: subTab === t.key ? "var(--accent)" : "var(--ink-dim)",
                borderBottom: subTab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
              }}>{t.label}</button>
            ))}
          </div>

          {/* MEMBERS */}
          {subTab === "members" && (
            <>
              {adjustTarget && (
                <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Award size={15} color="var(--accent)" />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Chỉnh điểm: {adjustTarget.name}</span>
                    <span style={{ fontSize: 12, color: "var(--ink-dim)", marginLeft: 4 }}>hiện tại <b style={{ color: "var(--ink)" }}>{fmtPts(adjustTarget.points)}đ</b></span>
                    <button onClick={() => { setAdjustTarget(null); setAdjustDelta(""); setAdjustReason(""); }}
                      style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><X size={15} /></button>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input type="number" step="0.5" value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)}
                      placeholder="+1 hoặc -2.5" autoFocus
                      style={{ flex: "0 0 130px", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" }}
                      onKeyDown={e => e.key === "Enter" && doAdjust()} />
                    <input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
                      placeholder="Lý do (tùy chọn)"
                      style={{ flex: 1, minWidth: 160, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" }}
                      onKeyDown={e => e.key === "Enter" && doAdjust()} />
                    <button onClick={doAdjust} disabled={adjusting || !adjustDelta}
                      style={{ padding: "8px 20px", borderRadius: 10, border: "none", cursor: adjusting || !adjustDelta ? "default" : "pointer", fontWeight: 700, fontSize: 13, background: "rgba(52,211,153,.2)", color: "#34d399", opacity: adjusting || !adjustDelta ? 0.5 : 1 }}>
                      {adjusting ? "Đang lưu…" : "Lưu"}
                    </button>
                  </div>
                  {adjustDelta && !isNaN(parseFloat(adjustDelta)) && (
                    <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 8 }}>
                      Kết quả: <b style={{ color: "var(--ink)" }}>{fmtPts(adjustTarget.points)}đ</b>
                      {" → "}
                      <b style={{ color: parseFloat(adjustDelta) > 0 ? "#34d399" : "#f87171" }}>{fmtPts(Number(adjustTarget.points) + parseFloat(adjustDelta))}đ</b>
                    </div>
                  )}
                </div>
              )}
              <div style={cardStyle}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
                  <Users size={14} color="var(--accent)" />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Thành viên</span>
                  <button onClick={loadMembers} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><RefreshCw size={13} /></button>
                </div>
                {!members
                  ? <div style={{ padding: 24, textAlign: "center", color: "var(--ink-dim)" }}>Đang tải…</div>
                  : <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead><tr style={{ color: "var(--ink-dim)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left" }}>
                          <th style={th}>#</th>
                          <th style={th}>Tên</th>
                          <th style={th}>UID</th>
                          <th style={{ ...th, textAlign: "right" }}>Điểm</th>
                          <th style={{ ...th, textAlign: "right" }}>Hôm qua</th>
                          <th style={{ ...th, textAlign: "right" }}>Chỉnh điểm</th>
                        </tr></thead>
                        <tbody>
                          {members.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--ink-dim)" }}>Chưa có thành viên</td></tr>}
                          {members.map((m, i) => (
                            <tr key={m.zalo_uid} style={{ borderTop: "1px solid var(--line)", background: adjustTarget?.uid === m.zalo_uid ? "rgba(52,211,153,.05)" : "transparent" }}>
                              <td style={{ ...td, color: "var(--ink-dim)", fontSize: 11 }}>{i + 1}</td>
                              <td style={{ ...td, fontWeight: 600 }}>{m.alias || m.display_name || <span style={{ color: "var(--ink-dim)", fontStyle: "italic", fontWeight: 400 }}>Chưa có tên</span>}</td>
                              <td style={{ ...td, fontFamily: "monospace", fontSize: 10, color: "var(--ink-dim)" }}>{m.zalo_uid}</td>
                              <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: Number(m.points) > 0 ? "#34d399" : Number(m.points) < 0 ? "#f87171" : "var(--ink-dim)" }}>
                                {fmtPts(m.points)}
                              </td>
                              <td style={{ ...td, textAlign: "right", color: "var(--ink-dim)", fontVariantNumeric: "tabular-nums" }}>
                                {m.yesterday_points != null ? fmtPts(m.yesterday_points) : "—"}
                              </td>
                              <td style={{ ...td, textAlign: "right" }}>
                                <button
                                  onClick={() => { setAdjustTarget({ uid: m.zalo_uid, name: m.alias || m.display_name || m.zalo_uid, points: m.points }); setAdjustDelta(""); setAdjustReason(""); }}
                                  style={{ ...miniBtn("#60a5fa"), fontSize: 11, display: "inline-flex", alignItems: "center", gap: 3 }}>
                                  <Award size={10} /> Chỉnh
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                }
              </div>
            </>
          )}

          {/* TRANSACTIONS */}
          {subTab === "transactions" && (
            <div style={cardStyle}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={14} color="var(--accent)" />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Giao dịch gần nhất (150)</span>
                <button onClick={loadTxs} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><RefreshCw size={13} /></button>
              </div>
              {!txs
                ? <div style={{ padding: 24, textAlign: "center", color: "var(--ink-dim)" }}>Đang tải…</div>
                : <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead><tr style={{ color: "var(--ink-dim)", fontSize: 11, textTransform: "uppercase", textAlign: "left" }}>
                        <th style={th}>Thời gian</th>
                        <th style={th}>Loại</th>
                        <th style={th}>To / From</th>
                        <th style={{ ...th, textAlign: "right" }}>Điểm</th>
                        <th style={th}>Lý do</th>
                        <th style={{ ...th, textAlign: "right" }}>Xóa</th>
                      </tr></thead>
                      <tbody>
                        {txs.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--ink-dim)" }}>Chưa có giao dịch</td></tr>}
                        {txs.map(tx => (
                          <tr key={tx.id} style={{ borderTop: "1px solid var(--line)", opacity: deletingTx === tx.id ? 0.4 : 1 }}>
                            <td style={{ ...td, color: "var(--ink-dim)", whiteSpace: "nowrap", fontSize: 11 }}>{fmtDate(tx.created_at)}</td>
                            <td style={{ ...td }}>
                              <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, background: tx.type === "barem" ? "rgba(167,139,250,.15)" : tx.type === "manual" ? "rgba(96,165,250,.15)" : "rgba(100,116,139,.12)", color: tx.type === "barem" ? "#a78bfa" : tx.type === "manual" ? "#60a5fa" : "var(--ink-dim)" }}>
                                {tx.type}
                              </span>
                            </td>
                            <td style={{ ...td, fontFamily: "monospace", fontSize: 10, color: "var(--ink-dim)" }}>
                              {tx.to_member ? `→${tx.to_member.slice(-6)}` : tx.from_member ? `←${tx.from_member.slice(-6)}` : "—"}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: Number(tx.points) >= 0 ? "#34d399" : "#f87171" }}>
                              {Number(tx.points) > 0 ? "+" : ""}{fmtPts(tx.points)}
                            </td>
                            <td style={{ ...td, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-dim)" }} title={tx.reason}>{tx.reason || "—"}</td>
                            <td style={{ ...td, textAlign: "right" }}>
                              <button onClick={() => doDeleteTx(tx.id)} disabled={deletingTx === tx.id}
                                style={{ ...miniBtn("#f87171"), fontSize: 11, display: "inline-flex", alignItems: "center", gap: 3, opacity: deletingTx === tx.id ? 0.5 : 1 }}>
                                <Trash2 size={10} /> Xóa
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          )}

          {/* PENDING */}
          {subTab === "pending" && (
            <div style={cardStyle}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={14} color="#f59e0b" />
                <span style={{ fontWeight: 700, fontSize: 14 }}>San điểm chờ duyệt</span>
                <button onClick={loadPending} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><RefreshCw size={13} /></button>
              </div>
              {!pending
                ? <div style={{ padding: 24, textAlign: "center", color: "var(--ink-dim)" }}>Đang tải…</div>
                : pending.length === 0
                  ? <div style={{ padding: 24, textAlign: "center", color: "var(--ink-dim)" }}>Không có san điểm chờ duyệt</div>
                  : <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead><tr style={{ color: "var(--ink-dim)", fontSize: 11, textTransform: "uppercase", textAlign: "left" }}>
                          <th style={th}>Từ</th>
                          <th style={th}>Đến</th>
                          <th style={{ ...th, textAlign: "right" }}>Điểm</th>
                          <th style={th}>Lý do</th>
                          <th style={{ ...th, textAlign: "right" }}>Thao tác</th>
                        </tr></thead>
                        <tbody>
                          {pending.map(p => (
                            <tr key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
                              <td style={{ ...td, fontWeight: 600 }}>{p.from_name || <span style={{ fontFamily: "monospace", fontSize: 11 }}>{p.from_member}</span>}</td>
                              <td style={{ ...td, fontWeight: 600 }}>{p.to_name || <span style={{ fontFamily: "monospace", fontSize: 11 }}>{p.to_member}</span>}</td>
                              <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#f59e0b" }}>{fmtPts(p.points)}</td>
                              <td style={{ ...td, color: "var(--ink-dim)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.raw_text}>{p.raw_text || "—"}</td>
                              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                                <button onClick={() => doApproveTransfer(p.id)} style={{ ...miniBtn("#34d399"), marginRight: 4, fontSize: 11 }}>Duyệt</button>
                                <button onClick={() => doRejectTransfer(p.id)} style={{ ...miniBtn("#f87171"), fontSize: 11 }}>Từ chối</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
              }
            </div>
          )}
        </>
      )}

      {msg && <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, background: msg.ok ? "rgba(52,211,153,.12)" : "rgba(239,68,68,.12)", color: msg.ok ? "#34d399" : "#f87171", border: "1px solid " + (msg.ok ? "#34d39944" : "#f8717144") }}>{msg.text}</div>}
    </div>
  );
}

/* ===== Admin: Nhóm Kế Toán (per-instance) ===== */
function AccountantGroupsTab() {
  const [groups, setGroups] = useState(null);
  const [msg, setMsg] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [mergeSource, setMergeSource] = useState(null);
  const [mergeTarget, setMergeTarget] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);

  const load = () => api.listAccountantGroups().then(setGroups).catch(() => setGroups([]));
  useEffect(() => { load(); }, []);

  const flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  const togglePublic = async (g) => {
    setToggling(g.group_id);
    try {
      const next = !(g.public_visible === 1 || g.public_visible === true);
      await api.setInstancePublicVisible(g.group_id, next);
      setGroups(prev => prev.map(x => x.group_id === g.group_id ? { ...x, public_visible: next ? 1 : 0 } : x));
      flash(true, `Nhóm "${g.group_name}" ${next ? "đã hiện" : "đã ẩn"} trên trang công khai.`);
    } catch (e) { flash(false, e.message); }
    finally { setToggling(null); }
  };

  const doPreview = async () => {
    if (!mergeSource || !mergeTarget) return;
    setPreviewing(true); setPreview(null);
    try {
      setPreview(await api.mergeInstancesPreview(mergeSource.group_id, mergeTarget.group_id));
    } catch (e) { flash(false, e.message); }
    finally { setPreviewing(false); }
  };

  const doExecute = async () => {
    if (!mergeSource || !mergeTarget || !preview) return;
    if (!confirm(`Merge điểm từ "${mergeSource.accountant_name} / ${mergeSource.group_name}" sang "${mergeTarget.accountant_name} / ${mergeTarget.group_name}"?\n\nHành động KHÔNG THỂ HOÀN TÁC.`)) return;
    setExecuting(true);
    try {
      await api.mergeInstancesExecute(mergeSource.group_id, mergeTarget.group_id);
      flash(true, "Merge thành công! Nhóm nguồn đã ẩn, nhóm đích đã hiện.");
      setMergeSource(null); setMergeTarget(null); setPreview(null);
      load();
    } catch (e) { flash(false, e.message); }
    finally { setExecuting(false); }
  };

  const cardStyle = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", marginBottom: 20 };

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6 }}>
        <b style={{ color: "#60a5fa" }}>Nhóm Kế Toán:</b> Mỗi dòng là một cặp (kế toán × nhóm Zalo) — hoàn toàn độc lập. Bật <b>Công khai</b> để hiện điểm nhóm đó ra trang public. Khi một kế toán tạm offline, dùng <b>Merge</b> để chuyển điểm sang instance của kế toán khác (dùng avatar hash + tên để khớp thành viên).
      </div>

      <div style={cardStyle}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <CreditCard size={16} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Tất cả instance kế toán</span>
          <button onClick={load} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><RefreshCw size={14} /></button>
        </div>
        {!groups
          ? <div style={{ padding: 24, textAlign: "center", color: "var(--ink-dim)" }}>Đang tải…</div>
          : <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ color: "var(--ink-dim)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left" }}>
                  <th style={th}>#</th>
                  <th style={th}>Kế toán</th>
                  <th style={th}>Tên nhóm</th>
                  <th style={th}>Instance ID</th>
                  <th style={th}>TV</th>
                  <th style={{ ...th, textAlign: "center" }}>Công khai</th>
                  <th style={{ ...th, textAlign: "right" }}>Merge</th>
                </tr></thead>
                <tbody>
                  {groups.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--ink-dim)" }}>Chưa có instance nào.</td></tr>}
                  {groups.map((g, i) => {
                    const isSrc = mergeSource?.group_id === g.group_id;
                    const isTgt = mergeTarget?.group_id === g.group_id;
                    const isToggling2 = toggling === g.group_id;
                    const isPublic = g.public_visible === 1 || g.public_visible === true;
                    return (
                      <tr key={g.group_id} style={{ borderTop: "1px solid var(--line)", background: isSrc ? "rgba(239,68,68,.06)" : isTgt ? "rgba(52,211,153,.06)" : "transparent" }}>
                        <td style={{ ...td, color: "var(--ink-dim)", fontSize: 12 }}>{i + 1}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{g.accountant_name || g.accountant_id}</td>
                        <td style={td}>{g.group_name || g.zalo_group_id}</td>
                        <td style={{ ...td, fontFamily: "monospace", fontSize: 11, color: "var(--ink-dim)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.group_id}</td>
                        <td style={{ ...td, color: "var(--ink-dim)" }}>{g.member_count ?? "—"}</td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <button onClick={() => !isToggling2 && togglePublic(g)} disabled={isToggling2}
                            style={{ padding: "4px 12px", borderRadius: 99, cursor: isToggling2 ? "default" : "pointer", fontWeight: 700, fontSize: 12,
                              background: isPublic ? "rgba(52,211,153,.15)" : "rgba(100,116,139,.12)",
                              color: isPublic ? "#34d399" : "var(--ink-dim)",
                              border: "1px solid " + (isPublic ? "#34d39955" : "var(--line)") }}>
                            {isToggling2 ? "…" : isPublic ? "Hiện" : "Ẩn"}
                          </button>
                        </td>
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                          <button onClick={() => { setMergeSource(isSrc ? null : g); setPreview(null); }} style={{ ...miniBtn(isSrc ? "#ef4444" : "#94a3b8"), marginRight: 4 }}>
                            {isSrc ? "✓ Nguồn" : "Nguồn"}
                          </button>
                          <button onClick={() => { setMergeTarget(isTgt ? null : g); setPreview(null); }} style={miniBtn(isTgt ? "#34d399" : "#94a3b8")}>
                            {isTgt ? "✓ Đích" : "Đích"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        }
      </div>

      {(mergeSource || mergeTarget) && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Merge instance</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 180, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}>
              <div style={{ fontSize: 11, color: "#f87171", fontWeight: 700, marginBottom: 4 }}>NGUỒN (điểm chuyển đi, ẩn sau merge)</div>
              {mergeSource ? <><div style={{ fontWeight: 700 }}>{mergeSource.accountant_name}</div><div style={{ fontSize: 12, color: "var(--ink-dim)" }}>{mergeSource.group_name}</div></> : <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>Chưa chọn</div>}
            </div>
            <div style={{ paddingTop: 14 }}><GitMerge size={20} color="var(--ink-dim)" /></div>
            <div style={{ flex: 1, minWidth: 180, padding: "10px 14px", borderRadius: 10, background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.2)" }}>
              <div style={{ fontSize: 11, color: "#34d399", fontWeight: 700, marginBottom: 4 }}>ĐÍCH (nhận điểm, hiện sau merge)</div>
              {mergeTarget ? <><div style={{ fontWeight: 700 }}>{mergeTarget.accountant_name}</div><div style={{ fontSize: 12, color: "var(--ink-dim)" }}>{mergeTarget.group_name}</div></> : <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>Chưa chọn</div>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: preview ? 14 : 0 }}>
            <button onClick={doPreview} disabled={!mergeSource || !mergeTarget || previewing || executing}
              style={{ padding: "9px 20px", borderRadius: 10, border: "none", cursor: (mergeSource && mergeTarget && !previewing && !executing) ? "pointer" : "default", fontWeight: 700, fontSize: 13, background: "rgba(96,165,250,.15)", color: "#60a5fa", opacity: (!mergeSource || !mergeTarget || previewing || executing) ? 0.5 : 1 }}>
              {previewing ? "Đang xem trước…" : "Xem trước"}
            </button>
            {preview && (
              <button onClick={doExecute} disabled={executing}
                style={{ padding: "9px 20px", borderRadius: 10, border: "none", cursor: executing ? "default" : "pointer", fontWeight: 800, fontSize: 13, background: "rgba(239,68,68,.2)", color: "#ef4444", opacity: executing ? 0.6 : 1 }}>
                {executing ? "Đang merge…" : "Merge ngay"}
              </button>
            )}
          </div>

          {preview && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 8 }}>
                Khớp <b style={{ color: "var(--ink)" }}>{preview.matched?.length || 0}</b> thành viên ·
                Không khớp <b style={{ color: "#f59e0b" }}>{preview.unmatched?.length || 0}</b> (bỏ qua) ·
                TV nhóm đích: <b style={{ color: "var(--ink)" }}>{preview.targetMemberCount}</b>
              </div>
              {(preview.matched?.length > 0) && (
                <div style={{ overflowX: "auto", marginBottom: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ color: "var(--ink-dim)", textAlign: "left", fontSize: 11, textTransform: "uppercase" }}>
                      <th style={th}>Nguồn</th><th style={th}>Đích</th><th style={{ ...th, textAlign: "right" }}>Điểm cộng</th>
                    </tr></thead>
                    <tbody>{preview.matched.map((m, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                        <td style={td}>{m.src?.name}</td>
                        <td style={td}>{m.tgt?.name}</td>
                        <td style={{ ...td, textAlign: "right", color: "#34d399", fontWeight: 700 }}>+{m.src?.points ?? 0}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {(preview.unmatched?.length > 0) && (
                <div style={{ fontSize: 12, color: "#f59e0b" }}>
                  Không tìm thấy đối ứng (bỏ qua): {preview.unmatched.map(u => u.name || u.uid).join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {msg && <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, background: msg.ok ? "rgba(52,211,153,.12)" : "rgba(239,68,68,.12)", color: msg.ok ? "#34d399" : "#f87171", border: "1px solid " + (msg.ok ? "#34d39944" : "#f8717144") }}>{msg.text}</div>}
    </div>
  );
}

/* ===== Admin: Cài đặt nhóm ===== */
function AdminGroupsTab() {
  const [groups, setGroups] = useState(null);
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);
  const [merging, setMerging] = useState(false);
  const [msg, setMsg] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [accessGroup, setAccessGroup] = useState(null);

  const load = () => api.listAllGroups().then(setGroups).catch(() => {});
  useEffect(() => { load(); }, []);

  const flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  const doReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await api.resetGroupData(resetTarget.group_id);
      flash(true, `Đã reset data nhóm "${resetTarget.group_name}" về 0đ.`);
      setResetTarget(null);
      load();
    } catch (e) { flash(false, e.message); }
    finally { setResetting(false); }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteGroup(deleteTarget.group_id);
      flash(true, `Đã xóa nhóm "${deleteTarget.group_name}" và toàn bộ dữ liệu liên quan.`);
      setDeleteTarget(null);
      load();
    } catch (e) { flash(false, e.message); }
    finally { setDeleting(false); }
  };

  const doMerge = async () => {
    if (!source || !target) return;
    if (!confirm(`Merge "${source.group_name}" → "${target.group_name}"?\n\nDữ liệu từ nhóm nguồn sẽ được chuyển sang nhóm đích. Hành động KHÔNG THỂ HOÀN TÁC.`)) return;
    setMerging(true);
    try {
      await api.mergeGroups(source.group_id, target.group_id);
      flash(true, "Merge thành công!");
      setSource(null); setTarget(null);
      load();
    } catch (e) { flash(false, e.message); }
    finally { setMerging(false); }
  };

  const cardStyle = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", marginBottom: 20 };

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Modal phân quyền */}
      {accessGroup && <GroupAccessModal group={accessGroup} onClose={() => setAccessGroup(null)} />}

      {/* Modal xác nhận reset */}
      {resetTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: "28px 32px", maxWidth: 420, width: "90%" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10, color: "#f87171" }}>⚠️ Reset data nhóm?</div>
            <div style={{ fontSize: 14, color: "var(--ink-dim)", lineHeight: 1.6, marginBottom: 20 }}>
              Nhóm: <b style={{ color: "var(--ink)" }}>{resetTarget.group_name}</b><br />
              Hành động này sẽ <b>xóa toàn bộ lịch sử giao dịch</b> và <b>đặt điểm tất cả thành viên về 0</b>.<br />
              <span style={{ color: "#f87171", fontWeight: 700 }}>KHÔNG THỂ HOÀN TÁC.</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setResetTarget(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid var(--line)", background: "none", color: "var(--ink-dim)", cursor: "pointer", fontWeight: 600 }}>Hủy</button>
              <button onClick={doReset} disabled={resetting} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "rgba(239,68,68,.2)", color: "#f87171", cursor: resetting ? "default" : "pointer", fontWeight: 800, opacity: resetting ? 0.6 : 1 }}>
                {resetting ? "Đang reset…" : "Xác nhận Reset"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận xóa nhóm */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: "28px 32px", maxWidth: 420, width: "90%" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10, color: "#f87171" }}>⚠️ Xóa nhóm?</div>
            <div style={{ fontSize: 14, color: "var(--ink-dim)", lineHeight: 1.6, marginBottom: 20 }}>
              Nhóm: <b style={{ color: "var(--ink)" }}>{deleteTarget.group_name}</b><br />
              Hành động này sẽ <b>xóa hoàn toàn nhóm</b>, toàn bộ thành viên, giao dịch, barem và quyền kế toán của nhóm này.<br />
              <span style={{ color: "#f87171", fontWeight: 700 }}>KHÔNG THỂ HOÀN TÁC.</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid var(--line)", background: "none", color: "var(--ink-dim)", cursor: "pointer", fontWeight: 600 }}>Hủy</button>
              <button onClick={doDelete} disabled={deleting} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "rgba(239,68,68,.2)", color: "#f87171", cursor: deleting ? "default" : "pointer", fontWeight: 800, opacity: deleting ? 0.6 : 1 }}>
                {deleting ? "Đang xóa…" : "Xác nhận Xóa nhóm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hướng dẫn */}
      <div style={{ background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6 }}>
        <b style={{ color: "#60a5fa" }}>Merge nhóm:</b> Khi 2 kế toán dùng 2 tài khoản Zalo khác nhau add cùng 1 nhóm vật lý, Zalo có thể trả về 2 group ID khác nhau. Chọn <b>Nhóm nguồn</b> (sẽ bị xóa) và <b>Nhóm đích</b> (giữ lại), rồi nhấn Merge. Toàn bộ thành viên, giao dịch, barem sẽ được chuyển sang nhóm đích.
      </div>

      {/* Danh sách nhóm */}
      <div style={cardStyle}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <GitMerge size={16} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Tất cả nhóm trong hệ thống</span>
          <button onClick={load} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><RefreshCw size={14} /></button>
        </div>
        {!groups
          ? <div style={{ padding: 24, textAlign: "center", color: "var(--ink-dim)" }}>Đang tải…</div>
          : <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ color: "var(--ink-dim)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left" }}>
                  <th style={th}>#</th>
                  <th style={th}>Group ID</th>
                  <th style={th}>Tên nhóm</th>
                  <th style={th}>KT</th>
                  <th style={th}>TV</th>
                  <th style={{ ...th, textAlign: "right" }}>Phân quyền</th>
                  <th style={{ ...th, textAlign: "right" }}>Merge</th>
                  <th style={{ ...th, textAlign: "right" }}>Reset</th>
                  <th style={{ ...th, textAlign: "right" }}>Xóa</th>
                </tr></thead>
                <tbody>{groups.map((g, i) => {
                  const isSrc = source?.group_id === g.group_id;
                  const isTgt = target?.group_id === g.group_id;
                  return (
                    <tr key={g.group_id} style={{ borderTop: "1px solid var(--line)", background: isSrc ? "rgba(239,68,68,.06)" : isTgt ? "rgba(52,211,153,.06)" : "transparent" }}>
                      <td style={{ ...td, color: "var(--ink-dim)", fontSize: 12 }}>{i + 1}</td>
                      <td style={{ ...td, fontFamily: "monospace", fontSize: 11, color: "var(--ink-dim)" }}>{g.group_id}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{g.group_name || g.group_id}</td>
                      <td style={{ ...td, color: "var(--ink-dim)" }}>{g.accountant_count}</td>
                      <td style={{ ...td, color: "var(--ink-dim)" }}>{g.member_count}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button
                          onClick={() => setAccessGroup(g)}
                          style={{ ...miniBtn("#60a5fa"), fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <UserPlus size={11} /> KT ({g.accountant_count})
                        </button>
                      </td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => setSource(isSrc ? null : g)}
                          style={{ ...miniBtn(isSrc ? "#ef4444" : "#94a3b8"), marginRight: 4 }}>
                          {isSrc ? "✓ Nguồn" : "Nguồn"}
                        </button>
                        <button
                          onClick={() => setTarget(isTgt ? null : g)}
                          style={miniBtn(isTgt ? "#34d399" : "#94a3b8")}>
                          {isTgt ? "✓ Đích" : "Đích"}
                        </button>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button
                          onClick={() => setResetTarget(g)}
                          style={{ ...miniBtn("#f87171"), fontSize: 11 }}>
                          Reset data
                        </button>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button
                          onClick={() => setDeleteTarget(g)}
                          style={{ ...miniBtn("#ef4444"), fontSize: 11, fontWeight: 800 }}>
                          Xóa nhóm
                        </button>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
        }
      </div>

      {/* Panel merge */}
      {(source || target) && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Xác nhận Merge</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 200, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}>
              <div style={{ fontSize: 11, color: "#f87171", fontWeight: 700, marginBottom: 4 }}>NGUỒN (sẽ bị xóa)</div>
              {source
                ? <><div style={{ fontWeight: 700 }}>{source.group_name}</div><div style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "monospace" }}>{source.group_id}</div></>
                : <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>Chưa chọn</div>}
            </div>
            <GitMerge size={20} color="var(--ink-dim)" />
            <div style={{ flex: 1, minWidth: 200, padding: "10px 14px", borderRadius: 10, background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.2)" }}>
              <div style={{ fontSize: 11, color: "#34d399", fontWeight: 700, marginBottom: 4 }}>ĐÍCH (giữ lại)</div>
              {target
                ? <><div style={{ fontWeight: 700 }}>{target.group_name}</div><div style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "monospace" }}>{target.group_id}</div></>
                : <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>Chưa chọn</div>}
            </div>
          </div>
          {msg && <div style={{ padding: "8px 12px", borderRadius: 8, marginBottom: 10, fontSize: 13, fontWeight: 600, background: msg.ok ? "rgba(52,211,153,.12)" : "rgba(239,68,68,.12)", color: msg.ok ? "#34d399" : "#f87171" }}>{msg.text}</div>}
          <button
            onClick={doMerge}
            disabled={!source || !target || merging}
            style={{ padding: "10px 24px", borderRadius: 10, border: "none", cursor: (source && target && !merging) ? "pointer" : "default", fontWeight: 800, fontSize: 14, background: (source && target) ? "rgba(239,68,68,.2)" : "rgba(255,255,255,.05)", color: (source && target) ? "#ef4444" : "var(--ink-dim)", opacity: merging ? 0.6 : 1 }}>
            {merging ? "Đang merge…" : "Merge ngay"}
          </button>
        </div>
      )}
      {msg && !source && !target && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, background: msg.ok ? "rgba(52,211,153,.12)" : "rgba(239,68,68,.12)", color: msg.ok ? "#34d399" : "#f87171" }}>{msg.text}</div>
      )}
    </div>
  );
}

/* ===== Admin: Thống kê doanh thu & user ===== */
const STATUS_LABELS={active:"Hoạt động",pending:"Chờ duyệt",expired:"Hết hạn",banned:"Đã khoá"};
const STATUS_COLORS={active:"#34d399",pending:"#f59e0b",expired:"#94a3b8",banned:"#f87171"};

/* ===== Tab: Sức khỏe session Zalo ===== */
function SessionHealthTab() {
  const [data, setData] = useState(null);
  const [err, setErr]   = useState("");

  const load = () => {
    setErr("");
    api.sessionHealth().then(d => setData(d)).catch(e => setErr(e.message));
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const fmtAgo = (ms) => {
    if (!ms) return "—";
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60)   return `${s}s trước`;
    if (s < 3600) return `${Math.floor(s/60)}p trước`;
    return `${Math.floor(s/3600)}h trước`;
  };
  const statusOf = (isLive, lastMsgAt) => {
    if (!isLive) return { dot: "#6b7280", label: "Offline" };
    const s = (Date.now() - lastMsgAt) / 1000;
    if (s < 300)  return { dot: "#34d399", label: "Tốt" };
    if (s < 1800) return { dot: "#f59e0b", label: "Chậm" };
    return               { dot: "#f87171", label: "Mất kết nối?" };
  };

  const accountants = data?.accountants || [];
  const sessions    = data?.sessions    || [];

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Activity size={18} color="var(--accent)" />
        <span style={{ fontWeight: 700, fontSize: 16 }}>Session Zalo</span>
        <button onClick={load} style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "none", color: "var(--ink-dim)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
          <RefreshCw size={12} /> Làm mới
        </button>
        <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>Tự cập nhật 30s</span>
      </div>

      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>Lỗi: {err}</div>}
      {!data && !err && <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>Đang tải…</div>}

      {/* ===== Kế toán ===== */}
      {accountants.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-dim)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
            Kế toán ({accountants.filter(s => s.isLive).length}/{accountants.length} online)
          </div>
          {accountants.map(s => {
            const st = statusOf(s.isLive, s.lastMsgAt);
            return (
              <div key={s.userId} style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                borderRadius: 12, padding: "12px 16px", marginBottom: 8,
                opacity: s.isLive ? 1 : 0.55,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
                    {s.phone}
                    {s.selfName && s.selfName !== s.phone && (
                      <span style={{ fontWeight: 400, color: "var(--ink-dim)", fontSize: 12, marginLeft: 6 }}>({s.selfName})</span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: st.dot + "22", color: st.dot, fontWeight: 700 }}>{st.label}</span>
                </div>
                {s.isLive && (
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ink-dim)", marginTop: 7 }}>
                    <span><b style={{ color: "var(--ink)" }}>Tin cuối:</b> {fmtAgo(s.lastMsgAt)}</span>
                    <span><b style={{ color: "var(--ink)" }}>Nhóm theo dõi:</b> {s.selected?.length || 0}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Sessions khác (tài xế / admin) ===== */}
      {sessions.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-dim)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
            Session khác
          </div>
          {sessions.map(s => {
            const st = statusOf(true, s.lastMsgAt);
            return (
              <div key={s.userId} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 18px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{s.selfName || s.userId}</span>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: st.dot + "22", color: st.dot, fontWeight: 700 }}>{st.label}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12, color: "var(--ink-dim)" }}>
                  <span><b style={{ color: "var(--ink)" }}>Tin cuối:</b> {fmtAgo(s.lastMsgAt)}</span>
                  <span><b style={{ color: "var(--ink)" }}>Nhóm theo dõi:</b> {s.selected?.length || 0}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && accountants.length === 0 && sessions.length === 0 && (
        <div style={{ color: "var(--ink-dim)", fontSize: 14, padding: "30px 0" }}>Chưa có phiên Zalo nào.</div>
      )}

      <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)", fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.6 }}>
        <b style={{ color: "#f59e0b" }}>Chú thích:</b> Tốt = tin cuối &lt; 5p · Chậm = 5–30p · Mất kết nối? = &gt;30p im lặng · Offline = session chết.<br/>
        Mỗi kế toán xử lý barem/san điểm độc lập trên nhóm của mình.
      </div>
    </div>
  );
}

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
  const totalUsr=(userData||[]).length;
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
                <th style={th}>Ngày đăng ký</th><th style={th}>Tên</th><th style={th}>Số điện thoại</th><th style={th}>Trạng thái</th>
              </tr></thead>
              <tbody>{userData.map((r,i)=>{const c=STATUS_COLORS[r.status]||"#94a3b8";return(
                <tr key={i} style={{borderTop:"1px solid var(--line)"}}>
                  <td style={td}>{r.day}</td>
                  <td style={{...td,fontWeight:600}}>{r.name||"—"}</td>
                  <td style={td}>{r.phone||"—"}</td>
                  <td style={td}><span style={{display:"inline-block",padding:"3px 10px",borderRadius:99,fontSize:12,fontWeight:700,color:c,background:c+"1f",border:"1px solid "+c+"33"}}>{STATUS_LABELS[r.status]||r.status}</span></td>
                </tr>
              );})}
              </tbody>
              <tfoot><tr style={{borderTop:"2px solid var(--line)",background:"rgba(255,255,255,.03)"}}>
                <td style={{...td,fontWeight:700}} colSpan={3}>Tổng</td>
                <td style={{...td,fontWeight:800,fontSize:16}}>{totalUsr} tài khoản</td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== Admin: Xóa tài khoản ===== */
function DeleteUserModal({target,onClose,onDone}){
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [done,setDone]=useState(false);
  const confirm=async()=>{
    setBusy(true);setErr("");
    try{await api.deleteUser(target.id);setDone(true);setTimeout(onDone,1000);}
    catch(e){setErr(e.message);setBusy(false);}
  };
  useEffect(()=>{const k=e=>e.key==="Escape"&&onClose();window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k);},[onClose]);
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,display:"grid",placeItems:"center",background:"rgba(3,6,14,.72)",backdropFilter:"blur(4px)",padding:18}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:380,background:"var(--card)",borderRadius:20,border:"1px solid #ef444466",padding:"22px 20px",boxShadow:"0 24px 70px rgba(0,0,0,.6)"}}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:"rgba(239,68,68,.15)",display:"grid",placeItems:"center",flexShrink:0}}>
            <Ban size={18} color="#ef4444"/>
          </div>
          <div style={{fontWeight:800,fontSize:17,fontFamily:"var(--display)"}}>Xóa tài khoản</div>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--ink-dim)",cursor:"pointer"}}><X size={18}/></button>
        </div>
        {done
          ? <div style={{textAlign:"center",padding:"20px 0",color:"#34d399"}}><CheckCircle2 size={40}/><div style={{fontWeight:800,marginTop:8}}>Đã xóa tài khoản!</div></div>
          : <>
            <div style={{background:"rgba(239,68,68,.07)",border:"1px solid rgba(239,68,68,.2)",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:13}}>
              Bạn sắp xóa vĩnh viễn tài khoản:<br/>
              <b style={{color:"var(--ink)",fontSize:14}}>{target.name||"—"}</b>
              <span style={{color:"var(--ink-dim)",marginLeft:6}}>({target.phone})</span>
              <div style={{marginTop:6,color:"#f87171",fontSize:12}}>Hành động này <b>không thể hoàn tác</b>. Toàn bộ dữ liệu liên quan sẽ bị xóa.</div>
            </div>
            {err&&<ErrBox>{err}</ErrBox>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={onClose} style={{flex:1,padding:"10px",borderRadius:12,border:"1px solid var(--line)",background:"transparent",cursor:"pointer",fontWeight:700,fontSize:14,color:"var(--ink-dim)"}}>Hủy</button>
              <button onClick={confirm} disabled={busy} style={{flex:1,padding:"10px",borderRadius:12,border:"none",cursor:busy?"default":"pointer",fontWeight:800,fontSize:14,background:"rgba(239,68,68,.2)",color:"#ef4444",opacity:busy?0.6:1}}>
                {busy?"Đang xóa…":"Xóa tài khoản"}
              </button>
            </div>
          </>
        }
      </div>
    </div>
  );
}

/* ===== Admin: Gia hạn gói cước ===== */
function RenewModal({target,week,month,onClose,onDone}){
  const [plan,setPlan]=useState(target.plan||"Tuần");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [done,setDone]=useState(false);
  const fmt=n=>n.toLocaleString("vi-VN")+"đ";
  const amount=plan==="Tháng"?month:week;
  const confirm=async()=>{
    setBusy(true);setErr("");
    try{await api.renew(target.id,amount);setDone(true);setTimeout(onDone,900);}
    catch(e){setErr(e.message);setBusy(false);}
  };
  useEffect(()=>{const k=e=>e.key==="Escape"&&onClose();window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k);},[onClose]);
  const planBtn=(p)=>{
    const sel=plan===p;
    return(
      <button onClick={()=>setPlan(p)} style={{flex:1,padding:"12px 8px",borderRadius:12,border:"2px solid "+(sel?"#22c55e":"var(--line)"),background:sel?"rgba(34,197,94,.1)":"transparent",cursor:"pointer",fontWeight:sel?800:500,fontSize:14,color:sel?"#22c55e":"var(--ink-dim)",transition:"all .15s"}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:3}}>{p}</div>
        <div style={{fontSize:12,opacity:.8}}>{p==="Tuần"?"7 ngày":"30 ngày"}</div>
        <div style={{marginTop:4,fontWeight:800,fontSize:16,color:sel?"#22c55e":"var(--ink)"}}>{fmt(p==="Tháng"?month:week)}</div>
      </button>
    );
  };
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,display:"grid",placeItems:"center",background:"rgba(3,6,14,.72)",backdropFilter:"blur(4px)",padding:18}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:380,background:"var(--card)",borderRadius:20,border:"1px solid #22c55e44",padding:"22px 20px",boxShadow:"0 24px 70px rgba(0,0,0,.6)"}}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:16}}>
          <div style={{width:36,height:36,borderRadius:10,background:"rgba(34,197,94,.15)",display:"grid",placeItems:"center",flexShrink:0}}>
            <RefreshCw size={18} color="#22c55e"/>
          </div>
          <div>
            <div style={{fontWeight:800,fontSize:17,fontFamily:"var(--display)"}}>Gia hạn gói cước</div>
            <div style={{fontSize:12.5,color:"var(--ink-dim)",marginTop:1}}>{target.name||"—"} · {target.phone}</div>
          </div>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--ink-dim)",cursor:"pointer"}}><X size={18}/></button>
        </div>
        {done
          ? <div style={{textAlign:"center",padding:"20px 0",color:"#34d399"}}><CheckCircle2 size={40}/><div style={{fontWeight:800,marginTop:8}}>Đã gia hạn thành công!</div></div>
          : <>
            <div style={{fontSize:12.5,color:"var(--ink-dim)",fontWeight:600,marginBottom:8}}>Chọn gói cước</div>
            <div style={{display:"flex",gap:10,marginBottom:16}}>{planBtn("Tuần")}{planBtn("Tháng")}</div>
            {target.plan&&target.plan!==plan&&<div style={{fontSize:12,color:"#f59e0b",marginBottom:12,padding:"7px 10px",background:"rgba(245,158,11,.08)",borderRadius:8,border:"1px solid rgba(245,158,11,.2)"}}>Gói hiện tại: <b>{target.plan}</b> → Sẽ đổi sang <b>{plan}</b></div>}
            {err&&<ErrBox>{err}</ErrBox>}
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button onClick={onClose} style={{flex:1,padding:"10px",borderRadius:12,border:"1px solid var(--line)",background:"transparent",cursor:"pointer",fontWeight:700,fontSize:14,color:"var(--ink-dim)"}}>Hủy</button>
              <button onClick={confirm} disabled={busy} style={{flex:2,padding:"11px",borderRadius:12,border:"none",cursor:busy?"default":"pointer",fontWeight:800,fontSize:14,background:busy?"rgba(34,197,94,.15)":"linear-gradient(135deg,#22c55e,#16a34a)",color:busy?"#22c55e":"#04140a",opacity:busy?0.7:1}}>
                {busy?"Đang gia hạn…":`Xác nhận · ${fmt(amount)}`}
              </button>
            </div>
          </>
        }
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
  input[type="date"]{cursor:pointer;}
  input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.8);cursor:pointer;padding:2px;border-radius:4px;}
  input[type="date"]::-webkit-calendar-picker-indicator:hover{filter:invert(1);}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;}}
`}</style>);}
