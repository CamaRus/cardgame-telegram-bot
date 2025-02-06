require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const Parse = require('parse/node');

// Инициализация Parse SDK
Parse.initialize(process.env.BACK4APP_APP_ID, process.env.BACK4APP_JS_KEY);
Parse.serverURL = process.env.BACK4APP_SERVER_URL;

const bot = new Telegraf(process.env.BOT_TOKEN);

// Функция получения случайной темы из Back4App
async function getRandomTheme() {
    try {
        const Themes = Parse.Object.extend('Themes');
        const query = new Parse.Query(Themes);
        const results = await query.find();

        if (results.length === 0) return 'Нет доступных тем';

        const randomTheme = results[Math.floor(Math.random() * results.length)].get('theme');
        return randomTheme;
    } catch (error) {
        console.error('Ошибка при получении темы:', error);
        return 'Ошибка при выборе темы';
    }
}

// Обработчик команды /start
bot.start((ctx) => {
    ctx.reply('Выберите действие:', Markup.inlineKeyboard([
        [Markup.button.callback('Создать игру', 'create_game')],
        [Markup.button.callback('Присоединиться', 'join_game')],
        [Markup.button.callback('Мои игры', 'my_games')]
    ]));
});

// Обработчик кнопки "Создать игру"
bot.action('create_game', (ctx) => {
    ctx.reply('Выберите способ выбора темы:', Markup.inlineKeyboard([
        [Markup.button.callback('Своя тема', 'custom_theme')],
        [Markup.button.callback('Случайная тема', 'random_theme')]
    ]));
});

// Обработчик кнопки "Своя тема"
bot.action('custom_theme', (ctx) => {
    ctx.reply('Введите тему для игры:');
    bot.on('text', async (ctx) => {
        const theme = ctx.message.text;
        ctx.reply(`Игра создана с темой: ${theme}`);

        // Сохранение игры в базу данных
        const Game = Parse.Object.extend('Games');
        const game = new Game();
        game.set('theme', theme);
        game.set('creator', ctx.from.id);
        game.set('status', 'waiting');
        await game.save();
    });
});

// Обработчик кнопки "Случайная тема"
bot.action('random_theme', async (ctx) => {
    const theme = await getRandomTheme();
    ctx.reply(`Игра создана с темой: ${theme}`);

    // Сохранение игры в базу данных
    const Game = Parse.Object.extend('Games');
    const game = new Game();
    game.set('theme', theme);
    game.set('creator', ctx.from.id);
    game.set('status', 'waiting');
    await game.save();
});

// Запуск бота
bot.launch().then(() => console.log('Бот запущен 🚀'));

// Корректное завершение работы бота
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
