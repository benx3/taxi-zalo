import React, { useState, useEffect } from "react";
import { Users, Clock, BarChart2, User, LogOut, KeyRound, X, Check,
         Wifi, WifiOff, QrCode, Bell, Lock, Search, AlertCircle, RefreshCw } from "lucide-react";
import { api } from "./api.js";
import MembersTab from "./MembersTab.jsx";
import TransactionsTab from "./TransactionsTab.jsx";
import BaremTab from "./BaremTab.jsx";
import PendingTab from "./PendingTab.jsx";

const TABS = [
  { key: "members",      icon: Users,    label: "Thành viên" },
  { key: "transactions", icon: Clock,     label: "Giao dịch" },
  { key: "pending",      icon: Bell,      label: "Chờ duyệt" },
  { key: "barem",        icon: BarChart2, label: "Barem" },
  { key: "account",      icon: User,      label: "Tài khoản" },
];

export default function AccountantApp({ me: initMe, onLogout, worker }) {
  const [me, setMe] = useState(initMe);
  const [tab, setTab] = useState("members");
  const [dbGroups, setDbGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [showZaloPanel, setShowZaloPanel] = useState(false);

  const { wsConnected, zaloConnected, qrImage, zaloGroups, selectedGroups,
          setWatchedGroups, pendingTransfers, removePending, send, sessionExpired } = worker;

  const reloadMe = () => api.me().then(setMe).catch(() => {});

  const loadGroups = () => {
    api.myGroups().then(gs => {
      setDbGroups(gs);
      if (gs.length > 0 && (!activeGroup || !gs.some(g => g.group_id === activeGroup?.group_id))) {
        setActiveGroup(gs[0]);
      }
    }).catch(() => {});
  };

  useEffect(() => { loadGroups(); }, []);

  // Reload groups sau khi WS cập nhật selected (kế toán chọn nhóm mới)
  useEffect(() => {
    if (zaloConnected) { loadGroups(); reloadMe(); }
  }, [selectedGroups.join(",")]);

  // Nhận event groups_locked từ WS
  useEffect(() => {
    const origSend = worker.send;
  }, []);

  const pendingCount = pendingTransfers.filter(t => t.groupId === activeGroup?.group_id).length;

  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden" }}>
      {/* ===== Sidebar ===== */}
      <aside style={{ width: 220, flexShrink: 0, background: "var(--card)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
        {/* Logo */}
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 18, color: "var(--ink)", marginBottom: 2 }}>Kế Toán</div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>{me?.name || me?.phone}</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: wsConnected ? "#34d399" : "#f87171", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>{wsConnected ? "Đã kết nối" : "Mất kết nối"}</span>
          </div>
        </div>

        {/* Group selector */}
        <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
            Nhóm phụ trách
          </div>
          {dbGroups.length === 0
            ? <div style={{ fontSize: 12, color: "var(--ink-dim)", padding: "6px 0" }}>Chưa chọn nhóm</div>
            : dbGroups.map(g => (
              <button key={g.group_id} onClick={() => setActiveGroup(g)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", textAlign: "left", cursor: "pointer", marginBottom: 2, background: activeGroup?.group_id === g.group_id ? "rgba(52,211,153,.15)" : "transparent", color: activeGroup?.group_id === g.group_id ? "var(--accent)" : "var(--ink)", fontWeight: activeGroup?.group_id === g.group_id ? 700 : 400, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                {activeGroup?.group_id === g.group_id && <Check size={12} color="var(--accent)" />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.group_name || g.group_id}</span>
              </button>
            ))
          }
          {/* Zalo connect button */}
          <button onClick={() => setShowZaloPanel(true)} style={{ width: "100%", marginTop: 6, padding: "7px 10px", borderRadius: 8, border: "1px dashed var(--line)", background: "transparent", color: zaloConnected ? "#34d399" : sessionExpired ? "#f59e0b" : "var(--ink-dim)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            {zaloConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
            {sessionExpired && !zaloConnected ? "Phiên hết hạn!" : "Kết nối & chọn nhóm"}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 10px", overflowY: "auto" }}>
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            const badge = t.key === "pending" && pendingCount > 0;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", marginBottom: 2, background: active ? "rgba(52,211,153,.12)" : "transparent", color: active ? "var(--accent)" : "var(--ink-dim)", fontWeight: active ? 700 : 400, fontSize: 14, position: "relative" }}>
                <Icon size={17} strokeWidth={active ? 2.5 : 1.8} />
                {t.label}
                {badge && (
                  <span style={{ marginLeft: "auto", minWidth: 18, height: 18, borderRadius: 99, background: "#f59e0b", fontSize: 10, fontWeight: 800, color: "#000", display: "grid", placeItems: "center", padding: "0 4px" }}>
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ===== Main content ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <header style={{ padding: "14px 24px", borderBottom: "1px solid var(--line)", background: "var(--bg)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {TABS.find(t => t.key === tab)?.label}
            </span>
            {activeGroup && (
              <span style={{ marginLeft: 10, fontSize: 13, color: "var(--ink-dim)" }}>
                — {activeGroup.group_name || activeGroup.group_id}
              </span>
            )}
          </div>
          <button onClick={() => { loadGroups(); reloadMe(); }} title="Tải lại" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", padding: 6, borderRadius: 8, display: "flex" }}>
            <RefreshCw size={15} />
          </button>
          <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", color: "var(--ink-dim)", fontSize: 13, fontWeight: 600 }}>
            <LogOut size={14} /> Đăng xuất
          </button>
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!activeGroup && tab !== "account" && (
            <div style={{ display: "grid", placeItems: "center", height: "100%", textAlign: "center", color: "var(--ink-dim)" }}>
              <div>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: .3 }}>📋</div>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 16 }}>Chưa chọn nhóm phụ trách</div>
                <div style={{ fontSize: 14, marginBottom: 20 }}>Kết nối Zalo và chọn nhóm để bắt đầu</div>
                <button onClick={() => setShowZaloPanel(true)} style={{ padding: "10px 22px", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, background: "rgba(52,211,153,.2)", color: "var(--accent)" }}>
                  Kết nối Zalo
                </button>
              </div>
            </div>
          )}
          {activeGroup && tab === "members"      && <MembersTab groupId={activeGroup.group_id} />}
          {activeGroup && tab === "transactions" && <TransactionsTab groupId={activeGroup.group_id} />}
          {activeGroup && tab === "pending"      && <PendingTab groupId={activeGroup.group_id} liveItems={pendingTransfers} onProcessed={removePending} />}
          {activeGroup && tab === "barem"        && <BaremTab groupId={activeGroup.group_id} />}
          {tab === "account"                     && <AccountTab me={me} onLogout={onLogout} />}
        </div>
      </div>

      {/* Zalo panel */}
      {showZaloPanel && (
        <ZaloPanel
          me={me}
          worker={worker}
          onClose={() => setShowZaloPanel(false)}
          onConfirmed={() => { reloadMe(); loadGroups(); setShowZaloPanel(false); }}
        />
      )}
    </div>
  );
}

// ===== Zalo Panel — kết nối + tìm + chọn nhóm =====
function ZaloPanel({ me, worker, onClose, onConfirmed }) {
  const { wsConnected, zaloConnected, qrImage, zaloError, sessionExpired, zaloGroups, selectedGroups, setWatchedGroups, connect } = worker;
  const [generatingQR, setGeneratingQR] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [pendingStart, setPendingStart] = useState(false);
  const groupLimit = me?.group_limit || 3;

  // Tắt spinner khi QR đến hoặc có lỗi (server trả về async qua WS)
  useEffect(() => {
    if (qrImage || zaloError || zaloConnected) setGeneratingQR(false);
  }, [qrImage, zaloError, zaloConnected]);

  // Nếu user click QR trước khi WS kết nối xong → tự trigger khi WS sẵn sàng
  useEffect(() => {
    if (wsConnected && pendingStart) {
      setPendingStart(false);
      doStartQR();
    }
  }, [wsConnected, pendingStart]);

  const filteredGroups = zaloGroups
    .filter(g => !search || (g.name || g.id).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const asel = selectedGroups.includes(a.id) ? 0 : 1;
      const bsel = selectedGroups.includes(b.id) ? 0 : 1;
      return asel - bsel;
    });

  const doStartQR = async () => {
    setGeneratingQR(true); setErr("");
    try { await api.startZaloQR(); }
    catch (e) { setErr(e.message); setGeneratingQR(false); }
  };

  const startQR = () => {
    if (!wsConnected) {
      // WS chưa sẵn sàng — đánh dấu pending, connect lại và chờ
      setPendingStart(true);
      setGeneratingQR(true);
      connect();
      return;
    }
    doStartQR();
  };

  const toggleGroup = (gId) => {
    const next = selectedGroups.includes(gId)
      ? selectedGroups.filter(id => id !== gId)
      : [...selectedGroups, gId];
    if (next.length > groupLimit) { setErr(`Chỉ được chọn tối đa ${groupLimit} nhóm`); return; }
    setErr("");
    setWatchedGroups(next);
  };

  const confirmGroups = async () => {
    if (selectedGroups.length === 0) { setErr("Chưa chọn nhóm nào"); return; }
    setConfirming(true); setErr("");
    try {
      await api.confirmGroups();
      onConfirmed();
    } catch (e) { setErr(e.message); setConfirming(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, height: "100dvh", background: "var(--card)", borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <QrCode size={18} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Kết nối Zalo</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><X size={18} /></button>
        </div>

        <div style={{ padding: "16px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Phiên Zalo hết hạn (cookie cũ không dùng được sau khi khởi động lại service) */}
          {sessionExpired && !zaloConnected && !qrImage && (
            <div style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "var(--ink-dim)" }}>
              <span style={{ color: "#f59e0b", fontWeight: 700 }}>Phiên Zalo đã hết hạn</span> — vui lòng đăng nhập lại bằng QR.
            </div>
          )}

          {/* QR */}
          {qrImage && (
            <div style={{ textAlign: "center" }}>
              <img src={`data:image/png;base64,${qrImage}`} alt="QR Zalo" style={{ width: 180, height: 180, borderRadius: 12, border: "2px solid var(--accent)" }} />
              <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 8 }}>Mở Zalo → Quét mã QR này</div>
            </div>
          )}

          {/* Zalo login error */}
          {zaloError && !qrImage && !zaloConnected && (
            <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ color: "#f87171", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Đăng nhập thất bại</div>
              <div style={{ color: "var(--ink-dim)", fontSize: 12, marginBottom: 10 }}>{zaloError}</div>
              <button onClick={startQR} disabled={generatingQR} style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: "rgba(52,211,153,.2)", color: "var(--accent)" }}>
                {generatingQR ? "Đang tạo QR…" : "Thử lại"}
              </button>
            </div>
          )}

          {/* Đang tạo QR — spinner hiển thị sau khi click cho đến khi QR đến qua WS */}
          {!zaloConnected && !qrImage && !zaloError && generatingQR && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 4 }}>
                {!wsConnected ? "Đang kết nối server…" : "Đang tạo mã QR…"}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                {!wsConnected ? "Sẽ tự động hiện QR khi kết nối xong" : "Vui lòng chờ vài giây"}
              </div>
            </div>
          )}

          {/* Zalo status */}
          {!zaloConnected && !qrImage && !zaloError && !generatingQR && (
            <button onClick={startQR} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#04140a" }}>
              Đăng nhập Zalo (QR)
            </button>
          )}

          {zaloConnected && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.2)" }}>
              <Wifi size={15} color="#34d399" />
              <span style={{ fontWeight: 700, fontSize: 13, color: "#34d399", flex: 1 }}>Zalo đang kết nối</span>
              <button onClick={async () => { await api.logoutZalo(); }} style={{ padding: "4px 10px", borderRadius: 7, border: "none", background: "rgba(248,113,113,.15)", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Đăng xuất</button>
            </div>
          )}

          {/* Group list */}
          {zaloConnected && zaloGroups.length > 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Chọn nhóm theo dõi</span>
                <span style={{ fontSize: 12, color: selectedGroups.length >= groupLimit ? "#f59e0b" : "var(--ink-dim)" }}>
                  {selectedGroups.length}/{groupLimit} nhóm
                </span>
              </div>

              {/* Search */}
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-dim)" }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm tên nhóm…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 32px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" }}
                />
              </div>

              {/* Group items */}
              <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", maxHeight: 340, overflowY: "auto" }}>
                {filteredGroups.length === 0
                  ? <div style={{ padding: "16px", textAlign: "center", color: "var(--ink-dim)", fontSize: 13 }}>Không tìm thấy nhóm</div>
                  : filteredGroups.map((g, i) => {
                    const sel = selectedGroups.includes(g.id);
                    const canSelect = sel || selectedGroups.length < groupLimit;
                    return (
                      <button key={g.id} onClick={() => toggleGroup(g.id)}
                        disabled={!sel && !canSelect}
                        style={{ width: "100%", padding: "10px 14px", textAlign: "left", background: sel ? "rgba(52,211,153,.08)" : "transparent", border: "none", borderBottom: i < filteredGroups.length - 1 ? "1px solid var(--line)" : "none", color: "var(--ink)", cursor: !canSelect ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13, opacity: (!sel && !canSelect) ? 0.4 : 1 }}>
                        <div style={{ width: 18, height: 18, borderRadius: 5, border: "2px solid", borderColor: sel ? "#34d399" : "var(--line)", background: sel ? "#34d399" : "transparent", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          {sel && <Check size={11} color="#04140a" strokeWidth={3} />}
                        </div>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: sel ? 700 : 400 }}>
                          {g.name || g.id}
                        </span>
                      </button>
                    );
                  })
                }
              </div>

              {err && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f87171", fontSize: 12 }}>
                  <AlertCircle size={13} /> {err}
                </div>
              )}

              {/* Confirm button */}
              {selectedGroups.length > 0 && (
                <button onClick={confirmGroups} disabled={confirming} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", cursor: confirming ? "default" : "pointer", fontWeight: 800, fontSize: 14, background: "rgba(52,211,153,.2)", color: "var(--accent)" }}>
                  {confirming ? "Đang lưu…" : `Lưu ${selectedGroups.length} nhóm`}
                </button>
              )}
            </div>
          )}

          {zaloConnected && zaloGroups.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--ink-dim)", fontSize: 13, padding: 20 }}>
              Đang tải danh sách nhóm…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Tab Tài khoản =====
