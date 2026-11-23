// ==== CONFIGURE AQUI com os dados do seu projeto Firebase ====
const firebaseConfig = {
  apiKey: "AIzaSyBDoYLC-jenq6Jfk1o3D8S0ht9-lC5vyIk",
  authDomain: "numeros-de-pedidos.firebaseapp.com",
  databaseURL: "https://numeros-de-pedidos-default-rtdb.firebaseio.com",
  projectId: "numeros-de-pedidos",
  storageBucket: "numeros-de-pedidos.firebasestorage.app",
  messagingSenderId: "527775648268",
  appId: "1:527775648268:web:dfa16a4be0797ee383fc29"
};

const ADMIN_EMAIL = "admin@workinstore.org";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, runTransaction, onValue, update, remove, set, get, serverTimestamp, off } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = (id) => document.getElementById(id);

const DEFAULT_PHRASE = "Este é o número do seu pedido {numero}. Para suporte remoto e pós-venda, acesse nosso suporte neste site com seu número do pedido https://suporte.workinstore.org";
let settings = { title: "WorkInStore", logo: "W", theme: "grafiti", accentOn: false, accent: "#00e5ff", radius: 14, font: 15, phrase: DEFAULT_PHRASE };
let orders = {};

// ---------- Temas ----------
const THEMES = ["grafiti", "preto", "claro"];
const NAMES = { grafiti: "Grafiti", preto: "Preto", claro: "Claro" };
function setTheme(t) {
  document.body.dataset.theme = t; $("themeName").textContent = NAMES[t];
  localStorage.setItem("ws-theme", t);
}
setTheme(localStorage.getItem("ws-theme") || "grafiti");
$("themeBtn").onclick = () => setTheme(THEMES[(THEMES.indexOf(document.body.dataset.theme) + 1) % 3]);

// ---------- Utilidades ----------
const loader = (on, txt = "Carregando...") => { $("loader").querySelector("p").textContent = txt; $("loader").classList.toggle("hidden", !on); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2200); }
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const phraseFor = (n) => (settings.phrase || DEFAULT_PHRASE).replaceAll("{numero}", n);
async function copy(text) { try { await navigator.clipboard.writeText(text); } catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } toast("Frase copiada!"); }

// ---------- Layout ----------
function applySettings() {
  document.querySelectorAll(".site-title").forEach(e => e.textContent = settings.title);
  document.querySelectorAll(".logo").forEach(e => e.textContent = settings.logo);
  document.title = settings.title + " · Pedidos";
  const s = document.documentElement.style;
  s.setProperty("--radius", settings.radius + "px");
  s.setProperty("--fs", settings.font + "px");
  if (settings.accentOn) document.body.style.setProperty("--accent", settings.accent); else document.body.style.removeProperty("--accent");
  localStorage.setItem("ws-settings", JSON.stringify(settings));
}
try { Object.assign(settings, JSON.parse(localStorage.getItem("ws-settings") || "{}")); } catch {}
applySettings();

function fillLayoutForm() {
  $("sTitle").value = settings.title; $("sLogo").value = settings.logo; $("sTheme").value = settings.theme;
  $("sAccent").value = settings.accent; $("sAccentOn").checked = settings.accentOn;
  $("sRadius").value = settings.radius; $("sFont").value = settings.font; $("sPhrase").value = settings.phrase;
}
$("layoutForm").onsubmit = async (e) => {
  e.preventDefault();
  const phrase = $("sPhrase").value.trim() || DEFAULT_PHRASE;
  if (!phrase.includes("{numero}")) return toast("A frase precisa conter {numero}");
  settings = { title: $("sTitle").value.trim() || "WorkInStore", logo: $("sLogo").value.trim() || "W", theme: $("sTheme").value,
    accent: $("sAccent").value, accentOn: $("sAccentOn").checked, radius: +$("sRadius").value, font: +$("sFont").value, phrase };
  loader(true, "Salvando...");
  try { await set(ref(db, "settings"), settings); applySettings(); setTheme(settings.theme); toast("Layout salvo!"); }
  catch (err) { toast("Erro: " + err.message); }
  loader(false);
};
["sRadius", "sFont", "sAccent", "sAccentOn"].forEach(id => $(id).addEventListener("input", () => {
  Object.assign(settings, { radius: +$("sRadius").value, font: +$("sFont").value, accent: $("sAccent").value, accentOn: $("sAccentOn").checked });
  applySettings();
}));

