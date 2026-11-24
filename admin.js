
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

  // DASHBOARD UND AUTOMATISCHE AKTUALISIERUNG

  function showDashboard() {
    loggedIn = true;

    $("login-panel").classList.add("hidden");
    $("dashboard").classList.remove("hidden");

    addRefreshButton();
    loadAll();
    startAutoRefresh();
  }

  async function loadAll() {
    await Promise.all([
      loadProducts(),
      loadOrders(),
      loadEvent()
    ]);
  }

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
      <button
        type="button"
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

  // PRODUKTE

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
      .forEach(b => b.addEventListener("click", () =>
        editProduct(b.dataset.edit)
      ));

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

  function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    $("product-id").value = p.id;
    $("product-name").value = p.name;
    $("product-category").value = p.category;
    $("product-price").value = p.price;
    $("product-active").checked = p.active;

    $("save-product").textContent = "Änderungen speichern";
    $("cancel-edit").classList.remove("hidden");
    $("product-name").focus();
  }

  function resetProduct() {
    $("product-form").reset();
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
      active: $("product-active").checked
    };

    const result = id
      ? await db.from("products").update(row).eq("id", id)
      : await db.from("products").insert(row);

    if (result.error) {
      return message(
        "Produkt konnte nicht gespeichert werden: " +
        result.error.message
      );
    }

    resetProduct();
    await loadProducts();
    message("Produkt gespeichert.");
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
          teacher_name,
          room,
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

  function renderOrders() {
    let total = 0;
    let count = 0;

    orders.forEach(o => {
      (o.order_items || []).forEach(i => {
        total += Number(i.unit_price) * i.quantity;
        count += i.quantity;
      });
    });

    $("stat-orders").textContent = orders.length;
    $("stat-items").textContent = count;
    $("stat-total").textContent = money(total);

    $("orders-list").innerHTML = orders.length
      ? orders.map(o => {

        const sum = (o.order_items || []).reduce(
          (s, i) => s + Number(i.unit_price) * i.quantity,
          0
        );

        const date = new Date(o.created_at).toLocaleString(
          "de-DE",
          {
            dateStyle: "short",
            timeStyle: "short"
          }
        );

        return `
          <article class="order-row"
            style="${o.completed
              ? "background:#dcfce7;color:#14532d;"
              : ""}">

            <div class="order-meta">
              <strong>${esc(o.teacher_name)}</strong>

              <small>
                Raum: ${esc(o.room || "Nicht angegeben")}
              </small>

              <small>${date}</small>
            </div>

            <div class="order-detail">
              ${(o.order_items || []).map(i =>
                `${i.quantity} × ${esc(
                  i.product_name ||
                  i.products?.name ||
                  "Produkt"
                )}`
              ).join("<br>")}

              ${o.note
                ? `<small class="order-note">${esc(o.note)}</small>`
                : ""}
            </div>

            <div>
              <strong>${money(sum)}</strong>

              <label style="
                display:flex;
                gap:8px;
                align-items:center;
                margin-top:8px;
                cursor:pointer;
              ">
                <input
                  type="checkbox"
                  data-complete="${o.id}"
                  ${o.completed ? "checked" : ""}
                  style="
                    width:18px;
                    height:18px;
                    accent-color:#16a34a;
                    cursor:pointer;
                  "
                >
                Erledigt
              </label>

              <button
                type="button"
                data-delete="${o.id}"
                style="${deleteStyle}margin-top:8px;">
                Löschen
              </button>
            </div>

          </article>
        `;

      }).join("")
      : '<p class="muted">Noch keine Bestellungen vorhanden.</p>';

    bindOrderActions();
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
            " (Raum: " + (order.room || "Nicht angegeben") +
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

          } finally {
            orderAction = false;
            button.disabled = false;
            button.textContent = "Löschen";
          }
        });
      });
  }

  // VERANSTALTUNG DAUERHAFT SPEICHERN

  function showSavedEvent() {
    if (!savedEvent) return;

    $("event-title").value =
      savedEvent.title || "Elternabend";

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
        color:#15803d;
        font-size:13px;
        margin-top:10px;
      `;

      $("event-form").after(status);
    }

    if (savedEvent?.event_date) {
      const date = new Date(
        savedEvent.event_date + "T12:00:00"
      ).toLocaleDateString("de-DE");

      status.textContent =
        "✓ Gespeicherter Termin: " +
        date + " · " +
        savedEvent.start_time.slice(0, 5) +
        " – " +
        savedEvent.end_time.slice(0, 5) +
        " Uhr";
    } else {
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
      return message(
        "Termin konnte nicht geladen werden: " +
        error.message
      );
    }

    savedEvent = data || null;

    showSavedEvent();
    showEventStatus();
  }

  $("event-form").addEventListener("submit", async ev => {
    ev.preventDefault();

    const row = {
      id: 1,
      title: $("event-title").value.trim() || "Elternabend",
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

    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  // KALENDER-EXPORT
  // Verwendet ausschließlich den gespeicherten Termin.

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
      "PRODID:-//Elternabend//DE",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:elternabend-veranstaltung@school.local",
      `DTSTAMP:${new Date().toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}`,
      `DTSTART:${compact(date, start)}`,
      `DTEND:${compact(date, end)}`,
      `SUMMARY:${escapeICS(savedEvent.title || "Elternabend")}`,
      `LOCATION:${escapeICS(savedEvent.location)}`,
      "DESCRIPTION:Erinnerung zum Elternabend",
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      "DESCRIPTION:Elternabend in einer Stunde",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
      ""
    ].join("\r\n");

    downloadFile(
      ics,
      "elternabend.ics",
      "text/calendar;charset=utf-8"
    );

    message("Gespeicherter Termin als Kalenderdatei exportiert.");
  });

  // CSV-EXPORT

  $("export-csv").addEventListener("click", () => {

    const rows = [[
      "Name",
      "Raum",
      "Bestelldatum",
      "Artikel",
      "Menge",
      "Einzelpreis",
      "Anmerkung",
      "Status"
    ]];

    orders.forEach(o => {
      (o.order_items || []).forEach(i => {

        rows.push([
          o.teacher_name,
          o.room || "Nicht angegeben",
          new Date(o.created_at).toLocaleString("de-DE"),
          i.product_name || i.products?.name || "",
          i.quantity,
          Number(i.unit_price).toFixed(2),
          o.note || "",
          o.completed ? "Erledigt" : "Offen"
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
      "elternabend-bestellungen.csv",
      "text/csv;charset=utf-8"
    );
  });

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

    const { error } = await db.auth.signInWithPassword({
      email: $("email").value,
      password: $("password").value
    });

    if (error) {
      $("login-error").textContent =
        "Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.";
      return;
    }

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

    $("orders-list").innerHTML = "";
    $("admin-products").innerHTML = "";

    $("event-form").reset();

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

    if (session) showDashboard();
  }

  init();

})();
