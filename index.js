require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
// const { Telegraf, Markup } = require('telegraf');
// const { session } = require('@telegraf/session');

// const markdownTable = require('markdown-table');
// import {markdownTable} from 'markdown-table';
const Parse = require('parse/node');

Parse.initialize(process.env.BACK4APP_APP_ID, process.env.BACK4APP_JS_KEY);
Parse.serverURL = process.env.BACK4APP_SERVER_URL;

const bot = new Telegraf(process.env.BOT_TOKEN);
// bot.use(session());

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

async function myGamesCommand(ctx) {
  const userId = ctx.from.id;
  const Game = Parse.Object.extend('Games');

  // Запрос всех игр, где пользователь creatorId или enemyId
  const query1 = new Parse.Query(Game);
  query1.equalTo('creatorId', userId);

  const query2 = new Parse.Query(Game);
  query2.equalTo('enemyId', userId);

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
          const status = game.get('status');

          let statusText = '🕹 В поиске соперника';
          if (status === 'full') statusText = '⏳ Ожидается ставка';
          if (status === 'working') statusText = '🎯 Игра идет';

          const message = `🎮 *Игра:*\n\n🆔 *ID:* \`${gameId}\`\n👤 *Создатель:* ${creatorName}\n🎭 *Соперник:* ${enemyName}\n📌 *Статус:* ${statusText}`;

          await ctx.replyWithMarkdown(message, Markup.inlineKeyboard([
              [Markup.button.callback('▶️ Открыть игру', `game_${gameId}`)]
          ]));
      }
  } catch (error) {
      console.error('Ошибка при получении игр:', error);
      ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
}

// Добавляем команду `/my_games`
bot.command('my_games', myGamesCommand);


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

bot.action(/^game_(.+)$/, async (ctx) => {
  // ✅ Отвечаем сразу, чтобы избежать ошибки
  // ctx.answerCbQuery().catch((err) => console.error('Ошибка при answerCbQuery:', err));

  const gameId = ctx.match[1];
  const userId = ctx.from.id;
  const Game = Parse.Object.extend('Games');
  const query = new Parse.Query(Game);

  try {
      const game = await query.get(gameId);
      if (!game) {
          return ctx.answerCbQuery('❌ Игра не найдена.', { show_alert: true });
      }

      const creatorId = game.get('creatorId');
      const creatorName = (game.get('creatorName') || 'Неизвестный').replace(/[-._]/g, '\\$&');
      const enemyName = (game.get('enemyName') || 'Ожидает соперника').replace(/[-._]/g, '\\$&');
      const status = game.get('status');

      if (status === 'waiting') {
          return ctx.answerCbQuery('🕹 Игра еще не завершена.', { show_alert: true });
      }

      if (userId === creatorId && status === "full") {
          const matchTheme = (game.get('MatchTheme') || 'Не указана').replace(/[-._]/g, '\\$&');
          const matchValuesCreator = (game.get('MatchValuesCreator') || []).map(v => v.replace(/[-._]/g, '\\$&'));
          const mismatchTheme = (game.get('MismatchTheme') || 'Не указана').replace(/[-._]/g, '\\$&');
          const mismatchValuesCreator = (game.get('MismatchValuesCreator') || []).map(v => v.replace(/[-._]/g, '\\$&'));
          const rateCreator = (game.get('rateCreator') || 'Не сделана').toString().replace(/[-._]/g, '\\$&');

          ctx.answerCbQuery('📋 Данные игры отправлены.', { show_alert: false });

          const message =
              `🎮 *Данные игры:*\n\n` +
              `🆔 *ID игры:* \`${gameId}\`\n` +
              `👤 *Создатель:* ${creatorName}\n` +
              `🎭 *Соперник:* ${enemyName}\n` +
              `⚖️ *Ваша ставка:* ${rateCreator}\n\n` +
              `📌 Тема игры на совпадение: *${matchTheme}\n*` +
              `────────────────────────\n` +
              `📋 *Ваши значения:*\n` +
              matchValuesCreator.map((v, i) => `${i + 1}\\.\ ${v}`).join('\n') + '\n\n' +
              `📌 Тема игры на несовпадение: *${mismatchTheme}\n*` +
              `────────────────────────\n` +
              `📋 *Ваши значения:*\n` +
              mismatchValuesCreator.map((v, i) => `${i + 1}\\.\ ${v}`).join('\n');

              await ctx.replyWithMarkdownV2(message, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💰 Сделать ставку', callback_data: `bet_${gameId}` }]
                    ]
                }
            });
          } else if (userId === creatorId && status === "working") {
            const theme1 = game.get('MatchTheme') || 'Не указана';
            const theme2 = game.get('MismatchTheme') || 'Не указана';
            const matchValuesCreator = game.get('MatchValuesCreator') || [];
            const mismatchValuesCreator = game.get('MismatchValuesCreator') || [];
            const matchValuesEnemy = game.get('matchValuesEnemy') || [];
            const mismatchValuesEnemy = game.get('mismatchValuesEnemy') || [];
            const rateCreator = game.get('rateCreator') || 'Не сделана';
            const rateEnemy = game.get('rateEnemy') || 'Не сделана';

            ctx.answerCbQuery('📋 Данные игры отправлены.', { show_alert: false });

            const message =
                `🎮 <b>Данные игры:</b>\n\n` +
                `🆔 <b>ID игры:</b> <code>${gameId}</code>\n` +
                `👤 <b>Соперник:</b> ${enemyName}\n` +
                `<b>Тема 1:</b> ${theme1}\n` +
                `────────────────────────\n\n` +

                `<b>Ваши значения:</b>\n` +
                matchValuesCreator.map((v, i) => `${i + 1}. ${v}`).join('\n') + '\n\n' +

                `<b>Значения соперника:</b>\n` +
                matchValuesEnemy.map((v, i) => `${i + 1}. ${v || '-'}`).join('\n') + '\n\n';

            await ctx.reply(message, { parse_mode: 'HTML' });
          
      } else  {
          ctx.answerCbQuery('❌ Вы не являетесь создателем этой игры.', { show_alert: true });
      }
  } catch (error) {
      console.error('Ошибка при открытии игры:', error);
      ctx.answerCbQuery('⚠️ Ошибка. Попробуйте позже.', { show_alert: true });
  }
});

