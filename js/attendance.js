// Відмітки присутності на недільних пробіжках.
// Поки що дані зберігаються локально в браузері. Коли з'явиться бекенд,
// достатньо замінити реалізацію load/save, інтерфейс Attendance лишиться тим самим.
(function () {
  const KEY = "titan.attendance.v1";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  window.Attendance = {
    list: load,
    count: () => load().length,
    isRunDay: () => new Date().getDay() === 0,
    checkedInToday: () => load().includes(today()),
    checkIn() {
      const list = load();
      if (!this.isRunDay() || list.includes(today())) return false;
      list.push(today());
      save(list);
      return true;
    },
  };
})();
