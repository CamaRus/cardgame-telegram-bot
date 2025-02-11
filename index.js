require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const Parse = require('parse/node');

Parse.initialize(process.env.BACK4APP_APP_ID, process.env.BACK4APP_JS_KEY);
Parse.serverURL = process.env.BACK4APP_SERVER_URL;

const bot = new Telegraf(process.env.BOT_TOKEN);

// const bot = new Telegraf(process.env.BOT_TOKEN, {
//   handlerTimeout: 0,
// });

const userSessions = {}; // Хранение временных данных пользователя

async function getRandomTheme(excludedTheme = null) {
    try {
        const Themes = Parse.Object.extend('Themes');
        const query = new Parse.Query(Themes);
        if (excludedTheme) {
            query.notEqualTo('theme', excludedTheme);
        }
        const results = await query.find();

        if (results.length === 0) return 'Нет доступных тем';
        return results[Math.floor(Math.random() * results.length)].get('theme');
    } catch (error) {
        console.error('Ошибка при получении темы:', error);
        return 'Ошибка при выборе темы';
    }
}

bot.start((ctx) => {
    userSessions[ctx.from.id] = { step: null, matchValues: [], mismatchValues: [] };
    ctx.reply('Выберите действие:', Markup.inlineKeyboard([
        [Markup.button.callback('Создать игру', 'create_game')],
        [Markup.button.callback('Присоединиться', 'join_game')],
        [Markup.button.callback('Мои игры', 'my_games')]
    ]));
});

// bot.command('list_games', async (ctx) => {
//   const Game = Parse.Object.extend('Games');
//   const query = new Parse.Query(Game);

//   try {
//       const results = await query.find(); // Получаем все игры из базы
//       if (results.length === 0) {
//           return ctx.reply('В базе данных пока нет активных игр.');
//       }

//       let message = '📜 Список доступных игр:\n\n';
//       results.forEach((game, index) => {
//           message += `${index + 1}. 🆔 ID: ${game.id}\n`;
//           message += `🎭 Тема игры на совпадение: ${game.get('MatchTheme') || 'Не указана'}\n`;
//           message += `🎭 Тема игры на несовпадение: ${game.get('MismatchTheme') || 'Не указана'}\n`;
//           message += `👤 Создатель: ${game.get('creatorName') || 'Неизвестен'}\n`;
//           message += `📌 Статус: ${game.get('status') || 'Неизвестен'}\n\n`;
//       });

//       ctx.reply(message);
//   } catch (error) {
//       console.error('Ошибка получения списка игр:', error.message);
//       ctx.reply('Произошла ошибка при получении списка игр.');
//   }
// });

