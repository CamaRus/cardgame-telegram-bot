require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const Parse = require("parse/node");

Parse.initialize(process.env.BACK4APP_APP_ID, process.env.BACK4APP_JS_KEY);
Parse.serverURL = process.env.BACK4APP_SERVER_URL;

const bot = new Telegraf(process.env.BOT_TOKEN);

const userSessions = {}; // Хранение временных данных пользователя

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
}

function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
}


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
      const creatorName = game.get("creatorName").replace(
        /[-._]/g,
        "\\$&"
      ) || "Аноним";
      const creatorId = game.get("creatorId");
      const enemyName = game.get("enemyName");
      const status = game.get("status");
    const createdAt = game.get('createdAt').toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',  // 🔹 Указываем часовой пояс (можно изменить)
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
      const matchTheme = game.get("MatchTheme").replace(
        /[-._]/g,
        "\\$&"
      );
      const mismatchTheme = game.get("MismatchTheme").replace(
        /[-._]/g,
        "\\$&"
      );

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
        (typeof enemyName !== 'undefined' ? `🎭 *Соперник:* ${enemyName.replace(
          /[-._]/g,
          "\\$&"
        )}\n` : '') +
        // `🎭 *Соперник:* ${enemyName}\n` +
        `📌 *Статус:* ${statusText}`;

      const message2 =
        `🎮 *Данные игры:*\n\n` +
        `🆔 *ID:* \`${gameId}\`\n` +
        `📅 *Дата создания:* ${createdAt}\n` +
        `👤 *Создатель:* ${creatorName}\n` +
        // `🎭 *Соперник:* ${enemyName}\n` +
        (typeof enemyName !== 'undefined' ? `🎭 *Соперник:* ${enemyName.replace(
          /[-._]/g,
          "\\$&"
        )}\n` : '') +
        `📑 *Категория игры на совпадение:* ${matchTheme}\n` +
        `📑 *Категория игры на несовпадение:* ${mismatchTheme}\n` +
        `📌 *Статус:* ${statusText}`;

        let buttons = [[Markup.button.callback('▶️ ОТКРЫТЬ ИГРУ', `game_${gameId}`)]];

      if (status !== "finish" && userId !== creatorId) {
        await ctx.replyWithMarkdown(
          message2,
          Markup.inlineKeyboard([
            [Markup.button.callback("▶️ ОТКРЫТЬ ИГРУ", `game_${gameId}`)],
          ])
        );
      } 
      // 🔹 Добавляем кнопку "Удалить", если пользователь – создатель
      else if (status !== "finish" && userId === creatorId) {
        buttons.push([Markup.button.callback('🗑 УДАЛИТЬ', `delete_${gameId}`)]);
        await ctx.replyWithMarkdown(message2, Markup.inlineKeyboard(buttons));
    }
      else {
        await ctx.replyWithMarkdown(
          message,
          Markup.inlineKeyboard([
            [Markup.button.callback("▶️ РЕЗУЛЬТАТЫ", `game_${gameId}`)],
          ])
        );
      }
    }
  } catch (error) {
    console.error("Ошибка при получении игр:", error);
    ctx.reply("⚠️ Произошла ошибка. Попробуйте позже.");
  }
}

