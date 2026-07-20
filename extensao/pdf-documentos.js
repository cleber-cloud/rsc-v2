/**
 * Gera Requerimento e Memorial em PDF (pdf-lib) a partir do estado —
 * evita PDFs em branco do html2canvas off-screen.
 */
(function (global) {
  "use strict";

  const CATS = ["I", "II", "III", "IV", "V", "VI"];

  function black() {
    return global.PDFLib.rgb(0.08, 0.08, 0.08);
  }
  function gray() {
    return global.PDFLib.rgb(0.35, 0.35, 0.35);
  }

  function makeWriter(pdf, fonts) {
    const { width, height } = global.RSCPdfFontes.A4;
    const margin = 48;
    const maxW = width - margin * 2;
    const { font, fontBold } = fonts;
    const wrap = global.RSCPdfFontes.wrapText;

    let page = pdf.addPage([width, height]);
    let y = height - margin;
    const pages = [page];

    function newPage() {
      page = pdf.addPage([width, height]);
      pages.push(page);
      y = height - margin;
    }

    function ensure(h) {
      if (y - h < margin) newPage();
    }

    function text(str, opts) {
      const size = opts.size || 11;
      const bold = !!opts.bold;
      const f = bold ? fontBold : font;
      const color = opts.color || black();
      const align = opts.align || "left";
      const lineH = opts.lineH || size + 4;
      const lines = wrap(String(str ?? ""), f, size, opts.maxW || maxW);
      for (const ln of lines) {
        ensure(lineH);
        let x = margin;
        if (align === "center") {
          x = (width - f.widthOfTextAtSize(ln, size)) / 2;
        } else if (align === "right") {
          x = width - margin - f.widthOfTextAtSize(ln, size);
        }
        page.drawText(ln, { x, y: y - size, size, font: f, color });
        y -= lineH;
      }
    }

    function gap(n) {
      y -= n || 10;
    }

    function line() {
      ensure(12);
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 0.6,
        color: global.PDFLib.rgb(0.7, 0.7, 0.7),
      });
      y -= 12;
    }

    function rawPage() {
      return page;
    }

    return { text, gap, line, ensure, newPage, margin, maxW, width, height, font, fontBold, wrap, getY: () => y, setY: (v) => (y = v), rawPage };
  }

  function nivelLabel(state) {
    const id = state.user && state.user.targetLevelId;
    const niveis = global.RSC_NIVEIS || [];
    const n = niveis.find((x) => x.id === id);
    if (n) return `${n.name} (${n.equivalence})`;
    return id || "—";
  }

  function totalPoints(state, meta) {
    let t = 0;
    for (const sel of state.selections || []) {
      if (!(Number(sel.quantity) > 0)) continue;
      const m = meta[sel.criterionId];
      t += (Number(sel.quantity) || 0) * ((m && m.pointsPerUnit) || 0);
    }
    return t;
  }

  function selectionsByCat(state, meta) {
    const by = {};
    for (const c of CATS) by[c] = [];
    for (const sel of state.selections || []) {
      if (!(Number(sel.quantity) > 0)) continue;
      const m = meta[sel.criterionId];
      const cat = (m && m.category) || String(sel.criterionId).split(".")[0];
      if (!by[cat]) continue;
      by[cat].push({ sel, m });
    }
    return by;
  }

  async function gerarRequerimentoPdf(state) {
    const { PDFDocument } = global.PDFLib;
    const pdf = await PDFDocument.create();
    const fonts = await global.RSCPdfFontes.embedNoto(pdf);
    const w = makeWriter(pdf, fonts);
    const meta = global.RSC_CRITERIOS_META || {};
    const catTitles = global.RSC_CATEGORIAS || {};
    const fmt = global.RSCPdfFontes.fmtPt;
    const u = state.user || {};

    w.text("REQUERIMENTO — RSC-PCCTAE", { size: 16, bold: true, align: "center" });
    w.gap(4);
    w.text("Reconhecimento de Saberes e Competências", {
      size: 11,
      align: "center",
      color: gray(),
    });
    w.gap(16);
    w.line();

    w.text("1. Dados do(a) servidor(a)", { size: 13, bold: true });
    w.gap(6);
    const dados = [
      ["Nome", u.name || "—"],
      ["SIAPE", u.siape || "—"],
      ["E-mail", u.email || "—"],
      ["Cargo", u.role || "—"],
      ["Unidade/Setor", u.unit || "—"],
      ["Nível de classificação", u.currentLevel || "—"],
      ["IQ atual", u.currentIq || "—"],
      ["Data de ingresso na IFE", u.dateOfEntry || "—"],
      ["Função/Encargo", u.roleFunction || "—"],
      ["Nível RSC pretendido", nivelLabel(state)],
    ];
    for (const [k, v] of dados) {
      w.text(`${k}: ${v}`, { size: 11 });
    }

    if (state.previousRsc && state.previousRsc.hasPrevious) {
      w.gap(8);
      w.text("Concessão anterior de RSC", { size: 12, bold: true });
      w.text(`Processo: ${state.previousRsc.processNumber || "—"}`, { size: 11 });
      w.text(`Saldo (pontos): ${state.previousRsc.balance || "—"}`, { size: 11 });
      w.text(
        `Data da última concessão: ${state.previousRsc.lastConcessionDate || "—"}`,
        { size: 11 }
      );
    }

    w.gap(12);
    w.line();
    w.text("2. Itens pontuados por requisito", { size: 13, bold: true });
    w.gap(8);

    const by = selectionsByCat(state, meta);
    let ordem = 0;
    let soma = 0;

    for (const cat of CATS) {
      const items = by[cat];
      if (!items.length) continue;
      w.gap(6);
      w.text(
        `REQUISITO ${cat} — ${(catTitles[cat] || "").toUpperCase()}`,
        { size: 11, bold: true }
      );
      w.gap(4);

      // cabeçalho simples
      for (const { sel, m } of items) {
        ordem++;
        const q = Number(sel.quantity) || 0;
        const ppu = (m && m.pointsPerUnit) || 0;
        const pts = q * ppu;
        soma += pts;
        const desc = (m && m.description) || sel.criterionId;
        w.text(`${ordem}. [${sel.criterionId}] ${desc}`, { size: 10 });
        w.text(
          `Unidade: ${(m && m.unit) || "—"}  |  Quantidade: ${q}  |  Pontos unit.: ${fmt(ppu)}  |  Subtotal: ${fmt(pts)}`,
          { size: 9, color: gray() }
        );
        w.gap(4);
      }
    }

    if (ordem === 0) {
      w.text("Nenhum item com quantidade informada.", { size: 11, color: gray() });
    }

    w.gap(10);
    w.line();
    const total = totalPoints(state, meta);
    w.text(`Pontuação total: ${fmt(total)} pontos`, { size: 13, bold: true });
    w.gap(16);
    w.text(
      `Documento gerado em ${new Date().toLocaleString("pt-BR")} pelo Assistente RSC-PCCTAE. A pontuação final será validada pela CRSC-PCCTAE.`,
      { size: 9, color: gray() }
    );

    const bytes = await pdf.save({ useObjectStreams: false });
    return new Uint8Array(bytes);
  }

  async function gerarMemorialPdf(state) {
    const { PDFDocument } = global.PDFLib;
    const pdf = await PDFDocument.create();
    const fonts = await global.RSCPdfFontes.embedNoto(pdf);
    const w = makeWriter(pdf, fonts);
    const meta = global.RSC_CRITERIOS_META || {};
    const catTitles = global.RSC_CATEGORIAS || {};
    const fmt = global.RSCPdfFontes.fmtPt;
    const u = state.user || {};

    w.text("MEMORIAL DESCRITIVO — RSC-PCCTAE", {
      size: 16,
      bold: true,
      align: "center",
    });
    w.gap(4);
    w.text("Reconhecimento de Saberes e Competências", {
      size: 11,
      align: "center",
      color: gray(),
    });
    w.gap(14);
    w.line();

    w.text("Identificação", { size: 13, bold: true });
    w.gap(4);
    w.text(`Nome: ${u.name || "—"}`, { size: 11 });
    w.text(`SIAPE: ${u.siape || "—"}`, { size: 11 });
    w.text(`Cargo: ${u.role || "—"}`, { size: 11 });
    w.text(`Unidade: ${u.unit || "—"}`, { size: 11 });
    w.text(`Nível pretendido: ${nivelLabel(state)}`, { size: 11 });
    w.text(`Pontuação total: ${fmt(totalPoints(state, meta))} pts`, {
      size: 11,
      bold: true,
    });

    w.gap(12);
    w.line();
    w.text("Trajetória / narrativa", { size: 13, bold: true });
    w.gap(6);
    const narr = (state.trajectoryNarrative || "").trim();
    if (narr) {
      w.text(narr, { size: 11, lineH: 15 });
    } else {
      w.text(
        "Não foi preenchida narrativa de trajetória no formulário. Os itens pontuados estão relacionados a seguir.",
        { size: 11, color: gray() }
      );
    }

    w.gap(12);
    w.line();
    w.text("Descrição dos itens e comprovantes", { size: 13, bold: true });
    w.gap(8);

    const by = selectionsByCat(state, meta);
    const docMap = new Map();
    (state.documents || []).forEach((d) => docMap.set(String(d.id), d));

    for (const cat of CATS) {
      const items = by[cat];
      if (!items.length) continue;
      w.gap(6);
      w.text(
        `REQUISITO ${cat} — ${(catTitles[cat] || "").toUpperCase()}`,
        { size: 11, bold: true }
      );
      w.gap(4);

      for (const { sel, m } of items) {
        const q = Number(sel.quantity) || 0;
        const ppu = (m && m.pointsPerUnit) || 0;
        w.text(`[${sel.criterionId}] ${(m && m.description) || ""}`, {
          size: 10,
          bold: true,
        });
        w.text(
          `Quantidade: ${q} × ${fmt(ppu)} = ${fmt(q * ppu)} pontos | Unidade: ${(m && m.unit) || "—"}`,
          { size: 9, color: gray() }
        );
        const ids = Array.isArray(sel.documentIds) ? sel.documentIds : [];
        if (ids.length) {
          w.text("Comprovantes:", { size: 10, bold: true });
          ids.forEach((id, i) => {
            const d = docMap.get(String(id));
            const titulo = (d && d.title && String(d.title).trim()) || (d && d.name) || "Anexo";
            w.text(`${i + 1}) ${titulo}`, { size: 10 });
          });
        } else {
          w.text("Comprovantes: não anexados.", { size: 9, color: gray() });
        }
        w.gap(6);
      }
    }

    w.gap(12);
    w.text(
      `Documento gerado em ${new Date().toLocaleString("pt-BR")} pelo Assistente RSC-PCCTAE.`,
      { size: 9, color: gray() }
    );

    const bytes = await pdf.save({ useObjectStreams: false });
    return new Uint8Array(bytes);
  }

  global.RSCPdfDocumentos = {
    gerarRequerimentoPdf,
    gerarMemorialPdf,
  };
})(typeof window !== "undefined" ? window : globalThis);