bot.command('my_games', async (ctx) => {
  const userId = ctx.from.id;
  const Game = Parse.Object.extend('Games');

  // Создаем два отдельных запроса
  const query1 = new Parse.Query(Game);
  query1.equalTo('creatorId', userId);

  const query2 = new Parse.Query(Game);
  query2.equalTo('enemyId', userId);

  // Объединяем запросы
  const mainQuery = Parse.Query.or(query1, query2);

  try {
      const games = await mainQuery.find();

      if (games.length === 0) {
          return ctx.reply('Вы пока не участвуете в играх.');
      }

      for (const game of games) {
          const gameId = game.id;
          const creatorName = game.get('creatorName') || 'Неизвестный';
          const enemyName = game.get('enemyName') || 'Ожидает соперника';
          const status = game.get('status') === 'full' ? '✅ *Игра завершена*' : '🕹 *В поиске соперника*';

          const message = `🎮 *Игра:*\n\n🆔 *ID:* \`${gameId}\`\n👤 *Создатель:* ${creatorName}\n🎭 *Соперник:* ${enemyName}\n📌 *Статус:* ${status}`;

          await ctx.replyWithMarkdown(message, Markup.inlineKeyboard([
              [Markup.button.callback(`▶️ Открыть игру`, `game_${gameId}`)]
          ]));
      }
  } catch (error) {
      console.error('Ошибка при получении игр:', error);
      ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
});



bot.action('create_game', (ctx) => {
    userSessions[ctx.from.id] = { step: 'choose_theme', matchValues: [], mismatchValues: [] };
    ctx.reply('Выберите способ выбора темы:', Markup.inlineKeyboard([
        [Markup.button.callback('Своя тема', 'custom_theme')],
        [Markup.button.callback('Случайная тема', 'random_theme')]
    ]));
});

bot.action('join_game', (ctx) => {
  ctx.reply('Выберите способ присоединения:', Markup.inlineKeyboard([
      [Markup.button.callback('Войти в игру', 'enter_game_id')],
      [Markup.button.callback('Случайный соперник', 'random_opponent')]
  ]));
});

// 🔹 Обработчик нажатия "Войти в игру" (ввод ID)
bot.action('enter_game_id', (ctx) => {
  userSessions[ctx.from.id] = { step: 'enter_game_id' };
  ctx.reply('Введите ID игры для присоединения:');
});


bot.action('custom_theme', (ctx) => {
  userSessions[ctx.from.id] = { step: 'enter_custom_theme', matchValues: [], mismatchValues: [], isRandom: false };
  ctx.reply('Введите тему игры на совпадение:');
});


// Обработчик кнопки "Случайная тема"
bot.action('random_theme', async (ctx) => {
  const theme = await getRandomTheme();
  userSessions[ctx.from.id] = { 
      step: 'enter_match_values', 
      theme, 
      matchValues: [], 
      mismatchValues: [], 
      isRandom: true  // Устанавливаем isRandom = true при случайной теме
  };
  ctx.reply(`Выбрана случайная тема: ${theme}\nВведите первое значение:`);
});

bot.on('text', async (ctx) => {
    const session = userSessions[ctx.from.id];
    // if (!session) return;
    if (!session || !session.step) return ctx.reply('Неизвестная команда. Начните с /start');

    switch (session.step) {
        case 'enter_custom_theme':
            session.theme = ctx.message.text;
            // session.isRandom = false; // Тема задана вручную
            session.step = 'enter_match_values';
            ctx.reply(`Тема игры на совпадение: ${session.theme}\nВведите первое значение:`);
            break;

            case 'enter_match_values':
            session.matchValues.push(ctx.message.text);
            if (session.matchValues.length < 6) {
                ctx.reply(`Введите следующее значение (${session.matchValues.length + 1}/6):`);
            } else {
                if (session.isRandom) {
                  // Если первая тема из базы, выбираем вторую тоже из базы
                  session.mismatchTheme = await getRandomTheme(session.theme);
                  session.step = 'enter_mismatch_values';
                  ctx.reply(`Тема игры на несовпадение: ${session.mismatchTheme}\nВведите первое значение:`);
                } else {
                  // Если первая тема введена пользователем, запрашиваем вторую у него
                  session.step = 'enter_new_custom_theme';
                  ctx.reply('Введите тему игры на несовпадение:');
              }
            }
            break;

        case 'enter_new_custom_theme':
            session.mismatchTheme = ctx.message.text;
            session.step = 'enter_mismatch_values';
            ctx.reply(`Тема игры на несовпадение: ${session.mismatchTheme}\nВведите первое значение:`);
            break;

        case 'enter_mismatch_values':
            session.mismatchValues.push(ctx.message.text);
            if (session.mismatchValues.length < 6) {
                ctx.reply(`Введите следующее значение (${session.mismatchValues.length + 1}/6):`);
            } else {
                const Game = Parse.Object.extend('Games');
                const game = new Game();
                game.set('MatchTheme', session.theme);
                game.set('MismatchTheme', session.mismatchTheme);
                game.set('MatchValuesCreator', session.matchValues);
                game.set('MismatchValuesCreator', session.mismatchValues);
                game.set('creatorId', ctx.from.id);
                game.set('creatorName', ctx.from.username || ctx.from.first_name || 'Аноним'); // Сохранение имени
                game.set('status', 'waiting');
                await game.save();
                
                ctx.reply('Игра успешно создана и сохранена!');
                delete userSessions[ctx.from.id];
            }
            break;

            case 'enter_game_id':
              const gameId = ctx.message.text;
              const Game = Parse.Object.extend('Games');
              const query = new Parse.Query(Game);
          
              try {
                  const game = await query.get(gameId);
                  const creatorId = game.get('creatorId');
                  const enemyId = game.get('enemyId');
          
                  // Проверяем, участвует ли пользователь в игре
                  if (creatorId === ctx.from.id || enemyId === ctx.from.id) {
                      return ctx.reply('Вы уже участвуете в этой игре!');
                  }
          
                  session.game = game;
                  session.theme = game.get('MatchTheme');
                  session.alternateTheme = game.get('MismatchTheme');
                  session.matchValues = [];
                  session.mismatchValues = [];
                  session.step = 'enter_match_values_enemy';
          
                  ctx.reply(`Вы присоединились! Тема игры на совпадение: ${session.theme}\nВведите первое значение:`);
              } catch (error) {
                  ctx.reply('Такой игры не существует. Проверьте ID.');
              }
              break;

            case 'enter_match_values_enemy':
            session.matchValues.push(ctx.message.text);
            if (session.matchValues.length < 6) {
                ctx.reply(`Введите следующее значение (${session.matchValues.length + 1}/6):`);
            } else {
                session.step = 'enter_mismatch_values_enemy';
                ctx.reply(`Тема игры на несовпадение: ${session.alternateTheme}\nВведите первое значение:`);
            }
            break;

            case 'enter_mismatch_values_enemy':
              session.mismatchValues.push(ctx.message.text);
              if (session.mismatchValues.length < 6) {
                  ctx.reply(`Введите следующее значение (${session.mismatchValues.length + 1}/6):`);
              } else {
                  session.step = 'enter_rate_enemy';
                  ctx.reply('Сделайте ставку на количество совпадений (число от 0 до 12):');
              }
              break;

              case 'enter_rate_enemy':
              const rate = parseInt(ctx.message.text);
    
              if (isNaN(rate) || rate < 0 || rate > 12) {
                  return ctx.reply('Введите корректное число от 0 до 12:');
              }

              const game = session.game;
              game.set('matchValuesEnemy', session.matchValues);
              game.set('mismatchValuesEnemy', session.mismatchValues);
              game.set('enemyId', ctx.from.id);
              game.set('enemyName', ctx.from.username || ctx.from.first_name || 'Аноним');
              game.set('rateEnemy', rate);
              game.set('status', 'full');

              await game.save();
              
              ctx.reply(`Вы успешно присоединились к игре! Ваша ставка: ${rate}. Ожидайте хода ведущего!`);
              delete userSessions[ctx.from.id];
              break;

                  default:
                      ctx.reply('Неизвестная команда. Начните с /start');
              }
});

// bot.telegram.deleteWebhook();
// bot.startPolling();
bot.launch().then(() => console.log('Бот запущен 🚀'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
