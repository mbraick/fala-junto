/* Fala Junto — app de Comunicação Aumentativa e Alternativa (CAA)
   Código aberto (MIT). Símbolos: Mulberry e OpenMoji (CC BY-SA 4.0). */
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const COLORS = window.FALA_COLORS;
  const CAT_NAMES = { pessoa: "Pessoas", verbo: "Ações", descr: "Descrição", social: "Social", neg: "Não / urgente", perg: "Perguntas", subst: "Coisas", pasta: "Pasta" };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const uid = (p = "b") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- Armazenamento (IndexedDB com reserva em localStorage / memória) ---------- */
  const store = (() => {
    let dbp = null;
    const mem = {};
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res) => {
        try {
          const r = indexedDB.open("fala-junto", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("kv");
          r.onsuccess = () => res(r.result);
          r.onerror = () => res(null);
        } catch (e) { res(null); }
      });
      return dbp;
    }
    async function get(k) {
      const db = await open();
      if (db) {
        try {
          const v = await new Promise((res, rej) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => res(t.result); t.onerror = rej; });
          if (v !== undefined) return v;
        } catch (e) {}
      }
      try { const s = localStorage.getItem("fj:" + k); if (s) return JSON.parse(s); } catch (e) {}
      return mem[k];
    }
    async function set(k, v) {
      mem[k] = v;
      const db = await open();
      if (db) {
        try { await new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = rej; }); return; } catch (e) {}
      }
      try { localStorage.setItem("fj:" + k, JSON.stringify(v)); } catch (e) {}
    }
    return { get, set };
  })();

  /* ---------- Estado ---------- */
  const DEFAULT_SETTINGS = {
    voiceURI: "", rate: 0.95, pitch: 1.1, speakOnTap: true, showLabels: true, showPics: true, fontScale: 1,
    pin: "", scan: { enabled: false, mode: "auto", interval: 1500, audio: false, touch: true },
    showSide: true, sentenceMode: "frase", holdMs: 0, debounceMs: 0, showFind: true, showFT: true, logUsage: false,
    ft: { a: { image: "sym/m-wash-hands-to.svg", label: "lavar as mãos" }, b: { image: "sym/m-play-to.svg", label: "brincar" }, done: false },
  };
  let set = null;       // { version, root, boards: {id: board} }
  let settings = null;
  let stack = [];        // pilha de navegação
  let sentence = [];     // [{label, image, voc}]
  let editing = false;
  let movingId = null;
  let saveTimer = null;

  function fromDefault() {
    const d = clone(window.FALA_DEFAULT);
    const boards = {};
    d.boards.forEach((b) => (boards[b.id] = b));
    return { version: 2, root: d.root, boards };
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { store.set("set", set); store.set("settings", settings); }, 200);
  }
  const board = () => set.boards[stack[stack.length - 1]] || set.boards[set.root];
  const btnById = (b, id) => b.buttons.find((x) => x.id === id);

  /* ---------- Voz ---------- */
  const synth = window.speechSynthesis;
  let voices = [];
  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices().filter((v) => /^pt/i.test(v.lang));
    voices.sort((a, b) => (/BR/i.test(b.lang) - /BR/i.test(a.lang)) || (/enhanced|premium|aprimorad/i.test(b.name) - /enhanced|premium|aprimorad/i.test(a.name)) || a.name.localeCompare(b.name));
    const sel = $("#stVoice");
    if (!sel) return;
    sel.innerHTML = "";
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = voices.length ? "Automática (português)" : "Voz padrão do aparelho";
    sel.appendChild(o0);
    voices.forEach((v) => { const o = document.createElement("option"); o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})`; sel.appendChild(o); });
    sel.value = settings ? settings.voiceURI : "";
  }
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }
  function speak(text, opts = {}) {
    if (!synth || !text) return;
    try {
      if (!opts.queue) synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      const v = voices.find((x) => x.voiceURI === settings.voiceURI) || voices.find((x) => /pt-BR/i.test(x.lang)) || voices[0];
      if (v) u.voice = v;
      u.rate = opts.rate || settings.rate;
      u.pitch = settings.pitch;
      u.volume = opts.volume ?? 1;
      synth.speak(u);
    } catch (e) {}
  }

  /* ---------- Imagem ---------- */
  const isEmoji = (img) => img && img.startsWith("emoji:");
  // símbolos embutidos podem vir de sym/*.svg ou do pacote symbols.js (versão de arquivo único)
  const resolveSrc = (p) => (window.FALA_SYM && window.FALA_SYM[p]) || p;
  function picEl(img, cls = "") {
    if (!img) return null;
    if (isEmoji(img)) { const s = document.createElement("span"); s.className = "emo " + cls; s.textContent = img.slice(6); return s; }
    const i = document.createElement("img"); i.src = resolveSrc(img); i.alt = ""; i.loading = "lazy"; i.decoding = "async"; if (cls) i.className = cls; return i;
  }

  /* ---------- Renderização ---------- */
  const grid = $("#grid");
  function applyLook() {
    document.body.classList.toggle("hide-labels", !settings.showLabels);
    document.body.classList.toggle("hide-pics", !settings.showPics && settings.showLabels);
    document.documentElement.style.setProperty("--font-scale", settings.fontScale);
    const w = window.innerWidth, base = w <= 560 ? 0.85 : w >= 1600 ? 1.35 : w >= 1200 ? 1.15 : 1;
    document.documentElement.style.setProperty("--label-size", base * settings.fontScale + "rem");
  }
  function render() {
    const b = board();
    $("#boardTitle").textContent = b.name;
    $("#btnUp").disabled = stack.length <= 1;
    $("#btnHome").disabled = stack.length <= 1;
    // fora do modo edição, linhas vazias no fim não aparecem (a prancha cresce conforme é preenchida)
    let showRows = b.rows;
    if (!editing) {
      const visible = (id) => { const x = id && btnById(b, id); return x && !x.hidden; };
      while (showRows > 1 && !(b.grid[showRows - 1] || []).some(visible)) showRows--;
    }
    const cellMin = window.innerWidth <= 560 ? 64 : 84;
    grid.style.gridTemplateColumns = `repeat(${b.cols}, minmax(0, 1fr))`;
    grid.style.gridTemplateRows = `repeat(${showRows}, minmax(${cellMin}px, 1fr))`;
    grid.classList.toggle("editing", editing);
    grid.innerHTML = "";
    for (let r = 0; r < showRows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const id = (b.grid[r] || [])[c];
        let btn = id ? btnById(b, id) : null;
        if (btn && btn.hidden && !editing) btn = null;
        const el = document.createElement("button");
        el.className = "cell";
        el.dataset.r = r; el.dataset.c = c;
        if (btn) {
          el.dataset.id = btn.id;
          el.style.background = btn.bg || "#fff";
          if (btn.loadBoard) el.classList.add("folder");
          const pic = document.createElement("div"); pic.className = "pic";
          const p = picEl(btn.image); if (p) pic.appendChild(p);
          const l = document.createElement("div"); l.className = "lbl"; l.textContent = btn.label;
          el.append(pic, l);
          el.setAttribute("aria-label", btn.label + (btn.loadBoard ? ", pasta" : ""));
          if (movingId === btn.id) el.classList.add("moving");
          if (btn.hidden) el.classList.add("is-hidden");
          if (btn.sound && editing) { const s = document.createElement("span"); s.className = "snd"; s.textContent = "🎙"; el.appendChild(s); }
        } else {
          el.classList.add("empty");
          el.setAttribute("aria-label", editing ? "Espaço vazio. Toque para adicionar" : "Vazio");
          if (!editing) el.tabIndex = -1;
        }
        grid.appendChild(el);
      }
    }
    $("#editbar").hidden = !editing;
    renderSide();
    $("#btnFind").hidden = !settings.showFind;
    $("#btnFT").hidden = !settings.showFT;
    scan.rebuild();
  }
  /* Menu lateral fixo: Início + pastas da prancha inicial */
  function renderSide() {
    const side = $("#side");
    side.hidden = !settings.showSide;
    if (side.hidden) return;
    side.innerHTML = "";
    const cur = board().id;
    const rootB = set.boards[set.root];
    const home = document.createElement("button"); home.type = "button"; home.className = "home" + (cur === set.root ? " on" : ""); home.dataset.side = set.root;
    home.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>';
    const ht = document.createElement("span"); ht.textContent = rootB.name; home.appendChild(ht);
    home.setAttribute("aria-label", rootB.name);
    side.appendChild(home);
    rootB.grid.forEach((row) => row.forEach((id) => {
      const bt = id && btnById(rootB, id);
      if (!bt || !bt.loadBoard || bt.hidden || !set.boards[bt.loadBoard]) return;
      const el = document.createElement("button"); el.type = "button"; el.dataset.side = bt.loadBoard;
      if (stack.includes(bt.loadBoard)) el.classList.add("on");
      const p = picEl(bt.image); if (p) el.appendChild(p);
      const t = document.createElement("span"); t.textContent = bt.label; el.appendChild(t);
      el.setAttribute("aria-label", bt.label + ", pasta");
      side.appendChild(el);
    }));
  }
  $("#side").addEventListener("click", (e) => {
    const el = e.target.closest("button[data-side]"); if (!el || scan.active()) return;
    goSide(el.dataset.side);
  });
  function goSide(id) { stack = id === set.root ? [set.root] : [set.root, id]; movingId = null; render(); }

  function renderStrip() {
    const s = $("#strip");
    s.innerHTML = "";
    sentence.forEach((w) => {
      const d = document.createElement("div"); d.className = "w";
      const p = picEl(w.image); if (p) d.appendChild(p);
      const t = document.createElement("span"); t.textContent = w.label; d.appendChild(t);
      s.appendChild(d);
    });
    s.scrollLeft = s.scrollWidth;
  }
  const sentenceText = () => sentence.map((w) => w.voc || w.label).join(" ");

  /* ---------- Ações principais ---------- */
  let lastAct = { id: null, t: 0 };
  function activate(btn, fromScan) {
    if (!btn) return;
    if (!fromScan && settings.debounceMs) {
      const now = Date.now();
      if (lastAct.id === btn.id && now - lastAct.t < settings.debounceMs) { lastAct.t = now; return; }
      lastAct = { id: btn.id, t: now };
    }
    if (btn.loadBoard && set.boards[btn.loadBoard]) {
      stack.push(btn.loadBoard); render(); return;
    }
    const w = { label: btn.label, image: btn.image, voc: btn.vocalization || "", sound: btn.sound || "" };
    if (settings.sentenceMode === "direto") sentence = [w]; else sentence.push(w);
    renderStrip();
    logUse(btn);
    if (settings.speakOnTap || settings.sentenceMode === "direto") sayWord(w);
  }
  let audioEl = null;
  function playSound(src) {
    return new Promise((res) => {
      try { if (audioEl) audioEl.pause(); audioEl = new Audio(src); audioEl.onended = res; audioEl.onerror = res; audioEl.play().catch(res); } catch (e) { res(); }
    });
  }
  function speakAwait(text) {
    return new Promise((res) => {
      if (!synth || !text) return res();
      try {
        const u = new SpeechSynthesisUtterance(text); u.lang = "pt-BR";
        const v = voices.find((x) => x.voiceURI === settings.voiceURI) || voices.find((x) => /pt-BR/i.test(x.lang)) || voices[0];
        if (v) u.voice = v; u.rate = settings.rate; u.pitch = settings.pitch;
        const t = setTimeout(res, 800 + text.length * 120);
        u.onend = u.onerror = () => { clearTimeout(t); res(); };
        synth.speak(u);
      } catch (e) { res(); }
    });
  }
  function sayWord(w) { if (w.sound) { if (synth) synth.cancel(); playSound(w.sound); } else speak(w.voc || w.label); }
  let speakRun = 0;
  async function doSpeak() {
    if (!sentence.some((w) => w.sound)) { speak(sentenceText()); return; }
    const run = ++speakRun;
    if (synth) synth.cancel();
    // junta trechos falados seguidos e toca as gravações no meio
    const parts = [];
    sentence.forEach((w) => { if (w.sound) parts.push({ sound: w.sound }); else if (parts.length && parts[parts.length - 1].text != null) parts[parts.length - 1].text += " " + (w.voc || w.label); else parts.push({ text: w.voc || w.label }); });
    for (const p of parts) { if (run !== speakRun) return; if (p.sound) await playSound(p.sound); else await speakAwait(p.text); }
  }

  /* ---------- Registro de uso (local) ---------- */
  let usage = { words: {}, days: {} };
  function logUse(btn) {
    if (!settings.logUsage) return;
    const k = btn.label;
    const day = new Date().toISOString().slice(0, 10);
    const w = usage.words[k] || (usage.words[k] = { n: 0, last: "" });
    w.n++; w.last = day;
    usage.days[day] = (usage.days[day] || 0) + 1;
    clearTimeout(logUse.t); logUse.t = setTimeout(() => store.set("usage", usage), 500);
  }
  function doBackspace() { sentence.pop(); renderStrip(); }
  function doClear() { sentence = []; renderStrip(); }
  function goHome() { stack = [set.root]; render(); }
  function goUp() { if (stack.length > 1) { stack.pop(); render(); } }

  grid.addEventListener("click", (e) => {
    const el = e.target.closest(".cell");
    if (!el || scan.active()) return;
    const b = board();
    const id = el.dataset.id;
    if (editing) {
      if (movingId) { moveTo(+el.dataset.r, +el.dataset.c); return; }
      openButtonEditor(id ? btnById(b, id) : null, +el.dataset.r, +el.dataset.c);
      return;
    }
    if (settings.holdMs) return; // ativação feita pelo "segurar"
    if (id) activate(btnById(b, id));
  });
  (() => {
    let t = null, el = null;
    const cancel = () => { if (t) { clearTimeout(t); t = null; } if (el) { el.classList.remove("holding"); el = null; } };
    grid.addEventListener("pointerdown", (e) => {
      if (editing || scan.active() || !settings.holdMs) return;
      const c = e.target.closest(".cell[data-id]"); if (!c) return;
      cancel(); el = c;
      c.style.setProperty("--hold", settings.holdMs + "ms"); c.classList.add("holding");
      t = setTimeout(() => { const id = c.dataset.id; cancel(); activate(btnById(board(), id)); }, settings.holdMs);
    });
    ["pointerup", "pointercancel"].forEach((ev) => grid.addEventListener(ev, cancel));
    grid.addEventListener("pointerout", (e) => { if (el && !el.contains(e.relatedTarget)) cancel(); });
  })();
  grid.addEventListener("contextmenu", (e) => e.preventDefault());
  $("#btnSpeak").onclick = () => !scan.active() && doSpeak();
  $("#strip").onclick = () => !scan.active() && doSpeak();
  $("#btnBack").onclick = () => !scan.active() && doBackspace();
  $("#btnClear").onclick = () => !scan.active() && doClear();
  $("#btnHome").onclick = () => !scan.active() && goHome();
  $("#btnUp").onclick = () => !scan.active() && goUp();

  /* Engrenagem: toque normal abre; durante a varredura exige segurar 1 s */
  (() => {
    const g = $("#btnSettings");
    let t = null;
    g.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (!scan.active()) return;
      t = setTimeout(() => { t = null; scan.pause(); openSettings(); }, 1000);
    });
    const cancel = () => { if (t) { clearTimeout(t); t = null; } };
    g.addEventListener("pointerup", cancel); g.addEventListener("pointerleave", cancel);
    g.addEventListener("click", (e) => { e.stopPropagation(); if (!scan.active()) openSettings(); });
  })();

  /* ---------- Diálogos utilitários ---------- */
  $$("dialog [data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  $$("dialog").forEach((d) => d.addEventListener("close", () => { if (!$$("dialog[open]").length) scan.resume(); }));
  function toast(msg, ms = 2600) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t); setTimeout(() => t.remove(), ms);
  }
  function confirmBox(title, text, yes = "Confirmar") {
    return new Promise((res) => {
      const d = $("#dlgConfirm");
      $("#cfTitle").textContent = title; $("#cfText").textContent = text; $("#cfYes").textContent = yes;
      const done = (v) => { d.close(); res(v); };
      $("#cfYes").onclick = () => done(true); $("#cfNo").onclick = () => done(false);
      d.oncancel = () => res(false);
      d.showModal();
    });
  }

  /* ---------- PIN ---------- */
  function askPin(mode) { // mode: "check" | "new"
    return new Promise((res) => {
      if (mode === "check" && !settings.pin) return res(true);
      const d = $("#dlgPin");
      let val = "", first = null;
      $("#pinTitle").textContent = mode === "new" ? "Novo PIN (4 dígitos)" : "Digite o PIN";
      $("#pinMsg").textContent = mode === "new" ? "Deixe em branco e toque em OK para remover o PIN." : "";
      const dots = () => ($("#pinDots").textContent = "•".repeat(val.length) || " ");
      const pad = $("#pinPad"); pad.innerHTML = "";
      let resolved = false;
      const finish = (v) => { resolved = true; d.close(); res(v); };
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].forEach((k) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = k;
        b.onclick = () => {
          if (k === "⌫") val = val.slice(0, -1);
          else if (k === "OK") {
            if (mode === "new") {
              if (!val) { settings.pin = ""; save(); return finish(true); }
              if (val.length < 4) { $("#pinMsg").textContent = "Use 4 dígitos."; return; }
              if (first === null) { first = val; val = ""; $("#pinTitle").textContent = "Repita o PIN"; }
              else if (first === val) { settings.pin = val; save(); return finish(true); }
              else { first = null; val = ""; $("#pinTitle").textContent = "Novo PIN (4 dígitos)"; $("#pinMsg").textContent = "Os PINs não conferem. Tente de novo."; }
            } else if (val === settings.pin) return finish(true);
            else { val = ""; $("#pinMsg").textContent = "PIN incorreto."; }
          } else if (val.length < 4) {
            val += k;
            if (mode === "check" && val.length === 4) { if (val === settings.pin) return finish(true); val = ""; $("#pinMsg").textContent = "PIN incorreto."; }
          }
          dots();
        };
        pad.appendChild(b);
      });
      dots();
      d.onclose = () => { if (!resolved) res(false); };
      d.showModal();
    });
  }

  /* ---------- Editor de quadro ---------- */
  let edit = null; // {btn (rascunho), r, c, isNew}
  function openButtonEditor(btn, r, c) {
    const isNew = !btn;
    const draft = btn ? clone(btn) : { id: uid(), label: "", image: "", bg: COLORS.subst, cat: "subst" };
    edit = { draft, r, c, isNew };
    $("#dbTitle").textContent = isNew ? "Novo quadro" : "Editar quadro";
    $("#dbLabel").value = draft.label;
    $("#dbVoc").value = draft.vocalization || "";
    $("#dbDelete").hidden = isNew; $("#dbMove").hidden = isNew;
    $("#dbHidden").checked = !!draft.hidden;
    updateRec();
    // cores
    const sw = $("#dbSw"); sw.innerHTML = "";
    Object.entries(COLORS).forEach(([k, col]) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "swatch"; b.style.background = col; b.textContent = CAT_NAMES[k];
      b.setAttribute("aria-pressed", draft.bg === col);
      b.onclick = () => { draft.bg = col; draft.cat = k; $$(".swatch", sw).forEach((x) => x.setAttribute("aria-pressed", x === b)); };
      sw.appendChild(b);
    });
    // ação
    const sel = $("#dbAction"); sel.innerHTML = "";
    const add = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); };
    add("", "Falar e colocar na frase");
    Object.values(set.boards).filter((b) => b.id !== board().id).sort((a, b) => a.name.localeCompare(b.name)).forEach((b) => add("board:" + b.id, "Abrir a prancha “" + b.name + "”"));
    add("new", "Abrir uma prancha nova…");
    sel.value = draft.loadBoard ? "board:" + draft.loadBoard : "";
    updatePrev();
    $("#dlgButton").showModal();
    if (isNew) setTimeout(() => $("#dbLabel").focus(), 50);
  }
  function updatePrev() {
    const p = $("#dbPrev"); p.innerHTML = "";
    const el = picEl(edit.draft.image); if (el) p.appendChild(el); else p.textContent = "sem imagem";
  }
  $("#formButton").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = edit.draft;
    d.label = $("#dbLabel").value.trim();
    if (!d.label && !d.image) { toast("Escreva um texto ou escolha uma imagem."); return; }
    const voc = $("#dbVoc").value.trim();
    if (voc && voc !== d.label) d.vocalization = voc; else delete d.vocalization;
    const act = $("#dbAction").value;
    const b = board();
    if (act === "new") {
      const nb = newBoard(d.label || "Nova prancha", 4, 3);
      d.loadBoard = nb.id;
    } else if (act.startsWith("board:")) d.loadBoard = act.slice(6);
    else delete d.loadBoard;
    if (d.loadBoard) { d.bg = COLORS.pasta; d.cat = "pasta"; }
    if ($("#dbHidden").checked) d.hidden = true; else delete d.hidden;
    if (!d.sound) delete d.sound;
    if (edit.isNew) { b.buttons.push(d); b.grid[edit.r][edit.c] = d.id; }
    else { const i = b.buttons.findIndex((x) => x.id === d.id); b.buttons[i] = d; }
    save(); $("#dlgButton").close(); render();
    if (act === "new") toast("Prancha “" + set.boards[d.loadBoard].name + "” criada. Toque no quadro para abri-la e preencher.");
  });
  $("#dbDelete").onclick = async () => {
    const ok = await confirmBox("Excluir quadro", `Excluir “${edit.draft.label || "quadro"}”? Isso não pode ser desfeito.`, "Excluir");
    if (!ok) return;
    const b = board();
    b.buttons = b.buttons.filter((x) => x.id !== edit.draft.id);
    b.grid = b.grid.map((row) => row.map((id) => (id === edit.draft.id ? null : id)));
    save(); $("#dlgButton").close(); render();
  };
  $("#dbMove").onclick = () => { movingId = edit.draft.id; $("#dlgButton").close(); render(); toast("Toque no lugar para onde quer mover."); };
  function moveTo(r, c) {
    const b = board();
    let fr = -1, fc = -1;
    b.grid.forEach((row, i) => row.forEach((id, j) => { if (id === movingId) { fr = i; fc = j; } }));
    if (fr >= 0) { const tmp = b.grid[r][c]; b.grid[r][c] = movingId; b.grid[fr][fc] = tmp; }
    movingId = null; save(); render();
  }
  $("#dbNoImg").onclick = () => { edit.draft.image = ""; updatePrev(); };

  // Foto
  $("#dbPhoto").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { edit.draft.image = await shrinkImage(f, 360); delete edit.draft.imageLicense; updatePrev(); } catch (err) { toast("Não consegui abrir essa imagem."); }
  });
  function shrinkImage(file, max) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas"); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); res(cv.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = rej; img.src = url;
    });
  }

  // Voz gravada
  let rec = null;
  function updateRec() {
    const has = !!(edit && edit.draft.sound);
    $("#dbPlay").hidden = !has; $("#dbRecDel").hidden = !has;
    $("#dbRec").textContent = rec && rec.state === "recording" ? "Parar" : has ? "Gravar de novo" : "Gravar";
    $("#dbRecMsg").textContent = rec && rec.state === "recording" ? "Gravando… (até 15 s)" : has ? "Este quadro usa a voz gravada." : "";
  }
  const blobToData = (blob) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  $("#dbRec").onclick = async () => {
    if (rec && rec.state === "recording") { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const mt = ["audio/webm;codecs=opus", "audio/mp4", "audio/aac"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
      rec = mt ? new MediaRecorder(stream, { mimeType: mt }) : new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        rec = null;
        if (blob.size > 2000000) { toast("Gravação muito grande. Grave uma frase curta."); updateRec(); return; }
        if (blob.size) edit.draft.sound = await blobToData(blob);
        updateRec();
      };
      rec.start(); updateRec();
      setTimeout(() => { if (rec && rec.state === "recording") rec.stop(); }, 15000);
    } catch (e) { rec = null; updateRec(); toast("Não foi possível usar o microfone. Permita o acesso ao microfone nas configurações do navegador (a prévia online bloqueia o microfone).", 4500); }
  };
  $("#dbPlay").onclick = () => edit.draft.sound && playSound(edit.draft.sound);
  $("#dbRecDel").onclick = () => { delete edit.draft.sound; updateRec(); };
  $("#dlgButton").addEventListener("close", () => { if (rec && rec.state === "recording") rec.stop(); });

  // Biblioteca (seletor de símbolo reaproveitado: editor e Primeiro/Depois)
  let libPick = null;
  function openPicker(q, cb) { libPick = cb; $("#libQ").value = q || ""; renderLib(); $("#dlgLib").showModal(); }
  function pickerItems() {
    const lib = window.FALA_LIBRARY.map(([p, n]) => [p, n]);
    const known = new Set(lib.map((x) => x[0]));
    Object.values(set.boards).forEach((b) => b.buttons.forEach((bt) => {
      if (bt.image && !known.has(bt.image) && !bt.loadBoard) { known.add(bt.image); lib.unshift([bt.image, [bt.label || "minha imagem"]]); }
    }));
    return lib;
  }
  $("#dbLib").onclick = () => openPicker($("#dbLabel").value, (path, name) => { edit.draft.image = path; delete edit.draft.imageLicense; if (!$("#dbLabel").value) $("#dbLabel").value = name; updatePrev(); });
  $("#libQ").addEventListener("input", renderLib);
  function renderLib() {
    const q = norm($("#libQ").value);
    const g = $("#libGrid"); g.innerHTML = "";
    let items = pickerItems();
    if (q) items = items.filter(([, names]) => names.some((n) => norm(n).includes(q)));
    if (!items.length) { g.innerHTML = '<p class="note">Nada encontrado. Tente outra palavra, use uma foto ou busque no ARASAAC.</p>'; return; }
    items.forEach(([path, names]) => {
      const b = document.createElement("button"); b.type = "button";
      const i = picEl(path) || document.createElement("span");
      const t = document.createElement("span"); t.textContent = names[0];
      b.append(i, t);
      b.onclick = () => { const cb = libPick; $("#dlgLib").close(); if (cb) cb(path, names[0]); };
      g.appendChild(b);
    });
  }

  // Emoji
  $("#dbEmoji").onclick = () => { $("#emojiIn").value = isEmoji(edit.draft.image) ? edit.draft.image.slice(6) : ""; $("#dlgEmoji").showModal(); };
  $("#emojiForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#emojiIn").value.trim();
    if (v) { edit.draft.image = "emoji:" + v; updatePrev(); }
    $("#dlgEmoji").close();
  });

  // Foto real (Openverse: fotos Creative Commons, sem chave de API)
  let realPage = 1;
  // termos em inglês ajudam o Openverse quando a busca em português traz pouco
  const PT_EN = { "água": "water glass", "suco": "juice", "leite": "milk glass", "refrigerante": "soda", "carne": "beef", "frango": "roast chicken", "arroz": "white rice", "feijão": "black beans", "macarrão": "pasta", "batata": "potato", "batata frita": "french fries", "ovo": "fried egg", "pão": "bread", "queijo": "cheese", "bolo": "cake", "sorvete": "ice cream", "maçã": "apple", "uva": "grapes", "morango": "strawberry", "laranja": "orange fruit", "banana": "banana", "bola": "ball toy", "boneca": "doll", "carrinho": "toy car", "cama": "bed", "escova de dente": "toothbrush", "sapato": "shoes", "copo": "drinking glass", "prato": "dinner plate", "colher": "spoon", "biscoito": "cookies", "pipoca": "popcorn", "chocolate": "chocolate bar", "iogurte": "yogurt" };
  $("#dbReal").onclick = () => { $("#realQ").value = $("#dbLabel").value; $("#realGrid").innerHTML = ""; $("#realMore").hidden = true; $("#dlgReal").showModal(); if ($("#realQ").value) { realPage = 1; realSearch(); } };
  $("#realForm").addEventListener("submit", (e) => { e.preventDefault(); realPage = 1; $("#realGrid").innerHTML = ""; realSearch(); });
  $("#realMore").onclick = () => { realPage++; realSearch(); };
  async function realSearch() {
    const raw = $("#realQ").value.trim(); if (!raw) return;
    const q = PT_EN[norm(raw)] || PT_EN[raw.toLowerCase()] || raw;
    const g = $("#realGrid"); const msg = document.createElement("p"); msg.className = "note"; msg.textContent = "Buscando fotos…"; g.appendChild(msg);
    try {
      const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license_type=commercial,modification&mature=false&page_size=20&page=${realPage}`;
      const r = await fetch(url); if (!r.ok) throw new Error(r.status);
      const j = await r.json(); msg.remove();
      if (!j.results.length && realPage === 1) { g.innerHTML = '<p class="note">Nenhuma foto encontrada. Tente outra palavra (em inglês costuma dar mais resultados).</p>'; return; }
      j.results.forEach((t) => {
        const b = document.createElement("button"); b.type = "button";
        const i = document.createElement("img"); i.src = t.thumbnail; i.alt = t.title || ""; i.loading = "lazy";
        const c = document.createElement("span"); c.className = "cr"; c.textContent = `${(t.license || "").toUpperCase()} · ${t.creator || "autor desconhecido"}`;
        b.append(i, c);
        b.onclick = async () => {
          b.disabled = true; c.textContent = "Baixando…";
          try {
            const blob = await (await fetch(t.thumbnail)).blob();
            edit.draft.image = await shrinkImage(blob, 360);
            edit.draft.imageLicense = `CC ${(t.license || "").toUpperCase()} ${t.license_version || ""} · ${t.creator || ""} · ${t.foreign_landing_url || t.url || ""}`.trim();
            if (!$("#dbLabel").value) $("#dbLabel").value = raw;
            updatePrev(); $("#dlgReal").close();
          } catch (e) { c.textContent = "Não consegui baixar"; b.disabled = false; }
        };
        g.appendChild(b);
      });
      $("#realMore").hidden = j.page_count <= realPage;
    } catch (e) {
      msg.textContent = "Não foi possível buscar fotos agora. Verifique a internet e tente de novo em alguns segundos.";
    }
  }

  // ARASAAC (online)
  $("#dbAra").onclick = () => { $("#araQ").value = $("#dbLabel").value; $("#araGrid").innerHTML = ""; $("#dlgAra").showModal(); if ($("#araQ").value) araSearch(); };
  $("#araForm").addEventListener("submit", (e) => { e.preventDefault(); araSearch(); });
  async function araSearch() {
    const q = $("#araQ").value.trim(); if (!q) return;
    const g = $("#araGrid"); g.innerHTML = '<p class="note">Buscando…</p>';
    try {
      const r = await fetch("https://api.arasaac.org/v1/pictograms/br/search/" + encodeURIComponent(q));
      if (r.status === 404) { g.innerHTML = '<p class="note">Nenhum pictograma para essa palavra.</p>'; return; }
      if (!r.ok) throw new Error(r.status);
      const list = (await r.json()).slice(0, 30);
      g.innerHTML = "";
      list.forEach((p) => {
        const url = `https://static.arasaac.org/pictograms/${p._id}/${p._id}_300.png`;
        const kw = (p.keywords && p.keywords[0] && p.keywords[0].keyword) || q;
        const b = document.createElement("button"); b.type = "button";
        const i = document.createElement("img"); i.src = url; i.alt = ""; i.loading = "lazy";
        const t = document.createElement("span"); t.textContent = kw;
        b.append(i, t);
        b.onclick = async () => {
          let data = url;
          try { const blob = await (await fetch(url)).blob(); data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); } catch (e) {}
          edit.draft.image = data; edit.draft.imageLicense = "ARASAAC CC BY-NC-SA";
          if (!$("#dbLabel").value) $("#dbLabel").value = kw;
          updatePrev(); $("#dlgAra").close();
        };
        g.appendChild(b);
      });
    } catch (e) {
      g.innerHTML = '<p class="note">Não foi possível acessar o ARASAAC. Verifique a internet. Nesta prévia online o acesso externo pode estar bloqueado; no app instalado funciona.</p>';
    }
  }

  /* ---------- Primeiro / Depois ---------- */
  function renderFT() {
    const ft = settings.ft;
    [["#ftA", ft.a], ["#ftB", ft.b]].forEach(([sel, v]) => {
      const el = $(sel); const pv = $(".pv", el); pv.innerHTML = "";
      const p = v && picEl(v.image); if (p) pv.appendChild(p);
      $(".nm", el).textContent = v ? v.label : "toque em “Trocar”";
    });
    $("#ftA").classList.toggle("done", !!ft.done);
    $("#ftDone").textContent = ft.done ? "Desfazer ✓" : "Primeiro feito ✓";
  }
  function ftSay(which) {
    const ft = settings.ft, v = ft[which];
    if (v) speak((which === "a" ? "primeiro " : "depois ") + v.label);
  }
  $("#btnFT").onclick = () => { if (scan.active()) return; renderFT(); $("#dlgFT").showModal(); };
  $("#ftA").onclick = () => ftSay("a");
  $("#ftB").onclick = () => ftSay("b");
  $("#ftSpeak").onclick = () => { const ft = settings.ft; if (ft.done && ft.b) speak("agora, " + ft.b.label); else speak([ft.a && "primeiro " + ft.a.label, ft.b && "depois " + ft.b.label].filter(Boolean).join(", ")); };
  $("#ftDone").onclick = () => { settings.ft.done = !settings.ft.done; save(); renderFT(); if (settings.ft.done && settings.ft.b) speak("muito bem! agora, " + settings.ft.b.label); };
  const ftPick = (which) => async () => {
    if (!(await askPin("check"))) return;
    openPicker("", (path, name) => { settings.ft[which] = { image: path, label: name }; settings.ft.done = false; save(); renderFT(); });
  };
  $("#ftPickA").onclick = ftPick("a");
  $("#ftPickB").onclick = ftPick("b");

  /* ---------- Encontrar palavra ---------- */
  function pathsFromRoot() { // id -> [ids da raiz até a prancha]
    const paths = { [set.root]: [set.root] }; const q = [set.root];
    while (q.length) {
      const id = q.shift(); const b = set.boards[id]; if (!b) continue;
      b.buttons.forEach((bt) => { if (bt.loadBoard && set.boards[bt.loadBoard] && !paths[bt.loadBoard] && !bt.hidden) { paths[bt.loadBoard] = paths[id].concat(bt.loadBoard); q.push(bt.loadBoard); } });
    }
    return paths;
  }
  $("#btnFind").onclick = () => { if (scan.active()) return; $("#findQ").value = ""; $("#findRes").innerHTML = ""; $("#dlgFind").showModal(); setTimeout(() => $("#findQ").focus(), 50); };
  $("#findQ").addEventListener("input", () => {
    const q = norm($("#findQ").value); const box = $("#findRes"); box.innerHTML = "";
    if (!q) return;
    const paths = pathsFromRoot(); const hits = [];
    Object.values(set.boards).forEach((b) => b.buttons.forEach((bt) => {
      if (bt.loadBoard || bt.hidden || !paths[b.id]) return;
      const n = norm(bt.label);
      if (n.includes(q) || norm(bt.vocalization).includes(q)) hits.push({ b, bt, score: n === q ? 0 : n.startsWith(q) ? 1 : 2, depth: paths[b.id].length });
    }));
    hits.sort((x, y) => x.score - y.score || x.depth - y.depth);
    if (!hits.length) { box.innerHTML = '<p class="note">Não encontrei. Você pode criar esse quadro no modo edição.</p>'; return; }
    hits.slice(0, 12).forEach(({ b, bt }) => {
      const r = document.createElement("button"); r.type = "button";
      const p = picEl(bt.image); if (p) r.appendChild(p);
      const t = document.createElement("div");
      const nm = document.createElement("div"); nm.style.fontWeight = "700"; nm.textContent = bt.label;
      const pa = document.createElement("div"); pa.className = "path"; pa.textContent = paths[b.id].map((id) => set.boards[id].name).join(" › ");
      t.append(nm, pa); r.appendChild(t);
      r.onclick = () => { $("#dlgFind").close(); showPath(paths[b.id], bt.id); };
      box.appendChild(r);
    });
  });
  async function showPath(path, btnId) {
    // mostra cada pasta do caminho piscando, depois a palavra
    stack = [path[0]]; render();
    for (let i = 1; i < path.length; i++) {
      const folder = board().buttons.find((x) => x.loadBoard === path[i]);
      const el = folder && grid.querySelector(`.cell[data-id="${folder.id}"]`);
      if (el) { el.classList.add("pulse"); await new Promise((r) => setTimeout(r, 1400)); }
      stack.push(path[i]); render();
    }
    const el = grid.querySelector(`.cell[data-id="${btnId}"]`);
    if (el) { el.classList.add("pulse"); setTimeout(() => el.classList.remove("pulse"), 3000); }
  }

  /* ---------- Relatório de uso ---------- */
  function openReport() {
    const body = $("#repBody"); body.innerHTML = "";
    const words = Object.entries(usage.words).sort((a, b) => b[1].n - a[1].n);
    const total = words.reduce((s, [, w]) => s + w.n, 0);
    const p = document.createElement("p"); p.className = "note";
    p.textContent = settings.logUsage ? `${total} toques registrados em ${words.length} palavras diferentes. Os dados ficam só neste aparelho.` : "O registro está desligado. Ligue em Configurações › Relatório de uso.";
    body.appendChild(p);
    // últimos 14 dias
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push([d, usage.days[d] || 0]); }
    const mx = Math.max(1, ...days.map((d) => d[1]));
    const h1 = document.createElement("h3"); h1.className = "section-title"; h1.textContent = "Toques por dia (últimos 14 dias)"; body.appendChild(h1);
    const bd = document.createElement("div"); bd.className = "bars";
    days.forEach(([d, n]) => { const r = document.createElement("div"); r.className = "b"; r.innerHTML = `<span class="t">${d.slice(8)}/${d.slice(5, 7)}</span><span class="v" style="width:${(n / mx) * 100}%"></span><span class="n">${n}</span>`; bd.appendChild(r); });
    body.appendChild(bd);
    const h2 = document.createElement("h3"); h2.className = "section-title"; h2.textContent = "Palavras mais usadas"; body.appendChild(h2);
    const bw = document.createElement("div"); bw.className = "bars";
    const mw = Math.max(1, ...(words.slice(0, 1).map(([, w]) => w.n)));
    words.slice(0, 20).forEach(([k, w]) => { const r = document.createElement("div"); r.className = "b"; const t = document.createElement("span"); t.className = "t"; t.textContent = k; r.appendChild(t); r.insertAdjacentHTML("beforeend", `<span class="v" style="width:${(w.n / mw) * 100}%"></span><span class="n">${w.n}</span>`); bw.appendChild(r); });
    if (!words.length) bw.innerHTML = '<p class="note">Nenhuma palavra registrada ainda.</p>';
    body.appendChild(bw);
    $("#dlgReport").showModal();
  }
  $("#repCsv").onclick = () => {
    const rows = [["palavra", "vezes", "ultimo_uso"]].concat(Object.entries(usage.words).sort((a, b) => b[1].n - a[1].n).map(([k, w]) => [k, w.n, w.last]));
    rows.push([], ["dia", "toques"]); Object.keys(usage.days).sort().forEach((d) => rows.push([d, usage.days[d]]));
    const csv = "\ufeff" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    shareOrDownload(new Blob([csv], { type: "text/csv" }), `fala-junto-uso-${stamp()}.csv`);
  };
  $("#repClear").onclick = async () => {
    if (!(await confirmBox("Apagar registros", "Apagar todo o histórico de uso deste aparelho?", "Apagar"))) return;
    usage = { words: {}, days: {} }; store.set("usage", usage); openReport();
  };

  /* ---------- Pranchas ---------- */
  function newBoard(name, cols, rows) {
    const id = uid("p");
    set.boards[id] = { id, name, cols, rows, buttons: [], grid: Array.from({ length: rows }, () => Array(cols).fill(null)) };
    save();
    return set.boards[id];
  }
  $("#btnNewBoard").onclick = () => openBoardProps(null);
  $("#btnAddBtn").onclick = () => {
    const b = board();
    let pos = null;
    for (let r = 0; r < b.rows && !pos; r++) for (let c = 0; c < b.cols && !pos; c++) if (!b.grid[r][c]) pos = [r, c];
    if (!pos) {
      // prancha cheia: cria uma linha nova no fim (ou uma coluna, se já tiver 20 linhas)
      if (b.rows < 20) { b.grid.push(Array(b.cols).fill(null)); b.rows++; pos = [b.rows - 1, 0]; }
      else if (b.cols < 10) { b.grid.forEach((row) => row.push(null)); b.cols++; pos = [0, b.cols - 1]; }
      else { toast("Esta prancha chegou ao limite de 20 linhas × 10 colunas. Crie uma pasta nova para mais palavras."); return; }
      save(); render(); toast("A prancha estava cheia: criei uma linha nova.");
    }
    openButtonEditor(null, pos[0], pos[1]);
  };
  $("#btnBoardProps").onclick = () => openBoardProps(board());
  $("#btnDoneEdit").onclick = () => { editing = false; movingId = null; render(); };
  let boardEdit = null;
  function openBoardProps(b) {
    boardEdit = b;
    $("#bdTitle").textContent = b ? "Prancha atual" : "Nova prancha";
    $("#bdName").value = b ? b.name : "";
    $("#bdCols").value = b ? b.cols : 4; $("#bdRows").value = b ? b.rows : 3;
    $("#bdDelete").hidden = !b || b.id === set.root;
    $("#bdMsg").textContent = b ? `${b.buttons.length} quadros nesta prancha.` : "Depois de criar, ligue a prancha a um quadro do tipo pasta.";
    $("#dlgBoard").showModal();
  }
  $("#formBoard").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#bdName").value.trim() || "Sem nome";
    const cols = Math.max(1, Math.min(10, +$("#bdCols").value || 4));
    const rows = Math.max(1, Math.min(20, +$("#bdRows").value || 3));
    if (!boardEdit) {
      const nb = newBoard(name, cols, rows);
      stack.push(nb.id); $("#dlgBoard").close(); render(); toast("Prancha criada. Toque nos espaços + para adicionar quadros."); return;
    }
    const b = boardEdit;
    const ids = []; b.grid.forEach((row) => row.forEach((id) => ids.push(id)));
    const used = ids.filter(Boolean).length;
    if (used > cols * rows) { $("#bdMsg").textContent = `Não cabe: a prancha tem ${used} quadros e o novo tamanho comporta ${cols * rows}. Exclua quadros ou aumente o tamanho.`; return; }
    // mantém posições quando possível; o que sobrar vai para os primeiros espaços livres
    const ng = Array.from({ length: rows }, () => Array(cols).fill(null));
    const left = [];
    b.grid.forEach((row, r) => row.forEach((id, c) => { if (!id) return; if (r < rows && c < cols) ng[r][c] = id; else left.push(id); }));
    for (let r = 0; r < rows && left.length; r++) for (let c = 0; c < cols && left.length; c++) if (!ng[r][c]) ng[r][c] = left.shift();
    Object.assign(b, { name, cols, rows, grid: ng });
    save(); $("#dlgBoard").close(); render();
  });
  $("#bdDelete").onclick = async () => {
    const b = boardEdit;
    const ok = await confirmBox("Excluir prancha", `Excluir a prancha “${b.name}” e todos os seus quadros? Pastas que abriam essa prancha passam a só falar.`, "Excluir");
    if (!ok) return;
    delete set.boards[b.id];
    Object.values(set.boards).forEach((x) => x.buttons.forEach((bt) => { if (bt.loadBoard === b.id) { delete bt.loadBoard; bt.cat = "subst"; bt.bg = COLORS.subst; } }));
    stack = stack.filter((id) => id !== b.id); if (!stack.length) stack = [set.root];
    save(); $("#dlgBoard").close(); render();
  };
  function openBoardList() {
    const l = $("#boardList"); l.innerHTML = "";
    Object.values(set.boards).sort((a, b) => (a.id === set.root ? -1 : b.id === set.root ? 1 : a.name.localeCompare(b.name))).forEach((b) => {
      const row = document.createElement("div"); row.className = "bl";
      const s = document.createElement("span"); s.textContent = b.name + (b.id === set.root ? " (início)" : "");
      const go = document.createElement("button"); go.className = "btn small"; go.textContent = "Abrir";
      go.onclick = () => { stack = b.id === set.root ? [set.root] : [set.root, b.id]; $("#dlgBoards").close(); $("#dlgSettings").close(); render(); };
      row.append(s, go); l.appendChild(row);
    });
    $("#dlgBoards").showModal();
  }

  /* ---------- Configurações ---------- */
  async function openSettings() {
    if (!(await askPin("check"))) return;
    scan.pause();
    loadVoices();
    $("#stVoice").value = settings.voiceURI;
    $("#stRate").value = settings.rate; $("#stPitch").value = settings.pitch; $("#stTap").checked = settings.speakOnTap;
    $("#stLabels").checked = settings.showLabels; $("#stPics").checked = settings.showPics; $("#stFont").value = settings.fontScale;
    $("#stScan").checked = settings.scan.enabled; $("#stScanMode").value = settings.scan.mode; $("#stScanInt").value = settings.scan.interval;
    $("#stScanIntV").textContent = (settings.scan.interval / 1000).toFixed(1).replace(".", ",") + " s";
    $("#stScanAudio").checked = settings.scan.audio; $("#stScanTouch").checked = settings.scan.touch;
    $("#stMode").value = settings.sentenceMode; $("#stHold").value = settings.holdMs; $("#stDeb").value = settings.debounceMs;
    $("#stHoldV").textContent = msTxt(settings.holdMs); $("#stDebV").textContent = msTxt(settings.debounceMs);
    $("#stSide").checked = settings.showSide; $("#stShowFind").checked = settings.showFind; $("#stShowFT").checked = settings.showFT; $("#stLog").checked = settings.logUsage;
    $("#stPinState").textContent = settings.pin ? "PIN ativo. Ele é pedido para abrir as configurações." : "Sem PIN: qualquer pessoa pode editar. Recomendado definir um PIN.";
    $("#stPin").textContent = settings.pin ? "Trocar PIN" : "Definir PIN";
    $("#dlgSettings").showModal();
  }
  const bind = (sel, ev, fn) => $(sel).addEventListener(ev, (e) => { fn(e.target); save(); });
  bind("#stVoice", "change", (t) => (settings.voiceURI = t.value));
  bind("#stRate", "input", (t) => (settings.rate = +t.value));
  bind("#stPitch", "input", (t) => (settings.pitch = +t.value));
  bind("#stTap", "change", (t) => (settings.speakOnTap = t.checked));
  bind("#stLabels", "change", (t) => { settings.showLabels = t.checked; if (!t.checked) { settings.showPics = true; $("#stPics").checked = true; } applyLook(); });
  bind("#stPics", "change", (t) => { settings.showPics = t.checked; if (!t.checked) { settings.showLabels = true; $("#stLabels").checked = true; } applyLook(); });
  bind("#stFont", "input", (t) => { settings.fontScale = +t.value; applyLook(); });
  bind("#stScan", "change", (t) => (settings.scan.enabled = t.checked));
  bind("#stScanMode", "change", (t) => (settings.scan.mode = t.value));
  bind("#stScanInt", "input", (t) => { settings.scan.interval = +t.value; $("#stScanIntV").textContent = (t.value / 1000).toFixed(1).replace(".", ",") + " s"; });
  bind("#stScanAudio", "change", (t) => (settings.scan.audio = t.checked));
  bind("#stScanTouch", "change", (t) => (settings.scan.touch = t.checked));
  const msTxt = (ms) => (+ms ? (ms / 1000).toLocaleString("pt-BR") + " s" : "desligado");
  bind("#stMode", "change", (t) => { settings.sentenceMode = t.value; if (t.value === "direto") { sentence = sentence.slice(-1); renderStrip(); } });
  bind("#stHold", "input", (t) => { settings.holdMs = +t.value; $("#stHoldV").textContent = msTxt(t.value); });
  bind("#stDeb", "input", (t) => { settings.debounceMs = +t.value; $("#stDebV").textContent = msTxt(t.value); });
  bind("#stShowFind", "change", (t) => (settings.showFind = t.checked));
  bind("#stSide", "change", (t) => (settings.showSide = t.checked));
  bind("#stShowFT", "change", (t) => (settings.showFT = t.checked));
  bind("#stLog", "change", (t) => (settings.logUsage = t.checked));
  $("#stReport").onclick = openReport;
  $("#dlgSettings").addEventListener("close", () => { if (!editing) render(); });
  $("#stTest").onclick =() => speak("Oi! Eu quero brincar.");
  $("#stEdit").onclick = () => { $("#dlgSettings").close(); editing = true; render(); };
  $("#stBoards").onclick = openBoardList;
  $("#stPin").onclick = async () => { await askPin("new"); $("#stPinState").textContent = settings.pin ? "PIN ativo. Ele é pedido para abrir as configurações." : "Sem PIN: qualquer pessoa pode editar."; $("#stPin").textContent = settings.pin ? "Trocar PIN" : "Definir PIN"; };
  $("#stReset").onclick = async () => {
    const ok = await confirmBox("Restaurar pranchas padrão", "Todas as pranchas e quadros que você criou ou editou serão apagados e o vocabulário original volta. Faça um backup (.obz) antes se quiser guardar.", "Restaurar");
    if (!ok) return;
    set = fromDefault(); stack = [set.root]; save(); $("#dlgSettings").close(); render(); toast("Pranchas padrão restauradas.");
  };

  /* ---------- Open Board Format (OBF / OBZ) ---------- */
  function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return undefined; const n = parseInt(m[1], 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; }
  function rgbToHex(s) {
    if (!s) return "#FFFFFF";
    if (/^#[0-9a-f]{6}$/i.test(s)) return s;
    const m = /rgba?\((\d+)\D+(\d+)\D+(\d+)/i.exec(s); if (!m) return "#FFFFFF";
    return "#" + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  async function imageData(src) { // -> {data, content_type}
    if (src.startsWith("data:")) return { data: src, content_type: src.slice(5, src.indexOf(";")) };
    const r = resolveSrc(src);
    if (r.startsWith("data:")) return { data: r, content_type: r.slice(5, r.indexOf(r.includes(";") ? ";" : ",")) };
    const blob = await (await fetch(r)).blob();
    const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    return { data, content_type: blob.type || (src.endsWith(".svg") ? "image/svg+xml" : "image/png") };
  }
  function boardToObf(b, imgRef) {
    const images = [], sounds = [];
    const buttons = b.buttons.map((bt) => {
      const o = { id: bt.id, label: bt.label, background_color: hexToRgb(bt.bg), border_color: "rgb(140, 151, 164)" };
      if (bt.vocalization) o.vocalization = bt.vocalization;
      if (bt.hidden) o.hidden = true;
      if (bt.sound) { const sid = "snd_" + hash(bt.sound); o.sound_id = sid; sounds.push({ id: sid, data: bt.sound, content_type: bt.sound.slice(5, bt.sound.indexOf(";")) }); }
      if (bt.loadBoard) o.load_board = { id: bt.loadBoard, path: `boards/${bt.loadBoard}.obf` };
      if (bt.image && !isEmoji(bt.image)) { const im = imgRef(bt.image, bt); if (im) { images.push(im); o.image_id = im.id; } }
      else if (isEmoji(bt.image)) o.ext_fala_emoji = bt.image.slice(6);
      return o;
    });
    const uniq = []; const seen = new Set(); images.forEach((i) => { if (!seen.has(i.id)) { seen.add(i.id); uniq.push(i); } });
    return {
      format: "open-board-0.1", id: b.id, locale: "pt-BR", name: b.name, buttons,
      grid: { rows: b.rows, columns: b.cols, order: b.grid },
      images: uniq, sounds, license: { type: "CC BY-SA 4.0", copyright_notice_url: "https://creativecommons.org/licenses/by-sa/4.0/" },
    };
  }
  function imgLicense(src, bt) {
    if (bt && bt.imageLicense && /ARASAAC/.test(bt.imageLicense)) return { type: bt.imageLicense, author_name: "Sergio Palao / ARASAAC", author_url: "https://arasaac.org" };
    if (bt && bt.imageLicense) return { type: bt.imageLicense };
    if (src.includes("sym/m-")) return { type: "CC BY-SA 4.0", author_name: "Mulberry Symbols (Steve Lee)", author_url: "https://mulberrysymbols.org" };
    if (src.includes("sym/e-")) return { type: "CC BY-SA 4.0", author_name: "OpenMoji", author_url: "https://openmoji.org" };
    return undefined;
  }
  function download(blob, name) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast("Arquivo “" + name + "” gerado. Se nada baixou, abra o app instalado (a prévia online bloqueia downloads).", 4200);
  }
  async function shareOrDownload(blob, name) {
    try {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    download(blob, name);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  $("#stExpObf").onclick = async () => {
    const b = board();
    const cache = {};
    for (const bt of b.buttons) if (bt.image && !isEmoji(bt.image) && !cache[bt.image]) { try { cache[bt.image] = await imageData(bt.image); } catch (e) {} }
    const obf = boardToObf(b, (src, bt) => { const d = cache[src]; if (!d) return null; return { id: "img_" + hash(src), data: d.data, content_type: d.content_type, license: imgLicense(src, bt) }; });
    obf.buttons.forEach((o) => { if (o.load_board) delete o.load_board.path; });
    await shareOrDownload(new Blob([JSON.stringify(obf, null, 1)], { type: "application/json" }), `${slugName(b.name)}.obf`);
  };
  $("#stExpObz").onclick = async () => {
    if (!window.JSZip) { toast("Exportação indisponível: biblioteca de zip não carregou."); return; }
    const zip = new window.JSZip();
    const imgPaths = {}; const files = {};
    const all = Object.values(set.boards);
    for (const b of all) for (const bt of b.buttons) {
      const src = bt.image; if (!src || isEmoji(src) || imgPaths[src]) continue;
      try {
        const d = await imageData(src);
        const ext = d.content_type.includes("svg") ? "svg" : d.content_type.includes("png") ? "png" : "jpg";
        const p = `images/img_${hash(src)}.${ext}`;
        imgPaths[src] = { p, ct: d.content_type }; files[p] = d.data.slice(d.data.indexOf(",") + 1);
      } catch (e) {}
    }
    Object.entries(files).forEach(([p, b64]) => zip.file(p, b64, { base64: true }));
    const manifest = { format: "open-board-0.1", root: `boards/${set.root}.obf`, paths: { boards: {}, images: {} } };
    for (const b of all) {
      const obf = boardToObf(b, (src, bt) => { const i = imgPaths[src]; if (!i) return null; return { id: "img_" + hash(src), path: i.p, content_type: i.ct, license: imgLicense(src, bt) }; });
      obf.images.forEach((i) => (manifest.paths.images[i.id] = i.path));
      manifest.paths.boards[b.id] = `boards/${b.id}.obf`;
      zip.file(`boards/${b.id}.obf`, JSON.stringify(obf));
    }
    zip.file("manifest.json", JSON.stringify(manifest, null, 1));
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/zip" });
    await shareOrDownload(blob, `fala-junto-backup-${stamp()}.obz`);
  };
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function slugName(s) { return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "prancha"; }

  function obfToBoard(obf, resolveImage, idMap) {
    const cols = obf.grid?.columns || 4, rows = obf.grid?.rows || Math.ceil((obf.buttons || []).length / cols) || 1;
    const imgs = {}; (obf.images || []).forEach((i) => (imgs[i.id] = i));
    const snds = {}; (obf.sounds || []).forEach((i) => (snds[i.id] = i));
    const id = idMap(obf.id || uid("p"));
    const buttons = (obf.buttons || []).map((o) => {
      const bt = { id: String(o.id ?? uid()), label: o.label || "", bg: rgbToHex(o.background_color), cat: "subst" };
      if (o.vocalization) bt.vocalization = o.vocalization;
      if (o.hidden) bt.hidden = true;
      if (o.sound_id && snds[o.sound_id] && /^data:/.test(snds[o.sound_id].data || "")) bt.sound = snds[o.sound_id].data;
      if (o.load_board && (o.load_board.id || o.load_board.path)) { bt.loadBoard = o.load_board.id ? idMap(String(o.load_board.id)) : null; bt._loadPath = o.load_board.path; bt.cat = "pasta"; }
      if (o.ext_fala_emoji) bt.image = "emoji:" + o.ext_fala_emoji;
      else if (o.image_id && imgs[o.image_id]) { const im = resolveImage(imgs[o.image_id]); if (im) bt.image = im; if (imgs[o.image_id].license && /NC/.test(imgs[o.image_id].license.type || "")) bt.imageLicense = imgs[o.image_id].license.type; }
      return bt;
    });
    const valid = new Set(buttons.map((b) => b.id));
    let order = obf.grid?.order;
    if (!Array.isArray(order)) { order = []; for (let r = 0; r < rows; r++) order.push(buttons.slice(r * cols, r * cols + cols).map((b) => b.id)); }
    const g = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => { const v = order[r] && order[r][c]; return v != null && valid.has(String(v)) ? String(v) : null; }));
    return { id, name: obf.name || "Prancha importada", cols, rows, buttons, grid: g };
  }
  $("#stImport").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      // descobre o tipo pelo conteúdo: o iPad às vezes renomeia (.zip) ou tira a extensão do arquivo
      const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
      const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"
      if (isZip) await importObz(f);
      else {
        const txt = (await f.slice(0, 200).text()).trim();
        if (txt.startsWith("{")) await importObf(f);
        else throw new Error("formato desconhecido");
      }
    } catch (err) {
      console.error(err);
      toast("Não consegui importar esse arquivo. Escolha o backup “.obz” exportado pelo Fala Junto (ou uma prancha “.obf”).", 5000);
    }
  });
  const freshIdMap = () => { const m = {}; return (old) => (m[old] ||= set.boards[old] || old === "" ? uid("p") : old); };
  async function importObf(f) {
    const obf = JSON.parse(await f.text());
    const idMap = freshIdMap();
    const b = obfToBoard(obf, (im) => im.data || im.url || null, idMap);
    b.buttons.forEach((bt) => { if (bt.loadBoard && !set.boards[bt.loadBoard]) { delete bt.loadBoard; bt.cat = "subst"; } delete bt._loadPath; });
    set.boards[b.id] = b; save();
    $("#dlgSettings").close(); stack = [set.root, b.id]; render();
    toast(`Prancha “${b.name}” importada. Para ligá-la ao início, crie um quadro do tipo pasta.`, 4200);
  }
  async function importObz(f) {
    if (!window.JSZip) throw new Error("sem JSZip");
    const zip = await window.JSZip.loadAsync(f);
    const man = JSON.parse(await zip.file("manifest.json").async("string"));
    const replace = await confirmBox("Importar backup", "Substituir todas as pranchas atuais por este arquivo? Escolha Cancelar para adicionar as pranchas sem apagar as atuais.", "Substituir");
    const boardPaths = Object.values(man.paths?.boards || {});
    if (!boardPaths.length) { zip.forEach((p) => { if (/\.obf$/i.test(p)) boardPaths.push(p); }); }
    const imgCache = {};
    async function loadImg(path) {
      if (imgCache[path] !== undefined) return imgCache[path];
      const zf = zip.file(path); if (!zf) return (imgCache[path] = null);
      const b64 = await zf.async("base64");
      const ext = path.split(".").pop().toLowerCase();
      const ct = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
      return (imgCache[path] = `data:${ct};base64,${b64}`);
    }
    const target = replace ? {} : set.boards;
    const idMap = (() => { const m = {}; return (old) => (m[old] ||= !replace && set.boards[old] ? uid("p") : old); })();
    const pathToId = {};
    const imported = [];
    for (const p of boardPaths) {
      const zf = zip.file(p); if (!zf) continue;
      const obf = JSON.parse(await zf.async("string"));
      const needed = {};
      for (const im of obf.images || []) if (im.path) needed[im.id] = await loadImg(im.path);
      const b = obfToBoard(obf, (im) => needed[im.id] || im.data || im.url || null, idMap);
      pathToId[p] = b.id; imported.push(b);
    }
    imported.forEach((b) => b.buttons.forEach((bt) => {
      if (!bt.loadBoard && bt._loadPath && pathToId[bt._loadPath]) bt.loadBoard = pathToId[bt._loadPath];
      delete bt._loadPath;
    }));
    const ids = new Set(imported.map((b) => b.id).concat(Object.keys(target)));
    imported.forEach((b) => { b.buttons.forEach((bt) => { if (bt.loadBoard && !ids.has(bt.loadBoard)) { delete bt.loadBoard; bt.cat = "subst"; } }); target[b.id] = b; });
    const rootId = pathToId[man.root] || imported[0]?.id;
    if (replace) { set = { version: 2, root: rootId, boards: target }; stack = [rootId]; }
    else { stack = [set.root, rootId]; }
    save(); $("#dlgSettings").close(); render();
    toast(`${imported.length} pranchas importadas.`);
  }

  /* ---------- Varredura ---------- */
  const scan = (() => {
    let groups = [], level = "rows", gi = -1, ii = -1, timer = null, paused = false, loops = 0, holdBadge = null;
    const badge = $("#scanbadge");
    const on = () => settings && settings.scan.enabled && !editing;
    function clear() { $$(".scan-row, .scan-item").forEach((e) => e.classList.remove("scan-row", "scan-item")); }
    function build() {
      groups = [];
      const tools = ["#btnSpeak", "#btnBack", "#btnClear", "#btnHome", "#btnUp"].map((s) => $(s)).filter((e) => !e.disabled);
      groups.push({ wrap: null, items: tools });
      const sideItems = settings.showSide ? $$("#side button") : [];
      if (sideItems.length) groups.push({ wrap: null, items: sideItems });
      const b = board();
      for (let r = 0; r < b.rows; r++) {
        const items = $$(`.cell[data-r="${r}"]`, grid).filter((e) => e.dataset.id);
        if (items.length) groups.push({ wrap: items, items });
      }
    }
    function paint() {
      clear();
      if (level === "rows") { const g = groups[gi]; if (g) g.items.forEach((e) => e.classList.add("scan-row")); }
      else { const e = groups[gi]?.items[ii]; if (e) { e.classList.add("scan-item"); if (settings.scan.audio) speak(e.getAttribute("aria-label") || e.textContent.trim(), { rate: 1.25, volume: 0.6 }); } }
    }
    function step() {
      if (!groups.length) return;
      if (level === "rows") { gi = (gi + 1) % groups.length; if (gi === 0) loops++; }
      else {
        ii++;
        if (ii >= groups[gi].items.length) { ii = 0; loops++; if (loops >= 2) { level = "rows"; gi = 0; loops = 0; } }
      }
      paint();
    }
    function tick() { clearTimeout(timer); if (!on() || paused || settings.scan.mode !== "auto") return; timer = setTimeout(() => { step(); tick(); }, settings.scan.interval); }
    function start() { level = "rows"; gi = -1; ii = -1; loops = 0; build(); badge.hidden = !on(); badge.textContent = settings.scan.mode === "auto" ? "Varredura ligada" : "Varredura: Espaço avança, Enter seleciona"; if (on()) { if (settings.scan.mode === "auto") { step(); tick(); } else { step(); } } else clear(); }
    function select() {
      if (!on() || paused) return;
      if (gi < 0) { step(); return; }
      if (level === "rows") {
        const g = groups[gi];
        if (g.items.length === 1) { fire(g.items[0]); return; }
        level = "items"; ii = 0; loops = 0; paint(); tick();
      } else { fire(groups[gi].items[ii]); }
    }
    function fire(el) {
      clear();
      const id = el.dataset.id;
      if (el.dataset.side) { goSide(el.dataset.side); return; }
      if (id) activate(btnById(board(), id), true);
      else ({ btnSpeak: doSpeak, btnBack: doBackspace, btnClear: doClear, btnHome: goHome, btnUp: goUp })[el.id]?.();
      // render() já reinicia quando muda de prancha; senão volta para as linhas
      if (el.isConnected) start();
    }
    document.addEventListener("keydown", (e) => {
      if (!on() || paused || $$("dialog[open]").length) return;
      if (settings.scan.mode === "step") {
        if (e.code === "Space" || e.key === "ArrowRight" || e.key === "Tab") { e.preventDefault(); step(); return; }
        if (e.key === "Enter" || e.key === "NumpadEnter") { e.preventDefault(); select(); return; }
      } else if (e.code === "Space" || e.key === "Enter" || e.key === "NumpadEnter") { e.preventDefault(); select(); }
    });
    document.addEventListener("pointerdown", (e) => {
      if (!on() || paused || !settings.scan.touch || $$("dialog[open]").length) return;
      if (e.target.closest("[data-noswitch], dialog")) return;
      e.preventDefault(); e.stopPropagation(); select();
    }, true);
    document.addEventListener("click", (e) => { if (on() && !paused && settings.scan.touch && !e.target.closest("[data-noswitch], dialog")) { e.preventDefault(); e.stopPropagation(); } }, true);
    return {
      rebuild() { clearTimeout(timer); start(); },
      active: () => on() && !paused,
      pause() { paused = true; clearTimeout(timer); clear(); },
      resume() { if (paused) { paused = false; start(); } },
    };
  })();

  /* ---------- Teclado fora da varredura ---------- */
  document.addEventListener("keydown", (e) => {
    if (scan.active() || $$("dialog[open]").length || editing) return;
    if (e.key === "Backspace") { e.preventDefault(); doBackspace(); }
  });

  /* ---------- Convite para instalar ---------- */
  const install = (() => {
    let deferred = null;
    const ua = navigator.userAgent;
    const isIPad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isIOS = isIPad || /iPhone|iPod/.test(ua);
    const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const canInstallHere = () => !!document.querySelector('link[rel="manifest"]') && !standalone();
    const box = $("#install");
    const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    function show(force) {
      if (!canInstallHere()) { if (force) toast(standalone() ? "O app já está instalado neste aparelho." : "Abra o endereço do app no navegador para instalar."); return; }
      if (!force) { const until = +lsGet("fj:installLater") || 0; if (Date.now() < until) return; }
      if (isIOS) {
        $("#instSteps").hidden = false; $("#instOk").hidden = false; $("#instGo").hidden = true;
        $("#instSub").textContent = "Assim ele ganha um ícone na tela inicial, abre em tela cheia e funciona sem internet.";
        $("#instWhere").textContent = isIPad ? "no canto de cima, à direita, do Safari" : "na barra de baixo do Safari";
        box.classList.toggle("top", isIPad);
        const ar = $("#instArrow"); ar.hidden = false; ar.className = "arrow " + (isIPad ? "up" : "down"); ar.textContent = isIPad ? "⬆" : "⬇";
      } else if (deferred) {
        $("#instSteps").hidden = true; $("#instOk").hidden = true; $("#instGo").hidden = false; $("#instArrow").hidden = true;
      } else if (force) {
        toast("No Chrome ou Edge: menu ⋮ → Instalar app. No Safari: Compartilhar → Adicionar à Tela de Início.", 5000); return;
      } else return;
      box.hidden = false;
    }
    function hide(later) { box.hidden = true; if (later) lsSet("fj:installLater", String(Date.now() + 3 * 864e5)); }
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; show(false); });
    window.addEventListener("appinstalled", () => { hide(false); toast("Fala Junto instalado! Abra pelo ícone na tela inicial."); });
    $("#instLater").onclick = () => hide(true);
    $("#instOk").onclick = () => hide(true);
    $("#instGo").onclick = async () => { if (!deferred) return; deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; hide(!r || r.outcome !== "accepted"); };
    return { show, boot() { if (isIOS) setTimeout(() => show(false), 1200); } };
  })();
  $("#stInstall").onclick = () => { $("#dlgSettings").close(); install.show(true); };

  /* ---------- Início ---------- */
  async function boot() {
    try { set = await store.get("set"); } catch (e) {}
    try { settings = await store.get("settings"); } catch (e) {}
    try { usage = (await store.get("usage")) || usage; } catch (e) {}
    if (!set || !set.boards || !set.boards[set.root]) set = fromDefault();
    // versão 2: pranchas com o dobro de linhas (as novas ficam vazias para personalizar)
    if ((set.version || 1) < 2) {
      Object.values(set.boards).forEach((b) => { const add = Math.min(b.rows, 20 - b.rows); for (let i = 0; i < add; i++) b.grid.push(Array(b.cols).fill(null)); b.rows += add; });
      set.version = 2; store.set("set", set);
    }
    settings = Object.assign(clone(DEFAULT_SETTINGS), settings || {});
    settings.scan = Object.assign(clone(DEFAULT_SETTINGS.scan), settings.scan || {});
    settings.ft = Object.assign(clone(DEFAULT_SETTINGS.ft), settings.ft || {});
    stack = [set.root];
    applyLook(); loadVoices(); render(); renderStrip();
    install.boot();
    window.addEventListener("resize", () => { clearTimeout(boot.rt); boot.rt = setTimeout(() => { applyLook(); render(); }, 150); });
    // manter a tela acesa quando possível
    const wake = async () => { try { if (document.visibilityState === "visible" && navigator.wakeLock) await navigator.wakeLock.request("screen"); } catch (e) {} };
    wake(); document.addEventListener("visibilitychange", wake);
    // pede ao navegador para não apagar os dados (importante no iPhone/iPad)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    // iOS: a voz só "acorda" depois do primeiro toque; um toque silencioso destrava
    const unlock = () => { try { if (synth) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); } } catch (e) {} document.removeEventListener("touchend", unlock); };
    document.addEventListener("touchend", unlock, { once: true });
    // offline (PWA)
    if ("serviceWorker" in navigator && /^https:|^http:\/\/localhost/.test(location.href) && document.querySelector('link[rel="manifest"]')) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
  window.addEventListener("beforeunload", () => { store.set("set", set); store.set("settings", settings); });
  boot();
})();
