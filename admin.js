(() => {
  const cfg=window.APP_CONFIG||{}, $=id=>document.getElementById(id);
  const configured=cfg.SUPABASE_URL&&!cfg.SUPABASE_URL.includes("DEIN-PROJEKT")&&cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_ANON_KEY.includes("DEIN_PUBLIC");
  const money=n=>new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(n)||0);
  let db, orders=[], products=[];
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function message(s){$("admin-message").textContent=s;}
  function showDashboard(){ $("login-panel").classList.add("hidden");$("dashboard").classList.remove("hidden");loadAll(); }
  async function loadAll(){ await Promise.all([loadProducts(),loadOrders(),loadEvent()]); }
  async function loadProducts(){
    const {data,error}=await db.from("products").select("*").order("category").order("name");
    if(error)return message(error.message); products=data||[];
    $("admin-products").innerHTML=products.map(p=>`<div class="admin-product ${p.active?"":"inactive"}"><span><strong>${esc(p.name)}</strong><small>${esc(p.category)} · ${money(p.price)} ${p.active?"":"· ausgeblendet"}</small></span><button class="mini-btn" data-edit="${p.id}">Bearbeiten</button></div>`).join("")||'<p class="muted">Noch keine Produkte angelegt.</p>';
    $("admin-products").querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>editProduct(b.dataset.edit)));
  }
  function editProduct(id){
    const p=products.find(x=>x.id===id);if(!p)return;
    $("product-id").value=p.id;$("product-name").value=p.name;$("product-category").value=p.category;$("product-price").value=p.price;$("product-active").checked=p.active;
    $("save-product").textContent="Änderungen speichern";$("cancel-edit").classList.remove("hidden");
    $("product-name").focus();
  }
  function resetProduct(){$("product-form").reset();$("product-id").value="";$("product-active").checked=true;$("save-product").textContent="Produkt hinzufügen";$("cancel-edit").classList.add("hidden");}
  $("product-form").addEventListener("submit",async ev=>{
    ev.preventDefault();
    const id=$("product-id").value, row={name:$("product-name").value.trim(),category:$("product-category").value,price:Number($("product-price").value),active:$("product-active").checked};
    const result=id?await db.from("products").update(row).eq("id",id):await db.from("products").insert(row);
    if(result.error)return message("Produkt konnte nicht gespeichert werden: "+result.error.message);
    resetProduct();await loadProducts();message("Produkt gespeichert.");
  });
  $("cancel-edit").addEventListener("click",resetProduct);
  async function loadOrders(){
    const {data,error}=await db.from("orders").select("id,teacher_name,room,note,created_at,order_items(quantity,unit_price,products(name,category))").order("created_at",{ascending:false});
    if(error)return message(error.message);orders=data||[];
    let total=0,count=0;
    orders.forEach(o=>(o.order_items||[]).forEach(i=>{total+=Number(i.unit_price)*i.quantity;count+=i.quantity;}));
    $("stat-orders").textContent=orders.length;$("stat-items").textContent=count;$("stat-total").textContent=money(total);
    $("orders-list").innerHTML=orders.length?orders.map(o=>{
      const sum=(o.order_items||[]).reduce((s,i)=>s+Number(i.unit_price)*i.quantity,0);
      const date=new Date(o.created_at).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"});
      return `<article class="order-row"><div class="order-meta"><strong>${esc(o.teacher_name)}</strong><small>Raum: ${esc(o.room||"—")} · ${date}</small></div><div class="order-detail">${(o.order_items||[]).map(i=>`${i.quantity} × ${esc(i.products?.name||"Produkt")}`).join("<br>")}${o.note?`<small class="order-note">${esc(o.note)}</small>`:""}</div><strong>${money(sum)}</strong></article>`;
    }).join(""):'<p class="muted">Noch keine Bestellungen vorhanden.</p>';
  }
  async function loadEvent(){
    const {data,error}=await db.from("event_settings").select("*").eq("id",1).maybeSingle();
    if(error)return message(error.message);
    if(data){$("event-title").value=data.title||"Elternabend";$("event-date").value=data.event_date||"";$("event-start").value=data.start_time||"18:00";$("event-end").value=data.end_time||"20:00";$("event-location").value=data.location||"";}
  }
  $("event-form").addEventListener("submit",async ev=>{
    ev.preventDefault();
    const row={id:1,title:$("event-title").value.trim(),event_date:$("event-date").value,start_time:$("event-start").value,end_time:$("event-end").value,location:$("event-location").value.trim()};
    const {error}=await db.from("event_settings").upsert(row);
    if(error)return message("Termin konnte nicht gespeichert werden: "+error.message);
    message("Veranstaltungstermin gespeichert.");
  });
  $("download-ics").addEventListener("click",()=>{
    const date=$("event-date").value;if(!date)return message("Bitte zuerst ein Veranstaltungsdatum speichern.");
    const start=$("event-start").value||"18:00",end=$("event-end").value||"20:00";
    const compact=(d,t)=>d.replaceAll("-","")+ "T"+t.replace(":","")+"00";
    const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Elternabend//DE","CALSCALE:GREGORIAN","BEGIN:VEVENT",`UID:elternabend-${date}@school.local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"")}`,`DTSTART:${compact(date,start)}`,`DTEND:${compact(date,end)}`,`SUMMARY:${$("event-title").value||"Elternabend"}`,`LOCATION:${$("event-location").value||""}`,"DESCRIPTION:Erinnerung zum Elternabend","BEGIN:VALARM","TRIGGER:-PT1H","ACTION:DISPLAY","DESCRIPTION:Elternabend in einer Stunde","END:VALARM","END:VEVENT","END:VCALENDAR"].join("\r\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([ics],{type:"text/calendar;charset=utf-8"}));a.download="elternabend.ics";a.click();URL.revokeObjectURL(a.href);
  });
  $("export-csv").addEventListener("click",()=>{
    const rows=[["Name","Raum","Bestelldatum","Artikel","Menge","Einzelpreis","Anmerkung"]];
    orders.forEach(o=>(o.order_items||[]).forEach(i=>rows.push([o.teacher_name,o.room||"",new Date(o.created_at).toLocaleString("de-DE"),i.products?.name||"",i.quantity,Number(i.unit_price).toFixed(2),o.note||""])));
    const csv=rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\r\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download="elternabend-bestellungen.csv";a.click();URL.revokeObjectURL(a.href);
  });
  $("login-form").addEventListener("submit",async ev=>{
    ev.preventDefault();$("login-error").textContent="";
    const {error}=await db.auth.signInWithPassword({email:$("email").value,password:$("password").value});
    if(error){$("login-error").textContent="Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.";return;}
    showDashboard();
  });
  $("logout").addEventListener("click",async()=>{await db.auth.signOut();$("dashboard").classList.add("hidden");$("login-panel").classList.remove("hidden");});
  async function init(){
    if(!configured||!window.supabase){$("login-error").textContent="Bitte zuerst Supabase in config.js konfigurieren.";return;}
    db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    const {data:{session}}=await db.auth.getSession();if(session)showDashboard();
  }
  init();
})();