// ---------- Login ----------
$("loginForm").onsubmit = async (e) => {
  e.preventDefault(); $("loginMsg").textContent = "";
  const email = $("email").value.trim().toLowerCase();
  if (email !== ADMIN_EMAIL) { $("loginMsg").textContent = "Acesso permitido somente ao administrador."; return; }
  loader(true, "Entrando...");
  try { await signInWithEmailAndPassword(auth, email, $("password").value); }
  catch { loader(false); $("loginMsg").textContent = "E-mail ou senha inválidos."; }
};
$("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  if (user && user.email?.toLowerCase() === ADMIN_EMAIL) {
    loader(true, "Carregando painel...");
    try { const snap = await get(ref(db, "settings")); if (snap.exists()) { Object.assign(settings, snap.val()); applySettings(); } } catch {}
    await wait(900); // animação spin
    fillLayoutForm();
    onValue(ref(db, "orders"), (s) => { orders = s.val() || {}; renderOrders(); });
    $("loginView").classList.add("hidden"); $("appView").classList.remove("hidden");
    loader(false);
  } else {
    if (user) await signOut(auth);
    off(ref(db, "orders")); orders = {};
    $("appView").classList.add("hidden"); $("loginView").classList.remove("hidden");
    loader(false);
  }
});

// ---------- Abas ----------
document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.id !== "tab-" + b.dataset.tab));
});

// ---------- Geração de número único ----------
function randomNumber() {
  // 10 dígitos (1000000000 a 9999999999) usando gerador criptográfico
  const a = new Uint32Array(2); crypto.getRandomValues(a);
  const n = (a[0] * 4294967296 + a[1]) % 9000000000;
  return String(1000000000 + n);
}
async function createUniqueOrder() {
  for (let i = 0; i < 10; i++) {
    const num = randomNumber();
    // Transação atômica: só grava se o número ainda NÃO existir no banco
    const res = await runTransaction(ref(db, "orders/" + num), (cur) => {
      if (cur !== null) return; // já existe -> aborta
      return { number: num, createdAt: Date.now(), name: "", city: "", street: "", streetNumber: "", district: "", whatsapp: "" };
    });
    if (res.committed) return num;
  }
  throw new Error("Não foi possível gerar um número único. Tente novamente.");
}
$("genBtn").onclick = async () => {
  loader(true, "Gerando número...");
  try {
    const [num] = await Promise.all([createUniqueOrder(), wait(700)]);
    $("genNumber").textContent = num; $("genPhrase").value = phraseFor(num);
    $("genResult").classList.remove("hidden");
  } catch (err) { toast(err.message); }
  loader(false);
};
$("copyBtn").onclick = () => copy($("genPhrase").value);

// ---------- Lista de pedidos ----------
function renderOrders() {
  const q = $("search").value.trim().toLowerCase();
  const list = Object.values(orders).sort((a, b) => b.createdAt - a.createdAt)
    .filter(o => !q || Object.values(o).join(" ").toLowerCase().includes(q));
  $("ordersList").innerHTML = list.length ? list.map(o => {
    const addr = [o.street, o.streetNumber, o.district].filter(Boolean).join(", ");
    return `<div class="order">
      <div class="num">${esc(o.number)}</div>
      <div class="info"><b>${esc(o.name) || "Sem cliente"}</b>${o.city ? " · " + esc(o.city) : ""}<br>
        ${addr ? esc(addr) + "<br>" : ""}${o.whatsapp ? "WhatsApp: " + esc(o.whatsapp) + "<br>" : ""}
        ${new Date(o.createdAt).toLocaleString("pt-BR")}</div>
      <div class="acts"><button class="btn" data-copy="${esc(o.number)}">Copiar</button><button class="btn primary" data-edit="${esc(o.number)}">Editar</button></div>
    </div>`;
  }).join("") : `<p class="muted">Nenhum pedido encontrado.</p>`;
}
$("search").oninput = renderOrders;
$("ordersList").onclick = (e) => {
  const c = e.target.dataset.copy, ed = e.target.dataset.edit;
  if (c) copy(phraseFor(c));
  if (ed) openEdit(ed);
};

// ---------- Edição ----------
let editing = null;
const F = { eName: "name", eCity: "city", eStreet: "street", eNumber: "streetNumber", eDistrict: "district", eWhats: "whatsapp" };
function openEdit(num) {
  editing = num; const o = orders[num] || {};
  $("eNum").textContent = num;
  for (const [id, k] of Object.entries(F)) $(id).value = o[k] || "";
  $("editDlg").showModal();
}
$("eCancel").onclick = () => $("editDlg").close();
$("editForm").onsubmit = async (e) => {
  e.preventDefault();
  const data = {}; for (const [id, k] of Object.entries(F)) data[k] = $(id).value.trim().slice(0, 200);
  loader(true, "Salvando...");
  try { await update(ref(db, "orders/" + editing), data); toast("Pedido atualizado!"); $("editDlg").close(); }
  catch (err) { toast("Erro: " + err.message); }
  loader(false);
};
$("eDelete").onclick = async () => {
  if (!confirm("Excluir o pedido " + editing + "?")) return;
  loader(true, "Excluindo...");
  try { await remove(ref(db, "orders/" + editing)); toast("Pedido excluído"); $("editDlg").close(); }
  catch (err) { toast("Erro: " + err.message); }
  loader(false);
};
