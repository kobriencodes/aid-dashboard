// frontend/src/admin.js
import { listUpdates, postUpdate, bulkImport } from "./api.js";

const CATEGORIES = ["health","checkpoints","borders","roads","food","water","shelters"];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  for (const c of children) node.append(c?.nodeType ? c : document.createTextNode(c ?? ""));
  return node;
}

function rowToInputs(row = {}) {
  return {
    id: row.id || "",
    status: row.status || "",
    verified_at: row.verified_at || new Date().toISOString().replace(".000",""),
    name: row.name || "",
    notes: row.notes || "",
    priority: row.priority || "",
    source: row.source || "",
    reporter: row.reporter || "",
    tags: Array.isArray(row.tags) ? row.tags.join("|") : (row.tags || "")
  };
}

export function mountAdminPanel(container) {
  let state = {
    category: "health",
    entries: [],
    form: rowToInputs(),
    busy: false,
    error: ""
  };

  const catSelect = el("select", { class: "admin-select" },
    ...CATEGORIES.map(c => el("option", { value: c }, c))
  );
  const refreshBtn = el("button", { class: "btn", onClick: onRefresh }, "Refresh");
  const errBox = el("div", { class: "admin-error" });

  // Single-entry form
  const form = el("form", { class: "admin-form" });
  const formFields = {};
  [
    ["id","ID *"],
    ["status","Status *"],
    ["verified_at","Verified At (ISO) *"],
    ["name","Name"],
    ["notes","Notes"],
    ["priority","Priority (low|medium|high)"],
    ["source","Source"],
    ["reporter","Reporter"],
    ["tags","Tags (pipe-separated)"]
  ].forEach(([key,label]) => {
    const input = key === "notes"
      ? el("textarea", { name: key, rows: 2 })
      : el("input", { name: key });
    formFields[key] = input;
    form.append(
      el("label", {}, label),
      input
    );
  });
  const submitBtn = el("button", { class: "btn primary", type: "submit" }, "Submit");
  form.append(submitBtn);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      const payload = {
        category: state.category,
        id: formFields.id.value.trim(),
        status: formFields.status.value.trim(),
        verified_at: formFields.verified_at.value.trim(),
        name: formFields.name.value.trim() || undefined,
        notes: formFields.notes.value.trim() || undefined,
        priority: formFields.priority.value.trim() || undefined,
        source: formFields.source.value.trim() || undefined,
        reporter: formFields.reporter.value.trim() || undefined,
        tags: (formFields.tags.value.trim() ? formFields.tags.value.trim().split("|").map(s=>s.trim()).filter(Boolean) : undefined)
      };
      if (!payload.id || !payload.status || !payload.verified_at) {
        throw new Error("id, status, verified_at are required");
      }
      await postUpdate(payload);
      await onRefresh();
      form.reset();
      // Prefill new verified_at to now for convenience
      formFields.verified_at.value = new Date().toISOString().replace(".000","");
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  });

  // Bulk import
  const bulkText = el("textarea", { rows: 6, placeholder: "Paste JSONL or a JSON array here, or switch to CSV and paste CSV…" });
  const fileInput = el("input", { type: "file", accept: ".jsonl,.json,.csv" });
  const bulkBtn = el("button", { class: "btn", onClick: onBulkImport }, "Import (JSONL/JSON/CSV)");

  // Table
  const table = el("table", { class: "admin-table" });
  const thead = el("thead", {},
    el("tr", {},
      el("th", {}, "ID"),
      el("th", {}, "Status"),
      el("th", {}, "Verified At"),
      el("th", {}, "Name"),
      el("th", {}, "Priority"),
      el("th", {}, "Notes"),
      el("th", {}, "Quick Update")
    )
  );
  const tbody = el("tbody");
  table.append(thead, tbody);

  function render() {
    catSelect.value = state.category;
    // fill form defaults
    formFields.verified_at.value = formFields.verified_at.value || new Date().toISOString().replace(".000","");

    // table rows
    tbody.innerHTML = "";
    for (const r of state.entries) {
      const quick = quickEditRow(r);
      tbody.append(
        el("tr", {},
          el("td", {}, r.id),
          el("td", {}, r.status || ""),
          el("td", {}, r.verified_at || ""),
          el("td", {}, r.name || ""),
          el("td", {}, r.priority || ""),
          el("td", {}, r.notes || ""),
          el("td", {}, quick)
        )
      );
    }
    errBox.textContent = state.error;
    errBox.style.display = state.error ? "block" : "none";
  }

  function quickEditRow(row) {
    const inputs = {
      status: el("input", { value: row.status || "" }),
      notes: el("input", { value: row.notes || "" }),
      priority: el("input", { value: row.priority || "" }),
    };
    const btn = el("button", { class: "btn tiny" }, "Save");
    btn.addEventListener("click", async () => {
      try {
        setBusy(true);
        const payload = {
          category: state.category,
          id: row.id,
          status: inputs.status.value.trim() || row.status || "updated",
          verified_at: new Date().toISOString().replace(".000",""),
          notes: inputs.notes.value.trim() || undefined,
          priority: inputs.priority.value.trim() || undefined,
          name: row.name || undefined
        };
        await postUpdate(payload);
        await onRefresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    });
    const wrap = el("div", { class: "quick-edit" },
      el("div", {}, "Status:", inputs.status),
      el("div", {}, "Notes:", inputs.notes),
      el("div", {}, "Priority:", inputs.priority),
      btn
    );
    return wrap;
  }

  async function onRefresh() {
    try {
      setBusy(true);
      const data = await listUpdates(state.category);
      state.entries = data;
      setError("");
      render();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onBulkImport() {
    try {
      setBusy(true);
      if (fileInput.files?.length) {
        await bulkImport(state.category, { file: fileInput.files[0] });
      } else if (bulkText.value.trim()) {
        await bulkImport(state.category, { text: bulkText.value });
      } else {
        throw new Error("Provide a file or paste text to import.");
      }
      bulkText.value = "";
      fileInput.value = "";
      await onRefresh();
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function setBusy(b) {
    state.busy = b;
    container.classList.toggle("is-busy", b);
  }
  function setError(msg) {
    state.error = msg;
    render();
  }

  catSelect.addEventListener("change", async () => {
    state.category = catSelect.value;
    await onRefresh();
  });

  container.append(
    el("div", { class: "admin-toolbar" },
      el("div", {}, "Category: ", catSelect, " ", refreshBtn)
    ),
    errBox,
    el("section", { class: "admin-section" },
      el("h3", {}, "Add / Update Single Entry"),
      form
    ),
    el("section", { class: "admin-section" },
      el("h3", {}, "Bulk Import"),
      el("div", { class: "admin-bulk" },
        el("div", {}, bulkText),
        el("div", {}, fileInput),
        bulkBtn
      )
    ),
    el("section", { class: "admin-section" },
      el("h3", {}, "Existing Entries"),
      table
    )
  );

  // initial load
  onRefresh();
}