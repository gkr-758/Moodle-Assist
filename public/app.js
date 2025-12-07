async function api(path, method = 'GET', body = null) {
    const opts = { method, headers: {} };
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    const data = await res.json();
    if (!res.ok) {
        throw data;
    }
    return data;
}

function $(id) { return document.getElementById(id); }

// sort
let currentSort = 'default';
let tasksData = [];

// 左のメニューこれ
const navHome = $('nav-home');
const navCourses = $('nav-courses');
const navSettings = $('nav-settings');
const homeView = $('home-view');
const coursesView = $('courses-view');
const settingsView = $('settings-view');
const pageTitle = $('page-title');
const sidebar = $('sidebar');
const sidebarOverlay = $('sidebarOverlay');
const menuToggle = $('menuToggle');

// レスポンシブ
function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
}

menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('open');
});

sidebarOverlay.addEventListener('click', closeSidebar);

navHome.addEventListener('click', () => {
    showView('home');
    closeSidebar();
});

navCourses.addEventListener('click', () => {
    showView('courses');
    closeSidebar();
});

navSettings.addEventListener('click', () => {
    showView('settings');
    closeSidebar();
});

function showView(name) {
    // 非表示
    [navHome, navCourses, navSettings].forEach(btn => btn.classList.remove('active'));
    [homeView, coursesView, settingsView].forEach(view => view.classList.add('hidden'));

    if (name === 'home') {
        navHome.classList.add('active');
        homeView.classList.remove('hidden');
        pageTitle.innerText = 'ホーム';
        loadTasks();
    } else if (name === 'courses') {
        navCourses.classList.add('active');
        coursesView.classList.remove('hidden');
        pageTitle.innerText = '科目一覧';
        loadCoursesList();
    } else if (name === 'settings') {
        navSettings.classList.add('active');
        settingsView.classList.remove('hidden');
        pageTitle.innerText = '設定';
        loadConfigToUI();
    }
}

async function loadTasks() {
    const tasks = await api('/api/tasks');
    const courses = await api('/api/courses');
    const courseMap = {};
    courses.forEach(c => courseMap[c.courseId] = c.courseName);

    // course追加
    tasks.forEach(t => {
        if (t.courseId && courseMap[t.courseId]) {
            t.courseName = courseMap[t.courseId];
        }
    });

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
    // 改行くたばれ
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

    // コース名バッジ
    if (t.courseName) {
        const courseBadge = document.createElement('div');
        courseBadge.className = 'course-badge';
        courseBadge.innerText = t.courseName;
        meta.appendChild(courseBadge);
    }

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
    tasksData = tasks;
    currentSort = 'default';
    $('sortSelect').value = 'default';
    renderTasksWithSort(tasks);
}