async function finishMatch(ctx, gameId) {
    const userId = ctx.from.id;
    const session = userSessions[userId];

    if (!session || session.gameId !== gameId) return;

    session.matchCoincidences = [...session.coincidences]; // Сохраняем совпадения для первой темы
    session.coincidences = []; // Очищаем список для второй темы
    session.step = 'enter_coincidences_mismatch';

    const Game = Parse.Object.extend('Games');
    const query = new Parse.Query(Game);
    const game = await query.get(gameId);
    if (!game) return ctx.reply('Ошибка: игра не найдена.');

    // 🔹 Данные по второй теме
    const theme2 = game.get('MismatchTheme') || 'Не указана';
    const mismatchValuesCreator = game.get('MismatchValuesCreator') || [];
    const mismatchValuesEnemy = game.get('mismatchValuesEnemy') || [];
    const enemyName = game.get("enemyName");

    const message =
    `🎮 <b>Данные игры:</b>\n\n` +
    `🆔 <b>ID игры:</b> <code>${gameId}</code>\n` +
    `👤 <b>Соперник:</b> ${enemyName}\n` +
    `📌 <b>Категория на несовпадение:</b> ${theme2}\n` +
    `────────────────────────\n\n` +
    `<b>Ваши варианты:</b>\n` +
    mismatchValuesCreator.map((v, i) => `${i + 1}. ${v}`).join("\n") +
    "\n\n" +
    `<b>Варианты соперника:</b>\n` +
    mismatchValuesEnemy.map((v, i) => `${i + 1}. ${v || "-"}`).join("\n") +
    "\n\n";

  await ctx.reply(message, { parse_mode: "HTML" });

  await ctx.reply(
    `Введите совпадающие варианты (по одному) для темы: <b>${theme2}</b>\n\n`,
    {
      parse_mode: "HTML",
    }
  );

  await ctx.reply(
    "Нажмите кнопку ✅ ЗАКОНЧИТЬ, если совпадений (больше) нет!",
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ ЗАКОНЧИТЬ", `finish_mismatch_${gameId}`)],
    ])
  );
}

async function finishMismatch(ctx, gameId) {
  const userId = ctx.from.id;
  const session = userSessions[userId];

  if (!session || session.gameId !== gameId) return;

  // Сохраняем совпадения для второй темы
  const Game = Parse.Object.extend("Games");
const query = new Parse.Query(Game);
const gameObj = await query.get(gameId);
if (!gameObj) return ctx.reply("⚠️ Ошибка: игра не найдена.");
  // Загружаем matchCoincidences из базы
  const coincidences = gameObj.get("coincidences") || { match: [], mismatch: [] };
  coincidences.match = coincidences.match || [];
  coincidences.mismatch = session.coincidences; // Сохраняем mismatch совпадения

const totalCoincidences = coincidences.match.length + coincidences.mismatch.length;

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
const creatorId = gameObj.get("creatorId");
const enemyId = gameObj.get("enemyId")

gameObj.set("coincidences", coincidences);
gameObj.set("resultCreator", resultCreator);
gameObj.set("resultEnemy", resultEnemy);
gameObj.set("winnerId", winnerId);
gameObj.set("winnerName", winnerName);
gameObj.set("status", "finish");

await gameObj.save();


// 🔹 Уведомляем игроков о завершении игры
let message = `🏆 *Игра завершена!*\nПроверьте завершённые игры!\n🎖 *Победитель:* ${winnerName}\n🆔 *ID игры:* \`${gameId}\``;

if (gameObj.get('creatorId')) {
  let creatorMessage = message;
  if (gameObj.get('creatorId') === winnerId) {
      creatorMessage += `\n🎉 Поздравляем, вы победили!`;
  } else if (winnerId) {
      creatorMessage += `\n😔 К сожалению, вы проиграли.`;
  } else {
      creatorMessage = `🏆 *Игра завершена!*\nПроверьте завершённые игры!\n🆔 *ID игры:* \`${gameId}\`\n🤝 Ничья!`;
  }
  await bot.telegram.sendMessage(gameObj.get('creatorId'), creatorMessage, { parse_mode: 'Markdown' }).catch(() => {});
}

if (gameObj.get('enemyId')) {
  let enemyMessage = message;
  if (gameObj.get('enemyId') === winnerId) {
      enemyMessage += `\n🎉 Поздравляем, вы победили!`;
  } else if (winnerId) {
      enemyMessage += `\n😔 К сожалению, вы проиграли.`;
  } else {
      enemyMessage = `🏆 *Игра завершена!*\nПроверьте завершённые игры!\n🆔 *ID игры:* \`${gameId}\`\n🤝 Ничья!`;
  }
  await bot.telegram.sendMessage(gameObj.get('enemyId'), enemyMessage, { parse_mode: 'Markdown' }).catch(() => {});

}
delete userSessions[userId];

}

