
(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);

  const configured =
    cfg.SUPABASE_URL &&
    !cfg.SUPABASE_URL.includes("DEIN-PROJEKT") &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("DEIN_PUBLIC");

  const money = n => new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(Number(n) || 0);

  let db;
  let orders = [];
  let products = [];
  let savedEvent = null;
  let refreshTimer = null;
  let loadingOrders = false;
  let orderAction = false;
  let loggedIn = false;

  const esc = s => String(s ?? "").replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c])
  );

  const deleteStyle = `
    background:#dc2626;
    color:white;
    border:none;
    border-radius:6px;
    padding:7px 12px;
    cursor:pointer;
    font-size:13px;
  `;

  function message(s) {
    $("admin-message").textContent = s;
  }

  // DASHBOARD

  function showDashboard() {
    loggedIn = true;

    $("login-panel").classList.add("hidden");
    $("dashboard").classList.remove("hidden");

    addRefreshButton();
    loadAll();
    startAutoRefresh();
    loadArchive();
  }

  async function loadAll() {
    await Promise.all([
      loadProducts(),
      loadEvent().then(loadOrders)
    ]);
  }

  // AUTOMATISCHE AKTUALISIERUNG

  function addRefreshButton() {
    if ($("refresh-orders")) return;

    const toolbar = document.createElement("div");

    toolbar.style.cssText = `
      display:flex;
      align-items:center;
      gap:12px;
      flex-wrap:wrap;
      margin:12px 0;
    `;

    toolbar.innerHTML = `
      <button type="button"
        id="refresh-orders"
        class="mini-btn">
        ↻ Aktualisieren
      </button>

      <small id="refresh-status"
        style="color:#64748b;">
        Automatische Aktualisierung alle 10 Sekunden
      </small>
    `;

    $("orders-list").before(toolbar);

    $("refresh-orders").addEventListener("click", async () => {
      const button = $("refresh-orders");

      button.disabled = true;
      button.textContent = "Wird aktualisiert …";

      try {
        await loadOrders();
      } finally {
        button.disabled = false;
        button.textContent = "↻ Aktualisieren";
      }
    });
  }

  function startAutoRefresh() {
    stopAutoRefresh();

    refreshTimer = setInterval(() => {
      if (
        loggedIn &&
        !document.hidden &&
        !loadingOrders &&
        !orderAction
      ) {
        loadOrders();
      }
    }, 10000);
  }

  function stopAutoRefresh() {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && loggedIn) {
      loadOrders();
    }
  });

  // PRODUKTE LADEN

  async function loadProducts() {
    const { data, error } = await db
      .from("products")
      .select("*")
      .order("category")
      .order("name");

    if (!loggedIn) return false;

    if (error) {
      message(error.message);
      return false;
    }

    products = data || [];

    $("admin-products").innerHTML = products.map(p => `
      <div class="admin-product ${p.active ? "" : "inactive"}">
        ${p.image_path ? `<img class="admin-product-image" src="${esc(imageUrl(p.image_path))}" alt="" loading="lazy">` : ""}
        <span>
          <strong>${esc(p.name)}</strong>
          <small>
            ${esc(p.category)} · ${money(p.price)}
            ${p.active ? "" : "· ausgeblendet"}
          </small>
        </span>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button
            type="button"
            class="mini-btn"
            data-edit="${p.id}">
            Bearbeiten
          </button>

          <button
            type="button"
            data-delete-product="${p.id}"
            style="${deleteStyle}">
            Löschen
          </button>
        </div>
      </div>
    `).join("") ||
      '<p class="muted">Noch keine Produkte angelegt.</p>';

    $("admin-products")
      .querySelectorAll("[data-edit]")
      .forEach(button => {
        button.addEventListener("click", () => {
          editProduct(button.dataset.edit);
        });
      });

    $("admin-products")
      .querySelectorAll("[data-delete-product]")
      .forEach(button => {

        button.addEventListener("click", async () => {

          const product = products.find(
            p => p.id === button.dataset.deleteProduct
          );

          if (!product) return;

          if (!confirm(
            'Produkt "' + product.name +
            '" wirklich endgültig löschen?\n\n' +
            "Bestehende Bestellungen bleiben erhalten."
          )) return;

          button.disabled = true;
          button.textContent = "Wird gelöscht …";

          const { data, error } = await db
            .from("products")
            .delete()
            .eq("id", product.id)
            .select("id")
            .single();

          if (error || !data) {
            button.disabled = false;
            button.textContent = "Löschen";

            message(
              "Produkt konnte nicht gelöscht werden: " +
              (error?.message || "Unbekannter Fehler")
            );

            return;
          }

          if ($("product-id").value === product.id) {
            resetProduct();
          }

          await loadProducts();
          await loadOrders();

          message("Produkt wurde gelöscht.");
        });
      });

    return true;
  }

  // PRODUKTE BEARBEITEN

  let previewUrl = null;
  function previewImage(url) {
    if(previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl=null; }
    const img=$("image-preview"); img.classList.toggle("hidden",!url);
    if(url) img.src=url; else img.removeAttribute("src");
  }
  function imageUrl(path) { return path ? db.storage.from("product-images").getPublicUrl(path).data.publicUrl : ""; }
  $("product-image").addEventListener("change",()=>{
    const file=$("product-image").files[0];
    $("remove-image").checked=false;
    previewImage(file ? null : imageUrl(products.find(p=>p.id===$("product-id").value)?.image_path));
    if(file){previewUrl=URL.createObjectURL(file);$("image-preview").src=previewUrl;$("image-preview").classList.remove("hidden");}
  });
  $("remove-image").addEventListener("change",()=>{if($("remove-image").checked){$("product-image").value="";previewImage(null);}else previewImage(imageUrl(products.find(p=>p.id===$("product-id").value)?.image_path));});
  function editProduct(id) {
    const p = products.find(x => x.id === id);

    if (!p) return;

    $("product-id").value = p.id;
    $("product-name").value = p.name;
    $("product-category").value = p.category;
    $("product-price").value = p.price;
    $("stock").value = p.stock ?? "";
    $("product-image").value=""; $("remove-image").checked=false; previewImage(imageUrl(p.image_path));
    $("product-active").checked = p.active;

    $("save-product").textContent = "Änderungen speichern";
    $("cancel-edit").classList.remove("hidden");
    $("product-name").focus();
  }

  function resetProduct() {
    $("product-form").reset();
    previewImage(null);
    $("product-id").value = "";
    $("product-active").checked = true;
    $("save-product").textContent = "Produkt hinzufügen";
    $("cancel-edit").classList.add("hidden");
  }

  $("product-form").addEventListener("submit", async ev => {
    ev.preventDefault();

    const id = $("product-id").value;

    const row = {
      name: $("product-name").value.trim(),
      category: $("product-category").value,
      price: Number($("product-price").value),
      stock: $("stock").value === "" ? null : Number($("stock").value),
      active: $("product-active").checked
    };

    const oldPath=products.find(p=>p.id===id)?.image_path || null;
    const file=$("product-image").files[0];
    let uploaded=null;
    const button=$("save-product"); button.disabled=true;
    try {
    row.image_path=$("remove-image").checked ? null : oldPath;
    if(file){
      const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[file.type];
      if(!ext || file.size>5*1024*1024) return message("Bitte JPG, PNG oder WebP bis 5 MB auswählen.");
      uploaded=crypto.randomUUID()+"."+ext;
      const {error}=await db.storage.from("product-images").upload(uploaded,file,{contentType:file.type});
      if(error) return message("Bild konnte nicht hochgeladen werden: "+error.message);
      row.image_path=uploaded;
    }
    const result = id
      ? await db.from("products").update(row).eq("id", id)
      : await db.from("products").insert(row);

    if (result.error) {
      if(uploaded) await db.storage.from("product-images").remove([uploaded]);
      return message(
        "Produkt konnte nicht gespeichert werden: " +
        result.error.message
      );
    }

    if(oldPath && oldPath!==row.image_path) await db.storage.from("product-images").remove([oldPath]);
    resetProduct();

    if (await loadProducts()) {
      message("Produkt gespeichert.");
    }
    } catch(error){message("Speichern fehlgeschlagen: "+error.message);} finally {button.disabled=false;}
  });

  $("cancel-edit").addEventListener("click", resetProduct);

  // BESTELLUNGEN LADEN

  async function loadOrders() {
    if (!loggedIn || loadingOrders || orderAction) {
      return false;
    }

    loadingOrders = true;

    try {
      const { data, error } = await db
        .from("orders")
        .select(`
          id,
          event_key,
          teacher_name,
          room,
          place_type,
          paid,
          completed,
          note,
          created_at,
          order_items(
            quantity,
            unit_price,
            product_name,
            products(name,category)
          )
        `)
        .eq("event_key", savedEvent?.event_key || "00000000-0000-0000-0000-000000000000")
        .order("created_at", { ascending: false });

      if (!loggedIn) return false;

      if (error) {
        message(
          "Bestellungen konnten nicht geladen werden: " +
          error.message
        );

        return false;
      }

      orders = data || [];

      renderOrders();

      if ($("refresh-status")) {
        $("refresh-status").textContent =
          "Zuletzt aktualisiert: " +
          new Date().toLocaleTimeString("de-DE") +
          " · Automatisch alle 10 Sekunden";
      }

      return true;

    } catch (error) {
      message("Aktualisierung fehlgeschlagen.");
      return false;

    } finally {
      loadingOrders = false;
    }
  }

  // LIVE-PRODUKTÜBERSICHT

  function renderProductSummary() {
    let panel = $("product-summary");

    if (!panel) {
      panel = document.createElement("section");
      panel.id = "product-summary";
      $("orders-list").before(panel);
    }

    const summary = new Map();

    let total = 0;
    let open = 0;
    let completed = 0;

    orders.forEach(order => {
      (order.order_items || []).forEach(item => {

        const name =
          item.product_name ||
          item.products?.name ||
          "Unbekanntes Produkt";

        const quantity = Number(item.quantity) || 0;

        if (!summary.has(name)) {
          summary.set(name, {
            name,
            total: 0,
            open: 0,
            completed: 0
          });
        }

        const product = summary.get(name);

        product.total += quantity;
        total += quantity;

        if (order.completed) {
          product.completed += quantity;
          completed += quantity;
        } else {
          product.open += quantity;
          open += quantity;
        }
      });
    });

    const items = [...summary.values()].sort(
      (a, b) =>
        b.open - a.open ||
        a.name.localeCompare(b.name, "de")
    );

    const progress = total
      ? Math.round(completed / total * 100)
      : 0;

    panel.className = "product-summary";
    panel.innerHTML = `<div class="summary-heading"><div><div class="eyebrow">ARTIKEL IM ÜBERBLICK</div><h2>Produktübersicht</h2></div><strong>${progress} % erledigt</strong></div>
      <div class="summary-progress" role="progressbar" aria-label="Erledigte Artikel" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div>
      <div class="summary-scroll"><table class="summary-table"><thead><tr><th>Produkt</th><th>Gesamt</th><th>Offen</th><th>Fertig</th></tr></thead><tbody>${items.map(p=>`<tr class="${p.open===0?'finished':''}"><td>${esc(p.name)}</td><td>${p.total}</td><td>${p.open}</td><td>${p.completed}</td></tr>`).join("") || '<tr><td colspan="4">Noch keine Artikel bestellt.</td></tr>'}</tbody><tfoot><tr><th>Summe</th><td>${total}</td><td>${open}</td><td>${completed}</td></tr></tfoot></table></div>`;
  }

  // EINZELNE BESTELLUNGEN ANZEIGEN

  function renderOrders() {

    renderProductSummary();

    let total = 0;
    let count = 0;

    orders.forEach(o => {
      (o.order_items || []).forEach(i => {
        total += Number(i.unit_price) * Number(i.quantity);
        count += Number(i.quantity);
      });
    });

    $("stat-orders").textContent = orders.length;
    $("stat-items").textContent = count;
    $("stat-total").textContent = money(total);

    $("stat-open").textContent = orders.filter(o=>!o.completed).length;
    const paidTotal = orders.filter(o=>o.paid).reduce((sum,o)=>sum+(o.order_items||[]).reduce((n,i)=>n+Number(i.unit_price)*Number(i.quantity),0),0);
    const paidCount = orders.filter(o=>o.paid).length;
    const percent = total>0 ? Math.round(paidTotal/total*100) : 0;
    $("stat-paid").textContent=money(paidTotal);
    $("stat-unpaid").textContent=money(total-paidTotal);
    $("payment-count").textContent=`${paidCount} von ${orders.length} bezahlt`;
    $("payment-progress").value=percent;
    $("payment-caption").textContent=`${percent} % des Bestellwerts bezahlt`;
    const visible = orders.filter(matchesOrder).sort((a,b)=>Number(a.completed)-Number(b.completed));
    $("orders-list").innerHTML = visible.length ? visible.map(o=>{
      const sum=(o.order_items||[]).reduce((n,i)=>n+Number(i.unit_price)*Number(i.quantity),0);
      const date=new Date(o.created_at).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"});
      return `<article class="order-row order-entry ${o.completed?'is-done':''}">
        <div class="order-meta"><div class="order-state">${o.completed?'✓ Erledigt':'Offen'}</div><strong>${esc(o.teacher_name)}</strong><small>${o.place_type==='Tisch'?'Tisch':'Raum'}: ${esc(o.room||'Nicht angegeben')}</small><small>${esc(date)}</small></div>
        <div class="order-detail">${(o.order_items||[]).map(i=>`<div class="order-item"><span><b>${i.quantity} ×</b> ${esc(i.product_name||i.products?.name||'Produkt')}</span><span>${money(Number(i.unit_price)*Number(i.quantity))}</span></div>`).join('')}${o.note?`<small class="order-note">Anmerkung: ${esc(o.note)}</small>`:''}</div>
        <div class="order-actions"><strong class="order-price">${money(sum)}</strong><div class="status-controls"><label class="status-toggle ${o.completed?'selected':''}"><input type="checkbox" data-complete="${esc(o.id)}" ${o.completed?'checked':''}><span>${o.completed?'Erledigt':'Offen'}</span></label><label class="status-toggle payment-toggle ${o.paid?'selected':''}"><input type="checkbox" data-paid="${esc(o.id)}" ${o.paid?'checked':''}><span>${o.paid?'Bezahlt':'Unbezahlt'}</span></label></div><button type="button" class="delete-btn" data-delete="${esc(o.id)}">Löschen</button></div>
      </article>`;
    }).join('') : `<p class="empty-orders">${orders.length?'Keine passenden Bestellungen gefunden.':'Noch keine Bestellungen eingegangen.'}</p>`;

    bindOrderActions();
    $("orders-list").querySelectorAll("[data-paid]").forEach(box=>box.addEventListener("change",async()=>{
      const paid=box.checked;
      if(orderAction||loadingOrders){box.checked=!paid;return;}
      orderAction=true;box.disabled=true;
      try {
        const {data,error}=await db.from("orders").update({paid}).eq("id",box.dataset.paid).select("id").single();
        if(error||!data) throw new Error(error?.message||"Keine Bestätigung");
        const order=orders.find(o=>o.id===box.dataset.paid);
        if(order) order.paid=paid;
        if(loggedIn) renderOrders();
        message(paid?"Zahlung als bezahlt markiert.":"Zahlung wieder als offen markiert.");
      } catch(error){box.checked=!paid;message("Zahlungsstatus konnte nicht gespeichert werden: "+error.message);}
      finally{orderAction=false;box.disabled=false;}
    }));
  }

  // BESTELLUNGEN ABHAKEN UND LÖSCHEN

  function bindOrderActions() {

    $("orders-list")
      .querySelectorAll("[data-complete]")
      .forEach(box => {

        box.addEventListener("change", async () => {

          const completed = box.checked;

          if (orderAction || loadingOrders) {
            box.checked = !completed;
            return;
          }

          orderAction = true;
          box.disabled = true;

          try {
            const { data, error } = await db
              .from("orders")
              .update({ completed })
              .eq("id", box.dataset.complete)
              .select("id")
              .single();

            if (error || !data) {
              box.checked = !completed;

              message(
                "Status konnte nicht gespeichert werden: " +
                (error?.message || "Unbekannter Fehler")
              );

              return;
            }

            const order = orders.find(
              o => o.id === box.dataset.complete
            );

            if (order) order.completed = completed;

            if (loggedIn) renderOrders();

            message(
              completed
                ? "Bestellung als erledigt markiert."
                : "Bestellung wieder geöffnet."
            );

          } catch (error) {
            box.checked = !completed;
            message("Status konnte nicht gespeichert werden.");

          } finally {
            orderAction = false;
            box.disabled = false;
          }
        });
      });

    $("orders-list")
      .querySelectorAll("[data-delete]")
      .forEach(button => {

        button.addEventListener("click", async () => {

          if (orderAction || loadingOrders) return;

          const order = orders.find(
            o => o.id === button.dataset.delete
          );

          if (!order) return;

          if (!confirm(
            "Bestellung von " + order.teacher_name +
            " (" + (order.place_type === "Tisch" ? "Tisch" : "Raum") + ": " + (order.room || "Nicht angegeben") +
            ") wirklich endgültig löschen?\n\n" +
            "Diese Aktion kann nicht rückgängig gemacht werden."
          )) return;

          orderAction = true;
          button.disabled = true;
          button.textContent = "Wird gelöscht …";

          try {
            const { data, error } = await db
              .from("orders")
              .delete()
              .eq("id", order.id)
              .select("id")
              .single();

            if (error || !data) {
              message(
                "Bestellung konnte nicht gelöscht werden: " +
                (error?.message || "Unbekannter Fehler")
              );

              return;
            }

            orders = orders.filter(o => o.id !== order.id);

            if (loggedIn) renderOrders();

            message("Bestellung wurde endgültig gelöscht.");

          } catch (error) {
            message("Bestellung konnte nicht gelöscht werden.");

          } finally {
            orderAction = false;
            button.disabled = false;
            button.textContent = "Löschen";
          }
        });
      });
  }

  // VERANSTALTUNGSTERMIN

  function eventName() {
    return savedEvent?.title?.trim() || "Veranstaltung";
  }

  function updateEventHeading() {
    $("admin-event-brand").textContent = "Verwaltung · " + eventName();
    $("admin-event-heading").textContent = eventName() + " verwalten";
    document.title = "Administration · " + eventName();
  }

  function eventFilename() {
    return eventName().normalize("NFC").replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/g, "").slice(0, 100) || "veranstaltung";
  }

  function showSavedEvent() {
    updateEventHeading();
    if (!savedEvent) return;
    $("accepting").checked = savedEvent.accepting;
    $("deadline").value = savedEvent.deadline ? localDate(savedEvent.deadline) : "";

    $("event-place-type").value = savedEvent.place_type === "Tisch" ? "Tisch" : "Raum";
    $("event-title").value =
      savedEvent.title || "Veranstaltung";

    $("event-date").value =
      savedEvent.event_date || "";

    $("event-start").value =
      (savedEvent.start_time || "18:00").slice(0, 5);

    $("event-end").value =
      (savedEvent.end_time || "20:00").slice(0, 5);

    $("event-location").value =
      savedEvent.location || "";

    showEventStatus();
  }

  function showEventStatus() {
    let status = $("saved-event-status");

    if (!status) {
      status = document.createElement("p");
      status.id = "saved-event-status";

      status.style.cssText = `
        font-size:13px;
        margin-top:10px;
      `;

      $("event-form").after(status);
    }

    if (savedEvent?.event_date) {

      const date = new Date(
        savedEvent.event_date + "T12:00:00"
      ).toLocaleDateString("de-DE");

      status.style.color = "#15803d";

      status.textContent =
        "✓ Gespeicherter Termin: " +
        date + " · " +
        (savedEvent.start_time || "18:00").slice(0, 5) +
        " – " +
        (savedEvent.end_time || "20:00").slice(0, 5) +
        " Uhr";

    } else {
      status.style.color = "#64748b";
      status.textContent = "Noch kein Termin gespeichert.";
    }
  }

  async function loadEvent() {
    const { data, error } = await db
      .from("event_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (!loggedIn) return;

    if (error) {
      message(
        "Termin konnte nicht geladen werden: " +
        error.message
      );

      return;
    }

    savedEvent = data || null;

    showSavedEvent();
    showEventStatus();
  }

  // TERMIN SPEICHERN

  $("event-form").addEventListener("submit", async ev => {
    ev.preventDefault();

    const row = {
      id: 1,
      place_type: $("event-place-type").value,
      accepting: $("accepting").checked,
      deadline: $("deadline").value ? new Date($("deadline").value).toISOString() : null,
      title: $("event-title").value.trim() || "Veranstaltung",
      event_date: $("event-date").value,
      start_time: $("event-start").value || "18:00",
      end_time: $("event-end").value || "20:00",
      location: $("event-location").value.trim()
    };

    if (!row.event_date) {
      return message("Bitte ein Veranstaltungsdatum auswählen.");
    }

    if (row.end_time <= row.start_time) {
      return message(
        "Die Endzeit muss nach der Startzeit liegen."
      );
    }

    const submitButton =
      $("event-form").querySelector('[type="submit"]');

    if (submitButton) submitButton.disabled = true;

    try {
      const { data, error } = await db
        .from("event_settings")
        .upsert(row, { onConflict: "id" })
        .select("*")
        .single();

      if (error || !data) {
        return message(
          "Termin konnte nicht gespeichert werden: " +
          (error?.message || "Unbekannter Fehler")
        );
      }

      savedEvent = data;

      showSavedEvent();

      message(
        "Veranstaltungstermin dauerhaft gespeichert."
      );

    } catch (error) {
      message("Termin konnte nicht gespeichert werden.");

    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  // KALENDER-EXPORT

  $("download-ics").addEventListener("click", () => {

    if (!savedEvent?.event_date) {
      return message(
        "Bitte zuerst einen Veranstaltungstermin speichern."
      );
    }

    const date = savedEvent.event_date;
    const start = savedEvent.start_time || "18:00";
    const end = savedEvent.end_time || "20:00";

    const compact = (d, t) =>
      d.replaceAll("-", "") +
      "T" +
      t.slice(0, 5).replace(":", "") +
      "00";

    const escapeICS = value =>
      String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\r|\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Eichendorff Bestellportal//DE",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:veranstaltung-${date}@school.local`,
      `DTSTAMP:${new Date().toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}`,
      `DTSTART:${compact(date, start)}`,
      `DTEND:${compact(date, end)}`,
      `SUMMARY:${escapeICS(savedEvent.title || "Veranstaltung")}`,
      `LOCATION:${escapeICS(savedEvent.location)}`,
      `DESCRIPTION:${escapeICS("Erinnerung: " + eventName())}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeICS(eventName() + " in einer Stunde")}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
      ""
    ].join("\r\n");

    downloadFile(
      ics,
      eventFilename() + ".ics",
      "text/calendar;charset=utf-8"
    );

    message("Gespeicherter Termin als Kalenderdatei exportiert.");
  });

  // CSV-EXPORT

  $("export-csv").addEventListener("click", () => {

    const rows = [[
      "Name",
      "Angabeart",
      "Raum / Tisch",
      "Bestelldatum",
      "Artikel",
      "Menge",
      "Einzelpreis",
      "Anmerkung",
      "Status",
      "Zahlungsstatus"
    ]];

    orders.forEach(o => {
      (o.order_items || []).forEach(i => {

        rows.push([
          o.teacher_name,
          o.place_type === "Tisch" ? "Tisch" : "Raum",
          o.room || "Nicht angegeben",
          new Date(o.created_at).toLocaleString("de-DE"),
          i.product_name || i.products?.name || "",
          i.quantity,
          Number(i.unit_price).toFixed(2),
          o.note || "",
          o.completed ? "Erledigt" : "Offen",
          o.paid ? "Bezahlt" : "Unbezahlt"
        ]);
      });
    });

    const csv = rows.map(r =>
      r.map(v => {
        let value = String(v ?? "");

        if (/^[\s]*[=+\-@]/.test(value) ||
            /^[\t\r\n]/.test(value)) {
          value = "'" + value;
        }

        return `"${value.replaceAll('"', '""')}"`;
      }).join(";")
    ).join("\r\n");

    downloadFile(
      "\ufeff" + csv,
      eventFilename() + "-bestellungen.csv",
      "text/csv;charset=utf-8"
    );
  });

  // DATEIEN HERUNTERLADEN

  function downloadFile(content, filename, type) {
    const a = document.createElement("a");

    const url = URL.createObjectURL(
      new Blob([content], { type })
    );

    a.href = url;
    a.download = filename;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ADMIN-LOGIN

  $("login-form").addEventListener("submit", async ev => {

    ev.preventDefault();
    $("login-error").textContent = "";

    if (!db) {
      $("login-error").textContent =
        "Supabase ist nicht konfiguriert.";
      return;
    }

    const { error } = await db.auth.signInWithPassword({
      email: $("email").value,
      password: $("password").value
    });

    if (error) {
      $("login-error").textContent =
        "Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.";
      return;
    }

    const {data:allowed} = await db.rpc("is_portal_admin");
    if(!allowed){await db.auth.signOut();$("login-error").textContent="Keine Adminberechtigung.";return;}
    showDashboard();
  });

  // ABMELDEN

  $("logout").addEventListener("click", async () => {

    loggedIn = false;
    stopAutoRefresh();

    const { error } = await db.auth.signOut();

    if (error) {
      loggedIn = true;
      startAutoRefresh();
      message("Abmeldung fehlgeschlagen.");
      return;
    }

    orders = [];
    products = [];
    savedEvent = null;
    updateEventHeading();

    $("orders-list").innerHTML = "";
    $("admin-products").innerHTML = "";

    if ($("product-summary")) {
      $("product-summary").remove();
    }

    if ($("saved-event-status")) {
      $("saved-event-status").remove();
    }

    $("stat-orders").textContent = "0";
    $("stat-open").textContent = "0";
    $("stat-items").textContent = "0";
    $("stat-total").textContent = money(0);

    $("event-form").reset();
    $("login-form").reset();

    $("dashboard").classList.add("hidden");
    $("login-panel").classList.remove("hidden");
  });

  // INITIALISIERUNG

  async function init() {

    if (!configured || !window.supabase) {
      $("login-error").textContent =
        "Bitte zuerst Supabase in config.js konfigurieren.";
      return;
    }

    db = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );

    const {
      data: { session }
    } = await db.auth.getSession();

    if (session) { const {data} = await db.rpc("is_portal_admin"); if(data) showDashboard(); else await db.auth.signOut(); }
  }

  function localDate(v){const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  function matchesOrder(o){const q=$("order-search").value.toLowerCase(), f=$("order-filter").value;const p=$("payment-filter").value;return (p==="all"||p==="paid"&&o.paid||p==="unpaid"&&!o.paid) && (o.teacher_name+" "+o.room).toLowerCase().includes(q) && (f==="all" || f==="open"&&!o.completed || f==="done"&&o.completed);}
  $("order-search").oninput=renderOrders; $("order-filter").onchange=renderOrders; $("payment-filter").onchange=renderOrders;
  async function loadArchive(){const {data,error}=await db.from("event_archive").select("*").order("archived_at",{ascending:false});if(error)return message(error.message);$("archive-select").innerHTML='<option value="">Archiv auswählen</option>'+data.map(e=>`<option value="${e.event_key}">${esc(e.settings.title)} · ${esc(e.settings.event_date||"")}</option>`).join("");}
  $("archive-select").onchange=async()=>{const id=$("archive-select").value;$("archive-list").textContent="";if(!id)return;const {data,error}=await db.from("orders").select("*,order_items(*)").eq("event_key",id);if(error)return message(error.message);$("archive-list").innerHTML=data.map(o=>`<p><strong>${esc(o.teacher_name)}</strong> · ${esc(o.place_type)} ${esc(o.room)} · ${o.completed?"Erledigt":"Offen"} · ${o.paid?"Bezahlt":"Unbezahlt"}<br>${o.order_items.map(i=>esc(i.quantity+" × "+i.product_name)).join(" · ")}</p>`).join("")||"Keine Bestellungen";};
  $("archive-event").onclick=async()=>{if(!confirm("Aktuelle Veranstaltung archivieren? Die Bestellannahme wird geschlossen. Produkte und Restbestände bleiben erhalten."))return;const {error}=await db.rpc("archive_event");if(error)return message(error.message);await loadEvent();await loadOrders();await loadArchive();};
  init();

})();
