import React, { useEffect, useState, useRef } from "react";
import { BookOpen, Check, X, AlertTriangle, ArrowUp, Phone, Home } from "lucide-react";

/* ─── Tông màu dùng chung với HomePage ─────────────────── */
const C = {
  bg: "#070b16", card: "#0f1525", line: "#1e2740",
  ink: "#e8edf7", dim: "#8794ad", faint: "#4a5568",
  ok: "#34d399", no: "#f87171", warn: "#fbbf24", info: "#60a5fa", purple: "#a78bfa",
};
const DISPLAY = "'Plus Jakarta Sans',system-ui,sans-serif";
const BODY = "'Inter',system-ui,sans-serif";
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

const SECTIONS = [
  { id: "nhanh",  label: "Tra nhanh" },
  { id: "dang",   label: "Đăng cuốc" },
  { id: "nhan",   label: "Nhận cuốc" },
  { id: "chot",   label: "Chốt cuốc" },
  { id: "san",    label: "San điểm" },
  { id: "ketoan", label: "Kế toán" },
  { id: "loi",    label: "Lỗi hay gặp" },
];

/* ─── Khối dùng lại ────────────────────────────────────── */
const Code = ({ children }) => (
  <div style={{ background: "rgba(0,0,0,.35)", border: `1px solid ${C.line}`, borderRadius: 10,
                padding: "11px 14px", fontFamily: MONO, fontSize: 13.5, lineHeight: 1.85,
                color: C.ink, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "10px 0" }}>
    {children}
  </div>
);

const Kbd = ({ children }) => (
  <span style={{ fontFamily: MONO, fontSize: "0.92em", background: "rgba(52,211,153,.12)",
                 color: C.ok, padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap" }}>{children}</span>
);

function Section({ id, n, title, children }) {
  return (
    <section id={id} style={{ scrollMarginTop: 118, marginBottom: 44 }}>
      <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: "clamp(19px,3.4vw,26px)",
                   letterSpacing: "-.02em", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(52,211,153,.13)",
                       border: "1px solid rgba(52,211,153,.3)", color: C.ok, fontSize: 14,
                       display: "grid", placeItems: "center", flexShrink: 0 }}>{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children, tone = "plain", style }) {
  const tones = {
    plain: { bg: C.card, bd: C.line },
    warn:  { bg: "rgba(251,191,36,.07)", bd: "rgba(251,191,36,.34)" },
    ok:    { bg: "rgba(52,211,153,.06)", bd: "rgba(52,211,153,.28)" },
    no:    { bg: "rgba(248,113,113,.06)", bd: "rgba(248,113,113,.28)" },
  }[tone];
  return (
    <div style={{ background: tones.bg, border: `1px solid ${tones.bd}`, borderRadius: 14,
                  padding: "15px 17px", margin: "12px 0", ...style }}>{children}</div>
  );
}

/* Bảng đúng/sai — trên mobile xếp dọc cho dễ đọc */
function DoDont({ rows, okLabel = "Viết được", noLabel = "Không nhận" }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1,
                  background: C.line, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", margin: "12px 0" }}>
      <div style={{ background: "rgba(52,211,153,.1)", padding: "8px 12px", fontSize: 12.5, fontWeight: 800, color: C.ok,
                    display: "flex", alignItems: "center", gap: 6 }}><Check size={13} />{okLabel}</div>
      <div style={{ background: "rgba(248,113,113,.1)", padding: "8px 12px", fontSize: 12.5, fontWeight: 800, color: C.no,
                    display: "flex", alignItems: "center", gap: 6 }}><X size={13} />{noLabel}</div>
      {rows.map(([a, b], i) => (
        <React.Fragment key={i}>
          <div style={{ background: C.bg, padding: "10px 12px", fontFamily: MONO, fontSize: 12.5, color: C.ink, wordBreak: "break-word" }}>{a}</div>
          <div style={{ background: C.bg, padding: "10px 12px", fontFamily: MONO, fontSize: 12.5, color: C.dim, wordBreak: "break-word" }}>{b}</div>
        </React.Fragment>
      ))}
    </div>
  );
}

