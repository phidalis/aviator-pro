// payment-service.js
class PaymentService {
    constructor() {
        // PayHero API Configuration
        this.PAYHERO_API_URL = 'https://payhero.co.ke/api/v1';
        this.API_KEY = 'YOUR_PAYHERO_API_KEY'; // Get from PayHero dashboard
        this.SECRET_KEY = 'YOUR_PAYHERO_SECRET_KEY';
    }

    // Initiate M-Pesa STK Push
    async initiateDeposit(phoneNumber, amount, uid) {
        try {
            // Validate phone number (Kenyan format)
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            if (!this.validatePhoneNumber(formattedPhone)) {
                return { success: false, error: 'Invalid phone number format. Use 2547XXXXXXXX' };
            }

            // Validate amount
            if (amount < 10) {
                return { success: false, error: 'Minimum deposit is KES 10' };
            }

            // Call PayHero API
            const response = await fetch(`${this.PAYHERO_API_URL}/stkpush`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.API_KEY}`
                },
                body: JSON.stringify({
                    phone_number: formattedPhone,
                    amount: amount,
                    reference: `DEP_${uid}_${Date.now()}`,
                    callback_url: 'https://your-domain.com/api/payment-callback',
                    description: 'Aviator Pro Deposit'
                })
            });

            const data = await response.json();
            
            if (data.status === 'success') {
                // Store pending deposit in local database
                await this.storePendingDeposit({
                    uid: uid,
                    amount: amount,
                    phone: formattedPhone,
                    transactionId: data.transaction_id,
                    status: 'pending',
                    createdAt: new Date().toISOString()
                });
                
                return { 
                    success: true, 
                    message: 'Please check your phone for M-Pesa prompt',
                    transactionId: data.transaction_id
                };
            } else {
                return { success: false, error: data.message || 'Payment initiation failed' };
            }
        } catch (error) {
            console.error('Deposit error:', error);
            return { success: false, error: 'Payment service unavailable' };
        }
    }

    // Check transaction status
    async checkTransactionStatus(transactionId) {
        try {
            const response = await fetch(`${this.PAYHERO_API_URL}/transaction/${transactionId}`, {
                headers: {
                    'Authorization': `Bearer ${this.API_KEY}`
                }
            });
            
            const data = await response.json();
            return { success: true, status: data.status, data: data };
        } catch (error) {
            console.error('Check status error:', error);
            return { success: false, error: error.message };
        }
    }

    // Manual withdrawal (you handle manually)
    async requestWithdrawal(phoneNumber, amount, uid) {
        try {
            // Validate phone number
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            if (!this.validatePhoneNumber(formattedPhone)) {
                return { success: false, error: 'Invalid phone number format' };
            }

            // Store withdrawal request
            await this.storeWithdrawalRequest({
                uid: uid,
                amount: amount,
                phone: formattedPhone,
                status: 'pending',
                createdAt: new Date().toISOString()
            });

            // In production, this would trigger an admin notification
            // You would manually process this from admin panel
            
            return { 
                success: true, 
                message: 'Withdrawal request submitted. Our team will process within 24 hours.',
                reference: `WD_${uid}_${Date.now()}`
            };
        } catch (error) {
            console.error('Withdrawal request error:', error);
            return { success: false, error: 'Failed to submit withdrawal request' };
        }
    }

    // Helper: Format phone number to international format
    formatPhoneNumber(phone) {
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.substring(1);
        }
        if (cleaned.startsWith('+')) {
            cleaned = cleaned.substring(1);
        }
        return cleaned;
    }

    // Helper: Validate Kenyan phone number
    validatePhoneNumber(phone) {
        const kenyanRegex = /^254[17]\d{8}$/;
        return kenyanRegex.test(phone);
    }

    // Store pending deposit in Firestore
    async storePendingDeposit(depositData) {
        try {
            const { db, collection, addDoc, serverTimestamp } = await import('./firebase-config.js');
            const depositsRef = collection(db, 'pendingDeposits');
            await addDoc(depositsRef, {
                ...depositData,
                timestamp: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Store pending deposit error:', error);
            return { success: false };
        }
    }

    // Store withdrawal request
    async storeWithdrawalRequest(requestData) {
        try {
            const { db, collection, addDoc, serverTimestamp } = await import('./firebase-config.js');
            const withdrawalsRef = collection(db, 'withdrawalRequests');
            await addDoc(withdrawalsRef, {
                ...requestData,
                timestamp: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Store withdrawal request error:', error);
            return { success: false };
        }
    }

    // Get user withdrawal requests
    async getUserWithdrawalRequests(uid) {
        try {
            const { db, collection, query, where, getDocs, orderBy } = await import('./firebase-config.js');
            const withdrawalsRef = collection(db, 'withdrawalRequests');
            const q = query(
                withdrawalsRef,
                where('uid', '==', uid),
                orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);
            const requests = [];
            querySnapshot.forEach(doc => {
                requests.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, requests };
        } catch (error) {
            console.error('Get withdrawal requests error:', error);
            return { success: false, requests: [] };
        }
    }
}

export default new PaymentService();