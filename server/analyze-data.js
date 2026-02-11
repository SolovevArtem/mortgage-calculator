#!/usr/bin/env node

/**
 * Analytics Data Analyzer
 * Быстрый анализ собранных данных из командной строки
 * 
 * Использование:
 * node analyze-data.js
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, 'analytics-data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

async function analyzeData() {
    try {
        console.log('📊 Анализ данных аналитики...\n');

        // Читаем файл с событиями
        const data = await fs.readFile(EVENTS_FILE, 'utf-8');
        const lines = data.trim().split('\n').filter(line => line);
        
        if (lines.length === 0) {
            console.log('⚠️  Данных пока нет. Используйте приложение, чтобы собрать данные.\n');
            return;
        }

        const sessions = lines.map(line => JSON.parse(line));
        const allEvents = sessions.flatMap(session => 
            session.events.map(event => ({
                ...event,
                session_id: session.session_id,
                user_id: session.user_id
            }))
        );

        // Основная статистика
        console.log('=' .repeat(60));
        console.log('ОСНОВНАЯ СТАТИСТИКА');
        console.log('=' .repeat(60));
        
        const uniqueUsers = new Set(sessions.map(s => s.user_id).filter(Boolean));
        const uniqueSessions = new Set(sessions.map(s => s.session_id));
        
        console.log(`📱 Всего сессий: ${uniqueSessions.size}`);
        console.log(`👥 Уникальных пользователей: ${uniqueUsers.size}`);
        console.log(`📝 Всего событий: ${allEvents.length}`);
        console.log(`📊 События на сессию: ${(allEvents.length / uniqueSessions.size).toFixed(2)}`);
        console.log('');

        // События по типам
        console.log('=' .repeat(60));
        console.log('СОБЫТИЯ ПО ТИПАМ');
        console.log('=' .repeat(60));
        
        const eventsByType = {};
        allEvents.forEach(event => {
            eventsByType[event.event_name] = (eventsByType[event.event_name] || 0) + 1;
        });

        Object.entries(eventsByType)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
                const percentage = ((count / allEvents.length) * 100).toFixed(1);
                const bar = '█'.repeat(Math.floor(count / 10));
                console.log(`${type.padEnd(30)} ${count.toString().padStart(5)} (${percentage}%) ${bar}`);
            });
        console.log('');

        // Анализ расчётов
        const calculations = allEvents.filter(e => e.event_name === 'calculation_performed');
        
        if (calculations.length > 0) {
            console.log('=' .repeat(60));
            console.log('АНАЛИЗ РАСЧЁТОВ');
            console.log('=' .repeat(60));
            
            const prices = calculations.map(c => c.properties.price).filter(Boolean);
            const downPayments = calculations.map(c => c.properties.down_payment).filter(Boolean);
            const rates = calculations.map(c => c.properties.rate).filter(Boolean);
            const terms = calculations.map(c => c.properties.term_years).filter(Boolean);

            console.log(`💰 Всего расчётов: ${calculations.length}`);
            console.log('');

            if (prices.length > 0) {
                const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                
                console.log('Стоимость недвижимости:');
                console.log(`  Средняя: ${formatNumber(Math.round(avgPrice))} ₽`);
                console.log(`  Минимум: ${formatNumber(minPrice)} ₽`);
                console.log(`  Максимум: ${formatNumber(maxPrice)} ₽`);
                console.log('');
            }

            if (downPayments.length > 0) {
                const avgDown = downPayments.reduce((a, b) => a + b, 0) / downPayments.length;
                console.log('Первоначальный взнос:');
                console.log(`  Средний: ${formatNumber(Math.round(avgDown))} ₽`);
                console.log('');
            }

            if (rates.length > 0) {
                const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
                const minRate = Math.min(...rates);
                const maxRate = Math.max(...rates);
                
                console.log('Процентная ставка:');
                console.log(`  Средняя: ${avgRate.toFixed(2)}%`);
                console.log(`  Минимум: ${minRate}%`);
                console.log(`  Максимум: ${maxRate}%`);
                console.log('');
            }

            if (terms.length > 0) {
                const avgTerm = terms.reduce((a, b) => a + b, 0) / terms.length;
                console.log('Срок кредита:');
                console.log(`  Средний: ${avgTerm.toFixed(1)} лет`);
                console.log('');
            }
        }

        // Анализ взаимодействий со слайдерами
        const sliderChanges = allEvents.filter(e => e.event_name === 'slider_changed');
        
        if (sliderChanges.length > 0) {
            console.log('=' .repeat(60));
            console.log('ВЗАИМОДЕЙСТВИЯ СО СЛАЙДЕРАМИ');
            console.log('=' .repeat(60));
            
            const slidersByType = {};
            sliderChanges.forEach(event => {
                const slider = event.properties.slider;
                slidersByType[slider] = (slidersByType[slider] || 0) + 1;
            });

            Object.entries(slidersByType)
                .sort((a, b) => b[1] - a[1])
                .forEach(([slider, count]) => {
                    console.log(`${slider.padEnd(20)} ${count} изменений`);
                });
            console.log('');
        }

        // Конверсии
        console.log('=' .repeat(60));
        console.log('КОНВЕРСИИ И ВОВЛЕЧЁННОСТЬ');
        console.log('=' .repeat(60));
        
        const appOpened = eventsByType['app_opened'] || 0;
        const calculationsPerformed = eventsByType['calculation_performed'] || 0;
        const shareClicks = eventsByType['share_clicked'] || 0;

        if (appOpened > 0) {
            const calculationRate = ((calculationsPerformed / appOpened) * 100).toFixed(1);
            console.log(`📊 Conversion Rate: ${calculationRate}% (выполнили расчёт)`);
            
            if (shareClicks > 0) {
                const shareRate = ((shareClicks / calculationsPerformed) * 100).toFixed(1);
                console.log(`📤 Share Rate: ${shareRate}% (поделились расчётом)`);
            }
        }

        const avgCalculationsPerSession = (calculationsPerformed / uniqueSessions.size).toFixed(2);
        console.log(`🔄 Расчётов на сессию: ${avgCalculationsPerSession}`);
        console.log('');

        // Временной анализ
        console.log('=' .repeat(60));
        console.log('ВРЕМЕННОЙ АНАЛИЗ');
        console.log('=' .repeat(60));
        
        const timestamps = allEvents.map(e => new Date(e.timestamp));
        const firstEvent = new Date(Math.min(...timestamps));
        const lastEvent = new Date(Math.max(...timestamps));
        
        console.log(`📅 Первое событие: ${formatDate(firstEvent)}`);
        console.log(`📅 Последнее событие: ${formatDate(lastEvent)}`);
        
        const daysDiff = Math.ceil((lastEvent - firstEvent) / (1000 * 60 * 60 * 24));
        if (daysDiff > 0) {
            console.log(`📆 Период сбора данных: ${daysDiff} ${daysDiff === 1 ? 'день' : 'дней'}`);
            console.log(`📊 Сессий в день: ${(uniqueSessions.size / daysDiff).toFixed(2)}`);
        }
        console.log('');

        // Топ активных пользователей
        if (uniqueUsers.size > 0) {
            console.log('=' .repeat(60));
            console.log('ТОП-5 АКТИВНЫХ ПОЛЬЗОВАТЕЛЕЙ');
            console.log('=' .repeat(60));
            
            const userActivity = {};
            allEvents.forEach(event => {
                if (event.user_id) {
                    userActivity[event.user_id] = (userActivity[event.user_id] || 0) + 1;
                }
            });

            Object.entries(userActivity)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([userId, count], index) => {
                    console.log(`${index + 1}. User ${userId}: ${count} событий`);
                });
            console.log('');
        }

        // Рекомендации
        console.log('=' .repeat(60));
        console.log('💡 РЕКОМЕНДАЦИИ');
        console.log('=' .repeat(60));
        
        if (appOpened > 0) {
            const calculationRate = (calculationsPerformed / appOpened) * 100;
            if (calculationRate < 50) {
                console.log('⚠️  Низкий Conversion Rate - возможно, интерфейс непонятен пользователям');
            } else if (calculationRate > 80) {
                console.log('✅ Отличный Conversion Rate - пользователи активно используют калькулятор');
            }
        }

        if (avgCalculationsPerSession < 2) {
            console.log('⚠️  Мало расчётов на сессию - добавьте функцию сравнения вариантов');
        } else if (avgCalculationsPerSession > 5) {
            console.log('✅ Высокая вовлечённость - пользователи экспериментируют с параметрами');
        }

        if (shareClicks === 0 && calculationsPerformed > 10) {
            console.log('⚠️  Никто не делится расчётами - улучшите функцию "Поделиться"');
        }

        console.log('');

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('❌ Файл с данными не найден.');
            console.log('Убедитесь, что:');
            console.log('1. Сервер аналитики запущен');
            console.log('2. Приложение отправляет данные');
            console.log('3. Файл находится в analytics-data/events.jsonl\n');
        } else {
            console.error('❌ Ошибка при анализе данных:', error.message);
        }
    }
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatDate(date) {
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Запуск
analyzeData().catch(console.error);
