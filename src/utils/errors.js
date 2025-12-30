export const ERROR_CODES = {
  CSV_PARSE_FAILED: "CSV_PARSE_FAILED",
  CODEBOOK_MISSING: "CODEBOOK_MISSING",
  COLORBOOK_MISSING: "COLORBOOK_MISSING",
  MAPLIBRE_UNSUPPORTED: "MAPLIBRE_UNSUPPORTED",
  MAP_INIT_FAILED: "MAP_INIT_FAILED",
  SOIL_DATA_LOAD_FAILED: "SOIL_DATA_LOAD_FAILED",
};

export function buildError(code, message, cause) {
  const err = new Error(message);
  err.code = code;
  if (cause) {
    err.cause = cause;
  }
  return err;
}
