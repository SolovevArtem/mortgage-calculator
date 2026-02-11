// analytics-server.js
// Простой сервер для приёма и хранения аналитики

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Путь для хранения данных
const DATA_DIR = path.join(__dirname, 'analytics-data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

// Инициализация
async function init() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // Создаём файлы если их нет
        try {
            await fs.access(EVENTS_FILE);
        } catch {
            await fs.writeFile(EVENTS_FILE, '');
        }
        
        try {
            await fs.access(STATS_FILE);
        } catch {
            await fs.writeFile(STATS_FILE, JSON.stringify({
                total_sessions: 0,
                total_events: 0,
                total_calculations: 0,
                total_shares: 0,
                unique_users: new Set()
            }, null, 2));
        }
        
        console.log('✅ Analytics server initialized');
    } catch (error) {
        console.error('❌ Initialization error:', error);
    }
}

// Endpoint для приёма событий
app.post('/api/analytics', async (req, res) => {
    try {
        const { session_id, user_id, user_info, events } = req.body;

        if (!events || !Array.isArray(events)) {
            return res.status(400).json({ error: 'Invalid events data' });
        }

        // Добавляем метаданные
        const enrichedData = {
            session_id,
            user_id,
            user_info,
            received_at: new Date().toISOString(),
            events: events.map(event => ({
                ...event,
                processed_at: new Date().toISOString()
            }))
        };

        // Сохраняем в JSONL формат (одна строка = одна сессия)
        await fs.appendFile(
            EVENTS_FILE,
            JSON.stringify(enrichedData) + '\n'
        );

        // Обновляем статистику
        await updateStats(enrichedData);

        console.log(`📊 Received ${events.length} events from session ${session_id}`);

        res.json({
            success: true,
            events_received: events.length
        });

    } catch (error) {
        console.error('Error processing analytics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint для получения статистики
app.get('/api/stats', async (req, res) => {
    try {
        const statsData = await fs.readFile(STATS_FILE, 'utf-8');
        const stats = JSON.parse(statsData);
        
        // Конвертируем Set в массив для JSON
        if (stats.unique_users instanceof Set) {
            stats.unique_users = Array.from(stats.unique_users);
        }

        res.json(stats);
    } catch (error) {
        console.error('Error reading stats:', error);
        res.status(500).json({ error: 'Failed to read stats' });
    }
});

// Endpoint для получения последних событий
app.get('/api/events/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const data = await fs.readFile(EVENTS_FILE, 'utf-8');
        const lines = data.trim().split('\n').filter(line => line);
        
        const recentEvents = lines
            .slice(-limit)
            .map(line => JSON.parse(line));

        res.json({
            count: recentEvents.length,
            events: recentEvents
        });
    } catch (error) {
        console.error('Error reading events:', error);
        res.status(500).json({ error: 'Failed to read events' });
    }
});

// Endpoint для получения аналитики по пользователю
app.get('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const data = await fs.readFile(EVENTS_FILE, 'utf-8');
        const lines = data.trim().split('\n').filter(line => line);
        
        const userSessions = lines
            .map(line => JSON.parse(line))
            .filter(session => session.user_id == userId);

        const allEvents = userSessions.flatMap(session => session.events);

        res.json({
            user_id: userId,
            sessions_count: userSessions.length,
            total_events: allEvents.length,
            sessions: userSessions
        });
    } catch (error) {
        console.error('Error reading user data:', error);
        res.status(500).json({ error: 'Failed to read user data' });
    }
});

// Endpoint для дашборда
app.get('/api/dashboard', async (req, res) => {
    try {
        const data = await fs.readFile(EVENTS_FILE, 'utf-8');
        const lines = data.trim().split('\n').filter(line => line);
        
        const allSessions = lines.map(line => JSON.parse(line));
        const allEvents = allSessions.flatMap(session => session.events);

        // Группируем события по типам
        const eventsByType = {};
        allEvents.forEach(event => {
            const type = event.event_name;
            eventsByType[type] = (eventsByType[type] || 0) + 1;
        });

        // Средние значения расчётов
        const calculations = allEvents.filter(e => e.event_name === 'calculation_performed');
        const avgPrice = calculations.length > 0 
            ? calculations.reduce((sum, e) => sum + (e.properties.price || 0), 0) / calculations.length 
            : 0;
        const avgRate = calculations.length > 0
            ? calculations.reduce((sum, e) => sum + (e.properties.rate || 0), 0) / calculations.length
            : 0;

        // Уникальные пользователи
        const uniqueUsers = new Set(allSessions.map(s => s.user_id).filter(Boolean));

        res.json({
            total_sessions: allSessions.length,
            total_events: allEvents.length,
            unique_users: uniqueUsers.size,
            events_by_type: eventsByType,
            calculations: {
                total: calculations.length,
                avg_price: Math.round(avgPrice),
                avg_rate: avgRate.toFixed(2)
            },
            last_updated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error generating dashboard:', error);
        res.status(500).json({ error: 'Failed to generate dashboard' });
    }
});

// Обновление статистики
async function updateStats(data) {
    try {
        const statsData = await fs.readFile(STATS_FILE, 'utf-8');
        const stats = JSON.parse(statsData);

        stats.total_sessions++;
        stats.total_events += data.events.length;

        // Подсчёт специфичных событий
        data.events.forEach(event => {
            if (event.event_name === 'calculation_performed') {
                stats.total_calculations++;
            }
            if (event.event_name === 'share_clicked') {
                stats.total_shares++;
            }
        });

        if (data.user_id) {
            if (!stats.unique_users) stats.unique_users = [];
            if (!stats.unique_users.includes(data.user_id)) {
                stats.unique_users.push(data.user_id);
            }
        }

        await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Запуск сервера
init().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Analytics server running on port ${PORT}`);
        console.log(`📊 Dashboard: http://localhost:${PORT}/api/dashboard`);
        console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
    });
});

module.exports = app;
