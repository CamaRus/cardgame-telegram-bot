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

bot.action('create_game', (ctx) => {
    userSessions[ctx.from.id] = { step: 'choose_theme', matchValues: [], mismatchValues: [] };
    ctx.reply('Выберите способ выбора темы:', Markup.inlineKeyboard([
        [Markup.button.callback('Своя тема', 'custom_theme')],
        [Markup.button.callback('Случайная тема', 'random_theme')]
    ]));
});

bot.use((ctx, next) => {
  console.log(`Message from: ${ctx.from.id}`);
  return next();
});

// bot.action('custom_theme', (ctx) => {
//     userSessions[ctx.from.id].step = { step: 'enter_custom_theme', isRandom: false };
//     ctx.reply('Введите тему для игры на совпадение:');
// });

bot.action('custom_theme', (ctx) => {
  userSessions[ctx.from.id] = { step: 'enter_custom_theme', matchValues: [], mismatchValues: [], isRandom: false };
  ctx.reply('Введите тему для игры на совпадение:');
});

// bot.action('random_theme', async (ctx) => {
//     const theme = await getRandomTheme();
//     userSessions[ctx.from.id] = { step: 'enter_match_values', theme, matchValues: [], mismatchValues: [] };
//     ctx.reply(`Тема игры на совпадение: ${theme}\nВведите первое значение:`);
// });

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

// bot.on('message', (ctx) => {
//   console.log(`Сообщение от ID: ${ctx.from.id}, Username: ${ctx.from.username}`);
// });

bot.on('message', (ctx) => {
  console.log(ctx.message);  // Логируем данные отправителя
});



bot.on('text', async (ctx) => {
    const session = userSessions[ctx.from.id];
    // session.isRandom = true;
    if (!session) return;

    switch (session.step) {
        case 'enter_custom_theme':
            session.theme = ctx.message.text;
            // session.isRandom = false; // Тема задана вручную
            session.step = 'enter_match_values';
            ctx.reply(`Тема игры на совпадение: ${session.theme}\nВведите первое значение:`);
            break;

        // case 'enter_match_values':
        //     session.matchValues.push(ctx.message.text);
        //     if (session.matchValues.length < 6) {
        //         ctx.reply(`Введите следующее значение (${session.matchValues.length + 1}/6):`);
        //     } else {
        //         if (session.theme === 'random') {
        //             const newTheme = await getRandomTheme(session.theme);
        //             session.mismatchTheme = newTheme;
        //             session.step = 'enter_mismatch_values';
        //             ctx.reply(`Выбрана новая случайная тема: ${newTheme}\nВведите первое значение:`);
        //         } else {
        //             session.step = 'enter_new_custom_theme';
        //             ctx.reply('Введите тему для игры на несовпадение:');
        //         }
        //     }
        //     break;

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
                  ctx.reply('Введите новую тему:');
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
                game.set('chatId', ctx.from.id);
                game.set('creatorName', ctx.from.username || ctx.from.first_name || 'Аноним'); // Сохранение имени
                game.set('status', 'waiting');
                await game.save();
                
                ctx.reply('Игра успешно создана и сохранена!');
                delete userSessions[ctx.from.id];
            }
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
