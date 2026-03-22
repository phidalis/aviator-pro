// ==================== FIREBASE IMPORTS ====================
import FirebaseAuth from './firebase-auth.js';
import FirebaseDB from './firebase-db.js';
import PaymentService from './payment-service.js';

// ==================== FIREBASE USER MANAGER ====================
const FirebaseUserManager = {
    currentUser: null,
    userData: null,
    
    async initialize() {
        // Initialize Firebase auth listener
        FirebaseAuth.initAuthListener();
        FirebaseAuth.addAuthListener(async (user) => {
            if (user) {
                this.currentUser = user;
                const userData = await FirebaseAuth.loadUserData(user.uid);
                if (userData) {
                    this.userData = userData;
                    userBalance = userData.balance;
                    updateBalanceDisplay();
                    updateAuthUI();
                    updateBettingInputsState();
                }
            } else {
                this.currentUser = null;
                this.userData = null;
                userBalance = 5000; // Guest balance
                updateBalanceDisplay();
                updateAuthUI();
                updateBettingInputsState();
            }
        });
    },
    
    async signUp(email, password, username, phone) {
        const result = await FirebaseAuth.signUp(email, password, username, phone);
        if (result.success) {
            // Add welcome transaction
            await FirebaseAuth.addTransaction(result.user.uid, 'signup_bonus', 5000, { type: 'welcome_bonus' });
            return { success: true };
        }
        return result;
    },
    
    async signIn(email, password) {
        return await FirebaseAuth.signIn(email, password);
    },
    
    async signOut() {
        return await FirebaseAuth.signOut();
    },
    
    async deposit(amount, phoneNumber) {
        if (!this.currentUser) {
            return { success: false, error: 'Please login first' };
        }
        
        const result = await PaymentService.initiateDeposit(phoneNumber, amount, this.currentUser.uid);
        if (result.success) {
            return { success: true, message: result.message };
        }
        return result;
    },
    
    async withdraw(amount, phoneNumber) {
        if (!this.currentUser) {
            return { success: false, error: 'Please login first' };
        }
        
        if (amount > userBalance) {
            return { success: false, error: 'Insufficient balance' };
        }
        
        const result = await PaymentService.requestWithdrawal(phoneNumber, amount, this.currentUser.uid);
        if (result.success) {
            return { success: true, message: result.message };
        }
        return result;
    },
    
    async getTransactionHistory() {
        if (!this.currentUser) return { success: false, transactions: [] };
        return await FirebaseAuth.getTransactions(this.currentUser.uid);
    },
    
    async updateBalance(newBalance) {
        if (this.currentUser) {
            const result = await FirebaseAuth.updateBalance(this.currentUser.uid, newBalance);
            if (result.success && this.userData) {
                this.userData.balance = newBalance;
            }
            return result;
        }
        return { success: false };
    },
    
    async addTransaction(type, amount, metadata = {}) {
        if (this.currentUser) {
            return await FirebaseAuth.addTransaction(this.currentUser.uid, type, amount, metadata);
        }
        return { success: false };
    },
    
    async saveBet(betData) {
        if (this.currentUser) {
            return await FirebaseDB.saveBet(this.currentUser.uid, betData);
        }
        return { success: false };
    },
    
    async addGlobalBet(betData) {
        if (this.currentUser) {
            return await FirebaseDB.addGlobalBet(betData);
        }
        return { success: false };
    }
};

// ==================== CONFIGURATION ====================
const CONFIG = {
    WAIT_TIME: 5000,
    BASE_GROWTH_FACTOR: 1.08,
    MIN_CRASH: 1.00,
    MAX_CRASH: 100
};

// ==================== SIMPLIFIED AUTHENTICATION ====================
// Storage keys - API ready structure
const STORAGE_USERS = 'aviator_users';
const STORAGE_SESSION = 'aviator_session';

// User data structure (matches future backend schema)
class UserData {
    constructor(username, password, email = null, phone = null) {
        this.id = Date.now();
        this.username = username;
        this.password = password; // In production, this would be hashed
        this.email = email;
        this.phone = phone;
        this.balance = 5000;
        this.createdAt = new Date().toISOString();
        this.transactions = [];
        this.isGuest = false;
    }
}

