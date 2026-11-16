import { creditsLabel, creditsPerSecond, maxTopUp, packs, rubles, unitPrice } from './prices.js?v=tariffs';

const list = document.querySelector('#tariff-list');
for (const pack of packs) {
  const row = document.createElement('li');
  const count = document.createElement('span');
  const amount = document.createElement('strong');
  count.textContent = creditsLabel(pack.credits);
  amount.textContent = rubles(pack.amount);
  row.append(count, amount);
  list.append(row);
}

document.querySelector('#tariff-custom').textContent =
  `Можно купить от 1 до ${maxTopUp} кредитов по ${rubles(unitPrice)} за кредит.`;
document.querySelector('#tariff-rates').textContent = Object.entries(creditsPerSecond)
  .map(([resolution, cost]) => `${resolution} — ${creditsLabel(cost)} за секунду`).join(' · ');
