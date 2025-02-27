require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const Parse = require("parse/node");

Parse.initialize(process.env.BACK4APP_APP_ID, process.env.BACK4APP_JS_KEY);
Parse.serverURL = process.env.BACK4APP_SERVER_URL;

const bot = new Telegraf(process.env.BOT_TOKEN);

const userSessions = {}; // Хранение временных данных пользователя

async function getRandomTheme(excludedTheme = null) {
  try {
    const Themes = Parse.Object.extend("Themes");
    const query = new Parse.Query(Themes);
    if (excludedTheme) {
      query.notEqualTo("theme", excludedTheme);
    }
    const results = await query.find();

    if (results.length === 0) return "Нет доступных тем";
    return results[Math.floor(Math.random() * results.length)].get("theme");
  } catch (error) {
    console.error("Ошибка при получении темы:", error);
    return "Ошибка при выборе темы";
  }
}

async function displayGames(ctx, statusFilter = null) {
  const userId = ctx.from.id;
  const Game = Parse.Object.extend("Games");

  const query1 = new Parse.Query(Game);
  query1.equalTo("creatorId", userId);

  const query2 = new Parse.Query(Game);
  query2.equalTo("enemyId", userId);

  const mainQuery = Parse.Query.or(query1, query2);
  if (statusFilter) {
    mainQuery.equalTo("status", statusFilter);
    mainQuery.descending("createdAt");
    mainQuery.limit(10);
  } else {
    mainQuery.notEqualTo("status", "finish");
    mainQuery.descending("createdAt");
  }

  try {
    const games = await mainQuery.find();
    if (games.length === 0) {
      return ctx.reply("⚠️ Нет игр в выбранной категории.");
    }

    for (const game of games) {
      const gameId = game.id;
      const creatorName = game.get("creatorName") || "Аноним";
      const creatorId = game.get("creatorId");
      const enemyName = game.get("enemyName") || "";
      const status = game.get("status");
    //   const createdAt = game.get("createdAt").toLocaleString();
    const createdAt = game.get('createdAt').toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',  // 🔹 Указываем часовой пояс (можно изменить)
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
      const matchTheme = game.get("MatchTheme");
      const mismatchTheme = game.get("MismatchTheme");

      let statusText = "⏳ В поиске соперника";

      if (status === "full" && userId === creatorId) statusText = "🎯 Ваш ход";
      if (status === "full" && userId !== creatorId)
        statusText = "⏳ Ожидание ведущего";
      if (status === "working" && userId === creatorId)
        statusText = "🎯 Ваш ход";
      if (status === "working" && userId !== creatorId)
        statusText = "⏳ Ожидание ведущего";
      if (status === "finish") statusText = "✅ Игра завершена";

      const message =
        `🎮 *Данные игры:*\n\n` +
        `🆔 *ID:* \`${gameId}\`\n` +
        `📅 *Дата создания:* ${createdAt}\n` +
        `👤 *Создатель:* ${creatorName}\n` +
        `🎭 *Соперник:* ${enemyName}\n` +
        `📌 *Статус:* ${statusText}`;

      const message2 =
        `🎮 *Данные игры:*\n\n` +
        `🆔 *ID:* \`${gameId}\`\n` +
        `📅 *Дата создания:* ${createdAt}\n` +
        `👤 *Создатель:* ${creatorName}\n` +
        `🎭 *Соперник:* ${enemyName}\n` +
        `📑 *Игра на совпадение:* ${matchTheme}\n` +
        `📑 *Игра на несовпадение:* ${mismatchTheme}\n` +
        `📌 *Статус:* ${statusText}`;

      if (status !== "finish") {
        await ctx.replyWithMarkdown(
          message2,
          Markup.inlineKeyboard([
            [Markup.button.callback("▶️ Открыть игру", `game_${gameId}`)],
          ])
        );
      } else {
        await ctx.replyWithMarkdown(
          message,
          Markup.inlineKeyboard([
            [Markup.button.callback("▶️ Открыть игру", `game_${gameId}`)],
          ])
        );
      }
    }
  } catch (error) {
    console.error("Ошибка при получении игр:", error);
    ctx.reply("⚠️ Произошла ошибка. Попробуйте позже.");
  }
}


