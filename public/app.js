async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: {} };
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    return res.json();
}

function $(id) { return document.getElementById(id); }

// 左のメニューこれ
const navHome = $('nav-home');
const navSettings = $('nav-settings');
const homeView = $('home-view');
const settingsView = $('settings-view');
const pageTitle = $('page-title');

navHome.addEventListener('click', () => showView('home'));
navSettings.addEventListener('click', () => showView('settings'));

function showView(name) {
    if (name === 'home') {
        navHome.classList.add('active');
        navSettings.classList.remove('active');
        homeView.classList.remove('hidden');
        settingsView.classList.add('hidden');
        pageTitle.innerText = 'ホーム';
        loadTasks();
    } else {
        navHome.classList.remove('active');
        navSettings.classList.add('active');
        homeView.classList.add('hidden');
        settingsView.classList.remove('hidden');
        pageTitle.innerText = '設定';
        loadConfigToUI();
    }
}

async function loadTasks() {
    const tasks = await api('/api/tasks');
    renderTasks(tasks);
}

function formatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString();
}

function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
}

function createTaskElem(t) {
    const el = document.createElement('div');
    el.className = 'task';
    const meta = document.createElement('div');
    meta.className = 'meta';

    const title = document.createElement('div');
    title.innerText = t.title || '(no title)';
    title.style.fontWeight = '700';
    meta.appendChild(title);

    const rawOrig = t.description || '';
    // 正規表現
    let cleaned = rawOrig.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleaned.split('\n');
    const moreThanFive = lines.length > 5;
    const firstFive = lines.slice(0, 5).map(l => escapeHtml(l)).join('<br>');

    if (moreThanFive) {
        const collapsed = document.createElement('div');
        collapsed.className = 'desc desc-collapsed';
        collapsed.innerHTML = firstFive;
        meta.appendChild(collapsed);

        const full = document.createElement('div');
        full.className = 'desc';
        full.style.display = 'none';
        full.innerHTML = escapeHtml(cleaned).replace(/\n/g, '<br>');
        meta.appendChild(full);

        const readmore = document.createElement('button');
        readmore.className = 'readmore';
        readmore.innerText = '続きを見る';
        let open = false;
        readmore.onclick = () => {
            open = !open;
            if (open) {
                collapsed.style.display = 'none';
                full.style.display = 'block';
                readmore.innerText = '閉じる';
            } else {
                collapsed.style.display = 'block';
                full.style.display = 'none';
                readmore.innerText = '続きを見る';
            }
        };
        meta.appendChild(readmore);
    } else {
        const desc = document.createElement('div');
        desc.className = 'desc';
        desc.innerHTML = escapeHtml(cleaned).replace(/\n/g, '<br>');
        meta.appendChild(desc);
    }

    const ts = document.createElement('div');
    ts.className = 'timestamp';
    ts.innerText = '期限: ' + formatDate(t.due);

    // 課題近くなったら太字にする
    const now = Date.now();
    if (t.due) {
        const dueTs = new Date(t.due).getTime();
        if (dueTs - now <= 24 * 60 * 60 * 1000) {
            ts.classList.add('urgent');
        }
    }

    meta.appendChild(ts);

    const badge = document.createElement('div');
    badge.className = 'badge ' + (t.status || 'active');
    badge.innerText = t.status || 'active';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const notifyResult = document.createElement('span');
    notifyResult.style.fontSize = '13px';
    notifyResult.style.color = '#374151';
    notifyResult.style.marginLeft = '8px';

    if (t.status === 'active') {
        const completeBtn = document.createElement('button');
        completeBtn.innerText = '完了';
        completeBtn.onclick = async () => { await api(`/api/task/${t.id}/complete`, 'POST'); loadTasks(); };

        const deleteBtn = document.createElement('button');
        deleteBtn.innerText = '削除';
        deleteBtn.className = 'secondary';
        deleteBtn.onclick = async () => { await api(`/api/task/${t.id}/delete`, 'POST'); loadTasks(); };

        const notifyBtn = document.createElement('button');
        notifyBtn.innerText = '通知';
        notifyBtn.style.background = '#f59e0b'; //緑の方がかわいいかも
        notifyBtn.onclick = async () => {
            notifyBtn.disabled = true;
            notifyResult.innerText = '送信中...';
            try {
                const r = await api(`/api/task/${t.id}/notify`, 'POST');
                if (r && r.ok) {
                    notifyResult.innerText = '送信済み';
                    setTimeout(() => { notifyResult.innerText = ''; notifyBtn.disabled = false; }, 3000);
                } else {
                    notifyResult.innerText = '';
                    notifyBtn.disabled = false;
                    alert('通知に失敗しました: ' + (r && r.error ? r.error : '不明なエラー'));
                }
            } catch (err) {
                notifyResult.innerText = '';
                notifyBtn.disabled = false;
                alert('Network Error');
            }
        };

        actions.appendChild(completeBtn);
        actions.appendChild(deleteBtn);
        actions.appendChild(notifyBtn);
        actions.appendChild(notifyResult);
    } else {
        const restoreBtn = document.createElement('button');
        restoreBtn.innerText = '復元';
        restoreBtn.onclick = async () => { await api(`/api/task/${t.id}/restore`, 'POST'); loadTasks(); };
        actions.appendChild(restoreBtn);
    }

    const right = document.createElement('div');
    right.appendChild(badge);
    right.appendChild(actions);

    el.appendChild(meta);
    el.appendChild(right);
    return el;
}

