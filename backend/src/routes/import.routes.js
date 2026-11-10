import { Router } from "express";
import { imports, isImportDone } from "../services/imports.js";
import { isValidId } from "../services/videoStore.js";
import { AppError } from "../utils/AppError.js";

const router = Router();

function requireSession(req) {
  const s = isValidId(req.params.id) ? imports.get(req.params.id) : null;
  if (!s) throw new AppError("Không tìm thấy phiên tải từ Drive.", 404, "IMPORT_NOT_FOUND");
  return s;
}

/**
 * POST /api/import/drive   { links: "link1\nlink2 ..." }  (link file hoặc link thư mục, chia sẻ công khai)
 * → 202 { importId, eventsUrl, session }
 */
router.post("/drive", (req, res) => {
  const links = Array.isArray(req.body?.links) ? req.body.links.join("\n") : String(req.body?.links ?? "");
  if (links.length > 20000) throw new AppError("Quá nhiều link.", 400, "TOO_MANY_LINKS");
  const session = imports.create(links);
  res.status(202).json({ success: true, importId: session.id, eventsUrl: `/api/import/${session.id}/events`, session });
});

/** GET /api/import/:id/events — SSE: progress | done | failed | cancelled */
router.get("/:id/events", (req, res) => {
  const s = requireSession(req);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let closed = false;
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
  const cleanup = (end) => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    imports.off("update", onUpdate);
    if (end) res.end();
  };
  const send = (snap) => {
    const ev = !isImportDone(snap.status) ? "progress" : snap.status === "error" ? "failed" : snap.status;
    res.write(`event: ${ev}\ndata: ${JSON.stringify(snap)}\n\n`);
    if (isImportDone(snap.status)) cleanup(true);
  };
  function onUpdate(snap) {
    if (snap.id === s.id) send(snap);
  }
  imports.on("update", onUpdate);
  req.on("close", () => cleanup(false));
  send(imports.snapshot(s));
});

router.get("/:id", (req, res) => {
  res.json({ success: true, session: imports.snapshot(requireSession(req)) });
});

/** DELETE /api/import/:id — huỷ tải */
router.delete("/:id", (req, res) => {
  const s = requireSession(req);
  res.json({ success: true, cancelled: imports.cancel(s.id) });
});

export default router;
