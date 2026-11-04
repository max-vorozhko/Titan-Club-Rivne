// Клуб: відвідуваність недільних пробіжок. Спільне для адмінки (admin.html) і публічної вкладки «Клуб».
// Публічні дані — документ club/public: лише вигадані персонажі замість імен, тижні, кілометри й хто був.
(function () {
  // Вигадані персонажі для публічної статистики (прикметник узгоджений з назвою тварини)
  const PERSONAS = [
    ["🦊", "Швидкий Лис"], ["🐻", "Бурий Ведмідь"], ["🐺", "Сірий Вовк"], ["🦌", "Легкий Олень"],
    ["🐆", "Плямиста Пантера"], ["🦅", "Гордий Орел"], ["🐎", "Вороний Кінь"], ["🐇", "Спритний Заєць"],
    ["🦉", "Мудра Сова"], ["🐿️", "Руда Білка"], ["🦬", "Могутній Зубр"], ["🐗", "Впертий Кабан"],
    ["🦫", "Працьовитий Бобер"], ["🦔", "Колючий Їжак"], ["🐢", "Мудра Черепаха"], ["🦢", "Білий Лебідь"],
    ["🐬", "Веселий Дельфін"], ["🦈", "Стрімка Акула"], ["🐅", "Смугастий Тигр"], ["🦁", "Хоробрий Лев"],
    ["🐧", "Невтомний Пінгвін"], ["🦩", "Рожевий Фламінго"], ["🐝", "Дзвінка Бджола"], ["🦋", "Барвистий Метелик"],
    ["🐈", "Хитрий Кіт"], ["🐕", "Вірний Пес"], ["🦡", "Сміливий Борсук"], ["🦦", "Грайлива Видра"],
    ["🐫", "Витривалий Верблюд"], ["🦘", "Стрибучий Кенгуру"], ["🐊", "Зелений Крокодил"], ["🦒", "Висока Жирафа"],
    ["🐘", "Сильний Слон"], ["🦓", "Смугаста Зебра"], ["🐼", "Лагідна Панда"], ["🐨", "Сонний Коала"],
    ["🦙", "Пухнаста Лама"], ["🦜", "Балакучий Папуга"], ["🐓", "Ранній Півень"], ["🦆", "Дика Качка"],
    ["🐋", "Великий Кит"], ["🐙", "Хитрий Восьминіг"], ["🦀", "Червоний Краб"], ["🐞", "Крапчасте Сонечко"],
    ["🦎", "Прудка Ящірка"], ["🐉", "Вогняний Дракон"], ["🦄", "Чарівний Єдиноріг"], ["🐐", "Гірський Козел"],
    ["🦇", "Нічний Кажан"], ["🐦‍⬛", "Чорний Крук"], ["🦚", "Пишний Павич"], ["🐹", "Кмітливий Хом'як"],
    ["🦭", "Добрий Тюлень"], ["🐃", "Спокійний Буйвол"], ["🦏", "Невгамовний Носоріг"], ["🐑", "Кучерява Вівця"],
    ["🦣", "Древній Мамонт"], ["🐌", "Неквапливий Равлик"], ["🦖", "Грізний Тиранозавр"], ["🐟", "Срібляста Рибка"],
  ];

  // Вільний персонаж для нового атлета (випадковий з тих, що ще не зайняті)
  function pickPersona(taken) {
    const used = new Set(taken);
    const free = PERSONAS.filter(([, name]) => !used.has(name));
    const pool = free.length ? free : PERSONAS;
    const [emoji, persona] = pool[Math.floor(Math.random() * pool.length)];
    return { emoji, persona: free.length ? persona : `${persona} ${used.size + 1}` };
  }

  // ---------- Тижні: номер тижня як у таблиці й у «Неділі» (ISO, тиждень з понеділка) ----------

  const DAY = 86400000;

  // Понеділок першого тижня року (тиждень, що містить 4 січня), за UTC, щоб не залежати від часового поясу
  function week1Monday(year) {
    const jan4 = Date.UTC(year, 0, 4);
    const wd = (new Date(jan4).getUTCDay() + 6) % 7; // 0 = понеділок
    return jan4 - wd * DAY;
  }

  function weeksInYear(year) {
    return Math.round((week1Monday(year + 1) - week1Monday(year)) / (7 * DAY));
  }

  // Неділя тижня: YYYY-MM-DD
  function sundayOf(year, week) {
    return new Date(week1Monday(year) + ((week - 1) * 7 + 6) * DAY).toISOString().slice(0, 10);
  }

  // Тиждень останньої неділі, що вже настала (сьогодні або раніше) за київським часом
  function lastSunday(now) {
    const w = Kyiv.wall(now);
    const today = Date.UTC(w.y, w.m - 1, w.d);
    const sunday = today - new Date(today).getUTCDay() * DAY;
    // ISO-рік неділі = рік її четверга
    const year = new Date(sunday - 3 * DAY).getUTCFullYear();
    const week = Math.floor((sunday - week1Monday(year)) / (7 * DAY)) + 1;
    return { year, week };
  }

  const runId = (year, week) => `${year}-${week}`;
  function parseRunId(id) {
    const [year, week] = id.split("-").map(Number);
    return { year, week };
  }

  function formatDate(iso) {
    return Kyiv.dayMonthOfISO(iso);
  }

  // ---------- Статистика з публічного документа ----------
  // pub = { athletes: {id: {p, e, a}}, runs: {"2026-45": {date, km, present: [id]}} }
  function stats(pub) {
    const runs = Object.entries((pub && pub.runs) || {})
      .map(([id, r]) => ({ id, ...parseRunId(id), date: r.date, km: typeof r.km === "number" ? r.km : null, present: r.present || [] }))
      .sort((a, b) => a.year - b.year || a.week - b.week);
    const athletes = Object.entries((pub && pub.athletes) || {}).map(([id, a]) => ({
      id, persona: a.p, emoji: a.e, active: a.a !== false, count: 0, km: 0, streak: 0, bestStreak: 0,
    }));
    const byId = new Map(athletes.map((a) => [a.id, a]));
    let clubKm = 0;
    let marks = 0;
    for (const r of runs) {
      const here = new Set(r.present);
      for (const a of athletes) {
        if (here.has(a.id)) {
          a.count++;
          a.km += r.km || 0;
          a.streak++;
          a.bestStreak = Math.max(a.bestStreak, a.streak);
        } else a.streak = 0;
      }
      r.count = r.present.filter((id) => byId.has(id)).length;
      clubKm += (r.km || 0) * r.count;
      marks += r.count;
    }
    const held = runs.length;
    athletes.forEach((a) => (a.pct = held ? Math.round((a.count / held) * 100) : 0));
    return {
      runs,
      athletes,
      held,
      clubKm: Math.round(clubKm * 10) / 10,
      avg: held ? Math.round((marks / held) * 10) / 10 : 0,
      kmMissing: runs.filter((r) => r.km === null).length,
    };
  }

  // 1 пробіжка, 3 пробіжки, 5 пробіжок
  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  }

  window.Club = { plural, PERSONAS, pickPersona, weeksInYear, sundayOf, lastSunday, runId, parseRunId, formatDate, stats };
})();
