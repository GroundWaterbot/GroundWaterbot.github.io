const APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby92JTVXwF2GTE6h_DBgtSZZYpBcGsILzsYvRBj9EPx2JKE2qNO0A1fUKGbgJiOzw8/exec'; // *** อย่าลืมเปลี่ยนเป็น URL ของคุณ ***
const QUIZ_ATTEMPTS_PER_DAY = 3; // กำหนดจำนวนครั้งที่ตอบคำถามได้ต่อวัน

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
const rankingList = document.getElementById('rankingList');

const authModal = document.getElementById('authModal');
const closeButton = document.querySelector('.close-button');
const modalTitle = document.getElementById('modalTitle');
const authForm = document.getElementById('authForm');
const authUsernameInput = document.getElementById('authUsername');
const authPasswordInput = document.getElementById('authPassword');
const submitAuthBtn = document.getElementById('submitAuthBtn');
const authMessage = document.getElementById('authMessage');

let currentUser = null;
let currentUserScore = 0;
let quizAttemptsToday = 0;

// --- Helper Functions ---

function appendMessage(sender, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    messageDiv.innerHTML = text; // ใช้ innerHTML เพื่อให้รองรับ <br> และ HTML tags อื่นๆ
    chatbox.appendChild(messageDiv);
    chatbox.scrollTop = chatbox.scrollHeight;
}

async function fetchData(action, params = {}) {
    const url = new URL(APPS_SCRIPT_WEB_APP_URL);
    url.searchParams.append('action', action);
    for (const key in params) {
        url.searchParams.append(key, params[key]);
    }

    try {
        const response = await fetch(url.toString(), {
            method: 'GET', // Apps Script uses GET for query parameters, POST for body payload
                           // We're using GET for simplicity with parameters
        });
        // เพิ่มการตรวจสอบสถานะ response
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching data:', error);
        // แสดงข้อความ error จาก server หากมี
        const errorMessage = error.message.includes('Server error:') ? error.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
        return { success: false, message: errorMessage };
    }
}

function updateUIForLoginStatus(isLoggedIn, username = '') {
    if (isLoggedIn) {
        loginBtn.style.display = 'none';
        registerBtn.style.display = 'none';
        userInfo.style.display = 'inline-block';
        loggedInUserSpan.textContent = `ยินดีต้อนรับ, ${username}! (คะแนน: ${currentUserScore})`;
        chatbotSection.style.display = 'block';
    } else {
        loginBtn.style.display = 'inline-block';
        registerBtn.style.display = 'inline-block';
        userInfo.style.display = 'none';
        loggedInUserSpan.textContent = '';
        chatbotSection.style.display = 'none';
    }
    updateRanking(); // อัปเดตตารางอันดับทุกครั้งที่มีการ Login/Logout
}

async function updateRanking() {
    rankingList.innerHTML = '<li>กำลังโหลดอันดับ...</li>';
    const result = await fetchData('getRanking');
    if (result.success) {
        rankingList.innerHTML = '';
        result.ranking.forEach((user, index) => {
            const listItem = document.createElement('li');
            // แก้ไขตรงนี้
            listItem.textContent = `อันดับ ${index + 1}: ${user.username} (${user.score} แต้ม)`;
            rankingList.appendChild(listItem);
        });
    } else {
        rankingList.innerHTML = `<li>ไม่สามารถโหลดอันดับได้: ${result.message}</li>`;
    }
}

// --- Chatbot Logic (modified to integrate with AI and quiz) ---
async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    appendMessage('user', message);
    chatInput.value = '';

    // Check for specific quiz commands
    if (message.toLowerCase() === 'เล่นเกม') {
        await startQuiz();
        return;
    }

    // Send message to Dialogflow (will be integrated in next step)
    // For now, it's just a placeholder for general chat
    appendMessage('bot', 'ตอนนี้ผมยังตอบคำถามทั่วไปไม่ได้ครับ ลองพิมพ์ "เล่นเกม" เพื่อเล่นเกมน้ำบาดาลดูนะครับ');
}

let currentQuizQuestion = null; // Store the current quiz question for validation

async function startQuiz() {
    if (!currentUser) {
        appendMessage('bot', 'คุณต้องเข้าสู่ระบบก่อนจึงจะเล่นเกมได้ครับ');
        return;
    }

    if (quizAttemptsToday >= QUIZ_ATTEMPTS_PER_DAY) {
        appendMessage('bot', `วันนี้คุณตอบคำถามครบ ${QUIZ_ATTEMPTS_PER_DAY} ครั้งแล้วครับ ลองมาใหม่พรุ่งนี้นะ!`);
        return;
    }

    appendMessage('bot', 'มาเล่นเกมตอบคำถามน้ำบาดาลกัน! โปรดรอสักครู่...');
    const result = await fetchData('getQuizQuestion');

    if (result.success) {
        currentQuizQuestion = result;
        const optionsHtml = result.options.map((opt, index) => `${index + 1}. ${opt}`).join('<br>');
        // แก้ไขตรงนี้
        appendMessage('bot', `คำถาม: ${result.question}<br>ตัวเลือก:<br>${optionsHtml}<br>พิมพ์หมายเลขคำตอบที่ถูกต้อง`);
    } else {
        appendMessage('bot', `ไม่สามารถดึงคำถามได้: ${result.message}`);
        currentQuizQuestion = null;
    }
}

