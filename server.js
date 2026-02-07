require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Подключение к сервисам
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ===== API МАРШРУТЫ =====

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Статистика
app.get('/api/stats', async (req, res) => {
    try {
        const { count: total } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true });
        
        const { count: published } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'published');

        res.json({ total: total || 0, published: published || 0 });
    } catch (error) {
        res.json({ total: 0, published: 0 });
    }
});

// Список постов на модерацию
app.get('/api/posts/pending', async (req, res) => {
    try {
        const { data } = await supabase
            .from('posts')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(20);
        
        res.json({ data: data || [] });
    } catch (error) {
        res.json({ data: [] });
    }
});

// Одобрить/отклонить пост
app.post('/api/posts/decide', async (req, res) => {
    const { id, decision } = req.body;
    
    try {
        await supabase
            .from('posts')
            .update({ status: decision })
            .eq('id', id);

        if (decision === 'approved') {
            // Добавляем в очередь публикации
            await supabase.from('queue').insert([{
                post_id: id,
                platform: 'telegram',
                scheduled_for: new Date(Date.now() + 60000)
            }]);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Добавить источник
app.post('/api/sources', async (req, res) => {
    const { username, category } = req.body;
    
    try {
        const { data } = await supabase
            .from('sources')
            .insert([{
                username: username.startsWith('@') ? username : '@' + username,
                category: category || 'news',
                is_active: true
            }])
            .select();
        
        res.json({ success: true, data: data[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Список источников
app.get('/api/sources', async (req, res) => {
    try {
        const { data } = await supabase.from('sources').select('*');
        res.json({ data: data || [] });
    } catch (error) {
        res.json({ data: [] });
    }
});

// ===== TELEGRAM BOT КОМАНДЫ =====

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        '🤖 <b>AI Content Empire</b>\n\n' +
        'Управляй контентом через веб-приложение:\n' +
        'https://t.me/' + process.env.BOT_USERNAME + '/app\n\n' +
        'Или используй команды:\n' +
        '/parse - запустить парсинг\n' +
        '/stats - статистика',
        { parse_mode: 'HTML' }
    );
});

bot.onText(/\/parse/, async (msg) => {
    bot.sendMessage(msg.chat.id, '🔍 Парсинг запущен...');
    // Здесь логика парсинга
});

bot.onText(/\/stats/, async (msg) => {
    const { count: total } = await supabase.from('posts').select('*', { count: 'exact', head: true });
    bot.sendMessage(msg.chat.id, `📊 Всего постов: ${total || 0}`);
});

// ===== АВТОМАТИЗАЦИЯ =====

// Проверка очереди каждую минуту
cron.schedule('* * * * *', async () => {
console.log('Проверка очереди...');
    // Логика публикации из очереди
});

// ===== ЗАПУСК =====

app.listen(PORT, () => {
    console.log(`🚀 Сервер: http://localhost:${PORT}`);
    console.log('🤖 Бот активен');
});
