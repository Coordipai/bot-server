import cron from 'node-cron';
import { sendDailyIssueDM } from './commands/issue.js';

export function initScheduler() {
  cron.schedule('* * * * *', async () => {
    console.log('🕘 매일 오전 9시 자동 DM 전송 시작');
    await sendDailyIssueDM();
  });
}
