const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const CronJob = require('cron').CronJob;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ファイル指定
const DATA_DIR = path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const COURSES_FILE = path.join(DATA_DIR, 'courses.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 初期化
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, JSON.stringify([]));
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    webhookUrl: "",
    reminderDays: 1
}));
if (!fs.existsSync(COURSES_FILE)) fs.writeFileSync(COURSES_FILE, JSON.stringify({ courses: [] }));

function loadTasks() {
    try {
        return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}
function saveTasks(tasks) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}
function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
        return { webhookUrl: "", reminderDays: 1 };
    }
}
function saveConfig(cfg) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function loadCourses() {
    try {
        return JSON.parse(fs.readFileSync(COURSES_FILE, 'utf8'));
    } catch (e) {
        return { courses: [] };
    }
}

function saveCourses(coursesData) {
    fs.writeFileSync(COURSES_FILE, JSON.stringify(coursesData, null, 2));
}

function getCourseNameById(courseId) {
    const data = loadCourses();
    const course = data.courses.find(c => c.courseId === courseId);
    return course ? course.courseName : null;
}

const ENV_WEBHOOK = process.env.DISCORD_WEBHOOK_URL ? process.env.DISCORD_WEBHOOK_URL.trim() : "";

function formatDateForEmbed(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    // YYYY/MM/DD HH:MM
    const pad = n => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function sendDiscordWebhookEmbed(webhookUrl, embed) {
    try {
        // embedにしたかった
        await axios.post(webhookUrl, { embeds: [embed] });
    } catch (err) {
        console.error('Discord webhook (embed) failed:', err && err.response ? err.response.data : (err && err.message) ? err.message : err);
        throw err;
    }
}

// embed系
function buildTaskEmbed(task) {
    const now = Date.now();
    const dueTs = task.due ? new Date(task.due).getTime() : null;
    const isUrgent = dueTs && (dueTs - now <= 24 * 60 * 60 * 1000);
    const colorUrgent = 0xB91C1C; // 赤
    const colorNormal = 0x2563EB; // 青

    // 説明文の改行を処理（\\nと\nの両方に対応）
    let description = task.description ? String(task.description) : '-';
    description = description.replace(/\\n/g, '\n').replace(/\\r\\n/g, '\n');

    const embed = {
        title: task.title || '(no title)',
        description: description,
        fields: [
            {
                name: '期限',
                value: task.due ? formatDateForEmbed(task.due) : '-',
                inline: false
            }
        ],
        color: isUrgent ? colorUrgent : colorNormal,
        footer: { text: 'Moodle-Assist' }
    };
    // タイムスタンプ
    if (task.due) {
        const d = new Date(task.due);
        if (!isNaN(d.getTime())) embed.timestamp = d.toISOString();
    }
    return embed;
}

// icsパーサー
function unfoldICSLines(raw) {
    return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}
function parseICSTime(s) {
    if (!s) return null;
    s = s.trim();
    const dtMatch = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!dtMatch) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    const [, Y, M, D, hh, mm, ss, z] = dtMatch;
    if (hh === undefined) {
        return new Date(Number(Y), Number(M) - 1, Number(D));
    } else {
        const iso = `${Y}-${M}-${D}T${hh}:${mm}:${ss}${z ? 'Z' : ''}`;
        const d = new Date(iso);
        return isNaN(d.getTime()) ? null : d;
    }
}
function parseICS(data) {
    const unfolded = unfoldICSLines(data);
    const vevents = unfolded.split(/BEGIN:VEVENT/).slice(1);
    const events = [];
    for (const v of vevents) {
        const block = v.split('END:VEVENT')[0];
        if (!block) continue;
        const getField = (name) => {
            const re = new RegExp('^' + name + '(?:;[^:]*)?:(.*)$', 'm');
            const m = block.match(re);
            return m ? m[1].trim() : '';
        };
        const summary = getField('SUMMARY') || '(no title)';
        const description = getField('DESCRIPTION') || '';
        const dtstartRaw = getField('DTSTART');
        const uid = getField('UID') || null;
        const categories = getField('CATEGORIES') || '';
        const startDate = parseICSTime(dtstartRaw);
        events.push({
            summary,
            description,
            dtstart: startDate ? startDate.toISOString() : null,
            uid,
            courseId: categories
        });
    }
    return events;
}
// パーサーここまで

// apiとか
app.get('/api/tasks', (req, res) => {
    const tasks = loadTasks();
    res.json(tasks);
});