bot.start((ctx) => {
  userSessions[ctx.from.id] = {
    step: null,
    matchValues: [],
    mismatchValues: [],
  };
  ctx.reply(
    "👋 Добро пожаловать в интеллектуальную викторину «Совпадения»!\n\n📜 Используйте боковое меню для навигации по командам.",
    Markup.keyboard([
      ["🎮 Создать игру", "👥 Присоединиться к игре"],
      ["📂 Мои игры", "ℹ️ Описание команд"],
      ["📜 Правила игры"],
    ])
      .resize()
      .oneTime()
  );
});

bot.hears("ℹ️ Описание команд", async (ctx) => {
  await ctx.replyWithMarkdown(
    `📝 *Описание команд:*\n\n` +
      `▶️ */start* – Запуск бота и открытие главного меню.\n` +
      `🛠️ */my_games* – Просмотр текущих и последних 10 завершённых игр.\n` +
      `⚔️ */create_game* – Начало новой игры.\n` +
      `👥 */join_game* – Присоединение к существующей игре.\n` +
      `📜 */rules* – Правила игры.`
  );
});

bot.hears("🎮 Создать игру", async (ctx) => {
  await bot.handleUpdate({
    callback_query: {
      data: "create_game",
      from: ctx.from,
      message: ctx.message,
    },
  });
});

bot.hears("📂 Мои игры", async (ctx) => {
  await bot.handleUpdate({
    callback_query: { data: "my_games", from: ctx.from, message: ctx.message },
  });
});

bot.hears("👥 Присоединиться к игре", async (ctx) => {
  await bot.handleUpdate({
    callback_query: { data: "join_game", from: ctx.from, message: ctx.message },
  });
});

bot.hears("📜 Правила игры", async (ctx) => {
  await bot.handleUpdate({
    callback_query: { data: "rules", from: ctx.from, message: ctx.message },
  });
});

bot.command("my_games", async (ctx) => {
  await ctx.reply(
    "Выберите категорию игр:",
    Markup.inlineKeyboard([
      [Markup.button.callback("🎮 Текущие игры", "current_games")],
      [Markup.button.callback("✅ Завершённые игры", "finished_games")],
    ])
  );
});

bot.command("create_game", async (ctx) => {
  await bot.handleUpdate({
    callback_query: {
      data: "create_game",
      from: ctx.from,
      message: ctx.message,
    },
  });
});

bot.command("join_game", async (ctx) => {
  await bot.handleUpdate({
    callback_query: {
      data: "join_game",
      from: ctx.from,
      message: ctx.message,
    },
  });
});

bot.command("rules", async (ctx) => {
  await bot.handleUpdate({
    callback_query: {
      data: "rules",
      from: ctx.from,
      message: ctx.message,
    },
  });
});

bot.action("rules", (ctx) => {
  ctx.reply(`Правила игры в «Совпадения»:
Игрокам даётся две темы: первая - на совпадение, вторая - на несовпадение.
В игре на совпадение игрокам нужно предложить 6 ассоциаций на заданную тему таким образом, чтобы было как можно больше совпадений с соперником.
В игре на несовпадение игрокам нужно предложить 6 ассоциаций на заданную тему таким образом, чтобы было как можно меньше совпадений с соперником.
После игры игроки делают ставки на количество совпадений.
Если ставка меньше количества совпадений - игрок получает то количество очков, которое поставил.
Если ставка больше количества совпадений - игрок не получает очков.
Если ставка равна количеству совпадений - игрок получает соответствующее количество очков.
Игрок может создать свою игру (со своими темами или случайными) и пригласить другого игрока.
Или игрок может присоединиться к случайной игре.
Игрок, создавший игру является ведущим и судьёй игры.
Приятной игры!
PS. И не забывайте обновлять данные :)
`);
});

bot.action("my_games", async (ctx) => {
  await ctx.reply(
    "Выберите категорию игр:",
    Markup.inlineKeyboard([
      [Markup.button.callback("🎮 Текущие игры", "current_games")],
      [Markup.button.callback("✅ Завершённые игры", "finished_games")],
    ])
  );
});

// 🔹 Обработчики для кнопок
bot.action("current_games", (ctx) => displayGames(ctx, null));

bot.action("finished_games", (ctx) => displayGames(ctx, "finish"));

