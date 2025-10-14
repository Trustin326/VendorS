// VendorFlow — front-end micro-SaaS, no backend. All data in localStorage.
// Utilities
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const fmt = (n, cur) => (cur||settings().currency||"$") + Number(n||0).toFixed(2);
const uid = (p="id") => p + "_" + Math.random().toString(36).slice(2,9);
const today = () => new Date().toISOString().slice(0,10);
const monthKey = (d) => d.slice(0,7);

function storage(key, val){
  if(val===undefined){ return JSON.parse(localStorage.getItem(key) || "null"); }
  localStorage.setItem(key, JSON.stringify(val)); return val;
}
function purge(){ localStorage.clear(); }

function settings(next){
  const s = storage("vf_settings") || { bizName:"", currency:"$", tax:0, theme:"dark" };
  if(next){ storage("vf_settings", {...s, ...next}); return {...s, ...next}; }
  return s;
}

function data(){
  return {
    invoices: storage("vf_invoices") || [],
    expenses: storage("vf_expenses") || [],
    clients:  storage("vf_clients")  || []
  }
}
function setData(next){ if(next.invoices) storage("vf_invoices", next.invoices);
  if(next.expenses) storage("vf_expenses", next.expenses);
  if(next.clients) storage("vf_clients", next.clients);
}

function seed(){
  const demo = {
    clients:[
      {id:uid("cli"), company:"Blue Horizon Landscaping", contact:"Kim Park", email:"kim@bluehorizon.com", phone:"555-101-2222", notes:"Weekly service"},
      {id:uid("cli"), company:"Sparkle Cleaners", contact:"Luis Gomez", email:"luis@sparkleclean.com", phone:"555-313-2222", notes:"Bi-weekly"}
    ],
    invoices:[
      {id:uid("inv"), num:"INV-1001", client:"Blue Horizon Landscaping", date:today(), due:today(), status:"Unpaid", total:650.00},
      {id:uid("inv"), num:"INV-1002", client:"Sparkle Cleaners", date:today(), due:today(), status:"Paid", total:420.00}
    ],
    expenses:[
      {id:uid("exp"), date:today(), category:"Supplies", vendor:"Home Depot", notes:"Mulch & bags", amount:120.30},
      {id:uid("exp"), date:today(), category:"Fuel", vendor:"Shell", notes:"Route 9", amount:58.90}
    ]
  };
  setData(demo);
  renderAll();
}

function addInvoice(rec){
  const all = data().invoices; all.unshift({id:uid("inv"), ...rec}); storage("vf_invoices", all); renderInvoices(); renderDashboard();
}
function updateInvoice(id, patch){
  const all = data().invoices.map(r => r.id===id ? {...r, ...patch} : r);
  storage("vf_invoices", all); renderInvoices(); renderDashboard();
}
function removeInvoice(id){
  storage("vf_invoices", data().invoices.filter(r=>r.id!==id)); renderInvoices(); renderDashboard();
}
function addExpense(rec){
  const all = data().expenses; all.unshift({id:uid("exp"), ...rec}); storage("vf_expenses", all); renderExpenses(); renderDashboard();
}
function removeExpense(id){
  storage("vf_expenses", data().expenses.filter(r=>r.id!==id)); renderExpenses(); renderDashboard();
}
function addClient(rec){
  const all = data().clients; all.unshift({id:uid("cli"), ...rec}); storage("vf_clients", all); renderClients();
}
function removeClient(id){
  storage("vf_clients", data().clients.filter(r=>r.id!==id)); renderClients();
}