async function deleteOldGames() {
  try {
      const Game = Parse.Object.extend("Games");
      const query = new Parse.Query(Game);

      // Получаем дату двухдневной давности
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      // Фильтруем игры, созданные более 2 суток назад и не имеющие статус "finish"
      query.lessThan("updatedAt", twoDaysAgo);
      query.notEqualTo("status", "finish");

      const oldGames = await query.find();
      
      if (oldGames.length > 0) {
          console.log(`🗑 Найдено ${oldGames.length} старых игр для удаления...`);
          for (const game of oldGames) {
              await game.destroy();
              console.log(`✅ Игра ${game.id} удалена`);
          }
      } else {
          console.log("✅ Нет старых игр для удаления.");
      }
  } catch (error) {
      console.error("❌ Ошибка при удалении старых игр:", error);
  }
}

// Запускаем проверку каждые 4 часа
setInterval(deleteOldGames, 240 * 60 * 1000); // 4 часа

bot.start((ctx) => {
  userSessions[ctx.from.id] = {
    step: null,
    matchValues: [],
    mismatchValues: [],
  };
  ctx.reply(
    "👋 Добро пожаловать в интеллектуальную викторину «Совпадения»!\n\n📜 Используйте боковое (нижнее) меню для навигации по командам.",
    Markup.keyboard([
      ["🎮 Создать игру", "👥 Присоединиться к игре"],
      ["🛠️ Текущие игры", "✅ Завершенные игры"],
      ["📜 Правила игры", "ℹ️ Описание команд"],
    ])
      .resize()
      .oneTime()
  );
});

