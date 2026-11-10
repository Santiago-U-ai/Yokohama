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
