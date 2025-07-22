// ---- ฟังก์ชัน hashPassword ----
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}
// ---- จบฟังก์ชัน hashPassword ----

const APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby92JTVXwF2GTE6h_DBgtSZZYpBcGsILzsYvRBj9EPx2JKE2qNO0A1fUKGbgJiOzw8/exec';
const QUIZ_ATTEMPTS_PER_DAY = 3;

// --- DOM Elements ---
const chatbox = document.getElementById('chatbox');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userInfo = document.getElementById('userInfo');
const loggedInUserSpan = document.getElementById('loggedInUser');
const chatbotSection = document.querySelector('.chatbot-section');
const authModal = document.getElementById('authModal');
const closeButton = document.querySelector('.close-button');
const modalTitle = document.getElementById('modalTitle');
const authForm = document.getElementById('authForm');
const authUsernameInput = document.getElementById('authUsername');
const authPasswordInput = document.getElementById('authPassword');
const submitAuthBtn = document.getElementById('submitAuthBtn');
const authMessage = document.getElementById('authMessage');
const showRankingBtn = document.getElementById('show-ranking-btn');
const closeRankingBtn = document.getElementById('close-ranking-btn');
const rankingSection = document.getElementById('ranking-section');
const rankingTable = document.getElementById('ranking-table');
const rankingTableBody = document.getElementById('ranking-table-body');
const rankingLoading = document.getElementById('ranking-loading');

let currentUser = null;
let currentUserScore = 0;
let quizAttemptsToday = 0;
let currentQuizQuestion = null;

// ========== Streak Feature ==========
// เรียก API เพื่ออัปเดต streak ทุกครั้งที่ผู้ใช้ส่งข้อความ
async function updateAndShowStreak() {
    if (!currentUser) return;
    const res = await fetchData('updateStreakOnChat', { username: currentUser }, 'POST');
    if (res.success) {
        localStorage.setItem('streak', res.streak);
        localStorage.setItem('highestStreak', res.highestStreak);
        localStorage.setItem('chattedToday', res.chattedToday ? '1' : '0');
        showStreakUI(res.streak, res.chattedToday);
    }
}

// แสดงผล streak หลังชื่อผู้ใช้
function showStreakUI(streak, chattedToday) {
    if (!loggedInUserSpan) return;
    let streakIcon = chattedToday ? '💧' : '<span style="filter: grayscale(1);opacity:0.4;">💧</span>';
    loggedInUserSpan.innerHTML = `ยินดีต้อนรับ, ${currentUser}! (คะแนน: ${currentUserScore}) ${streakIcon}${streak}`;
}
// ========== จบ Streak Feature ==========

// --- Helper Functions ---

function appendMessage(sender, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);

    // ถ้าเป็น bot และมี tag HTML (มี "<a" หรือ "<ul" หรือ "<ol") ให้ render เป็น HTML
    if (
        sender === 'bot' && (
            text.includes('<a') || text.includes('<ul') || text.includes('<ol') || text.includes('<b') || text.includes('<br')
        )
    ) {
        messageDiv.classList.add('news-message'); // เพิ่ม class สำหรับข่าว
        messageDiv.innerHTML = text;
    } else {
        messageDiv.innerText = text;
    }

    if (chatbox) {
        chatbox.appendChild(messageDiv);
        chatbox.scrollTop = chatbox.scrollHeight;
    }
}

// ป้องกันข้อความแนะนำซ้ำซ้อน
function showIntroMessages() {
    // ลบข้อความแนะนำเดิมที่ซ้ำ (ถ้ามี)
    if (chatbox) {
        let toRemove = [];
        chatbox.querySelectorAll('.message.bot').forEach(div => {
            if (
                div.innerText.startsWith('พิมพ์ "เล่นเกม" เพื่อทดสอบความรู้เกี่ยวกับน้ำบาดาล') ||
                div.innerText.startsWith('ข่าวน้ำบาดาลล่าสุด:') ||
                div.innerText.startsWith('ขณะนี้ไม่มีข่าวน้ำบาดาล')
            ) {
                toRemove.push(div);
            }
        });
        toRemove.forEach(div => div.remove());
    }

    appendMessage('bot', 'พิมพ์ "เล่นเกม" เพื่อทดสอบความรู้เกี่ยวกับน้ำบาดาลและสะสมแต้ม!');
    fetchData('getNews').then(res => {
        if (res.success && res.news) {
            appendMessage('bot', `ข่าวน้ำบาดาลล่าสุด: ${res.news}`);
        } else {
            appendMessage('bot', 'ขณะนี้ไม่มีข่าวน้ำบาดาลหรือสิ่งแวดล้อมล่าสุด');
        }
    });
}