function renderTasks(tasks) {
    const container = $('tasksContainer');
    container.innerHTML = '';

    const groups = {
        active: tasks.filter(t => t.status === 'active'),
        completed: tasks.filter(t => t.status === 'completed'),
        deleted: tasks.filter(t => t.status === 'deleted')
    };

    const makeGroup = (title, arr) => {
        const box = document.createElement('div');
        const h = document.createElement('h3');
        h.innerText = `${title} (${arr.length})`;
        box.appendChild(h);
        if (arr.length === 0) {
            const p = document.createElement('div');
            p.className = 'muted';
            p.innerText = 'なし';
            box.appendChild(p);
        } else {
            arr.forEach(t => box.appendChild(createTaskElem(t)));
        }
        return box;
    };

    container.appendChild(makeGroup('アクティブ', groups.active));
    container.appendChild(makeGroup('完了', groups.completed));
    container.appendChild(makeGroup('削除済み', groups.deleted));
}

// 設定
$('importBtn').addEventListener('click', async () => {
    const url = $('icsUrl').value.trim();
    const resultEl = $('importResult');
    if (!url) { resultEl.innerText = 'URLを入力してください'; return; }
    resultEl.innerText = '読み込み中...';
    try {
        const r = await api('/api/import', 'POST', { url });
        resultEl.innerText = `追加: ${r.count} 件`;
        $('icsUrl').value = '';
        loadTasks();
    } catch (err) {
        resultEl.innerText = 'インポート失敗';
    }
});

// リマインドの日付
$('saveConfigBtn').addEventListener('click', async () => {
    const reminderDays = Number($('reminderDays').value);
    const body = {};
    if (!isNaN(reminderDays)) body.reminderDays = reminderDays;
    const r = await api('/api/config', 'POST', body);
    if (r && r.ok) {
        $('configResult').innerText = '保存しました';
        loadConfigToUI();
    } else {
        $('configResult').innerText = '保存に失敗しました';
    }
});

// 全削除仮
$('clearAllBtn').addEventListener('click', async () => {
    if (!confirm('マジで？')) return;
    const el = $('clearResult');
    el.innerText = '実行中...';
    try {
        const r = await api('/api/debug/clear-tasks', 'POST');
        if (r && r.ok) {
            el.innerText = 'Done!';
            loadTasks();
        } else {
            el.innerText = 'Failed...';
        }
    } catch (err) {
        el.innerText = 'Failed...';
    }
});

async function loadConfigToUI() {
    const cfg = await api('/api/config');
    if (!cfg) return;
    if (cfg.envWebhook) {
        $('envWebhookInfo').innerText = 'Webhookが正しく設定されています。';
    } else {
        $('envWebhookInfo').innerText = 'Webhookが未設定です。';
    }
    $('reminderDays').value = (typeof cfg.reminderDays === 'number') ? cfg.reminderDays : 1;
}

window.addEventListener('load', () => {
    showView('home');
    setInterval(loadTasks, 60 * 1000);
});