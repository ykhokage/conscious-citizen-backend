import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

/**
 * Безопасно приводит значение к строке
 */
function safe(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

/**
 * Форматирование даты
 */
function formatDate(value = new Date(), withTime = false) {
  try {
    const date = new Date(value);

    if (withTime) {
      return date.toLocaleString("ru-RU");
    }

    return date.toLocaleDateString("ru-RU");
  } catch {
    return withTime
      ? new Date().toLocaleString("ru-RU")
      : new Date().toLocaleDateString("ru-RU");
  }
}

/**
 * Собирает ФИО
 */
function getFio(profile) {
  return [profile?.surname, profile?.name, profile?.patronymic]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Собирает адрес проживания
 */
function getProfileAddress(profile) {
  return [
    profile?.city,
    profile?.street,
    profile?.house,
    profile?.flat ? `кв. ${profile.flat}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Делает более официальный вид названия категории
 */
function humanizeCategory(category) {
  const map = {
    parking: "Нарушение правил парковки",
    road: "Проблема дорожного покрытия",
    garbage: "Ненадлежащее содержание территории",
    lighting: "Проблема уличного освещения",
    yard: "Проблема благоустройства двора",
    housing: "Проблема в сфере ЖКХ",
    ecology: "Экологическое нарушение",
    safety: "Нарушение общественной безопасности",
    other: "Иное обращение",
  };

  if (!category) return "—";
  return map[category] || String(category);
}

/**
 * Смягчает грубые/разговорные формулировки
 * для официального документа
 */
function normalizeDescription(text) {
  if (!text) return "—";

  let result = String(text).trim();

  const replacements = [
    [/мудак/gi, "нарушитель"],
    [/дурак/gi, "нарушитель"],
    [/идиот/gi, "нарушитель"],
    [/не знаю кто это/gi, "неустановленное лицо"],
    [/какой[- ]?то/gi, "неустановленное лицо"],
  ];

  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

/**
 * Подключение шрифтов
 * Если bold-файл не найден, используем regular DejaVu,
 * чтобы не ломалась кириллица
 */
function applyFont(doc) {
  const regularCandidates = [
    path.join(process.cwd(), "src", "fonts", "DejaVuSans.ttf"),
    path.join(process.cwd(), "fonts", "DejaVuSans.ttf"),
  ];

  const boldCandidates = [
    path.join(process.cwd(), "src", "fonts", "DejaVuSans-Bold.ttf"),
    path.join(process.cwd(), "fonts", "DejaVuSans-Bold.ttf"),
  ];

  const regularPath = regularCandidates.find((p) => fs.existsSync(p));
  const boldPath = boldCandidates.find((p) => fs.existsSync(p));

  if (regularPath) {
    doc.registerFont("DejaVu", regularPath);
  }

  if (boldPath) {
    doc.registerFont("DejaVuBold", boldPath);
  }

  const regularFont = regularPath ? "DejaVu" : "Helvetica";
  const boldFont = boldPath ? "DejaVuBold" : regularFont;

  doc.font(regularFont);

  return {
    regular: regularFont,
    bold: boldFont,
  };
}

/**
 * Проверка, хватает ли места на странице
 */
function ensureSpace(doc, minSpace = 120) {
  const bottomY = doc.page.height - doc.page.margins.bottom;
  if (doc.y + minSpace > bottomY) {
    doc.addPage();
  }
}

/**
 * Рисует строку "подпись + значение"
 * ИСПРАВЛЕНО:
 * теперь учитывается реальная высота и label, и value,
 * чтобы строки не наезжали друг на друга
 */
function drawField(doc, fonts, label, value, options = {}) {
  const {
    labelWidth = 170,
    valueWidth = 315,
    gap = 8,
    lineGap = 3,
    rowSpacing = 6,
  } = options;

  const x = doc.page.margins.left;
  const y = doc.y;
  const safeValue = safe(value);

  const labelHeight = doc.heightOfString(label, {
    width: labelWidth,
    lineGap,
  });

  const valueHeight = doc.heightOfString(safeValue, {
    width: valueWidth,
    lineGap,
  });

  doc.font(fonts.bold).text(label, x, y, {
    width: labelWidth,
    lineGap,
  });

  doc.font(fonts.regular).text(safeValue, x + labelWidth + gap, y, {
    width: valueWidth,
    lineGap,
  });

  doc.y = y + Math.max(labelHeight, valueHeight) + rowSpacing;
}

/**
 * Рисует блок подписи
 */
function drawSignatureBlock(doc, fonts, fio) {
  ensureSpace(doc, 100);

  const y = doc.y;
  const leftX = 50;
  const rightX = 330;
  const lineWidth = 180;

  doc
    .font(fonts.regular)
    .fontSize(11)
    .text("____________________", leftX, y, {
      width: lineWidth,
      align: "left",
    })
    .text("____________________", rightX, y, {
      width: lineWidth,
      align: "left",
    });

  doc
    .fontSize(9)
    .fillColor("gray")
    .text("Подпись", leftX, y + 16, {
      width: lineWidth,
      align: "center",
    })
    .text("Дата", rightX, y + 16, {
      width: lineWidth,
      align: "center",
    });

  doc.fillColor("black");
  doc.moveDown(2.2);

  doc.font(fonts.regular).fontSize(10).text(`ФИО заявителя: ${fio || "—"}`, {
    align: "left",
  });

  doc.moveDown(0.5);
}

/**
 * Нижний колонтитул
 */
function drawFooter(doc, fonts, pageNumber, totalPages) {
  const footerY = doc.page.height - 60;

  doc.save();

  doc.font(fonts.regular);
  doc.fontSize(8);
  doc.fillColor("gray");

  doc.text(
    `Страница ${pageNumber} из ${totalPages}`,
    50,
    footerY,
    {
      width: doc.page.width - 100,
      align: "right",
      lineBreak: false,
    }
  );

  doc.restore();
  doc.fillColor("black");
}

/**
 * Главная функция генерации PDF
 */
export function buildIncidentPdf({ incident, user, profile }) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    bufferPages: true,
    info: {
      Title: `Обращение по инциденту №${safe(incident?.id, "")}`,
      Author: safe(getFio(profile), "Пользователь системы"),
      Subject: "Обращение гражданина",
      Keywords: "обращение, заявление, жалоба, инцидент",
      Creator: "Сознательный гражданин",
      Producer: "PDFKit",
    },
  });

  const fonts = applyFont(doc);

  const fio = getFio(profile) || "—";
  const email = safe(user?.email);
  const phone = safe(profile?.phone);
  const profileAddress = getProfileAddress(profile) || "—";

  const incidentId = safe(incident?.id);
  const category = humanizeCategory(incident?.category);
  const title = safe(incident?.title);
  const description = normalizeDescription(incident?.description);
  const incidentAddress = safe(incident?.address);
  const latitude = safe(incident?.latitude);
  const longitude = safe(incident?.longitude);
  const incidentStatus = safe(incident?.status);
  const incidentCreatedAt = formatDate(incident?.createdAt);
  const generatedAt = formatDate(new Date(), true);

  // =======================================================
  // ШАПКА СПРАВА
  // =======================================================

  doc.font(fonts.regular).fontSize(11);

  doc.text("В уполномоченный государственный орган", {
    align: "right",
  });
  doc.text("или орган местного самоуправления", {
    align: "right",
  });
  doc.text("(по компетенции)", {
    align: "right",
  });

  doc.moveDown(1.2);

  doc.font(fonts.bold).text("От заявителя:", {
    align: "right",
  });

  doc.font(fonts.regular);
  doc.text(fio, { align: "right" });
  doc.text(`Адрес: ${profileAddress}`, { align: "right" });
  doc.text(`Телефон: ${phone}`, { align: "right" });
  doc.text(`Email: ${email}`, { align: "right" });

  doc.moveDown(1.8);

  // =======================================================
  // ЗАГОЛОВОК
  // =======================================================

  doc.font(fonts.bold).fontSize(14).text("ОБРАЩЕНИЕ", {
    align: "center",
  });

  doc.moveDown(0.4);

  doc
    .font(fonts.regular)
    .fontSize(11)
    .text("о выявленной проблеме, требующей рассмотрения и принятия мер", {
      align: "center",
    });

  doc.moveDown(1.5);

  // =======================================================
  // ВВОДНЫЙ ТЕКСТ
  // =======================================================

  const introText = [
    `Я, ${fio}, настоящим сообщаю о выявленной проблеме по категории «${category}».`,
    `Тема обращения: ${title}.`,
    `Указанная проблема была зафиксирована ${incidentCreatedAt} по адресу: ${incidentAddress}.`,
    `Координаты места фиксации: ${latitude}, ${longitude}.`,
  ].join(" ");

  doc.font(fonts.regular).fontSize(12).text(introText, {
    align: "justify",
    lineGap: 4,
    paragraphGap: 8,
    indent: 28,
  });

  doc.moveDown(0.8);

  // =======================================================
  // СУТЬ ОБРАЩЕНИЯ
  // =======================================================

  doc.font(fonts.bold).fontSize(12).text("Суть обращения", {
    underline: true,
  });

  doc.moveDown(0.5);

  doc.font(fonts.regular).fontSize(12).text(description, {
    align: "justify",
    lineGap: 4,
    paragraphGap: 8,
    indent: 28,
  });

  doc.moveDown(1);

  // =======================================================
  // ПРОСЬБА К ОРГАНУ
  // =======================================================

  doc.font(fonts.bold).fontSize(12).text("Прошу:", {
    underline: true,
  });

  doc.moveDown(0.5);

  const requests = [
    "1. Провести проверку по изложенным в настоящем обращении фактам.",
    "2. Принять меры в пределах установленной компетенции.",
    "3. В случае подтверждения изложенных обстоятельств устранить нарушение либо организовать его устранение.",
    "4. Сообщить о результатах рассмотрения обращения по указанным контактным данным в установленный законом срок.",
    "5. При регистрации обращения сообщить входящий номер обращения, если это предусмотрено порядком рассмотрения.",
  ];

  doc.font(fonts.regular).fontSize(11);
  for (const item of requests) {
    doc.text(item, {
      align: "left",
      lineGap: 3,
    });
    doc.moveDown(0.2);
  }

  doc.moveDown(1);

  // =======================================================
  // СВЕДЕНИЯ ПО ОБРАЩЕНИЮ
  // =======================================================

  ensureSpace(doc, 220);

  doc.font(fonts.bold).fontSize(12).text("Сведения по обращению", {
    underline: true,
  });

  doc.moveDown(0.7);

  drawField(doc, fonts, "Номер инцидента:", incidentId);
  drawField(doc, fonts, "Дата формирования PDF:", generatedAt);
  drawField(doc, fonts, "Дата создания инцидента:", incidentCreatedAt);
  drawField(doc, fonts, "Категория:", category);
  drawField(doc, fonts, "Тема обращения:", title);
  drawField(doc, fonts, "Адрес:", incidentAddress);
  drawField(doc, fonts, "Координаты:", `${latitude}, ${longitude}`);
  drawField(doc, fonts, "Статус в системе:", incidentStatus);
  drawField(doc, fonts, "Заявитель:", fio);
  drawField(doc, fonts, "Телефон:", phone);
  drawField(doc, fonts, "Email:", email);

  doc.moveDown(1);

  // =======================================================
  // ПРИЛОЖЕНИЯ
  // =======================================================

  ensureSpace(doc, 120);

  doc.font(fonts.bold).fontSize(12).text("Приложения", {
    underline: true,
  });

  doc.moveDown(0.5);

  doc.font(fonts.regular).fontSize(11);
  doc.text("1. Материалы фотофиксации по инциденту (при наличии).", {
    lineGap: 3,
  });
  doc.text("2. Дополнительные сведения, внесенные пользователем в систему.", {
    lineGap: 3,
  });

  doc.moveDown(1.5);

  // =======================================================
  // ЗАКЛЮЧЕНИЕ
  // =======================================================

  ensureSpace(doc, 140);

  doc.font(fonts.regular).fontSize(11).text(
    "Настоящее обращение сформировано пользователем через информационную систему «Сознательный гражданин» для последующего направления в компетентный орган.",
    {
      align: "justify",
      lineGap: 4,
    }
  );

  doc.moveDown(2);

  drawSignatureBlock(doc, fonts, fio);

  // =======================================================
  // КОЛОНТИТУЛ НА ВСЕХ СТРАНИЦАХ
  // =======================================================

const range = doc.bufferedPageRange();

for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i);
  drawFooter(doc, fonts, i + 1, range.count);
}

doc.switchToPage(range.count - 1);
  return doc;
}

/**
 * Превращает PDFDocument в Buffer
 */
export function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.end();
  });
}