// Simple user management
const LocalUserManager = {
    // Get all users
    getAllUsers() {
        const users = localStorage.getItem(STORAGE_USERS);
        return users ? JSON.parse(users) : [];
    },
    
    // Save users
    saveUsers(users) {
        localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
    },
    
    // Find user by username
    findUser(username) {
        const users = this.getAllUsers();
        return users.find(u => u.username === username);
    },
    
    // Find user by email
    findUserByEmail(email) {
        const users = this.getAllUsers();
        return users.find(u => u.email === email);
    },
    
    // Create new user
    createUser(username, password, email = null, phone = null) {
        const users = this.getAllUsers();
        
        // Check if username exists
        if (users.some(u => u.username === username)) {
            return { success: false, error: 'Username already exists' };
        }
        
        // Check if email exists
        if (email && users.some(u => u.email === email)) {
            return { success: false, error: 'Email already registered' };
        }
        
        // Create new user
        const newUser = new UserData(username, password, email, phone);
        users.push(newUser);
        this.saveUsers(users);
        
        return { success: true, user: newUser };
    },
    
    // Validate login
    validateLogin(usernameOrEmail, password) {
        // Check if input is email or username
        const isEmail = usernameOrEmail.includes('@');
        let user;
        
        if (isEmail) {
            user = this.findUserByEmail(usernameOrEmail);
        } else {
            user = this.findUser(usernameOrEmail);
        }
        
        if (!user) {
            return { success: false, error: 'Account not found' };
        }
        if (user.password !== password) {
            return { success: false, error: 'Invalid password' };
        }
        return { success: true, user };
    },
    
    // Save session
    saveSession(user) {
        if (user) {
            localStorage.setItem(STORAGE_SESSION, JSON.stringify({
                username: user.username,
                balance: user.balance,
                loginTime: Date.now()
            }));
        } else {
            localStorage.removeItem(STORAGE_SESSION);
        }
    },
    
    // Load session
    loadSession() {
        const session = localStorage.getItem(STORAGE_SESSION);
        if (session) {
            const data = JSON.parse(session);
            const user = this.findUser(data.username);
            if (user) {
                return user;
            }
        }
        return null;
    },
    
    // Update user balance
    updateBalance(username, newBalance) {
        const users = this.getAllUsers();
        const userIndex = users.findIndex(u => u.username === username);
        if (userIndex !== -1) {
            users[userIndex].balance = newBalance;
            this.saveUsers(users);
            
            // Update session if this is current user
            const session = this.loadSession();
            if (session && session.username === username) {
                this.saveSession(users[userIndex]);
            }
            return true;
        }
        return false;
    },
    
    // Add transaction
    addTransaction(username, type, amount, status = 'completed') {
        const users = this.getAllUsers();
        const userIndex = users.findIndex(u => u.username === username);
        if (userIndex !== -1) {
            if (!users[userIndex].transactions) {
                users[userIndex].transactions = [];
            }
            users[userIndex].transactions.unshift({
                id: Date.now(),
                type,
                amount,
                status,
                date: new Date().toLocaleString()
            });
            this.saveUsers(users);
            return true;
        }
        return false;
    }
};

// ==================== GAME STATE ====================
let gameState = {
    status: 'WAITING',
    currentMultiplier: 1.00,
    crashPoint: 1.00,
    startTime: 0,
    roundId: 0,
    activeBets: []
};

// ==================== USER STATE (SIMPLIFIED) ====================
let currentUser = null; // null = guest mode
let userBalance = 5000.00; // Guest balance
let currentRoundBets = new Map();
let useFirebase = false; // Will be set after initialization check

// Helper to check if user is logged in
function isLoggedIn() {
    if (useFirebase && FirebaseUserManager.currentUser) {
        return true;
    }
    return currentUser !== null;
}

// Helper to get display name
function getDisplayName() {
    if (useFirebase && FirebaseUserManager.currentUser) {
        return FirebaseUserManager.userData?.username || 'GUEST';
    }
    return currentUser ? currentUser.username : 'GUEST';
}

// Helper to get user ID
function getUserId() {
    if (useFirebase && FirebaseUserManager.currentUser) {
        return FirebaseUserManager.currentUser.uid;
    }
    return currentUser ? currentUser.id : null;
}

// ==================== DOM ELEMENTS ====================
let canvas, ctx;
let mainMultEl, liveBetsList, historyStrip, finalMultEl;
let waitingOverlay, flewAwayOverlay, waitProgress, waitSecondsEl;
let mainBalanceEl, footerBalanceEl;

// ==================== HELPER FUNCTIONS ====================
// Predefined crash points list (20 rounds that loop continuously)
const PREDEFINED_CRASH_POINTS = [
    5.23, 1.00, 4.40, 2.34, 1.93,
    1.87, 30.46, 3.34, 10.20, 1.00,
    2.03, 2.00, 20.00, 6.23, 1.00,
    1.93, 1.45, 2.50, 8.75, 15.30,
    5.45, 3.18, 9.02, 1.00, 2.89,
    5.67, 10.43, 3.90, 21.56, 1.22,
    1.02, 6.15, 3.34, 10.01, 2.67, 
    1.03, 4.56, 10.27, 2.01, 7.06, 
    3.07, 9.25, 2.11, 8.90, 1.60, 
    80.09, 1.22, 1.30, 2.45, 1.05, 
    6.02, 7.65, 4.26, 2.14, 30.10, 
    19.06, 7.28, 3.03, 1.58, 15.75, 
    1.07, 1.45, 1.02, 9.60, 1.29, 
    3.03, 6.40, 1.21, 2.75, 1.06, 
    1.08, 2.05, 1.04, 1.72, 25.00, 
    1.06, 1.50, 1.02, 30.00, 1.34,
    2.45, 1.12, 3.21, 1.09, 1.88, 
    1.55, 6.78, 1.19, 1.43, 2.89
];

let crashPointIndex = 0;

