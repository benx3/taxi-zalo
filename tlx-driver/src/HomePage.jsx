import React, { useEffect } from "react";

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || "http://localhost:5174";

/* ─── SVG Illustrations ──────────────────────────────── */
function PhoneDriverIllustration() {
  return (
    <svg viewBox="0 0 240 420" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 220 }}>
      {/* Phone body */}
      <rect x="20" y="10" width="200" height="400" rx="28" fill="#0f1525" stroke="#1e2740" strokeWidth="2"/>
      <rect x="28" y="22" width="184" height="376" rx="22" fill="#070b16"/>
      {/* Notch */}
      <rect x="88" y="14" width="64" height="10" rx="5" fill="#1e2740"/>
      {/* Status bar */}
      <rect x="40" y="38" width="50" height="5" rx="2.5" fill="#1e2740"/>
      <rect x="180" y="38" width="28" height="5" rx="2.5" fill="#1e2740"/>
      {/* App bar */}
      <rect x="28" y="52" width="184" height="40" rx="0" fill="#0f1525"/>
      <circle cx="52" cy="72" r="10" fill="url(#g1)"/>
      <rect x="68" y="67" width="80" height="6" rx="3" fill="#e8edf7"/>
      <rect x="68" y="77" width="50" height="4" rx="2" fill="#34d399" opacity="0.7"/>
      {/* Trip card 1 */}
      <rect x="36" y="102" width="168" height="72" rx="12" fill="#0f1525" stroke="#1e2740" strokeWidth="1"/>
      <rect x="36" y="102" width="4" height="72" rx="2" fill="#22c55e"/>
      <rect x="48" y="114" width="60" height="5" rx="2.5" fill="#e8edf7"/>
      <rect x="48" y="123" width="100" height="4" rx="2" fill="#8794ad"/>
      <rect x="48" y="135" width="80" height="4" rx="2" fill="#8794ad"/>
      <rect x="48" y="147" width="50" height="5" rx="2.5" fill="#34d399"/>
      <rect x="142" y="110" width="50" height="18" rx="6" fill="rgba(52,211,153,0.15)" stroke="rgba(52,211,153,0.4)" strokeWidth="1"/>
      <rect x="150" y="116" width="34" height="6" rx="3" fill="#34d399"/>
      <rect x="142" y="134" width="50" height="8" rx="4" fill="rgba(245,158,11,0.15)"/>
      <rect x="150" y="136" width="34" height="4" rx="2" fill="#f59e0b" opacity="0.8"/>
      <rect x="142" y="148" width="50" height="8" rx="4" fill="#1e2740"/>
      <rect x="149" y="150" width="36" height="4" rx="2" fill="#8794ad"/>
      {/* Trip card 2 */}
      <rect x="36" y="184" width="168" height="72" rx="12" fill="#0f1525" stroke="#1e2740" strokeWidth="1"/>
      <rect x="36" y="184" width="4" height="72" rx="2" fill="#3b82f6"/>
      <rect x="48" y="196" width="55" height="5" rx="2.5" fill="#e8edf7"/>
      <rect x="48" y="205" width="95" height="4" rx="2" fill="#8794ad"/>
      <rect x="48" y="217" width="75" height="4" rx="2" fill="#8794ad"/>
      <rect x="48" y="229" width="45" height="5" rx="2.5" fill="#34d399"/>
      <rect x="142" y="192" width="50" height="18" rx="6" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.4)" strokeWidth="1"/>
      <rect x="150" y="198" width="34" height="6" rx="3" fill="#60a5fa"/>
      <rect x="142" y="216" width="50" height="8" rx="4" fill="rgba(245,158,11,0.15)"/>
      <rect x="150" y="218" width="34" height="4" rx="2" fill="#f59e0b" opacity="0.8"/>
      {/* Trip card 3 */}
      <rect x="36" y="266" width="168" height="72" rx="12" fill="#0f1525" stroke="#1e2740" strokeWidth="1"/>
      <rect x="36" y="266" width="4" height="72" rx="2" fill="#f59e0b"/>
      <rect x="48" y="278" width="70" height="5" rx="2.5" fill="#e8edf7"/>
      <rect x="48" y="287" width="90" height="4" rx="2" fill="#8794ad"/>
      <rect x="48" y="299" width="65" height="4" rx="2" fill="#8794ad"/>
      <rect x="48" y="311" width="55" height="5" rx="2.5" fill="#34d399"/>
      {/* Bottom nav */}
      <rect x="28" y="363" width="184" height="35" rx="0" fill="#0f1525" stroke="#1e2740" strokeWidth="0"/>
      <circle cx="76" cy="380" r="7" fill="rgba(52,211,153,0.2)"/>
      <circle cx="76" cy="380" r="3" fill="#34d399"/>
      <circle cx="120" cy="380" r="3" fill="#1e2740"/>
      <circle cx="164" cy="380" r="3" fill="#1e2740"/>
      <defs>
        <linearGradient id="g1" x1="42" y1="62" x2="62" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399"/><stop offset="1" stopColor="#06b6d4"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function PhoneAccountantIllustration() {
  return (
    <svg viewBox="0 0 240 420" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 220 }}>
      <rect x="20" y="10" width="200" height="400" rx="28" fill="#0f1525" stroke="#1e2740" strokeWidth="2"/>
      <rect x="28" y="22" width="184" height="376" rx="22" fill="#070b16"/>
      <rect x="88" y="14" width="64" height="10" rx="5" fill="#1e2740"/>
      {/* Header */}
      <rect x="28" y="52" width="184" height="50" rx="0" fill="#0f1525"/>
      <rect x="40" y="62" width="100" height="7" rx="3.5" fill="#e8edf7"/>
      <rect x="40" y="74" width="70" height="5" rx="2.5" fill="#8794ad"/>
      <rect x="168" y="60" width="32" height="16" rx="8" fill="rgba(52,211,153,0.2)" stroke="rgba(52,211,153,0.4)" strokeWidth="1"/>
      <rect x="174" y="65" width="20" height="6" rx="3" fill="#34d399"/>
      {/* Stats row */}
      <rect x="36" y="112" width="52" height="50" rx="10" fill="#0f1525" stroke="#1e2740" strokeWidth="1"/>
      <rect x="44" y="122" width="36" height="6" rx="3" fill="#34d399"/>
      <rect x="44" y="132" width="28" height="4" rx="2" fill="#8794ad"/>
      <rect x="44" y="140" width="20" height="4" rx="2" fill="#8794ad"/>
      <rect x="96" y="112" width="52" height="50" rx="10" fill="#0f1525" stroke="#1e2740" strokeWidth="1"/>
      <rect x="104" y="122" width="36" height="6" rx="3" fill="#f59e0b"/>
      <rect x="104" y="132" width="28" height="4" rx="2" fill="#8794ad"/>
      <rect x="104" y="140" width="20" height="4" rx="2" fill="#8794ad"/>
      <rect x="156" y="112" width="52" height="50" rx="10" fill="#0f1525" stroke="#1e2740" strokeWidth="1"/>
      <rect x="164" y="122" width="36" height="6" rx="3" fill="#f87171"/>
      <rect x="164" y="132" width="28" height="4" rx="2" fill="#8794ad"/>
      <rect x="164" y="140" width="20" height="4" rx="2" fill="#8794ad"/>
      {/* Member list header */}
      <rect x="36" y="172" width="80" height="6" rx="3" fill="#8794ad"/>
      {/* Member rows */}
      {[0,1,2,3].map((i) => (
        <g key={i}>
          <rect x="36" y={188 + i * 38} width="168" height="30" rx="8" fill="#0f1525" stroke="#1e2740" strokeWidth="1"/>
          <circle cx="54" cy={203 + i * 38} r="8" fill={["rgba(52,211,153,0.2)","rgba(59,130,246,0.2)","rgba(245,158,11,0.2)","rgba(248,113,113,0.2)"][i]}/>
          <rect x="68" y={197 + i * 38} width={[60,50,70,45][i]} height="5" rx="2.5" fill="#e8edf7"/>
          <rect x="68" y={206 + i * 38} width={[40,35,50,30][i]} height="4" rx="2" fill="#8794ad"/>
          <rect x={[160,164,152,162][i]} y={198 + i * 38} width={[32,28,40,30][i]} height="8" rx="4"
            fill={["rgba(52,211,153,0.15)","rgba(52,211,153,0.15)","rgba(248,113,113,0.15)","rgba(52,211,153,0.15)"][i]}/>
          <rect x={[165,168,158,167][i]} y={200 + i * 38} width={[22,18,28,20][i]} height="4" rx="2"
            fill={["#34d399","#34d399","#f87171","#34d399"][i]}/>
        </g>
      ))}
      {/* Bottom nav */}
      <rect x="28" y="363" width="184" height="35" fill="#0f1525"/>
      <circle cx="76" cy="380" r="3" fill="#1e2740"/>
      <circle cx="120" cy="380" r="7" fill="rgba(52,211,153,0.2)"/>
      <circle cx="120" cy="380" r="3" fill="#34d399"/>
      <circle cx="164" cy="380" r="3" fill="#1e2740"/>
    </svg>
  );
}

