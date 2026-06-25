const state = {
  page: "dashboard",
  data: null,
  dashboard: null,
  lastOutput: "",
  selectedOpportunityId: ""
};

const pages = [
  ["dashboard", "Dashboard", "Pipeline command center"],
  ["companies", "Companies", "Prospect accounts"],
  ["contacts", "Contacts", "Decision-makers"],
  ["opportunities", "Opportunities", "Pipeline stages"],
  ["detail", "Opportunity Detail", "Focused deal workspace"],
  ["agent", "AI Sales Agent", "Research and outreach"],
  ["proposal", "Proposal Builder", "Proposal outlines"],
  ["knowledge", "Knowledge Base", "Personalization sources"],
  ["settings", "Settings", "Security and configuration"]
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401) state.data = null;
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

async function load() {
  state.data = await api("/api/bootstrap");
  state.dashboard = await api("/api/dashboard");
  if (!state.selectedOpportunityId) state.selectedOpportunityId = state.data.opportunities[0]?.id || "";
}

function companyName(id) {
  return state.data.companies.find((company) => company.id === id)?.name || "Unknown company";
}

function companyOptions(selected = "") {
  return state.data.companies.map((company) => `<option value="${company.id}" ${company.id === selected ? "selected" : ""}>${esc(company.name)}</option>`).join("");
}

function opportunityOptions(selected = "") {
  return state.data.opportunities.map((opp) => `<option value="${opp.id}" ${opp.id === selected ? "selected" : ""}>${esc(opp.title)} - ${esc(companyName(opp.company_id))}</option>`).join("");
}

function stageOptions(selected = "New Lead") {
  return state.data.opportunityStages.map((stage) => `<option value="${stage}" ${stage === selected ? "selected" : ""}>${stage}</option>`).join("");
}

function serviceOptions() {
  return state.data.services.map((service) => `<span class="badge gold">${esc(service)}</span>`).join(" ");
}

function toast(message) {
  let node = qs(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2400);
}

