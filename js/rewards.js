// Бонусна програма клубу: кількість недільних пробіжок → подарунок.
window.REWARDS = [
  { runs: 5,  name: "Кава",      icon: "☕" },
  { runs: 15, name: "Шкарпетки", icon: "🧦" },
  { runs: 25, name: "Футболка",  icon: "👕" },
  { runs: 35, name: "Худі",      icon: "🧥" },
];

window.nextReward = function (visits) {
  return window.REWARDS.find((r) => visits < r.runs) || null;
};
