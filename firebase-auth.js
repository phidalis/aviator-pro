// firebase-auth.js
import { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, doc, setDoc, getDoc, serverTimestamp } from './firebase-config.js';

class FirebaseAuthService {
    constructor() {
        this.currentUser = null;
        this.authStateListeners = [];
    }

    // Initialize auth listener
    initAuthListener() {
        onAuthStateChanged(auth, async (user) => {
            this.currentUser = user;
            if (user) {
                // Load user data from Firestore
                await this.loadUserData(user.uid);
            }
            // Notify all listeners
            this.authStateListeners.forEach(listener => listener(user));
        });
    }

    // Add auth state listener
    addAuthListener(callback) {
        this.authStateListeners.push(callback);
        // Call immediately with current state
        callback(this.currentUser);
    }

    // Load user data from Firestore
    async loadUserData(uid) {
        try {
            const userRef = doc(db, 'users', uid);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
                this.userData = userDoc.data();
                return this.userData;
            }
            return null;
        } catch (error) {
            console.error('Error loading user data:', error);
            return null;
        }
    }

    // Sign up with email and password
    async signUp(email, password, username, phone) {
        try {
            // Create auth user
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Update profile with username
            await updateProfile(user, { displayName: username });

            // Create user document in Firestore
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
                uid: user.uid,
                username: username,
                email: email,
                phone: phone || '',
                balance: 5000, // Starting balance for new users
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp(),
                totalBets: 0,
                totalWins: 0,
                totalDeposits: 0,
                totalWithdrawals: 0,
                isActive: true
            });

            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Sign up error:', error);
            let errorMessage = 'Sign up failed';
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'Email already registered';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'Password should be at least 6 characters';
            }
            return { success: false, error: errorMessage };
        }
    }

    // Sign in with email and password
    async signIn(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            
            // Update last login
            const userRef = doc(db, 'users', userCredential.user.uid);
            await updateDoc(userRef, {
                lastLogin: serverTimestamp()
            });

            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Sign in error:', error);
            let errorMessage = 'Login failed';
            if (error.code === 'auth/user-not-found') {
                errorMessage = 'Account not found';
            } else if (error.code === 'auth/wrong-password') {
                errorMessage = 'Invalid password';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email format';
            }
            return { success: false, error: errorMessage };
        }
    }

    // Sign out
    async signOut() {
        try {
            await signOut(auth);
            this.currentUser = null;
            this.userData = null;
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get current user data
    getCurrentUser() {
        return this.currentUser;
    }

    // Get user balance
    getUserBalance() {
        return this.userData ? this.userData.balance : 0;
    }

    // Update user balance
    async updateBalance(uid, newBalance) {
        try {
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, {
                balance: newBalance
            });
            if (this.userData) {
                this.userData.balance = newBalance;
            }
            return { success: true };
        } catch (error) {
            console.error('Update balance error:', error);
            return { success: false, error: error.message };
        }
    }

    // Add transaction
    async addTransaction(uid, type, amount, metadata = {}) {
        try {
            const transactionRef = collection(db, 'users', uid, 'transactions');
            await addDoc(transactionRef, {
                type: type, // 'deposit', 'withdraw', 'bet', 'win'
                amount: amount,
                status: 'completed',
                metadata: metadata,
                timestamp: serverTimestamp()
            });

            // Update user totals
            const userRef = doc(db, 'users', uid);
            const updateData = {};
            if (type === 'deposit') {
                updateData.totalDeposits = increment(amount);
            } else if (type === 'withdraw') {
                updateData.totalWithdrawals = increment(amount);
            }
            if (Object.keys(updateData).length > 0) {
                await updateDoc(userRef, updateData);
            }

            return { success: true };
        } catch (error) {
            console.error('Add transaction error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get transaction history
    async getTransactions(uid, limit = 50) {
        try {
            const transactionsRef = collection(db, 'users', uid, 'transactions');
            const q = query(transactionsRef, orderBy('timestamp', 'desc'), limit(limit));
            const querySnapshot = await getDocs(q);
            const transactions = [];
            querySnapshot.forEach(doc => {
                transactions.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            return { success: true, transactions };
        } catch (error) {
            console.error('Get transactions error:', error);
            return { success: false, error: error.message, transactions: [] };
        }
    }
}

export default new FirebaseAuthService();