function layout(content) {
  const active = pages.find(([id]) => id === state.page) || pages[0];
  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">MH</div>
          <h1>ManageHer</h1>
          <p>AI Business Development Director for Dr. Cornelia Walters-Jones.</p>
        </div>
        <nav class="nav">
          ${pages.map(([id, label]) => `<button class="${state.page === id ? "active" : ""}" data-page="${id}">${navIcon(id)}<span>${label}</span></button>`).join("")}
        </nav>
        <div class="sidebar-footer">
          Strategic, warm, Caribbean-global sales intelligence for consulting growth.
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <h2>${active[1]}</h2>
            <p>${active[2]}</p>
          </div>
          <button class="user-chip" id="logout-button" title="Sign out"><span class="avatar">CW</span><span>Dr. Walters-Jones</span></button>
        </header>
        <section class="content">${content}</section>
      </main>
    </div>
  `;
}

function navIcon(id) {
  const icons = {
    dashboard: "◆",
    companies: "▦",
    contacts: "◉",
    opportunities: "▤",
    detail: "◎",
    agent: "✦",
    proposal: "▧",
    knowledge: "▥",
    settings: "⚙"
  };
  return `<span aria-hidden="true">${icons[id]}</span>`;
}

function loginView() {
  return `
    <section class="login">
      <div class="login-hero">
        <h1>ManageHer</h1>
        <p>Executive sales development for consulting, sustainability, tourism, trade, leadership, and Caribbean-global market expansion.</p>
      </div>
      <form class="login-card" id="login-form">
        <div>
          <h2>Welcome back</h2>
          <p class="muted">Sign in to enter the ManageHer workspace.</p>
        </div>
        <div class="field">
          <label>Email</label>
          <input name="email" type="email" value="cornelia@example.com" required>
        </div>
        <div class="field">
          <label>Password</label>
          <input name="password" type="password" placeholder="Enter your password" required>
        </div>
        <button class="btn gold" type="submit">Enter workspace</button>
      </form>
    </section>
  `;
}

function dashboardView() {
  const d = state.dashboard;
  const recent = state.data.opportunities.slice(0, 5);
  return layout(`
    <div class="grid metrics">
      ${metric("Total leads", d.totalLeads)}
      ${metric("Active opportunities", d.activeOpportunities)}
      ${metric("Follow-ups due", d.followUpsDue)}
      ${metric("Proposals pending", d.proposalsPending)}
      ${metric("Meetings scheduled", d.meetingsScheduled)}
      ${metric("Pipeline value", money.format(d.pipelineValue))}
    </div>
    <div class="grid split">
      <section class="card panel section">
        <div class="section-head">
          <div>
            <h3>AI recommended next action</h3>
            <p>Prioritized from active opportunity scores and current stages.</p>
          </div>
          <button class="btn emerald" data-page="agent">Open AI Agent</button>
        </div>
        <div class="output">${esc(d.recommendedAction)}</div>
      </section>
      <section class="card panel section">
        <div class="section-head">
          <div>
            <h3>Default services</h3>
            <p>Available pitch catalogue.</p>
          </div>
        </div>
        <div class="button-row">${serviceOptions()}</div>
      </section>
    </div>
    <section class="card table-wrap">
      <table>
        <thead><tr><th>Opportunity</th><th>Company</th><th>Stage</th><th>Value</th><th>AI score</th><th>Next action</th></tr></thead>
        <tbody>
          ${recent.map((opp) => rowOpportunity(opp)).join("")}
        </tbody>
      </table>
    </section>
  `);
}

function metric(label, value) {
  return `<div class="card metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function rowOpportunity(opp) {
  return `
    <tr>
      <td><strong>${esc(opp.title)}</strong></td>
      <td>${esc(companyName(opp.company_id))}</td>
      <td><span class="badge">${esc(opp.stage)}</span></td>
      <td>${money.format(Number(opp.value || 0))}</td>
      <td>${opp.ai_score ? `<span class="badge green">${opp.ai_score}</span>` : "-"}</td>
      <td>${esc(opp.next_action || "")}</td>
    </tr>
  `;
}