function generateCrashPoint() {
    let crash = PREDEFINED_CRASH_POINTS[crashPointIndex];
    crashPointIndex = (crashPointIndex + 1) % PREDEFINED_CRASH_POINTS.length;
    console.log(`Round ${gameState.roundId + 1}: Crash point = ${crash.toFixed(2)}x`);
    return parseFloat(crash.toFixed(2));
}

function calculateMultiplier(elapsedMs) {
    let seconds = elapsedMs / 1000;
    let mult = Math.pow(CONFIG.BASE_GROWTH_FACTOR, seconds);
    return Math.min(mult, gameState.crashPoint);
}

function updateBalanceDisplay() {
    if (mainBalanceEl) mainBalanceEl.innerText = userBalance.toFixed(2);
    if (footerBalanceEl) footerBalanceEl.innerText = `₿ ${userBalance.toFixed(2)}`;
    if (document.getElementById('withdrawBalance')) {
        document.getElementById('withdrawBalance').innerText = userBalance.toFixed(2);
    }
}

async function updateUserBalance(newBalance) {
    userBalance = newBalance;
    
    if (useFirebase && FirebaseUserManager.currentUser) {
        await FirebaseUserManager.updateBalance(newBalance);
    } else if (currentUser) {
        LocalUserManager.updateBalance(currentUser.username, newBalance);
        currentUser.balance = newBalance;
    }
    
    updateBalanceDisplay();
    updateBettingInputsState();
}

function showToast(msg, isSuccess = true) {
    let toast = document.createElement('div');
    toast.innerText = msg;
    toast.style.position = 'fixed';
    toast.style.bottom = '100px';
    toast.style.right = '20px';
    toast.style.background = isSuccess ? '#10b981' : '#ef4444';
    toast.style.color = 'white';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '40px';
    toast.style.zIndex = '1000';
    toast.style.fontWeight = 'bold';
    toast.style.fontSize = '14px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function addToLiveFeed(userName, amount, multiplier = '-', cashout = '-', isUser = false) {
    if (!liveBetsList) return;
    if (liveBetsList.querySelector('.placeholder-row')) {
        liveBetsList.innerHTML = '';
    }
    let row = document.createElement('div');
    row.className = 'bet-row';
    
    let formattedAmount = '-';
    if (amount !== '-' && !isNaN(amount) && amount !== null && amount !== undefined) {
        formattedAmount = parseFloat(amount).toFixed(0);
    }
    
    let formattedMultiplier = '-';
    if (multiplier !== '-' && !isNaN(multiplier) && multiplier !== null && multiplier !== undefined) {
        formattedMultiplier = multiplier.toFixed(2) + 'x';
    }
    
    let formattedCashout = '-';
    if (cashout !== '-' && !isNaN(cashout) && cashout !== null && cashout !== undefined) {
        formattedCashout = cashout.toFixed(2) + 'x';
    }
    
    row.innerHTML = `
        <span style="${isUser ? 'color: #10b981; font-weight:bold' : 'color: #a855f7'}">${userName}</span>
        <span>${formattedAmount}</span>
        <span>${formattedMultiplier}</span>
        <span class="${cashout !== '-' ? 'cashout-highlight' : ''}">${formattedCashout}</span>
    `;
    liveBetsList.prepend(row);
    while (liveBetsList.children.length > 15) {
        liveBetsList.removeChild(liveBetsList.lastChild);
    }
}

function addToHistory(crashPoint) {
    if (!historyStrip) return;
    let pill = document.createElement('div');
    pill.className = 'pill';
    pill.innerText = crashPoint.toFixed(2) + 'x';
    historyStrip.prepend(pill);
    while (historyStrip.children.length > 12) {
        historyStrip.removeChild(historyStrip.lastChild);
    }
}

// ==================== CANVAS DRAWING ====================
function resizeCanvas() {
    if (canvas) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        drawGraph(0);
    }
}

function drawGraph(elapsedMs) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const margin = 60;
    let progress = Math.min(1, elapsedMs / 8000);
    let endX = margin + (canvas.width - margin * 2) * progress;
    let mult = Math.pow(1.08, elapsedMs / 1000);
    let maxHeight = canvas.height - margin * 2;
    let heightRatio = Math.min(0.9, (mult - 1) / 15);
    let endY = canvas.height - margin - (maxHeight * heightRatio);
    endY = Math.max(margin, Math.min(canvas.height - margin, endY));
    
    ctx.beginPath();
    ctx.moveTo(margin, canvas.height - margin);
    ctx.quadraticCurveTo(canvas.width * 0.3, canvas.height - margin - 20, endX, endY);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#a855f7';
    ctx.stroke();
    ctx.shadowBlur = 0;
}

// ==================== GAME CORE FUNCTIONS ====================
let animationFrameId = null;

