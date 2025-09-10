export function formatParcelleName(numero, precision, ilot) {
  const num = (numero ?? '').toString().trim();
  const prec = precision != null ? precision.toString().padStart(3, '0') : '';
  const ilotStr = (ilot ?? '').toString().trim();

  if (!num && !prec && !ilotStr) return '(sans numéro)';

  if (ilotStr) {
    return `${ilotStr}-${num || '(sans numéro)'}`;
  }

  if (prec) {
    return `${num || '(sans numéro)'}-${prec}`;
  }

  return num || '(sans numéro)';
}