async function fetchData(action, params = {}, method = 'GET') {
    const url = new URL(APPS_SCRIPT_WEB_APP_URL);
    let body = null;
    if (method === 'GET') {
        url.searchParams.append('action', action);
        for (const key in params) url.searchParams.append(key, params[key]);
    } else if (method === 'POST') {
        body = new URLSearchParams();
        body.append('action', action);
        for (const key in params) body.append(key, params[key]);
    }
    try {
        const fetchOptions = { method: method };
        if (method === 'POST') {
            fetchOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
            fetchOptions.body = body;
        }
        const response = await fetch(url.toString(), fetchOptions);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching data:', error);
        const errorMessage = error.message.includes('Server error:') ? error.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
        return { success: false, message: errorMessage };
    }
}

// ======= แก้ไข updateUIForLoginStatus เพื่อแสดง streak =========
function updateUIForLoginStatus(isLoggedIn, username = '') {
    if (isLoggedIn) {
        loginBtn.style.display = 'none';
        registerBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        userInfo.style.display = 'inline-block';
        // ดึง streak จาก localStorage ถ้ามี
        const streak = localStorage.getItem('streak') || 0;
        const chattedToday = localStorage.getItem('chattedToday') === '1';
        showStreakUI(streak, chattedToday);
        chatbotSection.style.display = 'block';
    } else {
        loginBtn.style.display = 'inline-block';
        registerBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        userInfo.style.display = 'none';
        loggedInUserSpan.innerText = '';
        chatbotSection.style.display = 'none';
    }
}
// ======= จบแก้ไข updateUIForLoginStatus =========