function startWaiting() {
    console.log('Entering WAITING state');
    gameState.status = 'WAITING';
    gameState.currentMultiplier = 1.00;
    
    if (waitingOverlay) {
        waitingOverlay.classList.remove('hidden');
    }
    if (flewAwayOverlay) {
        flewAwayOverlay.classList.add('hidden');
    }
    if (mainMultEl) {
        mainMultEl.innerText = '1.00x';
    }
    
    if (waitProgress) {
        waitProgress.style.width = '0%';
    }
    if (waitSecondsEl) {
        waitSecondsEl.innerText = '5';
    }
    
    updateBetButtons();
    
    let waitStart = Date.now();
    
    function updateWaiting() {
        if (gameState.status !== 'WAITING') return;
        
        let elapsed = Date.now() - waitStart;
        let percent = Math.min(100, (elapsed / CONFIG.WAIT_TIME) * 100);
        let secondsLeft = Math.max(0, (CONFIG.WAIT_TIME - elapsed) / 1000);
        
        if (waitProgress) {
            waitProgress.style.width = percent + '%';
        }
        if (waitSecondsEl) {
            waitSecondsEl.innerText = Math.ceil(secondsLeft);
        }
        
        if (elapsed >= CONFIG.WAIT_TIME) {
            gameState.crashPoint = generateCrashPoint();
            startFlight();
            return;
        }
        
        requestAnimationFrame(updateWaiting);
    }
    
    requestAnimationFrame(updateWaiting);
}

function startFlight() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    gameState.status = 'FLYING';
    gameState.startTime = performance.now();
    gameState.roundId++;
    
    if (waitingOverlay) waitingOverlay.classList.add('hidden');
    if (flewAwayOverlay) flewAwayOverlay.classList.add('hidden');
    
    updateBetButtons();
    
    function update(now) {
        if (gameState.status !== 'FLYING') return;
        let elapsed = now - gameState.startTime;
        let mult = calculateMultiplier(elapsed);
        gameState.currentMultiplier = mult;
        if (mainMultEl) {
            mainMultEl.innerText = mult.toFixed(2) + 'x';
            if (mult > 1.5) {
                mainMultEl.style.textShadow = `0 0 ${Math.min(30, mult * 5)}px rgba(168,85,247,0.8)`;
            }
        }
        drawGraph(elapsed);
        checkAutoCashouts();
        if (mult >= gameState.crashPoint) {
            triggerCrash();
            return;
        }
        animationFrameId = requestAnimationFrame(update);
    }
    animationFrameId = requestAnimationFrame(update);
}

async function triggerCrash() {
    if (gameState.status !== 'FLYING') return;
    gameState.status = 'CRASHED';
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    let finalMult = gameState.crashPoint;
    
    if (mainMultEl) mainMultEl.innerText = finalMult.toFixed(2) + 'x';
    if (finalMultEl) finalMultEl.innerText = finalMult.toFixed(2) + 'x';
    
    if (flewAwayOverlay) flewAwayOverlay.classList.remove('hidden');
    if (waitingOverlay) waitingOverlay.classList.add('hidden');
    
    addToHistory(finalMult);
    addToLiveFeed('💥 CRASH', '-', finalMult, 'CRASHED');
    
    currentRoundBets.clear();
    gameState.activeBets = [];
    updateBetButtons();
    
    setTimeout(() => {
        startWaiting();
    }, 3000);
}

// ==================== BETTING FUNCTIONS ====================
async function placeBet(slotId, amount, autoMult = null) {
    if (gameState.status !== 'WAITING') {
        showToast('Bets can only be placed during the waiting period!', false);
        return false;
    }
    
    if (amount > userBalance) {
        showToast('Insufficient balance!', false);
        return false;
    }
    
    if (amount < 10) {
        showToast('Minimum bet is 10 KSH', false);
        return false;
    }
    
    if (currentRoundBets.has(slotId)) {
        showToast('Bet already placed on this slot', false);
        return false;
    }
    
    // Deduct balance
    await updateUserBalance(userBalance - amount);
    
    let bet = { 
        slot: slotId, 
        amount, 
        autoMult, 
        cashedOut: false,
        username: getDisplayName(),
        timestamp: Date.now(),
        roundId: gameState.roundId
    };
    
    currentRoundBets.set(slotId, bet);
    gameState.activeBets.push(bet);
    
    // Save bet to Firebase if available
    if (useFirebase && FirebaseUserManager.currentUser) {
        await FirebaseUserManager.saveBet({
            roundId: gameState.roundId,
            amount: amount,
            autoCashout: autoMult !== null,
            status: 'pending'
        });
        
        // Add global bet for live feed
        await FirebaseUserManager.addGlobalBet({
            username: getDisplayName(),
            amount: amount,
            roundId: gameState.roundId,
            type: 'bet_placed'
        });
    }
    
    addToLiveFeed(getDisplayName(), amount, '-', '-', true);
    updateBetButtons();
    showToast(`Bet placed: ${amount} KSH for next round`, true);
    return true;
}

async function cancelBet(slotId) {
    let bet = currentRoundBets.get(slotId);
    if (!bet) {
        showToast('No active bet to cancel', false);
        return false;
    }
    
    if (gameState.status !== 'WAITING') {
        showToast('Cannot cancel bet after round has started!', false);
        return false;
    }
    
    // Refund balance
    await updateUserBalance(userBalance + bet.amount);
    
    currentRoundBets.delete(slotId);
    const index = gameState.activeBets.findIndex(b => b.slot === slotId);
    if (index !== -1) gameState.activeBets.splice(index, 1);
    
    updateBetButtons();
    showToast(`Bet of ${bet.amount} KSH cancelled and refunded`, true);
    return true;
}

