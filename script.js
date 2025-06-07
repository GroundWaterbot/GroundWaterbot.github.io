// ---- ฟังก์ชัน hashPassword ไว้ด้านบนสุด ----
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

// สำหรับตารางคะแนน
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

// --- Helper Functions ---
function appendMessage(sender, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    messageDiv.innerHTML = text;
    if (chatbox) {
        chatbox.appendChild(messageDiv);
        chatbox.scrollTop = chatbox.scrollHeight;
    }
}

async function fetchData(action, params = {}, method = 'GET') {
    const url = new URL(APPS_SCRIPT_WEB_APP_URL);
    let body = null;

    if (method === 'GET') {
        url.searchParams.append('action', action);
        for (const key in params) {
            url.searchParams.append(key, params[key]);
        }
    } else if (method === 'POST') {
        body = new URLSearchParams();
        body.append('action', action);
        for (const key in params) {
            body.append(key, params[key]);
        }
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

function updateUIForLoginStatus(isLoggedIn, username = '') {
    if (isLoggedIn) {
        loginBtn.style.display = 'none';
        registerBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        userInfo.style.display = 'inline-block';
        loggedInUserSpan.textContent = `ยินดีต้อนรับ, ${username}! (คะแนน: ${currentUserScore})`;
        chatbotSection.style.display = 'block';
    } else {
        loginBtn.style.display = 'inline-block';
        registerBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        userInfo.style.display = 'none';
        loggedInUserSpan.textContent = '';
        chatbotSection.style.display = 'none';
    }
}

async function updateRankingTable() {
    rankingTableBody.innerHTML = '';
    rankingTable.style.display = 'none';
    rankingLoading.style.display = 'block';
    rankingLoading.textContent = '⏳ กำลังโหลด...';
    const result = await fetchData('getRanking');
    if (result.success && result.ranking && result.ranking.length > 0) {
        result.ranking.forEach((user, index) => {
            let icon = '';
            if (index === 0) {
                icon = `<img src="https://cdn-icons-png.flaticon.com/512/2583/2583346.png" alt="gold" style="width:22px;vertical-align:middle;margin-right:2px;">`;
            } else if (index === 1) {
                icon = `<img src="https://cdn-icons-png.flaticon.com/512/2583/2583349.png" alt="silver" style="width:22px;vertical-align:middle;margin-right:2px;">`;
            } else if (index === 2) {
                icon = `<img src="https://cdn-icons-png.flaticon.com/512/2583/2583351.png" alt="bronze" style="width:22px;vertical-align:middle;margin-right:2px;">`;
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
        rankingLoading.textContent = 'ไม่พบข้อมูลคะแนน';
        rankingTable.style.display = 'none';
    }
}

// --- Chat Functions ---
async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    if (!currentUser) {
        appendMessage('bot', 'คุณต้องเข้าสู่ระบบก่อนจึงจะคุยกับ Chatbot ได้ค่ะ');
        chatInput.value = '';
        return;
    }

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
    thinkingMessageDiv.innerHTML = '<img src="https://cdn-icons-png.flaticon.com/512/3659/3659693.png" alt="bot" style="width:20px;vertical-align:middle;margin-right:7px;">กำลังพิมพ์...';
    if (chatbox) {
        chatbox.appendChild(thinkingMessageDiv);
        chatbox.scrollTop = chatbox.scrollHeight;
    }

    try {
        const result = await fetchData('sendMessage', { 
            username: currentUser,
            user_content: message 
        }, 'POST');

        if (thinkingMessageDiv.parentNode) {
            thinkingMessageDiv.remove();
        }

        if (result.success) {
            appendMessage('bot', `<img src="https://cdn-icons-png.flaticon.com/512/3659/3659693.png" alt="bot" style="width:20px;vertical-align:middle;margin-right:7px;">${result.message}`);
        } else {
            appendMessage('bot', `<img src="https://cdn-icons-png.flaticon.com/512/3659/3659693.png" alt="bot" style="width:20px;vertical-align:middle;margin-right:7px;">บอทตอบกลับผิดพลาด: ${result.message}`);
        }
    } catch (error) {
        if (thinkingMessageDiv.parentNode) {
            thinkingMessageDiv.remove();
        }
        appendMessage('bot', "เกิดข้อผิดพลาดในการเชื่อมต่อกับบอท");
    }
}

async function startQuiz() {
    if (!currentUser) {
        appendMessage('bot', 'คุณต้องเข้าสู่ระบบก่อนจึงจะเล่นเกมได้ค่ะ');
        return;
    }
    if (quizAttemptsToday >= QUIZ_ATTEMPTS_PER_DAY) {
        appendMessage('bot', `วันนี้คุณตอบคำถามครบ ${QUIZ_ATTEMPTS_PER_DAY} ครั้งแล้ว ลองมาใหม่พรุ่งนี้นะ!`);
        return;
    }
    appendMessage('bot', '<img src="https://cdn-icons-png.flaticon.com/512/616/616554.png" alt="quiz" style="width:22px;vertical-align:middle;margin-right:7px;">มาเล่นเกมตอบคำถามน้ำบาดาลกัน! โปรดรอสักครู่...');
    const result = await fetchData('getQuizQuestion');
    if (result.success) {
        currentQuizQuestion = result;
        const optionsHtml = result.options.map((opt, index) => `${index + 1}. ${opt}`).join('<br>');
        appendMessage('bot', `คำถาม: ${result.question}<br>ตัวเลือก:<br>${optionsHtml}<br>พิมพ์หมายเลขคำตอบที่ถูกต้อง`);
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
        messageToDisplay = `<img src="https://cdn-icons-png.flaticon.com/512/190/190411.png" alt="correct" style="width:19px;vertical-align:middle;margin-right:7px;">เก่งมากเลย! คุณตอบถูกคะ! (+${scoreChange} แต้ม)`;
    } else {
        scoreChange = -5;
        messageToDisplay = `<img src="https://cdn-icons-png.flaticon.com/512/1828/1828843.png" alt="wrong" style="width:19px;vertical-align:middle;margin-right:7px;">เสียใจด้วยค่ะ! คุณตอบผิด คำตอบที่ถูกต้องคือ "${currentQuizQuestion.correctAnswer}" (${scoreChange} แต้ม)`;
    }
    appendMessage('bot', messageToDisplay);

    const updateResult = await fetchData('updateScore', {
        username: currentUser,
        scoreIncrease: scoreChange
    }, 'POST');

    if (updateResult.success) {
        currentUserScore = updateResult.newScore;
        quizAttemptsToday++;
        loggedInUserSpan.textContent = `ยินดีต้อนรับ, ${currentUser}! (คะแนน: ${currentUserScore})`;
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
        appendMessage('bot', `<img src="https://cdn-icons-png.flaticon.com/512/3659/3659693.png" alt="bot" style="width:20px;vertical-align:middle;margin-right:7px;">สวัสดีค่ะ ${currentUser}! ยินดีต้อนรับกลับสู่ AI Chatbot น้ำบาดาล`);
        appendMessage('bot', `ตอนนี้คุณมี ${currentUserScore} แต้ม (ตอบไปแล้ว ${quizAttemptsToday} ครั้ง / ${QUIZ_ATTEMPTS_PER_DAY} ครั้งต่อวัน)`);
        fetchData('getNews').then(res => {
            if (res.success && res.news) {
                appendMessage('bot', `<img src="https://cdn-icons-png.flaticon.com/512/3135/3135906.png" alt="news" style="width:21px;vertical-align:middle;margin-right:7px;">บาดาลมีข่าวสารประจำวันมาให้คุณฟังค่ะ: ${res.news}`);
            } else {
                appendMessage('bot', 'ไม่สามารถโหลดข่าวได้ในขณะนี้');
            }
            appendMessage('bot', 'คุณสามารถพิมพ์ "เล่นเกม" เพื่อเริ่มเล่นเกมตอบคำถามน้ำบาดาล และสะสมแต้มได้เลยค่ะ!');
        });
    } else {
        updateUIForLoginStatus(false);
        appendMessage('bot', '<img src="https://cdn-icons-png.flaticon.com/512/3659/3659693.png" alt="bot" style="width:20px;vertical-align:middle;margin-right:7px;">สวัสดีค่ะ! ยินดีต้อนรับสู่ AI Chatbot น้ำบาดาล');
        appendMessage('bot', '<img src="https://cdn-icons-png.flaticon.com/512/3659/3659693.png" alt="bot" style="width:20px;vertical-align:middle;margin-right:7px;">กรุณาเข้าสู่ระบบ หรือลงทะเบียน เพื่อใช้งาน Chatbot และเล่นเกมสะสมแต้มค่ะ!');
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    if (loginBtn) loginBtn.addEventListener('click', () => openModal('login'));
    if (registerBtn) registerBtn.addEventListener('click', () => openModal('register'));
    if (closeButton) closeButton.addEventListener('click', closeModal);

    // คลิกนอก modal เพื่อปิด
    if (authModal) {
        window.addEventListener('click', (event) => {
            if (event.target === authModal) closeModal();
        });
    }

    // Login/Register Form
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = authUsernameInput.value.trim();
            const password = authPasswordInput.value.trim();
            const formAction = submitAuthBtn.textContent === 'เข้าสู่ระบบ' ? 'login' : 'register';

            // ป้องกัน submit ซ้ำ
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

                        updateUIForLoginStatus(true, currentUser);
                        setTimeout(() => {
                            closeModal();
                        }, 600);
                        appendMessage('bot', `<img src="https://cdn-icons-png.flaticon.com/512/3659/3659693.png" alt="bot" style="width:20px;vertical-align:middle;margin-right:7px;">สวัสดีค่ะ ${currentUser}! ยินดีต้อนรับสู่ AI Chatbot น้ำบาดาล บาดาลมีข่าวสารประจำวันมาให้คุณฟังค่ะ:`);
                        fetchData('getNews').then(res => {
                            appendMessage('bot', res.news || 'ไม่สามารถโหลดข่าวได้ในขณะนี้');
                        });
                        appendMessage('bot', 'คุณสามารถพิมพ์ "เล่นเกม" เพื่อเริ่มเล่นเกมตอบคำถามน้ำบาดาล และสะสมแต้มได้เลยค่ะ!');
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

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            currentUser = null;
            currentUserScore = 0;
            quizAttemptsToday = 0;
            localStorage.removeItem('currentUser');
            localStorage.removeItem('currentUserScore');
            localStorage.removeItem('quizAttemptsToday');
            updateUIForLoginStatus(false);
            appendMessage('bot', '<img src="https://cdn-icons-png.flaticon.com/512/3659/3659693.png" alt="bot" style="width:20px;vertical-align:middle;margin-right:7px;">คุณได้ออกจากระบบแล้วค่ะ');
            if (chatbox) {
                chatbox.innerHTML = '<div class="message bot"><img src="https://cdn-icons-png.flaticon.com/512/3659/3659693.png" alt="bot" style="width:20px;vertical-align:middle;margin-right:7px;">สวัสดีค่ะ! ยินดีต้อนรับสู่ AI Chatbot น้ำบาดาล</div>';
            }
        });
    }

    // ---- ปุ่มดู/ปิดตารางคะแนน ----
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