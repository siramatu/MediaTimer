// アプリケーション状態
const state = {
    // タイマー状態
    isRunning: false,
    isPaused: false,
    elapsedSeconds: 0,
    sessionStartTime: null,
    timerInterval: null,

    // 休憩関連
    breakTimer: null,
    breakElapsedSeconds: 0,
    nextBreakSeconds: 0,
    isOnBreak: false,

    // 設定
    settings: {
        dailyLimitHours: 3,
        adultLimitHours: 1,
        breakIntervalMinutes: 20,
        breakDurationMinutes: 10
    },

    // 履歴
    history: [],
    todayNormalSeconds: 0,
    todayAdultSeconds: 0,

    // 前回のセッション情報（休憩チェック用）
    lastSessionSeconds: 0,
    lastStopTime: null,

    // アラーム
    alarmInterval: null
};

// DOM要素
const elements = {
    // タイマー表示
    hours: document.getElementById('hours'),
    minutes: document.getElementById('minutes'),
    seconds: document.getElementById('seconds'),
    remainingTime: document.getElementById('remainingTime'),
    remainingLabel: document.getElementById('remainingLabel'),
    adultRemaining: document.getElementById('adultRemaining'),
    adultRemainingTime: document.getElementById('adultRemainingTime'),

    // コントロール
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    contentTypeRadios: document.querySelectorAll('input[name="contentType"]'),

    // 休憩
    breakInfo: document.getElementById('breakInfo'),
    breakCountdown: document.getElementById('breakCountdown'),
    breakModal: document.getElementById('breakModal'),
    breakTimerDisplay: document.getElementById('breakTimerDisplay'),
    breakDoneBtn: document.getElementById('breakDoneBtn'),

    // 履歴
    historyList: document.getElementById('historyList'),
    todayTotal: document.getElementById('todayTotal'),

    // 画面切り替え
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),
    settingsBtn: document.getElementById('settingsBtn'),
    backBtn: document.getElementById('backBtn'),

    // 設定
    dailyLimit: document.getElementById('dailyLimit'),
    adultLimit: document.getElementById('adultLimit'),
    breakInterval: document.getElementById('breakInterval'),
    breakDuration: document.getElementById('breakDuration'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),

    // 手動追加
    manualHours: document.getElementById('manualHours'),
    manualMinutes: document.getElementById('manualMinutes'),
    manualContentType: document.getElementById('manualContentType'),
    addManualTimeBtn: document.getElementById('addManualTimeBtn')
};

// アラーム音を鳴らす（1回）
function playAlarmBeep() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800; // 周波数 (Hz)
        oscillator.type = 'sine'; // 波形タイプ

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.error('アラーム再生エラー:', error);
    }
}

// アラームを開始（繰り返し）
function startAlarm() {
    if (state.alarmInterval) return; // 既に鳴っている場合は何もしない

    playAlarmBeep(); // すぐに1回鳴らす
    state.alarmInterval = setInterval(() => {
        playAlarmBeep();
    }, 1000); // 1秒ごとに鳴らす
}

// アラームを停止
function stopAlarm() {
    if (state.alarmInterval) {
        clearInterval(state.alarmInterval);
        state.alarmInterval = null;
    }
}

// 初期化
function init() {
    loadSettings();
    loadHistory();
    updateRemainingTime();
    renderHistory();
    setupEventListeners();
}

// イベントリスナー設定
function setupEventListeners() {
    elements.startBtn.addEventListener('click', startTimer);
    elements.stopBtn.addEventListener('click', stopTimer);
    elements.settingsBtn.addEventListener('click', showSettings);
    elements.backBtn.addEventListener('click', showMain);
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.clearHistoryBtn.addEventListener('click', clearHistory);
    elements.breakDoneBtn.addEventListener('click', completeBreak);
    elements.addManualTimeBtn.addEventListener('click', addManualTime);

    // ページを閉じる前に自動保存
    window.addEventListener('beforeunload', (e) => {
        if (state.isRunning && state.elapsedSeconds > 0) {
            saveSession();
        }
    });
}