bot.action("create_game", async (ctx) => {
  const userId = ctx.from.id;
  const Game = Parse.Object.extend("Games");
  const query1 = new Parse.Query(Game);
  query1.equalTo("creatorId", userId);
  query1.notEqualTo("status", "finish"); // 🔹 Только текущие игры

  const query2 = new Parse.Query(Game);
  query2.equalTo("enemyId", userId);
  query2.notEqualTo("status", "finish");

  const mainQuery = Parse.Query.or(query1, query2);

  try {
    const currentGamesCount = await mainQuery.count(); // 🔹 Подсчёт текущих игр
    if (currentGamesCount >= 10) {
      return ctx.reply(
        "⚠️ Вы достигли лимита в 10 текущих игр. Завершите одну из игр, чтобы создать новую!"
      );
    }

    // 🔹 Если лимит не достигнут — продолжаем создание игры
    userSessions[userId] = {
      step: "choose_theme",
      matchValues: [],
      mismatchValues: [],
    };
    await ctx.reply(
      "Выберите способ выбора темы:",
      Markup.inlineKeyboard([
        [Markup.button.callback("✏️ Своя тема", "custom_theme")],
        [Markup.button.callback("🎲 Случайная тема", "random_theme")],
      ])
    );
  } catch (error) {
    console.error("Ошибка при проверке количества игр:", error);
    ctx.reply("⚠️ Произошла ошибка. Попробуйте позже.");
  }
});

bot.action("join_game", (ctx) => {
  ctx.reply(
    "Выберите способ присоединения:",
    Markup.inlineKeyboard([
      [Markup.button.callback("🧑‍🤝‍🧑 Войти в игру", "enter_game_id")],
      [Markup.button.callback("🎲 Случайный соперник", "random_opponent")],
    ])
  );
});

// 🔹 Обработчик нажатия "Войти в игру" (ввод ID)
bot.action("enter_game_id", (ctx) => {
  userSessions[ctx.from.id] = { step: "enter_game_id" };
  ctx.reply("Введите ID игры для присоединения:");
});

bot.action("custom_theme", (ctx) => {
  userSessions[ctx.from.id] = {
    step: "enter_custom_theme",
    matchValues: [],
    mismatchValues: [],
    isRandom: false,
  };
  ctx.reply("Введите тему игры на совпадение:");
});

// Обработчик кнопки "Случайная тема"
bot.action("random_theme", async (ctx) => {
  const theme = await getRandomTheme();
  userSessions[ctx.from.id] = {
    step: "enter_match_values",
    theme,
    matchValues: [],
    mismatchValues: [],
    isRandom: true, // Устанавливаем isRandom = true при случайной теме
  };
  const message =
    `Тема игры на совпадение:\n` +
    `<b>${theme}</b>\n` +
    `Введите первое значение: `;

  await ctx.reply(message, { parse_mode: "HTML" });

  // ctx.reply(`Тема игры на совпадение: ${theme}\nВведите первое значение:`);
});