bot.hears("ℹ️ Описание команд", async (ctx) => {
  await ctx.replyWithMarkdown(
    `📝 *Описание команд:*\n\n` +
      `▶️ */start* – Запуск бота и открытие главного меню.\n` +
      `🛠️ */current_games* – Просмотр текущих игр.\n` +
      `🛠️ */finished_games* – Просмотр последних 10 завершённых игр.\n` +
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

bot.hears("🛠️ Текущие игры", async (ctx) => {
  await bot.handleUpdate({
    callback_query: { data: "current_games", from: ctx.from, message: ctx.message },
  });
});

bot.hears("✅ Завершенные игры", async (ctx) => {
  await bot.handleUpdate({
    callback_query: { data: "finished_games", from: ctx.from, message: ctx.message },
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

bot.command("current_games", async (ctx) => {
  await bot.handleUpdate({
    callback_query: {
      data: "current_games",
      from: ctx.from,
      message: ctx.message,
    },
  });
});

bot.command("finished_games", async (ctx) => {
  await bot.handleUpdate({
    callback_query: {
      data: "finished_games",
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
Игрокам даётся две категории: первая - на совпадение, вторая - на несовпадение.
В игре на совпадение игрокам нужно предложить (по одному) 6 вариантов (значений, имен, слов, словосочетаний и т. д.) на заданную категорию таким образом, чтобы было как можно больше совпадений с соперником.
В игре на несовпадение игрокам нужно предложить 6 вариантов на заданную категорию таким образом, чтобы было как можно меньше совпадений с соперником.
После игры игроки делают ставки на количество совпадений.
Если ставка меньше количества совпадений - игрок получает то количество очков, которое поставил.
Если ставка больше количества совпадений - игрок не получает очков.
Если ставка равна количеству совпадений - игрок получает соответствующее количество очков.
Игрок может создать свою игру (со своими темами или случайными) и пригласить другого игрока.
Или игрок может присоединиться к случайной игре.
Игрок, создавший игру является ведущим и судьёй игры.
Приятной игры!
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
        [Markup.button.callback("✏️ Своя категория", "custom_theme")],
        [Markup.button.callback("🎲 Случайная категория", "random_theme")],
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
  ctx.reply("Введите категорию игры на совпадение:");
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
    `Категория игры на совпадение:\n` +
    `<b>${theme}</b>\n` +
    `Введите первый вариант: `;

  await ctx.reply(message, { parse_mode: "HTML" });

});

bot.action("random_opponent", async (ctx) => {
  const userId = ctx.from.id;
  const Game = Parse.Object.extend("Games");
  const query = new Parse.Query(Game);

  try {
    // 🔹 Поиск игры со статусом waiting, где пользователь не участвует
    query.equalTo("status", "waiting");
    query.equalTo("visibility", true);
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
      `📌 Категория игры на совпадение: \n` + 
      `<b>${game.get("MatchTheme")}</b>\n` +
      `Введите первый вариант: `;
    // ctx.reply(`🎮 Вы присоединились к игре со случайным соперником!\n\n📌 Тема игры на совпадение: ${game.get('MatchTheme')}\nВведите первое значение:`);
    await ctx.reply(message, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Ошибка при поиске игры:", error);
    ctx.reply("⚠️ Произошла ошибка при поиске игры. Попробуйте позже.");
  }
});

bot.action(/^game_(.+)$/, async (ctx) => {
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
    const creatorName = game.get("creatorName").replace(
      /[-._]/g,
      "\\$&"
    ) || "Аноним";
    const enemyName = game.get("enemyName").replace(
      /[-._]/g,
      "\\$&"
    ) || "Ожидает соперника";
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
        `📌 Категория игры на совпадение: *${matchTheme}\n*` +
        `────────────────────────\n` +
        `📋 *Ваши варианты:*\n` +
        matchValuesCreator.map((v, i) => `${i + 1}\\.\ ${v}`).join("\n") +
        "\n\n" +
        `📌 Категория игры на несовпадение: *${mismatchTheme}\n*` +
        `────────────────────────\n` +
        `📋 *Ваши варианты:*\n` +
        mismatchValuesCreator.map((v, i) => `${i + 1}\\.\ ${v}`).join("\n");

      // await ctx.replyWithMarkdownV2(message, {
      //   reply_markup: {
      //     inline_keyboard: [
      //       [{ text: "💰 СДЕЛАТЬ СТАВКУ", callback_data: `bet_${gameId}` }],
      //     ],
      //   },
      // });

      await ctx.replyWithMarkdown(
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback("💰 СДЕЛАТЬ СТАВКУ", `bet_${gameId}`)],
        ])
      );

    } else if (userId === creatorId && status === "working") {
      // const theme1 = game.get("MatchTheme").replace(
      //   /[-._]/g,
      //   "\\$&"
      // ) || "Не указана";
      // const theme2 = game.get("MismatchTheme").replace(
      //   /[-._]/g,
      //   "\\$&"
      // ) || "Не указана";
      // const matchValuesCreator = game.get("MatchValuesCreator") || [];
      // const mismatchValuesCreator = game.get("MismatchValuesCreator") || [];
      // const matchValuesEnemy = game.get("matchValuesEnemy") || [];
      // const mismatchValuesEnemy = game.get("mismatchValuesEnemy") || [];
      // const rateCreator = game.get("rateCreator") || "Не сделана";
      // const rateEnemy = game.get("rateEnemy") || "Не сделана";

      const theme1 = (game.get("MatchTheme") || "Не указана").replace(
        /[-._]/g,
        "\\$&"
      );
      const matchValuesCreator = (game.get("MatchValuesCreator") || []).map(
        (v) => v.replace(/[-._]/g, "\\$&")
      );
      

      ctx.answerCbQuery("📋 Данные отправлены!", { show_alert: false });

      const message =
        `🎮 <b>Данные игры:</b>\n\n` +
        `🆔 <b>ID игры:</b> <code>${gameId}</code>\n` +
        `👤 <b>Соперник:</b> ${enemyName}\n` +
        `<b>📌 Категория игры на совпадение:</b> ${theme1}\n` +
        `────────────────────────\n\n` +
        `<b>Ваши варианты:</b>\n` +
        matchValuesCreator.map((v, i) => `${i + 1}. ${v}`).join("\n") +
        "\n\n" +
        `<b>Варианты соперника:</b>\n` +
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
        `Введите совпадающие варианты (по одному) для категории: <b>${theme1}</b>\n\n`,
        {
          parse_mode: "HTML",
        }
      );

      await ctx.reply(
        "Нажмите кнопку ✅ ЗАКОНЧИТЬ, если совпадений (больше) нет!",
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
        `📌 <b>Категория игры на совпадение:</b>\n` +
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
        `📌 <b>Категория игры на несовпадение:</b>\n` +
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
    ctx.reply("Сделайте ставку на количество совпадений (число от 0 до 12):");
    ctx.answerCbQuery();
  } catch (error) {
    console.error("Ошибка при открытии ставки:", error);
    ctx.answerCbQuery("⚠️ Ошибка. Игра не найдена или удалена!", { show_alert: true });
  }
});

bot.action(/^finish_match_(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  const userId = ctx.from.id;
  const session = userSessions[userId];

  if (!session || session.gameId !== gameId) return;
  const Game = Parse.Object.extend("Games");
  const query = new Parse.Query(Game);
  const game = await query.get(gameId);
  game.set('coincidences', { match: session.coincidences }); // Сохраняем совпадения в БД
    await game.save();

  session.matchCoincidences = [...session.coincidences]; // Сохраняем совпадения для первой темы
  session.coincidences = []; // Очищаем список для второй темы
  session.step = "enter_coincidences_mismatch";

  
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
    `📌 <b>Категория игры на несовпадение:</b> ${theme2}\n` +
    `────────────────────────\n\n` +
    `<b>Ваши варианты:</b>\n` +
    mismatchValuesCreator.map((v, i) => `${i + 1}. ${v}`).join("\n") +
    "\n\n" +
    `<b>Варианты соперника:</b>\n` +
    mismatchValuesEnemy.map((v, i) => `${i + 1}. ${v || "-"}`).join("\n") +
    "\n\n";

  await ctx.reply(message, { parse_mode: "HTML" });

  await ctx.reply(
    `Введите совпадающие варианты (по одному) для категории: <b>${theme2}</b>\n\n`,
    {
      parse_mode: "HTML",
    }
  );

  await ctx.reply(
    "Нажмите кнопку ✅ ЗАКОНЧИТЬ, если совпадений (больше) нет!",
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

  const creatorId = gameObj.get("creatorId");
 const enemyId = gameObj.get("enemyId")
  gameObj.set("resultCreator", resultCreator);
  gameObj.set("resultEnemy", resultEnemy);
  gameObj.set("winnerId", winnerId);
  gameObj.set("winnerName", winnerName);
  gameObj.set("status", "finish");

  await gameObj.save();

  // 🔹 Уведомляем игроков о завершении игры
  let message = `🏆 *Игра завершена!*\nПроверьте завершённые игры!\n🎖 *Победитель:* ${winnerName}\n🆔 *ID игры:* \`${gameId}\``;

  if (gameObj.get('creatorId')) {
      let creatorMessage = message;
      if (gameObj.get('creatorId') === winnerId) {
          creatorMessage += `\n🎉 Поздравляем, вы победили!`;
      } else if (winnerId) {
          creatorMessage += `\n😔 К сожалению, вы проиграли.`;
      } else {
        creatorMessage = `🏆 *Игра завершена!*\nПроверьте завершённые игры!\n🆔 *ID игры:* \`${gameId}\`\n🤝 Ничья!`;
      }
      await bot.telegram.sendMessage(gameObj.get('creatorId'), creatorMessage, { parse_mode: 'Markdown' }).catch(() => {});
      // await openGame(ctx, gameId);
  }

  if (gameObj.get('enemyId')) {
      let enemyMessage = message;
      if (gameObj.get('enemyId') === winnerId) {
          enemyMessage += `\n🎉 Поздравляем, вы победили!`;
      } else if (winnerId) {
          enemyMessage += `\n😔 К сожалению, вы проиграли.`;
      } else {
        enemyMessage = `🏆 *Игра завершена!*\nПроверьте завершённые игры!\n🆔 *ID игры:* \`${gameId}\`\n🤝 Ничья!`;
      }
      await bot.telegram.sendMessage(gameObj.get('enemyId'), enemyMessage, { parse_mode: 'Markdown' }).catch(() => {});
      // await openGame(ctx, gameId);
  }

  delete userSessions[userId];
});


bot.action(/^delete_(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];

  // Отправляем текстовое сообщение
//   await ctx.replyWithMarkdownV2(
//     `❗ Вы уверены, что хотите удалить игру с ID \`${gameId.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}\`?`
// );

// Отправляем кнопки отдельно
await ctx.reply(
    `❗ Вы уверены, что хотите удалить игру с ID \`${gameId.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}\`?`,
    Markup.inlineKeyboard([
        [Markup.button.callback('✅ Да, удалить', `confirm_delete_${gameId}`)],
        [Markup.button.callback('❌ Отмена', `cancel_delete`)]
    ])
);
});

bot.action(/^confirm_delete_(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  const userId = ctx.from.id;

  const Game = Parse.Object.extend('Games');
  const query = new Parse.Query(Game);

  try {
      const game = await query.get(gameId);

      if (!game) {
          return ctx.answerCbQuery('⚠️ Игра не найдена.', { show_alert: true });
      }

      // Проверяем, является ли пользователь создателем игры
      if (game.get('creatorId') !== userId) {
          return ctx.answerCbQuery('❌ Вы не являетесь создателем этой игры.', { show_alert: true });
      }

      await game.destroy();
      await ctx.reply('✅ Игра успешно удалена!');
      return displayGames(ctx);
  } catch (error) {
      console.error('Ошибка при удалении игры:', error);
      ctx.answerCbQuery('⚠️ Ошибка при удалении игры. Попробуйте позже.', { show_alert: true });
  }
});

// bot.action("cancel_delete", async (ctx) => {
//   await ctx.answerCbQuery(); // Закрываем всплывающее уведомление
//   await ctx.editMessageReplyMarkup(null); // Убираем кнопки
// });

bot.action("cancel_delete", async (ctx) => {
  try {
      await ctx.answerCbQuery(); // Закрываем всплывающее уведомление
      await ctx.deleteMessage(); // Удаляем сообщение с кнопками (подтверждение удаления)

      // Дополнительно удаляем сообщение "Выберите действия" (если известно message_id)
      if (ctx.session.deletePromptMessageId) {
          await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.deletePromptMessageId);
          delete ctx.session.deletePromptMessageId; // Удаляем переменную, чтобы не было лишних вызовов
      }
  } catch (error) {
      console.error("Ошибка при удалении сообщений:", error);
  }
});

bot.action(['visibility_true', 'visibility_false'], async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions[userId];

  if (!session) return ctx.answerCbQuery('Ошибка: данные игры не найдены.');

  const visibility = ctx.match[0] === 'visibility_true'; // Если "Да" → true, если "Нет" → false

  // Сохранение данных игры
  const Game = Parse.Object.extend('Games');
  const game = new Game();
  game.set('MatchTheme', session.theme);
  game.set('MismatchTheme', session.alternateTheme);
  game.set('MatchValuesCreator', session.matchValues);
  game.set('MismatchValuesCreator', session.mismatchValues);
  game.set('creatorId', userId);
  game.set('creatorName', ctx.from.username || ctx.from.first_name || 'Аноним');
  game.set('status', 'waiting');
  game.set('visibility', visibility);

  await game.save();
  const message = `✅ Игра создана! ID: ` + `<code>${game.id}</code>\n👀 Видимость: ${visibility ? 'доступна для всех' : 'скрыта'}`;
  await ctx.reply(message, { parse_mode: "HTML" });
  
  // ctx.reply(`✅ Игра создана! ID: \`${game.id}\`\n👀 Видимость: ${visibility ? 'Доступна для всех' : 'Скрыта'}`);
  delete userSessions[userId];




  //////////////////////////////////////////
  // const Game = Parse.Object.extend("Games");
  //       const game = new Game();
  //       game.set("MatchTheme", session.theme);
  //       game.set("MismatchTheme", session.alternateTheme);
  //       game.set("MatchValuesCreator", session.matchValues);
  //       game.set("MismatchValuesCreator", session.mismatchValues);
  //       game.set("creatorId", ctx.from.id);
  //       game.set(
  //         "creatorName",
  //         ctx.from.username || ctx.from.first_name || "Аноним"
  //       );
  //       game.set("status", "waiting");
  //       await game.save();
  //       const message = `✅ Игра создана! ID: ` + `<code>${game.id}</code>`;
  //       await ctx.reply(message, { parse_mode: "HTML" });
  //       delete userSessions[ctx.from.id];
    ///////////////////////////////////////////
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
      const message =
    `Категория игры на совпадение:\n` +
    `<b>${session.theme}</b>\n` +
    `Введите первый вариант: `;
    ctx.reply(message, { parse_mode: "HTML" });
      break;

    case "enter_match_values":
      session.matchValues.push(ctx.message.text);
      if (session.matchValues.length < 6) {
        ctx.reply(
          `Введите следующий вариант (${session.matchValues.length + 1}/6):`
        );
      } else {
        if (session.isRandom) {
          // Если первая тема из базы, выбираем вторую тоже из базы
          session.alternateTheme = await getRandomTheme();
          session.step = "enter_mismatch_values";
          const message =
            `Категория игры на несовпадение:\n` +
            `<b>${session.alternateTheme}</b>\n` +
            `Введите первый вариант: `;

          await ctx.reply(message, { parse_mode: "HTML" });
        } else {
          // Если первая тема введена пользователем, запрашиваем вторую у него
          session.step = "enter_new_custom_theme";
          ctx.reply("Введите категорию игры на несовпадение:");
        }
      }
      break;

    case "enter_new_custom_theme":
      session.alternateTheme = ctx.message.text;
      session.step = "enter_mismatch_values";
      const message2 =
            `Категория игры на несовпадение:\n` +
            `<b>${session.alternateTheme}</b>\n` +
            `Введите первый вариант: `;

        ctx.reply(message2, { parse_mode: "HTML" });
      
      break;

    case "enter_mismatch_values":
      session.mismatchValues.push(ctx.message.text);
      if (session.mismatchValues.length < 6) {
        ctx.reply(
          `Введите следующий вариант (${session.mismatchValues.length + 1}/6):`
        );
      } else {
        await ctx.reply(
          '👀 Сделать игру видимой для всех?',
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ ДА', 'visibility_true')],
                [Markup.button.callback('❌ НЕТ', 'visibility_false')]
            ])
      );

        // const Game = Parse.Object.extend("Games");
        // const game = new Game();
        // game.set("MatchTheme", session.theme);
        // game.set("MismatchTheme", session.alternateTheme);
        // game.set("MatchValuesCreator", session.matchValues);
        // game.set("MismatchValuesCreator", session.mismatchValues);
        // game.set("creatorId", ctx.from.id);
        // game.set(
        //   "creatorName",
        //   ctx.from.username || ctx.from.first_name || "Аноним"
        // );
        // game.set("status", "waiting");
        // await game.save();
        // const message = `✅ Игра создана! ID: ` + `<code>${game.id}</code>`;
        // await ctx.reply(message, { parse_mode: "HTML" });
        // delete userSessions[ctx.from.id];
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
        const status = game.get("status");

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
          `Категория игры на совпадение:\n` +
          `<b>${session.theme}</b>\n` +
          `Введите первый вариант: `;

        await ctx.reply(message, { parse_mode: "HTML" });
      } catch (error) {
        ctx.reply("⚠️ Такой игры не существует. Проверьте ID!");
      }
      break;

    case "enter_match_values_enemy":
      session.matchValues.push(ctx.message.text);
      if (session.matchValues.length < 6) {
        ctx.reply(
          `Введите следующий вариант (${session.matchValues.length + 1}/6):`
        );
      } else {
        session.step = "enter_mismatch_values_enemy";
        const message =
          `Категория игры на несовпадение:\n` +
          `<b>${session.alternateTheme}</b>\n` +
          `Введите первый вариант: `;

        await ctx.reply(message, { parse_mode: "HTML" });
      }
      break;

    case "enter_mismatch_values_enemy":
      session.mismatchValues.push(ctx.message.text);
      if (session.mismatchValues.length < 6) {
        ctx.reply(
          `Введите следующий вариант (${session.mismatchValues.length + 1}/6):`
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

      await ctx.reply(
        `✔️ Вы успешно присоединились к игре! Ваша ставка: ${rate}.\n Ожидайте хода ведущего!`
      );

      // 🔹 Отправляем сообщение создателю игры
    if (game.get('creatorId')) {
      await bot.telegram.sendMessage(
          game.get('creatorId'),
          `👥 *Ваш соперник присоединился к игре!* Проверьте текущие игры!`,
          { parse_mode: 'Markdown' }
      ).catch(() => {});
  }

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

      await ctx.reply(`✅ Ваша ставка ${rateCreator} сохранена! Ваш ход!`);
      // 🔹 Отправляем сообщение сопернику
    if (gameCreator.get('enemyId')) {
      await bot.telegram.sendMessage(
          gameCreator.get('enemyId'),
          `🎯 *Ваш соперник сделал ставку!*`,
          { parse_mode: 'Markdown' }
      ).catch(() => {});
  }
      delete userSessions[ctx.from.id];

      // 🔹 Автоматически показываем список игр
      return displayGames(ctx);
      break;

      case 'enter_coincidences_match':
    session.coincidences.push(ctx.message.text);
    ctx.reply(`✅ Добавлено: ${ctx.message.text} (${session.coincidences.length}/6)`);
    if (session.coincidences.length < 6) {
        ctx.reply(
            "Нажмите кнопку ✅ ЗАКОНЧИТЬ, если совпадений (больше) нет!",
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "✅ ЗАКОНЧИТЬ",
                  `finish_match_${session.gameId}`
                ),
              ],
            ])
          );
    }
    
    // 🔹 Если достигнуто 6 значений, вызываем обработчик finish_match вручную
    if (session.coincidences.length >= 6) {
        await ctx.reply('✅ Вы ввели 6 совпадений. Переход к игре на несовпадение...');
        const Game = Parse.Object.extend("Games");
    const query = new Parse.Query(Game);
    const game = await query.get(session.gameId);
    game.set('coincidences', { match: session.coincidences }); // Сохраняем совпадения в БД
    await game.save();
        return finishMatch(ctx, session.gameId);
    }
    break;

    case 'enter_coincidences_mismatch':
    session.coincidences.push(ctx.message.text);
    ctx.reply(`✅ Добавлено: ${ctx.message.text} (${session.coincidences.length}/6)`);
    if (session.coincidences.length < 6) {
        ctx.reply(
            "Нажмите кнопку ✅ ЗАКОНЧИТЬ, если совпадений (больше) нет!",
            Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "✅ ЗАКОНЧИТЬ",
                  `finish_mismatch_${session.gameId}`
                ),
              ],
            ])
          );
    }

    // 🔹 Если достигнуто 6 значений, вызываем обработчик finish_mismatch вручную
    if (session.coincidences.length >= 6) {
        ctx.reply('✅ Вы ввели 6 совпадений. Завершаем игру...');
        return finishMismatch(ctx, session.gameId);
    }
    break;

    default:
      ctx.reply("⚠️ Неизвестная команда. Начните с /start");
  }
});

// bot.telegram.deleteWebhook();
// bot.startPolling();



if (process.env.BOT_DISABLED === 'true') {
    console.log('Бот временно отключен.');
    process.exit(0); // Завершаем процесс
}

bot.launch().then(() => console.log("Бот запущен 🚀"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));