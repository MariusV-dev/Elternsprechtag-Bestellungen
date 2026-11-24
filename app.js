(() => {
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("DEIN-PROJEKT") &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("DEIN_PUBLIC");
  const money = n => new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n)||0);
  const $ = id => document.getElementById(id);
  let db, products = [], cart = new Map(), eventInfo = null;

  function showSetupError() {
    $("product-groups").innerHTML = `<div class="setup-message"><strong>Die Datenbank ist noch nicht verbunden.</strong><p>Trage zuerst deine Supabase-Projekt-URL und den öffentlichen anon key in <code>config.js</code> ein und führe die Datei <code>supabase/schema.sql</code> aus.</p></div>`;
  }
  function renderProducts() {
    $("product-count").textContent = `${products.length} Produkte`;
    const groups = ["Kaffee","Tee","Wasser","Softdrinks","Snacks","Sonstiges"];
    $("product-groups").innerHTML = groups.map(group => {
      const items = products.filter(p=>p.category===group && p.active);
      if (!items.length) return "";
      return `<section class="product-group"><h3>${group}</h3><div class="product-grid">${items.map(p=>`
        <article class="product-card">
          <div class="product-symbol">${({Kaffee:"☕",Tee:"♨",Wasser:"◌",Softdrinks:"◉",Snacks:"◇",Sonstiges:"＋"})[p.category]||"＋"}</div>
          <div class="product-info"><strong>${escapeHtml(p.name)}</strong><span>${money(p.price)}</span></div>
          <div class="quantity-control"><button type="button" aria-label="${escapeHtml(p.name)} verringern" data-minus="${p.id}">−</button><output>${cart.get(p.id)||0}</output><button type="button" aria-label="${escapeHtml(p.name)} erhöhen" data-plus="${p.id}">+</button></div>
        </article>`).join("")}</div></section>`;
    }).join("") || `<p class="muted">Aktuell sind noch keine Produkte freigeschaltet.</p>`;
    $("product-groups").querySelectorAll("[data-plus]").forEach(b=>b.addEventListener("click",()=>changeQty(b.dataset.plus,1)));
    $("product-groups").querySelectorAll("[data-minus]").forEach(b=>b.addEventListener("click",()=>changeQty(b.dataset.minus,-1)));
  }
  function changeQty(id, delta) {
    const next = Math.max(0,(cart.get(id)||0)+delta);
    if(next) cart.set(id,next); else cart.delete(id);
    renderProducts(); renderCart();
  }
  function renderCart() {
    const selected = products.filter(p=>(cart.get(p.id)||0)>0);
    $("cart-lines").innerHTML = selected.length ? selected.map(p=>`<div class="cart-line"><span>${escapeHtml(p.name)} <small>× ${cart.get(p.id)}</small></span><strong>${money(p.price*cart.get(p.id))}</strong></div>`).join("") : `<p class="muted">Noch keine Artikel ausgewählt.</p>`;
    const total = selected.reduce((s,p)=>s+p.price*cart.get(p.id),0);
    $("cart-total").textContent = money(total);
    $("submit-order").disabled = !selected.length;
  }
  function escapeHtml(s) { return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  async function init() {
    if(!configured || !window.supabase) return showSetupError();
    db = window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    const [{data:p,error:pe},{data:e,error:ee}] = await Promise.all([
      db.from("products").select("id,name,category,price,active").eq("active",true).order("category").order("name"),
      db.from("event_settings").select("*").eq("id",1).maybeSingle()
    ]);
    if(pe) { $("product-groups").innerHTML=`<div class="setup-message">Produkte konnten nicht geladen werden: ${escapeHtml(pe.message)}</div>`; return; }
    products = p||[]; eventInfo=e;
    $("event-date-label").textContent = e?.event_date ? new Intl.DateTimeFormat("de-DE",{dateStyle:"full"}).format(new Date(e.event_date+"T12:00:00")) : "Termin wird bekannt gegeben";
    renderProducts(); renderCart();
  }
  // Pflichtfeld für den Raum dynamisch ergänzen, damit index.html nicht geändert werden muss.
  const roomWrap = document.createElement("div");
  roomWrap.className = "form-field";
  roomWrap.style.marginTop = "14px";
  const roomLabel = document.createElement("label");
  roomLabel.htmlFor = "teacher-room";
  roomLabel.textContent = "Raum *";
  roomLabel.style.display = "block";
  roomLabel.style.marginBottom = "6px";
  const roomInput = document.createElement("input");
  roomInput.type = "text";
  roomInput.id = "teacher-room";
  roomInput.name = "room";
  roomInput.placeholder = "z. B. C4, 210 oder Pavillon";
  roomInput.required = true;
  roomInput.maxLength = 100;
  roomInput.autocomplete = "off";
  roomInput.style.width = "100%";
  roomInput.style.boxSizing = "border-box";
  roomInput.setAttribute("aria-required", "true");
  roomWrap.append(roomLabel, roomInput);
  $("order-form").insertBefore(roomWrap, $("submit-order"));

  $("order-form").addEventListener("submit",async ev=>{
    ev.preventDefault();
    const name=$("teacher-name").value.trim(), room=$("teacher-room").value.trim(), note=$("teacher-note").value.trim();
    const items=[...cart.entries()].filter(([,q])=>q>0).map(([product_id,quantity])=>({product_id,quantity}));
    if(!name||!room||!items.length) return;
    $("submit-order").disabled=true; $("submit-order").textContent="Wird gesendet …";
    const {data,error}=await db.rpc("submit_order",{p_teacher_name:name,p_room:room,p_note:note,p_items:items});
    $("submit-order").innerHTML='Bestellung absenden <span>→</span>';
    if(error) { alert("Die Bestellung konnte nicht gespeichert werden. Bitte versuche es erneut oder informiere die Organisation.\n\n"+error.message); renderCart(); return; }
    $("confirmation-text").textContent=`Danke, ${name}. Deine Bestellung wurde erfolgreich übermittelt.`;
    $("confirmation").classList.remove("hidden");
    document.querySelector(".order-layout").classList.add("hidden");
    cart.clear(); $("order-form").reset(); window.scrollTo({top:0,behavior:"smooth"});
  });
  $("new-order").addEventListener("click",()=>{ $("confirmation").classList.add("hidden"); document.querySelector(".order-layout").classList.remove("hidden"); renderProducts();renderCart(); });
  init();
})();