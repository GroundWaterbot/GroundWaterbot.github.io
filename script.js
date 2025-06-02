// ---- เพิ่มฟังก์ชัน hashPassword ไว้ด้านบนสุด ----
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}
// ---- จบฟังก์ชัน hashPassword ----

// ตรวจสอบให้แน่ใจว่า URL นี้เป็น URL ของ Google Apps Script Web App ล่าสุดที่คุณ Deploy แล้ว (และอนุมัติสิทธิ์ครบถ้วน)
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
    messageDiv.innerHTML = text;
    chatbox.appendChild(messageDiv);
    chatbox.scrollTop = chatbox.scrollHeight;
}

// *** ปรับปรุง fetchData ให้รองรับ POST method และ body ***
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

        const response = await fetch(url.toString(), fetchOptions); // ส่ง url.toString() เพื่อให้ถูกต้อง
        
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
        logoutBtn.style.display = 'inline-block'; // แสดงปุ่ม logout
        userInfo.style.display = 'inline-block';
        loggedInUserSpan.textContent = `ยินดีต้อนรับ, ${username}! (คะแนน: ${currentUserScore})`;
        chatbotSection.style.display = 'block';
    } else {
        loginBtn.style.display = 'inline-block';
        registerBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none'; // ซ่อนปุ่ม logout
        userInfo.style.display = 'none';
        loggedInUserSpan.textContent = '';
        chatbotSection.style.display = 'none';
    }
    updateRanking();
}

async function updateRanking() {
    rankingList.innerHTML = '<li>กำลังโหลดอันดับ...</li>';
    const result = await fetchData('getRanking'); // getRanking เป็น GET request
    if (result.success) {
        rankingList.innerHTML = '';
        result.ranking.forEach((user, index) => {
            const listItem = document.createElement('li');
            listItem.textContent = `อันดับ ${index + 1}: ${user.username} (${user.score} แต้ม)`;
            rankingList.appendChild(listItem);
        });
    } else {
        rankingList.innerHTML = `<li>ไม่สามารถโหลดอันดับได้: ${result.message}</li>`;
    }
}

// *** ปรับปรุง sendMessage เพื่อส่งข้อความไป Apps Script และรอคำตอบจาก Dialogflow ***
async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    if (!currentUser) { // ตรวจสอบว่าล็อกอินแล้วหรือยัง
        appendMessage('bot', 'คุณต้องเข้าสู่ระบบก่อนจึงจะคุยกับ Chatbot ได้ค่ะ');
        chatInput.value = '';
        return;
    }

    appendMessage('user', message);
    chatInput.value = '';

    // Check if it's a quiz command before sending to Dialogflow
    if (message.toLowerCase() === 'เล่นเกม') {
        await startQuiz();
        return;
    }
    
    // Check if it's an answer to a quiz question
    if (currentQuizQuestion) {
        await checkQuizAnswer(message);
        return;
    }

    // แสดงสถานะกำลังพิมพ์...
    const thinkingMessageDiv = document.createElement('div');
    thinkingMessageDiv.classList.add('message', 'bot');
    thinkingMessageDiv.textContent = 'กำลังพิมพ์...';
    chatbox.appendChild(thinkingMessageDiv);
    chatbox.scrollTop = chatbox.scrollHeight;

    try {
        const result = await fetchData('sendMessage', { 
            username: currentUser, // ส่ง username ไปด้วยสำหรับ session ID ใน Dialogflow
            user_content: message 
        }, 'POST'); // sendMessage เป็น POST request

        // ลบสถานะกำลังพิมพ์...
        if (thinkingMessageDiv.parentNode) {
            thinkingMessageDiv.remove();
        }

        if (result.success) {
            appendMessage('bot', result.message); // คำตอบจาก Dialogflow
        } else {
            appendMessage('bot', `บอทตอบกลับผิดพลาด: ${result.message}`);
        }
    } catch (error) {
        console.error("Error sending message to chatbot:", error);
        if (thinkingMessageDiv.parentNode) {
            thinkingMessageDiv.remove();
        }
        appendMessage('bot', "เกิดข้อผิดพลาดในการเชื่อมต่อกับบอท");
    }
}

let currentQuizQuestion = null;

