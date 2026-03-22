// firebase-db.js
import { db, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, orderBy, limit, serverTimestamp, increment } from './firebase-config.js';

class FirebaseDBService {
    constructor() {
        this.gameState = null;
    }

    // Save game round result
    async saveGameRound(roundData) {
        try {
            const roundRef = collection(db, 'gameRounds');
            const docRef = await addDoc(roundRef, {
                roundId: roundData.roundId,
                crashPoint: roundData.crashPoint,
                startTime: roundData.startTime,
                endTime: roundData.endTime,
                totalBets: roundData.totalBets,
                totalPayouts: roundData.totalPayouts,
                timestamp: serverTimestamp()
            });
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Save game round error:', error);
            return { success: false, error: error.message };
        }
    }

    // Save player bet
    async saveBet(uid, betData) {
        try {
            const betRef = collection(db, 'users', uid, 'bets');
            const docRef = await addDoc(betRef, {
                roundId: betData.roundId,
                amount: betData.amount,
                multiplier: betData.multiplier || null,
                cashoutMultiplier: betData.cashoutMultiplier || null,
                autoCashout: betData.autoCashout || false,
                status: betData.status, // 'pending', 'cashed_out', 'crashed'
                winAmount: betData.winAmount || 0,
                timestamp: serverTimestamp()
            });

            // Update user total bets
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, {
                totalBets: increment(1)
            });

            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Save bet error:', error);
            return { success: false, error: error.message };
        }
    }

    // Update bet result
    async updateBetResult(betId, uid, cashoutMultiplier, winAmount) {
        try {
            const betRef = doc(db, 'users', uid, 'bets', betId);
            await updateDoc(betRef, {
                cashoutMultiplier: cashoutMultiplier,
                winAmount: winAmount,
                status: 'cashed_out',
                cashoutTime: serverTimestamp()
            });

            // Update user total wins
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, {
                totalWins: increment(winAmount)
            });

            return { success: true };
        } catch (error) {
            console.error('Update bet result error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get user bet history
    async getUserBets(uid, limit = 20) {
        try {
            const betsRef = collection(db, 'users', uid, 'bets');
            const q = query(betsRef, orderBy('timestamp', 'desc'), limit(limit));
            const querySnapshot = await getDocs(q);
            const bets = [];
            querySnapshot.forEach(doc => {
                bets.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            return { success: true, bets };
        } catch (error) {
            console.error('Get user bets error:', error);
            return { success: false, error: error.message, bets: [] };
        }
    }

    // Get global live bets (for sidebar)
    async getLiveBets(limit = 20) {
        try {
            const allBetsQuery = query(
                collection(db, 'globalBets'),
                orderBy('timestamp', 'desc'),
                limit(limit)
            );
            const querySnapshot = await getDocs(allBetsQuery);
            const bets = [];
            querySnapshot.forEach(doc => {
                bets.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            return { success: true, bets };
        } catch (error) {
            console.error('Get live bets error:', error);
            return { success: false, error: error.message, bets: [] };
        }
    }

    // Add global bet (for live feed)
    async addGlobalBet(betData) {
        try {
            const globalBetsRef = collection(db, 'globalBets');
            await addDoc(globalBetsRef, {
                ...betData,
                timestamp: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Add global bet error:', error);
            return { success: false, error: error.message };
        }
    }

    // Save chat message
    async saveChatMessage(messageData) {
        try {
            const chatRef = collection(db, 'chatMessages');
            await addDoc(chatRef, {
                ...messageData,
                timestamp: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Save chat message error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get recent chat messages
    async getRecentChatMessages(limit = 50) {
        try {
            const chatRef = collection(db, 'chatMessages');
            const q = query(chatRef, orderBy('timestamp', 'desc'), limit(limit));
            const querySnapshot = await getDocs(q);
            const messages = [];
            querySnapshot.forEach(doc => {
                messages.unshift({
                    id: doc.id,
                    ...doc.data()
                });
            });
            return { success: true, messages };
        } catch (error) {
            console.error('Get chat messages error:', error);
            return { success: false, error: error.message, messages: [] };
        }
    }
}

export default new FirebaseDBService();