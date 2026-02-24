import PDFDocument from "pdfkit";

export function buildIncidentPdf({ incident, user, profile }) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  doc.fontSize(16).text("Обращение (черновик)", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).text(`Дата: ${new Date().toLocaleString("ru-RU")}`);
  doc.text(`Категория: ${incident.category}`);
  doc.text(`Тема: ${incident.title}`);
  doc.moveDown();

  doc.fontSize(12).text("Описание:", { underline: true });
  doc.fontSize(11).text(incident.description || "");
  doc.moveDown();

  doc.fontSize(12).text("Адрес и координаты:", { underline: true });
  doc.fontSize(11).text(`Адрес: ${incident.address}`);
  doc.text(`Координаты: ${incident.latitude}, ${incident.longitude}`);
  doc.moveDown();

  doc.fontSize(12).text("Данные заявителя:", { underline: true });
  const fio = [profile?.surname, profile?.name, profile?.patronymic].filter(Boolean).join(" ");
  doc.fontSize(11).text(`ФИО: ${fio || "—"}`);
  doc.text(`Email: ${user.email}`);
  doc.text(`Телефон: ${profile?.phone || "—"}`);
  const addr = [profile?.city, profile?.street, profile?.house, profile?.flat && ("кв. " + profile.flat)]
    .filter(Boolean).join(", ");
  doc.text(`Адрес проживания: ${addr || "—"}`);

  doc.moveDown();
  doc.fontSize(10).fillColor("gray").text("Сформировано в системе «Сознательный гражданин».", { align: "center" });

  return doc;
}