function AccountTab({ me, onLogout }) {
  const [showChangePw, setShowChangePw] = useState(false);
  return (
    <div style={{ maxWidth: 480, padding: "24px 24px" }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{me?.name || "—"}</div>
        <div style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 10 }}>{me?.phone}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,.15)", padding: "3px 10px", borderRadius: 99 }}>Kế Toán</span>
          <span style={{ fontSize: 12, color: "var(--ink-dim)", background: "rgba(255,255,255,.06)", padding: "3px 10px", borderRadius: 99 }}>
            Tối đa {me?.group_limit || 3} nhóm
          </span>
        </div>
      </div>
      <button onClick={() => setShowChangePw(true)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)", cursor: "pointer", color: "var(--ink)", fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
        <KeyRound size={17} color="#60a5fa" /> Đổi mật khẩu
      </button>
      <button onClick={onLogout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 12, border: "1px solid #f8717133", background: "rgba(248,113,113,.08)", cursor: "pointer", color: "#f87171", fontWeight: 600, fontSize: 14 }}>
        <LogOut size={17} /> Đăng xuất
      </button>
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}

function ChangePasswordModal({ onClose }) {
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const submit = async () => {
    if (!oldPass || !newPass) { setMsg({ ok: false, text: "Nhập đủ mật khẩu cũ và mới" }); return; }
    setSaving(true); setMsg(null);
    try { await api.changePassword(oldPass, newPass); setMsg({ ok: true, text: "Đã đổi mật khẩu!" }); setOldPass(""); setNewPass(""); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setSaving(false); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: "rgba(0,0,0,.6)", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: "var(--card)", borderRadius: 18, padding: 24, border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <KeyRound size={17} color="#60a5fa" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Đổi mật khẩu</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><X size={18} /></button>
        </div>
        {[["Mật khẩu cũ", oldPass, setOldPass], ["Mật khẩu mới", newPass, setNewPass]].map(([lbl, val, set]) => (
          <div key={lbl} style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-dim)", marginBottom: 5 }}>{lbl}</label>
            <input type="password" value={val} onChange={e => set(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 13px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" }} />
          </div>
        ))}
        {msg && <div style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? "#34d399" : "#f87171", marginBottom: 10 }}>{msg.text}</div>}
        <button onClick={submit} disabled={saving} style={{ width: "100%", padding: "11px", borderRadius: 12, border: "none", cursor: saving ? "default" : "pointer", fontWeight: 800, fontSize: 14, background: "rgba(96,165,250,.15)", color: "#60a5fa" }}>
          {saving ? "Đang lưu…" : "Xác nhận"}
        </button>
      </div>
    </div>
  );
}
