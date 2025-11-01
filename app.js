/* AWAX v2.3 – Stabil + Analitik (takılma azaltma, POS fix, detay analiz, MoM %) */
(function () {
  "use strict";

  // ---------- Sabitler & Yardımcılar ----------
  const DB_KEY = "awax_data_v2";
  const DB_BAK = "awax_data_v2_bak";
  const SNAP_KEY = "awax_snapshots_v1";
  const VALE_KEY = "vale_daily_v2";
  const SABLON_KEY = "sabit_sablon_v1";
  const CFG_KEY = "awax_cfg_v1";

  const SUBELER = [
    "SANKOPARK YIKAMA",
    "SANKOPARK VALE",
    "HASTANE VALE",
    "ASCE YIKAMA",
    "ASCE VALE",
  ];
  const COLORS = {
    "SANKOPARK YIKAMA": "#60a5fa",
    "SANKOPARK VALE": "#34d399",
    "HASTANE VALE": "#fbbf24",
    "ASCE YIKAMA": "#a78bfa",
    "ASCE VALE": "#f472b6",
  };

  const nfTRY = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  });
  const fmtTRY = (v) => nfTRY.format(+v || 0);

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const once = (el, ev, cb) => el.addEventListener(ev, cb, { once: true });

  const todayYMD = () => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  };
  const thisYM = () => todayYMD().slice(0, 7);
  const monthsBack = (n) => {
    const a = [];
    const d = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
      a.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`);
    }
    return a;
  };
  const parseAmount = (txt) => {
    let s = String(txt ?? "")
      .trim()
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(/,/g, ".");
    const n = +s;
    return Number.isFinite(n) ? n : 0;
  };
  const load = (k, f) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : f;
    } catch {
      return f;
    }
  };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const cfg = () => load(CFG_KEY, { pos: 2.4 });
  const cfgSave = (c) => save(CFG_KEY, c);

  // ---------- DB & Snapshot ----------
  let DB = load(DB_KEY, { records: [] });
  let DIRTY = false;

  function commit() {
    try {
      save(DB_KEY, DB);
    } catch {}
    try {
      save(DB_BAK, DB);
    } catch {}
    DIRTY = false;
  }
  function snapshot() {
    try {
      const s = load(SNAP_KEY, []);
      s.push({ ts: Date.now(), db: DB });
      while (s.length > 10) s.shift();
      save(SNAP_KEY, s);
    } catch {}
  }
  (function restoreIfNeeded() {
    if (!localStorage.getItem(DB_KEY)) {
      const bak = load(DB_BAK, null);
      const snaps = load(SNAP_KEY, []);
      if (bak) {
        DB = bak;
        commit();
      } else if (snaps.length) {
        DB = snaps[snaps.length - 1].db;
        commit();
      }
    } else {
      try {
        JSON.parse(localStorage.getItem(DB_KEY));
      } catch {
        const bak = load(DB_BAK, null);
        if (bak) {
          DB = bak;
          commit();
        }
      }
    }
  })();
  setInterval(() => {
    if (DIRTY) {
      commit();
      snapshot();
    }
  }, 60_000);
  window.addEventListener("beforeunload", () => {
    if (DIRTY) {
      commit();
      snapshot();
    }
  });

  // ---------- UI doldurma ----------
  function fillCombos() {
    ["#inp-sube", "#vale-sube", "#sabit-sube"].forEach((sel) => {
      const el = $(sel);
      el.innerHTML = SUBELER.map((s) => `<option>${s}</option>`).join("");
    });
    $("#sube-tabs").innerHTML = SUBELER.map(
      (s) => `<button class="sube-btn" data-sube="${s}">${s}</button>`
    ).join("");
    $$("#sube-tabs .sube-btn").forEach((b) =>
      b.addEventListener("click", () => {
        $$("#sube-tabs .sube-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        openTab("tab-sube-ozel");
        renderBranchDashboard(b.dataset.sube);
      })
    );
  }

  // ---------- Sekmeler ----------
  function openTab(id) {
    ["tab-hizli", "tab-ozet", "tab-sube", "tab-sabit", "tab-ayar", "tab-sube-ozel"].forEach(
      (x) => $("#" + x).classList.add("hide")
    );
    $("#" + id).classList.remove("hide");
    $$(".tabbtn").forEach((x) => x.classList.remove("active"));
    if (id === "tab-hizli") $("#nav-hizli").classList.add("active");
    if (id === "tab-ozet") $("#nav-ozet").classList.add("active");
    if (id === "tab-sube") $("#nav-sube").classList.add("active");
    if (id === "tab-sabit") $("#nav-sabit").classList.add("active");
    if (id === "tab-ayar") $("#nav-ayar").classList.add("active");
  }
  function bindTabs() {
    $("#nav-hizli").onclick = () => openTab("tab-hizli");
    $("#nav-ozet").onclick = () => {
      openTab("tab-ozet");
      scheduleRender(renderKPIs);
      scheduleRender(renderSummary);
      scheduleRender(renderAllTrend);
    };
    $("#nav-sube").onclick = () => {
      openTab("tab-sube");
      scheduleRender(renderBranchDetail);
    };
    $("#nav-sabit").onclick = () => {
      openTab("tab-sabit");
      renderSablon();
    };
    $("#nav-ayar").onclick = () => {
      openTab("tab-ayar");
      $("#pos-orani").value = cfg().pos;
    };
    $("#pos-orani").addEventListener("change", () => {
      const c = cfg();
      c.pos = +$("#pos-orani").value || 0;
      cfgSave(c);
    });
  }

  // ---------- Hızlı Giriş ----------
  let editingId = null;
  function readForm() {
    return {
      id: editingId ?? Date.now(),
      tarih: $("#inp-tarih").value || todayYMD(),
      sube: $("#inp-sube").value,
      tur: $("#inp-tur").value,
      odeme: $("#inp-odeme").value,
      kalem: ($("#inp-kalem").value || "").trim(),
      tutar: parseAmount($("#inp-tutar").value),
      not: ($("#inp-not").value || "").trim(),
    };
  }
  function fillForm(r) {
    $("#inp-tarih").value = r.tarih;
    $("#inp-sube").value = r.sube;
    $("#inp-tur").value = r.tur;
    $("#inp-odeme").value = r.odeme;
    $("#inp-kalem").value = r.kalem;
    $("#inp-tutar").value = String(r.tutar).replace(".", ",");
    $("#inp-not").value = r.not || "";
    editingId = r.id;
    $("#inp-tutar").focus();
  }
  function clearForm() {
    $("#inp-kalem").value = "";
    $("#inp-tutar").value = "";
    $("#inp-not").value = "";
    editingId = null;
  }

  // POS yardımcıları
  const isCard = (odeme) => /kart/i.test(odeme || "");
  function removeLinkedPosFee(ofId) {
    const i = DB.records.findIndex((r) => r.posOf === ofId);
    if (i >= 0) DB.records.splice(i, 1);
  }
  function ensurePosFeeFor(rec) {
    const posPercent = cfg().pos || 0;
    removeLinkedPosFee(rec.id);
    if (rec.tur === "Gelir" && isCard(rec.odeme) && posPercent > 0) {
      const kesinti = +(rec.tutar * posPercent / 100).toFixed(2);
      if (kesinti > 0) {
        DB.records.push({
          id: Date.now() + Math.random(),
          posOf: rec.id,
          tarih: rec.tarih,
          sube: rec.sube,
          tur: "Gider",
          odeme: "POS",
          kalem: "POS Kesintisi",
          tutar: kesinti,
          not: `Kart/POS ${posPercent}%`,
        });
      }
    }
  }

  function upsertRecord() {
    const rec = readForm();
    if (!rec.tutar || rec.tutar <= 0) {
      alert("Geçerli bir tutar girin.");
      $("#inp-tutar").focus();
      return;
    }
    if (editingId) {
      const i = DB.records.findIndex((x) => x.id === editingId);
      if (i >= 0) DB.records[i] = rec;
    } else {
      DB.records.push(rec);
    }
    ensurePosFeeFor(rec);

    DIRTY = true;
    commit();
    scheduleRender(renderTable);
    scheduleRender(renderKPIs);
    scheduleRender(renderSummary);
    scheduleRender(renderAllTrend);
    scheduleRender(renderBranchDetail);
    clearForm();
  }
  function deleteRecordById(id) {
    removeLinkedPosFee(id);
    const i = DB.records.findIndex((x) => x.id === id);
    if (i >= 0) DB.records.splice(i, 1);
    DIRTY = true;
    commit();
    scheduleRender(renderTable);
    scheduleRender(renderKPIs);
    scheduleRender(renderSummary);
    scheduleRender(renderAllTrend);
    scheduleRender(renderBranchDetail);
  }

  // Tablo (event delegation ile)
  function renderTable() {
    const q = ($("#inp-filter").value || "").toLocaleLowerCase("tr");
    const rows = DB.records
      .slice(-50)
      .reverse()
      .filter((r) =>
        q
          ? (r.kalem + " " + (r.not || "")).toLocaleLowerCase("tr").includes(q)
          : true
      )
      .map(
        (r) => `<tr data-id="${r.id}">
        <td>${r.tarih}</td>
        <td>${r.sube}</td>
        <td>${r.tur}</td>
        <td>${r.odeme}</td>
        <td>${r.kalem}</td>
        <td>${r.not || ""}</td>
        <td class="right">${fmtTRY(r.tutar)}</td>
        <td class="nowrap"><button class="btn edit">Düzenle</button> <button class="btn danger del">Sil</button></td>
      </tr>`
      )
      .join("");
    $("#tbl-rows").innerHTML = rows || `<tr><td colspan="8">Kayıt yok</td></tr>`;
  }
  // tek dinleyici
  $("#tbl-rows")?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const id = +tr.dataset.id;
    if (e.target.classList.contains("edit")) {
      const rec = DB.records.find((x) => x.id === id);
      if (rec) fillForm(rec);
    } else if (e.target.classList.contains("del")) {
      if (confirm("Silinsin mi?")) deleteRecordById(id);
    }
  });

  function bindForm() {
    $("#inp-tarih").value = todayYMD();
    $("#btn-save").onclick = upsertRecord;
    $("#btn-cash").onclick = () => {
      $("#inp-odeme").value = "Nakit";
      upsertRecord();
    };
    $("#btn-card").onclick = () => {
      $("#inp-odeme").value = "Kredi Kartı";
      upsertRecord();
    };
    $("#btn-clear").onclick = clearForm;
    $("#inp-filter").oninput = debounce(() => scheduleRender(renderTable), 200);
  }

  // ---------- VALE/YIKAMA adetleri (depoda tutuyoruz; grafik bir sonraki adımda) ----------
  const vKey = (sube, ymd) => `${sube}__${ymd}`.toUpperCase();
  const vGet = (sube, ymd) => {
    const map = load(VALE_KEY, {});
    const val = map[vKey(sube, ymd)];
    return val ? { ...val } : { nakit: 0, kart: 0, kupon: 0, bedelsiz: 0 };
    };
  const vSet = (sube, ymd, obj) => {
    const map = load(VALE_KEY, {});
    map[vKey(sube, ymd)] = {
      nakit: +obj.nakit || 0,
      kart: +obj.kart || 0,
      kupon: +obj.kupon || 0,
      bedelsiz: +obj.bedelsiz || 0,
    };
    save(VALE_KEY, map);
  };
  function bindVale() {
    $("#vale-tarih").value = todayYMD();
    const sync = () => {
      const o = vGet($("#vale-sube").value, $("#vale-tarih").value);
      $("#vd-nakit").value = o.nakit;
      $("#vd-kart").value = o.kart;
      $("#vd-kupon").value = o.kupon;
      $("#vd-bedelsiz").value = o.bedelsiz;
      $("#vale-info").textContent = `Toplam: ${
        o.nakit + o.kart + o.kupon + o.bedelsiz
      }`;
    };
    ["vale-sube", "vale-tarih"].forEach((id) =>
      $("#" + id).addEventListener("change", sync)
    );
    ["vd-nakit", "vd-kart", "vd-kupon", "vd-bedelsiz"].forEach((id) =>
      $("#" + id).addEventListener("input", () => {
        $("#vale-info").textContent = `Toplam: ${
          (+$("#vd-nakit").value || 0) +
          (+$("#vd-kart").value || 0) +
          (+$("#vd-kupon").value || 0) +
          (+$("#vd-bedelsiz").value || 0)
        }`;
      })
    );
    $("#vale-save").onclick = () => {
      vSet($("#vale-sube").value, $("#vale-tarih").value, {
        nakit: $("#vd-nakit").value,
        kart: $("#vd-kart").value,
        kupon: $("#vd-kupon").value,
        bedelsiz: $("#vd-bedelsiz").value,
      });
      alert("Adetler kaydedildi.");
    };
    sync();
  }

  // ---------- Analitik Hesaplar (cache’li) ----------
  const cache = {
    byYM: null, // { [ym]: { [sube]: {gelir,gider, kalemGider: {kalem:toplam}} } }
    builtForSize: 0,
  };
  function rebuildAgg() {
    // değişiklik sadece yeni kayıt sayısıyla anlaşılır (hafif kontrol)
    if (cache.builtForSize === DB.records.length && cache.byYM) return;
    const byYM = {};
    for (const r of DB.records) {
      const ym = (r.tarih || "").slice(0, 7);
      if (!ym) continue;
      byYM[ym] ??= {};
      const S = (byYM[ym][r.sube] ??= { gelir: 0, gider: 0, kalemGider: {} });
      if (r.tur === "Gelir") S.gelir += r.tutar;
      else {
        S.gider += r.tutar;
        // gider kalem dağılımı
        const k = r.kalem || "Diğer";
        S.kalemGider[k] = (S.kalemGider[k] || 0) + r.tutar;
      }
    }
    cache.byYM = byYM;
    cache.builtForSize = DB.records.length;
  }

  // ---------- Özet & Grafikler ----------
  function renderKPIs() {
    const sum = (p) => DB.records.filter(p).reduce((a, b) => a + (b.tutar || 0), 0);
    const gelir = sum((r) => r.tur === "Gelir");
    const gider = sum((r) => r.tur === "Gider");
    const net = gelir - gider;
    $("#kpi-box").innerHTML = `
      <div class="card">Gelir<br><b>${fmtTRY(gelir)}</b></div>
      <div class="card">Gider<br><b>${fmtTRY(gider)}</b></div>
      <div class="card">Net<br><b style="color:${net >= 0 ? "#16a34a" : "#f43f5e"}">${fmtTRY(net)}</b></div>`;
  }

  // Genel Özet – MoM %
  function renderSummary() {
    rebuildAgg();
    const ymList = monthsBack(2); // son 2 ay (geçen ay kıyası)
    const [prevYM, curYM] =
      ymList.length === 2 ? [ymList[0], ymList[1]] : [ymList[0], ymList[0]];
    const rows = SUBELER.map((s) => {
      const cur = cache.byYM?.[curYM]?.[s] || { gelir: 0, gider: 0 };
      const prev = cache.byYM?.[prevYM]?.[s] || { gelir: 0, gider: 0 };
      const netCur = cur.gelir - cur.gider;
      const netPrev = prev.gelir - prev.gider;
      const delta = netPrev === 0 ? (netCur === 0 ? 0 : 100) : ((netCur - netPrev) / Math.abs(netPrev)) * 100;
      const color = delta >= 0 ? "#16a34a" : "#f43f5e";
      const arrow = delta >= 0 ? "↑" : "↓";
      return `<tr>
        <td>${s}</td>
        <td class="right">${fmtTRY(cur.gelir)}</td>
        <td class="right">${fmtTRY(cur.gider)}</td>
        <td class="right"><b>${fmtTRY(netCur)}</b></td>
        <td class="right" style="color:${color}"><b>${arrow} ${delta.toFixed(1)}%</b></td>
      </tr>`;
    }).join("");
    $("#ozet-box").innerHTML = `
      <table>
        <thead>
          <tr><th>Şube</th><th class="right">Gelir (${curYM})</th><th class="right">Gider (${curYM})</th><th class="right">Net (${curYM})</th><th class="right">% Değ. (Net)</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // Tüm şubeler Net trend (6 ay)
  function renderAllTrend() {
    rebuildAgg();
    const ymList = monthsBack(6);
    const W = 900,
      H = 180,
      P = 20,
      step = (W - 2 * P) / (ymList.length - 1);
    const nets = SUBELER.map((s) =>
      ymList.map((ym) => {
        const x = cache.byYM?.[ym]?.[s];
        return x ? x.gelir - x.gider : 0;
      })
    );
    const flat = nets.flat();
    const max = Math.max(1, ...flat.map((x) => Math.abs(x)));
    const y = (v) => H / 2 - (v / max) * (H / 2 - P / 2);
    const lines = SUBELER.map(
      (s, i) =>
        `<polyline fill="none" stroke="${COLORS[s]}" stroke-width="2" points="${nets[i]
          .map((v, j) => `${P + j * step},${y(v)}`)
          .join(" ")}"></polyline>`
    ).join("");
    const zeroY = y(0);
    $("#legend").innerHTML = SUBELER.map(
      (s) => `<span class="lg"><span class="dot" style="background:${COLORS[s]}"></span>${s}</span>`
    ).join("");
    $("#chart-all").innerHTML = `<svg viewBox="0 0 ${W} ${H}">
      <line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="#334155" stroke-dasharray="4 4"/>
      ${lines}
      ${ymList
        .map(
          (m, i) =>
            `<text x="${P + i * step}" y="${H - 5}" fill="#9ca3af" font-size="10" text-anchor="middle">${m}</text>`
        )
        .join("")}
    </svg>`;
  }

  // Şube Detayı (gider kalem payları + satır)
  function renderBranchDetail() {
    rebuildAgg();
    // Satır tablosu (Ay/Şube)
    const rows = [];
    const byYM = cache.byYM || {};
    Object.keys(byYM)
      .sort()
      .forEach((ym) => {
        SUBELER.forEach((s) => {
          const v = byYM[ym]?.[s];
          if (!v) return;
          const net = v.gelir - v.gider;
          rows.push(
            `<tr><td>${s}</td><td>${ym}</td><td class="right">${fmtTRY(
              v.gelir
            )}</td><td class="right">${fmtTRY(
              v.gider
            )}</td><td class="right" style="color:${
              net >= 0 ? "#16a34a" : "#f43f5e"
            }"><b>${fmtTRY(net)}</b></td></tr>`
          );
        });
      });
    $("#sube-box").innerHTML = `
      <table>
        <thead><tr><th>Şube</th><th>Ay</th><th class="right">Gelir</th><th class="right">Gider</th><th class="right">Net</th></tr></thead>
        <tbody>${rows.join("") || `<tr><td colspan="5">Veri yok</td></tr>`}</tbody>
      </table>`;

    // Gider kalem payları (seçili şube/ay – UI’de seçiciler yoksa son ayı göster)
    const ymSel = thisYM();
    const sSel = $("#inp-sube").value || SUBELER[0];
    const v = byYM[ymSel]?.[sSel];
    if (!v) {
      $("#sube-pie").innerHTML = `<div class="muted">(${sSel} / ${ymSel}) için gider verisi yok.</div>`;
      return;
    }
    const total = v.gider || 1;
    const entries = Object.entries(v.kalemGider).sort((a, b) => b[1] - a[1]);
    const rows2 = entries
      .map(
        ([k, t]) =>
          `<tr><td>${k}</td><td class="right">${fmtTRY(
            t
          )}</td><td class="right">${((t / total) * 100).toFixed(1)}%</td></tr>`
      )
      .join("");
    $("#sube-pie").innerHTML = `
      <div class="card" style="margin-bottom:8px">Gider Dağılımı – <b>${sSel}</b> (${ymSel})</div>
      <table>
        <thead><tr><th>Kalem</th><th class="right">Tutar</th><th class="right">% Pay</th></tr></thead>
        <tbody>${rows2 || `<tr><td colspan="3">Gider yok</td></tr>`}</tbody>
      </table>`;
  }

  // ---------- Sabit Masraf ----------
  const readSablon = () => load(SABLON_KEY, {});
  const writeSablon = (o) => save(SABLON_KEY, o);

  function renderSablon() {
    const sube = $("#sabit-sube").value;
    const sab = readSablon()[sube] || [];
    $("#sablon-rows").innerHTML =
      sab
        .map(
          (it, i) => `
      <tr data-i="${i}">
        <td><input class="s-kalem" type="text" value="${it.kalem || ""}"/></td>
        <td class="right"><input class="s-vars" type="text" value="${it.varsayilan || "0"}" style="text-align:right"/></td>
        <td class="right"><input class="s-buay" type="text" value="${it.buAy ?? it.varsayilan ?? "0"}" style="text-align:right"/></td>
        <td><input class="s-akt" type="checkbox" ${it.aktif ? "checked" : ""}/></td>
        <td><button class="btn danger btn-del" data-i="${i}">Sil</button></td>
      </tr>`
        )
        .join("") || `<tr><td colspan="5">Şablon boş</td></tr>`;

    // inline kaydetme (blur ile)
    $("#sablon-rows")
      .querySelectorAll("tr")
      .forEach((tr) => {
        const i = +tr.dataset.i;
        tr.querySelectorAll("input").forEach((inp) =>
          inp.addEventListener("blur", () => {
            const all = readSablon();
            const arr = all[sube] || [];
            const row = arr[i] || {
              kalem: "",
              varsayilan: "0",
              buAy: "0",
              aktif: true,
            };
            row.kalem = tr.querySelector(".s-kalem").value.trim();
            row.varsayilan = tr.querySelector(".s-vars").value.trim();
            row.buAy = tr.querySelector(".s-buay").value.trim();
            row.aktif = tr.querySelector(".s-akt").checked;
            arr[i] = row;
            all[sube] = arr;
            writeSablon(all);
          })
        );
      });

    // sil
    $$("#sablon-rows .btn-del").forEach(
      (b) =>
        (b.onclick = () => {
          const idx = +b.dataset.i;
          const all = readSablon();
          const arr = all[sube] || [];
          arr.splice(idx, 1);
          all[sube] = arr;
          writeSablon(all);
          renderSablon();
        })
    );
  }

  function bindSablon() {
    $("#sabit-ay").value = thisYM();
    $("#sabit-sube").onchange = renderSablon;
    $("#sablon-ekle").onclick = () => {
      const sube = $("#sabit-sube").value;
      const all = readSablon();
      const arr = all[sube] || [];
      arr.push({ kalem: "Yeni Kalem", varsayilan: "0", buAy: "0", aktif: true });
      all[sube] = arr;
      writeSablon(all);
      renderSablon();
    };
    $("#sablon-kaydet").onclick = () => {
      const sube = $("#sabit-sube").value;
      const rows = [...$("#sablon-rows").querySelectorAll("tr")];
      const arr = rows.map((tr) => ({
        kalem: tr.querySelector(".s-kalem").value.trim(),
        varsayilan: tr.querySelector(".s-vars").value.trim(),
        buAy: tr.querySelector(".s-buay").value.trim(),
        aktif: tr.querySelector(".s-akt").checked,
      }));
      const all = readSablon();
      all[sube] = arr;
      writeSablon(all);
      alert("Şablon kaydedildi.");
    };
    $("#sabit-uygula").onclick = () => {
      const sube = $("#sabit-sube").value;
      const ym = $("#sabit-ay").value || thisYM();
      const arr = (readSablon()[sube] || []).filter((x) => x.aktif);
      if (!arr.length) {
        alert("Aktif kalem yok.");
        return;
      }
      for (const it of arr) {
        const tutar = parseAmount(it.buAy ?? it.varsayilan);
        if (!tutar) continue;
        DB.records.push({
          id: Date.now() + Math.random(),
          tarih: ym + "-01",
          sube,
          tur: "Gider",
          odeme: "Havale/EFT",
          kalem: it.kalem + " (Sabit)",
          tutar,
          not: "Sabit masraf",
        });
      }
      DIRTY = true;
      commit();
      scheduleRender(renderTable);
      scheduleRender(renderKPIs);
      scheduleRender(renderSummary);
      scheduleRender(renderAllTrend);
      scheduleRender(renderBranchDetail);
      alert("Sabit masraflar eklendi.");
    };
  }

  // ---------- Çizim Planlayıcı (takılmayı azalt) ----------
  function scheduleRender(fn) {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => fn(), { timeout: 500 });
    } else {
      requestAnimationFrame(() => fn());
    }
  }

  // ---------- Init ----------
  function init() {
    fillCombos();
    bindTabs();
    bindForm();
    bindVale();
    bindSablon();

    $("#inp-tarih").value = todayYMD();
    $("#vale-tarih").value = todayYMD();

    scheduleRender(renderTable);
    scheduleRender(renderKPIs);
    scheduleRender(renderSummary);
    scheduleRender(renderAllTrend);
  }

  if (document.readyState !== "loading") init();
  else once(document, "DOMContentLoaded", init);
})();