async function cashoutBet(slotId) {
    let bet = currentRoundBets.get(slotId);
    if (!bet || bet.cashedOut) {
        showToast('No active bet to cashout', false);
        return false;
    }
    
    if (gameState.status !== 'FLYING') {
        showToast('Cannot cashout now', false);
        return false;
    }
    
    let currentMult = gameState.currentMultiplier;
    let winAmount = bet.amount * currentMult;
    
    await updateUserBalance(userBalance + winAmount);
    
    bet.cashedOut = true;
    currentRoundBets.delete(slotId);
    
    // Record transaction for logged in users
    if (useFirebase && FirebaseUserManager.currentUser) {
        await FirebaseUserManager.addTransaction('WIN', winAmount, {
            roundId: gameState.roundId,
            multiplier: currentMult
        });
    } else if (currentUser) {
        LocalUserManager.addTransaction(currentUser.username, 'WIN', winAmount);
    }
    
    addToLiveFeed(getDisplayName(), bet.amount, currentMult, currentMult, true);
    showToast(`Cashed out at ${currentMult.toFixed(2)}x! +${winAmount.toFixed(0)} KSH`, true);
    updateBetButtons();
    return true;
}

function checkAutoCashouts() {
    if (gameState.status !== 'FLYING') return;
    let currentMult = gameState.currentMultiplier;
    for (let [slotId, bet] of currentRoundBets) {
        if (!bet.cashedOut && bet.autoMult && currentMult >= bet.autoMult) {
            cashoutBet(slotId);
        }
    }
}

// ==================== BUTTON UPDATE FUNCTION ====================
function updateBetButtons() {
    let isFlying = gameState.status === 'FLYING';
    let isWaiting = gameState.status === 'WAITING';
    
    for (let slot of [1, 2]) {
        let btn = document.querySelector(`.action-btn[data-slot="${slot}"]`);
        let hasActive = currentRoundBets.has(slot);
        
        if (btn) {
            btn.disabled = false;
            
            if (isFlying && hasActive) {
                btn.innerText = 'CASH OUT';
                btn.classList.remove('bet-btn');
                btn.classList.add('cashout-btn');
                btn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                btn.style.boxShadow = '0 4px 0 #b45309';
            } 
            else if (isWaiting && hasActive) {
                btn.innerText = 'CANCEL BET';
                btn.classList.remove('bet-btn', 'cashout-btn');
                btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                btn.style.boxShadow = '0 4px 0 #991b1b';
            } 
            else if (isWaiting && !hasActive) {
                btn.innerText = 'PLACE BET';
                btn.classList.remove('cashout-btn');
                btn.classList.add('bet-btn');
                btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                btn.style.boxShadow = '0 4px 0 #065f46';
            } 
            else {
                btn.innerText = 'WAITING...';
                btn.classList.remove('bet-btn', 'cashout-btn');
                btn.style.background = 'linear-gradient(135deg, #6b7280, #4b5563)';
                btn.style.boxShadow = 'none';
                btn.disabled = true;
            }
        }
    }
    
    let badge = document.getElementById('autoCashoutBadge');
    if (badge) {
        let hasAuto = false;
        for (let bet of currentRoundBets.values()) {
            if (bet.autoMult) hasAuto = true;
        }
        badge.style.display = hasAuto ? 'flex' : 'none';
    }
}

// ==================== HANDLE BET ACTION ====================
function handleBetAction(slotId) {
    let hasActive = currentRoundBets.has(slotId);
    
    if (gameState.status === 'WAITING' && hasActive) {
        cancelBet(slotId);
    } 
    else if (gameState.status === 'WAITING' && !hasActive) {
        let amountInput = document.getElementById(`bet${slotId}Amount`);
        let amount = parseFloat(amountInput?.value || 0);
        let autoCheckbox = document.querySelector(`.auto-cash-chk[data-slot="${slotId}"]`);
        let autoMult = null;
        if (autoCheckbox && autoCheckbox.checked) {
            let slider = document.querySelector(`.auto-slider[data-slot="${slotId}"]`);
            autoMult = parseFloat(slider?.value || 1.5);
        }
        if (amount > 0) {
            placeBet(slotId, amount, autoMult);
        } else {
            showToast('Enter valid bet amount', false);
        }
    }
    else if (gameState.status === 'FLYING' && hasActive) {
        cashoutBet(slotId);
    }
    else {
        showToast('Cannot place/cancel bet now. Wait for the next round to start!', false);
    }
}

// ==================== MODAL MANAGEMENT ====================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function setupModals() {
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-modal');
            closeModal(modalId);
        });
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });
}