async function startQuiz() {
    if (!currentUser) {
        appendMessage('bot', 'คุณต้องเข้าสู่ระบบก่อนจึงจะเล่นเกมได้ค่ะ');
        return;
    }
    if (quizAttemptsToday >= QUIZ_ATTEMPTS_PER_DAY) {
        appendMessage('bot', `วันนี้คุณตอบคำถามครบ ${QUIZ_ATTEMPTS_PER_DAY} ครั้งแล้ว ลองมาใหม่พรุ่งนี้นะ!`);
        return;
    }
    appendMessage('bot', 'มาเล่นเกมตอบคำถามน้ำบาดาลกัน! โปรดรอสักครู่...');
    const result = await fetchData('getQuizQuestion'); // getQuizQuestion เป็น GET request
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
        messageToDisplay = `เก่งมากเลย! คุณตอบถูกคะ! (+${scoreChange} แต้ม)`;
    } else {
        scoreChange = -5;
        messageToDisplay = `เสียใจด้วยค่ะ! คุณตอบผิด คำตอบที่ถูกต้องคือ "${currentQuizQuestion.correctAnswer}" (${scoreChange} แต้ม)`;
    }
    appendMessage('bot', messageToDisplay);

    const updateResult = await fetchData('updateScore', {
        username: currentUser,
        scoreIncrease: scoreChange
    }, 'POST'); // updateScore เป็น POST request

    if (updateResult.success) {
        currentUserScore = updateResult.newScore;
        quizAttemptsToday++;
        loggedInUserSpan.textContent = `ยินดีต้อนรับ, ${currentUser}! (คะแนน: ${currentUserScore})`;
        appendMessage('bot', `ตอนนี้คุณมี ${currentUserScore} แต้มแล้ว (ตอบไปแล้ว ${quizAttemptsToday} ครั้ง / ${QUIZ_ATTEMPTS_PER_DAY} ครั้งต่อวัน)`);
    } else {
        appendMessage('bot', `เกิดข้อผิดพลาดในการอัปเดตคะแนน: ${updateResult.message}`);
    }

    currentQuizQuestion = null;
    updateRanking();
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
        appendMessage('bot', `สวัสดีค่ะ ${currentUser}! ยินดีต้อนรับกลับสู่ AI Chatbot น้ำบาดาล`);
        appendMessage('bot', `ตอนนี้คุณมี ${currentUserScore} แต้ม (ตอบไปแล้ว ${quizAttemptsToday} ครั้ง / ${QUIZ_ATTEMPTS_PER_DAY} ครั้งต่อวัน)`);
        
        // โหลดข่าวสารเมื่อเข้าสู่ระบบอัตโนมัติ
        fetchData('getNews').then(res => {
            if (res.success && res.news) {
                appendMessage('bot', `บาดาลมีข่าวสารประจำวันมาให้คุณฟังค่ะ: ${res.news}`);
            } else {
                appendMessage('bot', 'ไม่สามารถโหลดข่าวได้ในขณะนี้');
            }
            appendMessage('bot', 'คุณสามารถพิมพ์ "เล่นเกม" เพื่อเริ่มเล่นเกมตอบคำถามน้ำบาดาล และสะสมแต้มได้เลยค่ะ!');
        });
    } else {
        updateUIForLoginStatus(false);
        appendMessage('bot', 'สวัสดีค่ะ! ยินดีต้อนรับสู่ AI Chatbot น้ำบาดาล');
        appendMessage('bot', 'กรุณาเข้าสู่ระบบ หรือลงทะเบียน เพื่อใช้งาน Chatbot และเล่นเกมสะสมแต้มค่ะ!');
    }
    
    updateRanking(); // โหลดอันดับเมื่อหน้าเว็บโหลดเสร็จ

    sendBtn.addEventListener('click', () => {
        // sendMessage function will handle quiz answers if currentQuizQuestion is set
        sendMessage();
    });
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

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

        // Hash password ก่อนส่ง
        const passwordHash = await hashPassword(password);

        const result = await fetchData(formAction, { username, password: passwordHash }, 'POST'); // login/register เป็น POST request

        if (result.success) {
            authMessage.style.color = 'green';
            authMessage.textContent = result.message;
            if (formAction === 'login') {
                currentUser = username;
                currentUserScore = result.score;
                quizAttemptsToday = result.quizAttemptsToday || 0;

                // บันทึกสถานะการล็อกอินลง Local Storage
                localStorage.setItem('currentUser', currentUser);
                localStorage.setItem('currentUserScore', currentUserScore);
                localStorage.setItem('quizAttemptsToday', quizAttemptsToday);

                updateUIForLoginStatus(true, currentUser);
                closeModal();
                appendMessage('bot', `สวัสดีค่ะ ${currentUser}! ยินดีต้อนรับสู่ AI Chatbot น้ำบาดาล บาดาลมีข่าวสารประจำวันมาให้คุณฟังค่ะ:`);
                appendMessage('bot', await fetchData('getNews').then(res => res.news || 'ไม่สามารถโหลดข่าวได้ในขณะนี้'));
                appendMessage('bot', 'คุณสามารถพิมพ์ "เล่นเกม" เพื่อเริ่มเล่นเกมตอบคำถามน้ำบาดาล และสะสมแต้มได้เลยค่ะ!');
            } else { // ลงทะเบียนสำเร็จ
                setTimeout(() => {
                    modalTitle.textContent = 'เข้าสู่ระบบ';
                    submitAuthBtn.textContent = 'เข้าสู่ระบบ';
                    authMessage.textContent = '';
                    authForm.reset();
                }, 1500); // ให้ผู้ใช้เห็นข้อความสำเร็จแล้วเปลี่ยนเป็นหน้า Login
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
        localStorage.removeItem('currentUser'); // ลบข้อมูลจาก Local Storage
        localStorage.removeItem('currentUserScore');
        localStorage.removeItem('quizAttemptsToday');
        updateUIForLoginStatus(false);
        appendMessage('bot', 'คุณได้ออกจากระบบแล้วค่ะ');
        chatbox.innerHTML = '<div class="message bot">สวัสดีค่ะ! ยินดีต้อนรับสู่ AI Chatbot น้ำบาดาล</div>'; // รีเซ็ต chatbox
    });

    // Initial welcome messages (moved to DOMContentLoaded based on login status)
    // if (!currentUser) { // This part is now handled by the logic above
    //     appendMessage('bot', 'สวัสดีครับ! ยินดีต้อนรับสู่ AI Chatbot น้ำบาดาล');
    //     appendMessage('bot', 'กรุณาเข้าสู่ระบบ หรือลงทะเบียน เพื่อใช้งาน Chatbot และเล่นเกมสะสมแต้มค่ะ!');
    // }
});

// --- Modal Functions ---
function openModal(mode) {
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
    authModal.style.display = 'none';
}