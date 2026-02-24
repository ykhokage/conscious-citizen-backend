import { Router } from "express";
import axios from "axios";
import { inSamaraArea } from "../utils/geo.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const BASE = process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";

function nominatimHeaders() {
  return {
    "User-Agent": "conscious-citizen/1.0 (edu project)",
    "Accept-Language": "ru",
  };
}

router.get("/reverse", requireAuth, async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ message: "lat/lon required" });
    }

    const r = await axios.get(`${BASE}/reverse`, {
      params: { format: "jsonv2", lat, lon },
      headers: nominatimHeaders(),
      timeout: 8000,
    });

    const address = r.data?.display_name || "";
    const ok = inSamaraArea(lat, lon);

    res.json({
      address,
      inServiceArea: ok,
      message: ok ? undefined : "Проект пока работает только в пределах Самары (MVP зона).",
    });
  } catch (e) {
    next(e);
  }
});

router.get("/search", requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ message: "q required" });

    const r = await axios.get(`${BASE}/search`, {
      params: { format: "jsonv2", q, limit: 5 },
      headers: nominatimHeaders(),
      timeout: 8000,
    });

    const items = (r.data || []).map((x) => ({
      address: x.display_name,
      lat: x.lat,
      lon: x.lon,
    }));

    res.json({ items });
  } catch (e) {
    next(e);
  }
});

export default router;