async function updateRankingTable() {
    rankingTableBody.innerHTML = '';
    rankingTable.style.display = 'none';
    rankingLoading.style.display = 'block';
    rankingLoading.innerText = '⏳ กำลังโหลด...';
    const result = await fetchData('getRanking');
    if (result.success && result.ranking && result.ranking.length > 0) {
        result.ranking.forEach((user, index) => {
            let icon = '';
            if (index === 0) {
                icon = `🏆 `;
            }
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${icon}${index + 1}</td>
                <td>${user.username}</td>
                <td>${user.score}</td>
            `;
            rankingTableBody.appendChild(row);
        });
        rankingTable.style.display = 'table';
        rankingLoading.style.display = 'none';
    } else {
        rankingLoading.innerText = 'ไม่พบข้อมูลคะแนน';
        rankingTable.style.display = 'none';
    }
}

// --- Chat Functions ---
async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    if (!currentUser) {
        appendMessage('bot', 'กรุณาเข้าสู่ระบบก่อนใช้งาน');
        chatInput.value = '';
        return;
    }

    // ===== เรียกอัปเดต streak ก่อนแสดงข้อความผู้ใช้ =====
    await updateAndShowStreak();

    appendMessage('user', message);
    chatInput.value = '';

    // Quiz command
    if (message.toLowerCase() === 'เล่นเกม') {
        await startQuiz();
        return;
    }
    // Quiz answer
    if (currentQuizQuestion) {
        await checkQuizAnswer(message);
        return;
    }

    // กำลังพิมพ์...
    const thinkingMessageDiv = document.createElement('div');
    thinkingMessageDiv.classList.add('message', 'bot');
    thinkingMessageDiv.innerText = 'กำลังพิมพ์...';
    if (chatbox) {
        chatbox.appendChild(thinkingMessageDiv);
        chatbox.scrollTop = chatbox.scrollHeight;
    }

    try {
        const result = await fetchData('sendMessage', { 
            username: currentUser,
            user_content: message 
        }, 'POST');

        if (thinkingMessageDiv.parentNode) thinkingMessageDiv.remove();

        if (result.success) {
            appendMessage('bot', result.message);
        } else {
            appendMessage('bot', `บอทตอบกลับผิดพลาด: ${result.message}`);
        }
    } catch (error) {
        if (thinkingMessageDiv.parentNode) thinkingMessageDiv.remove();
        appendMessage('bot', "เกิดข้อผิดพลาดในการเชื่อมต่อกับบอท");
    }
}

async function startQuiz() {
    if (!currentUser) {
        appendMessage('bot', 'กรุณาเข้าสู่ระบบก่อนเล่นเกม');
        return;
    }
    if (quizAttemptsToday >= QUIZ_ATTEMPTS_PER_DAY) {
        appendMessage('bot', `วันนี้คุณตอบคำถามครบ ${QUIZ_ATTEMPTS_PER_DAY} ครั้งแล้ว ลองมาใหม่พรุ่งนี้นะ!`);
        return;
    }
    appendMessage('bot', 'มาเล่นเกมตอบคำถามน้ำบาดาลกัน! โปรดรอสักครู่...');
    const result = await fetchData('getQuizQuestion');
    if (result.success) {
        currentQuizQuestion = result;
        const optionsText = result.options.map((opt, index) => `${index + 1}. ${opt}`).join('\n');
        appendMessage('bot', `คำถาม: ${result.question}\nตัวเลือก:\n${optionsText}\nพิมพ์หมายเลขคำตอบที่ถูกต้อง`);
    } else {
        appendMessage('bot', `ไม่สามารถดึงคำถามได้: ${result.message}`);
        currentQuizQuestion = null;
    }
}

async function checkQuizAnswer(answer) {
    if (!currentQuizQuestion) {
        appendMessage('bot', 'ไม่มีคำถามที่กำลังรอคำตอบอยู่ค่ะ');
        return;
    }
    const userAnswerIndex = parseInt(answer) - 1;
    if (isNaN(userAnswerIndex) || userAnswerIndex < 0 || userAnswerIndex >= currentQuizQuestion.options.length) {
        appendMessage('bot', 'โปรดพิมพ์หมายเลขตัวเลือกที่ถูกต้อง (เช่น 1, 2, 3, 4)');
        return;
    }
    const chosenAnswer = currentQuizQuestion.options[userAnswerIndex];
    let messageToDisplay = '';
    let scoreChange = 0;
    if (chosenAnswer === currentQuizQuestion.correctAnswer) {
        scoreChange = 10;
        messageToDisplay = `เก่งมากเลย! คุณตอบถูกค่ะ! (+${scoreChange} แต้ม)`;
    } else {
        scoreChange = -5;
        messageToDisplay = `เสียใจด้วยค่ะ! คุณตอบผิด คำตอบที่ถูกต้องคือ "${currentQuizQuestion.correctAnswer}" (${scoreChange} แต้ม)`;
    }
    appendMessage('bot', messageToDisplay);

    const updateResult = await fetchData('updateScore', {
        username: currentUser,
        scoreIncrease: scoreChange
    }, 'POST');

    if (updateResult.success) {
        currentUserScore = updateResult.newScore;
        quizAttemptsToday++;
        // อัปเดต streak UI ด้วยคะแนนใหม่
        const streak = localStorage.getItem('streak') || 0;
        const chattedToday = localStorage.getItem('chattedToday') === '1';
        showStreakUI(streak, chattedToday);
        appendMessage('bot', `ตอนนี้คุณมี ${currentUserScore} แต้มแล้ว (ตอบไปแล้ว ${quizAttemptsToday} ครั้ง / ${QUIZ_ATTEMPTS_PER_DAY} ครั้งต่อวัน)`);
    } else {
        appendMessage('bot', `เกิดข้อผิดพลาดในการอัปเดตคะแนน: ${updateResult.message}`);
    }

    currentQuizQuestion = null;
}

// --- Modal Functions ---
function openModal(mode) {
    if (!authModal || !authForm || !authMessage || !modalTitle || !submitAuthBtn) return;
    authModal.style.display = 'flex';
    authMessage.textContent = '';
    authForm.reset();
    if (mode === 'login') {
        modalTitle.textContent = 'เข้าสู่ระบบ';
        submitAuthBtn.textContent = 'เข้าสู่ระบบ';
    } else {
        modalTitle.textContent = 'ลงทะเบียน';
        submitAuthBtn.textContent = 'ลงทะเบียน';
    }
}

function closeModal() {
    if (authModal) authModal.style.display = 'none';
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // โหลดสถานะผู้ใช้จาก Local Storage (ถ้ามี)
    const storedUser = localStorage.getItem('currentUser');
    const storedScore = localStorage.getItem('currentUserScore');
    const storedQuizAttempts = localStorage.getItem('quizAttemptsToday');

    if (storedUser) {
        currentUser = storedUser;
        currentUserScore = parseInt(storedScore) || 0;
        quizAttemptsToday = parseInt(storedQuizAttempts) || 0;
        updateUIForLoginStatus(true, currentUser);
        showIntroMessages();
    } else {
        updateUIForLoginStatus(false);
        showIntroMessages();
    }

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (chatInput) chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    if (loginBtn) loginBtn.addEventListener('click', () => openModal('login'));
    if (registerBtn) registerBtn.addEventListener('click', () => openModal('register'));
    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (authModal) {
        window.addEventListener('click', (event) => {
            if (event.target === authModal) closeModal();
        });
    }
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = authUsernameInput.value.trim();
            const password = authPasswordInput.value.trim();
            const formAction = submitAuthBtn.textContent === 'เข้าสู่ระบบ' ? 'login' : 'register';

            if (!username || !password) {
                authMessage.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
                authMessage.style.color = 'red';
                return;
            }

            authMessage.textContent = 'กำลังดำเนินการ...';
            authMessage.style.color = 'blue';

            try {
                const passwordHash = await hashPassword(password);
                const result = await fetchData(formAction, { username, password: passwordHash }, 'POST');

                if (result.success) {
                    authMessage.style.color = 'green';
                    authMessage.textContent = result.message;
                    if (formAction === 'login') {
                        currentUser = username;
                        currentUserScore = result.score;
                        quizAttemptsToday = result.quizAttemptsToday || 0;

                        localStorage.setItem('currentUser', currentUser);
                        localStorage.setItem('currentUserScore', currentUserScore);
                        localStorage.setItem('quizAttemptsToday', quizAttemptsToday);

                        // หลังล็อกอิน อัปเดต streak UI
                        await updateAndShowStreak();

                        updateUIForLoginStatus(true, currentUser);

                        setTimeout(() => {
                            closeModal();
                        }, 600);

                        showIntroMessages();

                    } else {
                        setTimeout(() => {
                            modalTitle.textContent = 'เข้าสู่ระบบ';
                            submitAuthBtn.textContent = 'เข้าสู่ระบบ';
                            authMessage.textContent = '';
                            authForm.reset();
                        }, 1500);
                    }
                } else {
                    authMessage.style.color = 'red';
                    authMessage.textContent = result.message;
                }
            } catch (err) {
                authMessage.style.color = 'red';
                authMessage.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
            }
        });
    }

    if (logoutBtn) logoutBtn.addEventListener('click', () => {
        currentUser = null;
        currentUserScore = 0;
        quizAttemptsToday = 0;
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentUserScore');
        localStorage.removeItem('quizAttemptsToday');
        // รีเซ็ต streak ด้วย
        localStorage.removeItem('streak');
        localStorage.removeItem('highestStreak');
        localStorage.removeItem('chattedToday');
        updateUIForLoginStatus(false);
        if (chatbox) chatbox.innerHTML = '';
        showIntroMessages();
    });

    if (showRankingBtn && closeRankingBtn && rankingSection) {
        showRankingBtn.addEventListener('click', () => {
            rankingSection.style.display = 'block';
            showRankingBtn.style.display = 'none';
            updateRankingTable();
        });
        closeRankingBtn.addEventListener('click', () => {
            rankingSection.style.display = 'none';
            showRankingBtn.style.display = 'block';
        });
    }
});