bot.action("random_opponent", async (ctx) => {
  const userId = ctx.from.id;
  const Game = Parse.Object.extend("Games");
  const query = new Parse.Query(Game);

  try {
    // 🔹 Поиск игры со статусом waiting, где пользователь не участвует
    query.equalTo("status", "waiting");
    query.notEqualTo("creatorId", userId);
    query.doesNotExist("enemyId");
    query.limit(1);

    const availableGames = await query.find();

    if (availableGames.length === 0) {
      return ctx.reply(
        "❌ В данный момент нет доступных игр. Попробуйте позже или создайте свою!"
      );
    }

    const game = availableGames[0];
    userSessions[userId] = {
      step: "enter_match_values_enemy",
      game,
      theme: game.get("MatchTheme"),
      alternateTheme: game.get("MismatchTheme"),
      matchValues: [],
      mismatchValues: [],
    };
    const message =
      `🎮 Вы присоединились к игре со случайным соперником!\n` +
      `📌 Тема игры на совпадение: \n``<b>${game.get("MatchTheme")}</b>\n` +
      `Введите первое значение: `;
    // ctx.reply(`🎮 Вы присоединились к игре со случайным соперником!\n\n📌 Тема игры на совпадение: ${game.get('MatchTheme')}\nВведите первое значение:`);
    await ctx.reply(message, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Ошибка при поиске игры:", error);
    ctx.reply("⚠️ Произошла ошибка при поиске игры. Попробуйте позже.");
  }
});

bot.action(/^game_(.+)$/, async (ctx) => {
  // ✅ Отвечаем сразу, чтобы избежать ошибки
  // ctx.answerCbQuery().catch((err) => console.error('Ошибка при answerCbQuery:', err));

  const gameId = ctx.match[1];
  const userId = ctx.from.id;
  const Game = Parse.Object.extend("Games");
  const query = new Parse.Query(Game);

  try {
    const game = await query.get(gameId);
    if (!game) {
      return ctx.answerCbQuery("❌ Игра не найдена.", { show_alert: true });
    }

    const creatorId = game.get("creatorId");
    const creatorName = (game.get("creatorName") || "Аноним").replace(
      /[-._]/g,
      "\\$&"
    );
    const enemyName = (game.get("enemyName") || "Ожидает соперника").replace(
      /[-._]/g,
      "\\$&"
    );
    const status = game.get("status");
    const enemyId = game.get("enemyId");

    if (status === "waiting" && userId !== creatorId) {
      return ctx.answerCbQuery("⏳ Ожидание ведущего...", { show_alert: true });
    } else if (status === "waiting" && userId === creatorId) {
      return ctx.answerCbQuery("⏳ Ожидание соперника...", {
        show_alert: true,
      });
    } else if (userId === creatorId && status === "full") {
      const matchTheme = (game.get("MatchTheme") || "Не указана").replace(
        /[-._]/g,
        "\\$&"
      );
      const matchValuesCreator = (game.get("MatchValuesCreator") || []).map(
        (v) => v.replace(/[-._]/g, "\\$&")
      );
      const mismatchTheme = (game.get("MismatchTheme") || "Не указана").replace(
        /[-._]/g,
        "\\$&"
      );
      const mismatchValuesCreator = (
        game.get("MismatchValuesCreator") || []
      ).map((v) => v.replace(/[-._]/g, "\\$&"));
      const rateCreator = (game.get("rateCreator") || "Не сделана")
        .toString()
        .replace(/[-._]/g, "\\$&");

      ctx.answerCbQuery("📋 Данные отправлены!", { show_alert: false });

      const message =
        `🎮 *Данные игры:*\n\n` +
        `🆔 *ID игры:* \`${gameId}\`\n` +
        `👤 *Создатель:* ${creatorName}\n` +
        `🎭 *Соперник:* ${enemyName}\n` +
        // `⚖️ *Ваша ставка:* ${rateCreator}\n\n` +
        `📌 Тема игры на совпадение: *${matchTheme}\n*` +
        `────────────────────────\n` +
        `📋 *Ваши значения:*\n` +
        matchValuesCreator.map((v, i) => `${i + 1}\\.\ ${v}`).join("\n") +
        "\n\n" +
        `📌 Тема игры на несовпадение: *${mismatchTheme}\n*` +
        `────────────────────────\n` +
        `📋 *Ваши значения:*\n` +
        mismatchValuesCreator.map((v, i) => `${i + 1}\\.\ ${v}`).join("\n");

      await ctx.replyWithMarkdownV2(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💰 Сделать ставку", callback_data: `bet_${gameId}` }],
          ],
        },
      });
    } else if (userId === creatorId && status === "working") {
      const theme1 = game.get("MatchTheme") || "Не указана";
      const theme2 = game.get("MismatchTheme") || "Не указана";
      const matchValuesCreator = game.get("MatchValuesCreator") || [];
      const mismatchValuesCreator = game.get("MismatchValuesCreator") || [];
      const matchValuesEnemy = game.get("matchValuesEnemy") || [];
      const mismatchValuesEnemy = game.get("mismatchValuesEnemy") || [];
      const rateCreator = game.get("rateCreator") || "Не сделана";
      const rateEnemy = game.get("rateEnemy") || "Не сделана";

      ctx.answerCbQuery("📋 Данные отправлены!", { show_alert: false });

      const message =
        `🎮 <b>Данные игры:</b>\n\n` +
        `🆔 <b>ID игры:</b> <code>${gameId}</code>\n` +
        `👤 <b>Соперник:</b> ${enemyName}\n` +
        `<b>Игра на совпадение:</b> ${theme1}\n` +
        `────────────────────────\n\n` +
        `<b>Ваши значения:</b>\n` +
        matchValuesCreator.map((v, i) => `${i + 1}. ${v}`).join("\n") +
        "\n\n" +
        `<b>Значения соперника:</b>\n` +
        matchValuesEnemy.map((v, i) => `${i + 1}. ${v || "-"}`).join("\n") +
        "\n\n";

      await ctx.reply(message, { parse_mode: "HTML" });

      // 🔹 Начало ввода совпадающих значений
      userSessions[userId] = {
        step: "enter_coincidences_match",
        gameId,
        theme: theme1,
        coincidences: [],
        matchValuesCreator,
        matchValuesEnemy,
      };

      await ctx.reply(
        `Введите совпадающие значения для темы: <b>${theme1}</b>\n\n`,
        {
          parse_mode: "HTML",
        }
      );

      await ctx.reply(
        "Нажмите кнопку ✅ ЗАКОНЧИТЬ, если хотите завершить ввод:",
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ ЗАКОНЧИТЬ", `finish_match_${gameId}`)],
        ])
      );
    } else if (status === "finish") {
      const theme1 = game.get("MatchTheme") || "Не указана";
      const theme2 = game.get("MismatchTheme") || "Не указана";
      const matchValuesCreator = game.get("MatchValuesCreator") || [];
      const mismatchValuesCreator = game.get("MismatchValuesCreator") || [];
      const matchValuesEnemy = game.get("matchValuesEnemy") || [];
      const mismatchValuesEnemy = game.get("mismatchValuesEnemy") || [];
      const coincidences = game.get("coincidences") || {
        match: [],
        mismatch: [],
      };
      const rateCreator =
        (game.get("rateCreator") || 0) + (creatorId === userId ? " (вы)" : "");
      const rateEnemy =
        (game.get("rateEnemy") || 0) + (enemyId === userId ? " (вы)" : "");
      const winnerName = game.get("winnerName")
        ? `${game.get("winnerName")}${
            game.get("winnerId") === userId ? " (вы)" : ""
          }`
        : "🤝 Ничья!";

      const message =
        `🎮 <b>Результаты игры:</b>\n\n` +
        `🆔 <b>ID игры:</b> <code>${gameId}</code>\n` +
        `────────────────────────\n` +
        `📌 <b>Игра на совпадение:</b>\n` +
        `${theme1}\n\n` +
        `📝 <b>${creatorName}:</b>\n` +
        matchValuesCreator.map((v, i) => `${i + 1}. ${v}`).join("\n") +
        "\n\n" +
        `📝 <b>${enemyName}:</b>\n` +
        matchValuesEnemy.map((v, i) => `${i + 1}. ${v}`).join("\n") +
        "\n\n" +
        `🎯 <b>Совпадения:</b>\n` +
        (coincidences.match.length > 0 ? coincidences.match.join(", ") : "—") +
        "\n" +
        `────────────────────────\n` +
        `📌 <b>Игра на несовпадение:</b>\n` +
        `${theme2}\n\n` +
        `📝 <b>${creatorName}:</b>\n` +
        mismatchValuesCreator.map((v, i) => `${i + 1}. ${v}`).join("\n") +
        "\n\n" +
        `📝 <b>${enemyName}:</b>\n` +
        mismatchValuesEnemy.map((v, i) => `${i + 1}. ${v}`).join("\n") +
        "\n\n" +
        `🎯 <b>Совпадения:</b>\n` +
        (coincidences.mismatch.length > 0
          ? coincidences.mismatch.join(", ")
          : "—") +
        "\n" +
        `────────────────────────\n` +
        `⚖️ <b>Ставка ведущего:</b> ${rateCreator}\n` +
        `⚖️ <b>Ставка соперника:</b> ${rateEnemy}\n` +
        `────────────────────────\n\n` +
        `🏆 <b>Победитель:</b> ${winnerName}`;

      await ctx.reply(message, { parse_mode: "HTML" });
    } else if (userId !== creatorId && status === "full") {
      ctx.answerCbQuery("⏳ Ожидание хода ведущего!..", { show_alert: true });
    } else if (status === "working" && userId !== creatorId) {
      ctx.answerCbQuery("⏳ Ожидание хода ведущего!..", { show_alert: true });
    } else {
      ctx.answerCbQuery("❌ Вы не являетесь создателем этой игры.", {
        show_alert: true,
      });
    }
  } catch (error) {
    console.error("Ошибка при открытии игры:", error);
    ctx.answerCbQuery("⚠️ Ошибка. Попробуйте позже.", { show_alert: true });
  }
});