// CSV helpers
function toCSV(rows){
  if(!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => ('"'+String(v).replace(/"/g,'""')+'"');
  const lines = [headers.join(",")].concat(rows.map(r=>headers.map(h=>esc(r[h]??"")).join(",")));
  return lines.join("\n");
}
function fromCSV(text){
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",").map(h=>h.replace(/^"|"$/g,""));
  return lines.map(line => {
    const cells = line.match(/("(?:[^"]|"")*"|[^,]+)/g).map(c=>c.replace(/^"|"$/g,"").replace(/""/g,'"'));
    const obj = {}; headers.forEach((h,i)=>obj[h]=cells[i]||""); return obj;
  });
}

// Chart (vanilla canvas)
function drawChart(incomes, expenses){
  const c = $("#chart"); const ctx = c.getContext("2d");
  ctx.clearRect(0,0,c.width,c.height);
  const pad = 40, w = c.width - pad*2, h = c.height - pad*2;
  const maxv = Math.max(...incomes,...expenses, 10);
  const barW = w / (incomes.length*2);
  ctx.strokeStyle = "#888"; ctx.beginPath(); ctx.moveTo(pad,pad); ctx.lineTo(pad, pad+h); ctx.lineTo(pad+w, pad+h); ctx.stroke();
  incomes.forEach((v,i)=>{
    const x = pad + i*2*barW + 10;
    const ih = (v/maxv)*h;
    ctx.fillStyle = "#59f0d0"; ctx.fillRect(x, pad+h-ih, barW-12, ih);
  });
  expenses.forEach((v,i)=>{
    const x = pad + i*2*barW + barW + 10;
    const eh = (v/maxv)*h;
    ctx.fillStyle = "#9b7bff"; ctx.fillRect(x, pad+h-eh, barW-12, eh);
  });
}

function summarize(){
  const ds = data();
  const unpaid = ds.invoices.filter(i=>i.status!=="Paid");
  const outstanding = unpaid.reduce((a,b)=>a+Number(b.total||0),0);
  const month = new Date().toISOString().slice(0,7);
  const monthExp = ds.expenses.filter(e=>e.date.slice(0,7)===month).reduce((a,b)=>a+Number(b.amount||0),0);
  const top = Object.entries(ds.invoices.reduce((acc,i)=>{acc[i.client]=(acc[i.client]||0)+Number(i.total||0);return acc;},{}))
     .sort((a,b)=>b[1]-a[1])[0]?.[0] || "—";
  $("#unpaidCount").textContent = unpaid.length;
  $("#outstandingTotal").textContent = fmt(outstanding);
  $("#monthExpenses").textContent = fmt(monthExp);
  $("#topClient").textContent = top;

  // chart data last 6 months
  const months = Array.from({length:6}).map((_,k)=>{
    const d = new Date(); d.setMonth(d.getMonth()- (5-k)); return d.toISOString().slice(0,7);
  });
  const incomes = months.map(m=>ds.invoices.filter(i=>i.date.slice(0,7)===m).reduce((a,b)=>a+Number(b.total||0),0));
  const expenses = months.map(m=>ds.expenses.filter(e=>e.date.slice(0,7)===m).reduce((a,b)=>a+Number(b.amount||0),0));
  drawChart(incomes, expenses);

  // reports
  const catTotals = ds.expenses.reduce((acc,e)=>{acc[e.category]=(acc[e.category]||0)+Number(e.amount||0);return acc;},{});
  $("#topCategories").innerHTML = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`<li>${k}: <b>${fmt(v)}</b></li>`).join("")||"<li>No categories yet</li>";
  $("#monthlySummary").textContent = `Invoices this month: ${ds.invoices.filter(i=>i.date.slice(0,7)===month).length} • Expenses this month: ${fmt(monthExp)}`;
}

function renderInvoices(){
  const tb = $("#invoiceTable tbody"); const cur = settings().currency||"$";
  tb.innerHTML = data().invoices.map(i=>`
    <tr>
      <td>${i.num}</td>
      <td>${i.client}</td>
      <td>${i.date}</td>
      <td>${i.due}</td>
      <td>
        <select data-id="${i.id}" class="inv-status">
          ${["Unpaid","Paid","Overdue"].map(s=>`<option ${i.status===s?"selected":""}>${s}</option>`).join("")}
        </select>
      </td>
      <td>${fmt(i.total,cur)}</td>
      <td><button data-id="${i.id}" class="row-del danger">Delete</button></td>
    </tr>
  `).join("") || `<tr><td colspan="7">No invoices yet — click “New Invoice”.</td></tr>`;
}
function renderExpenses(){
  const tb = $("#expenseTable tbody"); const cur = settings().currency||"$";
  tb.innerHTML = data().expenses.map(e=>`
    <tr>
      <td>${e.date}</td>
      <td>${e.category}</td>
      <td>${e.vendor}</td>
      <td>${e.notes}</td>
      <td>${fmt(e.amount,cur)}</td>
      <td><button data-id="${e.id}" class="exp-del danger">Delete</button></td>
    </tr>
  `).join("") || `<tr><td colspan="6">No expenses yet — click “Add Expense”.</td></tr>`;
}
function renderClients(){
  const tb = $("#clientTable tbody");
  tb.innerHTML = data().clients.map(c=>`
    <tr>
      <td>${c.company}</td>
      <td>${c.contact}</td>
      <td>${c.email}</td>
      <td>${c.phone}</td>
      <td>${c.notes}</td>
      <td><button data-id="${c.id}" class="cli-del danger">Delete</button></td>
    </tr>
  `).join("") || `<tr><td colspan="6">No clients yet — click “Add Client”.</td></tr>`;
}

function renderDashboard(){ summarize(); }

function openModal(html){
  const d = $("#modal"); d.innerHTML = `<form method="dialog" class="modal">${html}</form>`; d.showModal();
  d.addEventListener("close", ()=>d.innerHTML="");
}

function invoiceForm(i={}){
  return `
    <h3>${i.id?"Edit":"New"} Invoice</h3>
    <label>Number<input name="num" value="${i.num||""}" required></label>
    <label>Client<input name="client" value="${i.client||""}" required></label>
    <label>Date<input type="date" name="date" value="${i.date||today()}" required></label>
    <label>Due<input type="date" name="due" value="${i.due||today()}" required></label>
    <label>Status<select name="status">
      ${["Unpaid","Paid","Overdue"].map(s=>`<option ${i.status===s?"selected":""}>${s}</option>`).join("")}
    </select></label>
    <label>Total<input type="number" step="0.01" name="total" value="${i.total||0}" required></label>
    <menu>
      <button value="cancel">Cancel</button>
      <button id="saveInv" value="default" class="primary">${i.id?"Save":"Create"}</button>
    </menu>
  `;
}
function expenseForm(){
  return `
    <h3>New Expense</h3>
    <label>Date<input type="date" name="date" value="${today()}" required></label>
    <label>Category<input name="category" placeholder="Supplies, Fuel..." required></label>
    <label>Vendor<input name="vendor" placeholder="Vendor name"></label>
    <label>Notes<input name="notes" placeholder="Optional"></label>
    <label>Amount<input type="number" step="0.01" name="amount" required></label>
    <menu>
      <button value="cancel">Cancel</button>
      <button id="saveExp" value="default" class="primary">Add</button>
    </menu>
  `;
}
function clientForm(){
  return `
    <h3>New Client</h3>
    <label>Company<input name="company" required></label>
    <label>Contact<input name="contact"></label>
    <label>Email<input name="email" type="email"></label>
    <label>Phone<input name="phone"></label>
    <label>Notes<input name="notes"></label>
    <menu>
      <button value="cancel">Cancel</button>
      <button id="saveCli" value="default" class="primary">Add</button>
    </menu>
  `;
}

// Nav
$$(".nav-item").forEach(b=>b.addEventListener("click", e=>{
  $$(".nav-item").forEach(x=>x.classList.remove("active"));
  e.currentTarget.classList.add("active");
  const v = e.currentTarget.getAttribute("data-view");
  $$(".view").forEach(x=>x.classList.remove("visible"));
  $("#view-"+v).classList.add("visible");
  if(v==="dashboard") renderDashboard();
}));

// actions
$("#seedDemo").addEventListener("click", seed);
$("#clearAll").addEventListener("click", ()=>{ if(confirm("Clear all VendorFlow data?")){ purge(); renderAll(); }});
$("#printReport").addEventListener("click", ()=>window.print());
$("#themeToggle").addEventListener("click", ()=>{
  const root = document.body;
  if(root.classList.contains("light")){ root.classList.remove("light"); settings({theme:"dark"}) }
  else { root.classList.add("light"); settings({theme:"light"}) }
});
$("#year").textContent = new Date().getFullYear();

// invoices
$("#addInvoice").addEventListener("click", ()=>{
  openModal(invoiceForm());
  $("#saveInv").addEventListener("click", (e)=>{
    e.preventDefault();
    const f = $("#modal form");
    addInvoice({
      num:f.num.value.trim(), client:f.client.value.trim(), date:f.date.value, due:f.due.value,
      status:f.status.value, total:Number(f.total.value||0)
    });
    $("#modal").close();
  });
});
document.addEventListener("change", (e)=>{
  if(e.target.matches(".inv-status")){ updateInvoice(e.target.dataset.id, {status:e.target.value}); }
});
document.addEventListener("click", (e)=>{
  if(e.target.matches(".row-del")) removeInvoice(e.target.dataset.id);
});

// expenses
$("#addExpense").addEventListener("click", ()=>{
  openModal(expenseForm());
  $("#saveExp").addEventListener("click", (e)=>{
    e.preventDefault();
    const f = $("#modal form");
    addExpense({
      date:f.date.value, category:f.category.value.trim(), vendor:f.vendor.value.trim(),
      notes:f.notes.value.trim(), amount:Number(f.amount.value||0)
    });
    $("#modal").close();
  });
});
document.addEventListener("click", (e)=>{
  if(e.target.matches(".exp-del")) removeExpense(e.target.dataset.id);
});

// clients
$("#addClient").addEventListener("click", ()=>{
  openModal(clientForm());
  $("#saveCli").addEventListener("click", (e)=>{
    e.preventDefault();
    const f = $("#modal form");
    addClient({company:f.company.value.trim(), contact:f.contact.value.trim(), email:f.email.value.trim(), phone:f.phone.value.trim(), notes:f.notes.value.trim()});
    $("#modal").close();
  });
});
document.addEventListener("click", (e)=>{
  if(e.target.matches(".cli-del")) removeClient(e.target.dataset.id);
});

// CSV import/export
$("#exportInvoices").addEventListener("click", ()=>{
  const csv = toCSV(data().invoices);
  downloadFile("vendorflow_invoices.csv", csv);
});
$("#exportExpenses").addEventListener("click", ()=>downloadFile("vendorflow_expenses.csv", toCSV(data().expenses)));
$("#exportClients").addEventListener("click", ()=>downloadFile("vendorflow_clients.csv", toCSV(data().clients)));

$("#importInvoices").addEventListener("change", (e)=>handleCSVImport(e, "invoices"));
$("#importExpenses").addEventListener("change", (e)=>handleCSVImport(e, "expenses"));
$("#importClients").addEventListener("change", (e)=>handleCSVImport(e, "clients"));

function handleCSVImport(e, type){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = fromCSV(reader.result);
    const withIds = rows.map(r=>({id:uid(type.slice(0,3)), ...r}));
    const cur = data()[type];
    setData({[type]: withIds.concat(cur)});
    renderAll();
  };
  reader.readAsText(file);
}

