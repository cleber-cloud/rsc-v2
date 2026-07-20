/**
 * =============================================================================
 * ANEXOS I–VI com capa (modelo COMPROVANTES / REQUISITO)
 * =============================================================================
 * Até 6 PDFs (um por categoria I…VI). Dentro do mesmo anexo, repete a capa
 * sempre que muda o critério. Paginação relativa ao arquivo do anexo.
 * =============================================================================
 */
(function (global) {
  "use strict";

  const CATS = ["I", "II", "III", "IV", "V", "VI"];

  function base64ToUint8Array(dataUrlOrB64) {
    if (!dataUrlOrB64) return null;
    let b64 = String(dataUrlOrB64);
    const comma = b64.indexOf(",");
    if (b64.startsWith("data:") && comma >= 0) b64 = b64.slice(comma + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function isPdfName(name, type) {
    const n = (name || "").toLowerCase();
    const t = (type || "").toLowerCase();
    return n.endsWith(".pdf") || t.includes("pdf");
  }

  function fmtPt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    return x.toLocaleString("pt-BR", {
      minimumFractionDigits: Number.isInteger(x) ? 0 : 1,
      maximumFractionDigits: 2,
    });
  }

  function itemNumeroFromId(criterionId) {
    const id = String(criterionId || "");
    const m = id.match(/^[IVX]+\.(\d+)/i);
    return m ? m[1] : id;
  }

  function wrapText(text, font, size, maxWidth) {
    const words = String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  async function contagemPaginasPdf(bytes) {
    const { PDFDocument } = global.PDFLib;
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return pdf.getPageCount();
  }

  async function loadFont(pdf) {
    const { StandardFonts } = global.PDFLib;
    try {
      const candidates = [
        "./next/static/media/cc27cf3ff100ea21-s.p.ttf",
        "next/static/media/cc27cf3ff100ea21-s.p.ttf",
      ];
      for (const url of candidates) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          const font = await pdf.embedFont(buf, { subset: true });
          return { font, fontBold: font, embedded: true };
        } catch (_) {}
      }
    } catch (_) {}
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    return { font, fontBold, embedded: false };
  }

  function safeText(s, embedded) {
    const t = String(s ?? "");
    if (embedded) return t;
    return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  async function adicionarCapas(outPdf, opts) {
    const { font, fontBold, embedded } = await loadFont(outPdf);
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 56;
    const maxW = pageWidth - margin * 2;
    const S = (t) => safeText(t, embedded);
    const black = global.PDFLib.rgb(0.05, 0.05, 0.05);

    let page = outPdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - 72;
    let coverPages = 1;

    function newPage() {
      page = outPdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - 72;
      coverPages++;
    }

    function ensureSpace(h) {
      if (y - h < 50) newPage();
    }

    function drawLines(lines, size, bold, lineH, align) {
      for (const ln of lines) {
        ensureSpace(lineH);
        const text = S(ln);
        const f = bold ? fontBold : font;
        let x = margin;
        if (align === "center") {
          const w = f.widthOfTextAtSize(text, size);
          x = (pageWidth - w) / 2;
        }
        page.drawText(text, { x, y, size, font: f, color: black });
        y -= lineH;
      }
    }

    drawLines([`ANEXO ${opts.category}`], 16, true, 22, "center");
    y -= 18;

    const reqTitle = `REQUISITO ${opts.category} - ${opts.categoryTitle || ""}`;
    drawLines(wrapText(reqTitle, fontBold, 11, maxW), 11, true, 15, "left");
    y -= 14;

    const itemHead = `Item ${opts.itemNum} - ${opts.itemDescription || ""}`;
    drawLines(wrapText(itemHead, font, 11, maxW), 11, false, 15, "left");
    y -= 18;

    const rowH = 22;
    ensureSpace(rowH * 3 + 20);
    const col1 = margin;
    const col2 = margin + maxW * 0.55;
    const tableTop = y;
    const tableW = maxW;

    page.drawRectangle({
      x: col1,
      y: tableTop - rowH * 3,
      width: tableW,
      height: rowH * 3,
      borderColor: black,
      borderWidth: 0.8,
    });
    page.drawLine({
      start: { x: col1, y: tableTop - rowH },
      end: { x: col1 + tableW, y: tableTop - rowH },
      thickness: 0.6,
      color: black,
    });
    page.drawLine({
      start: { x: col1, y: tableTop - rowH * 2 },
      end: { x: col1 + tableW, y: tableTop - rowH * 2 },
      thickness: 0.6,
      color: black,
    });
    page.drawLine({
      start: { x: col2, y: tableTop },
      end: { x: col2, y: tableTop - rowH * 3 },
      thickness: 0.6,
      color: black,
    });

    const cellPad = 6;
    page.drawText(S("UNIDADE DE MEDIDA"), {
      x: col1 + cellPad,
      y: tableTop - 15,
      size: 9,
      font: fontBold,
      color: black,
    });
    page.drawText(S("PONTOS"), {
      x: col2 + cellPad,
      y: tableTop - 15,
      size: 9,
      font: fontBold,
      color: black,
    });
    page.drawText(S(opts.unit || "-"), {
      x: col1 + cellPad,
      y: tableTop - rowH - 15,
      size: 10,
      font,
      color: black,
    });
    page.drawText(S(fmtPt(opts.pointsPerUnit)), {
      x: col2 + cellPad,
      y: tableTop - rowH - 15,
      size: 10,
      font,
      color: black,
    });
    const q = Number(opts.quantity) || 0;
    const total = q * (Number(opts.pointsPerUnit) || 0);
    page.drawText(S(`Total de ${String(q).padStart(2, "0")} unidade(s)`), {
      x: col1 + cellPad,
      y: tableTop - rowH * 2 - 15,
      size: 10,
      font,
      color: black,
    });
    page.drawText(
      S(`Total (${fmtPt(opts.pointsPerUnit)} X ${q}) = ${fmtPt(total)}`),
      {
        x: col2 + cellPad,
        y: tableTop - rowH * 2 - 15,
        size: 10,
        font: fontBold,
        color: black,
      }
    );

    y = tableTop - rowH * 3 - 28;
    drawLines(["COMPROVANTES:"], 12, true, 18, "left");
    y -= 6;

    const lista = opts.comprovantes || [];
    if (!lista.length) {
      drawLines(
        ["Nenhum comprovante em PDF anexado a este item."],
        10,
        false,
        14,
        "left"
      );
    } else {
      lista.forEach((c, idx) => {
        const pag =
          c.startPage === c.endPage
            ? `(pág. ${c.startPage})`
            : `(pág. ${c.startPage} a ${c.endPage})`;
        const line = `${idx + 1}- ${c.title || c.name || "Comprovante"} ${pag}`;
        drawLines(wrapText(line, font, 10, maxW), 10, false, 14, "left");
        y -= 4;
      });
    }

    return coverPages;
  }

  async function mesclarPaginas(outPdf, srcBytes) {
    const { PDFDocument } = global.PDFLib;
    const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const pages = await outPdf.copyPages(src, src.getPageIndices());
    pages.forEach((p) => outPdf.addPage(p));
    return src.getPageCount();
  }

  function docsDaSelecao(sel, docMap) {
    const ids = Array.isArray(sel.documentIds) ? sel.documentIds.map(String) : [];
    const out = [];
    for (const id of ids) {
      const d = docMap.get(id);
      if (!d || !d.data) continue;
      if (!isPdfName(d.name, d.type)) continue;
      const bytes = base64ToUint8Array(d.data);
      if (!bytes || !bytes.length) continue;
      out.push({
        id,
        name: d.name || "anexo.pdf",
        title: String(d.title || "").trim(),
        bytes,
      });
    }
    if (!out.length && Array.isArray(sel.files)) {
      for (const f of sel.files) {
        if (!f || !f.data || !isPdfName(f.name, f.type)) continue;
        const bytes = base64ToUint8Array(f.data);
        if (!bytes || !bytes.length) continue;
        out.push({
          id: f.id || f.name,
          name: f.name || "anexo.pdf",
          title: String(f.title || f.name || "").trim(),
          bytes,
        });
      }
    }
    return out;
  }

  function ordenarSelections(selections, criteriaOrder) {
    const orderIndex = new Map();
    (criteriaOrder || []).forEach((id, i) => orderIndex.set(id, i));
    return [...(selections || [])]
      .filter((s) => Number(s.quantity) > 0 && s.criterionId)
      .sort((a, b) => {
        const ia = orderIndex.has(a.criterionId) ? orderIndex.get(a.criterionId) : 9999;
        const ib = orderIndex.has(b.criterionId) ? orderIndex.get(b.criterionId) : 9999;
        if (ia !== ib) return ia - ib;
        return String(a.criterionId).localeCompare(String(b.criterionId), "pt-BR", {
          numeric: true,
        });
      });
  }

  function listarSemDescricao(selections, documents) {
    const docMap = new Map();
    (documents || []).forEach((d) => docMap.set(String(d.id), d));
    const faltando = [];
    for (const sel of selections || []) {
      if (!(Number(sel.quantity) > 0)) continue;
      const ids = Array.isArray(sel.documentIds) ? sel.documentIds.map(String) : [];
      for (const id of ids) {
        const d = docMap.get(id);
        if (!d) continue;
        if (!isPdfName(d.name, d.type)) continue;
        if (!(d.title && String(d.title).trim())) {
          faltando.push({
            criterionId: sel.criterionId,
            docId: id,
            name: d.name,
          });
        }
      }
    }
    return faltando;
  }

  /**
   * Monta um PDF de item (capa + comprovantes) com paginação correta na capa.
   */
  async function montarItemPdf(item, cat, catTitle, pageCursorStart) {
    const { PDFDocument } = global.PDFLib;

    async function build(coverPagesGuess) {
      const pdf = await PDFDocument.create();
      let next = pageCursorStart + coverPagesGuess;
      const comprovantes = item.docs.map((d) => {
        const start = next;
        const end = next + d.pageCount - 1;
        next = end + 1;
        return {
          title: d.title,
          name: d.name,
          startPage: start,
          endPage: end,
        };
      });
      const coverPages = await adicionarCapas(pdf, {
        category: cat,
        categoryTitle: catTitle,
        itemNum: itemNumeroFromId(item.criterionId),
        itemDescription: item.description,
        unit: item.unit,
        pointsPerUnit: item.pointsPerUnit,
        quantity: item.quantity,
        comprovantes,
      });
      for (const d of item.docs) {
        await mesclarPaginas(pdf, d.bytes);
      }
      return { pdf, coverPages };
    }

    let { pdf, coverPages } = await build(1);
    if (coverPages !== 1) {
      ({ pdf, coverPages } = await build(coverPages));
    }
    const bytes = new Uint8Array(await pdf.save({ useObjectStreams: false }));
    const totalPages = await contagemPaginasPdf(bytes);
    return { bytes, totalPages, coverPages };
  }

  async function montarAnexosPorCategoria(opts) {
    if (!global.PDFLib || !global.PDFLib.PDFDocument) {
      throw new Error("PDFLib nao carregado.");
    }

    const meta = opts.criteriaMeta || global.RSC_CRITERIOS_META || {};
    const catTitles = opts.categorias || global.RSC_CATEGORIAS || {};
    const criteriaOrder = opts.criteriaOrder || global.RSC_CRITERIOS_ORDEM || [];
    const selections = ordenarSelections(opts.selections || [], criteriaOrder);
    const docMap = new Map();
    (opts.documents || []).forEach((d) => docMap.set(String(d.id), d));

    const byCat = {};
    for (const cat of CATS) byCat[cat] = [];

    for (const sel of selections) {
      const m = meta[sel.criterionId];
      const cat = (m && m.category) || String(sel.criterionId).split(".")[0];
      if (!byCat[cat]) continue;
      const docs = docsDaSelecao(sel, docMap);
      if (!docs.length) continue;
      const docsWithPages = [];
      for (const d of docs) {
        const n = await contagemPaginasPdf(d.bytes);
        docsWithPages.push({ ...d, pageCount: n });
      }
      byCat[cat].push({
        criterionId: sel.criterionId,
        description: (m && m.description) || sel.criterionId,
        unit: (m && m.unit) || "",
        pointsPerUnit: (m && m.pointsPerUnit) || 0,
        quantity: Number(sel.quantity) || 0,
        docs: docsWithPages,
      });
    }

    const anexos = [];
    const { PDFDocument } = global.PDFLib;

    for (const cat of CATS) {
      const items = byCat[cat];
      if (!items.length) continue;

      const outPdf = await PDFDocument.create();
      let pageCursor = 1;

      for (const item of items) {
        const { bytes, totalPages } = await montarItemPdf(
          item,
          cat,
          catTitles[cat] || "",
          pageCursor
        );
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await outPdf.copyPages(src, src.getPageIndices());
        pages.forEach((p) => outPdf.addPage(p));
        pageCursor += totalPages;
      }

      const saved = await outPdf.save({ useObjectStreams: false });
      anexos.push({
        category: cat,
        nomeArquivo: `Anexo ${cat}.pdf`,
        bytes: new Uint8Array(saved),
        numPaginas: pageCursor - 1,
      });
    }

    return { anexos, semAnexos: anexos.length === 0 };
  }

  async function montarAnexosConsolidados(opts) {
    const r = await montarAnexosPorCategoria(opts);
    return {
      partes: r.anexos.map((a) => ({
        nome: a.nomeArquivo,
        bytes: a.bytes,
        numPaginas: a.numPaginas,
        category: a.category,
      })),
      comprovantesPorCriterio: {},
      docMeta: [],
      totalPartes: r.anexos.length,
      semAnexos: r.semAnexos,
    };
  }

  global.RSCAnexosConsolidados = {
    montarAnexosPorCategoria,
    montarAnexosConsolidados,
    listarSemDescricao,
    ordenarSelections,
    base64ToUint8Array,
    CATS,
  };
})(typeof window !== "undefined" ? window : globalThis);
