/**
 * =============================================================================
 * Exportação consolidada — somente PDFs (máx. 8)
 * =============================================================================
 * 01 - Requerimento_RSC.pdf
 * 02 - Memorial_Descritivo.pdf
 * 03+ - Anexo I … VI (só os que tiverem comprovantes; com capas e paginação)
 *
 * - Não inclui arquivos soltos da pasta Anexos/
 * - Não injeta coluna de páginas no requerimento
 * - Exige descrição breve em todo PDF vinculado (também em backup antigo)
 * =============================================================================
 */
(function () {
  "use strict";

  const IDB_NAME = "keyval-store";
  const IDB_STORE = "keyval";
  const STATE_KEY = "rsc-calculator-state";

  let processing = false;

  function toast(msg, type) {
    if (type === "error") console.error("[RSC Export]", msg);
    else console.info("[RSC Export]", msg);
    try {
      const el = document.createElement("div");
      el.setAttribute("role", "status");
      el.style.cssText =
        "position:fixed;bottom:1.25rem;left:50%;transform:translateX(-50%);z-index:99999;" +
        "max-width:min(32rem,92vw);padding:0.75rem 1rem;border-radius:0.75rem;font:600 13px/1.4 system-ui,sans-serif;" +
        "box-shadow:0 12px 40px rgba(0,0,0,.18);color:#fff;" +
        (type === "error" ? "background:#b91c1c;" : type === "success" ? "background:#008037;" : "background:#0f766e;");
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), type === "error" ? 7000 : 4000);
    } catch (_) {}
  }

  function idbGet(key) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          resolve(null);
          return;
        }
        const tx = db.transaction(IDB_STORE, "readonly");
        const g = tx.objectStore(IDB_STORE).get(key);
        g.onsuccess = () => resolve(g.result);
        g.onerror = () => reject(g.error);
      };
    });
  }

  async function loadState() {
    let raw = await idbGet(STATE_KEY);
    if (!raw) {
      try {
        raw = localStorage.getItem(STATE_KEY);
      } catch (_) {}
    }
    if (!raw) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return raw;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function extractHtmlParts(html) {
    const styleTags = [];
    String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (m) => {
      styleTags.push(m);
      return "";
    });
    let body = html;
    const bm = String(html).match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bm) body = bm[1];
    // remove scripts
    body = body.replace(/<script[\s\S]*?<\/script>/gi, "");
    return { styles: styleTags.join("\n"), body };
  }

  /**
   * Converte HTML string em PDF (Uint8Array) via html2pdf.js.
   */
  async function htmlToPdfBytes(html, opts) {
    if (!window.html2pdf) {
      throw new Error("html2pdf não carregado");
    }

    let htmlWork = html;

    // Remove possíveis colunas de comprovantes/paginação se existirem
    htmlWork = htmlWork.replace(/<th[^>]*>\s*Comprovantes\s*<\/th>/gi, "");
    htmlWork = htmlWork.replace(
      /<td[^>]*>\s*(N[aã]o anexado|P[aá]g\.|Anexo P[aá]g)[\s\S]*?<\/td>/gi,
      ""
    );

    // Injetar imagens do ZIP como data URL (somente em src=)
    if (opts && opts.assetMap) {
      htmlWork = htmlWork.replace(
        /src=(["'])([^"']+)\1/gi,
        (full, q, src) => {
          const base = String(src).split("/").pop().split("?")[0];
          const dataUrl =
            opts.assetMap[src] ||
            opts.assetMap[base] ||
            opts.assetMap[decodeURIComponent(base)];
          if (dataUrl && String(dataUrl).startsWith("data:")) {
            return `src=${q}${dataUrl}${q}`;
          }
          return full;
        }
      );
    }

    const parts = extractHtmlParts(htmlWork);
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:-10000px;top:0;width:210mm;background:#fff;z-index:-1;color:#111;";
    host.innerHTML = parts.styles + parts.body;
    document.body.appendChild(host);

    try {
      const worker = window
        .html2pdf()
        .set({
          margin: [10, 10, 12, 10],
          filename: "doc.pdf",
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            windowWidth: 900,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(host);

      const ab = await worker.outputPdf("arraybuffer");
      return new Uint8Array(ab);
    } finally {
      host.remove();
    }
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  /**
   * Monta ZIP final só com PDFs numerados.
   */
  async function montarPacotePdfs(originalZipBlob) {
    if (!window.JSZip) throw new Error("JSZip não carregado");
    if (!window.RSCAnexosConsolidados) throw new Error("Módulo de anexos não carregado");
    if (!window.PDFLib) throw new Error("PDFLib não carregado");

    const state = await loadState();
    if (!state) throw new Error("Estado do formulário não encontrado no navegador");

    // Validação: descrição breve obrigatória
    const faltando = window.RSCAnexosConsolidados.listarSemDescricao(
      state.selections || [],
      state.documents || []
    );
    if (faltando.length) {
      const amostra = faltando
        .slice(0, 3)
        .map((f) => `${f.criterionId}: ${f.name}`)
        .join("; ");
      throw new Error(
        `Há ${faltando.length} anexo(s) sem descrição breve. Preencha o campo "Descreva brevemente o anexo" em cada arquivo (critérios: ${amostra}).`
      );
    }

    const srcZip = await JSZip.loadAsync(originalZipBlob);
    const assetMap = {};

    // Logos / brasões do ZIP original → data URL
    for (const path of Object.keys(srcZip.files)) {
      const f = srcZip.files[path];
      if (f.dir) continue;
      if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) continue;
      try {
        const blob = await f.async("blob");
        const dataUrl = await blobToDataUrl(blob);
        const base = path.split("/").pop();
        assetMap[base] = dataUrl;
        assetMap[path] = dataUrl;
      } catch (_) {}
    }

    const out = new JSZip();
    let seq = 1;

    // 01 Requerimento
    const reqFile =
      srcZip.file("Requerimento_RSC.html") ||
      (srcZip.file(/Requerimento.*\.html$/i) || [])[0];
    if (!reqFile) throw new Error("Requerimento_RSC.html não encontrado no pacote");
    const reqHtml = await reqFile.async("string");
    toast("Convertendo Requerimento para PDF…", "info");
    const reqPdf = await htmlToPdfBytes(reqHtml, { assetMap });
    out.file(`${pad2(seq)} - Requerimento_RSC.pdf`, reqPdf);
    seq++;

    // 02 Memorial
    const memFile =
      srcZip.file("Memorial_Descritivo.html") ||
      (srcZip.file(/Memorial.*\.html$/i) || [])[0];
    if (!memFile) throw new Error("Memorial_Descritivo.html não encontrado no pacote");
    const memHtml = await memFile.async("string");
    toast("Convertendo Memorial para PDF…", "info");
    const memPdf = await htmlToPdfBytes(memHtml, { assetMap });
    out.file(`${pad2(seq)} - Memorial_Descritivo.pdf`, memPdf);
    seq++;

    // 03+ Anexos I–VI
    toast("Gerando Anexos I–VI com capas…", "info");
    const order = window.RSC_CRITERIOS_ORDEM || [];
    const { anexos } = await window.RSCAnexosConsolidados.montarAnexosPorCategoria({
      selections: state.selections || [],
      documents: state.documents || [],
      criteriaOrder: order,
      criteriaMeta: window.RSC_CRITERIOS_META,
      categorias: window.RSC_CATEGORIAS,
    });

    for (const a of anexos) {
      out.file(`${pad2(seq)} - ${a.nomeArquivo}`, a.bytes);
      seq++;
    }

    // ZIP final (sem pasta Anexos/, sem HTML, sem soltos)
    return out.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
  }

  function isConsolidadoDownload(anchor) {
    if (!anchor || !anchor.download) return false;
    const d = String(anchor.download);
    return /RSC_TAE_Consolidado/i.test(d) && /\.zip$/i.test(d);
  }

  function installDownloadHook() {
    const nativeClick = HTMLAnchorElement.prototype.click;

    HTMLAnchorElement.prototype.click = function patchedClick() {
      try {
        if (
          !processing &&
          isConsolidadoDownload(this) &&
          this.href &&
          String(this.href).startsWith("blob:")
        ) {
          const anchor = this;
          const href = anchor.href;
          const download = String(anchor.download || "RSC_TAE_Consolidado.zip");

          processing = true;
          toast("Preparando pacote (somente PDFs)…", "info");

          (async () => {
            try {
              const res = await fetch(href);
              const originalBlob = await res.blob();
              const newBlob = await montarPacotePdfs(originalBlob);
              const url = URL.createObjectURL(newBlob);
              const a = document.createElement("a");
              a.href = url;
              // mantém nome base, deixa claro que é o pacote PDF
              a.download = download.replace(/\.zip$/i, "_PDFs.zip");
              nativeClick.call(a);
              setTimeout(() => URL.revokeObjectURL(url), 4000);
              toast(
                "Pacote pronto: Requerimento, Memorial e Anexos I–VI em PDF.",
                "success"
              );
            } catch (err) {
              console.error("[RSC Extensão]", err);
              toast(err.message || "Falha ao gerar pacote PDF.", "error");
              // NÃO baixa o original com arquivos soltos — força correção
            } finally {
              processing = false;
              try {
                URL.revokeObjectURL(href);
              } catch (_) {}
            }
          })();
          return;
        }
      } catch (e) {
        console.error(e);
      }
      return nativeClick.apply(this, arguments);
    };

    console.info(
      "[RSC Export] Pacote: 01 Requerimento, 02 Memorial, 03+ Anexos (PDF). Sem soltos."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installDownloadHook);
  } else {
    installDownloadHook();
  }

  window.RSCExtensaoExportacao = {
    montarPacotePdfs,
    loadState,
  };
})();