function downloadFile(filename, content){
  const a = document.createElement("a");
  const blob = new Blob([content], {type:"text/plain"});
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

// Backup/Restore
$("#downloadBackup").addEventListener("click", ()=>{
  const dump = JSON.stringify({settings: settings(), ...data()}, null, 2);
  downloadFile("vendorflow_backup.json", dump);
});
$("#restoreBackup").addEventListener("click", ()=>{
  const inp = document.createElement("input"); inp.type="file"; inp.accept=".json";
  inp.onchange = (e)=>{
    const f = e.target.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const parsed = JSON.parse(reader.result);
        if(parsed.settings) storage("vf_settings", parsed.settings);
        if(parsed.invoices) storage("vf_invoices", parsed.invoices);
        if(parsed.expenses) storage("vf_expenses", parsed.expenses);
        if(parsed.clients) storage("vf_clients", parsed.clients);
        renderAll();
      }catch(err){ alert("Invalid JSON"); }
    };
    reader.readAsText(f);
  };
  inp.click();
});

// Settings
$("#settingsForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  const f = e.target;
  settings({bizName:f.bizName.value.trim(), currency:f.currency.value.trim()||"$", tax:Number(f.tax.value||0)});
  alert("Settings saved");
  renderAll();
});

// Export all (ZIP-like JSON bundle)
$("#exportAll").addEventListener("click", ()=>{
  const bundle = JSON.stringify({exportedAt:new Date().toISOString(), ...data()}, null, 2);
  downloadFile("vendorflow_all.json", bundle);
});

// Import all (bundle)
$("#importAll").addEventListener("click", ()=>$("#restoreBackup").click());

function renderAll(){
  renderDashboard(); renderInvoices(); renderExpenses(); renderClients();
  // theme
  const t = settings().theme || "dark";
  if(t==="light") document.body.classList.add("light"); else document.body.classList.remove("light");
}
renderAll();