async function checkQuizAnswer(answer) {
    if (!currentQuizQuestion) {
        appendMessage('bot', 'ไม่มีคำถามที่กำลังรอคำตอบอยู่ครับ');
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
        scoreChange = 10; // Earn 10 points for correct answer
        messageToDisplay = `ยอดเยี่ยม! คุณตอบถูกครับ! (+${scoreChange} แต้ม)`;
    } else {
        scoreChange = -5; // Lose 5 points for wrong answer
        // แก้ไขตรงนี้
        messageToDisplay = `เสียใจด้วยครับ! คุณตอบผิด คำตอบที่ถูกต้องคือ "${currentQuizQuestion.correctAnswer}" (${scoreChange} แต้ม)`;
    }
    appendMessage('bot', messageToDisplay);

    // Update score in backend
    const updateResult = await fetchData('updateScore', {
        username: currentUser,
        scoreIncrease: scoreChange
    });

    if (updateResult.success) {
        currentUserScore = updateResult.newScore;
        quizAttemptsToday++; // Increment attempt count
        loggedInUserSpan.textContent = `ยินดีต้อนรับ, ${currentUser}! (คะแนน: ${currentUserScore})`;
        appendMessage('bot', `ตอนนี้คุณมี ${currentUserScore} แต้มแล้ว (ตอบไปแล้ว ${quizAttemptsToday} ครั้ง / ${QUIZ_ATTEMPTS_PER_DAY} ครั้งต่อวัน)`);
    } else {
        appendMessage('bot', `เกิดข้อผิดพลาดในการอัปเดตคะแนน: ${updateResult.message}`);
    }

    currentQuizQuestion = null; // Reset current quiz question
    updateRanking(); // Update ranking after score change
}


// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    updateUIForLoginStatus(false);
    updateRanking(); // Load initial ranking

    // Event listener for chat input
    sendBtn.addEventListener('click', () => {
        if (currentQuizQuestion) { // If a quiz question is active, treat input as answer
            checkQuizAnswer(chatInput.value.trim());
        } else {
            sendMessage(); // Otherwise, treat as general chat
        }
    });
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (currentQuizQuestion) {
                checkQuizAnswer(chatInput.value.trim());
            } else {
                sendMessage();
            }
        }
    });

    // --- Modal Event Listeners ---
    loginBtn.addEventListener('click', () => {
        openModal('login');
    });

    registerBtn.addEventListener('click', () => {
        openModal('register');
    });

    closeButton.addEventListener('click', () => {
        closeModal();
    });

    window.addEventListener('click', (event) => {
        if (event.target == authModal) {
            closeModal();
        }
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = authUsernameInput.value.trim();
        const password = authPasswordInput.value.trim();
        const formAction = submitAuthBtn.textContent === 'เข้าสู่ระบบ' ? 'login' : 'register';

        authMessage.textContent = 'กำลังดำเนินการ...';
        authMessage.style.color = 'blue';

        const result = await fetchData(formAction, { username, password });

        if (result.success) {
            authMessage.style.color = 'green';
            authMessage.textContent = result.message;
            if (formAction === 'login') {
                currentUser = username;
                currentUserScore = result.score;
                quizAttemptsToday = result.quizAttemptsToday || 0; // Get attempts from login response
                updateUIForLoginStatus(true, currentUser);
                closeModal();
                appendMessage('bot', `สวัสดีครับ ${currentUser}! ยินดีต้อนรับสู่ AI Chatbot น้ำบาดาล ผมมีข่าวสารประจำวันมาให้คุณฟังครับ:`);
                appendMessage('bot', await fetchData('getNews').then(res => res.news || 'ไม่สามารถโหลดข่าวได้ในขณะนี้'));
                appendMessage('bot', 'คุณสามารถพิมพ์ "เล่นเกม" เพื่อเริ่มเล่นเกมตอบคำถามน้ำบาดาล และสะสมแต้มได้เลยครับ!');
            } else {
                // After successful registration, switch to login form
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
    });

    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        currentUserScore = 0;
        quizAttemptsToday = 0;
        updateUIForLoginStatus(false);
        appendMessage('bot', 'คุณได้ออกจากระบบแล้วครับ');
        // Clear chatbox (optional)
        chatbox.innerHTML = '<div class="message bot">สวัสดีครับ! ยินดีต้อนรับสู่ AI Chatbot น้ำบาดาล</div>';
    });

    // Initialize chatbox with welcome message if not logged in
    if (!currentUser) {
        appendMessage('bot', 'สวัสดีครับ! ยินดีต้อนรับสู่ AI Chatbot น้ำบาดาล');
        appendMessage('bot', 'กรุณาเข้าสู่ระบบ หรือลงทะเบียน เพื่อใช้งาน Chatbot และเล่นเกมสะสมแต้มครับ!');
    }

});

// --- Modal Functions ---
function openModal(mode) {
    authModal.style.display = 'flex'; // Use flex to center
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
    authModal.style.display = 'none';
}