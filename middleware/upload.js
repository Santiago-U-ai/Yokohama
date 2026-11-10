import multer from "multer";
import { HttpError } from "../utils/httpError.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const comprobanteUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 10,
    fieldSize: 1024,
    parts: 20,
  },
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(
        new HttpError(
          400,
          "Formato no permitido. Usa JPG, PNG, WEBP o PDF.",
          file.mimetype,
        ),
      );
    }

    callback(null, true);
  },
});

/**
 * Detecta el tipo real del archivo a partir de su firma.
 */
const detectType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }

  return null;
};

export const validateComprobanteSignature = (req, res, next) => {
  if (!req.file) return next();

  const detected = detectType(req.file.buffer);

  if (!detected || detected !== req.file.mimetype) {
    return next(
      new HttpError(
        400,
        "El archivo no corresponde a una imagen o PDF válido",
      ),
    );
  }

  return next();
};
