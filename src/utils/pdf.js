import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

/**
 * Возвращает PDFDocument (поток).
 * Важно: doc.end() НЕ вызывается внутри — это делает вызывающий код
 * (чтобы можно было pipe в res или собрать в buffer).
 */
export function buildIncidentPdf({ incident, user, profile }) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
  });

  // Путь к шрифту: сначала src/fonts, потом fonts (на случай разных структур)
  const fontCandidates = [
    path.join(process.cwd(), "src", "fonts", "DejaVuSans.ttf"),
    path.join(process.cwd(), "fonts", "DejaVuSans.ttf"),
  ];
  const fontPath = fontCandidates.find((p) => fs.existsSync(p));

  if (fontPath) {
    doc.registerFont("DejaVu", fontPath);
    doc.font("DejaVu");
  } else {
    // Если шрифта нет — пусть не падает, но кириллица может быть не идеальной
    doc.font("Helvetica");
  }

  // ===== Заголовок =====
  doc.fontSize(16).text("Обращение", { align: "center" });
  doc.moveDown();

  // ===== Основная информация =====
  doc.fontSize(12);
  doc.text(`Дата формирования: ${new Date().toLocaleString("ru-RU")}`);
  doc.text(`Категория: ${incident.category}`);
  doc.text(`Тема: ${incident.title}`);
  doc.moveDown();

  // ===== Описание =====
  doc.fontSize(12).text("Описание:", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).text(incident.description || "—", { align: "left" });
  doc.moveDown();

  // ===== Адрес =====
  doc.fontSize(12).text("Адрес и координаты:", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Адрес: ${incident.address}`);
  doc.text(`Координаты: ${incident.latitude}, ${incident.longitude}`);
  doc.moveDown();

  // ===== Данные заявителя =====
  doc.fontSize(12).text("Данные заявителя:", { underline: true });
  doc.moveDown(0.5);

  const fio = [profile?.surname, profile?.name, profile?.patronymic]
    .filter(Boolean)
    .join(" ");

  doc.fontSize(11);
  doc.text(`ФИО: ${fio || "—"}`);
  doc.text(`Email: ${user?.email || "—"}`);
  doc.text(`Телефон: ${profile?.phone || "—"}`);

  const addr = [
    profile?.city,
    profile?.street,
    profile?.house,
    profile?.flat ? `кв. ${profile.flat}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  doc.text(`Адрес проживания: ${addr || "—"}`);

  doc.moveDown(2);

  // ===== Подпись системы =====
  doc.fontSize(10).fillColor("gray").text(
    "Документ сформирован в системе «Сознательный гражданин».",
    { align: "center" }
  );

  return doc;
}

/**
 * Превращает PDFDocument (PDFKit) в Buffer (нужно для email-вложения).
 */
export function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}