bot.action(/^bet_(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  const userId = ctx.from.id;

  const Game = Parse.Object.extend("Games");
  const query = new Parse.Query(Game);

  try {
    const game = await query.get(gameId);
    if (!game)
      return ctx.answerCbQuery("❌ Игра не найдена.", { show_alert: true });

    if (game.get("creatorId") !== userId) {
      return ctx.answerCbQuery("❌ Вы не являетесь создателем этой игры.", {
        show_alert: true,
      });
    }

    // Сохраняем игру в сессии и переводим в режим ставки
    userSessions[userId] = { step: "enter_rate_creator", game };
    ctx.reply("Введите вашу ставку (число от 0 до 12):");
    ctx.answerCbQuery();
  } catch (error) {
    console.error("Ошибка при открытии ставки:", error);
    ctx.answerCbQuery("⚠️ Ошибка. Попробуйте позже.", { show_alert: true });
  }
});

bot.action(/^finish_match_(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  const userId = ctx.from.id;
  const session = userSessions[userId];

  if (!session || session.gameId !== gameId) return;

  session.matchCoincidences = [...session.coincidences]; // Сохраняем совпадения для первой темы
  session.coincidences = []; // Очищаем список для второй темы
  session.step = "enter_coincidences_mismatch";

  const Game = Parse.Object.extend("Games");
  const query = new Parse.Query(Game);
  const game = await query.get(gameId);
  if (!game) return ctx.reply("⚠️ Ошибка: игра не найдена.");

  // 🔹 Данные по второй теме
  const theme2 = game.get("MismatchTheme") || "Не указана";
  const mismatchValuesCreator = game.get("MismatchValuesCreator") || [];
  const mismatchValuesEnemy = game.get("mismatchValuesEnemy") || [];
  const enemyName = game.get("enemyName");

  ctx.answerCbQuery("📋 Данные отправлены!", { show_alert: false });

  const message =
    `🎮 <b>Данные игры:</b>\n\n` +
    `🆔 <b>ID игры:</b> <code>${gameId}</code>\n` +
    `👤 <b>Соперник:</b> ${enemyName}\n` +
    `<b>Игра на несовпадение:</b> ${theme2}\n` +
    `────────────────────────\n\n` +
    `<b>Ваши значения:</b>\n` +
    mismatchValuesCreator.map((v, i) => `${i + 1}. ${v}`).join("\n") +
    "\n\n" +
    `<b>Значения соперника:</b>\n` +
    mismatchValuesEnemy.map((v, i) => `${i + 1}. ${v || "-"}`).join("\n") +
    "\n\n";

  await ctx.reply(message, { parse_mode: "HTML" });

  await ctx.reply(
    `Введите совпадающие значения для темы: <b>${theme2}</b>\n\n`,
    {
      parse_mode: "HTML",
    }
  );

  await ctx.reply(
    "Нажмите кнопку ✅ ЗАКОНЧИТЬ, если хотите завершить ввод:",
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ ЗАКОНЧИТЬ", `finish_mismatch_${gameId}`)],
    ])
  );
});

