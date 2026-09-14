const kiosk = document.getElementById('kiosk-screen');
const tv = document.getElementById('tv-screen');
const notice = document.getElementById('notice');
async function refresh() {
  const { displays, config, primaryId } = await window.screens.get();
  const option = (value, text) => { const element = document.createElement('option'); element.value = value; element.textContent = text; return element; };
  kiosk.replaceChildren(); tv.replaceChildren(option('', 'Nie uruchamiaj widoku TV'));
  for (const [index, display] of displays.entries()) {
    const text = `Ekran ${index + 1} · ${display.label || (display.internal ? 'Ekran laptopa' : 'Monitor')} · ${display.bounds.width} × ${display.bounds.height}${display.id === primaryId ? ' · główny' : ''}`;
    kiosk.append(option(display.id, text)); tv.append(option(display.id, text));
  }
  for (const [select, id] of [[kiosk, config.kioskDisplayId], [tv, config.tvDisplayId]]) {
    if (id !== null && !displays.some(d => d.id === id)) select.append(option(id, 'Zapamiętany ekran — obecnie odłączony'));
    select.value = id === null ? '' : String(id);
  }
  notice.textContent = displays.length < 2 ? 'Wykryto jeden ekran. Podłącz telewizor i w Windows wybierz „Rozszerz”.' : '';
}
document.getElementById('identify').onclick = () => window.screens.identify();
document.getElementById('screens-form').onsubmit = async event => {
  event.preventDefault();
  const submit = document.querySelector('button[type=submit]');
  submit.disabled = true;
  const result = await window.screens.save({ kioskDisplayId: Number(kiosk.value), tvDisplayId: tv.value === '' ? null : Number(tv.value) });
  submit.disabled = false;
  notice.textContent = result.error || 'Zapisano ustawienia.';
};
window.screens.onChange(refresh);
void refresh();