// 現在のコンテンツタイプを取得
function getContentType() {
    const selected = document.querySelector('input[name="contentType"]:checked');
    return selected ? selected.value : 'normal';
}

// タイマー開始
function startTimer() {
    if (!state.isRunning) {
        // 新規開始
        state.isRunning = true;
        state.sessionStartTime = new Date();

        const contentType = getContentType();

        // 前回のセッションから継続するかチェック
        if (contentType === 'normal' && state.lastSessionSeconds > 0) {
            const breakDurationSeconds = state.settings.breakDurationMinutes * 60;
            const timeSinceStop = state.lastStopTime
                ? (new Date() - new Date(state.lastStopTime)) / 1000
                : Infinity;

            // 前回が20分未満 && 十分な休憩時間が経過していない場合、継続
            if (state.lastSessionSeconds < (state.settings.breakIntervalMinutes * 60) &&
                timeSinceStop < breakDurationSeconds) {
                state.elapsedSeconds = state.lastSessionSeconds;
            } else {
                state.elapsedSeconds = 0;
            }
        } else {
            state.elapsedSeconds = 0;
        }

        // 休憩タイマーの設定（通常コンテンツのみ）
        if (contentType === 'normal') {
            state.nextBreakSeconds = state.settings.breakIntervalMinutes * 60;
        } else {
            state.nextBreakSeconds = 0;
        }

        state.timerInterval = setInterval(updateTimer, 1000);
    }

    updateControls();
}

// タイマー停止
function stopTimer() {
    // アラームを停止
    stopAlarm();

    if (state.elapsedSeconds > 0) {
        saveSession();
    }

    // 休憩が必要かチェック（通常コンテンツで20分以上使用した場合）
    const contentType = getContentType();
    const needBreak = contentType === 'normal' &&
                      state.elapsedSeconds >= (state.settings.breakIntervalMinutes * 60);

    // 前回のセッション情報を保存（通常コンテンツのみ）
    if (contentType === 'normal' && !needBreak) {
        state.lastSessionSeconds = state.elapsedSeconds;
        state.lastStopTime = new Date().toISOString();
    } else {
        state.lastSessionSeconds = 0;
        state.lastStopTime = null;
    }

    resetTimer();
    updateControls();

    // 休憩が必要な場合はモーダル表示
    if (needBreak) {
        showBreakModal();
    }
}

// タイマーリセット
function resetTimer() {
    state.isRunning = false;
    state.elapsedSeconds = 0;
    state.sessionStartTime = null;
    state.nextBreakSeconds = 0;

    clearInterval(state.timerInterval);

    updateTimerDisplay(0, 0, 0);
    elements.breakInfo.style.display = 'none';
}

// タイマー更新
function updateTimer() {
    state.elapsedSeconds++;

    const hours = Math.floor(state.elapsedSeconds / 3600);
    const minutes = Math.floor((state.elapsedSeconds % 3600) / 60);
    const seconds = state.elapsedSeconds % 60;

    updateTimerDisplay(hours, minutes, seconds);
    updateRemainingTime();

    // 休憩チェック（通常コンテンツのみ）
    const contentType = getContentType();
    if (contentType === 'normal' && state.nextBreakSeconds > 0) {
        const timeUntilBreak = state.nextBreakSeconds - state.elapsedSeconds;

        if (timeUntilBreak <= 0) {
            // 休憩時間
            state.isRunning = false;
            clearInterval(state.timerInterval);
            showBreakModal();
        } else if (timeUntilBreak <= 5) {
            // 5秒前からアラーム開始
            startAlarm();
            // 休憩までのカウントダウン表示
            elements.breakInfo.style.display = 'block';
            const breakMinutes = Math.floor(timeUntilBreak / 60);
            const breakSeconds = timeUntilBreak % 60;
            elements.breakCountdown.textContent = `${String(breakMinutes).padStart(2, '0')}:${String(breakSeconds).padStart(2, '0')}`;
        } else {
            // 休憩までのカウントダウン表示
            elements.breakInfo.style.display = 'block';
            const breakMinutes = Math.floor(timeUntilBreak / 60);
            const breakSeconds = timeUntilBreak % 60;
            elements.breakCountdown.textContent = `${String(breakMinutes).padStart(2, '0')}:${String(breakSeconds).padStart(2, '0')}`;
        }
    } else {
        elements.breakInfo.style.display = 'none';
    }
}