bot.action(/^finish_mismatch_(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  const userId = ctx.from.id;
  const session = userSessions[userId];

  if (!session || session.gameId !== gameId) return;

  // Получаем игру из базы
  const Game = Parse.Object.extend("Games");
  const query = new Parse.Query(Game);
  const gameObj = await query.get(gameId);
  if (!gameObj) return ctx.reply("⚠️ Ошибка: игра не найдена.");

  // 🔹 Подсчет общего количества совпадений
  const totalCoincidences =
    (session.matchCoincidences.length || 0) +
    (session.coincidences.length || 0);

  // 🔹 Получаем ставки игроков
  const rateEnemy = gameObj.get("rateEnemy") || 0;
  const rateCreator = gameObj.get("rateCreator") || 0;

  // 🔹 Рассчитываем результаты
  const resultEnemy = rateEnemy <= totalCoincidences ? rateEnemy : 0;
  const resultCreator = rateCreator <= totalCoincidences ? rateCreator : 0;

  // 🔹 Определяем победителя
  let winnerId = null;
  let winnerName = null;

  if (resultCreator > resultEnemy) {
    winnerId = gameObj.get("creatorId");
    winnerName = gameObj.get("creatorName");
  } else if (resultEnemy > resultCreator) {
    winnerId = gameObj.get("enemyId");
    winnerName = gameObj.get("enemyName");
  }

  // 🔹 Сохраняем данные в базе
  gameObj.set("coincidences", {
    match: session.matchCoincidences || [],
    mismatch: session.coincidences || [],
    total: totalCoincidences,
  });
  gameObj.set("resultCreator", resultCreator);
  gameObj.set("resultEnemy", resultEnemy);
  gameObj.set("winnerId", winnerId);
  gameObj.set("winnerName", winnerName);
  gameObj.set("status", "finish");

  await gameObj.save();
  delete userSessions[userId];

  // 🔹 Отправляем сообщение об окончании игры
  let winnerText = winnerName ? `🏆 Победитель: *${winnerName}*` : "🤝 Ничья!";

  await ctx.reply(
    `✅ Игра завершена!\n\n` +
      `🎯 Совпадений: ${totalCoincidences}\n\n` +
      `👤 ${gameObj.get("creatorName")}: ${resultCreator} очк.\n` +
      `👤 ${gameObj.get("enemyName")}: ${resultEnemy} очк.\n\n` +
      winnerText
  );

  return displayGames(ctx);
});