// ==================== AUTH UI FUNCTIONS ====================
function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const usernameDisplay = document.getElementById('usernameDisplay');
    const depositBtn = document.getElementById('depositBtn');
    const withdrawBtn = document.getElementById('withdrawBtn');
    
    const loggedIn = isLoggedIn();
    
    if (loggedIn) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (signupBtn) signupBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';
        if (usernameDisplay) {
            const displayName = getDisplayName();
            usernameDisplay.innerText = `👤 ${displayName}`;
        }
        
        // Enable wallet buttons for logged in users
        if (depositBtn) depositBtn.disabled = false;
        if (withdrawBtn) withdrawBtn.disabled = false;
        if (depositBtn) depositBtn.style.opacity = '1';
        if (withdrawBtn) withdrawBtn.style.opacity = '1';
    } else {
        if (loginBtn) loginBtn.style.display = 'block';
        if (signupBtn) signupBtn.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (usernameDisplay) usernameDisplay.innerText = '👤 GUEST';
        
        // Disable wallet buttons for guests
        if (depositBtn) depositBtn.disabled = true;
        if (withdrawBtn) withdrawBtn.disabled = true;
        if (depositBtn) depositBtn.style.opacity = '0.5';
        if (withdrawBtn) withdrawBtn.style.opacity = '0.5';
    }
    
    updateBettingInputsState();
}

function updateBettingInputsState() {
    const hasBalance = userBalance >= 10;
    
    for (let slot of [1, 2]) {
        const amountInput = document.getElementById(`bet${slot}Amount`);
        const quickBtns = document.querySelectorAll(`.quick-add[data-slot="${slot}"]`);
        const autoCheckbox = document.querySelector(`.auto-cash-chk[data-slot="${slot}"]`);
        const autoSlider = document.querySelector(`.auto-slider[data-slot="${slot}"]`);
        
        if (amountInput) amountInput.disabled = !hasBalance;
        quickBtns.forEach(btn => btn.disabled = !hasBalance);
        if (autoCheckbox) autoCheckbox.disabled = !hasBalance;
        if (autoSlider) autoSlider.disabled = !hasBalance;
    }
}

// ==================== AUTH ACTIONS ====================
async function handleLogin(email, password) {
    if (!email || !email.trim()) {
        showToast('Please enter email', false);
        return false;
    }
    
    if (!password || !password.trim()) {
        showToast('Please enter password', false);
        return false;
    }
    
    let result;
    
    if (useFirebase) {
        result = await FirebaseUserManager.signIn(email.trim(), password.trim());
    } else {
        // Try to find user by email or username
        const user = LocalUserManager.validateLogin(email.trim(), password.trim());
        result = user;
    }
    
    if (!result.success) {
        showToast(result.error, false);
        return false;
    }
    
    // Login successful
    if (useFirebase) {
        currentUser = null; // Firebase user is managed separately
    } else {
        currentUser = result.user;
        userBalance = currentUser.balance;
        LocalUserManager.saveSession(currentUser);
    }
    
    updateBalanceDisplay();
    updateAuthUI();
    closeModal('loginModal');
    
    const displayName = getDisplayName();
    showToast(`Welcome back, ${displayName}!`, true);
    addToLiveFeed(`🎉 New player joined`, 0, '-', '-');
    
    // Clear login form
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    if (loginEmail) loginEmail.value = '';
    if (loginPassword) loginPassword.value = '';
    
    return true;
}

async function handleSignup(email, password, username, phone) {
    // Validate inputs
    if (!email || !email.trim()) {
        showToast('Please enter email', false);
        return false;
    }
    
    if (!password || !password.trim()) {
        showToast('Please enter password', false);
        return false;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', false);
        return false;
    }
    
    if (!username || !username.trim()) {
        showToast('Please enter username', false);
        return false;
    }
    
    let result;
    
    if (useFirebase) {
        result = await FirebaseUserManager.signUp(
            email.trim(),
            password.trim(),
            username.trim(),
            phone || ''
        );
    } else {
        result = LocalUserManager.createUser(
            username.trim(),
            password.trim(),
            email.trim(),
            phone || ''
        );
        if (result.success) {
            currentUser = result.user;
            userBalance = currentUser.balance;
            LocalUserManager.saveSession(currentUser);
        }
    }
    
    if (!result.success) {
        showToast(result.error, false);
        return false;
    }
    
    updateBalanceDisplay();
    updateAuthUI();
    closeModal('signupModal');
    
    showToast(`Account created! Welcome ${username}!`, true);
    addToLiveFeed(`✨ New player: ${username}`, 0, '-', '-');
    
    // Clear signup form
    const signupEmail = document.getElementById('signupEmail');
    const signupPassword = document.getElementById('signupPassword');
    const signupUsername = document.getElementById('signupUsername');
    const signupPhone = document.getElementById('signupPhone');
    
    if (signupEmail) signupEmail.value = '';
    if (signupPassword) signupPassword.value = '';
    if (signupUsername) signupUsername.value = '';
    if (signupPhone) signupPhone.value = '';
    
    return true;
}

async function handleLogout() {
    const username = getDisplayName();
    
    if (useFirebase) {
        await FirebaseUserManager.signOut();
    } else {
        currentUser = null;
        LocalUserManager.saveSession(null);
    }
    
    userBalance = 5000.00; // Reset to guest balance
    currentRoundBets.clear();
    
    updateBalanceDisplay();
    updateAuthUI();
    
    showToast(`${username} logged out. Guest mode active`, true);
}