function companiesView() {
  return layout(`
    <div class="grid split">
      <section class="card table-wrap">
        <table>
          <thead><tr><th>Company</th><th>Sector</th><th>Country</th><th>Status</th><th>Description</th></tr></thead>
          <tbody>
            ${state.data.companies.map((company) => `
              <tr>
                <td><strong>${esc(company.name)}</strong><br><span class="muted">${esc(company.website)}</span></td>
                <td>${esc(company.sector)}</td>
                <td>${esc(company.country)}</td>
                <td><span class="badge green">${esc(company.status)}</span></td>
                <td>${esc(company.description)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
      <section class="card panel section">
        <div class="section-head"><h3>Add company</h3></div>
        <form id="company-form" class="form-grid">
          <div class="field full"><label>Name</label><input name="name" required></div>
          <div class="field"><label>Website</label><input name="website"></div>
          <div class="field"><label>Sector</label><input name="sector" required></div>
          <div class="field"><label>Country</label><input name="country" required></div>
          <div class="field full"><label>Description</label><textarea name="description"></textarea></div>
          <button class="btn gold" type="submit">Add company</button>
        </form>
      </section>
    </div>
  `);
}

function contactsView() {
  const contacts = state.data.contacts;
  return layout(`
    <section class="card table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Company</th><th>Title</th><th>Email</th><th>LinkedIn</th></tr></thead>
        <tbody>
          ${contacts.length ? contacts.map((contact) => `
            <tr>
              <td><strong>${esc(contact.first_name)} ${esc(contact.last_name)}</strong></td>
              <td>${esc(companyName(contact.company_id))}</td>
              <td>${esc(contact.title)}</td>
              <td>${esc(contact.email)}</td>
              <td>${esc(contact.linkedin_url || "-")}</td>
            </tr>
          `).join("") : `<tr><td colspan="5"><div class="empty">Contacts will appear here as prospects are enriched.</div></td></tr>`}
        </tbody>
      </table>
    </section>
  `);
}

function opportunitiesView() {
  const visibleStages = ["New Lead", "Qualified", "Research Complete", "Outreach Sent", "Follow-up Due"];
  return layout(`
    <section class="card panel section">
      <div class="section-head">
        <div><h3>Create opportunity</h3><p>Connect a prospect company to a sales motion.</p></div>
      </div>
      <form id="opportunity-form" class="form-grid">
        <div class="field"><label>Company</label><select name="company_id">${companyOptions()}</select></div>
        <div class="field"><label>Stage</label><select name="stage">${stageOptions()}</select></div>
        <div class="field full"><label>Opportunity title</label><input name="title" required></div>
        <div class="field"><label>Value</label><input name="value" type="number" min="0" value="25000"></div>
        <div class="field"><label>Source</label><input name="source" value="Referral"></div>
        <div class="field"><label>Close date</label><input name="close_date" type="date"></div>
        <button class="btn gold" type="submit">Create opportunity</button>
      </form>
    </section>
    <section class="kanban">
      ${visibleStages.map((stage) => `
        <div class="lane">
          <h4>${stage}</h4>
          ${state.data.opportunities.filter((opp) => opp.stage === stage).map((opp) => `
            <button class="deal" data-open-opp="${opp.id}">
              <strong>${esc(opp.title)}</strong>
              <span>${esc(companyName(opp.company_id))}</span>
              <span class="badge gold">${money.format(Number(opp.value || 0))}</span>
            </button>
          `).join("") || `<div class="empty">No deals</div>`}
        </div>
      `).join("")}
    </section>
  `);
}

function detailView() {
  const opp = state.data.opportunities.find((item) => item.id === state.selectedOpportunityId) || state.data.opportunities[0];
  if (!opp) return layout(`<div class="empty">Create an opportunity to open the detail workspace.</div>`);
  const company = state.data.companies.find((item) => item.id === opp.company_id);
  const notes = state.data.interaction_notes.filter((note) => note.opportunity_id === opp.id);
  return layout(`
    <section class="card panel section">
      <div class="section-head">
        <div>
          <h3>${esc(opp.title)}</h3>
          <p>${esc(company?.name)} · ${esc(company?.sector)} · ${esc(company?.country)}</p>
        </div>
        <div class="button-row">
          <button class="btn emerald" data-research="${opp.id}">Research Prospect</button>
          <button class="btn secondary" data-page="proposal">Build Proposal</button>
        </div>
      </div>
      <div class="grid metrics">
        ${metric("Stage", esc(opp.stage))}
        ${metric("Value", money.format(Number(opp.value || 0)))}
        ${metric("Probability", `${opp.probability || 0}%`)}
        ${metric("AI score", opp.ai_score || "-")}
        ${metric("Service", esc(opp.recommended_service || "Pending"))}
        ${metric("Close date", esc(opp.close_date || "TBD"))}
      </div>
      <div class="output">${esc(opp.next_action || "Run AI research to generate next action.")}</div>
    </section>
    <section class="card panel section">
      <div class="section-head"><h3>Interaction notes</h3></div>
      ${notes.map((note) => `<div class="output">${esc(note.note)}</div>`).join("") || `<div class="empty">No notes yet.</div>`}
    </section>
  `);
}

function agentView() {
  return layout(`
    <div class="grid split">
      <section class="card panel section">
        <div class="section-head">
          <div><h3>AI Sales Agent</h3><p>Research, score, draft outreach, and prepare meetings.</p></div>
        </div>
        <form id="agent-form" class="form-grid">
          <div class="field full"><label>Opportunity</label><select name="opportunity_id">${opportunityOptions(state.selectedOpportunityId)}</select></div>
          <div class="field full"><label>Additional notes</label><textarea name="notes" placeholder="Funding cycle, expansion priority, known decision-maker, recent initiative..."></textarea></div>
          <div class="button-row field full">
            <button class="btn emerald" data-agent-action="research" type="button">Research prospect</button>
            <button class="btn" data-agent-action="outreach" type="button">Generate outreach</button>
            <button class="btn secondary" data-agent-action="meeting" type="button">Meeting brief</button>
          </div>
        </form>
      </section>
      <section class="card panel section">
        <div class="section-head"><h3>AI output</h3></div>
        <div class="output" id="ai-output">${esc(state.lastOutput || "Choose an opportunity and run an AI action.")}</div>
      </section>
    </div>
  `);
}

function proposalView() {
  return layout(`
    <div class="grid split">
      <section class="card panel section">
        <div class="section-head">
          <div><h3>Proposal generator</h3><p>Creates cover letter, summary, scope, timeline, deliverables, investment range, and next steps.</p></div>
        </div>
        <form id="proposal-form" class="form-grid">
          <div class="field full"><label>Opportunity</label><select name="opportunity_id">${opportunityOptions(state.selectedOpportunityId)}</select></div>
          <button class="btn gold" type="submit">Generate proposal outline</button>
        </form>
      </section>
      <section class="card panel section">
        <div class="section-head"><h3>Proposal output</h3></div>
        <div class="output">${esc(state.lastOutput || "Generated proposal outlines will appear here.")}</div>
      </section>
    </div>
    <section class="card table-wrap">
      <table>
        <thead><tr><th>Title</th><th>Opportunity</th><th>Status</th><th>Value</th></tr></thead>
        <tbody>
          ${state.data.proposals.map((proposal) => `
            <tr>
              <td><strong>${esc(proposal.title)}</strong></td>
              <td>${esc(state.data.opportunities.find((opp) => opp.id === proposal.opportunity_id)?.title || "")}</td>
              <td><span class="badge">${esc(proposal.status)}</span></td>
              <td>${money.format(Number(proposal.value || 0))}</td>
            </tr>
          `).join("") || `<tr><td colspan="4"><div class="empty">No proposals generated yet.</div></td></tr>`}
        </tbody>
      </table>
    </section>
  `);
}

function knowledgeView() {
  return layout(`
    <div class="grid split">
      <section class="card table-wrap">
        <table>
          <thead><tr><th>Title</th><th>Type</th><th>Knowledge excerpt</th></tr></thead>
          <tbody>
            ${state.data.knowledge_documents.map((doc) => `
              <tr>
                <td><strong>${esc(doc.title)}</strong></td>
                <td><span class="badge gold">${esc(doc.document_type)}</span></td>
                <td>${esc(doc.extracted_text)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
      <section class="card panel section">
        <div class="section-head"><h3>Add knowledge</h3></div>
        <form id="knowledge-form" class="form-grid">
          <div class="field full"><label>Title</label><input name="title" required></div>
          <div class="field full"><label>Document type</label><select name="document_type">
            ${["Resume", "Company profile", "Capability statement", "Proposal", "Case study", "Testimonial", "Service description", "Writing sample"].map((type) => `<option>${type}</option>`).join("")}
          </select></div>
          <div class="field full"><label>Extracted text</label><textarea name="extracted_text" required></textarea></div>
          <button class="btn gold" type="submit">Add to knowledge base</button>
        </form>
      </section>
    </div>
  `);
}

function settingsView() {
  return layout(`
    <section class="card panel section">
      <div class="section-head"><h3>System prompt</h3></div>
      <div class="output">${esc(state.data.systemPrompt)}</div>
    </section>
    <section class="card panel section">
      <div class="section-head"><h3>Configuration</h3></div>
      <div class="grid metrics">
        ${metric("AI mode", state.data.aiConfigured ? "Live OpenAI" : "Local fallback")}
        ${metric("AI model", esc(state.data.aiModel || "Not set"))}
        ${metric("Storage", state.data.storageMode === "postgres" ? "PostgreSQL" : "JSON file")}
        ${metric("Auth", "Session scaffold")}
        ${metric("Database", "PostgreSQL schema included")}
        ${metric("Integrations", "Gmail, Calendar, HubSpot later")}
        ${metric("Environment", ".env.example")}
      </div>
    </section>
  `);
}

function formatResult(result) {
  if (typeof result === "string") return result;
  return Object.entries(result).map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
    const body = Array.isArray(value)
      ? value.map((item) => typeof item === "object" ? `- ${Object.values(item).join(": ")}` : `- ${item}`).join("\n")
      : typeof value === "object" && value !== null
        ? JSON.stringify(value, null, 2)
        : value;
    return `${label}\n${body}`;
  }).join("\n\n");
}

async function refresh() {
  await load();
  render();
}

function bindEvents() {
  qsa("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.page = button.dataset.page;
      render();
    });
  });

  qs("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/login", { method: "POST", body: Object.fromEntries(new FormData(event.target)) });
      await refresh();
    } catch (error) {
      toast(error.message);
    }
  });

  qs("#logout-button")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.data = null;
    state.dashboard = null;
    render();
  });

  qs("#company-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/api/companies", { method: "POST", body: Object.fromEntries(new FormData(event.target)) });
    toast("Company added");
    await refresh();
  });

  qs("#opportunity-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await api("/api/opportunities", { method: "POST", body: Object.fromEntries(new FormData(event.target)) });
    state.selectedOpportunityId = result.id;
    toast("Opportunity created");
    await refresh();
  });

  qsa("[data-open-opp]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedOpportunityId = button.dataset.openOpp;
      state.page = "detail";
      render();
    });
  });

  qsa("[data-research]").forEach((button) => {
    button.addEventListener("click", async () => {
      const opp = state.data.opportunities.find((item) => item.id === button.dataset.research);
      state.lastOutput = formatResult(await api("/api/ai/research", {
        method: "POST",
        body: { company_id: opp.company_id, opportunity_id: opp.id }
      }));
      toast("Research complete");
      await refresh();
      state.page = "agent";
      render();
    });
  });

  qsa("[data-agent-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const form = qs("#agent-form");
      const values = Object.fromEntries(new FormData(form));
      const opp = state.data.opportunities.find((item) => item.id === values.opportunity_id);
      state.selectedOpportunityId = values.opportunity_id;
      const action = button.dataset.agentAction;
      const path = action === "research" ? "/api/ai/research" : action === "outreach" ? "/api/ai/outreach" : "/api/ai/meeting";
      const body = action === "research"
        ? { company_id: opp.company_id, opportunity_id: opp.id, notes: values.notes }
        : { opportunity_id: opp.id, notes: values.notes };
      state.lastOutput = "Working...";
      render();
      state.lastOutput = formatResult(await api(path, { method: "POST", body }));
      toast(action === "research" ? "Research complete" : "AI draft generated");
      await refresh();
      state.page = "agent";
      render();
    });
  });

  qs("#proposal-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    state.selectedOpportunityId = values.opportunity_id;
    state.lastOutput = formatResult(await api("/api/ai/proposal", { method: "POST", body: values }));
    toast("Proposal outline generated");
    await refresh();
    state.page = "proposal";
    render();
  });

  qs("#knowledge-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/api/knowledge", { method: "POST", body: Object.fromEntries(new FormData(event.target)) });
    toast("Knowledge added");
    await refresh();
  });
}

function render() {
  const app = qs("#app");
  if (!state.data) {
    app.innerHTML = loginView();
  } else if (state.page === "dashboard") app.innerHTML = dashboardView();
  else if (state.page === "companies") app.innerHTML = companiesView();
  else if (state.page === "contacts") app.innerHTML = contactsView();
  else if (state.page === "opportunities") app.innerHTML = opportunitiesView();
  else if (state.page === "detail") app.innerHTML = detailView();
  else if (state.page === "agent") app.innerHTML = agentView();
  else if (state.page === "proposal") app.innerHTML = proposalView();
  else if (state.page === "knowledge") app.innerHTML = knowledgeView();
  else if (state.page === "settings") app.innerHTML = settingsView();
  bindEvents();
}

load().then(render).catch(() => render());