bot.on("text", async (ctx) => {
  const session = userSessions[ctx.from.id];
  if (!session) return;
  if (!session || !session.step)
    return ctx.reply("⚠️ Неизвестная команда. Начните с /start");
  // 🔹 Если идет процесс создания игры
  switch (session.step) {
    case "enter_custom_theme":
      session.theme = ctx.message.text;
      session.step = "enter_match_values";
      ctx.reply(
        `Тема игры на совпадение: *${session.theme}*\nВведите первое значение:`
      );
      break;

    case "enter_match_values":
      session.matchValues.push(ctx.message.text);
      if (session.matchValues.length < 6) {
        ctx.reply(
          `Введите следующее значение (${session.matchValues.length + 1}/6):`
        );
      } else {
        if (session.isRandom) {
          // Если первая тема из базы, выбираем вторую тоже из базы
          session.alternateTheme = await getRandomTheme();
          session.step = "enter_mismatch_values";
          const message =
            `Тема игры на несовпадение:\n` +
            `<b>${session.alternateTheme}</b>\n` +
            `Введите первое значение: `;

          await ctx.reply(message, { parse_mode: "HTML" });
        } else {
          // Если первая тема введена пользователем, запрашиваем вторую у него
          session.step = "enter_new_custom_theme";
          ctx.reply("Введите тему игры на несовпадение:");
        }
      }
      break;

    case "enter_new_custom_theme":
      session.alternateTheme = ctx.message.text;
      session.step = "enter_mismatch_values";
      ctx.reply(
        `Тема игры на несовпадение: *${session.alternateTheme}*\nВведите первое значение:`
      );
      break;

    case "enter_mismatch_values":
      session.mismatchValues.push(ctx.message.text);
      if (session.mismatchValues.length < 6) {
        ctx.reply(
          `Введите следующее значение (${session.mismatchValues.length + 1}/6):`
        );
      } else {
        const Game = Parse.Object.extend("Games");
        const game = new Game();
        game.set("MatchTheme", session.theme);
        game.set("MismatchTheme", session.alternateTheme);
        game.set("MatchValuesCreator", session.matchValues);
        game.set("MismatchValuesCreator", session.mismatchValues);
        game.set("creatorId", ctx.from.id);
        game.set(
          "creatorName",
          ctx.from.username || ctx.from.first_name || "Аноним"
        );
        game.set("status", "waiting");
        await game.save();
        const message = `✅ Игра создана! ID: ` + `<code>${game.id}</code>`;
        await ctx.reply(message, { parse_mode: "HTML" });
        // ctx.reply(`✅ Игра создана! ID: ${game.id}`);
        // session = null;
        delete userSessions[ctx.from.id];
        return displayGames();
      }
      break;

    case "enter_game_id":
      const gameId = ctx.message.text;
      const Game = Parse.Object.extend("Games");
      const query = new Parse.Query(Game);

      try {
        const game = await query.get(gameId);
        const creatorId = game.get("creatorId");
        const enemyId = game.get("enemyId");

        // Проверяем, участвует ли пользователь в игре
        if (creatorId === ctx.from.id || enemyId === ctx.from.id) {
          return ctx.reply(
            "⚠️ Вы уже участвуете в этой игре или игра завершена!"
          );
        }

        session.game = game;
        session.theme = game.get("MatchTheme");
        session.alternateTheme = game.get("MismatchTheme");
        session.matchValues = [];
        session.mismatchValues = [];
        session.step = "enter_match_values_enemy";

        const message =
          `Вы присоединились!\n` +
          `Тема игры на совпадение:\n` +
          `<b>${session.theme}</b>\n` +
          `Введите первое значение: `;

        await ctx.reply(message, { parse_mode: "HTML" });
      } catch (error) {
        ctx.reply("⚠️ Такой игры не существует. Проверьте ID!");
      }
      break;

    case "enter_match_values_enemy":
      session.matchValues.push(ctx.message.text);
      if (session.matchValues.length < 6) {
        ctx.reply(
          `Введите следующее значение (${session.matchValues.length + 1}/6):`
        );
      } else {
        session.step = "enter_mismatch_values_enemy";
        // ctx.reply(`Тема игры на несовпадение: ${session.alternateTheme}\nВведите первое значение:`);
        const message =
          `Тема игры на несовпадение:\n` +
          `<b>${session.alternateTheme}</b>\n` +
          `Введите первое значение: `;

        await ctx.reply(message, { parse_mode: "HTML" });
      }
      break;

    case "enter_mismatch_values_enemy":
      session.mismatchValues.push(ctx.message.text);
      if (session.mismatchValues.length < 6) {
        ctx.reply(
          `Введите следующее значение (${session.mismatchValues.length + 1}/6):`
        );
      } else {
        session.step = "enter_rate_enemy";
        ctx.reply(
          "💰 Сделайте ставку на количество совпадений (число от 0 до 12):"
        );
      }
      break;

    case "enter_rate_enemy":
      const rate = parseInt(ctx.message.text);

      if (isNaN(rate) || rate < 0 || rate > 12) {
        return ctx.reply("⚠️ Введите корректное число от 0 до 12:");
      }

      const game = session.game;
      game.set("matchValuesEnemy", session.matchValues);
      game.set("mismatchValuesEnemy", session.mismatchValues);
      game.set("enemyId", ctx.from.id);
      game.set(
        "enemyName",
        ctx.from.username || ctx.from.first_name || "Аноним"
      );
      game.set("rateEnemy", rate);
      game.set("status", "full");

      await game.save();

      ctx.reply(
        `✔️ Вы успешно присоединились к игре! Ваша ставка: ${rate}. Ожидайте хода ведущего!`
      );
      delete userSessions[ctx.from.id];
      break;

    case "enter_rate_creator":
      const rateCreator = parseInt(ctx.message.text);

      if (isNaN(rateCreator) || rateCreator < 0 || rateCreator > 12) {
        return ctx.reply("⚠️ Введите корректное число от 0 до 12:");
      }

      const gameCreator = session.game;

      // 🔹 Проверка: если ставка уже сделана, отклоняем повторный ввод
      if (gameCreator.get("rateCreator") !== undefined) {
        return ctx.reply(
          "❌ Вы уже сделали ставку! Повторное изменение невозможно."
        );
      }

      gameCreator.set("rateCreator", rateCreator);
      gameCreator.set("status", "working"); // Обновляем статус игры
      await gameCreator.save();

      ctx.reply(`✅ Ваша ставка ${rateCreator} сохранена!`);
      delete userSessions[ctx.from.id];

      // 🔹 Автоматически показываем список игр
      return displayGames(ctx);
      break;

    // 🔹 Ввод совпадающих значений по первой теме
    case "enter_coincidences_match":
      session.coincidences.push(ctx.message.text);
      await ctx.reply(`✅ Добавлено: ${ctx.message.text}`);
      // 🔹 Добавляем кнопку "Закончить"

      await ctx.reply(
        "Нажмите кнопку ✅ ЗАКОНЧИТЬ, если хотите завершить ввод:",
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ ЗАКОНЧИТЬ",
              `finish_match_${session.gameId}`
            ),
          ],
        ])
      );

      break;

    // 🔹 Ввод совпадающих значений по второй теме
    case "enter_coincidences_mismatch":
      session.coincidences.push(ctx.message.text);
      await ctx.reply(`✅ Добавлено: ${ctx.message.text}`);

      await ctx.reply(
        "Нажмите кнопку ✅ ЗАКОНЧИТЬ, если хотите завершить ввод:",
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ ЗАКОНЧИТЬ",
              `finish_mismatch_${session.gameId}`
            ),
          ],
        ])
      );
      break;
    default:
      ctx.reply("⚠️ Неизвестная команда. Начните с /start");
  }
});

// bot.telegram.deleteWebhook();
// bot.startPolling();

bot.launch().then(() => console.log("Бот запущен 🚀"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));