function renderTasksWithSort(tasks) {
    const container = $('tasksContainer');
    container.innerHTML = '';

    // ソート
    function sortTasks(arr, type) {
        const copy = [...arr];
        if (type === 'course') {
            // 科目
            copy.sort((a, b) => {
                const nameA = (a.courseName || '(未分類)').toLowerCase();
                const nameB = (b.courseName || '(未分類)').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        } else if (type === 'dueASC') {
            // ちかい
            copy.sort((a, b) => {
                const dueA = a.due ? new Date(a.due).getTime() : Infinity;
                const dueB = b.due ? new Date(b.due).getTime() : Infinity;
                return dueA - dueB;
            });
        } else if (type === 'dueDESC') {
            // とおい
            copy.sort((a, b) => {
                const dueA = a.due ? new Date(a.due).getTime() : -Infinity;
                const dueB = b.due ? new Date(b.due).getTime() : -Infinity;
                return dueB - dueA;
            });
        }
        return copy;
    }

    const sortedTasks = currentSort === 'default' ? tasks : sortTasks(tasks, currentSort);

    const groups = {
        active: sortedTasks.filter(t => t.status === 'active'),
        completed: sortedTasks.filter(t => t.status === 'completed'),
        deleted: sortedTasks.filter(t => t.status === 'deleted')
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

// コース
const courseModal = $('courseModal');
const courseModalOverlay = $('courseModalOverlay');
const courseModalBody = $('courseModalBody');
const courseModalSave = $('courseModalSave');
const courseModalCancel = $('courseModalCancel');

function closeCourseModal() {
    courseModal.classList.add('hidden');
}

courseModalOverlay.addEventListener('click', closeCourseModal);
courseModalCancel.addEventListener('click', closeCourseModal);

async function showCourseRegistrationModal(importId, newCourses) {
    courseModalBody.innerHTML = '';

    for (const courseInfo of newCourses) {
        const courseId = courseInfo.courseId;
        const sampleTitle = courseInfo.sampleTaskTitle || '';
        const displayTitle = sampleTitle.length > 10 ? sampleTitle.substring(0, 10) + '...' : sampleTitle;

        const div = document.createElement('div');
        div.style.marginBottom = '8px';

        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.marginBottom = '2px';
        label.style.fontSize = '12px';
        label.innerText = `${courseId} (例: ${displayTitle})`;

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '科目名';
        input.id = `course-input-${courseId}`;
        input.style.marginBottom = '0';
        input.style.padding = '6px 8px';
        input.style.fontSize = '13px';
        input.required = true;

        const errorMsg = document.createElement('div');
        errorMsg.id = `course-error-${courseId}`;
        errorMsg.style.color = '#ef4444';
        errorMsg.style.fontSize = '11px';
        errorMsg.style.marginTop = '2px';
        errorMsg.style.display = 'none';

        div.appendChild(label);
        div.appendChild(input);
        div.appendChild(errorMsg);
        courseModalBody.appendChild(div);
    }

    courseModal.classList.remove('hidden');

    return new Promise(resolve => {
        courseModalSave.onclick = async () => {
            let hasError = false;

            // ばっりでえええ
            for (const courseInfo of newCourses) {
                const input = $(`course-input-${courseInfo.courseId}`);
                const errorMsg = $(`course-error-${courseInfo.courseId}`);
                const courseName = input.value.trim();
                if (!courseName) {
                    input.style.borderColor = '#ef4444';
                    errorMsg.innerText = '科目名を入力してください';
                    errorMsg.style.display = 'block';
                    hasError = true;
                } else {
                    input.style.borderColor = '';
                    errorMsg.style.display = 'none';
                }
            }

            if (hasError) return;

            // 科目名保存
            for (const courseInfo of newCourses) {
                const input = $(`course-input-${courseInfo.courseId}`);
                const errorMsg = $(`course-error-${courseInfo.courseId}`);
                const courseName = input.value.trim();
                if (courseName) {
                    try {
                        await api('/api/courses', 'POST', { courseId: courseInfo.courseId, courseName });
                    } catch (err) {
                        if (err && err.duplicate) {
                            input.style.borderColor = '#ef4444';
                            errorMsg.innerText = 'この科目名は既に登録されています！！';
                            errorMsg.style.display = 'block';
                            hasError = true;
                        }
                    }
                }
            }

            if (hasError) return;

            // 保存後追加する！！
            await api('/api/import/confirm', 'POST', { importId });

            closeCourseModal();
            resolve();
        };
    });
}

// ソート
$('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderTasksWithSort(tasksData);
});

// 科目管理
async function loadCoursesList() {
    const courses = await api('/api/courses');
    const tasks = await api('/api/tasks');
    const courseMap = {};
    courses.forEach(c => courseMap[c.courseId] = c.courseName);

    // タスクにコース名をセット
    tasks.forEach(t => {
        if (t.courseId && courseMap[t.courseId]) {
            t.courseName = courseMap[t.courseId];
        }
    });

    // 各科目の課題数を集計
    const taskCountByCourseName = {};
    tasks.forEach(t => {
        if (t.status === 'active' && t.courseName) {
            taskCountByCourseName[t.courseName] = (taskCountByCourseName[t.courseName] || 0) + 1;
        }
    });

    const container = $('coursesContainer');
    container.innerHTML = '';

    if (courses.length === 0) {
        const p = document.createElement('div');
        p.className = 'muted';
        p.innerText = '登録されている科目がありません';
        container.appendChild(p);
        return;
    }

    courses.forEach(course => {
        const count = taskCountByCourseName[course.courseName] || 0;

        const div = document.createElement('div');
        div.className = 'course-item';

        const info = document.createElement('div');
        info.style.flex = '1';

        const name = document.createElement('div');
        name.style.fontWeight = '700';
        name.style.fontSize = '14px';
        name.innerText = course.courseName;

        const details = document.createElement('div');
        details.className = 'muted';
        details.style.fontSize = '12px';
        details.style.marginTop = '4px';
        details.innerText = `コース: ${course.courseId} | 課題: ${count}件`;

        info.appendChild(name);
        info.appendChild(details);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '6px';

        const editBtn = document.createElement('button');
        editBtn.innerText = '編集';
        editBtn.style.padding = '6px 12px';
        editBtn.style.fontSize = '12px';
        editBtn.onclick = () => editCourseName(course);

        const deleteBtn = document.createElement('button');
        deleteBtn.innerText = '削除';
        deleteBtn.className = 'secondary';
        deleteBtn.style.padding = '6px 12px';
        deleteBtn.style.fontSize = '12px';
        deleteBtn.style.background = '#ef4444';
        deleteBtn.style.color = '#fff';
        deleteBtn.onclick = () => deleteCourse(course);

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        div.appendChild(info);
        div.appendChild(actions);
        container.appendChild(div);
    });
}

function editCourseName(course) {
    const newName = prompt(`「${course.courseName}」の科目名を編集`, course.courseName);
    if (!newName || !newName.trim()) return;

    api('/api/courses', 'POST', { courseId: course.courseId, courseName: newName.trim() })
        .then(() => loadCoursesList())
        .catch(err => alert('編集に失敗しました: ' + (err && err.error ? err.error : '不明なエラー')));
}

function deleteCourse(course) {
    if (!confirm(`「${course.courseName}」を本当に削除しますか？\n\n課題は削除されません。`)) return;

    api('/api/courses/' + course.courseId, 'DELETE', null)
        .then(() => {
            alert('削除しました');
            loadCoursesList();
        })
        .catch(err => alert('削除に失敗しました: ' + (err && err.error ? err.error : '不明なエラー')));
}

// 設定
$('importBtn').addEventListener('click', async () => {
    const url = $('icsUrl').value.trim();
    const resultEl = $('importResult');
    if (!url) { resultEl.innerText = 'URLを入力してください'; return; }
    resultEl.innerText = '読み込み中...';
    try {
        const r = await api('/api/import', 'POST', { url });
        resultEl.innerText = `${r.count} 件の課題を検出しました`;
        $('icsUrl').value = '';

        // 新規コース
        if (r.newCourses && r.newCourses.length > 0) {
            await showCourseRegistrationModal(r.importId, r.newCourses);
        } else {
            await api('/api/import/confirm', 'POST', { importId: r.importId });
            resultEl.innerText = `追加: ${r.count} 件`;
        }

        loadTasks();
    } catch (err) {
        resultEl.innerText = 'インポート失敗';
    }
});

// リマインド
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