export const unitPrice = 2500;
export const maxTopUp = 120;
export const creditsPerSecond = Object.freeze({ '720p': 1, '1080p': 2 });
export const packs = Object.freeze([
  { id: 'try', credits: 4, amount: 10_000 },
  { id: 'hd', credits: 8, amount: 20_000 },
  { id: 'start', credits: 24, amount: 57_600 },
  { id: 'series', credits: 60, amount: 138_000 },
]);

const price = new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const plural = new Intl.PluralRules('ru');
const endings = { one: 'кредит', few: 'кредита', many: 'кредитов', other: 'кредита' };

export const creditsLabel = (amount) => `${amount} ${endings[plural.select(amount)]}`;
export const rubles = (amount) => price.format(amount / 100);
