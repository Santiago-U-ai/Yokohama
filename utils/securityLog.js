import fs from "node:fs";
import path from "node:path";

/**
 * Registro estructurado de eventos de seguridad.
 *
 * Nunca se registran contraseñas, tokens ni el cuerpo completo de la
 * petición. Solo metadatos útiles para detectar abuso: evento, IP, ruta,
 * método, resultado y un detalle corto.
 */

const isTest = process.env.NODE_ENV === "test";

const LOG_FILE =
  process.env.SECURITY_LOG_FILE === "off"
    ? null
    : process.env.SECURITY_LOG_FILE ||
      (isTest ? null : path.join(process.cwd(), "logs", "security.log"));

const MAX_DETAIL_LENGTH = 300;

const cleanDetail = (value) => {
  if (value === undefined || value === null) return undefined;
  return String(value)
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, MAX_DETAIL_LENGTH);
};

const normalizeIp = (req) =>
  req.ip || req.socket?.remoteAddress || "desconocida";

const persistToDatabase = (entry) => {
  if (process.env.SECURITY_DB_LOG !== "true") return;

  import("../config/supabase.js")
    .then(({ supabaseAdmin }) =>
      supabaseAdmin.from("security_events").insert({
        event: entry.event,
        level: entry.level,
        user_email: entry.user,
        role: entry.role,
        ip: entry.ip,
        method: entry.method,
        path: entry.path,
        reason: entry.reason,
        detail: entry.detail,
        request_id: entry.requestId,
      }),
    )
    .then(({ error }) => {
      if (error) {
        console.error("[seguridad] no se pudo guardar el evento:", error.message);
      }
    })
    .catch(() => {
      // El log en archivo/consola ya quedó registrado.
    });
};

/**
 * Escribe un evento de seguridad en consola y, opcionalmente, en archivo.
 */
export const securityLog = (event, details = {}) => {
  const entry = {
    ts: new Date().toISOString(),
    level: details.level || "warn",
    event,
    ip: cleanDetail(details.ip),
    method: cleanDetail(details.method),
    path: cleanDetail(details.path),
    user: cleanDetail(details.user),
    role: cleanDetail(details.role),
    reason: cleanDetail(details.reason),
    detail: cleanDetail(details.detail),
    requestId: cleanDetail(details.requestId),
  };

  const line = JSON.stringify(entry);

  if (entry.level === "error") {
    console.error("[seguridad]", line);
  } else {
    console.warn("[seguridad]", line);
  }

  if (LOG_FILE) {
    try {
      fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
      fs.appendFile(LOG_FILE, `${line}\n`, (error) => {
        if (error) console.error("[seguridad] no se pudo escribir el log:", error.message);
      });
    } catch (error) {
      console.error("[seguridad] no se pudo preparar el log:", error.message);
    }
  }

  persistToDatabase(entry);
};

/**
 * Atajo para registrar un evento usando los datos de la petición.
 */
export const securityLogFromRequest = (req, event, details = {}) =>
  securityLog(event, {
    ip: normalizeIp(req),
    method: req.method,
    path: req.originalUrl?.split("?")[0],
    user: req.user?.email || req.user?.id,
    role: req.role,
    requestId: req.id,
    ...details,
  });
