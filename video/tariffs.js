import { creditsLabel, creditsPerSecond, maxTopUp, packs, rubles, unitPrice } from './prices.js?v=tariffs';

export function renderTariffs(config = { packs, creditsPerSecond, unitPrice, maxTopUp }, purchase) {
  const list = document.querySelector('#tariff-list');
  list.replaceChildren();
  for (const pack of config.packs) {
    const row = document.createElement('li');
    row.className = 'tariff-option';
    const count = document.createElement('span');
    const amount = document.createElement('strong');
    count.textContent = creditsLabel(pack.credits);
    amount.textContent = rubles(pack.amount);
    if (purchase) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tariff-buy';
      button.dataset.pack = pack.id;
      button.append(count, amount);
      button.addEventListener('click', () => purchase(pack.id));
      row.append(button);
    } else {
      row.classList.add('tariff-option-static');
      row.append(count, amount);
    }
    list.append(row);
  }

  document.querySelector('#tariff-custom').textContent =
    `Можно купить от 1 до ${config.maxTopUp} кредитов по ${rubles(config.unitPrice)} за кредит.`;
  document.querySelector('#tariff-rates').textContent = Object.entries(config.creditsPerSecond)
    .map(([resolution, cost]) => `${resolution} — ${creditsLabel(cost)} за секунду`).join(' · ');
}

if (document.body.dataset.topUp === 'demo') renderTariffs();
