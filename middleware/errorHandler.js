export const notFound = (req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada",
    path: req.originalUrl,
  });
};

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.name === "MulterError") {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "El comprobante no puede superar 5 MB"
        : error.message;

    return res.status(400).json({ error: message });
  }

  const status = error.status || 500;

  if (status >= 500) {
    console.error("[api]", error);
  }

  res.status(status).json({
    error: status >= 500 ? "Error interno del servidor" : error.message,
    ...(status < 500 && error.details ? { details: error.details } : {}),
  });
};