// インポート一時保存
const importCache = {};

app.post('/api/import', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
        const r = await axios.get(url);
        const parsedEvents = parseICS(r.data);

        const tasks = loadTasks();
        const coursesData = loadCourses();
        const existingCourseIds = new Set(coursesData.courses.map(c => c.courseId));

        const existingUids = new Set(tasks.map(t => t.uid).filter(Boolean));
        const existingByTitleDue = tasks.map(t => ({
            id: t.id,
            titleNorm: (t.title || '').trim().toLowerCase(),
            dueTs: t.due ? new Date(t.due).getTime() : null
        }));

        const toAdd = [];
        const newCourseInfo = {};  // courseId -> { courseId, sampleTaskTitle }

        for (const ev of parsedEvents) {
            if (!ev.dtstart) continue;
            if (ev.uid && existingUids.has(ev.uid)) continue;

            const titleNorm = (ev.summary || '').trim().toLowerCase();
            const dueTs = ev.dtstart ? new Date(ev.dtstart).getTime() : null;
            let isDup = false;
            if (!ev.uid && titleNorm && dueTs) {
                for (const ex of existingByTitleDue) {
                    if (!ex.dueTs) continue;
                    if (ex.titleNorm === titleNorm && Math.abs(ex.dueTs - dueTs) <= 60 * 1000) {
                        isDup = true;
                        break;
                    }
                }
            }
            if (isDup) continue;

            const task = {
                id: uuidv4(),
                uid: ev.uid,
                title: ev.summary,
                description: ev.description,
                due: ev.dtstart,
                courseId: ev.courseId || '',
                status: 'active',
                created_at: (new Date()).toISOString(),
                reminded: false
            };
            toAdd.push(task);
            existingByTitleDue.push({
                id: task.id,
                titleNorm: (task.title || '').trim().toLowerCase(),
                dueTs: task.due ? new Date(task.due).getTime() : null
            });
            if (task.uid) existingUids.add(task.uid);

            // 新規コース
            if (ev.courseId && !existingCourseIds.has(ev.courseId) && !newCourseInfo[ev.courseId]) {
                newCourseInfo[ev.courseId] = {
                    courseId: ev.courseId,
                    sampleTaskTitle: ev.summary || ''
                };
            }
        }

        // 一時保存
        const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        importCache[importId] = { toAdd, existingCourseIds };

        const newCourseList = Object.values(newCourseInfo);
        res.json({ importId, newCourses: newCourseList, count: toAdd.length });
    } catch (err) {
        console.error('Import error:', err && err.message ? err.message : err);
        res.status(500).json({ error: 'Failed to fetch or parse ICS', details: err && err.message ? err.message : String(err) });
    }
});

app.post('/api/task/:id/complete', (req, res) => {
    const id = req.params.id;
    const tasks = loadTasks();
    const t = tasks.find(x => x.id === id);
    if (!t) return res.status(404).json({ error: 'Not found' });
    t.status = 'completed';
    t.completed_at = (new Date()).toISOString();
    saveTasks(tasks);
    res.json({ ok: true, task: t });
});

app.post('/api/task/:id/delete', (req, res) => {
    const id = req.params.id;
    const tasks = loadTasks();
    const t = tasks.find(x => x.id === id);
    if (!t) return res.status(404).json({ error: 'Not found' });
    t.status = 'deleted';
    t.deleted_at = (new Date()).toISOString();
    saveTasks(tasks);
    res.json({ ok: true, task: t });
});

app.post('/api/task/:id/restore', (req, res) => {
    const id = req.params.id;
    const tasks = loadTasks();
    const t = tasks.find(x => x.id === id);
    if (!t) return res.status(404).json({ error: 'Not found' });
    t.status = 'active';
    delete t.deleted_at;
    saveTasks(tasks);
    res.json({ ok: true, task: t });
});

app.post('/api/task/:id/notify', async (req, res) => {
    const id = req.params.id;
    const tasks = loadTasks();
    const t = tasks.find(x => x.id === id);
    if (!t) return res.status(404).json({ error: 'Task not found' });

    const cfg = loadConfig();
    const webhookUrl = ENV_WEBHOOK || (cfg.webhookUrl || '');
    if (!webhookUrl) {
        return res.status(400).json({ error: 'Webhook not configured on server. Set DISCORD_WEBHOOK_URL in .env and restart.' });
    }

    const embed = buildTaskEmbed(t);
    try {
        await sendDiscordWebhookEmbed(webhookUrl, embed);
        return res.json({ ok: true, sent: true });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to send webhook', details: err && err.message ? err.message : String(err) });
    }
});