function loadSession() {
    if (useFirebase) {
        // Firebase handles session automatically
        return true;
    } else {
        const savedUser = LocalUserManager.loadSession();
        if (savedUser) {
            currentUser = savedUser;
            userBalance = currentUser.balance;
            updateBalanceDisplay();
            updateAuthUI();
            return true;
        }
    }
    return false;
}

// ==================== DEPOSIT / WITHDRAW ====================
async function deposit(amount, phoneNumber) {
    if (!isLoggedIn()) {
        showToast('Please login to deposit funds', false);
        return false;
    }
    
    if (useFirebase) {
        if (!phoneNumber || phoneNumber.trim() === '') {
            showToast('Please enter phone number for M-Pesa', false);
            return false;
        }
        
        const result = await FirebaseUserManager.deposit(amount, phoneNumber);
        if (result.success) {
            showToast(result.message, true);
            closeModal('depositModal');
            return true;
        } else {
            showToast(result.error, false);
            return false;
        }
    } else {
        // Local deposit
        if (amount && amount > 0) {
            await updateUserBalance(userBalance + amount);
            LocalUserManager.addTransaction(currentUser.username, 'DEPOSIT', amount);
            showToast(`Deposited ${amount} KSH successfully!`, true);
            closeModal('depositModal');
            return true;
        }
        return false;
    }
}

async function withdraw(amount, phoneNumber) {
    if (!isLoggedIn()) {
        showToast('Please login to withdraw funds', false);
        return false;
    }
    
    if (useFirebase) {
        if (!phoneNumber || phoneNumber.trim() === '') {
            showToast('Please enter phone number for withdrawal', false);
            return false;
        }
        
        const result = await FirebaseUserManager.withdraw(amount, phoneNumber);
        if (result.success) {
            showToast(result.message, true);
            closeModal('withdrawModal');
            return true;
        } else {
            showToast(result.error, false);
            return false;
        }
    } else {
        // Local withdrawal
        if (amount && amount > 0 && amount <= userBalance) {
            await updateUserBalance(userBalance - amount);
            LocalUserManager.addTransaction(currentUser.username, 'WITHDRAW', amount);
            showToast(`Withdrawn ${amount} KSH successfully!`, true);
            closeModal('withdrawModal');
            return true;
        } else {
            showToast('Invalid amount or insufficient balance', false);
            return false;
        }
    }
}

async function showTransactionHistory() {
    const historyList = document.getElementById('transactionHistoryList');
    if (!historyList) return;
    
    let transactions = [];
    
    if (useFirebase && FirebaseUserManager.currentUser) {
        const result = await FirebaseUserManager.getTransactionHistory();
        if (result.success && result.transactions) {
            transactions = result.transactions;
        }
    } else if (currentUser && currentUser.transactions) {
        transactions = currentUser.transactions;
    }
    
    if (transactions.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No transactions yet</div>';
    } else {
        historyList.innerHTML = transactions.map(tx => `
            <div class="history-item">
                <strong>${tx.type.toUpperCase()}</strong><br>
                Amount: ${tx.amount?.toFixed?.(2) || tx.amount} KSH<br>
                Status: ${tx.status}<br>
                <small>${tx.timestamp?.toDate?.().toLocaleString() || tx.date || new Date(tx.timestamp).toLocaleString()}</small>
            </div>
        `).join('');
    }
    openModal('historyModal');
}

// ==================== EVENT HANDLERS ====================
function setupEventListeners() {
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            let slot = parseInt(btn.getAttribute('data-slot'));
            if (slot) handleBetAction(slot);
        });
    });
    
    document.querySelectorAll('.quick-add').forEach(btn => {
        btn.addEventListener('click', (e) => {
            let slot = parseInt(btn.getAttribute('data-slot'));
            let addVal = parseInt(btn.getAttribute('data-add'));
            let input = document.getElementById(`bet${slot}Amount`);
            if (input) {
                let newVal = (parseFloat(input.value) || 0) + addVal;
                input.value = Math.min(newVal, userBalance);
            }
        });
    });
    
    document.querySelectorAll('.auto-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            let slot = slider.getAttribute('data-slot');
            let parent = slider.closest('.auto-options');
            let span = parent?.querySelector('.auto-mult-val');
            if (span) span.innerText = parseFloat(slider.value).toFixed(1) + 'x';
        });
    });
    
    // Wallet buttons
    const depositBtn = document.getElementById('depositBtn');
    const withdrawBtn = document.getElementById('withdrawBtn');
    const txHistoryBtn = document.getElementById('txHistoryBtn');
    
    if (depositBtn) depositBtn.addEventListener('click', () => openModal('depositModal'));
    if (withdrawBtn) withdrawBtn.addEventListener('click', () => openModal('withdrawModal'));
    if (txHistoryBtn) txHistoryBtn.addEventListener('click', showTransactionHistory);
    
    // Auth buttons
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (loginBtn) loginBtn.addEventListener('click', () => openModal('loginModal'));
    if (signupBtn) signupBtn.addEventListener('click', () => openModal('signupModal'));
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    // Submit handlers
    const submitLogin = document.getElementById('submitLogin');
    const submitSignup = document.getElementById('submitSignup');
    const submitDeposit = document.getElementById('submitDeposit');
    const submitWithdraw = document.getElementById('submitWithdraw');
    
    if (submitLogin) {
        submitLogin.addEventListener('click', () => {
            const email = document.getElementById('loginEmail')?.value;
            const password = document.getElementById('loginPassword')?.value;
            handleLogin(email, password);
        });
    }
    
    if (submitSignup) {
        submitSignup.addEventListener('click', () => {
            const email = document.getElementById('signupEmail')?.value;
            const password = document.getElementById('signupPassword')?.value;
            const username = document.getElementById('signupUsername')?.value;
            const phone = document.getElementById('signupPhone')?.value;
            handleSignup(email, password, username, phone);
        });
    }
    
    if (submitDeposit) {
        submitDeposit.addEventListener('click', () => {
            const amount = parseFloat(document.getElementById('depositAmount')?.value);
            const phone = document.getElementById('depositPhone')?.value;
            deposit(amount, phone);
        });
    }
    
    if (submitWithdraw) {
        submitWithdraw.addEventListener('click', () => {
            const amount = parseFloat(document.getElementById('withdrawAmount')?.value);
            const phone = document.getElementById('withdrawPhone')?.value;
            withdraw(amount, phone);
        });
    }
    
    // Preset amounts
    document.querySelectorAll('.preset-amount').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = parseInt(btn.getAttribute('data-amount'));
            const input = document.getElementById('depositAmount');
            if (input) input.value = amount;
        });
    });
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Enter key handlers
    const loginEmailInput = document.getElementById('loginEmail');
    const loginPasswordInput = document.getElementById('loginPassword');
    
    if (loginEmailInput) {
        loginEmailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitLogin?.click();
        });
    }
    if (loginPasswordInput) {
        loginPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitLogin?.click();
        });
    }
}

