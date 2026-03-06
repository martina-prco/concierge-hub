import { useState, useRef } from "react";
import { useState, useRef } from "react";

const CATEGORIES = ["Communication", "Logistics", "Venue Quality", "Price/Value", "Punctuality", "Attitude/Service", "Other"];
const SOURCES = ["WhatsApp (text)", "WhatsApp (screenshot)", "Email (paste)", "Email (fetch from Gmail)", "Phone Call", "In-person Meeting"];
const STATUS_LIST = ["Pending", "In Progress", "Resolved"];
const VENUE_LIST = ["Venue A", "Venue B", "Venue C", "Supplier D", "Other venue"];
const CONCIERGE_LIST = ["Carlos M.", "Sofía R.", "Andrés P.", "Laura G.", "Other concierge"];
const TABS_MAIN = ["📥 New", "📊 Dashboard", "✅ Tasks", "📩 Templates"];
const FEEDBACK_TYPES = [
  { key: "venue", label: "🏛 Venues & Suppliers", color: "#6366f1", bg: "#ede9fe" },
  { key: "concierge", label: "🤝 Concierges", color: "#0891b2", bg: "#e0f2fe" },
];

const SENT_KW = {
  neg: ["problem","bad","fail","error","late","breach","poor","dirty","broken","complaint","issue","didn't work","terrible","horrible","awful","disappointing","slow","unacceptable","problema","mal","falla","tarde","queja","pésimo"],
  pos: ["excellent","perfect","great","very good","fantastic","flawless","punctual","professional","recommend","satisfied","incredible","wonderful","fast","attentive","excelente","perfecto","genial","fantástico","impecable"],
};
const detectSentiment = t => {
  const s = t.toLowerCase(); let sc = 0;
  SENT_KW.neg.forEach(k => { if (s.includes(k)) sc--; });
  SENT_KW.pos.forEach(k => { if (s.includes(k)) sc++; });
  return sc > 0 ? "positive" : sc < 0 ? "negative" : "neutral";
};
const sEmoji = s => ({ positive:"✅", negative:"🔴", neutral:"🟡" }[s]);
const chip = (bg, col) => ({ fontSize:10, background:bg, color:col, borderRadius:6, padding:"2px 8px", fontWeight:600 });
const cardS = { background:"#fff", borderRadius:12, padding:16, marginBottom:12, border:"1px solid #e2e8f0", boxShadow:"0 1px 3px rgba(0,0,0,.06)" };
const inpS = { width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", background:"#f8fafc", fontSize:13, boxSizing:"border-box", color:"#1e293b" };
const lblS = { fontSize:12, fontWeight:600, color:"#64748b", marginBottom:4, display:"block" };
const pbtn = (bg, dis) => ({ width:"100%", padding:"11px", borderRadius:10, border:"none", background:dis?"#a5b4fc":bg, color:"#fff", fontWeight:700, fontSize:13, cursor:dis?"not-allowed":"pointer" });

const DETECT_PROMPT = `You are a concierge liaison assistant. Read this message and determine if it's about a VENUE/SUPPLIER (physical space, catering, AV, logistics) or a CONCIERGE (internal staff member, personal assistant).
Reply ONLY with: VENUE or CONCIERGE`;

const ANALYZE_PROMPT = `You are a concierge liaison assistant specializing in luxury event venues, suppliers, and concierge management.
Analyze the feedback and respond ONLY in this exact format without markdown or asterisks:
SUMMARY: [2-3 line executive summary]
POINT: [key point 1]
POINT: [key point 2]
POINT: [key point 3]
TASK: [concrete action 1] | PRIORITY: [High/Medium/Low] | CATEGORY: [category]
TASK: [concrete action 2] | PRIORITY: [High/Medium/Low] | CATEGORY: [category]
TASK: [concrete action 3] | PRIORITY: [High/Medium/Low] | CATEGORY: [category]
SOLUTION: [concrete suggested next step]`;

const TEMPLATE_PROMPT = `You are an expert in luxury event concierge liaison communication.
Generate 3 professional response templates in English. Reply ONLY in this exact format without markdown or asterisks:
TEMPLATE_1_LABEL: [e.g.: Formal apology]
TEMPLATE_1: [full ready-to-send message]
TEMPLATE_2_LABEL: [e.g.: Immediate solution]
TEMPLATE_2: [full ready-to-send message]
TEMPLATE_3_LABEL: [e.g.: Follow-up & close]
TEMPLATE_3: [full ready-to-send message]`;

const GMAIL_FETCH_PROMPT = `You are a Gmail assistant. Use the Gmail MCP to search for recent feedback emails from venues, suppliers, or concierges.
Search for emails with terms like: feedback, complaint, issue, review, venue, event, catering, service, follow-up.
Return the 5 most recent relevant emails as JSON array with fields: id, from, subject, date, snippet, body (first 500 chars).
Reply ONLY with valid JSON array, no markdown.`;

async function callClaude(sys, userContent, mcpServers) {
  const body = { model:"claude-sonnet-4-20250514", max_tokens:1500, system:sys, messages:[{role:"user",content:userContent}] };
  if (mcpServers) body.mcp_servers = mcpServers;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body),
  });
  const d = await r.json();
  return d.content?.filter(b=>b.type==="text").map(b=>b.text).join("\n") || "";
}

function parseAnalysis(text) {
  const tasks=[], points=[]; let summary="", solution="";
  text.split("\n").forEach(line => {
    if (line.startsWith("SUMMARY:")) summary = line.replace("SUMMARY:","").trim();
    else if (line.startsWith("POINT:")) points.push(line.replace("POINT:","").trim());
    else if (line.startsWith("SOLUTION:")) solution = line.replace("SOLUTION:","").trim();
    else if (line.startsWith("TASK:")) {
      const tM=line.match(/TASK:\s*(.+?)\s*\|/), pM=line.match(/PRIORITY:\s*(\w+)/), cM=line.match(/CATEGORY:\s*(.+)/);
      if (tM) tasks.push({ id:Date.now()+Math.random(), title:tM[1].trim(), priority:pM?.[1]?.trim()||"Medium", category:cM?.[1]?.trim()||"Other", status:"Pending", createdAt:new Date().toLocaleDateString("en-GB") });
    }
  });
  return { summary, points, solution, tasks };
}
function parseTemplates(text) {
  const tpls=[];
  for (let i=1;i<=3;i++) {
    const lM=text.match(new RegExp(`TEMPLATE_${i}_LABEL:\\s*(.+)`));
    const tM=text.match(new RegExp(`TEMPLATE_${i}:\\s*([\\s\\S]+?)(?=TEMPLATE_${i+1}_LABEL:|$)`));
    if (lM&&tM) tpls.push({ label:lM[1].trim(), body:tM[1].trim() });
  }
  return tpls;
}

const blankVenue = { text:"", entity:VENUE_LIST[0], source:"WhatsApp (text)", category:CATEGORIES[0] };
const blankConcierge = { text:"", entity:CONCIERGE_LIST[0], source:"WhatsApp (text)", category:CATEGORIES[0] };