// タイマー表示更新（ドラム式アニメーション付き）
function updateTimerDisplay(hours, minutes, seconds) {
    const newHours = String(hours).padStart(2, '0');
    const newMinutes = String(minutes).padStart(2, '0');
    const newSeconds = String(seconds).padStart(2, '0');

    updateDrumDigit(elements.hours, newHours);
    updateDrumDigit(elements.minutes, newMinutes);
    updateDrumDigit(elements.seconds, newSeconds);
}

// ドラム式数字更新
function updateDrumDigit(element, newValue) {
    if (element.textContent !== newValue) {
        element.classList.add('flip');
        element.textContent = newValue;

        setTimeout(() => {
            element.classList.remove('flip');
        }, 600);
    }
}

// 残り時間更新
function updateRemainingTime() {
    const contentType = getContentType();
    const normalLimitSeconds = state.settings.dailyLimitHours * 3600;
    const adultLimitSeconds = state.settings.adultLimitHours * 3600;

    if (contentType === 'adult') {
        // 大人コンテンツモード
        const adultRemainingSeconds = Math.max(0, adultLimitSeconds - state.todayAdultSeconds - state.elapsedSeconds);

        const hours = Math.floor(adultRemainingSeconds / 3600);
        const minutes = Math.floor((adultRemainingSeconds % 3600) / 60);
        const seconds = adultRemainingSeconds % 60;

        elements.remainingLabel.textContent = '今日の残り時間（大人枠）';
        elements.remainingTime.textContent = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        elements.adultRemaining.style.display = 'none';

        // 警告色の設定
        elements.remainingTime.classList.remove('warning', 'danger');
        const percentRemaining = (adultRemainingSeconds / adultLimitSeconds) * 100;

        if (percentRemaining <= 10) {
            elements.remainingTime.classList.add('danger');
        } else if (percentRemaining <= 25) {
            elements.remainingTime.classList.add('warning');
        }

        // 制限時間超過チェック
        if (adultRemainingSeconds <= 5 && adultRemainingSeconds > 0 && state.isRunning) {
            // 5秒前からアラーム
            startAlarm();
        }
        if (adultRemainingSeconds <= 0 && state.isRunning) {
            stopTimer();
            alert('大人枠の制限時間に達しました！');
        }
    } else {
        // 通常/映画モード
        const normalRemainingSeconds = Math.max(0, normalLimitSeconds - state.todayNormalSeconds - state.elapsedSeconds);

        const hours = Math.floor(normalRemainingSeconds / 3600);
        const minutes = Math.floor((normalRemainingSeconds % 3600) / 60);
        const seconds = normalRemainingSeconds % 60;

        elements.remainingLabel.textContent = '今日の残り時間（自分枠）';
        elements.remainingTime.textContent = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        // 大人枠の残り時間も表示
        const adultRemainingSeconds = Math.max(0, adultLimitSeconds - state.todayAdultSeconds);
        const adultHours = Math.floor(adultRemainingSeconds / 3600);
        const adultMinutes = Math.floor((adultRemainingSeconds % 3600) / 60);
        const adultSeconds = adultRemainingSeconds % 60;

        elements.adultRemainingTime.textContent = `${adultHours}:${String(adultMinutes).padStart(2, '0')}:${String(adultSeconds).padStart(2, '0')}`;
        elements.adultRemaining.style.display = 'block';

        // 警告色の設定
        elements.remainingTime.classList.remove('warning', 'danger');
        const percentRemaining = (normalRemainingSeconds / normalLimitSeconds) * 100;

        if (percentRemaining <= 10) {
            elements.remainingTime.classList.add('danger');
        } else if (percentRemaining <= 25) {
            elements.remainingTime.classList.add('warning');
        }

        // 制限時間超過チェック
        if (normalRemainingSeconds <= 5 && normalRemainingSeconds > 0 && state.isRunning) {
            // 5秒前からアラーム
            startAlarm();
        }
        if (normalRemainingSeconds <= 0 && state.isRunning) {
            stopTimer();
            alert('自分枠の制限時間に達しました！');
        }
    }
}