bot.action(/^bet_(.+)$/, async (ctx) => {
  const gameId = ctx.match[1];
  const userId = ctx.from.id;

  const Game = Parse.Object.extend('Games');
  const query = new Parse.Query(Game);

  try {
      const game = await query.get(gameId);
      if (!game) return ctx.answerCbQuery('❌ Игра не найдена.', { show_alert: true });

      if (game.get('creatorId') !== userId) {
          return ctx.answerCbQuery('❌ Вы не являетесь создателем этой игры.', { show_alert: true });
      }

      // Сохраняем игру в сессии и переводим в режим ставки
      userSessions[userId] = { step: 'enter_rate_creator', game };
      ctx.reply('Введите вашу ставку (число от 0 до 12):');
      ctx.answerCbQuery();
  } catch (error) {
      console.error('Ошибка при открытии ставки:', error);
      ctx.answerCbQuery('⚠️ Ошибка. Попробуйте позже.', { show_alert: true });
  }
});


bot.on('text', async (ctx) => {
  const session = userSessions[ctx.from.id];
    if (!session) return;
    if (!session || !session.step) return ctx.reply('Неизвестная команда. Начните с /start');
  // 🔹 Если идет процесс создания игры
  switch (session.step) {
      case 'enter_custom_theme':
          session.theme = ctx.message.text;
          session.step = 'enter_match_values';
          ctx.reply(`Тема игры на совпадение: ${session.theme}\nВведите первое значение:`);
          break;

      case 'enter_match_values':
          session.matchValues.push(ctx.message.text);
          if (session.matchValues.length < 6) {
              ctx.reply(`Введите следующее значение (${session.matchValues.length + 1}/6):`);
          } else {
              session.step = 'enter_new_custom_theme';
              ctx.reply('Введите тему игры на несовпадение:');
          }
          break;

      case 'enter_new_custom_theme':
          session.alternateTheme = ctx.message.text;
          session.step = 'enter_mismatch_values';
          ctx.reply(`Тема игры на несовпадение: ${session.alternateTheme}\nВведите первое значение:`);
          break;

      case 'enter_mismatch_values':
          session.mismatchValues.push(ctx.message.text);
          if (session.mismatchValues.length < 6) {
              ctx.reply(`Введите следующее значение (${session.mismatchValues.length + 1}/6):`);
          } else {
              const Game = Parse.Object.extend('Games');
              const game = new Game();
              game.set('MatchTheme', session.theme);
              game.set('MismatchTheme', session.alternateTheme);
              game.set('MatchValuesCreator', session.matchValues);
              game.set('MismatchValuesCreator', session.mismatchValues);
              game.set('creatorId', ctx.from.id);
              game.set('creatorName', ctx.from.username || ctx.from.first_name || 'Аноним');
              game.set('status', 'waiting');
              await game.save();
              ctx.reply(`✅ Игра создана! ID: \`${game.id}\``);
              // session = null;
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

              case 'enter_rate_creator': // 🔹 ЛОГИКА СТАВКИ ДЛЯ СОЗДАТЕЛЯ
            const rateCreator = parseInt(ctx.message.text);
            if (isNaN(rateCreator) || rateCreator < 0 || rateCreator > 12) {
                return ctx.reply('Введите корректное число от 0 до 12:');
            }

            const gameCreator = session.game;
            gameCreator.set('rateCreator', rateCreator);
            gameCreator.set('status', 'working'); // Обновляем статус игры
            await gameCreator.save();

            ctx.reply(`✅ Ваша ставка ${rateCreator} сохранена!`);
            delete userSessions[ctx.from.id];

            // 🔹 Автоматически показываем список игр
            return myGamesCommand(ctx);
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
