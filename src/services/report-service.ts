import { createServiceLogger } from "../utils/logger";
import { RideService } from "./ride-service";
import { WalletService } from "./wallet-service";
import { EmailService } from "./email-service";
import { ProfileService } from "./profile-service";
import { formatCurrency } from "../utils/currency";

const log = createServiceLogger("ReportService");

export class ReportService {
    private rideService = new RideService();
    private walletService = new WalletService();
    private profileService = new ProfileService();

    /**
     * Generate and send an activity report to the user
     */
    async sendActivityReport(userId: string): Promise<{ success: boolean; message: string }> {
        try {
            // 1. Fetch User Profile
            const profile = await this.profileService.getUserProfile(userId);
            if (!profile.email) {
                return { success: false, message: "User has no registered email address." };
            }

            // 2. Fetch Data (with fallback for missing wallets/history)
            const [ridesData, transactionsData] = await Promise.all([
                this.rideService.getCustomerRides(userId, 500, 0).catch(err => {
                    log.warn("Failed to fetch rides for report", { userId, error: err.message });
                    return { rides: [], total: 0 };
                }),
                this.walletService.getTransactions(userId, 500, 0).catch(err => {
                    log.warn("Failed to fetch wallet transactions for report", { userId, error: err.message });
                    return { transactions: [], total: 0 };
                })
            ]);

            // 3. Generate CSV Content
            const csvContent = this.generateCSV(profile.fullName || "User", ridesData.rides, transactionsData.transactions);

            // 4. Send Email with Attachment
            if (!EmailService.isConfigured() && process.env.NODE_ENV !== 'development') {
                log.warn("SMTP is not configured. Cannot send report.", { userId });
                return { success: false, message: "Email service is not configured on this server." };
            }

            const sent = await EmailService.send({
                to: profile.email,
                subject: "Your VeloHub Activity Report",
                html: `
                    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                        <h2 style="color: #2563eb;">VeloHub Activity Report</h2>
                        <p>Hi ${profile.fullName || 'there'},</p>
                        <p>As requested, we have generated your activity report for your recent rides and transactions.</p>
                        <p>Please find the attached CSV file for details.</p>
                        <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
                            - The VeloHub Team
                        </p>
                    </div>
                `,
                attachments: [
                    {
                        filename: `VeloHub_Report_${new Date().toISOString().split('T')[0]}.csv`,
                        content: Buffer.from(csvContent).toString('base64'),
                        contentType: 'text/csv'
                    }
                ]
            });

            if (sent) {
                log.info("Activity report sent", { userId, email: profile.email });
                return { success: true, message: "Report has been sent to your email." };
            } else {
                log.error("Failed to send activity report email", { userId, email: profile.email });
                return { success: false, message: "Failed to send the email. Please check server logs." };
            }

        } catch (error) {
            log.error("Failed to generate activity report", { userId, error: (error as Error).message, stack: (error as Error).stack });
            return { success: false, message: `Error: ${(error as Error).message}` };
        }
    }

    private generateCSV(userName: string, rides: any[], transactions: any[]): string {
        let csv = `VeloHub Activity Report for ${userName}\n`;
        csv += `Generated on: ${new Date().toLocaleString()}\n\n`;

        // Rides Section
        csv += `--- RIDE HISTORY ---\n`;
        csv += `Ride ID,Date,Type,From,To,Fare,Status\n`;
        rides.forEach(r => {
            const date = r.createdAt ? (typeof r.createdAt === 'string' ? r.createdAt : r.createdAt.toISOString()) : 'N/A';
            const pickup = (r.pickupAddress || '').replace(/"/g, '""');
            const dropoff = (r.dropoffAddress || '').replace(/"/g, '""');
            csv += `${r.id},${date},${r.type},"${pickup}","${dropoff}",${r.finalFare},${r.status}\n`;
        });

        csv += `\n\n`;

        // Transactions Section
        csv += `--- WALLET TRANSACTIONS ---\n`;
        csv += `Tx ID,Date,Type,Amount,Description,Balance After\n`;
        transactions.forEach(t => {
            const date = t.createdAt ? (typeof t.createdAt === 'string' ? t.createdAt : t.createdAt.toISOString()) : 'N/A';
            const desc = (t.description || '').replace(/"/g, '""');
            csv += `${t.reference},${date},${t.type},${t.amount},"${desc}",${t.balanceAfter}\n`;
        });

        return csv;
    }
}