// コントロールボタンの状態更新
function updateControls() {
    if (state.isRunning) {
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;
    } else {
        elements.startBtn.disabled = false;
        elements.stopBtn.disabled = true;
    }
}

// 休憩モーダル表示
function showBreakModal() {
    elements.breakModal.style.display = 'flex';
    state.isOnBreak = true;
    state.breakElapsedSeconds = 0;

    // 休憩タイマー開始
    state.breakTimer = setInterval(() => {
        state.breakElapsedSeconds++;
        const remainingSeconds = (state.settings.breakDurationMinutes * 60) - state.breakElapsedSeconds;

        if (remainingSeconds <= 0) {
            completeBreak();
        } else {
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            elements.breakTimerDisplay.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
        }
    }, 1000);
}

// 休憩完了
function completeBreak() {
    // アラームを停止
    stopAlarm();

    clearInterval(state.breakTimer);
    elements.breakModal.style.display = 'none';
    state.isOnBreak = false;

    // 前回のセッション情報をクリア（休憩したので）
    state.lastSessionSeconds = 0;
    state.lastStopTime = null;

    // 次の休憩時間を設定
    state.nextBreakSeconds = state.elapsedSeconds + (state.settings.breakIntervalMinutes * 60);

    // タイマー再開
    state.isRunning = true;
    state.timerInterval = setInterval(updateTimer, 1000);
    updateControls();
}

// セッション保存
function saveSession() {
    const contentType = getContentType();
    const session = {
        date: new Date().toISOString(),
        duration: state.elapsedSeconds,
        contentType: contentType
    };

    state.history.push(session);

    // コンテンツタイプに応じて合計時間を更新
    if (contentType === 'adult') {
        state.todayAdultSeconds += state.elapsedSeconds;
    } else {
        state.todayNormalSeconds += state.elapsedSeconds;
    }

    saveToLocalStorage();
    renderHistory();
}