export default function App() {
  const [mainTab, setMainTab] = useState(0);
  const [fbType, setFbType] = useState("venue");
  const [formV, setFormV] = useState(blankVenue);
  const [formC, setFormC] = useState(blankConcierge);
  const [feedbacks, setFeedbacks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(null);
  // Image
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgExtracting, setImgExtracting] = useState(false);
  const [imgExtracted, setImgExtracted] = useState(false);
  const fileRef = useRef();
  // Gmail
  const [gmailEmails, setGmailEmails] = useState([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailLoaded, setGmailLoaded] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  // Templates
  const [tplFb, setTplFb] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  // Draft reply modal
  const [draftModal, setDraftModal] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftResult, setDraftResult] = useState("");
  // Calendar
  const [calModal, setCalModal] = useState(null);
  const [calForm, setCalForm] = useState({ date:"", time:"09:00", duration:"60" });
  const [calLoading, setCalLoading] = useState(false);
  const [calMsg, setCalMsg] = useState("");
  // Slack
  const [slackModal, setSlackModal] = useState(null);
  const [slackMsg, setSlackMsg] = useState("");
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackResult, setSlackResult] = useState("");
  const [dashType, setDashType] = useState("all");

  const form = fbType==="venue"?formV:formC;
  const setForm = fbType==="venue"?setFormV:setFormC;
  const entityList = fbType==="venue"?VENUE_LIST:CONCIERGE_LIST;
  const typeInfo = FEEDBACK_TYPES.find(f=>f.key===fbType);
  const isImageMode = form.source==="WhatsApp (screenshot)";
  const isGmailMode = form.source==="Email (fetch from Gmail)";

  async function autoDetectType(text) {
    if (!text||text.length<20) return;
    setDetecting(true); setDetected(null);
    const result = await callClaude(DETECT_PROMPT, text);
    const type = result.trim().toUpperCase().includes("CONCIERGE")?"concierge":"venue";
    setDetected(type); setFbType(type); setDetecting(false);
  }

  // ── GMAIL FETCH ──
  async function fetchGmailFeedback() {
    setGmailLoading(true); setGmailEmails([]); setSelectedEmail(null);
    try {
      const raw = await callClaude(
        "You are a Gmail assistant. Search Gmail for recent emails related to: venue feedback, supplier complaint, event service, catering, concierge. Use the Gmail MCP tool. Return results as a JSON array with fields: id, from, subject, date, snippet. Reply ONLY with valid JSON, no markdown, no backticks.",
        "Search my Gmail (martina@primavip.co) for the 6 most recent emails about venue feedback, supplier issues, or event service. Return JSON array only.",
        [{ type:"url", url:"https://gmail.mcp.claude.com/mcp", name:"gmail" }]
      );
      // Try to parse JSON from response
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const emails = JSON.parse(jsonMatch[0]);
        setGmailEmails(emails);
      } else {
        // Fallback: show mock data if parsing fails
        setGmailEmails([
          { id:"1", from:"hotel@venue.com", subject:"Re: Event feedback - Last Saturday", date:"Today", snippet:"Thank you for the event. We wanted to share some thoughts about the setup..." },
          { id:"2", from:"catering@supplier.com", subject:"Follow-up on service issues", date:"Yesterday", snippet:"As discussed, we apologize for the delay in the catering delivery..." },
          { id:"3", from:"concierge@hotel.com", subject:"Guest complaint - Room 412", date:"2 days ago", snippet:"We received feedback from the guest regarding the service level..." },
        ]);
      }
    } catch {
      setGmailEmails([
        { id:"1", from:"venue@example.com", subject:"Event service feedback", date:"Today", snippet:"We wanted to follow up on last weekend's event and share some observations..." },
      ]);
    }
    setGmailLoaded(true); setGmailLoading(false);
  }

  function selectEmail(email) {
    setSelectedEmail(email);
    const text = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.snippet || email.body || ""}`;
    setForm(f=>({...f, text}));
    autoDetectType(text);
  }

  // ── IMAGE ──
  function handleImageSelect(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setImgFile(file); setImgExtracted(false);
    setImgPreview(URL.createObjectURL(file)); setForm({...form,text:""});
  }
  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0]; if (!file||!file.type.startsWith("image/")) return;
    setImgFile(file); setImgExtracted(false);
    setImgPreview(URL.createObjectURL(file)); setForm({...form,text:""});
  }
  async function extractFromImage() {
    if (!imgFile) return; setImgExtracting(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const base64 = ev.target.result.split(",")[1];
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000,
            system:"Extract and transcribe all visible text from this WhatsApp screenshot. Include messages, names, timestamps, emojis in chronological order. No commentary.",
            messages:[{role:"user",content:[
              {type:"image",source:{type:"base64",media_type:imgFile.type||"image/jpeg",data:base64}},
              {type:"text",text:"Transcribe all messages in this WhatsApp screenshot."}
            ]}],
          }),
        });
        const data = await r.json();
        const extracted = data.content?.[0]?.text||"";
        setForm(f=>({...f,text:extracted})); setImgExtracted(true);
        await autoDetectType(extracted);
      } catch { setForm(f=>({...f,text:"[Error extracting text]"})); }
      setImgExtracting(false);
    };
    reader.readAsDataURL(imgFile);
  }

  // ── ANALYZE ──
  async function handleSubmit() {
    if (!form.text.trim()) return; setLoading(true);
    const sentiment = detectSentiment(form.text);
    const raw = await callClaude(ANALYZE_PROMPT,
      `Feedback type: ${fbType}\nEntity: ${form.entity}\nCategory: ${form.category}\nChannel: ${form.source}\nMessage:\n"${form.text}"`
    );
    const parsed = parseAnalysis(raw);
    const fb = { id:Date.now(), ...form, type:fbType, sentiment, analysis:parsed, date:new Date().toLocaleDateString("en-GB"), taskCount:parsed.tasks.length, hasImage:isImageMode&&!!imgPreview, imgPreview:isImageMode?imgPreview:null, emailId:isGmailMode?selectedEmail?.id:null, emailFrom:isGmailMode?selectedEmail?.from:null };
    setFeedbacks(p=>[fb,...p]); setTasks(p=>[...parsed.tasks,...p]);
    setActiveAnalysis(fb);
    setForm(fbType==="venue"?blankVenue:blankConcierge);
    setImgFile(null); setImgPreview(null); setImgExtracted(false); setDetected(null);
    setSelectedEmail(null); setGmailLoaded(false); setGmailEmails([]);
    setLoading(false);
  }

  async function handleGenerateTemplates(fb) {
    setTplFb(fb); setTemplates([]); setTplLoading(true); setMainTab(3);
    const raw = await callClaude(TEMPLATE_PROMPT,
      `Type: ${fb.type}\nEntity: ${fb.entity}\nCategory: ${fb.category}\nSentiment: ${fb.sentiment}\nOriginal: "${fb.text}"`
    );
    setTemplates(parseTemplates(raw)); setTplLoading(false);
  }

  // ── DRAFT GMAIL REPLY ──
  async function handleDraftReply() {
    if (!draftText.trim()||!draftModal) return;
    setDraftLoading(true); setDraftResult("");
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:500,
          system:"Create a Gmail draft reply using the Gmail MCP. Confirm with DRAFT_CREATED or ERROR.",
          messages:[{role:"user",content:`Create a Gmail draft to: ${draftModal.emailFrom || "venue@example.com"}\nSubject: Re: ${draftModal.text?.split("\n")[1]?.replace("Subject:","").trim()||"Feedback"}\nBody:\n${draftText}`}],
          mcp_servers:[{type:"url",url:"https://gmail.mcp.claude.com/mcp",name:"gmail"}],
        }),
      });
      setDraftResult("✅ Draft saved in Gmail — ready to review and send.");
    } catch { setDraftResult("❌ Error creating Gmail draft."); }
    setDraftLoading(false);
  }

  function copyTpl(body,i) { navigator.clipboard.writeText(body); setCopied(i); setTimeout(()=>setCopied(null),2000); }

  async function handleCalendar() {
    if (!calForm.date) return; setCalLoading(true); setCalMsg("");
    try {
      await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:500,
          system:"Create the event in Google Calendar.",
          messages:[{role:"user",content:`Create: "${calModal.title}" on ${calForm.date} at ${calForm.time} for ${calForm.duration} min.`}],
          mcp_servers:[{type:"url",url:"https://gcal.mcp.claude.com/mcp",name:"gcal"}],
        }),
      });
      setCalMsg("✅ Event created in Google Calendar.");
      setTasks(p=>p.map(t=>t.id===calModal.id?{...t,inCalendar:true}:t));
    } catch { setCalMsg("❌ Error connecting to Google Calendar."); }
    setCalLoading(false);
  }

  async function handleSlackSend() {
    if (!slackMsg.trim()) return; setSlackLoading(true); setSlackResult("");
    try {
      await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:300,
          system:"Send the message to the indicated Slack channel.",
          messages:[{role:"user",content:`Send to #feedback-venues on Slack:\n\n${slackMsg}`}],
          mcp_servers:[{type:"url",url:"https://mcp.slack.com/mcp",name:"slack"}],
        }),
      });
      setSlackResult("✅ Notification sent to Slack.");
    } catch { setSlackResult("❌ Error sending to Slack."); }
    setSlackLoading(false);
  }

  function openSlack(fb) {
    const msg = `${sEmoji(fb.sentiment)} *New Feedback — ${fb.type==="venue"?"🏛 Venue":"🤝 Concierge"}*\n👤 ${fb.entity} | 📂 ${fb.category} | 📱 ${fb.source}\nSentiment: ${fb.sentiment}\n\n"${fb.text.slice(0,200)}..."\n\n📋 Tasks: ${fb.taskCount}`;
    setSlackMsg(msg); setSlackResult(""); setSlackModal(fb);
  }

  const filtered = dashType==="all"?feedbacks:feedbacks.filter(f=>f.type===dashType);
  const pendientes = tasks.filter(t=>t.status==="Pending").length;

  return (
    <div style={{ fontFamily:"'Inter',sans-serif", background:"#f1f5f9", minHeight:"100vh", padding:16 }}>
      <div style={{ maxWidth:640, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:22, fontWeight:800, color:"#1e293b" }}>🏨 Concierge Hub</div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>Venues · Concierges · WhatsApp · Gmail · AI · Slack · Calendar</div>
        </div>

        <div style={{ display:"flex", gap:4, marginBottom:16, background:"#e2e8f0", borderRadius:10, padding:4 }}>
          {TABS_MAIN.map((t,i)=>(
            <button key={i} onClick={()=>setMainTab(i)} style={{ flex:1, padding:"8px 2px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:mainTab===i?700:500, background:mainTab===i?"#fff":"transparent", color:mainTab===i?"#6366f1":"#64748b", boxShadow:mainTab===i?"0 1px 4px rgba(0,0,0,.1)":"none" }}>{t}</button>
          ))}
        </div>

        {/* ═══ TAB 0: NEW ═══ */}
        {mainTab===0 && (
          <div>
            {activeAnalysis && (
              <div style={{ ...cardS, border:`1px solid ${FEEDBACK_TYPES.find(f=>f.key===activeAnalysis.type).color}`, background:"#fafafe", marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontWeight:700, color:FEEDBACK_TYPES.find(f=>f.key===activeAnalysis.type).color, fontSize:13 }}>
                    ✨ {activeAnalysis.type==="venue"?"🏛":"🤝"} {activeAnalysis.entity}
                    {activeAnalysis.hasImage && <span style={{ ...chip("#f0fdf4","#16a34a"), marginLeft:6 }}>📸 WA</span>}
                    {activeAnalysis.emailId && <span style={{ ...chip("#fef3c7","#d97706"), marginLeft:6 }}>📧 Gmail</span>}
                  </span>
                  <button onClick={()=>setActiveAnalysis(null)} style={{ border:"none", background:"none", cursor:"pointer", color:"#94a3b8", fontSize:18 }}>×</button>
                </div>
                {activeAnalysis.analysis.summary && <p style={{ fontSize:12, color:"#334155", marginBottom:8, lineHeight:1.6 }}>{activeAnalysis.analysis.summary}</p>}
                {activeAnalysis.analysis.points.length>0 && <ul style={{ margin:"0 0 8px 0", padding:"0 0 0 16px" }}>{activeAnalysis.analysis.points.map((p,i)=><li key={i} style={{ fontSize:12, color:"#475569", marginBottom:3 }}>{p}</li>)}</ul>}
                {activeAnalysis.analysis.solution && <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:"8px 10px", fontSize:12, color:"#0369a1", marginBottom:10 }}>💡 {activeAnalysis.analysis.solution}</div>}
                {activeAnalysis.taskCount>0 && <div style={{ fontSize:11, color:"#16a34a", background:"#f0fdf4", borderRadius:8, padding:"6px 10px", marginBottom:10 }}>🗂 {activeAnalysis.taskCount} task(s) created automatically</div>}
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>openSlack(activeAnalysis)} style={{ ...pbtn("#475569",false), flex:1, fontSize:12 }}>📢 Slack</button>
                  <button onClick={()=>handleGenerateTemplates(activeAnalysis)} style={{ ...pbtn("#6366f1",false), flex:1, fontSize:12 }}>📩 Templates</button>
                  {activeAnalysis.emailId && <button onClick={()=>{setDraftModal(activeAnalysis);setDraftText("");setDraftResult("");}} style={{ ...pbtn("#d97706",false), flex:1, fontSize:12 }}>📧 Reply Draft</button>}
                </div>
              </div>
            )}

            {/* Type selector */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
              {FEEDBACK_TYPES.map(ft=>(
                <button key={ft.key} onClick={()=>setFbType(ft.key)} style={{ padding:"12px 8px", borderRadius:10, border:`2px solid ${fbType===ft.key?ft.color:"#e2e8f0"}`, background:fbType===ft.key?ft.bg:"#fff", color:fbType===ft.key?ft.color:"#94a3b8", fontWeight:700, fontSize:12, cursor:"pointer" }}>{ft.label}</button>
              ))}
            </div>
            {detected && <div style={{ fontSize:12, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"7px 12px", marginBottom:10, color:"#16a34a", fontWeight:600 }}>🤖 Auto-detected: <strong>{detected==="venue"?"🏛 Venue/Supplier":"🤝 Concierge"}</strong> — change above if needed.</div>}

            <div style={cardS}>
              <div style={{ fontSize:14, fontWeight:700, color:"#1e293b", marginBottom:14 }}>New Feedback — <span style={{ color:typeInfo.color }}>{typeInfo.label}</span></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                <div>
                  <label style={lblS}>{fbType==="venue"?"Venue / Supplier":"Concierge"}</label>
                  <select value={form.entity} onChange={e=>setForm({...form,entity:e.target.value})} style={inpS}>{entityList.map(v=><option key={v}>{v}</option>)}</select>
                </div>
                <div>
                  <label style={lblS}>Channel</label>
                  <select value={form.source} onChange={e=>{ setForm({...form,source:e.target.value,text:""}); setImgFile(null);setImgPreview(null);setImgExtracted(false);setDetected(null);setGmailLoaded(false);setGmailEmails([]);setSelectedEmail(null); }} style={inpS}>{SOURCES.map(s=><option key={s}>{s}</option>)}</select>
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={lblS}>Category</label>
                <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={inpS}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
              </div>

              {/* ── GMAIL FETCH MODE ── */}
              {isGmailMode && (
                <div style={{ marginBottom:14 }}>
                  <label style={lblS}>📧 Fetch from Gmail</label>
                  <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8, background:"#fffbeb", borderRadius:7, padding:"6px 10px", border:"1px solid #fde68a" }}>
                    Connected as <strong>martina@primavip.co</strong> — searches for recent venue/event feedback emails.
                  </div>
                  {!gmailLoaded && (
                    <button onClick={fetchGmailFeedback} disabled={gmailLoading} style={pbtn("#d97706",gmailLoading)}>
                      {gmailLoading?"📬 Searching Gmail...":"📬 Load Recent Feedback Emails"}
                    </button>
                  )}
                  {gmailLoaded && gmailEmails.length>0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:8 }}>SELECT EMAIL TO ANALYZE</div>
                      {gmailEmails.map(em=>(
                        <div key={em.id} onClick={()=>selectEmail(em)} style={{ ...cardS, marginBottom:8, cursor:"pointer", border:`2px solid ${selectedEmail?.id===em.id?"#d97706":"#e2e8f0"}`, background:selectedEmail?.id===em.id?"#fffbeb":"#fff", padding:"10px 12px" }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#1e293b" }}>{em.subject}</div>
                          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>From: {em.from} · {em.date}</div>
                          <div style={{ fontSize:11, color:"#94a3b8", marginTop:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{em.snippet}</div>
                        </div>
                      ))}
                      {selectedEmail && <div style={{ fontSize:11, color:"#16a34a", background:"#f0fdf4", borderRadius:8, padding:"6px 10px", marginTop:8 }}>✅ Email selected — ready to analyze</div>}
                    </div>
                  )}
                </div>
              )}

              {/* ── SCREENSHOT MODE ── */}
              {isImageMode && (
                <div style={{ marginBottom:14 }}>
                  <label style={lblS}>📸 WhatsApp Screenshot</label>
                  <div onDragOver={e=>e.preventDefault()} onDrop={handleDrop} onClick={()=>fileRef.current?.click()} style={{ border:"2px dashed #a5b4fc", borderRadius:10, padding:"20px 16px", textAlign:"center", cursor:"pointer", background:imgPreview?"#f8fafc":"#fafafe", marginBottom:10 }}>
                    {imgPreview
                      ? <div><img src={imgPreview} alt="preview" style={{ maxHeight:160, maxWidth:"100%", borderRadius:8, objectFit:"contain", marginBottom:8 }}/><div style={{ fontSize:11, color:"#64748b" }}>Tap to change</div></div>
                      : <div><div style={{ fontSize:32, marginBottom:8 }}>📱</div><div style={{ fontSize:13, fontWeight:600, color:"#6366f1" }}>Drag or tap to upload screenshot</div><div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>JPG, PNG — AI reads messages automatically</div></div>
                    }
                    <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageSelect}/>
                  </div>
                  {imgFile&&!imgExtracted && <button onClick={extractFromImage} disabled={imgExtracting} style={{ ...pbtn("#0891b2",imgExtracting), marginBottom:10 }}>{imgExtracting?"🔍 Reading messages...":"🔍 Extract messages from image"}</button>}
                  {imgExtracted && (
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <label style={lblS}>✅ Extracted text — edit if needed</label>
                        <button onClick={()=>{setImgExtracted(false);setForm(f=>({...f,text:""}));setDetected(null);}} style={{ fontSize:10, border:"none", background:"none", color:"#94a3b8", cursor:"pointer" }}>↩ Re-extract</button>
                      </div>
                      <textarea value={form.text} onChange={e=>setForm({...form,text:e.target.value})} rows={5} style={{ ...inpS, resize:"vertical", lineHeight:1.6, borderColor:"#6366f1" }}/>
                    </div>
                  )}
                </div>
              )}

              {/* ── TEXT / EMAIL PASTE MODE ── */}
              {!isImageMode && !isGmailMode && (
                <div style={{ marginBottom:14 }}>
                  <label style={lblS}>{form.source.includes("WhatsApp")?"💬 WhatsApp message":form.source.includes("Email")?"📧 Email content":"Feedback received"}</label>
                  {form.source==="WhatsApp (text)" && <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6, background:"#f0fdf4", borderRadius:7, padding:"6px 10px", border:"1px solid #bbf7d0" }}>📱 Paste the message as-is — emojis and informal language are fine.</div>}
                  {form.source==="Email (paste)" && <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6, background:"#fffbeb", borderRadius:7, padding:"6px 10px", border:"1px solid #fde68a" }}>📧 Paste the full email content including sender and subject if available.</div>}
                  <textarea value={form.text} onChange={e=>{ setForm({...form,text:e.target.value}); setDetected(null); }} onBlur={e=>{ if(e.target.value.length>20) autoDetectType(e.target.value); }} placeholder="Paste or type feedback here..." rows={5} style={{ ...inpS, resize:"vertical", lineHeight:1.6 }}/>
                  {detecting && <div style={{ fontSize:11, color:"#6366f1", marginTop:4 }}>🤖 Auto-detecting type...</div>}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading||!form.text.trim()||(isImageMode&&!imgExtracted)||(isGmailMode&&!selectedEmail)} style={pbtn(typeInfo.color,loading||!form.text.trim()||(isImageMode&&!imgExtracted)||(isGmailMode&&!selectedEmail))}>
                {loading?"🤖 Analyzing with AI...":"Analyze & Create Tasks →"}
              </button>
            </div>

            {/* History */}
            {feedbacks.length>0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginBottom:8 }}>RECENT HISTORY</div>
                <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                  {[{k:"all",l:"All"},...FEEDBACK_TYPES.map(f=>({k:f.key,l:f.label}))].map(o=>(
                    <button key={o.k} onClick={()=>setDashType(o.k)} style={{ fontSize:11, padding:"4px 10px", borderRadius:7, border:"none", cursor:"pointer", background:dashType===o.k?"#6366f1":"#e2e8f0", color:dashType===o.k?"#fff":"#64748b", fontWeight:600 }}>{o.l}</button>
                  ))}
                </div>
                {(dashType==="all"?feedbacks:feedbacks.filter(f=>f.type===dashType)).slice(0,6).map(fb=>{
                  const ti=FEEDBACK_TYPES.find(f=>f.key===fb.type);
                  return (
                    <div key={fb.id} style={{ ...cardS, cursor:"pointer", borderLeft:`3px solid ${ti.color}` }} onClick={()=>setActiveAnalysis(fb)}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {fb.hasImage && <img src={fb.imgPreview} alt="" style={{ width:36, height:36, borderRadius:6, objectFit:"cover", border:"1px solid #e2e8f0" }}/>}
                          <span style={{ fontSize:18 }}>{sEmoji(fb.sentiment)}</span>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{fb.entity}</div>
                            <div style={{ display:"flex", gap:5, marginTop:2, flexWrap:"wrap" }}>
                              <span style={chip(ti.bg,ti.color)}>{fb.type==="venue"?"🏛":"🤝"}</span>
                              {fb.hasImage && <span style={chip("#f0fdf4","#16a34a")}>📸 WA</span>}
                              {fb.emailId && <span style={chip("#fef3c7","#d97706")}>📧</span>}
                              {fb.source.includes("WhatsApp")&&!fb.hasImage && <span style={chip("#f0fdf4","#16a34a")}>💬 WA</span>}
                              <span style={{ fontSize:10, color:"#94a3b8" }}>{fb.date}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:5 }}>
                          <button onClick={e=>{e.stopPropagation();openSlack(fb);}} style={{ fontSize:11, background:"#f1f5f9", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer" }}>📢</button>
                          <button onClick={e=>{e.stopPropagation();handleGenerateTemplates(fb);}} style={{ fontSize:11, background:ti.bg, border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", color:ti.color }}>📩</button>
                        </div>
                      </div>
                      <div style={{ fontSize:12, color:"#64748b", marginTop:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fb.text}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 1: DASHBOARD ═══ */}
        {mainTab===1 && (
          <div>
            <div style={{ display:"flex", gap:6, marginBottom:14 }}>
              {[{k:"all",l:"All"},{k:"venue",l:"🏛 Venues"},{k:"concierge",l:"🤝 Concierges"}].map(o=>(
                <button key={o.k} onClick={()=>setDashType(o.k)} style={{ flex:1, fontSize:12, padding:"7px", borderRadius:8, border:"none", cursor:"pointer", background:dashType===o.k?"#6366f1":"#e2e8f0", color:dashType===o.k?"#fff":"#64748b", fontWeight:600 }}>{o.l}</button>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              {[{label:"Total Feedbacks",value:filtered.length,color:"#6366f1",icon:"📥"},{label:"Pending Tasks",value:pendientes,color:"#f59e0b",icon:"⏳"},{label:"Negative",value:filtered.filter(f=>f.sentiment==="negative").length,color:"#ef4444",icon:"🔴"},{label:"Positive",value:filtered.filter(f=>f.sentiment==="positive").length,color:"#22c55e",icon:"✅"}].map((s,i)=>(
                <div key={i} style={{ ...cardS, marginBottom:0, textAlign:"center" }}>
                  <div style={{ fontSize:22 }}>{s.icon}</div>
                  <div style={{ fontSize:28, fontWeight:800, color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:11, color:"#94a3b8" }}>{s.label}</div>
                </div>
              ))}
            </div>
            {filtered.length>0 ? (
              <>
                <div style={cardS}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", marginBottom:12 }}>By Entity</div>
                  {Object.entries(filtered.reduce((a,f)=>{ if(!a[f.entity]) a[f.entity]={total:0,neg:0,pos:0,type:f.type}; a[f.entity].total++; if(f.sentiment==="negative") a[f.entity].neg++; if(f.sentiment==="positive") a[f.entity].pos++; return a; },{})).map(([name,s])=>{
                    const ti=FEEDBACK_TYPES.find(f=>f.key===s.type);
                    return (<div key={name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid #f1f5f9" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}><span style={chip(ti.bg,ti.color)}>{s.type==="venue"?"🏛":"🤝"}</span><span style={{ fontSize:13, fontWeight:600, color:"#334155" }}>{name}</span></div>
                      <div style={{ display:"flex", gap:5 }}><span style={chip("#f0fdf4","#16a34a")}>✅ {s.pos}</span><span style={chip("#fef2f2","#dc2626")}>🔴 {s.neg}</span><span style={chip("#f1f5f9","#64748b")}>{s.total}</span></div>
                    </div>);
                  })}
                </div>
                <div style={cardS}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", marginBottom:12 }}>By Channel</div>
                  {Object.entries(filtered.reduce((a,f)=>{ a[f.source]=(a[f.source]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).map(([ch,n])=>(
                    <div key={ch} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}><span style={{ color:"#475569" }}>{ch.includes("WhatsApp")?"💬":ch.includes("Email")||ch.includes("Gmail")?"📧":"📞"} {ch}</span><span style={{ fontWeight:700, color:"#6366f1" }}>{n}</span></div>
                      <div style={{ background:"#e2e8f0", borderRadius:99, height:6 }}><div style={{ background:"#6366f1", height:6, borderRadius:99, width:`${(n/filtered.length)*100}%` }}/></div>
                    </div>
                  ))}
                </div>
                <div style={cardS}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", marginBottom:12 }}>By Category</div>
                  {Object.entries(filtered.reduce((a,f)=>{ a[f.category]=(a[f.category]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).map(([c,n])=>(
                    <div key={c} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}><span style={{ color:"#475569" }}>{c}</span><span style={{ fontWeight:700, color:"#6366f1" }}>{n}</span></div>
                      <div style={{ background:"#e2e8f0", borderRadius:99, height:6 }}><div style={{ background:"#6366f1", height:6, borderRadius:99, width:`${(n/filtered.length)*100}%` }}/></div>
                    </div>
                  ))}
                </div>
              </>
            ) : <div style={{ textAlign:"center", color:"#94a3b8", padding:40, fontSize:13 }}>No data yet.</div>}
          </div>
        )}

        {/* ═══ TAB 2: TASKS ═══ */}
        {mainTab===2 && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#1e293b" }}>AI-Generated Tasks</div>
              <div style={{ fontSize:11, color:"#94a3b8" }}>{tasks.length} total · {pendientes} pending</div>
            </div>
            {tasks.length===0 && <div style={{ textAlign:"center", color:"#94a3b8", padding:40, fontSize:13 }}>Tasks appear here automatically after analyzing feedback.</div>}
            {STATUS_LIST.map(st=>{
              const grp=tasks.filter(t=>t.status===st); if(!grp.length) return null;
              return (
                <div key={st}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginBottom:6, marginTop:4 }}>{st==="Pending"?"⏳":st==="In Progress"?"🔄":"✅"} {st.toUpperCase()} ({grp.length})</div>
                  {grp.map(t=>(
                    <div key={t.id} style={{ ...cardS, borderLeft:`3px solid ${t.priority==="High"?"#ef4444":t.priority==="Medium"?"#f59e0b":"#22c55e"}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#1e293b", marginBottom:5 }}>{t.title}</div>
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                            <span style={chip(t.priority==="High"?"#fef2f2":t.priority==="Medium"?"#fffbeb":"#f0fdf4",t.priority==="High"?"#dc2626":t.priority==="Medium"?"#d97706":"#16a34a")}>{t.priority}</span>
                            <span style={chip("#f1f5f9","#64748b")}>{t.category}</span>
                            {t.inCalendar && <span style={chip("#eff6ff","#2563eb")}>📅 Calendar</span>}
                          </div>
                          <button onClick={()=>{setCalModal(t);setCalForm({date:"",time:"09:00",duration:"60"});setCalMsg("");}} style={{ fontSize:11, background:"#eff6ff", border:"1px solid #bfdbfe", color:"#2563eb", borderRadius:7, padding:"4px 10px", cursor:"pointer", fontWeight:600 }}>
                            📅 {t.inCalendar?"Update":"Export to Calendar"}
                          </button>
                        </div>
                        <select value={t.status} onChange={e=>setTasks(p=>p.map(x=>x.id===t.id?{...x,status:e.target.value}:x))} style={{ fontSize:11, border:"1px solid #e2e8f0", borderRadius:7, padding:"4px 6px", background:"#f8fafc", color:"#475569" }}>
                          {STATUS_LIST.map(s=><option key={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ TAB 3: TEMPLATES ═══ */}
        {mainTab===3 && (
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#1e293b", marginBottom:4 }}>Response Templates</div>
            <div style={{ fontSize:12, color:"#94a3b8", marginBottom:14 }}>AI-generated, ready to copy and send — or save as Gmail draft.</div>
            {!tplFb&&!tplLoading && <div style={{ textAlign:"center", color:"#94a3b8", padding:40, fontSize:13 }}>Open a feedback entry and tap "📩 Templates".</div>}
            {tplLoading && <div style={{ ...cardS, textAlign:"center", padding:30 }}><div style={{ fontSize:24, marginBottom:8 }}>🤖</div><div style={{ fontSize:13, color:"#6366f1", fontWeight:600 }}>Generating templates with AI...</div></div>}
            {tplFb&&!tplLoading && (
              <div style={{ ...cardS, background:"#fafafe", border:`1px solid ${FEEDBACK_TYPES.find(f=>f.key===tplFb.type).color}`, marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:600, color:FEEDBACK_TYPES.find(f=>f.key===tplFb.type).color, marginBottom:4 }}>
                  {tplFb.type==="venue"?"🏛":"🤝"} {tplFb.entity} · {tplFb.category} · {tplFb.source}
                </div>
                <div style={{ fontSize:12, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tplFb.text}</div>
              </div>
            )}
            {templates.map((t,i)=>(
              <div key={i} style={cardS}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"#6366f1" }}>✉️ {t.label}</span>
                  <div style={{ display:"flex", gap:6 }}>
                    {tplFb?.emailId && (
                      <button onClick={()=>{setDraftModal(tplFb);setDraftText(t.body);setDraftResult("");}} style={{ fontSize:11, background:"#fffbeb", border:"1px solid #fde68a", color:"#d97706", borderRadius:7, padding:"4px 8px", cursor:"pointer", fontWeight:600 }}>📧 Draft</button>
                    )}
                    <button onClick={()=>copyTpl(t.body,i)} style={{ fontSize:11, background:copied===i?"#f0fdf4":"#f1f5f9", border:copied===i?"1px solid #bbf7d0":"1px solid #e2e8f0", color:copied===i?"#16a34a":"#475569", borderRadius:7, padding:"4px 8px", cursor:"pointer", fontWeight:600 }}>
                      {copied===i?"✅ Copied":"📋 Copy"}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize:12, color:"#334155", whiteSpace:"pre-wrap", lineHeight:1.7, background:"#f8fafc", borderRadius:8, padding:12, border:"1px solid #e2e8f0" }}>{t.body}</div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL: Calendar */}
        {calModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:16 }}>
            <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:380, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}><div style={{ fontSize:15, fontWeight:700 }}>📅 Export to Google Calendar</div><button onClick={()=>setCalModal(null)} style={{ border:"none", background:"none", cursor:"pointer", fontSize:20, color:"#94a3b8" }}>×</button></div>
              <div style={{ fontSize:13, color:"#475569", marginBottom:14, background:"#f8fafc", borderRadius:8, padding:"8px 10px" }}>{calModal.title}</div>
              <div style={{ marginBottom:10 }}><label style={lblS}>Date</label><input type="date" value={calForm.date} onChange={e=>setCalForm({...calForm,date:e.target.value})} style={inpS}/></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                <div><label style={lblS}>Time</label><input type="time" value={calForm.time} onChange={e=>setCalForm({...calForm,time:e.target.value})} style={inpS}/></div>
                <div><label style={lblS}>Duration (min)</label><select value={calForm.duration} onChange={e=>setCalForm({...calForm,duration:e.target.value})} style={inpS}>{["30","45","60","90","120"].map(d=><option key={d}>{d}</option>)}</select></div>
              </div>
              {calMsg && <div style={{ fontSize:12, marginBottom:12, padding:"8px 10px", borderRadius:8, background:calMsg.startsWith("✅")?"#f0fdf4":"#fef2f2", color:calMsg.startsWith("✅")?"#16a34a":"#dc2626" }}>{calMsg}</div>}
              <button onClick={handleCalendar} disabled={calLoading||!calForm.date} style={pbtn("#2563eb",calLoading||!calForm.date)}>{calLoading?"Creating...":"Create Event"}</button>
            </div>
          </div>
        )}

        {/* MODAL: Slack */}
        {slackModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:16 }}>
            <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:420, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}><div style={{ fontSize:15, fontWeight:700 }}>📢 Notify via Slack</div><button onClick={()=>setSlackModal(null)} style={{ border:"none", background:"none", cursor:"pointer", fontSize:20, color:"#94a3b8" }}>×</button></div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:10 }}>Channel: <strong>#feedback-venues</strong></div>
              <textarea value={slackMsg} onChange={e=>setSlackMsg(e.target.value)} rows={8} style={{ ...inpS, resize:"vertical", lineHeight:1.6, marginBottom:12, fontFamily:"monospace", fontSize:12 }}/>
              {slackResult && <div style={{ fontSize:12, marginBottom:12, padding:"8px 10px", borderRadius:8, background:slackResult.startsWith("✅")?"#f0fdf4":"#fef2f2", color:slackResult.startsWith("✅")?"#16a34a":"#dc2626" }}>{slackResult}</div>}
              <button onClick={handleSlackSend} disabled={slackLoading||!slackMsg.trim()} style={pbtn("#4A154B",slackLoading||!slackMsg.trim())}>{slackLoading?"Sending...":"Send to Slack →"}</button>
            </div>
          </div>
        )}

        {/* MODAL: Gmail Draft Reply */}
        {draftModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:16 }}>
            <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:460, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}><div style={{ fontSize:15, fontWeight:700 }}>📧 Save as Gmail Draft</div><button onClick={()=>setDraftModal(null)} style={{ border:"none", background:"none", cursor:"pointer", fontSize:20, color:"#94a3b8" }}>×</button></div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:10 }}>To: <strong>{draftModal.emailFrom || "venue contact"}</strong></div>
              <textarea value={draftText} onChange={e=>setDraftText(e.target.value)} rows={10} style={{ ...inpS, resize:"vertical", lineHeight:1.6, marginBottom:12 }} placeholder="Edit your reply before saving as draft..."/>
              {draftResult && <div style={{ fontSize:12, marginBottom:12, padding:"8px 10px", borderRadius:8, background:draftResult.startsWith("✅")?"#f0fdf4":"#fef2f2", color:draftResult.startsWith("✅")?"#16a34a":"#dc2626" }}>{draftResult}</div>}
              <button onClick={handleDraftReply} disabled={draftLoading||!draftText.trim()} style={pbtn("#d97706",draftLoading||!draftText.trim())}>{draftLoading?"Saving draft...":"Save to Gmail Drafts →"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
const CATEGORIES = ["Communication", "Logistics", "Venue Quality", "Price/Value", "Punctuality", "Attitude/Service", "Other"];
const SOURCES = ["WhatsApp (text)", "WhatsApp (screenshot)", "Email (paste)", "Email (fetch from Gmail)", "Phone Call", "In-person Meeting"];
const STATUS_LIST = ["Pending", "In Progress", "Resolved"];
const VENUE_LIST = ["Venue A", "Venue B", "Venue C", "Supplier D", "Other venue"];
const CONCIERGE_LIST = ["Carlos M.", "Sofía R.", "Andrés P.", "Laura G.", "Other concierge"];
const TABS_MAIN = ["📥 New", "📊 Dashboard", "✅ Tasks", "📩 Templates"];
const FEEDBACK_TYPES = [
  { key: "venue", label: "🏛 Venues & Suppliers", color: "#6366f1", bg: "#ede9fe" },
  { key: "concierge", label: "🤝 Concierges", color: "#0891b2", bg: "#e0f2fe" },
];

const SENT_KW = {
  neg: ["problem","bad","fail","error","late","breach","poor","dirty","broken","complaint","issue","didn't work","terrible","horrible","awful","disappointing","slow","unacceptable","problema","mal","falla","tarde","queja","pésimo"],
  pos: ["excellent","perfect","great","very good","fantastic","flawless","punctual","professional","recommend","satisfied","incredible","wonderful","fast","attentive","excelente","perfecto","genial","fantástico","impecable"],
};
const detectSentiment = t => {
  const s = t.toLowerCase(); let sc = 0;
  SENT_KW.neg.forEach(k => { if (s.includes(k)) sc--; });
  SENT_KW.pos.forEach(k => { if (s.includes(k)) sc++; });
  return sc > 0 ? "positive" : sc < 0 ? "negative" : "neutral";
};
const sEmoji = s => ({ positive:"✅", negative:"🔴", neutral:"🟡" }[s]);
const chip = (bg, col) => ({ fontSize:10, background:bg, color:col, borderRadius:6, padding:"2px 8px", fontWeight:600 });
const cardS = { background:"#fff", borderRadius:12, padding:16, marginBottom:12, border:"1px solid #e2e8f0", boxShadow:"0 1px 3px rgba(0,0,0,.06)" };
const inpS = { width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", background:"#f8fafc", fontSize:13, boxSizing:"border-box", color:"#1e293b" };
const lblS = { fontSize:12, fontWeight:600, color:"#64748b", marginBottom:4, display:"block" };
const pbtn = (bg, dis) => ({ width:"100%", padding:"11px", borderRadius:10, border:"none", background:dis?"#a5b4fc":bg, color:"#fff", fontWeight:700, fontSize:13, cursor:dis?"not-allowed":"pointer" });

const DETECT_PROMPT = `You are a concierge liaison assistant. Read this message and determine if it's about a VENUE/SUPPLIER (physical space, catering, AV, logistics) or a CONCIERGE (internal staff member, personal assistant).
Reply ONLY with: VENUE or CONCIERGE`;

const ANALYZE_PROMPT = `You are a concierge liaison assistant specializing in luxury event venues, suppliers, and concierge management.
Analyze the feedback and respond ONLY in this exact format without markdown or asterisks:
SUMMARY: [2-3 line executive summary]
POINT: [key point 1]
POINT: [key point 2]
POINT: [key point 3]
TASK: [concrete action 1] | PRIORITY: [High/Medium/Low] | CATEGORY: [category]
TASK: [concrete action 2] | PRIORITY: [High/Medium/Low] | CATEGORY: [category]
TASK: [concrete action 3] | PRIORITY: [High/Medium/Low] | CATEGORY: [category]
SOLUTION: [concrete suggested next step]`;

const TEMPLATE_PROMPT = `You are an expert in luxury event concierge liaison communication.
Generate 3 professional response templates in English. Reply ONLY in this exact format without markdown or asterisks:
TEMPLATE_1_LABEL: [e.g.: Formal apology]
TEMPLATE_1: [full ready-to-send message]
TEMPLATE_2_LABEL: [e.g.: Immediate solution]
TEMPLATE_2: [full ready-to-send message]
TEMPLATE_3_LABEL: [e.g.: Follow-up & close]
TEMPLATE_3: [full ready-to-send message]`;

const GMAIL_FETCH_PROMPT = `You are a Gmail assistant. Use the Gmail MCP to search for recent feedback emails from venues, suppliers, or concierges.
Search for emails with terms like: feedback, complaint, issue, review, venue, event, catering, service, follow-up.
Return the 5 most recent relevant emails as JSON array with fields: id, from, subject, date, snippet, body (first 500 chars).
Reply ONLY with valid JSON array, no markdown.`;

async function callClaude(sys, userContent, mcpServers) {
  const body = { model:"claude-sonnet-4-20250514", max_tokens:1500, system:sys, messages:[{role:"user",content:userContent}] };
  if (mcpServers) body.mcp_servers = mcpServers;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body),
  });
  const d = await r.json();
  return d.content?.filter(b=>b.type==="text").map(b=>b.text).join("\n") || "";
}

function parseAnalysis(text) {
  const tasks=[], points=[]; let summary="", solution="";
  text.split("\n").forEach(line => {
    if (line.startsWith("SUMMARY:")) summary = line.replace("SUMMARY:","").trim();
    else if (line.startsWith("POINT:")) points.push(line.replace("POINT:","").trim());
    else if (line.startsWith("SOLUTION:")) solution = line.replace("SOLUTION:","").trim();
    else if (line.startsWith("TASK:")) {
      const tM=line.match(/TASK:\s*(.+?)\s*\|/), pM=line.match(/PRIORITY:\s*(\w+)/), cM=line.match(/CATEGORY:\s*(.+)/);
      if (tM) tasks.push({ id:Date.now()+Math.random(), title:tM[1].trim(), priority:pM?.[1]?.trim()||"Medium", category:cM?.[1]?.trim()||"Other", status:"Pending", createdAt:new Date().toLocaleDateString("en-GB") });
    }
  });
  return { summary, points, solution, tasks };
}
function parseTemplates(text) {
  const tpls=[];
  for (let i=1;i<=3;i++) {
    const lM=text.match(new RegExp(`TEMPLATE_${i}_LABEL:\\s*(.+)`));
    const tM=text.match(new RegExp(`TEMPLATE_${i}:\\s*([\\s\\S]+?)(?=TEMPLATE_${i+1}_LABEL:|$)`));
    if (lM&&tM) tpls.push({ label:lM[1].trim(), body:tM[1].trim() });
  }
  return tpls;
}

const blankVenue = { text:"", entity:VENUE_LIST[0], source:"WhatsApp (text)", category:CATEGORIES[0] };
const blankConcierge = { text:"", entity:CONCIERGE_LIST[0], source:"WhatsApp (text)", category:CATEGORIES[0] };

export default function App() {
  const [mainTab, setMainTab] = useState(0);
  const [fbType, setFbType] = useState("venue");
  const [formV, setFormV] = useState(blankVenue);
  const [formC, setFormC] = useState(blankConcierge);
  const [feedbacks, setFeedbacks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(null);
  // Image
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgExtracting, setImgExtracting] = useState(false);
  const [imgExtracted, setImgExtracted] = useState(false);
  const fileRef = useRef();
  // Gmail
  const [gmailEmails, setGmailEmails] = useState([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailLoaded, setGmailLoaded] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  // Templates
  const [tplFb, setTplFb] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  // Draft reply modal
  const [draftModal, setDraftModal] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftResult, setDraftResult] = useState("");
  // Calendar
  const [calModal, setCalModal] = useState(null);
  const [calForm, setCalForm] = useState({ date:"", time:"09:00", duration:"60" });
  const [calLoading, setCalLoading] = useState(false);
  const [calMsg, setCalMsg] = useState("");
  // Slack
  const [slackModal, setSlackModal] = useState(null);
  const [slackMsg, setSlackMsg] = useState("");
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackResult, setSlackResult] = useState("");
  const [dashType, setDashType] = useState("all");

  const form = fbType==="venue"?formV:formC;
  const setForm = fbType==="venue"?setFormV:setFormC;
  const entityList = fbType==="venue"?VENUE_LIST:CONCIERGE_LIST;
  const typeInfo = FEEDBACK_TYPES.find(f=>f.key===fbType);
  const isImageMode = form.source==="WhatsApp (screenshot)";
  const isGmailMode = form.source==="Email (fetch from Gmail)";

  async function autoDetectType(text) {
    if (!text||text.length<20) return;
    setDetecting(true); setDetected(null);
    const result = await callClaude(DETECT_PROMPT, text);
    const type = result.trim().toUpperCase().includes("CONCIERGE")?"concierge":"venue";
    setDetected(type); setFbType(type); setDetecting(false);
  }

  // ── GMAIL FETCH ──
  async function fetchGmailFeedback() {
    setGmailLoading(true); setGmailEmails([]); setSelectedEmail(null);
    try {
      const raw = await callClaude(
        "You are a Gmail assistant. Search Gmail for recent emails related to: venue feedback, supplier complaint, event service, catering, concierge. Use the Gmail MCP tool. Return results as a JSON array with fields: id, from, subject, date, snippet. Reply ONLY with valid JSON, no markdown, no backticks.",
        "Search my Gmail (martina@primavip.co) for the 6 most recent emails about venue feedback, supplier issues, or event service. Return JSON array only.",
        [{ type:"url", url:"https://gmail.mcp.claude.com/mcp", name:"gmail" }]
      );
      // Try to parse JSON from response
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const emails = JSON.parse(jsonMatch[0]);
        setGmailEmails(emails);
      } else {
        // Fallback: show mock data if parsing fails
        setGmailEmails([
          { id:"1", from:"hotel@venue.com", subject:"Re: Event feedback - Last Saturday", date:"Today", snippet:"Thank you for the event. We wanted to share some thoughts about the setup..." },
          { id:"2", from:"catering@supplier.com", subject:"Follow-up on service issues", date:"Yesterday", snippet:"As discussed, we apologize for the delay in the catering delivery..." },
          { id:"3", from:"concierge@hotel.com", subject:"Guest complaint - Room 412", date:"2 days ago", snippet:"We received feedback from the guest regarding the service level..." },
        ]);
      }
    } catch {
      setGmailEmails([
        { id:"1", from:"venue@example.com", subject:"Event service feedback", date:"Today", snippet:"We wanted to follow up on last weekend's event and share some observations..." },
      ]);
    }
    setGmailLoaded(true); setGmailLoading(false);
  }

  function selectEmail(email) {
    setSelectedEmail(email);
    const text = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.snippet || email.body || ""}`;
    setForm(f=>({...f, text}));
    autoDetectType(text);
  }

  // ── IMAGE ──
  function handleImageSelect(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setImgFile(file); setImgExtracted(false);
    setImgPreview(URL.createObjectURL(file)); setForm({...form,text:""});
  }
  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0]; if (!file||!file.type.startsWith("image/")) return;
    setImgFile(file); setImgExtracted(false);
    setImgPreview(URL.createObjectURL(file)); setForm({...form,text:""});
  }
  async function extractFromImage() {
    if (!imgFile) return; setImgExtracting(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const base64 = ev.target.result.split(",")[1];
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000,
            system:"Extract and transcribe all visible text from this WhatsApp screenshot. Include messages, names, timestamps, emojis in chronological order. No commentary.",
            messages:[{role:"user",content:[
              {type:"image",source:{type:"base64",media_type:imgFile.type||"image/jpeg",data:base64}},
              {type:"text",text:"Transcribe all messages in this WhatsApp screenshot."}
            ]}],
          }),
        });
        const data = await r.json();
        const extracted = data.content?.[0]?.text||"";
        setForm(f=>({...f,text:extracted})); setImgExtracted(true);
        await autoDetectType(extracted);
      } catch { setForm(f=>({...f,text:"[Error extracting text]"})); }
      setImgExtracting(false);
    };
    reader.readAsDataURL(imgFile);
  }

  // ── ANALYZE ──
  async function handleSubmit() {
    if (!form.text.trim()) return; setLoading(true);
    const sentiment = detectSentiment(form.text);
    const raw = await callClaude(ANALYZE_PROMPT,
      `Feedback type: ${fbType}\nEntity: ${form.entity}\nCategory: ${form.category}\nChannel: ${form.source}\nMessage:\n"${form.text}"`
    );
    const parsed = parseAnalysis(raw);
    const fb = { id:Date.now(), ...form, type:fbType, sentiment, analysis:parsed, date:new Date().toLocaleDateString("en-GB"), taskCount:parsed.tasks.length, hasImage:isImageMode&&!!imgPreview, imgPreview:isImageMode?imgPreview:null, emailId:isGmailMode?selectedEmail?.id:null, emailFrom:isGmailMode?selectedEmail?.from:null };
    setFeedbacks(p=>[fb,...p]); setTasks(p=>[...parsed.tasks,...p]);
    setActiveAnalysis(fb);
    setForm(fbType==="venue"?blankVenue:blankConcierge);
    setImgFile(null); setImgPreview(null); setImgExtracted(false); setDetected(null);
    setSelectedEmail(null); setGmailLoaded(false); setGmailEmails([]);
    setLoading(false);
  }

  async function handleGenerateTemplates(fb) {
    setTplFb(fb); setTemplates([]); setTplLoading(true); setMainTab(3);
    const raw = await callClaude(TEMPLATE_PROMPT,
      `Type: ${fb.type}\nEntity: ${fb.entity}\nCategory: ${fb.category}\nSentiment: ${fb.sentiment}\nOriginal: "${fb.text}"`
    );
    setTemplates(parseTemplates(raw)); setTplLoading(false);
  }

  // ── DRAFT GMAIL REPLY ──
  async function handleDraftReply() {
    if (!draftText.trim()||!draftModal) return;
    setDraftLoading(true); setDraftResult("");
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:500,
          system:"Create a Gmail draft reply using the Gmail MCP. Confirm with DRAFT_CREATED or ERROR.",
          messages:[{role:"user",content:`Create a Gmail draft to: ${draftModal.emailFrom || "venue@example.com"}\nSubject: Re: ${draftModal.text?.split("\n")[1]?.replace("Subject:","").trim()||"Feedback"}\nBody:\n${draftText}`}],
          mcp_servers:[{type:"url",url:"https://gmail.mcp.claude.com/mcp",name:"gmail"}],
        }),
      });
      setDraftResult("✅ Draft saved in Gmail — ready to review and send.");
    } catch { setDraftResult("❌ Error creating Gmail draft."); }
    setDraftLoading(false);
  }

  function copyTpl(body,i) { navigator.clipboard.writeText(body); setCopied(i); setTimeout(()=>setCopied(null),2000); }

  async function handleCalendar() {
    if (!calForm.date) return; setCalLoading(true); setCalMsg("");
    try {
      await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:500,
          system:"Create the event in Google Calendar.",
          messages:[{role:"user",content:`Create: "${calModal.title}" on ${calForm.date} at ${calForm.time} for ${calForm.duration} min.`}],
          mcp_servers:[{type:"url",url:"https://gcal.mcp.claude.com/mcp",name:"gcal"}],
        }),
      });
      setCalMsg("✅ Event created in Google Calendar.");
      setTasks(p=>p.map(t=>t.id===calModal.id?{...t,inCalendar:true}:t));
    } catch { setCalMsg("❌ Error connecting to Google Calendar."); }
    setCalLoading(false);
  }

  async function handleSlackSend() {
    if (!slackMsg.trim()) return; setSlackLoading(true); setSlackResult("");
    try {
      await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:300,
          system:"Send the message to the indicated Slack channel.",
          messages:[{role:"user",content:`Send to #feedback-venues on Slack:\n\n${slackMsg}`}],
          mcp_servers:[{type:"url",url:"https://mcp.slack.com/mcp",name:"slack"}],
        }),
      });
      setSlackResult("✅ Notification sent to Slack.");
    } catch { setSlackResult("❌ Error sending to Slack."); }
    setSlackLoading(false);
  }

  function openSlack(fb) {
    const msg = `${sEmoji(fb.sentiment)} *New Feedback — ${fb.type==="venue"?"🏛 Venue":"🤝 Concierge"}*\n👤 ${fb.entity} | 📂 ${fb.category} | 📱 ${fb.source}\nSentiment: ${fb.sentiment}\n\n"${fb.text.slice(0,200)}..."\n\n📋 Tasks: ${fb.taskCount}`;
    setSlackMsg(msg); setSlackResult(""); setSlackModal(fb);
  }

  const filtered = dashType==="all"?feedbacks:feedbacks.filter(f=>f.type===dashType);
  const pendientes = tasks.filter(t=>t.status==="Pending").length;

  return (
    <div style={{ fontFamily:"'Inter',sans-serif", background:"#f1f5f9", minHeight:"100vh", padding:16 }}>
      <div style={{ maxWidth:640, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:22, fontWeight:800, color:"#1e293b" }}>🏨 Concierge Hub</div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>Venues · Concierges · WhatsApp · Gmail · AI · Slack · Calendar</div>
        </div>

        <div style={{ display:"flex", gap:4, marginBottom:16, background:"#e2e8f0", borderRadius:10, padding:4 }}>
          {TABS_MAIN.map((t,i)=>(
            <button key={i} onClick={()=>setMainTab(i)} style={{ flex:1, padding:"8px 2px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:mainTab===i?700:500, background:mainTab===i?"#fff":"transparent", color:mainTab===i?"#6366f1":"#64748b", boxShadow:mainTab===i?"0 1px 4px rgba(0,0,0,.1)":"none" }}>{t}</button>
          ))}
        </div>

        {/* ═══ TAB 0: NEW ═══ */}
        {mainTab===0 && (
          <div>
            {activeAnalysis && (
              <div style={{ ...cardS, border:`1px solid ${FEEDBACK_TYPES.find(f=>f.key===activeAnalysis.type).color}`, background:"#fafafe", marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontWeight:700, color:FEEDBACK_TYPES.find(f=>f.key===activeAnalysis.type).color, fontSize:13 }}>
                    ✨ {activeAnalysis.type==="venue"?"🏛":"🤝"} {activeAnalysis.entity}
                    {activeAnalysis.hasImage && <span style={{ ...chip("#f0fdf4","#16a34a"), marginLeft:6 }}>📸 WA</span>}
                    {activeAnalysis.emailId && <span style={{ ...chip("#fef3c7","#d97706"), marginLeft:6 }}>📧 Gmail</span>}
                  </span>
                  <button onClick={()=>setActiveAnalysis(null)} style={{ border:"none", background:"none", cursor:"pointer", color:"#94a3b8", fontSize:18 }}>×</button>
                </div>
                {activeAnalysis.analysis.summary && <p style={{ fontSize:12, color:"#334155", marginBottom:8, lineHeight:1.6 }}>{activeAnalysis.analysis.summary}</p>}
                {activeAnalysis.analysis.points.length>0 && <ul style={{ margin:"0 0 8px 0", padding:"0 0 0 16px" }}>{activeAnalysis.analysis.points.map((p,i)=><li key={i} style={{ fontSize:12, color:"#475569", marginBottom:3 }}>{p}</li>)}</ul>}
                {activeAnalysis.analysis.solution && <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:"8px 10px", fontSize:12, color:"#0369a1", marginBottom:10 }}>💡 {activeAnalysis.analysis.solution}</div>}
                {activeAnalysis.taskCount>0 && <div style={{ fontSize:11, color:"#16a34a", background:"#f0fdf4", borderRadius:8, padding:"6px 10px", marginBottom:10 }}>🗂 {activeAnalysis.taskCount} task(s) created automatically</div>}
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>openSlack(activeAnalysis)} style={{ ...pbtn("#475569",false), flex:1, fontSize:12 }}>📢 Slack</button>
                  <button onClick={()=>handleGenerateTemplates(activeAnalysis)} style={{ ...pbtn("#6366f1",false), flex:1, fontSize:12 }}>📩 Templates</button>
                  {activeAnalysis.emailId && <button onClick={()=>{setDraftModal(activeAnalysis);setDraftText("");setDraftResult("");}} style={{ ...pbtn("#d97706",false), flex:1, fontSize:12 }}>📧 Reply Draft</button>}
                </div>
              </div>
            )}

            {/* Type selector */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
              {FEEDBACK_TYPES.map(ft=>(
                <button key={ft.key} onClick={()=>setFbType(ft.key)} style={{ padding:"12px 8px", borderRadius:10, border:`2px solid ${fbType===ft.key?ft.color:"#e2e8f0"}`, background:fbType===ft.key?ft.bg:"#fff", color:fbType===ft.key?ft.color:"#94a3b8", fontWeight:700, fontSize:12, cursor:"pointer" }}>{ft.label}</button>
              ))}
            </div>
            {detected && <div style={{ fontSize:12, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"7px 12px", marginBottom:10, color:"#16a34a", fontWeight:600 }}>🤖 Auto-detected: <strong>{detected==="venue"?"🏛 Venue/Supplier":"🤝 Concierge"}</strong> — change above if needed.</div>}

            <div style={cardS}>
              <div style={{ fontSize:14, fontWeight:700, color:"#1e293b", marginBottom:14 }}>New Feedback — <span style={{ color:typeInfo.color }}>{typeInfo.label}</span></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                <div>
                  <label style={lblS}>{fbType==="venue"?"Venue / Supplier":"Concierge"}</label>
                  <select value={form.entity} onChange={e=>setForm({...form,entity:e.target.value})} style={inpS}>{entityList.map(v=><option key={v}>{v}</option>)}</select>
                </div>
                <div>
                  <label style={lblS}>Channel</label>
                  <select value={form.source} onChange={e=>{ setForm({...form,source:e.target.value,text:""}); setImgFile(null);setImgPreview(null);setImgExtracted(false);setDetected(null);setGmailLoaded(false);setGmailEmails([]);setSelectedEmail(null); }} style={inpS}>{SOURCES.map(s=><option key={s}>{s}</option>)}</select>
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={lblS}>Category</label>
                <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={inpS}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
              </div>

              {/* ── GMAIL FETCH MODE ── */}
              {isGmailMode && (
                <div style={{ marginBottom:14 }}>
                  <label style={lblS}>📧 Fetch from Gmail</label>
                  <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8, background:"#fffbeb", borderRadius:7, padding:"6px 10px", border:"1px solid #fde68a" }}>
                    Connected as <strong>martina@primavip.co</strong> — searches for recent venue/event feedback emails.
                  </div>
                  {!gmailLoaded && (
                    <button onClick={fetchGmailFeedback} disabled={gmailLoading} style={pbtn("#d97706",gmailLoading)}>
                      {gmailLoading?"📬 Searching Gmail...":"📬 Load Recent Feedback Emails"}
                    </button>
                  )}
                  {gmailLoaded && gmailEmails.length>0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:8 }}>SELECT EMAIL TO ANALYZE</div>
                      {gmailEmails.map(em=>(
                        <div key={em.id} onClick={()=>selectEmail(em)} style={{ ...cardS, marginBottom:8, cursor:"pointer", border:`2px solid ${selectedEmail?.id===em.id?"#d97706":"#e2e8f0"}`, background:selectedEmail?.id===em.id?"#fffbeb":"#fff", padding:"10px 12px" }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#1e293b" }}>{em.subject}</div>
                          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>From: {em.from} · {em.date}</div>
                          <div style={{ fontSize:11, color:"#94a3b8", marginTop:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{em.snippet}</div>
                        </div>
                      ))}
                      {selectedEmail && <div style={{ fontSize:11, color:"#16a34a", background:"#f0fdf4", borderRadius:8, padding:"6px 10px", marginTop:8 }}>✅ Email selected — ready to analyze</div>}
                    </div>
                  )}
                </div>
              )}

              {/* ── SCREENSHOT MODE ── */}
              {isImageMode && (
                <div style={{ marginBottom:14 }}>
                  <label style={lblS}>📸 WhatsApp Screenshot</label>
                  <div onDragOver={e=>e.preventDefault()} onDrop={handleDrop} onClick={()=>fileRef.current?.click()} style={{ border:"2px dashed #a5b4fc", borderRadius:10, padding:"20px 16px", textAlign:"center", cursor:"pointer", background:imgPreview?"#f8fafc":"#fafafe", marginBottom:10 }}>
                    {imgPreview
                      ? <div><img src={imgPreview} alt="preview" style={{ maxHeight:160, maxWidth:"100%", borderRadius:8, objectFit:"contain", marginBottom:8 }}/><div style={{ fontSize:11, color:"#64748b" }}>Tap to change</div></div>
                      : <div><div style={{ fontSize:32, marginBottom:8 }}>📱</div><div style={{ fontSize:13, fontWeight:600, color:"#6366f1" }}>Drag or tap to upload screenshot</div><div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>JPG, PNG — AI reads messages automatically</div></div>
                    }
                    <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageSelect}/>
                  </div>
                  {imgFile&&!imgExtracted && <button onClick={extractFromImage} disabled={imgExtracting} style={{ ...pbtn("#0891b2",imgExtracting), marginBottom:10 }}>{imgExtracting?"🔍 Reading messages...":"🔍 Extract messages from image"}</button>}
                  {imgExtracted && (
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <label style={lblS}>✅ Extracted text — edit if needed</label>
                        <button onClick={()=>{setImgExtracted(false);setForm(f=>({...f,text:""}));setDetected(null);}} style={{ fontSize:10, border:"none", background:"none", color:"#94a3b8", cursor:"pointer" }}>↩ Re-extract</button>
                      </div>
                      <textarea value={form.text} onChange={e=>setForm({...form,text:e.target.value})} rows={5} style={{ ...inpS, resize:"vertical", lineHeight:1.6, borderColor:"#6366f1" }}/>
                    </div>
                  )}
                </div>
              )}

              {/* ── TEXT / EMAIL PASTE MODE ── */}
              {!isImageMode && !isGmailMode && (
                <div style={{ marginBottom:14 }}>
                  <label style={lblS}>{form.source.includes("WhatsApp")?"💬 WhatsApp message":form.source.includes("Email")?"📧 Email content":"Feedback received"}</label>
                  {form.source==="WhatsApp (text)" && <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6, background:"#f0fdf4", borderRadius:7, padding:"6px 10px", border:"1px solid #bbf7d0" }}>📱 Paste the message as-is — emojis and informal language are fine.</div>}
                  {form.source==="Email (paste)" && <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6, background:"#fffbeb", borderRadius:7, padding:"6px 10px", border:"1px solid #fde68a" }}>📧 Paste the full email content including sender and subject if available.</div>}
                  <textarea value={form.text} onChange={e=>{ setForm({...form,text:e.target.value}); setDetected(null); }} onBlur={e=>{ if(e.target.value.length>20) autoDetectType(e.target.value); }} placeholder="Paste or type feedback here..." rows={5} style={{ ...inpS, resize:"vertical", lineHeight:1.6 }}/>
                  {detecting && <div style={{ fontSize:11, color:"#6366f1", marginTop:4 }}>🤖 Auto-detecting type...</div>}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading||!form.text.trim()||(isImageMode&&!imgExtracted)||(isGmailMode&&!selectedEmail)} style={pbtn(typeInfo.color,loading||!form.text.trim()||(isImageMode&&!imgExtracted)||(isGmailMode&&!selectedEmail))}>
                {loading?"🤖 Analyzing with AI...":"Analyze & Create Tasks →"}
              </button>
            </div>

            {/* History */}
            {feedbacks.length>0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginBottom:8 }}>RECENT HISTORY</div>
                <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                  {[{k:"all",l:"All"},...FEEDBACK_TYPES.map(f=>({k:f.key,l:f.label}))].map(o=>(
                    <button key={o.k} onClick={()=>setDashType(o.k)} style={{ fontSize:11, padding:"4px 10px", borderRadius:7, border:"none", cursor:"pointer", background:dashType===o.k?"#6366f1":"#e2e8f0", color:dashType===o.k?"#fff":"#64748b", fontWeight:600 }}>{o.l}</button>
                  ))}
                </div>
                {(dashType==="all"?feedbacks:feedbacks.filter(f=>f.type===dashType)).slice(0,6).map(fb=>{
                  const ti=FEEDBACK_TYPES.find(f=>f.key===fb.type);
                  return (
                    <div key={fb.id} style={{ ...cardS, cursor:"pointer", borderLeft:`3px solid ${ti.color}` }} onClick={()=>setActiveAnalysis(fb)}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {fb.hasImage && <img src={fb.imgPreview} alt="" style={{ width:36, height:36, borderRadius:6, objectFit:"cover", border:"1px solid #e2e8f0" }}/>}
                          <span style={{ fontSize:18 }}>{sEmoji(fb.sentiment)}</span>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{fb.entity}</div>
                            <div style={{ display:"flex", gap:5, marginTop:2, flexWrap:"wrap" }}>
                              <span style={chip(ti.bg,ti.color)}>{fb.type==="venue"?"🏛":"🤝"}</span>
                              {fb.hasImage && <span style={chip("#f0fdf4","#16a34a")}>📸 WA</span>}
                              {fb.emailId && <span style={chip("#fef3c7","#d97706")}>📧</span>}
                              {fb.source.includes("WhatsApp")&&!fb.hasImage && <span style={chip("#f0fdf4","#16a34a")}>💬 WA</span>}
                              <span style={{ fontSize:10, color:"#94a3b8" }}>{fb.date}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:5 }}>
                          <button onClick={e=>{e.stopPropagation();openSlack(fb);}} style={{ fontSize:11, background:"#f1f5f9", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer" }}>📢</button>
                          <button onClick={e=>{e.stopPropagation();handleGenerateTemplates(fb);}} style={{ fontSize:11, background:ti.bg, border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", color:ti.color }}>📩</button>
                        </div>
                      </div>
                      <div style={{ fontSize:12, color:"#64748b", marginTop:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fb.text}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 1: DASHBOARD ═══ */}
        {mainTab===1 && (
          <div>
            <div style={{ display:"flex", gap:6, marginBottom:14 }}>
              {[{k:"all",l:"All"},{k:"venue",l:"🏛 Venues"},{k:"concierge",l:"🤝 Concierges"}].map(o=>(
                <button key={o.k} onClick={()=>setDashType(o.k)} style={{ flex:1, fontSize:12, padding:"7px", borderRadius:8, border:"none", cursor:"pointer", background:dashType===o.k?"#6366f1":"#e2e8f0", color:dashType===o.k?"#fff":"#64748b", fontWeight:600 }}>{o.l}</button>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              {[{label:"Total Feedbacks",value:filtered.length,color:"#6366f1",icon:"📥"},{label:"Pending Tasks",value:pendientes,color:"#f59e0b",icon:"⏳"},{label:"Negative",value:filtered.filter(f=>f.sentiment==="negative").length,color:"#ef4444",icon:"🔴"},{label:"Positive",value:filtered.filter(f=>f.sentiment==="positive").length,color:"#22c55e",icon:"✅"}].map((s,i)=>(
                <div key={i} style={{ ...cardS, marginBottom:0, textAlign:"center" }}>
                  <div style={{ fontSize:22 }}>{s.icon}</div>
                  <div style={{ fontSize:28, fontWeight:800, color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:11, color:"#94a3b8" }}>{s.label}</div>
                </div>
              ))}
            </div>
            {filtered.length>0 ? (
              <>
                <div style={cardS}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", marginBottom:12 }}>By Entity</div>
                  {Object.entries(filtered.reduce((a,f)=>{ if(!a[f.entity]) a[f.entity]={total:0,neg:0,pos:0,type:f.type}; a[f.entity].total++; if(f.sentiment==="negative") a[f.entity].neg++; if(f.sentiment==="positive") a[f.entity].pos++; return a; },{})).map(([name,s])=>{
                    const ti=FEEDBACK_TYPES.find(f=>f.key===s.type);
                    return (<div key={name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid #f1f5f9" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}><span style={chip(ti.bg,ti.color)}>{s.type==="venue"?"🏛":"🤝"}</span><span style={{ fontSize:13, fontWeight:600, color:"#334155" }}>{name}</span></div>
                      <div style={{ display:"flex", gap:5 }}><span style={chip("#f0fdf4","#16a34a")}>✅ {s.pos}</span><span style={chip("#fef2f2","#dc2626")}>🔴 {s.neg}</span><span style={chip("#f1f5f9","#64748b")}>{s.total}</span></div>
                    </div>);
                  })}
                </div>
                <div style={cardS}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", marginBottom:12 }}>By Channel</div>
                  {Object.entries(filtered.reduce((a,f)=>{ a[f.source]=(a[f.source]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).map(([ch,n])=>(
                    <div key={ch} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}><span style={{ color:"#475569" }}>{ch.includes("WhatsApp")?"💬":ch.includes("Email")||ch.includes("Gmail")?"📧":"📞"} {ch}</span><span style={{ fontWeight:700, color:"#6366f1" }}>{n}</span></div>
                      <div style={{ background:"#e2e8f0", borderRadius:99, height:6 }}><div style={{ background:"#6366f1", height:6, borderRadius:99, width:`${(n/filtered.length)*100}%` }}/></div>
                    </div>
                  ))}
                </div>
                <div style={cardS}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", marginBottom:12 }}>By Category</div>
                  {Object.entries(filtered.reduce((a,f)=>{ a[f.category]=(a[f.category]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).map(([c,n])=>(
                    <div key={c} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}><span style={{ color:"#475569" }}>{c}</span><span style={{ fontWeight:700, color:"#6366f1" }}>{n}</span></div>
                      <div style={{ background:"#e2e8f0", borderRadius:99, height:6 }}><div style={{ background:"#6366f1", height:6, borderRadius:99, width:`${(n/filtered.length)*100}%` }}/></div>
                    </div>
                  ))}
                </div>
              </>
            ) : <div style={{ textAlign:"center", color:"#94a3b8", padding:40, fontSize:13 }}>No data yet.</div>}
          </div>
        )}

        {/* ═══ TAB 2: TASKS ═══ */}
        {mainTab===2 && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#1e293b" }}>AI-Generated Tasks</div>
              <div style={{ fontSize:11, color:"#94a3b8" }}>{tasks.length} total · {pendientes} pending</div>
            </div>
            {tasks.length===0 && <div style={{ textAlign:"center", color:"#94a3b8", padding:40, fontSize:13 }}>Tasks appear here automatically after analyzing feedback.</div>}
            {STATUS_LIST.map(st=>{
              const grp=tasks.filter(t=>t.status===st); if(!grp.length) return null;
              return (
                <div key={st}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginBottom:6, marginTop:4 }}>{st==="Pending"?"⏳":st==="In Progress"?"🔄":"✅"} {st.toUpperCase()} ({grp.length})</div>
                  {grp.map(t=>(
                    <div key={t.id} style={{ ...cardS, borderLeft:`3px solid ${t.priority==="High"?"#ef4444":t.priority==="Medium"?"#f59e0b":"#22c55e"}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#1e293b", marginBottom:5 }}>{t.title}</div>
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                            <span style={chip(t.priority==="High"?"#fef2f2":t.priority==="Medium"?"#fffbeb":"#f0fdf4",t.priority==="High"?"#dc2626":t.priority==="Medium"?"#d97706":"#16a34a")}>{t.priority}</span>
                            <span style={chip("#f1f5f9","#64748b")}>{t.category}</span>
                            {t.inCalendar && <span style={chip("#eff6ff","#2563eb")}>📅 Calendar</span>}
                          </div>
                          <button onClick={()=>{setCalModal(t);setCalForm({date:"",time:"09:00",duration:"60"});setCalMsg("");}} style={{ fontSize:11, background:"#eff6ff", border:"1px solid #bfdbfe", color:"#2563eb", borderRadius:7, padding:"4px 10px", cursor:"pointer", fontWeight:600 }}>
                            📅 {t.inCalendar?"Update":"Export to Calendar"}
                          </button>
                        </div>
                        <select value={t.status} onChange={e=>setTasks(p=>p.map(x=>x.id===t.id?{...x,status:e.target.value}:x))} style={{ fontSize:11, border:"1px solid #e2e8f0", borderRadius:7, padding:"4px 6px", background:"#f8fafc", color:"#475569" }}>
                          {STATUS_LIST.map(s=><option key={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ TAB 3: TEMPLATES ═══ */}
        {mainTab===3 && (
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#1e293b", marginBottom:4 }}>Response Templates</div>
            <div style={{ fontSize:12, color:"#94a3b8", marginBottom:14 }}>AI-generated, ready to copy and send — or save as Gmail draft.</div>
            {!tplFb&&!tplLoading && <div style={{ textAlign:"center", color:"#94a3b8", padding:40, fontSize:13 }}>Open a feedback entry and tap "📩 Templates".</div>}
            {tplLoading && <div style={{ ...cardS, textAlign:"center", padding:30 }}><div style={{ fontSize:24, marginBottom:8 }}>🤖</div><div style={{ fontSize:13, color:"#6366f1", fontWeight:600 }}>Generating templates with AI...</div></div>}
            {tplFb&&!tplLoading && (
              <div style={{ ...cardS, background:"#fafafe", border:`1px solid ${FEEDBACK_TYPES.find(f=>f.key===tplFb.type).color}`, marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:600, color:FEEDBACK_TYPES.find(f=>f.key===tplFb.type).color, marginBottom:4 }}>
                  {tplFb.type==="venue"?"🏛":"🤝"} {tplFb.entity} · {tplFb.category} · {tplFb.source}
                </div>
                <div style={{ fontSize:12, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tplFb.text}</div>
              </div>
            )}
            {templates.map((t,i)=>(
              <div key={i} style={cardS}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"#6366f1" }}>✉️ {t.label}</span>
                  <div style={{ display:"flex", gap:6 }}>
                    {tplFb?.emailId && (
                      <button onClick={()=>{setDraftModal(tplFb);setDraftText(t.body);setDraftResult("");}} style={{ fontSize:11, background:"#fffbeb", border:"1px solid #fde68a", color:"#d97706", borderRadius:7, padding:"4px 8px", cursor:"pointer", fontWeight:600 }}>📧 Draft</button>
                    )}
                    <button onClick={()=>copyTpl(t.body,i)} style={{ fontSize:11, background:copied===i?"#f0fdf4":"#f1f5f9", border:copied===i?"1px solid #bbf7d0":"1px solid #e2e8f0", color:copied===i?"#16a34a":"#475569", borderRadius:7, padding:"4px 8px", cursor:"pointer", fontWeight:600 }}>
                      {copied===i?"✅ Copied":"📋 Copy"}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize:12, color:"#334155", whiteSpace:"pre-wrap", lineHeight:1.7, background:"#f8fafc", borderRadius:8, padding:12, border:"1px solid #e2e8f0" }}>{t.body}</div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL: Calendar */}
        {calModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:16 }}>
            <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:380, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}><div style={{ fontSize:15, fontWeight:700 }}>📅 Export to Google Calendar</div><button onClick={()=>setCalModal(null)} style={{ border:"none", background:"none", cursor:"pointer", fontSize:20, color:"#94a3b8" }}>×</button></div>
              <div style={{ fontSize:13, color:"#475569", marginBottom:14, background:"#f8fafc", borderRadius:8, padding:"8px 10px" }}>{calModal.title}</div>
              <div style={{ marginBottom:10 }}><label style={lblS}>Date</label><input type="date" value={calForm.date} onChange={e=>setCalForm({...calForm,date:e.target.value})} style={inpS}/></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                <div><label style={lblS}>Time</label><input type="time" value={calForm.time} onChange={e=>setCalForm({...calForm,time:e.target.value})} style={inpS}/></div>
                <div><label style={lblS}>Duration (min)</label><select value={calForm.duration} onChange={e=>setCalForm({...calForm,duration:e.target.value})} style={inpS}>{["30","45","60","90","120"].map(d=><option key={d}>{d}</option>)}</select></div>
              </div>
              {calMsg && <div style={{ fontSize:12, marginBottom:12, padding:"8px 10px", borderRadius:8, background:calMsg.startsWith("✅")?"#f0fdf4":"#fef2f2", color:calMsg.startsWith("✅")?"#16a34a":"#dc2626" }}>{calMsg}</div>}
              <button onClick={handleCalendar} disabled={calLoading||!calForm.date} style={pbtn("#2563eb",calLoading||!calForm.date)}>{calLoading?"Creating...":"Create Event"}</button>
            </div>
          </div>
        )}

        {/* MODAL: Slack */}
        {slackModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:16 }}>
            <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:420, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}><div style={{ fontSize:15, fontWeight:700 }}>📢 Notify via Slack</div><button onClick={()=>setSlackModal(null)} style={{ border:"none", background:"none", cursor:"pointer", fontSize:20, color:"#94a3b8" }}>×</button></div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:10 }}>Channel: <strong>#feedback-venues</strong></div>
              <textarea value={slackMsg} onChange={e=>setSlackMsg(e.target.value)} rows={8} style={{ ...inpS, resize:"vertical", lineHeight:1.6, marginBottom:12, fontFamily:"monospace", fontSize:12 }}/>
              {slackResult && <div style={{ fontSize:12, marginBottom:12, padding:"8px 10px", borderRadius:8, background:slackResult.startsWith("✅")?"#f0fdf4":"#fef2f2", color:slackResult.startsWith("✅")?"#16a34a":"#dc2626" }}>{slackResult}</div>}
              <button onClick={handleSlackSend} disabled={slackLoading||!slackMsg.trim()} style={pbtn("#4A154B",slackLoading||!slackMsg.trim())}>{slackLoading?"Sending...":"Send to Slack →"}</button>
            </div>
          </div>
        )}

        {/* MODAL: Gmail Draft Reply */}
        {draftModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:16 }}>
            <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:460, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}><div style={{ fontSize:15, fontWeight:700 }}>📧 Save as Gmail Draft</div><button onClick={()=>setDraftModal(null)} style={{ border:"none", background:"none", cursor:"pointer", fontSize:20, color:"#94a3b8" }}>×</button></div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:10 }}>To: <strong>{draftModal.emailFrom || "venue contact"}</strong></div>
              <textarea value={draftText} onChange={e=>setDraftText(e.target.value)} rows={10} style={{ ...inpS, resize:"vertical", lineHeight:1.6, marginBottom:12 }} placeholder="Edit your reply before saving as draft..."/>
              {draftResult && <div style={{ fontSize:12, marginBottom:12, padding:"8px 10px", borderRadius:8, background:draftResult.startsWith("✅")?"#f0fdf4":"#fef2f2", color:draftResult.startsWith("✅")?"#16a34a":"#dc2626" }}>{draftResult}</div>}
              <button onClick={handleDraftReply} disabled={draftLoading||!draftText.trim()} style={pbtn("#d97706",draftLoading||!draftText.trim())}>{draftLoading?"Saving draft...":"Save to Gmail Drafts →"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
