import { Router } from "express";
import axios from "axios";
import { z } from "zod";
import { inSamaraArea } from "../utils/geo.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const BASE = process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";

// Схемы валидации
const reverseGeoSchema = z.object({
  lat: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, "Некорректная широта")
    .transform(Number)
    .refine(val => val >= -90 && val <= 90, "Широта должна быть от -90 до 90"),
  lon: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, "Некорректная долгота")
    .transform(Number)
    .refine(val => val >= -180 && val <= 180, "Долгота должна быть от -180 до 180"),
});

const searchGeoSchema = z.object({
  q: z
    .string()
    .min(2, "Поисковый запрос должен содержать минимум 2 символа")
    .max(200, "Поисковый запрос не может быть длиннее 200 символов")
    .trim()
    .transform(val => decodeURIComponent(val)),
});

function nominatimHeaders() {
  return {
    "User-Agent": "conscious-citizen/1.0 (edu project)",
    "Accept-Language": "ru",
  };
}

router.get("/reverse", requireAuth, async (req, res, next) => {
  try {
    const { lat, lon } = reverseGeoSchema.parse(req.query);

    const response = await axios.get(`${BASE}/reverse`, {
      params: { 
        format: "jsonv2", 
        lat, 
        lon,
        zoom: 18,
        addressdetails: 1
      },
      headers: nominatimHeaders(),
      timeout: 8000,
    });

    const address = response.data?.display_name || "";
    const inServiceArea = inSamaraArea(lat, lon);

    // Дополнительная информация об адресе
    const addressParts = response.data?.address || {};
    
    res.json({
      address,
      inServiceArea,
      details: {
        road: addressParts.road || addressParts.pedestrian || null,
        houseNumber: addressParts.house_number || null,
        city: addressParts.city || addressParts.town || addressParts.village || null,
        country: addressParts.country || null
      },
      message: inServiceArea ? undefined : "Проект пока работает только в пределах Самары (MVP зона).",
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Ошибка валидации координат",
        errors: e.errors.map(err => err.message)
      });
    }
    if (axios.isAxiosError(e)) {
      return res.status(502).json({ 
        message: "Ошибка геокодинга. Попробуйте позже." 
      });
    }
    next(e);
  }
});

router.get("/search", requireAuth, async (req, res, next) => {
  try {
    const { q } = searchGeoSchema.parse(req.query);

    const response = await axios.get(`${BASE}/search`, {
      params: { 
        format: "jsonv2", 
        q, 
        limit: 10,
        addressdetails: 1,
        dedupe: 1
      },
      headers: nominatimHeaders(),
      timeout: 8000,
    });

    const items = (response.data || [])
      .filter(item => item.lat && item.lon) // Только с координатами
      .map((x) => ({
        address: x.display_name,
        lat: parseFloat(x.lat),
        lon: parseFloat(x.lon),
        type: x.type || null,
        importance: x.importance || null,
        inSamara: inSamaraArea(parseFloat(x.lat), parseFloat(x.lon))
      }))
      .sort((a, b) => {
        // Сначала Самара, потом по важности
        if (a.inSamara && !b.inSamara) return -1;
        if (!a.inSamara && b.inSamara) return 1;
        return (b.importance || 0) - (a.importance || 0);
      });

    res.json({ 
      items,
      count: items.length,
      query: q
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ 
        message: e.errors[0].message 
      });
    }
    if (axios.isAxiosError(e)) {
      return res.status(502).json({ 
        message: "Ошибка поиска. Попробуйте позже." 
      });
    }
    next(e);
  }
});

export default router;