// 履歴表示
function renderHistory() {
    const today = new Date().toDateString();
    const todaySessions = state.history.filter(session => {
        return new Date(session.date).toDateString() === today;
    });

    if (todaySessions.length === 0) {
        elements.historyList.innerHTML = '<p style="text-align: center; color: #999;">まだ記録がありません</p>';
        elements.todayTotal.textContent = '0:00:00';
        state.todayNormalSeconds = 0;
        state.todayAdultSeconds = 0;
        return;
    }

    elements.historyList.innerHTML = '';
    let totalNormalSeconds = 0;
    let totalAdultSeconds = 0;

    todaySessions.forEach(session => {
        const time = new Date(session.date).toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const hours = Math.floor(session.duration / 3600);
        const minutes = Math.floor((session.duration % 3600) / 60);
        const seconds = session.duration % 60;
        const duration = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        // アイコンの選択（後方互換性のためisMovieもチェック）
        let icon = '';
        const contentType = session.contentType || (session.isMovie ? 'movie' : 'normal');
        if (contentType === 'movie') {
            icon = '🎬';
        } else if (contentType === 'adult') {
            icon = '👨‍👩‍👧';
        }

        // 手動追加の場合は✏️を追加
        if (session.isManual) {
            icon += '✏️';
        }

        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <span class="time">${time} ${icon}</span>
            <span class="duration">${duration}</span>
        `;

        elements.historyList.appendChild(item);

        // 合計時間の計算
        if (contentType === 'adult') {
            totalAdultSeconds += session.duration;
        } else {
            totalNormalSeconds += session.duration;
        }
    });

    state.todayNormalSeconds = totalNormalSeconds;
    state.todayAdultSeconds = totalAdultSeconds;

    // 合計時間の表示
    const totalSeconds = totalNormalSeconds + totalAdultSeconds;
    const totalHours = Math.floor(totalSeconds / 3600);
    const totalMinutes = Math.floor((totalSeconds % 3600) / 60);
    const totalSecs = totalSeconds % 60;
    elements.todayTotal.textContent = `${totalHours}:${String(totalMinutes).padStart(2, '0')}:${String(totalSecs).padStart(2, '0')}`;

    updateRemainingTime();
}

// 設定画面表示
function showSettings() {
    elements.mainView.style.display = 'none';
    elements.settingsView.style.display = 'block';

    // 現在の設定値を表示
    elements.dailyLimit.value = state.settings.dailyLimitHours;
    elements.adultLimit.value = state.settings.adultLimitHours;
    elements.breakInterval.value = state.settings.breakIntervalMinutes;
    elements.breakDuration.value = state.settings.breakDurationMinutes;
}

// メイン画面表示
function showMain() {
    elements.mainView.style.display = 'block';
    elements.settingsView.style.display = 'none';
}

// 設定保存
function saveSettings() {
    state.settings.dailyLimitHours = parseFloat(elements.dailyLimit.value);
    state.settings.adultLimitHours = parseFloat(elements.adultLimit.value);
    state.settings.breakIntervalMinutes = parseInt(elements.breakInterval.value);
    state.settings.breakDurationMinutes = parseInt(elements.breakDuration.value);

    saveToLocalStorage();
    updateRemainingTime();

    alert('設定を保存しました');
    showMain();
}

// 手動で時間を追加
function addManualTime() {
    const hours = parseInt(elements.manualHours.value) || 0;
    const minutes = parseInt(elements.manualMinutes.value) || 0;
    const contentType = elements.manualContentType.value;

    const totalSeconds = (hours * 3600) + (minutes * 60);

    if (totalSeconds <= 0) {
        alert('0分より大きい時間を入力してください');
        return;
    }

    if (totalSeconds > 36000) { // 10時間以上
        alert('一度に追加できるのは10時間までです');
        return;
    }

    // セッションとして保存
    const session = {
        date: new Date().toISOString(),
        duration: totalSeconds,
        contentType: contentType,
        isManual: true
    };

    state.history.push(session);

    // コンテンツタイプに応じて合計時間を更新
    if (contentType === 'adult') {
        state.todayAdultSeconds += totalSeconds;
    } else {
        state.todayNormalSeconds += totalSeconds;
    }

    saveToLocalStorage();
    renderHistory();

    // フォームをリセット
    elements.manualHours.value = 0;
    elements.manualMinutes.value = 0;

    alert(`${hours}時間${minutes}分を追加しました`);
}

// 履歴クリア
function clearHistory() {
    if (confirm('本当に履歴をすべて削除しますか？')) {
        state.history = [];
        state.todayNormalSeconds = 0;
        state.todayAdultSeconds = 0;
        saveToLocalStorage();
        renderHistory();
        alert('履歴を削除しました');
    }
}

// LocalStorageに保存
function saveToLocalStorage() {
    localStorage.setItem('mediaTimerSettings', JSON.stringify(state.settings));
    localStorage.setItem('mediaTimerHistory', JSON.stringify(state.history));
}

// LocalStorageから読み込み
function loadSettings() {
    const savedSettings = localStorage.getItem('mediaTimerSettings');
    if (savedSettings) {
        state.settings = JSON.parse(savedSettings);
    }
}

function loadHistory() {
    const savedHistory = localStorage.getItem('mediaTimerHistory');
    if (savedHistory) {
        state.history = JSON.parse(savedHistory);

        // 古いデータを削除（7日以上前）
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        state.history = state.history.filter(session => {
            return new Date(session.date) > weekAgo;
        });

        saveToLocalStorage();
    }
}

// アプリ起動
init();
