import { useState, useRef, useEffect } from "react";

// ── THEME ──────────────────────────────────────────────────────
const T = {
  bg: "#0a0a0f",
  surface: "#13131a",
  card: "#1a1a24",
  border: "#2a2a3a",
  borderLight: "#333348",
  violet: "#7c3aed",
  violetLight: "#9d5cf6",
  violetDim: "#2d1b69",
  violetGlow: "rgba(124,58,237,0.15)",
  gold: "#f0c060",
  text: "#f0f0f8",
  textMid: "#9898b8",
  textDim: "#555570",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#3b82f6",
};

const css = {
  card: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 },
  inp: { width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, fontSize: 13, color: T.text, boxSizing: "border-box", outline: "none" },
  lbl: { fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 5, display: "block", letterSpacing: ".05em", textTransform: "uppercase" },
  btn: (bg, disabled) => ({ padding: "11px 18px", borderRadius: 10, border: "none", background: disabled ? T.violetDim : bg, color: disabled ? T.textDim : "#fff", fontWeight: 700, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", transition: "opacity .15s" }),
  chip: (bg, col) => ({ fontSize: 10, background: bg, color: col, borderRadius: 6, padding: "2px 8px", fontWeight: 700, letterSpacing: ".03em" }),
};

const CATEGORIES = ["Communication", "Logistics", "Venue Quality", "Price/Value", "Punctuality", "Attitude/Service", "Other"];
const SOURCES = ["WhatsApp (text)", "WhatsApp (screenshot)", "Email (paste)", "Phone Call", "In-person Meeting"];
const STATUS_LIST = ["Pending", "In Progress", "Resolved"];
const TABS = ["New", "Dashboard", "Tasks", "Contacts"];

const SENT_KW = {
  neg: ["problem","bad","fail","error","late","poor","dirty","broken","complaint","issue","terrible","horrible","slow","unacceptable","problema","mal","falla","tarde","queja","pésimo"],
  pos: ["excellent","perfect","great","fantastic","flawless","punctual","professional","recommend","satisfied","incredible","wonderful","fast","attentive","excelente","perfecto","genial","fantástico","impecable"],
};
const detectSentiment = t => {
  const s = t.toLowerCase(); let sc = 0;
  SENT_KW.neg.forEach(k => { if (s.includes(k)) sc--; });
  SENT_KW.pos.forEach(k => { if (s.includes(k)) sc++; });
  return sc > 0 ? "positive" : sc < 0 ? "negative" : "neutral";
};
const sColor = s => ({ positive: T.green, negative: T.red, neutral: T.amber }[s]);
const sEmoji = s => ({ positive: "✦", negative: "✕", neutral: "◆" }[s]);

const ANALYZE_PROMPT = `You are a concierge liaison assistant for PrimaVIP, a luxury dining platform.
Analyze the feedback and respond ONLY in this exact format, no markdown, no asterisks:

SUMMARY: [2-3 line executive summary]
POINT: [key point 1]
POINT: [key point 2]
POINT: [key point 3]
TASK: [action 1] | PRIORITY: [High/Medium/Low] | CATEGORY: [category]
TASK: [action 2] | PRIORITY: [High/Medium/Low] | CATEGORY: [category]
TASK: [action 3] | PRIORITY: [High/Medium/Low] | CATEGORY: [category]
SOLUTION: [concrete next step]`;

async function callClaude(sys, userContent, mcpServers) {
  const body = { model: "claude-sonnet-4-20250514", max_tokens: 1500, system: sys, messages: [{ role: "user", content: userContent }] };
  if (mcpServers) body.mcp_servers = mcpServers;
  const r = await fetch("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  return d.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
}

function parseAnalysis(text) {
  const tasks = [], points = []; let summary = "", solution = "";
  text.split("\n").forEach(line => {
    if (line.startsWith("SUMMARY:")) summary = line.replace("SUMMARY:", "").trim();
    else if (line.startsWith("POINT:")) points.push(line.replace("POINT:", "").trim());
    else if (line.startsWith("SOLUTION:")) solution = line.replace("SOLUTION:", "").trim();
    else if (line.startsWith("TASK:")) {
      const tM = line.match(/TASK:\s*(.+?)\s*\|/), pM = line.match(/PRIORITY:\s*(\w+)/), cM = line.match(/CATEGORY:\s*(.+)/);
      if (tM) tasks.push({ id: Date.now() + Math.random(), title: tM[1].trim(), priority: pM?.[1]?.trim() || "Medium", category: cM?.[1]?.trim() || "Other", status: "Pending", createdAt: new Date().toLocaleDateString("en-GB"), inCalendar: false });
    }
  });
  return { summary, points, solution, tasks };
}

// ── STORAGE HELPERS ──────────────────────────────────────────
async function load(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
async function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── MODAL WRAPPER ─────────────────────────────────────────────
function Modal({ onClose, title, children, maxW = 420 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 24, width: "100%", maxWidth: maxW, boxShadow: `0 0 60px rgba(124,58,237,.2)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: T.textDim, fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState(0);
  const [fbType, setFbType] = useState("venue");
  const [text, setText] = useState("");
  const [entity, setEntity] = useState("");
  const [source, setSource] = useState(SOURCES[0]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [venues, setVenues] = useState([]);
  const [concierges, setConcierges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState(null);
  // image
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgExtracting, setImgExtracting] = useState(false);
  const [imgExtracted, setImgExtracted] = useState(false);
  const fileRef = useRef();
  // calendar modal
  const [calModal, setCalModal] = useState(null);
  const [calForm, setCalForm] = useState({ title: "", date: "", time: "09:00", duration: "60" });
  const [calLoading, setCalLoading] = useState(false);
  const [calMsg, setCalMsg] = useState("");
  // contacts
  const [contactTab, setContactTab] = useState("venues");
  const [newVenue, setNewVenue] = useState("");
  const [newConcierge, setNewConcierge] = useState("");
  const [csvModal, setCsvModal] = useState(null);
  const [csvText, setCsvText] = useState("");
  const csvFileRef = useRef();
  // loaded
  const [dataLoaded, setDataLoaded] = useState(false);

  // ── LOAD FROM STORAGE ──
  useEffect(() => {
    (async () => {
      const [fb, tk, vn, cn] = await Promise.all([load("feedbacks"), load("tasks"), load("venues"), load("concierges")]);
      if (fb) setFeedbacks(fb);
      if (tk) setTasks(tk);
      if (vn) setVenues(vn); else setVenues(["Venue A", "Venue B"]);
      if (cn) setConcierges(cn); else setConcierges(["Concierge 1", "Concierge 2"]);
      setDataLoaded(true);
    })();
  }, []);

  // ── PERSIST ON CHANGE ──
  useEffect(() => { if (dataLoaded) save("feedbacks", feedbacks); }, [feedbacks]);
  useEffect(() => { if (dataLoaded) save("tasks", tasks); }, [tasks]);
  useEffect(() => { if (dataLoaded) save("venues", venues); }, [venues]);
  useEffect(() => { if (dataLoaded) save("concierges", concierges); }, [concierges]);

  const entityList = fbType === "venue" ? venues : concierges;
  const isImg = source === "WhatsApp (screenshot)";

  // ── IMAGE ──
  function handleImg(file) {
    if (!file) return;
    setImgFile(file); setImgExtracted(false);
    setImgPreview(URL.createObjectURL(file)); setText("");
  }
  async function extractImg() {
    if (!imgFile) return; setImgExtracting(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const base64 = ev.target.result.split(",")[1];
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: "Transcribe all text from this WhatsApp screenshot chronologically. No commentary.", messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: imgFile.type || "image/jpeg", data: base64 } }, { type: "text", text: "Transcribe all messages." }] }] }),
        });
        const d = await r.json();
        setText(d.content?.[0]?.text || ""); setImgExtracted(true);
      } catch { setText("[Error extracting]"); }
      setImgExtracting(false);
    };
    reader.readAsDataURL(imgFile);
  }

  // ── ANALYZE ──
  async function handleSubmit() {
    if (!text.trim() || !entity) return; setLoading(true);
    const sentiment = detectSentiment(text);
    const raw = await callClaude(ANALYZE_PROMPT, `Type: ${fbType}\nEntity: ${entity}\nCategory: ${category}\nChannel: ${source}\nMessage:\n"${text}"`);
    const parsed = parseAnalysis(raw);
    const fb = { id: Date.now(), text, entity, type: fbType, source, category, sentiment, analysis: parsed, date: new Date().toLocaleDateString("en-GB"), taskCount: parsed.tasks.length, imgPreview: isImg ? imgPreview : null };
    setFeedbacks(p => [fb, ...p]);
    setTasks(p => [...parsed.tasks, ...p]);
    setActiveAnalysis(fb);
    setText(""); setImgFile(null); setImgPreview(null); setImgExtracted(false);
    setLoading(false);
  }

  // ── CALENDAR ──
  function handleCalendar() {
    if (!calForm.date || !calForm.title) return;
    const [year, month, day] = calForm.date.split("-");
    const [hour, minute] = calForm.time.split(":");
    const start = `${year}${month}${day}T${hour}${minute}00`;
    const endDate = new Date(calForm.date + "T" + calForm.time);
    endDate.setMinutes(endDate.getMinutes() + parseInt(calForm.duration));
    const endY = endDate.getFullYear();
    const endM = String(endDate.getMonth()+1).padStart(2,"0");
    const endD = String(endDate.getDate()).padStart(2,"0");
    const endH = String(endDate.getHours()).padStart(2,"0");
    const endMin = String(endDate.getMinutes()).padStart(2,"0");
    const end = `${endY}${endM}${endD}T${endH}${endMin}00`;
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calForm.title)}&dates=${start}/${end}&details=${encodeURIComponent("PrimaVIP Concierge Hub task")}`;
    window.open(url, "_blank");
    setCalMsg("✓ Google Calendar abierto — guardá el evento ahí");
    setTasks(p => p.map(t => t.id === calModal.id ? { ...t, inCalendar: true } : t));
  }

  // ── CSV IMPORT ──
  function importCSV(type) {
    const lines = csvText.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    // detect headers
    const header = lines[0].toLowerCase();
    const cols = header.split(",").map(c => c.replace(/"/g, "").trim());
    const firstIdx = cols.indexOf("first name");
    const lastIdx = cols.indexOf("last name");
    const nameIdx = cols.indexOf("name");
    const dataLines = lines.slice(1).filter(l => l);
    const names = dataLines.map(line => {
      const parts = line.split(",").map(c => c.replace(/"/g, "").trim());
      if (firstIdx >= 0 && lastIdx >= 0) {
        return `${parts[firstIdx] || ""} ${parts[lastIdx] || ""}`.trim();
      } else if (nameIdx >= 0) {
        return parts[nameIdx] || "";
      } else {
        return parts[0] || "";
      }
    }).filter(Boolean);
    if (type === "venues") setVenues(p => [...new Set([...p, ...names])]);
    else setConcierges(p => [...new Set([...p, ...names])]);
    setCsvModal(null); setCsvText("");
  }

  const pendingCount = tasks.filter(t => t.status === "Pending").length;
  const negCount = feedbacks.filter(f => f.sentiment === "negative").length;

  // ── RENDER ──
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: T.bg, minHeight: "100vh", color: T.text }}>
      {/* HEADER */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${T.violet}, ${T.violetLight})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>◈</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: "-.01em" }}>Concierge Hub</div>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: ".08em", textTransform: "uppercase" }}>PrimaVIP</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {pendingCount > 0 && <span style={css.chip(T.violetDim, T.violetLight)}>{pendingCount} pending</span>}
          {negCount > 0 && <span style={css.chip("rgba(239,68,68,.15)", T.red)}>{negCount} negative</span>}
        </div>
      </div>

      {/* NAV */}
      <div style={{ display: "flex", padding: "0 20px", background: T.surface, borderBottom: `1px solid ${T.border}`, gap: 2 }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{ padding: "12px 16px", border: "none", cursor: "pointer", background: "none", color: tab === i ? T.violetLight : T.textDim, fontWeight: tab === i ? 700 : 500, fontSize: 13, borderBottom: `2px solid ${tab === i ? T.violet : "transparent"}`, transition: "all .15s" }}>{t}</button>
        ))}
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px" }}>

        {/* ══ TAB 0: NEW FEEDBACK ══ */}
        {tab === 0 && (
          <div>
            {activeAnalysis && (
              <div style={{ ...css.card, border: `1px solid ${T.violet}`, background: `linear-gradient(135deg, ${T.card}, #1d1030)`, marginBottom: 16, position: "relative" }}>
                <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, background: T.violetGlow, borderRadius: "0 16px 0 80px", pointerEvents: "none" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: T.violet, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>Analysis Complete</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{activeAnalysis.entity}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <span style={css.chip(T.violetDim, T.violetLight)}>{activeAnalysis.type === "venue" ? "Venue" : "Concierge"}</span>
                      <span style={css.chip(`rgba(${activeAnalysis.sentiment === "positive" ? "34,197,94" : activeAnalysis.sentiment === "negative" ? "239,68,68" : "245,158,11"},.15)`, sColor(activeAnalysis.sentiment))}>{sEmoji(activeAnalysis.sentiment)} {activeAnalysis.sentiment}</span>
                    </div>
                  </div>
                  <button onClick={() => setActiveAnalysis(null)} style={{ border: "none", background: "none", cursor: "pointer", color: T.textDim, fontSize: 20 }}>×</button>
                </div>
                {activeAnalysis.analysis.summary && <p style={{ fontSize: 13, color: T.textMid, lineHeight: 1.7, marginBottom: 10 }}>{activeAnalysis.analysis.summary}</p>}
                {activeAnalysis.analysis.points.length > 0 && (
                  <ul style={{ margin: "0 0 10px 0", padding: "0 0 0 16px" }}>
                    {activeAnalysis.analysis.points.map((p, i) => <li key={i} style={{ fontSize: 12, color: T.textMid, marginBottom: 4, lineHeight: 1.6 }}>{p}</li>)}
                  </ul>
                )}
                {activeAnalysis.analysis.solution && (
                  <div style={{ background: T.violetGlow, border: `1px solid ${T.violetDim}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: T.violetLight, marginBottom: 12 }}>
                    → {activeAnalysis.analysis.solution}
                  </div>
                )}
                {activeAnalysis.taskCount > 0 && (
                  <div style={{ fontSize: 12, color: T.green, background: "rgba(34,197,94,.08)", borderRadius: 8, padding: "7px 12px", border: "1px solid rgba(34,197,94,.2)" }}>
                    ✦ {activeAnalysis.taskCount} task{activeAnalysis.taskCount > 1 ? "s" : ""} created — view in Tasks tab
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[{ key: "venue", label: "Venue / Supplier" }, { key: "concierge", label: "Concierge" }].map(ft => (
                <button key={ft.key} onClick={() => { setFbType(ft.key); setEntity(""); }} style={{ padding: "14px", borderRadius: 12, border: `2px solid ${fbType === ft.key ? T.violet : T.border}`, background: fbType === ft.key ? T.violetGlow : T.card, color: fbType === ft.key ? T.violetLight : T.textMid, fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all .15s" }}>
                  {ft.label}
                </button>
              ))}
            </div>

            <div style={{ ...css.card, marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={css.lbl}>{fbType === "venue" ? "Venue / Supplier" : "Concierge"}</label>
                  <select value={entity} onChange={e => setEntity(e.target.value)} style={{ ...css.inp }}>
                    <option value="">Select...</option>
                    {entityList.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={css.lbl}>Channel</label>
                  <select value={source} onChange={e => { setSource(e.target.value); setText(""); setImgFile(null); setImgPreview(null); setImgExtracted(false); }} style={css.inp}>
                    {SOURCES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={css.lbl}>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} style={css.inp}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {isImg ? (
                <div style={{ marginBottom: 14 }}>
                  <label style={css.lbl}>WhatsApp Screenshot</label>
                  <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleImg(e.dataTransfer.files?.[0]); }} onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${imgPreview ? T.violet : T.border}`, borderRadius: 12, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: imgPreview ? T.violetGlow : T.surface, marginBottom: 10 }}>
                    {imgPreview
                      ? <div><img src={imgPreview} alt="" style={{ maxHeight: 140, maxWidth: "100%", borderRadius: 8, marginBottom: 8 }} /><div style={{ fontSize: 11, color: T.textDim }}>Tap to change</div></div>
                      : <div><div style={{ fontSize: 28, marginBottom: 8, opacity: .5 }}>📱</div><div style={{ fontSize: 13, color: T.textMid }}>Drag or tap to upload screenshot</div></div>
                    }
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleImg(e.target.files?.[0])} />
                  </div>
                  {imgFile && !imgExtracted && <button onClick={extractImg} disabled={imgExtracting} style={{ ...css.btn(T.violet, imgExtracting), width: "100%", marginBottom: 8 }}>{imgExtracting ? "Reading..." : "Extract text from image"}</button>}
                  {imgExtracted && <textarea value={text} onChange={e => setText(e.target.value)} rows={4} style={{ ...css.inp, resize: "vertical", lineHeight: 1.7, borderColor: T.violet }} />}
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <label style={css.lbl}>Feedback</label>
                  <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste or type feedback here..." rows={5} style={{ ...css.inp, resize: "vertical", lineHeight: 1.7 }} />
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading || !text.trim() || !entity || (isImg && !imgExtracted)} style={{ ...css.btn(T.violet, loading || !text.trim() || !entity || (isImg && !imgExtracted)), width: "100%" }}>
                {loading ? "Analyzing..." : "Analyze & Generate Tasks →"}
              </button>
            </div>

            {feedbacks.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, marginBottom: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>Recent</div>
                {feedbacks.slice(0, 5).map(fb => (
                  <div key={fb.id} onClick={() => setActiveAnalysis(fb)} style={{ ...css.card, cursor: "pointer", borderLeft: `3px solid ${sColor(fb.sentiment)}`, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    {fb.imgPreview && <img src={fb.imgPreview} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{fb.entity}</span>
                        <span style={{ fontSize: 10, color: T.textDim }}>{fb.date}</span>
                      </div>
                      <div style={{ display: "flex", gap: 5, marginBottom: 4 }}>
                        <span style={css.chip(T.violetDim, T.violetLight)}>{fb.type}</span>
                        <span style={css.chip(`rgba(${fb.sentiment === "positive" ? "34,197,94" : fb.sentiment === "negative" ? "239,68,68" : "245,158,11"},.12)`, sColor(fb.sentiment))}>{fb.sentiment}</span>
                      </div>
                      <div style={{ fontSize: 12, color: T.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fb.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB 1: DASHBOARD ══ */}
        {tab === 1 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Total Feedbacks", value: feedbacks.length, color: T.violet, icon: "◈" },
                { label: "Pending Tasks", value: pendingCount, color: T.amber, icon: "◆" },
                { label: "Negative", value: negCount, color: T.red, icon: "✕" },
                { label: "Positive", value: feedbacks.filter(f => f.sentiment === "positive").length, color: T.green, icon: "✦" },
              ].map((s, i) => (
                <div key={i} style={{ ...css.card, textAlign: "center", padding: 20 }}>
                  <div style={{ fontSize: 22, color: s.color, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: T.textDim, textTransform: "uppercase", letterSpacing: ".06em" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {feedbacks.length > 0 ? (
              <>
                <div style={{ ...css.card, marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>By Entity</div>
                  {Object.entries(feedbacks.reduce((a, f) => { if (!a[f.entity]) a[f.entity] = { total: 0, neg: 0, pos: 0 }; a[f.entity].total++; if (f.sentiment === "negative") a[f.entity].neg++; if (f.sentiment === "positive") a[f.entity].pos++; return a; }, {})).map(([name, s]) => (
                    <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 13, color: T.textMid }}>{name}</span>
                      <div style={{ display: "flex", gap: 5 }}>
                        <span style={css.chip("rgba(34,197,94,.1)", T.green)}>✦ {s.pos}</span>
                        <span style={css.chip("rgba(239,68,68,.1)", T.red)}>✕ {s.neg}</span>
                        <span style={css.chip(T.surface, T.textMid)}>{s.total}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ ...css.card, marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>By Category</div>
                  {Object.entries(feedbacks.reduce((a, f) => { a[f.category] = (a[f.category] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                    <div key={c} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                        <span style={{ color: T.textMid }}>{c}</span>
                        <span style={{ fontWeight: 700, color: T.violet }}>{n}</span>
                      </div>
                      <div style={{ background: T.border, borderRadius: 99, height: 4 }}>
                        <div style={{ background: `linear-gradient(90deg, ${T.violet}, ${T.violetLight})`, height: 4, borderRadius: 99, width: `${(n / feedbacks.length) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", color: T.textDim, padding: 60, fontSize: 13 }}>No data yet. Add your first feedback.</div>
            )}
          </div>
        )}

        {/* ══ TAB 2: TASKS ══ */}
        {tab === 2 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Tasks</div>
              <span style={css.chip(T.violetDim, T.violetLight)}>{tasks.length} total · {pendingCount} pending</span>
            </div>
            {tasks.length === 0 && <div style={{ textAlign: "center", color: T.textDim, padding: 60, fontSize: 13 }}>Tasks appear here after analyzing feedback.</div>}
            {STATUS_LIST.map(st => {
              const grp = tasks.filter(t => t.status === st); if (!grp.length) return null;
              return (
                <div key={st} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>
                    {st === "Pending" ? "⏳" : st === "In Progress" ? "◆" : "✦"} {st} ({grp.length})
                  </div>
                  {grp.map(t => (
                    <div key={t.id} style={{ ...css.card, marginBottom: 8, borderLeft: `3px solid ${t.priority === "High" ? T.red : t.priority === "Medium" ? T.amber : T.green}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>{t.title}</div>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                            <span style={css.chip(t.priority === "High" ? "rgba(239,68,68,.12)" : t.priority === "Medium" ? "rgba(245,158,11,.12)" : "rgba(34,197,94,.12)", t.priority === "High" ? T.red : t.priority === "Medium" ? T.amber : T.green)}>{t.priority}</span>
                            <span style={css.chip(T.surface, T.textMid)}>{t.category}</span>
                            {t.inCalendar && <span style={css.chip("rgba(59,130,246,.12)", T.blue)}>📅 Calendar</span>}
                          </div>
                          <button onClick={() => { setCalModal(t); setCalForm({ title: t.title, date: "", time: "09:00", duration: "60" }); setCalMsg(""); }} style={{ fontSize: 11, background: "rgba(59,130,246,.1)", border: `1px solid rgba(59,130,246,.2)`, color: T.blue, borderRadius: 7, padding: "5px 12px", cursor: "pointer", fontWeight: 600 }}>
                            {t.inCalendar ? "📅 Update in Calendar" : "📅 Add to Calendar"}
                          </button>
                        </div>
                        <select value={t.status} onChange={e => setTasks(p => p.map(x => x.id === t.id ? { ...x, status: e.target.value } : x))} style={{ fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 8px", background: T.surface, color: T.textMid, cursor: "pointer" }}>
                          {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ══ TAB 3: CONTACTS ══ */}
        {tab === 3 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Contacts</div>
              <button onClick={() => { if (window.confirm("¿Borrar todos los " + contactTab + "?")) { if (contactTab === "venues") setVenues([]); else setConcierges([]); } }} style={{ fontSize: 11, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: T.red, borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontWeight: 700 }}>Clear all</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {["venues", "concierges"].map(ct => (
                <button key={ct} onClick={() => setContactTab(ct)} style={{ ...css.btn(T.violet, false), flex: 1, background: contactTab === ct ? T.violet : T.card, color: contactTab === ct ? "#fff" : T.textMid, border: `1px solid ${contactTab === ct ? T.violet : T.border}` }}>
                  {ct === "venues" ? "Venues & Suppliers" : "Concierges"}
                </button>
              ))}
            </div>

            <div style={{ ...css.card, marginBottom: 12 }}>
              <label style={css.lbl}>Add {contactTab === "venues" ? "Venue / Supplier" : "Concierge"}</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={contactTab === "venues" ? newVenue : newConcierge} onChange={e => contactTab === "venues" ? setNewVenue(e.target.value) : setNewConcierge(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { if (contactTab === "venues" && newVenue.trim()) { setVenues(p => [...p, newVenue.trim()]); setNewVenue(""); } else if (contactTab === "concierges" && newConcierge.trim()) { setConcierges(p => [...p, newConcierge.trim()]); setNewConcierge(""); } } }} placeholder={`Name of ${contactTab === "venues" ? "venue" : "concierge"}...`} style={{ ...css.inp, flex: 1 }} />
                <button onClick={() => { if (contactTab === "venues" && newVenue.trim()) { setVenues(p => [...p, newVenue.trim()]); setNewVenue(""); } else if (contactTab === "concierges" && newConcierge.trim()) { setConcierges(p => [...p, newConcierge.trim()]); setNewConcierge(""); } }} style={{ ...css.btn(T.violet, false), whiteSpace: "nowrap" }}>Add</button>
              </div>
            </div>

            <div style={{ ...css.card, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>Import from CSV / Spreadsheet</div>
              <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12 }}>Export your Google Sheet or Excel as CSV, then paste or upload here.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setCsvModal(contactTab)} style={{ ...css.btn(T.surface, false), flex: 1, border: `1px solid ${T.border}`, color: T.textMid }}>Paste CSV text</button>
                <button onClick={() => csvFileRef.current?.click()} style={{ ...css.btn(T.surface, false), flex: 1, border: `1px solid ${T.border}`, color: T.textMid }}>Upload CSV file</button>
                <input ref={csvFileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => { setCsvText(ev.target.result); setCsvModal(contactTab); };
                  reader.readAsText(file);
                  e.target.value = "";
                }} />
              </div>
            </div>

            <div>
              {(contactTab === "venues" ? venues : concierges).map((name, i) => (
                <div key={i} style={{ ...css.card, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
                  <span style={{ fontSize: 13, color: T.text }}>{name}</span>
                  <button onClick={() => { if (contactTab === "venues") setVenues(p => p.filter((_, j) => j !== i)); else setConcierges(p => p.filter((_, j) => j !== i)); }} style={{ border: "none", background: "none", cursor: "pointer", color: T.textDim, fontSize: 16, padding: "2px 6px" }}>×</button>
                </div>
              ))}
              {(contactTab === "venues" ? venues : concierges).length === 0 && (
                <div style={{ textAlign: "center", color: T.textDim, padding: 40, fontSize: 13 }}>No {contactTab} yet. Add one above.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Calendar */}
      {calModal && (
        <Modal onClose={() => setCalModal(null)} title="📅 Add to Google Calendar">
          <div style={{ marginBottom: 12 }}>
            <label style={css.lbl}>Event Title</label>
            <input value={calForm.title} onChange={e => setCalForm({ ...calForm, title: e.target.value })} style={css.inp} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={css.lbl}>Date</label>
            <input type="date" value={calForm.date} onChange={e => setCalForm({ ...calForm, date: e.target.value })} style={css.inp} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div>
              <label style={css.lbl}>Time</label>
              <input type="time" value={calForm.time} onChange={e => setCalForm({ ...calForm, time: e.target.value })} style={css.inp} />
            </div>
            <div>
              <label style={css.lbl}>Duration (min)</label>
              <select value={calForm.duration} onChange={e => setCalForm({ ...calForm, duration: e.target.value })} style={css.inp}>
                {["30", "45", "60", "90", "120"].map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
          {calMsg && <div style={{ fontSize: 12, marginBottom: 12, padding: "9px 12px", borderRadius: 8, background: calMsg.startsWith("✓") ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: calMsg.startsWith("✓") ? T.green : T.red, border: `1px solid ${calMsg.startsWith("✓") ? "rgba(34,197,94,.2)" : "rgba(239,68,68,.2)"}` }}>{calMsg}</div>}
          <button onClick={handleCalendar} disabled={!calForm.date || !calForm.title} style={{ ...css.btn(T.violet, !calForm.date || !calForm.title), width: "100%" }}>
            Open in Google Calendar →
          </button>
        </Modal>
      )}

      {/* MODAL: CSV */}
      {csvModal && (
        <Modal onClose={() => { setCsvModal(null); setCsvText(""); }} title={`Import ${csvModal === "venues" ? "Venues" : "Concierges"} from CSV`} maxW={480}>
          <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12, background: T.surface, borderRadius: 8, padding: "10px 12px" }}>
            Paste your CSV below. The first column should be the name. Headers are ignored automatically.
          </div>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={8} placeholder={"Name\nNoMad Restaurant\nElevenMadison\nRichard, Hotel Manager"} style={{ ...css.inp, resize: "vertical", lineHeight: 1.7, marginBottom: 12, fontFamily: "monospace", fontSize: 12 }} />
          <button onClick={() => importCSV(csvModal)} disabled={!csvText.trim()} style={{ ...css.btn(T.violet, !csvText.trim()), width: "100%" }}>
            Import →
          </button>
        </Modal>
      )}
    </div>
  );
}