// 全削除仮実装
app.post('/api/debug/clear-tasks', (req, res) => {
    try {
        saveTasks([]);
        res.json({ ok: true, cleared: true, remaining: 0 });
    } catch (err) {
        console.error('Clear tasks failed:', err);
        res.status(500).json({ ok: false, error: 'Failed to clear tasks' });
    }
});

app.post('/api/config', (req, res) => {
    const cfg = loadConfig();
    const { reminderDays } = req.body;

    if (typeof reminderDays === 'number') cfg.reminderDays = reminderDays;
    saveConfig(cfg);
    return res.json({ ok: true, config: cfg, envWebhook: !!ENV_WEBHOOK });
});
app.get('/api/config', (req, res) => {
    const cfg = loadConfig();
    res.json({
        reminderDays: typeof cfg.reminderDays === 'number' ? cfg.reminderDays : 1,
        envWebhook: !!ENV_WEBHOOK,
        envWebhookValue: ENV_WEBHOOK || ""
    });
});

app.get('/api/courses', (req, res) => {
    const coursesData = loadCourses();
    res.json(coursesData.courses);
});

app.post('/api/courses', (req, res) => {
    const { courseId, courseName } = req.body;
    if (!courseId || !courseName) {
        return res.status(400).json({ error: '科目名が入力されていません。' });
    }
    const coursesData = loadCourses();

    // 科目名の重複チェック（同じcourseIdは除外）
    const isDuplicateName = coursesData.courses.some(c =>
        c.courseName === courseName && c.courseId !== courseId
    );
    if (isDuplicateName) {
        return res.status(400).json({ error: '同じ科目名が既に存在します。', duplicate: true });
    }

    const existing = coursesData.courses.find(c => c.courseId === courseId);
    if (!existing) {
        coursesData.courses.push({ courseId, courseName });
    } else {
        existing.courseName = courseName;
    }
    saveCourses(coursesData);
    res.json({ ok: true, course: { courseId, courseName } });
});

app.delete('/api/courses/:courseId', (req, res) => {
    const courseId = req.params.courseId;
    const coursesData = loadCourses();
    const index = coursesData.courses.findIndex(c => c.courseId === courseId);
    if (index === -1) {
        return res.status(404).json({ error: '科目が見つかりませんでした。' });
    }
    coursesData.courses.splice(index, 1);
    saveCourses(coursesData);
    res.json({ ok: true });
});

app.post('/api/import/confirm', (req, res) => {
    const { importId } = req.body;
    if (!importId || !importCache[importId]) {
        return res.status(400).json({ error: '無効のIDです。' });
    }

    const { toAdd } = importCache[importId];
    const tasks = loadTasks();
    tasks.push(...toAdd);
    saveTasks(tasks);

    // キャッシュクリア
    delete importCache[importId];

    res.json({ ok: true, added: toAdd.length });
});

// リマインド cronにする
const job = new CronJob('* * * * *', async () => {
    const tasks = loadTasks();
    const cfg = loadConfig();
    const webhookUrl = ENV_WEBHOOK || (cfg.webhookUrl || '');
    if (!webhookUrl) return;

    const reminderDays = (typeof cfg.reminderDays === 'number' ? cfg.reminderDays : 1);
    const reminderBeforeMs = reminderDays * 24 * 60 * 60 * 1000;

    const now = Date.now();
    let changed = false;

    for (const t of tasks) {
        if (t.status !== 'active') continue;
        if (!t.due) continue;
        const dueTs = new Date(t.due).getTime();

        if (!t.reminded && now >= dueTs - reminderBeforeMs && now < dueTs + (24 * 60 * 60 * 1000)) {
            const embed = buildTaskEmbed(t);
            try {
                await sendDiscordWebhookEmbed(webhookUrl, embed);
                t.reminded = true;
                changed = true;
            } catch (err) {
                console.error('リマインダー送信失敗...。', t.id, err && err.message ? err.message : err);
            }
        }
    }

    if (changed) saveTasks(tasks);
});
job.start();

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    if (ENV_WEBHOOK) console.log('Discord webhook provided via .env (DISCORD_WEBHOOK_URL) is active.');
});