/* ─── Feature Card ──────────────────────────────────── */
function FeatureItem({ icon, title, desc }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#e8edf7", marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: "#8794ad", lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}

function StepBadge({ n, label, desc, color }) {
  return (
    <div style={{ textAlign: "center", flex: 1, minWidth: 160 }}>
      <div style={{ width: 52, height: 52, borderRadius: 99, background: color + "20", border: "2px solid " + color + "50", display: "grid", placeItems: "center", margin: "0 auto 12px", fontSize: 22, fontWeight: 900, color, fontFamily: "var(--display,system-ui)" }}>{n}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#e8edf7", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#8794ad", lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

/* ─── Main HomePage ─────────────────────────────────── */
export default function HomePage({ goLogin, goRegister }) {
  useEffect(() => {
    document.title = "Trợ Lý Tài Xế AI – Quản lý cuốc xe & điểm thưởng tự động";
    let desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = "Ứng dụng quản lý cuốc xe thông minh cho tài xế và kế toán nhóm xe. Tự động lọc cuốc xe từ Zalo, tính điểm barem, san điểm và xuất báo cáo. Tiết kiệm 80% thời gian quản lý.";
  }, []);

  const s = {
    wrap: { minHeight: "100vh", background: "#070b16", color: "#e8edf7", fontFamily: "'Inter',system-ui,sans-serif", overflowX: "hidden" },
    section: { maxWidth: 1100, margin: "0 auto", padding: "0 20px" },
    h2: { fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", fontWeight: 800, fontSize: "clamp(24px,4vw,36px)", color: "#e8edf7", marginBottom: 12 },
    accent: { color: "#34d399" },
    btnPrimary: { display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#04140a", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", boxShadow: "0 6px 24px rgba(34,197,94,.35)", letterSpacing: "-.01em", textDecoration: "none" },
    btnSecondary: { display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 26px", borderRadius: 12, border: "1.5px solid rgba(52,211,153,.4)", background: "rgba(52,211,153,.06)", color: "#34d399", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", textDecoration: "none" },
    btnOutline: { display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 12, border: "1.5px solid rgba(139,92,246,.5)", background: "rgba(139,92,246,.08)", color: "#a78bfa", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", textDecoration: "none" },
    divider: { height: 1, background: "linear-gradient(90deg,transparent,#1e2740,transparent)", margin: "0 auto", maxWidth: 800 },
  };

  return (
    <div style={s.wrap}>

      {/* ── NAV ─────────────────────────────────────── */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(7,11,22,.9)", backdropFilter: "blur(14px)", borderBottom: "1px solid #1e2740" }}>
        <div style={{ ...s.section, display: "flex", alignItems: "center", gap: 12, padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginRight: "auto" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#34d399,#06b6d4)", display: "grid", placeItems: "center", boxShadow: "0 0 16px rgba(52,211,153,.4)", flexShrink: 0 }}>
              <span style={{ fontSize: 18 }}>🚖</span>
            </div>
            <span style={{ fontFamily: "'Plus Jakarta Sans',system-ui", fontWeight: 800, fontSize: 17, letterSpacing: "-.02em" }}>
              Trợ Lý Tài Xế <span style={s.accent}>AI</span>
            </span>
          </div>
          <button onClick={goLogin} style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid #1e2740", background: "transparent", color: "#8794ad", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            Đăng nhập
          </button>
          <button onClick={goRegister} style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: "rgba(52,211,153,.15)", color: "#34d399", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            Đăng ký
          </button>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────── */}
      <div style={{ background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(52,211,153,0.12) 0%, transparent 70%)", paddingTop: 72, paddingBottom: 80 }}>
        <div style={{ ...s.section, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 99, background: "rgba(52,211,153,.1)", border: "1px solid rgba(52,211,153,.3)", fontSize: 13, color: "#34d399", fontWeight: 700, marginBottom: 24 }}>
            ✨ Quản lý cuốc xe thông minh cho nhóm tài xế
          </div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans',system-ui", fontWeight: 900, fontSize: "clamp(32px,6vw,64px)", lineHeight: 1.1, letterSpacing: "-.03em", margin: "0 0 20px" }}>
            Tự động lọc cuốc xe<br/>
            <span style={{ background: "linear-gradient(135deg,#34d399,#06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              từ Zalo – siêu nhanh
            </span>
          </h1>
          <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "#8794ad", maxWidth: 560, margin: "0 auto 36px", lineHeight: 1.7 }}>
            Trợ Lý Tài Xế AI tự động phát hiện cuốc xe trong nhóm Zalo, tính điểm thưởng theo barem và giúp kế toán quản lý điểm không mất một giây thủ công.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={goRegister} style={s.btnPrimary}>
              🚗 Đăng ký tài xế miễn phí
            </button>
            <a href={`${ADMIN_URL}/accountant`} style={s.btnOutline}>
              📊 Dành cho kế toán →
            </a>
          </div>
          <p style={{ marginTop: 14, fontSize: 12.5, color: "#4a5568" }}>Không cần thẻ tín dụng · Dùng thử ngay hôm nay</p>

          {/* Phone mockups */}
          <div style={{ display: "flex", justifyContent: "center", gap: "clamp(12px,4vw,48px)", marginTop: 56, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ opacity: 0.85, transform: "rotate(-4deg)", filter: "drop-shadow(0 24px 48px rgba(52,211,153,.15))" }}>
              <PhoneDriverIllustration />
            </div>
            <div style={{ opacity: 0.85, transform: "rotate(4deg)", filter: "drop-shadow(0 24px 48px rgba(139,92,246,.15))" }}>
              <PhoneAccountantIllustration />
            </div>
          </div>
        </div>
      </div>

      <div style={s.divider} />

      {/* ── APP TÀI XẾ ────────────────────────────────── */}
      <section style={{ padding: "72px 0" }}>
        <div style={{ ...s.section, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 48, alignItems: "center" }}>
          {/* Text side */}
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 99, background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.25)", fontSize: 12, color: "#22c55e", fontWeight: 700, marginBottom: 16 }}>
              🚗 App Tài Xế
            </div>
            <h2 style={s.h2}>Không bỏ lỡ<br/><span style={s.accent}>cuốc xe nào</span></h2>
            <p style={{ fontSize: 15, color: "#8794ad", lineHeight: 1.7, marginBottom: 28 }}>
              Ứng dụng tự động theo dõi các nhóm Zalo, phân loại và hiển thị cuốc xe theo thời gian thực. Tài xế chỉ cần xem và chọn cuốc phù hợp.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <FeatureItem icon="⚡" title="Lọc cuốc xe tự động" desc="Phát hiện và phân loại cuốc bao xe, ghép, hàng hoá, sân bay ngay khi xuất hiện trong nhóm Zalo." />
              <FeatureItem icon="🔔" title="Thông báo thời gian thực" desc="Nhận ngay khi có cuốc mới, không cần lướt chat thủ công từng nhóm." />
              <FeatureItem icon="🔍" title="Lọc theo loại xe & giờ" desc="Tìm cuốc theo Sedan/7 chỗ, theo giờ sắp tới, hôm nay hoặc ngày mai." />
              <FeatureItem icon="🗺️" title="Thông tin đầy đủ" desc="Xem điểm đón, điểm đến, giá, số chỗ và nội dung tin gốc chỉ trong một thẻ." />
            </div>
            <div style={{ marginTop: 28 }}>
              <button onClick={goRegister} style={s.btnPrimary}>Đăng ký tài xế ngay →</button>
            </div>
          </div>
          {/* Illustration side */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ maxWidth: 260, width: "100%", filter: "drop-shadow(0 32px 64px rgba(52,211,153,.2))" }}>
              <PhoneDriverIllustration />
            </div>
          </div>
        </div>
      </section>

      <div style={s.divider} />

      {/* ── APP KẾ TOÁN ───────────────────────────────── */}
      <section style={{ padding: "72px 0", background: "radial-gradient(ellipse 60% 50% at 80% 50%, rgba(139,92,246,0.06) 0%, transparent 70%)" }}>
        <div style={{ ...s.section, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 48, alignItems: "center" }}>
          {/* Illustration side */}
          <div style={{ display: "flex", justifyContent: "center", order: -1 }}>
            <div style={{ maxWidth: 260, width: "100%", filter: "drop-shadow(0 32px 64px rgba(139,92,246,.2))" }}>
              <PhoneAccountantIllustration />
            </div>
          </div>
          {/* Text side */}
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 99, background: "rgba(139,92,246,.1)", border: "1px solid rgba(139,92,246,.25)", fontSize: 12, color: "#a78bfa", fontWeight: 700, marginBottom: 16 }}>
              📊 App Kế Toán
            </div>
            <h2 style={s.h2}>Quản lý điểm<br/><span style={{ color: "#a78bfa" }}>không mất một giây</span></h2>
            <p style={{ fontSize: 15, color: "#8794ad", lineHeight: 1.7, marginBottom: 28 }}>
              Hệ thống tự động tích điểm cho tài xế khi nhận cuốc, hỗ trợ san điểm giữa thành viên và xuất báo cáo Excel chỉ một cú nhấp.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <FeatureItem icon="🏆" title="Tính điểm barem tự động" desc="Cấu hình barem một lần, hệ thống tự tính điểm theo từng loại cuốc và giá trị chuyến." />
              <FeatureItem icon="🔄" title="San điểm linh hoạt" desc="Tài xế gửi yêu cầu san điểm trong chat, kế toán duyệt một chạm – hỗ trợ nhiều người cùng lúc." />
              <FeatureItem icon="👥" title="Quản lý thành viên" desc="Theo dõi điểm từng thành viên, xem lịch sử giao dịch chi tiết và chỉnh điểm thủ công khi cần." />
              <FeatureItem icon="📥" title="Xuất báo cáo Excel" desc="Xuất danh sách điểm toàn nhóm ra file Excel với đầy đủ tên, SĐT và số điểm hiện tại." />
            </div>
            <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href={`${ADMIN_URL}/accountant`} style={s.btnOutline}>Đăng nhập kế toán →</a>
            </div>
          </div>
        </div>
      </section>

      <div style={s.divider} />

      {/* ── HOW IT WORKS ──────────────────────────────── */}
      <section style={{ padding: "72px 0" }}>
        <div style={{ ...s.section, textAlign: "center" }}>
          <h2 style={s.h2}>Bắt đầu chỉ <span style={s.accent}>3 bước</span></h2>
          <p style={{ color: "#8794ad", fontSize: 15, marginBottom: 48 }}>Không cần kỹ thuật, không cần cài đặt phức tạp</p>
          <div style={{ display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap" }}>
            <StepBadge n="1" color="#34d399" label="Đăng ký tài khoản" desc="Tạo tài khoản với số điện thoại, chờ admin duyệt trong vài phút." />
            <div style={{ width: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#1e2740", fontSize: 24, flexShrink: 0 }}>→</div>
            <StepBadge n="2" color="#06b6d4" label="Quét mã QR Zalo" desc="Kết nối tài khoản Zalo của bạn bằng cách quét QR trong app." />
            <div style={{ width: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#1e2740", fontSize: 24, flexShrink: 0 }}>→</div>
            <StepBadge n="3" color="#a78bfa" label="Xem cuốc xe & tích điểm" desc="Hệ thống tự động theo dõi nhóm và hiện cuốc mới ngay lập tức." />
          </div>
        </div>
      </section>

      <div style={s.divider} />

      {/* ── STATS ─────────────────────────────────────── */}
      <section style={{ padding: "56px 0", background: "rgba(15,21,37,0.5)" }}>
        <div style={{ ...s.section, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 24, textAlign: "center" }}>
          {[
            { val: "< 3s", label: "Phát hiện cuốc xe", color: "#34d399" },
            { val: "100%", label: "Tự động – không thủ công", color: "#06b6d4" },
            { val: "24/7", label: "Theo dõi liên tục", color: "#a78bfa" },
            { val: "Excel", label: "Xuất báo cáo 1 nhấp", color: "#f59e0b" },
          ].map(({ val, label, color }) => (
            <div key={label}>
              <div style={{ fontFamily: "'Plus Jakarta Sans',system-ui", fontWeight: 900, fontSize: "clamp(28px,5vw,44px)", color, letterSpacing: "-.03em", marginBottom: 6 }}>{val}</div>
              <div style={{ fontSize: 13.5, color: "#8794ad" }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={s.divider} />

      {/* ── CTA BOTTOM ────────────────────────────────── */}
      <section style={{ padding: "80px 0", background: "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(52,211,153,0.1) 0%, transparent 70%)" }}>
        <div style={{ ...s.section, textAlign: "center" }}>
          <h2 style={{ ...s.h2, fontSize: "clamp(26px,4vw,40px)" }}>
            Sẵn sàng bắt đầu?
          </h2>
          <p style={{ color: "#8794ad", fontSize: 15, maxWidth: 480, margin: "0 auto 36px", lineHeight: 1.7 }}>
            Hàng trăm tài xế đang tiết kiệm thời gian mỗi ngày. Tham gia ngay hôm nay.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={goRegister} style={s.btnPrimary}>
              🚗 Đăng ký tài xế ngay
            </button>
            <button onClick={goLogin} style={s.btnSecondary}>
              Đăng nhập
            </button>
            <a href={`${ADMIN_URL}/accountant`} style={s.btnOutline}>
              📊 Dành cho kế toán
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid #1e2740", padding: "28px 20px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(135deg,#34d399,#06b6d4)", display: "grid", placeItems: "center" }}>
            <span style={{ fontSize: 14 }}>🚖</span>
          </div>
          <span style={{ fontFamily: "'Plus Jakarta Sans',system-ui", fontWeight: 800, fontSize: 14 }}>
            Trợ Lý Tài Xế <span style={s.accent}>AI</span>
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: "#4a5568", margin: 0 }}>
          © {new Date().getFullYear()} Trợ Lý Tài Xế AI · Quản lý cuốc xe & điểm thưởng thông minh
        </p>
      </footer>
    </div>
  );
}