function Table({ head, rows, cols = "1fr 1fr 1.2fr" }) {
  return (
    <div style={{ overflowX: "auto", margin: "12px 0", border: `1px solid ${C.line}`, borderRadius: 12 }}>
      <div style={{ minWidth: 440 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, background: C.card }}>
          {head.map((h, i) => (
            <div key={i} style={{ padding: "9px 12px", fontSize: 12, fontWeight: 800, color: C.dim, letterSpacing: ".01em" }}>{h}</div>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: cols, borderTop: `1px solid ${C.line}` }}>
            {r.map((cell, j) => (
              <div key={j} style={{ padding: "10px 12px", fontSize: 13, lineHeight: 1.55,
                                    color: j === 0 ? C.ink : C.dim, wordBreak: "break-word" }}>{cell}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Trang chính ──────────────────────────────────────── */
export default function GuidePage() {
  const [active, setActive] = useState("nhanh");
  const [showTop, setShowTop] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    document.title = "Hướng dẫn đăng & nhận cuốc xe — Trợ Lý Tài Xế AI";
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); }
    m.content = "Hướng dẫn cách đăng cuốc, nhận cuốc, chốt cuốc và san điểm trong nhóm Zalo để hệ thống tính điểm đúng. Có ví dụ cụ thể và các lỗi thường gặp.";
  }, []);

  // Tô sáng mục đang xem
  useEffect(() => {
    const obs = new IntersectionObserver(
      (ents) => {
        const vis = ents.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 }
    );
    SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { obs.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  // Cuộn chip đang chọn vào giữa thanh nav
  useEffect(() => {
    const chip = navRef.current?.querySelector(`[data-chip="${active}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: BODY, overflowX: "hidden" }}>

      {/* ── Thanh trên cùng ─────────────────────────── */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(7,11,22,.94)",
                       backdropFilter: "blur(14px)", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "11px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,#34d399,#06b6d4)",
                        display: "grid", placeItems: "center", flexShrink: 0, fontSize: 16 }}>🚖</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 15, marginRight: "auto", letterSpacing: "-.02em" }}>
            Hướng dẫn dùng nhóm
          </div>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8,
                               border: `1px solid ${C.line}`, color: C.dim, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>
            <Home size={12} /> Trang chủ
          </a>
        </div>

        {/* Thanh mục — cuộn ngang trên điện thoại */}
        <div ref={navRef} style={{ maxWidth: 880, margin: "0 auto", padding: "0 16px 9px",
                                   display: "flex", gap: 7, overflowX: "auto", scrollbarWidth: "none" }}>
          {SECTIONS.map(s => (
            <button key={s.id} data-chip={s.id} onClick={() => go(s.id)}
              style={{ padding: "5px 13px", borderRadius: 99, whiteSpace: "nowrap", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                       border: active === s.id ? "1px solid rgba(52,211,153,.45)" : `1px solid ${C.line}`,
                       background: active === s.id ? "rgba(52,211,153,.14)" : "transparent",
                       color: active === s.id ? C.ok : C.dim, transition: "all .15s" }}>
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "26px 16px 80px" }}>

        {/* ── Mở đầu ────────────────────────────────── */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 99,
                        background: "rgba(52,211,153,.1)", border: "1px solid rgba(52,211,153,.3)",
                        fontSize: 12.5, color: C.ok, fontWeight: 700, marginBottom: 15 }}>
            <BookOpen size={13} /> Dành cho tài xế trong nhóm
          </div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "clamp(26px,5.5vw,42px)", lineHeight: 1.15,
                       letterSpacing: "-.03em", margin: "0 0 14px" }}>
            Đăng & nhận cuốc<br />
            <span style={{ background: "linear-gradient(135deg,#34d399,#06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              sao cho đúng điểm
            </span>
          </h1>
          <p style={{ fontSize: 15, color: C.dim, lineHeight: 1.75, margin: 0, maxWidth: 620 }}>
            Hệ thống đọc tin nhắn trong nhóm và tự tính điểm. Viết đúng thì điểm vào đúng —
            viết sai thì máy không hiểu, điểm không được tính mà chẳng ai biết. Đọc 2 phút là dùng được cả đời.
          </p>
        </div>

        {/* 3 điều cốt lõi */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))", gap: 11, marginBottom: 40 }}>
          {[
            { n: "1", t: "Đăng cuốc", d: <>Phải có <b style={{ color: C.ink }}>giá tiền</b> và <b style={{ color: C.ink }}>loại cuốc</b></>, c: C.ok },
            { n: "2", t: "Nhận cuốc", d: <>Reply đúng tin, gõ <Kbd>ok</Kbd> thật ngắn</>, c: C.info },
            { n: "3", t: "Chốt cuốc", d: <>Reply tin tài xế, gõ <Kbd>ok ib</Kbd></>, c: C.purple },
          ].map(x => (
            <div key={x.n} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 17px" }}>
              <div style={{ width: 27, height: 27, borderRadius: 99, background: x.c + "22", border: `1px solid ${x.c}55`,
                            color: x.c, fontWeight: 900, fontSize: 13, display: "grid", placeItems: "center", marginBottom: 10 }}>{x.n}</div>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 5 }}>{x.t}</div>
              <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.65 }}>{x.d}</div>
            </div>
          ))}
        </div>

        {/* ── 0. Tra nhanh ──────────────────────────── */}
        <Section id="nhanh" n="0" title="Bảng tra nhanh">
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginTop: 0 }}>
            Lười đọc thì chỉ cần nhớ bảng này.
          </p>
          <Table
            cols="1.15fr 1.3fr 1.4fr"
            head={["Việc cần làm", "Gõ thế nào", "Ví dụ"]}
            rows={[
              ["Đăng cuốc", "[giờ] [loại] [đón] >> [đến] [giá]", <Kbd>19h 1k Mỹ Đình {">>"} Bắc Ninh 350k</Kbd>],
              ["Nhận cuốc", "Reply tin đăng, gõ ok", <Kbd>ok</Kbd>],
              ["Nhận kèm điểm", "ok [số]đ", <Kbd>ok 1.5đ</Kbd>],
              ["Chủ cuốc chốt", "Reply tin nhận, gõ ok ib", <Kbd>ok ib</Kbd>],
              ["Chốt kèm điểm", "ok ib [số]đ", <Kbd>ok ib 2đ</Kbd>],
              ["Cho điểm người khác", "san @tên [số]đ", <Kbd>san @Tuấn 5đ</Kbd>],
              ["Nhờ kế toán", "Tag @kế toán + nói rõ", <Kbd>@kế toán tính nhầm rồi</Kbd>],
            ]}
          />
        </Section>

        {/* ── 1. Đăng cuốc ──────────────────────────── */}
        <Section id="dang" n="1" title="Đăng cuốc">
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>Bắt buộc có giá tiền</h3>
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, margin: "0 0 4px" }}>
            Không có giá thì hệ thống không coi là cuốc xe.
          </p>
          <DoDont rows={[["350k", "ba trăm rưỡi"], ["1tr500  ·  1tr5", "1 triệu rưỡi"], ["1.500.000đ", "giá thỏa thuận"]]} />

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>Dấu ngăn tuyến đường</h3>
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, margin: "0 0 4px" }}>
            Ngăn <b style={{ color: C.ink }}>điểm đón</b> và <b style={{ color: C.ink }}>điểm đến</b> bằng dấu nào cũng được:
          </p>
          <Code>{">>      >>>      -->      --->      ->      →      ..."}</Code>
          <p style={{ fontSize: 14, color: C.dim, margin: "8px 0 4px" }}>
            Hoặc dùng chữ: <b style={{ color: C.ink }}>về · lên · đi · ra · sang</b>
          </p>
          <Code>{"Mỹ Đình >> Bắc Ninh 350k\nNội Bài --> Hà Đông 400k\nPhủ Lý về Hà Nội 500k"}</Code>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>Ghi rõ loại cuốc</h3>
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, margin: "0 0 4px" }}>
            Không ghi loại thì máy mặc định <b style={{ color: C.ink }}>Ghép 1 khách</b> — dễ tính thiếu điểm.
          </p>
          <Table
            cols="1fr 1fr 1.5fr"
            head={["Loại", "Gõ", "Ví dụ"]}
            rows={[
              ["Ghép 1 khách", <Kbd>1k</Kbd>, <Kbd>19h 1k Mỹ Đình {">>"} Bắc Ninh 350k</Kbd>],
              ["Ghép 2 khách", <Kbd>2k</Kbd>, <Kbd>19h 2k Mỹ Đình {">>"} Bắc Ninh 350k</Kbd>],
              ["Ghép 3 khách", <Kbd>3k</Kbd>, <Kbd>19h 3k Mỹ Đình {">>"} Bắc Ninh 350k</Kbd>],
              ["Bao xe", <Kbd>bao xe · bx · bx7</Kbd>, <Kbd>20h bx7 Hà Nội {">>"} Hải Phòng 900k</Kbd>],
              ["Bao xe 2 chiều", <>thêm <Kbd>2c</Kbd></>, <Kbd>bx 2c Hà Nội {">>"} Quảng Ninh 1tr2</Kbd>],
            ]}
          />

          <Card tone="warn">
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 10 }}>
              <AlertTriangle size={16} style={{ color: C.warn, flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontWeight: 800, fontSize: 15, color: C.warn }}>Chữ “bx” có 2 nghĩa — đọc kỹ chỗ này</div>
            </div>
            <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.7, margin: "0 0 10px" }}>
              <Kbd>bx</Kbd> vừa là <b style={{ color: C.ink }}>bao xe</b> vừa là <b style={{ color: C.ink }}>bến xe</b>. Hệ thống phân biệt:
            </p>
            <div style={{ background: "rgba(0,0,0,.25)", borderRadius: 10, padding: "11px 13px", fontSize: 13.5, lineHeight: 1.85, marginBottom: 10 }}>
              <div><b style={{ color: C.ok }}>bx</b> + 5 bến xe sau ⟶ hiểu là <b style={{ color: C.ok }}>BẾN XE</b></div>
              <div style={{ color: C.ink, fontWeight: 700, paddingLeft: 12 }}>Mỹ Đình · Giáp Bát · Nước Ngầm · Gia Lâm · Yên Nghĩa</div>
              <div style={{ marginTop: 6 }}><b style={{ color: C.warn }}>bx</b> + chỗ khác ⟶ hiểu là <b style={{ color: C.warn }}>BAO XE</b></div>
            </div>
            <Table
              cols="1.5fr 1fr"
              head={["Bạn gõ", "Máy hiểu"]}
              rows={[
                [<Kbd>bx Mỹ Đình {">>"} Bắc Ninh 300k</Kbd>, <span style={{ color: C.ok }}>Bến xe (ghép)</span>],
                [<Kbd>bx Giáp Bát {">>"} Nam Định 250k</Kbd>, <span style={{ color: C.ok }}>Bến xe (ghép)</span>],
                [<Kbd>bx Đồng Văn {">>"} Hà Nội 400k</Kbd>, <span style={{ color: C.warn }}>Bao xe</span>],
                [<Kbd>bx7 Hà Nội {">>"} Hải Phòng 900k</Kbd>, <span style={{ color: C.warn }}>Bao xe</span>],
              ]}
            />
            <p style={{ fontSize: 13.5, color: C.ink, margin: "10px 0 0", fontWeight: 600 }}>
              Muốn chắc chắn thì gõ đủ chữ: <Kbd>bao xe</Kbd> hoặc <Kbd>bến xe</Kbd>
            </p>
          </Card>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>Sân bay</h3>
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, margin: "0 0 4px" }}>
            Máy nhận ra qua: sân bay, Nội Bài, NB, T1, T2, sảnh, hạ cánh, hạ sân.
          </p>
          <Table
            cols="1fr 1fr 1.5fr"
            head={["Loại", "Gõ thêm", "Ví dụ"]}
            rows={[
              ["Sân bay đón", "đón · hạ sân · hạ cánh", <Kbd>VJ933 13h hạ sân T2 {">>"} Duy Tiên 600k</Kbd>],
              ["Sân bay tiễn", "tiễn · đưa đi", <Kbd>Tiễn T1 Nội Bài {">>"} Cầu Giấy 350k</Kbd>],
              ["Sân bay 2 chiều", "2c", <Kbd>Đón 2c Nội Bài {">>"} Hoàng Mai 700k</Kbd>],
            ]}
          />

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>Hàng / Ship</h3>
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, margin: "0 0 4px" }}>
            Từ khóa: ship, gửi hàng, chở hàng, giao hàng, bao hàng, kiện hàng.
          </p>
          <Code>{"Ship hàng Cầu Giấy >> Bắc Từ Liêm 150k\nCsct đồ 45kg gọn để cốp. KCN Quang Minh >> KCN DV1 300k"}</Code>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>Ghi giờ</h3>
          <Table
            cols="1fr 1.6fr"
            head={["Gõ", "Nghĩa"]}
            rows={[
              [<Kbd>8h · 13h30</Kbd>, "Giờ cụ thể"],
              [<Kbd>csct · đi ngay · gấp</Kbd>, "Đi ngay"],
              [<Kbd>30p</Kbd>, "30 phút nữa"],
              [<Kbd>sm · sáng mai · mai</Kbd>, "Ngày mai"],
            ]}
          />

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>Tự đặt điểm thay vì theo barem</h3>
          <Code>{"Mỹ Đình >> Hải Phòng 900k 2đ\nSân bay T2 >> Hà Đông 400k 1.5đ"}</Code>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>Đăng nhiều cuốc trong 1 tin</h3>
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, margin: "0 0 4px" }}>
            Mỗi cuốc một dòng riêng, mỗi dòng có giá riêng.
          </p>
          <Code>{"19h 1k Mỹ Đình >> Bắc Ninh 350k\n\n20h bao xe Hà Nội >> Hải Phòng 900k"}</Code>
          <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.7 }}>
            Tin nhiều cuốc sẽ vào <b style={{ color: C.ink }}>chờ kế toán duyệt</b>, vì máy không biết tài xế nhận cuốc nào.
          </p>
        </Section>

        {/* ── 2. Nhận cuốc ──────────────────────────── */}
        <Section id="nhan" n="2" title="Nhận cuốc">
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginTop: 0 }}>
            <b style={{ color: C.ink }}>Reply (trả lời) đúng vào tin đăng cuốc</b>, rồi gõ một trong các chữ:
          </p>
          <Code>{"ok        oke        oki        ib"}</Code>

          <Card tone="no" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 9 }}>
              <AlertTriangle size={17} style={{ color: C.no, flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: C.no, marginBottom: 4 }}>
                  Quan trọng nhất: tin nhận cuốc phải NGẮN
                </div>
                <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.7 }}>
                  Dưới <b style={{ color: C.ink }}>25 ký tự</b>. Viết dài là máy không hiểu đó là nhận cuốc,
                  và <b style={{ color: C.no }}>bạn mất điểm</b> mà không ai biết.
                </div>
              </div>
            </div>
            <DoDont
              okLabel="Nhận được"
              noLabel="MẤT ĐIỂM"
              rows={[
                ["ok", "ok anh nhé em nhận cuốc này"],
                ["ok 1.5đ", "ok Lịch tín 1.5đ. @kế toán lưu ý giúp"],
                ["oke 2d", "ok để em sắp xếp xe rồi báo lại sau"],
                ["ib", "ok bác ơi em đang ở gần đó"],
              ]}
            />
            <p style={{ fontSize: 13.5, color: C.ink, margin: "12px 0 6px", fontWeight: 700 }}>
              Muốn nói thêm gì thì gõ ok trước, rồi nhắn tin thứ hai riêng:
            </p>
            <Code>{"Tin 1:  ok\nTin 2:  Anh cho em xin số khách với ạ"}</Code>
          </Card>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>Không ghi giá tiền khi nhận</h3>
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, margin: 0 }}>
            <Kbd>ok 300k</Kbd> bị hiểu là <b style={{ color: C.ink }}>đăng cuốc mới</b>, không phải nhận cuốc.
          </p>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "24px 0 8px" }}>Nhận kèm thỏa thuận điểm</h3>
          <Code>{"ok 1đ\noke 1.5đ\nok 0,5đ\nib -+0,5đ"}</Code>
          <Card tone="warn">
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7 }}>
              Nhớ có <b>dấu cách</b> giữa <Kbd>ok</Kbd> và số. Gõ dính <Kbd>ok1.5đ</Kbd> thì máy
              <b style={{ color: C.warn }}> không đọc được số điểm</b>.
            </div>
          </Card>
        </Section>

        {/* ── 3. Chốt cuốc ──────────────────────────── */}
        <Section id="chot" n="3" title="Chủ cuốc chốt tài xế">
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginTop: 0 }}>
            <b style={{ color: C.ink }}>Reply đúng vào tin nhận cuốc của tài xế</b>, rồi gõ:
          </p>
          <Code>{"ok ib       okib       oki ib       ok.ib"}</Code>
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7 }}>Lúc này hệ thống mới ghi nhận điểm.</p>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "22px 0 8px" }}>Chốt kèm điểm khác</h3>
          <Code>{"ok ib 2đ\nokib 1.5d\nok ib +-2điểm"}</Code>
          <Card tone="warn">
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7 }}>
              Nhớ có <b>dấu cách</b> trước số. Gõ <Kbd>okib1.5</Kbd> thì vẫn chốt được cuốc
              nhưng <b style={{ color: C.warn }}>số 1.5 bị bỏ qua</b>, máy tính theo barem.
            </div>
          </Card>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "22px 0 8px" }}>Cuốc miễn phí</h3>
          <Code>{"ok ib free"}</Code>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "22px 0 8px" }}>Điểm nào được ưu tiên</h3>
          <Table
            cols="0.75fr 1.5fr 1fr"
            head={["Ưu tiên", "Nguồn điểm", "Ví dụ"]}
            rows={[
              [<span style={{ color: C.ok, fontWeight: 800 }}>1 — cao nhất</span>, "Điểm trong tin chốt của chủ cuốc", <Kbd>ok ib 2đ</Kbd>],
              ["2", "Điểm trong tin nhận của tài xế", <Kbd>ok 1.5đ</Kbd>],
              ["3", "Điểm ghi trong tin đăng cuốc", <Kbd>… 350k 1đ</Kbd>],
              [<span style={{ color: C.faint }}>4 — thấp nhất</span>, "Barem tự động", "(không ghi gì)"],
            ]}
          />
        </Section>

        {/* ── 4. San điểm ───────────────────────────── */}
        <Section id="san" n="4" title="San điểm (cho / chuyển điểm)">
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>Cho một người</h3>
          <Code>{"san @Tuấn 5đ"}</Code>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "20px 0 8px" }}>Cho nhiều người cùng lúc</h3>
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, margin: "0 0 4px" }}>
            Ghi số điểm <b style={{ color: C.ink }}>ngay sau mỗi tên</b>:
          </p>
          <Code>{"san @Tuấn 2đ @Hùng 3đ @Minh 1.5đ"}</Code>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "20px 0 8px" }}>Trả điểm cho kế toán</h3>
          <Code>{"san @kế toán 40đ"}</Code>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "20px 0 8px" }}>Quy tắc</h3>
          <Table
            cols="1fr 1.7fr"
            head={["Quy tắc", "Chi tiết"]}
            rows={[
              ["Tối đa", <><b style={{ color: C.ink }}>200đ</b> mỗi lần</>],
              ["Bắt buộc", <>Có đơn vị <Kbd>đ</Kbd> hoặc <Kbd>d</Kbd> sau số</>],
              ["Bắt buộc", "Số điểm đứng ngay sau tên người nhận"],
              ["Kết quả", "Vào chờ kế toán duyệt, không cộng/trừ ngay"],
            ]}
          />
          <DoDont
            okLabel="Đúng"
            noLabel="Sai"
            rows={[
              ["san @Tuấn 5đ", "san @Tuấn 5   (thiếu chữ đ)"],
              ["san @Tuấn 2đ @Hùng 3đ", "san 2đ cho @Tuấn   (số trước tên)"],
              ["san @Tuấn 100đ", "san @Tuấn 500đ   (quá 200đ)"],
            ]}
          />
        </Section>

        {/* ── 5. Kế toán ────────────────────────────── */}
        <Section id="ketoan" n="5" title="Nhờ kế toán xử lý">
          <p style={{ fontSize: 14, color: C.dim, lineHeight: 1.7, marginTop: 0 }}>
            <b style={{ color: C.ink }}>Reply vào tin cuốc cần sửa</b>, tag <Kbd>@kế toán</Kbd> kèm lệnh:
          </p>
          <Table
            cols="1.1fr 1fr 1.2fr"
            head={["Việc", "Gõ", "Ví dụ"]}
            rows={[
              ["Hủy cuốc, hoàn điểm", <Kbd>lịch hủy</Kbd>, <Kbd>lịch hủy @kế toán</Kbd>],
              ["Cuốc miễn phí", <Kbd>lịch free</Kbd>, <Kbd>lịch free @kế toán</Kbd>],
              ["Sửa lại số điểm", <Kbd>lịch [số]</Kbd>, <Kbd>lịch 2đ @kế toán</Kbd>],
            ]}
          />
          <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.7 }}>
            Sửa điểm 1 cuốc tối đa <b style={{ color: C.ink }}>20đ</b>.
          </p>

          <Card tone="ok" style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 7, color: C.ok }}>
              Không nhớ lệnh cũng không sao
            </div>
            <p style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.75, margin: "0 0 10px" }}>
              Có tranh chấp, thắc mắc hay bất kỳ việc gì — cứ tag <Kbd>@kế toán</Kbd> rồi nói rõ bằng lời thường:
            </p>
            <Code>{"@kế toán cuốc này em với anh Tuấn thỏa thuận 2đ mà máy tính 1đ"}</Code>
            <p style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.75, margin: "10px 0 0" }}>
              <b>Yên tâm:</b> mọi tin có tag @kế toán đều vào danh sách <b style={{ color: C.ok }}>chờ kế toán xem</b>,
              kể cả khi máy không hiểu bạn muốn gì. Kế toán sẽ đọc và xử lý tay — không bị trôi mất.
            </p>
          </Card>
        </Section>

        {/* ── 6. Lỗi hay gặp ────────────────────────── */}
        <Section id="loi" n="6" title="Lỗi hay gặp">
          <Table
            cols="1.15fr 1fr 1.15fr"
            head={["Tình huống", "Hậu quả", "Cách sửa"]}
            rows={[
              ["Đăng cuốc quên giá", "Không tính là cuốc xe", <>Luôn ghi giá: <Kbd>350k</Kbd></>],
              ["Nhận cuốc viết dài dòng", <span style={{ color: C.no }}>Mất điểm, không ai biết</span>, <>Gõ <Kbd>ok</Kbd>, nói thêm ở tin sau</>],
              [<>Nhận cuốc ghi giá <Kbd>ok 300k</Kbd></>, "Bị hiểu là cuốc mới", <>Chỉ ghi điểm: <Kbd>ok 1đ</Kbd></>],
              [<>Gõ dính <Kbd>ok1.5đ</Kbd> · <Kbd>okib1.5</Kbd></>, "Số điểm bị bỏ qua", <>Thêm dấu cách: <Kbd>ok 1.5đ</Kbd></>],
              [<>Không reply mà gõ <Kbd>ok</Kbd> riêng</>, "Máy không biết nhận cuốc nào", "Phải reply đúng tin đăng"],
              [<>Chủ cuốc tự <Kbd>ok ib</Kbd> tin mình</>, "Không tính điểm", "Reply tin của tài xế nhận"],
              [<><Kbd>san @Tuấn 5</Kbd> thiếu chữ đ</>, "Không nhận được lệnh", <><Kbd>san @Tuấn 5đ</Kbd></>],
              ["San quá 200đ", "Không nhận được lệnh", "Chia làm nhiều lần"],
            ]}
          />
        </Section>

        {/* ── Kết ───────────────────────────────────── */}
        <div style={{ background: "linear-gradient(135deg,rgba(52,211,153,.1),rgba(6,182,212,.06))",
                      border: "1px solid rgba(52,211,153,.3)", borderRadius: 16, padding: "24px 22px", marginTop: 40 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 19, marginBottom: 14 }}>Ba câu thần chú</div>
          {[
            [<>Đăng cuốc</>, <>nhớ <b style={{ color: C.ink }}>giá tiền</b> và <b style={{ color: C.ink }}>loại cuốc</b></>],
            [<>Nhận cuốc</>, <>reply đúng tin, gõ <Kbd>ok</Kbd> thật ngắn</>],
            [<>Chốt cuốc</>, <>reply tin tài xế, gõ <Kbd>ok ib</Kbd></>],
          ].map(([a, b], i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 9, fontSize: 14.5, lineHeight: 1.7 }}>
              <span style={{ color: C.ok, fontWeight: 800, minWidth: 86 }}>{a}</span>
              <span style={{ color: C.dim }}>{b}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 16, paddingTop: 15, fontSize: 14, color: C.dim, lineHeight: 1.75 }}>
            Có gì thắc mắc — tag <Kbd>@kế toán</Kbd> và nói rõ. Luôn có người xem.
          </div>
          <a href="tel:0853132353"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 16, padding: "10px 18px",
                     borderRadius: 10, background: "rgba(52,211,153,.16)", border: "1px solid rgba(52,211,153,.4)",
                     color: C.ok, fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
            <Phone size={14} /> Hỗ trợ: 085 313 2353
          </a>
        </div>
      </main>

      {/* ── Chân trang ──────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${C.line}`, padding: "22px 16px", textAlign: "center" }}>
        <p style={{ fontSize: 12.5, color: C.faint, margin: 0 }}>
          © {new Date().getFullYear()} Trợ Lý Tài Xế AI · Quản lý cuốc xe & điểm thưởng thông minh
        </p>
      </footer>

      {/* Nút lên đầu trang */}
      {showTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Lên đầu trang"
          style={{ position: "fixed", right: 16, bottom: 20, zIndex: 60, width: 42, height: 42, borderRadius: 99,
                   background: C.card, border: `1px solid ${C.line}`, color: C.ink, cursor: "pointer",
                   display: "grid", placeItems: "center", boxShadow: "0 8px 24px rgba(0,0,0,.45)" }}>
          <ArrowUp size={17} />
        </button>
      )}
    </div>
  );
}
