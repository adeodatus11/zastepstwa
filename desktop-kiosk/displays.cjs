function defaults(displays, primaryId) {
  return { kioskDisplayId: primaryId, tvDisplayId: displays.find(d => d.id !== primaryId)?.id ?? null };
}
function resolve(config, displays, primaryId) {
  const kiosk = displays.find(d => d.id === config.kioskDisplayId) || displays.find(d => d.id === primaryId) || displays[0];
  const tv = displays.find(d => d.id === config.tvDisplayId && d.id !== kiosk?.id) || null;
  return { kiosk, tv };
}
function validate(config, displays) {
  if (!config || !Number.isInteger(config.kioskDisplayId) || !displays.some(d => d.id === config.kioskDisplayId)) throw Error('Wybierz dostępny ekran kiosku.');
  if (config.tvDisplayId !== null && (!Number.isInteger(config.tvDisplayId) || !displays.some(d => d.id === config.tvDisplayId))) throw Error('Wybierz dostępny ekran telewizora.');
  if (config.tvDisplayId === config.kioskDisplayId) throw Error('Kiosk i telewizor muszą korzystać z różnych ekranów.');
  return { kioskDisplayId: config.kioskDisplayId, tvDisplayId: config.tvDisplayId };
}
module.exports = { defaults, resolve, validate };