// ==================== CHAT FUNCTIONALITY ====================
function setupChat() {
    let toggleBtn = document.getElementById('chatToggleBtn');
    let closeBtn = document.getElementById('closeChatBtn');
    let sendBtn = document.getElementById('sendChatBtn');
    let chatInput = document.getElementById('chatInput');
    let chatPanel = document.getElementById('chatPanel');
    let chatMsgs = document.getElementById('chatMessages');
    
    function sendMessage() {
        let msg = chatInput?.value.trim();
        if (msg) {
            let msgDiv = document.createElement('div');
            msgDiv.className = 'chat-msg';
            msgDiv.innerHTML = `<strong>${getDisplayName()}:</strong> ${msg}`;
            chatMsgs?.appendChild(msgDiv);
            if (chatInput) chatInput.value = '';
            chatMsgs.scrollTop = chatMsgs.scrollHeight;
            
            // Save to Firebase if available
            if (useFirebase && FirebaseUserManager.currentUser) {
                FirebaseDB.saveChatMessage({
                    username: getDisplayName(),
                    message: msg,
                    uid: getUserId()
                });
            }
        }
    }
    
    if (toggleBtn) toggleBtn.addEventListener('click', () => chatPanel?.classList.add('open'));
    if (closeBtn) closeBtn.addEventListener('click', () => chatPanel?.classList.remove('open'));
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (chatInput) chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

// ==================== SIMULATED LIVE BETS ====================
function startSimulatedBets() {
    setInterval(() => {
        if (gameState.status === 'FLYING') {
            let names = ['🚀 Kiprono', '⭐ Cheruiyot', '💎 Mwangi', '🔥 Anyango', '⚡ Omondi', '🌟 Wanjiku', '💪 Otieno'];
            let name = names[Math.floor(Math.random() * names.length)];
            let betAmt = Math.floor(Math.random() * 1500) + 50;
            addToLiveFeed(name, betAmt, '-', '-');
        }
    }, 4000);
}

// ==================== FIREBASE INITIALIZATION ====================
async function initFirebase() {
    try {
        await FirebaseUserManager.initialize();
        useFirebase = true;
        console.log('Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('Firebase initialization failed, using local storage:', error);
        useFirebase = false;
        return false;
    }
}

// ==================== INITIALIZATION ====================
async function init() {
    canvas = document.getElementById('flightCanvas');
    ctx = canvas?.getContext('2d');
    mainMultEl = document.getElementById('mainMultiplier');
    liveBetsList = document.getElementById('liveBetsList');
    historyStrip = document.getElementById('historyStrip');
    finalMultEl = document.getElementById('finalMult');
    waitingOverlay = document.getElementById('waitingOverlay');
    flewAwayOverlay = document.getElementById('flewAwayOverlay');
    waitProgress = document.getElementById('waitProgress');
    waitSecondsEl = document.getElementById('waitSeconds');
    mainBalanceEl = document.getElementById('mainBalance');
    footerBalanceEl = document.getElementById('footerBalance');
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    updateBalanceDisplay();
    setupEventListeners();
    setupModals();
    setupChat();
    startSimulatedBets();
    
    // Initialize Firebase first
    await initFirebase();
    
    // Load session if exists
    await loadSession();
    
    // Start game
    startWaiting();
    
    console.log('Aviator Pro initialized!');
}

// Start the application
window.addEventListener('DOMContentLoaded', init);

