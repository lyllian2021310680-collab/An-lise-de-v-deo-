import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const clean = (t) => String(t || "").replace(/[—–]/g, "-");
const PAGE_W = 210, PAGE_H = 297, M = 10, HEADER = 22;

export const captureEl = (el) => html2canvas(el, {
  scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
  ignoreElements: (n) => n.dataset?.pdfIgnore === "true",
  onclone: (doc) => { doc.documentElement.classList.remove("dark"); doc.documentElement.classList.add("pdf-mode"); },
});

const newDoc = (title, subtitle) => {
  const pdf = new jsPDF("p", "mm", "a4");
  pdf.setFillColor(229, 9, 20); pdf.rect(0, 0, PAGE_W, 3, "F");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.setTextColor(17, 17, 17);
  pdf.text(clean(title || "Relatório"), M, 12);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(110, 110, 110);
  pdf.text(clean(`${subtitle ? subtitle + " · " : ""}AVA Vôlei Analytics · gerado em ${new Date().toLocaleString("pt-BR")}`).slice(0, 140), M, 18);
  return pdf;
};

const sectionTitle = (pdf, label, y) => {
  pdf.setFillColor(229, 9, 20); pdf.rect(M, y - 4.5, 1.5, 6, "F");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(17, 17, 17);
  pdf.text(clean(label), M + 4, y);
  return y + 5;
};

// Adiciona o canvas fatiado em páginas a partir de y (mm) na página atual
const addCanvas = (pdf, canvas, startY) => {
  const contentW = PAGE_W - 2 * M;
  const pxPerMm = canvas.width / contentW;
  let y = 0, top = startY, first = true;
  while (y < canvas.height) {
    const sliceH = Math.min(canvas.height - y, Math.floor((PAGE_H - M - top) * pxPerMm));
    const part = document.createElement("canvas");
    part.width = canvas.width; part.height = sliceH;
    part.getContext("2d").drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    if (!first) pdf.addPage();
    pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", M, top, contentW, sliceH / pxPerMm);
    y += sliceH; first = false; top = M;
  }
};

const finish = (pdf, filename) => {
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(150, 150, 150); pdf.text(`${i}/${n}`, PAGE_W - M, PAGE_H - 4, { align: "right" }); }
  pdf.save(`${filename || "relatorio"}.pdf`);
};

export async function exportPdf(el, { title, subtitle, filename }) {
  const pdf = newDoc(title, subtitle);
  addCanvas(pdf, await captureEl(el), HEADER);
  finish(pdf, filename);
}

// sections: [{ label, capture: async () => canvas }] — cada seção começa numa nova página
export async function exportPdfSections(sections, { title, subtitle, filename, onProgress }) {
  const pdf = newDoc(title, subtitle);
  for (let i = 0; i < sections.length; i++) {
    onProgress?.(i, sections.length, sections[i].label);
    const canvas = await sections[i].capture();
    if (i > 0) pdf.addPage();
    const y = sectionTitle(pdf, sections[i].label, i === 0 ? HEADER + 4 : M + 4);
    addCanvas(pdf, canvas, y);
  }
  finish(pdf, filename);
}
