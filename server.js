import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDatabase, storageMode, writeDatabase } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await loadEnvFile(path.join(__dirname, ".env"));
await loadEnvFile(path.join(__dirname, ".env.local"));

const publicDir = path.join(__dirname, "public");
const dbPath = path.join(__dirname, "data", "leadher-db.json");
const port = Number(process.env.PORT || 4173);
const sessionCookieName = "manageher_session";
const sessionMaxAgeSeconds = 60 * 60 * 8;

const opportunityStages = [
  "New Lead",
  "Qualified",
  "Research Complete",
  "Outreach Sent",
  "Follow-up Due",
  "Meeting Booked",
  "Proposal Sent",
  "Negotiation",
  "Won",
  "Lost"
];

const services = [
  "Strategic planning",
  "Project management",
  "Programme management",
  "Tourism development",
  "Community tourism",
  "Culinary tourism",
  "Export development",
  "Caribbean market entry",
  "Latin America market entry",
  "Sustainability and ESG consulting",
  "Organizational transformation",
  "Executive coaching",
  "Leadership training",
  "Proposal writing",
  "Market research"
];

const systemPrompt = `You are ManageHer, an AI Business Development Director representing Dr. Cornelia Walters-Jones. Your role is to identify opportunities, research prospects, draft outreach, prepare proposals, and recommend next actions. Write in a professional, confident, warm, strategic, Caribbean-global executive voice. Do not exaggerate Dr. Walters-Jones' experience. Use only verified knowledge from the user profile and uploaded knowledge base.`;

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      const value = match[2].replace(/^['"]|['"]$/g, "");
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function readDb() {
  return readDatabase(dbPath);
}

async function writeDb(db) {
  await writeDatabase(dbPath, db);
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((cookie) => {
    const [name, ...value] = cookie.trim().split("=");
    return [name, decodeURIComponent(value.join("="))];
  }));
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || "development-only-change-me";
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSessionToken(user) {
  const payload = base64Url(JSON.stringify({
    sub: user.id,
    email: user.email,
    exp: Date.now() + sessionMaxAgeSeconds * 1000
  }));
  return `${payload}.${sign(payload)}`;
}

function getSession(req) {
  const token = parseCookies(req)[sessionCookieName];
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !timingSafeEqualText(signature, sign(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.exp || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function sessionCookie(token, req) {
  const secure = req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAgeSeconds}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(req) {
  const secure = req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
  return `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, iterationsText, salt, expected] = String(storedHash || "").split("$");
  if (scheme !== "pbkdf2_sha256" || !iterationsText || !salt || !expected) return false;
  const iterations = Number(iterationsText);
  const actual = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return timingSafeEqualText(actual, expected);
}

function notFound(res) {
  sendJson(res, { error: "Not found" }, 404);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function getCompany(db, id) {
  return db.companies.find((company) => company.id === id);
}

function getOpportunityContext(db, opportunityId) {
  const opportunity = db.opportunities.find((item) => item.id === opportunityId);
  if (!opportunity) return null;
  const company = getCompany(db, opportunity.company_id);
  const contacts = db.contacts.filter((contact) => contact.company_id === opportunity.company_id);
  const knowledge = db.knowledge_documents.map((doc) => doc.extracted_text).filter(Boolean).join("\n\n");
  return { opportunity, company, contacts, knowledge };
}

function chooseService(company, notes = "") {
  const text = `${company?.sector || ""} ${company?.description || ""} ${notes}`.toLowerCase();
  if (text.includes("tourism") && text.includes("community")) return "Community tourism";
  if (text.includes("tourism") && text.includes("culinary")) return "Culinary tourism";
  if (text.includes("tourism")) return "Tourism development";
  if (text.includes("export") || text.includes("trade")) return "Export development";
  if (text.includes("latin")) return "Latin America market entry";
  if (text.includes("caribbean")) return "Caribbean market entry";
  if (text.includes("sustain")) return "Sustainability and ESG consulting";
  if (text.includes("leadership")) return "Leadership training";
  return "Strategic planning";
}

function scoreOpportunity(company, notes = "") {
  const text = `${company?.sector || ""} ${company?.country || ""} ${company?.description || ""} ${notes}`;
  let score = 56;
  if (/tourism|export|trade|sustainability|caribbean|latin|leadership/i.test(text)) score += 18;
  if (company?.website) score += 6;
  if (company?.description?.length > 60) score += 8;
  if (/urgent|funding|growth|expansion|transformation|programme/i.test(notes)) score += 8;
  return Math.max(35, Math.min(94, score));
}

function localResearch({ company, notes }) {
  const service = chooseService(company, notes);
  const score = scoreOpportunity(company, notes);
  return {
    companyOverview: `${company.name} operates in ${company.sector || "a strategic growth sector"} in ${company.country || "the region"}. ${company.description || "The available profile suggests a useful entry point for structured business development research."}`,
    likelyNeeds: [
      "Sharper growth priorities and implementation roadmap",
      "Partner-ready positioning for regional or international opportunities",
      "Executive support translating strategy into funded, measurable initiatives"
    ],
    decisionMakers: [
      "Managing Director or CEO",
      "Head of Strategy or Business Development",
      "Programme, Sustainability, Tourism, or Export lead"
    ],
    recommendedService: service,
    opportunityScore: score,
    suggestedFirstMessage: `A concise note to ${company.name} should acknowledge their ${company.sector || "market"} context and offer a short conversation on how Dr. Walters-Jones can support ${service.toLowerCase()} with practical, executive-level guidance.`,
    keyRisks: [
      "Decision timing may depend on funding cycles or board priorities",
      "Needs may be broad, so the first call should narrow the commercial objective",
      "Avoid over-positioning before confirming internal capacity and urgency"
    ],
    nextBestAction: `Send personalized outreach and ask for a 25-minute discovery conversation focused on ${service.toLowerCase()}.`
  };
}

function localOutreach({ company, opportunity, notes }) {
  const service = opportunity?.recommended_service || chooseService(company, notes);
  return {
    subject: `${service} support for ${company.name}`,
    email: `Hello,\n\nI noticed ${company.name}'s work in ${company.sector || "your sector"} and the opportunity to strengthen growth with a practical, well-governed approach.\n\nDr. Cornelia Walters-Jones supports organizations across consulting, project management, sustainability, tourism development, international trade, and market expansion. Based on your context, ${service.toLowerCase()} may be a useful place to explore where strategy, partnerships, and execution can come together.\n\nWould you be open to a brief 25-minute conversation next week to compare priorities and see whether there is a practical fit?\n\nWarm regards,\nDr. Cornelia Walters-Jones`,
    linkedin: `Hello, I came across ${company.name}'s work in ${company.sector || "your sector"} and thought there may be a useful conversation around ${service.toLowerCase()}. Dr. Cornelia Walters-Jones supports strategy, project delivery, sustainability, tourism, trade, and market expansion initiatives. Would you be open to connecting?`,
    followUps: buildFollowUps(company, service)
  };
}

function buildFollowUps(company, service) {
  return [
    {
      day: 1,
      title: "Introductory email",
      copy: `Introduce Dr. Walters-Jones and connect ${service.toLowerCase()} to ${company.name}'s likely growth priorities.`
    },
    {
      day: 3,
      title: "Value-based follow-up",
      copy: `Share one practical observation about strengthening execution, partnerships, or market readiness.`
    },
    {
      day: 7,
      title: "Case study or insight",
      copy: `Offer a brief insight relevant to ${company.sector || "their sector"} and invite a short discussion.`
    },
    {
      day: 14,
      title: "Meeting request",
      copy: `Ask directly for a 25-minute discovery call to assess whether ${service.toLowerCase()} support would be timely.`
    },
    {
      day: 21,
      title: "Final check-in",
      copy: `Close the loop respectfully and leave the door open for future planning cycles.`
    }
  ];
}

function localProposal({ company, opportunity }) {
  const service = opportunity?.recommended_service || chooseService(company);
  return {
    title: `${service} Proposal for ${company.name}`,
    coverLetter: `Thank you for the opportunity to outline how Dr. Cornelia Walters-Jones can support ${company.name}. This proposal focuses on practical, executive-level support that connects strategy, delivery, and measurable outcomes.`,
    executiveSummary: `${company.name} can benefit from a structured ${service.toLowerCase()} engagement that clarifies priorities, aligns stakeholders, and creates an implementation path suited to the Caribbean-global context.`,
    clientChallenge: `The central challenge is likely to be translating strategic ambition into a focused roadmap with the right partnerships, governance, and delivery rhythm.`,
    recommendedSolution: `A phased advisory engagement led by Dr. Walters-Jones, combining research, stakeholder consultation, strategy development, and implementation planning.`,
    scopeOfWork: [
      "Discovery and document review",
      "Stakeholder interviews or working sessions",
      "Market, programme, or organizational analysis",
      "Strategic recommendations and implementation roadmap",
      "Executive review session and next-step planning"
    ],
    timeline: "4 to 8 weeks depending on stakeholder access and final scope.",
    deliverables: [
      "Situation brief",
      "Strategic recommendations",
      "Implementation roadmap",
      "Executive presentation",
      "Priority action plan"
    ],
    investmentRange: opportunity?.value ? `$${Number(opportunity.value).toLocaleString()} indicative project value` : "$15,000 to $45,000 depending on scope",
    nextSteps: "Confirm objectives, agree scope, schedule discovery session, and finalize proposal terms."
  };
}

async function callOpenAI(task, payload) {
  if (!process.env.OPENAI_API_KEY) return null;
  const prompts = {
    research: "Prepare a concise sales intelligence brief as JSON with companyOverview, likelyNeeds, decisionMakers, recommendedService, opportunityScore, suggestedFirstMessage, keyRisks, nextBestAction.",
    outreach: "Write JSON with subject, email, linkedin, and followUps for a personalized cold outreach sequence.",
    proposal: "Create JSON with title, coverLetter, executiveSummary, clientChallenge, recommendedSolution, scopeOfWork, timeline, deliverables, investmentRange, nextSteps.",
    meeting: "Create JSON with agenda, discoveryQuestions, likelyConcerns, positioningNotes, and recommendedClose."
  };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${prompts[task]}\n\nContext:\n${JSON.stringify(payload, null, 2)}` }
        ],
        text: { format: { type: "json_object" } },
        store: false
      })
    });
    if (!response.ok) {
      console.warn(`OpenAI request failed with status ${response.status}. Falling back to local generation.`);
      return null;
    }
    const data = await response.json();
    const text = data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text).join("");
    return text ? parseJsonOutput(text) : null;
  } catch (error) {
    console.warn(`OpenAI request could not complete. Falling back to local generation.`);
    return null;
  }
}

function parseJsonOutput(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

async function handleApi(req, res, pathname) {
  const db = await readDb();

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const adminEmail = process.env.ADMIN_EMAIL || db.users[0]?.email;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;
    const user = db.users.find((item) => item.email.toLowerCase() === String(body.email || "").toLowerCase());
    const isValidUser = user && user.email.toLowerCase() === String(adminEmail || "").toLowerCase();
    if (!adminHash) return sendJson(res, { error: "Admin password hash is not configured" }, 500);
    if (!isValidUser || !verifyPassword(body.password || "", adminHash)) {
      return sendJson(res, { error: "Invalid email or password" }, 401);
    }
    res.setHeader("Set-Cookie", sessionCookie(createSessionToken(user), req));
    return sendJson(res, { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    res.setHeader("Set-Cookie", clearSessionCookie(req));
    return sendJson(res, { ok: true });
  }

  const session = getSession(req);
  if (!session) {
    return sendJson(res, { error: "Authentication required" }, 401);
  }

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    return sendJson(res, {
      ...db,
      opportunityStages,
      services,
      systemPrompt,
      aiConfigured: Boolean(process.env.OPENAI_API_KEY),
      aiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      storageMode: storageMode()
    });
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    const activeStages = new Set(opportunityStages.slice(0, 8));
    const today = new Date().toISOString().slice(0, 10);
    const active = db.opportunities.filter((opp) => activeStages.has(opp.stage));
    const followUps = db.tasks.filter((task) => task.status !== "done" && task.due_date <= today);
    const overdueTasks = db.tasks.filter((task) => task.status !== "done" && task.due_date && task.due_date < today);
    const proposalsPending = db.proposals.filter((proposal) => proposal.status !== "accepted").length +
      db.opportunities.filter((opp) => ["Proposal Sent", "Negotiation"].includes(opp.stage)).length;
    const pipelineValue = active.reduce((sum, opp) => sum + Number(opp.value || 0), 0);
    const wonValue = db.opportunities
      .filter((opp) => opp.stage === "Won")
      .reduce((sum, opp) => sum + Number(opp.value || 0), 0);
    const weightedForecast = active.reduce((sum, opp) => {
      const probability = Number(opp.probability || 0) / 100;
      return sum + Number(opp.value || 0) * probability;
    }, 0);
    const salesTarget = Number(process.env.SALES_TARGET || 100000);
    const staleOpportunities = active.filter((opp) => {
      const ageMs = Date.now() - new Date(opp.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      return ageDays > 21 && !["Meeting Booked", "Proposal Sent", "Negotiation"].includes(opp.stage);
    }).length;
    const activityStoplight = [
      {
        color: "green",
        label: "On track",
        value: db.opportunities.filter((opp) => ["Meeting Booked", "Proposal Sent", "Negotiation", "Won"].includes(opp.stage)).length,
        detail: "Meetings, proposals, negotiations, and won opportunities"
      },
      {
        color: "yellow",
        label: "Needs attention",
        value: followUps.length + proposalsPending,
        detail: "Due follow-ups and proposals waiting for action"
      },
      {
        color: "red",
        label: "At risk",
        value: overdueTasks.length + staleOpportunities,
        detail: "Overdue tasks and opportunities without recent progress"
      }
    ];
    const recommended = active
      .slice()
      .sort((a, b) => Number(b.ai_score || 0) - Number(a.ai_score || 0))[0]?.next_action || "Add a new prospect and run AI research.";
    return sendJson(res, {
      totalLeads: db.companies.length,
      activeOpportunities: active.length,
      followUpsDue: followUps.length,
      proposalsPending,
      meetingsScheduled: db.opportunities.filter((opp) => opp.stage === "Meeting Booked").length,
      pipelineValue,
      wonValue,
      weightedForecast,
      salesTarget,
      targetProgress: salesTarget ? Math.round((weightedForecast / salesTarget) * 100) : 0,
      activityStoplight,
      recommendedAction: recommended
    });
  }

  if (req.method === "POST" && pathname === "/api/companies") {
    const body = await readBody(req);
    const company = {
      id: makeId("cmp"),
      name: body.name,
      website: body.website || "",
      sector: body.sector || "",
      country: body.country || "",
      description: body.description || "",
      status: body.status || "prospect",
      created_at: new Date().toISOString()
    };
    db.companies.unshift(company);
    await writeDb(db);
    return sendJson(res, company, 201);
  }

  if (req.method === "POST" && pathname === "/api/opportunities") {
    const body = await readBody(req);
    const opportunity = {
      id: makeId("opp"),
      company_id: body.company_id,
      title: body.title,
      stage: body.stage || "New Lead",
      value: Number(body.value || 0),
      probability: Number(body.probability || 10),
      source: body.source || "",
      close_date: body.close_date || "",
      ai_score: null,
      recommended_service: "",
      next_action: "Run AI research to qualify the opportunity.",
      created_at: new Date().toISOString()
    };
    db.opportunities.unshift(opportunity);
    await writeDb(db);
    return sendJson(res, opportunity, 201);
  }

  if (req.method === "POST" && pathname === "/api/knowledge") {
    const body = await readBody(req);
    const doc = {
      id: makeId("kb"),
      title: body.title,
      file_url: body.file_url || "",
      document_type: body.document_type || "Writing sample",
      extracted_text: body.extracted_text || "",
      embedding_id: "",
      created_at: new Date().toISOString()
    };
    db.knowledge_documents.unshift(doc);
    await writeDb(db);
    return sendJson(res, doc, 201);
  }

  if (req.method === "POST" && pathname === "/api/ai/research") {
    const body = await readBody(req);
    const company = getCompany(db, body.company_id);
    if (!company) return notFound(res);
    const ai = await callOpenAI("research", { company, notes: body.notes, services, knowledge_documents: db.knowledge_documents });
    const result = ai || localResearch({ company, notes: body.notes || "" });
    if (body.opportunity_id) {
      const opp = db.opportunities.find((item) => item.id === body.opportunity_id);
      if (opp) {
        opp.ai_score = result.opportunityScore;
        opp.recommended_service = result.recommendedService;
        opp.next_action = result.nextBestAction;
        opp.stage = "Research Complete";
        await writeDb(db);
      }
    }
    return sendJson(res, result);
  }

  if (req.method === "POST" && pathname === "/api/ai/outreach") {
    const body = await readBody(req);
    const context = getOpportunityContext(db, body.opportunity_id);
    if (!context) return notFound(res);
    const ai = await callOpenAI("outreach", context);
    const result = ai || localOutreach(context);
    const opp = db.opportunities.find((item) => item.id === body.opportunity_id);
    if (opp) {
      opp.stage = "Outreach Sent";
      opp.next_action = "Schedule the Day 3 value-based follow-up if there is no reply.";
      await writeDb(db);
    }
    return sendJson(res, result);
  }

  if (req.method === "POST" && pathname === "/api/ai/proposal") {
    const body = await readBody(req);
    const context = getOpportunityContext(db, body.opportunity_id);
    if (!context) return notFound(res);
    const ai = await callOpenAI("proposal", context);
    const result = ai || localProposal(context);
    const proposal = {
      id: makeId("prp"),
      opportunity_id: body.opportunity_id,
      title: result.title,
      status: "draft",
      content: result,
      value: context.opportunity.value,
      created_at: new Date().toISOString()
    };
    db.proposals.unshift(proposal);
    context.opportunity.stage = "Proposal Sent";
    context.opportunity.next_action = "Review the proposal outline, tailor investment terms, and send for client feedback.";
    await writeDb(db);
    return sendJson(res, result);
  }

  if (req.method === "POST" && pathname === "/api/ai/meeting") {
    const body = await readBody(req);
    const context = getOpportunityContext(db, body.opportunity_id);
    if (!context) return notFound(res);
    const result = await callOpenAI("meeting", context) || {
      agenda: ["Clarify business priority", "Discuss current constraints", "Identify decision process", "Agree useful next step"],
      discoveryQuestions: [
        "What outcome would make this initiative commercially successful?",
        "Which stakeholders need to be aligned before a project begins?",
        "What has already been tried, and where did execution slow down?"
      ],
      likelyConcerns: ["Budget timing", "Internal capacity", "Scope clarity"],
      positioningNotes: "Position Dr. Walters-Jones as a strategic partner who brings structure, delivery discipline, and regional insight.",
      recommendedClose: "Offer to send a concise proposal outline within two business days."
    };
    return sendJson(res, result);
  }

  return notFound(res);
}

async function serveStatic(res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const target = path.normalize(path.join(publicDir, normalized));
  if (!target.startsWith(publicDir)) return notFound(res);
  try {
    const file = await fs.readFile(target);
    const ext = path.extname(target);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(file);
  } catch {
    const fallback = await fs.readFile(path.join(publicDir, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fallback);
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, { error: error.message || "Unexpected server error" }, 500);
  }
}).listen(port, () => {
  console.log(`ManageHer is running at http://localhost:${port}`);
});
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDatabase, storageMode, writeDatabase } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await loadEnvFile(path.join(__dirname, ".env"));
await loadEnvFile(path.join(__dirname, ".env.local"));

const publicDir = path.join(__dirname, "public");
const dbPath = path.join(__dirname, "data", "leadher-db.json");
const port = Number(process.env.PORT || 4173);
const sessionCookieName = "manageher_session";
const sessionMaxAgeSeconds = 60 * 60 * 8;

const opportunityStages = [
  "New Lead",
  "Qualified",
  "Research Complete",
  "Outreach Sent",
  "Follow-up Due",
  "Meeting Booked",
  "Proposal Sent",
  "Negotiation",
  "Won",
  "Lost"
];

const services = [
  "Strategic planning",
  "Project management",
  "Programme management",
  "Tourism development",
  "Community tourism",
  "Culinary tourism",
  "Export development",
  "Caribbean market entry",
  "Latin America market entry",
  "Sustainability and ESG consulting",
  "Organizational transformation",
  "Executive coaching",
  "Leadership training",
  "Proposal writing",
  "Market research"
];

const systemPrompt = `You are ManageHer, an AI Business Development Director representing Dr. Cornelia Walters-Jones. Your role is to identify opportunities, research prospects, draft outreach, prepare proposals, and recommend next actions. Write in a professional, confident, warm, strategic, Caribbean-global executive voice. Do not exaggerate Dr. Walters-Jones' experience. Use only verified knowledge from the user profile and uploaded knowledge base.`;

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      const value = match[2].replace(/^['"]|['"]$/g, "");
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function readDb() {
  return readDatabase(dbPath);
}

async function writeDb(db) {
  await writeDatabase(dbPath, db);
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((cookie) => {
    const [name, ...value] = cookie.trim().split("=");
    return [name, decodeURIComponent(value.join("="))];
  }));
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || "development-only-change-me";
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSessionToken(user) {
  const payload = base64Url(JSON.stringify({
    sub: user.id,
    email: user.email,
    exp: Date.now() + sessionMaxAgeSeconds * 1000
  }));
  return `${payload}.${sign(payload)}`;
}

function getSession(req) {
  const token = parseCookies(req)[sessionCookieName];
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !timingSafeEqualText(signature, sign(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.exp || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function sessionCookie(token, req) {
  const secure = req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAgeSeconds}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(req) {
  const secure = req.headers["x-forwarded-proto"] === "https" || process.env.NODE_ENV === "production";
  return `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, iterationsText, salt, expected] = String(storedHash || "").split("$");
  if (scheme !== "pbkdf2_sha256" || !iterationsText || !salt || !expected) return false;
  const iterations = Number(iterationsText);
  const actual = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return timingSafeEqualText(actual, expected);
}

function notFound(res) {
  sendJson(res, { error: "Not found" }, 404);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function getCompany(db, id) {
  return db.companies.find((company) => company.id === id);
}

function getOpportunityContext(db, opportunityId) {
  const opportunity = db.opportunities.find((item) => item.id === opportunityId);
  if (!opportunity) return null;
  const company = getCompany(db, opportunity.company_id);
  const contacts = db.contacts.filter((contact) => contact.company_id === opportunity.company_id);
  const knowledge = db.knowledge_documents.map((doc) => doc.extracted_text).filter(Boolean).join("\n\n");
  return { opportunity, company, contacts, knowledge };
}

function chooseService(company, notes = "") {
  const text = `${company?.sector || ""} ${company?.description || ""} ${notes}`.toLowerCase();
  if (text.includes("tourism") && text.includes("community")) return "Community tourism";
  if (text.includes("tourism") && text.includes("culinary")) return "Culinary tourism";
  if (text.includes("tourism")) return "Tourism development";
  if (text.includes("export") || text.includes("trade")) return "Export development";
  if (text.includes("latin")) return "Latin America market entry";
  if (text.includes("caribbean")) return "Caribbean market entry";
  if (text.includes("sustain")) return "Sustainability and ESG consulting";
  if (text.includes("leadership")) return "Leadership training";
  return "Strategic planning";
}

function scoreOpportunity(company, notes = "") {
  const text = `${company?.sector || ""} ${company?.country || ""} ${company?.description || ""} ${notes}`;
  let score = 56;
  if (/tourism|export|trade|sustainability|caribbean|latin|leadership/i.test(text)) score += 18;
  if (company?.website) score += 6;
  if (company?.description?.length > 60) score += 8;
  if (/urgent|funding|growth|expansion|transformation|programme/i.test(notes)) score += 8;
  return Math.max(35, Math.min(94, score));
}

function localResearch({ company, notes }) {
  const service = chooseService(company, notes);
  const score = scoreOpportunity(company, notes);
  return {
    companyOverview: `${company.name} operates in ${company.sector || "a strategic growth sector"} in ${company.country || "the region"}. ${company.description || "The available profile suggests a useful entry point for structured business development research."}`,
    likelyNeeds: [
      "Sharper growth priorities and implementation roadmap",
      "Partner-ready positioning for regional or international opportunities",
      "Executive support translating strategy into funded, measurable initiatives"
    ],
    decisionMakers: [
      "Managing Director or CEO",
      "Head of Strategy or Business Development",
      "Programme, Sustainability, Tourism, or Export lead"
    ],
    recommendedService: service,
    opportunityScore: score,
    suggestedFirstMessage: `A concise note to ${company.name} should acknowledge their ${company.sector || "market"} context and offer a short conversation on how Dr. Walters-Jones can support ${service.toLowerCase()} with practical, executive-level guidance.`,
    keyRisks: [
      "Decision timing may depend on funding cycles or board priorities",
      "Needs may be broad, so the first call should narrow the commercial objective",
      "Avoid over-positioning before confirming internal capacity and urgency"
    ],
    nextBestAction: `Send personalized outreach and ask for a 25-minute discovery conversation focused on ${service.toLowerCase()}.`
  };
}

function localOutreach({ company, opportunity, notes }) {
  const service = opportunity?.recommended_service || chooseService(company, notes);
  return {
    subject: `${service} support for ${company.name}`,
    email: `Hello,\n\nI noticed ${company.name}'s work in ${company.sector || "your sector"} and the opportunity to strengthen growth with a practical, well-governed approach.\n\nDr. Cornelia Walters-Jones supports organizations across consulting, project management, sustainability, tourism development, international trade, and market expansion. Based on your context, ${service.toLowerCase()} may be a useful place to explore where strategy, partnerships, and execution can come together.\n\nWould you be open to a brief 25-minute conversation next week to compare priorities and see whether there is a practical fit?\n\nWarm regards,\nDr. Cornelia Walters-Jones`,
    linkedin: `Hello, I came across ${company.name}'s work in ${company.sector || "your sector"} and thought there may be a useful conversation around ${service.toLowerCase()}. Dr. Cornelia Walters-Jones supports strategy, project delivery, sustainability, tourism, trade, and market expansion initiatives. Would you be open to connecting?`,
    followUps: buildFollowUps(company, service)
  };
}

function buildFollowUps(company, service) {
  return [
    {
      day: 1,
      title: "Introductory email",
      copy: `Introduce Dr. Walters-Jones and connect ${service.toLowerCase()} to ${company.name}'s likely growth priorities.`
    },
    {
      day: 3,
      title: "Value-based follow-up",
      copy: `Share one practical observation about strengthening execution, partnerships, or market readiness.`
    },
    {
      day: 7,
      title: "Case study or insight",
      copy: `Offer a brief insight relevant to ${company.sector || "their sector"} and invite a short discussion.`
    },
    {
      day: 14,
      title: "Meeting request",
      copy: `Ask directly for a 25-minute discovery call to assess whether ${service.toLowerCase()} support would be timely.`
    },
    {
      day: 21,
      title: "Final check-in",
      copy: `Close the loop respectfully and leave the door open for future planning cycles.`
    }
  ];
}

function localProposal({ company, opportunity }) {
  const service = opportunity?.recommended_service || chooseService(company);
  return {
    title: `${service} Proposal for ${company.name}`,
    coverLetter: `Thank you for the opportunity to outline how Dr. Cornelia Walters-Jones can support ${company.name}. This proposal focuses on practical, executive-level support that connects strategy, delivery, and measurable outcomes.`,
    executiveSummary: `${company.name} can benefit from a structured ${service.toLowerCase()} engagement that clarifies priorities, aligns stakeholders, and creates an implementation path suited to the Caribbean-global context.`,
    clientChallenge: `The central challenge is likely to be translating strategic ambition into a focused roadmap with the right partnerships, governance, and delivery rhythm.`,
    recommendedSolution: `A phased advisory engagement led by Dr. Walters-Jones, combining research, stakeholder consultation, strategy development, and implementation planning.`,
    scopeOfWork: [
      "Discovery and document review",
      "Stakeholder interviews or working sessions",
      "Market, programme, or organizational analysis",
      "Strategic recommendations and implementation roadmap",
      "Executive review session and next-step planning"
    ],
    timeline: "4 to 8 weeks depending on stakeholder access and final scope.",
    deliverables: [
      "Situation brief",
      "Strategic recommendations",
      "Implementation roadmap",
      "Executive presentation",
      "Priority action plan"
    ],
    investmentRange: opportunity?.value ? `$${Number(opportunity.value).toLocaleString()} indicative project value` : "$15,000 to $45,000 depending on scope",
    nextSteps: "Confirm objectives, agree scope, schedule discovery session, and finalize proposal terms."
  };
}

async function callOpenAI(task, payload) {
  if (!process.env.OPENAI_API_KEY) return null;
  const prompts = {
    research: "Prepare a concise sales intelligence brief as JSON with companyOverview, likelyNeeds, decisionMakers, recommendedService, opportunityScore, suggestedFirstMessage, keyRisks, nextBestAction.",
    outreach: "Write JSON with subject, email, linkedin, and followUps for a personalized cold outreach sequence.",
    proposal: "Create JSON with title, coverLetter, executiveSummary, clientChallenge, recommendedSolution, scopeOfWork, timeline, deliverables, investmentRange, nextSteps.",
    meeting: "Create JSON with agenda, discoveryQuestions, likelyConcerns, positioningNotes, and recommendedClose."
  };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${prompts[task]}\n\nContext:\n${JSON.stringify(payload, null, 2)}` }
        ],
        text: { format: { type: "json_object" } },
        store: false
      })
    });
    if (!response.ok) {
      console.warn(`OpenAI request failed with status ${response.status}. Falling back to local generation.`);
      return null;
    }
    const data = await response.json();
    const text = data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text).join("");
    return text ? parseJsonOutput(text) : null;
  } catch (error) {
    console.warn(`OpenAI request could not complete. Falling back to local generation.`);
    return null;
  }
}

function parseJsonOutput(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(trimmed);
}

async function handleApi(req, res, pathname) {
  const db = await readDb();

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const adminEmail = process.env.ADMIN_EMAIL || db.users[0]?.email;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;
    const user = db.users.find((item) => item.email.toLowerCase() === String(body.email || "").toLowerCase());
    const isValidUser = user && user.email.toLowerCase() === String(adminEmail || "").toLowerCase();
    if (!adminHash) return sendJson(res, { error: "Admin password hash is not configured" }, 500);
    if (!isValidUser || !verifyPassword(body.password || "", adminHash)) {
      return sendJson(res, { error: "Invalid email or password" }, 401);
    }
    res.setHeader("Set-Cookie", sessionCookie(createSessionToken(user), req));
    return sendJson(res, { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    res.setHeader("Set-Cookie", clearSessionCookie(req));
    return sendJson(res, { ok: true });
  }

  const session = getSession(req);
  if (!session) {
    return sendJson(res, { error: "Authentication required" }, 401);
  }

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    return sendJson(res, {
      ...db,
      opportunityStages,
      services,
      systemPrompt,
      aiConfigured: Boolean(process.env.OPENAI_API_KEY),
      aiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      storageMode: storageMode()
    });
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    const activeStages = new Set(opportunityStages.slice(0, 8));
    const today = new Date().toISOString().slice(0, 10);
    const active = db.opportunities.filter((opp) => activeStages.has(opp.stage));
    const followUps = db.tasks.filter((task) => task.status !== "done" && task.due_date <= today);
    const proposalsPending = db.proposals.filter((proposal) => proposal.status !== "accepted").length +
      db.opportunities.filter((opp) => ["Proposal Sent", "Negotiation"].includes(opp.stage)).length;
    const pipelineValue = active.reduce((sum, opp) => sum + Number(opp.value || 0), 0);
    const recommended = active
      .slice()
      .sort((a, b) => Number(b.ai_score || 0) - Number(a.ai_score || 0))[0]?.next_action || "Add a new prospect and run AI research.";
    return sendJson(res, {
      totalLeads: db.companies.length,
      activeOpportunities: active.length,
      followUpsDue: followUps.length,
      proposalsPending,
      meetingsScheduled: db.opportunities.filter((opp) => opp.stage === "Meeting Booked").length,
      pipelineValue,
      recommendedAction: recommended
    });
  }

  if (req.method === "POST" && pathname === "/api/companies") {
    const body = await readBody(req);
    const company = {
      id: makeId("cmp"),
      name: body.name,
      website: body.website || "",
      sector: body.sector || "",
      country: body.country || "",
      description: body.description || "",
      status: body.status || "prospect",
      created_at: new Date().toISOString()
    };
    db.companies.unshift(company);
    await writeDb(db);
    return sendJson(res, company, 201);
  }

  if (req.method === "POST" && pathname === "/api/opportunities") {
    const body = await readBody(req);
    const opportunity = {
      id: makeId("opp"),
      company_id: body.company_id,
      title: body.title,
      stage: body.stage || "New Lead",
      value: Number(body.value || 0),
      probability: Number(body.probability || 10),
      source: body.source || "",
      close_date: body.close_date || "",
      ai_score: null,
      recommended_service: "",
      next_action: "Run AI research to qualify the opportunity.",
      created_at: new Date().toISOString()
    };
    db.opportunities.unshift(opportunity);
    await writeDb(db);
    return sendJson(res, opportunity, 201);
  }

  if (req.method === "POST" && pathname === "/api/knowledge") {
    const body = await readBody(req);
    const doc = {
      id: makeId("kb"),
      title: body.title,
      file_url: body.file_url || "",
      document_type: body.document_type || "Writing sample",
      extracted_text: body.extracted_text || "",
      embedding_id: "",
      created_at: new Date().toISOString()
    };
    db.knowledge_documents.unshift(doc);
    await writeDb(db);
    return sendJson(res, doc, 201);
  }

  if (req.method === "POST" && pathname === "/api/ai/research") {
    const body = await readBody(req);
    const company = getCompany(db, body.company_id);
    if (!company) return notFound(res);
    const ai = await callOpenAI("research", { company, notes: body.notes, services, knowledge_documents: db.knowledge_documents });
    const result = ai || localResearch({ company, notes: body.notes || "" });
    if (body.opportunity_id) {
      const opp = db.opportunities.find((item) => item.id === body.opportunity_id);
      if (opp) {
        opp.ai_score = result.opportunityScore;
        opp.recommended_service = result.recommendedService;
        opp.next_action = result.nextBestAction;
        opp.stage = "Research Complete";
        await writeDb(db);
      }
    }
    return sendJson(res, result);
  }

  if (req.method === "POST" && pathname === "/api/ai/outreach") {
    const body = await readBody(req);
    const context = getOpportunityContext(db, body.opportunity_id);
    if (!context) return notFound(res);
    const ai = await callOpenAI("outreach", context);
    const result = ai || localOutreach(context);
    const opp = db.opportunities.find((item) => item.id === body.opportunity_id);
    if (opp) {
      opp.stage = "Outreach Sent";
      opp.next_action = "Schedule the Day 3 value-based follow-up if there is no reply.";
      await writeDb(db);
    }
    return sendJson(res, result);
  }

  if (req.method === "POST" && pathname === "/api/ai/proposal") {
    const body = await readBody(req);
    const context = getOpportunityContext(db, body.opportunity_id);
    if (!context) return notFound(res);
    const ai = await callOpenAI("proposal", context);
    const result = ai || localProposal(context);
    const proposal = {
      id: makeId("prp"),
      opportunity_id: body.opportunity_id,
      title: result.title,
      status: "draft",
      content: result,
      value: context.opportunity.value,
      created_at: new Date().toISOString()
    };
    db.proposals.unshift(proposal);
    context.opportunity.stage = "Proposal Sent";
    context.opportunity.next_action = "Review the proposal outline, tailor investment terms, and send for client feedback.";
    await writeDb(db);
    return sendJson(res, result);
  }

  if (req.method === "POST" && pathname === "/api/ai/meeting") {
    const body = await readBody(req);
    const context = getOpportunityContext(db, body.opportunity_id);
    if (!context) return notFound(res);
    const result = await callOpenAI("meeting", context) || {
      agenda: ["Clarify business priority", "Discuss current constraints", "Identify decision process", "Agree useful next step"],
      discoveryQuestions: [
        "What outcome would make this initiative commercially successful?",
        "Which stakeholders need to be aligned before a project begins?",
        "What has already been tried, and where did execution slow down?"
      ],
      likelyConcerns: ["Budget timing", "Internal capacity", "Scope clarity"],
      positioningNotes: "Position Dr. Walters-Jones as a strategic partner who brings structure, delivery discipline, and regional insight.",
      recommendedClose: "Offer to send a concise proposal outline within two business days."
    };
    return sendJson(res, result);
  }

  return notFound(res);
}

async function serveStatic(res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const target = path.normalize(path.join(publicDir, normalized));
  if (!target.startsWith(publicDir)) return notFound(res);
  try {
    const file = await fs.readFile(target);
    const ext = path.extname(target);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(file);
  } catch {
    const fallback = await fs.readFile(path.join(publicDir, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fallback);
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, { error: error.message || "Unexpected server error" }, 500);
  }
}).listen(port, () => {
  console.log(`ManageHer is running at http://localhost:${port}`);
});
