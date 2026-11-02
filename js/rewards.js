// Бонусна програма клубу «Марафон підтримки»: кількість недільних пробіжок за рік → подарунок.
// Ті самі пороги, що в дашборді клубу. Використовують вкладка «Клуб» і профіль.
window.REWARDS = [
  { runs: 5,  name: "Кава",      icon: "☕" },
  { runs: 15, name: "Шкарпетки", icon: "🧦" },
  { runs: 25, name: "Футболка",  icon: "👕" },
  { runs: 35, name: "Худі",      icon: "🧥" },
  { runs: 45, name: "Рюкзак",    icon: "🎒" },
];

window.nextReward = function (visits) {
  return window.REWARDS.find((r) => visits < r.runs) || null;
};
